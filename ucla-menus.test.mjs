import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAvailableDates,parseDiningHours,parseUclaMenuMarkup,parseNutritionDetail,UCLA_LOCATIONS,UCLA_MENU_URL} from './ucla-menus.mjs';

const location={id:'ucla-epicuria-at-covel',name:'Epicuria at Covel',url:'https://dining.ucla.edu/epicuria-at-covel/'};
const page=`
<section><h3>Today’s Dining Hours</h3>
<p>Breakfast Closed</p><p>Lunch 11:00 a.m. - 3:00 p.m.</p><p>Dinner 5:00 p.m. - 9:00 p.m.</p><p>Extended Dinner 10:00 p.m. - 12:00 a.m.</p>
</section>
<label>Jump to date</label><select><option value="2026-10-08">October 8, 2026</option><option value="2026-10-09">October 9, 2026</option></select>
<p>Today, October 8, 2026</p>
<h2>LUNCH</h2>
<h2>Capri</h2>
<h3>Cavatappi Pasta</h3><img alt="Vegan"><img alt="Low-carbon"><img alt="Halal"><img alt="Gluten"><img alt="Wheat"><a href="/menu-item/?recipe=2564">See Meal Details</a>
<h3>Alfredo Sauce</h3><img alt="Vegetarian"><img alt="Dairy"><img alt="Gluten"><img alt="Wheat"><a href="https://dining.ucla.edu/menu-item/?recipe=111">See Meal Details</a>
<h2>Psistaris</h2>
<h3>Shrimp</h3><img alt="Halal"><img alt="Crustacean-shellfish"><a href="/menu-item/?recipe=222">See Meal Details</a>
<h2>DINNER</h2>
<h2>Alimenti</h2><h3>Rosemary Chicken</h3><a href="/menu-item/?recipe=333">See Meal Details</a>`;

const detail=`<main><h2>Cavatappi Pasta</h2><button>Nutrition</button><p>Serving Size: 6.07oz</p><div>Calories 319</div><div>Protein 10.49g | 21%</div><p>Allergens*: Gluten, Wheat</p></main>`;

test('UCLA discovers posted dates from the official date selector',()=>{
  assert.deepEqual(parseAvailableDates(page),['2026-10-08','2026-10-09']);
});

test('UCLA dining hours preserve meal periods and midnight endings',()=>{
  assert.deepEqual(parseDiningHours(page),[
    {name:'Lunch',start:'11:00',end:'15:00'},
    {name:'Dinner',start:'17:00',end:'21:00'},
    {name:'Extended Dinner',start:'22:00',end:'24:00'}
  ]);
});

test('UCLA parser keeps meals, stations, diets, allergens and recipe links',()=>{
  const meals=parseUclaMenuMarkup(page,'2026-10-08',location);
  assert.deepEqual(meals.map(meal=>meal.name),['Lunch','Dinner']);
  const pasta=meals[0].items.find(item=>item.name==='Cavatappi Pasta');
  assert.equal(pasta.section,'Capri');
  assert.equal(pasta.diet,'vegan');
  assert.deepEqual(pasta.allergens,['Wheat','Gluten']);
  assert.equal(pasta._recipeId,'2564');
  const alfredo=meals[0].items.find(item=>item.name==='Alfredo Sauce');
  assert.equal(alfredo.diet,'vegetarian');
  assert.deepEqual(alfredo.allergens,['Milk','Wheat','Gluten']);
  assert.deepEqual(meals[0].items.find(item=>item.name==='Shrimp').allergens,['Shellfish']);
});

test('UCLA nutrition detail preserves published serving calories protein and allergens',()=>{
  assert.deepEqual(parseNutritionDetail(detail,'Cavatappi Pasta'),{
    nutritionStatus:'available',calories:319,protein:10.49,serving:'6.07oz',allergens:['Gluten','Wheat']
  });
});

test('UCLA nutrition rejects a mismatched item title instead of guessing',()=>{
  const parsed=parseNutritionDetail(detail,'Different Food');
  assert.equal(parsed.nutritionStatus,'unavailable');
  assert.equal(parsed.calories,null);
  assert.equal(parsed.protein,null);
});

test('UCLA parser rejects a substituted menu date',()=>{
  assert.throws(()=>parseUclaMenuMarkup(page,'2026-10-09',location),/instead of 2026-10-09/);
});

test('UCLA registry covers residential and boutique official menu pages',()=>{
  assert.ok(UCLA_LOCATIONS.length>=12);
  assert.equal(UCLA_LOCATIONS.filter(location=>location.kind==='dining-hall').length,4);
  assert.ok(UCLA_LOCATIONS.some(location=>location.name==='The Study at Hedrick'));
  assert.match(UCLA_MENU_URL,/^https:\/\/dining\.ucla\.edu\//);
});
