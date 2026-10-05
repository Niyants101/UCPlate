const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const has=(value,re)=>re.test(norm(value));

const ALLERGEN_GROUPS={
  milk:['milk','dairy'],
  egg:['egg'],
  'wheat-gluten':['wheat','gluten'],
  soy:['soy'],
  peanut:['peanut'],
  'tree-nut':['tree nut','treenut','almond','cashew','walnut','pecan','pistachio','hazelnut'],
  sesame:['sesame'],
  fish:['fish'],
  shellfish:['shellfish','shrimp','crab','lobster','mollusk']
};

export function itemAllowed(item,profile={}){
  if(item?.calories===null||item?.calories===undefined||item?.protein===null||item?.protein===undefined)return false;
  if(!Number.isFinite(Number(item.calories))||Number(item.calories)<=0||!Number.isFinite(Number(item.protein)))return false;

  const diet=profile.dietPreference||'omnivore';
  if(diet==='vegan'&&item.diet!=='vegan')return false;
  if(diet==='vegetarian'&&!['vegetarian','vegan'].includes(item.diet))return false;

  const published=(item.allergens||[]).map(norm);
  for(const key of profile.allergens||[]){
    const terms=ALLERGEN_GROUPS[key]||[norm(key)];
    if(published.some(allergen=>terms.some(term=>allergen.includes(term))))return false;
  }

  const itemText=norm(`${item.name} ${item.section||''}`);
  for(const raw of profile.avoidFoods||[]){
    const term=norm(raw);
    if(term&&itemText.includes(term))return false;
  }
  return true;
}

export function rolesForItem(item){
  const text=norm(`${item.name} ${item.section||''}`);
  const roles=new Set();
  if(/alfredo|marinara|pesto|sauce|gravy|dressing|salsa|aioli|chutney|teriyaki/.test(text))roles.add('sauce');
  if(/penne|pasta|rotini|tortellini|spaghetti|fettuccine|macaroni|noodle|ravioli/.test(text))roles.add('pasta');
  if(/rice|quinoa|couscous|polenta|potato|fries|tots|hash brown|grain/.test(text))roles.add('starch');
  if(/bread|breadstick|focaccia|bun|roll|toast|biscuit|tortilla|pita/.test(text))roles.add('bread');
  if(/chicken|turkey|beef|pork|tofu|tempeh|egg|sausage|fish|salmon|tuna|shrimp|bean|lentil|chickpea|patty|tender|nugget|seitan/.test(text))roles.add('protein');
  if(/carrot|broccoli|squash|pepper|onion|slaw|spinach|kale|zucchini|vegetable|veggie|green bean|cauliflower|mushroom|cabbage|asparagus|corn|peas/.test(text))roles.add('vegetable');
  if(/pizza/.test(text))roles.add('pizza');
  if(/soup|chowder|bisque|chili/.test(text))roles.add('soup');
  if(/cake|cookie|donut|brownie|mousse|dessert|sweet treat|ice cream|pudding/.test(text))roles.add('dessert');
  if(/salad/.test(text))roles.add('salad');
  if(/waffle|pancake|oatmeal|cereal|breakfast/.test(text))roles.add('breakfast');
  if(!roles.size&&Number(item.protein)>=12)roles.add('protein');
  return [...roles];
}

function stationTheme(section,items,mealName=''){
  const sectionText=norm(section);
  const mealText=norm(mealName);
  const joined=norm(items.map(item=>item.name).join(' '));
  const count=re=>items.filter(item=>re.test(norm(item.name))).length;
  if(/pizza/.test(sectionText))return 'pizza';
  if(/breakfast|brunch/.test(mealText)||/breakfast/.test(sectionText))return 'breakfast';
  if(count(/penne|pasta|rotini|tortellini|spaghetti|fettuccine|macaroni|noodle|ravioli/)&&count(/alfredo|marinara|pesto|sauce/))return 'pasta';
  if(count(/bun/)&&count(/patty|burger|chicken|tofu|mushroom|tender/))return 'burger';
  if(count(/rice|quinoa|grain/)&&count(/chicken|tofu|bean|lentil|pork|beef|fish/))return 'bowl';
  if(/clean plate/.test(sectionText))return 'bowl';
  if(/grill/.test(sectionText)&&/bun|fries|patty|tender|nugget/.test(joined))return 'grill';
  if(/soup/.test(sectionText))return 'soup';
  return 'general';
}

