import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {validateFormPlan,type FormPlan,type PlanRecord,type PlanStep,type PlanFact} from './form-plan.js';
import type {DerivedEffect} from './planning/compiler.js';
import type {FormEngine,RawField,RawPageForm,RunRecordBinding} from './form-engine.js';
import {manualTasks,fieldMissing,type ManualTask} from './manual-policy.js';

type StepStatus='pending'|'not_exposed'|'verified_ui'|'preserved'|'failed'|'unknown'|'blocked'|'cancelled';
type RunStatus='ready'|'working'|'paused_window'|'needs_input'|'completed'|'partial'|'cancelling'|'cancelled'|'expired';
interface StepResult {id:string;record_id:string;field:string;status:StepStatus;code?:string}
interface RecordState {binding?:RunRecordBinding | undefined;added:boolean;addAttempted?:boolean;blocked?:string}
interface Run {
  automatic?:boolean;
  derivedEffects?:DerivedEffect[];
  expectedValues:Map<string,PlanFact['value']>;
  id:string;owner:string;requestId:string;digest:string;secretHash:Buffer;plan:FormPlan;
  status:RunStatus;created:number;deadline:number;expires:number;updated:number;
  steps:Map<string,StepResult>;records:Map<string,RecordState>;
  controller:AbortController;windowActive:boolean;revision:number;lastError?:string;lastErrorTarget?:{scope:string;field:string};
  guard?: (raw:RawPageForm, first:boolean)=>Promise<void>;guardStarted?:boolean;
  spawned:Array<{source:string;binding:RunRecordBinding;claimed:boolean}>;
  audit?:{manual_tasks:ManualTask[];visible_fields:number;covered_fields:number;unplanned_fields:Array<{scope:string;field:string}>;
    required_missing:Array<{scope:string;field:string}>;invalid_fields:Array<{scope:string;field:string}>;page_error_count:number};
}
const retention=30*60_000;
const now=():number=>Date.now();
const hash=(s:string):Buffer=>createHash('sha256').update(s).digest();
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
const fieldValue=(f:RawField):unknown=>f.checked===null ? f.value : f.checked;
const fieldKey=(f:RawField):string=>`${f.frame}:${f.label}`;
const matches=(field:RawField,value:unknown):boolean=>{
  if(field.pendingInput)return false;
  if (typeof value==='object' && value && !Array.isArray(value)) {
    const range=value as {start:string;end?:string;current?:boolean};
    return same(field.value.split(/\s*\/\s*/),[range.start,range.current?'至今':range.end]);
  }
  if(Array.isArray(value))return field.value===value.join(' / ')||same([...field.value.split(/\s*\/\s*/).filter(Boolean)].sort(),[...value].sort());
  return typeof value==='boolean' ? field.checked===value : field.value===String(value);
};
function fail(code:string):never {throw new Error(code);}
function codeOf(error:unknown):string {
  const text=error && typeof error==='object' && 'code' in error?String(error.code):error instanceof Error ? error.message : String(error);
  return /^[a-z][a-z0-9_]+$/.test(text) ? text : 'execution_failed';
}

/** Owns bounded plans, not a background worker. Only executeWindow writes. */
export class FormRunner {
  private readonly runs=new Map<string,Run>();
  private active:string | undefined;
  get activeId():string | undefined {return this.active;}

  start(owner:string,requestId:string,input:unknown):Record<string,unknown> {
    this.expire();
    const validation=validateFormPlan(input);
    if(!validation.ok)return {ok:false,error:{code:'invalid_plan',issues:validation.issues}};
    const replay=[...this.runs.values()].find(run=>run.requestId===requestId);
    if(replay && replay.owner!==owner)return {ok:false,error:{code:'run_access_denied'}};
    if(replay)return replay.digest===validation.digest ? {...this.summary(replay),replayed:true}
      : {ok:false,error:{code:'request_id_conflict'}};
    if(this.active)return {ok:false,error:{code:'run_in_progress'}};
    if(this.runs.size>=8)return {ok:false,error:{code:'run_capacity_exceeded'}};
    const id=randomUUID(),secret=randomUUID()+randomUUID(),created=now();
    const run:Run={id,owner,requestId,digest:validation.digest,secretHash:hash(secret),plan:validation.plan,
      status:'ready',created,deadline:created+validation.plan.budget_ms,expires:created+retention,updated:created,
      expectedValues:new Map(),steps:new Map(),records:new Map(),controller:new AbortController(),windowActive:false,revision:0,spawned:[]};
    for(const record of run.plan.records) {
      run.records.set(record.id,{added:false});
      for(const step of record.steps)run.steps.set(step.id,{id:step.id,record_id:record.id,field:step.field,status:'pending'});
    }
    this.runs.set(id,run);this.active=id;
    return {...this.summary(run),resume_token:secret,created:true};
  }

