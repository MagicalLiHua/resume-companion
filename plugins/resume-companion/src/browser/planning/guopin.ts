import type {PlanFact} from '../form-plan.js';

/** Guopin editor units and explicit taxonomy paths; never guess from broad bands. */
export function guopinFact(key:string,fact:PlanFact|undefined):PlanFact|undefined {
 if(!fact)return undefined;
 if(key==='level'&&['硕士研究生','博士研究生'].includes(String(fact.value)))return {...fact,value:String(fact.value).replace('研究生','')};
 if(key==='company_type'&&fact.value==='国有企业')return {...fact,value:'国企'};
 if(key==='company_type'&&fact.value==='高等院校')return {...fact,value:'学校'};
 if(key==='company_headcount'){
  if(typeof fact.value!=='string'||!/^\d+$/.test(fact.value))return undefined;
  const count=Number(fact.value),bounds=[100,300,500,1000,2000,5000,10000,30000];
  for(let i=0;i<bounds.length-1;i++)if(count>bounds[i]!&&count<bounds[i+1]!)return {...fact,value:`${bounds[i]}-${bounds[i+1]}人`};
  if(count>30000)return {...fact,value:'30000人以上'};
  return undefined;
 }
 if(['salary_min','salary_max'].includes(key)){if(typeof fact.value!=='string'||!/^\d+$/.test(fact.value)||Number(fact.value)%1000!==0)return undefined;return {...fact,value:`${Number(fact.value)/1000}K`};}
 if(key==='monthly_salary_yuan'){
  if(typeof fact.value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(fact.value))return undefined;
  return {...fact,value:String(Number(fact.value)/1000)};
 }
 if(key==='guopin_certificate_paths'){
  try{const paths=typeof fact.value==='string'?JSON.parse(fact.value):fact.value;
   if(!Array.isArray(paths)||!paths.length||!paths.every(p=>typeof p==='string'&&p.split(' / ').length>=2&&p.split(' / ').length<=3&&p.split(' / ').every(s=>s.trim()===s&&s.length>0)))return undefined;
   // The UI exposes only leaf names after selection. Duplicate leaf names
   // cannot prove which branch was selected, so require an unambiguous set.
   return new Set(paths.map(p=>p.split(' / ').at(-1))).size===paths.length?{...fact,value:paths}:undefined;
  }catch{return undefined;}
 }
 if(key.endsWith('_path')){
  try{const path=typeof fact.value==='string'?JSON.parse(fact.value):fact.value;
   return Array.isArray(path)&&path.length>=2&&path.length<=4&&path.every(s=>typeof s==='string'&&s.length>0)?{...fact,value:path}:undefined;
  }catch{return undefined;}
 }
 if(key==='has_overseas'&&['有海外留学经历','无海外留学经历'].includes(String(fact.value)))return {...fact,value:fact.value==='有海外留学经历'?'海外留学经历':'非海外留学经历'};
 if(key==='overseas'&&['是','否'].includes(String(fact.value)))return {...fact,value:fact.value==='是'?'海外工作经历':'非海外工作经历'};
 return fact;
}
