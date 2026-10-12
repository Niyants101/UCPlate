import {getDashboard,getAvailableDates} from '../ucsf-menus.mjs';

const dates=await getAvailableDates();
const date=dates[0];
const dashboard=await getDashboard(date);
console.log(`UCSF live probe ${date}`);
for(const location of dashboard.locations){
  console.log(`${location.name}: ${location.status} | ${location.message||''} | meals ${(location.meals||[]).map(meal=>`${meal.name}:${meal.items?.length||0}`).join(', ')}`);
}
