const FOCUS_KEY='ucplate-calendar-focus';
const LEGACY_FOCUS_KEY='college-fuel-calendar-focus';

function readFocus(){
  try{
    const raw=sessionStorage.getItem(FOCUS_KEY)||sessionStorage.getItem(LEGACY_FOCUS_KEY)||'null';
    const focus=JSON.parse(raw);
    if(focus&&!sessionStorage.getItem(FOCUS_KEY))sessionStorage.setItem(FOCUS_KEY,JSON.stringify(focus));
    return focus;
  }catch{return null;}
}

function clearFocus(){
  sessionStorage.removeItem(FOCUS_KEY);
  sessionStorage.removeItem(LEGACY_FOCUS_KEY);
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
  clearFocus();
  setTimeout(()=>document.getElementById('bulkPlanner')?.scrollIntoView({behavior:'smooth',block:'start'}),120);
  return true;
}

let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(applyFocus()||tries>40)clearInterval(timer);
},150);
