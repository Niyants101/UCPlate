import {readFile,access} from 'node:fs/promises';

const CAMPUS_ROOTS=['ucb','ucd','uci','ucla','ucm','ucr','ucsb','ucsd','ucsf'];
const allowedDiet=new Set(['unknown','vegetarian','vegan']);
const validUrl=value=>typeof value==='string'&&/^https?:\/\//i.test(value);
const finiteOrNull=value=>value===null||value===undefined||(Number.isFinite(Number(value))&&Number(value)>=0);
const publishedNumber=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));

async function json(path){return JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));}
async function exists(path){try{await access(new URL(`../${path}`,import.meta.url));return true;}catch{return false;}}

let failures=0;
const summaries=[];
function fail(campus,message){failures++;console.error(`[${campus}] ${message}`);}

for(const campus of CAMPUS_ROOTS){
  const index=await json(`data/campuses/${campus}/index.json`);
  if(!Array.isArray(index.dates)||!index.dates.length){fail(campus,'index has no menu dates');continue;}
  const current=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=index.dates.includes(current)?current:index.dates[0];
  const day=await json(`data/campuses/${campus}/dates/${date}.json`);
  const live=(day.locations||[]).filter(location=>location.status==='live');
  if(!live.length)fail(campus,`no live locations on audited date ${date}`);

  let foods=0,sourceCovered=0,exactSources=0,nutritionPairs=0,dietTagged=0,detailLocations=0;
  for(const location of live){
    if(!validUrl(location.source))fail(campus,`${location.name} is missing an official location source URL`);
    if(!Array.isArray(location.meals)||!location.meals.length)fail(campus,`${location.name} is live but has no meals`);

    let meals=location.meals||[];
    if(location.detailPath){
      const localPath=String(location.detailPath).replace(/^\.\//,'');
      if(await exists(localPath)){
        const detail=await json(localPath);meals=detail.meals||meals;detailLocations++;
      }else fail(campus,`${location.name} points to missing detail file ${localPath}`);
    }

    for(const meal of meals){
      if(!meal.name)fail(campus,`${location.name} has an unnamed meal`);
      for(const item of meal.items||[]){
        foods++;
        if(!item.name)fail(campus,`${location.name}/${meal.name} has an unnamed food`);
        if(!allowedDiet.has(item.diet||'unknown'))fail(campus,`${item.name} has unsupported diet tag ${item.diet}`);
        if(item.diet==='vegan'||item.diet==='vegetarian')dietTagged++;
        if(!finiteOrNull(item.calories)||!finiteOrNull(item.protein))fail(campus,`${item.name} has invalid nutrition numbers`);
        if(publishedNumber(item.calories)&&publishedNumber(item.protein))nutritionPairs++;
        const exact=validUrl(item.nutritionSource)||validUrl(item.source);
        const fallback=validUrl(location.source);
        if(exact)exactSources++;
        if(exact||fallback)sourceCovered++;else fail(campus,`${item.name} has no official source path`);
      }
    }
  }
  if(foods&&sourceCovered!==foods)fail(campus,`official source coverage is ${sourceCovered}/${foods}`);
  summaries.push({campus,date,liveLocations:live.length,detailLocations,foods,sourceCoverage:`${sourceCovered}/${foods}`,exactItemSources:`${exactSources}/${foods}`,nutritionPairs:`${nutritionPairs}/${foods}`,dietTagged});
}

console.table(summaries);
if(failures)throw new Error(`Campus snapshot audit failed with ${failures} issue(s).`);
console.log('All campus snapshots passed structural menu, diet, nutrition-number, and official-source checks.');
