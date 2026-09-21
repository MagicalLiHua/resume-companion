import type {FieldRule} from './recipes.js';
import type {PlanFact} from '../form-plan.js';

// Only the observed FAW editor. Other Dayee employers retain their own live
// controls and cannot inherit these assumptions merely by sharing the ATS.
export function isFawEditor(value:string|undefined):boolean {
  try{const u=new URL(value!);return u.protocol==='https:'&&u.hostname==='faw-zhaopin.hotjob.cn'&&u.pathname==='/SU603374380dcad4635b836531/pb/resumeOperation.html';}catch{return false;}
}
const newRecordKeys:Record<string,string[]>={
  '实习经历':['start','end','organization','company_type','company_size','description'],
  '技能资质':['name'],
};

export function dayeeInferredRules(rules:FieldRule[],section:string,url:string|undefined):FieldRule[]{
  const keys=isFawEditor(url)?newRecordKeys[section]:undefined;
  return [...new Set(rules.map(r=>r.key))].filter(key=>!keys||keys.includes(key)).map(key=>{
    const aliases=rules.filter(r=>r.key===key);
    return {...aliases[0]!,labels:[...new Set(aliases.flatMap(r=>r.labels))]};
  });
}

export function dayeeFieldRules(rules:FieldRule[],url:string|undefined):FieldRule[]{
  // FAW calls full-time/part-time study “培养方式”. It is not the separate
  // directed/non-directed training fact used by other employers.
  return isFawEditor(url)?rules.map(rule=>rule.key==='training_mode'?{...rule,key:'highest_study_mode'}:rule.key==='overall'&&rule.labels.includes('其他外语水平')?{...rule,key:'conversation'}:rule):rules;
}

export function fawEnglishLevel(exam:PlanFact|undefined,score:PlanFact|undefined):PlanFact|undefined {
  if(!exam||!score||!/^CET[46]$/.test(String(exam.value))||!/^\d{1,3}$/.test(String(score.value)))return undefined;
  const n=Number(score.value);if(n<0||n>710)return undefined;
  const level=String(exam.value).slice(-1);
  return {value:`CET ${level}-${n>=425?'425分及以上':level==='6'?'425以下':'425分以下'}`,source:`${exam.source}+${score.source}`};
}

export function fawOption(key:string,value:unknown):unknown {
  if(key==='failed_courses'&&value==='无')return '无挂科';
  if(key==='recruitment_channel'&&value==='学校就业信息网')return '学校就业网';
  if(key==='scholarship_status'&&typeof value==='string'&&/^校级(?:一|二|三)等奖学金(?:（虚构测试）)?$/.test(value))return '校级奖学金';
  if(key==='political_status'&&value==='共青团员')return '中国共产主义青年团团员';
  if(key==='company_type'&&value==='民营企业')return '民营/私营公司';
  if(key==='company_type'&&value==='国有企业')return '国企/上市公司';
  // Only observed aliases; appending 市 to arbitrary place names would corrupt
  // autonomous prefectures/counties. Other cities stay exact-match only.
  if(['native_city','residence_city','city'].includes(key)&&value==='杭州')return '杭州市';
  // “Top 20%” spans two bands and cannot establish 11–20%. Only a bound
  // wholly within the first band can be projected without inventing a rank.
  if(key==='major_rank'&&typeof value==='string'&&/^前(?:[1-9]|10)%$/.test(value))return '1%~10%';
  return value;
}
