import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {UC_CAMPUSES} from '../campuses.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const pct=(n,d)=>d?`${Math.round(n*100/d)}%`:'n/a';
const isUrl=value=>typeof value==='string'&&/^https:\/\//i.test(value);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

let hasStructuralFailure=false;
for(const campus of UC_CAMPUSES){
  if(campus.menuStatus!=='live')continue;
  const dataRoot=campus.dataRoot.replace(/^\.\//,'');
  let index;
  try{index=await readJson(`${dataRoot}/index.json`);}catch(error){
    console.log(`AUDIT ${campus.id} ERROR missing index: ${error.message}`);hasStructuralFailure=true;continue;
  }
  const dates=[...(index.dates||[])].sort();
  const date=dates.includes(today)?today:dates.at(-1);
  if(!date){console.log(`AUDIT ${campus.id} ERROR no dates`);hasStructuralFailure=true;continue;}
  let day;
  try{day=await readJson(`${dataRoot}/dates/${date}.json`);}catch(error){
    console.log(`AUDIT ${campus.id} ERROR missing ${date}: ${error.message}`);hasStructuralFailure=true;continue;
  }
  let totalMeals=0,totalItems=0,dietKnown=0,nutritionKnown=0,itemExactLinks=0,officialLocationLinks=0,detailLocations=0,emptyLive=0;
  const locationSummaries=[];
  for(const location of day.locations||[]){
    if(isUrl(location.source))officialLocationLinks++;
    let meals=location.meals||[];
    if(location.detailPath){
      try{
        const detailPath=location.detailPath.replace(/^\.\//,'');
        const detail=await readJson(detailPath);
        if(Array.isArray(detail.meals)&&detail.meals.length){meals=detail.meals;detailLocations++;}
      }catch(error){locationSummaries.push(`${location.name}: broken detail (${error.message})`);}
    }
    if(location.status==='live'&&!meals.length)emptyLive++;
    let locItems=0,locNutrition=0,locDiet=0,locLinks=0;
    for(const meal of meals){
      totalMeals++;
      for(const item of meal.items||[]){
        totalItems++;locItems++;
        if(item.diet==='vegan'||item.diet==='vegetarian'){dietKnown++;locDiet++;}
        if(Number.isFinite(item.calories)&&Number.isFinite(item.protein)){nutritionKnown++;locNutrition++;}
        if(isUrl(item.nutritionSource)||isUrl(item.source)){itemExactLinks++;locLinks++;}
      }
    }
    const message=location.status==='unavailable'&&location.message?` | ${location.message}`:'';
    locationSummaries.push(`${location.name}: ${location.status}, ${meals.length} meals, ${locItems} items, nutrition ${pct(locNutrition,locItems)}, veg tags ${pct(locDiet,locItems)}, item links ${pct(locLinks,locItems)}${message}`);
  }
  const liveCount=(day.locations||[]).filter(x=>x.status==='live').length;
  const unavailableCount=(day.locations||[]).filter(x=>x.status==='unavailable').length;
  console.log(`\nAUDIT ${campus.id} ${campus.name} ${date}`);
  console.log(`locations ${(day.locations||[]).length}, live ${liveCount}, detail locations ${detailLocations}, meals ${totalMeals}, items ${totalItems}`);
  console.log(`nutrition ${nutritionKnown}/${totalItems} ${pct(nutritionKnown,totalItems)}, veg tags ${dietKnown}/${totalItems} ${pct(dietKnown,totalItems)}, item links ${itemExactLinks}/${totalItems} ${pct(itemExactLinks,totalItems)}, location links ${officialLocationLinks}/${(day.locations||[]).length}`);
  for(const summary of locationSummaries)console.log(`  ${summary}`);
  if(emptyLive){console.log(`  ERROR ${emptyLive} live location(s) had no meals`);hasStructuralFailure=true;}
  if(date===today&&liveCount===0&&unavailableCount>0){console.log('  ERROR current campus snapshot has no live menus because its upstream source is unavailable');hasStructuralFailure=true;}
}

if(hasStructuralFailure)process.exitCode=1;
