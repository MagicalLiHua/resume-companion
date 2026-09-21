// Manual acceptance helper. Connecting a newer launcher upgrades the persistent
// browser process; run only after the user has approved that browser restart.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '../../plugins/resume-companion/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../../plugins/resume-companion/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
if(!process.argv.includes('--restart-approved'))throw Error('Live acceptance requires explicit user approval to restart the dedicated browser.');
const plugin=resolve(import.meta.dirname,'../../plugins/resume-companion');
const client=new Client({name:'feishu-live-acceptance',version:'0.19.0'});
// Preserve TMPDIR so this client connects to the same Supervisor socket as Codex.
const transport=new StdioClientTransport({command:process.execPath,args:['chrome-launcher.bundle.mjs'],cwd:plugin,env:{...process.env},stderr:'pipe'});
const report={version:'0.19.0',source:'https://jobs.bytedance.com/campus/resume/edit',passed:false,submitted:false,cleanup:false,calls:[]};
const runId=randomUUID();
let pageId,added=false,baseline,generation,addAttempted=false;
const text=result=>(result.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
const raw=async(name,args)=>{
  const result=await client.callTool({name,arguments:args},undefined,{timeout:90000});
  if(result.isError)throw Error(`${name}: ${text(result).slice(0,1500)}`);
  return result;
};
const evaluate=async functionCode=>{
  const result=await raw('evaluate_script',{pageId,function:functionCode,waitForStableDom:false});
  if(result.isError)throw Error('live DOM check failed');
  return JSON.parse(text(result).match(/```json\s*([\s\S]*?)\s*```/)[1]);
};
const call=async(name,args)=>{
  const start=performance.now();const result=await client.callTool({name,arguments:{page_id:pageId,test_mode:true,
    ...(name==='form_observe'?{}:{operation_id:`${runId}-${report.calls.length}`,expected_generation:generation}),...args}},undefined,{timeout:90000});
  const data=result.structuredContent??JSON.parse(text(result));
  if(Number.isInteger(data.generation))generation=data.generation;
  report.calls.push({tool:name,milliseconds:Math.round(performance.now()-start),status:data.status||data.result||data.error?.code||(name==='form_observe'?'observed':data.ok?'completed':'unknown'),phase:data.phase||data.error?.phase,
    ...(Array.isArray(data.results)?{fields:data.results.map(r=>({status:r.status,code:r.error?.code}))}:{})});
  console.log(JSON.stringify(report.calls.at(-1)));
  if(result.isError)throw Error(`${name}: ${JSON.stringify(data.error)}`);
  return data;
};
// Values stay inside the browser; only a digest leaves this verification read.
const fingerprint=limit=>evaluate(`async () => {
 const title=[...document.querySelectorAll('.applyFormModuleWrapper-title')].find(e=>e.textContent.trim()==='教育经历');
 if(!title)return null;
 const cards=[...title.parentElement.parentElement.querySelectorAll('[class*=apply-form-array-card__]')];
 const values=cards.slice(0,${limit??'cards.length'}).map(card=>[...card.querySelectorAll('input,textarea,.ud__select__selector__selectItem')].map(e=>e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement?e.value:e.textContent));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values)));
 const loaded=cards.length>0&&cards.every(card=>Boolean(card.querySelector('[data-form-field-i18n-name="学校名称"] input')?.value.trim()));
 return {count:cards.length,loaded,digest:[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')};
}`);
try{
  await client.connect(transport);
  await raw('list_pages',{});
  const pages=await raw('new_page',{url:report.source,background:false});
  pageId=Number(text(pages).split('\n').find(line=>line.includes('[selected]'))?.match(/^(\d+):/)?.[1]);
  assert(pageId,'Could not open the live resume page');
  await raw('list_pages',{});
  await raw('select_page',{pageId,bringToFront:false});
  for(let attempt=0;attempt<20;attempt++){
    baseline=await fingerprint();if(baseline?.loaded)break;
    await new Promise(r=>setTimeout(r,300));
  }
  assert(baseline?.loaded,'Manual login, resume loading or a saved education record with a school is required');
  report.baseline_records=baseline.count;
  await call('form_observe',{mode:'overview',include_values:'state',max_bytes:40000});
  addAttempted=true;
  const activation=await call('form_activate',{target:'添加',scope:'教育经历',intent:'add_record'});
  const afterAdd=await fingerprint();added=afterAdd.count===baseline.count+1;
  report.records_after_add=afterAdd.count;
  assert(added&&activation.result==='completed','Add record did not complete');
  const observation=await call('form_observe',{mode:'overview',include_values:'state',max_bytes:40000});
  const scope=`教育经历 / 第${baseline.count+1}条`;
  assert(observation.fields.some(f=>f.scope===scope&&f.label==='学校名称'),'New record scope missing');
  const filled=await call('form_fill_fields',{fields:[
    {field:'学校名称',scope,value:'北京大学'},
    {field:'学院',scope,value:'测试学院'},
    {field:'专业',scope,value:'计算机科学与技术'},
    {field:'实验室',scope,value:'临时验收测试'},
    {field:'领域方向',scope,value:'软件工程'},
    {field:'导师',scope,value:'测试导师'},
  ]});
  assert(filled.results.every(r=>['filled','unchanged'].includes(r.status)),'Text batch did not verify');
  for(const [field,value] of [['学历类型','统招全日制'],['学历','本科']]){
    const result=await call('form_select_option',{field,scope,value});
    assert(['verified_ui','unchanged'].includes(result.status),`${field} did not verify`);
  }
  const date=await call('form_set_date',{field:'起止时间',scope,range:{start:'2020-09',end:'2024-06'}});
  assert(['verified_ui','unchanged'].includes(date.status),'Month range did not verify');
  report.final_values_verified=await evaluate(`() => {
    const title=[...document.querySelectorAll('.applyFormModuleWrapper-title')].find(e=>e.textContent.trim()==='教育经历');
    const card=title.parentElement.parentElement.querySelectorAll('[class*=apply-form-array-card__]')[${baseline.count}];
    const expected={'学校名称':'北京大学','学院':'测试学院','专业':'计算机科学与技术','实验室':'临时验收测试','领域方向':'软件工程','导师':'测试导师','学历类型':'统招全日制','学历':'本科','起止时间':['2020-09','2024-06']};
    return Object.entries(expected).every(([label,value])=>{
      const field=[...card.querySelectorAll('.ud-formily-item')].find(e=>e.getAttribute('data-form-field-i18n-name')===label);
      if(!field)return false;
      const selected=field.querySelector('.ud__select__selector__selectItem');
      const inputs=[...field.querySelectorAll('input')].map(e=>e.value);
      return Array.isArray(value)?JSON.stringify(inputs)===JSON.stringify(value):(selected?.textContent.trim()??inputs[0])===value;
    });
  }`);
  assert(report.final_values_verified,'Final record values changed after later field operations');
  assert.equal((await fingerprint(baseline.count)).digest,baseline.digest,'An existing record changed');
  report.passed=true;
}catch(error){
  report.error=String(error.message||error);process.exitCode=1;
  if(added) {
    // Inspect only the synthetic record; never persist existing resume values.
    try { console.log('Synthetic record diagnostic:',JSON.stringify(await evaluate(`() => {
      const title=[...document.querySelectorAll('.applyFormModuleWrapper-title')].find(e=>e.textContent.trim()==='教育经历');
      const record=title.parentElement.parentElement.querySelectorAll('[class*=apply-form-array-card__]')[${baseline.count}];
      const fields=[...record.querySelectorAll('.ud-formily-item')].filter(e=>['学历类型','学历'].includes(e.getAttribute('data-form-field-i18n-name')));
      return fields.map(e=>({label:e.getAttribute('data-form-field-i18n-name'),selected:Boolean(e.querySelector('.ud__select__selector__selectItem')?.textContent),expanded:e.querySelector('.ud__select')?.classList.contains('ud__select-open'),invalid:e.querySelector('input')?.getAttribute('aria-invalid')}));
    }`))); }catch{}
  }
}
finally{
  if(pageId&&baseline&&addAttempted){
    try{
      const same=(await fingerprint(baseline.count)).digest===baseline.digest;
      // This helper owns a fresh page loaded from saved data. Reload discards
      // only its unsaved test edits without clicking a site's delete control.
      await raw('navigate_page',{pageId,type:'reload'});
      await raw('list_pages',{});
      let after;
      for(let attempt=0;attempt<30;attempt++){
        after=await fingerprint();if(after?.count===baseline.count&&after?.digest===baseline.digest)break;
        await new Promise(r=>setTimeout(r,300));
      }
      report.records_unchanged=same;
      report.records_after_cleanup=after?.count;
      report.cleanup=after?.count===baseline.count&&after?.digest===baseline.digest;
    }catch{report.cleanup=false;}
    if(!report.cleanup){report.passed=false;process.exitCode=1;}
  }
  await client.close().catch(()=>{});
  await writeFile(resolve(import.meta.dirname,'../../.local-archive/offline-sites/FEISHU-LIVE-RESULTS.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
