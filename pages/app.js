import {getServingStatus} from './dining-hours.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const TZ='America/Los_Angeles';
const PREF='college-bulk-pages-v2';
const DINING_HALL_IDS=new Set(['40','05','20','25','30']);

let indexData=null;
let dayData=null;
let activeDate=null;
let selectedHall=null;
let selectedMeal=null;
let prefs={};
let detailToken=0;
const dayCache=new Map();
const detailCache=new Map();
const detailPromises=new Map();

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
function dailyGoals(){
  const calories=Number(prefs.dailyCalories);
  const protein=Number(prefs.dailyProtein);
  if(!Number.isFinite(calories)||calories<500||!Number.isFinite(protein)||protein<10)return null;
  return {calories,protein,mode:prefs.goalMode||'maintain'};
}
function goalModeLabel(){
  return ({cut:'CUT',maintain:'MAINTAIN',gain:'GAIN'})[dailyGoals()?.mode]||'YOUR GOAL';
}
function savePrefs(){
  try{
    prefs={...prefs,hall:selectedHall,vegetarian:$('vegetarianOnly')?.checked===true,sort:$('menuSort')?.value||'station'};
    localStorage.setItem(PREF,JSON.stringify(prefs));
  }catch{}
}
function snapshotAge(){
  if(!indexData?.generatedAt)return '';
  const minutes=Math.max(0,Math.round((Date.now()-new Date(indexData.generatedAt).getTime())/60000));
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
function locationById(id){return dayData?.locations?.find(x=>x.id===id)||null;}
function serving(location){return getServingStatus(activeDate,location.id,new Date());}
function locationGroup(location){
  return DINING_HALL_IDS.has(location.id)||/Dining Hall/i.test(location.sourceName||location.name)?0:1;
}
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
  if(!location?.meals?.length)return null;
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
function nutritionItems(location,mealName){
  const meal=location?.meals?.find(item=>item.name===mealName);
  return (meal?.items||[]).filter(item=>
    item.calories!==null&&item.calories!==undefined&&
    item.protein!==null&&item.protein!==undefined&&
    Number.isFinite(Number(item.calories))&&Number(item.calories)>0&&
    Number.isFinite(Number(item.protein))&&Number(item.protein)>=0
  );
}
function mealTargets(location,mealName){
  const goals=dailyGoals();
  if(!goals)return null;
  const count=Math.max(1,location?.meals?.length||3);
  return {
    calories:Math.max(250,Math.round(goals.calories/count)),
    protein:Math.max(10,Math.round(goals.protein/count)),
    dailyCalories:goals.calories,
    dailyProtein:goals.protein,
    mealCount:count,
    mode:goals.mode,
    mealName
  };
}
function candidatePool(items,vegetarianOnly){
  let candidates=items.filter(item=>!vegetarianOnly||['vegan','vegetarian'].includes(item.diet));
  if(candidates.length<=32)return candidates;
  const unique=new Map();
  const take=(arr,n)=>arr.slice(0,n).forEach(item=>unique.set(item.name,item));
  take([...candidates].sort((a,b)=>(Number(b.protein)/Math.max(1,Number(b.calories)))-(Number(a.protein)/Math.max(1,Number(a.calories)))),14);
  take([...candidates].sort((a,b)=>Number(b.protein)-Number(a.protein)),10);
  take([...candidates].sort((a,b)=>Number(b.calories)-Number(a.calories)),8);
  return [...unique.values()];
}
function buildMealPlan(location,mealName){
  const targets=mealTargets(location,mealName);
  if(!targets)return null;
  const candidates=candidatePool(nutritionItems(location,mealName),$('vegetarianOnly')?.checked===true);
  if(!candidates.length)return null;

  const score=(state,final=false)=>{
    const calDiff=Math.abs(state.calories-targets.calories)/targets.calories;
    const proteinGap=Math.max(0,targets.protein-state.protein)/targets.protein;
    const calorieLow=Math.max(0,targets.calories*.6-state.calories)/targets.calories;
    const calorieHigh=Math.max(0,state.calories-targets.calories*1.25)/targets.calories;
    const repetition=[...state.qty.values()].reduce((sum,q)=>sum+Math.max(0,q-1),0);
    return calDiff*1.45+proteinGap*4.2+calorieLow*2.1+calorieHigh*3.2+repetition*.08+(final?state.servings*.015:0);
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
        next.push({calories,protein:state.protein+Number(item.protein),picks,qty,servings:state.servings+1});
      }
    }
    states=next.sort((a,b)=>score(a)-score(b)).slice(0,160);
  }
  const viable=states.filter(state=>state.servings>0&&state.calories>=targets.calories*.42);
  if(!viable.length)return null;
  const best=viable.sort((a,b)=>score(a,true)-score(b,true))[0];
  return {...best,targets};
}
function nutritionLink(item){
  return typeof item?.source==='string'&&/nutrition\.sa\.ucsc\.edu\/label\.aspx/i.test(item.source)?item.source:null;
}

