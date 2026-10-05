import {getServingStatus} from './dining-hours.mjs';
import {generateStationPlates} from './plate-planner.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const TZ='America/Los_Angeles';
const PREF='college-bulk-pages-v2';
const DINING_HALL_IDS=new Set(['40','05','20','25','30']);
const ALLERGEN_GROUPS={
  milk:['milk','dairy'],egg:['egg'],'wheat-gluten':['wheat','gluten'],soy:['soy'],peanut:['peanut'],
  'tree-nut':['tree nut','treenut','almond','cashew','walnut','pecan','pistachio','hazelnut'],
  sesame:['sesame'],fish:['fish'],shellfish:['shellfish','shrimp','crab','lobster','mollusk']
};
const ALLERGEN_LABELS={milk:'Milk',egg:'Egg','wheat-gluten':'Wheat / Gluten',soy:'Soy',peanut:'Peanut','tree-nut':'Tree nuts',sesame:'Sesame',fish:'Fish',shellfish:'Shellfish'};

let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}
const needsSetup=!prefs.onboardingComplete;

let indexData=null;
let dayData=null;
let activeDate=null;
let selectedHall=prefs.hall||null;
let selectedMeal=null;
let detailToken=0;
const dayCache=new Map();
const detailCache=new Map();
const detailPromises=new Map();

const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function profile(){
  return {
    dietPreference:prefs.dietPreference||'omnivore',
    allergens:Array.isArray(prefs.allergens)?prefs.allergens:[],
    avoidFoods:Array.isArray(prefs.avoidFoods)?prefs.avoidFoods:[]
  };
}
function dailyGoals(){
  const calories=Number(prefs.dailyCalories),protein=Number(prefs.dailyProtein);
  if(!Number.isFinite(calories)||calories<500||!Number.isFinite(protein)||protein<10)return null;
  return {calories,protein,mode:prefs.goalMode||'maintain'};
}
function goalModeLabel(){return ({cut:'CUT',maintain:'MAINTAIN',gain:'GAIN'})[dailyGoals()?.mode]||'YOUR GOAL';}
function dietLabel(){return ({omnivore:'Everything',vegetarian:'Vegetarian',vegan:'Vegan'})[profile().dietPreference]||'Everything';}
function savePrefs(){
  try{
    prefs={...prefs,hall:selectedHall,sort:$('menuSort')?.value||'station',safeOnly:$('profileSafeOnly')?.checked!==false};
    localStorage.setItem(PREF,JSON.stringify(prefs));
  }catch{}
}

