import assert from 'node:assert/strict';
import {harness,dataOf} from './harness.mjs';
const b=await harness();
try {
  await b.open('ud-contract');
  const scope='教育经历 / 第1条';
  await b.call('form_activate',{page_id:b.pageId,scope,target:'已有时间 / 开始年月',intent:'open'});
  const result=dataOf(await b.call('form_set_date',{page_id:b.pageId,scope,field:'已有时间',range:{start:'2019-09',end:'2023-06'},overwrite:true}));
  assert.equal(result.status,'verified_ui',JSON.stringify(result));
  assert.deepEqual((await b.evalPage('() => window.fixtureOracle()')).values[0].已有时间,['2019-09','2023-06']);
  const unchanged=dataOf(await b.call('form_set_date',{page_id:b.pageId,scope,field:'已有时间',range:{start:'2019-09',end:'2023-06'}}));
  assert.equal(unchanged.status,'unchanged',JSON.stringify(unchanged));
  console.log(JSON.stringify({passed:true,cases:['existing range opens in year mode','already-open endpoint is not toggled closed','range replacement and reopened selected-month verification']}));
} finally {await b.close();}
