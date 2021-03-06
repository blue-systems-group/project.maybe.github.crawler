/* eslint-disable no-console */
import fs from 'fs';
import { join } from 'path';

const getDirSize = path => new Promise((resolve, reject) => {
  let totalSize = 0;
  let dirs = [path];
  try {
    while (dirs.length > 0) {
      const tmpDirs = [];
      for (const dir of dirs) {
        const stats = fs.lstatSync(dir);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(dir);
          files.map(file => tmpDirs.push(join(dir, file)));
        } else {
          totalSize += Math.max(stats.blksize, stats.size);
        }
      }
      dirs = tmpDirs;
    }
    resolve(totalSize);
  } catch (e) {
    console.error('error in getDirSize:', e);
    reject(e);
  }
});

export { getDirSize };
