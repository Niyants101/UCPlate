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
const finiteNutrition=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
const UCSF_OFFICIAL_PAGES={
  'ucsf-parnassus':'https://nutrition.ucsf.edu/parnassus-heights',
  'ucsf-mission-bay':'https://nutrition.ucsf.edu/mission-bay',
  'ucsf-mount-zion':'https://nutrition.ucsf.edu/mount-zion'
};
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

function ensureUcsfDialogStyles(){
  if(document.getElementById('ucsf-api-detail-styles'))return;
  const style=document.createElement('style');style.id='ucsf-api-detail-styles';style.textContent=`
    .ucsf-api-food{appearance:none;border:0;background:none;padding:0;color:var(--text);font:inherit;font-weight:650;text-align:left;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(183,236,114,.35);text-underline-offset:3px}
    .ucsf-api-food:hover{color:var(--accent);background:none;border:0}
    .ucsf-api-dialog{width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--line-strong);border-radius:18px;background:#0d1510;color:var(--text);padding:0;box-shadow:0 28px 90px rgba(0,0,0,.62)}
    .ucsf-api-dialog::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(4px)}
    .ucsf-api-dialog-inner{padding:24px}
    .ucsf-api-dialog-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
    .ucsf-api-dialog-head h3{font-size:25px;line-height:1.15;margin:4px 0 0}
    .ucsf-api-kicker{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mint);font-weight:850}
    .ucsf-api-close{flex:0 0 auto;padding:7px 10px}
    .ucsf-api-description{color:#cbd5cd;line-height:1.6;margin:18px 0}
    .ucsf-api-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0}
    .ucsf-api-fact{padding:12px;border:1px solid var(--line);border-radius:11px;background:#0a100c}
    .ucsf-api-fact span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
    .ucsf-api-fact strong{font-size:15px}
    .ucsf-api-allergens{padding:13px 14px;border:1px solid var(--line);border-radius:11px;background:#0a100c;line-height:1.55;color:#d8e0da}
    .ucsf-api-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:20px}
    .ucsf-api-actions a{display:inline-flex;padding:10px 13px;border-radius:9px;border:1px solid var(--line-strong);text-decoration:none;font-size:12px;font-weight:750}
    .ucsf-api-note{margin:14px 0 0;color:var(--muted);font-size:11px;line-height:1.55}
    @media(max-width:520px){.ucsf-api-facts{grid-template-columns:1fr}.ucsf-api-dialog-inner{padding:18px}}
  `;document.head.append(style);
}

function ucsfFact(label,value){
  if(value===null||value===undefined||value==='')return null;
  const box=document.createElement('div');box.className='ucsf-api-fact';
  const key=document.createElement('span');key.textContent=label;
  const val=document.createElement('strong');val.textContent=String(value);
  box.append(key,val);return box;
}

