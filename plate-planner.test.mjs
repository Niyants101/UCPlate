import test from 'node:test';
import assert from 'node:assert/strict';
import {generateStationPlates,itemAllowed,rolesForItem} from './plate-planner.mjs';

const item=(name,section,calories,protein,diet='unknown',allergens=[])=>({
  name,section,calories,protein,diet,allergens,serving:'1 serving',source:`https://nutrition.sa.ucsc.edu/label.aspx?item=${encodeURIComponent(name)}`
});

const italian=[
  item('Penne','Hot Bars',419,14.5,'vegan',['Wheat','Gluten']),
  item('Housemade Creamy Alfredo Sauce','Hot Bars',578,6,'vegetarian',['Milk']),
  item('Marinara Sauce','Hot Bars',53,1.5,'vegan',[]),
  item('Porcini Crusted Roasted Chicken','Hot Bars',312,32.9,'unknown',['Milk']),
  item('Italian Roasted Squash and Carrots','Hot Bars',60,1.9,'vegan',[]),
  item('Focaccia Breadsticks','Hot Bars',62,2,'vegan',['Wheat','Gluten','Sesame']),
  item('Vegan Italian White Beans','Hot Bars',72,3.3,'vegan',[])
];

test('recognizes pasta roles and builds a cohesive pasta plate',()=>{
  assert.ok(rolesForItem(italian[0]).includes('pasta'));
  assert.ok(rolesForItem(italian[1]).includes('sauce'));
  const stations=generateStationPlates({items:italian,profile:{dietPreference:'omnivore',allergens:[],avoidFoods:[]},target:{calories:850,protein:45},mealName:'Lunch'});
  const hot=stations.find(s=>s.section==='Hot Bars');
  assert.ok(hot);
  assert.equal(hot.theme,'pasta');
  assert.ok(hot.options.length>=1);
  const names=hot.options[0].parts.map(p=>p.item.name);
  assert.ok(names.some(name=>/Penne/.test(name)));
  assert.ok(names.some(name=>/Sauce/.test(name)));
  assert.ok(hot.options[0].parts.length>=2);
});

test('milk allergy excludes alfredo and milk-containing chicken',()=>{
  assert.equal(itemAllowed(italian[1],{dietPreference:'omnivore',allergens:['milk'],avoidFoods:[]}),false);
  const stations=generateStationPlates({items:italian,profile:{dietPreference:'omnivore',allergens:['milk'],avoidFoods:[]},target:{calories:700,protein:30},mealName:'Lunch'});
  const used=stations.flatMap(s=>s.options.flatMap(o=>o.parts.map(p=>p.item.name)));
  assert.ok(!used.includes('Housemade Creamy Alfredo Sauce'));
  assert.ok(!used.includes('Porcini Crusted Roasted Chicken'));
});

test('vegan preference only uses vegan foods',()=>{
  const stations=generateStationPlates({items:italian,profile:{dietPreference:'vegan',allergens:[],avoidFoods:[]},target:{calories:700,protein:25},mealName:'Lunch'});
  for(const station of stations)for(const option of station.options)for(const part of option.parts)assert.equal(part.item.diet,'vegan');
});

test('custom avoid foods are strict',()=>{
  const stations=generateStationPlates({items:italian,profile:{dietPreference:'omnivore',allergens:[],avoidFoods:['penne','beans']},target:{calories:700,protein:25},mealName:'Lunch'});
  const used=stations.flatMap(s=>s.options.flatMap(o=>o.parts.map(p=>p.item.name.toLowerCase())));
  assert.ok(used.every(name=>!name.includes('penne')&&!name.includes('beans')));
});

test('returns no recommendation when every item is filtered out',()=>{
  const stations=generateStationPlates({items:[item('Peanut Noodles','Hot Bars',500,20,'vegan',['Peanut','Wheat'])],profile:{dietPreference:'vegan',allergens:['peanut'],avoidFoods:[]},target:{calories:600,protein:25},mealName:'Lunch'});
  assert.deepEqual(stations,[]);
});

test('portion optimizer can use half servings instead of stacking unrelated foods',()=>{
  const stations=generateStationPlates({items:italian,profile:{dietPreference:'omnivore',allergens:[],avoidFoods:[]},target:{calories:650,protein:35},mealName:'Lunch'});
  const plate=stations[0].options[0];
  assert.ok(plate.parts.every(part=>[0.25,0.5,0.75,1,1.5,2].includes(part.quantity)));
  assert.ok(plate.parts.length<=4);
});
