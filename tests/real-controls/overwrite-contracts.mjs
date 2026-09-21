import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const browser=await harness();
const values={姓名:'林星遥',手机号:'13900005678',电子邮箱:'new@example.test',专业:'计算机科学',年限:'7',经历描述:'完整经历描述。\n'.repeat(20)};
try {
  await browser.open('overwrite-contract');
  const before=await browser.evalPage('() => window.fixtureOracle()');
  const result=dataOf(await browser.call('form_fill_fields',{
    page_id:browser.pageId,
    fields:Object.entries(values).map(([field,value])=>({field,value,scope:'教育经历 / 第1条',overwrite:true})),
  }));
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual((await browser.evalPage('() => window.fixtureOracle()')).values,[values,before.values[1]]);
  // This goes through the registered MCP schema and callback, not an engine mock.
  const scoped=dataOf(await browser.call('form_fill_fields',{
    page_id:browser.pageId,scope:'教育经历 / 第2条',
    fields:[{field:'姓名',value:'第二条已替换',overwrite:true},
      {field:'专业',scope:'教育经历 / 第1条',value:'第一条显式范围',overwrite:true}],
  }));
  assert.equal(scoped.ok,true,JSON.stringify(scoped));
  const final=await browser.evalPage('() => window.fixtureOracle()');
  assert.deepEqual(final.values,[{...values,专业:'第一条显式范围'},{...before.values[1],姓名:'第二条已替换'}]);
  console.log(JSON.stringify({passed:true,cases:['controlled existing values replace after focus rerender','short/long/email/tel/number replacement','record isolation','MCP top-level scope inheritance and explicit override']}));
} finally {await browser.close();}