  markPrepared(owner:string,id:string):void {this.authorize(owner,id).automatic=true;}

  setDerivedEffects(owner:string,id:string,effects:DerivedEffect[]):void {this.authorize(owner,id).derivedEffects=structuredClone(effects);}

  setGuard(owner:string,id:string,guard:(raw:RawPageForm,first:boolean)=>Promise<void>):void {
    this.authorize(owner,id).guard=guard;
  }

  status(owner:string,id:string,token?:string):Record<string,unknown> {
    this.expire();
    return this.summary(this.authorize(owner,id,token));
  }

  cancel(owner:string,id:string,token?:string):Record<string,unknown> {
    const run=this.authorize(owner,id,token);
    this.stop(run,'operation_cancelled');
    return this.summary(run);
  }

  cancelOwner(owner:string):void {
    for(const run of this.runs.values())if(run.owner===owner)this.stop(run,'connection_closed');
  }

  cancelActive(reason='lease_revoked'):void {
    const run=this.active && this.runs.get(this.active);
    if(run)this.stop(run,reason);
  }

  clear():void {this.cancelActive('runtime_closed');this.runs.clear();this.active=undefined;}

  resume(owner:string,id:string,token?:string,revision?:{facts?:FormPlan['facts'];retry_steps?:string[]}):Record<string,unknown> {
    this.expire();
    const run=this.authorize(owner,id,token);
    if(run.windowActive || this.active && this.active!==id)return {ok:false,error:{code:'run_in_progress'}};
    if(run.status==='expired')return this.summary(run);
    if(run.status==='completed')return this.summary(run);
    if(now()>=run.deadline)return {ok:false,error:{code:'run_budget_exhausted'},run_id:id};
    if(revision) {
      const revised=structuredClone(run.plan);
      for(const [key,fact] of Object.entries(revision.facts??{})) {
        // Changing shared facts must not invalidate already verified work.
        if(!revised.facts[key])fail('unknown_fact');
        const consumers=revised.records.flatMap(record=>record.steps).filter(step=>step.source_ref===key);
        if(consumers.some(step=>run.steps.get(step.id)?.status==='verified_ui'))fail('verified_fact_immutable');
        revised.facts[key]=fact;
      }
      const checked=validateFormPlan(revised);
      if(!checked.ok)return {ok:false,error:{code:'invalid_revision',issues:checked.issues}};
      for(const id of revision.retry_steps??[]) {
        const result=run.steps.get(id);
        if(!result || result.status==='verified_ui' || result.status==='unknown')fail('invalid_retry_step');
        const record=run.records.get(result.record_id)!;
        if(record.blocked)fail('record_requires_new_plan');
      }
      run.plan=checked.plan;run.revision++;
      for(const id of revision.retry_steps??[])Object.assign(run.steps.get(id)!,{status:'pending',code:undefined});
    }
    // An explicit resume after cancellation can continue only undispatched work.
    for(const result of run.steps.values())if(result.status==='cancelled')result.status='pending';
    run.owner=owner;run.controller=new AbortController();run.status='ready';this.active=id;
    return this.summary(run);
  }