function openUcsfApiDetail(item,location){
  ensureUcsfDialogStyles();
  let dialog=document.getElementById('ucsf-api-detail-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='ucsf-api-detail-dialog';dialog.className='ucsf-api-dialog';document.body.append(dialog);}
  dialog.replaceChildren();
  const inner=document.createElement('div');inner.className='ucsf-api-dialog-inner';
  const head=document.createElement('div');head.className='ucsf-api-dialog-head';
  const titleWrap=document.createElement('div'),kicker=document.createElement('div');kicker.className='ucsf-api-kicker';kicker.textContent='Official UCSF Meal Choice data';
  const title=document.createElement('h3');title.textContent=item?.name||'Food details';titleWrap.append(kicker,title);
  const close=document.createElement('button');close.type='button';close.className='ucsf-api-close';close.textContent='Close';close.onclick=()=>dialog.close();head.append(titleWrap,close);inner.append(head);

  if(item?.description){const description=document.createElement('p');description.className='ucsf-api-description';description.textContent=item.description;inner.append(description);}
  const facts=document.createElement('div');facts.className='ucsf-api-facts';
  const calorie=Number.isFinite(Number(item?.calories))?`${Math.round(Number(item.calories))} kcal`:null;
  const protein=Number.isFinite(Number(item?.protein))?`${Math.round(Number(item.protein))} g`:null;
  const diet=item?.diet==='vegan'?'Vegan':item?.diet==='vegetarian'?'Vegetarian':null;
  for(const fact of [ucsfFact('Station',item?.section),ucsfFact('Serving',item?.serving),ucsfFact('Calories',calorie),ucsfFact('Protein',protein),ucsfFact('Diet',diet),ucsfFact('Recipe ID',item?.recipeId)])if(fact)facts.append(fact);
  if(facts.children.length)inner.append(facts);

  const allergens=(item?.allergens||[]).filter(value=>value&&!/no information|not assigned|none assigned/i.test(String(value)));
  const allergenBox=document.createElement('div');allergenBox.className='ucsf-api-allergens';allergenBox.textContent=allergens.length?`Published allergens: ${allergens.join(', ')}`:'No specific allergen list was returned by UCSF for this item.';inner.append(allergenBox);

  const actions=document.createElement('div');actions.className='ucsf-api-actions';
  const official=validSource(UCSF_OFFICIAL_PAGES[location?.id])||validSource(location?.source);
  if(official){const link=document.createElement('a');link.href=official;link.target='_blank';link.rel='noreferrer';link.textContent='Open official UCSF dining page ↗';actions.append(link);}
  const portal=document.createElement('a');portal.href='https://webmenus.ucsfmedicalcenter.org/';portal.target='_blank';portal.rel='noreferrer';portal.textContent='Open UCSF Meal Choice ↗';actions.append(portal);inner.append(actions);
  const note=document.createElement('p');note.className='ucsf-api-note';note.textContent='These details are read from UCSF Meal Choice Connect through its Hospitality Suite API. UCPlate does not estimate missing nutrition values.';inner.append(note);
  dialog.append(inner);dialog.showModal();
}

function makeUcsfApiFood(node,item,location){
  if(!node||!item)return;
  const button=document.createElement('button');button.type='button';button.className=`${node.className} ucsf-api-food`;button.textContent=node.textContent;button.title='View the UCSF API nutrition record for this food';button.onclick=()=>openUcsfApiDetail(item,location);node.replaceWith(button);
}

async function enhanceFoodSources(){
  if(!campusId||campusId==='ucsc')return;
  const context=await sourceContext();if(!context)return;
  const fallback=validSource(context.location.source);
  for(const row of document.querySelectorAll('#menuItems .static-food-row')){
    const node=row.querySelector('.static-food-name');if(!node)continue;
    const item=context.byName.get(clean(node.textContent));
    const meta=row.querySelector('.food-meta');
    if(campusId==='ucsf'&&item){
      makeUcsfApiFood(node,item,context.location);
      if(meta&&!meta.querySelector('.official-source-inline')){const tag=document.createElement('span');tag.className='official-source-inline';tag.textContent='UCSF API details';meta.append(tag);}
      continue;
    }
    const exact=validSource(item?.nutritionSource)||validSource(item?.source);
    const href=exact||fallback;
    makeOfficialLink(node,href,Boolean(exact&&exact!==fallback));
    if(meta&&href&&!meta.querySelector('.official-source-inline')){
      const tag=document.createElement('span');tag.className='official-source-inline';tag.textContent=exact&&exact!==fallback?'Official nutrition ↗':'Official menu ↗';meta.append(tag);
    }
  }
  for(const row of document.querySelectorAll('#bulkPlan .plate-part')){
    const node=row.querySelector('.plate-food-name');if(!node)continue;
    const item=context.byName.get(clean(node.textContent));
    if(campusId==='ucsf'&&item){makeUcsfApiFood(node,item,context.location);continue;}
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
    if(small&&location.bulk?.status!=='live')small.textContent=campusId==='ucsf'?'Official UCSF nutrition details available':'Full official menu available';
  }
}

async function enhancePlannerStatus(){
  if(campusId!=='ucm')return;
  const context=await sourceContext();if(!context?.meal)return;
  const items=context.meal.items||[];
  if(items.some(item=>finiteNutrition(item.calories)&&finiteNutrition(item.protein)))return;
  const subtitle=document.getElementById('bulkSubtitle');
  if(subtitle&&/still being indexed|pulling the posted nutrition labels/i.test(subtitle.textContent||'')){
    const date=document.getElementById('menuDate')?.value||'';
    subtitle.textContent=`The UC Merced menu is published${date?` for ${date}`:''}, but its current BigZpoon data does not include enough protein values for protein-targeted plates.`;
  }
  const empty=document.querySelector('#bulkPlan .menu-empty');
  if(empty&&/next menu refresh|nutrition labels|personalized plates/i.test(empty.textContent||'')){
    empty.textContent='UCPlate will not estimate missing protein. The full official menu is available below, and personalized plates will appear when the published data includes the nutrition values required for your target.';
  }
}

function scheduleSourceEnhance(){
  clearTimeout(sourceEnhanceTimer);
  sourceEnhanceTimer=setTimeout(()=>Promise.all([enhanceFoodSources(),enhanceOverviewLabels(),enhancePlannerStatus()]).catch(()=>{}),40);
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
