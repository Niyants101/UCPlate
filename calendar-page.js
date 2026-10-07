import {normalizeGoogleEvents,buildMealSuggestions,formatMinutes} from './calendar-context.mjs';

const PREF='college-bulk-pages-v2';
const TOKEN_KEY='college-fuel-google-calendar-token';
const CLIENT_OVERRIDE_KEY='college-fuel-google-client-id';
const FOCUS_KEY='college-fuel-calendar-focus';
const TZ='America/Los_Angeles';
const $=id=>document.getElementById(id);
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};

let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}
if(!prefs.onboardingComplete)location.replace('./goals.html?setup=1');

let indexData=null;
let selectedDate=null;
let events=[];
let googleScriptPromise=null;

function campusDate(now=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function dateTitle(date){
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'}).format(new Date(`${date}T12:00:00Z`));
}
function readToken(){
  try{
    const token=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');
    if(!token?.accessToken||Number(token.expiresAt)<=Date.now()+30000)return null;
    return token;
  }catch{return null;}
}
function saveToken(response){
  const expiresIn=Math.max(60,Number(response.expires_in)||3600);
  sessionStorage.setItem(TOKEN_KEY,JSON.stringify({accessToken:response.access_token,expiresAt:Date.now()+expiresIn*1000}));
}
function clearToken(){sessionStorage.removeItem(TOKEN_KEY);}
function clientId(){return String(window.COLLEGE_FUEL_GOOGLE_CLIENT_ID||localStorage.getItem(CLIENT_OVERRIDE_KEY)||'').trim();}

function setConnectionState(){
  const token=readToken(),configured=Boolean(clientId());
  $('calendarSetupNotice').hidden=configured;
  $('disconnectGoogle').hidden=!token;
  if(token){
    $('calendarState').textContent='CONNECTED';
    $('calendarState').classList.add('connected');
    $('calendarConnectTitle').textContent='Google Calendar connected';
    $('calendarConnectText').textContent='Read-only access is active for this browser session. Refresh whenever your schedule changes.';
    $('connectGoogle').textContent='Reconnect Google';
  }else{
    $('calendarState').textContent=configured?'READY TO CONNECT':'SETUP NEEDED';
    $('calendarState').classList.remove('connected');
    $('calendarConnectTitle').textContent=configured?'Connect Google Calendar':'Google connection needs one-time setup';
    $('calendarConnectText').textContent=configured?'College Fuel will only request read-only calendar access.':'The meal timing page is ready, but the site owner still needs to add a Google OAuth Web client ID.';
    $('connectGoogle').textContent='Connect Google Calendar';
  }
}

function loadGoogleIdentity(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(googleScriptPromise)return googleScriptPromise;
  googleScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('Google sign-in could not load.'));
    document.head.append(script);
  });
  return googleScriptPromise;
}

async function connectGoogle(){
  const id=clientId();
  if(!id){
    $('calendarSetupNotice').hidden=false;
    $('calendarSetupNotice').scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  $('connectGoogle').disabled=true;$('connectGoogle').textContent='Opening Google…';
  try{
    await loadGoogleIdentity();
    await new Promise((resolve,reject)=>{
      const tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:id,
        scope:'https://www.googleapis.com/auth/calendar.events.readonly',
        callback:response=>{
          if(response.error){reject(new Error(response.error_description||response.error));return;}
          saveToken(response);resolve();
        }
      });
      tokenClient.requestAccessToken({prompt:readToken()?'':'consent'});
    });
    setConnectionState();
    await loadCalendarDay(true);
  }catch(error){
    $('calendarConnectText').textContent=`Could not connect: ${error.message}`;
  }finally{
    $('connectGoogle').disabled=false;
    setConnectionState();
  }
}

