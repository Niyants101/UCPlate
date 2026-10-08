import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAvailableDates,parseBerkeleyMenuMarkup,parseNutritionDetail,parseHours,UCB_MENU_URL} from './ucb-menus.mjs';

const MENU=`
<select id="date">
  <option value="20261008">Today</option>
  <option value="20261009">Tomorrow</option>
</select>
<ul class="cafe-location">
<li class="location-name Cafe 3 20261008">
  <div class="location-title"><span class="cafe-title">Café 3</span></div>
  <div class="status-period-wrap">
    <div class="cafe-status"><div class="times">
      <span>7:00 a.m. - 10:00 a.m.</span><span>11:00 a.m. - 3:00 p.m.</span><span>4:30 p.m. - 9:00 p.m.</span>
    </div><span class="serve-date">Thu, Oct 8</span></div>
    <ul class="meal-period">
      <li class="preiod-name Fall - Breakfast"><span>Fall - Breakfast <span class="accordion-icon"></span></span>
        <div class="recipes-main-wrap"><div class="cat-name"><span>Center Plate</span><ul class="recipe-name">
          <li class="recip egg vegetarian-option" data-location="TOKEN1" data-id="556" data-menuid="370"><span>Scrambled Eggs</span><span class="icons-wrap"><img alt="Egg"><img alt="Vegetarian Option"></span></li>
          <li class="recip wheat gluten vegan-option" data-location="TOKEN2" data-id="1382" data-menuid="370"><span>Hash Brown Patty</span><span class="icons-wrap"><img alt="Vegan Option"><img alt="Wheat"><img alt="Gluten"></span></li>
        </ul></div></div>
      </li>
      <li class="preiod-name Fall - Dinner"><span>Fall - Dinner <span class="accordion-icon"></span></span>
        <div class="recipes-main-wrap"><div class="cat-name"><span>Bear Fit</span><ul class="recipe-name">
          <li class="recip milk" data-location="TOKEN3" data-id="901" data-menuid="371"><span>Roasted Chicken</span><span class="icons-wrap"><img alt="Milk"></span></li>
        </ul></div></div>
      </li>
    </ul>
  </div>
</li>
<li class="location-name Bear Market 20261008">
  <div class="location-title"><span class="cafe-title">Bear Market</span></div>
  <div class="cafe-status"><div class="times"><span>9:00 a.m. - 11:00 p.m.</span></div></div>
  <ul class="meal-period"><li class="preiod-name Fall - Lunch"><span>Fall - Lunch <span class="accordion-icon"></span></span>
    <div class="recipes-main-wrap"><div class="cat-name"><span>Grab &amp; Go</span><ul class="recipe-name">
      <li class="recip vegan-option" data-location="TOKEN4" data-id="100" data-menuid="400"><span>Fruit Cup</span><span class="icons-wrap"><img alt="Vegan Option"></span></li>
    </ul></div></div>
  </li></ul>
</li>
</ul>`;

const NUTRITION=`
<div class="title sec"><h5 style="font-weight:700;">Scrambled Eggs</h5><span class="serving-size">Serving Size: 3.93 oz</span></div>
<div class="nutration-details sec"><ul>
<li><span>Calories (kcal):</span>184.98</li>
<li><span>Protein (g):</span>13.92</li>
</ul></div>
<div class="allergens sec"><h4>Allergens:</h4><span>Egg</span></div>`;

test('Berkeley posted dates come from the official date selector',()=>{
  assert.deepEqual(parseAvailableDates(MENU),['2026-10-08','2026-10-09']);
});

test('Berkeley parser keeps locations, meal periods, stations, diets and allergens',()=>{
  const locations=parseBerkeleyMenuMarkup(MENU,'2026-10-08');
  assert.equal(locations.length,2);
  const cafe=locations[0];
  assert.equal(cafe.id,'ucb-cafe-3');
  assert.equal(cafe.name,'Café 3');
  assert.equal(cafe.kind,'dining-hall');
  assert.deepEqual(cafe.schedule,[
    {name:'Open',start:'07:00',end:'10:00'},
    {name:'Open',start:'11:00',end:'15:00'},
    {name:'Open',start:'16:30',end:'21:00'}
  ]);
  assert.deepEqual(cafe.meals.map(meal=>meal.name),['Breakfast','Dinner']);
  assert.equal(cafe.meals[0].items[0].section,'Center Plate');
  assert.equal(cafe.meals[0].items[0].diet,'vegetarian');
  assert.deepEqual(cafe.meals[0].items[0].allergens,['Egg']);
  assert.equal(cafe.meals[0].items[1].diet,'vegan');
  assert.deepEqual(cafe.meals[0].items[1].allergens,['Wheat','Gluten']);
  assert.equal(locations[1].kind,'market');
  assert.equal(locations[1].meals[0].items[0].section,'Grab & Go');
});

test('Berkeley parser refuses a substituted menu date',()=>{
  assert.throws(()=>parseBerkeleyMenuMarkup(MENU.replaceAll('20261008','20261009'),'2026-10-08'),/instead of 20261008/);
});

test('Berkeley nutrition popup yields exact serving calories protein and allergens',()=>{
  assert.deepEqual(parseNutritionDetail(NUTRITION,'Scrambled Eggs'),{
    nutritionStatus:'available',calories:184.98,protein:13.92,serving:'3.93 oz',allergens:['Egg']
  });
});

test('Berkeley nutrition rejects a mismatched recipe title',()=>{
  assert.equal(parseNutritionDetail(NUTRITION,'Not Scrambled Eggs').nutritionStatus,'unavailable');
});

test('Berkeley hours understand noon and midnight correctly',()=>{
  assert.deepEqual(parseHours('<div class="times"><span>12:00 p.m. - 11:30 p.m.</span><span>12:00 a.m. - 2:00 a.m.</span></div>'),[
    {name:'Open',start:'12:00',end:'23:30'},{name:'Open',start:'00:00',end:'02:00'}
  ]);
});

test('Berkeley source remains the official Dining site',()=>{
  assert.equal(new URL(UCB_MENU_URL).hostname,'dining.berkeley.edu');
});
