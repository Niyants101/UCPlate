const ENDPOINT='https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql';
const ORIGIN='https://uci.mydininghub.com';
const HEADERS={Accept:'application/json',store:'ch_uci_en','magento-store-code':'ch_uci','magento-website-code':'ch_uci','magento-store-view-code':'ch_uci_en','x-api-key':'ElevateAPIProd',Origin:ORIGIN,Referer:`${ORIGIN}/`};

const SOURCE_ONLY=[
  ['uci-anthill-grille','Anthill Grille','anthill-pub','restaurant'],
  ['uci-bbq-chicken','bb.q Chicken @ West Food Court',null,'restaurant'],
  ['uci-bf-phoenix','B + F @ Phoenix Food Court','b-f-at-phoenix-food-court','restaurant'],
  ['uci-choolaah-east','Choolaah @ East Food Court','choolaah','restaurant'],
  ['uci-choolaah-indian-bbq','Choolaah Indian BBQ','choolaah-indian-bbq','restaurant'],
  ['uci-einstein','Einstein Bros. Bagels @ Phoenix Food Court','einstein-bros-bagels','cafe'],
  ['uci-greens-to-go','Greens to Go @ Phoenix Food Court','greens-to-go-at-phoenix-food-court','restaurant'],
  ['uci-jamba','Jamba @ East Food Court','jamba-at-east-food-court','cafe'],
  ['uci-java-city','Java City Kiosk','java-city-kiosk','cafe'],
  ['uci-med-ed-cafe','Med Ed Cafe','med-ed-cafe','cafe'],
  ['uci-panda-express','Panda Express @ West Food Court','panda-express-at-west-food-court','restaurant'],
  ['uci-panera','Panera Bread','panera-bread','cafe'],
  ['uci-quick-eats','Quick Eats @ Bren Events Center','quick-eats-at-bren-events-center','restaurant'],
  ['uci-starbucks-biosci','Starbucks @ Biological Sciences','starbucks-at-biological-sciences','cafe'],
  ['uci-starbucks-merage','Starbucks @ Paul Merage School of Business','starbucks-at-paul-merage-school-of-business','cafe'],
  ['uci-starbucks-student-center','Starbucks @ Student Center','starbucks-at-student-center','cafe'],
  ['uci-subway','Subway @ West Food Court','subway-at-west-food-court','restaurant'],
  ['uci-green-room','The Green Room','the-green-room','cafe'],
  ['uci-tortilla-fresca','Tortilla Fresca @ Phoenix Food Court','tortilla-fresca-at-phoenix-food-court','restaurant'],
  ['uci-wendys','Wendy’s @ West Food Court','wendy-s-at-west-food-court','restaurant'],
  ['uci-wushiland','Wushiland Boba @ East Food Court','wushiland-boba','cafe'],
  ['uci-zot-law','Zot N Go Express @ Law & Education','zot-n-go-express-at-law','market'],
  ['uci-zot-side-door','Zot N Go Express @ Side Door','zot-n-go-express-at-side-door','market'],
  ['uci-zot-social-sciences','Zot N Go Express @ Social Sciences','zot-n-go-express-at-social-sciences','market'],
  ['uci-zot-mesa','Zot N Go Express @ Mesa Court','zot-n-go-express-mesa-court','market'],
  ['uci-zot-market','Zot N Go Market','zot-n-go-market','market']
];
const HALAL={id:'uci-halal-shack',name:'The Halal Shack @ West Food Court',key:'halal-shack',kind:'restaurant',source:`${ORIGIN}/en/location/halal-shack`};