async function fetchGoogleEvents(date){
  const token=readToken();
  if(!token)throw new Error('Google Calendar is not connected.');
  const start=new Date(`${date}T00:00:00Z`),end=new Date(start.getTime()+2*86400000);
  const url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.search=new URLSearchParams({
    timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',timeZone:TZ
  });
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token.accessToken}`}});
  if(response.status===401){clearToken();setConnectionState();throw new Error('Google Calendar access expired. Reconnect to continue.');}
  if(!response.ok)throw new Error('Google Calendar could not be read.');
  const data=await response.json();
  return normalizeGoogleEvents(data.items||[],date);
}

async function fetchJSON(path){
  const response=await fetch(path,{cache:'default'});
  if(!response.ok)throw new Error(`Could not load ${path}.`);
  return response.json();
}

function eventCard(event){
  const card=el('article','','timeline-event');
  const time=el('div',`${formatMinutes(event.start)}–${formatMinutes(event.end)}`,'timeline-time');
  const copy=el('div','','timeline-copy');copy.append(el('strong',event.title));
  if(event.location)copy.append(el('span',event.location));
  card.append(time,copy);return card;
}

function suggestionCard(candidate,index){
  const card=el('article','',`meal-window-card ${index===0?'best':''}`);
  const top=el('div','','meal-window-top');top.append(el('strong',candidate.meal),el('span',`${formatMinutes(candidate.start)}–${formatMinutes(candidate.end)}`,'meal-window-time'));card.append(top);
  const context=[];
  if(candidate.previous)context.push(`after ${candidate.previous.title}`);
  if(candidate.next)context.push(`before ${candidate.next.title}`);
  card.append(el('p',`${candidate.locationName}${context.length?` · ${context.join(' · ')}`:''}`));
  const meta=el('div','','meal-window-meta');
  meta.append(el('span',`${candidate.duration} min window`),el('span','Serving schedule checked'));
  if(candidate.locationId===prefs.hall)meta.append(el('span','Your saved dining choice'));
  card.append(meta);
  const actions=el('div','','meal-window-actions');
  const open=el('a','Plan this meal →','button-link');open.href='./#bulkPlanner';
  open.addEventListener('click',()=>{
    prefs={...prefs,hall:candidate.locationId};
    localStorage.setItem(PREF,JSON.stringify(prefs));
    sessionStorage.setItem(FOCUS_KEY,JSON.stringify({date:selectedDate,hall:candidate.locationId,meal:candidate.servingName}));
  });
  actions.append(open);card.append(actions);return card;
}

function renderDay(day){
  $('calendarDateTitle').textContent=dateTitle(selectedDate);
  $('eventCount').textContent=readToken()?`${events.length} timed event${events.length===1?'':'s'}`:'Connect Google to load classes';
  const timeline=$('dayTimeline');timeline.replaceChildren();
  if(!readToken())timeline.append(el('p','Connect Google Calendar to see classes and events here.','menu-empty'));
  else if(!events.length)timeline.append(el('p','No timed events found for this day.','menu-empty'));
  else events.forEach(event=>timeline.append(eventCard(event)));

  const usableLocations=(day?.locations||[]).filter(location=>location.status==='live'&&Array.isArray(location.schedule)).map(location=>({
    ...location,
    schedule:location.schedule.filter(period=>period.limited||(location.meals||[]).some(meal=>meal.name.toLowerCase()===period.name.toLowerCase()))
  }));
  const suggestions=readToken()?buildMealSuggestions({events,locations:usableLocations,preferredLocationId:prefs.hall||null}):[];
  $('windowCount').textContent=readToken()?`${suggestions.length} suggested meal window${suggestions.length===1?'':'s'}`:'Waiting for your day';
  $('locationLogic').textContent=prefs.hall?'Saved dining choice + serving schedule':'Serving schedule only';
  const root=$('mealWindows');root.replaceChildren();
  if(!readToken())root.append(el('p','Connect Google Calendar and College Fuel will fit meals between your classes.','menu-empty'));
  else if(!day)root.append(el('p','UCSC has no posted menu snapshot for this date yet, so meal timing is not available.','menu-empty'));
  else if(!suggestions.length)root.append(el('p','No full meal window of at least 25 minutes fits between your events and the posted serving schedule.','menu-empty'));
  else suggestions.forEach((candidate,index)=>root.append(suggestionCard(candidate,index)));

  $('mealWindowNote').textContent=readToken()
    ? 'Where is based on your saved/last dining choice and serving availability. Distance is not being guessed yet.'
    : 'Connect Google Calendar to turn your classes into meal windows.';
}

async function loadCalendarDay(force=false){
  selectedDate=$('calendarDate').value||campusDate();
  $('calendarDateTitle').textContent=dateTitle(selectedDate);
  $('refreshCalendar').disabled=true;
  $('dayTimeline').replaceChildren(el('div','Loading your day…','calendar-loading'));
  try{
    let day=null;
    if(indexData?.dates?.includes(selectedDate))day=await fetchJSON(`./data/dates/${selectedDate}.json`);
    if(readToken())events=await fetchGoogleEvents(selectedDate);else events=[];
    renderDay(day);
  }catch(error){
    $('dayTimeline').replaceChildren(el('p',error.message,'menu-empty'));
    $('mealWindows').replaceChildren(el('p','Meal timing could not be calculated until the calendar loads.','menu-empty'));
  }finally{$('refreshCalendar').disabled=false;}
}

async function init(){
  selectedDate=campusDate();$('calendarDate').value=selectedDate;
  try{indexData=await fetchJSON('./data/index.json');}catch{indexData={dates:[]};}
  setConnectionState();
  $('calendarDate').addEventListener('change',()=>loadCalendarDay());
  $('connectGoogle').addEventListener('click',connectGoogle);
  $('disconnectGoogle').addEventListener('click',()=>{clearToken();events=[];setConnectionState();loadCalendarDay();});
  $('refreshCalendar').addEventListener('click',()=>loadCalendarDay(true));
  $('saveDeveloperClientId').addEventListener('click',()=>{
    const value=$('developerClientId').value.trim();
    if(!/\.apps\.googleusercontent\.com$/.test(value)){
      $('calendarConnectText').textContent='That does not look like a Google OAuth client ID.';return;
    }
    localStorage.setItem(CLIENT_OVERRIDE_KEY,value);setConnectionState();$('calendarSetupNotice').hidden=true;
  });
  const override=localStorage.getItem(CLIENT_OVERRIDE_KEY);if(override)$('developerClientId').value=override;
  await loadCalendarDay();
}

init();
