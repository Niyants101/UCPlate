import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFreeWindows,buildMealSuggestions,formatMinutes} from './calendar-context.mjs';

test('free windows appear around buffered classes',()=>{
  const free=buildFreeWindows([{start:9*60,end:10*60},{start:12*60,end:13*60}],{dayStart:'08:00',dayEnd:'15:00',bufferMinutes:10,minMinutes:25});
  assert.deepEqual(free,[{start:8*60,end:8*60+50},{start:10*60+10,end:11*60+50},{start:13*60+10,end:15*60}]);
});

test('meal timing prefers saved dining hall and labels preceding class',()=>{
  const events=[{title:'CSE 20',start:10*60,end:11*60},{title:'Physics',start:14*60,end:15*60}];
  const locations=[
    {id:'40',name:'College Nine / John R. Lewis',schedule:[{name:'Lunch',start:'11:30',end:'14:00'}]},
    {id:'05',name:'Cowell / Stevenson',schedule:[{name:'Lunch',start:'11:30',end:'14:00'}]}
  ];
  const [lunch]=buildMealSuggestions({events,locations,preferredLocationId:'40'});
  assert.equal(lunch.meal,'Lunch');
  assert.equal(lunch.locationId,'40');
  assert.equal(lunch.previous.title,'CSE 20');
  assert.equal(lunch.start,11*60+30);
});

test('continuous dining is not treated as a full meal suggestion',()=>{
  const locations=[{id:'40',name:'C9',schedule:[{name:'Continuous Dining',start:'14:00',end:'17:00',limited:true},{name:'Dinner',start:'17:00',end:'20:00'}]}];
  const suggestions=buildMealSuggestions({events:[],locations});
  assert.deepEqual(suggestions.map(x=>x.meal),['Dinner']);
});

test('generic open hours become the meal periods actually published by the location',()=>{
  const locations=[{
    id:'ucsd-64-degrees',
    name:'64 Degrees',
    schedule:[{name:'Open',start:'07:00',end:'23:00'}],
    meals:[{name:'Breakfast'},{name:'Lunch'}]
  }];
  const suggestions=buildMealSuggestions({events:[],locations});
  assert.deepEqual(suggestions.map(x=>x.meal),['Breakfast','Lunch']);
  assert.equal(suggestions[0].servingName,'Breakfast');
  assert.equal(suggestions[1].servingName,'Lunch');
  assert.equal(suggestions[0].scheduleName,'Open');
});

test('combined published UCSD meal labels split into useful planning windows',()=>{
  const locations=[{
    id:'ucsd-test',
    name:'UCSD Test',
    schedule:[{name:'Open',start:'08:00',end:'21:00'}],
    meals:[{name:'Lunch / Dinner'}]
  }];
  const suggestions=buildMealSuggestions({events:[],locations});
  assert.deepEqual(suggestions.map(x=>x.meal),['Lunch','Dinner']);
});

test('time formatting is readable',()=>{
  assert.equal(formatMinutes(11*60+30),'11:30 AM');
  assert.equal(formatMinutes(17*60),'5 PM');
});