const META_QUERY=`query RetailMeta($key:String!){
 getLocation(campusUrlKey:"campus",locationUrlKey:$key){commerceAttributes{maxMenusDate} aemAttributes{name}}
 Commerce_attributesList(entityType:CATALOG_PRODUCT){items{code options{value label}}}
}`;
const MENU_QUERY=`query RetailMenu($key:String!,$date:String!){
 getLocationRecipes(campusUrlKey:"campus",locationUrlKey:$key,date:$date,mealPeriod:null,viewType:WEEKLY){
   products{items{sku name attributes{name value}}}
 }
}`;
function urlFor(key){return key?`${ORIGIN}/en/location/${key}`:`${ORIGIN}/en/locations`;}
function array(value){return Array.isArray(value)?value:value==null||value===''?[]:[value];}
function number(value){const raw=Array.isArray(value)?value[0]:value;if(raw==null||String(raw).trim()==='')return null;const n=Number(String(raw).replace(/[^0-9.+-]/g,''));return Number.isFinite(n)?n:null;}
function text(value){const raw=Array.isArray(value)?value[0]:value;return raw==null?'':String(raw).trim();}
function normalizeAllergen(label=''){
  const value=String(label).trim();
  if(/^eggs?$/i.test(value))return 'Egg';if(/^milk$/i.test(value))return 'Milk';if(/^peanuts?$/i.test(value))return 'Peanuts';if(/^tree\s*nuts?$/i.test(value))return 'Tree Nuts';if(/^soy$/i.test(value))return 'Soy';if(/^sesame$/i.test(value))return 'Sesame';if(/^fish$/i.test(value))return 'Fish';if(/^shellfish$/i.test(value))return 'Shellfish';if(/^wheat$/i.test(value))return 'Wheat';return value;
}
async function query(query,variables){
  const url=new URL(ENDPOINT);url.searchParams.set('query',query);url.searchParams.set('variables',JSON.stringify(variables));
  const response=await fetch(url,{headers:HEADERS,signal:AbortSignal.timeout(30000)}),body=await response.json();
  if(!response.ok)throw new Error(`UC Irvine Dining returned HTTP ${response.status}.`);
  if(body?.errors?.length)throw new Error(body.errors[0]?.message||'UC Irvine Dining GraphQL error.');
  return body?.data||{};
}
function optionMaps(groups=[]){const out=new Map();for(const group of groups||[]){const map=new Map();for(const option of group?.options||[])map.set(String(option.value),String(option.label));out.set(String(group?.code||''),map);}return out;}
function parseProduct(product,maps){
  const attrs=new Map((product?.attributes||[]).map(attr=>[String(attr.name),attr.value]));
  const allergenMap=maps.get('allergens_intolerances')||new Map();
  const preferenceMap=maps.get('recipe_attributes')||maps.get('menu_preferences')||new Map();
  const allergens=[];
  for(const code of array(attrs.get('allergens_intolerances'))){const label=normalizeAllergen(allergenMap.get(String(code))||String(code));if(label&&!/^0$/.test(label)&&!allergens.includes(label))allergens.push(label);}
  const preferences=array(attrs.get('recipe_attributes')??attrs.get('menu_preferences')).map(code=>preferenceMap.get(String(code))||String(code));
  const diet=preferences.some(label=>/\bvegan\b/i.test(label))?'vegan':preferences.some(label=>/\bvegetarian\b/i.test(label))?'vegetarian':'unknown';
  const calories=number(attrs.get('calories')),protein=number(attrs.get('protein')),available=Number.isFinite(calories)&&Number.isFinite(protein);
  return {name:String(product?.name||'').trim(),section:'Menu',category:'Menu',diet,allergens,description:text(attrs.get('marketing_description')),serving:text(attrs.get('serving_combined'))||null,calories:available?calories:null,protein:available?protein:null,source:HALAL.source,nutritionSource:available?HALAL.source:null,nutritionStatus:available?'available':'unavailable'};
}
export async function getUciRetailLocations(date){
  const sourceOnly=SOURCE_ONLY.map(([id,name,key,kind])=>({id,name,sourceName:name,kind,status:'empty',message:'Official UC Irvine dining location. MyDiningHub does not publish an itemized campus menu for this location through its structured feed.',source:urlFor(key),schedule:null,meals:[]}));
  try{
    const meta=await query(META_QUERY,{key:HALAL.key}),max=meta?.getLocation?.commerceAttributes?.maxMenusDate;
    if(max&&date>max)return [{...HALAL,sourceName:HALAL.name,status:'empty',message:`UC Irvine has not posted an itemized Halal Shack menu for ${date}.`,schedule:null,meals:[]},...sourceOnly];
    const menu=await query(MENU_QUERY,{key:HALAL.key,date}),maps=optionMaps(meta?.Commerce_attributesList?.items||[]);
    const items=(menu?.getLocationRecipes?.products?.items||[]).map(product=>parseProduct(product,maps)).filter(item=>item.name);
    const halal={...HALAL,sourceName:HALAL.name,status:items.length?'live':'empty',message:items.length?'Menu posted by UC Irvine Dining.':'No itemized Halal Shack menu is posted for this date.',schedule:null,meals:items.length?[{name:'All Day',items}]:[]};
    return [halal,...sourceOnly];
  }catch(error){
    return [{...HALAL,sourceName:HALAL.name,status:'unavailable',message:error.message,source:HALAL.source,schedule:null,meals:[]},...sourceOnly];
  }
}
