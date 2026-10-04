import {mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {getDashboard,getMenu} from '../menus.mjs';
import {getDaySchedule,getServingStatus} from '../dining-hours.mjs';

const dataRoot=new URL('../data/',import.meta.url);
const dateRoot=new URL('../data/dates/',import.meta.url);
const detailRoot=new URL('../data/details/',import.meta.url);
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Los_Angeles',
  year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);

async function readJSON(url){
  try{return JSON.parse(await readFile(url,'utf8'));}catch{return null;}
}
function sameMenu(a,b){
  if(!a||!b||a.name!==b.name||a.items.length!==b.items.length)return false;
  return a.items.every((item,index)=>item.name===b.items[index]?.name);
}
function isDetailed(meal){
  return meal?.items?.some(item=>
    item&&item.calories!==undefined&&item.protein!==undefined&&typeof item.source==='string'
  );
}
function shortMeal(meal){
  return {
    name:meal.name,
    items:(meal.items||[]).map(item=>({
      name:item.name,
      section:item.section||'',
      diet:item.diet||'unknown'
    }))
  };
}
function chooseMeal(location,date){
  const meals=location.meals||[];
  if(!meals.length)return {meal:null,mode:'unavailable'};
  const status=getServingStatus(date,location.id,now);
  const byName=name=>meals.find(meal=>meal.name.toLowerCase()===String(name||'').toLowerCase());
  if(status.state==='open'){
    const exact=byName(status.label);
    if(exact)return {meal:exact,mode:'now'};
  }
  if((status.state==='limited'||status.state==='closed')&&status.next?.date===date){
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

const first=await getDashboard(today);
const dates=[...new Set([today,...first.availableDates.filter(date=>date>=today)])].sort();
const generatedDates=new Map();
const generatedDetails=new Map();

for(const date of dates){
  const dashboard=date===today?first:await getDashboard(date);
  const locations=await mapLimit(dashboard.locations,async location=>{
    let enrichedMeals=location.meals||[];
    let detailPath=null;
    let bulk=null;

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

      const choice=chooseMeal({...location,meals:enrichedMeals},date);
      const selected=choice.meal?enrichedMeals.find(meal=>meal.name===choice.meal.name):null;
      if(selected){
        bulk={
          meal:selected.name,
          mode:choice.mode,
          status:isDetailed(selected)?'live':'unavailable',
          items:selected.items
        };
      }

      if(enrichedMeals.some(isDetailed)){
        detailPath=`./data/details/${date}/${location.id}.json`;
        generatedDetails.set(`${date}/${location.id}`,{
          date,
          id:location.id,
          name:location.name,
          source:location.source,
          bulk,
          meals:enrichedMeals
        });
      }
    }

    return {
      id:location.id,
      name:location.name,
      sourceName:location.sourceName,
      status:location.status,
      message:location.message,
      source:location.source,
      schedule:getDaySchedule(date,location.id),
      meals:(location.meals||[]).map(shortMeal),
      detailPath
    };
  },6);

  generatedDates.set(date,{date,fetchedAt:dashboard.fetchedAt,locations});
}

await rm(dateRoot,{recursive:true,force:true});
await rm(detailRoot,{recursive:true,force:true});
await mkdir(dateRoot,{recursive:true});
await mkdir(detailRoot,{recursive:true});

const indexData={
  version:5,
  generatedAt:new Date().toISOString(),
  timezone:'America/Los_Angeles',
  dates
};
await writeFile(new URL('./index.json',dataRoot),JSON.stringify(indexData));

for(const [date,day] of generatedDates){
  await writeFile(new URL(`./${date}.json`,dateRoot),JSON.stringify(day));
}
for(const [key,detail] of generatedDetails){
  const [date,id]=key.split('/');
  const folder=new URL(`./${date}/`,detailRoot);
  await mkdir(folder,{recursive:true});
  await writeFile(new URL(`./${id}.json`,folder),JSON.stringify(detail));
}

console.log(`Built lightweight index for ${dates.length} posted date(s), ${first.locations.length} UCSC locations, and ${generatedDetails.size} lazy nutrition detail file(s).`);
