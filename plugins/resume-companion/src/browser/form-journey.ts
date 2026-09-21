import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {FormModuleJourney} from './form-module-journey.js';
import {FormRunner} from './form-runner.js';
import {compilePlan,type PreparePolicy} from './planning/compiler.js';
import {catalogDigest,preparationSummary} from './planning/prepared-plans.js';
import type {FormEngine,RawPageForm} from './form-engine.js';
import type {Profile} from '../profile-store.js';
import {manualTasks,fieldMissing,type ManualTask} from './manual-policy.js';
import {manualCheckpoint,verifyManualCheckpoint,type ManualCheckpoint} from './manual-checkpoint.js';

type Workflow=NonNullable<RawPageForm['workflow']>;
type Summary=Record<string,any>;
interface Journey {
 id:string;owner:string;request:string;secret:Buffer;pageId:number;profileId:string;revision:number;policy:PreparePolicy;testMode:boolean;
 workflow:Workflow;application:string;created:number;status:string;controller:AbortController;working:boolean;
 pages:Array<{step:string;index:number;status:string;counts?:unknown;manual_tasks?:ManualTask[]}>;
 pending?:{from:number;to:number;dispatched:boolean};
 current?:{runner:FormRunner;runId:string;index:number;reobserve?:boolean;digest:string};
 replans?:number;
 issue?:Summary;
 manualCheckpoint?:ManualCheckpoint;
 manualPageTransition?:number;
}
const hash=(s:string)=>createHash('sha256').update(s).digest();
const manual=/(承诺|声明|授权|签署|最终提交|投递确认|确认投递|上传)/;
const sameWorkflow=(a:Workflow,b:Workflow)=>a.template===b.template&&JSON.stringify(a.steps)===JSON.stringify(b.steps);
// Pin the whole address, including the resume/application identifiers. Postbacks
// on this adapter keep the URL. The digest is process-local and never returned.
const applicationIdentity=(raw:RawPageForm)=>{const url=new URL(raw.url);url.hash='';url.searchParams.sort();return hash(url.href).toString('hex');};
function validWorkflow(raw:RawPageForm):Workflow {
 const w=raw.workflow;
 if(!w||w.family!=='job51'||!w.steps.length||w.steps.length>30||w.current<0||w.current>=w.steps.length
   ||new Set(w.steps).size!==w.steps.length||!w.heading.startsWith(w.steps[w.current]!))throw new Error('workflow_unrecognized');
 return w;
}
/** Foreground-only coordinator. Each document gets its own bounded FormRunner;
 * a dispatched transition is never replayed, including after connection loss. */
