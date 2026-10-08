const origin='https://hdh-web.ucsd.edu';
const menuUrl=`${origin}/dining/apps/diningservices/Restaurants/Venue_V3?dayNum=0&locDetID=37&locId=2`;
const response=await fetch(menuUrl,{headers:{'User-Agent':'UCPlate/0.1 (+https://ucplate.com)','Accept':'text/html'}});
console.log('MENU STATUS',response.status,response.url);
const html=await response.text();
console.log('MENU LENGTH',html.length);

for(const needle of ['Vegetarian','Vegan','Allergens','Spaghetti Fra Diavolo','Blistered Tomato Fettuccini Alfredo']){
  const i=html.indexOf(needle);
  console.log(`\n--- MENU ${needle} @ ${i} ---`);
  console.log(i>=0?html.slice(Math.max(0,i-1400),i+2600):'NOT FOUND');
}

const itemMatch=html.match(/href="([^"]*Nutritionfacts2\?id=133&amp;recId=170169|[^"]*Nutritionfacts2\?id=133&recId=170169)"/i);
const nutritionUrl=itemMatch?new URL(itemMatch[1].replaceAll('&amp;','&'),origin).href:`${origin}/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=133&recId=170169`;
const nr=await fetch(nutritionUrl,{headers:{'User-Agent':'UCPlate/0.1 (+https://ucplate.com)','Accept':'text/html'}});
console.log('\nNUTRITION STATUS',nr.status,nr.url);
const nutrition=await nr.text();
console.log('NUTRITION LENGTH',nutrition.length);
for(const needle of ['Bacon','Protein','Allergen','Ingredients','Serving Size']){
  const i=nutrition.indexOf(needle);
  console.log(`\n--- NUTRITION ${needle} @ ${i} ---`);
  console.log(i>=0?nutrition.slice(Math.max(0,i-1200),i+2600):'NOT FOUND');
}
