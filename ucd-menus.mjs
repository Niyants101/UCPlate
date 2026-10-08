const ORIGIN='https://housing.ucdavis.edu';
export const UCD_MENU_URL=`${ORIGIN}/dining/menus/`;
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_HTML=3_000_000;
const pageCache=new Map();
const dashboardCache=new Map();

const LOCATIONS=[
  {id:'ucd-segundo',name:'Segundo Dining Commons',kind:'dining-hall',url:`${ORIGIN}/dining/dining-commons/segundo/`},
  {id:'ucd-tercero',name:'Tercero Dining Commons',kind:'dining-hall',url:`${ORIGIN}/dining/dining-commons/tercero/`},
  {id:'ucd-cuarto',name:'Cuarto Dining Commons',kind:'dining-hall',url:`${ORIGIN}/dining/dining-commons/cuarto/`},
  {id:'ucd-latitude',name:'Latitude Restaurant',kind:'dining-hall',url:`${ORIGIN}/dining/latitude/`}
];
const DAY_NAMES=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const ALLERGENS=new Map([
  ['dairy','Milk'],['milk','Milk'],['egg','Egg'],['eggs','Egg'],['fish','Fish'],['shellfish','Shellfish'],
  ['peanut','Peanuts'],['peanuts','Peanuts'],['peanut oil','Peanut Oil'],['tree nut','Tree Nuts'],['tree nuts','Tree Nuts'],
  ['soy','Soy'],['soy lecithin','Soy Lecithin'],['soybean oil','Soybean Oil'],['sesame','Sesame'],
  ['wheat','Wheat'],['gluten','Gluten'],['wheat/gluten','Wheat/Gluten'],['alcohol','Alcohol'],['coconut','Coconut'],
  ['vinegar','Vinegar'],['shared fryer','Shared Fryer']
]);

