import {campusById,effectiveCampusId,campusHasLiveMenus,campusDataRoot} from './campuses.mjs';

const PREF='college-bulk-pages-v2';
let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

let campusId=effectiveCampusId(prefs);
if(!prefs.campusId&&campusId&&prefs.onboardingComplete){
  prefs={...prefs,campusId};
  localStorage.setItem(PREF,JSON.stringify(prefs));
}

const campus=campusById(campusId);
for(const node of document.querySelectorAll('[data-campus-label]'))node.textContent=campus?.name||'Choose campus';
for(const node of document.querySelectorAll('[data-campus-short]'))node.textContent=campus?.shortName||'UC campus';

if(document.documentElement.dataset.requiresLiveCampus==='true'&&prefs.onboardingComplete&&campus&&!campusHasLiveMenus(campus.id)){
  const target=new URL('./campus.html',location.href);
  target.searchParams.set('campus',campus.id);
  location.replace(target.href);
}

const validSource=value=>typeof value==='string'&&/^https?:\/\//i.test(value)?value:null;
const clean=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
let sourceEnhanceTimer=null;
let sourceEnhanceKey='';
let sourceEnhanceData=null;
let dayEnhanceKey='';
let dayEnhanceData=null;

async function dayContext(){
  const date=document.getElementById('menuDate')?.value;
  const root=campusDataRoot(campusId);
  if(!date||!root)return null;
  const key=`${campusId}:${date}`;
  if(key===dayEnhanceKey&&dayEnhanceData)return dayEnhanceData;
  const response=await fetch(`${root}/dates/${date}.json`);
  if(!response.ok)return null;
  dayEnhanceKey=key;dayEnhanceData=await response.json();return dayEnhanceData;
}

async function sourceContext(){
  const hall=document.getElementById('hall')?.value;
  const meal=document.getElementById('menuMeal')?.value;
  const day=await dayContext();
  if(!hall||!meal||!day)return null;
  const key=`${dayEnhanceKey}:${hall}:${meal}`;
  if(key===sourceEnhanceKey&&sourceEnhanceData)return sourceEnhanceData;
  const location=day.locations?.find(entry=>entry.id===hall);
  if(!location)return null;
  let sourceLocation=location;
  if(location.detailPath){
    try{
      const detailResponse=await fetch(location.detailPath);
      if(detailResponse.ok)sourceLocation={...location,...await detailResponse.json()};
    }catch{}
  }
  const selected=sourceLocation.meals?.find(entry=>entry.name===meal)||sourceLocation.meals?.[0];
  const byName=new Map();
  for(const item of selected?.items||[]){
    const keyName=clean(item.name);if(keyName&&!byName.has(keyName))byName.set(keyName,item);
  }
  sourceEnhanceKey=key;
  sourceEnhanceData={location:sourceLocation,meal:selected,byName};
  return sourceEnhanceData;
}

function makeOfficialLink(node,href,exact){
  if(!node||!href)return node;
  if(node.tagName==='A'){
    node.href=href;node.target='_blank';node.rel='noreferrer';
    node.title=exact?'Open the campus-published nutrition source for this food':'Open the official campus menu containing this food';
    return node;
  }
  const link=document.createElement('a');
  link.className=node.className;link.textContent=node.textContent;link.href=href;link.target='_blank';link.rel='noreferrer';
  link.title=exact?'Open the campus-published nutrition source for this food':'Open the official campus menu containing this food';
  node.replaceWith(link);return link;
}

async function enhanceFoodSources(){
  if(!campusId||campusId==='ucsc')return;
  const context=await sourceContext();if(!context)return;
  const fallback=validSource(context.location.source);
  for(const row of document.querySelectorAll('#menuItems .static-food-row')){
    const node=row.querySelector('.static-food-name');if(!node)continue;
    const item=context.byName.get(clean(node.textContent));
    const exact=validSource(item?.nutritionSource)||validSource(item?.source);
    const href=exact||fallback;
    makeOfficialLink(node,href,Boolean(exact&&exact!==fallback));
    const meta=row.querySelector('.food-meta');
    if(meta&&href&&!meta.querySelector('.official-source-inline')){
      const tag=document.createElement('span');tag.className='official-source-inline';tag.textContent=exact&&exact!==fallback?'Official nutrition ↗':'Official menu ↗';meta.append(tag);
    }
  }
  for(const row of document.querySelectorAll('#bulkPlan .plate-part')){
    const node=row.querySelector('.plate-food-name');if(!node)continue;
    const item=context.byName.get(clean(node.textContent));
    const exact=validSource(item?.nutritionSource)||validSource(item?.source);
    makeOfficialLink(node,exact||fallback,Boolean(exact&&exact!==fallback));
  }
}

async function enhanceOverviewLabels(){
  if(!campusId||campusId==='ucsc')return;
  const day=await dayContext();if(!day)return;
  for(const card of document.querySelectorAll('#diningOverview .dining-card')){
    const name=clean(card.querySelector('.card-top strong')?.textContent);
    const location=day.locations?.find(entry=>clean(entry.name)===name);
    if(!location?.detailPath)continue;
    const small=[...card.querySelectorAll('small')].find(node=>node.textContent==='Personalized plates available');
    if(small&&location.bulk?.status!=='live')small.textContent='Full official menu available';
  }
}

function scheduleSourceEnhance(){
  clearTimeout(sourceEnhanceTimer);
  sourceEnhanceTimer=setTimeout(()=>Promise.all([enhanceFoodSources(),enhanceOverviewLabels()]).catch(()=>{}),40);
}

const roots=[document.getElementById('menuItems'),document.getElementById('bulkPlan'),document.getElementById('diningOverview')].filter(Boolean);
if(roots.length){
  const observer=new MutationObserver(scheduleSourceEnhance);
  for(const root of roots)observer.observe(root,{childList:true,subtree:true});
  for(const id of ['menuDate','hall','menuMeal'])document.getElementById(id)?.addEventListener('change',()=>{
    sourceEnhanceKey='';sourceEnhanceData=null;
    if(id==='menuDate'){dayEnhanceKey='';dayEnhanceData=null;}
    scheduleSourceEnhance();
  });
  scheduleSourceEnhance();
}
