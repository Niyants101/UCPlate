import {mkdir,rm,copyFile,writeFile,readFile} from 'node:fs/promises';
import {getDashboard,getMenu} from '../menus.mjs';
import {getDaySchedule,getServingStatus} from '../dining-hours.mjs';

const out=new URL('../dist/',import.meta.url);
const pages=new URL('../pages/',import.meta.url);
const dataFile=new URL('../data/menus.json',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Los_Angeles',
  year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);

async function readPrevious(){
  try{return JSON.parse(await readFile(dataFile,'utf8'));}catch{return null;}
}
function sameMenu(a,b){
  if(!a||!b||a.name!==b.name||a.items.length!==b.items.length)return false;
  return a.items.every((item,index)=>item.name===b.items[index]?.name);
}
function isDetailed(meal){
  return meal?.items?.some(item=>
    item&&Object.prototype.hasOwnProperty.call(item,'calories')&&
    Object.prototype.hasOwnProperty.call(item,'protein')&&
    typeof item.source==='string'
  );
}
function chooseBulkMeal(location,date){
  const meals=location.meals||[];
  if(!meals.length)return {meal:null,mode:'unavailable'};
  const status=getServingStatus(date,location.id,now);
  const byName=name=>meals.find(meal=>meal.name.toLowerCase()===String(name||'').toLowerCase());
  if(status.state==='open'){
    const exact=byName(status.label);
    if(exact)return {meal:exact,mode:'now'};
  }
  if(status.state==='limited'&&status.next?.date===date){
    const next=byName(status.next.name);
    if(next)return {meal:next,mode:'next'};
  }
  if(status.state==='closed'&&status.next?.date===date){
    const next=byName(status.next.name);
    if(next)return {meal:next,mode:'next'};
  }
  return {meal:meals.find(meal=>/all day/i.test(meal.name))||meals[0],mode:status.state==='unknown'?'menu':'next'};
}
async function mapLimit(items,fn,limit=2){
  let index=0;
  const result=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(index<items.length){
      const i=index++;
      result[i]=await fn(items[i],i);
    }
  }));
  return result;
}

await rm(out,{recursive:true,force:true});
await mkdir(new URL('./data/',out),{recursive:true});
await mkdir(new URL('../data/',import.meta.url),{recursive:true});

const previous=await readPrevious();
const first=await getDashboard(today);
const dates=[...new Set([today,...first.availableDates.filter(date=>date>=today)])].sort();
const data={
  version:4,
  generatedAt:new Date().toISOString(),
  timezone:'America/Los_Angeles',
  bulkDefaults:{calories:850,protein:45},
  dates:{}
};

for(const date of dates){
  const dashboard=date===today?first:await getDashboard(date);
  let locations=dashboard.locations.map(location=>({
    id:location.id,
    name:location.name,
    sourceName:location.sourceName,
    status:location.status,
    message:location.message,
    source:location.source,
    meals:location.meals,
    schedule:getDaySchedule(date,location.id),
    bulk:null
  }));

  if(date===today){
    locations=await mapLimit(locations,async location=>{
      if(location.status!=='live'||!location.meals?.length)return location;
      const oldLocation=previous?.dates?.[date]?.locations?.find(item=>item.id===location.id);
      const enriched=[];
      for(const rawMeal of location.meals){
        const oldMeal=oldLocation?.meals?.find(meal=>meal.name===rawMeal.name);
        if(sameMenu(oldMeal,rawMeal)&&isDetailed(oldMeal)){
          enriched.push({...rawMeal,items:oldMeal.items});
          continue;
        }
        try{
          const detailed=await getMenu(date,location.id,rawMeal.name);
          enriched.push(detailed.items?.length?{...rawMeal,items:detailed.items}:rawMeal);
        }catch{
          enriched.push(rawMeal);
        }
      }
      location.meals=enriched;
      const choice=chooseBulkMeal(location,date);
      const selected=choice.meal?location.meals.find(meal=>meal.name===choice.meal.name):null;
      location.bulk=selected?{
        meal:selected.name,
        mode:choice.mode,
        status:isDetailed(selected)?'live':'unavailable',
        message:isDetailed(selected)?'Exact UCSC nutrition labels are indexed for this meal.':'Nutrition labels could not be indexed for this meal.',
        items:selected.items
      }:null;
      return location;
    });
  }

  data.dates[date]={fetchedAt:dashboard.fetchedAt,locations};
}

const json=JSON.stringify(data);
await writeFile(new URL('./data/menus.json',out),json);
await writeFile(dataFile,json);
await copyFile(new URL('index.html',pages),new URL('index.html',out));
await copyFile(new URL('app.js',pages),new URL('app.js',out));
await copyFile(new URL('style.css',pages),new URL('style.css',out));
await copyFile(new URL('../dining-hours.mjs',pages),new URL('dining-hours.mjs',out));
await writeFile(new URL('.nojekyll',out),'');
console.log(`Built GitHub Pages snapshot for ${dates.length} posted date(s), ${first.locations.length} UCSC menu location(s), exact nutrition links for today's published meals, and automatic bulk plans.`);
