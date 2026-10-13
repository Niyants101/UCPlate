import {getDashboard,getMenu,getAvailableDates} from '../ucsb-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucsb',
  adapterId:'ucsb-netnutrition',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:3
});
