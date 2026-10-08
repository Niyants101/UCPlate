const TZ='America/Los_Angeles';

export const toMinutes=value=>{
  if(typeof value==='number')return value;
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return NaN;
  return Number(match[1])*60+Number(match[2]);
};

export const formatMinutes=value=>{
  const minutes=Math.max(0,Math.min(24*60-1,Math.round(value)));
  let hour=Math.floor(minutes/60),minute=minutes%60;
  const suffix=hour>=12?'PM':'AM';
  hour=hour%12||12;
  return `${hour}${minute?`:${String(minute).padStart(2,'0')}`:''} ${suffix}`;
};

function dateParts(value){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return Object.fromEntries(fmt.formatToParts(new Date(value)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}

export function normalizeGoogleEvents(items,date){
  const events=[];
  for(const item of items||[]){
    if(item.status==='cancelled'||item.transparency==='transparent')continue;
    if(item.attendees?.some(attendee=>attendee.self&&attendee.responseStatus==='declined'))continue;
    const startValue=item.start?.dateTime;
    const endValue=item.end?.dateTime;
    if(!startValue||!endValue)continue;
    const start=dateParts(startValue),end=dateParts(endValue);
    const startDate=`${start.year}-${start.month}-${start.day}`;
    const endDate=`${end.year}-${end.month}-${end.day}`;
    if(startDate>date||endDate<date)continue;
    const startMin=startDate<date?0:Number(start.hour)*60+Number(start.minute);
    const endMin=endDate>date?24*60:Number(end.hour)*60+Number(end.minute);
    if(endMin<=startMin)continue;
    events.push({
      id:item.id||`${startValue}:${item.summary||''}`,
      title:item.summary||'Busy',
      start:startMin,
      end:endMin,
      location:item.location||'',
      htmlLink:item.htmlLink||''
    });
  }
  return events.sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function buildFreeWindows(events,{dayStart='07:00',dayEnd='22:30',bufferMinutes=10,minMinutes=25}={}){
  const start=toMinutes(dayStart),end=toMinutes(dayEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
  const busy=(events||[]).map(event=>({
    start:Math.max(start,Number(event.start)-bufferMinutes),
    end:Math.min(end,Number(event.end)+bufferMinutes)
  })).filter(event=>event.end>event.start).sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const block of busy){
    const last=merged.at(-1);
    if(last&&block.start<=last.end)last.end=Math.max(last.end,block.end);
    else merged.push({...block});
  }
  const free=[];
  let cursor=start;
  for(const block of merged){
    if(block.start-cursor>=minMinutes)free.push({start:cursor,end:block.start});
    cursor=Math.max(cursor,block.end);
  }
  if(end-cursor>=minMinutes)free.push({start:cursor,end});
  return free;
}

function canonicalMeal(name){
  const text=String(name||'').toLowerCase();
  if(text.includes('brunch'))return 'Brunch';
  if(text.includes('breakfast'))return 'Breakfast';
  if(text.includes('late'))return 'Late Night';
  if(text.includes('lunch'))return 'Lunch';
  if(text.includes('dinner'))return 'Dinner';
  return name||'Meal';
}

const PLANNING_WINDOWS={
  Breakfast:{start:'07:00',end:'11:00'},
  Brunch:{start:'09:00',end:'14:00'},
  Lunch:{start:'11:00',end:'16:00'},
  Dinner:{start:'16:00',end:'21:00'},
  'Late Night':{start:'20:00',end:'23:59'}
};
const STANDARD_MEALS=new Set(Object.keys(PLANNING_WINDOWS));

function publishedMealNames(location){
  const names=[];
  for(const raw of location?.meals||[]){
    const text=String(typeof raw==='string'?raw:raw?.name||'').toLowerCase();
    if(!text)continue;
    if(text.includes('brunch'))names.push('Brunch');
    else if(text.includes('breakfast'))names.push('Breakfast');
    if(text.includes('lunch'))names.push('Lunch');
    if(text.includes('dinner'))names.push('Dinner');
    if(text.includes('late'))names.push('Late Night');
  }
  return [...new Set(names)];
}

function servingSegments(location,serving){
  const servingStart=toMinutes(serving.start),servingEnd=toMinutes(serving.end);
  if(!Number.isFinite(servingStart)||!Number.isFinite(servingEnd))return [];
  if(!/^open$/i.test(String(serving.name||'').trim())){
    const meal=canonicalMeal(serving.name);
    return [{meal,servingName:serving.name,start:servingStart,end:servingEnd}];
  }

  let names=publishedMealNames(location);
  if(!names.length)names=['Breakfast','Lunch','Dinner','Late Night'];
  const segments=[];
  for(const meal of names){
    if(!STANDARD_MEALS.has(meal))continue;
    const planning=PLANNING_WINDOWS[meal];
    const start=Math.max(servingStart,toMinutes(planning.start));
    const end=Math.min(servingEnd,toMinutes(planning.end));
    if(end>start)segments.push({meal,servingName:meal,start,end,scheduleName:serving.name});
  }
  return segments;
}

function previousEvent(events,start){
  return [...events].filter(event=>event.end<=start).sort((a,b)=>b.end-a.end)[0]||null;
}
function nextEvent(events,end){
  return [...events].filter(event=>event.start>=end).sort((a,b)=>a.start-b.start)[0]||null;
}

export function buildMealSuggestions({events=[],locations=[],preferredLocationId=null,minWindowMinutes=25}){
  const free=buildFreeWindows(events,{minMinutes:minWindowMinutes});
  const candidates=[];
  for(const location of locations||[]){
    if(!Array.isArray(location.schedule))continue;
    for(const serving of location.schedule){
      if(serving.limited||/continuous/i.test(serving.name))continue;
      for(const segment of servingSegments(location,serving)){
        for(const gap of free){
          const start=Math.max(gap.start,segment.start),end=Math.min(gap.end,segment.end);
          if(end-start<minWindowMinutes)continue;
          const previous=previousEvent(events,start),next=nextEvent(events,end);
          const duration=end-start;
          let score=0;
          if(location.id===preferredLocationId)score-=40;
          score-=Math.min(duration,75)/15;
          if(previous)score+=Math.min(90,Math.max(0,start-previous.end))/30;
          if(next)score+=Math.min(90,Math.max(0,next.start-end))/60;
          candidates.push({
            meal:segment.meal,
            servingName:segment.servingName,
            scheduleName:segment.scheduleName||serving.name,
            locationId:location.id,
            locationName:location.name,
            start,end,duration,previous,next,score,
            distanceMinutes:null,
            distanceStatus:'not-connected'
          });
        }
      }
    }
  }

  const bestByMeal=new Map();
  for(const candidate of candidates.sort((a,b)=>a.score-b.score||b.duration-a.duration)){
    if(!bestByMeal.has(candidate.meal))bestByMeal.set(candidate.meal,candidate);
  }
  return [...bestByMeal.values()].sort((a,b)=>a.start-b.start);
}

export function suggestionText(candidate){
  if(!candidate)return '';
  const after=candidate.previous?` after ${candidate.previous.title}`:'';
  const before=candidate.next?` before ${candidate.next.title}`:'';
  return `${candidate.meal}${after}${before} · ${formatMinutes(candidate.start)}–${formatMinutes(candidate.end)} · ${candidate.locationName}`;
}
