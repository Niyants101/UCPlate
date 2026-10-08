const ORIGIN='https://dining.ucla.edu';
export const UCLA_MENU_URL=`${ORIGIN}/dining-locations/`;
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_HTML=5_000_000;

export const UCLA_LOCATIONS=[
  {id:'ucla-bruin-plate',name:'Bruin Plate',kind:'dining-hall',url:`${ORIGIN}/bruin-plate/`},
  {id:'ucla-de-neve-dining',name:'De Neve Dining',kind:'dining-hall',url:`${ORIGIN}/de-neve-dining/`},
  {id:'ucla-epicuria-at-covel',name:'Epicuria at Covel',kind:'dining-hall',url:`${ORIGIN}/epicuria-at-covel/`},
  {id:'ucla-feast-at-rieber',name:'Feast at Rieber',kind:'dining-hall',url:`${ORIGIN}/spice-kitchen/`},
  {id:'ucla-bruin-bowl',name:'Bruin Bowl',kind:'cafe',url:`${ORIGIN}/bruin-bowl/`},
  {id:'ucla-bruin-cafe',name:'Bruin Café',kind:'cafe',url:`${ORIGIN}/bruin-cafe/`},
  {id:'ucla-cafe-1919',name:'Café 1919',kind:'cafe',url:`${ORIGIN}/cafe-1919/`},
  {id:'ucla-epicuria-at-ackerman',name:'Epicuria at Ackerman',kind:'cafe',url:`${ORIGIN}/epicuria-at-ackerman/`},
  {id:'ucla-food-trucks',name:'Food Trucks',kind:'cafe',url:`${ORIGIN}/meal-swipe-exchange/`},
  {id:'ucla-rendezvous',name:'Rendezvous',kind:'cafe',url:`${ORIGIN}/rendezvous/`},
  {id:'ucla-the-drey',name:'The Drey',kind:'cafe',url:`${ORIGIN}/the-drey/`},
  {id:'ucla-the-study-at-hedrick',name:'The Study at Hedrick',kind:'cafe',url:`${ORIGIN}/the-study-at-hedrick/`},
  {id:'ucla-to-go-lunches',name:'To-Go Lunches',kind:'cafe',url:`${ORIGIN}/to-go-lunches/`}
];

const pageCache=new Map();
const dashboardCache=new Map();
const nutritionCache=new Map();

