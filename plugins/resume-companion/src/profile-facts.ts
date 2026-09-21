import type {Profile} from './profile-store.js';
import type {PlanFact} from './browser/form-plan.js';
import {createHash} from 'node:crypto';

export function preparationQuestionId(section:string,record:string,key:string):string {
  return `q_${createHash('sha256').update(JSON.stringify([section,record,key])).digest('hex').slice(0,24)}`;
}
export function preparationAnswerState(profile:Profile,section:string,record:string,key:string):'not_applicable'|'withheld'|'deferred'|undefined {
  const state=profile.supplemental_fields.find(f=>f.field_key===`preparation.status.${preparationQuestionId(section,record,key)}`)?.value;
  return state==='not_applicable'||state==='withheld'||state==='deferred'?state:undefined;
}

export interface FactRecord {id:string;section?:string;facts:Record<string,PlanFact>;anchors:string[]}
export interface FactSection {presence:'unknown'|'none'|'provided';records:FactRecord[]}
export type FactSections=Record<string,FactSection>;
const degreeNames:Record<string,string>={high_school:'高中',associate:'大专',bachelor:'本科',master:'硕士研究生',doctor:'博士研究生'};
export function normalizeProfile(profile:Profile):FactSections {
  const supplementalValues=new Map<string,string>();
  for(const field of profile.supplemental_fields){
    if(field.value===null||field.value==='')continue;
    const prior=supplementalValues.get(field.field_key);
    if(prior!==undefined&&prior!==field.value)throw new Error('supplemental_source_conflict');
    supplementalValues.set(field.field_key,field.value);
  }
  const result:FactSections={};
  const prefix=`profile:${profile.profile_id}@${profile.revision}/`;
  function record(section:string,id:string,raw:Record<string,unknown>,paths:Record<string,string>,anchors:string[]):void {
    const facts:Record<string,PlanFact>={};
    for(const [key,value] of Object.entries(raw)) {
      if(value===null || value===undefined || value==='' || Array.isArray(value)&&!value.length)continue;
      facts[key]={value:value as PlanFact['value'],source:prefix+(paths[key]??`${section}/${id}/${key}`)};
    }
    (result[section]??={presence:'unknown',records:[]}).records.push({id,section,facts,anchors});
  }
  record('basic','basic',profile.basic, Object.fromEntries(Object.keys(profile.basic).map(k=>[k,`basic/${k}`])),[]);
  const salary=(s:Profile['intent']['expected_salary'])=>s?`${s.amount} ${s.currency}/${s.period==='month'?'月':'年'}${s.tax==='before'?'（税前）':s.tax==='after'?'（税后）':''}${s.benefits==='included'?'（含福利）':s.benefits==='excluded'?'（不含福利）':''}`:null;
  record('intent','intent',{cities:profile.intent.cities,current_salary:salary(profile.intent.current_salary),expected_salary:salary(profile.intent.expected_salary),available_date:profile.intent.available_date,industry:profile.intent.industry,occupation:profile.intent.occupation},Object.fromEntries(Object.keys(profile.intent).map(k=>[k,`intent/${k}`])),[]);
  // An explicit (possibly expected) end date selects endpoint mode, even while studying.
  // This is the date widget mode, not a claim that the person has graduated.
  function dates(row:{start_month:string|null;end_month:string|null;is_current:boolean|null}):Record<string,unknown> {
    return {start:row.start_month,end:row.end_month,current:row.end_month?false:row.is_current,range:row.start_month&&(row.end_month||row.is_current===true)?{start:row.start_month,...(row.end_month?{end:row.end_month}:{current:true})}:null};
  }
  for(const row of profile.education)record('education',row.id,{school:row.school,major:row.major,college:row.college,level:row.education_level?degreeNames[row.education_level]:null,degree:row.degree,study_mode:row.study_mode==='full_time'?'全日制':row.study_mode==='part_time'?'非全日制':null,description:row.description,...dates(row)}, {range:`education/${row.id}/start_month+end_month+is_current`,level:`education/${row.id}/education_level`,start:`education/${row.id}/start_month`,end:`education/${row.id}/end_month`,current:`education/${row.id}/end_month+is_current`},['school','start','end']);
  for(const row of profile.experience) {
    const kind=row.kind==='internship'?'internships':row.kind==='work'?'work':'unclassified_experience';
    record(kind,row.id,{organization:row.organization,role:row.role,description:row.description??(row.facts.length?row.facts.map(f=>f.text).join('\n'):null),...dates(row)},Object.fromEntries(['organization','role','description','range','start','end','current'].map(k=>[k,`experience/${row.id}/${k==='description'?'description+facts':k==='range'?'start_month+end_month+is_current':k==='start'?'start_month':k==='end'?'end_month':k==='current'?'end_month+is_current':k}`])),['organization','role','start','end']);
  }
  for(const row of profile.projects)record('projects',row.id,{name:row.name,role:row.role,description:row.description,responsibilities:row.responsibilities??(row.facts.length?row.facts.map(f=>f.text).join('\n'):null),url:row.url,...dates(row)}, {range:`projects/${row.id}/start_month+end_month+is_current`,responsibilities:`projects/${row.id}/responsibilities+facts`,start:`projects/${row.id}/start_month`,end:`projects/${row.id}/end_month`,current:`projects/${row.id}/end_month+is_current`},['name','start','end']);
  for(const key of ['languages','awards','certificates','competitions','campus'] as const)for(const row of profile[key]) {
    const {id:recordId,...data}= {...row,...(key==='campus'?dates(row as unknown as Parameters<typeof dates>[0]):{})};
    record(key,row.id,data,{},key==='languages'?['name']:key==='campus'?['organization','role','start','end']:['name','obtained_month']);
  }
  for(const row of profile.custom_answers)record('custom_answers',row.id,{text:row.text},{text:`custom_answers/${row.id}`},[]);
  for(const row of profile.supplemental_fields)record('supplemental_fields',row.id,{value:row.value},{value:`supplemental_fields/${row.id}`},[]);
  if(profile.skills.length)record('skills','skills',{text:profile.skills.join('、')},{text:'skills'},[]);
  // Employer-specific repeatable facts retain explicit record keys and source
  // references. Labels or an unrelated project never imply family/research data.
  const extensions=new Map<string,{section:string;id:string;values:Record<string,string>;paths:Record<string,string>}>();
  for(const field of profile.supplemental_fields){
    const match=/^(family|research|it_skills)\.([A-Za-z0-9_-]+)\.([a-z_]+)$/.exec(field.field_key);
    if(!match||!field.value)continue;
    const section=match[1]!,recordId=match[2]!,key=match[3]!;
    const bucket=`${section}.${recordId}`;
    const group=extensions.get(bucket)??{section,id:recordId,values:{},paths:{}};
    group.values[key]=field.value;group.paths[key]=`supplemental_fields/${field.id}`;extensions.set(bucket,group);
  }
  for(const group of extensions.values())record(group.section,group.id,group.values,group.paths,group.section==='family'?['name','relation']:group.section==='research'?['name','start','end']:['name']);
  for(const section of ['family','research','it_skills']){
    const source=result[section]??={presence:'unknown',records:[]};
    if(!source.records.length&&profile.supplemental_fields.some(f=>f.field_key===`section_status.${section}`&&f.value==='none'))source.presence='none';
  }
  for(const key of Object.keys(profile.section_status)) {
    const k=key as keyof Profile['section_status'];const section=result[key]??={presence:'unknown',records:[]};
    section.presence=section.records.length?'provided':profile.section_status[k];
  }
  for(const section of Object.values(result))if(section.records.some(r=>Object.keys(r.facts).length))section.presence='provided';
  return result;
}

