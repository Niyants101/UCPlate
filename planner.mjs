export const SOURCES = {
  menu: 'https://nutrition.sa.ucsc.edu/shortmenu.aspx',
  hours: 'https://dining.ucsc.edu/locations-hours/nine-jrl/',
  eco: 'https://dining.ucsc.edu/programs-policies/eco-box/',
  protein: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
  storage: 'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/steps-keep-food-safe'
};
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
}
export function minutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Times must use HH:MM, such as 13:30.');
  return Number(time.slice(0,2))*60+Number(time.slice(3));
}
const clock = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validate(input) {
  if (!validDate(input.date)) throw new Error('Choose a valid date.');
  if (!finite(input.calories,500,10000) || !finite(input.protein,10,500)) throw new Error('Enter calorie and protein targets.');
  if (!Array.isArray(input.busy) || !Array.isArray(input.items) || !Array.isArray(input.meals)) throw new Error('Schedule, foods, and meals must be arrays.');
  if (input.items.length > 250 || input.busy.length > 100 || input.meals.length > 4) throw new Error('Too many schedule or food entries.');
  for (const b of input.busy) if (minutes(b.end) <= minutes(b.start)) throw new Error('Busy blocks must end after they start.');
  const periods = new Set();
  for (const m of input.meals) {
    if (!['breakfast','lunch','dinner','late night'].includes(m.period) || periods.has(m.period)) throw new Error('Use each meal period at most once.');
    periods.add(m.period);
    if (!['dine-in','eco-box'].includes(m.mode) || minutes(m.end) <= minutes(m.start)) throw new Error('Check meal mode and serving hours.');
  }
  for (const f of input.items) {
    if (!f.name || typeof f.name !== 'string' || f.name.length>150 || !finite(f.calories,0,3000) || !finite(f.protein,0,200) || !f.serving || !Array.isArray(f.allergens)) throw new Error('Every food needs a name, serving, numeric calories/protein, and allergen list.');
    if (!['entree','side'].includes(f.kind) || !['vegan','vegetarian','unknown'].includes(f.diet)) throw new Error('Every food needs a dietary label and entrée/side category.');
    if (typeof f.eggs !== 'boolean' || typeof f.dairy !== 'boolean') throw new Error('Every food must declare eggs and dairy.');
    if (f.diet==='vegan' && (f.eggs || f.dairy)) throw new Error('A vegan food cannot contain eggs or dairy. Check the dietary label.');
  }
  for(const period of ['breakfast','lunch','dinner','late night'])if(input.items.filter(f=>f.period===period && f.date===input.date).length>60)throw new Error('Limit foods to 60 per meal period.');
  if (!Array.isArray(input.allergens) || !finite(input.travelMinutes,0,120)) throw new Error('Check allergens and travel buffer.');
  return input;
}
function slot(meal,busy,travel) {
  const duration = meal.mode === 'eco-box' ? 10 : 30;
  const end = minutes(meal.end);
  for (let start=minutes(meal.start); start+duration<=end; start+=5) {
    if (meal.mode === 'eco-box' && (start<420 || start+duration>1320)) continue;
    if (busy.every(b=>start+duration+travel<=minutes(b.start) || start-travel>=minutes(b.end))) return {start:clock(start),end:clock(start+duration)};
  }
  return null;
}
function combinations(items,mode) {
  const entrees=items.filter(f=>f.kind==='entree'), sides=items.filter(f=>f.kind==='side');
  const result=[];
  for (const e of entrees) for (const amount of mode==='eco-box'?[1]:[1,2]) {
    const base=[{...e,quantity:amount}]; result.push(base);
    for(let i=0;i<sides.length;i++) {
      result.push([...base,{...sides[i],quantity:1}]);
      for(let j=i+1;j<sides.length;j++) result.push([...base,{...sides[i],quantity:1},{...sides[j],quantity:1}]);
    }
  }
  return result;
}
export const totals = foods => foods.reduce((t,f)=>({calories:t.calories+f.calories*f.quantity,protein:t.protein+f.protein*f.quantity}),{calories:0,protein:0});
export function planDay(raw) {
  const input=validate(raw), warnings=[], meals=[];
  const weekday=new Date(input.date+'T12:00:00Z').getUTCDay();
  const eligible=input.items.filter(f=>f.date===input.date && f.verified===true && f.diet!=='unknown' && (input.eggs===true || !f.eggs) && (input.dairy===true || !f.dairy) && !f.allergens.some(a=>input.allergens.map(s=>s.toLowerCase().trim()).includes(a.toLowerCase().trim())));
  if (input.items.some(f=>!eligible.includes(f))) warnings.push('Excluded foods with an unconfirmed date, nutrition, dietary label, or incompatible ingredients.');
  const scheduled=[];
  for (const m of [...input.meals].sort((a,b)=>minutes(a.start)-minutes(b.start))) {
    if (!m.confirmedHours) {warnings.push(`${m.period}: confirm this date’s serving hours first.`);continue;}
    if(m.mode==='eco-box' && (![1,2,3,4,5].includes(weekday) || !input.ecoAvailable || !input.ecoPaid)) {warnings.push(`${m.period}: Eco-Box needs a weekday during eligible service, an eligible payment method, and confirmation that service is available.`);continue;}
    const time=slot(m,[...input.busy,...scheduled],input.travelMinutes);
    if (!time) {warnings.push(`${m.period}: no free visit with your travel buffer.`);continue;}
    const choices=combinations(eligible.filter(f=>f.period===m.period),m.mode);
    if (!choices.length) {warnings.push(`${m.period}: no verified vegetarian entrée is available.`);continue;}
    scheduled.push(time); meals.push({...m,...time,choices});
  }
  let beam=[{meals:[],calories:0,protein:0}];
  const score=(c,p,targetC=input.calories,targetP=input.protein)=>Math.abs(c-targetC)/targetC+Math.abs(p-targetP)/targetP*1.5;
  for(let index=0;index<meals.length;index++) {
    const m=meals[index], fraction=(index+1)/meals.length, next=[];
    const ranked=m.choices.map(foods=>({foods,...totals(foods)})).sort((a,b)=>score(a.calories,a.protein,input.calories/meals.length,input.protein/meals.length)-score(b.calories,b.protein,input.calories/meals.length,input.protein/meals.length)).slice(0,120);
    for(const b of beam) for(const {foods} of ranked) {
      const t=totals(foods); const {choices,...details}=m;
      next.push({calories:b.calories+t.calories,protein:b.protein+t.protein,meals:[...b.meals,{...details,location:'College Nine / John R. Lewis Dining Hall',foods,...t}]});
    }
    next.sort((a,b)=>score(a.calories,a.protein,input.calories*fraction,input.protein*fraction)-score(b.calories,b.protein,input.calories*fraction,input.protein*fraction));
    beam=next.slice(0,80);
  }
  beam.sort((a,b)=>score(a.calories,a.protein)-score(b.calories,b.protein));
  const best=beam[0];
  if (!best.meals.length) warnings.push('No meals could be planned. Add verified foods and confirm serving hours.');
  if(best.meals.some(m=>m.mode==='eco-box')) warnings.push('Eco-Box is a separate takeout visit: one entrée and up to two sides, lid closed, exit within 10 minutes. Entry cost plus 10-point refundable deposit; unlimited plans do not cover takeout. Eat promptly or refrigerate within 2 hours (1 hour above 90°F); reheat leftovers to 165°F.');
  return {version:'1',date:input.date,timezone:'America/Los_Angeles',...best,targets:{calories:input.calories,protein:input.protein},remaining:{calories:Math.max(0,input.calories-best.calories),protein:Math.max(0,input.protein-best.protein)},warnings,sources:SOURCES,method:'Deterministic constrained search over user-verified menu entries; portion totals are estimates, not measured intake.'};
}
export function menuUrl(date) {
  if(!validDate(date)) throw new Error('Invalid menu date.');
  const [y,m,d]=date.split('-');
  const url=new URL(SOURCES.menu);
  url.search=new URLSearchParams({sName:'UC Santa Cruz Dining',locationNum:'40',locationName:'John R. Lewis & College Nine Dining Hall',naFlag:'1',WeeksMenus:"UCSC - This Week's Menus",myaction:'read',dtdate:`${Number(m)}/${Number(d)}/${y}`});
  return url.href;
}
