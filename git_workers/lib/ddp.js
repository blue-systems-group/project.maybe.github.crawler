import DDP from 'ddp';
import Job from 'meteor-job';

import { clone } from './clone';
import { isSmallRepo, cleanRepo } from './clean';

import { join } from 'path';

const getPath = (basePath, repoPath) => join(basePath, repoPath);

/* eslint-disable no-console */
const handleSocket = (ddp, q, obs) => {
  const shutdown = (level = 'soft') => {
    console.log('Attempting to shutdown', level);
    q.shutdown(
      { level },
      () => {
        console.log('Shutdown!');
        ddp.close();
      }
    );
  };

  const onError = (err) => {
    console.error('Socket error!', err);
    shutdown('hard');
  };

  const onClose = (code, message) => {
    console.warn('Socket closed!', code, message);
    obs.stop();
    ddp.removeListener('socket-close', onClose);
    ddp.removeListener('socket-error', onError);
    process.exit();
  };

  ddp.on('socket-error', onError);
  ddp.on('socket-close', onClose);

  process.on('SIGQUIT', () => shutdown('normal'));
  process.on('SIGTERM', () => shutdown('hard'));
};

const getQueue = (collectionName = 'repos', jobType = 'clone', basePath) => {
  const queue = Job.processJobs(
    collectionName,
    jobType,
    {
      pollInterval: false,
      workTimeout: 10 * 60 * 1000,
      concurrency: 1,
      payload: 1,
    },
    (job, callback) => {
      console.log(`\nStarting job: ${job.doc.data.name} ${job.doc.runId}`);
      const repo = job.doc.data;

      const cloneRepository = clone(repo, basePath);

      cloneRepository.then((repository) => {
        const repoPath = getPath(basePath, repo.name);
        isSmallRepo(repoPath).then(count => {
          console.log('DONE:', repo.name, repository, `${count / 1024}KB`);
          job.done();
          callback();
        }).catch(error => {
          console.log(error);
          console.log('DONE, too large:', repo.name, repository, error);
          cleanRepo(repoPath);
          job.fail(
            { reason: 'size limit' },
            { fatal: true },
            () => {}
            // (err, res) => {
            //   console.log(err);
            //   console.log(res);
            // }
          );
          callback();
        });
      })
      .catch(reason => {
        console.log('SKIP:', repo.name, reason);
        job.fail(
          { reason: 'exist' },
          { fatal: false },
          () => {}
          // (err, res) => {
          //   console.log(err);
          //   console.log(res);
          // }
        );
        callback();
      });
    }
  );
  return queue;
};

const getObsrvable = (ddp, q, collectionName = 'repos.jobs') => {
  const obs = ddp.observe(collectionName);

  obs.added = (id) => {
    if (ddp.collections[collectionName][id].status === 'ready') {
      // console.log('Triggering queue, added');
      q.trigger();
    }
  };

  obs.changed = (id, oldFields, clearedFields, newFields) => {
    if (newFields.status === 'ready') {
      // console.log('Triggering queue, changed');
      q.trigger();
    }
  };
};

const proceed = (ddp, userId = null, basePath) => {
  ddp.subscribe('allJobs', [userId], () => {
    console.log('allJobs Ready!');
  });

  const q = getQueue('repos', 'clone', basePath);
  const obs = getObsrvable(ddp, q, 'repos.jobs');

  handleSocket(ddp, q, obs);
};

const getDDP = (host, port) => new DDP({
  host,
  port,
  use_ejson: true,
  use_ssl: false,
  autoReconnect: true,
  autoReconnectTimer: 30000,
});

const bindDDP = (job, ddp) => job.setDDP(ddp);

const initDDP = (host = 'localhost', port = 3000, basePath = __dirname) => {
  const ddp = getDDP(host, port);

  bindDDP(Job, ddp);

  ddp.connect((err) => {
    if (err) {
      return console.log(err);
    }
    console.log('Connected!');
    // null for userId
    return proceed(ddp, null, basePath);
  });
};

export { initDDP };
