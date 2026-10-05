const PREF='college-bulk-pages-v2';
const $=id=>document.getElementById(id);
const setupMode=new URLSearchParams(location.search).get('setup')==='1';

let prefs={};
let step=1;
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

const allergenLabels={
  milk:'Milk',egg:'Egg','wheat-gluten':'Wheat / Gluten',soy:'Soy',peanut:'Peanut','tree-nut':'Tree nuts',sesame:'Sesame',fish:'Fish',shellfish:'Shellfish'
};
const modeLabel=mode=>({cut:'Cut',maintain:'Maintain',gain:'Gain'})[mode]||'Maintain';
const dietLabel=diet=>({omnivore:'Everything',vegetarian:'Vegetarian',vegan:'Vegan'})[diet]||'Everything';

function parseAvoidFoods(value){
  return [...new Set(String(value||'').split(/[\n,]+/).map(item=>item.trim()).filter(Boolean))];
}
function validateGoals(){
  const calories=Number($('dailyCalories').value);
  const protein=Number($('dailyProtein').value);
  if(!Number.isFinite(calories)||calories<500||calories>6000){
    $('goalError').textContent='Enter a daily calorie goal between 500 and 6000.';
    return false;
  }
  if(!Number.isFinite(protein)||protein<10||protein>300){
    $('goalError').textContent='Enter a daily protein goal between 10 and 300 grams.';
    return false;
  }
  $('goalError').textContent='';
  return true;
}
function renderCurrent(){
  const calories=Number(prefs.dailyCalories);
  const protein=Number(prefs.dailyProtein);
  if(Number.isFinite(calories)&&Number.isFinite(protein)&&prefs.onboardingComplete){
    $('currentGoalSummary').textContent=`${modeLabel(prefs.goalMode)} · ${calories} kcal/day · ${protein} g protein/day`;
    const allergies=(prefs.allergens||[]).map(key=>allergenLabels[key]||key);
    const parts=[dietLabel(prefs.dietPreference)];
    if(allergies.length)parts.push(`Avoid allergens: ${allergies.join(', ')}`);
    if((prefs.avoidFoods||[]).length)parts.push(`Avoid foods: ${prefs.avoidFoods.join(', ')}`);
    $('currentPreferenceSummary').textContent=parts.join(' · ');
  }else{
    $('currentGoalSummary').textContent='No complete plan saved yet.';
    $('currentPreferenceSummary').textContent='Finish the three quick steps above to personalize recommendations.';
  }
}
function renderStep(){
  document.querySelectorAll('.wizard-step').forEach(panel=>{
    const active=Number(panel.dataset.step)===step;
    panel.hidden=!active;
    panel.classList.toggle('active',active);
  });
  document.querySelectorAll('.progress-step').forEach(button=>{
    const value=Number(button.dataset.goStep);
    button.classList.toggle('active',value===step);
    button.classList.toggle('complete',value<step);
    button.setAttribute('aria-current',value===step?'step':'false');
  });
  $('wizardBack').hidden=step===1;
  $('wizardNext').hidden=step===3;
  $('wizardSave').hidden=step!==3;
  $('goalError').textContent='';
  window.scrollTo({top:Math.max(0,document.querySelector('.onboarding-shell').offsetTop-90),behavior:'smooth'});
}
function goStep(next){
  if(next>step&&step===1&&!validateGoals())return;
  step=Math.max(1,Math.min(3,next));
  renderStep();
}
function prefill(){
  if(Number.isFinite(Number(prefs.dailyCalories)))$('dailyCalories').value=prefs.dailyCalories;
  if(Number.isFinite(Number(prefs.dailyProtein)))$('dailyProtein').value=prefs.dailyProtein;

  const mode=document.querySelector(`input[name="goalMode"][value="${prefs.goalMode||'maintain'}"]`);
  if(mode)mode.checked=true;
  const diet=document.querySelector(`input[name="dietPreference"][value="${prefs.dietPreference||'omnivore'}"]`);
  if(diet)diet.checked=true;

  for(const key of prefs.allergens||[]){
    const box=document.querySelector(`input[name="allergen"][value="${key}"]`);
    if(box)box.checked=true;
  }
  $('avoidFoods').value=(prefs.avoidFoods||[]).join(', ');
}

if(setupMode||!prefs.onboardingComplete){
  $('setupEyebrow').textContent='WELCOME TO COLLEGE FUEL';
  $('setupTitle').innerHTML='Three quick steps.<br><em>Then you are done.</em>';
  $('setupIntro').textContent='Set your goals, eating style, and food safety preferences once. The dining page will use them automatically from then on.';
}

prefill();
renderCurrent();
renderStep();

$('wizardBack').addEventListener('click',()=>goStep(step-1));
$('wizardNext').addEventListener('click',()=>goStep(step+1));
document.querySelectorAll('.progress-step').forEach(button=>button.addEventListener('click',()=>{
  const target=Number(button.dataset.goStep);
  if(target<=step||prefs.onboardingComplete)goStep(target);
  else if(target===step+1)goStep(target);
}));

$('profileForm').addEventListener('submit',event=>{
  event.preventDefault();
  if(!validateGoals()){
    step=1;
    renderStep();
    return;
  }
  const calories=Math.round(Number($('dailyCalories').value));
  const protein=Math.round(Number($('dailyProtein').value));
  const goalMode=document.querySelector('input[name="goalMode"]:checked')?.value||'maintain';
  const dietPreference=document.querySelector('input[name="dietPreference"]:checked')?.value||'omnivore';
  const allergens=[...document.querySelectorAll('input[name="allergen"]:checked')].map(input=>input.value);
  const avoidFoods=parseAvoidFoods($('avoidFoods').value);

  prefs={...prefs,dailyCalories:calories,dailyProtein:protein,goalMode,dietPreference,allergens,avoidFoods,onboardingComplete:true,profileVersion:1};
  localStorage.setItem(PREF,JSON.stringify(prefs));
  window.location.href='./';
});

$('clearGoals').addEventListener('click',()=>{
  const keep={hall:prefs.hall,sort:prefs.sort};
  prefs=keep;
  localStorage.setItem(PREF,JSON.stringify(prefs));
  $('dailyCalories').value='';
  $('dailyProtein').value='';
  $('avoidFoods').value='';
  document.querySelectorAll('input[name="allergen"]').forEach(input=>input.checked=false);
  const maintain=document.querySelector('input[name="goalMode"][value="maintain"]');
  const omni=document.querySelector('input[name="dietPreference"][value="omnivore"]');
  if(maintain)maintain.checked=true;
  if(omni)omni.checked=true;
  step=1;
  renderCurrent();
  renderStep();
});
