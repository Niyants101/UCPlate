const $=id=>document.getElementById(id);
const el=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
let menu=null,sequence=0,controller;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('menuDate').value=today;
function render(){
  const root=$('menuItems');root.replaceChildren();if(!menu)return;
  const query=$('menuSearch').value.trim().toLowerCase();
  let items=menu.items.filter(i=>(!$('vegetarianOnly').checked||['vegan','vegetarian'].includes(i.diet))&&i.name.toLowerCase().includes(query));
  const sort=$('menuSort').value;if(sort!=='station')items.sort((a,b)=>(b[sort]??-1)-(a[sort]??-1));
  if(!items.length){root.append(el('p',menu.items.length?'No foods match these filters. Try another meal or clear your search.':'No items are published for this meal.','menu-empty'));return;}
  root.append(el('p',`${items.length} foods · ${menu.meal} · ${menu.date}`,'menu-count'));
  const table=el('table','','nutrition-table'),head=el('thead',''),row=el('tr','');
  for(const title of ['Food & serving','Calories','Protein'])row.append(el('th',title));head.append(row);table.append(head);
  const body=el('tbody','');let section;
  for(const item of items){
    if(sort==='station'&&section!==item.section){section=item.section;const r=el('tr','','station-row'),c=el('th',section||'Menu');c.colSpan=3;c.scope='rowgroup';r.append(c);body.append(r);}
    const tr=el('tr',''),food=el('td','');
    const a=el('a',item.name,'food-name');a.href=item.source;a.target='_blank';a.rel='noreferrer';food.append(a);
    const details=el('div','','food-meta');details.append(el('span',item.serving||'Serving not listed'),el('span',item.diet==='vegan'?'Vegan':item.diet==='vegetarian'?'Vegetarian':'Not marked vegetarian',`diet-tag ${item.diet}`));if(sort!=='station')details.append(el('span',item.section,'station-hint'));food.append(details);
    const calories=el('td',item.calories===null?'—':`${item.calories}`,'macro'),protein=el('td',item.protein===null?'—':`${item.protein} g`,'macro protein');
    tr.append(food,calories,protein);body.append(tr);
  }table.append(body);const wrap=el('div','','table-scroll');wrap.append(table);root.append(wrap);
}
async function load(resetMeal=false){
  const id=++sequence;controller?.abort();controller=new AbortController();menu=null;
  $('menuItems').replaceChildren(el('p','Reading the dining menu and nutrition labels…','menu-empty'));
  $('menuStatus').textContent='Loading from UCSC. The first load can take a little longer.';$('menuUpdated').textContent='';$('refresh').disabled=true;$('menuLink').removeAttribute('href');
  const date=$('menuDate').value,hall=$('hall').value,meal=resetMeal?'':$('menuMeal').value;
  try{
    const response=await fetch(`/api/menu?${new URLSearchParams({date,hall,...(meal?{meal}:{})})}`,{signal:controller.signal});
    const result=await response.json();if(id!==sequence)return;
    if(!response.ok)throw new Error(result.message||'Could not load UCSC menus.');
    menu=result;$('menuMeal').replaceChildren(...result.meals.map(name=>{const option=el('option',name);option.value=name;return option;}));
    if(result.meal)$('menuMeal').value=result.meal;
    $('menuStatus').textContent=result.message;$('menuLink').href=result.source;
    $('menuUpdated').textContent=`Retrieved ${new Date(result.fetchedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · refreshes every 10 minutes`;
    render();
  }catch(error){if(id!==sequence||error.name==='AbortError')return;$('menuStatus').textContent=`Menu unavailable: ${error.message}`;$('menuItems').replaceChildren(el('p','Try refreshing or choose another date. No old menu is being shown as live.','menu-empty'));}
  finally{if(id===sequence)$('refresh').disabled=false;}
}
$('hall').onchange=()=>load(true);$('menuDate').onchange=()=>load(true);$('menuMeal').onchange=()=>load();$('refresh').onclick=()=>load();
$('vegetarianOnly').onchange=render;$('menuSort').onchange=render;$('menuSearch').oninput=render;
setInterval(()=>{if(document.visibilityState==='visible')load();},10*60*1000);
load(true);