async function fetchJSON(path,bust=false){
  const response=await fetch(`${path}${bust?`${path.includes('?')?'&':'?'}t=${Date.now()}`:''}`,{cache:bust?'no-store':'default'});
  if(!response.ok)throw new Error(`Could not load ${path}.`);
  return response.json();
}
async function loadDay(date,bust=false){
  if(!bust&&dayCache.has(date))return dayCache.get(date);
  const day=await fetchJSON(`./data/dates/${date}.json`,bust);
  dayCache.set(date,day);
  return day;
}
async function ensureDetail(location,bust=false){
  if(!location?.detailPath)return null;
  const key=`${activeDate}:${location.id}`;
  if(!bust&&detailCache.has(key))return detailCache.get(key);
  if(!bust&&detailPromises.has(key))return detailPromises.get(key);

  const promise=fetchJSON(location.detailPath,bust).then(detail=>{
    detailCache.set(key,detail);
    detailPromises.delete(key);
    return detail;
  }).catch(error=>{
    detailPromises.delete(key);
    throw error;
  });
  detailPromises.set(key,promise);
  return promise;
}
function applyDetail(location,detail){
  if(!location||!detail)return;
  location.meals=detail.meals||location.meals;
  location.bulk=detail.bulk||null;
  location.detailLoaded=true;
}

