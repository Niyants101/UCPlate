import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getMenu,getAvailableDates} from '../ucsf-menus.mjs';

const CAMPUS_ID='ucsf';
const ADAPTER_ID='ucsf-meal-choice-connect';
const dataRoot=new URL('../data/campuses/ucsf/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucsf/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucsf/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

function shortMeal(meal){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown',allergens:item.allergens||[],glutenFree:Boolean(item.glutenFree)}))};}
function isDetailed(meal){return Boolean(meal?.items?.length)&&meal.items.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein));}
function chooseCurrentMeal(meals,date){
  if(date!==today||!meals?.length)return null;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(now));
  const patterns=hour<11?[/breakfast|brunch/i]:hour<16?[/lunch|brunch/i]:[/dinner/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UCSF Meal Choice Connect did not expose any menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await getDashboard(date),locations=[];
  for(const location of dashboard.locations){
    let enrichedMeals=location.meals||[],detailPath=null,bulk=null;
    if(date===today&&location.status==='live'&&location.meals?.length){
      const current=chooseCurrentMeal(location.meals,date);
      if(current){
        try{
          const detailed=await getMenu(date,location.id,current.name);
          enrichedMeals=location.meals.map(meal=>meal.name===current.name?{...meal,items:detailed.items}:meal);
          const enrichedCurrent=enrichedMeals.find(meal=>meal.name===current.name);
          bulk={meal:current.name,mode:'now',status:isDetailed(enrichedCurrent)?'live':'unavailable',items:enrichedCurrent?.items||[]};
        }catch{bulk={meal:current.name,mode:'now',status:'unavailable',items:current.items};}
      }
      if(enrichedMeals.some(isDetailed)){
        detailPath=`./data/campuses/ucsf/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals});
      }
    }
    locations.push({id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(shortMeal),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null});
  }
  generatedDates.set(date,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,fetchedAt:dashboard.fetchedAt,locations});
}

await rm(dateRoot,{recursive:true,force:true});
await rm(detailRoot,{recursive:true,force:true});
await mkdir(dateRoot,{recursive:true});
await mkdir(detailRoot,{recursive:true});
await writeFile(new URL('./index.json',dataRoot),JSON.stringify({version:1,campusId:CAMPUS_ID,adapter:ADAPTER_ID,generatedAt:new Date().toISOString(),timezone:'America/Los_Angeles',dates}));
for(const [date,day] of generatedDates)await writeFile(new URL(`./${date}.json`,dateRoot),JSON.stringify(day));
for(const [key,detail] of generatedDetails){const [date,id]=key.split('/');const folder=new URL(`./${date}/`,detailRoot);await mkdir(folder,{recursive:true});await writeFile(new URL(`./${id}.json`,folder),JSON.stringify(detail));}
console.log(`Built UCPlate ${CAMPUS_ID} snapshot for ${dates.length} date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and ${generatedDetails.size} nutrition detail file(s).`);
