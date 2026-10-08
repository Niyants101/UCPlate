const ORIGIN='https://dining.berkeley.edu';
export const UCB_MENU_URL=`${ORIGIN}/menus/`;
const AJAX_URL=`${ORIGIN}/wp-admin/admin-ajax.php`;
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_HTML=4_000_000;
const dayCache=new Map();
const nutritionCache=new Map();
let landingCache=null;

const DINING_HALLS=new Set(['cafe 3','café 3','clark kerr','crossroads','foothill']);
const ALLERGEN_ALIASES=new Map([
  ['milk','Milk'],['dairy','Milk'],['egg','Egg'],['eggs','Egg'],['fish','Fish'],['shellfish','Shellfish'],
  ['tree nuts','Tree Nuts'],['treenuts','Tree Nuts'],['tree-nuts','Tree Nuts'],['wheat','Wheat'],
  ['peanut','Peanuts'],['peanuts','Peanuts'],['soy','Soy'],['soybean','Soy'],['soybeans','Soy'],
  ['sesame','Sesame'],['gluten','Gluten'],['pork','Pork'],['alcohol','Alcohol']
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
function textOnly(value=''){
  return decodeEntities(String(value).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
function slug(value){
  return String(value||'location').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'location';
}
function compactDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new Error(`Invalid UC Berkeley menu date: ${date}`);
  return date.replaceAll('-','');
}
function isoDate(compact){return `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;}
function parseAttrs(tag=''){
  const out={};
  for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))out[match[1].toLowerCase()]=decodeEntities(match[3]);
  return out;
}
function chunks(text,marker){
  const re=new RegExp(marker.source,marker.flags.includes('g')?marker.flags:`${marker.flags}g`);
  const matches=[...text.matchAll(re)];
  return matches.map((match,index)=>({open:match[0],body:text.slice(match.index+match[0].length,matches[index+1]?.index??text.length),start:match.index}));
}
function canonicalMeal(value){
  let name=textOnly(value).replace(/^(fall|winter|spring|summer)(?:\s+\d{4})?\s*[-:]\s*/i,'').trim();
  const low=name.toLowerCase();
  if(low.includes('brunch'))return 'Brunch';
  if(low.includes('breakfast'))return 'Breakfast';
  if(low.includes('lunch')&&low.includes('dinner'))return 'Lunch / Dinner';
  if(low.includes('lunch'))return 'Lunch';
  if(low.includes('late'))return 'Late Night';
  if(low.includes('dinner'))return 'Dinner';
  return name||'Meal';
}
function normalizeAllergen(value){
  const key=String(value||'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  return ALLERGEN_ALIASES.get(key)||null;
}
function itemLabels(open,body){
  const attrs=parseAttrs(open),tokens=String(attrs.class||'').toLowerCase().split(/\s+/).filter(Boolean);
  const alt=[...body.matchAll(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi)].map(match=>textOnly(match[1]));
  const all=[...tokens,...alt];
  const allergens=[];
  for(const label of all){const normalized=normalizeAllergen(label);if(normalized&&!allergens.includes(normalized))allergens.push(normalized);}
  const joined=all.join(' ').toLowerCase();
  const diet=/vegan(?:-option| option)?/.test(joined)?'vegan':/vegetarian(?:-option| option)?/.test(joined)?'vegetarian':'unknown';
  return {diet,allergens};
}
function parseClock(value){
  const match=String(value||'').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
  if(!match)return null;
  let hour=Number(match[1])%12;
  if(match[3]==='p')hour+=12;
  return `${String(hour).padStart(2,'0')}:${match[2]||'00'}`;
}
export function parseHours(html=''){
  const box=String(html).match(/<div\b[^>]*class=["'][^"']*\btimes\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
  const schedule=[];
  for(const match of box.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)){
    const range=textOnly(match[1]).replace(/[–—]/g,'-').split(/\s+-\s+/);
    if(range.length!==2)continue;
    const start=parseClock(range[0]),end=parseClock(range[1]);
    if(start&&end)schedule.push({name:'Open',start,end});
  }
  return schedule;
}
function locationKind(name){
  const key=String(name||'').toLowerCase();
  if(DINING_HALLS.has(key))return 'dining-hall';
  if(/market|the den\b/.test(key))return 'market';
  return 'cafe';
}
function parseRecipeChunk(open,body,{section,date,hallId,period}){
  const attrs=parseAttrs(open);
  const name=textOnly(body.match(/^\s*<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
  if(!name||!attrs['data-location']||!attrs['data-id']||!attrs['data-menuid'])return null;
  const labels=itemLabels(open,body);
  return {
    name,section,category:section,diet:labels.diet,allergens:labels.allergens,date,hallId,period,
    source:UCB_MENU_URL,
    _locationToken:attrs['data-location'],_recipeId:attrs['data-id'],_menuId:attrs['data-menuid']
  };
}
function parseMealChunk(open,body,{date,hallId}){
  const heading=textOnly(body.slice(0,body.search(/<div\b[^>]*class=["'][^"']*\brecipes-main-wrap\b/i)>=0?body.search(/<div\b[^>]*class=["'][^"']*\brecipes-main-wrap\b/i):Math.min(body.length,500)));
  const name=canonicalMeal(heading);
  const items=[];
  for(const category of chunks(body,/<div\b[^>]*class=["'][^"']*\bcat-name\b[^"']*["'][^>]*>/gi)){
    const listAt=category.body.search(/<ul\b[^>]*class=["'][^"']*\brecipe-name\b/i);
    const section=textOnly(category.body.slice(0,listAt>=0?listAt:Math.min(category.body.length,250)))||'Menu';
    for(const recipe of chunks(category.body,/<li\b[^>]*class=["'][^"']*\brecip\b[^"']*["'][^>]*>/gi)){
      const item=parseRecipeChunk(recipe.open,recipe.body,{section,date,hallId,period:name.toLowerCase()});
      if(item)items.push(item);
    }
  }
  return {name,items};
}

export function parseBerkeleyMenuMarkup(html,date){
  const wanted=compactDate(date),locations=[];
  const locationChunks=chunks(String(html||''),/<li\b[^>]*class=["'][^"']*\blocation-name\b[^"']*["'][^>]*>/gi);
  const seenDates=new Set();
  for(const block of locationChunks){
    const attrs=parseAttrs(block.open),dateToken=(String(attrs.class||'').match(/\b(\d{8})\b/)||[])[1];
    if(dateToken)seenDates.add(dateToken);
    if(dateToken&&dateToken!==wanted)continue;
    const name=textOnly(block.body.match(/<span\b[^>]*class=["'][^"']*\bcafe-title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
    if(!name)continue;
    const id=`ucb-${slug(name)}`;
    const meals=chunks(block.body,/<li\b[^>]*class=["'][^"']*\bpreiod-name\b[^"']*["'][^>]*>/gi)
      .map(meal=>parseMealChunk(meal.open,meal.body,{date,hallId:id})).filter(meal=>meal.items.length);
    locations.push({
      id,name,sourceName:name,kind:locationKind(name),status:meals.length?'live':'empty',
      message:'Menu posted by UC Berkeley Dining.',source:UCB_MENU_URL,schedule:parseHours(block.body),meals
    });
  }
  if(locationChunks.length&&seenDates.size&&!seenDates.has(wanted))throw new Error(`UC Berkeley returned menu data for ${[...seenDates].join(', ')} instead of ${wanted}.`);
  return locations;
}

export function parseAvailableDates(html=''){
  const dates=[];
  for(const match of String(html).matchAll(/<option\b[^>]*\bvalue=["'](\d{8})["'][^>]*>/gi)){
    const date=isoDate(match[1]);if(!dates.includes(date))dates.push(date);
  }
  return dates.sort();
}
function numericAfterLabel(html,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=String(html).match(new RegExp(`<span\\b[^>]*>\\s*${escaped}\\s*<\\/span>\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))`,'i'));
  return match?Number(match[1]):null;
}
export function parseNutritionDetail(html='',expectedName=''){
  const name=textOnly(String(html).match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1]||'');
  if(expectedName&&name&&name.toLowerCase()!==String(expectedName).trim().toLowerCase())return {nutritionStatus:'unavailable',calories:null,protein:null,serving:null,allergens:[]};
  const servingRaw=textOnly(String(html).match(/<span\b[^>]*class=["'][^"']*\bserving-size\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
  const serving=servingRaw.replace(/^serving\s*size\s*:\s*/i,'').trim()||null;
  const calories=numericAfterLabel(html,'Calories (kcal):');
  const protein=numericAfterLabel(html,'Protein (g):');
  const allergenBox=String(html).match(/<div\b[^>]*class=["'][^"']*\ballergens\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
  const allergens=[];
  for(const match of allergenBox.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)){
    for(const part of textOnly(match[1]).split(/[,;/]/)){
      const normalized=normalizeAllergen(part);if(normalized&&!allergens.includes(normalized))allergens.push(normalized);
    }
  }
  const available=Number.isFinite(calories)&&Number.isFinite(protein);
  return {nutritionStatus:available?'available':'unavailable',calories:available?calories:null,protein:available?protein:null,serving,allergens};
}

async function fetchText(url,options={}){
  const response=await fetch(url,{...options,headers:{'User-Agent':UA,'Accept':'text/html,*/*',...(options.headers||{})},signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  if(text.length>MAX_HTML)throw new Error('UC Berkeley Dining returned an unexpectedly large response.');
  if(!response.ok)throw new Error(`UC Berkeley Dining returned HTTP ${response.status}.`);
  return text;
}
async function postAjax(body){
  return fetchText(AJAX_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':UCB_MENU_URL},body:new URLSearchParams(body)});
}
async function landing(){
  if(!landingCache)landingCache=fetchText(UCB_MENU_URL).catch(error=>{landingCache=null;throw error;});
  return landingCache;
}
export async function getAvailableDates(){return parseAvailableDates(await landing());}
async function dayMarkup(date){return postAjax({action:'cald_filter_xml',location:'',mealperiod:'',date:compactDate(date)});}
export async function getDashboard(date){
  compactDate(date);
  if(!dayCache.has(date))dayCache.set(date,(async()=>({date,fetchedAt:new Date().toISOString(),locations:parseBerkeleyMenuMarkup(await dayMarkup(date),date)}))().catch(error=>{dayCache.delete(date);throw error;}));
  return dayCache.get(date);
}
async function detailFor(item){
  const key=`${item._locationToken}:${item._recipeId}:${item._menuId}`;
  if(!nutritionCache.has(key))nutritionCache.set(key,(async()=>parseNutritionDetail(await postAjax({action:'get_recipe_details',location:item._locationToken,id:item._recipeId,menu_id:item._menuId}),item.name))().catch(()=>({nutritionStatus:'unavailable',calories:null,protein:null,serving:null,allergens:[]})));
  return nutritionCache.get(key);
}
async function mapLimit(items,fn,limit=6){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
function publicItem(item){const {_locationToken,_recipeId,_menuId,...clean}=item;return clean;}
export async function getMenu(date,locationId,mealName){
  const dashboard=await getDashboard(date),location=dashboard.locations.find(entry=>entry.id===locationId);
  if(!location)throw new Error(`Unknown UC Berkeley dining location: ${locationId}`);
  const meal=location.meals.find(entry=>entry.name.toLowerCase()===String(mealName||'').toLowerCase());
  if(!meal)throw new Error(`${location.name} does not list ${mealName} on ${date}.`);
  const items=await mapLimit(meal.items,async item=>{
    const detail=await detailFor(item),allergens=[...new Set([...(item.allergens||[]),...(detail.allergens||[])])];
    return {...publicItem(item),description:'',calories:detail.calories,protein:detail.protein,serving:detail.serving,nutritionSource:detail.nutritionStatus==='available'?UCB_MENU_URL:null,nutritionStatus:detail.nutritionStatus,allergens};
  },6);
  return {date,locationId,locationName:location.name,meal:meal.name,source:UCB_MENU_URL,items};
}
