import {randomUUID} from 'node:crypto';
import {getDashboard,getMenu,getAvailableDates} from '../ucm-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

if(process.env.CI){
  try{
    const API='https://widget.api.eagle.bigzpoon.com';
    const WIDGET='https://uc-merced-the-pavilion.widget.eagle.bigzpoon.com';
    const company='61bd7ecd8c760e0011ac0fac';
    const location='61df4a34d5507a00103ee41e';
    const headers={'Accept':'application/json, text/plain, */*','x-comp-id':company,'location-id':location,'device-id':randomUUID(),'Origin':WIDGET,'Referer':`${WIDGET}/`};
    const read=async url=>{const response=await fetch(url,{headers});const body=await response.json();return body?.data;};
    const groups=await read(`${API}/locations/menugroups?isPreview=true&locationId=${location}`);
    const group=(Array.isArray(groups)?groups:groups?.menuGroups||[]).find(row=>row?._id||row?.id);
    if(group){
      const groupId=group._id||group.id;
      const categories=await read(`${API}/menucategories?initialCall=menuGroup&locationId=${location}&menuGroupIds=${groupId}`);
      const category=(Array.isArray(categories)?categories:categories?.menuCategories||categories?.categories||[]).find(row=>row?._id||row?.id);
      if(category){
        const prefs=encodeURIComponent(JSON.stringify({allergies:[],lifestyleChoices:[],medicalGoals:[],preferenceApplyStatus:false,crossContactStatus:true}));
        const items=await read(`${API}/menuitems?categoryId=${category._id||category.id}&isPreview=false&locationId=${location}&menuGroupId=${groupId}&userPreferences=${prefs}`);
        const item=(Array.isArray(items)?items:items?.menuItems||[]).find(row=>row?._id||row?.id);
        if(item){
          console.log('UCM_DIAGNOSTIC_ITEM_KEYS',Object.keys(item).sort().join(','));
          console.log('UCM_DIAGNOSTIC_ITEM_CALORIES',JSON.stringify(item.caloriesInfo??null));
          const itemId=item._id||item.id;
          const response=await fetch(`${API}/raw-materials`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({menuId:itemId,fdaRounding:true,allergyIds:[],lifestyleChoiceIds:[],nutritionGoals:[],preferenceApplyStatus:false,skipCommonIngredients:[],locationId:location})});
          const body=await response.json();
          const raw=body?.data;
          console.log('UCM_DIAGNOSTIC_RAW_TYPE',Array.isArray(raw)?'array':typeof raw);
          console.log('UCM_DIAGNOSTIC_RAW_KEYS',Array.isArray(raw)&&raw[0]?Object.keys(raw[0]).sort().join(','):raw&&typeof raw==='object'?Object.keys(raw).sort().join(','):'none');
          const sample=Array.isArray(raw)?raw.find(entry=>entry?.nutritionInfo)||raw[0]:raw;
          if(sample){
            console.log('UCM_DIAGNOSTIC_NUTRITIONINFO_TYPE',Array.isArray(sample.nutritionInfo)?'array':typeof sample.nutritionInfo);
            console.log('UCM_DIAGNOSTIC_NUTRITIONINFO',JSON.stringify(sample.nutritionInfo??null).slice(0,7000));
            console.log('UCM_DIAGNOSTIC_SERVING',JSON.stringify(sample.servingSizeValue??null));
          }
        }
      }
    }
  }catch(error){console.log('UCM_DIAGNOSTIC_ERROR',error.message);}
}

await buildCampusSnapshot({
  campusId:'ucm',
  adapterId:'ucm-bigzpoon',
  getAvailableDates,
  getDashboard,
  getMenu,
  maxDates:8,
  locationConcurrency:2
});
