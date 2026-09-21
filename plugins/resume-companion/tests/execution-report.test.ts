import {describe,expect,test} from 'vitest';
import {executionReport} from '../src/browser/execution-report.js';

function largeRun(){return {ok:false,run_id:'run',status:'partial',counts:{verified_ui:499,failed:1},elapsed_ms:1000,remaining_budget_ms:100000,persistence:'not_verified',
 results:Array.from({length:500},(_,i)=>({id:`s${i}`,record_id:`r${Math.floor(i/5)}`,field:`字段${i}`,status:i===348?'failed':'verified_ui',...(i===348?{code:'final_verification_failed'}:{})})),
 unresolved:[{record_id:'r0',field:'学院',status:'missing_information',reason:'missing_information'}],
 page_audit:{visible_fields:502,covered_fields:500,unplanned_fields:[],required_missing:[{scope:'教育',field:'学院'}],invalid_fields:[],page_error_count:0,manual_tasks:[{frame:0,scope:'个人信息',field:'是否有亲属在本公司工作',reason:'employer_relatives',required:true,state:'pending',blocks_navigation:true}]}};}
describe('bounded execution reports',()=>{
 test('counts verified protected fields separately from skipped conflicting writes',()=>{
  const raw={...largeRun(),protected_fields:[{record_id:'r0',field:'姓名',verification:'unchanged_ui'},{record_id:'r1',field:'电话',verification:'not_verified'}]};
  const summary=executionReport(raw);
  expect(summary.outcomes.protected_unchanged).toBe(1);expect(summary.outcomes.preserved).toBe(0);
  expect(summary.protected_fields).toBeUndefined();expect(summary.collection_counts.protected_fields).toBe(2);
  expect(executionReport(raw,{detail:'protected_fields'}).items).toEqual(raw.protected_fields);
 });
 test('summarizes a long resume without removing failures or overstating persistence',()=>{
  const raw=largeRun(),report=executionReport(raw);
  expect(report.results).toBeUndefined();expect(report.collection_counts.results).toBe(500);
  expect(report.counts).toEqual(raw.counts);expect(report.outcomes).toMatchObject({verified_ui:499,failed:1,manual_pending:1,missing_information:1});
  expect(report.exceptions).toContainEqual(expect.objectContaining({id:'s348',code:'final_verification_failed'}));
  expect(report.exceptions).toContainEqual(expect.objectContaining({category:'manual'}));
  expect(report.persistence).toBe('not_verified');expect(report.status).toBe('partial');
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(Buffer.byteLength(JSON.stringify(raw))/5);
  expect(raw.results).toHaveLength(500);expect(raw.page_audit.manual_tasks).toHaveLength(1);
 });
 test('pages all results exactly once and refuses a changed snapshot',()=>{
  const raw=largeRun(),id=executionReport(raw).report_id,ids:string[]=[];let offset=0;
  for(;;){const r=executionReport(raw,{detail:'results',limit:37,offset,expected_report_id:id});ids.push(...r.items.map((x:any)=>x.id));if(r.next_offset===null)break;offset=r.next_offset;}
  expect(ids).toEqual(raw.results.map(r=>r.id));
  raw.elapsed_ms++;raw.remaining_budget_ms--;expect(executionReport(raw).report_id).toBe(id);
  raw.results[348]!.status='verified_ui';
  expect(executionReport(raw,{detail:'results',offset:37,expected_report_id:id}).error.code).toBe('report_changed');
 });
 test('does not repeat journey manual tasks and retains the current page execution error',()=>{
  const run=largeRun(),tasks=run.page_audit.manual_tasks;
  const raw={journey_id:'journey',status:'manual_boundary',current_index:2,persistence:'not_verified',pages:[{index:2,step:'个人信息',manual_tasks:tasks}],issue:{code:'page_incomplete',tasks,page_result:{...run,error:{code:'form_not_supported'}}}};
  const r=executionReport(raw);
  expect(r.collection_counts.manual_tasks).toBe(1);expect(r.issue.page_result).toBeUndefined();
  expect(r.issue.execution_error).toEqual({code:'form_not_supported'});
  expect(r.pages[0].manual_tasks).toBeUndefined();expect(raw.pages[0]!.manual_tasks).toHaveLength(1);
  expect(executionReport(raw,{detail:'manual_tasks'}).items[0].page_index).toBe(2);
 });
 test('keeps explicit diagnostic compatibility and counts a truncated exception list correctly',()=>{
  const raw=largeRun();raw.page_audit.required_missing=Array.from({length:90},(_,i)=>({scope:'教育',field:`缺项${i}`}));
  const r=executionReport(raw,{limit:5});expect(r.exceptions).toHaveLength(5);expect(r.exception_count).toBe(93);expect(r.collection_counts.required_missing).toBe(90);
  expect(executionReport(raw,{detail:'full'}).results).toEqual(raw.results);
 });
});

test('module journeys page their records and include manual tasks and nested failures',()=>{
 const raw={journey_id:'j',status:'needs_input',records:[{section:'教育经历',record:'e1',status:'saved_preview_verified'},{section:'自我评价',record:'basic',status:'existing_record_preserved'}],issue:{code:'module_incomplete',result:largeRun(),manual_tasks:[{scope:'附件',field:'照片',reason:'attachment',state:'pending'}]}};
 const summary=executionReport(raw);expect(summary.records).toBeUndefined();expect(summary.issue.result).toBeUndefined();
 expect(summary.outcomes).toMatchObject({saved_preview_verified:1,existing_records_preserved:1,failed:1,manual_pending:2});
 expect(executionReport(raw,{detail:'module_records'}).items).toEqual(raw.records);
 const prior=summary.report_id;raw.records[1]!.status='saved_preview_verified';expect(executionReport(raw).report_id).not.toBe(prior);
});
