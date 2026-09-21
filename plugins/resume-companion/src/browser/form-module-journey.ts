import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {manualCheckpoint,verifyManualCheckpoint,type ManualCheckpoint} from './manual-checkpoint.js';
import {FormRunner} from './form-runner.js';
import {compilePlan,type PreparePolicy} from './planning/compiler.js';
import {recipes} from './planning/recipes.js';
import {normalizeProfile,resolveFact} from '../profile-facts.js';
import {manualReason,manualTasks,fieldMissing} from './manual-policy.js';
import type {FormEngine,RawPageForm,RawField} from './form-engine.js';
import type {Profile} from '../profile-store.js';

type Input={pageId:number;profileId:string;revision:number;policy:PreparePolicy;testMode:boolean};
type Summary=Record<string,any>;
type Target={section:string;source:string;record:string};
interface ModuleRun extends Input {
 id:string;owner:string;request:string;secret:Buffer;created:number;application:string;status:string;working:boolean;controller:AbortController;
 initialSections:string[];done:Array<Target&{status:string}>;issue?:Summary;manualCheckpoint?:ManualCheckpoint;
 current?:{runner:FormRunner;runId:string;target:Target;scope:string};
 pending?:{kind:'open'|'save';section:string;target?:Target;before:string[];anchors:Array<{label:string;value:string}>};
}
const hash=(s:string)=>createHash('sha256').update(s).digest();
const button=(f:RawField)=>f.tag==='button'||f.role==='button';
const fields=(raw:RawPageForm,section:string)=>raw.fields.filter(f=>(f.scope===section||f.scope.startsWith(section+' / 第'))&&!button(f));
const editable=(raw:RawPageForm,section:string)=>fields(raw,section).filter(f=>!f.disabled&&!manualReason(f)&&raw.fields.some(b=>button(b)&&(b.label==='保存'||section==='资格证书'&&b.label==='确定')&&b.scope===f.scope));
const identity=(raw:RawPageForm)=>{const u=new URL(raw.url);u.hash='';u.searchParams.sort();return hash(u.href).toString('hex');};
const recipe=recipes.find(r=>r.family==='guopin')!;
const key=(t:Target)=>`${t.section}:${t.source}:${t.record}`;
const locationPreview=(value:string)=>{
 const path=value.split(' / ');
 // Observed Guopin municipality preview; other unverified abbreviations are
 // deliberately left unmatched instead of accepting a loosely similar city.
 if(path[0]==='中国'&&path[1]==='上海'&&path[2]==='上海')return ['上海市',...path.slice(3)].join('-');
 return path.filter(v=>v!=='中国').join('-');
};
const anchors=(raw:RawPageForm,scope:string)=>{
 const intent=scope==='求职意向'||scope.startsWith('求职意向 / 第');
 const labels=intent?['期望职位','工作地区','期望行业','薪资要求']:['项目名称','单位名称','职位名称','学校名称','起止时间','在职时间','就读年月','自我评价','证书名称'];
 const result=raw.fields.filter(f=>f.scope===scope&&labels.includes(f.label)&&f.value).map(f=>({label:f.label,value:!intent?f.value:f.label==='工作地区'?locationPreview(f.value):['期望职位','期望行业'].includes(f.label)?f.value.split(' / ').at(-1)!:f.value}));
 if(intent){const salary=['最低','最高'].map(s=>raw.fields.find(f=>f.scope===scope&&f.label===`薪资要求（元/月） / ${s}`)?.value);if(salary.every(Boolean))result.push({label:'薪资要求',value:`${salary[0]!.replace(/K$/,'')}-${salary[1]}`});}
 return result;
};
const previewScopes=(raw:RawPageForm,section:string)=>[...new Set(fields(raw,section).filter(f=>f.disabled&&f.value).map(f=>f.scope))];
const matchingPreview=(raw:RawPageForm,section:string,wanted:Array<{label:string;value:string}>)=>previewScopes(raw,section).filter(scope=>wanted.length>0&&wanted.every(a=>anchors(raw,scope).some(f=>f.label===a.label&&f.value.replace(/\s+/g,' ').trim()===a.value.replace(/\s+/g,' ').trim())));

/** Guopin opens one editor at a time. Save/open dispatch is never replayed.
 * Existing saved records are preserved; this coordinator only claims verified
 * writes and an observed saved preview, never server persistence or submission. */
