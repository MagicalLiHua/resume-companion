import {createHash} from 'node:crypto';
import {z} from 'zod';
import {normalizeProfile,resolveFact,preparationQuestionId,type FactRecord} from './profile-facts.js';
import {type Profile, type ProfileChanges, ProfileChangesSchema, type ProfileStore} from './profile-store.js';
import {intentSchema} from './profile-fields.js';

export interface Requirement {
  section:string;key:string;label:string;
  uses:Array<{template_id:string;template_name:string;module:string}>;
  condition?:{key:string;equals:string};
}
export interface RequirementCatalog {version:string;requirements:Requirement[];template_ids:string[];templates:Array<{id:string;modules:string[]}>;}
const sectionLabels:Record<string,string>={basic:'个人信息',intent:'求职意向',education:'教育经历',work:'工作经历',internships:'实习经历',projects:'项目经历',languages:'语言能力',awards:'获奖经历',certificates:'证书',competitions:'竞赛',campus:'校园经历',family:'家庭成员',it_skills:'IT 技能',research:'科研经历',unclassified_experience:'待分类经历'};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const markerPrefix='preparation.status.';
const privateKey=/(?:^|_)(?:identity_number|passport|exam_id|report_number|edu_cert_no|degree_cert_no)(?:$|_)/;
const markedStates=['not_applicable','withheld','deferred'] as const;
type MarkedState=typeof markedStates[number];
interface Question {
  id:string;section:string;record_id:string;record_label:string;key:string;label:string;
  kind:'field'|'presence';entry:'ordinary'|'local_only';state:'missing'|MarkedState;
  uses:Requirement['uses'];condition?:Requirement['condition'];format:string;
}
export const PreparationReadSchema={
  profile_id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),expected_revision:z.number().int().positive(),
  scope:z.enum(['all_supported','selected_modules']).default('all_supported'),
  targets:z.array(z.object({template_id:z.string().max(120),modules:z.array(z.string().max(120)).max(40)}).strict()).max(12).optional(),
  include_marked:z.boolean().default(false),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(100),
  expected_questionnaire_id:z.string().max(64).optional(),
};
const readSchema=z.object(PreparationReadSchema).strict();
type ReadRequest=z.infer<typeof readSchema>;
const valueSchema=z.union([z.string().max(6000),z.boolean(),z.array(z.string().max(160)).max(20),intentSchema.shape.current_salary.removeDefault().unwrap()]);
export const PreparationApplySchema={
  profile_id:PreparationReadSchema.profile_id,expected_revision:PreparationReadSchema.expected_revision,
  catalog_version:z.string().max(80),questionnaire_id:z.string().max(64),
  scope:PreparationReadSchema.scope,targets:PreparationReadSchema.targets,
  answers:z.array(z.object({question_id:z.string().max(64),action:z.enum(['set','none',...markedStates,'reopen']),
    value:valueSchema.optional()}).strict()).min(1).max(200),
};
const applySchema=z.object(PreparationApplySchema).strict();
function fail(code:string,message:string):never {throw new Error(`${code}: ${message}`);}
const canonical=(section:string,record:string,key:string)=>['basic','intent'].includes(section)?`${section}.${key}`:`${section}.${record}.${key}`;
const storedSection=(section:string)=>['work','internships','unclassified_experience'].includes(section)?'experience':section;
const storedKey=(key:string)=>({start:'start_month',end:'end_month',current:'is_current',level:'education_level'} as Record<string,string>)[key]??key;
function storedRecord(profile:Profile,section:string,id:string):Record<string,unknown>|undefined {
  const value=(profile as unknown as Record<string,unknown>)[storedSection(section)];
  return ['basic','intent'].includes(section)?value as Record<string,unknown>:Array.isArray(value)?value.find((r:Record<string,unknown>)=>r.id===id):undefined;
}
const questionId=preparationQuestionId;
const hasValue=(value:unknown)=>value!==undefined&&value!==null&&(typeof value!=='string'||value.trim().length>0)&&(!Array.isArray(value)||value.length>0);
const escape=(s:string)=>s.replace(/[\r\n]+/g,' ').replace(/[\\`*_[\]<>|]/g,'\\$&');

/** Requirements are injected by the adapter layer; this module never reads a DOM. */
export class ProfilePreparation {
  constructor(private readonly store:ProfileStore,private readonly catalog:RequirementCatalog){}

  private questions(profile:Profile,input:Pick<ReadRequest,'scope'|'targets'>):Question[]{
    if(input.scope==='all_supported'&&input.targets?.length)fail('invalid_scope','首次通用准备不接受企业模块过滤');
    if(input.scope==='selected_modules'&&!input.targets?.length)fail('invalid_scope','当前页面检查需要企业及开放模块');
    for(const target of input.targets??[])if(!this.catalog.template_ids.includes(target.template_id))fail('unsupported_template','该模板不在已验证准备目录中');
    for(const target of input.targets??[])if(target.modules.some(m=>!this.catalog.templates.find(t=>t.id===target.template_id)?.modules.includes(m)))fail('unsupported_module','模块不在该企业已验证目录中');
    const sources=normalizeProfile(profile),result:Question[]=[];
    const markers=new Map(profile.supplemental_fields.filter(f=>f.field_key.startsWith(markerPrefix)).map(f=>[f.field_key.slice(markerPrefix.length),f.value]));
    const requirements=this.catalog.requirements.map(r=>({...r,uses:r.uses.filter(use=>input.scope==='all_supported'||input.targets?.some(t=>t.template_id===use.template_id&&t.modules.includes(use.module)))})).filter(r=>r.uses.length);
    const grouped=new Map<string,Requirement[]>();
    for(const r of requirements){const group=grouped.get(r.section)??[];group.push(r);grouped.set(r.section,group);}
    const push=(r:Requirement,row:FactRecord|undefined,index:number,kind:Question['kind']='field')=>{
      const record=row?.id??r.section,key=kind==='presence'?'presence':r.key;
      const id=questionId(r.section,record,key),mark=markers.get(id);
      const state=markedStates.includes(mark as MarkedState)?mark as MarkedState:'missing';
      const name=row?.facts.school?.value??row?.facts.organization?.value??row?.facts.name?.value;
      const recordLabel=`${sectionLabels[r.section]??r.section}${['basic','intent'].includes(r.section)||kind==='presence'?'':` #${index+1}${typeof name==='string'?` · ${name.slice(0,80)}`:''}${row?.facts.start?`（${row.facts.start.value}）`:''}`}`;
      const format=kind==='presence'?'没有 / 提供经历记录':key==='cities'?'城市字符串数组':['current_salary','expected_salary'].includes(key)?'薪资对象：amount、currency、period(month/year)、tax(before/after/unknown)、benefits(included/excluded/unknown)':key==='level'?'高中/大专/本科/硕士/博士/其他（或对应英文枚举）':key==='study_mode'?'全日制/非全日制/其他':key==='kind'?'work / internship':['current','completed'].includes(key)?'是/否（或布尔值）':['start','end','obtained_month'].includes(key)?'YYYY-MM':'文本';
      result.push({id,section:r.section,record_id:record,record_label:recordLabel,
        key,label:kind==='presence'?`是否有${sectionLabels[r.section]??r.section}（有则提供记录，无则明确没有）`:r.label,kind,entry:privateKey.test(key)?'local_only':'ordinary',state,uses:r.uses,format,...(r.condition?{condition:r.condition}:{})});
    };
    for(const [section,reqs] of grouped){
      const source=sources[section];
      if(source?.presence==='none')continue;
      if(!source?.records.length){
        push({...reqs[0]!,uses:[...new Map(reqs.flatMap(r=>r.uses).map(use=>[JSON.stringify(use),use])).values()]},undefined,0,'presence');continue;
      }
      source.records.forEach((row,index)=>{
        for(const r of reqs){
          // Unknown conditions remain deferred, rather than asking every branch.
          if(r.condition&&String(resolveFact(profile,sources,row,{key:r.condition.key})?.value??storedRecord(profile,section,row.id)?.[storedKey(r.condition.key)])!==r.condition.equals)continue;
          if(r.key==='end'&&row.facts.current?.value===true)continue;
          if(r.key==='current'&&hasValue(row.facts.end?.value))continue;
          if(r.key==='combined_description'&&(row.facts.description||row.facts.responsibilities))continue;
          if(section==='education'&&r.key==='degree'&&profile.education.find(e=>e.id===row.id)?.completed===false)continue;
          if(section==='education'&&['degree','completed'].includes(r.key)&&profile.education.find(e=>e.id===row.id)?.education_level==='high_school')continue;
          if(resolveFact(profile,sources,row,r))continue;
          if(hasValue(storedRecord(profile,section,row.id)?.[storedKey(r.key)]))continue;
          push(r,row,index);
        }
      });
    }
    for(const [index,row] of (sources.unclassified_experience?.records??[]).entries())push({section:'unclassified_experience',key:'kind',label:'经历类型：work（工作）或 internship（实习）',uses:[]},row,index);
    return [...new Map(result.map(q=>[q.id,q])).values()];
  }
  private identity(profile:Profile,input:Pick<ReadRequest,'scope'|'targets'>,questions:Question[]){
    return digest([profile.profile_id,profile.revision,this.catalog.version,input.scope,input.targets??[],questions]);
  }
  async read(raw:unknown){
    const input=readSchema.parse(raw),profile=await this.store.readForPlanning(input.profile_id,input.expected_revision);
    const all=this.questions(profile,input),visible=all.filter(q=>input.include_marked||q.state==='missing');
    const items=visible.slice(input.offset,input.offset+input.limit),next=input.offset+items.length<visible.length?input.offset+items.length:null;
    const id=this.identity(profile,input,all);
    if(input.expected_questionnaire_id&&input.expected_questionnaire_id!==id)fail('questionnaire_changed','补充表已变化，请从第一页重新读取');
    const lines=['# 待补充信息','',
      '这是已验证模板的资料准备清单，不代表每家公司都必填。已有内容已略过；没有的经历请明确写“没有”。可回答“不适用”“暂不提供”或“稍后补充”，这些状态不会被填成网站上的“否”。',
      '手机号和邮箱优先使用简历已有内容，不重复索取。身份证号等证件号码标记为本地录入，请勿在聊天补充；私密入口接入后处理。亲属任职、声明和附件由本人在网页确认。',''];
    let heading='';
    for(const [index,q] of items.entries()){
      if(q.record_label!==heading){heading=q.record_label;lines.push(`## ${escape(heading)}`,'');}
      const sites=[...new Set(q.uses.map(u=>u.template_name))].join('、');
      lines.push(`${input.offset+index+1}. ${escape(q.label)}：${q.entry==='local_only'?'【仅本地录入，请勿在聊天补充】':'______'}`,
        `   用于：${escape(sites||'先确认经历类别，避免串填')}。${q.state!=='missing'?` 已标记：${({not_applicable:'不适用',withheld:'暂不提供',deferred:'稍后补充'} as const)[q.state]}。`:''}`,'');
    }
    if(next!==null)lines.push('',`本页展示 ${items.length} 项，共 ${visible.length} 项。继续读取 offset=${next} 后再交给用户，不能把本页当完整清单。`);
    if(!visible.length)lines.push('当前目录没有未处理的缺项；这不表示所有招聘网站都已适配或已经保存简历。');
    return {profile_id:profile.profile_id,profile_revision:profile.revision,catalog_version:this.catalog.version,questionnaire_id:id,scope:input.scope,
      counts:{total:all.length,missing:all.filter(q=>q.state==='missing').length,marked:all.filter(q=>q.state!=='missing').length,local_only:all.filter(q=>q.entry==='local_only').length},
      total:visible.length,offset:input.offset,next_offset:next,items,markdown:lines.join('\n'),private_entry_available:false};
  }
  async apply(raw:unknown){
    const input=applySchema.parse(raw),profile=await this.store.readForPlanning(input.profile_id,input.expected_revision);
    if(input.catalog_version!==this.catalog.version)fail('catalog_changed','需求目录已更新，请重新生成补充表');
    const questions=this.questions(profile,input);
    if(input.questionnaire_id!==this.identity(profile,input,questions))fail('questionnaire_changed','补充表与当前资料或筛选范围不一致');
    const changes:ProfileChanges={},supplemental=structuredClone(profile.supplemental_fields);
    const seen=new Set<string>();
    const marker=(q:Question,state?:MarkedState)=>{
      const key=markerPrefix+q.id,index=supplemental.findIndex(f=>f.field_key===key);
      if(index>=0)supplemental.splice(index,1);
      if(state)supplemental.push({id:`prep_${q.id}`,field_key:key,label:q.label.slice(0,80),description:'资料准备状态，不作为网站答案',value_type:'text',value:state});
    };
    for(const answer of input.answers){
      if(seen.has(answer.question_id))fail('duplicate_answer','同一条目不能提交多个答案');seen.add(answer.question_id);
      const q=questions.find(q=>q.id===answer.question_id);
      if(!q)fail('question_unavailable','条目已填写、已移除或不属于这份补充表');
      if(answer.action!=='set'&&answer.value!==undefined)fail('invalid_answer','状态操作不能携带事实值');
      if(answer.action==='reopen'){marker(q);continue;}
      if(markedStates.includes(answer.action as MarkedState)){marker(q,answer.action as MarkedState);continue;}
      if(answer.action==='none'){
        if(q.kind!=='presence')fail('invalid_answer','只有尚无记录的栏目可以明确没有');
        if(['family','research','it_skills'].includes(q.section))this.putSupplemental(supplemental,`section_status.${q.section}`,q,'none');
        else (changes.section_status??={})[q.section as keyof NonNullable<ProfileChanges['section_status']>]='none';
        marker(q);continue;
      }
      if(q.entry==='local_only')fail('local_entry_required','请通过本地私密入口录入，不要向模型传递明文');
      if(q.kind==='presence')fail('records_required','有经历时先用资料保存工具添加真实记录，再按新 revision 生成补充表');
      if(!hasValue(answer.value))fail('empty_answer','空值不是已补充；可选择稍后补充');
      this.assign(profile,changes,supplemental,q,answer.value!);marker(q);
    }
    if(JSON.stringify(supplemental)!==JSON.stringify(profile.supplemental_fields))changes.supplemental_fields=supplemental;
    if(!Object.keys(changes).length)return {profile_id:profile.profile_id,profile_revision:profile.revision,changed:false};
    // Store.save performs revision validation again inside its write lock.
    const saved=await this.store.save({profile_id:profile.profile_id,expected_revision:profile.revision,changes:ProfileChangesSchema.parse(changes)});
    return {...saved,answered:input.answers.length,changed:true};
  }
  private putSupplemental(rows:Profile['supplemental_fields'],key:string,q:Question,value:string){
    const prior=rows.find(r=>r.field_key===key);
    if(prior&&hasValue(prior.value)&&prior.value!==value)fail('answer_conflict','补充事实已有不同答案，请先核对');
    if(prior)prior.value=value;
    else rows.push({id:`req_${digest(key)}`,field_key:key,label:q.label.slice(0,80),description:'用户在资料补充表中明确提供',value_type:'text',value});
  }
  private assign(profile:Profile,changes:ProfileChanges,supplemental:Profile['supplemental_fields'],q:Question,value:z.infer<typeof valueSchema>){
    const section=storedSection(q.section),key=storedKey(q.key);
    if(typeof value==='string'){
      if(key==='education_level')value=({高中:'high_school',大专:'associate',本科:'bachelor',硕士:'master',博士:'doctor',其他:'other'} as Record<string,string>)[value]??value;
      if(key==='study_mode')value=({全日制:'full_time',非全日制:'part_time',其他:'other'} as Record<string,string>)[value]??value;
      if(['is_current','completed'].includes(key)&&['是','否'].includes(value))value=value==='是';
    }
    const direct=['basic','intent'].includes(section);
    const original=direct?(profile as any)[section]:Array.isArray((profile as any)[section])?(profile as any)[section].find((r:any)=>r.id===q.record_id):undefined;
    if(original&&Object.hasOwn(original,key)){
      if(hasValue(original[key]))fail('answer_conflict','已有事实不通过补充表覆盖');
      const current=(changes as any)[section]??=structuredClone((profile as any)[section]);
      const target=direct?current:current.find((r:any)=>r.id===q.record_id);
      if(!target)fail('record_changed','记录已变化');
      target[key]=value;
    }else{
      if(typeof value!=='string')fail('invalid_answer','此补充字段需要文本');
      this.putSupplemental(supplemental,canonical(q.section,q.record_id,q.key),q,value);
    }
  }
}
