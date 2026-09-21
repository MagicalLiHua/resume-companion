import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const browser=await harness();
const call=async(name,args={})=>dataOf(await browser.call(name,args));
const observe=()=>call('form_observe',{page_id:browser.pageId,mode:'full',include_values:'state',max_bytes:80000});
const existingPlan=(catalog)=>({schema_version:1,page_id:browser.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'virtual-contract-1',
  facts:{name:{value:'整页测试姓名',source:'fixture#name'},major:{value:'整页测试专业',source:'fixture#major'}},
  records:catalog.records.map((record,index)=>({id:`education${index}`,section:'教育经历',mode:'existing',binding:record.binding,
    steps:[{id:`name${index}`,action:'fill',field:'姓名',source_ref:'name',overwrite:true},
      {id:`major${index}`,action:'fill',field:'专业',source_ref:'major',overwrite:true}]})),
  protected_fields:catalog.records.map((_,index)=>({record_id:`education${index}`,field:'手机号'}))});
try {
  await browser.open('overwrite-contract');
  let catalog=await observe();
  const plan=existingPlan(catalog);
  const malformed=structuredClone(plan);malformed.records.at(-1).steps.at(-1).source_ref='missing';
  const before=await browser.evalPage('() => window.fixtureOracle()');
  const rejected=await call('form_run',{action:'start',request_id:'invalid-plan',plan:malformed});
  assert.equal(rejected.error.code,'invalid_plan');
  assert.deepEqual(await browser.evalPage('() => window.fixtureOracle()'),before);
  const args={action:'start',request_id:'whole-existing',plan};
  const completed=await call('form_run',args);
  assert.equal(completed.status,'completed',JSON.stringify(completed));
  assert.equal(completed.counts.verified_ui,4);
  // Use the actual product default, without the harness's full diagnostic view.
  const summary=dataOf(await browser.client.callTool({name:'form_run',arguments:{action:'status',run_id:completed.run_id}}));
  assert.equal(summary.detail,'summary');assert.equal(summary.results,undefined);
  assert.equal(summary.collection_counts.results,4);assert.equal(summary.counts.verified_ui,4);
  assert.equal(summary.persistence,'not_verified');
  const detailIds=[];
  for(let offset=0;offset<4;offset++){
    const detail=dataOf(await browser.client.callTool({name:'form_run',arguments:{action:'status',run_id:completed.run_id,detail:'results',offset,limit:1,expected_report_id:summary.report_id}}));
    assert.equal(detail.total,4);assert.equal(detail.items.length,1);detailIds.push(detail.items[0].id);
  }
  assert.deepEqual(detailIds,completed.results.map(r=>r.id));
  const after=await browser.evalPage('() => window.fixtureOracle()');
  for(const row of after.values) {
    assert.equal(row.姓名,'整页测试姓名');assert.equal(row.专业,'整页测试专业');assert.equal(row.手机号,'13800001234');
  }
  const replay=await call('form_run',args);
  assert.equal(replay.replayed,true);assert.equal(replay.run_id,completed.run_id);
  assert.deepEqual(await browser.evalPage('() => window.fixtureOracle()'),after);

  await browser.open('ud-contract');catalog=await observe();
  const newPlan={schema_version:1,page_id:browser.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'virtual-contract-2',
    facts:{school:{value:'整页虚构大学',source:'fixture#school'},degree:{value:'硕士',source:'fixture#degree'},
      name:{value:'虚构自定义名称',source:'fixture#name'},dates:{value:{start:'2019-09',end:'2023-06'},source:'fixture#dates'}},
    records:Array.from({length:2},(_,i)=>({id:`new${i}`,section:'教育经历',mode:'new',steps:[
      {id:`school${i}`,action:'fill',field:'学校名称',source_ref:'school'},
      {id:`degree${i}`,action:'select',field:'学历',source_ref:'degree'},
      {id:`date${i}`,action:'date',field:'起止时间',source_ref:'dates'},
      {id:`name${i}`,action:'select',field:'竞赛名称',source_ref:'name'},
    ]}))};
  const added=await call('form_run',{action:'start',request_id:'whole-add',plan:newPlan});
  assert.equal(added.status,'partial',JSON.stringify(added));
  assert.equal(added.page_audit.invalid_fields.length,3);
  assert.equal(added.added_records.length,2);assert.equal(added.counts.verified_ui,8);
  const rows=(await browser.evalPage('() => window.fixtureOracle()')).values;
  assert.equal(rows.length,4);assert.deepEqual(rows.slice(0,2),[{},{}]);
  for(const row of rows.slice(2))assert.deepEqual(row,{学校名称:'整页虚构大学',学历:'硕士',起止时间:['2019-09','2023-06'],竞赛名称:'虚构自定义名称'});

  await browser.open('overwrite-contract');catalog=await observe();
  const controller=new AbortController();
  const cancelledArgs={action:'start',request_id:'whole-cancel',plan:existingPlan(catalog)};
  const pending=browser.call('form_run',cancelledArgs,{signal:controller.signal}).catch(()=>null);
  setTimeout(()=>controller.abort(),100);
  await pending;
  // start replay retrieves the same run; it never restarts a cancelled window.
  let stopped;
  for(let n=0;n<20;n++) {
    stopped=await call('form_run',cancelledArgs);
    if(stopped.status==='cancelled')break;
    await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(stopped.status,'cancelled',JSON.stringify(stopped));
  const snapshot=await browser.evalPage('() => window.fixtureOracle()');
  await new Promise(r=>setTimeout(r,300));
  assert.deepEqual(await browser.evalPage('() => window.fixtureOracle()'),snapshot);
  console.log(JSON.stringify({passed:true,cases:['whole-plan preflight zero side effects','existing records and protected values','idempotent replay','new records plus select/date/free name','request cancellation drains with no later writes'],new_records_ms:added.elapsed_ms}));
} finally {await browser.close();}
