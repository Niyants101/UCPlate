import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeekStart,weekDates,parseDavisMenuMarkup,getSchedule,UCD_MENU_URL} from './ucd-menus.mjs';

const location={id:'ucd-segundo',name:'Segundo Dining Commons',url:'https://housing.ucdavis.edu/dining/dining-commons/segundo/'};
const item=(classes,name,details,icon='')=>`<div class="panel panel-default ${classes}"><div class="panel-heading"><h4 class="panel-title"><a class="collapsed nutrition-panel">${name}</a></h4></div><div class="panel-body"><div class="mealDetails">${icon}${details}</div></div></div>`;
const page=`
<!--Date Check: 2026-10-04-->
<div class="tab-pane" id="wednesday"><h2 id="breakfast" class="stickyMealHeader">Breakfast</h2></div>
<div class="tab-pane active" id="thursday">
  <h2 id="breakfast" class="stickyMealHeader">Breakfast</h2>
  <div class="col-xs-12 col-lg-3 red"><h3>Red Zone</h3><div class="dcMenuContainer">
    ${item('filterNonVegan isVegetarian isHalal filterEgg','Scrambled Egg','<p class="underline"><strong>Contains</strong>: Egg.</p><p class="underline"><strong>Serving Size</strong>: 3.05 oz</p><p class="underline"><strong>Calories</strong>: 138.75</p><p class="underline"><strong>Protein (g)</strong>: 10.86</p>','<img alt="Vegetarian">')}
    ${item('isVegan isHalal filterSoy','Just Egg Plant Based','<p class="underline"><strong>Contains</strong>: Soy Lecithin.</p><p class="underline"><strong>Serving Size</strong>: 3 oz</p><p class="underline"><strong>Calories</strong>: 136.60</p><p class="underline"><strong>Protein (g)</strong>: 9.77</p>','<img alt="Vegan">')}
  </div></div>
  <div class="col-xs-12 col-lg-3 green"><h3>Green Zone</h3><div class="dcMenuContainer">
    ${item('isVegan isHalal','Oatmeal','<p class="underline"><strong>Contains</strong>: No major allergens.</p><p class="underline"><strong>Serving Size</strong>: 1 oz</p><p class="underline"><strong>Calories</strong>: 14.81</p><p class="underline"><strong>Protein (g)</strong>: 0.51</p>','<img alt="Vegan">')}
  </div></div>
  <h2 id="lunch" class="stickyMealHeader">Lunch</h2>
  <div class="col-xs-12 col-lg-3 yellow"><h3>Yellow Zone</h3>
    ${item('filterNonVegan filterDairy filterWheatGluten','Chicken Sandwich','<p class="underline"><strong>Contains</strong>: Dairy, Wheat/Gluten.</p><p class="underline"><strong>Serving Size</strong>: 1 each</p><p class="underline"><strong>Calories</strong>: </p><p class="underline"><strong>Protein (g)</strong>: </p>')}
  </div>
</div>
<div class="tab-pane" id="friday"><h2 id="breakfast" class="stickyMealHeader">Breakfast</h2></div>`;

test('UC Davis menu week is anchored by official Date Check',()=>{
  assert.equal(parseWeekStart(page),'2026-10-04');
  assert.deepEqual(weekDates(page),['2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10']);
});

test('UC Davis parser keeps meals, zones, diets, allergens and exact nutrition',()=>{
  const meals=parseDavisMenuMarkup(page,'2026-10-08',location);
  assert.deepEqual(meals.map(meal=>meal.name),['Breakfast','Lunch']);
  const egg=meals[0].items.find(food=>food.name==='Scrambled Egg');
  assert.equal(egg.section,'Red Zone');
  assert.equal(egg.diet,'vegetarian');
  assert.deepEqual(egg.allergens,['Egg']);
  assert.equal(egg.calories,138.75);
  assert.equal(egg.protein,10.86);
  assert.equal(egg.serving,'3.05 oz');
  assert.equal(egg.nutritionStatus,'available');
  const vegan=meals[0].items.find(food=>food.name==='Just Egg Plant Based');
  assert.equal(vegan.diet,'vegan');
  assert.deepEqual(vegan.allergens,['Soy Lecithin']);
  assert.deepEqual(meals[0].items.find(food=>food.name==='Oatmeal').allergens,[]);
});

test('UC Davis parser never invents missing nutrition',()=>{
  const lunch=parseDavisMenuMarkup(page,'2026-10-08',location).find(meal=>meal.name==='Lunch');
  const sandwich=lunch.items[0];
  assert.equal(sandwich.calories,null);
  assert.equal(sandwich.protein,null);
  assert.equal(sandwich.nutritionStatus,'unavailable');
  assert.deepEqual(sandwich.allergens,['Milk','Wheat','Gluten']);
});

test('UC Davis parser rejects a date outside the posted menu week',()=>{
  assert.throws(()=>parseDavisMenuMarkup(page,'2026-10-11',location),/does not contain menu week/);
});

test('UC Davis published service windows preserve weekend closures',()=>{
  assert.deepEqual(getSchedule('ucd-segundo','2026-10-10'),[
    {name:'Breakfast',start:'09:00',end:'11:00'},
    {name:'Lunch',start:'11:00',end:'17:00'},
    {name:'Dinner',start:'17:00',end:'20:00'}
  ]);
  assert.deepEqual(getSchedule('ucd-tercero','2026-10-10'),[]);
  assert.equal(getSchedule('ucd-latitude','2026-10-08')[1].end,'16:30');
});

test('UC Davis source remains the official Housing and Dining site',()=>{
  assert.match(UCD_MENU_URL,/^https:\/\/housing\.ucdavis\.edu\/dining\/menus\/$/);
});
