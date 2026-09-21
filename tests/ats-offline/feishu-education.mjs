import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { harness, dataOf } from '../real-controls/harness.mjs';

const fixtureRoot=resolve(import.meta.dirname,'../../.local-archive/offline-sites');
const browser=await harness({fixtureRoot});
const calls=[];
const call=async(name,args={})=>{
  const start=performance.now();
  const result=dataOf(await browser.call(name,{page_id:browser.pageId,test_mode:true,...args}));
  calls.push({tool:name,milliseconds:Math.round(performance.now()-start),status:result.status||result.result||result.error?.code});
  return result;
};
const observe=()=>call('form_observe',{mode:'overview',include_values:'state',max_bytes:40000});
const oracle=()=>browser.evalPage('() => window.fixtureOracle()');
try {
  await browser.open('feishu');
  const before=await oracle();
  const first=await observe();
  for(const scope of ['教育经历 / 第1条','教育经历 / 第2条']){
    const fields=first.fields.filter(f=>f.scope===scope);
    assert(fields.some(f=>f.label==='学校名称'),`Missing school in ${scope}`);
    assert.equal(fields.filter(f=>f.kind==='date_group').length,1);
  }
  const added=await call('form_activate',{target:'添加',scope:'教育经历',intent:'add_record'});
  assert.equal(added.result,'completed',JSON.stringify(added));
  const next=await observe();
  const scope='教育经历 / 第3条';
  assert(next.fields.some(f=>f.scope===scope&&f.label==='学校名称'));
  const batch=await call('form_fill_fields',{fields:[
    {field:'学校名称',scope,value:'示例科技大学'},
    {field:'学院',scope,value:'示例信息学院'},
    {field:'专业',scope,value:'计算机科学与技术'},
    {field:'实验室',scope,value:'示例计算实验室'},
    {field:'领域方向',scope,value:'软件工程'},
    {field:'导师',scope,value:'示例导师'},
  ]});
  assert(batch.results.every(r=>r.status==='filled'),JSON.stringify(batch));
  for(const [field,value] of [['学历类型','统招全日制'],['学历','本科']]) {
    const result=await call('form_select_option',{field,scope,value});
    assert.equal(result.status,'verified_ui',JSON.stringify(result));
  }
  const date=await call('form_set_date',{field:'起止时间',scope,range:{start:'2020-09',end:'2024-06'}});
  assert.equal(date.status,'verified_ui',JSON.stringify(date));
  const after=await oracle();
  for(const [key,value] of Object.entries(before.values))assert.deepEqual(after.values[key],value,`Other record changed: ${key}`);
  const newFields=after.fields.filter(f=>!before.fields.some(old=>old.id===f.id));
  const dateField=newFields.find(f=>f.label==='起止时间');
  assert.equal(after.values[`${dateField.id}:0`],'2020-09');
  assert.equal(after.values[`${dateField.id}:1`],'2024-06');
  assert.equal(after.values[`${newFields.find(f=>f.label==='学历').id}:0`],'本科');
  const happyPathCalls=calls.slice();
  const preserved=await call('form_set_date',{field:'起止时间',scope,range:{start:'2019-09',end:'2023-06'}});
  assert.equal(preserved.status,'preserved');
  const same=await call('form_set_date',{field:'起止时间',scope,range:{start:'2020-09',end:'2024-06'}});
  assert.equal(same.status,'unchanged',JSON.stringify(same));
  const ambiguous=await call('form_select_option',{field:'学历',value:'硕士'});
  assert.equal(ambiguous.error?.code,'target_ambiguous',JSON.stringify(ambiguous));
  const precision=await call('form_set_date',{field:'起止时间',scope,range:{start:'2020-09-01',end:'2024-06-01'},overwrite:true});
  assert.equal(precision.error?.code,'date_precision_mismatch',JSON.stringify(precision));
  const final=await oracle();
  assert.equal(final.values[`${dateField.id}:0`],'2020-09');
  assert.equal(final.values[`${dateField.id}:1`],'2024-06');
  const report={passed:true,scope,kind:'semantic-tools-on-captured-DOM',happy_path:happyPathCalls,regressions:['repeated-record isolation','preserve conflicts','unchanged range selection verification','unscoped ambiguity','date precision rejection']};
  await writeFile(resolve(fixtureRoot,'FEISHU-EDUCATION-RESULTS.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
