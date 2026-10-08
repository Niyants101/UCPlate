const ORIGIN='https://hdh-web.ucsd.edu';
const BASE='/dining/apps/diningservices/';
const RESTAURANTS_URL=`${ORIGIN}${BASE}Restaurants/Restaurants`;
const MARKETS_URL=`${ORIGIN}${BASE}Restaurants/Markets`;
const USER_AGENT='UCPlate/0.1 (+https://ucplate.com)';
const cache=new Map();
const pending=new Map();
const TTL=10*60*1000;

const hours=(weekday,friday,weekend)=>({weekday,friday,weekend});
export const UCSD_LOCATIONS=[
  {id:'ucsd-64-degrees',name:'64 Degrees',kind:'dining-hall',locId:'2',locDetID:'37',hours:hours(['07:00','23:00'],['07:00','21:00'],['09:00','21:00'])},
  {id:'ucsd-bistro',name:'Bistro',kind:'dining-hall',locId:'13',locDetID:'27',hours:hours(['11:00','21:00'],['11:00','21:00'],null)},
  {id:'ucsd-canyon-vista',name:'Canyon Vista Marketplace',kind:'dining-hall',locId:'10',locDetID:'22',hours:hours(['07:00','23:00'],['07:00','23:00'],['09:00','23:00'])},
  {id:'ucsd-cecils',name:"Cecil's at Faculty Club",kind:'dining-hall',locId:'7',locDetID:'69',hours:hours(['08:00','15:00'],['08:00','15:00'],null)},
  {id:'ucsd-club-med',name:'Club Med',kind:'dining-hall',locId:'12',locDetID:'14',hours:hours(['07:00','14:30'],['07:00','14:30'],null)},
  {id:'ucsd-foodworx',name:'Foodworx',kind:'dining-hall',locId:'14',locDetID:'13',hours:hours(['09:00','20:00'],['09:00','20:00'],null)},
  {id:'ucsd-oceanview',name:'OceanView',kind:'dining-hall',locId:'8',locDetID:'8',hours:{weekday:['08:00','21:00'],friday:['08:00','15:00'],weekend:null}},
  {id:'ucsd-pines',name:'Pines',kind:'dining-hall',locId:'3',locDetID:'6',hours:{weekday:['07:00','23:00'],friday:['07:00','21:00'],saturday:['09:00','21:00'],sunday:['09:00','23:00']}},
  {id:'ucsd-sixth-restaurants',name:'Restaurants at Sixth College',kind:'dining-hall',locId:'4',locDetID:'30',hours:hours(['08:00','21:00'],['08:00','21:00'],null)},
  {id:'ucsd-ventanas',name:'Ventanas',kind:'dining-hall',locId:'9',locDetID:'52',hours:hours(['08:00','21:00'],['08:00','21:00'],['09:00','21:00'])},
  {id:'ucsd-goodys',name:"Goody's Marketplace",kind:'market',locId:'21',locDetID:'67',hours:{weekday:['07:00','23:59'],friday:['07:00','23:00'],saturday:['09:00','23:00'],sunday:['09:00','23:59'],lateWeekday:['00:00','02:00']}},
  {id:'ucsd-seventh-coffee',name:'Seventh Market Coffeehouse',kind:'cafe',locId:'21',locDetID:'20',subLoc:'00',hours:hours(['07:00','23:00'],['07:00','23:00'],['09:00','23:00'])},
  {id:'ucsd-audreys',name:"Audrey's Cafe",kind:'cafe',source:MARKETS_URL,hours:hours(['08:30','19:00'],['08:30','16:00'],null)},
  {id:'ucsd-rogers-market',name:'Rogers Market',kind:'market',source:MARKETS_URL,hours:{weekday:['07:00','23:59'],friday:['07:00','23:00'],saturday:['09:00','23:00'],sunday:['09:00','23:59'],lateWeekday:['00:00','02:00']}},
  {id:'ucsd-sixth-market',name:'Sixth Market',kind:'market',source:MARKETS_URL,hours:{weekday:['07:00','23:59'],friday:['07:00','23:00'],saturday:['09:00','23:00'],sunday:['09:00','23:59'],lateWeekday:['00:00','02:00']}},
  {id:'ucsd-sunshine-market',name:'Sunshine Market',kind:'market',source:MARKETS_URL,hours:hours(['08:00','21:00'],['08:00','21:00'],['10:00','17:00'])}
];

