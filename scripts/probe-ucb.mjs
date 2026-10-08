const UA='UCPlate/0.1 (+https://ucplate.com)';
const ORIGIN='https://dining.berkeley.edu';
const menuUrl=`${ORIGIN}/menus/`;
const response=await fetch(menuUrl,{headers:{'User-Agent':UA,'Accept':'text/html'}});
console.log('menu status',response.status);
const html=await response.text();
console.log('menu bytes',html.length);
const first=html.match(/<li\b[^>]*class=["'][^"']*\brecip\b[^"']*["'][^>]*data-location=["']([^"']+)["'][^>]*data-id=["']([^"']+)["'][^>]*data-menuid=["']([^"']+)["'][^>]*>\s*<span>([\s\S]*?)<\/span>/i);
if(!first)throw new Error('No Berkeley recipe item found.');
const [_,locationToken,recipeId,menuId,itemHtml]=first;
console.log('first item',itemHtml.replace(/<[^>]+>/g,''),recipeId,menuId);
console.log('location decoded',Buffer.from(locationToken,'base64').toString('utf8'));
const jsUrl=`${ORIGIN}/wp-content/plugins/cal-dining/assets/custom.js?ver=1.0`;
const jsRes=await fetch(jsUrl,{headers:{'User-Agent':UA,'Accept':'application/javascript,text/javascript,*/*'}});
console.log('custom js status',jsRes.status);
const js=await jsRes.text();
console.log('custom js bytes',js.length);
const marker=js.indexOf("action: 'get_recipe_details'");
console.log('recipe ajax block',js.slice(Math.max(0,marker-1000),marker+1500));
const ajax=`${ORIGIN}/wp-admin/admin-ajax.php`;
const bodies=[
  {action:'get_recipe_details',location:locationToken,id:recipeId,menu_id:menuId},
  {action:'get_recipe_details',location:locationToken,recipe_id:recipeId,menu_id:menuId},
  {action:'get_recipe_details',location:locationToken,RecipeId:recipeId,menu_id:menuId}
];
for(const body of bodies){
  const res=await fetch(ajax,{method:'POST',headers:{'User-Agent':UA,'Accept':'text/html,*/*','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':menuUrl},body:new URLSearchParams(body)});
  const text=await res.text();
  console.log('ajax',body,'status',res.status,'bytes',text.length,'sample',text.slice(0,7000));
}
