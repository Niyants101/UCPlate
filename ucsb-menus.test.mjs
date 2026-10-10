import test from 'node:test';
import assert from 'node:assert/strict';
import {UCSB_LOCATIONS,UCSB_FOOD_FACTS_URL,UCSB_MENU_URL,parseUnits,parseMenuOptions,parseItems,parseLabel,publishedSchedule} from './ucsb-menus.mjs';

test('UCSB registers the four residential dining locations',()=>{
  assert.deepEqual(UCSB_LOCATIONS.map(x=>x.id),['ucsb-carrillo','ucsb-de-la-guerra','ucsb-portola','ucsb-ortega']);
  assert.equal(new URL(UCSB_FOOD_FACTS_URL).hostname,'nutrition.info.dining.ucsb.edu');
  assert.equal(new URL(UCSB_MENU_URL).hostname,'apps.dining.ucsb.edu');
});

test('UCSB NetNutrition unit discovery reads official selection links',()=>{
  const html=`<a onclick="javascript:NetNutrition.UI.unitsSelectUnit(15);">Portola</a><a onclick="javascript:NetNutrition.UI.unitsSelectUnit(20);">Carrillo</a>`;
  assert.deepEqual(parseUnits(html),[{id:15,name:'Portola'},{id:20,name:'Carrillo'}]);
  const child=`<a onclick="javascript:NetNutrition.UI.childUnitsSelectUnit(16);">Portola's Daily Menu</a>`;
  assert.deepEqual(parseUnits(child,'childUnitsSelectUnit'),[{id:16,name:"Portola's Daily Menu"}]);
});

test('UCSB posted menu choices preserve date meal and discovered ids',()=>{
  const html=`<header class='card-title h4'>Friday, October 9, 2026</header><a onclick="javascript:NetNutrition.UI.menuListSelectMenu(258592);">Lunch</a><a onclick="javascript:NetNutrition.UI.menuListSelectMenu(258597);">Dinner</a><header class='card-title h4'>Saturday, October 10, 2026</header><a onclick="javascript:NetNutrition.UI.menuListSelectMenu(258600);">Brunch</a>`;
  assert.deepEqual(parseMenuOptions(html),[
    {id:258592,meal:'Lunch',date:'2026-10-09'},
    {id:258597,meal:'Dinner',date:'2026-10-09'},
    {id:258600,meal:'Brunch',date:'2026-10-10'}
  ]);
});

test('UCSB menu items preserve station serving and vegetarian markers',()=>{
  const html=`<table><tr class="cbo_nn_itemGroupRow bg-faded"><td><div role="button">Greens &amp; Grains</div></td></tr><tr class="cbo_nn_itemPrimaryRow"><td></td><td><a id="showNutrition_35440061">Pita Sandwich w/Hummus &amp; Tabouli (v)</a></td><td>1/2 Pita</td></tr><tr class="cbo_nn_itemAlternateRow"><td></td><td><a id="showNutrition_35506616">Cinnamon Maple Granola (w/nuts) (vgn)</a></td><td>1/2 Cup</td></tr></table>`;
  const items=parseItems(html);
  assert.equal(items[0].name,'Pita Sandwich w/Hummus & Tabouli');
  assert.equal(items[0].section,'Greens & Grains');
  assert.equal(items[0].serving,'1/2 Pita');
  assert.equal(items[0].diet,'vegetarian');
  assert.equal(items[1].diet,'vegan');
  assert.deepEqual(items[1].allergens,['Nuts']);
});

test('UCSB nutrition label preserves exact calories protein serving and published allergens',()=>{
  const html=`<td class='cbo_nn_LabelHeader'>Grilled Achiote Chicken Thigh</td><div class='cbo_nn_LabelBottomBorderLabel'>Serving Size <div class='inline-div-right'>Piece&nbsp;(118g)</div></div><td class='cbo_nn_LabelSubHeader'><div>Calories</div><div class='inline-div-right'>200</div></td><div class='inline-div-left'><span class='bold-text'>Protein</span><span>&nbsp;24g</span></div><span class='cbo_nn_LabelAllergensBold'>Contains:</span><span class='cbo_nn_LabelAllergens'>Soybeans,&nbsp;Sesame</span>`;
  const nutrition=parseLabel(html,'Grilled Achiote Chicken Thigh');
  assert.equal(nutrition.calories,200);
  assert.equal(nutrition.protein,24);
  assert.equal(nutrition.serving,'Piece (118g)');
  assert.deepEqual(nutrition.allergens,['Soy','Sesame']);
});

test('UCSB less-than nutrition values stay unknown instead of becoming zero',()=>{
  const html=`<td class='cbo_nn_LabelHeader'>Test Food</td><div>Serving Size 1 oz Amount Per Serving Calories &lt; 1 Protein &lt; 1 g</div>`;
  const nutrition=parseLabel(html,'Test Food');
  assert.equal(nutrition.calories,null);
  assert.equal(nutrition.protein,null);
});

test('UCSB published academic schedules preserve weekend brunch and Ortega closure',()=>{
  assert.deepEqual(publishedSchedule('ucsb-portola','2026-10-10'),[
    {name:'Brunch',start:'10:00',end:'14:00'},
    {name:'Dinner',start:'17:00',end:'20:30'}
  ]);
  assert.deepEqual(publishedSchedule('ucsb-ortega','2026-10-10'),[]);
  assert.deepEqual(publishedSchedule('ucsb-ortega','2026-10-09'),[
    {name:'Lunch',start:'10:00',end:'15:00'},
    {name:'Dinner',start:'15:00',end:'20:00'}
  ]);
});
