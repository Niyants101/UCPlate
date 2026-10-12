import {randomUUID} from 'node:crypto';

const API='https://widget.api.eagle.bigzpoon.com';
const WIDGET='https://uc-merced-the-pavilion.widget.eagle.bigzpoon.com';
const COMPANY='61bd7ecd8c760e0011ac0fac';
const LOC='61df4a34d5507a00103ee41e';
const headers={'Accept':'application/json','x-comp-id':COMPANY,'location-id':LOC,'device-id':randomUUID(),'Origin':WIDGET,'Referer':`${WIDGET}/`};
async function get(path,params={}){const u=new URL(path,API);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));const r=await fetch(u,{headers});if(!r.ok)throw new Error(`${path} ${r.status}`);return (await r.json()).data;}
const groups=await get('/locations/menugroups',{isPreview:'true',locationId:LOC});
const rows=Array.isArray(groups)?groups:groups.menuGroups||[];
const dow=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][new Date().getUTCDay()];
const group=rows.find(x=>String(x.name).toUpperCase()===dow)||rows[0];
const cats=await get('/menucategories',{initialCall:'menuGroup',locationId:LOC,menuGroupIds:group._id});
const category=(Array.isArray(cats)?cats:cats.menuCategories||cats.categories||[]).find(x=>x?._id);
const data=await get('/menuitems',{categoryId:category._id,isPreview:'false',locationId:LOC,menuGroupId:group._id,userPreferences:JSON.stringify({allergies:[],lifestyleChoices:[],medicalGoals:[],preferenceApplyStatus:false,crossContactStatus:true})});
const item=(Array.isArray(data)?data:data.menuItems||[])[0];
if(!item)throw new Error('No Merced menu item returned.');
const safe={};
for(const key of Object.keys(item).sort()){
  const v=item[key];
  if(/id$/i.test(key)||key==='_id')safe[key]=typeof v==='string'?v:Array.isArray(v)?v.slice(0,3):v;
  else if(/calor|protein|nutri|allerg|life|diet|serv|portion|preference/i.test(key))safe[key]=v;
  else if(['name','description','status'].includes(key))safe[key]=v;
}
console.log(JSON.stringify({category:category.name,item:safe},null,2));
