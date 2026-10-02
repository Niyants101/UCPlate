import https from 'node:https';
import tls from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validDate} from './planner.mjs';

export const HALLS=[
  {id:'40',name:'College Nine / John R. Lewis',sourceName:'John R. Lewis & College Nine Dining Hall'},
  {id:'05',name:'Cowell / Stevenson',sourceName:'Cowell & Stevenson Dining Hall'},
  {id:'20',name:'Crown / Merrill',sourceName:'Crown & Merrill Dining Hall'},
  {id:'25',name:'Porter / Kresge',sourceName:'Porter & Kresge Dining Hall'},
  {id:'30',name:'Rachel Carson / Oakes',sourceName:'Rachel Carson & Oakes Dining Hall'}
];
const origin='https://nutrition.sa.ucsc.edu/';
// UCSC omits this intermediate from its TLS chain. Verify its signature against
// Node's trusted roots before supplying it; hostname and TLS verification stay on.
const intermediate=readFileSync(new URL('./incommon-intermediate.pem',import.meta.url),'utf8');
const cert=new X509Certificate(intermediate);
if(!tls.rootCertificates.some(p=>cert.verify(new X509Certificate(p).publicKey)))throw new Error('UCSC intermediate is not signed by a trusted root.');
const agent=new https.Agent({ca:[...tls.rootCertificates,intermediate],keepAlive:false,maxSockets:4});
const cache=new Map(),pending=new Map();
const TTL=10*60*1000;
async function cached(key,task){
  const old=cache.get(key);if(old&&Date.now()-old.time<TTL)return old.value;
  if(pending.has(key))return pending.get(key);
  const promise=task().then(value=>{cache.set(key,{time:Date.now(),value});if(cache.size>1500)cache.delete(cache.keys().next().value);return value;}).finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
function request(url,session){
  const u=new URL(url,origin);
  if(u.origin!==origin.slice(0,-1)||!['/','/shortmenu.aspx','/longmenu.aspx','/label.aspx'].includes(u.pathname))throw new Error('Unexpected menu source.');
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{agent,headers:{Cookie:session.cookie,'User-Agent':'CollegeBulkPlanner/0.2','Accept':'text/html'}},res=>{
      const cookies=res.headers['set-cookie'];if(cookies)session.cookie=cookies.map(s=>s.split(';')[0]).join('; ');
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>3000000)req.destroy(new Error('Menu response too large.'));});
      res.on('end',()=>{if(res.statusCode!==200||/Server Error in|Runtime Error/i.test(body))reject(new Error('UCSC could not serve this menu. Try another date or meal.'));else resolve(body);});
      res.on('error',reject);
    });req.setTimeout(15000,()=>req.destroy(new Error('UCSC timed out. Please retry.')));req.on('error',reject);
  });
}
export function text(html){return html.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();}
const attr=(html,key)=>html.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1];
function diet(html){return /LegendImages\/vegan\.gif/i.test(html)?'vegan':/LegendImages\/veggie\.gif/i.test(html)?'vegetarian':'unknown';}
export function parseShort(html,date){
  const title=text(html.match(/class=["']shortmenutitle["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const parsed=new Date(title.replace(/^Menus for\s*/i,''));
  if(Number.isNaN(parsed.getTime())||`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`!==date)throw new Error('UCSC returned a different date. No menu was substituted.');
  const tokens=[...html.matchAll(/<div\b[^>]*class=["'](shortmenumeals|shortmenucats|shortmenurecipes)["'][^>]*>([\s\S]*?)<\/div>/gi)];
  let meal,section;const meals=[];
  for(let i=0;i<tokens.length;i++){
    const m=tokens[i],name=text(m[2]);
    if(m[1]==='shortmenumeals'){meal={name,items:[]};meals.push(meal);section='';}
    if(m[1]==='shortmenucats')section=name.replace(/^--\s*|\s*--$/g,'');
    if(m[1]==='shortmenurecipes'&&meal){const fragment=html.slice(m.index,tokens[i+1]?.index||html.length);meal.items.push({name,section,diet:diet(fragment)});}
  }
  return meals;
}
export function parseLong(html){
  const matches=[...html.matchAll(/<div\b[^>]*class=["']longmenucoldispname["'][^>]*>([\s\S]*?)<\/div>/gi)];
  return matches.flatMap((m,i)=>{const a=m[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);if(!a)return [];
    const href=attr(a[1],'href');if(!href?.startsWith('label.aspx?'))return [];
    const fragment=html.slice(m.index,matches[i+1]?.index||html.length);
    return [{name:text(a[2]),source:new URL(href.replace(/&amp;/g,'&'),origin).href,serving:text(fragment.match(/class=["']longmenucolportions["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||''),diet:diet(fragment)}];
  });
}
export function parseLabel(html,expectedName){
  const name=text(html.match(/class=["']labelrecipe["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  if(name.toLowerCase()!==expectedName.toLowerCase())throw new Error('Nutrition label did not match the food.');
  const plain=text(html),read=(regex)=>{const m=plain.match(regex);return m?Number(m[1]):null;};
  const allergens=text(html.match(/class=["']labelallergensvalue["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||'').split(',').map(s=>s.trim()).filter(Boolean);
  return {calories:read(/\bCalories\s+(\d+(?:\.\d+)?)/i),protein:read(/\bProtein\s+(\d+(?:\.\d+)?)\s*g/i),serving:plain.match(/Serving Size\s+(.+?)\s+Calories/i)?.[1]||'',diet:diet(html),allergens,eggs:allergens.some(a=>/egg/i.test(a)),dairy:allergens.some(a=>/milk/i.test(a))};
}
export function sourceUrl(date,hallId,path='shortmenu.aspx',meal){
  if(!validDate(date))throw new Error('Choose a valid menu date.');
  const hall=HALLS.find(h=>h.id===hallId);if(!hall)throw new Error('Unknown dining hall.');
  const [y,m,d]=date.split('-');const url=new URL(path,origin);
  url.search=new URLSearchParams({sName:'UC Santa Cruz Dining',locationNum:hall.id,locationName:hall.sourceName,naFlag:'1',WeeksMenus:"UCSC - This Week's Menus",dtdate:`${Number(m)}/${d}/${y}`,...(meal?{mealName:meal}:{})});return url.href;
}
async function mapLimit(items,fn){let index=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(index<items.length){const i=index++;result[i]=await fn(items[i]);}}));return result;}
export async function getMenu(date,hallId='40',requestedMeal){
  const source=sourceUrl(date,hallId);
  const day=await cached(`day:${date}:${hallId}`,async()=>{const session={cookie:''};await request(origin,session);const html=await request(source,session);return {session,meals:parseShort(html,date),fetchedAt:new Date().toISOString()};});
  const meal=day.meals.find(m=>m.name.toLowerCase()===requestedMeal?.toLowerCase())||(!requestedMeal?day.meals[0]:null);
  if(!meal)return {status:'empty',date,hallId,halls:HALLS,meals:day.meals.map(m=>m.name),items:[],source,fetchedAt:day.fetchedAt,message:requestedMeal?'This meal is not published for this hall and date.':'No meal menu is published for this date.'};
  return cached(`meal:${date}:${hallId}:${meal.name}`,async()=>{
    const long=await request(sourceUrl(date,hallId,'longmenu.aspx',meal.name),day.session),entries=parseLong(long);
    const items=await mapLimit(meal.items,async(item)=>{
      const entry=entries.find(e=>e.name.toLowerCase()===item.name.toLowerCase());
      const base={...item,date,hallId,period:meal.name.toLowerCase(),calories:null,protein:null,serving:entry?.serving||'',source:entry?.source||source};
      if(!entry)return {...base,nutritionStatus:'unavailable'};
      try{const nutrition=await cached(`label:${date}:${entry.source}`,async()=>parseLabel(await request(entry.source,day.session),item.name));return {...base,...nutrition,nutritionStatus:nutrition.calories!==null&&nutrition.protein!==null?'available':'unavailable'};}catch{return {...base,nutritionStatus:'unavailable'};}
    });
    const missing=items.filter(i=>i.nutritionStatus!=='available').length;
    return {status:missing?'partial':'live',date,hallId,halls:HALLS,meals:day.meals.map(m=>m.name),meal:meal.name,items,source,fetchedAt:new Date().toISOString(),message:missing?`${missing} item(s) have no readable nutrition label. Missing values are shown as —.`:'Menu and nutrition from UCSC. Values are per listed serving.'};
  });
}

