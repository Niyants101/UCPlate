const PREF='college-bulk-pages-v2';

function readPrefs(){
  try{return JSON.parse(localStorage.getItem(PREF)||'{}');}
  catch{return {};}
}

function formatDailyGoal(){
  const prefs=readPrefs();
  const calories=Number(prefs.dailyCalories);
  const protein=Number(prefs.dailyProtein);
  if(!Number.isFinite(calories)||!Number.isFinite(protein))return 'Set in My Plan';
  return `${Math.round(calories)} kcal · ${Math.round(protein)} g protein`;
}

function enhanceGoalCard(){
  const card=document.querySelector('.bulk-target');
  const mode=document.getElementById('goalModeBadge');
  const mealValue=document.getElementById('bulkTargetBadge');
  if(!card||!mode||!mealValue||card.dataset.goalDisplayReady==='1')return;

  card.dataset.goalDisplayReady='1';
  card.classList.add('goal-target-card');
  mode.classList.add('goal-mode-pill');

  const dailyLabel=document.createElement('span');
  dailyLabel.className='goal-target-label';
  dailyLabel.textContent='SAVED DAILY GOAL';

  const dailyValue=document.createElement('strong');
  dailyValue.className='goal-daily-value';
  dailyValue.textContent=formatDailyGoal();

  const divider=document.createElement('div');
  divider.className='goal-target-divider';

  const mealLabel=document.createElement('span');
  mealLabel.className='goal-target-label';
  mealLabel.textContent='THIS MEAL TARGET';

  mealValue.classList.add('goal-meal-value');

  const note=document.createElement('p');
  note.className='goal-target-note';
  note.textContent='This meal target is calculated from your saved daily goal. It is not the goal you entered in My Plan.';

  card.replaceChildren(mode,dailyLabel,dailyValue,divider,mealLabel,mealValue,note);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceGoalCard,{once:true});
else enhanceGoalCard();

const observer=new MutationObserver(()=>enhanceGoalCard());
observer.observe(document.documentElement,{childList:true,subtree:true});
