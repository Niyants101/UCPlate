import {mkdir,rm,writeFile} from 'node:fs/promises';

const TZ='America/Los_Angeles';
const now=new Date();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

const httpUrl=value=>typeof value==='string'&&/^https?:\/\//i.test(value)?value:null;
const finite=value=>Number.isFinite(Number(value));
const minute=value=>{const [h,m]=String(value||'').split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;};
const currentMinute=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return Number(parts.hour)*60+Number(parts.minute);
};

function normalizeItem(item={},fallbackSource){
  const calories=finite(item.calories)?Number(item.calories):null;
  const protein=finite(item.protein)?Number(item.protein):null;
  const source=httpUrl(item.source)||httpUrl(item.nutritionSource)||httpUrl(fallbackSource);
  const nutritionSource=httpUrl(item.nutritionSource)||null;
  return {
    ...item,
    name:String(item.name||'').trim(),
    section:item.section||item.category||'',
    category:item.category||item.section||'',
    diet:['vegan','vegetarian'].includes(item.diet)?item.diet:'unknown',
    allergens:Array.isArray(item.allergens)?item.allergens:[],
    serving:item.serving||null,
    calories,
    protein,
    source,
    nutritionSource,
    nutritionStatus:item.nutritionStatus||(calories!==null&&protein!==null?'available':'unavailable')
  };
}

function normalizeMeal(meal={},fallbackSource){
  return {name:String(meal.name||'Meal'),items:(meal.items||[]).map(item=>normalizeItem(item,fallbackSource)).filter(item=>item.name)};
}

function shortMeal(meal,fallbackSource){
  return {
    name:meal.name,
    items:(meal.items||[]).map(raw=>{
      const item=normalizeItem(raw,fallbackSource);
      return {
        name:item.name,section:item.section,category:item.category,diet:item.diet,allergens:item.allergens,
        serving:item.serving,calories:item.calories,protein:item.protein,source:item.source,
        nutritionSource:item.nutritionSource,nutritionStatus:item.nutritionStatus
      };
    })
  };
}

function plannerReady(meal){
  return Boolean(meal?.items?.length)&&meal.items.some(item=>item.calories!==null&&item.protein!==null);
}
function hasItems(meals){return (meals||[]).some(meal=>meal?.items?.length);}

function chooseCurrentMeal(location,meals,date){
  if(date!==today||!meals?.length)return null;
  const clock=currentMinute();
  const active=(location.schedule||[]).find(period=>{
    const start=minute(period.start),end=minute(period.end);
    return start!==null&&end!==null&&clock>=start&&clock<end;
  });
  if(active){
    const exact=meals.find(meal=>meal.name.toLowerCase()===String(active.name||'').toLowerCase());
    if(exact)return exact;
  }
  const hour=Math.floor(clock/60);
  const patterns=hour<11?[/breakfast|brunch|morning|all day/i]:hour<16?[/lunch|brunch|midday|all day|open/i]:hour<21?[/dinner|evening|all day|open/i]:[/late|dinner|all day|open/i];
  for(const pattern of patterns){const found=meals.find(meal=>pattern.test(meal.name));if(found)return found;}
  return meals[0];
}

async function mapLimit(items,fn,limit=3){
  let index=0;const result=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));
  return result;
}

export async function buildCampusSnapshot({campusId,adapterId,getAvailableDates,getDashboard,getMenu,maxDates=21,locationConcurrency=3}){
  const dataRoot=new URL(`../data/campuses/${campusId}/`,import.meta.url);
  const dateRoot=new URL(`../data/campuses/${campusId}/dates/`,import.meta.url);
  const detailRoot=new URL(`../data/campuses/${campusId}/details/`,import.meta.url);
  const dates=(await getAvailableDates()).filter(date=>date>=today).sort().slice(0,maxDates);
  if(!dates.length)throw new Error(`${campusId} dining did not publish any current or future menu dates.`);

  const generatedDates=new Map(),generatedDetails=new Map();
  for(const date of dates){
    const dashboard=await getDashboard(date);
    const locations=await mapLimit(dashboard.locations||[],async location=>{
      const rawMeals=(location.meals||[]).map(meal=>normalizeMeal(meal,location.source));
      let enrichedMeals=rawMeals,detailPath=null,bulk=null;

      if(date===today&&location.status==='live'&&rawMeals.length){
        enrichedMeals=[];
        for(const rawMeal of rawMeals){
          try{
            const detailed=await getMenu(date,location.id,rawMeal.name);
            const detailedMeal=normalizeMeal({name:rawMeal.name,items:detailed?.items||[]},detailed?.source||location.source);
            enrichedMeals.push(detailedMeal.items.length?detailedMeal:rawMeal);
          }catch{
            enrichedMeals.push(rawMeal);
          }
        }
        const current=chooseCurrentMeal(location,enrichedMeals,date);
        if(current)bulk={meal:current.name,mode:'now',status:plannerReady(current)?'live':'unavailable',items:current.items};

        // A real posted menu should remain browsable even when the campus omits protein,
        // calories, allergens, or another field needed by the recommendation engine.
        if(hasItems(enrichedMeals)){
          detailPath=`./data/campuses/${campusId}/details/${date}/${location.id}.json`;
          generatedDetails.set(`${date}/${location.id}`,{
            campusId,adapter:adapterId,date,id:location.id,name:location.name,kind:location.kind,
            source:location.source,schedule:location.schedule,bulk,meals:enrichedMeals
          });
        }
      }

      return {
        id:location.id,name:location.name,sourceName:location.sourceName||location.name,kind:location.kind,
        status:location.status,message:location.message,source:location.source,schedule:location.schedule,
        meals:rawMeals.map(meal=>shortMeal(meal,location.source)),detailPath,
        bulk:bulk?{meal:bulk.meal,mode:bulk.mode,status:bulk.status}:null
      };
    },locationConcurrency);
    generatedDates.set(date,{campusId,adapter:adapterId,date,fetchedAt:dashboard.fetchedAt||new Date().toISOString(),locations});
  }

  await rm(dateRoot,{recursive:true,force:true});
  await rm(detailRoot,{recursive:true,force:true});
  await mkdir(dateRoot,{recursive:true});
  await mkdir(detailRoot,{recursive:true});
  await writeFile(new URL('./index.json',dataRoot),JSON.stringify({version:2,campusId,adapter:adapterId,generatedAt:new Date().toISOString(),timezone:TZ,dates}));
  for(const [date,day] of generatedDates)await writeFile(new URL(`./${date}.json`,dateRoot),JSON.stringify(day));
  for(const [key,detail] of generatedDetails){
    const [date,id]=key.split('/'),folder=new URL(`./${date}/`,detailRoot);await mkdir(folder,{recursive:true});
    await writeFile(new URL(`./${id}.json`,folder),JSON.stringify(detail));
  }
  console.log(`Built UCPlate ${campusId} snapshot for ${dates.length} posted date(s), ${generatedDates.get(dates[0])?.locations.length||0} locations, and ${generatedDetails.size} browsable detail file(s).`);
}
