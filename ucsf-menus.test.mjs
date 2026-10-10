import test from 'node:test';
import assert from 'node:assert/strict';
import {dietaryFlags,parseMenuGroups,publishedSchedule,UCSF_LOCATIONS} from './ucsf-menus.mjs';

test('UCSF exposes the three retail cafe campuses',()=>{
  assert.deepEqual(UCSF_LOCATIONS.map(location=>location.facilityId),['PARN','MBH','ZION']);
});

test('UCSF dietary markers are parsed without inventing flags',()=>{
  assert.deepEqual(dietaryFlags('Impossible Sausage (Vg) (GF)'),{diet:'vegan',glutenFree:true});
  assert.deepEqual(dietaryFlags('Cheese Pizza (V)'),{diet:'vegetarian',glutenFree:false});
  assert.deepEqual(dietaryFlags('Chicken'),{diet:'unknown',glutenFree:false});
});

test('Meal Choice publishing groups become UCPlate items',()=>{
  const items=parseMenuGroups([{
    publishingGroup:{publishingGroup:{name:'Chef Table'}},
    menuItems:[{recipeId:12,roundedCalories:'420',recipe:{description:'Tofu Bowl (Vg)',menuText:'with vegetables',menuPublishingGroup:{name:'Main'}}}]
  }],'Lunch');
  assert.equal(items.length,1);
  assert.equal(items[0].name,'Tofu Bowl');
  assert.equal(items[0].calories,420);
  assert.equal(items[0].diet,'vegan');
  assert.equal(items[0].section,'Chef Table');
});

test('published cafe hours match UCSF campus dining hours',()=>{
  assert.deepEqual(publishedSchedule('ucsf-parnassus','2026-10-10'),[{name:'Open',start:'07:00',end:'15:00'}]);
  assert.deepEqual(publishedSchedule('ucsf-parnassus','2026-10-12'),[{name:'Open',start:'06:30',end:'19:00'}]);
  assert.deepEqual(publishedSchedule('ucsf-mission-bay','2026-10-11'),[{name:'Open',start:'07:00',end:'15:00'}]);
  assert.deepEqual(publishedSchedule('ucsf-mount-zion','2026-10-12'),[{name:'Open',start:'07:00',end:'14:00'}]);
  assert.deepEqual(publishedSchedule('ucsf-mount-zion','2026-10-11'),[]);
});
