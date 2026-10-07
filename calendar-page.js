import {normalizeGoogleEvents,buildMealSuggestions,formatMinutes} from './calendar-context.mjs';

const PREF='college-bulk-pages-v2';
const TOKEN_KEY='college-fuel-google-calendar-token';
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
let googleReady=false;
let googleBusy=false;
let oauthError='';
let tokenClient=null;

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
function clientId(){return String(window.MEALMAP_GOOGLE_CLIENT_ID||window.COLLEGE_FUEL_GOOGLE_CLIENT_ID||'').trim();}

function setConnectionState(){
  const token=readToken();
  const configured=Boolean(clientId());
  const connect=$('connectGoogle');
  $('disconnectGoogle').hidden=!token;

  if(token){
    $('calendarState').textContent='CONNECTED';
    $('calendarState').classList.add('connected');
    $('calendarConnectTitle').textContent='Google Calendar connected';
    $('calendarConnectText').textContent='Read-only access is active for this browser session. Refresh whenever your schedule changes.';
    connect.textContent=googleBusy?'Opening Google…':'Reconnect Google';
    connect.disabled=googleBusy||!googleReady;
    return;
  }

  $('calendarState').classList.remove('connected');
  if(!configured){
    $('calendarState').textContent='UNAVAILABLE';
    $('calendarConnectTitle').textContent='Google Calendar is temporarily unavailable';
    $('calendarConnectText').textContent='MealMap is missing its Google connection configuration.';
    connect.textContent='Google Calendar unavailable';
    connect.disabled=true;
    return;
  }

  if(oauthError){
    $('calendarState').textContent='NEEDS ATTENTION';
    $('calendarConnectTitle').textContent='Google Calendar did not open';
    $('calendarConnectText').textContent=oauthError;
    connect.textContent='Try Google again';
    connect.disabled=!googleReady||googleBusy;
    return;
  }

  if(!googleReady){
    $('calendarState').textContent='LOADING GOOGLE';
    $('calendarConnectTitle').textContent='Preparing Google Calendar';
    $('calendarConnectText').textContent='MealMap is loading Google sign-in so the account chooser can open immediately.';
    connect.textContent='Loading Google…';
    connect.disabled=true;
    return;
  }

  $('calendarState').textContent='READY TO CONNECT';
  $('calendarConnectTitle').textContent='Connect Google Calendar';
  $('calendarConnectText').textContent='Choose your Google account and allow read-only Calendar access. MealMap never asks for your Google password.';
  connect.textContent=googleBusy?'Opening Google…':'Connect Google Calendar';
  connect.disabled=googleBusy;
}

async function waitForGoogleIdentity(timeout=10000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(window.google?.accounts?.oauth2)return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Google sign-in could not load. Check your internet connection or browser content blockers, then refresh the page.');
}

async function handleTokenResponse(response){
  googleBusy=false;
  if(response?.error){
    oauthError=response.error_description||response.error||'Google did not complete sign-in.';
    setConnectionState();
    return;
  }
  if(!response?.access_token){
    oauthError='Google did not return Calendar access. Please try again.';
    setConnectionState();
    return;
  }
  oauthError='';
  saveToken(response);
  setConnectionState();
  await loadCalendarDay(true);
}

async function prepareGoogleIdentity(){
  if(!clientId()){
    setConnectionState();
    return;
  }
  try{
    await waitForGoogleIdentity();
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId(),
      scope:'https://www.googleapis.com/auth/calendar.events.readonly',
      callback:handleTokenResponse,
      error_callback:error=>{
        googleBusy=false;
        const type=error?.type||'';
        oauthError=type==='popup_failed_to_open'
          ? 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'
          : type==='popup_closed'
            ? 'The Google sign-in window was closed before Calendar was connected.'
            : `Google sign-in could not open${type?` (${type})`:''}. Please try again.`;
        setConnectionState();
      }
    });
    googleReady=true;
    oauthError='';
  }catch(error){
    googleReady=false;
    oauthError=error.message||'Google sign-in could not load.';
  }
  setConnectionState();
}

function connectGoogle(){
  oauthError='';
  if(!googleReady||!tokenClient){
    oauthError='Google sign-in is still loading. Refresh the page and try again.';
    setConnectionState();
    return;
  }
  googleBusy=true;
  setConnectionState();
  try{
    tokenClient.requestAccessToken({prompt:readToken()?'':'consent'});
  }catch(error){
    googleBusy=false;
    oauthError=error.message||'Google sign-in could not open.';
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
  if(!readToken())root.append(el('p','Connect Google Calendar and MealMap will fit meals between your classes.','menu-empty'));
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
  selectedDate=campusDate();
  $('calendarDate').value=selectedDate;
  try{indexData=await fetchJSON('./data/index.json');}catch{indexData={dates:[]};}
  $('calendarDate').addEventListener('change',()=>loadCalendarDay());
  $('connectGoogle').addEventListener('click',connectGoogle);
  $('disconnectGoogle').addEventListener('click',()=>{clearToken();events=[];oauthError='';setConnectionState();loadCalendarDay();});
  $('refreshCalendar').addEventListener('click',()=>loadCalendarDay(true));
  setConnectionState();
  prepareGoogleIdentity();
  await loadCalendarDay();
}

init();
