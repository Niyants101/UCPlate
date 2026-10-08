const UA='UCPlate/0.1 (+https://ucplate.com)';
const ORIGIN='https://dining.berkeley.edu';
const menuUrl=`${ORIGIN}/menus/`;
const response=await fetch(menuUrl,{headers:{'User-Agent':UA,'Accept':'text/html'}});
const html=await response.text();
console.log('menu status',response.status,'bytes',html.length);
console.log('date options',[...html.matchAll(/<option\s+value=["'](\d{8})["'][^>]*>([\s\S]*?)<\/option>/gi)].map(m=>[m[1],m[2].replace(/<[^>]+>/g,'').trim()]));
console.log('location date tokens',Array.from(new Set([...html.matchAll(/<li\b[^>]*class=["'][^"']*\blocation-name\b[^"']*\b(\d{8})\b[^"']*["']/gi)].map(m=>m[1]))));
const jsUrl=`${ORIGIN}/wp-content/plugins/cal-dining/assets/custom.js?ver=1.0`;
const js=await (await fetch(jsUrl,{headers:{'User-Agent':UA}})).text();
for(const action of ["action: 'cald_filter_xml'","action: 'get_all_mealperiods'"]){
  const i=js.indexOf(action);
  console.log('\nBLOCK',action,'\n',js.slice(Math.max(0,i-1800),i+2400));
}
const nextDate=[...html.matchAll(/<option\s+value=["'](\d{8})["'][^>]*>/gi)].map(m=>m[1])[1];
if(nextDate){
  const ajax=`${ORIGIN}/wp-admin/admin-ajax.php`;
  const candidates=[
    {action:'cald_filter_xml',date:nextDate},
    {action:'cald_filter_xml',Date:nextDate},
    {action:'cald_filter_xml',location:'',meal:'',date:nextDate},
  ];
  for(const body of candidates){
    const res=await fetch(ajax,{method:'POST',headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Referer':menuUrl},body:new URLSearchParams(body)});
    const text=await res.text();
    console.log('filter',body,'status',res.status,'bytes',text.length,'sample',text.slice(0,3000));
  }
}
