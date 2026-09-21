import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const browser=await harness();
const call=async(name,args={})=>dataOf(await browser.call(name,args));
const peer=await browser.connectPeer();
const other=async(name,args={})=>dataOf(await peer.call(name,args));
async function prepare(requestId) {
  await browser.open('overwrite-contract');
  const catalog=await call('form_observe',{page_id:browser.pageId,mode:'full',include_values:'state',max_bytes:80000});
  const plan={schema_version:1,page_id:browser.pageId,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'lifecycle',
    facts:{name:{value:'取消测试姓名',source:'fixture'},major:{value:'取消测试专业',source:'fixture'}},
    records:catalog.records.map((record,index)=>({id:`r${index}`,section:'教育经历',mode:'existing',binding:record.binding,steps:[
      {id:`name${index}`,action:'fill',field:'姓名',source_ref:'name',overwrite:true},
      {id:`major${index}`,action:'fill',field:'专业',source_ref:'major',overwrite:true}]}))};
  const entry=await call('form_run',{action:'start',request_id:requestId,plan,defer_execution:true});
  assert.equal(entry.status,'ready');assert.ok(entry.resume_token);
  return {entry,plan};
}
async function working(entry) {
  for(let attempt=0;attempt<30;attempt++) {
    const status=await other('form_run',{action:'status',run_id:entry.run_id,resume_token:entry.resume_token});
    if(status.status==='working')return status;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('run never entered working state');
}
try {
  let {entry,plan}=await prepare('lifecycle-cancel');
  const forbidden=await other('form_run',{action:'status',run_id:entry.run_id});
  assert.match(JSON.stringify(forbidden),/run_access_denied/);
  const pending=call('form_run',{action:'resume',run_id:entry.run_id});
  await working(entry);
  const replay=await call('form_run',{action:'start',request_id:'lifecycle-cancel',plan});
  assert.equal(replay.run_id,entry.run_id);assert.equal(replay.replayed,true);
  const cancelled=await other('form_run',{action:'cancel',run_id:entry.run_id,resume_token:entry.resume_token});
  assert.ok(['cancelling','cancelled'].includes(cancelled.status));
  assert.equal((await pending).status,'cancelled');
  let stable=await browser.evalPage('() => window.fixtureOracle()');
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.deepEqual(await browser.evalPage('() => window.fixtureOracle()'),stable);

  ({entry}=await prepare('lifecycle-takeover'));
  const taken=call('form_run',{action:'resume',run_id:entry.run_id});
  await working(entry);
  await other('browser_takeover');
  assert.equal((await taken).status,'cancelled');
  const state=await other('form_run',{action:'status',run_id:entry.run_id,resume_token:entry.resume_token});
  assert.equal(state.error.code,'lease_revoked');
  await call('browser_takeover');

  ({entry}=await prepare('lifecycle-disconnect'));
  const disconnected=call('form_run',{action:'resume',run_id:entry.run_id}).catch(()=>null);
  await working(entry);
  await browser.client.close();
  await disconnected;
  await other('browser_takeover');
  const recovered=await other('form_run',{action:'status',run_id:entry.run_id,resume_token:entry.resume_token});
  assert.equal(recovered.status,'cancelled');
  const resumed=await other('form_run',{action:'resume',run_id:entry.run_id,resume_token:entry.resume_token});
  assert.ok(['completed','partial'].includes(resumed.status),JSON.stringify(resumed));
  assert.equal(resumed.run_id,entry.run_id);
  console.log(JSON.stringify({passed:true,cases:['recovery credential before writes','cross-session isolation','status/cancel while working','idempotent start during execution','lease takeover drains','connection close stops and explicit credential resumes']}));
} finally {await browser.close();}
