import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getMenu,getAvailableDates} from '../ucsb-menus.mjs';

const CAMPUS_ID='ucsb';
const ADAPTER_ID='ucsb-netnutrition';
const dataRoot=new URL('../data/campuses/ucsb/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucsb/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucsb/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const RETAIL_SOURCE='https://dining.ucsb.edu/markets-eateries';
const RETAIL=[
  ['ucsb-arbor','The Arbor','market'],
  ['ucsb-coral-tree','Coral Tree Cafe','cafe'],
  ['ucsb-corner-store','The Corner Store','market'],
  ['ucsb-courtyard-cafe','Courtyard Cafe','cafe'],
  ['ucsb-root-burger','Root Burger','restaurant'],
  ['ucsb-starbucks-ucen','Starbucks at the University Center','cafe'],
  ['ucsb-store-buchanan','The Store at Buchanan','market'],
  ['ucsb-summit-cafe','Summit Cafe','cafe'],
  ['ucsb-tenaya','Tenaya Market & Eatery','market']
].map(([id,name,kind])=>({id,name,kind,source:RETAIL_SOURCE}));

function shortMeal(meal,locationSource){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown',allergens:item.allergens||[],source:item.source||locationSource||null,nutritionSource:item.nutritionSource||null,nutritionStatus:item.nutritionStatus||null}))};}
function isDetailed(meal){return Boolean(meal?.items?.length)&&meal.items.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein));}
function chooseCurrentMeal(meals,date){
  if(date!==today||!meals?.length)return null;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(now));
  const patterns=hour<10?[/breakfast|brunch/i]:hour<16?[/lunch|brunch/i]:[/dinner/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}
function sourceOnly(location){return {...location,sourceName:location.name,status:'empty',message:'Official UCSB Campus Dining retail location. UCSB does not publish this location through the dining commons NetNutrition feed used for item-level nutrition.',schedule:null,meals:[],detailPath:null,bulk:null};}
async function mapLimit(items,fn,limit=3){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function dashboardWithRetry(date){
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    last=await getDashboard(date);
    const structured=last.locations||[],live=structured.filter(location=>location.status==='live').length,unavailable=structured.filter(location=>location.status==='unavailable').length;
    if(live||!unavailable)return last;
    if(attempt<2)await sleep((attempt+1)*1500);
  }
  return last;
}
async function menuWithRetry(date,locationId,mealName){
  let error;
  for(let attempt=0;attempt<2;attempt++){
    try{return await getMenu(date,locationId,mealName);}catch(caught){error=caught;if(attempt===0)await sleep(800);}
  }
  throw error;
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort().slice(0,8);
if(!dates.length)throw new Error('UC Santa Barbara Dining did not publish any current or future menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await dashboardWithRetry(date);
  const locations=await mapLimit(dashboard.locations,async location=>{
    let enrichedMeals=location.meals||[],detailPath=null,bulk=null;
    if(date===today&&location.status==='live'&&location.meals?.length){
      enrichedMeals=[];
      for(const rawMeal of location.meals){
        try{const detailed=await menuWithRetry(date,location.id,rawMeal.name);enrichedMeals.push(detailed.items?.length?{...rawMeal,items:detailed.items}:rawMeal);}catch{enrichedMeals.push(rawMeal);}
      }
      const current=chooseCurrentMeal(enrichedMeals,date);
      if(current)bulk={meal:current.name,mode:'now',status:isDetailed(current)?'live':'unavailable',items:current.items};
      if(enrichedMeals.some(isDetailed)){
        detailPath=`./data/campuses/ucsb/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals});
      }
    }
    return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(meal=>shortMeal(meal,location.source)),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null};
  },3);
  locations.push(...RETAIL.map(sourceOnly));
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
