import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const b=await harness();const call=async(name,args={})=>dataOf(await b.call(name,{page_id:b.pageId,...args}));
try{
 await b.open('phoenix-resume');let catalog=await call('form_observe',{mode:'overview',include_values:'state',max_bytes:80000});
 assert.deepEqual(catalog.sections,['个人信息','教育经历','工作经历']);
 assert(catalog.records.some(r=>r.scope==='教育经历 / 第1条'));
 assert.equal(catalog.fields.find(f=>f.label==='出生日期').input_mode,'date');
 assert.equal(catalog.fields.find(f=>f.label==='性别').input_mode,'choice');
 assert(catalog.validations.some(v=>JSON.stringify(v).includes('必填信息不完整')));
 const absentSchool=await call('form_select_option',{scope:'教育经历 / 第1条',field:'学校名称',value:'不存在的学校'});assert.equal(absentSchool.error.code,'option_not_found',JSON.stringify(absentSchool));
 assert.equal((await b.evalPage('() => window.fixtureOracle()')).values.教育经历[0].学校名称,undefined);
 const occupation=await call('form_select_option',{scope:'个人信息',field:'职业目录',value:'培训生类'});assert.equal(occupation.status,'verified_ui',JSON.stringify(occupation));
 const industries=await call('form_select_option',{scope:'个人信息',field:'行业目录',values:['银行','培训生类']});assert.equal(industries.status,'verified_ui',JSON.stringify(industries));
 const cities=await call('form_select_option',{scope:'个人信息',field:'期望城市',values:['杭州市','上海市']});assert.equal(cities.status,'verified_ui',JSON.stringify(cities));
 const append=await call('form_select_option',{scope:'个人信息',field:'期望城市',values:['南京市']});assert.equal(append.status,'verified_ui',JSON.stringify(append));
 assert.deepEqual((await b.evalPage('() => window.fixtureOracle()')).values.个人信息[0].期望城市,['杭州市','上海市','南京市']);
 const protect=await call('form_select_option',{scope:'个人信息',field:'期望城市',values:['杭州市'],selection_mode:'replace'});assert.equal(protect.status,'preserved');
 const replace=await call('form_select_option',{scope:'个人信息',field:'期望城市',values:['杭州市'],selection_mode:'replace',overwrite:true});assert.equal(replace.status,'verified_ui',JSON.stringify(replace));
 const rejectedCity=await call('form_select_option',{scope:'个人信息',field:'拒绝城市',values:['杭州市']});assert.notEqual(rejectedCity.status,'verified_ui');
 const gender=await call('form_select_option',{scope:'个人信息',field:'性别',value:'女'});assert.equal(gender.status,'verified_ui',JSON.stringify(gender));
 const preserved=await call('form_select_option',{scope:'个人信息',field:'性别',value:'男'});assert.equal(preserved.status,'preserved');
 const bad=await call('form_select_option',{scope:'教育经历 / 第1条',field:'学历',value:'禁用'});assert.equal(bad.error.code,'constraint_violation',JSON.stringify(bad));
 assert.equal((await call('form_activate',{scope:'教育经历 / 第1条',target:'学历',intent:'close'})).ok,true);
 assert.equal((await call('form_activate',{scope:'教育经历 / 第1条',target:'学历',intent:'close'})).ok,true);
 const rejected=await call('form_set_date',{scope:'个人信息',field:'拒绝日期',value:'2024-05-16'});assert.notEqual(rejected.status,'verified_ui',JSON.stringify(rejected));
 await b.open('phoenix-resume');catalog=await call('form_observe',{mode:'overview',include_values:'state',max_bytes:80000});
 const facts={},records=[];
 const add=(section,index,fields)=>{const id=`r${records.length}`,steps=Object.entries(fields).map(([field,[action,value]])=>{const source_ref=`f${Object.keys(facts).length}`;facts[source_ref]={value,source:'explicit synthetic Phoenix contract'};return{id:source_ref,field,action,source_ref};});records.push({id,section,mode:index===0?'existing':'new',...(index===0?{binding:catalog.records.find(r=>r.scope===`${section} / 第1条`||r.scope===section).binding}:{}),steps});};
 add('个人信息',0,{'姓名':['fill','虚构测试'],'性别':['select','女'],'出生日期':['date','2001-05-16']});
 for(let i=0;i<3;i++)add('教育经历',i,{'学校名称':['select',`测试学校${i}`],'专业名称':['fill','软件工程'],'学历':['select',['高中','本科','硕士研究生'][i]],'开始时间':['date',`${2016+3*i}-09`],'结束时间':['date',`${2019+3*i}-06`]});
 add('工作经历',0,{'公司名称':['fill','虚构公司'],'职位名称':['fill','测试实习生'],'工作职责':['fill','独立回读长文本\n'.repeat(20)]});
 const run=await call('form_run',{action:'start',request_id:'phoenix-whole',plan:{schema_version:1,page_id:b.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'fixture',facts,records,test_mode:true}});
 assert.equal(run.counts.verified_ui,21,JSON.stringify(run));assert.equal(run.uncertain_adds.length,0);assert.equal(run.added_records.length,2);
 const actual=await b.evalPage('() => window.fixtureOracle()');assert.equal(actual.adds,2);assert.equal(actual.values.教育经历.length,3);
 for(const r of records){const index=records.filter(n=>n.section===r.section).indexOf(r);for(const step of r.steps)assert.deepEqual(actual.values[r.section][index][step.field],facts[step.source_ref].value,`${r.section}/${index}/${step.field}`);}
 assert(run.page_audit.required_missing.some(f=>f.label==='验证错误'||f.field==='验证错误'),JSON.stringify(run.page_audit));
 console.log(JSON.stringify({passed:true,verified:21,added:2,elapsed_ms:run.elapsed_ms,negative_cases:['preserve-radio','disabled-select','rollback-date','required-errors','idempotent-close','multi-add-preserves','multi-replace-permission','multi-confirm-reject','focus-restores-query','hidden-old-popup','closing-portal-retained','dictionary-school-missing'],component:'original React Phoenix fixture'}));
}finally{await b.close();}
