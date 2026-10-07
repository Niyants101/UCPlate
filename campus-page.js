import {UC_CAMPUSES,campusById,effectiveCampusId,campusHasLiveMenus} from './campuses.mjs';

const PREF='college-bulk-pages-v2';
const $=id=>document.getElementById(id);
let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

const requested=new URLSearchParams(location.search).get('campus');
let selectedId=campusById(requested)?.id||effectiveCampusId(prefs)||null;

function saveCampus(id){
  const changed=id!==effectiveCampusId(prefs);
  selectedId=id;
  prefs={...prefs,campusId:id};
  if(changed){
    delete prefs.hall;
    delete prefs.sort;
    delete prefs.safeOnly;
  }
  localStorage.setItem(PREF,JSON.stringify(prefs));
  render();
}

function render(){
  const campus=campusById(selectedId);
  $('currentCampusName').textContent=campus?.name||'Choose a campus';
  $('currentCampusStatus').textContent=campus
    ? campusHasLiveMenus(campus.id)
      ? 'Live dining menus, nutrition labels, recommendations, and My Day meal timing are available for this campus.'
      : 'Your campus is saved. Its dining adapter is in the UCPlate rollout queue, so UCPlate will not show another campus’s food by mistake.'
    : 'Your campus is saved with your plan in this browser.';

  const grid=$('campusGrid');
  grid.replaceChildren();
  for(const item of UC_CAMPUSES){
    const button=document.createElement('button');
    button.type='button';
    button.className=`campus-card ${item.id===selectedId?'selected':''}`;
    const top=document.createElement('div');top.className='campus-card-top';
    const name=document.createElement('strong');name.textContent=item.name;
    const status=document.createElement('span');status.className=`campus-status ${campusHasLiveMenus(item.id)?'live':''}`;status.textContent=campusHasLiveMenus(item.id)?'LIVE':'ADAPTER QUEUED';
    top.append(name,status);
    const city=document.createElement('small');city.textContent=item.city;
    const copy=document.createElement('p');copy.textContent=campusHasLiveMenus(item.id)
      ? 'Menus and personalized plates are live now.'
      : 'Campus profile is supported. Official menu integration is next.';
    button.append(top,city,copy);
    button.addEventListener('click',()=>saveCampus(item.id));
    grid.append(button);
  }

  const next=$('campusNext');
  if(!campus){next.hidden=true;return;}
  next.hidden=false;
  $('campusNextTitle').textContent=campusHasLiveMenus(campus.id)?`${campus.name} is live`:`${campus.name} selected`;
  $('campusNextText').textContent=campusHasLiveMenus(campus.id)
    ? 'Open Dining to see official menus and UCPlate recommendations.'
    : 'Your profile now belongs to this campus. We will keep campus-specific menu data isolated until this adapter is live.';
  const action=$('campusNextAction');
  action.textContent=campusHasLiveMenus(campus.id)?'Open dining →':'Edit my plan →';
  action.href=campusHasLiveMenus(campus.id)?'./':'./goals.html';
}

render();
