const urls=[
  'https://housing.ucdavis.edu/dining/dining-commons/segundo/',
  'https://housing.ucdavis.edu/dining/dining-commons/tercero/',
  'https://housing.ucdavis.edu/dining/dining-commons/cuarto/',
  'https://housing.ucdavis.edu/dining/latitude/'
];
for(const url of urls){
  const res=await fetch(url,{headers:{'User-Agent':'UCPlate/0.1 (+https://ucplate.com)','Accept':'text/html'}});
  const html=await res.text();
  console.log('\nURL',url,'status',res.status,'bytes',html.length);
  for(const needle of ['Weekly Menu','Sunday','Breakfast','Serving Size','Calories:','menu-day','menu-item','zone']){
    const i=html.indexOf(needle);
    console.log('\nNEEDLE',needle,'AT',i,'\n',i>=0?html.slice(Math.max(0,i-800),i+2200):'not found');
  }
  const dates=[...html.matchAll(/\b20\d{2}[-\/]\d{1,2}[-\/]\d{1,2}\b/g)].slice(0,20).map(m=>m[0]);
  console.log('DATES',dates);
}
