const UA='UCPlate/0.1 (+https://ucplate.com)';
const menuUrl='https://dining.berkeley.edu/menus/';
const response=await fetch(menuUrl,{headers:{'User-Agent':UA,'Accept':'text/html'}});
console.log('menu status',response.status);
const html=await response.text();
console.log('menu bytes',html.length);
const first=html.match(/<li\b[^>]*class=["'][^"']*\brecip\b[^"']*["'][^>]*data-location=["']([^"']+)["'][^>]*data-id=["']([^"']+)["'][^>]*data-menuid=["']([^"']+)["'][^>]*>\s*<span>([\s\S]*?)<\/span>/i);
if(first){
  const xmlUrl=Buffer.from(first[1],'base64').toString('utf8');
  console.log('first item',first[4].replace(/<[^>]+>/g,''),first[2],first[3]);
  console.log('xml url',xmlUrl);
  const xmlRes=await fetch(xmlUrl,{headers:{'User-Agent':UA,'Accept':'application/xml,text/xml,*/*'}});
  console.log('xml status',xmlRes.status);
  const xml=await xmlRes.text();
  console.log('xml bytes',xml.length);
  console.log('xml sample',xml.slice(0,8000));
}
const jsUrl='https://dining.berkeley.edu/wp-content/plugins/cal-dining/assets/custom.js?ver=1.0';
const jsRes=await fetch(jsUrl,{headers:{'User-Agent':UA,'Accept':'application/javascript,text/javascript,*/*'}});
console.log('custom js status',jsRes.status);
const js=await jsRes.text();
console.log('custom js bytes',js.length);
for(const line of js.split(/\r?\n/))if(/recip|recipe-details|menuid|data-location|ajaxurl|action\s*:|location\s*:|menu_id|recipe/i.test(line))console.log('JS',line.slice(0,1600));
