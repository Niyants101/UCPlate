import {getDashboard,getMenu,getAvailableDates} from '../ucm-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucm',
  adapterId:'ucm-bigzpoon',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:2
});