  async executeWindow(owner:string,id:string,engine:FormEngine,signal?:AbortSignal,windowMs=90_000,
    progress?:(completed:number,total:number)=>void):Promise<Record<string,unknown>> {
    const run=this.authorize(owner,id);
    if(run.status!=='ready' || run.windowActive)return this.summary(run);
    run.windowActive=true;run.status='working';run.updated=now();
    // A new execution window must not report the previous window's failure or
    // audit as its current result. Dispatched step outcomes remain untouched.
    delete run.lastError;delete run.lastErrorTarget;delete run.audit;
    progress?.([...run.steps.values()].filter(s=>s.status!=='pending').length,run.steps.size);
    const windowEnd=Math.min(now()+windowMs,run.deadline);
    const abort=():void=>this.stop(run,'operation_cancelled');
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    const timer=setTimeout(()=>this.stop(run,now()>=run.deadline?'run_budget_exhausted':'window_budget_exhausted'),Math.max(0,windowEnd-now()));
    try {
      let state=await engine.captureRun(run.plan.page_id,run.controller.signal);
      if(state.raw.authenticationRequired)throw new Error('authentication_required');
      engine.requireSupported?.(state.raw);
      this.assertDocument(run,state.navigationId);
      await run.guard?.(state.raw,!run.guardStarted);run.guardStarted=true;
      // Validate every existing binding before the first new record is created.
      for(const record of run.plan.records)if(record.mode==='existing') {
        const local=run.records.get(record.id)!;
        local.binding??=engine.getRunBinding(record.binding!,run.plan.page_id,run.plan.navigation_id,run.plan.observation_id);
        if(!local.binding || local.binding.section!==record.section)fail('record_binding_expired');
        this.assertRecord(local.binding,state.raw);
      }
      records: for(const record of run.plan.records) {
        run.controller.signal.throwIfAborted();
        const local=run.records.get(record.id)!;
        if(local.blocked || record.steps.every(step=>run.steps.get(step.id)!.status!=='pending'))continue;
        if(windowEnd-now()<Math.min(30_000,windowMs/2)) {run.status='paused_window';break;}
        await run.guard?.(state.raw,false);
        const recordDeadline=Math.min(now()+(run.automatic?Math.max(30_000,record.steps.length*3000):30_000),windowEnd);
        if(!local.binding) {
          // Only add when all cross-record prerequisites have succeeded.
          const external=record.steps.flatMap(step=>step.depends_on).filter(dep=>run.steps.get(dep)!.record_id!==record.id);
          if(external.some(dep=>run.steps.get(dep)!.status!=='verified_ui')) {
            local.blocked='dependency_failed';this.blockRecord(run,record,local.blocked);continue;
          }
          state=await engine.captureRun(run.plan.page_id,run.controller.signal);
          this.assertDocument(run,state.navigationId);
          this.assertProtected(run,state.raw);
          const spawned=run.spawned.filter(item=>!item.claimed && (external.includes(item.source)||run.automatic&&item.source.startsWith('dayee_family_add:')) && item.binding.section===record.section);
          if(record.mode==='new' && spawned.length) {
            if(spawned.length!==1){local.blocked='dependency_created_records_ambiguous';this.blockRecord(run,record,local.blocked);continue;}
            const created=spawned[0]!;
            this.assertRecord(created.binding,state.raw);
            local.binding=created.binding;local.added=true;created.claimed=true;
          } else {
          const previous=new Set(state.raw.records?.map(r=>`${r.frame}:${r.identity}`));
          if(record.mode==='reveal' && state.raw.fields.some(f=>(f.scope===record.section || f.scope.startsWith(`${record.section} / `)) && f.tag!=='button' && f.role!=='button')) {
            local.blocked='section_already_has_fields';this.blockRecord(run,record,local.blocked);continue;
          }
          local.addAttempted=true;
          const result=await engine.activate({pageId:run.plan.page_id,scope:record.section,target:record.add_target,intent:record.mode==='reveal'?'open':'add_record',
            operationId:`${run.id}:${record.id}:add`,signal:run.controller.signal,testMode:run.plan.test_mode});
          const data=result.structuredContent;
          if(!data?.ok && data?.error?.side_effects==='none') {
            local.blocked=data?.error?.side_effects==='none'?'add_failed':'add_result_unknown';
            this.blockRecord(run,record,local.blocked);continue;
          }
          state=await engine.captureRun(run.plan.page_id,run.controller.signal);
          this.assertDocument(run,state.navigationId);
          this.assertProtected(run,state.raw);
          const added=state.raw.records?.filter(r=>!previous.has(`${r.frame}:${r.identity}`) && r.scope.startsWith(`${record.section} / `))??[];
          if(record.mode==='reveal' && !added.length) {
            const fields=state.raw.fields.filter(f=>f.scope===record.section && f.tag!=='button' && f.role!=='button');
            const frames=new Set(fields.map(f=>f.frame));
            if(!fields.length || frames.size!==1){local.blocked='add_result_unknown';this.blockRecord(run,record,local.blocked);continue;}
            local.added=true;
            local.binding={section:record.section,scope:record.section,frame:fields[0]!.frame,pageId:run.plan.page_id,
              navigationId:state.navigationId,observationId:run.plan.observation_id,fields:structuredClone(fields)};
          } else {
          const familyPair=run.automatic&&record.section==='家庭关系'&&data?.ok&&data?.record_creation==='dayee_initial_family_pair'&&added.length===2
            &&added.every(r=>state.raw.fields.filter(f=>f.frame===r.frame&&f.scope===r.scope&&f.role!=='button').every(f=>f.plannerFamily==='dayee'&&!f.value&&f.checked!==true));
          if(added.length!==1&&!familyPair){local.blocked='add_result_unknown';this.blockRecord(run,record,local.blocked);continue;}
          if(familyPair){const extra=added[1]!;run.spawned.push({source:`dayee_family_add:${record.id}`,claimed:false,binding:{...extra,section:record.section,pageId:run.plan.page_id,navigationId:state.navigationId,observationId:run.plan.observation_id,
            fields:structuredClone(state.raw.fields.filter(f=>f.scope===extra.scope&&f.frame===extra.frame&&f.role!=='button'))}});}
          const created=added[0]!;
          local.added=true;
          local.binding={...created,section:record.section,pageId:run.plan.page_id,navigationId:state.navigationId,observationId:run.plan.observation_id,
            fields:structuredClone(state.raw.fields.filter(f=>f.scope===created.scope && f.frame===created.frame && f.tag!=='button' && f.role!=='button'))};
          }
          }
        }
        let pending=record.steps.filter(step=>run.steps.get(step.id)!.status==='pending');
        while(pending.length) {
          run.controller.signal.throwIfAborted();
          // Large automatic singleton sections need several foreground windows.
          // Stop before starting another atomic operation, retaining pending
          // steps; the next window rechecks the original bindings and values.
          if(run.automatic&&windowEnd-now()<Math.min(10_000,windowMs/4)) {run.status='paused_window';break records;}
          if(now()>=recordDeadline) {
            for(const step of pending)Object.assign(run.steps.get(step.id)!,{status:'failed',code:'record_budget_exhausted'});
            break;
          }
          const step=pending.find(item=>item.depends_on.every(dep=>run.steps.get(dep)!.status!=='pending'));
          if(!step)fail('dependency_cycle');
          const result=run.steps.get(step.id)!;
          if(step.depends_on.some(dep=>{
            const outcome=run.steps.get(dep)!;
            if(outcome.status==='verified_ui')return false;
            // A template may omit the optional current-employment toggle. A
            // requested false is already satisfied by its absence; a true
            // value or any dispatched/failed action must still block dates.
            const prerequisite=record.steps.find(item=>item.id===dep);
            return !(run.automatic && record.mode!=='existing' && outcome.status==='not_exposed'
              && prerequisite?.field==='至今' && prerequisite.action==='fill'
              && run.plan.facts[prerequisite.source_ref]?.value===false);
          }))Object.assign(result,{status:'blocked',code:'dependency_failed'});
          else await this.executeStep(run,record,step,engine,recordDeadline);
          run.updated=now();
          progress?.([...run.steps.values()].filter(s=>s.status!=='pending').length,run.steps.size);
          pending=record.steps.filter(item=>run.steps.get(item.id)!.status==='pending');
        }
      }
      if(run.status==='working') {
        // Final whole-plan readback, including records written before later
        // dependent changes. UI verification is explicitly not persistence.
        state=await engine.captureRun(run.plan.page_id,run.controller.signal);
        await run.guard?.(state.raw,false);
        if(state.raw.authenticationRequired)throw new Error('authentication_required');
        this.assertDocument(run,state.navigationId);this.assertProtected(run,state.raw);
        for(const effect of run.derivedEffects??[]){const binding=run.records.get(effect.target_record)?.binding;if(binding)this.assertRecord({...binding,fields:binding.fields.filter(f=>f.label===effect.field)},state.raw);}
        for(const record of run.plan.records)for(const step of record.steps) {
          const result=run.steps.get(step.id)!;
          if(result.status!=='verified_ui')continue;
          const binding=run.records.get(record.id)!.binding!;
          try {
            this.assertIdentity(binding,state.raw);
            const field=this.findField(binding,state.raw,step.field);
            if(!matches(field,run.expectedValues.get(step.id)??run.plan.facts[step.source_ref]!.value)||field.invalid)Object.assign(result,{status:'failed',code:'final_verification_failed'});
          } catch {Object.assign(result,{status:'failed',code:'final_binding_failed'});}
        }
        run.audit=this.audit(run,state.raw);
        run.status=[...run.steps.values()].every(s=>s.status==='verified_ui'||s.status==='not_exposed')
          && run.plan.records.filter(r=>run.records.get(r.id)?.added).every(r=>r.steps.some(s=>run.steps.get(s.id)?.status==='verified_ui'))
          && !run.plan.unresolved.some(item=>item.status!=='keep_existing')
          && !run.audit.required_missing.length && !run.audit.invalid_fields.length && !run.audit.page_error_count ? 'completed':'partial';
      }
    } catch(error) {
      run.lastError=run.controller.signal.aborted ? String(run.controller.signal.reason?.message??'operation_cancelled') : codeOf(error);
      if(error&&typeof error==='object'&&'scope' in error&&'field' in error)run.lastErrorTarget={scope:String(error.scope).slice(0,240),field:String(error.field).slice(0,240)};
      run.status=run.controller.signal.aborted?'cancelled':'needs_input';
      for(const result of run.steps.values())if(result.status==='pending' && run.controller.signal.aborted)result.status='cancelled';
    } finally {
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      run.windowActive=false;run.updated=now();if(this.active===id)this.active=undefined;
      if((run.status as RunStatus)==='cancelling')run.status='cancelled';
    }
    return this.summary(run);
  }