function renderDates(){
  const dates=indexData?.dates||[];
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
  $('datePrev').onclick=()=>{if(i>0)changeDate(dates[i-1]);};
  $('dateNext').onclick=()=>{if(i>=0&&i<dates.length-1)changeDate(dates[i+1]);};
  $('dateToday').onclick=()=>{if(dates.includes(today))changeDate(today);};
  $('menuDate').onchange=()=>changeDate($('menuDate').value);
}
function renderOverview(){
  const root=$('diningOverview');root.replaceChildren();
  if(!dayData)return;
  const locations=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||rank(a)-rank(b)||a.name.localeCompare(b.name));

  for(const location of locations){
    const s=serving(location);
    const card=document.createElement('button');
    card.type='button';
    card.className=`dining-card status-${s.state} ${location.id===selectedHall?'selected':''}`;

    const top=el('div','','card-top');
    top.append(el('strong',location.name),el('span',s.state==='scheduled'?'future':s.state,'status-badge'));
    card.append(top,el('p',servingText(location),'serving-line'));

    if(location.status!=='live'){
      card.append(el('p',location.message||'No menu posted for this date.','card-message'));
    }else if(s.state==='limited'){
      card.append(el('p','Limited service now. Pick this place to see the next full meal and planner.','card-message'));
    }else{
      const meal=relevantMeal(location);
      if(meal){
        card.append(el('span',meal.name,'preview-label'));
        const preview=el('div','','food-preview');
        meal.items.slice(0,3).forEach(item=>preview.append(el('span',item.name)));
        card.append(preview);
      }
      if(location.detailPath)card.append(el('small','Nutrition ready when you open this place'));
    }

    card.onclick=()=>selectLocation(location.id,true);
    root.append(card);
  }
  $('locationCount').textContent=`${dayData.locations.filter(x=>x.status==='live').length} places with a posted menu for this date`;
}
function renderHallSelect(){
  if(!dayData)return;
  const sorted=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||a.name.localeCompare(b.name));
  $('hall').replaceChildren(...sorted.map(location=>{const o=el('option',location.name);o.value=location.id;return o;}));
  $('hall').value=selectedHall;
  $('hall').onchange=()=>selectLocation($('hall').value,false);
}
function renderSchedule(location){
  const root=$('selectedSchedule');root.replaceChildren();
  const schedule=location?.schedule;
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
  const names=location?.meals?.map(m=>m.name)||[];
  selectedMeal=chooseMeal(location);
  $('mealTabs').replaceChildren(...names.map(name=>{
    const b=el('button',name,`meal-tab ${name===selectedMeal?'active':''}`);
    b.type='button';
    b.onclick=()=>{selectedMeal=name;renderSelectedDetail();};
    return b;
  }));
  $('menuMeal').replaceChildren(...names.map(name=>{const o=el('option',name);o.value=name;return o;}));
  $('menuMeal').value=selectedMeal;
  $('menuMeal').onchange=()=>{selectedMeal=$('menuMeal').value;renderSelectedDetail();};
}
function renderMenuItems(location){
  const root=$('menuItems');root.replaceChildren();
  const meal=location?.meals?.find(m=>m.name===selectedMeal);
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
      if(item.calories!==undefined&&item.calories!==null)meta.append(el('span',`${Math.round(Number(item.calories))} kcal`));
      if(item.protein!==undefined&&item.protein!==null)meta.append(el('span',`${Math.round(Number(item.protein))} g protein`));
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
function renderMealPlan(location){
  const root=$('bulkPlan');root.replaceChildren();
  const goals=dailyGoals();
  const mealForPlan=selectedMeal||location?.bulk?.meal||location?.meals?.[0]?.name;
  const targets=location&&mealForPlan?mealTargets(location,mealForPlan):null;

  $('goalModeBadge').textContent=goalModeLabel();
  $('bulkTitle').textContent=location?`Meal plan at ${location.name}`:'Your meal plan';
  $('bulkTargetBadge').textContent=targets?`${targets.calories} kcal · ${targets.protein} g protein this meal`:'Set your goals';
  $('dailyGoalSummary').textContent=goals
    ? `${goals.calories} kcal/day · ${goals.protein} g protein/day · automatically split across ${targets?.mealCount||'the posted'} meals`
    : 'Set your daily calorie and protein goals once. The planner will handle each meal automatically.';

  if(!goals){
    $('bulkSubtitle').textContent='Set two daily targets once, then the site can build meals automatically.';
    const box=el('div','','bulk-empty');
    box.append(el('strong','Set up your meal goals'),el('p','Choose Cut, Maintain, or Gain and enter your daily calories and protein. You only do this once.'));
    const link=el('a','Set goals →','button-link');link.href='./goals.html';box.append(link);root.append(box);
    return;
  }
  if(activeDate!==today){
    $('bulkSubtitle').textContent='Automatic macro plans are generated for today so nutrition stays tied to the current UCSC menu.';
    root.append(el('p','Future menus are available for browsing. Return to Today for the nutrition-based meal helper.','menu-empty'));
    return;
  }
  if(location?.detailPath&&!location.detailLoaded){
    $('bulkSubtitle').textContent='Menu names are already loaded. Pulling nutrition for this place now…';
    const box=el('div','','bulk-loading');
    box.append(el('span','','loading-dot'),el('strong','Loading nutrition only for this location'));
    root.append(box);
    return;
  }
  if(!nutritionItems(location,mealForPlan).length){
    $('bulkSubtitle').textContent='This meal does not have enough readable UCSC nutrition data for an automatic plan yet.';
    root.append(el('p','The full menu is still available below. Missing nutrition is never guessed.','menu-empty'));
    return;
  }

  const plan=buildMealPlan(location,mealForPlan);
  $('bulkSubtitle').textContent=`Built from the posted ${mealForPlan} menu. Click any planned food to open its exact UCSC nutrition label.`;
  if(!plan){
    root.append(el('p','The planner could not find a reliable combination for this target from the readable menu items.','menu-empty'));
    return;
  }

  const summary=el('div','','bulk-summary');
  const closeEnough=plan.protein>=plan.targets.protein&&plan.calories>=plan.targets.calories*.72&&plan.calories<=plan.targets.calories*1.28;
  const copy=el('div','','bulk-summary-copy');
  copy.append(el('span',closeEnough?'Meal target hit':'Closest posted-menu match','bulk-quality'),el('p',`${plan.picks.length} food${plan.picks.length===1?'':'s'} · ${plan.servings} total serving${plan.servings===1?'':'s'}`));
  const metrics=el('div','','bulk-metrics');
  const kcal=el('div','','bulk-metric');kcal.append(el('strong',String(Math.round(plan.calories))),el('span','kcal'));
  const protein=el('div','','bulk-metric');protein.append(el('strong',String(Math.round(plan.protein))),el('span','g protein'));
  metrics.append(kcal,protein);
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
}
function renderSelectedDetail(){
  const location=locationById(selectedHall);
  if(!location)return;
  $('selectedLocationName').textContent=location.name;
  $('selectedLocationStatus').textContent=servingText(location);
  renderSchedule(location);
  renderMealTabs(location);
  $('menuStatus').textContent=location.status==='live'?detailMessage(location):(location.message||'No menu posted for this date.');
  $('menuLink').href=location.source||'#';
  $('menuUpdated').textContent=snapshotAge();
  renderMealPlan(location);
  renderMenuItems(location);
}
function ensureSelection(){
  if(!dayData?.locations?.length)return;
  if(!selectedHall||!dayData.locations.some(x=>x.id===selectedHall)){
    selectedHall=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||rank(a)-rank(b)||a.name.localeCompare(b.name))[0].id;
  }
}
function renderPage(){
  ensureSelection();
  renderDates();
  updateClock();
  renderOverview();
  renderHallSelect();
  renderSelectedDetail();
  $('dashboardStatus').textContent=`Menus loaded. Snapshot updated ${new Date(indexData.generatedAt).toLocaleString()}.`;
}
async function hydrateSelectedLocation(bust=false){
  const location=locationById(selectedHall);
  if(!location?.detailPath||location.detailLoaded)return;
  const token=++detailToken;
  renderMealPlan(location);
  try{
    const detail=await ensureDetail(location,bust);
    if(token!==detailToken||selectedHall!==location.id)return;
    applyDetail(location,detail);
    renderSelectedDetail();
  }catch(error){
    if(token!==detailToken)return;
    $('bulkSubtitle').textContent='Nutrition details could not load for this location.';
    $('bulkPlan').replaceChildren(el('p','The menu is still usable below. Try refreshing later for nutrition-based planning.','menu-empty'));
  }
}
async function selectLocation(id,scroll){
  selectedHall=id;
  selectedMeal=null;
  savePrefs();
  renderOverview();
  renderHallSelect();
  renderSelectedDetail();
  hydrateSelectedLocation();
  if(scroll)$('bulkPlanner').scrollIntoView({behavior:'smooth',block:'start'});
}
async function changeDate(date){
  if(date===activeDate&&dayData)return;
  activeDate=date;
  selectedMeal=null;
  $('dashboardStatus').textContent='Loading this date…';
  try{
    dayData=await loadDay(date);
    renderPage();
    hydrateSelectedLocation();
  }catch(error){
    $('dashboardStatus').textContent=`Menus unavailable: ${error.message}`;
  }
}
function prefetchDiningHalls(){
  const work=async()=>{
    const halls=(dayData?.locations||[]).filter(location=>DINING_HALL_IDS.has(location.id)&&location.detailPath&&location.id!==selectedHall);
    for(const hall of halls){
      try{await ensureDetail(hall);}catch{}
    }
  };
  if('requestIdleCallback'in window)requestIdleCallback(()=>work(),{timeout:3000});
  else setTimeout(work,1200);
}
async function loadData(bust=false){
  $('refresh').disabled=true;
  $('dashboardStatus').textContent='Loading menu list…';
  try{
    indexData=await fetchJSON('./data/index.json',bust);
    const dates=indexData.dates||[];
    if(!dates.length)throw new Error('No posted menu dates are available.');
    activeDate=activeDate&&dates.includes(activeDate)?activeDate:(dates.includes(today)?today:dates[0]);
    if(bust){dayCache.clear();detailCache.clear();detailPromises.clear();}
    dayData=await loadDay(activeDate,bust);
    renderPage();
    await hydrateSelectedLocation(bust);
    prefetchDiningHalls();
  }catch(error){
    $('dashboardStatus').textContent=`Dining menus unavailable: ${error.message}`;
    $('diningOverview').replaceChildren(el('p','The published menu snapshot could not be loaded. Try again in a moment.','menu-empty'));
    $('bulkPlan').replaceChildren(el('p','The meal planner needs the menu snapshot before it can build a meal.','menu-empty'));
  }finally{
    $('refresh').disabled=false;
  }
}

