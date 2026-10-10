import {randomUUID} from 'node:crypto';

export const UCM_WIDGET_URL='https://uc-merced-the-pavilion.widget.eagle.bigzpoon.com';
export const UCM_API_URL='https://widget.api.eagle.bigzpoon.com';
export const UCM_DINING_URL='https://dining.ucmerced.edu/dining-locations-hours/pavilion/dining-center-hours';
const COMPANY_ID='61bd7ecd8c760e0011ac0fac';
const UA='UCPlate/0.1 (+https://ucplate.com)';
const cache=new Map();
const TTL=10*60*1000;
const WEEKDAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const NO_PREFS={allergies:[],lifestyleChoices:[],medicalGoals:[],preferenceApplyStatus:false,crossContactStatus:true};

export const UCM_LOCATIONS=[
  {id:'ucm-pavilion',sourceId:'61df4a34d5507a00103ee41e',name:'The Pavilion',kind:'dining-hall'},
  {id:'ucm-ywdc',sourceId:'628672b52903a50010fa751e',name:'Yablokoff-Wallace Dining Center',kind:'dining-hall'}
];

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function clean(value=''){return String(value??'').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();}
function number(value){
  if(Number.isFinite(value))return Number(value);
  const match=String(value??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):null;
}
function unique(values){return [...new Set(values.filter(Boolean))];}
function normalizeAllergen(value){
  const key=clean(value).toLowerCase();
  if(!key)return null;
  if(key.includes('tree nut'))return 'Tree Nuts';
  if(key.includes('peanut'))return 'Peanuts';
  if(key.includes('shellfish')||key.includes('crustacean'))return 'Shellfish';
  if(key.includes('milk')||key==='dairy')return 'Milk';
  if(key.includes('egg'))return 'Egg';
  if(key.includes('wheat')||key.includes('gluten'))return 'Wheat';
  if(key.includes('soy'))return 'Soy';
  if(key.includes('sesame'))return 'Sesame';
  if(key==='fish'||key.includes(' fish'))return 'Fish';
  return clean(value);
}
function walk(value,visit,path=[]){
  if(value==null)return;
  visit(value,path);
  if(Array.isArray(value))value.forEach((entry,index)=>walk(entry,visit,[...path,String(index)]));
  else if(typeof value==='object')Object.entries(value).forEach(([key,entry])=>walk(entry,visit,[...path,key]));
}
function findExplicitNumber(raw,needles){
  let found=null;
  walk(raw,(value,path)=>{
    if(found!=null)return;
    const key=path.at(-1)?.toLowerCase()||'';
    if(needles.some(needle=>key===needle||key.includes(needle))){const parsed=number(value);if(parsed!=null)found=parsed;}
    if(typeof value==='object'&&value&&!Array.isArray(value)){
      const label=clean(value.name??value.label??value.nutrientName??value.title).toLowerCase();
      if(needles.some(needle=>label===needle||label.includes(needle))){const parsed=number(value.value??value.amount??value.quantity??value.nutrientValue);if(parsed!=null)found=parsed;}
    }
  });
  return found;
}
function findServing(raw){
  let found='';
  walk(raw,(value,path)=>{
    if(found||typeof value==='object')return;
    const key=path.at(-1)?.toLowerCase()||'';
    if(key.includes('serving')||key.includes('portion')){const text=clean(value);if(text&&!/^\d+(?:\.\d+)?$/.test(text))found=text;}
  });
  return found;
}
function collectStrings(raw,pathNeedles){
  const values=[];
  walk(raw,(value,path)=>{
    if(typeof value!=='string')return;
    const joined=path.join('.').toLowerCase();
    if(pathNeedles.some(needle=>joined.includes(needle)))values.push(clean(value));
  });
  return unique(values);
}
export function parseItem(raw={}){
  const name=clean(raw.name||raw.menuItemName||raw.title);
  let calories=null;
  for(const entry of Array.isArray(raw.caloriesCalculationSize)?raw.caloriesCalculationSize:[]){
    const parsed=number(entry?.calories);if(parsed!=null){calories=parsed;break;}
  }
  calories??=findExplicitNumber(raw,['calories','calorie']);
  const protein=findExplicitNumber(raw,['protein']);
  const explicitAllergens=collectStrings(raw,['allerg','contains']);
  const allergens=unique(explicitAllergens.flatMap(value=>value.split(/[,;/]/).map(normalizeAllergen)));
  const lifestyle=collectStrings(raw,['lifestyle','dietary','dietflag','diet_flag']).join(' ').toLowerCase();
  const diet=/\bvegan\b/.test(lifestyle)?'vegan':/\bvegetarian\b/.test(lifestyle)?'vegetarian':'unknown';
  return {
    name,
    description:clean(raw.description||raw.shortDescription||''),
    serving:findServing(raw),
    calories:Number.isFinite(calories)?calories:null,
    protein:Number.isFinite(protein)?protein:null,
    diet,
    allergens
  };
}
export function categoryInfo(name=''){
  const source=clean(name),lower=source.toLowerCase(),meals=[];
  for(const meal of ['Breakfast','Brunch','Lunch','Dinner'])if(lower.includes(meal.toLowerCase()))meals.push(meal);
  if(/late\s*night/i.test(source))meals.push('Late Night');
  const station=clean(source.replace(/breakfast|brunch|lunch|dinner|late\s*night|\band\b|&/gi,' '))||'Main';
  return {meals:meals.length?meals:['All Day'],station};
}
export function publishedSchedule(locationId,date){
  if(!validDate(date))return [];
  const day=new Date(`${date}T12:00:00Z`).getUTCDay(),weekend=day===0||day===6;
  if(locationId==='ucm-pavilion')return weekend
    ?[{name:'Breakfast',start:'09:00',end:'10:30'},{name:'Lunch',start:'11:00',end:'15:00'},{name:'Dinner',start:'16:00',end:'21:00'}]
    :[{name:'Breakfast',start:'07:00',end:'10:00'},{name:'Lunch',start:'11:00',end:'15:00'},{name:'Dinner',start:'16:00',end:'21:00'}];
  if(locationId==='ucm-ywdc')return weekend?[]:[{name:'Lunch',start:'10:00',end:'14:00'},{name:'Dinner',start:'15:00',end:'20:00'},{name:'Late Night',start:'21:00',end:'24:00'}];
  return [];
}
async function cached(key,task){
  const old=cache.get(key);if(old&&Date.now()-old.time<TTL)return old.value;
  const value=await task();cache.set(key,{time:Date.now(),value});if(cache.size>1200)cache.delete(cache.keys().next().value);return value;
}
async function api(path,locationId,params={}){
  const url=new URL(path,UCM_API_URL);for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json, text/plain, */*','x-comp-id':COMPANY_ID,'location-id':locationId,'device-id':randomUUID(),'Origin':UCM_WIDGET_URL,'Referer':`${UCM_WIDGET_URL}/`},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`UC Merced menu service returned HTTP ${response.status}.`);
  const body=await response.json();
  if(body?.code!==200||body?.data==null)throw new Error(body?.message||'UC Merced menu service returned an unexpected response.');
  return body.data;
}
async function menuGroups(location){
  return cached(`groups:${location.sourceId}`,async()=>{
    const data=await api('/locations/menugroups',location.sourceId,{isPreview:'true',locationId:location.sourceId});
    const rows=Array.isArray(data)?data:data?.menuGroups||[];
    return new Map(rows.map(row=>[clean(row.name).toUpperCase(),String(row._id||row.id||'')]).filter(([,id])=>id));
  });
}
async function categories(location,groupId){
  const data=await api('/menucategories',location.sourceId,{initialCall:'menuGroup',locationId:location.sourceId,menuGroupIds:groupId});
  return Array.isArray(data)?data:data?.menuCategories||data?.categories||[];
}
async function categoryItems(location,groupId,category){
  const id=category?._id||category?.id;if(!id)return [];
  const data=await api('/menuitems',location.sourceId,{categoryId:id,isPreview:'false',locationId:location.sourceId,menuGroupId:groupId,userPreferences:JSON.stringify(NO_PREFS)});
  return Array.isArray(data)?data:data?.menuItems||[];
}
async function locationDay(location,date){
  const dayIndex=new Date(`${date}T12:00:00Z`).getUTCDay(),groups=await menuGroups(location),groupId=groups.get(WEEKDAYS[dayIndex]);
  const source=UCM_WIDGET_URL,schedule=publishedSchedule(location.id,date);
  if(!groupId)return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:schedule.length?'empty':'closed',message:schedule.length?'No itemized menu is posted for this date.':'Closed on this date.',source,schedule,meals:[]};
  const rows=await categories(location,groupId),mealMap=new Map();
  for(const category of rows){
    const categoryName=clean(category?.name);if(!categoryName||['schedule','help','recipes'].includes(categoryName.toLowerCase())||String(category?.status||'Active').toLowerCase()==='inactive')continue;
    const rawItems=await categoryItems(location,groupId,category),items=rawItems.filter(item=>String(item?.status||'Active').toLowerCase()!=='inactive').map(parseItem).filter(item=>item.name);
    if(!items.length)continue;
    const info=categoryInfo(categoryName);
    for(const mealName of info.meals){
      if(!mealMap.has(mealName))mealMap.set(mealName,{name:mealName,items:[]});
      mealMap.get(mealName).items.push(...items.map(item=>({...item,section:info.station,category:info.station})));
    }
  }
  const meals=[...mealMap.values()];
  return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:meals.length?'live':(schedule.length?'empty':'closed'),message:meals.length?'Menu published through UC Merced Dining.':(schedule.length?'No itemized menu is posted for this date.':'Closed on this date.'),source,schedule,meals};
}
function losAngelesToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export async function getAvailableDates(){
  const today=losAngelesToday(),base=new Date(`${today}T12:00:00Z`),start=new Date(base);start.setUTCDate(base.getUTCDate()-base.getUTCDay());
  return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);return d.toISOString().slice(0,10);});
}
export async function getDashboard(date){
  if(!validDate(date))throw new Error('Choose a valid UC Merced menu date.');
  const allowed=await getAvailableDates();if(!allowed.includes(date))throw new Error('UC Merced currently publishes a weekly cycle for the current Sunday through Saturday.');
  const locations=[];
  for(const location of UCM_LOCATIONS){
    try{locations.push(await locationDay(location,date));}
    catch(error){locations.push({id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:'unavailable',message:error.message,source:UCM_WIDGET_URL,schedule:publishedSchedule(location.id,date),meals:[]});}
  }
  return {date,locations,availableDates:allowed,fetchedAt:new Date().toISOString()};
}
export async function getMenu(date,locationId,requestedMeal){
  const dashboard=await getDashboard(date),location=dashboard.locations.find(entry=>entry.id===locationId);if(!location)throw new Error(`Unknown UC Merced dining location: ${locationId}`);
  const meal=location.meals.find(entry=>entry.name.toLowerCase()===String(requestedMeal||'').toLowerCase());if(!meal)throw new Error(`No ${requestedMeal} menu is posted for ${location.name} on ${date}.`);
  return {campusId:'ucm',adapter:'ucm-bigzpoon',date,id:location.id,name:location.name,kind:location.kind,source:location.source,schedule:location.schedule,meal:meal.name,items:meal.items,fetchedAt:dashboard.fetchedAt};
}
