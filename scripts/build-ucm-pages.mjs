import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getMenu,getAvailableDates} from '../ucm-menus.mjs';

const CAMPUS_ID='ucm';
const ADAPTER_ID='ucm-bigzpoon';
const dataRoot=new URL('../data/campuses/ucm/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucm/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucm/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

function explicitDiet(item){
  if(item?.diet==='vegan'||item?.diet==='vegetarian')return item.diet;
  const source=`${item?.name||''} ${item?.description||''}`;
  if(/\bvegan\b/i.test(source))return 'vegan';
  if(/\bvegetarian\b/i.test(source))return 'vegetarian';
  return 'unknown';
}
function publicItem(item,source){return {...item,diet:explicitDiet(item),source:item.source||source||null};}
function shortMeal(meal,source){return {name:meal.name,items:(meal.items||[]).map(item=>{const clean=publicItem(item,source);return {name:clean.name,description:clean.description||'',serving:clean.serving||'',calories:Number.isFinite(clean.calories)?clean.calories:null,protein:Number.isFinite(clean.protein)?clean.protein:null,section:clean.section||'',category:clean.category||'',diet:clean.diet,allergens:clean.allergens||[],source:clean.source};})};}
function hasPublishedDetails(meal){return Boolean(meal?.items?.length)&&meal.items.some(item=>Number.isFinite(item?.calories)||Number.isFinite(item?.protein)||item?.description||item?.diet==='vegan'||item?.diet==='vegetarian');}
function hasMacros(meal){return Boolean(meal?.items?.length)&&meal.items.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein));}
function chooseCurrentMeal(meals,date){
  if(date!==today||!meals?.length)return null;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(now));
  const patterns=hour<11?[/breakfast|brunch/i]:hour<15?[/lunch|brunch/i]:hour<21?[/dinner/i]:[/late\s*night/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UC Merced Dining did not expose any current-week menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await getDashboard(date);
  const locations=[];
  for(const location of dashboard.locations){
    let enrichedMeals=(location.meals||[]).map(meal=>({...meal,items:(meal.items||[]).map(item=>publicItem(item,location.source))})),detailPath=null,bulk=null;
    if(location.status==='live'&&location.meals?.length){
      const fetched=[];
      for(const rawMeal of location.meals){
        try{
          const detailed=await getMenu(date,location.id,rawMeal.name);
          fetched.push(detailed.items?.length?{...rawMeal,items:detailed.items.map(item=>publicItem(item,location.source))}:{...rawMeal,items:(rawMeal.items||[]).map(item=>publicItem(item,location.source))});
        }catch{fetched.push({...rawMeal,items:(rawMeal.items||[]).map(item=>publicItem(item,location.source))});}
      }
      enrichedMeals=fetched;
      const current=chooseCurrentMeal(enrichedMeals,date);
      if(current)bulk={meal:current.name,mode:'now',status:hasMacros(current)?'live':'unavailable',items:current.items};
      if(enrichedMeals.some(hasPublishedDetails)){
        detailPath=`./data/campuses/ucm/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals});
      }
    }
    locations.push({id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(meal=>shortMeal(meal,location.source)),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null});
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
console.log(`Built UCPlate ${CAMPUS_ID} snapshot for ${dates.length} current-week date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and ${generatedDetails.size} nutrition detail file(s).`);