$('vegetarianOnly').checked=prefs.vegetarian===true;
$('menuSort').value=prefs.sort||'station';
selectedHall=prefs.hall||null;

$('vegetarianOnly').onchange=()=>{savePrefs();if(dayData){renderMealPlan(locationById(selectedHall));renderMenuItems(locationById(selectedHall));}};
$('menuSort').onchange=()=>{savePrefs();if(dayData)renderMenuItems(locationById(selectedHall));};
$('menuSearch').oninput=()=>{if(dayData)renderMenuItems(locationById(selectedHall));};
$('refresh').onclick=()=>loadData(true);

const strip=$('diningOverview');
strip.addEventListener('wheel',event=>{
  if(strip.scrollWidth<=strip.clientWidth)return;
  const vertical=Math.abs(event.deltaY)>Math.abs(event.deltaX);
  if(!vertical)return;
  const atStart=strip.scrollLeft<=1&&event.deltaY<0;
  const atEnd=strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-2&&event.deltaY>0;
  if(atStart||atEnd)return;
  event.preventDefault();
  strip.scrollLeft+=event.deltaY;
},{passive:false});

updateClock();
setInterval(()=>{
  updateClock();
  if(dayData&&activeDate===today){renderOverview();renderSelectedDetail();}
},60*1000);
loadData();
