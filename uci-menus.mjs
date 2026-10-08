const GRAPHQL_ENDPOINT='https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql';
export const UCI_MENU_URL='https://uci.mydininghub.com/en/locations';
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_RESPONSE=8_000_000;

const LOCATIONS=[
  {id:'uci-anteatery',name:'The Anteatery',key:'the-anteatery',kind:'dining-hall',source:'https://uci.mydininghub.com/en/location/the-anteatery'},
  {id:'uci-brandywine',name:'Brandywine',key:'brandywine',kind:'dining-hall',source:'https://uci.mydininghub.com/en/location/brandywine'},
  {id:'uci-oasis',name:'The Oasis',key:'the-oasis-dining-hall',kind:'dining-hall',source:'https://uci.mydininghub.com/en/location/the-oasis-dining-hall'}
];

const DAYS={Su:0,Mo:1,Tu:2,We:3,Th:4,Fr:5,Sa:6};
const locationCache=new Map();
const weekCache=new Map();
const dashboardCache=new Map();

const LOCATION_QUERY=`
query UCPlateLocation($locationUrlKey:String!,$sortOrder:Commerce_SortOrderEnum){
  getLocation(campusUrlKey:"campus",locationUrlKey:$locationUrlKey){
    commerceAttributes{maxMenusDate children{id uid name position}}
    aemAttributes{hoursOfOperation{schedule} name}
  }
  Commerce_mealPeriods(sort_order:$sortOrder){name id position}
  Commerce_attributesList(entityType:CATALOG_PRODUCT){
    items{code options{value label}}
  }
}`;

const MENU_QUERY=`
query UCPlateMenu($locationUrlKey:String!,$date:String!,$mealPeriod:Int,$viewType:Commerce_MenuViewType!){
  getLocationRecipes(campusUrlKey:"campus",locationUrlKey:$locationUrlKey,date:$date,mealPeriod:$mealPeriod,viewType:$viewType){
    locationRecipesMap{dateSkuMap{date stations{id skus{simple}}}}
    products{items{sku name images{url} attributes{name value}}}
  }
}`;

function validDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new Error(`Invalid UC Irvine menu date: ${date}`);
  return date;
}
function parts(date){return String(date).split('-').map(Number);}
function iso(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function addDays(date,count){const [y,m,d]=parts(date),x=new Date(Date.UTC(y,m-1,d+count,12));return iso(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate());}
function dayIndex(date){const [y,m,d]=parts(date);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay();}
function todayPacific(now=new Date()){
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
function compareDate(a,b){return String(a).localeCompare(String(b));}
function startOfWeek(date){return addDays(date,-dayIndex(date));}
function datesBetween(start,end,cap=21){
  const out=[];let cursor=start;
  while(compareDate(cursor,end)<=0&&out.length<cap){out.push(cursor);cursor=addDays(cursor,1);}
  return out;
}
function arrayValue(value){return Array.isArray(value)?value:value===null||value===undefined||value===''?[]:[value];}
function numeric(value){
  const raw=Array.isArray(value)?value[0]:value;
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const n=Number(String(raw).replace(/[^0-9.+-]/g,''));
  return Number.isFinite(n)?n:null;
}
function textValue(value){const raw=Array.isArray(value)?value[0]:value;return raw===null||raw===undefined?null:String(raw).trim()||null;}

async function queryGraphql(query,variables){
  const url=new URL(GRAPHQL_ENDPOINT);
  url.searchParams.set('query',query);
  url.searchParams.set('variables',JSON.stringify(variables));
  const response=await fetch(url,{headers:{
    'User-Agent':UA,
    'Accept':'application/json',
    'Referer':'https://uci.mydininghub.com/',
    'content-type':'application/json',
    'store':'ch_uci_en',
    'magento-store-code':'ch_uci',
    'magento-website-code':'ch_uci',
    'magento-store-view-code':'ch_uci_en',
    'x-api-key':'ElevateAPIProd',
    'Origin':'https://uci.mydininghub.com'
  },signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  if(text.length>MAX_RESPONSE)throw new Error('UC Irvine Dining returned an unexpectedly large response.');
  if(!response.ok)throw new Error(`UC Irvine Dining returned HTTP ${response.status}.`);
  let payload;
  try{payload=JSON.parse(text);}catch{throw new Error('UC Irvine Dining returned invalid JSON.');}
  if(payload?.errors?.length)throw new Error(`UC Irvine Dining GraphQL error: ${payload.errors[0]?.message||'unknown error'}`);
  return payload?.data||{};
}

export function parseOpeningHours(value=''){
  const open=new Array(7).fill(null),close=new Array(7).fill(null);
  const source=String(value||'').trim()||'Mo-Su off';
  for(const block of source.split(';').map(part=>part.trim()).filter(Boolean)){
    const [dayToken,timeToken]=block.split(/\s+/,2);
    if(!dayToken||!timeToken)continue;
    let dayList=[];
    if(dayToken.includes('-')){
      const [first,last]=dayToken.split('-'),start=DAYS[first],end=DAYS[last];
      if(start===undefined||end===undefined)continue;
      for(let i=start;;i=(i+1)%7){dayList.push(i);if(i===end)break;}
    }else if(DAYS[dayToken]!==undefined)dayList=[DAYS[dayToken]];
    const times=timeToken.toLowerCase()==='off'?[null,null]:timeToken.split('-');
    if(times[0]!==null&&times.length<2)continue;
    for(const index of dayList){open[index]=times[0]||null;close[index]=times[1]||null;}
  }
  return {open,close};
}

function decodeOptions(items=[]){
  const byCode=new Map();
  for(const group of items||[]){
    const code=String(group?.code||'');
    if(!byCode.has(code))byCode.set(code,new Map());
    const map=byCode.get(code);
    for(const option of group?.options||[])map.set(String(option.value),String(option.label));
  }
  return byCode;
}
function normalizeAllergenLabel(label=''){
  const value=String(label).trim();
  if(/^eggs?$/i.test(value))return 'Egg';
  if(/^milk$/i.test(value))return 'Milk';
  if(/^peanuts?$/i.test(value))return 'Peanuts';
  if(/^tree\s*nuts?$/i.test(value))return 'Tree Nuts';
  if(/^soy$/i.test(value))return 'Soy';
  if(/^sesame$/i.test(value))return 'Sesame';
  if(/^fish$/i.test(value))return 'Fish';
  if(/^shellfish$/i.test(value))return 'Shellfish';
  if(/^wheat$/i.test(value))return 'Wheat';
  return value;
}
export function parseUciProduct(product,{date,hallId,period,section,source,optionMaps=new Map()}){
  const attrs=new Map((product?.attributes||[]).map(attr=>[String(attr.name),attr.value]));
  const allergenMap=optionMaps.get('allergens_intolerances')||new Map();
  const preferenceMap=optionMaps.get('recipe_attributes')||optionMaps.get('menu_preferences')||new Map();
  const allergens=[];
  for(const code of arrayValue(attrs.get('allergens_intolerances'))){
    const label=normalizeAllergenLabel(allergenMap.get(String(code))||String(code));
    if(label&&!/^0$/.test(label)&&!allergens.includes(label))allergens.push(label);
  }
  const preferenceLabels=arrayValue(attrs.get('recipe_attributes')??attrs.get('menu_preferences')).map(code=>preferenceMap.get(String(code))||String(code));
  const diet=preferenceLabels.some(label=>/\bvegan\b/i.test(label))?'vegan':preferenceLabels.some(label=>/\bvegetarian\b/i.test(label))?'vegetarian':'unknown';
  const calories=numeric(attrs.get('calories'));
  const protein=numeric(attrs.get('protein'));
  const available=Number.isFinite(calories)&&Number.isFinite(protein);
  const serving=textValue(attrs.get('serving_combined'));
  const description=textValue(attrs.get('marketing_description'))||'';
  return {
    name:String(product?.name||'').trim(),section,category:section,diet,allergens,date,hallId,period:period.toLowerCase(),source,description,
    calories:available?calories:null,protein:available?protein:null,serving:serving||null,nutritionSource:available?source:null,nutritionStatus:available?'available':'unavailable'
  };
}

function activeSchedule(schedules,date){
  const special=(schedules||[]).find(schedule=>schedule?.start_date&&schedule?.end_date&&compareDate(date,schedule.start_date)>=0&&compareDate(date,schedule.end_date)<=0);
  return special||(schedules||[]).find(schedule=>String(schedule?.type||'').toLowerCase()==='standard')||(schedules||[])[0]||null;
}
export function scheduleForDate(schedules,date){
  validDate(date);
  const schedule=activeSchedule(schedules,date),dow=dayIndex(date);
  if(!schedule)return [];
  const out=[];
  for(const meal of schedule.meal_periods||[]){
    const parsed=parseOpeningHours(meal.opening_hours||''),start=parsed.open[dow],end=parsed.close[dow];
    if(start&&end)out.push({name:String(meal.meal_period||'Meal'),start,end});
  }
  return out;
}

async function getLocationMeta(location){
  if(!locationCache.has(location.id))locationCache.set(location.id,(async()=>{
    const data=await queryGraphql(LOCATION_QUERY,{locationUrlKey:location.key,sortOrder:'ASC'});
    const raw=data?.getLocation;
    if(!raw?.commerceAttributes)throw new Error(`${location.name} is not available from UC Irvine Dining.`);
    const optionMaps=decodeOptions(data?.Commerce_attributesList?.items||[]);
    return {
      ...location,
      maxMenusDate:raw.commerceAttributes.maxMenusDate||null,
      stations:new Map((raw.commerceAttributes.children||[]).map(station=>[String(station.id),String(station.name)])),
      mealPeriods:(data?.Commerce_mealPeriods||[]).filter(period=>Number.isFinite(Number(period?.id))&&period?.name).sort((a,b)=>Number(a.position||0)-Number(b.position||0)),
      schedules:Array.isArray(raw?.aemAttributes?.hoursOfOperation?.schedule)?raw.aemAttributes.hoursOfOperation.schedule:[],
      optionMaps
    };
  })().catch(error=>{locationCache.delete(location.id);throw error;}));
  return locationCache.get(location.id);
}

export function parseUciMenuResponse(data,{date,location,meta,period}){
  const root=data?.getLocationRecipes;
  if(!root?.locationRecipesMap||!root?.products)return [];
  const products=new Map((root.products.items||[]).map(product=>[String(product.sku),product]));
  const day=(root.locationRecipesMap.dateSkuMap||[]).find(entry=>String(entry.date)===date);
  if(!day)return [];
  const items=[];
  for(const station of day.stations||[]){
    const section=meta.stations.get(String(station.id))||`Station ${station.id}`;
    for(const sku of station?.skus?.simple||[]){
      const product=products.get(String(sku));
      if(!product)continue;
      const item=parseUciProduct(product,{date,hallId:location.id,period:period.name,section,source:location.source,optionMaps:meta.optionMaps});
      if(item.name)items.push(item);
    }
  }
  return [...new Map(items.map(item=>[`${item.section}\u0000${item.name}`,item])).values()];
}

async function fetchPeriodWeek(location,meta,period,date){
  const week=startOfWeek(date),key=`${location.id}:${period.id}:${week}`;
  if(!weekCache.has(key))weekCache.set(key,queryGraphql(MENU_QUERY,{locationUrlKey:location.key,date:week,mealPeriod:Number(period.id),viewType:'WEEKLY'}).catch(error=>{weekCache.delete(key);throw error;}));
  return weekCache.get(key);
}

export async function getAvailableDates(){
  const today=todayPacific(),metas=await Promise.all(LOCATIONS.map(async location=>{
    try{return await getLocationMeta(location);}catch{return null;}
  }));
  const latest=metas.filter(Boolean).map(meta=>meta.maxMenusDate).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(String(date))).sort().at(-1);
  if(!latest)return [today];
  return datesBetween(today,compareDate(latest,today)>=0?latest:today,21);
}

export async function getDashboard(date){
  validDate(date);
  if(!dashboardCache.has(date))dashboardCache.set(date,(async()=>{
    const locations=await Promise.all(LOCATIONS.map(async location=>{
      try{
        const meta=await getLocationMeta(location),schedule=scheduleForDate(meta.schedules,date);
        if(meta.maxMenusDate&&compareDate(date,meta.maxMenusDate)>0)return {...location,sourceName:location.name,status:'unavailable',message:`UC Irvine has not posted ${date} for ${location.name}.`,schedule,meals:[]};
        const meals=[];
        for(const period of meta.mealPeriods){
          const data=await fetchPeriodWeek(location,meta,period,date);
          const items=parseUciMenuResponse(data,{date,location,meta,period});
          if(items.length)meals.push({name:String(period.name),items});
        }
        return {...location,sourceName:location.name,status:meals.length?'live':'empty',message:meals.length?'Menu posted by UC Irvine Dining.':'No menu items are posted for this day.',schedule,meals};
      }catch(error){
        return {...location,sourceName:location.name,status:'unavailable',message:error.message,source:location.source,schedule:[],meals:[]};
      }
    }));
    return {date,fetchedAt:new Date().toISOString(),locations};
  })().catch(error=>{dashboardCache.delete(date);throw error;}));
  return dashboardCache.get(date);
}

export async function getMenu(date,locationId,mealName){
  const dashboard=await getDashboard(date),location=dashboard.locations.find(entry=>entry.id===locationId);
  if(!location)throw new Error(`Unknown UC Irvine dining location: ${locationId}`);
  const meal=location.meals.find(entry=>entry.name.toLowerCase()===String(mealName||'').toLowerCase());
  if(!meal)throw new Error(`${location.name} does not list ${mealName} on ${date}.`);
  return {date,locationId,locationName:location.name,meal:meal.name,source:location.source,items:meal.items.map(item=>({...item}))};
}
