import {getDashboard,getMenu,getAvailableDates} from '../ucla-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucla',
  adapterId:'ucla-dining',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:2
});
