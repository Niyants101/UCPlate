const url='https://hdh-web.ucsd.edu/dining/apps/diningservices/Restaurants/Venue_V3?dayNum=0&locDetID=37&locId=2';
const response=await fetch(url,{headers:{'User-Agent':'UCPlate/0.1 (+https://ucplate.com)','Accept':'text/html'}});
console.log('STATUS',response.status,response.url);
const html=await response.text();
console.log('LENGTH',html.length);
for(const needle of ['Breakfast A La Carte','Bacon','Nutritionfacts2','Thursday, October']){
  const i=html.indexOf(needle);
  console.log(`\n--- ${needle} @ ${i} ---`);
  console.log(i>=0?html.slice(Math.max(0,i-1200),i+2200):'NOT FOUND');
}
