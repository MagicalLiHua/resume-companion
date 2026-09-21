import {createHash} from 'node:crypto';

type Data=Record<string,any>;
export const reportDetails=['summary','results','module_records','protected_fields','unresolved','manual_tasks','unplanned_fields','required_missing','invalid_fields','added_records','unassigned_created_records','uncertain_adds','pages','workflow_steps','full'] as const;
export interface ReportOptions {detail?:typeof reportDetails[number];offset?:number;limit?:number;expected_report_id?:string;}
const array=(value:unknown):any[]=>Array.isArray(value)?value:[];
/** Presentation only: the runner/journey keeps its complete execution state.
 * Counts always refer to full collections, never the displayed slice. */
export function executionReport(data:Data,options:ReportOptions={}):Data {
  if(!data.run_id&&!data.journey_id)return data;
  const main=data.issue?.page_result??data.issue?.result??data,audit=main.page_audit??{};
  const manual=new Map<string,Data>();
  const addManual=(tasks:any[],pageIndex?:number)=>{for(const task of tasks){
    const item={...task,...(pageIndex!==undefined?{page_index:pageIndex}:{})};
    manual.set(JSON.stringify([pageIndex,task.frame,task.scope,task.field,task.reason]),item);
  }};
  for(const page of array(data.pages))addManual(array(page.manual_tasks),page.index);
  addManual(array(audit.manual_tasks),data.current_index);addManual(array(data.issue?.tasks),data.current_index);
  addManual(array(data.issue?.manual_tasks),data.current_index);
  const pages=array(data.pages).map(({manual_tasks,...page})=>page);
  const collections:Record<string,any[]>={
    results:array(main.results),protected_fields:array(main.protected_fields),unresolved:array(main.unresolved),manual_tasks:[...manual.values()],
    unplanned_fields:array(audit.unplanned_fields),required_missing:array(audit.required_missing),invalid_fields:array(audit.invalid_fields),
    added_records:array(main.added_records),unassigned_created_records:array(main.unassigned_created_records),uncertain_adds:array(main.uncertain_adds),
    pages,module_records:array(data.records),workflow_steps:array(data.steps).map((step,index)=>({index,step})),
  };
  const collection_counts=Object.fromEntries(Object.entries(collections).map(([key,rows])=>[key,rows.length]));
  const report_id=createHash('sha256').update(JSON.stringify({id:data.run_id??data.journey_id,status:data.status,error:data.error,issue:data.issue?.code,counts:main.counts,collections})).digest('hex').slice(0,24);
  const detail=options.detail??'summary',offset=Math.max(0,options.offset??0),limit=Math.min(50,Math.max(1,options.limit??20));
  if(options.expected_report_id&&options.expected_report_id!==report_id)return {ok:false,error:{code:'report_changed',message:'执行状态已变化，请先读取最新摘要，再按新 report_id 继续读取详情。'},run_id:data.run_id,journey_id:data.journey_id,report_id};
  // Explicit compatibility/diagnostic view; normal Agent calls never need it.
  if(detail==='full')return {...data,report_id,detail:'full'};
  const out:Data={...data,report_id,detail,detail_scope:data.journey_id?'current_page_and_journey_manual_tasks':'run',collection_counts};
  for(const key of ['results','records','protected_fields','unresolved','added_records','unassigned_created_records','uncertain_adds','steps','page_audit'])delete out[key];
  if(data.pages)out.pages=pages;
  if(data.issue){out.issue={...data.issue};delete out.issue.page_result;delete out.issue.result;delete out.issue.tasks;delete out.issue.manual_tasks;if(main!==data&&main.error)out.issue.execution_error=main.error;}
  if(main.counts)out.counts=main.counts;
  if(main.page_audit)out.page_audit={visible_fields:audit.visible_fields,covered_fields:audit.covered_fields,page_error_count:audit.page_error_count,
    unplanned_field_count:collections.unplanned_fields!.length,required_missing_count:collections.required_missing!.length,invalid_field_count:collections.invalid_fields!.length,manual_task_count:collections.manual_tasks!.length};
  out.outcomes={
    verified_ui:main.counts?.verified_ui??0,preserved:main.counts?.preserved??0,not_exposed:main.counts?.not_exposed??0,
    protected_unchanged:collections.protected_fields!.filter(row=>row.verification==='unchanged_ui').length,
    missing_information:collections.unresolved!.filter(row=>row.status==='missing_information').length,
    unsupported:collections.unresolved!.filter(row=>/unmapped|unsupported/.test(row.reason??'')).length,
    manual_pending:collections.manual_tasks!.filter(row=>row.state!=='already_present').length,
    manual_already_present:collections.manual_tasks!.filter(row=>row.state==='already_present').length,
    failed:main.counts?.failed??0,uncertain:(main.counts?.unknown??0)+collections.uncertain_adds!.length,
    saved_preview_verified:collections.module_records!.filter(row=>row.status==='saved_preview_verified').length,
    existing_records_preserved:collections.module_records!.filter(row=>row.status==='existing_record_preserved').length,
  };
  if(detail!=='summary'){
    const rows=collections[detail]??[];
    out.items=rows.slice(offset,offset+limit);out.total=rows.length;out.offset=offset;
    while(out.items.length>1&&Buffer.byteLength(JSON.stringify(out))>16000)out.items.pop();
    out.next_offset=offset+out.items.length<rows.length?offset+out.items.length:null;
    return out;
  }
  const exceptions=[
    ...collections.results!.filter(row=>!['verified_ui','preserved','not_exposed','pending'].includes(row.status)).map(item=>({category:'execution',...item})),
    ...collections.manual_tasks!.filter(row=>row.state!=='already_present').map(item=>({category:'manual',...item})),
    ...collections.unresolved!.filter(row=>row.status!=='keep_existing').map(item=>({category:'unresolved',...item})),
    ...collections.invalid_fields!.map(item=>({category:'invalid',...item})),
    ...collections.required_missing!.map(item=>({category:'required_missing',...item})),
  ];
  out.exceptions=exceptions.slice(0,Math.min(limit,20));out.exception_count=exceptions.length;
  while(out.exceptions.length>1&&Buffer.byteLength(JSON.stringify(out))>16000)out.exceptions.pop();
  while(out.pages?.length>1&&Buffer.byteLength(JSON.stringify(out))>16000)out.pages.pop();
  out.returned_exception_count=out.exceptions.length;
  out.details_hint='Use action=status with detail, offset, limit and expected_report_id. Counts cover full collections; exceptions can describe the same field from different checks.';
  return out;
}
