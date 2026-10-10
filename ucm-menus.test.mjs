import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryInfo,parseItem,publishedSchedule,UCM_LOCATIONS} from './ucm-menus.mjs';

test('UC Merced exposes Pavilion and Yablokoff-Wallace',()=>{
  assert.deepEqual(UCM_LOCATIONS.map(location=>location.id),['ucm-pavilion','ucm-ywdc']);
});

test('categoryInfo separates meal names from station names',()=>{
  assert.deepEqual(categoryInfo('FoG Lunch & Dinner'),{meals:['Lunch','Dinner'],station:'FoG'});
  assert.deepEqual(categoryInfo('Bakery'),{meals:['All Day'],station:'Bakery'});
  assert.deepEqual(categoryInfo('Late Night'),{meals:['Late Night'],station:'Main'});
});

test('parseItem keeps only explicitly published nutrition and dietary data',()=>{
  const item=parseItem({
    name:'Black Bean Bowl',
    description:'Rice and beans',
    caloriesCalculationSize:[{calories:430,servingSize:'1 bowl'}],
    nutrition:[{name:'Protein',value:'19 g'}],
    allergens:['Soy','Wheat'],
    lifestyleChoices:['Vegan']
  });
  assert.equal(item.name,'Black Bean Bowl');
  assert.equal(item.calories,430);
  assert.equal(item.protein,19);
  assert.equal(item.diet,'vegan');
  assert.deepEqual(item.allergens,['Soy','Wheat']);
});

test('parseItem does not invent missing nutrition',()=>{
  const item=parseItem({name:'Mystery Special'});
  assert.equal(item.calories,null);
  assert.equal(item.protein,null);
  assert.equal(item.diet,'unknown');
  assert.deepEqual(item.allergens,[]);
});

test('published schedules match current UC Merced dining hours',()=>{
  assert.deepEqual(publishedSchedule('ucm-pavilion','2026-10-10'),[
    {name:'Breakfast',start:'09:00',end:'10:30'},
    {name:'Lunch',start:'11:00',end:'15:00'},
    {name:'Dinner',start:'16:00',end:'21:00'}
  ]);
  assert.deepEqual(publishedSchedule('ucm-ywdc','2026-10-12'),[
    {name:'Lunch',start:'10:00',end:'14:00'},
    {name:'Dinner',start:'15:00',end:'20:00'},
    {name:'Late Night',start:'21:00',end:'24:00'}
  ]);
  assert.deepEqual(publishedSchedule('ucm-ywdc','2026-10-11'),[]);
});