const byRole=(items,role)=>items.filter(item=>rolesForItem(item).includes(role));
const uniq=items=>[...new Map(items.filter(Boolean).map(item=>[item.name,item])).values()];
const top=(items,score,count=3)=>[...items].sort((a,b)=>score(b)-score(a)).slice(0,count);
const proteinScore=item=>Number(item.protein)*5+Number(item.calories)*.02;
const targetProteinScore=(item,target)=>-Math.abs(Number(item.protein)-target*.5)+Number(item.protein)*.15;

function stationSkeletons(items,theme,target){
  const proteins=top(byRole(items,'protein'),item=>targetProteinScore(item,target.protein),4);
  const veg=top(byRole(items,'vegetable'),item=>-Number(item.calories)+Number(item.protein)*2,4);
  const starch=top([...byRole(items,'starch'),...byRole(items,'pasta')],item=>-Math.abs(Number(item.calories)-target.calories*.4),4);
  const breads=top(byRole(items,'bread'),item=>-Number(item.calories),3);
  const sauces=top(byRole(items,'sauce'),item=>-Math.abs(Number(item.calories)-target.calories*.15),3);
  const pizzas=top(byRole(items,'pizza'),proteinScore,4);
  const soups=top(byRole(items,'soup'),proteinScore,3);
  const salads=top(byRole(items,'salad'),proteinScore,3);
  const skeletons=[];

  if(theme==='pasta'){
    const pasta=top(byRole(items,'pasta'),item=>-Math.abs(Number(item.calories)-target.calories*.45),3);
    for(const base of pasta){
      for(const sauce of sauces.slice(0,2)){
        const protein=proteins.find(item=>item.name!==base.name&&item.name!==sauce.name);
        skeletons.push(uniq([base,sauce,protein,veg[0]]));
        skeletons.push(uniq([base,sauce,veg[0],breads[0]]));
        skeletons.push(uniq([base,sauce,protein,breads[0]]));
      }
    }
  }else if(theme==='burger'||theme==='grill'){
    const buns=breads.filter(item=>has(item.name,/bun|roll|bread/));
    const mains=top(items.filter(item=>rolesForItem(item).includes('protein')&&!rolesForItem(item).includes('bread')),proteinScore,4);
    for(const main of mains){
      skeletons.push(uniq([main,buns[0],veg[0],starch.find(item=>/fries|potato|tots/.test(norm(item.name)))]));
      skeletons.push(uniq([main,buns[0],veg[0]]));
      skeletons.push(uniq([main,buns[0],starch.find(item=>/fries|potato|tots/.test(norm(item.name)))]));
    }
  }else if(theme==='bowl'){
    const bases=top(starch,item=>/rice|quinoa|grain/.test(norm(item.name))?10:0,3);
    for(const protein of proteins){
      skeletons.push(uniq([protein,bases[0],veg[0],sauces[0]]));
      skeletons.push(uniq([protein,bases[0],veg[0]]));
      skeletons.push(uniq([protein,bases[0]]));
    }
  }else if(theme==='breakfast'){
    const breakfastStarch=top(items.filter(item=>rolesForItem(item).some(role=>['starch','bread','breakfast'].includes(role))),item=>-Math.abs(Number(item.calories)-target.calories*.35),4);
    for(const protein of proteins){
      skeletons.push(uniq([protein,breakfastStarch[0],breakfastStarch[1]]));
      skeletons.push(uniq([protein,breakfastStarch[0]]));
    }
  }else if(theme==='pizza'){
    for(const pizza of pizzas){
      skeletons.push(uniq([pizza,salads[0]||veg[0],soups[0]]));
      skeletons.push(uniq([pizza,salads[0]||veg[0]]));
      skeletons.push([pizza]);
    }
  }else if(theme==='soup'){
    for(const soup of soups){
      skeletons.push(uniq([soup,breads[0],proteins[0]]));
      skeletons.push(uniq([soup,breads[0]]));
    }
  }else{
    for(const protein of proteins){
      skeletons.push(uniq([protein,starch[0],veg[0]]));
      skeletons.push(uniq([protein,veg[0],breads[0]]));
      skeletons.push(uniq([protein,starch[0]]));
    }
  }

  if(!skeletons.length&&items.length){
    for(const anchor of top(items,proteinScore,4))skeletons.push(uniq([anchor,veg[0],starch[0]]));
  }
  return skeletons.filter(parts=>parts.length);
}

function quantityOptions(item){
  const roles=rolesForItem(item);
  if(roles.includes('sauce'))return [0.25,0.5,0.75,1];
  if(roles.includes('vegetable')||roles.includes('salad'))return [0.5,1,1.5,2];
  if(roles.includes('bread'))return [0.5,1,1.5];
  return [0.5,1,1.5,2];
}