  private async executeStep(run:Run,record:PlanRecord,step:PlanStep,engine:FormEngine,deadline:number):Promise<void> {
    const result=run.steps.get(step.id)!;
    const binding=run.records.get(record.id)!.binding!;
    let state=await engine.captureRun(run.plan.page_id,run.controller.signal);
    if(state.raw.authenticationRequired)throw new Error('authentication_required');
    this.assertDocument(run,state.navigationId);this.assertRecord(binding,state.raw);this.assertProtected(run,state.raw);
    const value=run.plan.facts[step.source_ref]!.value;
    let field:RawField;
    try {field=this.findField(binding,state.raw,step.field);} catch {
      const absent=!state.raw.fields.some(f=>f.frame===binding.frame&&f.scope===binding.scope&&f.label===step.field);
      Object.assign(result,run.automatic&&record.mode!=='existing'&&absent?{status:'not_exposed',code:'page_field_absent'}:{status:'failed',code:'target_unresolved'});return;
    }
    if(run.automatic&&record.mode!=='existing'&&typeof value==='string'&&step.action!=='path'){
      // Newly opened employer modules may render a select where the template
      // had only a field name. Bind the operation to the observed control now;
      // facts and target scope remain pinned to the original generated plan.
      const live=field.inputMode==='date'?'date':field.inputMode==='choice'?'select':'fill';
      if(live!==step.action)step=live==='select'?{...step,action:'select',selection_mode:'replace',query_from_value:false,allow_custom:false}:{...step,action:live};
    }
    const additive=step.action==='select' && step.selection_mode==='add' && Array.isArray(value);
    let expected=additive?[...new Set([...field.value.split(/\s*\/\s*/).filter(Boolean),...value])]:value;
    run.expectedValues.set(step.id,expected);
    if(matches(field,expected) && !field.invalid) {result.status='verified_ui';return;}
    const verifyLeafPath=step.action==='path'&&field.plannerFamily==='guopin'&&field.label==='期望行业'&&Array.isArray(value)&&field.value===value.at(-1);
    const verifyCertificatePaths=step.action==='select'&&field.plannerFamily==='guopin'&&field.scope==='资格证书'&&field.label==='证书名称'&&Array.isArray(value);
    if(!step.overwrite && !additive && !verifyLeafPath && !verifyCertificatePaths && (field.checked===true || field.checked===null && field.value)) {result.status='preserved';return;}
    if(field.disabled || field.readonly && step.action==='fill') {Object.assign(result,{status:'failed',code:'constraint_violation'});return;}
    const controller=new AbortController();
    const abort=():void=>controller.abort(run.controller.signal.reason);
    run.controller.signal.addEventListener('abort',abort,{once:true});
    if(run.controller.signal.aborted)abort();
    const timer=setTimeout(()=>controller.abort(new Error('record_budget_exhausted')),Math.max(0,deadline-now()));
    const context={pageId:run.plan.page_id,scope:binding.scope,operationId:`${run.id}:${step.id}:v${run.revision}`,signal:controller.signal,
      timeoutMs:Math.max(1,deadline-now()),overwrite:step.overwrite,testMode:run.plan.test_mode,cleanupOnFailure:true};
    try {
      const previousScopes=new Set(state.raw.records?.map(r=>`${r.frame}:${r.scope}`));
      let response;
      if(step.action==='fill' || step.action==='select' && field.inputMode==='choice_or_custom' && typeof value==='string') {
        response=await engine.fillFields({...context,fields:[{field:step.field,scope:binding.scope,value:value as string|number|boolean,overwrite:step.overwrite}]});
      } else if(step.action==='select') {
        response=await engine.selectOption({...context,field:step.field,value:typeof value==='string'?value:'',
          ...(step.query_from_value && typeof value==='string'?{query:value}:{}),allowCustom:step.allow_custom,
          ...(Array.isArray(value)?{values:value,selectionMode:step.selection_mode}:{})});
      } else if(step.action==='path')response=await engine.selectPath({...context,field:step.field,path:value as string[]});
      else response=await engine.setDate({...context,field:step.field,value:typeof value==='string'?value:'',
        ...(typeof value==='object' && !Array.isArray(value)?{range:{start:value.start,
          ...(value.end!==undefined?{end:value.end}:{}),...(value.current!==undefined?{current:value.current}:{})}}:{})});
      if(run.controller.signal.aborted) {Object.assign(result,{status:'unknown',code:'cancelled_after_dispatch'});run.controller.signal.throwIfAborted();}
      state=await engine.captureRun(run.plan.page_id,run.controller.signal);
      this.assertDocument(run,state.navigationId);this.assertIdentity(binding,state.raw);
      const after=this.findField(binding,state.raw,step.field);
      const proof=response.structuredContent;
      if(step.action==='path'&&after.plannerFamily==='guopin'&&after.label==='期望行业'&&Array.isArray(value)&&proof?.verification?.matched===true&&same(proof.completed_path,value)&&proof.readback_value===value.at(-1)){expected=proof.readback_value;run.expectedValues.set(step.id,expected);}
      if(verifyCertificatePaths&&Array.isArray(value)&&proof?.verification?.matched===true&&same(proof.completed_paths,value)&&same(proof.readback_values,value.map(v=>v.split(' / ').at(-1)))){expected=proof.readback_values;run.expectedValues.set(step.id,expected);}
      if(matches(after,expected)&&!after.invalid)this.acceptDerivedEffect(run,step,state.raw);
      this.assertProtected(run,state.raw);
      // An authorized prerequisite (e.g. unchecking "no internship") can itself
      // create a record. Its dependent new-record unit must claim that exact
      // observed side effect rather than adding a second empty card.
      for(const created of state.raw.records??[])if(!previousScopes.has(`${created.frame}:${created.scope}`)) {
        run.spawned.push({source:step.id,claimed:false,binding:{...created,section:created.scope.replace(/ \/ 第\d+条$/,''),
          pageId:run.plan.page_id,navigationId:state.navigationId,observationId:run.plan.observation_id,
          fields:structuredClone(state.raw.fields.filter(f=>f.scope===created.scope && f.frame===created.frame && f.tag!=='button' && f.role!=='button'))}});
      }
      const data=response.structuredContent;
      Object.assign(result,matches(after,expected) && !after.invalid ? {status:'verified_ui'}
        : {status:['action_may_have_started','action_dispatched','option_attempted'].includes(data?.error?.side_effects)?'unknown':'failed',code:data?.error?.code??'postcondition_failed'});
      // Only declared dependents may be cleared/recreated by a parent choice.
      const descendantIds=new Set([step.id]),dependents=new Set<string>();
      // Changing a three-level native cascade can reset both its child and
      // grandchild in the same event. Only the declared dependency graph counts.
      for(let changed=true;changed;){
        changed=false;
        for(const dependent of record.steps)if(!descendantIds.has(dependent.id)&&dependent.depends_on.some(id=>descendantIds.has(id))){
          descendantIds.add(dependent.id);dependents.add(dependent.field);changed=true;
        }
      }
      const unaffected=binding.fields.filter(old=>old.label!==step.field && !field.relatedFields?.includes(old.label)
        && !(field.role==='date-group' && old.label.startsWith(`${step.field} / `)) && !dependents.has(old.label));
      try {this.assertRecord({...binding,fields:unaffected},state.raw);} catch {fail('unexpected_record_change');}
      binding.fields=structuredClone(state.raw.fields.filter(f=>f.scope===binding.scope && f.frame===binding.frame && f.tag!=='button' && f.role!=='button'));
    } catch(error) {
      if(result.status==='pending')Object.assign(result,{status:'unknown',code:codeOf(error)});
      throw error;
    } finally {clearTimeout(timer);run.controller.signal.removeEventListener('abort',abort);}
  }

