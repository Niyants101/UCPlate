import https from 'node:https';

export const UCSB_FOOD_FACTS_URL='https://nutrition.info.dining.ucsb.edu/NetNutrition/1';
export const UCSB_MENU_URL='https://apps.dining.ucsb.edu/menu/day';
const UA='UCPlate/0.1 (+https://ucplate.com)';
const MAX_HTML=3_000_000;
const cache=new Map();
const TTL=10*60*1000;

export const UCSB_LOCATIONS=[
  {id:'ucsb-carrillo',name:'Carrillo Dining Commons',kind:'dining-hall',needle:'carrillo',menuSlug:'carrillo'},
  {id:'ucsb-de-la-guerra',name:'De La Guerra Dining Commons',kind:'dining-hall',needle:'de la guerra',menuSlug:'de-la-guerra'},
  {id:'ucsb-portola',name:'Portola Dining Commons',kind:'dining-hall',needle:'portola',menuSlug:'portola'},
  {id:'ucsb-ortega',name:'Takeout at Ortega Commons',kind:'restaurant',needle:'ortega',menuSlug:'ortega'}
];

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d;
}
function escapeRegex(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function decodeEntities(value=''){
  const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return String(value)
    .replace(/&([a-z]+);/gi,(m,key)=>named[key.toLowerCase()]??m)
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
}
export function text(html=''){
  return decodeEntities(String(html).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
}
function attr(fragment,key){return String(fragment).match(new RegExp(`\\b${escapeRegex(key)}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]||'';}
function normalize(value){return text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function cleanFoodName(value=''){
  return text(value)
    .replace(/\s*\(w\s*\/\s*nuts?\)\s*/ig,' ')
    .replace(/\s*\(vgn\)\s*/ig,' ')
    .replace(/\s*\(v\)\s*/ig,' ')
    .replace(/\s+/g,' ').trim();
}
function itemMeta(raw=''){
  const value=text(raw),lower=value.toLowerCase();
  return {
    name:cleanFoodName(value),
    diet:/\(vgn\)/i.test(value)?'vegan':/\(v\)/i.test(value)?'vegetarian':'unknown',
    allergens:/\(w\s*\/\s*nuts?\)/i.test(value)?['Nuts']:[],
    sourceName:value,
    lower
  };
}
function normalizeAllergen(value){
  const key=normalize(value);
  if(!key)return null;
  if(key==='milk'||key==='dairy')return 'Milk';
  if(key==='egg'||key==='eggs')return 'Egg';
  if(key==='soy'||key==='soybean'||key==='soybeans')return 'Soy';
  if(key==='peanut'||key==='peanuts')return 'Peanuts';
  if(key.includes('tree nut'))return 'Tree Nuts';
  if(key==='wheat'||key.includes('gluten'))return 'Wheat';
  if(key==='fish')return 'Fish';
  if(key.includes('shellfish')||key.includes('crustacean'))return 'Shellfish';
  if(key==='sesame')return 'Sesame';
  return text(value);
}

class NetNutritionSession{
  constructor(){this.cookies=new Map();this.initialized=false;}
  absorbCookies(values=[]){
    for(const entry of values||[]){
      const pair=String(entry).split(';',1)[0],i=pair.indexOf('=');
      if(i>0)this.cookies.set(pair.slice(0,i).trim(),pair.slice(i+1).trim());
    }
  }
  cookieHeader(){return [...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');}
  async request(method,endpoint='',form=null,redirects=0){
    if(redirects>8)throw new Error('UCSB Food Facts redirected too many times.');
    const base=`${UCSB_FOOD_FACTS_URL.replace(/\/$/,'')}/`;
    const url=new URL(endpoint||'',base);
    if(url.hostname!=='nutrition.info.dining.ucsb.edu'||!url.pathname.startsWith('/NetNutrition/1'))throw new Error('Unexpected UCSB Food Facts source.');
    const body=form?new URLSearchParams(form).toString():null;
    const headers={
      'User-Agent':UA,
      'Accept':'text/html,application/json;q=0.9,*/*;q=0.8',
      'Referer':UCSB_FOOD_FACTS_URL,
      ...(this.cookieHeader()?{'Cookie':this.cookieHeader()}:{})
    };
    if(body){headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';headers['Content-Length']=Buffer.byteLength(body);headers['X-Requested-With']='XMLHttpRequest';}
    return await new Promise((resolve,reject)=>{
      const req=https.request(url,{method,headers},res=>{
        this.absorbCookies(res.headers['set-cookie']);
        const chunks=[];let size=0;
        res.on('data',chunk=>{size+=chunk.length;if(size>MAX_HTML){req.destroy(new Error('UCSB Food Facts returned an unexpectedly large response.'));return;}chunks.push(chunk);});
        res.on('end',async()=>{
          const raw=Buffer.concat(chunks).toString('utf8');
          if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
            try{
              const next=new URL(res.headers.location,url);
              const followMethod=(res.statusCode===303||((res.statusCode===301||res.statusCode===302)&&method==='POST'))?'GET':method;
              resolve(await this.request(followMethod,next.href,null,redirects+1));
            }catch(error){reject(error);}return;
          }
          if((res.statusCode||500)>=400){reject(new Error(`UCSB Food Facts returned HTTP ${res.statusCode}.`));return;}
          resolve(raw);
        });
      });
      req.setTimeout(30000,()=>req.destroy(new Error('UCSB Food Facts timed out.')));
      req.on('error',reject);if(body)req.write(body);req.end();
    });
  }
  async init(){if(!this.initialized){await this.request('GET','');this.initialized=true;}return this;}
  async panels(endpoint,form){
    await this.init();
    const raw=await this.request('POST',endpoint,form);
    let result;try{result=JSON.parse(raw);}catch{throw new Error('UCSB Food Facts returned a page instead of menu data.');}
    if(result?.success!==true||!Array.isArray(result?.panels))throw new Error('UCSB Food Facts could not load that selection.');
    return Object.fromEntries(result.panels.map(panel=>[panel.id,panel.html||'']));
  }
  async select(rootId,childId){
    let panels=await this.panels('/Unit/SelectUnitFromUnitsList',{unitOid:String(rootId)});
    if(String(childId)!==String(rootId))panels=await this.panels('/Unit/SelectUnitFromChildUnitsList',{unitOid:String(childId)});
    return panels;
  }
}

async function cached(key,task){
  const old=cache.get(key);if(old&&Date.now()-old.time<TTL)return old.value;
  const value=await task();cache.set(key,{time:Date.now(),value});if(cache.size>1600)cache.delete(cache.keys().next().value);return value;
}
async function mapLimit(items,fn,limit=4){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i],i);}}));return result;}

export function parseUnits(html='',functionName='unitsSelectUnit'){
  const units=[];
  for(const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const onclick=attr(match[1],'onclick'),id=onclick.match(new RegExp(`\\b${escapeRegex(functionName)}\\((\\d+)\\)`,'i'))?.[1];
    const name=text(match[2]);if(id&&name)units.push({id:Number(id),name});
  }
  return units;
}
function dateFromLabel(label=''){
  const parsed=new Date(text(label));if(Number.isNaN(parsed.getTime()))return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
}
export function parseMenuOptions(html=''){
  const headers=[...String(html).matchAll(/<header\b[^>]*>([\s\S]*?)<\/header>/gi)];
  const menus=[];
  for(let i=0;i<headers.length;i++){
    const date=dateFromLabel(headers[i][1]);if(!date)continue;
    const segment=String(html).slice(headers[i].index,headers[i+1]?.index||String(html).length);
    for(const link of segment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
      const menuId=attr(link[1],'onclick').match(/menuListSelectMenu\((\d+)\)/i)?.[1],meal=text(link[2]);
      if(menuId&&meal)menus.push({id:Number(menuId),meal,date});
    }
  }
  return menus;
}
export function parseItems(html=''){
  const rows=[...String(html).matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)];
  const items=[];let category='Menu';
  for(const row of rows){
    const classes=attr(row[1],'class');
    if(/cbo_nn_itemGroupRow/i.test(classes)){
      const button=row[2].match(/<div\b[^>]*role=["']button["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
      if(button)category=text(button).replace(/[▾▸]+$/g,'').trim()||category;
      continue;
    }
    const link=row[2].match(/<a\b([^>]*)id=["']showNutrition_(\d+)["'][^>]*>([\s\S]*?)<\/a>/i);if(!link)continue;
    const cells=[...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>text(cell[1]));
    const meta=itemMeta(link[3]);
    items.push({id:Number(link[2]),name:meta.name,sourceName:meta.sourceName,section:category,category,diet:meta.diet,allergens:meta.allergens,serving:cells[2]||''});
  }
  return items;
}
function classText(html,className){
  const tagPattern=/<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for(const match of String(html).matchAll(tagPattern)){
    if(attr(match[2],'class').split(/\s+/).includes(className))return text(match[3]);
  }
  return '';
}
function numericToken(value){
  const raw=String(value||'').trim();if(/^</.test(raw))return null;
  const match=raw.replace(/,/g,'').match(/\d+(?:\.\d+)?/);return match?Number(match[0]):null;
}
export function parseLabel(html='',expectedName=''){
  const labelName=classText(html,'cbo_nn_LabelHeader');
  if(expectedName&&labelName&&normalize(cleanFoodName(labelName))!==normalize(cleanFoodName(expectedName)))throw new Error('Nutrition label did not match the UCSB food.');
  const plain=text(html);
  const serving=plain.match(/Serving Size\s+(.+?)\s+Amount Per Serving/i)?.[1]||plain.match(/Serving Size\s+(.+?)\s+Calories/i)?.[1]||'';
  const calories=numericToken(plain.match(/\bCalories\s+(<?\s*\d+(?:\.\d+)?)/i)?.[1]);
  const protein=numericToken(plain.match(/\bProtein\s+(<?\s*\d+(?:\.\d+)?)\s*g/i)?.[1]);
  const allergenText=classText(html,'cbo_nn_LabelAllergens');
  const allergens=[...new Set(allergenText.split(/[,;/]/).map(normalizeAllergen).filter(Boolean))];
  return {calories,protein,serving,diet:'unknown',allergens};
}

export function publishedSchedule(locationId,date){
  if(!validDate(date))return [];
  const day=new Date(`${date}T12:00:00Z`).getUTCDay(),weekend=day===0||day===6;
  if(locationId==='ucsb-ortega')return weekend?[]:[{name:'Lunch',start:'10:00',end:'15:00'},{name:'Dinner',start:'15:00',end:'20:00'}];
  if(['ucsb-carrillo','ucsb-de-la-guerra','ucsb-portola'].includes(locationId)){
    return weekend
      ?[{name:'Brunch',start:'10:00',end:'14:00'},{name:'Dinner',start:'17:00',end:'20:30'}]
      :[{name:'Breakfast',start:'07:15',end:'10:00'},{name:'Lunch',start:'11:00',end:'15:00'},{name:'Dinner',start:'17:00',end:'20:30'}];
  }
  return [];
}

export async function getCatalog(){
  return cached('catalog',async()=>{
    const client=await new NetNutritionSession().init();
    const roots=parseUnits(await client.request('GET',''),'unitsSelectUnit');
    const halls=[];
    for(const root of roots){
      try{
        const panels=await client.select(root.id,root.id),sections=parseUnits(panels.childUnitsPanel||'','childUnitsSelectUnit');
        halls.push({...root,sections:sections.length?sections:[{id:root.id,name:'Menu'}]});
      }catch{halls.push({...root,sections:[{id:root.id,name:'Menu'}]});}
    }
    if(!halls.length)throw new Error('UCSB Food Facts dining locations could not be read.');
    return halls;
  });
}
async function resolvedLocations(){
  return cached('resolved-locations',async()=>{
    const halls=await getCatalog();
    return UCSB_LOCATIONS.map(location=>{
      const root=halls.find(hall=>normalize(hall.name).includes(location.needle));
      if(!root)return {...location,status:'unavailable',message:'This UCSB dining location was not found in Food Facts.'};
      const section=root.sections.find(entry=>/daily\s+menu/i.test(entry.name))||root.sections.find(entry=>/menu/i.test(entry.name))||root.sections[0]||{id:root.id,name:'Menu'};
      return {...location,rootId:root.id,childId:section.id,sectionName:section.name,status:'live'};
    });
  });
}
async function optionsFor(location){
  return cached(`options:${location.rootId}:${location.childId}`,async()=>{
    const client=await new NetNutritionSession().init(),panels=await client.select(location.rootId,location.childId);
    return parseMenuOptions(panels.menuPanel||'');
  });
}
export async function getAvailableDates(){
  const locations=await resolvedLocations(),sets=await mapLimit(locations.filter(x=>x.rootId),async location=>(await optionsFor(location)).map(x=>x.date),3);
  return [...new Set(sets.flat())].filter(validDate).sort();
}
async function loadMeal(location,choice,{nutrition=false}={}){
  const client=await new NetNutritionSession().init();
  let panels=await client.select(location.rootId,location.childId);
  panels=await client.panels('/Menu/SelectMenu',{menuOid:String(choice.id)});
  const parsed=parseItems(panels.itemPanel||'');
  const base=parsed.map(item=>({...item,date:choice.date,hallId:location.id,period:choice.meal.toLowerCase(),calories:null,protein:null,source:UCSB_FOOD_FACTS_URL,nutritionSource:UCSB_FOOD_FACTS_URL,nutritionStatus:'unavailable'}));
  if(!nutrition||!base.length)return {name:choice.meal,items:base};
  const chunks=Array.from({length:Math.min(4,base.length)},()=>[]);base.forEach((item,index)=>chunks[index%chunks.length].push(item));
  await Promise.all(chunks.map(async chunk=>{
    const worker=await new NetNutritionSession().init();
    await worker.select(location.rootId,location.childId);
    await worker.panels('/Menu/SelectMenu',{menuOid:String(choice.id)});
    for(const item of chunk){
      try{
        const raw=await worker.request('POST','/NutritionDetail/ShowItemNutritionLabel',{detailOid:String(item.id)}),label=parseLabel(raw,item.name);
        item.calories=label.calories;item.protein=label.protein;item.serving=label.serving||item.serving;
        item.allergens=[...new Set([...(item.allergens||[]),...(label.allergens||[])])];
        item.nutritionStatus=Number.isFinite(label.calories)&&Number.isFinite(label.protein)?'available':'unavailable';
      }catch{}
    }
  }));
  return {name:choice.meal,items:base};
}
async function locationDay(location,date,{nutrition=false}={}){
  if(!location.rootId)return {...location,source:UCSB_FOOD_FACTS_URL,schedule:publishedSchedule(location.id,date),meals:[],status:'unavailable'};
  try{
    const choices=(await optionsFor(location)).filter(choice=>choice.date===date);
    if(!choices.length)return {...location,source:UCSB_FOOD_FACTS_URL,schedule:publishedSchedule(location.id,date),meals:[],status:'empty',message:'No menu is published for this UCSB location and date.'};
    const meals=[];
    for(const choice of choices)meals.push(await loadMeal(location,choice,{nutrition}));
    return {...location,source:UCSB_FOOD_FACTS_URL,schedule:publishedSchedule(location.id,date),meals,status:'live',message:'Menu posted by UC Santa Barbara Campus Dining.'};
  }catch(error){
    return {...location,source:UCSB_FOOD_FACTS_URL,schedule:publishedSchedule(location.id,date),meals:[],status:'unavailable',message:error.message};
  }
}
export async function getDashboard(date){
  if(!validDate(date))throw new Error('Choose a valid UC Santa Barbara menu date.');
  const locations=await resolvedLocations(),rows=await mapLimit(locations,location=>locationDay(location,date),3);
  const availableDates=await getAvailableDates();
  return {date,locations:rows,availableDates,fetchedAt:new Date().toISOString()};
}
export async function getMenu(date,locationId,requestedMeal){
  if(!validDate(date))throw new Error('Choose a valid UC Santa Barbara menu date.');
  const location=(await resolvedLocations()).find(entry=>entry.id===locationId);if(!location)throw new Error(`Unknown UC Santa Barbara dining location: ${locationId}`);
  if(!location.rootId)return {status:'unavailable',date,locationId,locationName:location.name,meals:[],items:[],source:UCSB_FOOD_FACTS_URL,message:location.message};
  const choices=(await optionsFor(location)).filter(choice=>choice.date===date),choice=choices.find(entry=>entry.meal.toLowerCase()===String(requestedMeal||'').toLowerCase())||(!requestedMeal?choices[0]:null);
  if(!choice)return {status:'empty',date,locationId,locationName:location.name,meals:choices.map(entry=>entry.meal),items:[],source:UCSB_FOOD_FACTS_URL,message:'This meal is not published for this location and date.'};
  const meal=await loadMeal(location,choice,{nutrition:true}),missing=meal.items.filter(item=>item.nutritionStatus!=='available').length;
  return {status:missing===0?'live':meal.items.some(item=>item.nutritionStatus==='available')?'partial':'unavailable',date,locationId,locationName:location.name,meal:meal.name,meals:choices.map(entry=>entry.meal),items:meal.items,source:UCSB_FOOD_FACTS_URL,schedule:publishedSchedule(location.id,date),message:missing?`${missing} item(s) have no readable UCSB nutrition label. Missing values are shown as unavailable.`:'Menu and nutrition from UCSB Campus Dining Food Facts.'};
}
