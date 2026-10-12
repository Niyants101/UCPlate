import {mkdir,rm,writeFile} from 'node:fs/promises';
import {getDashboard,getMenu,getAvailableDates} from '../ucsf-menus.mjs';

const CAMPUS_ID='ucsf';
const ADAPTER_ID='ucsf-meal-choice-connect';
const dataRoot=new URL('../data/campuses/ucsf/',import.meta.url);
const dateRoot=new URL('../data/campuses/ucsf/dates/',import.meta.url);
const detailRoot=new URL('../data/campuses/ucsf/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const RETAIL_SOURCE='https://campuslifeserviceshome.ucsf.edu/retail/find-us-your-ucsf-location';
const RETAIL=[
  ['ucsf-cafe-bellini','Café Bellini','cafe'],['ucsf-caffe-central-parnassus','Caffé Central at Parnassus','cafe'],['ucsf-carmelinas-taqueria',"Carmelina's Taqueria",'restaurant'],['ucsf-double-shot-express','Double Shot Express','cafe'],['ucsf-jamba','Jamba Juice','cafe'],['ucsf-ladle-leaf','Ladle & Leaf','restaurant'],['ucsf-panda','Panda Express at Parnassus','restaurant'],['ucsf-subway-parnassus','Subway at Parnassus','restaurant'],
  ['ucsf-caffe-central-mission-bay','Caffé Central at Mission Bay','cafe'],['ucsf-double-shot-coffee','Double Shot Coffee','cafe'],['ucsf-noe-cafe','Noe Cafe','cafe'],['ucsf-peasant-pies','Peasant Pies','restaurant'],['ucsf-publico','Publico','restaurant'],['ucsf-subway-mission-bay','Subway at Mission Bay','restaurant'],['ucsf-sf-kebab','SF Kebab','restaurant'],
  ['ucsf-carmelinas-cafe',"Carmelina's Cafe",'cafe'],['ucsf-daily-grind','The Daily Grind at Mount Zion','cafe']
].map(([id,name,kind])=>({id,name,kind,source:RETAIL_SOURCE}));

function shortMeal(meal,source){return {name:meal.name,items:(meal.items||[]).map(item=>({name:item.name,section:item.section||'',category:item.category||'',diet:item.diet||'unknown',allergens:item.allergens||[],glutenFree:Boolean(item.glutenFree),source:item.source||source||null,nutritionSource:item.nutritionSource||null,nutritionStatus:item.nutritionStatus||null}))};}
function isDetailed(meal){return Boolean(meal?.items?.length)&&meal.items.some(item=>Number.isFinite(item?.calories)&&Number.isFinite(item?.protein));}
function chooseCurrentMeal(meals,date){
  if(date!==today||!meals?.length)return null;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(now));
  const patterns=hour<11?[/breakfast|brunch/i]:hour<16?[/lunch|brunch/i]:[/dinner/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}
function sourceOnly(location){return {...location,sourceName:location.name,status:'empty',message:'Official UCSF campus retail dining location. This vendor is outside the UCSF WebMenus nutrition feed, so UCPlate links to the official UCSF retail listing rather than inventing item nutrition.',schedule:null,meals:[],detailPath:null,bulk:null};}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function dashboardWithRetry(date){
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    last=await getDashboard(date);
    const structured=last.locations||[],live=structured.filter(location=>location.status==='live').length,unavailable=structured.filter(location=>location.status==='unavailable').length;
    if(live||!unavailable)return last;
    if(attempt<2)await sleep((attempt+1)*1200);
  }
  return last;
}
async function menuWithRetry(date,locationId,mealName){
  let error;
  for(let attempt=0;attempt<2;attempt++){
    try{return await getMenu(date,locationId,mealName);}catch(caught){error=caught;if(attempt===0)await sleep(700);}
  }
  throw error;
}

const dates=(await getAvailableDates()).filter(date=>date>=today).sort();
if(!dates.length)throw new Error('UCSF Meal Choice Connect did not expose any menu dates.');
const generatedDates=new Map(),generatedDetails=new Map();

for(const date of dates){
  const dashboard=await dashboardWithRetry(date),locations=[];
  for(const location of dashboard.locations){
    let enrichedMeals=location.meals||[],detailPath=null,bulk=null;
    if(date===today&&location.status==='live'&&location.meals?.length){
      enrichedMeals=[];
      for(const rawMeal of location.meals){
        try{const detailed=await menuWithRetry(date,location.id,rawMeal.name);enrichedMeals.push(detailed.items?.length?{...rawMeal,items:detailed.items.map(item=>({...item,source:item.source||location.source}))}:rawMeal);}catch{enrichedMeals.push(rawMeal);}
      }
      const current=chooseCurrentMeal(enrichedMeals,date);
      if(current)bulk={meal:current.name,mode:'now',status:isDetailed(current)?'live':'unavailable',items:current.items};
      if(enrichedMeals.some(meal=>meal.items?.length)){
        detailPath=`./data/campuses/ucsf/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{campusId:CAMPUS_ID,adapter:ADAPTER_ID,date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals});
      }
    }
    locations.push({id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,status:location.status,message:location.message,source:location.source,schedule:location.schedule,meals:(location.meals||[]).map(meal=>shortMeal(meal,location.source)),detailPath,bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null});
  }
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
console.log(`Built UCPlate ${CAMPUS_ID} snapshot for ${dates.length} date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and ${generatedDetails.size} nutrition detail file(s).`);
