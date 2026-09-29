import test from 'node:test';
import assert from 'node:assert/strict';
import {planDay,validDate,menuUrl} from './planner.mjs';
import {normalizeEvents} from './calendar.mjs';
const food=(changes={})=>({name:'Synthetic test entrée',date:'2026-10-06',period:'lunch',kind:'entree',serving:'1 portion',calories:500,protein:30,diet:'vegan',eggs:false,dairy:false,allergens:[],verified:true,...changes});
const input=(changes={})=>({date:'2026-10-06',calories:1000,protein:60,eggs:true,dairy:true,allergens:[],travelMinutes:15,busy:[],meals:[{period:'lunch',start:'11:30',end:'14:00',mode:'dine-in',confirmedHours:true}],items:[food()],...changes});
test('fits servings to targets',()=>{const p=planDay(input());assert.equal(p.calories,1000);assert.equal(p.protein,60);assert.equal(p.meals[0].foods[0].quantity,2);});
test('class plus travel removes impossible visit',()=>assert.equal(planDay(input({busy:[{start:'11:00',end:'14:00'}]})).meals.length,0));
test('places meal after a busy block and buffer',()=>assert.equal(planDay(input({busy:[{start:'11:00',end:'12:00'}]})).meals[0].start,'12:15'));
test('filters unknown, unverified, wrong date, allergens and dairy',()=>{for(const item of [food({diet:'unknown'}),food({verified:false}),food({date:'2026-10-07'}),food({allergens:['Soy']}),food({diet:'vegetarian',dairy:true})])assert.equal(planDay(input({dairy:false,allergens:['soy'],items:[item]})).meals.length,0);});
test('does not plan unconfirmed hours',()=>{const i=input();i.meals[0].confirmedHours=false;assert.equal(planDay(i).meals.length,0);});
test('Eco-Box is one entrée and at most two distinct sides',()=>{const i=input({ecoAvailable:true,ecoPaid:true,items:[food(),food({name:'side1',kind:'side',calories:100,protein:5}),food({name:'side2',kind:'side',calories:200,protein:10}),food({name:'side3',kind:'side',calories:300,protein:15})]});i.meals[0].mode='eco-box';const p=planDay(i);assert.equal(p.meals[0].foods[0].quantity,1);assert.ok(p.meals[0].foods.length<=3);assert.equal(p.remaining.protein,5);});
test('blocks weekend Eco-Box and missing payment',()=>{const i=input({date:'2026-10-10',ecoAvailable:true,ecoPaid:true,items:[food({date:'2026-10-10'})]});i.meals[0].mode='eco-box';assert.equal(planDay(i).meals.length,0);i.date='2026-10-06';i.ecoPaid=false;assert.equal(planDay(i).meals.length,0);});
test('invalid input rejected',()=>{assert.equal(validDate('2026-02-30'),false);assert.throws(()=>planDay(input({protein:NaN})));assert.throws(()=>planDay(input({busy:[{start:'25:00',end:'26:00'}]})));assert.throws(()=>planDay(input({meals:[...input().meals,...input().meals]})));});
test('menu URL is date specific',()=>assert.equal(new URL(menuUrl('2026-10-06')).searchParams.get('dtdate'),'10/6/2026'));
test('calendar expands date times, clips overnight and skips free/cancelled',()=>{const busy=normalizeEvents([{start:{dateTime:'2026-10-06T13:30:00-07:00'},end:{dateTime:'2026-10-06T15:05:00-07:00'},location:'Baskin'},{start:{date:'2026-10-06'},end:{date:'2026-10-07'},transparency:'transparent'},{start:{dateTime:'2026-10-05T23:00:00-07:00'},end:{dateTime:'2026-10-06T01:00:00-07:00'}}],'2026-10-06');assert.equal(busy.length,2);assert.equal(busy[0].start,'13:30');assert.equal(busy[1].start,'00:00');assert.equal(busy[1].end,'01:00');});
test('all-day date end is exclusive',()=>{const e=[{start:{date:'2026-10-06'},end:{date:'2026-10-07'}}];assert.equal(normalizeEvents(e,'2026-10-06')[0].end,'23:59');assert.equal(normalizeEvents(e,'2026-10-07').length,0);});
test('Pacific DST conversion',()=>assert.equal(normalizeEvents([{start:{dateTime:'2026-11-02T18:00:00Z'},end:{dateTime:'2026-11-02T19:00:00Z'}}],'2026-11-02')[0].start,'10:00'));