function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&ndash;|&mdash;/gi,'-')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function textOnly(value=''){
  return decodeEntities(String(value).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
function normalizeName(value=''){return textOnly(value).toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ').trim();}
function isoFromParts(year,month,day){
  const y=Number(year),m=Number(month),d=Number(day);
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||y<2020||m<1||m>12||d<1||d>31)return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function dateFromText(value=''){
  const text=textOnly(value);
  const iso=text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);if(iso)return isoFromParts(iso[1],iso[2],iso[3]);
  const mdy=text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);if(mdy)return isoFromParts(mdy[3],mdy[1],mdy[2]);
  const named=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/i);
  if(named)return isoFromParts(named[3],MONTHS[named[1].toLowerCase()],named[2]);
  return null;
}
export function parseAvailableDates(html=''){
  const dates=[];
  for(const match of String(html).matchAll(/<option\b[^>]*>[\s\S]*?<\/option>/gi)){
    const date=dateFromText(match[0]);if(date&&!dates.includes(date))dates.push(date);
  }
  const shown=parseShownDate(html);if(shown&&!dates.includes(shown))dates.push(shown);
  return dates.sort();
}
export function parseShownDate(html=''){
  const compact=textOnly(html);
  const match=compact.match(/(?:Today,?\s*)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})/i);
  return match?isoFromParts(match[3],MONTHS[match[1].toLowerCase()],match[2]):null;
}
function parseClock(value=''){
  const match=String(value).trim().toLowerCase().replace(/\./g,'').match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m$/);
  if(!match)return null;
  let hour=Number(match[1])%12;if(match[3]==='p')hour+=12;
  return `${String(hour).padStart(2,'0')}:${match[2]||'00'}`;
}
function minute(value){const [h,m]=String(value).split(':').map(Number);return h*60+m;}
export function parseDiningHours(html=''){
  const raw=String(html);
  let start=raw.search(/Today(?:’|'|&rsquo;)s\s+Dining\s+Hours/i);
  if(start<0)start=raw.search(/Dining\s+Hours/i);
  if(start<0)return [];
  const tail=raw.slice(start);
  const stop=tail.search(/Jump\s+to\s+date/i);
  const text=textOnly(stop>=0?tail.slice(0,stop):tail.slice(0,3000));
  const names=['Breakfast','Brunch','Lunch','Dinner','Extended Dinner','Late Night','All Day'];
  const schedule=[];
  for(const name of names){
    const escaped=name.replace(/ /g,'\\s+');
    const re=new RegExp(`${escaped}\\s+(Closed|(?:\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?\\s*[-–—]\\s*\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?))`,'i');
    const match=text.match(re);if(!match||/^closed$/i.test(match[1]))continue;
    const parts=match[1].replace(/[–—]/g,'-').split(/\s+-\s+/);if(parts.length!==2)continue;
    const open=parseClock(parts[0]),close=parseClock(parts[1]);if(!open||!close)continue;
    const end=minute(close)<=minute(open)?'24:00':close;
    schedule.push({name,start:open,end});
  }
  return schedule;
}
function canonicalMeal(value=''){
  const text=textOnly(value).toLowerCase().replace(/\s+menu$/,'').trim();
  if(text==='breakfast')return 'Breakfast';
  if(text==='brunch')return 'Brunch';
  if(text==='lunch')return 'Lunch';
  if(text==='dinner')return 'Dinner';
  if(text==='extended dinner')return 'Extended Dinner';
  if(text==='late night')return 'Late Night';
  if(text==='all day')return 'All Day';
  return null;
}
function headingEvents(html=''){
  const events=[];
  const re=/<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for(const match of String(html).matchAll(re))events.push({tag:match[1].toLowerCase(),text:textOnly(match[2]),start:match.index,end:match.index+match[0].length});
  return events;
}
function labelsFor(segment=''){
  const labels=[...String(segment).matchAll(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi)].map(match=>normalizeName(match[1]));
  const joined=labels.join(' ');
  const diet=/\bvegan\b/.test(joined)?'vegan':/\bvegetarian\b/.test(joined)?'vegetarian':'unknown';
  const allergenMap=[
    [/\begg(?:s)?\b/,'Egg'],[/\bfish\b/,'Fish'],[/\bsoy\b/,'Soy'],[/\bcrustacean[- ]?shellfish\b|\bshellfish\b/,'Shellfish'],
    [/\btree[- ]?nuts?\b/,'Tree Nuts'],[/\bdairy\b|\bmilk\b/,'Milk'],[/\bpeanuts?\b/,'Peanuts'],[/\bwheat\b/,'Wheat'],[/\bsesame\b/,'Sesame'],[/\bgluten\b/,'Gluten'],[/\balcohol\b/,'Alcohol']
  ];
  const allergens=[];for(const [re,name] of allergenMap)if(re.test(joined))allergens.push(name);
  return {diet,allergens};
}
function recipeFromSegment(segment=''){
  const match=String(segment).match(/href=["']([^"']*\/menu-item\/\?recipe=(\d+)[^"']*)["']/i);
  if(!match)return null;
  return {id:match[2],url:new URL(decodeEntities(match[1]),ORIGIN).href};
}
export function parseUclaMenuMarkup(html='',date,location={}){
  const shown=parseShownDate(html);if(shown&&date&&shown!==date)throw new Error(`UCLA Dining returned menu data for ${shown} instead of ${date}.`);
  const events=headingEvents(html),mealStarts=events.filter(event=>event.tag==='h2'&&canonicalMeal(event.text));
  const meals=[];
  for(let mi=0;mi<mealStarts.length;mi++){
    const mealStart=mealStarts[mi],mealEnd=mealStarts[mi+1]?.start??String(html).length,mealName=canonicalMeal(mealStart.text);
    const inside=events.filter(event=>event.start>mealStart.end&&event.start<mealEnd);
    const stations=inside.filter(event=>event.tag==='h2'&&!canonicalMeal(event.text));
    const stationRanges=stations.length?stations.map((station,index)=>({name:station.text||'Menu',start:station.end,end:stations[index+1]?.start??mealEnd})):[{name:'Menu',start:mealStart.end,end:mealEnd}];
    const items=[];
    for(const station of stationRanges){
      const itemHeads=inside.filter(event=>event.tag==='h3'&&event.start>=station.start&&event.start<station.end);
      for(let ii=0;ii<itemHeads.length;ii++){
        const head=itemHeads[ii],end=itemHeads[ii+1]?.start??station.end,segment=String(html).slice(head.end,end),recipe=recipeFromSegment(segment);
        if(!recipe||!head.text)continue;
        const labels=labelsFor(segment);
        items.push({name:head.text,section:station.name,category:station.name,diet:labels.diet,allergens:labels.allergens,date,hallId:location.id,period:mealName.toLowerCase(),source:location.url||UCLA_MENU_URL,_recipeId:recipe.id,_recipeUrl:recipe.url});
      }
    }
    if(items.length)meals.push({name:mealName,items});
  }
  return meals;
}
function parseAllergensFromDetail(html=''){
  const raw=String(html);
  let value=raw.match(/Allergens\*?\s*:\s*([^<]+)/i)?.[1]||'';
  if(!value){const text=textOnly(raw),match=text.match(/Allergens\*?\s*:\s*(.+?)(?:\s+\*\s*If|\s+Please be advised|$)/i);value=match?.[1]||'';}
  const aliases=new Map([['dairy','Milk'],['milk','Milk'],['eggs','Egg'],['egg','Egg'],['fish','Fish'],['soy','Soy'],['shellfish','Shellfish'],['crustacean-shellfish','Shellfish'],['tree nuts','Tree Nuts'],['tree-nuts','Tree Nuts'],['peanut','Peanuts'],['peanuts','Peanuts'],['wheat','Wheat'],['sesame','Sesame'],['gluten','Gluten'],['alcohol','Alcohol']]);
  const out=[];for(const part of decodeEntities(value).split(/[,;/]/)){const key=part.toLowerCase().trim();const name=aliases.get(key);if(name&&!out.includes(name))out.push(name);}return out;
}
export function parseNutritionDetail(html='',expectedName=''){
  const title=textOnly(String(html).match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  if(expectedName&&title&&normalizeName(title)!==normalizeName(expectedName))return {nutritionStatus:'unavailable',calories:null,protein:null,serving:null,allergens:[]};
  const text=textOnly(html);
  const serving=text.match(/Serving\s+Size:\s*(.+?)\s+Calories\s+/i)?.[1]?.trim()||null;
  const caloriesMatch=text.match(/\bCalories\s+([0-9]+(?:\.[0-9]+)?)\b/i);
  const proteinMatch=text.match(/\bProtein\s+([0-9]+(?:\.[0-9]+)?)\s*g\b/i);
  const calories=caloriesMatch?Number(caloriesMatch[1]):null,protein=proteinMatch?Number(proteinMatch[1]):null;
  const available=Number.isFinite(calories)&&Number.isFinite(protein);
  return {nutritionStatus:available?'available':'unavailable',calories:available?calories:null,protein:available?protein:null,serving,allergens:parseAllergensFromDetail(html)};
}
async function fetchText(url){
  const response=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,*/*'},signal:AbortSignal.timeout(30000)});
  const text=await response.text();if(text.length>MAX_HTML)throw new Error('UCLA Dining returned an unexpectedly large response.');
  if(!response.ok)throw new Error(`UCLA Dining returned HTTP ${response.status} for ${url}.`);return text;
}
function dateUrl(url,date){const target=new URL(url);if(date)target.searchParams.set('date',date);return target.href;}
async function locationPage(location,date){
  const key=`${location.id}:${date||'landing'}`;if(!pageCache.has(key))pageCache.set(key,fetchText(dateUrl(location.url,date)).catch(error=>{pageCache.delete(key);throw error;}));return pageCache.get(key);
}
export async function getAvailableDates(){
  const html=await locationPage(UCLA_LOCATIONS[0],null),dates=parseAvailableDates(html);if(dates.length)return dates;
  const shown=parseShownDate(html);return shown?[shown]:[];
}
async function loadLocation(location,date){
  try{
    const html=await locationPage(location,date),meals=parseUclaMenuMarkup(html,date,location),schedule=parseDiningHours(html);
    return {...location,sourceName:location.name,status:meals.length?'live':'empty',message:meals.length?'Menu posted by UCLA Dining.':'UCLA Dining does not publish an itemized menu for this location/date.',source:location.url,schedule,meals};
  }catch(error){
    return {...location,sourceName:location.name,status:'unavailable',message:`UCLA Dining data unavailable: ${error.message}`,source:location.url,schedule:[],meals:[]};
  }
}
async function mapLimit(items,fn,limit=4){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
export async function getDashboard(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new Error(`Invalid UCLA menu date: ${date}`);
  if(!dashboardCache.has(date))dashboardCache.set(date,(async()=>({date,fetchedAt:new Date().toISOString(),locations:await mapLimit(UCLA_LOCATIONS,location=>loadLocation(location,date),4)}))().catch(error=>{dashboardCache.delete(date);throw error;}));
  return dashboardCache.get(date);
}
async function nutritionFor(item){
  if(!item?._recipeId||!item?._recipeUrl)return {nutritionStatus:'unavailable',calories:null,protein:null,serving:null,allergens:[]};
  if(!nutritionCache.has(item._recipeId))nutritionCache.set(item._recipeId,(async()=>parseNutritionDetail(await fetchText(item._recipeUrl),item.name))().catch(()=>({nutritionStatus:'unavailable',calories:null,protein:null,serving:null,allergens:[]})));
  return nutritionCache.get(item._recipeId);
}
function publicItem(item){const {_recipeId,_recipeUrl,...clean}=item;return clean;}
export async function getMenu(date,locationId,mealName){
  const dashboard=await getDashboard(date),location=dashboard.locations.find(entry=>entry.id===locationId);if(!location)throw new Error(`Unknown UCLA dining location: ${locationId}`);
  const meal=location.meals.find(entry=>entry.name.toLowerCase()===String(mealName||'').toLowerCase());if(!meal)throw new Error(`${location.name} does not list ${mealName} on ${date}.`);
  const items=await mapLimit(meal.items,async item=>{const detail=await nutritionFor(item),allergens=[...new Set([...(item.allergens||[]),...(detail.allergens||[])])];return {...publicItem(item),description:'',calories:detail.calories,protein:detail.protein,serving:detail.serving,nutritionSource:detail.nutritionStatus==='available'?item._recipeUrl:null,nutritionStatus:detail.nutritionStatus,allergens};},8);
  return {date,locationId,locationName:location.name,meal:meal.name,source:location.source,items};
}