function plateMacroScore(plate,target){
  const cal=Math.abs(plate.calories-target.calories)/target.calories;
  const proteinGap=Math.max(0,target.protein-plate.protein)/target.protein;
  const tooHigh=Math.max(0,plate.calories-target.calories*1.2)/target.calories;
  return cal*1.45+proteinGap*4.1+tooHigh*3+plate.parts.length*.012;
}

function optimizePortions(items,target){
  let states=[{parts:[],calories:0,protein:0}];
  for(const item of items.slice(0,4)){
    const next=[];
    for(const state of states){
      for(const quantity of quantityOptions(item)){
        const calories=state.calories+Number(item.calories)*quantity;
        if(calories>target.calories*1.55)continue;
        next.push({parts:[...state.parts,{item,quantity}],calories,protein:state.protein+Number(item.protein)*quantity});
      }
    }
    if(!next.length)return null;
    states=next.sort((a,b)=>plateMacroScore(a,target)-plateMacroScore(b,target)).slice(0,160);
  }
  return states.sort((a,b)=>plateMacroScore(a,target)-plateMacroScore(b,target))[0]||null;
}

function cohesionScore(plate,theme){
  const roles=new Set(plate.parts.flatMap(part=>rolesForItem(part.item)));
  let score=0;
  if(roles.has('protein'))score+=2;
  if(roles.has('vegetable')||roles.has('salad'))score+=1.2;
  if(roles.has('starch')||roles.has('pasta')||roles.has('bread')||roles.has('pizza'))score+=1.2;
  if(theme==='pasta'&&roles.has('pasta')&&roles.has('sauce'))score+=3;
  if((theme==='burger'||theme==='grill')&&roles.has('protein')&&roles.has('bread'))score+=2.5;
  if(theme==='bowl'&&roles.has('protein')&&roles.has('starch'))score+=2.5;
  if(theme==='pizza'&&roles.has('pizza'))score+=2;
  if(roles.has('dessert'))score-=2;
  return score;
}

function plateReason(plate,target,section,theme){
  const calDelta=Math.round(plate.calories-target.calories);
  const proteinDelta=Math.round(plate.protein-target.protein);
  const macro=proteinDelta>=0?`hits your protein target by ${proteinDelta} g`:`comes within ${Math.abs(proteinDelta)} g of your protein target`;
  const calories=Math.abs(calDelta)<=80?'lands close to your calorie target':`${Math.abs(calDelta)} kcal ${calDelta>0?'over':'under'} your starting meal target`;
  const label=theme==='pasta'?'pasta plate':theme==='burger'||theme==='grill'?'grill plate':theme==='bowl'?'bowl':theme==='breakfast'?'breakfast plate':theme==='pizza'?'pizza option':'plate';
  return `${section} ${label}: ${macro} and ${calories}.`;
}

export function generateStationPlates({items=[],profile={},target,mealName='',maxPerStation=2}){
  if(!target||!Number.isFinite(Number(target.calories))||!Number.isFinite(Number(target.protein)))return [];
  const allowed=items.filter(item=>itemAllowed(item,profile));
  const groups=new Map();
  for(const item of allowed){
    const section=item.section||'Menu';
    if(/sweet treat|dessert|beverage|condiment/i.test(section))continue;
    if(!groups.has(section))groups.set(section,[]);
    groups.get(section).push(item);
  }

  const results=[];
  for(const [section,stationItems] of groups){
    const theme=stationTheme(section,stationItems,mealName);
    const skeletons=stationSkeletons(stationItems,theme,target);
    const ranked=[];
    for(const skeleton of skeletons){
      const plate=optimizePortions(skeleton,target);
      if(!plate)continue;
      const names=plate.parts.map(part=>part.item.name).sort().join('|');
      const score=plateMacroScore(plate,target)-cohesionScore(plate,theme)*.18;
      ranked.push({...plate,section,theme,score,key:names,reason:plateReason(plate,target,section,theme)});
    }
    const uniquePlates=[];
    const seen=new Set();
    for(const plate of ranked.sort((a,b)=>a.score-b.score)){
      if(seen.has(plate.key))continue;
      seen.add(plate.key);
      uniquePlates.push(plate);
      if(uniquePlates.length>=maxPerStation)break;
    }
    if(uniquePlates.length)results.push({section,theme,options:uniquePlates});
  }
  return results.sort((a,b)=>a.options[0].score-b.options[0].score);
}
