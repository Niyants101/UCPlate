const ORIGIN='https://foodpro.ucr.edu/foodpro/';
export const UCR_MENU_URL='https://dining.ucr.edu/menus';
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_HTML=3_000_000;
const cache=new Map();
const TTL=10*60*1000;

export const UCR_LOCATIONS=[
  {id:'ucr-glasgow',sourceId:'03',name:'Glasgow Dining',sourceName:'Glasgow',kind:'dining-hall'},
  {id:'ucr-lothian',sourceId:'02',name:'Lothian Dining',sourceName:'Lothian Residential Restaurant',kind:'dining-hall'},
  {id:'ucr-noods',sourceId:'05',name:'NOODS: The Noodle Bar',sourceName:'Noods The Noodle Bar',kind:'restaurant'},
  {id:'ucr-savor',sourceId:'25',name:'Savor',sourceName:'Savor',kind:'restaurant'}
];

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=value.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function foodProDate(date){
  if(!validDate(date))throw new Error('Choose a valid UC Riverside menu date.');
  const [y,m,d]=date.split('-');return `${Number(m)}/${Number(d)}/${y}`;
}
function isoFromFoodProDate(value){
  const match=String(value||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)return null;
  const [,m,d,y]=match,date=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;return validDate(date)?date:null;
}
export function text(html=''){
  return String(html).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
}
const attr=(html,key)=>String(html).match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1];
function labels(fragment=''){
  const lower=String(fragment).toLowerCase();
  const alts=[...String(fragment).matchAll(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi)].map(match=>text(match[1]));
  const joined=`${lower} ${alts.join(' ').toLowerCase()}`;
  const diet=/vegan\.gif|\bvegan\b/.test(joined)?'vegan':/veggie\.gif|\bvegetarian\b/.test(joined)?'vegetarian':'unknown';
  const map=[['milk','Milk'],['eggs','Egg'],['egg','Egg'],['fish','Fish'],['crustacean shellfish','Shellfish'],['shellfish','Shellfish'],['tree nuts','Tree Nuts'],['peanuts','Peanuts'],['peanut','Peanuts'],['wheat','Wheat'],['soybeans','Soy'],['soy','Soy'],['sesame','Sesame']];
  const allergens=[];
  for(const [needle,name] of map){if(joined.includes(`contains ${needle}`)&&!allergens.includes(name))allergens.push(name);}
  return {diet,allergens};
}
function buildSourceUrl(date,location,path='shortmenu.aspx',meal){
  const url=new URL(path,ORIGIN);
  url.search=new URLSearchParams({
    sName:'University of California, Riverside Dining Services',
    locationNum:location.sourceId,
    locationName:location.sourceName,
    naFlag:'1',
    myaction:'read',
    WeeksMenus:"This Week's Menus",
    dtdate:foodProDate(date),
    ...(meal?{mealName:meal}:{})
  });
  return url.href;
}
export function sourceUrl(date,locationId,path='shortmenu.aspx',meal){
  const location=UCR_LOCATIONS.find(entry=>entry.id===locationId);if(!location)throw new Error('Unknown UC Riverside dining location.');
  return buildSourceUrl(date,location,path,meal);
}
async function request(url){
  const parsed=new URL(url,ORIGIN);
  if(parsed.origin!==new URL(ORIGIN).origin||!['/foodpro/shortmenu.aspx','/foodpro/longmenu.aspx','/foodpro/label.aspx'].includes(parsed.pathname))throw new Error('Unexpected UC Riverside menu source.');
  const response=await fetch(parsed,{headers:{'User-Agent':UA,'Accept':'text/html,*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});
  const body=await response.text();
  if(body.length>MAX_HTML)throw new Error('UC Riverside Dining returned an unexpectedly large response.');
  if(!response.ok||/Server Error in|Runtime Error/i.test(body))throw new Error(`UC Riverside Dining returned HTTP ${response.status}.`);
  return body;
}
async function cached(key,task){
  const old=cache.get(key);if(old&&Date.now()-old.time<TTL)return old.value;
  const value=await task();cache.set(key,{time:Date.now(),value});if(cache.size>1200)cache.delete(cache.keys().next().value);return value;
}
export function parseAvailableDates(html=''){
  const dates=new Set();
  for(const match of String(html).matchAll(/dtdate=([^&"'<>\s]+)/gi)){
    try{const raw=decodeURIComponent(match[1].replace(/\+/g,' ')),date=isoFromFoodProDate(raw);if(date)dates.add(date);}catch{}
  }
  for(const match of String(html).matchAll(/\bvalue=["']([^"']*dtdate=[^"']+)["']/gi)){
    try{const url=new URL(match[1].replace(/&amp;/gi,'&'),ORIGIN),date=isoFromFoodProDate(url.searchParams.get('dtdate'));if(date)dates.add(date);}catch{}
  }
  const title=text(String(html).match(/class=["']shortmenutitle["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const parsed=new Date(title.replace(/^Menus for\s*/i,''));
  if(!Number.isNaN(parsed.getTime()))dates.add(`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`);
  return [...dates].filter(validDate).sort();
}
export function parseShort(html,date){
  const title=text(String(html).match(/class=["']shortmenutitle["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const parsed=new Date(title.replace(/^Menus for\s*/i,''));
  const parsedDate=Number.isNaN(parsed.getTime())?null:`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
  if(parsedDate!==date)throw new Error('No UC Riverside menu is posted for this location and date.');
  const tokens=[...String(html).matchAll(/<div\b[^>]*class=["'](shortmenumeals|shortmenucats|shortmenurecipes)["'][^>]*>([\s\S]*?)<\/div>/gi)];
  let meal=null,section='';const meals=[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i],name=text(token[2]);
    if(token[1]==='shortmenumeals'){meal={name,items:[]};meals.push(meal);section='';continue;}
    if(token[1]==='shortmenucats'){section=name.replace(/^--\s*|\s*--$/g,'');continue;}
    if(token[1]==='shortmenurecipes'&&meal&&name){
      const fragment=String(html).slice(token.index,tokens[i+1]?.index||String(html).length),meta=labels(fragment);
      const link=token[2].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i),href=link?attr(link[1],'href'):null;
      let labelSource=null;
      if(href&&/label\.aspx\?/i.test(href)){
        try{labelSource=new URL(href.replace(/&amp;/gi,'&'),ORIGIN).href;}catch{}
      }
      meal.items.push({name,section:section||'Menu',category:section||'Menu',diet:meta.diet,allergens:meta.allergens,_labelSource:labelSource});
    }
  }
  return meals.filter(entry=>entry.name&&entry.items.length);
}
export function parseLong(html=''){
  const matches=[...String(html).matchAll(/<div\b[^>]*class=["']longmenucoldispname["'][^>]*>([\s\S]*?)<\/div>/gi)];
  return matches.flatMap((match,index)=>{
    const link=match[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);if(!link)return [];
    const href=attr(link[1],'href');if(!href||!/label\.aspx\?/i.test(href))return [];
    const fragment=String(html).slice(match.index,matches[index+1]?.index||String(html).length),meta=labels(fragment);
    return [{name:text(link[2]),source:new URL(href.replace(/&amp;/g,'&'),ORIGIN).href,serving:text(fragment.match(/class=["']longmenucolportions["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||''),diet:meta.diet,allergens:meta.allergens}];
  });
}
export function parseLabel(html='',expectedName=''){
  const name=text(String(html).match(/class=["']labelrecipe["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  if(expectedName&&name&&name.toLowerCase()!==String(expectedName).trim().toLowerCase())throw new Error('Nutrition label did not match the UC Riverside food.');
  const plain=text(html),read=regex=>{const match=plain.match(regex);return match?Number(match[1]):null;};
  const rawAllergens=text(String(html).match(/class=["']labelallergensvalue["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
  const aliases=new Map([['milk','Milk'],['egg','Egg'],['eggs','Egg'],['fish','Fish'],['shellfish','Shellfish'],['crustacean shellfish','Shellfish'],['tree nuts','Tree Nuts'],['peanut','Peanuts'],['peanuts','Peanuts'],['wheat','Wheat'],['soy','Soy'],['soybeans','Soy'],['sesame','Sesame']]);
  const allergens=[];
  for(const part of rawAllergens.split(/[,;/]/)){const key=part.trim().toLowerCase(),normalized=aliases.get(key)||part.trim();if(normalized&&!allergens.includes(normalized))allergens.push(normalized);}
  const meta=labels(html);
  return {calories:read(/\bCalories\s+(\d+(?:\.\d+)?)/i),protein:read(/\bProtein\s+(\d+(?:\.\d+)?)\s*g/i),serving:plain.match(/Serving Size\s+(.+?)\s+Calories/i)?.[1]||'',diet:meta.diet,allergens:[...new Set([...allergens,...meta.allergens])]};
}
function scheduleFor(locationId,date){
  const day=new Date(`${date}T12:00:00Z`).getUTCDay();
  if(locationId==='ucr-glasgow'){
    if(day===6)return [{name:'Brunch',start:'10:00',end:'14:30'},{name:'Dinner',start:'17:00',end:'21:00'}];
    if(day===0)return [{name:'Brunch',start:'10:00',end:'14:30'},{name:'Dinner',start:'17:00',end:'22:30'}];
    return [{name:'Breakfast',start:'07:30',end:'10:30'},{name:'Lunch',start:'10:30',end:'14:30'},{name:'Dinner',start:'17:00',end:day===5?'21:00':'22:30'}];
  }
  if(locationId==='ucr-lothian')return day===0||day===6?[]:[{name:'Lunch',start:'11:00',end:'14:30'},{name:'Continuous',start:'14:30',end:'16:30'},{name:'Dinner',start:'17:00',end:'22:00'}];
  if(locationId==='ucr-noods')return day===5||day===6?[]:[{name:'Open',start:'17:00',end:'24:00'}];
  if(locationId==='ucr-savor')return day===0||day===6?[]:[{name:'Open',start:'11:00',end:day===5?'17:00':'18:00'}];
  return [];
}
export function publishedSchedule(locationId,date){return scheduleFor(locationId,date);}
async function dayPage(date,location){
  return cached(`day:${date}:${location.id}`,async()=>{
    const source=buildSourceUrl(date,location),html=await request(source),availableDates=parseAvailableDates(html);
    try{return {source,availableDates,meals:parseShort(html,date),error:null,fetchedAt:new Date().toISOString()};}
    catch(error){return {source,availableDates,meals:[],error:error.message,fetchedAt:new Date().toISOString()};}
  });
}
async function mapLimit(items,fn,limit=6){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
function publicItem(item){const {_labelSource,...clean}=item;return clean;}
export async function getAvailableDates(){
  const location=UCR_LOCATIONS[0],html=await request(buildSourceUrl(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),location));
  return parseAvailableDates(html);
}
export async function getDashboard(date){
  if(!validDate(date))throw new Error('Choose a valid UC Riverside menu date.');
  const locations=await mapLimit(UCR_LOCATIONS,async location=>{
    try{
      const day=await dayPage(date,location);
      return {id:location.id,name:location.name,sourceName:location.sourceName,kind:location.kind,status:day.error?'empty':'live',message:day.error||'Menu posted by UC Riverside Dining.',source:day.source,schedule:scheduleFor(location.id,date),availableDates:day.availableDates,meals:day.meals};
    }catch(error){
      return {id:location.id,name:location.name,sourceName:location.sourceName,kind:location.kind,status:'unavailable',message:error.message,source:buildSourceUrl(date,location),schedule:scheduleFor(location.id,date),availableDates:[],meals:[]};
    }
  },4);
  return {date,locations,availableDates:[...new Set(locations.flatMap(location=>location.availableDates||[]))].filter(validDate).sort(),fetchedAt:new Date().toISOString()};
}
export async function getMenu(date,locationId,requestedMeal){
  if(!validDate(date))throw new Error('Choose a valid UC Riverside menu date.');
  const location=UCR_LOCATIONS.find(entry=>entry.id===locationId);if(!location)throw new Error(`Unknown UC Riverside dining location: ${locationId}`);
  const day=await dayPage(date,location);
  if(day.error)return {status:'empty',date,locationId,locationName:location.name,meals:[],items:[],source:day.source,message:day.error};
  const meal=day.meals.find(entry=>entry.name.toLowerCase()===String(requestedMeal||'').toLowerCase())||(!requestedMeal?day.meals[0]:null);
  if(!meal)return {status:'empty',date,locationId,locationName:location.name,meals:day.meals.map(entry=>entry.name),items:[],source:day.source,message:'This meal is not published for this location and date.'};
  return cached(`meal:${date}:${locationId}:${meal.name}`,async()=>{
    let entries=[];
    if(meal.items.some(item=>!item._labelSource)){
      try{entries=parseLong(await request(buildSourceUrl(date,location,'longmenu.aspx',meal.name)));}catch{}
    }
    const items=await mapLimit(meal.items,async item=>{
      const entry=entries.find(candidate=>candidate.name.toLowerCase()===item.name.toLowerCase());
      const labelSource=item._labelSource||entry?.source||null;
      const base={...publicItem(item),date,hallId:location.id,period:meal.name.toLowerCase(),calories:null,protein:null,serving:entry?.serving||'',source:labelSource||day.source,nutritionSource:null,nutritionStatus:'unavailable',allergens:[...new Set([...(item.allergens||[]),...(entry?.allergens||[])])]};
      if(!labelSource)return base;
      try{
        const nutrition=await cached(`label:${labelSource}`,async()=>parseLabel(await request(labelSource),item.name));
        return {...base,...nutrition,serving:nutrition.serving||base.serving,allergens:[...new Set([...base.allergens,...(nutrition.allergens||[])])],nutritionSource:labelSource,nutritionStatus:Number.isFinite(nutrition.calories)&&Number.isFinite(nutrition.protein)?'available':'unavailable'};
      }catch{return base;}
    },6);
    const missing=items.filter(item=>item.nutritionStatus!=='available').length;
    return {status:missing?'partial':'live',date,locationId,locationName:location.name,meal:meal.name,meals:day.meals.map(entry=>entry.name),items,source:day.source,schedule:scheduleFor(location.id,date),message:missing?`${missing} item(s) have no readable nutrition label. Missing values are shown as unavailable.`:'Menu and nutrition from UC Riverside Dining. Values are per listed serving.'};
  });
}
