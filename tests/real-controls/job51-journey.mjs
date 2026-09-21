import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const b=await harness();
try{
 await b.open('job51-resume');
 const saved=dataOf(await b.profileCall('resume_profile_save',{name:'51job 虚拟跨页测试',changes:{basic:{full_name:'虚拟用户',self_description:'虚拟自我评价'},education:[{school:'虚拟学校',major:null,degree:null,expected_degree:null,education_level:'bachelor',study_mode:'full_time',start_month:'2020-09',end_month:'2024-06',is_current:false,is_expected_end:false,completed:true}]}})).profile;
 const start=dataOf(await b.call('form_journey',{action:'start',request_id:'job51-full-journey',page_id:b.pageId,profile_id:saved.id,expected_revision:saved.revision,test_mode:true}));
 assert.equal(start.status,'ready',JSON.stringify(start));
 assert.deepEqual((await b.evalPage('()=>window.fixtureOracle()')).state,{});
 let result=dataOf(await b.call('form_journey',{action:'resume',journey_id:start.journey_id}));
 while(result.status==='paused_window')result=dataOf(await b.call('form_journey',{action:'resume',journey_id:start.journey_id}));
 assert.equal(result.status,'ready_for_review',JSON.stringify(result));
 const oracle=await b.evalPage('()=>window.fixtureOracle()');
 assert.deepEqual(oracle.state,{'姓名':'虚拟用户','毕业学校':'虚拟学校','自我评价':'虚拟自我评价'});
 assert.equal(oracle.submitted,false);assert.equal(oracle.stage,2);assert.equal(result.pages.length,3);
 console.log(JSON.stringify({passed:true,pages:result.pages.length,elapsed_ms:result.elapsed_ms,submission:result.submission}));
}finally{await b.close();}
