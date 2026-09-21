import {z} from 'zod';
import {guopinFact} from './guopin.js';
import {dayeeInferredRules,dayeeFieldRules,isFawEditor,fawOption,fawEnglishLevel} from './dayee.js';
import {normalizeProfile,resolveFact,preparationAnswerState,type FactRecord} from '../../profile-facts.js';
import type {Profile} from '../../profile-store.js';
import type {RawPageForm,RawField} from '../form-engine.js';
import {validateFormPlan,type FormPlan,type PlanFact,type PlanRecord,type PlanStep} from '../form-plan.js';
import {type Recipe,type FieldRule,type SectionRule} from './recipes.js';
import {manualReason,manualTasks,type ManualTask} from '../manual-policy.js';
import {normalizeField as norm,recipeFor,fieldRules,sectionOf} from './field-rules.js';

export interface PlanningCatalog {page_id:number;navigation_id:string;observation_id:string;raw:RawPageForm;records:Array<{binding:string;scope:string;section:string;frame:number}>}
export const policySchema=z.object({records:z.enum(['preserve','append']).default('preserve'),bindings:z.array(z.object({scope:z.string().min(1).max(240),field:z.string().min(1).max(240),source_ref:z.string().min(1).max(240)}).strict()).max(50).default([]),overwrite_fields:z.array(z.object({section:z.string().max(240),field:z.string().max(240)}).strict()).max(100).default([])}).strict().default({});
export type PreparePolicy=z.infer<typeof policySchema>;
export interface Disposition {scope:string;field:string;status:string;required?:boolean;source_record?:string}
export interface DerivedEffect {source_step:string;value_step?:string;target_record:string;field:string;planned_target?:boolean;remove_empty?:boolean}
export interface ModuleSelection {page_module:string;profile_sections:string[];profile_state:'provided'|'none'|'unknown';profile_records:number;decision:'planned'|'preserve_existing'|'skip_no_profile_data'|'needs_profile_input'|'manual'|'unsupported';planned_records:number;planned_steps:number;manual_task_count:number}
export interface Compilation {record_sources?:Array<{plan_record:string;source_section:string;source_record:string}>;manual_tasks:ManualTask[];reobserve_after_execution?:boolean;derived_effects?:DerivedEffect[];recipe:string|null;plan:FormPlan|null;dispositions:Disposition[];source_dispositions:Array<{section:string;record_id?:string;status:string;field?:string}>;sections:Array<{section:string;presence:string;records:number}>;module_selection:ModuleSelection[]}
const nonempty=(f:RawField)=>f.checked===true||f.checked===null&&Boolean(f.value);
const button=(f:RawField)=>f.tag==='button'||f.role==='button';
const identity=/^(姓名|手机号|手机号码|邮箱|个人证件|证件号码|身份证号码?|居民身份证号)(\s*\/.*)?$/;
const keyOf=(f:RawField)=>`${f.frame}:${f.scope}:${f.index}`;
function moduleSelection(recipe:Recipe|undefined,catalog:PlanningCatalog,sections:Compilation['sections'],dispositions:Disposition[],manualTasks:ManualTask[],plan:FormPlan|null):ModuleSelection[]{
  if(!recipe)return [];
  const pageModules=[...new Set([
    ...catalog.raw.sections.filter(section=>recipe.sections.some(rule=>rule.sections.includes(section))),
    ...catalog.records.map(record=>record.section).filter(section=>recipe.sections.some(rule=>rule.sections.includes(section))),
    ...catalog.raw.fields.filter(field=>field.plannerFamily===recipe.family).map(field=>sectionOf(field.scope)).filter(section=>recipe.sections.some(rule=>rule.sections.includes(section))),
  ])];
  return pageModules.map(page_module=>{
    const rule=recipe.sections.find(candidate=>candidate.sections.includes(page_module))!;
    const sourceStates=rule.sources.map(source=>sections.find(section=>section.section===source)??{section:source,presence:'unknown',records:0});
    const profile_state:ModuleSelection['profile_state']=sourceStates.some(source=>source.presence==='provided')?'provided':sourceStates.every(source=>source.presence==='none')?'none':'unknown';
    const records=plan?.records.filter(record=>record.section===page_module)??[];
    const planned_steps=records.reduce((total,record)=>total+record.steps.length,0);
    const moduleDispositions=dispositions.filter(disposition=>sectionOf(disposition.scope)===page_module);
    const manual_task_count=manualTasks.filter(task=>sectionOf(task.scope)===page_module).length;
    const preserved=moduleDispositions.some(disposition=>['protected','preserved','site_derived'].includes(disposition.status));
    const unsupported=moduleDispositions.some(disposition=>['unsupported_variant','unmapped_field','field_mapping_ambiguous','record_mapping_ambiguous'].includes(disposition.status));
    const decision:ModuleSelection['decision']=planned_steps?'planned':preserved?'preserve_existing':profile_state==='none'?'skip_no_profile_data':profile_state==='unknown'?'needs_profile_input':manual_task_count?'manual':unsupported?'unsupported':'preserve_existing';
    return {page_module,profile_sections:rule.sources,profile_state,profile_records:sourceStates.reduce((total,source)=>total+source.records,0),decision,planned_records:records.length,planned_steps,manual_task_count};
  });
}
const parentLabel=(label:string):string|undefined=>{
  for(const [child,parent] of [['城市','省份'],['等级','类型'],['名称','类别'],['职位','职类'],['类别','类型'],['明细','类别']])if(label.endsWith(` / ${child}`))return label.slice(0,-child!.length)+parent;
  return undefined;
};
function combined(row:FactRecord):FactRecord {
  const parts=['description','responsibilities'].map(k=>row.facts[k]).filter((f):f is PlanFact=>Boolean(f));
  return {...row,facts:{...row.facts,...(parts.length?{combined_description:{value:[...new Set(parts.map(f=>f.value))].join('\n'),source:parts[0]!.source.replace(/\/[^/]+$/, '/description+responsibilities+facts')}}:{})}};
}
function projectValue(rule:FieldRule,fact:PlanFact,recipe:Recipe):PlanFact['value'] {
  let v=fact.value;
  if(rule.transform==='birth_month' && typeof v==='string')v=v.slice(0,7);
  if(rule.transform==='cities_text' && Array.isArray(v))v=v.join('、');
  if(rule.transform==='degree' && ['sd','ud'].includes(recipe.family) && typeof v==='string')v=({'硕士研究生':'硕士','博士研究生':'博士'} as Record<string,string>)[v]??v;
  if(rule.transform==='study_mode' && recipe.family==='ud' && v==='全日制')v='统招全日制';
  return v;
}
function display(v:PlanFact['value']):string {
  return typeof v==='object'&&!Array.isArray(v)?[v.start,v.current?'至今':v.end].filter(Boolean).join(' / '):Array.isArray(v)?v.join(' / '):String(v);
}
function inferredField(rule:FieldRule,section:string,recipe:Recipe):RawField {
  const dayeeLabels:Record<string,Record<string,string>>={
    '实习经历':{organization:'企业名称',description:'工作描述'},
    '工作经历':{organization:'企业名称',description:'工作描述'},
    '技能资质':{name:'专业技能证书名称'},
    '校内职务':{organization:'组织/团体名称',role:'担任职务',description:'职责和成就'},
    '其他外语能力':{name:'其他外语种类',overall:'其他外语水平'},
  };
  const preferred=recipe.family==='dayee'?dayeeLabels[section]?.[rule.key]:undefined;
  const date=['range','start','end','obtained_month','birth_date'].includes(rule.key);
  const choice=['level','study_mode','degree','overall','speaking','writing'].includes(rule.key)||rule.key==='school'&&recipe.family!=='ud'||rule.key==='name'&&section==='语言能力'&&recipe.family==='ud';
  return {frame:0,index:-1,tag:rule.key==='current'?'input':'input',role:rule.key==='range'?'date-group':'',type:rule.key==='current'?'checkbox':'text',label:preferred&&rule.labels.includes(preferred)?preferred:recipe.family==='ud'&&rule.key==='major'?'专业':recipe.family==='ud'&&rule.key==='name'&&section==='语言能力'?'语言':recipe.family==='ud'&&rule.key==='overall'?'精通程度':recipe.family==='sd'&&rule.key==='range'&&section==='教育背景'?'就读时间':recipe.family==='sd'&&rule.key==='description'&&['工作经历','实习经历'].includes(section)?'工作职责':rule.labels.includes(section)?section:rule.labels[0]!,scope:section,value:'',checked:rule.key==='current'?false:null,inputMode:date?'date':rule.key==='current'?'boolean':choice?'choice':'text',plannerFamily:recipe.family,disabled:false,readonly:false,required:false,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:''};
}
export function compilePlan(catalog:PlanningCatalog,profile:Profile,policy:PreparePolicy,testMode=false):Compilation {
  const recipe=recipeFor(catalog.raw.fields);
  const company=recipe?.family==='job51'&&catalog.raw.url?new URL(catalog.raw.url).searchParams.get('CtmID'):null;
  const sources=normalizeProfile(profile),dispositions:Disposition[]=[],source_dispositions:Compilation['source_dispositions']=[];
  const sections=Object.entries(sources).map(([section,s])=>({section,presence:s.presence,records:s.records.length}));
  const manual_tasks=manualTasks(catalog.raw);
  if(!recipe){const dispositions=catalog.raw.fields.filter(f=>!button(f)).map(f=>({scope:f.scope,field:f.label,status:'unsupported_variant',required:f.required}));return {manual_tasks,recipe:null,plan:null,dispositions,source_dispositions,sections,module_selection:[]};}
  const plan:FormPlan={schema_version:1,page_id:catalog.page_id,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:`${profile.profile_id}@${profile.revision}`,test_mode:testMode,facts:{},records:[],protected_fields:[],unresolved:[],budget_ms:180000};
  const handled=new Set<string>(),consumed=new Set<string>(),usedSources=new Set<string>();
  let reobserve_after_execution=false;
  const dynamicEffects:DerivedEffect[]=[];
  const record_sources:NonNullable<Compilation['record_sources']>=[];
  const addDisposition=(f:RawField,status:string,record?:string)=>{if(f.index>=0)handled.add(keyOf(f));const manual=manualReason(f);dispositions.push({scope:f.scope,field:f.label,status:manual?`manual_${manual}`:status,required:f.required,...(record?{source_record:record}:{})});};
  const allSections=[...new Set([...catalog.raw.sections,...catalog.records.map(r=>r.section)])].filter(section=>recipe.family!=='guopin'||catalog.raw.fields.some(f=>f.plannerFamily==='guopin'&&(f.scope===section||f.scope.startsWith(`${section} / 第`))&&!button(f)));
  function conflictingSource(fact:PlanFact):boolean {
    const path=fact.source.split('/').slice(1).join('/');
    return profile.supplemental_fields.some(s=>s.value!==null&&s.field_key.replaceAll('.', '/')===path&&s.value!==display(fact.value));
  }
  const factFor=(row:FactRecord,rule:FieldRule)=>resolveFact(profile,sources,row,rule);
  function fieldFact(row:FactRecord,rule:FieldRule,field:RawField):PlanFact|undefined {
    if(recipe?.family==='dayee'&&isFawEditor(catalog.raw.url)&&field.label==='英语等级')return fawEnglishLevel(factFor(row,{key:'exam_type',labels:[]}),factFor(row,{key:'score',labels:[]}));
    if(recipe?.family==='dayee'&&['major','highest_major'].includes(rule.key)){
      const option=factFor(row,{key:`${rule.key}_option`,labels:[]});if(option)return option;
    }
    const fact=recipe?.family==='guopin'?guopinFact(rule.key,factFor(row,rule)):factFor(row,rule);
    if((field.datePrecision==='date'||recipe?.family==='dayee'&&isFawEditor(catalog.raw.url)&&/^(开始时间|结束时间|考试时间)$/.test(field.label))&&typeof fact?.value==='string'&&/^\d{4}-\d{2}$/.test(fact.value)){
      const full=factFor(row,{key:rule.key.endsWith('_month')?rule.key.replace(/_month$/,'_date'):`${rule.key}_date`,labels:[]});
      if(full&&typeof full.value==='string'&&full.value.startsWith(`${fact.value}-`))return full;
    }
    return fact;
  }
  for(const section of allSections){
    let rule=recipe.sections.find(r=>r.sections.includes(section));if(!rule)continue;
    if(recipe.family==='phoenix'&&section==='工作经历'&&allSections.includes('实习经历'))rule={...rule,sources:['work']};
    if(recipe.family==='dayee'&&['实习经历','工作经历'].includes(section))rule={...rule,sources:[section==='实习经历'?'internships':'work']};
    const inputRows=rule.sources.flatMap(source=>(sources[source]?.records??[]).map(row=>combined(row)).filter(row=>rule!.fields.some(r=>Boolean(factFor(row,r))))).filter(row=>!rule!.record_filter || (rule!.record_filter==='english' ? /^(英语|english)$/i.test(String(row.facts.name?.value??'')) : !/^(英语|english)$/i.test(String(row.facts.name?.value??''))));
    if(recipe.family==='dayee'&&rule.record_filter==='other_languages')for(let i=inputRows.length-1;i>=0;i--)if(/^(普通话|汉语|中文|mandarin|chinese)$/i.test(String(inputRows[i]!.facts.name?.value??'')))inputRows.splice(i,1);
    if(recipe.family==='dayee'&&isFawEditor(catalog.raw.url)&&section==='教育经历'){
      const levels=['高中','大专','本科','硕士研究生','博士研究生'];
      inputRows.sort((a,b)=>levels.indexOf(String(b.facts.level?.value))-levels.indexOf(String(a.facts.level?.value)));
    }
    const status=inputRows.length?'provided':rule.sources.every(s=>sources[s]?.presence==='none')?'none':'unknown';
    const fields=catalog.raw.fields.filter(f=>f.scope===section||f.scope.startsWith(`${section} / 第`));
    const bankSlots=recipe.family==='job51'&&section==='教育背景'&&fields.some(f=>f.educationSlot);
    const levelSlots=bankSlots||recipe.family==='job51'&&section==='教育经历'&&fields.some(f=>f.label==='最高学历'&&f.scope===section)
      && (fields.filter(f=>!button(f)).length===1||fields.some(f=>/^(博士|硕士|本科|大专)是否统招$/.test(f.label)));
    if(levelSlots){
      const selector=fields.find(f=>f.label==='最高学历')!,binding=catalog.records.find(b=>b.scope===section&&b.frame===selector.frame);
      const levels=['高中','大专','本科','硕士研究生','博士研究生'],rank=(r:FactRecord)=>levels.indexOf(String(r.facts.level?.value));
      const highest=Math.max(...inputRows.map(rank)),rows=inputRows.filter(r=>rank(r)===highest);
      if(!binding||rows.length!==1||inputRows.some(r=>rank(r)<0)){addDisposition(selector,'highest_education_ambiguous');continue;}
      const fact=rows[0]!.facts.level!,value=String(fact.value).replace('研究生','');
      if(!selector.options.includes(value)||nonempty(selector)&&selector.value!==value){addDisposition(selector,'highest_education_conflict');continue;}
      const rid=`r${plan.records.length}`,sid=`s${Object.keys(plan.facts).length}`;
      plan.facts[sid]={...fact,value};plan.records.push({id:rid,section,mode:'existing',binding:binding.binding,add_target:'添加',steps:[{id:sid,action:'select',field:selector.label,source_ref:sid,depends_on:[],overwrite:false,selection_mode:'replace',query_from_value:false,allow_custom:false}]});addDisposition(selector,'planned',rows[0]!.id);
      if(!nonempty(selector)){reobserve_after_execution=true;continue;}
    }
    if(recipe.family==='job51'&&section==='教育经历'&&fields.some(f=>f.label==='最高学历')&&inputRows.length>1){
      const levels=['高中','大专','本科','硕士研究生','博士研究生'];
      const rank=(row:FactRecord)=>levels.indexOf(String(row.facts.level?.value));
      const highest=Math.max(...inputRows.map(rank));
      if(inputRows.some(row=>rank(row)<0)||inputRows.filter(row=>rank(row)===highest).length!==1){source_dispositions.push({section,status:'highest_education_ambiguous'});continue;}
      inputRows.sort((a,b)=>rank(b)-rank(a));
    }
    const binders=catalog.records.filter(b=>b.section===section);
    const recordFields=(b:typeof binders[number])=>fields.filter(f=>f.frame===b.frame&&f.scope===b.scope&&!button(f)&&!rule.negative?.includes(f.label));
    const cards=binders.filter(b=>recordFields(b).length>0&&(!levelSlots||b.scope!==section));
    const adds=fields.filter(f=>button(f)&&[section==='教育经历'?'添加教育经历':`添加${section}`,'添加'].includes(f.label));
    const addLabel=adds.length===1?adds[0]!.label:undefined;
    const toggles=fields.filter(f=>rule.negative?.includes(f.label)&&f.inputMode==='boolean');
    const dependencies:string[]=[];
    // Omitted records do not prove a negative answer. Never toggle unknown.
    if(toggles.length===1 && status!=='unknown'){
      const toggle=toggles[0]!,binder=binders.find(b=>b.scope===toggle.scope&&b.frame===toggle.frame);
      if(binder){const id=`r${plan.records.length}`,sid=`s${Object.keys(plan.facts).length}`,value=status==='none';
        const hasExisting=cards.some(b=>recordFields(b).some(nonempty));
        if(value && hasExisting){addDisposition(toggle,'existing_records_conflict');}
        else if(toggle.checked!==value && hasExisting && !policy.overwrite_fields.some(p=>p.section===section&&p.field===toggle.label)){addDisposition(toggle,'overwrite_required');}
        else{plan.facts[sid]={value,source:`profile:${profile.profile_id}@${profile.revision}/${value?'section_status/'+rule.sources[0]:'experience'}`};plan.records.push({id,section,mode:'existing',binding:binder.binding,add_target:'添加',steps:[{id:sid,action:'fill',field:toggle.label,source_ref:sid,overwrite:toggle.checked!==value,depends_on:[]}]});dependencies.push(sid);addDisposition(toggle,'planned');}
      }
    }
    if(!inputRows.length){
      const states=rule.sources.map(s=>preparationAnswerState(profile,s,s,'presence')).filter(Boolean);
      for(const field of fields.filter(f=>!button(f)&&!handled.has(keyOf(f))))addDisposition(field,nonempty(field)?'preserved':status==='none'?'explicit_none':states.length===rule.sources.length?`user_${states[0]}`:'not_provided');continue;
    }
    const matches=(b:typeof cards[number],row:FactRecord)=>{
      const anchors=rule.fields.filter(r=>row.anchors.includes(r.key)||r.key==='range'&&row.anchors.includes('start'));
      const visible=anchors.flatMap(r=>recordFields(b).filter(f=>r.labels.some(l=>norm(l)===norm(f.label))&&nonempty(f)).map(f=>({f,r})));
      if(recipe.family==='guopin'&&section==='教育经历'&&!visible.length){const level=recordFields(b).find(f=>f.label==='学历');if(level&&nonempty(level))return level.value===String(row.facts.level?.value).replace('研究生','')||level.value===row.facts.level?.value;}
      return visible.length>0&&visible.every(({f,r})=>{const fact=fieldFact(row,r,f);return fact&&norm(f.value)===norm(display(projectValue(r,fact,recipe!)));});
    };
    for(const row of inputRows){
      if(!rule.fields.some(r=>Boolean(factFor(row,r))))continue;
      const available=cards.filter(b=>!consumed.has(b.binding));
      const matching=available.filter(b=>matches(b,row));
      const ambiguous=matching.length>1||matching.some(b=>inputRows.filter(r=>matches(b,r)).length!==1);
      let binder=ambiguous?undefined:matching[0];
      if(!binder&&!ambiguous)binder=available.find(b=>!recordFields(b).some(nonempty));
      if(levelSlots){
        const level=String(row.facts.level?.value).replace('研究生','');
        const nonSchool=inputRows.filter(r=>r.facts.level?.value!=='高中');
        const ranks=['大专','本科','硕士研究生','博士研究生'];
        const highest=nonSchool.filter(r=>ranks.indexOf(String(r.facts.level?.value))===Math.max(...nonSchool.map(r=>ranks.indexOf(String(r.facts.level?.value)))));
        const others=nonSchool.filter(r=>!highest.includes(r));
        const kind=level==='高中'?'high_school':highest.includes(row)?'highest':'other';
        if(bankSlots&&kind==='other'&&others.length!==1){source_dispositions.push({section,record_id:row.id,status:'record_mapping_ambiguous'});continue;}
        const slots=cards.filter(b=>recordFields(b).some(f=>bankSlots?f.educationSlot===kind:f.label===`${level}是否统招`));
        if(slots.length!==1){source_dispositions.push({section,record_id:row.id,status:slots.length?'record_mapping_ambiguous':'record_level_not_available'});continue;}
        binder=slots[0];
      }else if(recipe.family==='job51'&&section==='教育经历'&&fields.some(f=>f.label==='最高学历')){
        // Highest/other are semantic slots, not interchangeable blank cards.
        const slot=cards.find(b=>b.scope===`${section} / 第${inputRows.indexOf(row)+1}条`);
        if(!slot){source_dispositions.push({section,record_id:row.id,status:'record_unavailable'});continue;}
        if(consumed.has(slot.binding)||recordFields(slot).some(nonempty)&&!matches(slot,row)){
          source_dispositions.push({section,record_id:row.id,status:'record_mapping_ambiguous'});continue;
        }
        binder=slot;
      }
      if(!rule.repeated)binder=cards.length===1?cards[0]:undefined;
      const unavailable=ambiguous||!rule.repeated&&cards.length>1;
      if(unavailable || !binder&&rule.repeated&&available.some(b=>recordFields(b).some(nonempty))&&policy.records!=='append' && !matching.length){source_dispositions.push({section,record_id:row.id,status:'record_mapping_ambiguous'});continue;}
      // Guopin saves one editor at a time. Opening another record here would
      // discard the current unsaved editor or trigger an exit confirmation.
      if(recipe.family==='guopin'&&!binder){source_dispositions.push({section,record_id:row.id,status:'editor_requires_open'});continue;}
      if(!binder&&!addLabel&&!dependencies.length){source_dispositions.push({section,record_id:row.id,status:fields.some(f=>!button(f))?'record_unavailable':'section_not_expandable'});continue;}
      if(binder){consumed.add(binder.binding);}
      const rid=`r${plan.records.length}`;
      const target:PlanRecord={id:rid,section,mode:binder?'existing':rule.reveal?'reveal':'new',...(binder?{binding:binder.binding}:{}),add_target:addLabel??'添加',steps:[]};
      const separateDates=['phoenix','dayee','job51'].includes(recipe.family);
      // Aliases describe one fact, not multiple speculative controls. Merge them
      // before inferring a newly added Dayee record's visible field label.
      const inferredRules=recipe.family==='dayee'?dayeeInferredRules(rule.fields,section,catalog.raw.url):rule.fields;
      const actual=binder?recordFields(binder):cards[0]?recordFields(cards[0]):inferredRules.filter(r=>factFor(row,r)&&!(!separateDates&&['start','end','current'].includes(r.key))&&!(separateDates&&r.key==='range')&&!(recipe.family==='ud'&&section==='教育经历'&&r.key==='degree')&&!(recipe.family==='ud'&&section==='项目经历'&&['description','responsibilities'].includes(r.key))).map(r=>inferredField(r,section,recipe!));
      const template=actual.filter(f=>!button(f)).map(field=>binder?field:{...field,index:-1,value:'',checked:field.checked===null?null:false,pendingInput:false});
      // This employer's observed experience calendars require complete dates,
      // including fields that are only mounted after adding a new record.
      if(recipe.family==='dayee'&&/^https:\/\/faw-zhaopin\.hotjob\.cn\//.test(catalog.raw.url)){
        for(const field of template)if(field.inputMode==='date'&&/^(开始时间|结束时间|出生日期|考试时间)$/.test(field.label))field.datePrecision='date';
      }
      const educationGate=recipe.family==='guopin'&&section==='教育经历'&&template.find(f=>['学历','学位证'].includes(f.label)&&!nonempty(f)&&Boolean(factFor(row,{key:f.label==='学历'?'level':'has_degree',labels:[]})));
      const usedKeys=new Set<string>();
      for(const field of template){
        if(educationGate&&field!==educationGate){addDisposition(field,'awaiting_education_level',row.id);continue;}
        if(field.role==='button'||rule.negative?.includes(field.label))continue;
        const manual=manualReason(field);
        if(manual){
          addDisposition({...field,scope:binder?.scope??`${section} / 新记录`},`manual_${manual}`,row.id);
          if(binder)plan.protected_fields.push({record_id:rid,field:field.label});
          continue;
        }
        if(template.some(parent=>parent.relatedFields?.includes(field.label))){addDisposition({...field,scope:binder?.scope??`${section} / 新记录`},'composite_member',row.id);continue;}
        if(template.some(parent=>parent.role==='date-group'&&field.label.startsWith(`${parent.label} / `))){addDisposition({...field,scope:binder?.scope??`${section} / 新记录`},'date_group_member',row.id);continue;}
        const semanticLabel=levelSlots?field.label.replace(/^(博士|硕士|本科|大专)/,''):field.label;
        const eligible=recipe.family==='dayee'?dayeeFieldRules(fieldRules(rule,semanticLabel,company),catalog.raw.url):fieldRules(rule,semanticLabel,company);
        const specific=eligible.filter(r=>r.company===company&&r.company);
        const candidates=specific.length?specific:eligible;
        const fieldRule=candidates.length===1?candidates[0]:undefined;
        const fact=fieldRule&&fieldFact(row,fieldRule,field);
        if(fieldRule&&fact){usedSources.add(`${row.id}:${fieldRule.key}`);if(fieldRule.key==='combined_description')for(const k of ['description','responsibilities'])usedSources.add(`${row.id}:${k}`);}
        const scope=binder?.scope??`${section} / 新记录`;
        const targetField={...field,scope,...(!binder?{index:-1}:{})};
        if(binder&&(field.disabled||identity.test(field.label)&&nonempty(field))){plan.protected_fields.push({record_id:rid,field:field.label});addDisposition(targetField,'protected',row.id);continue;}
        const unresolved=(status:string)=>{addDisposition(targetField,status,row.id);plan.unresolved.push({record_id:rid,field:field.label,status:status==='missing_information'?'missing_information':'needs_judgment',reason:status});};
        if(!fieldRule){if(!candidates.length&&nonempty(field)){addDisposition(targetField,'preserved',row.id);continue;}unresolved(candidates.length?'field_mapping_ambiguous':'unmapped_field');continue;}
        if(fieldRule.key==='end'&&row.facts.current?.value===true){addDisposition(targetField,'current_record',row.id);continue;}
        if(!fact){
          const marked=preparationAnswerState(profile,fieldRule.key==='cities'?'intent':row.section??rule.sources[0]!,fieldRule.key==='cities'?'intent':row.id,fieldRule.key);
          if(nonempty(field))addDisposition(targetField,'preserved',row.id);
          else if(field.required)unresolved(marked?`user_${marked}`:'missing_information');
          else addDisposition(targetField,marked?`user_${marked}`:'not_provided',row.id);
          continue;
        }
        if(template.filter(f=>norm(f.label)===norm(field.label)).length>1){unresolved('field_mapping_ambiguous');continue;}
        if(conflictingSource(fact)){unresolved('source_conflict');continue;}
        if(field.pendingInput){unresolved('uncommitted_value');continue;}
        let value=projectValue(fieldRule,fact,recipe!);
        if(recipe.family==='dayee'&&isFawEditor(catalog.raw.url))value=fawOption(fieldRule.key,value) as PlanFact['value'];
        if(fieldRule.key==='english_test_type'&&typeof value==='string'&&field.options.length&&!field.options.includes(value)){
          const punctuation=(v:string)=>v.replaceAll('（','(').replaceAll('）',')');
          const equivalent=field.options.filter(option=>punctuation(option)===punctuation(value as string));
          if(equivalent.length===1)value=equivalent[0]!;
        }
        if(['job51','dayee'].includes(recipe.family)&&fieldRule.key.endsWith('_province')&&typeof value==='string'&&field.options.length&&!field.options.includes(value)){
          const sourceProvince=value.replace(/省$/,'');
          const equivalent=field.options.filter(option=>option.replace(/省$/,'')===sourceProvince);
          if(equivalent.length===1)value=equivalent[0]!;
        }
        if(field.datePrecision==='date'&&typeof value==='string'&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){unresolved('date_precision_required');continue;}
        if(recipe.family==='job51' && fieldRule.key==='birth_date' && field.role==='date-group' && typeof value==='string')value=value.slice(0,7);
        if(field.constraints.maxlength!==null&&display(value).length>field.constraints.maxlength){unresolved('length_limit');continue;}
        let action: 'date'|'select'|'fill'|'path'=recipe.family==='guopin'&&fieldRule.key.endsWith('_path')&&Array.isArray(value)?'path':field.inputMode==='date'?'date':field.inputMode==='choice'?'select':'fill';
        const parent=parentLabel(field.label),upstream=parent&&target.steps.find(step=>step.field===parent);
        if(action==='select'&&['level','highest_education'].includes(fieldRule.key)&&typeof value==='string'&&!field.options.includes(value)){
          const equivalent=({'硕士研究生':'硕士','博士研究生':'博士','硕士':'硕士研究生','博士':'博士研究生'} as Record<string,string>)[value];
          if(equivalent&&field.options.includes(equivalent))value=equivalent;
        }
        if(fieldRule.key==='current'&&template.some(f=>f.role==='date-group')){addDisposition(targetField,'date_group_member',row.id);continue;}
        if(action==='fill'&&typeof value==='object' || action==='date'&&!(typeof value==='string'||typeof value==='object'&&!Array.isArray(value))){unresolved('control_type_changed');continue;}
        if(action==='select'&&field.options.length&&typeof value==='string'&&!field.options.includes(value)&&!upstream){unresolved('no_equivalent_option');continue;}
        // A native parent select can auto-select its first child. The originally
        // blank child is still part of the requested dependency transaction.
        const overwrite=policy.overwrite_fields.some(p=>p.section===section&&p.field===field.label)||Boolean(upstream&&!nonempty(field));
        if(binder&&nonempty(field)&&(typeof value==='boolean'?value!==field.checked:display(value)!==field.value)&&!(recipe.family==='guopin'&&field.label==='期望行业'&&fieldRule.key==='industry_path'&&Array.isArray(value)&&field.value===value.at(-1))&&!(recipe.family==='guopin'&&fieldRule.key==='guopin_certificate_paths'&&Array.isArray(value)&&field.value.split(' / ').every(v=>value.some(path=>path.split(' / ').at(-1)===v)))&&!overwrite){unresolved('existing_value_conflict');continue;}
        const sid=`s${Object.keys(plan.facts).length}`;
        plan.facts[sid]={value,source:fact.source};target.steps.push({id:sid,field:field.label,action,source_ref:sid,overwrite,depends_on:[...dependencies,...(upstream?[upstream.id]:[])],...(action==='select'?{selection_mode:'replace' as const,query_from_value:fieldRule.custom===true||fieldRule.key==='school'||recipe.family==='guopin'&&fieldRule.key==='major',allow_custom:fieldRule.custom===true}:{})} as PlanStep);
        usedKeys.add(fieldRule.key);addDisposition(targetField,'planned',row.id);usedSources.add(`${row.id}:${fieldRule.key}`);
      }
      if(educationGate&&target.steps.length){
        reobserve_after_execution=true;
        for(const field of template.filter(f=>!nonempty(f)&&['统招','全日制','学位证','学位细分','专业分类','专业名称','专业排名','学历证书编号','学位证书编号'].includes(f.label)))dynamicEffects.push({source_step:target.steps[0]!.id,target_record:rid,field:field.label,remove_empty:true});
      }
      // The explicit current toggle must enable an end field before date input.
      for(const parent of [...target.steps]){
        const original=template.find(f=>f.label===parent.field);
        if(!original||display(plan.facts[parent.source_ref]!.value)===original.value)continue;
        const children=template.filter(f=>parentLabel(f.label)===parent.field);
        if(children.some(child=>nonempty(child)&&!target.steps.some(step=>step.field===child.label))){
          target.steps=target.steps.filter(step=>step!==parent);
          plan.unresolved.push({record_id:rid,field:parent.field,status:'needs_judgment',reason:'dependent_value_conflict'});
          for(const d of dispositions)if(d.source_record===row.id&&d.field===parent.field&&d.status==='planned')d.status='dependent_value_conflict';
        }
      }
      const current=target.steps.find(s=>s.field==='至今');
      if(current){target.steps=target.steps.filter(s=>s!==current);target.steps.unshift(current);for(const step of target.steps)if(step!==current&&step.action==='date')step.depends_on.push(current.id);}
      if(target.steps.length||binder){plan.records.push(target);record_sources.push({plan_record:rid,source_section:row.section??rule.sources[0]!,source_record:row.id});}
      else{plan.unresolved=plan.unresolved.filter(u=>u.record_id!==rid);plan.protected_fields=plan.protected_fields.filter(u=>u.record_id!==rid);source_dispositions.push({section,record_id:row.id,status:'no_executable_facts'});}

    }
  }
  // Explicit exception bindings refer to existing profile paths, never inline invented values.
  // They only address unique, observed controls and cannot override an automatic mapping.
  for(const patch of policy.bindings){
    const fields=catalog.raw.fields.filter(f=>f.scope===patch.scope&&f.label===patch.field&&!button(f));
    if(manualReason({label:patch.field,scope:patch.scope})||fields.some(f=>manualReason(f)))continue;
    const facts=Object.values(sources).flatMap(s=>s.records).flatMap(r=>Object.values(r.facts)).filter(f=>f.source===`profile:${profile.profile_id}@${profile.revision}/${patch.source_ref}`);
    const binders=catalog.records.filter(b=>b.scope===patch.scope);
    if(fields.length!==1||facts.length!==1||binders.length!==1){dispositions.push({scope:patch.scope,field:patch.field,status:'exception_binding_ambiguous'});continue;}
    const field=fields[0]!,fact=facts[0]!,binder=binders[0]!;
    let target=plan.records.find(r=>r.binding===binder.binding);
    if(target?.steps.some(s=>s.field===field.label)||field.disabled||identity.test(field.label)&&nonempty(field)){addDisposition(field,'exception_binding_conflict');continue;}
    const overwrite=policy.overwrite_fields.some(p=>p.section===binder.section&&p.field===field.label);
    if(nonempty(field)&&display(fact.value)!==field.value&&!overwrite){addDisposition(field,'existing_value_conflict');continue;}
    if(conflictingSource(fact)){addDisposition(field,'source_conflict');continue;}
    if(field.pendingInput||field.constraints.maxlength!==null&&display(fact.value).length>field.constraints.maxlength){addDisposition(field,'exception_constraints');continue;}
    if(!target){target={id:`r${plan.records.length}`,section:binder.section,mode:'existing',binding:binder.binding,add_target:'添加',steps:[]};plan.records.push(target);}
    const sid=`s${Object.keys(plan.facts).length}`;
    const action=field.inputMode==='date'?'date':field.inputMode==='choice'?'select':'fill';
    plan.facts[sid]=fact;
    target.steps.push({id:sid,field:field.label,action,source_ref:sid,overwrite,depends_on:[],...(action==='select'?{selection_mode:'replace' as const,query_from_value:false,allow_custom:false}:{})} as PlanStep);
    plan.unresolved=plan.unresolved.filter(u=>!(u.record_id===target.id&&u.field===field.label));
    for(let i=dispositions.length-1;i>=0;i--)if(dispositions[i]!.scope===field.scope&&dispositions[i]!.field===field.label)dispositions.splice(i,1);
    addDisposition(field,'planned');
  }
  for(const [source,section] of Object.entries(sources))for(const row of section.records){
    if(!Object.keys(row.facts).length)continue;
    if(!recipe.sections.some(r=>r.sources.includes(source)&&r.sections.some(s=>allSections.includes(s))))source_dispositions.push({section:source,record_id:row.id,status:['skills','custom_answers','supplemental_fields'].includes(source)?'requires_mapping':'no_page_section'});
    else for(const k of Object.keys(row.facts))if(!usedSources.has(`${row.id}:${k}`)&&!['range','start','end','current'].includes(k))source_dispositions.push({section:source,record_id:row.id,field:k,status:'no_mapped_page_field'});
  }
  for(const f of catalog.raw.fields.filter(f=>!button(f)&&!handled.has(keyOf(f)))){
    const manual=manualReason(f);addDisposition(f,manual?`manual_${manual}`:f.plannerFamily?'unmapped_field':'outside_resume');
  }
  for(let i=source_dispositions.length-1;i>=0;i--){const d=source_dispositions[i]!;if((d.section==='supplemental_fields'||policy.bindings.some(b=>b.source_ref===`${d.section}/${d.record_id}`))&&plan.records.some(r=>r.steps.some(s=>plan.facts[s.source_ref]?.source===`profile:${profile.profile_id}@${profile.revision}/${d.section}/${d.record_id}`)))source_dispositions.splice(i,1);}
  if(!plan.records.length)return {manual_tasks,recipe:recipe.id,plan:null,dispositions,source_dispositions,sections,module_selection:moduleSelection(recipe,catalog,sections,dispositions,manual_tasks,null)};
  const derived_effects:DerivedEffect[]=[...dynamicEffects];
  if(recipe.family==='dayee'&&isFawEditor(catalog.raw.url)){
    const basic=plan.records.find(r=>r.section==='个人基本信息');
    const education=plan.records.find(r=>r.section==='教育经历'&&catalog.records.some(b=>b.binding===r.binding&&b.scope==='教育经历 / 第1条'));
    if(basic&&education)for(const [from,to] of [['学历','学历'],['最高学历毕业院校','学校'],['最高学历专业','专业（高中和初中学历专业选择“其他”）'],['毕业时间(与毕业证一致)','结束时间']]){
      const source=basic.steps.find(s=>s.field===from),target=education.steps.find(s=>s.field===to);
      if(source&&target&&display(plan.facts[source.source_ref]!.value)===display(plan.facts[target.source_ref]!.value))derived_effects.push({source_step:source.id,value_step:target.id,target_record:education.id,field:to!,planned_target:true});
    }
    const document=basic?.steps.find(s=>s.field==='证件号码');
    if(basic&&document)for(const field of ['性别','出生日期']){
      const target=basic.steps.find(s=>s.field===field);
      if(target)derived_effects.push({source_step:document.id,value_step:target.id,target_record:basic.id,field,planned_target:true});
    }
  }
  if(recipe.family==='sd')for(const derived of [
    {field:'最高学历',sourceSection:'教育背景',sourceField:'学历',explicit:profile.basic.highest_education},
    {field:'最近公司',sourceSection:'工作经历',sourceField:'公司名称',explicit:profile.basic.recent_company},
  ]){
    if(derived.explicit)continue;
    const target=plan.records.find(r=>r.mode==='existing'&&r.section==='个人信息');
    const binder=target&&catalog.records.find(b=>b.binding===target.binding);
    const fields=binder?catalog.raw.fields.filter(f=>f.scope===binder.scope&&f.frame===binder.frame&&f.label===derived.field):[];
    if(target&&fields.length===1&&!target.steps.some(s=>s.field===derived.field)){
      const effects:DerivedEffect[]=[];
      for(const record of plan.records.filter(r=>r.section===derived.sourceSection)){
        const valueStep=record.steps.find(s=>s.field===derived.sourceField);if(!valueStep)continue;
        for(const step of record.steps)effects.push({source_step:step.id,value_step:valueStep.id,target_record:target.id,field:derived.field});
      }
      if(effects.length){derived_effects.push(...effects);plan.protected_fields=plan.protected_fields.filter(p=>p.record_id!==target.id||p.field!==derived.field);for(const d of dispositions)if(d.scope===binder!.scope&&d.field===derived.field)d.status='site_derived';}
    }
  }
  const validation=validateFormPlan(plan);
  if(!validation.ok)throw new Error(`invalid_compilation:${validation.issues.map(i=>i.code).join(',')}`);
  return {record_sources,manual_tasks,recipe:recipe.id,plan:validation.plan,dispositions,source_dispositions,sections,module_selection:moduleSelection(recipe,catalog,sections,dispositions,manual_tasks,validation.plan),derived_effects,...(reobserve_after_execution?{reobserve_after_execution:true}:{})};
}
