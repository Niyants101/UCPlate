const $=id=>document.getElementById(id);
const el=(tag,value='',cls='')=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const TZ='America/Los_Angeles';
const prefKey='college-bulk-menu-v2';
let prefs={};try{prefs=JSON.parse(localStorage.getItem(prefKey)||'{}');}catch{prefs={};}
let dashboard=null,menu=null,selectedHall=prefs.hall||null,selectedMeal=null,dashboardSeq=0,menuSeq=0,dashboardController,menuController;

function campusParts(now=new Date()){
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {...p,date:`${p.year}-${p.month}-${p.day}`};
}
const today=campusParts().date;
let activeDate=today;
const dateLabel=date=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00Z`));
const timeLabel=time=>{if(!time)return'';let [h,m]=time.split(':').map(Number);const suffix=h>=12?'PM':'AM';h=h%12||12;return `${h}${m?`:${String(m).padStart(2,'0')}`:''} ${suffix}`;};
function savePrefs(){try{localStorage.setItem(prefKey,JSON.stringify({hall:selectedHall,vegetarianOnly:$('vegetarianOnly')?.checked||false,sort:$('menuSort')?.value||'station'}));}catch{}}

function updateClock(){
  const p=campusParts(),same=p.date===today;
  if($('campusClock'))$('campusClock').textContent=`${p.weekday.toUpperCase()} · ${new Intl.DateTimeFormat('en-US',{timeZone:TZ,month:'long',day:'numeric'}).format(new Date())} · ${Number(p.hour)%12||12}:${p.minute} ${Number(p.hour)>=12?'PM':'AM'}`;
  if(same&&activeDate===today&&$('dateContext'))$('dateContext').textContent='RIGHT NOW';
}

function servingRank(location){return ({open:0,limited:1,unknown:2,scheduled:3,closed:4}[location.serving?.state]??5)+(location.status==='live'?0:10);}
function servingText(location){
  const s=location.serving||{};
  if(s.state==='open')return `${s.label} until ${timeLabel(s.end)}`;
  if(s.state==='limited')return `Continuous Dining until ${timeLabel(s.end)} · limited options`;
  if(s.state==='closed'){
    if(!s.next)return 'Closed on regular schedule';
    const when=s.next.date===activeDate?'today':s.next.date===today?'today':s.next.date===nextDate(today)?'tomorrow':dateLabel(s.next.date);
    return `Closed · ${s.next.name} ${when} at ${timeLabel(s.next.start)}`;
  }
  if(s.state==='scheduled')return s.schedule?.length?`Regular schedule · ${s.schedule[0].name} starts ${timeLabel(s.schedule[0].start)}`:'Closed on regular schedule';
  return 'Menu available · serving hours not built in';
}
function nextDate(date){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function previewMeal(location){
  if(!location.meals?.length)return null;
  if(location.serving?.state==='limited')return null;
  if(location.serving?.state==='open')return location.meals.find(m=>m.name.toLowerCase()===location.serving.label.toLowerCase())||location.meals[0];
  if(location.serving?.state==='closed')return null;
  return location.meals[0];
}
function bestMeal(location){
  if(!location?.meals?.length)return '';
  if(location.serving?.state==='open'){
    const hit=location.meals.find(m=>m.name.toLowerCase()===location.serving.label.toLowerCase());if(hit)return hit.name;
  }
  if(location.serving?.state==='limited'&&location.serving.next){
    const hit=location.meals.find(m=>m.name.toLowerCase()===location.serving.next.name.toLowerCase());if(hit)return hit.name;
  }
  if(location.serving?.state==='closed'&&location.serving.next?.date===activeDate){
    const hit=location.meals.find(m=>m.name.toLowerCase()===location.serving.next.name.toLowerCase());if(hit)return hit.name;
  }
  return location.meals[0].name;
}

function renderDatePicker(){
  const select=$('menuDate');if(!select||!dashboard)return;
  const dates=[...new Set([activeDate,...dashboard.availableDates.filter(d=>d>=today)])].sort();
  select.replaceChildren(...dates.map(date=>{const o=el('option',date===today?`Today · ${dateLabel(date)}`:dateLabel(date));o.value=date;return o;}));
  select.value=activeDate;
  const index=dates.indexOf(activeDate);$('datePrev').disabled=index<=0;$('dateNext').disabled=index<0||index>=dates.length-1;
  $('datePrev').onclick=()=>{if(index>0){activeDate=dates[index-1];loadDashboard();}};
  $('dateNext').onclick=()=>{if(index>=0&&index<dates.length-1){activeDate=dates[index+1];loadDashboard();}};
  $('dateToday').disabled=activeDate===today;
  $('dateToday').onclick=()=>{activeDate=today;loadDashboard();};
  select.onchange=()=>{activeDate=select.value;loadDashboard();};
  $('dateContext').textContent=activeDate===today?'RIGHT NOW':'BROWSING AHEAD';
}

function renderOverview(){
  const root=$('diningOverview');root.replaceChildren();if(!dashboard)return;
  const rows=[...dashboard.locations].sort((a,b)=>servingRank(a)-servingRank(b)||a.name.localeCompare(b.name));
  for(const location of rows){
    const card=document.createElement('button');card.type='button';card.className=`dining-card status-${location.serving?.state||'unknown'} ${location.id===selectedHall?'selected':''}`;card.dataset.hall=location.id;
    const top=el('div','','card-top'),name=el('strong',location.name),badge=el('span',(location.serving?.state||'unknown').replace('scheduled','future'),'status-badge');top.append(name,badge);card.append(top);
    card.append(el('p',servingText(location),'serving-line'));
    if(location.status!=='live')card.append(el('p',location.message||'No menu posted for this date.','card-message'));
    else if(location.serving?.state==='limited')card.append(el('p','Limited entrée options may include grill, pizza, salad bar, beverages and desserts.','card-message'));
    else{
      const meal=previewMeal(location);
      if(meal){card.append(el('span',meal.name,'preview-label'));const preview=el('div','','food-preview');for(const item of meal.items.slice(0,4))preview.append(el('span',item.name));card.append(preview);if(meal.items.length>4)card.append(el('small',`+ ${meal.items.length-4} more in ${meal.name}`));}
      else if(location.meals.length)card.append(el('small',`Posted meals: ${location.meals.map(m=>m.name).join(' · ')}`));
    }
    card.onclick=()=>selectLocation(location.id);
    root.append(card);
  }
  $('locationCount').textContent=`${dashboard.locations.filter(x=>x.status==='live').length} locations with a menu for this date`;
}

function renderHallSelect(){
  const select=$('hall');if(!select||!dashboard)return;
  select.replaceChildren(...dashboard.locations.map(location=>{const o=el('option',location.name);o.value=location.id;return o;}));
  if(selectedHall&&dashboard.locations.some(x=>x.id===selectedHall))select.value=selectedHall;
  select.onchange=()=>selectLocation(select.value);
}
function renderSchedule(location){
  const root=$('selectedSchedule');root.replaceChildren();
  if(location.schedule===null){root.append(el('p','Serving hours are not built in for this café or market yet. The menu below still comes from UCSC.','muted'));return;}
  if(!location.schedule.length){root.append(el('p','Closed on the regular serving schedule for this day.','muted'));return;}
  const list=el('div','','schedule-strip');
  for(const item of location.schedule){const block=el('div','',item.limited?'schedule-slot limited':'schedule-slot');block.append(el('strong',item.name),el('span',`${timeLabel(item.start)} to ${timeLabel(item.end)}`));list.append(block);}root.append(list);
}
function cautionFor(location,mealName){
  const s=location.serving||{};
  if(activeDate!==today)return `Showing ${mealName} for ${dateLabel(activeDate)}.`;
  if(s.state==='limited')return `Continuous Dining is happening now. ${mealName} is shown for planning, but the limited selection may be different.`;
  if(s.state==='closed')return `This location is closed right now on its regular schedule. ${mealName} is shown so you can plan ahead.`;
  if(s.state==='unknown')return 'The menu is live, but this website does not have verified serving hours for this location yet.';
  return `${s.label} is happening now on the regular schedule.`;
}

async function selectLocation(id,mealName){
  const location=dashboard?.locations.find(x=>x.id===id);if(!location)return;
  selectedHall=id;selectedMeal=mealName||bestMeal(location);savePrefs();renderOverview();renderHallSelect();
  $('selectedLocationName').textContent=location.name;$('selectedLocationStatus').textContent=servingText(location);renderSchedule(location);
  if(!selectedMeal){menu=null;$('mealTabs').replaceChildren();$('menuItems').replaceChildren(el('p',location.message||'No menu is posted for this date.','menu-empty'));$('menuStatus').textContent=location.message||'No menu posted.';return;}
  await loadMenu(selectedMeal);
}

function renderMealTabs(names){
  const root=$('mealTabs');root.replaceChildren();
  for(const name of names){const b=el('button',name,`meal-tab ${name===selectedMeal?'active':''}`);b.type='button';b.onclick=()=>loadMenu(name);root.append(b);}
  const select=$('menuMeal');select.replaceChildren(...names.map(name=>{const o=el('option',name);o.value=name;return o;}));select.value=selectedMeal;select.onchange=()=>loadMenu(select.value);
}
function renderMenu(){
  const root=$('menuItems');root.replaceChildren();if(!menu)return;
  const query=$('menuSearch').value.trim().toLowerCase();
  let items=menu.items.filter(i=>(!$('vegetarianOnly').checked||['vegan','vegetarian'].includes(i.diet))&&i.name.toLowerCase().includes(query));
  const sort=$('menuSort').value;if(sort!=='station')items.sort((a,b)=>(b[sort]??-1)-(a[sort]??-1));
  if(!items.length){root.append(el('p',menu.items.length?'No foods match these filters.':'No items are published for this meal.','menu-empty'));return;}
  root.append(el('p',`${items.length} foods · ${menu.meal} · ${dateLabel(menu.date)}`,'menu-count'));
  const table=el('table','','nutrition-table'),head=el('thead'),row=el('tr');for(const title of ['Food & serving','Calories','Protein'])row.append(el('th',title));head.append(row);table.append(head);
  const body=el('tbody');let section;
  for(const item of items){
    if(sort==='station'&&section!==item.section){section=item.section;const r=el('tr','','station-row'),c=el('th',section||'Menu');c.colSpan=3;c.scope='rowgroup';r.append(c);body.append(r);}
    const tr=el('tr'),food=el('td'),a=el('a',item.name,'food-name');a.href=item.source;a.target='_blank';a.rel='noreferrer';food.append(a);
    const details=el('div','','food-meta');details.append(el('span',item.serving||'Serving not listed'),el('span',item.diet==='vegan'?'Vegan':item.diet==='vegetarian'?'Vegetarian':'No vegetarian marker',`diet-tag ${item.diet}`));if(sort!=='station'&&item.section)details.append(el('span',item.section));if(item.allergens?.length)details.append(el('span',`Allergens: ${item.allergens.join(', ')}`));food.append(details);
    tr.append(food,el('td',item.calories===null?'Unavailable':String(item.calories),'macro'),el('td',item.protein===null?'Unavailable':`${item.protein} g`,'macro protein'));body.append(tr);
  }
  table.append(body);const wrap=el('div','','table-scroll');wrap.append(table);root.append(wrap);
}
async function loadMenu(mealName){
  const location=dashboard?.locations.find(x=>x.id===selectedHall);if(!location)return;
  selectedMeal=mealName;const id=++menuSeq;menuController?.abort();menuController=new AbortController();menu=null;
  renderMealTabs(location.meals.map(m=>m.name));$('menuMeal').value=selectedMeal;$('menuItems').replaceChildren(el('p','Reading nutrition labels from UCSC…','menu-empty'));$('menuStatus').textContent=cautionFor(location,selectedMeal);$('refresh').disabled=true;$('menuLink').removeAttribute('href');
  try{
    const response=await fetch(`/api/menu?${new URLSearchParams({date:activeDate,hall:selectedHall,meal:selectedMeal})}`,{signal:menuController.signal}),result=await response.json();if(id!==menuSeq)return;if(!response.ok)throw new Error(result.message||'Could not load this menu.');
    menu=result;selectedMeal=result.meal||selectedMeal;renderMealTabs(result.meals||[]);$('menuStatus').textContent=`${cautionFor(location,selectedMeal)} ${result.message}`;$('menuLink').href=result.source;$('menuUpdated').textContent=`Updated ${new Date(result.fetchedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · cached for 10 minutes`;renderMenu();
  }catch(error){if(id!==menuSeq||error.name==='AbortError')return;$('menuStatus').textContent=`Menu unavailable: ${error.message}`;$('menuItems').replaceChildren(el('p','No old menu is being shown as live. Try another meal or date.','menu-empty'));}
  finally{if(id===menuSeq)$('refresh').disabled=false;}
}

async function loadDashboard(){
  const id=++dashboardSeq;dashboardController?.abort();dashboardController=new AbortController();
  $('dashboardStatus').textContent='Reading posted menus from UCSC…';$('diningOverview').replaceChildren(...Array.from({length:5},()=>el('div','','dining-card skeleton')));$('refresh').disabled=true;
  try{
    const response=await fetch(`/api/dashboard?date=${encodeURIComponent(activeDate)}`,{signal:dashboardController.signal}),result=await response.json();if(id!==dashboardSeq)return;if(!response.ok)throw new Error(result.message||'Could not load UCSC dining.');
    dashboard=result;renderDatePicker();
    if(!selectedHall||!dashboard.locations.some(x=>x.id===selectedHall&&x.status==='live'))selectedHall=[...dashboard.locations].sort((a,b)=>servingRank(a)-servingRank(b))[0]?.id||dashboard.locations[0]?.id||null;
    renderOverview();renderHallSelect();$('dashboardStatus').textContent=`Live menu index read ${new Date(result.fetchedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Regular serving schedules may not reflect special closures or real time changes.`;
    if(selectedHall)await selectLocation(selectedHall);
  }catch(error){if(id!==dashboardSeq||error.name==='AbortError')return;$('dashboardStatus').textContent=`Dining menus unavailable: ${error.message}`;$('diningOverview').replaceChildren(el('p','UCSC menu service could not be reached. No cached menu is being presented as current.','menu-empty'));}
  finally{if(id===dashboardSeq)$('refresh').disabled=false;}
}

$('vegetarianOnly').checked=prefs.vegetarianOnly===true;$('menuSort').value=prefs.sort||'station';
$('vegetarianOnly').onchange=()=>{savePrefs();renderMenu();};$('menuSort').onchange=()=>{savePrefs();renderMenu();};$('menuSearch').oninput=renderMenu;
$('refresh').onclick=()=>loadDashboard();
updateClock();setInterval(updateClock,30000);setInterval(()=>{if(document.visibilityState==='visible'&&activeDate===today)loadDashboard();},10*60*1000);
loadDashboard();
