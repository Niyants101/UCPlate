import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getAvailableDates} from '../ucsf-menus.mjs';

const CAMPUS_ID='ucsf';
const ADAPTER_ID='ucsf-meal-choice-connect';
const dataRoot=new URL('../data/campuses/ucsf/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucsf/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucsf/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

function shortMeal(meal){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown',allergens:item.allergens||[],glutenFree:Boolean(item.glutenFree)}))};}
function chooseCurrentMeal(meals,date){
  if(date!==today||!meals?.length)return null;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(now));
  const patterns=hour<11?[/breakfast|brunch/i]:hour<16?[/lunch|brunch/i]:[/dinner/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UCSF Meal Choice Connect did not expose any menu dates.');
const generatedDates=new Map();

for(const date of dates){
  const dashboard=await getDashboard(date);
  const unavailable=dashboard.locations.filter(location=>location.status==='unavailable');
  if(unavailable.length)throw new Error(`UCSF snapshot aborted because ${unavailable.map(location=>`${location.name}: ${location.message}`).join('; ')}`);
  const locations=dashboard.locations.map(location=>{
    const current=chooseCurrentMeal(location.meals,date);
    const bulk=current?{meal:current.name,mode:'now',status:'unavailable'}:null;
    return {id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(shortMeal),detailPath:null,bulk};
  });
  generatedDates.set(date,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,fetchedAt:dashboard.fetchedAt,locations});
}

await rm(dateRoot,{recursive:true,force:true});
await rm(detailRoot,{recursive:true,force:true});
await mkdir(dateRoot,{recursive:true});
await mkdir(detailRoot,{recursive:true});
await writeFile(new URL('./index.json',dataRoot),JSON.stringify({version:1,campusId:CAMPUS_ID,adapter:ADAPTER_ID,generatedAt:new Date().toISOString(),timezone:'America/Los_Angeles',dates}));
for(const [date,day] of generatedDates)await writeFile(new URL(`./${date}.json`,dateRoot),JSON.stringify(day));
console.log(`Built UCPlate ${CAMPUS_ID} snapshot for ${dates.length} date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and 0 nutrition detail files.`);