/** Shared fact lookup for page plans and missing-information preparation. No DOM dependency. */
export function resolveFact(profile:Profile,sources:FactSections,row:FactRecord,rule:{key:string;emptyBranch?:{key:string;value:string}}):PlanFact|undefined {
    if(rule.key==='cities' && !row.facts.cities)return sources.intent?.records[0]?.facts.cities;
    if(row.facts[rule.key])return row.facts[rule.key];
    if(row.section==='education'&&['school_other','major_other'].includes(rule.key)){
      const school=rule.key==='school_other',category=resolveFact(profile,sources,row,{key:school?'job51_school_region':'job51_major_category'});
      if(category?.value===(school?'其他院校':'其他专业类型'))return row.facts[school?'school':'major'];
    }
    if(row.section==='basic'&&rule.key==='self_career_description'){
      const self=row.facts.self_description,career=resolveFact(profile,sources,row,{key:'career_plan'});
      return self&&career?{value:`${self.value}\n\n${career.value}`,source:`${self.source}+${career.source}`}:undefined;
    }
    const parent=/^(father|mother)_(name|organization_role)$/.exec(rule.key);
    if(row.section==='basic'&&parent){
      const relation=parent[1]==='father'?'父亲':'母亲';
      const relatives=(sources.family?.records??[]).filter(r=>r.facts.relation?.value===relation);
      if(relatives.length!==1)return undefined;
      const facts=relatives[0]!.facts;
      if(parent[2]==='name')return facts.name;
      if(facts.organization&&facts.role)return {value:`${facts.organization.value} / ${facts.role.value}`,source:`${facts.organization.source}+${facts.role.source}`};
      return undefined;
    }
    if(row.section==='basic'&&rule.key==='skills_text'&&sources.skills?.records[0]?.facts.text)return sources.skills.records[0]!.facts.text;
    if(row.section==='basic'&&rule.key==='certificate_names'){
      const names=(sources.certificates?.records??[]).map(r=>r.facts.name).filter((f):f is PlanFact=>Boolean(f));
      if(names.length)return {value:names.map(f=>f.value).join('、'),source:`profile:${profile.profile_id}@${profile.revision}/certificates/names`};
    }
    // Supplemental facts have explicit canonical paths; visible wording alone
    // cannot bind a family member, employer-specific answer or another record.
    const source=row.section??Object.entries(sources).find(([,s])=>s.records.some(r=>r.id===row.id))?.[0];
    const path=source==='basic'||source==='intent'?`${source}.${rule.key}`:`${source}.${row.id}.${rule.key}`;
    const supplemental=profile.supplemental_fields.find(f=>f.field_key===path);
    if(!supplemental?.value&&rule.key==='full_time'&&['全日制','非全日制'].includes(String(row.facts.study_mode?.value))){
      return {...row.facts.study_mode!,value:row.facts.study_mode!.value==='全日制'?'是':'否'};
    }
    if(supplemental?.value)return {value:supplemental.value,source:`profile:${profile.profile_id}@${profile.revision}/supplemental_fields/${supplemental.id}`};
    if(rule.emptyBranch){
      const parent=resolveFact(profile,sources,row,{key:rule.emptyBranch.key});
      if(parent?.value===rule.emptyBranch.value)return parent;
    }
    return undefined;
}