export class FormJourney {
 private runs=new Map<string,Journey>();
 private modules=new FormModuleJourney();
 get activeId():string|undefined{return [...this.runs.values()].find(j=>j.working)?.id??this.modules.activeId;}
 start(owner:string,request:string,input:{pageId:number;profileId:string;revision:number;policy:PreparePolicy;testMode:boolean},raw:RawPageForm):Summary {
  if(raw.fields.some(f=>f.plannerFamily==='guopin'))return this.modules.start(owner,request,input,raw);
  for(const [id,j] of this.runs)if(!j.working&&Date.now()-j.created>1800000)this.runs.delete(id);
  const previous=[...this.runs.values()].find(j=>j.request===request);
  if(previous){
   if(previous.owner!==owner)throw new Error('journey_access_denied');
   if(previous.pageId!==input.pageId||previous.profileId!==input.profileId||previous.revision!==input.revision||JSON.stringify(previous.policy)!==JSON.stringify(input.policy)||previous.testMode!==input.testMode)throw new Error('request_id_conflict');
   return {...this.summary(previous),replayed:true};
  }
  if(this.runs.size>=4)throw new Error('journey_capacity_exceeded');
  const workflow=validWorkflow(raw),token=randomUUID()+randomUUID();
  const j:Journey={...input,id:randomUUID(),owner,request,secret:hash(token),workflow,application:applicationIdentity(raw),created:Date.now(),status:'ready',controller:new AbortController(),working:false,pages:[]};
  this.runs.set(j.id,j);return {...this.summary(j),resume_token:token};
 }
 private get(owner:string,id:string,token?:string):Journey {
  const j=this.runs.get(id);if(!j)throw new Error('journey_expired');
  if(j.owner!==owner){if(!token||!timingSafeEqual(hash(token),j.secret))throw new Error('journey_access_denied');if(j.working)throw new Error('journey_in_progress');j.owner=owner;}
  if(Date.now()-j.created>1800000)throw new Error('journey_expired');return j;
 }
 page(owner:string,id:string,token?:string):number{return this.modules.has(id)?this.modules.page(owner,id,token):this.get(owner,id,token).pageId;}
 status(owner:string,id:string,token?:string):Summary{return this.modules.has(id)?this.modules.status(owner,id,token):this.summary(this.get(owner,id,token));}
 cancel(owner:string,id:string,token?:string):Summary {
  if(this.modules.has(id))return this.modules.cancel(owner,id,token);
  const j=this.get(owner,id,token);j.controller.abort(new Error('operation_cancelled'));j.status=j.working?'cancelling':'cancelled';
  if(j.current)j.current.runner.cancel(j.id,j.current.runId);
  return this.summary(j);
 }
 cancelOwner(owner:string):void {this.modules.cancelOwner(owner);for(const j of this.runs.values())if(j.owner===owner)this.cancel(owner,j.id);}
 clear():void {this.modules.clear();for(const j of this.runs.values())this.cancel(j.owner,j.id);this.runs.clear();}
 async execute(owner:string,id:string,engine:FormEngine,readProfile:(id:string,revision:number)=>Promise<Profile>,signal?:AbortSignal,windowMs=85000):Promise<Summary> {
  if(this.modules.has(id))return this.modules.execute(owner,id,engine,readProfile,signal,windowMs);
  const j=this.get(owner,id);
  if(j.working)throw new Error('journey_in_progress');
  if(!['ready','paused_window','cancelled'].includes(j.status)&&!(j.status==='needs_input'&&j.pending)&&!(j.status==='manual_boundary'&&j.manualCheckpoint))return this.summary(j);
  // Cancellation can interrupt a field command. Its runner must reconcile it;
  // a dispatched Next is reconciled separately before any further write.
  j.controller=new AbortController();j.working=true;j.status='working';delete j.issue;
  const abort=()=>j.controller.abort(signal?.reason??new Error('operation_cancelled'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const end=Date.now()+Math.min(windowMs,85000);
  try {
   while(Date.now()<end-2000){
    j.controller.signal.throwIfAborted();
    const profile=await readProfile(j.profileId,j.revision);
    const catalog=await engine.capturePlanning(j.pageId,j.controller.signal),w=validWorkflow(catalog.raw);
    engine.requireSupported?.(catalog.raw);
    if(!sameWorkflow(j.workflow,w)||applicationIdentity(catalog.raw)!==j.application)throw new Error('workflow_changed');
    if(j.pending){
     if(w.current===j.pending.to){j.workflow=w;delete j.pending;delete j.current;}
     else {j.status='needs_input';j.issue={code:'transition_result_unknown',from:j.pending.from,to:j.pending.to};break;}
    }
    // A dedicated declaration/upload page can require the user to operate its
    // own Next button. Accept exactly that successor, never replay the action.
    // Pages containing ordinary facts must still be rechecked in place.
    if(j.manualPageTransition===j.workflow.current&&j.manualCheckpoint?.fields.length===0&&w.current===j.workflow.current+1){
     if(!j.pages.some(p=>p.index===j.workflow.current))j.pages.push({index:j.workflow.current,step:j.workflow.steps[j.workflow.current]!,status:'user_advanced_unverified'});
     j.workflow=w;delete j.manualCheckpoint;delete j.manualPageTransition;delete j.current;
    }
    if(w.current!==j.workflow.current)throw new Error('workflow_position_changed');
    if(j.manualCheckpoint){
     if(!verifyManualCheckpoint(j.manualCheckpoint,catalog.raw))throw new Error('ordinary_fields_changed_during_manual_pause');
     if(manualTasks(catalog.raw).some(t=>t.blocks_navigation)){j.status='manual_boundary';j.issue={code:'manual_fields',tasks:manualTasks(catalog.raw)};break;}
     // User-owned changes invalidate the old binding snapshot. Reprepare from
     // live state only after verifying all previously observed ordinary values.
     delete j.manualCheckpoint;delete j.current;
    }
    const step=w.steps[w.current]!;
    const optionalUpload=w.optionalAttachment&&/上传.*附件简历/.test(step);
    if(manual.test(step)&&!optionalUpload){
     j.status='manual_boundary';j.issue={code:'manual_boundary',step,tasks:manualTasks(catalog.raw),next_action:w.current<w.steps.length-1?'user_handle_page_then_resume':'user_final_review'};
     j.manualCheckpoint=manualCheckpoint(catalog.raw);
     if(w.current<w.steps.length-1)j.manualPageTransition=w.current;
     break;
    }
    if(!j.current&&!optionalUpload){
     const compilation=compilePlan(catalog,profile,j.policy,j.testMode);
     if(compilation.recipe!=='51job/legacy-resume/v1'){j.status='needs_input';j.issue={code:'unsupported_variant'};break;}
     if(compilation.plan){
      const runner=new FormRunner(),entry=runner.start(j.id,`${j.id}:${w.current}`,compilation.plan);
      if(!entry.run_id)throw new Error('journey_plan_invalid');
      const runId=String(entry.run_id),digest=catalogDigest(catalog.raw);
      runner.markPrepared(j.id,runId);
      runner.setGuard(j.id,runId,async(raw,first)=>{await readProfile(j.profileId,j.revision);if(first&&catalogDigest(raw)!==digest)throw new Error('prepared_page_changed');});
      j.current={runner,runId,index:w.current,reobserve:Boolean(compilation.reobserve_after_execution),digest};
     }else{
      const tasks=manualTasks(catalog.raw);
      if(tasks.some(t=>t.blocks_navigation)){j.status='manual_boundary';j.issue={code:'manual_fields',tasks};j.manualCheckpoint=manualCheckpoint(catalog.raw);break;}
      const missing=catalog.raw.fields.filter(f=>f.role!=='button'&&fieldMissing(f));
      const explicitNone=compilation.dispositions.filter(d=>d.status==='explicit_none');
      if(missing.length||!explicitNone.length||compilation.dispositions.some(d=>!['explicit_none','preserved','outside_resume'].includes(d.status))){
       j.status='needs_input';j.issue={code:'no_executable_plan',...preparationSummary(compilation),missing:missing.map(f=>({scope:f.scope,field:f.label}))};break;
      }
     }
    }
    if(j.current){
     const {runner,runId}=j.current,prior=runner.status(j.id,runId);
     if(prior.status!=='ready'&&prior.status!=='completed')runner.resume(j.id,runId);
     const result=prior.status==='completed'?prior:await runner.executeWindow(j.id,runId,engine,j.controller.signal,Math.max(1,end-Date.now()-1500));
     if(result.status==='paused_window'){j.status='paused_window';break;}
     if(j.current.reobserve&&!result.error&&Array.isArray(result.results)&&result.results.length&&result.results.every((r:any)=>r.status==='verified_ui')){
      const after=await engine.captureRun(j.pageId,j.controller.signal);
      if(catalogDigest(after.raw)===j.current.digest||(j.replans??0)>=3){j.status='needs_input';j.issue={code:'conditional_form_did_not_stabilize'};break;}
      j.replans=(j.replans??0)+1;delete j.current;continue;
     }
     if(result.status!=='completed'){
      const after=(await engine.captureRun(j.pageId,j.controller.signal)).raw,tasks=manualTasks(after);
      if(!result.error&&Array.isArray(result.results)&&result.results.every((r:any)=>['verified_ui','not_exposed'].includes(r.status))&&tasks.some(t=>t.blocks_navigation)){
       j.status='manual_boundary';j.issue={code:'manual_fields',tasks,page_result:result};j.manualCheckpoint=manualCheckpoint(after);break;
      }
      j.status='needs_input';j.issue={code:'page_incomplete',page_result:result};break;
     }
     if(!j.pages.some(p=>p.index===w.current))j.pages.push({index:w.current,step,status:'verified_ui',counts:result.counts});
    }else if(!j.pages.some(p=>p.index===w.current))j.pages.push({index:w.current,step,status:optionalUpload?'optional_attachment_skipped':'explicit_none'});
    const currentRaw=(await engine.captureRun(j.pageId,j.controller.signal)).raw;
    const tasks=manualTasks(currentRaw);
    const completedPage=j.pages.find(p=>p.index===w.current);if(completedPage)completedPage.manual_tasks=tasks;
    if(tasks.some(t=>t.blocks_navigation)){j.status='manual_boundary';j.issue={code:'manual_fields',tasks};j.manualCheckpoint=manualCheckpoint(currentRaw);break;}
    if(w.current===w.steps.length-1){j.status='ready_for_review';break;}
    if(!w.next){j.status='needs_input';j.issue={code:'next_control_unavailable'};break;}
    if(Date.now()>end-5000){j.status='paused_window';break;}
    // Check the just-verified page again before a possibly saving postback.
    const before=(await engine.captureRun(j.pageId,j.controller.signal)).raw;
    if(!sameWorkflow(w,validWorkflow(before))||applicationIdentity(before)!==j.application||before.workflow!.current!==w.current)throw new Error('workflow_changed');
    if(before.validations.length||before.fields.some(f=>f.invalid||f.error||f.role!=='button'&&fieldMissing(f))){j.status='needs_input';j.issue={code:'page_validation_failed'};break;}
    j.pending={from:w.current,to:w.current+1,dispatched:true};
    // Mark before dispatch: a transport error is never permission to click twice.
    await engine.activate({pageId:j.pageId,target:'下一步',intent:'next_step',operationId:`${j.id}:next:${w.current}`,signal:j.controller.signal,testMode:j.testMode});
    const until=Math.min(end,Date.now()+7000);let advanced:Workflow|undefined;
    while(Date.now()<until){
     j.controller.signal.throwIfAborted();
     try{const nextRaw=(await engine.captureRun(j.pageId,j.controller.signal)).raw;const next=validWorkflow(nextRaw);if(applicationIdentity(nextRaw)!==j.application)throw new Error('workflow_changed');if(sameWorkflow(w,next)&&next.current===w.current+1){advanced=next;break;}}
     catch(error){if(j.controller.signal.aborted)throw error;}
     await new Promise<void>(resolve=>setTimeout(resolve,100));
    }
    if(!advanced){j.status='needs_input';j.issue={code:'transition_result_unknown',from:w.current,to:w.current+1};break;}
    j.workflow=advanced;delete j.pending;delete j.current;delete j.replans;
   }
   if(j.status==='working')j.status='paused_window';
  }catch(error){j.status=j.controller.signal.aborted?'cancelled':'needs_input';const code=error instanceof Error?error.message:'';j.issue={code:/^[a-z_]+$/.test(code)?code:'journey_execution_failed'};}
  finally{signal?.removeEventListener('abort',abort);j.working=false;}
  return this.summary(j);
 }
 private summary(j:Journey):Summary {
  return {ok:['ready','paused_window','ready_for_review'].includes(j.status),journey_id:j.id,status:j.status,page_id:j.pageId,profile_revision:j.revision,
   current_step:j.workflow.steps[j.workflow.current],current_index:j.workflow.current,steps:j.workflow.steps,pages:j.pages,
   ...(j.pending?{transition:j.pending}:{}),...(j.issue?{issue:j.issue}:{}),elapsed_ms:Date.now()-j.created,persistence:'not_verified',submission:'not_performed'};
 }
}
