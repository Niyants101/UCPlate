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

test('time formatting is readable',()=>{
  assert.equal(formatMinutes(11*60+30),'11:30 AM');
  assert.equal(formatMinutes(17*60),'5 PM');
});
