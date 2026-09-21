import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const b=await harness();const call=async(name,args)=>dataOf(await b.call(name,args));
const periods={start_month:'2020-09',end_month:'2024-06',is_current:false};
const changes={basic:{gender:'女',city:'杭州',birth_date:'2001-08-15',self_description:'虚拟资料自我描述'},education:[{school:'测试学校',major:'软件工程',education_level:'bachelor',degree:null,expected_degree:null,completed:true,study_mode:'full_time',is_expected_end:false,...periods}],experience:[{kind:'internship',organization:'虚拟公司',role:'研发实习生',facts:[{text:'实现测试功能并完成回归。'}],...periods}],projects:[{name:'项目甲',role:'开发者',facts:[],technologies:[],description:'虚拟项目甲的说明',responsibilities:'实现功能甲',...periods},{name:'项目乙',role:'维护者',facts:[],technologies:[],description:'虚拟项目乙的说明',responsibilities:'实现功能乙',...periods}],languages:[{name:'英语',overall:'熟练',speaking:'熟练',writing:'熟练'}],awards:[{name:'虚拟奖项',obtained_month:'2024-05'}]};
let seq=0;const saved=async(changes,name='自动计划虚拟测试')=>dataOf(await b.profileCall('resume_profile_save',{name,changes})).profile;
const prepare=p=>call('form_prepare',{page_id:b.pageId,profile_id:p.profile_id??p.id,expected_revision:p.profile_revision??p.revision,test_mode:true});
async function execute(p){const start=await call('form_run',{action:'start',request_id:`prepare-${++seq}`,prepared_plan_id:p.prepared_plan_id});assert.equal(start.status,'ready',JSON.stringify(start));let result=await call('form_run',{action:'resume',run_id:start.run_id});while(result.status==='paused_window')result=await call('form_run',{action:'resume',run_id:start.run_id});return result;}
try{
 const p=await saved(changes);
 await b.open('sd-resume');const before=await b.evalPage('()=>window.fixtureOracle()');
 const prepared=await prepare(p);assert.equal(prepared.status,'prepared');
 assert.deepEqual(await b.evalPage('()=>window.fixtureOracle()'),before);
 const result=await execute(prepared);
 const oracle=await b.evalPage('()=>window.fixtureOracle()');
 assert.equal(result.counts.failed??0,0,JSON.stringify(result));
 assert.equal(oracle.values['项目经验'].length,2);assert.equal(oracle.values['项目经验'][1]['项目名称'],'项目乙');
 assert.equal(oracle.values['实习经历'][0]['公司名称'],'虚拟公司');
 assert.equal(oracle.values['工作经历'].length,1);assert.deepEqual(oracle.values['工作经历'][0],{});
 assert.equal(oracle.values['个人信息'][0]['性别'],'女');
 assert.equal(oracle.values['教育背景'][0]['学校名称'],'测试学校');
 assert.equal(oracle.values['语言能力'][0]['语言类型'],'英语');
 // A calendar above its centered trigger must clear the employer's fixed header.
 await b.open('sd-resume',3);
 const birthday=await call('form_set_date',{page_id:b.pageId,scope:'个人信息',field:'出生日期 (年龄)',value:'2001-05'});
 assert.equal(birthday.ok,true,JSON.stringify(birthday));assert.equal((await b.evalPage('()=>window.fixtureOracle()')).values['个人信息'][0]['出生日期 (年龄)'],'2001-05');
 // Same ATS, different employer modules. Preparation may not create absent sections.
 await b.open('sd-resume',2);const smaller=await prepare(p);
 assert.ok(smaller.differences.some(d=>d.section==='languages'&&d.status==='no_page_section'));
 const smallerResult=await execute(smaller);assert.equal(smallerResult.counts.failed??0,0,JSON.stringify(smallerResult));
 const reduced=await b.evalPage('()=>window.fixtureOracle()');assert.deepEqual(reduced.values['语言能力'],[{}]);assert.deepEqual(reduced.values['实习经历'],[{}]);
 // A changed page is rejected before the first field write.
 await b.open('sd-resume');const stale=await prepare(p);
 await b.call('form_fill_fields',{page_id:b.pageId,scope:'个人信息',fields:[{field:'所在地',value:'南京'}]});
 const changedBefore=await b.evalPage('()=>window.fixtureOracle()');const changed=await execute(stale);
 assert.equal(changed.error?.code??changed.last_error,'prepared_page_changed',JSON.stringify(changed));
 assert.deepEqual(await b.evalPage('()=>window.fixtureOracle()'),changedBefore);
 // A profile revision change invalidates its prepared plan.
 const staleProfile=await prepare(p);
 await b.profileCall('resume_profile_save',{profile_id:p.id,expected_revision:1,changes:{basic:{city:'南京'}}});
 const revisionResult=await call('form_run',{action:'start',request_id:'old-revision',prepared_plan_id:staleProfile.prepared_plan_id});
 assert.equal(revisionResult.error?.code,'profile_changed',JSON.stringify(revisionResult));
 // Phoenix: the same facts yield separate month endpoints and catalog selection.
 const phoenix=await saved({...changes,education:[{...changes.education[0],school:'测试学校0'}]},'北森虚拟测试');
 await b.open('phoenix-resume');const ph=await prepare(phoenix);const phRun=await execute(ph);
 assert.equal(phRun.counts.failed??0,0,JSON.stringify(phRun));const phOracle=await b.evalPage('()=>window.fixtureOracle()');
 assert.equal(phOracle.values['教育经历'][0]['学校名称'],'测试学校0');
 assert.equal(phOracle.values['教育经历'][0]['开始时间'],'2020-09');
 assert.equal(phOracle.values['教育经历'][0]['结束时间'],'2024-06');
 assert.equal(phOracle.values['工作经历'][0]['公司名称'],'虚拟公司');
 // Feishu: hidden initial cards, toggle prerequisite, and an optional subsection.
 const feishu=await saved({...changes,languages:[{name:'英语',overall:'精通'}],competitions:[{name:'虚拟竞赛',description:'虚拟竞赛描述'}],certificates:[{name:'虚拟证书',issuer:'虚拟机构',obtained_month:'2024-06'}]},'飞书虚拟测试');
 await b.open('whole-resume');const fs=await prepare(feishu);const fsRun=await execute(fs);
 assert.equal(fsRun.counts.failed??0,0,JSON.stringify(fsRun));const fsOracle=await b.evalPage('()=>window.fixtureOracle()');
 assert.equal(fsOracle.values['项目经历'].length,2);assert.equal(fsOracle.values['实习经历'].length,1);
 assert.equal(fsOracle.values['实习经历'][0]['公司名称'],'虚拟公司');assert.equal(fsOracle.values['竞赛'][0]['竞赛名称'],'虚拟竞赛');
 assert.deepEqual(fsOracle.values['工作经历'],[]);assert.equal(fsOracle.values['证书'][0]['证书名称'],'虚拟证书');assert.equal(fsRun.counts.not_exposed,2,JSON.stringify(fsRun));
 console.log(JSON.stringify({passed:true,phoenix_verified:phRun.counts.verified_ui,feishu_verified:fsRun.counts.verified_ui,prepare_ms:prepared.prepare_ms,execute_ms:result.elapsed_ms,planned_steps:prepared.planned_steps,verified:result.counts.verified_ui}));
}finally{await b.close();}