  private acceptDerivedEffect(run:Run,step:PlanStep,page:RawPageForm):void {
    for(const effect of run.derivedEffects??[]){
      if(effect.source_step!==step.id)continue;
      const binding=run.records.get(effect.target_record)?.binding;if(!binding)continue;
      const fields=page.fields.filter(f=>f.frame===binding.frame&&f.scope===binding.scope&&f.label===effect.field);
      if(effect.remove_empty&&fields.length===0){const old=binding.fields.find(f=>f.label===effect.field);if(old&&!old.value&&old.checked!==true){this.assertIdentity(binding,page);binding.fields=binding.fields.filter(f=>f!==old);}continue;}
      if(fields.length!==1)continue;
      const field=fields[0]!;
      // A compiler-declared dependency may fill an editable target only when it
      // exactly matches that target's own planned fact. Generic derived effects
      // still require an already verified source and a read-only target.
      const valueStep=effect.value_step?run.plan.records.flatMap(r=>r.steps).find(s=>s.id===effect.value_step):step;
      const plannedTarget=effect.planned_target&&run.plan.records.find(r=>r.id===effect.target_record)?.steps.some(s=>s===valueStep&&s.field===effect.field);
      if(!valueStep||!plannedTarget&&valueStep!==step&&run.steps.get(valueStep.id)?.status!=='verified_ui')continue;
      if(!plannedTarget&&!(field.disabled||field.readonly)||!matches(field,run.plan.facts[valueStep.source_ref]!.value))continue;
      this.assertIdentity(binding,page);
      binding.fields=binding.fields.map(old=>old.label===effect.field?structuredClone(field):old);
    }
  }

