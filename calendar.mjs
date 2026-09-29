import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validDate} from './planner.mjs';
let pending=null, token=null;
const zone='America/Los_Angeles';
export function localDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function localTime(value){return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));}
export function normalizeEvents(events,date){
  if(!validDate(date))throw new Error('Invalid date.');
  return events.filter(e=>e.status!=='cancelled'&&e.transparency!=='transparent'&&!e.attendees?.some(a=>a.self&&a.responseStatus==='declined')).flatMap(e=>{
    const s=e.start?.dateTime||e.start?.date||e.start, t=e.end?.dateTime||e.end?.date||e.end;
    if(typeof s!=='string'||typeof t!=='string')return [];
    if(s.length===10){if(s<=date&&t>date)return [{start:'00:00',end:'23:59',location:e.location||'',allDay:true}];return [];}
    if(localDate(s)>date||localDate(t)<date)return [];
    const start=localDate(s)<date?'00:00':localTime(s),end=localDate(t)>date?'23:59':localTime(t);
    if(start>=end)return [];
    return [{start,end,location:e.location||'',allDay:false}];
  });
}
export async function calendarRoute(req,res,url,send,port){
  if(!url.pathname.startsWith('/api/calendar')&&!url.pathname.startsWith('/auth/google'))return false;
  const redirect=`http://127.0.0.1:${port}/auth/google/callback`;
  const clientId=process.env.GOOGLE_CLIENT_ID;
  if(url.pathname==='/auth/google/start'){
    if(!clientId){send(400,{error:'Standalone Google sync needs a Google Desktop OAuth client. Set GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_SECRET if provided), then restart. Your connected-chat calendar snapshot is available without this setup.'});return true;}
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
    pending={state,verifier,expires:Date.now()+600000};
    const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/calendar.events.readonly',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'online'});
    res.writeHead(302,{Location:auth.href,'Set-Cookie':`calendar_state=${state}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=600`});res.end();return true;
  }
  if(url.pathname==='/auth/google/callback'){
    const state=url.searchParams.get('state');
    if(!pending||pending.expires<Date.now()||state!==pending.state||!req.headers.cookie?.split('; ').includes(`calendar_state=${state}`)){send(400,{error:'Calendar authorization expired or state did not match. Reconnect.'});return true;}
    const verifier=pending.verifier;pending=null;
    if(!url.searchParams.get('code')){send(400,{error:'Google authorization was not completed.'});return true;}
    const body=new URLSearchParams({client_id:clientId,code:url.searchParams.get('code'),code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'});
    if(process.env.GOOGLE_CLIENT_SECRET)body.set('client_secret',process.env.GOOGLE_CLIENT_SECRET);
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(15000)});
    const data=await r.json();
    if(!r.ok){send(400,{error:'Google authorization failed. Check the Desktop OAuth client configuration.'});return true;}
    token={access:data.access_token,expires:Date.now()+data.expires_in*1000};
    res.writeHead(302,{Location:'/', 'Set-Cookie':'calendar_state=; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=0'});res.end();return true;
  }
  if(url.pathname==='/api/calendar'&&req.method==='GET'){
    const date=url.searchParams.get('date');if(!validDate(date))throw new Error('Invalid date.');
    if(!token||token.expires<=Date.now()){
      try{const snapshot=JSON.parse(await readFile(new URL('./data/calendar.json',import.meta.url),'utf8'));if(snapshot.days?.[date]){send(200,{...snapshot.days[date],status:'snapshot',syncedAt:snapshot.syncedAt,message:'Calendar snapshot from the connected chat. This does not refresh automatically.'});return true;}}catch{}
      send(200,{status:'not-connected',busy:[],message:'No calendar snapshot for this date. Connect Google for live sync, or enter busy times manually.'});return true;
    }
    // Query a wide UTC envelope, then clip each event to the requested Pacific day (DST safe).
    const start=new Date(date+'T00:00:00Z'),end=new Date(start.getTime()+2*86400000),events=[];
    const ids=(process.env.GOOGLE_CALENDAR_IDS||'primary').split(',').map(s=>s.trim()).filter(Boolean);
    for(const id of ids){let page;do{
      const endpoint=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`);
      endpoint.search=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',timeZone:zone,...(page?{pageToken:page}:{})});
      const r=await fetch(endpoint,{headers:{Authorization:`Bearer ${token.access}`},signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error('Calendar read failed. Reconnect Google or check selected calendar IDs.');
      const data=await r.json();events.push(...(data.items||[]));page=data.nextPageToken;
    }while(page);}
    const busy=normalizeEvents(events,date);send(200,{status:'live',busy,syncedAt:new Date().toISOString(),calendars:ids.length,message:`Read ${ids.length} calendar(s). Review busy times before planning.`});return true;
  }
  send(404,{error:'Unknown calendar route.'});return true;
}
