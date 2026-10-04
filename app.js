import {getServingStatus} from './dining-hours.mjs';

const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const TZ='America/Los_Angeles';
const PREF='college-bulk-pages-v1';

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
function savePrefs(){
  try{localStorage.setItem(PREF,JSON.stringify({hall:selectedHall,vegetarian:$('vegetarianOnly').checked,sort:$('menuSort').value}));}catch{}
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
  return 'Menu available · serving hours not built in';
}
function relevantMeal(location){
  if(!location.meals?.length)return null;
  const s=serving(location);
  if(s.state==='open'){
    const exact=location.meals.find(m=>m.name.toLowerCase()===s.label.toLowerCase());
    if(exact)return exact;
  }
  if(s.state==='limited'&&s.next){
    const next=location.meals.find(m=>m.name.toLowerCase()===s.next.name.toLowerCase());
    if(next)return next;
  }
  return location.meals[0];
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
    if(location.status!=='live'){
      card.append(el('p',location.message||'No menu posted for this date.','card-message'));
    }else if(s.state==='limited'){
      card.append(el('p','Limited entrée options may include grill, pizza, salad bar, beverages and desserts.','card-message'));
    }else{
      const meal=relevantMeal(location);
      if(meal){
        card.append(el('span',meal.name,'preview-label'));
        const preview=el('div','','food-preview');
        meal.items.slice(0,4).forEach(item=>preview.append(el('span',item.name)));
        card.append(preview);
        if(meal.items.length>4)card.append(el('small',`+ ${meal.items.length-4} more in ${meal.name}`));
      }else if(location.meals?.length){
        card.append(el('small',`Posted meals: ${location.meals.map(m=>m.name).join(' · ')}`));
      }
    }
    card.onclick=()=>{selectedHall=location.id;selectedMeal=null;savePrefs();render();};
    root.append(card);
  }
  $('locationCount').textContent=`${day.locations.filter(x=>x.status==='live').length} locations with a posted menu for this date`;
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
  if(schedule===null){root.append(el('p','Serving hours are not built in for this café or market yet. The posted menu is still shown below.','muted'));return;}
  if(!schedule?.length){root.append(el('p','Closed on the regular serving schedule for this day.','muted'));return;}
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
  if(!meal){root.append(el('p','No menu is posted for this meal.','menu-empty'));return;}
  const query=$('menuSearch').value.trim().toLowerCase();
  let items=meal.items.filter(item=>(!$('vegetarianOnly').checked||['vegan','vegetarian'].includes(item.diet))&&item.name.toLowerCase().includes(query));
  if($('menuSort').value==='alpha')items=[...items].sort((a,b)=>a.name.localeCompare(b.name));
  if(!items.length){root.append(el('p',meal.items.length?'No foods match these filters.':'No items are posted for this meal.','menu-empty'));return;}
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
      const name=el('span',item.name,'static-food-name');
      const tag=el('span',item.diet==='vegan'?'Vegan':item.diet==='vegetarian'?'Vegetarian':'',`diet-tag ${item.diet}`);
      row.append(name);
      if(tag.textContent)row.append(tag);
      grid.append(row);
    });
    wrap.append(grid);root.append(wrap);
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
    render();
  }catch(error){
    $('dashboardStatus').textContent=`Dining menus unavailable: ${error.message}`;
    $('diningOverview').replaceChildren(el('p','The published menu snapshot could not be loaded. Try again in a moment.','menu-empty'));
  }finally{
    $('refresh').disabled=false;
  }
}

$('vegetarianOnly').checked=prefs.vegetarian===true;
$('menuSort').value=prefs.sort||'station';
selectedHall=prefs.hall||null;
$('vegetarianOnly').onchange=()=>{savePrefs();renderMenuItems(locationById(selectedHall));};
$('menuSort').onchange=()=>{savePrefs();renderMenuItems(locationById(selectedHall));};
$('menuSearch').oninput=()=>renderMenuItems(locationById(selectedHall));
$('refresh').onclick=()=>loadData(true);

updateClock();
setInterval(()=>{updateClock();if(activeDate===today&&data)render();},60*1000);
loadData();
