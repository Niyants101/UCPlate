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
      const categoryList=Array.isArray(categories)?categories:categories?.menuCategories||categories?.categories||[];
      const prefs=encodeURIComponent(JSON.stringify({allergies:[],lifestyleChoices:[],medicalGoals:[],preferenceApplyStatus:false,crossContactStatus:true}));
      const candidates=[];
      for(const category of categoryList.slice(0,8)){
        const categoryId=category?._id||category?.id;if(!categoryId)continue;
        const items=await read(`${API}/menuitems?categoryId=${categoryId}&isPreview=false&locationId=${location}&menuGroupId=${groupId}&userPreferences=${prefs}`);
        for(const item of Array.isArray(items)?items:items?.menuItems||[])if((item?._id||item?.id)&&!candidates.some(existing=>(existing._id||existing.id)===(item._id||item.id)))candidates.push(item);
        if(candidates.length>=12)break;
      }
      for(const item of candidates.slice(0,12)){
        const itemId=item._id||item.id;
        const response=await fetch(`${API}/raw-materials`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({menuId:itemId,fdaRounding:true,allergyIds:[],lifestyleChoiceIds:[],nutritionGoals:[],preferenceApplyStatus:false,skipCommonIngredients:[],locationId:location})});
        const body=await response.json();const raw=body?.data;const records=findNutritionRecords(raw);
        const summary={name:item.name||null,calories:item.caloriesInfo??null,rawCount:Array.isArray(raw)?raw.length:null,nutritionRecords:records.length,rawNames:Array.isArray(raw)?raw.slice(0,5).map(entry=>entry?.name||entry?.rawMaterials||null):[]};
        console.log('UCM_DIAGNOSTIC_FOOD',JSON.stringify(summary));
        if(records.length){records.slice(0,2).forEach((record,index)=>console.log(`UCM_DIAGNOSTIC_RECORD_${itemId}_${index}`,JSON.stringify(record).slice(0,7000)));break;}
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
