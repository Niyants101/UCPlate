import test from 'node:test';
import assert from 'node:assert/strict';
import {UCR_LOCATIONS,parseAvailableDates,parseShort,parseLong,parseLabel,publishedSchedule,sourceUrl} from './ucr-menus.mjs';

test('UCR registers the structured official dining locations',()=>{
  assert.equal(UCR_LOCATIONS.length,4);
  assert.equal(UCR_LOCATIONS.find(x=>x.id==='ucr-glasgow')?.sourceId,'03');
  assert.equal(UCR_LOCATIONS.find(x=>x.id==='ucr-lothian')?.sourceId,'02');
  assert.equal(UCR_LOCATIONS.find(x=>x.id==='ucr-noods')?.sourceId,'05');
  assert.equal(UCR_LOCATIONS.find(x=>x.id==='ucr-savor')?.sourceId,'25');
});

test('UCR posted dates come from FoodPro links',()=>{
  const html=`<a href="shortmenu.aspx?locationNum=03&amp;dtdate=10/9/2026">Friday</a><a href="shortmenu.aspx?locationNum=03&amp;dtdate=10/10/2026">Saturday</a>`;
  assert.deepEqual(parseAvailableDates(html),['2026-10-09','2026-10-10']);
});

test('UCR short menu preserves meal, station, diet, allergens and direct nutrition label link',()=>{
  const html=`<div class="shortmenutitle">Menus for Friday, October 9, 2026</div>
  <div class="shortmenumeals">Lunch</div>
  <div class="shortmenucats">-- Wok Kitchen --</div>
  <div class="shortmenurecipes"><a href="label.aspx?RecNumAndPort=123*1&amp;dtdate=10/9/2026&amp;locationName=Glasgow&amp;locationNum=03">Sweet &amp; Sour Tofu</a></div><img src="LegendImages/vegan.gif" alt="Vegan"><img alt="Contains Soybeans">`;
  const meals=parseShort(html,'2026-10-09');
  assert.equal(meals[0].name,'Lunch');
  assert.equal(meals[0].items[0].section,'Wok Kitchen');
  assert.equal(meals[0].items[0].diet,'vegan');
  assert.deepEqual(meals[0].items[0].allergens,['Soy']);
  const nutritionUrl=new URL(meals[0].items[0]._labelSource);
  assert.equal(nutritionUrl.hostname,'foodpro.ucr.edu');
  assert.equal(nutritionUrl.pathname,'/foodpro/label.aspx');
});

test('UCR long menu and label preserve serving calories protein and allergens',()=>{
  const long=`<div class="longmenucoldispname"><a href="label.aspx?RecNumAndPort=123*1">Sweet &amp; Sour Tofu</a></div><div class="longmenucolportions">4 oz</div>`;
  const entries=parseLong(long);
  assert.equal(entries[0].name,'Sweet & Sour Tofu');
  assert.equal(entries[0].serving,'4 oz');
  const label=`<div class="labelrecipe">Sweet &amp; Sour Tofu</div><div>Serving Size 4 oz Calories 250 Protein 18 g</div><span class="labelallergensvalue">Soybeans, Sesame</span><img alt="Vegan">`;
  const nutrition=parseLabel(label,'Sweet & Sour Tofu');
  assert.equal(nutrition.calories,250);
  assert.equal(nutrition.protein,18);
  assert.equal(nutrition.serving,'4 oz');
  assert.equal(nutrition.diet,'vegan');
  assert.deepEqual(nutrition.allergens,['Soy','Sesame']);
});

test('UCR official schedules preserve Glasgow weekend and Lothian closures',()=>{
  assert.deepEqual(publishedSchedule('ucr-glasgow','2026-10-10'),[
    {name:'Brunch',start:'10:00',end:'14:30'},
    {name:'Dinner',start:'17:00',end:'21:00'}
  ]);
  assert.deepEqual(publishedSchedule('ucr-lothian','2026-10-10'),[]);
  assert.deepEqual(publishedSchedule('ucr-lothian','2026-10-09'),[
    {name:'Lunch',start:'11:00',end:'14:30'},
    {name:'Continuous',start:'14:30',end:'16:30'},
    {name:'Dinner',start:'17:00',end:'22:00'}
  ]);
});

test('UCR source URLs stay on the official FoodPro host',()=>{
  const url=new URL(sourceUrl('2026-10-09','ucr-glasgow'));
  assert.equal(url.hostname,'foodpro.ucr.edu');
  assert.equal(url.searchParams.get('locationNum'),'03');
  assert.equal(url.searchParams.get('dtdate'),'10/9/2026');
});
