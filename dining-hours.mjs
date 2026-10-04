const TZ='America/Los_Angeles';
const w=(name,start,end,limited=false)=>({name,start,end,limited});
const weekdayLong=[
  w('Breakfast','08:00','11:00'),w('Continuous Dining','11:00','11:30',true),w('Lunch','11:30','14:00'),w('Continuous Dining','14:00','17:00',true),w('Dinner','17:00','20:00'),w('Late Night','20:00','22:00')
];
const weekdayNoLate=weekdayLong.slice(0,5);
const weekendBase=[w('Brunch','09:00','14:00'),w('Continuous Dining','14:00','17:00',true),w('Dinner','17:00','20:00')];
export const SERVING_SCHEDULES={
  '40':{
    Monday:weekdayNoLate,
    Tuesday:weekdayLong,Wednesday:weekdayLong,Thursday:weekdayLong,Friday:weekdayLong,
    Saturday:[...weekendBase,w('Late Night','20:00','22:00')],Sunday:weekendBase
  },
  '05':{
    Monday:weekdayLong,Tuesday:weekdayLong,Wednesday:weekdayLong,Thursday:weekdayLong,Friday:weekdayNoLate,
    Saturday:weekendBase,Sunday:[...weekendBase,w('Late Night','20:00','22:00')]
  },
  '20':{
    Monday:[w('Breakfast','07:00','11:00'),w('Continuous Dining','11:00','11:30',true),w('Lunch','11:30','14:00'),w('Continuous Dining','14:00','17:00',true),w('Dinner','17:00','20:00')],
    Tuesday:null,Wednesday:null,Thursday:null,Friday:null,Saturday:[],Sunday:[]
  },
  '25':{
    Monday:[w('Breakfast','07:00','11:00'),w('Continuous Dining','11:00','11:30',true),w('Lunch','11:30','14:00'),w('Continuous Dining','14:00','17:00',true),w('Dinner','17:00','19:00')],
    Tuesday:null,Wednesday:null,Thursday:null,Friday:null,Saturday:[],Sunday:[]
  },
  '30':{
    Monday:weekdayLong,Tuesday:weekdayLong,Wednesday:weekdayLong,Thursday:weekdayLong,Friday:weekdayNoLate,
    Saturday:weekendBase,Sunday:[...weekendBase,w('Late Night','20:00','22:00')]
  }
};
for(const id of ['20','25'])for(const day of ['Tuesday','Wednesday','Thursday','Friday'])SERVING_SCHEDULES[id][day]=SERVING_SCHEDULES[id].Monday;

const parts=(date)=>date.split('-').map(Number);
const dayName=(date)=>{
  const [y,m,d]=parts(date);
  if(!y||!m||!d)return '';
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(Date.UTC(y,m-1,d,12)).getUTCDay()];
};
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const addDays=(date,count)=>{const [y,m,d]=parts(date),x=new Date(Date.UTC(y,m-1,d+count,12));return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`;};
export const formatClock=(time)=>{let [h,m]=time.split(':').map(Number);const suffix=h>=12?'PM':'AM';h=h%12||12;return `${h}${m?`:${String(m).padStart(2,'0')}`:''} ${suffix}`;};
export function pacificNow(now=new Date()){
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export function getDaySchedule(date,hallId){
  const schedule=SERVING_SCHEDULES[hallId];
  if(!schedule)return null;
  return (schedule[dayName(date)]||[]).map(x=>({...x}));
}
function findNext(date,hallId,afterMinutes){
  for(let offset=0;offset<8;offset++){
    const candidate=addDays(date,offset),schedule=getDaySchedule(candidate,hallId)||[];
    const item=schedule.find(x=>offset>0||minutes(x.start)>=afterMinutes);
    if(item)return {date:candidate,name:item.name,start:item.start,limited:item.limited};
  }
  return null;
}
export function getServingStatus(date,hallId,now=new Date()){
  const schedule=getDaySchedule(date,hallId);
  if(schedule===null)return {state:'unknown',label:'Hours not built in',schedule:null,next:null};
  const campus=pacificNow(now);
  if(date!==campus.date){
    const first=schedule[0]||null;
    return {state:'scheduled',label:schedule.length?'Regular schedule':'Closed on regular schedule',schedule,next:first?{date,name:first.name,start:first.start,limited:first.limited}:findNext(date,hallId,0)};
  }
  const current=schedule.find(x=>campus.minutes>=minutes(x.start)&&campus.minutes<minutes(x.end));
  if(current){
    const next=schedule.find(x=>minutes(x.start)>=minutes(current.end))||findNext(addDays(date,1),hallId,0);
    return {state:current.limited?'limited':'open',label:current.name,start:current.start,end:current.end,limited:current.limited,schedule,next};
  }
  const next=findNext(date,hallId,campus.minutes);
  return {state:'closed',label:'Closed',schedule,next};
}
