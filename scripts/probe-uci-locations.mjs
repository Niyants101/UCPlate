const ENDPOINT='https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql';
const metaQuery=`query P($key:String!){getLocation(campusUrlKey:"campus",locationUrlKey:$key){commerceAttributes{maxMenusDate children{id name}} aemAttributes{name hoursOfOperation{schedule}}}}`;
const menuQuery=`query M($key:String!,$date:String!){getLocationRecipes(campusUrlKey:"campus",locationUrlKey:$key,date:$date,mealPeriod:null,viewType:WEEKLY){locationRecipesMap{dateSkuMap{date stations{id skus{simple}}}} products{items{sku name}}}}`;
const locations=[
['Anthill Grille','anthill-pub'],['B + F @ Phoenix Food Court','b-f-at-phoenix-food-court'],['Brandywine','brandywine'],['Choolaah @ East Food Court','choolaah'],['Choolaah Indian BBQ','choolaah-indian-bbq'],['Einstein Bros. Bagels @ Phoenix Food Court','einstein-bros-bagels'],['Greens to Go @ Phoenix Food Court','greens-to-go-at-phoenix-food-court'],['The Halal Shack @ West Food Court','halal-shack'],['Jamba @ East Food Court','jamba-at-east-food-court'],['Java City Kiosk','java-city-kiosk'],['Med Ed Cafe','med-ed-cafe'],['Panda Express @ West Food Court','panda-express-at-west-food-court'],['Panera Bread','panera-bread'],['Quick Eats @ Bren Events Center','quick-eats-at-bren-events-center'],['Starbucks @ Biological Sciences','starbucks-at-biological-sciences'],['Starbucks @ Paul Merage School of Business','starbucks-at-paul-merage-school-of-business'],['Starbucks @ Student Center','starbucks-at-student-center'],['Subway @ West Food Court','subway-at-west-food-court'],['The Anteatery','the-anteatery'],['The Green Room','the-green-room'],['The Oasis','the-oasis-dining-hall'],['Tortilla Fresca @ Phoenix Food Court','tortilla-fresca-at-phoenix-food-court'],['Wendy’s @ West Food Court','wendy-s-at-west-food-court'],['Wushiland Boba @ East Food Court','wushiland-boba'],['Zot N Go Express @ Law & Education','zot-n-go-express-at-law'],['Zot N Go Express @ Side Door','zot-n-go-express-at-side-door'],['Zot N Go Express @ Social Sciences','zot-n-go-express-at-social-sciences'],['Zot N Go Express @ Mesa Court','zot-n-go-express-mesa-court'],['Zot N Go Market','zot-n-go-market']
];
const headers={Accept:'application/json',store:'ch_uci_en','magento-store-code':'ch_uci','magento-website-code':'ch_uci','magento-store-view-code':'ch_uci_en','x-api-key':'ElevateAPIProd',Origin:'https://uci.mydininghub.com',Referer:'https://uci.mydininghub.com/'};
async function call(query,variables){const url=new URL(ENDPOINT);url.searchParams.set('query',query);url.searchParams.set('variables',JSON.stringify(variables));const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});const body=await r.json();if(body?.errors?.length)throw new Error(body.errors[0]?.message||'GraphQL error');return body?.data||{};}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
for(const [name,key] of locations){
  try{
    const meta=(await call(metaQuery,{key}))?.getLocation||null;
    let menuItems=0,menuStations=0,menuError=null;
    if(meta?.commerceAttributes){
      try{const menu=(await call(menuQuery,{key,date:today}))?.getLocationRecipes;menuItems=menu?.products?.items?.length||0;menuStations=(menu?.locationRecipesMap?.dateSkuMap||[]).find(day=>day.date===today)?.stations?.length||0;}catch(error){menuError=error.message;}
    }
    console.log(JSON.stringify({name,key,structured:Boolean(meta?.commerceAttributes),maxMenusDate:meta?.commerceAttributes?.maxMenusDate||null,configuredStations:meta?.commerceAttributes?.children?.length||0,menuStations,menuItems,menuError,aemName:meta?.aemAttributes?.name||null}));
  }catch(error){console.log(JSON.stringify({name,key,error:error.message}));}
}
