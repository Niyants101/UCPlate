import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDateStrip,parseVenueMenu,parseNutrition,getSchedule,venueUrl} from './ucsd-menus.mjs';

const menuFixture=`
<h2 class="datenow hidden-sm hidden-xs">Thursday, October 08 2026</h2>
<a class="linkBut" id="buta0" href="/dining/apps/diningservices/Restaurants/Venue_V3?locId=2&locDetID=37&dayNum=0">Thu Oct 08</a>
<a class="linkBut" id="buta1" href="/dining/apps/diningservices/Restaurants/Venue_V3?locId=2&locDetID=37&dayNum=1">Fri Oct 09</a>
<div id="breakfast" class="meal-category">
<h2 class="d-none d-md-block">Breakfast Menu</h2>
<div id="accordion" class="menu-category-section stationID-0">
<div class="menu-cat-secondary accordion-header"><h3> Taqueria</h3></div>
<a class="sublocs" href="#">Breakfast A La Carte</a>
<div class="station-list station_Taqueria">
<a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=111&recId=091004">Fried Egg</a>
<div class="proI"><span>Whole egg, cooked to order.</span></div>
<img title='Vegetarian' alt='Legend: Vegetarian Icon'/><img title='Contains Eggs' alt='Legend: Contains Eggs Icon'/>
<span class="cals">78 Cals</span>
<a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=111&recId=091004">Fried Egg</a>
<div class="proI"><span>Whole egg, cooked to order.</span></div><span class="cals">78 Cals</span>
</div></div></div>
<div id="lunch" class="meal-category">
<h2>Lunch Menu</h2><div class="menu-category-section stationID-1"><h3>Garden Bar</h3>
<a class="sublocs" href="#">Fruit</a>
<a class="sublocsitem" href="/dining/apps/diningservices/Nutrition/Nutritionfacts2?id=139&recId=231504">Fresh Fruit Salad</a>
<img title='Vegan' alt='Legend: Vegan Icon'/><span class="cals">44 Cals</span>
</div></div>`;

const nutritionFixture=`
<div><h1>Fried Egg </h1><p>Serving Size 1 each</p>
<table><tr><th scope="row">Calories</th><td>78</td></tr></table>
<table><tr><td>Protein 6.3 g</td><td>13%</td></tr></table>
<h2>Allergens</h2><div id="allergens"><img title="Vegetarian"><img title="Contains Eggs"></div>
<div class="alert alert-info"><h3 class="alert-heading">Disclaimer</h3></div></div>`;

test('UCSD date strip maps posted menu days',()=>{
  assert.deepEqual(parseDateStrip(menuFixture),[
    {date:'2026-10-08',dayNum:0},{date:'2026-10-09',dayNum:1}
  ]);
});

test('UCSD menu parser keeps meal, station, diet and allergens while deduping responsive cards',()=>{
  const parsed=parseVenueMenu(menuFixture,'2026-10-08');
  assert.equal(parsed.meals.length,2);
  assert.equal(parsed.meals[0].name,'Breakfast');
  assert.equal(parsed.meals[0].items.length,1);
  assert.equal(parsed.meals[0].items[0].section,'Taqueria');
  assert.equal(parsed.meals[0].items[0].diet,'vegetarian');
  assert.deepEqual(parsed.meals[0].items[0].allergens,['Eggs']);
  assert.equal(parsed.meals[0].items[0].calories,78);
  assert.equal(parsed.meals[1].items[0].diet,'vegan');
});

test('UCSD nutrition parser reads serving calories protein and published allergens',()=>{
  const item=parseNutrition(nutritionFixture,'Fried Egg');
  assert.equal(item.serving,'1 each');
  assert.equal(item.calories,78);
  assert.equal(item.protein,6.3);
  assert.equal(item.diet,'vegetarian');
  assert.deepEqual(item.allergens,['Eggs']);
});

test('UCSD regular hours normalize into official open windows',()=>{
  const monday=getSchedule({hours:{weekday:['07:00','23:00'],friday:['07:00','21:00'],weekend:['09:00','21:00']}},'2026-10-12');
  assert.deepEqual(monday,[{name:'Open',start:'07:00',end:'23:00'}]);
});

test('UCSD venue URLs stay on the official HDH source',()=>{
  assert.match(venueUrl({locId:'2',locDetID:'37'},3),/^https:\/\/hdh-web\.ucsd\.edu\/dining\/apps\/diningservices\/Restaurants\/Venue_V3\?/);
});
