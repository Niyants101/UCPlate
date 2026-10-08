import {mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {getDashboard,getMenu,getAvailableDates} from '../ucla-menus.mjs';

const CAMPUS_ID='ucla';
const ADAPTER_ID='ucla-dining';
const dataRoot=new URL('../data/campuses/ucla/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucla/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucla/details/',import.meta.url);
const now=new Date();
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
const today=`${parts.year}-${parts.month}-${parts.day}`;
const currentMinutes=Number(parts.hour)*60+Number(parts.minute);

async function readJSON(url){try{return JSON.parse(await readFile(url,'utf8'));}catch{return null;}}
function sameMenu(a,b){
  if(!a||!b||a.name!==b.name||a.items?.length!==b.items?.length)return false;
  return (a.items||[]).every((item,index)=>item.name===b.items[index]?.name&&item.section===b.items[index]?.section);
}
function isDetailed(meal){
  return Boolean(meal?.items?.length)&&meal.items.every(item=>item?.nutritionStatus==='available'||item?.nutritionStatus==='unavailable')&&meal.items.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein));
}
function shortMeal(meal){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown'}))};}
function minute(value){const [hour,minute]=String(value).split(':').map(Number);return hour*60+minute;}
function chooseCurrentMeal(location,date,meals){
  if(date!==today||!meals?.length)return null;
  const active=(location.schedule||[]).find(period=>currentMinutes>=minute(period.start)&&currentMinutes<minute(period.end));
  if(active){
    const exact=meals.find(meal=>meal.name.toLowerCase()===active.name.toLowerCase());if(exact)return exact;
    if(active.name==='Extended Dinner'){const dinner=meals.find(meal=>/dinner|late|all day/i.test(meal.name));if(dinner)return dinner;}
  }
  const patterns=currentMinutes<11?[/breakfast|brunch|all day/i]:currentMinutes<16?[/lunch|brunch|all day/i]:[/dinner|extended|late|all day/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}
async function mapLimit(items,fn,limit=2){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UCLA Dining did not publish any current or future menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await getDashboard(date);
  const locations=await mapLimit(dashboard.locations,async location=>{
    let enrichedMeals=location.meals||[],detailPath=null,bulk=null;
    if(date===today&&location.status==='live'&&location.meals?.length){
      const previous=await readJSON(new URL(`./details/${date}/${location.id}.json`,dataRoot));
      enrichedMeals=[];
      for(const rawMeal of location.meals){
        const oldMeal=previous?.meals?.find(meal=>meal.name===rawMeal.name);
        if(sameMenu(oldMeal,rawMeal)&&isDetailed(oldMeal)){
          enrichedMeals.push({...rawMeal,items:oldMeal.items});
          continue;
        }
        try{
          const detailed=await getMenu(date,location.id,rawMeal.name);
          enrichedMeals.push(detailed.items?.length?{...rawMeal,items:detailed.items}:rawMeal);
        }catch{
          enrichedMeals.push(rawMeal);
        }
      }
      const current=chooseCurrentMeal(location,date,enrichedMeals);
      if(current)bulk={meal:current.name,mode:'now',status:isDetailed(current)?'live':'unavailable',items:current.items};
      if(enrichedMeals.some(isDetailed)){
        detailPath=`./data/campuses/ucla/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals});
      }
    }
    return {id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(shortMeal),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null};
  },2);
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
