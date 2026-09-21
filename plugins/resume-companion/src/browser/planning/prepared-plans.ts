import {createHash,randomUUID} from 'node:crypto';
import type {FormPlan} from '../form-plan.js';
import type {RawPageForm} from '../form-engine.js';
import type {Compilation} from './compiler.js';

export function catalogDigest(raw:RawPageForm):string {
  return createHash('sha256').update(JSON.stringify({sections:raw.sections,records:raw.records,attachments:raw.attachments,fields:raw.fields.map(f=>({frame:f.frame,scope:f.scope,label:f.label,policyContext:f.policyContext,choiceGroup:f.choiceGroup,tag:f.tag,role:f.role,type:f.type,value:f.value,checked:f.checked,pendingInput:f.pendingInput,datePrecision:f.datePrecision,relatedFields:f.relatedFields,required:f.required,disabled:f.disabled,readonly:f.readonly,inputMode:f.inputMode,options:f.options,constraints:f.constraints}))})).digest('hex');
}
export interface PreparedPlan {id:string;owner:string;profileId:string;revision:number;created:number;digest:string;compilation:Compilation;plan:FormPlan;runId?:string;requestId?:string;}
/** Process-local, bounded, value-free summaries. The plan never leaves this cache. */
export class PreparedPlans {
  private entries=new Map<string,PreparedPlan>();
  constructor(private readonly clock=Date.now){}
  private prune():void {for(const [id,p] of this.entries)if(this.clock()-p.created>=600_000)this.entries.delete(id);}
  put(owner:string,profileId:string,revision:number,raw:RawPageForm,compilation:Compilation):PreparedPlan {
    this.prune();
    if(!compilation.plan)throw new Error('no_executable_plan');
    if(this.entries.size>=8)throw new Error('prepared_capacity_exceeded');
    if(Buffer.byteLength(JSON.stringify([...this.entries.values(),compilation]))>4_194_304)throw new Error('prepared_capacity_exceeded');
    const entry:PreparedPlan={id:randomUUID(),owner,profileId,revision,created:this.clock(),digest:catalogDigest(raw),compilation,plan:compilation.plan};
    this.entries.set(entry.id,entry);return entry;
  }
  get(owner:string,id:string):PreparedPlan {
    this.prune();const entry=this.entries.get(id);
    if(!entry)throw new Error('prepared_plan_expired');
    if(entry.owner!==owner)throw new Error('prepared_plan_access_denied');
    return entry;
  }
  clearOwner(owner:string):void {for(const [id,p] of this.entries)if(p.owner===owner)this.entries.delete(id);}
  clear():void {this.entries.clear();}
}
export function preparationSummary(compilation:Compilation,offset=0,limit=20):Record<string,unknown> {
  const exceptions=[...compilation.dispositions.filter(d=>!['planned','date_group_member','composite_member','protected','preserved','not_provided','explicit_none','outside_resume','current_record','site_derived'].includes(d.status)),...compilation.source_dispositions];
  const counts:Record<string,number>={};for(const d of compilation.dispositions)counts[d.status]=(counts[d.status]??0)+1;
  const profile_only_sections=[...new Set(compilation.source_dispositions.filter(d=>d.status==='no_page_section').map(d=>d.section))];
  const result={recipe:compilation.recipe,manual_tasks:compilation.manual_tasks.slice(0,20),manual_task_count:compilation.manual_tasks.length,manual_handling:"fill_ordinary_then_report",...(compilation.reobserve_after_execution?{next_action:"reprepare_after_verified_execution"}:{}),planned_records:compilation.plan?.records.length??0,deferred_steps:compilation.plan?.records.filter(r=>r.mode!=='existing').reduce((n,r)=>n+r.steps.length,0)??0,planned_steps:compilation.plan?.records.reduce((n,r)=>n+r.steps.length,0)??0,page_module_count:compilation.module_selection.length,planned_module_count:compilation.module_selection.filter(module=>module.decision==='planned').length,module_selection:compilation.module_selection,profile_only_sections,sections:compilation.sections,dispositions:counts,differences:exceptions.slice(offset,offset+limit),difference_count:exceptions.length,next_offset:offset+limit<exceptions.length?offset+limit:null};
  while(result.differences.length>1&&Buffer.byteLength(JSON.stringify(result))>12000)result.differences.pop();
  result.next_offset=offset+result.differences.length<exceptions.length?offset+result.differences.length:null;
  return result;
}
