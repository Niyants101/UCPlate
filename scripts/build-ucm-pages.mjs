import {randomUUID} from 'node:crypto';
import {getDashboard,getMenu,getAvailableDates} from '../ucm-menus.mjs';
import {buildCampusSnapshot} from './build-campus-snapshot.mjs';

const objectHasValues=value=>value&&typeof value==='object'&&Object.keys(value).length>0;
function findNutritionRecords(value,path='root',out=[]){
  if(!value||typeof value!=='object'||out.length>=8)return out;
  if(objectHasValues(value.nutritionInfo))out.push({path,name:value.name||null,nutritionInfo:value.nutritionInfo,servingSizeValue:value.servingSizeValue??null});
  if(Array.isArray(value)){value.forEach((entry,index)=>findNutritionRecords(entry,`${path}[${index}]`,out));return out;}
  for(const [key,child] of Object.entries(value))if(child&&typeof child==='object')findNutritionRecords(child,`${path}.${key}`,out);
  return out;
}

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
          console.log('UCM_DIAGNOSTIC_ITEM',item.name||null,JSON.stringify(item.caloriesInfo??null));
          const itemId=item._id||item.id;
          const response=await fetch(`${API}/raw-materials`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({menuId:itemId,fdaRounding:true,allergyIds:[],lifestyleChoiceIds:[],nutritionGoals:[],preferenceApplyStatus:false,skipCommonIngredients:[],locationId:location})});
          const body=await response.json();
          const raw=body?.data;
          const records=findNutritionRecords(raw);
          console.log('UCM_DIAGNOSTIC_POPULATED_COUNT',records.length);
          records.forEach((record,index)=>console.log(`UCM_DIAGNOSTIC_RECORD_${index}`,JSON.stringify(record).slice(0,7000)));
          console.log('UCM_DIAGNOSTIC_RAW_SAMPLE',JSON.stringify(Array.isArray(raw)?raw.slice(0,2):raw).slice(0,9000));
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