function cached(key,task){
  const old=cache.get(key);
  if(old&&Date.now()-old.time<TTL)return Promise.resolve(old.value);
  if(pending.has(key))return pending.get(key);
  const promise=Promise.resolve().then(task).then(value=>{cache.set(key,{time:Date.now(),value});return value;}).finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
function decode(value=''){
  return String(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
}
function attr(fragment,name){return fragment.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]||'';}
function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()+1===m&&date.getUTCDate()===d;
}
function iso(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function fullDateFromHeading(html){
  const raw=decode(html.match(/<h2\b[^>]*class=["'][^"']*datenow[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]||'');
  const m=raw.match(/^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if(!m)return null;
  const month=MONTHS[m[1].slice(0,3).toLowerCase()];
  return month?iso(Number(m[3]),month,Number(m[2])):null;
}
function absoluteItemUrl(href){
  const url=new URL(String(href||'').replace(/&amp;/gi,'&'),ORIGIN);
  if(url.origin!==ORIGIN||!url.pathname.startsWith(`${BASE}Nutrition/`))throw new Error('Unexpected UCSD nutrition source.');
  return url.href;
}
export function venueUrl(location,dayNum=0){
  if(!location?.locId||!location?.locDetID)return location?.source||MARKETS_URL;
  const url=new URL(`${BASE}Restaurants/Venue_V3`,ORIGIN);
  url.searchParams.set('dayNum',String(dayNum));
  url.searchParams.set('locDetID',location.locDetID);
  url.searchParams.set('locId',location.locId);
  if(location.subLoc!==undefined)url.searchParams.set('subLoc',location.subLoc);
  return url.href;
}
async function request(url){
  const parsed=new URL(url,ORIGIN);
  if(parsed.origin!==ORIGIN||!parsed.pathname.startsWith(BASE))throw new Error('Unexpected UCSD dining source.');
  return cached(`http:${parsed.href}`,async()=>{
    const response=await fetch(parsed,{headers:{'User-Agent':USER_AGENT,'Accept':'text/html'}});
    if(!response.ok)throw new Error(`UCSD dining returned ${response.status}.`);
    const html=await response.text();
    if(html.length>4_000_000)throw new Error('UCSD dining response was unexpectedly large.');
    return html;
  });
}
export function parseDateStrip(html){
  const selected=fullDateFromHeading(html);
  if(!selected)return [];
  const [baseYear,baseMonth]=selected.split('-').map(Number);
  const rows=[];
  for(const match of html.matchAll(/<a\b([^>]*)class=["'][^"']*linkBut[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi)){
    const attrs=`${match[1]} ${match[2]}`,href=attr(attrs,'href'),label=decode(match[3]);
    const dayNum=Number(new URL(href.replace(/&amp;/gi,'&'),ORIGIN).searchParams.get('dayNum'));
    const m=label.match(/[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})/i);
    if(!m||!Number.isFinite(dayNum))continue;
    const month=MONTHS[m[1].toLowerCase()];if(!month)continue;
    let year=baseYear;
    if(baseMonth===12&&month===1)year++;
    if(baseMonth===1&&month===12)year--;
    const date=iso(year,month,Number(m[2]));
    if(validDate(date))rows.push({date,dayNum});
  }
  if(!rows.some(row=>row.date===selected))rows.push({date:selected,dayNum:0});
  return [...new Map(rows.map(row=>[row.date,row])).values()].sort((a,b)=>a.dayNum-b.dayNum);
}
function iconInfo(fragment){
  const titles=[...fragment.matchAll(/<img\b[^>]*\btitle=["']([^"']+)["'][^>]*>/gi)].map(m=>decode(m[1]));
  const diet=titles.some(t=>/^vegan$/i.test(t))?'vegan':titles.some(t=>/^vegetarian$/i.test(t))?'vegetarian':'unknown';
  const allergens=titles.filter(t=>/^contains\s+/i.test(t)).map(t=>t.replace(/^contains\s+/i,'').trim());
  return {diet,allergens:[...new Set(allergens)]};
}
function itemMatches(segment){
  const anchors=[...segment.matchAll(/<a\b([^>]*)class=["'][^"']*sublocsitem[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi)];
  const items=[];
  const seen=new Set();
  for(let i=0;i<anchors.length;i++){
    const match=anchors[i],attrs=`${match[1]} ${match[2]}`,href=attr(attrs,'href');
    if(!/Nutritionfacts2\?/i.test(href))continue;
    const source=absoluteItemUrl(href),name=decode(match[3]),key=`${source}|${name.toLowerCase()}`;
    if(!name||seen.has(key))continue;
    seen.add(key);
    const fragment=segment.slice(match.index,anchors[i+1]?.index??segment.length);
    const description=decode(fragment.match(/<div\b[^>]*class=["'][^"']*proI[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
    const caloriesMatch=fragment.match(/<span\b[^>]*class=["'][^"']*cals[^"']*["'][^>]*>\s*([\d.]+)\s*Cals/i);
    const calories=caloriesMatch?Number(caloriesMatch[1]):null;
    const icons=iconInfo(fragment);
    items.push({name,description,calories:Number.isFinite(calories)?calories:null,protein:null,serving:'',source,nutritionSource:source,nutritionStatus:'partial',diet:icons.diet,allergens:icons.allergens});
  }
  return items;
}
export function parseVenueMenu(html,expectedDate){
  const actualDate=fullDateFromHeading(html);
  if(expectedDate&&actualDate!==expectedDate)throw new Error(`UCSD returned ${actualDate||'an unknown date'} instead of ${expectedDate}.`);
  const mealStarts=[...html.matchAll(/<div\b[^>]*class=["'][^"']*\bmeal-category\b[^"']*["'][^>]*>/gi)];
  const meals=[];
  for(let mi=0;mi<mealStarts.length;mi++){
    const segment=html.slice(mealStarts[mi].index,mealStarts[mi+1]?.index??html.length);
    let mealName=decode(segment.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||'').replace(/\s+Menu$/i,'').trim();
    if(!mealName)mealName='All Day';
    const stationStarts=[...segment.matchAll(/<div\b[^>]*class=["'][^"']*menu-category-section[^"']*["'][^>]*>/gi)];
    const bySource=new Map();
    for(let si=0;si<stationStarts.length;si++){
      const stationSegment=segment.slice(stationStarts[si].index,stationStarts[si+1]?.index??segment.length);
      const station=decode(stationSegment.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||'')||'Menu';
      const categories=[...stationSegment.matchAll(/<a\b[^>]*class=["'][^"']*\bsublocs\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
      if(!categories.length){
        for(const item of itemMatches(stationSegment))bySource.set(item.source,{...item,section:station,category:''});
        continue;
      }
      for(let ci=0;ci<categories.length;ci++){
        const category=decode(categories[ci][1]);
        const categorySegment=stationSegment.slice(categories[ci].index,categories[ci+1]?.index??stationSegment.length);
        for(const item of itemMatches(categorySegment)){
          if(!bySource.has(item.source))bySource.set(item.source,{...item,section:station,category});
        }
      }
    }
    const items=[...bySource.values()];
    if(items.length)meals.push({name:mealName,items});
  }
  if(!meals.length){
    const items=itemMatches(html).map(item=>({...item,section:'Menu',category:''}));
    if(items.length)meals.push({name:'All Day',items:[...new Map(items.map(item=>[item.source,item])).values()]});
  }
  return {date:actualDate,meals};
}
export function parseNutrition(html,expectedName=''){
  const name=decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  if(expectedName&&name&&decode(expectedName).toLowerCase()!==name.toLowerCase())throw new Error('UCSD nutrition label did not match the food.');
  const serving=decode(html.match(/<p\b[^>]*>\s*Serving Size\s+([\s\S]*?)<\/p>/i)?.[1]||'');
  const caloriesMatch=html.match(/<th\b[^>]*scope=["']row["'][^>]*>\s*Calories\s*<\/th>\s*<td\b[^>]*>\s*([\d.]+)/i);
  const proteinMatch=decode(html).match(/\bProtein\s+([\d.]+)\s*g\b/i);
  const calories=caloriesMatch?Number(caloriesMatch[1]):null,protein=proteinMatch?Number(proteinMatch[1]):null;
  const allergenBlock=html.match(/<div\b[^>]*id=["']allergens["'][^>]*>([\s\S]*?)(?:<div\b[^>]*class=["'][^"']*alert\b|<h3\b[^>]*class=["'][^"']*alert-heading)/i)?.[1]||'';
  const icons=iconInfo(allergenBlock||html);
  return {name,serving,calories:Number.isFinite(calories)?calories:null,protein:Number.isFinite(protein)?protein:null,diet:icons.diet,allergens:icons.allergens};
}
function scheduleFor(location,date){
  if(!validDate(date))return null;
  const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
  const key=weekday===0?'sunday':weekday===6?'saturday':weekday===5?'friday':'weekday';
  const row=location.hours?.[key]??(weekday===0||weekday===6?location.hours?.weekend:location.hours?.weekday);
  const out=[];
  if(location.hours?.lateWeekday&&weekday>=1&&weekday<=5)out.push({name:'Open',start:location.hours.lateWeekday[0],end:location.hours.lateWeekday[1]});
  if(row)out.push({name:'Open',start:row[0],end:row[1]});
  return out;
}
async function getDateMap(){
  return cached('date-map',async()=>{
    const anchor=UCSD_LOCATIONS.find(location=>location.locId&&location.locDetID);
    const html=await request(venueUrl(anchor,0));
    const strip=parseDateStrip(html);
    if(!strip.length)throw new Error('UCSD posted menu dates could not be read.');
    return strip;
  });
}
export async function getAvailableDates(){return (await getDateMap()).map(row=>row.date);}
async function getLocation(id){
  const location=UCSD_LOCATIONS.find(row=>row.id===id);
  if(!location)throw new Error('Unknown UCSD dining location.');
  return location;
}
async function getDay(location,date){
  const schedule=scheduleFor(location,date);
  if(!location.locId||!location.locDetID)return {source:location.source||MARKETS_URL,meals:[],date,schedule,error:'This UCSD location does not publish an itemized online menu.',fetchedAt:new Date().toISOString()};
  const map=await getDateMap(),entry=map.find(row=>row.date===date);
  if(!entry)return {source:venueUrl(location,0),meals:[],date,schedule,error:'UCSD has not posted this menu date.',fetchedAt:new Date().toISOString()};
  return cached(`day:${location.id}:${date}`,async()=>{
    const source=venueUrl(location,entry.dayNum),html=await request(source);
    try{return {source,date,schedule,...parseVenueMenu(html,date),error:null,fetchedAt:new Date().toISOString()};}
    catch(error){return {source,date,schedule,meals:[],error:error.message,fetchedAt:new Date().toISOString()};}
  });
}
async function mapLimit(items,fn,limit=5){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
export async function getDashboard(date){
  if(!validDate(date))throw new Error('Choose a valid UCSD menu date.');
  const availableDates=await getAvailableDates();
  const locations=await mapLimit(UCSD_LOCATIONS,async location=>{
    try{
      const day=await getDay(location,date);
      return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:day.meals.length?'live':'empty',message:day.error||'Menu posted by UC San Diego HDH.',source:day.source,schedule:day.schedule,availableDates,meals:day.meals};
    }catch(error){
      return {id:location.id,name:location.name,sourceName:location.name,kind:location.kind,status:'unavailable',message:error.message,source:location.source||venueUrl(location,0),schedule:scheduleFor(location,date),availableDates,meals:[]};
    }
  });
  return {date,locations,availableDates,fetchedAt:new Date().toISOString()};
}
export async function getMenu(date,locationId,requestedMeal){
  if(!validDate(date))throw new Error('Choose a valid UCSD menu date.');
  const location=await getLocation(locationId),day=await getDay(location,date);
  const meal=day.meals.find(row=>row.name.toLowerCase()===String(requestedMeal||'').toLowerCase())||(!requestedMeal?day.meals[0]:null);
  if(!meal)return {status:'empty',date,hallId:locationId,location,meals:day.meals.map(row=>row.name),items:[],source:day.source,fetchedAt:day.fetchedAt,message:day.error||'This menu period is not published.'};
  return cached(`detail:${date}:${locationId}:${meal.name}`,async()=>{
    const items=await mapLimit(meal.items,async item=>{
      try{
        const nutrition=await cached(`nutrition:${item.nutritionSource}`,async()=>parseNutrition(await request(item.nutritionSource),item.name));
        const allergens=[...new Set([...(item.allergens||[]),...(nutrition.allergens||[])])];
        const diet=nutrition.diet!=='unknown'?nutrition.diet:item.diet;
        const calories=nutrition.calories??item.calories??null,protein=nutrition.protein??null;
        return {...item,...nutrition,calories,protein,diet,allergens,date,hallId:locationId,period:meal.name.toLowerCase(),source:item.nutritionSource,nutritionSource:item.nutritionSource,nutritionStatus:Number.isFinite(calories)&&Number.isFinite(protein)?'available':'unavailable'};
      }catch{return {...item,date,hallId:locationId,period:meal.name.toLowerCase(),nutritionStatus:'unavailable'};}
    },6);
    const missing=items.filter(item=>item.nutritionStatus!=='available').length;
    return {status:missing?'partial':'live',date,hallId:locationId,location,meals:day.meals.map(row=>row.name),meal:meal.name,items,source:day.source,fetchedAt:new Date().toISOString(),message:missing?`${missing} item(s) have incomplete published nutrition data. Missing values are not guessed.`:'Menu, nutrition, and allergens from UC San Diego HDH.'};
  });
}
export {scheduleFor as getSchedule};