  private assertDocument(run:Run,navigation:string):void {if(navigation!==run.plan.navigation_id)fail('page_changed');}
  private assertIdentity(binding:RunRecordBinding,page:RawPageForm):void {
    if(binding.identity && !page.records?.some(r=>r.identity===binding.identity && r.frame===binding.frame && r.scope===binding.scope))fail('record_identity_changed');
  }
  private assertRecord(binding:RunRecordBinding,page:RawPageForm):void {
    if(binding.identity && !page.records?.some(r=>r.identity===binding.identity && r.frame===binding.frame && r.scope===binding.scope)) {
      // A remount may replace a record container. Rebind only to one record with
      // the exact prior field/value set, never to its former ordinal alone.
      const signature=(fields:RawField[]):string=>JSON.stringify(fields.filter(f=>f.tag!=='button' && f.role!=='button')
        .map(f=>JSON.stringify([f.label,f.tag,f.type,fieldValue(f)])).sort());
      const expected=signature(binding.fields);
      const candidates=(page.records??[]).filter(r=>r.frame===binding.frame && r.scope.startsWith(`${binding.section} / `)
        && signature(page.fields.filter(f=>f.frame===r.frame && f.scope===r.scope))===expected);
      if(candidates.length!==1)fail('record_identity_changed');
      binding.identity=candidates[0]!.identity;binding.scope=candidates[0]!.scope;
      binding.fields=structuredClone(page.fields.filter(f=>f.frame===binding.frame && f.scope===binding.scope && f.tag!=='button' && f.role!=='button'));
    }
    this.assertIdentity(binding,page);
    for(const key of new Set(binding.fields.map(fieldKey))) {
      const normalized=(fields:RawField[]):string[]=>fields.filter(f=>fieldKey(f)===key).map(f=>JSON.stringify([f.tag,f.type,fieldValue(f)])).sort();
      if(!same(normalized(binding.fields),normalized(page.fields.filter(f=>f.scope===binding.scope))))throw Object.assign(new Error('external_change'),{scope:binding.scope,field:binding.fields.find(f=>fieldKey(f)===key)!.label});
    }
  }
  private findField(binding:RunRecordBinding,page:RawPageForm,label:string):RawField {
    const fields=page.fields.filter(f=>f.scope===binding.scope && f.frame===binding.frame && f.label===label && f.tag!=='button' && f.role!=='button');
    if(fields.length!==1)fail('target_unresolved');return fields[0]!;
  }
  private assertProtected(run:Run,page:RawPageForm):void {
    for(const target of run.plan.protected_fields) {
      const binding=run.records.get(target.record_id)?.binding;
      if(!binding)fail('protected_binding_unavailable');
      const values=(fields:RawField[]):string[]=>fields.filter(f=>f.frame===binding.frame && f.scope===binding.scope
        && (f.label===target.field || f.label.startsWith(`${target.field} / `))).map(f=>JSON.stringify([f.label,f.tag,f.type,fieldValue(f)])).sort();
      const before=values(binding.fields);
      if(!before.length || !same(before,values(page.fields)))fail('protected_field_changed');
    }
  }
  private blockRecord(run:Run,record:PlanRecord,code:string):void {
    for(const step of record.steps)if(run.steps.get(step.id)!.status==='pending')Object.assign(run.steps.get(step.id)!,{status:'blocked',code});
  }
  private audit(run:Run,page:RawPageForm):NonNullable<Run['audit']> {
    const fields=page.fields.filter(f=>f.visible && f.tag!=='button' && f.role!=='button' && f.type!=='hidden');
    const described=(field:RawField):boolean=>run.plan.records.some(record=>{
      const binding=run.records.get(record.id)?.binding;
      if(!binding || binding.scope!==field.scope || binding.frame!==field.frame)return false;
      const labels=[...record.steps.map(s=>s.field),...run.plan.protected_fields.filter(t=>t.record_id===record.id).map(t=>t.field),
        ...run.plan.unresolved.filter(t=>t.record_id===record.id).map(t=>t.field)];
      return labels.some(label=>field.label===label || field.label.startsWith(`${label} / `));
    });
    const label=(field:RawField):{scope:string;field:string}=>({scope:field.scope,field:field.label});
    return {manual_tasks:manualTasks(page),visible_fields:fields.length,covered_fields:fields.filter(described).length,
      unplanned_fields:fields.filter(f=>!described(f)).map(label),
      required_missing:[...fields.filter(fieldMissing).map(label),...manualTasks(page).filter(t=>t.reason==='attachment'&&t.blocks_navigation).map(t=>({scope:t.scope,field:t.field}))],
      invalid_fields:fields.filter(f=>f.invalid || f.error).map(label),page_error_count:page.validations.length};
  }
  private authorize(owner:string,id:string,token?:string):Run {
    const run=this.runs.get(id);if(!run)fail('run_not_found');
    if(run.owner!==owner && (!token || !timingSafeEqual(hash(token),run.secretHash)))fail('run_access_denied');
    return run;
  }
  private stop(run:Run,reason:string):void {
    if(['completed','partial','expired','cancelled'].includes(run.status))return;
    run.controller.abort(new Error(reason));run.lastError=reason;
    run.status=run.windowActive?'cancelling':'cancelled';
    if(!run.windowActive) {
      for(const result of run.steps.values())if(result.status==='pending')result.status='cancelled';
      if(this.active===run.id)this.active=undefined;
    }
  }
  private expire():void {
    for(const [id,run] of this.runs)if(!run.windowActive) {
      if(now()>=run.expires) {
        if(this.active===id)this.active=undefined;
        this.runs.delete(id);
      } else if(now()>=run.deadline)this.stop(run,'run_budget_exhausted');
    }
  }
  private summary(run:Run):Record<string,unknown> {
    const results=[...run.steps.values()].map(result=>({...result}));
    const counts:Record<string,number>={};for(const result of results)counts[result.status]=(counts[result.status]??0)+1;
    return {ok:run.status==='completed',run_id:run.id,status:run.status,counts,results,
      protected_fields:run.plan.protected_fields.map(target=>({...target,
        scope:run.records.get(target.record_id)?.binding?.scope,
        verification:run.audit?'unchanged_ui':'not_verified'})),
      unresolved:run.plan.unresolved,elapsed_ms:now()-run.created,last_progress_at:new Date(run.updated).toISOString(),
      expires_at:new Date(run.expires).toISOString(),remaining_budget_ms:Math.max(0,run.deadline-now()),
      ...(run.lastError?{error:{code:run.lastError,...run.lastErrorTarget}}:{}),persistence:'not_verified',
      ...(run.audit?{page_audit:run.audit}:{}),
      unassigned_created_records:run.spawned.filter(item=>!item.claimed).map(item=>({source_step:item.source,scope:item.binding.scope})),
      added_records:[...run.records.entries()].filter(([,r])=>r.added).map(([id,r])=>({record_id:id,scope:r.binding?.scope,
        complete:results.some(result=>result.record_id===id&&result.status==='verified_ui')&&results.filter(result=>result.record_id===id).every(result=>result.status==='verified_ui'||result.status==='not_exposed')})),
      uncertain_adds:[...run.records.entries()].filter(([,r])=>r.addAttempted && !r.added && r.blocked!=='add_failed').map(([id])=>id)};
  }
}
