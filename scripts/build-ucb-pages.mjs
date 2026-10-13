import {getDashboard,getMenu,getAvailableDates} from '../ucb-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucb',
  adapterId:'berkeley-dining',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:2
});
