import {describe,it,expect} from 'vitest';
import {ProfileSchema} from '../src/profile-store.js';
import {normalizeProfile,preparationQuestionId} from '../src/profile-facts.js';
import {compilePlan,policySchema,type PlanningCatalog} from '../src/browser/planning/compiler.js';
import {PreparedPlans,catalogDigest,preparationSummary} from '../src/browser/planning/prepared-plans.js';
import type {RawField} from '../src/browser/form-engine.js';
import {fawOption,fawEnglishLevel} from '../src/browser/planning/dayee.js';
const profile=(patch:Record<string,unknown>={})=>ProfileSchema.parse({schema_version:'1.1',profile_id:'virtual',revision:1,basic:{full_name:'测试用户',phone:null,email:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:[],...patch});
const row=(id:string,name:string)=>({id,name,role:null,start_month:null,end_month:null,is_current:null,technologies:[],facts:[]});
const field=(scope:string,label:string,patch:Partial<RawField>={}):RawField=>({frame:0,index:0,tag:'input',role:'textbox',type:'text',label,scope,value:'',checked:null,inputMode:'text',plannerFamily:'sd',disabled:false,readonly:false,required:false,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:'',...patch});
function catalog(fields:RawField[],sections=[...new Set(fields.map(f=>f.scope.split(' / ')[0]!))]):PlanningCatalog {
 fields=fields.map((f,index)=>({...f,index}));
 const records=[...new Set(fields.filter(f=>f.tag!=='button').map(f=>f.scope))].map((scope,i)=>({binding:`bind${i}`,section:scope.split(' / ')[0]!,scope,frame:0}));
 return {page_id:1,navigation_id:'nav',observation_id:'obs',raw:{fields,sections,records:[],validations:[],overlays:[]} as unknown as PlanningCatalog['raw'],records};
}
const compile=(c:PlanningCatalog,p=profile(),policy={})=>compilePlan(c,p,policySchema.parse(policy));
it('FAW English bands require both an explicit exam kind and a valid numeric score',()=>{
 const f=(value:string)=>({value,source:'fixture/'+value});
 expect(fawEnglishLevel(f('CET6'),f('425'))?.value).toBe('CET 6-425分及以上');
 expect(fawEnglishLevel(f('CET4'),f('424'))?.value).toBe('CET 4-425分以下');
 expect(fawEnglishLevel(f('熟练'),f('520'))).toBeUndefined();
 expect(fawEnglishLevel(f('CET6'),undefined)).toBeUndefined();
 expect(fawEnglishLevel(f('CET6'),f('711'))).toBeUndefined();
});
it('FAW preserves ambiguous rank bounds and distinguishes study mode from directed training',()=>{
 expect(fawOption('major_rank','前5%')).toBe('1%~10%');
 expect(fawOption('major_rank','前20%')).toBe('前20%');
 expect(fawOption('native_city','杭州')).toBe('杭州市');
 expect(fawOption('native_city','阿拉善盟')).toBe('阿拉善盟');
 const c=catalog([field('个人基本信息','培养方式',{plannerFamily:'dayee',inputMode:'choice'})]);
 c.raw.url='https://faw-zhaopin.hotjob.cn/SU603374380dcad4635b836531/pb/resumeOperation.html';
 const p=profile({supplemental_fields:[{id:'training',field_key:'basic.training_mode',label:'培养方式',description:'明确事实',value_type:'text',value:'非定向'}]});
 expect(compile(c,p).plan!.records.flatMap(r=>r.steps)).toHaveLength(0);
 p.supplemental_fields.push({id:'study',field_key:'basic.highest_study_mode',label:'最高学历学习方式',description:'明确事实',value_type:'text',value:'全日制'});
 expect(Object.values(compile(c,p).plan!.facts).map(f=>f.value)).toEqual(['全日制']);
 c.raw.url='https://another.hotjob.cn/resume';
 expect(Object.values(compile(c,p).plan!.facts).map(f=>f.value)).toEqual(['非定向']);
});
it('retains a withheld missing fact as a user decision without turning it into a page answer',()=>{
 const id=preparationQuestionId('basic','basic','gender');
 const p=profile({supplemental_fields:[{id:'marker',field_key:`preparation.status.${id}`,label:'性别',description:'用户暂不提供',value_type:'text',value:'withheld'}]});
 const result=compile(catalog([field('个人信息','姓名'),field('个人信息','性别',{required:true})]),p);
 expect(result.plan!.records.flatMap(r=>r.steps).map(s=>s.field)).toEqual(['姓名']);
 expect(result.plan!.unresolved).toContainEqual(expect.objectContaining({field:'性别',reason:'user_withheld'}));
 expect(Object.values(result.plan!.facts).some(f=>f.value==='withheld'||f.value==='否')).toBe(false);
});
it('manual relatives cannot be restored through an explicit source binding or hidden by missing profile rows',()=>{
 const c=catalog([field('个人信息','姓名'),field('个人信息','是否有亲属在本企业工作',{required:true}),field('个人信息','部门',{policyContext:'是否有亲属在本企业工作'})]);
 const p=profile({custom_answers:[{id:'relative',title:'历史回答',text:'否'}]});
 const result=compile(c,p,{bindings:[{scope:'个人信息',field:'是否有亲属在本企业工作',source_ref:'custom_answers/relative'}]});
 expect(result.plan!.records.flatMap(r=>r.steps).map(s=>s.field)).toEqual(['姓名']);
 expect(result.dispositions.filter(d=>d.status==='manual_employer_relatives')).toHaveLength(2);
 p.basic.full_name=null;
 expect(compile(c,p).dispositions.filter(d=>d.status==='manual_employer_relatives')).toHaveLength(2);
});
it('bank education slots bind high school, highest and other degrees independently of profile order',()=>{
 const edu=(id:string,level:string)=>({id,school:`虚构学校${id}`,major:'虚构专业',education_level:level,degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_expected_end:false,start_month:'2020-09',end_month:'2024-06',is_current:false});
 const p=profile({education:[edu('b','bachelor'),edu('h','high_school'),edu('m','master')]});
 const selector=field('教育背景','最高学历',{plannerFamily:'job51',inputMode:'choice',options:['本科','硕士'],value:'硕士'});
 const slots=(['high_school','highest','other'] as const).map((educationSlot,i)=>field(`教育背景 / 第${i+1}条`,'毕业学校',{plannerFamily:'job51',educationSlot}));
 const cat=catalog([selector,...slots]);
 const result=compile(cat,p);
 const targets=result.plan!.records.filter(r=>r.steps.some(s=>s.field==='毕业学校'));
 expect(targets.map(r=>[r.binding,result.plan!.facts[r.steps.find(s=>s.field==='毕业学校')!.source_ref]!.value])).toEqual([
  ['bind3','虚构学校b'],['bind1','虚构学校h'],['bind2','虚构学校m'],
 ]);
 // More than one lower degree cannot both own the single "other" slot.
 p.education.push(edu('a','associate') as any);
 const ambiguous=compile(cat,p);
 expect(ambiguous.source_dispositions.filter(d=>d.status==='record_mapping_ambiguous').map(d=>d.record_id)).toEqual(['b','a']);
 expect(ambiguous.plan!.records.some(r=>r.binding==='bind3')).toBe(false);
});
describe('preparation respects diverse resumes and employer module configuration',()=>{
 it('maps parent fields by explicit relation and refuses ambiguous or incomplete relatives',()=>{
  const relative=(id:string,relation:string,name:string,role?:string)=>Object.entries({relation,name,organization:'虚拟单位',...(role?{role}:{})}).map(([key,value])=>({id:`${id}-${key}`,field_key:`family.${id}.${key}`,label:key,description:'纯虚构测试',value_type:'text',value}));
  const p=profile({supplemental_fields:[...relative('a','母亲','虚拟母亲','教师'),...relative('b','父亲','虚拟父亲','工程师')]});
  const cat=catalog(['父亲姓名','父亲工作单位及职位','母亲姓名','母亲工作单位及职位'].map(label=>field('家庭成员信息',label,{plannerFamily:'job51'})));
  const values=(result:ReturnType<typeof compile>)=>Object.fromEntries(result.plan!.records.flatMap(r=>r.steps).map(s=>[s.field,result.plan!.facts[s.source_ref]!.value]));
  expect(values(compile(cat,p))).toEqual({'父亲姓名':'虚拟父亲','父亲工作单位及职位':'虚拟单位 / 工程师','母亲姓名':'虚拟母亲','母亲工作单位及职位':'虚拟单位 / 教师'});
  const missing=profile({supplemental_fields:[...relative('a','母亲','虚拟母亲'),...relative('b','父亲','虚拟父亲','工程师'),...relative('c','父亲','第二条父亲','工程师')]});
  expect(values(compile(cat,missing))).toEqual({'母亲姓名':'虚拟母亲'});
 });
 it('combines explicit skills, certificate names and career facts for consolidated company fields',()=>{
  const p=profile({basic:{full_name:null,phone:null,email:null,city:null,job_intention:null,self_description:'虚拟自评'},skills:['TypeScript','MS Excel'],certificates:[{id:'c1',name:'测试证书甲',issuer:null,obtained_month:null},{id:'c2',name:'测试证书乙',issuer:null,obtained_month:null}],supplemental_fields:[{id:'career',field_key:'basic.career_plan',label:'职业规划',description:'纯虚构测试',value_type:'text',value:'虚拟职业规划'}]});
  const cat=catalog([field('语言能力/技能证书','其他技能',{plannerFamily:'job51'}),field('语言能力/技能证书','获得证书名称',{plannerFamily:'job51'}),field('自我评价','自我评价及职业生涯规划',{plannerFamily:'job51'})]);
  const result=compile(cat,p);
  expect(Object.values(result.plan!.facts).map(f=>f.value)).toEqual(['TypeScript、MS Excel','测试证书甲、测试证书乙','虚拟自评\n\n虚拟职业规划']);
  p.supplemental_fields=[];
  expect(compile(cat,p).plan!.records.flatMap(r=>r.steps).some(s=>s.field==='自我评价及职业生涯规划')).toBe(false);
 });
 it('reveals highest education first and binds company degree slots by level rather than source order',()=>{
  const p=profile({education:[
   {major:null,degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_current:false,is_expected_end:false,id:'b',school:'本科虚构学校',education_level:'bachelor',start_month:'2019-09',end_month:'2023-06'},
   {major:null,degree:null,expected_degree:null,completed:false,study_mode:'full_time',is_current:true,is_expected_end:true,id:'m',school:'硕士虚构学校',education_level:'master',start_month:'2023-09',end_month:'2027-06'}]});
  const selector=field('教育经历','最高学历',{plannerFamily:'job51',tag:'select',inputMode:'choice',options:['--请选择--','本科','硕士']});
  const initial=compile(catalog([selector]),p);
  expect(initial.reobserve_after_execution).toBe(true);expect(Object.values(initial.plan!.facts).map(f=>f.value)).toEqual(['硕士']);
  const expanded=catalog([{...selector,value:'硕士'},
   ...['硕士是否统招','硕士毕业学校'].map(label=>field('教育经历 / 第1条',label,{plannerFamily:'job51'})),
   ...['本科是否统招','本科毕业学校'].map(label=>field('教育经历 / 第2条',label,{plannerFamily:'job51'}))]);
  const prepared=compile(expanded,p);expect(prepared.reobserve_after_execution).toBeUndefined();
  const steps=prepared.plan!.records.flatMap(r=>r.steps);
  expect(prepared.plan!.facts[steps.find(s=>s.field==='硕士毕业学校')!.source_ref]!.value).toBe('硕士虚构学校');
  expect(prepared.plan!.facts[steps.find(s=>s.field==='本科毕业学校')!.source_ref]!.value).toBe('本科虚构学校');
 });
 it('fills a blank compound identity number while preserving its sibling prefix and existing numbers',()=>{
  const cat=catalog([
   field('个人信息','手机号码 / 区号',{plannerFamily:'job51',value:'+86',inputMode:'choice'}),
   field('个人信息','手机号码 / 号码',{plannerFamily:'job51'}),
   field('个人信息','身份证号 / 类型',{plannerFamily:'job51',value:'身份证',inputMode:'choice'}),
   field('个人信息','身份证号 / 号码',{plannerFamily:'job51'}),
  ]);
  const p=profile({basic:{full_name:null,phone:'13000000000',email:null,city:null,job_intention:null},supplemental_fields:[{id:'id-number',field_key:'basic.identity_number',label:'虚拟号码',description:'纯虚构测试',value_type:'text',value:'990000200105160029'}]});
  const result=compile(cat,p);
  expect(result.plan!.records.flatMap(r=>r.steps).map(s=>s.field)).toEqual(['手机号码 / 号码','身份证号 / 号码']);
  expect(result.plan!.protected_fields.map(f=>f.field)).toEqual(['手机号码 / 区号','身份证号 / 类型']);
  cat.raw.fields.find(f=>f.label==='手机号码 / 号码')!.value='13800000000';
  const preserved=compile(cat,p);
  expect(preserved.plan!.records.flatMap(r=>r.steps).some(s=>s.field==='手机号码 / 号码')).toBe(false);
  expect(preserved.plan!.protected_fields.some(f=>f.field==='手机号码 / 号码')).toBe(true);
 });
 it('allows a sourced exception for an employer question without inline invented facts',()=>{
  const c=compile(catalog([field('个人信息','姓名'),field('个人信息','是否接受外派')]),profile({custom_answers:[{id:'answer1',title:'外派',text:'接受'}]}),{bindings:[{scope:'个人信息',field:'是否接受外派',source_ref:'custom_answers/answer1'}]});
  expect(c.plan!.records[0]!.steps.map(s=>s.field)).toEqual(['姓名','是否接受外派']);
  expect(Object.values(c.plan!.facts).some(f=>f.value==='接受')).toBe(true);expect(c.plan!.unresolved).toEqual([]);
 });
 it('does not silently choose between conflicting structured and supplemental facts',()=>{
  const c=compile(catalog([field('个人信息','姓名'),field('个人信息','性别')]),profile({basic:{full_name:null,email:null,phone:null,city:null,job_intention:null,gender:'女'},supplemental_fields:[{id:'conflict',field_key:'basic.gender',label:'性别',description:'旧补充资料',value_type:'text',value:'男'}]}));
  expect(c.plan!.records[0]!.steps).toHaveLength(0);expect(c.plan!.unresolved.some(u=>u.reason==='source_conflict')).toBe(true);
 });
 it('compiles 100 targets within the preparation budget without a model call',()=>{
  const rows=Array.from({length:25},(_,i)=>({...row(`p${i}`,`项目${i}`),role:'开发',description:'描述',responsibilities:'职责'}));
  const cat=catalog([field('项目经验','添加',{tag:'button',role:'button'}),...['项目名称','职责','项目描述','项目中职责'].map(label=>field('项目经验 / 第1条',label))]);
  const begin=performance.now(),c=compile(cat,profile({projects:rows}));
  expect(c.plan!.records.flatMap(r=>r.steps)).toHaveLength(100);expect(performance.now()-begin).toBeLessThan(1000);
 });
 it('migrates old profiles without treating omitted records as none',()=>{
  const p=profile();expect(p.schema_version).toBe('1.2');expect(normalizeProfile(p).internships?.presence).toBe('unknown');
  const c=compile(catalog([field('实习经历','没有实习经历',{inputMode:'boolean',checked:false,type:'checkbox'})]),p);
  expect(c.plan).toBeNull();expect(c.dispositions[0]?.status).toBe('not_provided');
 });
 it('does not add empty optional records, even if they have mandatory subfields',()=>{
  const c=compile(catalog([field('项目经验','添加',{tag:'button',role:'button'}),field('项目经验 / 第1条','项目名称',{required:true})]));
  expect(c.plan).toBeNull();expect(c.dispositions).toEqual([expect.objectContaining({status:'not_provided'})]);
 });
 it('only an explicit negative can change the negative checkbox',()=>{
  const cat=catalog([field('实习经历','没有实习经历',{inputMode:'boolean',checked:false,type:'checkbox'})]);
  const p=profile({section_status:{internships:'none'}});
  const result=compile(cat,p,{overwrite_fields:[{section:'实习经历',field:'没有实习经历'}]});
  expect(Object.values(result.plan!.facts)[0]?.value).toBe(true);
  expect(()=>profile({section_status:{projects:'none'},projects:[row('project1','甲')]})).toThrow();
 });
 it('does not delete existing experiences when the source explicitly says none',()=>{
  const c=compile(catalog([field('实习经历','没有实习经历',{inputMode:'boolean',checked:false}),field('实习经历 / 第1条','公司名称',{value:'原有公司'})]),profile({section_status:{internships:'none'}}),{overwrite_fields:[{section:'实习经历',field:'没有实习经历'}]});
  expect(c.plan).toBeNull();expect(c.dispositions.some(d=>d.status==='existing_records_conflict')).toBe(true);
 });
 it('reuses one blank card and creates only the remaining source records',()=>{
  const c=compile(catalog([field('项目经验','添加',{tag:'button',role:'button'}),field('项目经验 / 第1条','项目名称')]),profile({projects:[row('project1','甲'),row('project2','乙')]}));
  expect(c.plan!.records.map(r=>r.mode)).toEqual(['existing','new']);
  expect(c.plan!.records.map(r=>Object.values(c.plan!.facts).find(f=>f.value===(r.mode==='existing'?'甲':'乙'))?.value)).toEqual(['甲','乙']);
 });
 it('does not duplicate ambiguous existing records',()=>{
  const c=compile(catalog([field('项目经验','添加',{tag:'button',role:'button'}),field('项目经验 / 第1条','项目名称',{value:'甲'}),field('项目经验 / 第2条','项目名称',{value:'甲'})]),profile({projects:[row('project1','甲')]}));
  expect(c.plan).toBeNull();expect(c.source_dispositions[0]?.status).toBe('record_mapping_ambiguous');
 });
 it('one system supports employers with different module sets without inventing targets',()=>{
  const p=profile({projects:[row('project1','甲')],languages:[{id:'lang1',name:'英语'}]});
  const companyA=compile(catalog([field('个人信息','姓名'),field('项目经验','添加',{tag:'button',role:'button'}),field('项目经验 / 第1条','项目名称')]),p);
  const companyB=compile(catalog([field('个人信息','姓名'),field('语言能力 / 第1条','语言类型')]),p);
  expect(companyA.plan!.records.some(r=>r.section==='语言能力')).toBe(false);
  expect(companyB.plan!.records.some(r=>r.section==='项目经验')).toBe(false);
  expect(companyA.source_dispositions).toContainEqual(expect.objectContaining({section:'languages',status:'no_page_section'}));
  expect(companyB.source_dispositions).toContainEqual(expect.objectContaining({section:'projects',status:'no_page_section'}));
  expect(companyA.module_selection).toEqual(expect.arrayContaining([
   expect.objectContaining({page_module:'个人信息',profile_sections:['basic'],profile_state:'provided'}),
   expect.objectContaining({page_module:'项目经验',profile_sections:['projects'],profile_state:'provided',decision:'planned',planned_records:1}),
  ]));
  expect(companyB.module_selection).toEqual(expect.arrayContaining([
   expect.objectContaining({page_module:'语言能力',profile_sections:['languages'],profile_state:'provided',decision:'planned'}),
  ]));
 });
 it('reports employer custom mandatory questions rather than inventing answers',()=>{
  const c=compile(catalog([field('个人信息','姓名'),field('个人信息','是否接受外派',{required:true})]));
  expect(c.plan!.unresolved).toContainEqual(expect.objectContaining({field:'是否接受外派',reason:'unmapped_field'}));
  expect(c.plan!.records[0]!.steps.map(s=>s.field)).toEqual(['姓名']);
 });
 it('protects identity and nonempty values; boolean false remains a real fact',()=>{
  const c=compile(catalog([field('个人信息','姓名',{value:'页面姓名'}),field('个人信息','所在地',{value:'上海'})]),profile({basic:{full_name:'测试用户',phone:null,email:null,city:'杭州',job_intention:null}}));
  expect(c.plan!.records[0]!.steps).toHaveLength(0);expect(c.plan!.protected_fields).toHaveLength(1);
  expect(c.plan!.unresolved[0]?.reason).toBe('existing_value_conflict');
 });
});
describe('prepared plan lifecycle',()=>{
 it('pins owner, expires, and rejects silent value changes',()=>{
  let now=0;const cache=new PreparedPlans(()=>now),cat=catalog([field('个人信息','姓名')]);
  const entry=cache.put('owner','virtual',1,cat.raw,compile(cat));
  expect(()=>cache.get('other',entry.id)).toThrow('access_denied');
  cat.raw.fields[0]!.value='changed';expect(catalogDigest(cat.raw)).not.toBe(entry.digest);
  now=600001;expect(()=>cache.get('owner',entry.id)).toThrow('expired');
 });
 it('returns no resume values and retains inspectable omitted differences',()=>{
  const c=compile(catalog([field('个人信息','姓名'),...Array.from({length:50},(_,n)=>field('个人信息',`问题${n}`,{required:true}))]));
  const summary=preparationSummary(c);expect(JSON.stringify(summary)).not.toContain('测试用户');
  expect(summary.next_offset).toBe(20);expect((summary.differences as unknown[]).length).toBe(20);
  expect(summary).toMatchObject({page_module_count:1,planned_module_count:1});
  expect(summary.module_selection).toEqual([expect.objectContaining({page_module:'个人信息',profile_state:'provided'})]);
  expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(12288);
 });
});

it('uses only an explicitly supplied full date when a 51job date needs a day',()=>{
 const p=profile({education:[{id:'edu1',school:'测试大学',major:null,education_level:'bachelor',degree:null,expected_degree:null,completed:true,study_mode:'full_time',start_month:'2020-09',end_month:'2024-06',is_current:false,is_expected_end:false}]});
 const cat=catalog([field('教育经历','毕业学校',{plannerFamily:'job51'}),field('教育经历','毕业时间',{plannerFamily:'job51',inputMode:'date',datePrecision:'date',required:true})]);
 const missing=compile(cat,p);expect(missing.plan!.unresolved).toContainEqual(expect.objectContaining({reason:'date_precision_required'}));
 p.supplemental_fields=[{id:'end1',field_key:'education.edu1.end_date',label:'毕业日期',description:'测试补充',value_type:'text',value:'2024-06-30'}];
 const completed=compile(cat,p);expect(Object.values(completed.plan!.facts).some(f=>f.value==='2024-06-30'&&f.source.endsWith('/supplemental_fields/end1'))).toBe(true);
 p.supplemental_fields[0]!.value='2023-06-30';expect(compile(cat,p).plan!.unresolved).toContainEqual(expect.objectContaining({reason:'date_precision_required'}));
});
it('pins independently scoped family records without borrowing the applicant name',()=>{
 const p=profile({supplemental_fields:[{id:'family1',field_key:'family.parent1.name',label:'家属姓名',description:'测试补充',value_type:'text',value:'虚拟家属'},{id:'family2',field_key:'family.parent1.relation',label:'关系',description:'测试补充',value_type:'text',value:'父亲'}]});
 const c=compile(catalog([field('家庭关系 / 第1条','姓名',{plannerFamily:'dayee'}),field('家庭关系 / 第1条','关系',{plannerFamily:'dayee',inputMode:'choice'})]),p);
 expect(Object.values(c.plan!.facts).map(f=>f.value)).toEqual(['虚拟家属','父亲']);expect(Object.values(c.plan!.facts).every(f=>f.source.includes('/supplemental_fields/'))).toBe(true);
});
it('declares a city dependency and accepts options that will load after its province',()=>{
 const p=profile({supplemental_fields:[{id:'province',field_key:'basic.residence_province',label:'省',description:'测试补充',value_type:'text',value:'浙江省'},{id:'city',field_key:'basic.residence_city',label:'市',description:'测试补充',value_type:'text',value:'杭州'}]});
 const cat=catalog([field('基本信息','目前居住地 / 省份',{plannerFamily:'job51',inputMode:'choice',value:'江苏省',options:['江苏省','浙江省']}),field('基本信息','目前居住地 / 城市',{plannerFamily:'job51',inputMode:'choice',value:'南京',options:['南京']})]);
 const c=compile(cat,p,{overwrite_fields:[{section:'基本信息',field:'目前居住地 / 省份'},{section:'基本信息',field:'目前居住地 / 城市'}]});
 const steps=c.plan!.records[0]!.steps;expect(steps).toHaveLength(2);expect(steps[1]!.depends_on).toContain(steps[0]!.id);
 p.supplemental_fields=p.supplemental_fields.slice(0,1);
 const protectedCity=compile(cat,p,{overwrite_fields:[{section:'基本信息',field:'目前居住地 / 省份'}]});
 expect(protectedCity.plan!.records[0]!.steps).toHaveLength(0);expect(protectedCity.plan!.unresolved).toContainEqual(expect.objectContaining({reason:'dependent_value_conflict'}));
});

it('rejects conflicting canonical supplemental facts before planning',()=>{
 const p=profile({});p.supplemental_fields=[{id:'first',field_key:'family.father.name',label:'姓名',description:'测试',value_type:'text',value:'甲'},{id:'second',field_key:'family.father.name',label:'姓名',description:'测试',value_type:'text',value:'乙'}];
 expect(()=>compile(catalog([field('家庭关系 / 第1条','姓名',{plannerFamily:'dayee'})]),p)).toThrow('supplemental_source_conflict');
});

it('does not place highest education into an empty Other slot when highest is occupied by another record',()=>{
 const p=profile({education:[{id:'master',school:'虚拟硕士学校',major:'软件工程',education_level:'master',degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_expected_end:false,start_month:'2020-09',end_month:'2024-06',is_current:false}]});
 const f=(slot:number,label:string,value='')=>field(`教育经历 / 第${slot}条`,label,{plannerFamily:'job51',value});
 const c=compile(catalog([f(1,'最高学历','本科'),f(1,'毕业学校','既有学校'),f(2,'其他学历'),f(2,'毕业学校')]),p);
 expect(c.source_dispositions).toContainEqual(expect.objectContaining({record_id:'master',status:'record_mapping_ambiguous'}));
 expect(c.plan?.records.flatMap(r=>r.steps)??[]).toHaveLength(0);
});

it('allows replacing only a dependent child that was blank before its parent auto-selected a default',()=>{
 const p=profile({supplemental_fields:[{id:'p',field_key:'basic.residence_province',label:'省',description:'测试',value_type:'text',value:'浙江省'},{id:'c',field_key:'basic.residence_city',label:'市',description:'测试',value_type:'text',value:'杭州'}]});
 const cat=catalog([field('基本信息','目前居住地 / 省份',{plannerFamily:'job51',inputMode:'choice',options:['浙江省']}),field('基本信息','目前居住地 / 城市',{plannerFamily:'job51',inputMode:'choice',options:[]})]);
 const c=compile(cat,p);const steps=c.plan!.records[0]!.steps;expect(steps[1]!.depends_on).toContain(steps[0]!.id);expect(steps[1]!.overwrite).toBe(true);
});

it('new repeated records use field shapes without inheriting the first record values',()=>{
 const p=profile({supplemental_fields:[['it_skills.a.category','办公'],['it_skills.a.name','Word'],['it_skills.b.category','办公'],['it_skills.b.name','Excel']].map(([field_key,value],i)=>({id:`s${i}`,field_key,label:field_key,description:'测试',value_type:'text',value}))});
 const c=compile(catalog([field('IT技能 / 第1条','技能 / 类别',{plannerFamily:'job51',inputMode:'choice',value:'办公',options:['办公']}),field('IT技能 / 第1条','技能 / 名称',{plannerFamily:'job51',inputMode:'choice',value:'Word',options:['Word','Excel']}),field('IT技能','添加',{plannerFamily:'job51',tag:'button',role:'button'})]),p);
 const created=c.plan!.records.find(r=>r.mode==='new')!;expect(created.steps.find(s=>s.field==='技能 / 名称')!.overwrite).toBe(true);
});
it('Dayee separates full-time study from unified admission',()=>{
 const p=profile({education:[{id:'e',school:'虚拟学校',major:null,education_level:'bachelor',degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_expected_end:false,start_month:null,end_month:null,is_current:false}]});
 const c=compile(catalog([field('教育经历 / 第1条','学校',{plannerFamily:'dayee'}),field('教育经历 / 第1条','是否全日制',{plannerFamily:'dayee',inputMode:'choice'}),field('教育经历 / 第1条','学习形式',{plannerFamily:'dayee',inputMode:'choice',required:true})]),p);
 const steps=c.plan!.records[0]!.steps;expect(c.plan!.facts[steps.find(s=>s.field==='是否全日制')!.source_ref]!.value).toBe('是');expect(steps.some(s=>s.field==='学习形式')).toBe(false);
 expect(c.plan!.unresolved).toContainEqual(expect.objectContaining({field:'学习形式',reason:'missing_information'}));
});

it('recovers a partially filled research record by its explicit date without duplicating ambiguous rows',()=>{
 const p=profile({supplemental_fields:[['research.topic1.name','虚拟科研课题'],['research.topic1.start','2022-03'],['research.topic1.start_date','2022-03-15']].map(([field_key,value],i)=>({id:`research${i}`,field_key,label:field_key,description:'测试',value_type:'text',value}))});
 const fields=(n:number)=>[field(`科研经历 / 第${n}条`,'研究课题/项目',{plannerFamily:'dayee'}),field(`科研经历 / 第${n}条`,'开始时间',{plannerFamily:'dayee',inputMode:'date',datePrecision:'date',value:'2022-03-15'})];
 const recovered=compile(catalog(fields(1)),p);
 expect(recovered.plan!.records).toHaveLength(1);expect(recovered.plan!.records[0]!.mode).toBe('existing');
 expect(recovered.plan!.records[0]!.steps.some(s=>s.field==='研究课题/项目')).toBe(true);
 const ambiguous=compile(catalog([...fields(1),...fields(2)]),p);
 expect(ambiguous.plan?.records??[]).toHaveLength(0);expect(ambiguous.source_dispositions).toContainEqual(expect.objectContaining({status:'record_mapping_ambiguous'}));
});

it('company relatives are always manual while exact province suffix aliases can be projected',()=>{
 const p=profile({basic:{full_name:null,email:null,phone:null,city:null,job_intention:null,employment_status:'在校生'},supplemental_fields:[['basic.residence_province','浙江省'],['basic.applicant_type','2027届应届毕业生'],['basic.jiangsu_bank_relative_employed','否']].map(([field_key,value],i)=>({id:`bank${i}`,field_key,label:field_key,description:'虚构测试',value_type:'text',value}))});
 const cat=catalog([field('个人信息','现居住城市 / 省份',{plannerFamily:'job51',inputMode:'choice',options:['浙江','江苏']}),field('个人信息','申请者类别',{plannerFamily:'job51',inputMode:'choice',options:['在校生','其他']}),field('个人信息','是否有亲属受雇本公司',{plannerFamily:'job51',inputMode:'choice',options:['是','否'],required:true})]);
 cat.raw.url='https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=26b69a02-efa5-4674-a984-40bcae578b0a';
 const bank=compile(cat,p);expect(Object.values(bank.plan!.facts).map(f=>f.value)).toEqual(['浙江','在校生']);
 expect(bank.dispositions).toContainEqual(expect.objectContaining({field:'是否有亲属受雇本公司',status:'manual_employer_relatives'}));
 cat.raw.url='https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=another';
 const other=compile(cat,p);expect(other.plan!.records.flatMap(r=>r.steps).some(s=>s.field==='是否有亲属受雇本公司')).toBe(false);
 expect(other.dispositions).toContainEqual(expect.objectContaining({field:'是否有亲属受雇本公司',status:'manual_employer_relatives'}));
});

it('plans all three levels only for an explicit empty bank branch; a positive branch requires its own facts',()=>{
 const cat=catalog(['类型','类别','明细'].map(suffix=>field('个人信息',`生源籍贯是否为江苏省 / ${suffix}`,{plannerFamily:'job51',inputMode:'choice',options:suffix==='类型'?['是','否']:[],required:true})));
 cat.raw.url='https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=26b69a02-efa5-4674-a984-40bcae578b0a';
 const p=profile({supplemental_fields:[{id:'origin',field_key:'basic.origin_is_jiangsu',label:'江苏生源',description:'虚构测试',value_type:'text',value:'否'}]});
 const no=compile(cat,p),steps=no.plan!.records[0]!.steps;
 expect(steps).toHaveLength(3);expect(steps[2]!.depends_on).toEqual([steps[1]!.id]);
 expect(Object.values(no.plan!.facts).map(f=>f.value)).toEqual(['否','否','否']);
 p.supplemental_fields[0]!.value='是';const yes=compile(cat,p);
 expect(yes.plan!.records[0]!.steps).toHaveLength(1);
 expect(yes.plan!.unresolved.map(u=>u.field)).toEqual(['生源籍贯是否为江苏省 / 类别','生源籍贯是否为江苏省 / 明细']);
});


it('infers one Dayee control per fact when the first internship has not been added',()=>{
 const p=profile({experience:[{id:'intern',kind:'internship',organization:'虚拟企业',role:'研发实习生',description:'明确工作描述',facts:[],start_month:'2024-01',end_month:'2024-06',is_current:false}]});
 const c=compile(catalog([field('实习经历','添加实习经历',{plannerFamily:'dayee',tag:'button',role:'button'})]),p);
 const steps=c.plan!.records[0]!.steps;
 expect(steps.filter(s=>['公司名称','企业名称'].includes(s.field)).map(s=>s.field)).toEqual(['企业名称']);
 expect(steps.filter(s=>['描述','工作职责','工作描述'].includes(s.field)).map(s=>s.field)).toEqual(['工作描述']);
 expect(Object.values(c.plan!.facts).filter(f=>f.value==='虚拟企业')).toHaveLength(1);
});


it('prepares an open Guopin singleton editor without requiring a repeated-record scope',()=>{
 const p=profile({basic:{full_name:'测试用户',phone:null,email:null,city:null,job_intention:null,self_description:'明确的虚拟自我评价'}});
 const c=compile(catalog([field('自我评价','自我评价',{plannerFamily:'guopin',tag:'textarea',required:true})]),p);
 expect(c.plan!.records).toHaveLength(1);
 expect(c.plan!.records[0]).toMatchObject({section:'自我评价',mode:'existing'});
 const step=c.plan!.records[0]!.steps[0]!;
 expect(c.plan!.facts[step.source_ref]!.value).toBe('明确的虚拟自我评价');
});

it('FAW new internship and certificate plans omit controls absent from this employer',()=>{
 const p=profile({experience:[{id:'intern',kind:'internship',organization:'虚拟企业',role:'虚拟职位',description:'工作描述',facts:[],start_month:'2024-01',end_month:'2024-06',is_current:false}],certificates:[{id:'cert',name:'虚拟证书',issuer:'虚拟机构',obtained_month:'2024-01'}]});
 const c=catalog([field('实习经历','添加实习经历',{plannerFamily:'dayee',tag:'button',role:'button'}),field('技能资质','添加技能资质',{plannerFamily:'dayee',tag:'button',role:'button'})]);
 c.raw.url='https://faw-zhaopin.hotjob.cn/SU603374380dcad4635b836531/pb/resumeOperation.html';
 const result=compile(c,p);const fields=result.plan!.records.flatMap(r=>r.steps.map(s=>s.field));
 expect(fields).toContain('企业名称');expect(fields).toContain('专业技能证书名称');
 expect(fields).not.toContain('职位名称');expect(fields).not.toContain('至今');expect(fields).not.toContain('颁发机构');expect(fields).not.toContain('获得时间');
 c.raw.url='https://another.hotjob.cn/resume';
 expect(compile(c,p).plan!.records.flatMap(r=>r.steps.map(s=>s.field))).toContain('颁发机构');
});

it('Guopin binds a new editor to the next project and never re-adds its saved predecessor',()=>{
 const p=profile({projects:[{...row('first','项目甲'),start_month:'2024-01',end_month:'2024-06',is_current:false},{...row('second','项目乙'),start_month:'2024-07',end_month:'2024-12',is_current:false},{...row('third','项目丙')}]});
 const c=compile(catalog([field('项目经历 / 第1条','项目名称',{plannerFamily:'guopin'}),field('项目经历 / 第2条','项目名称',{plannerFamily:'guopin',value:'项目甲',disabled:true}),field('项目经历 / 第2条','起止时间',{plannerFamily:'guopin',value:'2024-01 / 2024-06',disabled:true,role:'date-group',inputMode:'date'}),field('项目经历','添加',{plannerFamily:'guopin',role:'button',tag:'button'})]),p);
 expect(c.plan!.records.some(r=>r.mode==='new')).toBe(false);
 const steps=c.plan!.records.flatMap(r=>r.steps);expect(steps).toHaveLength(1);
 expect(c.plan!.facts[steps[0]!.source_ref]!.value).toBe('项目乙');
 expect(c.source_dispositions).toContainEqual(expect.objectContaining({record_id:'third',status:'editor_requires_open'}));
});

it('Guopin prepares only an unset education level before inspecting its conditional fields',()=>{
 const p=profile({education:[{id:'edu',school:'浙江工业大学',major:'软件工程',college:null,degree:'工学学士',expected_degree:null,completed:true,study_mode:'full_time',education_level:'bachelor',start_month:'2019-09',end_month:'2023-06',is_current:false,is_expected_end:false}]});
 const fields=['学历','统招','专业名称','学校名称'].map(label=>field('教育经历 / 第1条',label,{plannerFamily:'guopin',inputMode:'choice'}));
 const first=compile(catalog(fields),p);
 expect(first.reobserve_after_execution).toBe(true);
 expect(first.plan!.records[0]!.steps.map(s=>s.field)).toEqual(['学历']);
 expect(first.derived_effects).toContainEqual(expect.objectContaining({field:'统招',remove_empty:true}));
 fields[0]!.value='本科';
 const second=compile(catalog(fields),p);
 expect(second.reobserve_after_execution).toBeUndefined();
 expect(second.plan!.records[0]!.steps.map(s=>s.field)).toContain('学校名称');
 // An unrelated school's existing record must not be claimed merely by degree.
 fields[3]!.value='其他大学';
 expect(compile(catalog(fields),p).plan).toBeNull();
});
