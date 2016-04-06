import Search from '../components/search';
import { useDeps, composeWithTracker, composeAll } from 'mantra-core';

export const composer = ({ context, searchId }, onData) => {
  const { Meteor, Collections: { Searchs } } = context();

  Meteor.subscribe('searchs.single', searchId);

  const search = Searchs.findOne(searchId);

  if (search) {
    onData(null, { search });
  } else {
    onData();
  }
};

export default composeAll(
  composeWithTracker(composer),
  useDeps()
)(Search);