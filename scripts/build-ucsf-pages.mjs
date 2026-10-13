import {getDashboard,getMenu,getAvailableDates} from '../ucsf-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

await buildCampusSnapshot({
  campusId:'ucsf',
  adapterId:'ucsf-meal-choice-connect',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:7,
  locationConcurrency:3
});