function campusParts(now=new Date()){
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...p,date:`${p.year}-${p.month}-${p.day}`};
}
const today=campusParts().date;
function dateLabel(date){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00Z`));}
function timeLabel(time){
  if(!time)return '';
  let [h,m]=time.split(':').map(Number);const suffix=h>=12?'PM':'AM';h=h%12||12;
  return `${h}${m?`:${String(m).padStart(2,'0')}`:''} ${suffix}`;
}
function snapshotAge(){
  if(!indexData?.generatedAt)return '';
  const minutes=Math.max(0,Math.round((Date.now()-new Date(indexData.generatedAt).getTime())/60000));
  if(minutes<2)return 'Menu snapshot refreshed just now.';
  if(minutes<60)return `Menu snapshot refreshed ${minutes} minutes ago.`;
  const hours=Math.floor(minutes/60);return `Menu snapshot refreshed about ${hours} hour${hours===1?'':'s'} ago.`;
}
function updateClock(){
  const p=campusParts();
  $('campusClock').textContent=`${p.weekday.toUpperCase()} · ${new Intl.DateTimeFormat('en-US',{timeZone:TZ,month:'long',day:'numeric'}).format(new Date())} · ${Number(p.hour)%12||12}:${p.minute} ${Number(p.hour)>=12?'PM':'AM'}`;
  $('snapshotAge').textContent=snapshotAge();
  $('dateContext').textContent=activeDate===today?'RIGHT NOW':'BROWSING AHEAD';
}

function locationById(id){return dayData?.locations?.find(x=>x.id===id)||null;}
function serving(location){return getServingStatus(activeDate,location.id,new Date());}
function locationGroup(location){return DINING_HALL_IDS.has(location.id)||/Dining Hall/i.test(location.sourceName||location.name)?0:1;}
function rank(location){
  const state=serving(location).state;
  return ({open:0,limited:1,unknown:2,scheduled:3,closed:4}[state]??5)+(location.status==='live'?0:10);
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
    const bulk=location.meals.find(m=>m.name===location.bulk.meal);if(bulk)return bulk;
  }
  if(s.state==='limited'&&s.next){
    const next=location.meals.find(m=>m.name.toLowerCase()===s.next.name.toLowerCase());if(next)return next;
  }
  return location.meals[0];
}
function mealTargets(location,mealName){
  const goals=dailyGoals();if(!goals)return null;
  const count=Math.max(1,location?.meals?.length||3);
  return {calories:Math.max(250,Math.round(goals.calories/count)),protein:Math.max(10,Math.round(goals.protein/count)),mealCount:count,mealName};
}
function nutritionLink(item){return typeof item?.source==='string'&&/nutrition\.sa\.ucsc\.edu\/label\.aspx/i.test(item.source)?item.source:null;}
function profileMatches(item,{requireAllergenData=false}={}){
  const p=profile();
  if(p.dietPreference==='vegan'&&item.diet!=='vegan')return false;
  if(p.dietPreference==='vegetarian'&&!['vegetarian','vegan'].includes(item.diet))return false;
  if(p.allergens.length){
    if(requireAllergenData&&(!Array.isArray(item.allergens)||item.nutritionStatus==='unavailable'))return false;
    const published=(item.allergens||[]).map(norm);
    for(const key of p.allergens){
      const terms=ALLERGEN_GROUPS[key]||[norm(key)];
      if(published.some(allergen=>terms.some(term=>allergen.includes(term))))return false;
    }
  }
  const itemText=norm(`${item.name} ${item.section||''}`);
  for(const raw of p.avoidFoods){const term=norm(raw);if(term&&itemText.includes(term))return false;}
  return true;
}
function profileChips(){
  const p=profile(),chips=[dietLabel(),`${dailyGoals()?.calories||'?'} kcal/day`,`${dailyGoals()?.protein||'?'} g protein/day`];
  if(p.allergens.length)chips.push(`${p.allergens.length} allergen filter${p.allergens.length===1?'':'s'}`);
  if(p.avoidFoods.length)chips.push(`${p.avoidFoods.length} avoid-food filter${p.avoidFoods.length===1?'':'s'}`);
  return chips;
}

async function fetchJSON(path,bust=false){
  const response=await fetch(`${path}${bust?`${path.includes('?')?'&':'?'}t=${Date.now()}`:''}`,{cache:bust?'no-store':'default'});
  if(!response.ok)throw new Error(`Could not load ${path}.`);
  return response.json();
}
async function loadDay(date,bust=false){
  if(!bust&&dayCache.has(date))return dayCache.get(date);
  const day=await fetchJSON(`./data/dates/${date}.json`,bust);dayCache.set(date,day);return day;
}
async function ensureDetail(location,bust=false){
  if(!location?.detailPath)return null;
  const key=`${activeDate}:${location.id}`;
  if(!bust&&detailCache.has(key))return detailCache.get(key);
  if(!bust&&detailPromises.has(key))return detailPromises.get(key);
  const promise=fetchJSON(location.detailPath,bust).then(detail=>{detailCache.set(key,detail);detailPromises.delete(key);return detail;}).catch(error=>{detailPromises.delete(key);throw error;});
  detailPromises.set(key,promise);return promise;
}
function applyDetail(location,detail){
  if(!location||!detail)return;
  location.meals=detail.meals||location.meals;location.bulk=detail.bulk||null;location.detailLoaded=true;
}

function renderDates(){
  const dates=indexData?.dates||[];
  if(!dates.includes(activeDate))activeDate=dates.includes(today)?today:dates[0];
  $('menuDate').replaceChildren(...dates.map(date=>{const option=el('option',date===today?`Today · ${dateLabel(date)}`:dateLabel(date));option.value=date;return option;}));
  $('menuDate').value=activeDate;
  const i=dates.indexOf(activeDate);
  $('datePrev').disabled=i<=0;$('dateNext').disabled=i<0||i>=dates.length-1;$('dateToday').disabled=activeDate===today||!dates.includes(today);
  $('datePrev').onclick=()=>{if(i>0)changeDate(dates[i-1]);};
  $('dateNext').onclick=()=>{if(i>=0&&i<dates.length-1)changeDate(dates[i+1]);};
  $('dateToday').onclick=()=>{if(dates.includes(today))changeDate(today);};
  $('menuDate').onchange=()=>changeDate($('menuDate').value);
}
function renderOverview(){
  const root=$('diningOverview');root.replaceChildren();if(!dayData)return;
  const locations=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||rank(a)-rank(b)||a.name.localeCompare(b.name));
  for(const location of locations){
    const s=serving(location),card=document.createElement('button');
    card.type='button';card.className=`dining-card status-${s.state} ${location.id===selectedHall?'selected':''}`;
    const top=el('div','','card-top');top.append(el('strong',location.name),el('span',s.state==='scheduled'?'future':s.state,'status-badge'));card.append(top,el('p',servingText(location),'serving-line'));
    if(location.status!=='live')card.append(el('p',location.message||'No menu posted for this date.','card-message'));
    else if(s.state==='limited')card.append(el('p','Limited service now. Open this place to plan the next full meal.','card-message'));
    else{
      const meal=relevantMeal(location);
      if(meal){
        card.append(el('span',meal.name,'preview-label'));
        const preview=el('div','','food-preview');meal.items.slice(0,3).forEach(item=>preview.append(el('span',item.name)));card.append(preview);
      }
      if(location.detailPath)card.append(el('small','Personalized plates available'));
    }
    card.onclick=()=>selectLocation(location.id,true);root.append(card);
  }
  $('locationCount').textContent=`${dayData.locations.filter(x=>x.status==='live').length} places with a posted menu for this date`;
}
function renderHallSelect(){
  if(!dayData)return;
  const sorted=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||a.name.localeCompare(b.name));
  $('hall').replaceChildren(...sorted.map(location=>{const o=el('option',location.name);o.value=location.id;return o;}));
  $('hall').value=selectedHall;$('hall').onchange=()=>selectLocation($('hall').value,false);
}
function renderSchedule(location){
  const root=$('selectedSchedule');root.replaceChildren();const schedule=location?.schedule;
  if(schedule===null){root.append(el('p','Serving hours are not built in for this café or market yet. The posted menu is still shown below.','muted'));return;}
  if(!schedule?.length){root.append(el('p','Closed on the regular serving schedule for this day.','muted'));return;}
  const strip=el('div','','schedule-strip');
  schedule.forEach(item=>{const block=el('div','',item.limited?'schedule-slot limited':'schedule-slot');block.append(el('strong',item.name),el('span',`${timeLabel(item.start)} to ${timeLabel(item.end)}`));strip.append(block);});
  root.append(strip);
}
function chooseMeal(location){
  if(selectedMeal&&location.meals.some(m=>m.name===selectedMeal))return selectedMeal;
  if(activeDate===today&&location.bulk?.meal&&location.meals.some(m=>m.name===location.bulk.meal))return location.bulk.meal;
  return relevantMeal(location)?.name||location.meals?.[0]?.name||'';
}
function renderMealTabs(location){
  const names=location?.meals?.map(m=>m.name)||[];selectedMeal=chooseMeal(location);
  $('mealTabs').replaceChildren(...names.map(name=>{const b=el('button',name,`meal-tab ${name===selectedMeal?'active':''}`);b.type='button';b.onclick=()=>{selectedMeal=name;renderSelectedDetail();};return b;}));
  $('menuMeal').replaceChildren(...names.map(name=>{const o=el('option',name);o.value=name;return o;}));
  $('menuMeal').value=selectedMeal;$('menuMeal').onchange=()=>{selectedMeal=$('menuMeal').value;renderSelectedDetail();};
}
function renderProfileSummary(){
  const root=$('profileSummary');root.replaceChildren();
  for(const text of profileChips())root.append(el('span',text,'profile-chip'));
}
function quantityLabel(quantity){
  if(quantity===0.25)return '¼ serving';if(quantity===0.5)return '½ serving';if(quantity===0.75)return '¾ serving';if(quantity===1)return '1 serving';if(quantity===1.5)return '1½ servings';if(quantity===2)return '2 servings';return `${quantity} servings`;
}
function renderPlateOption(option,index){
  const card=el('article','','plate-option');
  const head=el('div','','plate-option-head');
  const title=el('div','','plate-option-title');title.append(el('span',index===0?'BEST MATCH':`OPTION ${index+1}`,'plate-rank'),el('strong',`${Math.round(option.calories)} kcal · ${Math.round(option.protein)} g protein`));
  head.append(title);card.append(head,el('p',option.reason,'plate-reason'));
  const parts=el('div','','plate-parts');
  for(const part of option.parts){
    const row=el('div','','plate-part');
    const qty=el('span',quantityLabel(part.quantity),'plate-qty');
    const copy=el('div','','plate-part-copy');
    const link=nutritionLink(part.item);
    const name=link?el('a',part.item.name,'plate-food-name'):el('strong',part.item.name,'plate-food-name');
    if(link){name.href=link;name.target='_blank';name.rel='noreferrer';}
    copy.append(name);
    const meta=[];
    if(part.item.serving)meta.push(`base serving: ${part.item.serving}`);
    meta.push(`${Math.round(Number(part.item.calories)*part.quantity)} kcal`);
    meta.push(`${Math.round(Number(part.item.protein)*part.quantity)} g protein`);
    copy.append(el('small',meta.join(' · ')));
    row.append(qty,copy);parts.append(row);
  }
  card.append(parts);return card;
}
function renderMealPlan(location){
  const root=$('bulkPlan');root.replaceChildren();renderProfileSummary();
  const goals=dailyGoals(),mealForPlan=selectedMeal||location?.bulk?.meal||location?.meals?.[0]?.name;
  const target=location&&mealForPlan?mealTargets(location,mealForPlan):null;
  $('goalModeBadge').textContent=goalModeLabel();
  $('bulkTitle').textContent=location?`What to get at ${location.name}`:'What to get';
  $('bulkTargetBadge').textContent=target?`${target.calories} kcal · ${target.protein} g protein`:'Set your plan';
  $('dailyGoalSummary').textContent=goals?`${goals.calories} kcal/day · ${goals.protein} g protein/day · ${dietLabel()}`:'Complete My Plan to personalize meals.';

  if(activeDate!==today){$('bulkSubtitle').textContent='Future menus are for browsing. Personalized plate building is focused on today so nutrition stays tied to the current labels.';root.append(el('p','Return to Today for station plate recommendations.','menu-empty'));return;}
  if(location?.detailPath&&!location.detailLoaded){
    $('bulkSubtitle').textContent='Menu names are already loaded. Pulling nutrition only for this place now.';
    const box=el('div','','bulk-loading');box.append(el('span','','loading-dot'),el('strong','Loading nutrition for personalized plates'));root.append(box);return;
  }
  const meal=location?.meals?.find(m=>m.name===mealForPlan);
  if(!meal||!target){root.append(el('p','No detailed meal data is available for a recommendation here yet.','menu-empty'));return;}

  const stations=generateStationPlates({items:meal.items,profile:profile(),target,mealName:meal.name,maxPerStation:2});
  $('bulkSubtitle').textContent=`Showing cohesive plate options from ${meal.name}. Foods stay grouped by station whenever the menu supports it.`;
  if(!stations.length){
    root.append(el('p','No plate could be recommended from the published labels after applying your eating style, allergies, and avoid-food list. The full menu is below, but nothing filtered out will be suggested as safe.','menu-empty'));return;
  }

  const list=el('div','','station-plan-list');
  for(const station of stations){
    const section=el('section','','station-plan');
    const header=el('div','','station-plan-head');header.append(el('div','', 'station-plan-title'));
    header.firstChild.append(el('span','STATION','station-kicker'),el('h3',station.section));
    header.append(el('span',station.theme.replace(/\b\w/g,c=>c.toUpperCase()),'station-theme'));
    section.append(header);
    const options=el('div','','plate-options');station.options.forEach((option,index)=>options.append(renderPlateOption(option,index)));section.append(options);list.append(section);
  }
  root.append(list);
}
function renderMenuItems(location){
  const root=$('menuItems');root.replaceChildren();const meal=location?.meals?.find(m=>m.name===selectedMeal);
  if(!meal){root.append(el('p','No menu is posted for this meal.','menu-empty'));return;}
  const query=$('menuSearch').value.trim().toLowerCase(),safeOnly=$('profileSafeOnly').checked;
  if(safeOnly&&profile().allergens.length&&location.detailPath&&!location.detailLoaded){root.append(el('p','Loading UCSC nutrition labels before applying your allergy filters.','menu-empty'));return;}
  let items=meal.items.filter(item=>item.name.toLowerCase().includes(query));
  if(safeOnly)items=items.filter(item=>profileMatches(item,{requireAllergenData:profile().allergens.length>0}));
  if($('menuSort').value==='alpha')items=[...items].sort((a,b)=>a.name.localeCompare(b.name));
  if(!items.length){root.append(el('p',meal.items.length?'No foods match these filters.':'No items are posted for this meal.','menu-empty'));return;}
  root.append(el('p',`${items.length} foods · ${meal.name} · ${dateLabel(activeDate)}`,'menu-count'));
  const groups=new Map();
  for(const item of items){const key=$('menuSort').value==='alpha'?'All foods':(item.section||'Menu');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  for(const [section,foods] of groups){
    const wrap=el('section','','station-section');wrap.append(el('h3',section));const grid=el('div','','station-items');
    foods.forEach(item=>{
      const row=el('div','','static-food-row'),left=el('div','','food-copy'),link=nutritionLink(item);
      const name=link?el('a',item.name,'static-food-name'):el('span',item.name,'static-food-name');if(link){name.href=link;name.target='_blank';name.rel='noreferrer';name.title='Open exact UCSC nutrition label';}left.append(name);
      const meta=el('div','','food-meta');if(item.serving)meta.append(el('span',item.serving));if(item.calories!==undefined&&item.calories!==null)meta.append(el('span',`${Math.round(Number(item.calories))} kcal`));if(item.protein!==undefined&&item.protein!==null)meta.append(el('span',`${Math.round(Number(item.protein))} g protein`));if(item.diet==='vegan'||item.diet==='vegetarian')meta.append(el('span',item.diet==='vegan'?'Vegan':'Vegetarian',`diet-tag ${item.diet}`));if(link)meta.append(el('span','Nutrition ↗','nutrition-inline'));left.append(meta);row.append(left);grid.append(row);
    });wrap.append(grid);root.append(wrap);
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
function renderSelectedDetail(){
  const location=locationById(selectedHall);if(!location)return;
  $('selectedLocationName').textContent=location.name;$('selectedLocationStatus').textContent=servingText(location);renderSchedule(location);renderMealTabs(location);
  $('menuStatus').textContent=location.status==='live'?detailMessage(location):(location.message||'No menu posted for this date.');$('menuLink').href=location.source||'#';$('menuUpdated').textContent=snapshotAge();renderMealPlan(location);renderMenuItems(location);
}
function ensureSelection(){
  if(!dayData?.locations?.length)return;
  if(!selectedHall||!dayData.locations.some(x=>x.id===selectedHall))selectedHall=[...dayData.locations].sort((a,b)=>locationGroup(a)-locationGroup(b)||rank(a)-rank(b)||a.name.localeCompare(b.name))[0].id;
}
function renderPage(){ensureSelection();renderDates();updateClock();renderOverview();renderHallSelect();renderSelectedDetail();$('dashboardStatus').textContent=`Menus loaded. Snapshot updated ${new Date(indexData.generatedAt).toLocaleString()}.`;}
async function hydrateSelectedLocation(bust=false){
  const location=locationById(selectedHall);if(!location?.detailPath||location.detailLoaded)return;
  const token=++detailToken;renderMealPlan(location);
  try{const detail=await ensureDetail(location,bust);if(token!==detailToken||selectedHall!==location.id)return;applyDetail(location,detail);renderSelectedDetail();}
  catch(error){if(token!==detailToken)return;$('bulkSubtitle').textContent='Nutrition details could not load for this location.';$('bulkPlan').replaceChildren(el('p','The menu is still usable below. Try refreshing later for personalized plate recommendations.','menu-empty'));}
}
async function selectLocation(id,scroll){selectedHall=id;selectedMeal=null;savePrefs();renderOverview();renderHallSelect();renderSelectedDetail();hydrateSelectedLocation();if(scroll)$('bulkPlanner').scrollIntoView({behavior:'smooth',block:'start'});}
async function changeDate(date){
  if(date===activeDate&&dayData)return;activeDate=date;selectedMeal=null;$('dashboardStatus').textContent='Loading this date…';
  try{dayData=await loadDay(date);renderPage();hydrateSelectedLocation();}catch(error){$('dashboardStatus').textContent=`Menus unavailable: ${error.message}`;}
}
function prefetchDiningHalls(){
  const work=async()=>{const halls=(dayData?.locations||[]).filter(location=>DINING_HALL_IDS.has(location.id)&&location.detailPath&&location.id!==selectedHall);for(const hall of halls){try{await ensureDetail(hall);}catch{}}};
  if('requestIdleCallback'in window)requestIdleCallback(()=>work(),{timeout:3000});else setTimeout(work,1200);
}
async function loadData(bust=false){
  $('refresh').disabled=true;$('dashboardStatus').textContent='Loading menu list…';
  try{
    indexData=await fetchJSON('./data/index.json',bust);const dates=indexData.dates||[];if(!dates.length)throw new Error('No posted menu dates are available.');
    activeDate=activeDate&&dates.includes(activeDate)?activeDate:(dates.includes(today)?today:dates[0]);if(bust){dayCache.clear();detailCache.clear();detailPromises.clear();}
    dayData=await loadDay(activeDate,bust);renderPage();await hydrateSelectedLocation(bust);prefetchDiningHalls();
  }catch(error){$('dashboardStatus').textContent=`Dining menus unavailable: ${error.message}`;$('diningOverview').replaceChildren(el('p','The published menu snapshot could not be loaded. Try again in a moment.','menu-empty'));$('bulkPlan').replaceChildren(el('p','The meal helper needs the menu snapshot before it can build plates.','menu-empty'));}
  finally{$('refresh').disabled=false;}
}

function init(){
  $('profileSafeOnly').checked=prefs.safeOnly!==false;$('menuSort').value=prefs.sort||'station';
  $('profileSafeOnly').onchange=()=>{savePrefs();if(dayData)renderMenuItems(locationById(selectedHall));};
  $('menuSort').onchange=()=>{savePrefs();if(dayData)renderMenuItems(locationById(selectedHall));};
  $('menuSearch').oninput=()=>{if(dayData)renderMenuItems(locationById(selectedHall));};
  $('refresh').onclick=()=>loadData(true);
  const strip=$('diningOverview');
  strip.addEventListener('wheel',event=>{
    if(strip.scrollWidth<=strip.clientWidth)return;
    const movement=Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX;
    if(!movement)return;
    const atStart=strip.scrollLeft<=1&&movement<0,atEnd=strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-2&&movement>0;
    if(atStart||atEnd)return;
    event.preventDefault();strip.scrollLeft+=movement;
  },{passive:false});
  updateClock();setInterval(()=>{updateClock();if(dayData&&activeDate===today){renderOverview();renderSelectedDetail();}},60*1000);loadData();
}

if(needsSetup)location.replace('./goals.html?setup=1');
else init();
