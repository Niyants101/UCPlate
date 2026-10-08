import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getAvailableDates} from '../ucd-menus.mjs';

const CAMPUS_ID='ucd';
const ADAPTER_ID='ucd-residential-dining';
const dataRoot=new URL('../data/campuses/ucd/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucd/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucd/details/',import.meta.url);
const now=new Date();
const pacificParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
const today=`${pacificParts.year}-${pacificParts.month}-${pacificParts.day}`;
const currentMinutes=Number(pacificParts.hour)*60+Number(pacificParts.minute);

function minutes(value){const [hour,minute]=String(value).split(':').map(Number);return hour*60+minute;}
function isDetailed(meal){return Boolean(meal?.items?.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein)&&item?.nutritionStatus==='available'));}
function shortMeal(meal){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown'}))};}
function chooseCurrentMeal(location,date){
  if(date!==today||!location?.meals?.length)return null;
  const period=(location.schedule||[]).find(window=>currentMinutes>=minutes(window.start)&&currentMinutes<minutes(window.end));
  if(period){
    const direct=location.meals.find(meal=>meal.name.toLowerCase()===period.name.toLowerCase());
    if(direct)return direct;
  }
  return null;
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UC Davis Dining did not publish any current or future menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await getDashboard(date);
  const locations=dashboard.locations.map(location=>{
    let detailPath=null,bulk=null;
    if(location.status==='live'&&location.meals?.length){
      const current=chooseCurrentMeal(location,date);
      if(current)bulk={meal:current.name,mode:'now',status:isDetailed(current)?'live':'unavailable',items:current.items};
      if(location.meals.some(meal=>meal.items?.length)){
        detailPath=`./data/campuses/ucd/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:location.meals});
      }
    }
    return {id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(shortMeal),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null};
  });
  generatedDates.set(date,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,fetchedAt:dashboard.fetchedAt,locations});
}

await rm(dateRoot,{recursive:true,force:true});
await rm(detailRoot,{recursive:true,force:true});
await mkdir(dateRoot,{recursive:true});
await mkdir(detailRoot,{recursive:true});
await writeFile(new URL('./index.json',dataRoot),JSON.stringify({version:1,campusId:CAMPUS_ID,adapter:ADAPTER_ID,generatedAt:new Date().toISOString(),timezone:'America/Los_Angeles',dates}));
for(const [date,day] of generatedDates)await writeFile(new URL(`./${date}.json`,dateRoot),JSON.stringify(day));
for(const [key,detail] of generatedDetails){const [date,id]=key.split('/');const folder=new URL(`./${date}/`,detailRoot);await mkdir(folder,{recursive:true});await writeFile(new URL(`./${id}.json`,folder),JSON.stringify(detail));}
console.log(`Built UCPlate ${CAMPUS_ID} snapshot for ${dates.length} posted date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and ${generatedDetails.size} nutrition detail file(s).`);
