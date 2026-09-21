import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const b=await harness();const call=async(name,args)=>dataOf(await b.call(name,{page_id:b.pageId,...args}));
try{
 await b.open('dayee-resume');
 const observed=await call('form_observe',{mode:'overview',include_values:'state'});
 assert.ok(observed.sections.includes('实习经历'),JSON.stringify(observed));
 assert.ok(observed.fields.some(f=>f.label==='添加实习经历'&&f.kind==='button'));
 assert.ok(observed.fields.some(f=>f.scope==='教育经历 / 第1条'&&f.label==='学校'&&f.input_mode==='choice'));
 const school=await call('form_select_option',{scope:'教育经历 / 第1条',field:'学校',value:'测试学校'});
 assert.equal(school.ok,true,JSON.stringify(school));
 for(const [field,value] of [['性别','女'],['民族','汉族'],['现居住地 / 省份','浙江'],['现居住地 / 城市','杭州']]){
  const r=await call('form_select_option',{scope:'个人基本信息',field,value});assert.equal(r.ok,true,JSON.stringify(r));
 }
 for(const [scope,field,value] of [['个人基本信息','出生日期','2001-08-15'],['教育经历 / 第1条','开始时间','2020-09'],['教育经历 / 第1条','结束时间','2024-06']]){
  const r=await call('form_set_date',{scope,field,value});assert.equal(r.ok,true,JSON.stringify(r));
 }
 const added=await call('form_activate',{scope:'实习经历',target:'添加实习经历',intent:'add_record'});
 assert.equal(added.ok,true,JSON.stringify(added));assert.equal(added.added_records.length,1);
 const fill=await call('form_fill_fields',{scope:'实习经历 / 第1条',fields:[{field:'企业名称',value:'虚拟企业'},{field:'工作描述',value:'验证本地适配及输入事件。'.repeat(40)}]});
 assert.equal(fill.ok,true,JSON.stringify(fill));
 const oracle=await b.evalPage('()=>window.fixtureOracle()');
 assert.equal(oracle.values['个人基本信息'][0]['出生日期'],'2001-08-15');
 assert.equal(oracle.values['个人基本信息'][0]['性别'],'女');
 assert.equal(oracle.values['个人基本信息'][0]['现居住地市'],'杭州');
 assert.equal(oracle.values['教育经历'][0]['开始时间'],'2020-09');
 assert.equal(oracle.values['教育经历'][0]['学校'],'测试学校');
 assert.equal(oracle.values['教育经历'][0]['结束时间'],'2024-06');
 assert.equal(oracle.values['实习经历'][0]['企业名称'],'虚拟企业');
 assert.equal(oracle.values['实习经历'][0]['工作描述'],'验证本地适配及输入事件。'.repeat(40));
 // Exercise the real local profile -> compiler -> runner pipeline, including
 // a previously empty optional module and canonically scoped supplemental facts.
 await b.open('dayee-resume');
 const dates={start_month:'2020-09',end_month:'2024-06',is_current:false};
 const saved=dataOf(await b.profileCall('resume_profile_save',{name:'大易虚拟适配测试',changes:{
  basic:{full_name:'虚拟测试',gender:'女',birth_date:'2001-08-15',self_description:'虚拟自我评价'},
  education:[{school:'测试学校',major:'软件工程(计算机类)(普通本科)(中国大陆)',education_level:'bachelor',degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_expected_end:false,description:'虚拟专业描述',...dates}],
  experience:[{kind:'internship',organization:'虚拟企业',role:null,facts:[],description:'虚拟实习描述',...dates}],
  projects:[{name:'虚拟项目',role:null,facts:[],technologies:[],description:'虚拟项目描述',responsibilities:'虚拟项目职责',...dates}],
  supplemental_fields:[['ethnicity','汉族'],['residence_province','浙江'],['residence_city','杭州']].map(([key,value])=>({field_key:`basic.${key}`,label:key,description:'虚拟明确事实',value_type:'text',value})).concat([['family.member1.name','虚拟家属'],['family.member1.relation','父亲'],['family.member1.birth_date','1970-01-20'],['family.member1.organization','虚拟单位'],['family.member2.name','虚拟家属二'],['family.member2.relation','母亲'],['family.member2.birth_date','1971-03-02'],['family.member2.organization','虚拟单位二'],['research.research1.name','虚拟课题'],['research.research1.start','2020-09'],['research.research1.end','2024-06'],['research.research1.description','虚拟科研成果']].map(([field_key,value])=>({field_key,label:field_key,description:'虚拟明确事实',value_type:'text',value}))),
 }})).profile;
 const prepared=await call('form_prepare',{profile_id:saved.id,expected_revision:saved.revision,test_mode:true});
 assert.equal(prepared.recipe,'dayee/ant-resume/v1',JSON.stringify(prepared));
 const start=await call('form_run',{action:'start',request_id:'dayee-prepared',prepared_plan_id:prepared.prepared_plan_id});
 let result=await call('form_run',{action:'resume',run_id:start.run_id});
 while(result.status==='paused_window')result=await call('form_run',{action:'resume',run_id:start.run_id});
 assert.equal(result.counts.failed??0,0,JSON.stringify(result));
 const completed=await b.evalPage('()=>window.fixtureOracle()');
 assert.equal(result.status,'completed',JSON.stringify(result));
 assert.equal(completed.values['教育经历'][0]['学校'],'测试学校');
 assert.equal(completed.values['实习经历'][0]['企业名称'],'虚拟企业');
 assert.equal(completed.values['实习经历'][0]['开始时间'],'2020-09');
 assert.equal(completed.values['项目经验'][0]['项目名称'],'虚拟项目');
 assert.equal(completed.values['教育经历'][0]['专业'],'软件工程(计算机类)(普通本科)(中国大陆)');
 assert.equal(completed.values['家庭关系'][0]['姓名'],'虚拟家属');
 assert.equal(completed.values['家庭关系'][0]['关系'],'父亲');
 assert.equal(completed.values['家庭关系'].length,2);assert.equal(completed.values['家庭关系'][1]['姓名'],'虚拟家属二');
 assert.deepEqual(result.unassigned_created_records,[]);
 assert.equal(completed.values['科研经历'][0]['研究课题/项目'],'虚拟课题');
 assert.equal(completed.values['个人基本信息'][0]['现居住地市'],'杭州');
 console.log(JSON.stringify({passed:true,checks:20,prepared_verified:result.counts.verified_ui}));
}finally{await b.close();}
