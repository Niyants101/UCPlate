import {getDashboard,getMenu,getAvailableDates} from '../ucr-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucr',
  adapterId:'ucr-foodpro',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:3
});
