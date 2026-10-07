export const UC_CAMPUSES = [
  {id:'ucb',name:'UC Berkeley',shortName:'Berkeley',city:'Berkeley',menuStatus:'planned',adapter:'berkeley-dining'},
  {id:'ucd',name:'UC Davis',shortName:'Davis',city:'Davis',menuStatus:'planned',adapter:'davis-dining'},
  {id:'uci',name:'UC Irvine',shortName:'Irvine',city:'Irvine',menuStatus:'planned',adapter:'uci-dining'},
  {id:'ucla',name:'UCLA',shortName:'UCLA',city:'Los Angeles',menuStatus:'planned',adapter:'ucla-dining'},
  {id:'ucm',name:'UC Merced',shortName:'Merced',city:'Merced',menuStatus:'planned',adapter:'merced-dining'},
  {id:'ucr',name:'UC Riverside',shortName:'Riverside',city:'Riverside',menuStatus:'planned',adapter:'riverside-dining'},
  {id:'ucsd',name:'UC San Diego',shortName:'San Diego',city:'San Diego',menuStatus:'planned',adapter:'ucsd-hdh'},
  {id:'ucsf',name:'UC San Francisco',shortName:'San Francisco',city:'San Francisco',menuStatus:'planned',adapter:'ucsf-dining'},
  {id:'ucsb',name:'UC Santa Barbara',shortName:'Santa Barbara',city:'Santa Barbara',menuStatus:'planned',adapter:'ucsb-dining'},
  {id:'ucsc',name:'UC Santa Cruz',shortName:'Santa Cruz',city:'Santa Cruz',menuStatus:'live',adapter:'ucsc-foodpro'}
];

export function campusById(id){
  return UC_CAMPUSES.find(campus=>campus.id===id)||null;
}

export function effectiveCampusId(prefs={}){
  if(prefs?.campusId&&campusById(prefs.campusId))return prefs.campusId;
  // Existing profiles were created before campus selection existed and were UCSC-only.
  if(prefs?.onboardingComplete)return 'ucsc';
  return null;
}

export function campusHasLiveMenus(id){
  return campusById(id)?.menuStatus==='live';
}
