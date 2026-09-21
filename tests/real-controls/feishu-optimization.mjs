import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {harness,dataOf} from './harness.mjs';
const browser=await harness();
const scope='教育经历 / 第1条';
const results=[];
let calls=0;
const call=async(name,args={})=>{calls++;return dataOf(await browser.call(name,{page_id:browser.pageId,...args}));};
const oracle=()=>browser.evalPage('() => window.fixtureOracle()');
try {
  await browser.open('ud-contract');
  const absent=await call('form_select_option',{scope,field:'关闭等级',value:'熟练'});
  assert.equal(absent.error.code,'option_not_found');
  assert.equal(absent.generation,absent.error.generation);
  const changes=(await oracle()).changes;
  for(let i=0;i<2;i++){
    const closed=await call('form_activate',{scope,target:'关闭等级',intent:'close'});
    assert.equal(closed.ok,true,JSON.stringify(closed));assert.equal(closed.overlay,'closed');
  }
  assert.equal((await oracle()).changes,changes,'closing must not select a value');
  await browser.evalPage(`() => {const footer=document.createElement('footer');footer.innerHTML='<h2><style>.campus-test{color:red}</style>校招</h2>';document.body.append(footer);return true;}`);
  const clean=await call('form_observe',{mode:'overview'});
  assert(!clean.sections.some(s=>s.includes('campus-test')||s==='校招'));
  results.push('missing option preserves value; close is idempotent even when Escape is ignored; generation and heading metadata are clean');
  const text='负责需求分析、方案设计、开发和验证。\n'.repeat(14);
  const fields=['经历描述',...Array.from({length:13},(_,n)=>`补充描述${n+1}`)].map(field=>({field,value:text}));
  const batchArgs={scope,test_mode:true,operation_id:'optimization-batch-1',steps:[
    {action:'fill',fields:[...fields,{field:'竞赛名称',value:'全国示例竞赛'}]},
    {action:'select',field:'学历',value:'本科'},
    {action:'date',field:'起止时间',range:{start:'2020-09',end:'2024-06'}},
    {action:'select',field:'期望工作地点',values:['杭州','上海']},
  ]};
  const start=Date.now();
  const batch=await call('form_fill_fields',batchArgs);
  assert.equal(batch.status,'verified_ui',JSON.stringify(batch));
  const batchMs=Date.now()-start;
  assert.deepEqual(await call('form_fill_fields',batchArgs),batch,'transport replay must not execute again');
  const added=await call('form_activate',{scope:'教育经历',target:'添加',intent:'add_record',test_mode:true,operation_id:'optimization-add'});
  assert.equal(added.result,'completed',JSON.stringify(added));
  assert.equal(added.added_records[0].scope,'教育经历 / 第3条');
  assert(added.added_records[0].fields.some(f=>f.label==='经历描述'));
  const state=await oracle();
  for(const field of fields)assert.equal(state.values[0][field.field],text);
  assert.deepEqual(state.values[0].期望工作地点,['杭州','上海']);
  assert.deepEqual(state.values[1],{});
  assert.deepEqual(await call('form_activate',{scope:'教育经历',target:'添加',intent:'add_record',test_mode:true,operation_id:'optimization-add'}),added);
  assert.equal((await oracle()).values.length,3);
  results.push('one batch fills 14 long texts, free name, select, date and UD checkbox multiselect; add preserves state and replay creates no duplicate');
  const observed=await call('form_observe',{mode:'full',include_values:'needed',max_bytes:80000,include_test_ledger:true});
  assert.equal(observed.fields.find(f=>f.scope===scope&&f.label==='竞赛名称').state,'filled');
  const errors=observed.fields.filter(f=>f.error);
  assert.equal(errors.length,3);
  assert(errors.every(f=>f.scope==='教育经历 / 第2条'&&f.invalid));
  assert.equal(observed.validations.length,3);
  assert.equal(observed.test_ledger,undefined);
  assert(observed.test_run.total_operations>=6);
  results.push('free name reads filled; all three errors retain record identity; default ledger is summary only');
  const search=await call('form_fill_fields',{fields:[{field:'候选搜索',scope,value:'未选择的搜索词'}]});
  assert.equal(search.results[0].status,'postcondition_failed');
  const missing=await call('form_select_option',{field:'期望工作地点',scope,values:['南京']});
  assert.equal(missing.error.code,'option_not_found',JSON.stringify(missing));
  assert(missing.error.candidates.some(c=>c.label==='杭州'));
  const disabled=await call('form_select_option',{field:'期望工作地点',scope,values:['禁用城市']});
  assert.equal(disabled.error.code,'constraint_violation',JSON.stringify(disabled));
  results.push('uncommitted search remains blank; missing and disabled UD candidates return evidence');
  await browser.call('press_key',{pageId:browser.pageId,key:'Escape'});
  const noop=await call('form_activate',{scope:'教育经历',target:'无效添加',intent:'add_record'});
  assert.equal(noop.result,'action_result_unknown');
  results.push('unrelated rerender is not a successful add');
  await browser.evalPage(`() => {const e=document.createElement('div');e.id='fixture-cover';e.style.cssText='position:fixed;inset:0;z-index:9999;background:transparent';document.body.append(e);return true;}`);
  const blocked=await call('form_activate',{scope:'教育经历',target:'添加',intent:'add_record'});
  assert.equal(blocked.error.code,'target_obscured',JSON.stringify(blocked));
  assert.equal((await oracle()).values.length,3);
  await browser.evalPage(`() => {document.getElementById('fixture-cover').remove();return true;}`);
  results.push('covered add never dispatches a click');
  const partial=await call('form_fill_fields',{scope:'教育经历 / 第3条',steps:[
    {action:'fill',fields:[{field:'学校名称',value:'测试大学'}]},
    {action:'select',field:'学历',value:'不存在的学历'},
    {action:'fill',fields:[{field:'经历描述',value:'不应该执行'}]},
  ]});
  assert.equal(partial.status,'partial');assert.equal(partial.results.length,2);assert.equal(partial.remaining_steps[0].index,2);
  assert.equal((await oracle()).values[2].经历描述,undefined);
  results.push('failed dependency stops successor and reports exact completed prefix');
  await browser.open('ud-contract');
  const controller=new AbortController();
  const pending=browser.call('form_fill_fields',{page_id:browser.pageId,scope,operation_id:'cancel-record-batch',steps:[
    {action:'fill',fields}, {action:'fill',fields:[{field:'学校名称',value:'禁止延迟执行'}]},
  ]},{signal:controller.signal}).catch(()=>null);
  setTimeout(()=>controller.abort(),180);
  await pending;
  await call('form_observe',{mode:'overview'});
  const cancelled=await oracle();
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal((await oracle()).changes,cancelled.changes);
  assert.equal((await oracle()).values[0].学校名称,undefined);
  results.push('cancelled batch drains in-flight input and never dispatches successors');
  await browser.open('ud-contract');
  const replaced=await call('form_fill_fields',{scope,steps:[{action:'fill',fields:[{field:'替换记录',value:'replace'}]}]});
  assert.equal(replaced.status,'partial',JSON.stringify(replaced));
  assert.equal(replaced.record_unchanged,false);
  results.push('record replacement during the last step prevents a verified batch');
  await browser.open('ud-contract');
  const catalog=await call('form_observe',{mode:'full',max_bytes:80000});
  const addRef=catalog.fields.find(f=>f.label==='添加'&&f.scope==='教育经历').ref;
  await call('form_activate',{scope:'教育经历',target:'无效添加',intent:'add_record'});
  const rebound=await call('form_activate',{scope:'教育经历',target:addRef,intent:'add_record',operation_id:'rebound-add'});
  assert.equal(rebound.result,'completed',JSON.stringify(rebound));
  assert.equal((await oracle()).values.length,3);
  results.push('stale add-button reference rebinds once within its original scope before dispatch');
  const report={passed:true,framework:'React 18; original fixture, not original UD package',batch_ms:batchMs,browser_calls:calls,results};
  await mkdir('.local-archive/offline-sites',{recursive:true});
  await writeFile('.local-archive/offline-sites/FEISHU-OPTIMIZATION-RESULTS.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
