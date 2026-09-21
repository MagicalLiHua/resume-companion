import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const browser=await harness();
const call=async(name,args={})=>dataOf(await browser.call(name,{page_id:browser.pageId,...args}));
try{
 await browser.open('sd-resume');
 let catalog=await call('form_observe',{mode:'overview',include_values:'state',max_bytes:80000});
 for(const label of ['姓名','手机号码','邮箱'])assert(catalog.fields.some(f=>f.scope==='基础信息'&&f.label===label&&f.disabled),label);
 for(const section of ['工作经历','教育背景','实习经历','项目经验','语言能力','获奖经历'])assert(catalog.records.some(r=>r.scope===`${section} / 第1条`),section);
 const unavailable=await call('form_select_option',{scope:'教育背景 / 第1条',field:'学校名称',value:'未授权新学校',query:'未授权新学校'});
 assert.equal(unavailable.error.code,'option_not_found',JSON.stringify(unavailable));
 assert.equal((await browser.evalPage('() => window.fixtureOracle()')).values.教育背景[0].学校名称,undefined);
 assert.equal((await call('form_activate',{scope:'教育背景 / 第1条',target:'学校名称',intent:'close'})).ok,true);
 assert.equal(await browser.evalPage('() => document.querySelectorAll(".sd-Dropdown-dropdown-fixture").length'),0);
 assert.equal(catalog.fields.find(f=>f.label==='出生日期 (年龄)').input_mode,'date');
 const birthday=await call('form_set_date',{scope:'个人信息',field:'出生日期 (年龄)',value:'2001-05'});
 assert.equal(birthday.status,'verified_ui',JSON.stringify(birthday));
 assert.equal((await browser.evalPage('() => window.fixtureOracle()')).values.个人信息[0]['出生日期 (年龄)'],'2001-05');
 assert.equal((await call('form_set_date',{scope:'个人信息',field:'出生日期 (年龄)',value:'2001-05'})).status,'unchanged');
 const precision=await call('form_set_date',{scope:'个人信息',field:'受限出生年月',value:'2001-05-16'});
 assert.equal(precision.error.code,'date_precision_mismatch',JSON.stringify(precision));
 await call('form_activate',{scope:'个人信息',target:'受限出生年月',intent:'close'});
 const disabled=await call('form_set_date',{scope:'个人信息',field:'受限出生年月',value:'2001-02'});
 assert.equal(disabled.error.code,'constraint_violation',JSON.stringify(disabled));
 await call('form_activate',{scope:'个人信息',target:'受限出生年月',intent:'close'});
 const rejected=await call('form_set_date',{scope:'个人信息',field:'拒绝出生年月',value:'1990-01'});
 assert.notEqual(rejected.status,'verified_ui');assert.equal((await browser.evalPage('() => window.fixtureOracle()')).values.个人信息[0]['拒绝出生年月'],undefined);
 await browser.open('sd-resume');
 catalog=await call('form_observe',{mode:'overview',include_values:'state',max_bytes:80000});
 const facts={},records=[];
 const add=(section,index,values)=>{
  const id=`r${records.length}`,existing=index===0;
  const steps=Object.entries(values).map(([field,[action,value]])=>{const source_ref=`f${Object.keys(facts).length}`;facts[source_ref]={value,source:'synthetic SD contract'};return {id:source_ref,field,action,source_ref,...(field==='学校名称'?{query_from_value:true,allow_custom:true}:{})};});
  records.push({id,section,mode:existing?'existing':'new',...(existing?{binding:catalog.records.find(r=>r.scope===`${section} / 第1条`||r.scope===section).binding}:{}),steps});
 };
 for(let i=0;i<2;i++)add('实习经历',i,{'公司名称':['fill',`测试公司${i}`],'职位名称':['fill','实习生'],'工作职责':['fill',`第${i}条长文本\n`.repeat(20)],'起止时间':['date',{start:'2023-06',end:'2024-08'}]});
 for(let i=0;i<3;i++)add('教育背景',i,{'学校名称':['select','星河测试大学（虚构）'],'专业名称':['select','软件工程'],'学历':['select','本科'],'就读时间':['date',{start:'2019-09',end:'2023-06'}]});
 add('个人信息',0,{'性别':['select','女'],'最高学历':['select','硕士'],'所在地':['fill','杭州市'],'出生日期 (年龄)':['date','2001-05']});
 add('求职意向',0,{'当前薪资':['fill','8000'],'期望薪资':['fill','12000'],'期望城市':['fill','杭州']});
 add('工作经历',0,{'公司名称':['fill','虚构研究实验室'],'职位名称':['fill','研究助理'],'工作职责':['fill','研究职责\n'.repeat(30)],'起止时间':['date',{start:'2024-09',end:'2026-05'}]});
 add('项目经验',0,{'项目名称':['fill','虚构质量平台'],'职责':['fill','测试负责人'],'项目描述':['fill','项目说明\n'.repeat(25)],'项目中职责':['fill','执行职责\n'.repeat(20)],'起止时间':['date',{start:'2024-09',end:'2025-03'}]});
 add('语言能力',0,{'语言类型':['fill','英语'],'掌握程度':['select','熟练'],'听说':['select','熟练'],'读写':['select','熟练']});
 add('自我描述',0,{'自我描述':['fill','自我介绍\n'.repeat(30)]});
 add('获奖经历',0,{'奖项名称':['fill','虚构创新实践一等奖'],'获奖时间':['date','2025-05']});
 const plan={schema_version:1,page_id:browser.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'sd-contract',facts,records,test_mode:true};
 const run=await call('form_run',{action:'start',request_id:'sd-whole',plan});
 assert.equal(run.status,'completed',JSON.stringify(run));assert.deepEqual(run.counts,{verified_ui:43});
 assert.equal(run.uncertain_adds.length,0);assert.equal(run.added_records.length,3);
 const actual=(await browser.evalPage('() => window.fixtureOracle()')).values;
 assert.equal(actual.实习经历.length,2);assert.equal(actual.教育背景.length,3);
 for(let i=0;i<2;i++){assert.equal(actual.实习经历[i].公司名称,`测试公司${i}`);assert.deepEqual(actual.实习经历[i].起止时间,['2023','6','2024','8']);}
 for(const row of actual.教育背景){assert.equal(row.学校名称,'星河测试大学（虚构）');assert.equal(row.专业名称,'软件工程');assert.deepEqual(row.就读时间,['2019','9','2023','6']);}
 for(const record of records){
  const index=records.filter(r=>r.section===record.section).indexOf(record),row=actual[record.section][index];
  for(const step of record.steps){const value=facts[step.source_ref].value;
   const expected=step.action==='date'&&step.field!=='出生日期 (年龄)'?(typeof value==='string'?value.split('-'):value.start.split('-').concat(value.end.split('-'))).map((x,i)=>i%2?String(Number(x)):x):value;
   assert.deepEqual(row[step.field],expected,`${record.section}/${index}/${step.field}`);
  }
 }
 console.log(JSON.stringify({passed:true,component:'original React SD fixture, not vendor runtime',runner_ms:run.elapsed_ms,verified:43,date_groups:8,sections:9,birthday_verified:true,duplicate_records:false}));
}finally{await browser.close();}
