const PREF='college-bulk-pages-v2';
const $=id=>document.getElementById(id);

let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

function modeLabel(mode){
  return ({cut:'Cut',maintain:'Maintain',gain:'Gain'})[mode]||'Maintain';
}
function renderCurrent(){
  const calories=Number(prefs.dailyCalories);
  const protein=Number(prefs.dailyProtein);
  $('currentGoalSummary').textContent=
    Number.isFinite(calories)&&Number.isFinite(protein)
      ? `${modeLabel(prefs.goalMode)} · ${calories} kcal/day · ${protein} g protein/day`
      : 'No goals saved yet.';
}

if(Number.isFinite(Number(prefs.dailyCalories)))$('dailyCalories').value=prefs.dailyCalories;
if(Number.isFinite(Number(prefs.dailyProtein)))$('dailyProtein').value=prefs.dailyProtein;
const mode=document.querySelector(`input[name="goalMode"][value="${prefs.goalMode||'maintain'}"]`);
if(mode)mode.checked=true;
renderCurrent();

$('goalsForm').addEventListener('submit',event=>{
  event.preventDefault();
  const calories=Number($('dailyCalories').value);
  const protein=Number($('dailyProtein').value);
  const goalMode=document.querySelector('input[name="goalMode"]:checked')?.value||'maintain';

  if(!Number.isFinite(calories)||calories<500||calories>6000){
    $('goalError').textContent='Enter a daily calorie goal between 500 and 6000.';
    return;
  }
  if(!Number.isFinite(protein)||protein<10||protein>300){
    $('goalError').textContent='Enter a daily protein goal between 10 and 300 grams.';
    return;
  }

  prefs={...prefs,dailyCalories:Math.round(calories),dailyProtein:Math.round(protein),goalMode};
  localStorage.setItem(PREF,JSON.stringify(prefs));
  window.location.href='./';
});

$('clearGoals').addEventListener('click',()=>{
  const {dailyCalories,dailyProtein,goalMode,...rest}=prefs;
  prefs=rest;
  localStorage.setItem(PREF,JSON.stringify(prefs));
  $('dailyCalories').value='';
  $('dailyProtein').value='';
  const maintain=document.querySelector('input[name="goalMode"][value="maintain"]');
  if(maintain)maintain.checked=true;
  $('goalError').textContent='';
  renderCurrent();
});
