import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOpeningHours,parseUciProduct,parseUciMenuResponse,scheduleForDate,UCI_MENU_URL} from './uci-menus.mjs';

test('UC Irvine opening hours expand day ranges and off periods',()=>{
  const parsed=parseOpeningHours('Mo-Fr 07:15-11:00; Sa-Su 09:00-11:00');
  assert.equal(parsed.open[1],'07:15');
  assert.equal(parsed.close[5],'11:00');
  assert.equal(parsed.open[0],'09:00');
  assert.equal(parsed.open[6],'09:00');
  const off=parseOpeningHours('Mo-Th 20:00-23:00; Fr-Su off');
  assert.equal(off.open[4],'20:00');
  assert.equal(off.open[5],null);
});

test('UC Irvine product parser preserves exact published nutrition and dietary flags',()=>{
  const optionMaps=new Map([
    ['allergens_intolerances',new Map([['11','Milk'],['12','Wheat'],['13','Eggs']])],
    ['recipe_attributes',new Map([['21','Vegetarian'],['22','Vegan']])]
  ]);
  const product={name:'Veggie Pasta',attributes:[
    {name:'calories',value:'412.5'},
    {name:'protein',value:'17.25'},
    {name:'serving_combined',value:'12 oz'},
    {name:'allergens_intolerances',value:['11','12']},
    {name:'recipe_attributes',value:['21']},
    {name:'marketing_description',value:'Pasta with vegetables'}
  ]};
  const item=parseUciProduct(product,{date:'2026-10-08',hallId:'uci-anteatery',period:'Dinner',section:'Noodle Bar',source:'https://uci.mydininghub.com/en/location/the-anteatery',optionMaps});
  assert.equal(item.diet,'vegetarian');
  assert.deepEqual(item.allergens,['Milk','Wheat']);
  assert.equal(item.calories,412.5);
  assert.equal(item.protein,17.25);
  assert.equal(item.serving,'12 oz');
  assert.equal(item.nutritionStatus,'available');
});

test('UC Irvine product parser never invents missing nutrition',()=>{
  const optionMaps=new Map([
    ['allergens_intolerances',new Map([['13','Eggs']])],
    ['recipe_attributes',new Map([['22','Vegan']])]
  ]);
  const product={name:'Mystery Dish',attributes:[
    {name:'calories',value:'250'},
    {name:'protein',value:''},
    {name:'allergens_intolerances',value:'13'},
    {name:'recipe_attributes',value:'22'}
  ]};
  const item=parseUciProduct(product,{date:'2026-10-08',hallId:'uci-brandywine',period:'Lunch',section:'Grubb',source:'https://uci.mydininghub.com/en/location/brandywine',optionMaps});
  assert.equal(item.diet,'vegan');
  assert.deepEqual(item.allergens,['Egg']);
  assert.equal(item.calories,null);
  assert.equal(item.protein,null);
  assert.equal(item.nutritionStatus,'unavailable');
});

test('UC Irvine weekly response keeps stations and only requested date',()=>{
  const optionMaps=new Map([
    ['allergens_intolerances',new Map()],
    ['recipe_attributes',new Map([['22','Vegan']])]
  ]);
  const meta={stations:new Map([['101','Twisted Root']]),optionMaps};
  const location={id:'uci-anteatery',source:'https://uci.mydininghub.com/en/location/the-anteatery'};
  const period={name:'Lunch'};
  const data={getLocationRecipes:{
    locationRecipesMap:{dateSkuMap:[
      {date:'2026-10-08',stations:[{id:101,skus:{simple:['A1','A1']}}]},
      {date:'2026-10-09',stations:[{id:101,skus:{simple:['B1']}}]}
    ]},
    products:{items:[
      {sku:'A1',name:'Tofu Bowl',attributes:[{name:'calories',value:'420'},{name:'protein',value:'24'},{name:'recipe_attributes',value:'22'}]},
      {sku:'B1',name:'Friday Dish',attributes:[{name:'calories',value:'500'},{name:'protein',value:'20'}]}
    ]}
  }};
  const items=parseUciMenuResponse(data,{date:'2026-10-08',location,meta,period});
  assert.equal(items.length,1);
  assert.equal(items[0].name,'Tofu Bowl');
  assert.equal(items[0].section,'Twisted Root');
  assert.equal(items[0].diet,'vegan');
});

test('UC Irvine schedule prefers a dated special schedule over standard',()=>{
  const schedules=[
    {type:'standard',meal_periods:[{meal_period:'Breakfast',opening_hours:'Mo-Fr 07:15-11:00; Sa-Su 09:00-11:00'}]},
    {type:'special',start_date:'2026-10-08',end_date:'2026-10-08',meal_periods:[{meal_period:'Brunch',opening_hours:'Th 10:00-14:00'}]}
  ];
  assert.deepEqual(scheduleForDate(schedules,'2026-10-08'),[{name:'Brunch',start:'10:00',end:'14:00'}]);
  assert.deepEqual(scheduleForDate(schedules,'2026-10-09'),[{name:'Breakfast',start:'07:15',end:'11:00'}]);
});

test('UC Irvine source remains the official MyDiningHub site',()=>{
  assert.match(UCI_MENU_URL,/^https:\/\/uci\.mydininghub\.com\/en\/locations$/);
});
