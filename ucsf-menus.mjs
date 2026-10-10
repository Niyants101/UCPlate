export const UCSF_MENU_URL='https://webmenus.ucsfmedicalcenter.org/';
export const UCSF_DINING_URL='https://nutrition.ucsf.edu/ucsf-dining';
const UA='UCPlate/0.1 (+https://ucplate.com)';
const cache=new Map();
const TTL=10*60*1000;

export const UCSF_LOCATIONS=[
  {id:'ucsf-parnassus',facilityId:'PARN',name:'Moffitt Café',sourceName:'Parnassus Cafe Menu',kind:'restaurant'},
  {id:'ucsf-mission-bay',facilityId:'MBH',name:'Shorenstein Family Café',sourceName:'Mission Bay Cafe Menu',kind:'restaurant'},
  {id:'ucsf-mount-zion',facilityId:'ZION',name:'Mount Zion Café',sourceName:'Mount Zion Patient and Cafe Menu',kind:'restaurant'}
];

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function clean(value=''){return String(value??'').replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();}
function numeric(value){if(Number.isFinite(value))return Number(value);const m=String(value??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null;}
function unique(values){return [...new Set(values.filter(Boolean))];}
function walk(value,visit,path=[]){if(value==null)return;visit(value,path);if(Array.isArray(value))value.forEach((entry,index)=>walk(entry,visit,[...path,String(index)]));else if(typeof value==='object')Object.entries(value).forEach(([key,entry])=>walk(entry,visit,[...path,key]));}
function normalizeAllergen(value){
  const key=clean(value).toLowerCase();if(!key)return null;
  if(key.includes('tree nut'))return 'Tree Nuts';if(key.includes('peanut'))return 'Peanuts';if(key.includes('shellfish')||key.includes('crustacean'))return 'Shellfish';
  if(key.includes('milk')||key==='dairy')return 'Milk';if(key.includes('egg'))return 'Egg';if(key.includes('wheat')||key.includes('gluten'))return 'Wheat';
  if(key.includes('soy'))return 'Soy';if(key.includes('sesame'))return 'Sesame';if(key==='fish'||key.includes(' fish'))return 'Fish';return clean(value);
}
function dietaryName(value=''){
  return clean(value).replace(/\s*\((?:Vg|V|GF|SS|S|LS|L\/S)\)\s*/gi,' ').replace(/\s+/g,' ').trim();
}
export function dietaryFlags(value=''){
  const text=clean(value);
  return {diet:/\(Vg\)/i.test(text)?'vegan':/\(V\)/i.test(text)?'vegetarian':'unknown',glutenFree:/\(GF\)/i.test(text)};
}
function stationName(group,item){
  const outer=clean(group?.publishingGroup?.publishingGroup?.name||group?.publishingGroup?.name||'');
  const inner=clean(item?.recipe?.menuPublishingGroup?.name||'');
  if(outer&&!/^(breakfast|lunch|dinner|brunch|all day)$/i.test(outer))return outer;
  if(inner&&!/^no print|\(unassigned\)$/i.test(inner))return inner;
  return outer||inner||'Menu';
}
export function parseMenuGroups(groups=[],mealName='Menu'){
  const items=[];
  for(const group of Array.isArray(groups)?groups:[]){
    for(const raw of Array.isArray(group?.menuItems)?group.menuItems:[]){
      const sourceName=clean(raw?.recipe?.description||raw?.description||raw?.name);if(!sourceName)continue;
      const flags=dietaryFlags(sourceName),section=stationName(group,raw),calories=numeric(raw.roundedCalories??raw.calories);
      items.push({
        recipeId:raw.recipeId??raw?.recipe?.id??null,
        name:dietaryName(sourceName),sourceName,description:clean(raw?.recipe?.menuText||''),section,category:section,
        calories:Number.isFinite(calories)?calories:null,protein:null,serving:'',diet:flags.diet,allergens:[],glutenFree:flags.glutenFree,meal:mealName
      });
    }
  }
  const seen=new Set();return items.filter(item=>{const key=`${item.recipeId||item.name}|${item.section}`;if(seen.has(key))return false;seen.add(key);return true;});
}
function nutrientValue(raw,name){
  let found=null;walk(raw,value=>{if(found!=null||!value||typeof value!=='object'||Array.isArray(value))return;const label=clean(value.name??value.nutrientName??value.description??value.label).toLowerCase();if(label.includes(name)){for(const key of ['roundedAmountValue','amountValue','value','amount','nutrientValue']){const parsed=numeric(value[key]);if(parsed!=null){found=parsed;break;}}}});return found;
}
function servingFrom(raw){let found='';walk(raw,(value,path)=>{if(found||typeof value!=='string')return;const key=path.at(-1)?.toLowerCase()||'';if(key.includes('portion')||key.includes('serving')){const text=clean(value);if(text)found=text;}});return found;}
function allergensFrom(raw){
  const found=[];walk(raw,(value,path)=>{const key=path.join('.').toLowerCase();if(typeof value==='string'&&(key.includes('allergen')||key.includes('description')))for(const part of clean(value).split(/[,;/]/)){const normalized=normalizeAllergen(part);if(normalized)found.push(normalized);}else if(value&&typeof value==='object'&&!Array.isArray(value)){const label=clean(value.name??value.allergenName??value.description);if(label&&key.includes('allergen'))found.push(normalizeAllergen(label));}});
  return unique(found).filter(value=>value&&value.length<80);
}
async function cached(key,task){const old=cache.get(key);if(old&&Date.now()-old.time<TTL)return old.value;const value=await task();cache.set(key,{time:Date.now(),value});if(cache.size>2000)cache.delete(cache.keys().next().value);return value;}
async function requestJson(url,options={}){
  const response=await fetch(url,{...options,headers:{'User-Agent':UA,'Accept':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(30000)});
  if(!response.ok){let detail='';try{detail=clean((await response.json())?.message)}catch{}throw new Error(`UCSF menu service returned HTTP ${response.status}${detail?`: ${detail}`:''}.`);}
  return response.json();
}
async function settings(){return cached('settings',()=>requestJson(new URL('/webapi/settings/get',UCSF_MENU_URL)));}
async function apiBase(){const data=await settings();if(!/^https:\/\//i.test(data?.apiUrl||''))throw new Error('UCSF menu service did not publish a valid API URL.');return new URL('api/HospitalitySuite/',data.apiUrl.endsWith('/')?data.apiUrl:`${data.apiUrl}/`);}
async function hs(location,path,{params={},method='GET',body=null}={}){
  const base=await apiBase(),url=new URL(path,base);for(const [key,value] of Object.entries(params))if(value!=null)url.searchParams.set(key,String(value));
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new Error('Unexpected UCSF menu source.');
  return cached(`${location.facilityId}:${method}:${url.href}:${body?JSON.stringify(body):''}`,()=>requestJson(url,{method,headers:{HsApplicationModule:'MealChoiceConnect',FacilityId:location.facilityId,'Content-Type':'application/json','Referer':UCSF_MENU_URL},body:body==null?undefined:JSON.stringify(body)}));
}
function rows(value,keys=[]){if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return [];}
async function catalog(location){
  return cached(`catalog:${location.facilityId}`,async()=>{
    const [menusRaw,mealsRaw]=await Promise.all([hs(location,'menu/getMenus'),hs(location,'meal/getMeals')]);
    const menus=rows(menusRaw,['menus','data']).filter(menu=>menu?.id!=null),meals=rows(mealsRaw,['meals','data']).filter(meal=>meal?.mealId!=null&&!meal?.isNourishmentMeal);
    if(!menus.length||!meals.length)throw new Error(`No UCSF café menus were published for ${location.name}.`);
    return {menus,meals};
  });
}
function timePart(value){const match=String(value||'').match(/T(\d{2}):(\d{2})/);return match?`${match[1]}:${match[2]}`:'';}
export function publishedSchedule(locationId,date){
  if(!validDate(date))return [];const day=new Date(`${date}T12:00:00Z`).getUTCDay(),weekend=day===0||day===6;
  if(locationId==='ucsf-parnassus')return [{name:'Open',start:weekend?'07:00':'06:30',end:weekend?'15:00':'19:00'}];
  if(locationId==='ucsf-mission-bay')return [{name:'Open',start:weekend?'07:00':'06:30',end:'15:00'}];
  if(locationId==='ucsf-mount-zion')return weekend?[]:[{name:'Open',start:'07:00',end:'14:00'}];
  return [];
}
async function mealGroups(location,menuId,mealId,date){return hs(location,'publishingGroups/GuestMenuData',{params:{menuId,mealId,serveDate:date}});}
async function locationDay(location,date){
  const {menus,meals}=await catalog(location),mealMap=new Map();
  for(const meal of meals){
    const mealName=clean(meal.name||meal.shortName)||'Menu',combined=[];
    for(const menu of menus){
      try{const data=await mealGroups(location,menu.id,meal.mealId,date);combined.push(...parseMenuGroups(rows(data,['data','publishingGroups']),mealName));}catch(error){if(!/404|not found/i.test(error.message))throw error;}
    }
    if(combined.length)mealMap.set(mealName,{name:mealName,start:timePart(meal.startTime),end:timePart(meal.endTime),items:combined});
  }
  const schedule=publishedSchedule(location.id,date),mealsOut=[...mealMap.values()],status=mealsOut.length?'live':(schedule.length?'empty':'closed');
  return {id:location.id,name:location.name,sourceName:location.sourceName,kind:location.kind,status,message:mealsOut.length?'Menu published through UCSF Meal Choice Connect.':(schedule.length?'No itemized café menu is posted for this date.':'Closed on this date.'),source:UCSF_MENU_URL,schedule,meals:mealsOut};
}
async function mapLimit(items,fn,limit=6){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}
async function enrichItem(location,item){
  if(!item.recipeId)return item;
  const safe=async(path)=>{try{return await hs(location,path,{params:{recipeId:item.recipeId}})}catch{return null;}};
  const [nutrients,nutrition,allergenData,ingredientData,recipe]=await Promise.all([
    safe('nutrients/getBaseNutrientsForRecipe'),safe('nutrients/getNutritionFactsGeneralInformation'),safe('allergen/getAllergenNestedDescription'),safe('ingredient/getIngredientNestedDescription'),safe('recipes/RecipeDetails')
  ]);
  const protein=nutrientValue(nutrients,'protein'),serving=servingFrom(nutrition)||servingFrom(recipe),allergens=allergensFrom(allergenData);
  let description=item.description;const ingredientText=typeof ingredientData==='string'?clean(ingredientData):'';if(!description&&ingredientText)description=ingredientText;
  return {...item,protein:Number.isFinite(protein)?protein:null,serving,allergens,description};
}
function losAngelesToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export async function getAvailableDates(){const today=losAngelesToday(),base=new Date(`${today}T12:00:00Z`);return Array.from({length:7},(_,i)=>{const d=new Date(base);d.setUTCDate(base.getUTCDate()+i);return d.toISOString().slice(0,10);});}
export async function getDashboard(date){
  if(!validDate(date))throw new Error('Choose a valid UCSF menu date.');const dates=await getAvailableDates();if(!dates.includes(date))throw new Error('UCSF menus are available through the current seven day planning window.');
  const locations=await mapLimit(UCSF_LOCATIONS,async location=>{try{return await locationDay(location,date)}catch(error){return {id:location.id,name:location.name,sourceName:location.sourceName,kind:location.kind,status:'unavailable',message:error.message,source:UCSF_MENU_URL,schedule:publishedSchedule(location.id,date),meals:[]};}},3);
  return {date,locations,availableDates:dates,fetchedAt:new Date().toISOString()};
}
export async function getMenu(date,locationId,requestedMeal){
  if(!validDate(date))throw new Error('Choose a valid UCSF menu date.');const location=UCSF_LOCATIONS.find(entry=>entry.id===locationId);if(!location)throw new Error(`Unknown UCSF dining location: ${locationId}`);
  const day=await locationDay(location,date),meal=day.meals.find(entry=>entry.name.toLowerCase()===String(requestedMeal||'').toLowerCase());if(!meal)throw new Error(`No ${requestedMeal} menu is posted for ${location.name} on ${date}.`);
  const items=await mapLimit(meal.items,item=>enrichItem(location,item),8);
  return {campusId:'ucsf',adapter:'ucsf-meal-choice-connect',date,id:location.id,name:location.name,kind:location.kind,source:day.source,schedule:day.schedule,meal:meal.name,items,fetchedAt:new Date().toISOString()};
}
