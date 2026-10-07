import {campusById,effectiveCampusId,campusHasLiveMenus} from './campuses.mjs';

const PREF='college-bulk-pages-v2';
let prefs={};
try{prefs=JSON.parse(localStorage.getItem(PREF)||'{}');}catch{prefs={};}

let campusId=effectiveCampusId(prefs);
if(!prefs.campusId&&campusId&&prefs.onboardingComplete){
  prefs={...prefs,campusId};
  localStorage.setItem(PREF,JSON.stringify(prefs));
}

const campus=campusById(campusId);
for(const node of document.querySelectorAll('[data-campus-label]')){
  node.textContent=campus?.name||'Choose campus';
}
for(const node of document.querySelectorAll('[data-campus-short]')){
  node.textContent=campus?.shortName||'UC campus';
}

if(document.documentElement.dataset.requiresLiveCampus==='true'&&prefs.onboardingComplete&&campus&&!campusHasLiveMenus(campus.id)){
  const target=new URL('./campus.html',location.href);
  target.searchParams.set('campus',campus.id);
  location.replace(target.href);
}