function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function textOnly(value=''){return decodeEntities(String(value).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function parts(date){return String(date).split('-').map(Number);}
function validDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new Error(`Invalid UC Davis menu date: ${date}`);
  return date;
}
function addDays(date,count){
  const [y,m,d]=parts(date),x=new Date(Date.UTC(y,m-1,d+count,12));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`;
}
function dayIndex(date){const [y,m,d]=parts(date);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay();}
function todayPacific(now=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function parseAttrs(tag=''){
  const out={};for(const m of String(tag).matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))out[m[1].toLowerCase()]=decodeEntities(m[3]);return out;
}
function chunks(text,marker){
  const re=new RegExp(marker.source,marker.flags.includes('g')?marker.flags:`${marker.flags}g`),matches=[...String(text).matchAll(re)];
  return matches.map((match,index)=>({open:match[0],body:String(text).slice(match.index+match[0].length,matches[index+1]?.index??String(text).length),start:match.index}));
}
export function parseWeekStart(html=''){
  const match=String(html).match(/<!--\s*Date Check:\s*(\d{4}-\d{2}-\d{2})\s*-->/i);
  return match?.[1]||null;
}
export function weekDates(html=''){
  const start=parseWeekStart(html);if(!start)return [];
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
function dayMarkup(html,date){
  const week=weekDates(html);if(!week.includes(date))throw new Error(`UC Davis page does not contain menu week for ${date}.`);
  const wanted=DAY_NAMES[dayIndex(date)];
  const marker=/<div\b[^>]*\bid=["'](?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)["'][^>]*>/gi;
  const blocks=chunks(String(html),marker);
  const block=blocks.find(entry=>String(parseAttrs(entry.open).id||'').toLowerCase()===wanted);
  if(!block)throw new Error(`UC Davis menu is missing ${wanted}.`);
  return block.body;
}
function normalizeContains(value=''){
  const raw=textOnly(value).replace(/^contains\s*:\s*/i,'').replace(/\.$/,'').trim();
  if(!raw||/no major allergens?/i.test(raw))return [];
  const result=[];
  for(const part of raw.split(/[,;]+/)){
    const key=part.toLowerCase().replace(/\s+/g,' ').trim();
    if(!key)continue;
    if(key==='wheat/gluten'){
      for(const item of ['Wheat','Gluten'])if(!result.includes(item))result.push(item);
      continue;
    }
    const normalized=ALLERGENS.get(key)||textOnly(part);
    if(normalized&&!result.includes(normalized))result.push(normalized);
  }
  return result;
}
function numberField(body,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=String(body).match(new RegExp(`<strong\\b[^>]*>\\s*${escaped}\\s*<\\/strong>\\s*:\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))`,'i'));
  return match?Number(match[1]):null;
}
function textField(body,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=String(body).match(new RegExp(`<p\\b[^>]*>\\s*<strong\\b[^>]*>\\s*${escaped}\\s*<\\/strong>\\s*:\\s*([\\s\\S]*?)<\\/p>`,'i'));
  return match?textOnly(match[1]):null;
}
function parseItem(block,{date,hallId,period,section,source}){
  const name=textOnly(block.body.match(/<a\b[^>]*class=["'][^"']*\bnutrition-panel\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]||'');
  if(!name)return null;
  const hasVegan=/\bisVegan\b/i.test(block.open)||/<img\b[^>]*alt=["']Vegan["']/i.test(block.body);
  const hasVegetarian=/\bisVegetarian\b/i.test(block.open)||/<img\b[^>]*alt=["']Vegetarian["']/i.test(block.body);
  const diet=hasVegan?'vegan':hasVegetarian?'vegetarian':'unknown';
  const contains=textField(block.body,'Contains')||'';
  const allergens=normalizeContains(contains);
  const serving=textField(block.body,'Serving Size');
  const calories=numberField(block.body,'Calories');
  const protein=numberField(block.body,'Protein (g)');
  const available=Number.isFinite(calories)&&Number.isFinite(protein);
  const description='';
  return {name,section,category:section,diet,allergens,date,hallId,period,source,description,calories:available?calories:null,protein:available?protein:null,serving:serving||null,nutritionSource:available?source:null,nutritionStatus:available?'available':'unavailable'};
}
function parseZone(zone,{date,hallId,period,source}){
  const section=textOnly(zone.open.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||'Menu');
  const items=[];
  for(const panel of chunks(zone.body,/<div\b[^>]*class=["'][^"']*\bpanel\b[^"']*\bpanel-default\b[^"']*["'][^>]*>/gi)){
    const item=parseItem(panel,{date,hallId,period,section,source});if(item)items.push(item);
  }
  return items;
}
function parseMeal(block,{date,hallId,source}){
  const name=textOnly(block.open.match(/>([\s\S]*?)<\/h2>/i)?.[1]||'Meal');
  const items=[];
  const zoneHeads=[...block.body.matchAll(/<h3\b[^>]*>\s*(?:Red|Yellow|Blue|Green|Purple|Pink)\s+(?:Zone|Platform)\s*<\/h3>/gi)];
  for(let i=0;i<zoneHeads.length;i++){
    const head=zoneHeads[i],body=block.body.slice(head.index+head[0].length,zoneHeads[i+1]?.index??block.body.length);
    items.push(...parseZone({open:head[0],body},{date,hallId,period:name.toLowerCase(),source}));
  }
  return {name,items};
}
export function parseDavisMenuMarkup(html,date,location){
  validDate(date);
  const body=dayMarkup(html,date),mealMatches=[...body.matchAll(/<h2\b[^>]*class=["'][^"']*\bstickyMealHeader\b[^"']*["'][^>]*>[^<]+<\/h2>/gi)];
  const meals=[];
  for(let i=0;i<mealMatches.length;i++){
    const match=mealMatches[i],slice=body.slice(match.index+match[0].length,mealMatches[i+1]?.index??body.length);
    const meal=parseMeal({open:match[0],body:slice},{date,hallId:location.id,source:location.url});
    if(meal.items.length)meals.push(meal);
  }
  return meals;
}

function scheduleFor(locationId,date){
  const dow=dayIndex(date),weekend=dow===0||dow===6;
  if(locationId==='ucd-segundo')return weekend
    ? [{name:'Breakfast',start:'09:00',end:'11:00'},{name:'Lunch',start:'11:00',end:'17:00'},{name:'Dinner',start:'17:00',end:'20:00'}]
    : [{name:'Breakfast',start:'07:00',end:'11:00'},{name:'Lunch',start:'11:00',end:'17:00'},{name:'Dinner',start:'17:00',end:'22:00'}];
  if(locationId==='ucd-tercero'||locationId==='ucd-cuarto')return weekend?[]:[{name:'Breakfast',start:'07:00',end:'11:00'},{name:'Lunch',start:'11:00',end:'17:00'},{name:'Dinner',start:'17:00',end:'22:00'}];
  if(locationId==='ucd-latitude')return weekend?[]:[{name:'Breakfast',start:'08:00',end:'10:30'},{name:'Lunch',start:'10:30',end:'16:30'},{name:'Dinner',start:'16:30',end:'20:00'}];
  return [];
}
export function getSchedule(locationId,date){validDate(date);return scheduleFor(locationId,date).map(item=>({...item}));}
async function fetchText(url){
  const response=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(30000)}),text=await response.text();
  if(text.length>MAX_HTML)throw new Error('UC Davis Dining returned an unexpectedly large response.');
  if(!response.ok)throw new Error(`UC Davis Dining returned HTTP ${response.status}.`);
  return text;
}
async function locationPage(location){
  if(!pageCache.has(location.id))pageCache.set(location.id,fetchText(location.url).catch(error=>{pageCache.delete(location.id);throw error;}));
  return pageCache.get(location.id);
}
export async function getAvailableDates(){
  const html=await locationPage(LOCATIONS[0]),today=todayPacific();
  return weekDates(html).filter(date=>date>=today).sort();
}
export async function getDashboard(date){
  validDate(date);
  if(!dashboardCache.has(date))dashboardCache.set(date,(async()=>{
    const locations=await Promise.all(LOCATIONS.map(async location=>{
      try{
        const html=await locationPage(location),week=weekDates(html);
        if(!week.includes(date))return {...location,sourceName:location.name,status:'unavailable',message:`UC Davis has not posted ${date} on this location page.`,source:location.url,schedule:getSchedule(location.id,date),meals:[]};
        const meals=parseDavisMenuMarkup(html,date,location);
        return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:meals.length?'live':'empty',message:meals.length?'Menu posted by UC Davis Dining.':'No menu items are posted for this day.',source:location.url,schedule:getSchedule(location.id,date),meals};
      }catch(error){
        return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:'unavailable',message:error.message,source:location.url,schedule:getSchedule(location.id,date),meals:[]};
      }
    }));
    return {date,fetchedAt:new Date().toISOString(),locations};
  })().catch(error=>{dashboardCache.delete(date);throw error;}));
  return dashboardCache.get(date);
}
export async function getMenu(date,locationId,mealName){
  const dashboard=await getDashboard(date),location=dashboard.locations.find(entry=>entry.id===locationId);
  if(!location)throw new Error(`Unknown UC Davis dining location: ${locationId}`);
  const meal=location.meals.find(entry=>entry.name.toLowerCase()===String(mealName||'').toLowerCase());
  if(!meal)throw new Error(`${location.name} does not list ${mealName} on ${date}.`);
  return {date,locationId,locationName:location.name,meal:meal.name,source:location.source,items:meal.items.map(item=>({...item}))};
}
