import {getServingStatus} from './dining-hours.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const TZ='America/Los_Angeles';
const PREF='college-bulk-pages-v2';

let data=null;
let activeDate=null;
let selectedHall=null;
let selectedMeal=null;
let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

function campusParts(now=new Date()){
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...p,date:`${p.year}-${p.month}-${p.day}`};
}
const today=campusParts().date;

function dateLabel(date){
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00Z`));
}
function timeLabel(time){
  if(!time)return '';
  let [h,m]=time.split(':').map(Number);
  const suffix=h>=12?'PM':'AM';
  h=h%12||12;
  return `${h}${m?`:${String(m).padStart(2,'0')}`:''} ${suffix}`;
}
function clamp(value,min,max,fallback){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function bulkTargets(){
  return {
    calories:clamp($('bulkCalories')?.value,300,1800,850),
    protein:clamp($('bulkProtein')?.value,10,120,45)
  };
}
function savePrefs(){
  try{
    const targets=bulkTargets();
    localStorage.setItem(PREF,JSON.stringify({
      hall:selectedHall,
      vegetarian:$('vegetarianOnly')?.checked===true,
      sort:$('menuSort')?.value||'station',
      bulkCalories:targets.calories,
      bulkProtein:targets.protein
    }));
  }catch{}
}
function snapshotAge(){
  if(!data?.generatedAt)return '';
  const minutes=Math.max(0,Math.round((Date.now()-new Date(data.generatedAt).getTime())/60000));
  if(minutes<2)return 'Menu snapshot refreshed just now.';
  if(minutes<60)return `Menu snapshot refreshed ${minutes} minutes ago.`;
  const hours=Math.floor(minutes/60);
  return `Menu snapshot refreshed about ${hours} hour${hours===1?'':'s'} ago.`;
}
function updateClock(){
  const p=campusParts();
  $('campusClock').textContent=`${p.weekday.toUpperCase()} · ${new Intl.DateTimeFormat('en-US',{timeZone:TZ,month:'long',day:'numeric'}).format(new Date())} · ${Number(p.hour)%12||12}:${p.minute} ${Number(p.hour)>=12?'PM':'AM'}`;
  $('snapshotAge').textContent=snapshotAge();
  $('dateContext').textContent=activeDate===today?'RIGHT NOW':'BROWSING AHEAD';
}
function currentDay(){return data?.dates?.[activeDate]||null;}
function locationById(id){return currentDay()?.locations.find(x=>x.id===id)||null;}
function serving(location){return getServingStatus(activeDate,location.id,new Date());}
function rank(location){
  const state=serving(location).state;
  const stateRank={open:0,limited:1,unknown:2,scheduled:3,closed:4}[state]??5;
  return stateRank+(location.status==='live'?0:10);
}
function servingText(location){
  const s=serving(location);
  if(s.state==='open')return `${s.label} until ${timeLabel(s.end)}`;
  if(s.state==='limited')return `Continuous Dining until ${timeLabel(s.end)} · limited options`;
  if(s.state==='closed'){
    if(!s.next)return 'Closed on the regular schedule';
    const when=s.next.date===activeDate?'today':s.next.date===today?'today':'next';
    return `Closed · ${s.next.name} ${when} at ${timeLabel(s.next.start)}`;
  }
  if(s.state==='scheduled')return s.schedule?.length?`Regular schedule · ${s.schedule[0].name} starts ${timeLabel(s.schedule[0].start)}`:'Closed on regular schedule';
  return 'Menu posted · serving hours not built in';
}
function relevantMeal(location){
  if(!location.meals?.length)return null;
  const s=serving(location);
  if(s.state==='open'){
    const exact=location.meals.find(m=>m.name.toLowerCase()===s.label.toLowerCase());
    if(exact)return exact;
  }
  if(activeDate===today&&location.bulk?.meal){
    const bulk=location.meals.find(m=>m.name===location.bulk.meal);
    if(bulk)return bulk;
  }
  if(s.state==='limited'&&s.next){
    const next=location.meals.find(m=>m.name.toLowerCase()===s.next.name.toLowerCase());
    if(next)return next;
  }
  return location.meals[0];
}
function nutritionItems(location){
  return location?.bulk?.items?.filter(item=>
    item.calories!==null&&item.calories!==undefined&&
    item.protein!==null&&item.protein!==undefined&&
    Number.isFinite(Number(item.calories))&&Number(item.calories)>0&&
    Number.isFinite(Number(item.protein))&&Number(item.protein)>=0
  )||[];
}
function candidatePool(items,vegetarianOnly){
  let candidates=items.filter(item=>!vegetarianOnly||['vegan','vegetarian'].includes(item.diet));
  if(candidates.length<=34)return candidates;
  const unique=new Map();
  const take=(arr,n)=>arr.slice(0,n).forEach(item=>unique.set(item.name,item));
  take([...candidates].sort((a,b)=>(Number(b.protein)/Math.max(1,Number(b.calories)))-(Number(a.protein)/Math.max(1,Number(a.calories)))),16);
  take([...candidates].sort((a,b)=>Number(b.protein)-Number(a.protein)),10);
  take([...candidates].sort((a,b)=>Number(b.calories)-Number(a.calories)),8);
  return [...unique.values()];
}
function buildBulkPlan(location){
  const targets=bulkTargets();
  const vegetarianOnly=$('vegetarianOnly')?.checked===true;
  const candidates=candidatePool(nutritionItems(location),vegetarianOnly);
  if(!candidates.length)return null;

  const score=(state,final=false)=>{
    const calDiff=Math.abs(state.calories-targets.calories)/targets.calories;
    const proteinGap=Math.max(0,targets.protein-state.protein)/targets.protein;
    const calorieLow=Math.max(0,targets.calories*.6-state.calories)/targets.calories;
    const calorieHigh=Math.max(0,state.calories-targets.calories*1.25)/targets.calories;
    const repetition=[...state.qty.values()].reduce((sum,q)=>sum+Math.max(0,q-1),0);
    const proteinExcess=Math.max(0,state.protein-targets.protein*2)/targets.protein;
    return calDiff*1.45+proteinGap*4.2+calorieLow*2.1+calorieHigh*3.2+repetition*.08+proteinExcess*.12+(final?state.servings*.015:0);
  };

  let states=[{calories:0,protein:0,picks:[],qty:new Map(),servings:0}];
  for(let step=0;step<5;step++){
    const next=[...states];
    for(const state of states){
      for(const item of candidates){
        const oldQty=state.qty.get(item.name)||0;
        if(oldQty>=2)continue;
        const calories=state.calories+Number(item.calories);
        if(calories>targets.calories*1.6)continue;
        const qty=new Map(state.qty);qty.set(item.name,oldQty+1);
        const picks=oldQty
          ? state.picks.map(p=>p.item.name===item.name?{...p,quantity:p.quantity+1}:p)
          : [...state.picks,{item,quantity:1}];
        next.push({
          calories,
          protein:state.protein+Number(item.protein),
          picks,
          qty,
          servings:state.servings+1
        });
      }
    }
    states=next.sort((a,b)=>score(a)-score(b)).slice(0,180);
  }

  const viable=states.filter(state=>state.servings>0&&state.calories>=targets.calories*.42);
  if(!viable.length)return null;
  const best=viable.sort((a,b)=>score(a,true)-score(b,true))[0];
  return {...best,targets};
}
function bulkModeText(location){
  if(!location.bulk)return '';
  const state=serving(location).state;
  if(location.bulk.mode==='now'&&state==='open')return `Built for ${location.bulk.meal}, the meal being served now.`;
  if(state==='limited')return `Continuous Dining is limited right now. This plan is for ${location.bulk.meal}, not the limited selection.`;
  if(location.bulk.mode==='next')return `Built for ${location.bulk.meal}, the next useful posted meal for this location.`;
  return `Built from the posted ${location.bulk.meal} menu.`;
}
function nutritionLink(item){
  return typeof item?.source==='string'&&/nutrition\.sa\.ucsc\.edu\/label\.aspx/i.test(item.source)?item.source:null;
}
function renderBulkPlan(location){
  const root=$('bulkPlan');root.replaceChildren();
  const targets=bulkTargets();
  $('bulkTargetBadge').textContent=`${targets.calories} kcal · ${targets.protein} g protein`;
  $('bulkTitle').textContent=location?`Bulk at ${location.name}`:'Your bulk meal';

  if(!location){
    root.append(el('p','Choose a dining location to build a meal.','menu-empty'));
    return;
  }
  if(activeDate!==today){
    $('bulkSubtitle').textContent='Automatic macro plans are generated for today so the nutrition stays tied to the live menu.';
    const box=el('div','','bulk-empty');
    box.append(el('strong','Bulk planning is focused on today.'),el('p','Use the date controls to return to Today. Future menus are still available for browsing.'));
    root.append(box);
    return;
  }
  if(!location.bulk?.items?.length){
    $('bulkSubtitle').textContent='This location does not have enough readable UCSC nutrition data for an automatic plan yet.';
    root.append(el('p','The menu is still available below. The planner will not invent calories or protein when UCSC does not publish a readable label.','menu-empty'));
    return;
  }

  const plan=buildBulkPlan(location);
  $('bulkSubtitle').textContent=`${bulkModeText(location)} Click any planned food to open its exact UCSC nutrition label.`;
  if(!plan){
    root.append(el('p',$('vegetarianOnly').checked?'No vegetarian items with readable calories and protein can make a reliable plan for this meal.':'Not enough readable calories and protein are available to build a reliable plan.','menu-empty'));
    return;
  }

  const summary=el('div','','bulk-summary');
  const quality=plan.protein>=plan.targets.protein&&plan.calories>=plan.targets.calories*.72&&plan.calories<=plan.targets.calories*1.28
    ? 'Protein target hit'
    : 'Closest posted-menu match';
  const metrics=el('div','','bulk-metrics');
  const kcal=el('div','', 'bulk-metric');kcal.append(el('strong',String(Math.round(plan.calories))),el('span','kcal'));
  const protein=el('div','', 'bulk-metric');protein.append(el('strong',String(Math.round(plan.protein))),el('span','g protein'));
  metrics.append(kcal,protein);
  const copy=el('div','','bulk-summary-copy');
  copy.append(el('span',quality,'bulk-quality'),el('p',`${plan.picks.length} food${plan.picks.length===1?'':'s'} · ${plan.servings} total serving${plan.servings===1?'':'s'}`));
  summary.append(copy,metrics);
  root.append(summary);

  const list=el('div','','bulk-items');
  for(const pick of plan.picks){
    const item=pick.item;
    const card=el('article','','bulk-item');
    const top=el('div','','bulk-item-top');
    const link=nutritionLink(item);
    const name=link?el('a',item.name,'bulk-food-link'):el('strong',item.name,'bulk-food-link');
    if(link){name.href=link;name.target='_blank';name.rel='noreferrer';}
    top.append(name,el('span',`${pick.quantity}×`,'quantity'));
    card.append(top);
    const meta=el('div','','bulk-item-meta');
    meta.append(el('span',item.serving||'UCSC serving'));
    meta.append(el('span',`${Math.round(Number(item.calories)*pick.quantity)} kcal`));
    meta.append(el('span',`${Math.round(Number(item.protein)*pick.quantity)} g protein`));
    card.append(meta);
    if(link)card.append(el('span','Open UCSC nutrition ↗','nutrition-cta'));
    list.append(card);
  }
  root.append(list);

  const note=el('p','','bulk-note');
  const calDelta=Math.round(plan.calories-plan.targets.calories);
  const proteinDelta=Math.round(plan.protein-plan.targets.protein);
  note.textContent=`Vs target: ${calDelta===0?'on target':`${Math.abs(calDelta)} kcal ${calDelta>0?'over':'under'}`} · ${proteinDelta>=0?`${proteinDelta} g protein over`:`${Math.abs(proteinDelta)} g protein under`}. Use the UCSC serving size shown for each item.`;
  root.append(note);
}
function renderDates(){
  const dates=Object.keys(data.dates).sort();
  if(!dates.includes(activeDate))activeDate=dates.includes(today)?today:dates[0];
  $('menuDate').replaceChildren(...dates.map(date=>{
    const option=el('option',date===today?`Today · ${dateLabel(date)}`:dateLabel(date));
    option.value=date;
    return option;
  }));
  $('menuDate').value=activeDate;
  const i=dates.indexOf(activeDate);
  $('datePrev').disabled=i<=0;
  $('dateNext').disabled=i<0||i>=dates.length-1;
  $('dateToday').disabled=activeDate===today||!dates.includes(today);
  $('datePrev').onclick=()=>{if(i>0){activeDate=dates[i-1];selectedMeal=null;render();}};
  $('dateNext').onclick=()=>{if(i>=0&&i<dates.length-1){activeDate=dates[i+1];selectedMeal=null;render();}};
  $('dateToday').onclick=()=>{if(dates.includes(today)){activeDate=today;selectedMeal=null;render();}};
  $('menuDate').onchange=()=>{activeDate=$('menuDate').value;selectedMeal=null;render();};
}
function renderOverview(){
  const root=$('diningOverview');root.replaceChildren();
  const day=currentDay();if(!day)return;
  const locations=[...day.locations].sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name));
  for(const location of locations){
    const s=serving(location);
    const card=document.createElement('button');
    card.type='button';
    card.className=`dining-card status-${s.state} ${location.id===selectedHall?'selected':''}`;
    const top=el('div','','card-top');
    top.append(el('strong',location.name),el('span',s.state==='scheduled'?'future':s.state,'status-badge'));
    card.append(top,el('p',servingText(location),'serving-line'));

    const autoPlan=activeDate===today?buildBulkPlan(location):null;
    if(autoPlan){
      const mini=el('div','','bulk-mini');
      mini.append(el('span',location.bulk?.mode==='now'?'AUTO BULK':'NEXT BULK','bulk-mini-label'));
      mini.append(el('strong',`${Math.round(autoPlan.calories)} kcal · ${Math.round(autoPlan.protein)} g protein`));
      mini.append(el('small',autoPlan.picks.slice(0,2).map(p=>`${p.quantity>1?`${p.quantity}× `:''}${p.item.name}`).join(' + ')));
      card.append(mini);
    }else if(location.status!=='live'){
      card.append(el('p',location.message||'No menu posted for this date.','card-message'));
    }else if(s.state==='limited'){
      card.append(el('p','Limited service now. Open the card for the next full-meal bulk plan.','card-message'));
    }else{
      const meal=relevantMeal(location);
      if(meal){
        card.append(el('span',meal.name,'preview-label'));
        const preview=el('div','','food-preview');
        meal.items.slice(0,3).forEach(item=>preview.append(el('span',item.name)));
        card.append(preview);
      }
    }

    card.onclick=()=>{
      selectedHall=location.id;
      selectedMeal=null;
      savePrefs();
      render();
      $('bulkPlanner').scrollIntoView({behavior:'smooth',block:'start'});
    };
    root.append(card);
  }
  $('locationCount').textContent=`${day.locations.filter(x=>x.status==='live').length} places with a posted menu for this date`;
}
function renderHallSelect(){
  const day=currentDay();if(!day)return;
  $('hall').replaceChildren(...day.locations.map(location=>{const o=el('option',location.name);o.value=location.id;return o;}));
  $('hall').value=selectedHall;
  $('hall').onchange=()=>{selectedHall=$('hall').value;selectedMeal=null;savePrefs();render();};
}
function renderSchedule(location){
  const root=$('selectedSchedule');root.replaceChildren();
  const schedule=location.schedule;
  if(schedule===null){
    root.append(el('p','Serving hours are not built in for this café or market yet. The posted menu is still shown below.','muted'));
    return;
  }
  if(!schedule?.length){
    root.append(el('p','Closed on the regular serving schedule for this day.','muted'));
    return;
  }
  const strip=el('div','','schedule-strip');
  schedule.forEach(item=>{
    const block=el('div','',item.limited?'schedule-slot limited':'schedule-slot');
    block.append(el('strong',item.name),el('span',`${timeLabel(item.start)} to ${timeLabel(item.end)}`));
    strip.append(block);
  });
  root.append(strip);
}
function chooseMeal(location){
  if(selectedMeal&&location.meals.some(m=>m.name===selectedMeal))return selectedMeal;
  if(activeDate===today&&location.bulk?.meal&&location.meals.some(m=>m.name===location.bulk.meal))return location.bulk.meal;
  return relevantMeal(location)?.name||location.meals?.[0]?.name||'';
}
function renderMealTabs(location){
  const names=location.meals.map(m=>m.name);
  selectedMeal=chooseMeal(location);
  $('mealTabs').replaceChildren(...names.map(name=>{
    const b=el('button',name,`meal-tab ${name===selectedMeal?'active':''}`);
    b.type='button';
    b.onclick=()=>{selectedMeal=name;renderDetail();};
    return b;
  }));
  $('menuMeal').replaceChildren(...names.map(name=>{const o=el('option',name);o.value=name;return o;}));
  $('menuMeal').value=selectedMeal;
  $('menuMeal').onchange=()=>{selectedMeal=$('menuMeal').value;renderDetail();};
}
function renderMenuItems(location){
  const root=$('menuItems');root.replaceChildren();
  const meal=location.meals.find(m=>m.name===selectedMeal);
  if(!meal){
    root.append(el('p','No menu is posted for this meal.','menu-empty'));
    return;
  }
  const query=$('menuSearch').value.trim().toLowerCase();
  let items=meal.items.filter(item=>(!$('vegetarianOnly').checked||['vegan','vegetarian'].includes(item.diet))&&item.name.toLowerCase().includes(query));
  if($('menuSort').value==='alpha')items=[...items].sort((a,b)=>a.name.localeCompare(b.name));
  if(!items.length){
    root.append(el('p',meal.items.length?'No foods match these filters.':'No items are posted for this meal.','menu-empty'));
    return;
  }
  root.append(el('p',`${items.length} foods · ${meal.name} · ${dateLabel(activeDate)}`,'menu-count'));
  const groups=new Map();
  for(const item of items){
    const key=$('menuSort').value==='alpha'?'All foods':(item.section||'Menu');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  for(const [section,foods] of groups){
    const wrap=el('section','','station-section');
    wrap.append(el('h3',section));
    const grid=el('div','','station-items');
    foods.forEach(item=>{
      const row=el('div','','static-food-row');
      const left=el('div','','food-copy');
      const link=nutritionLink(item);
      const name=link?el('a',item.name,'static-food-name'):el('span',item.name,'static-food-name');
      if(link){name.href=link;name.target='_blank';name.rel='noreferrer';name.title='Open exact UCSC nutrition label';}
      left.append(name);
      const meta=el('div','','food-meta');
      if(item.serving)meta.append(el('span',item.serving));
      if(Number.isFinite(Number(item.calories)))meta.append(el('span',`${Math.round(Number(item.calories))} kcal`));
      if(Number.isFinite(Number(item.protein)))meta.append(el('span',`${Math.round(Number(item.protein))} g protein`));
      if(item.diet==='vegan'||item.diet==='vegetarian')meta.append(el('span',item.diet==='vegan'?'Vegan':'Vegetarian',`diet-tag ${item.diet}`));
      if(link)meta.append(el('span','Nutrition ↗','nutrition-inline'));
      left.append(meta);
      row.append(left);
      grid.append(row);
    });
    wrap.append(grid);
    root.append(wrap);
  }
}
function detailMessage(location){
  const s=serving(location);
  if(activeDate!==today)return `Showing ${selectedMeal} for ${dateLabel(activeDate)}.`;
  if(s.state==='limited')return `Continuous Dining is happening now. ${selectedMeal} is shown for planning, but the limited selection may be different.`;
  if(s.state==='closed')return `This location is closed right now on its regular schedule. ${selectedMeal} is shown so you can plan ahead.`;
  if(s.state==='unknown')return 'The menu is posted, but verified serving hours are not built in for this location yet.';
  return `${s.label} is happening now on the regular schedule.`;
}
function renderDetail(){
  const location=locationById(selectedHall);
  if(!location)return;
  $('selectedLocationName').textContent=location.name;
  $('selectedLocationStatus').textContent=servingText(location);
  renderSchedule(location);
  renderMealTabs(location);
  renderBulkPlan(location);
  $('menuStatus').textContent=location.status==='live'?detailMessage(location):(location.message||'No menu posted for this date.');
  $('menuLink').href=location.source||'#';
  $('menuUpdated').textContent=snapshotAge();
  renderMenuItems(location);
}
function ensureSelection(){
  const day=currentDay();if(!day?.locations?.length)return;
  if(!selectedHall||!day.locations.some(x=>x.id===selectedHall)){
    selectedHall=[...day.locations].sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name))[0].id;
  }
}
function render(){
  ensureSelection();
  renderDates();
  updateClock();
  renderOverview();
  renderHallSelect();
  renderDetail();
  $('dashboardStatus').textContent=`Menu snapshot generated ${new Date(data.generatedAt).toLocaleString()}. GitHub refreshes it automatically throughout the day.`;
}
async function loadData(bust=false){
  $('refresh').disabled=true;
  $('dashboardStatus').textContent='Loading UCSC menu snapshot…';
  try{
    const response=await fetch(`./data/menus.json${bust?`?t=${Date.now()}`:''}`,{cache:bust?'no-store':'default'});
    if(!response.ok)throw new Error('Could not load the published menu snapshot.');
    data=await response.json();
    const dates=Object.keys(data.dates||{}).sort();
    if(!dates.length)throw new Error('No published menu dates are available.');
    activeDate=activeDate&&dates.includes(activeDate)?activeDate:(dates.includes(today)?today:dates[0]);
    if(!prefs.bulkCalories&&data.bulkDefaults?.calories)$('bulkCalories').value=data.bulkDefaults.calories;
    if(!prefs.bulkProtein&&data.bulkDefaults?.protein)$('bulkProtein').value=data.bulkDefaults.protein;
    render();
  }catch(error){
    $('dashboardStatus').textContent=`Dining menus unavailable: ${error.message}`;
    $('diningOverview').replaceChildren(el('p','The published menu snapshot could not be loaded. Try again in a moment.','menu-empty'));
    $('bulkPlan').replaceChildren(el('p','The bulk planner needs the UCSC menu snapshot before it can build a meal.','menu-empty'));
  }finally{
    $('refresh').disabled=false;
  }
}

$('vegetarianOnly').checked=prefs.vegetarian===true;
$('menuSort').value=prefs.sort||'station';
$('bulkCalories').value=clamp(prefs.bulkCalories,300,1800,850);
$('bulkProtein').value=clamp(prefs.bulkProtein,10,120,45);
selectedHall=prefs.hall||null;

$('vegetarianOnly').onchange=()=>{savePrefs();if(data){renderOverview();renderDetail();}};
$('menuSort').onchange=()=>{savePrefs();if(data)renderMenuItems(locationById(selectedHall));};
$('menuSearch').oninput=()=>{if(data)renderMenuItems(locationById(selectedHall));};
$('refresh').onclick=()=>loadData(true);
for(const id of ['bulkCalories','bulkProtein']){
  $(id).addEventListener('change',()=>{savePrefs();if(data){renderOverview();renderBulkPlan(locationById(selectedHall));}});
}
$('bulkReset').onclick=()=>{
  $('bulkCalories').value=data?.bulkDefaults?.calories||850;
  $('bulkProtein').value=data?.bulkDefaults?.protein||45;
  savePrefs();
  if(data){renderOverview();renderBulkPlan(locationById(selectedHall));}
};

const strip=$('diningOverview');
strip.addEventListener('wheel',event=>{
  if(Math.abs(event.deltaY)<=Math.abs(event.deltaX)||strip.scrollWidth<=strip.clientWidth)return;
  const atStart=strip.scrollLeft<=1&&event.deltaY<0;
  const atEnd=strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-2&&event.deltaY>0;
  if(atStart||atEnd)return;
  event.preventDefault();
  strip.scrollLeft+=event.deltaY;
},{passive:false});

updateClock();
setInterval(()=>{updateClock();if(activeDate===today&&data)render();},60*1000);
loadData();