export class FormModuleJourney {
 private runs=new Map<string,ModuleRun>();
 has(id:string):boolean{return this.runs.has(id);}
 get activeId():string|undefined{return [...this.runs.values()].find(j=>j.working)?.id;}
 start(owner:string,request:string,input:Input,raw:RawPageForm):Summary {
  const u=new URL(raw.url);
  if(u.protocol!=='https:'||u.hostname!=='c.iguopin.com'||u.pathname!=='/resume'||!u.searchParams.get('id'))throw new Error('workflow_unrecognized');
  for(const [id,j] of this.runs)if(!j.working&&Date.now()-j.created>1800000)this.runs.delete(id);
  const previous=[...this.runs.values()].find(j=>j.request===request);
  if(previous){if(previous.owner!==owner)throw new Error('journey_access_denied');if(JSON.stringify([previous.pageId,previous.profileId,previous.revision,previous.policy,previous.testMode])!==JSON.stringify([input.pageId,input.profileId,input.revision,input.policy,input.testMode]))throw new Error('request_id_conflict');return {...this.summary(previous),replayed:true};}
  if(this.runs.size>=4)throw new Error('journey_capacity_exceeded');
  const token=randomUUID()+randomUUID();
  const j:ModuleRun={...input,id:randomUUID(),owner,request,secret:hash(token),created:Date.now(),application:identity(raw),status:'ready',working:false,controller:new AbortController(),initialSections:recipe.sections.flatMap(r=>r.sections.filter(section=>previewScopes(raw,section).length>0)),done:[]};
  this.runs.set(j.id,j);return {...this.summary(j),resume_token:token};
 }
 private get(owner:string,id:string,token?:string):ModuleRun {
  const j=this.runs.get(id);if(!j||Date.now()-j.created>1800000)throw new Error('journey_expired');
  if(j.owner!==owner){if(!token||!timingSafeEqual(hash(token),j.secret))throw new Error('journey_access_denied');if(j.working)throw new Error('journey_in_progress');j.owner=owner;}return j;
 }
 page(owner:string,id:string,token?:string):number{return this.get(owner,id,token).pageId;}
 status(owner:string,id:string,token?:string):Summary{return this.summary(this.get(owner,id,token));}
 cancel(owner:string,id:string,token?:string):Summary {const j=this.get(owner,id,token);j.controller.abort(new Error('operation_cancelled'));j.current?.runner.cancel(j.id,j.current.runId);j.status=j.working?'cancelling':'cancelled';return this.summary(j);}
 cancelOwner(owner:string):void{for(const j of this.runs.values())if(j.owner===owner)this.cancel(owner,j.id);}
 clear():void{for(const j of this.runs.values())this.cancel(j.owner,j.id);this.runs.clear();}
 async execute(owner:string,id:string,engine:FormEngine,readProfile:(id:string,revision:number)=>Promise<Profile>,signal?:AbortSignal,windowMs=85000):Promise<Summary>{
  const j=this.get(owner,id);if(j.working)throw new Error('journey_in_progress');
  if(!['ready','paused_window','cancelled','manual_boundary'].includes(j.status)&&!j.pending)return this.summary(j);
  j.controller=new AbortController();j.working=true;j.status='working';delete j.issue;
  const abort=()=>j.controller.abort(signal?.reason??new Error('operation_cancelled'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const end=Date.now()+Math.min(windowMs,85000);
  try{while(Date.now()<end-2500){
   j.controller.signal.throwIfAborted();
   const profile=await readProfile(j.profileId,j.revision);
   if(profile.profile_id!==j.profileId||profile.revision!==j.revision)throw new Error('profile_revision_changed');
   let c=await engine.capturePlanning(j.pageId,j.controller.signal);engine.requireSupported?.(c.raw);
   if(identity(c.raw)!==j.application)throw new Error('workflow_changed');
   if(c.raw.authenticationRequired){j.status='manual_boundary';j.issue={code:'authentication_required'};break;}
   if(j.manualCheckpoint){if(!verifyManualCheckpoint(j.manualCheckpoint,c.raw))throw new Error('ordinary_fields_changed_during_manual_pause');delete j.manualCheckpoint;delete j.current;}
   if(j.pending){
    const p=j.pending;
    const waitingUntil=Math.min(end-500,Date.now()+5000);
    while(Date.now()<waitingUntil&&(p.kind==='open'?!editable(c.raw,p.section).length:editable(c.raw,p.section).length||!matchingPreview(c.raw,p.section,p.anchors).length)){
     await new Promise(resolve=>setTimeout(resolve,100));j.controller.signal.throwIfAborted();c=await engine.capturePlanning(j.pageId,j.controller.signal);if(identity(c.raw)!==j.application)throw new Error('workflow_changed');
     if(c.raw.authenticationRequired)break;
    }
    if(c.raw.authenticationRequired){j.status='manual_boundary';j.issue={code:'authentication_required'};break;}
    if(p.kind==='open'){
     const scopes=[...new Set(editable(c.raw,p.section).map(f=>f.scope))];
     if(scopes.length!==1||p.before.includes(scopes[0]!)){j.status='needs_input';j.issue={code:'open_result_unknown',section:p.section};break;}
    }else{
     const found=matchingPreview(c.raw,p.section,p.anchors).filter(scope=>!p.before.includes(JSON.stringify(anchors(c.raw,scope)))||!recipe.sections.find(r=>r.sections.includes(p.section))?.repeated);
     if(editable(c.raw,p.section).length||found.length!==1){j.status='needs_input';j.issue={code:'save_result_unknown',section:p.section};break;}
     j.done.push({...p.target!,status:'saved_preview_verified'});delete j.current;
    }
    delete j.pending;
   }
   const sources=normalizeProfile(profile),comp=compilePlan(c,profile,j.policy,j.testMode);
   const bound=(comp.record_sources??[]).map(source=>({source,record:comp.plan?.records.find(r=>r.id===source.plan_record)})).filter(x=>x.record);
   const queue:Target[]=recipe.sections.flatMap(rule=>rule.sections.filter(section=>c.raw.sections.includes(section)).flatMap(section=>rule.sources.flatMap(source=>(sources[source]?.records??[]).filter(row=>rule.fields.some(field=>resolveFact(profile,sources,row,field))).map(row=>({section,source,record:row.id})))));
   for(const target of queue){
    if(j.done.some(t=>key(t)===key(target)))continue;
    const hit=bound.find(b=>b.record!.section===target.section&&b.source.source_section===target.source&&b.source.source_record===target.record);
    const scope=c.records.find(r=>r.binding===hit?.record?.binding)?.scope;
    if(scope&&fields(c.raw,target.section).filter(f=>f.scope===scope).every(f=>f.disabled)&&fields(c.raw,target.section).some(f=>f.scope===scope&&f.value))j.done.push({...target,status:'existing_record_preserved'});
   }
   const target=j.current?.target??queue.find(t=>!j.done.some(d=>key(d)===key(t))&&editable(c.raw,t.section).length&&bound.some(b=>b.source.source_record===t.record&&b.source.source_section===t.source&&b.record!.steps.length))??queue.find(t=>!j.done.some(d=>key(d)===key(t)));
   if(!target){j.status='ready_for_review';j.issue={code:'ordinary_modules_processed',manual_tasks:manualTasks(c.raw),unhandled_modules:c.raw.sections.filter(section=>!recipe.sections.some(r=>r.sections.includes(section))&&c.raw.fields.some(f=>f.scope===section&&f.plannerFamily==='guopin'))};break;}
   const editors=[...new Set(editable(c.raw,target.section).map(f=>f.scope))];
   const otherEditors=recipe.sections.flatMap(r=>r.sections.filter(section=>section!==target.section).flatMap(section=>editable(c.raw,section)));
   if(otherEditors.length){j.status='needs_input';j.issue={code:'another_editor_open',section:target.section};break;}
   if(!editors.length){
    const existing=previewScopes(c.raw,target.section);
    if(existing.length&&j.initialSections.includes(target.section)&&j.policy.records!=='append'){j.status='needs_input';j.issue={code:'append_requires_policy',section:target.section};break;}
    const controls=c.raw.fields.filter(f=>f.scope===target.section&&button(f)&&['添加','编辑'].includes(f.label));
    if(controls.length!==1){j.status='needs_input';j.issue={code:'module_open_unavailable',section:target.section};break;}
    j.pending={kind:'open',section:target.section,before:editors,anchors:[]};
    await engine.activate({pageId:j.pageId,scope:target.section,target:controls[0]!.label,intent:'open',operationId:`${j.id}:${key(target)}:open`,signal:j.controller.signal,testMode:j.testMode});
    await new Promise(resolve=>setTimeout(resolve,150));continue;
   }
   if(editors.length!==1)throw new Error('multiple_editors_open');
   if(!j.current){
    const hit=bound.find(b=>b.record!.section===target.section&&b.source.source_section===target.source&&b.source.source_record===target.record);
    const scope=c.records.find(r=>r.binding===hit?.record?.binding)?.scope;
    if(!comp.plan||!hit?.record||scope!==editors[0]){j.status='needs_input';j.issue={code:'editor_source_ambiguous',section:target.section};break;}
    const plan=structuredClone(comp.plan);plan.records=[hit.record];plan.protected_fields=plan.protected_fields.filter(f=>f.record_id===hit.record!.id);plan.unresolved=plan.unresolved.filter(f=>f.record_id===hit.record!.id);
    const runner=new FormRunner(),entry=runner.start(j.id,`${j.id}:${key(target)}`,plan);
    if(!entry.run_id)throw new Error('journey_plan_invalid');const runId=String(entry.run_id);runner.markPrepared(j.id,runId);runner.setDerivedEffects(j.id,runId,comp.derived_effects??[]);
    runner.setGuard(j.id,runId,async raw=>{const latest=await readProfile(j.profileId,j.revision);if(latest.profile_id!==j.profileId||latest.revision!==j.revision)throw new Error('profile_revision_changed');if(identity(raw)!==j.application)throw new Error('workflow_changed');});
    j.current={runner,runId,target,scope:scope!};
   }
   const current=j.current,prior=current.runner.status(j.id,current.runId);
   if(prior.status!=='ready'&&prior.status!=='completed')current.runner.resume(j.id,current.runId);
   const result=prior.status==='completed'?prior:await current.runner.executeWindow(j.id,current.runId,engine,j.controller.signal,Math.max(1,end-Date.now()-1500));
   if(result.status==='paused_window'){j.status='paused_window';break;}
   if(comp.reobserve_after_execution&&!result.error&&Array.isArray(result.results)&&result.results.every((r:any)=>r.status==='verified_ui')){delete j.current;continue;}
   c=await engine.capturePlanning(j.pageId,j.controller.signal);
   const ordinary=editable(c.raw,target.section);
   const tasks=manualTasks(c.raw).filter(t=>t.scope===current.scope||t.scope===target.section);
   if(tasks.some(t=>t.blocks_navigation)){j.status='manual_boundary';j.issue={code:'manual_fields',tasks};j.manualCheckpoint=manualCheckpoint(c.raw);break;}
   if(result.error||!Array.isArray(result.results)||result.results.some((r:any)=>r.status!=='verified_ui')||ordinary.some(f=>fieldMissing(f)||f.invalid||f.error)||comp.plan?.unresolved.some(u=>u.record_id===bound.find(b=>b.source.source_record===target.record)?.record?.id)){
    j.status='needs_input';j.issue={code:'module_incomplete',section:target.section,result};break;
   }
   const savedAnchors=anchors(c.raw,current.scope);
   if(!savedAnchors.length){j.status='needs_input';j.issue={code:'save_verification_unavailable',section:target.section};break;}
   j.pending={kind:'save',section:target.section,target,before:previewScopes(c.raw,target.section).map(scope=>JSON.stringify(anchors(c.raw,scope))),anchors:savedAnchors};
   await engine.activate({pageId:j.pageId,scope:current.scope,target:target.section==='资格证书'?'确定':'保存',intent:'save_record',operationId:`${j.id}:${key(target)}:save`,signal:j.controller.signal,testMode:j.testMode});
   await new Promise(resolve=>setTimeout(resolve,200));
  }if(j.status==='working')j.status='paused_window';
  }catch(error){j.status=j.controller.signal.aborted?'cancelled':'needs_input';const code=error instanceof Error?error.message:'';j.issue={code:/^[a-z_]+$/.test(code)?code:'module_execution_failed'};}
  finally{signal?.removeEventListener('abort',abort);j.working=false;}
  return this.summary(j);
 }
 private summary(j:ModuleRun):Summary{return {ok:['ready','paused_window','ready_for_review'].includes(j.status),journey_id:j.id,status:j.status,page_id:j.pageId,profile_revision:j.revision,family:'guopin',records:j.done,...(j.pending?{pending_action:j.pending.kind}:{}),...(j.issue?{issue:j.issue}:{}),persistence:'not_verified',submission:'not_performed',elapsed_ms:Date.now()-j.created};}
}
