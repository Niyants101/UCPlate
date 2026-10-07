const FOCUS_KEY='college-fuel-calendar-focus';

function readFocus(){
  try{return JSON.parse(sessionStorage.getItem(FOCUS_KEY)||'null');}catch{return null;}
}

function applyFocus(){
  const focus=readFocus();
  if(!focus)return;
  const date=document.getElementById('menuDate');
  if(!date||!date.options.length)return false;
  if(focus.date&&[...date.options].some(option=>option.value===focus.date)&&date.value!==focus.date){
    date.value=focus.date;
    date.dispatchEvent(new Event('change',{bubbles:true}));
    return false;
  }
  const hall=document.getElementById('hall');
  if(focus.hall&&hall&&[...hall.options].some(option=>option.value===focus.hall)&&hall.value!==focus.hall){
    hall.value=focus.hall;
    hall.dispatchEvent(new Event('change',{bubbles:true}));
    return false;
  }
  if(focus.meal){
    const meal=[...document.querySelectorAll('.meal-tab')].find(button=>button.textContent.trim().toLowerCase()===String(focus.meal).toLowerCase());
    if(!meal)return false;
    meal.click();
  }
  sessionStorage.removeItem(FOCUS_KEY);
  setTimeout(()=>document.getElementById('bulkPlanner')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  return true;
}

let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(applyFocus()||tries>40)clearInterval(timer);
},150);
