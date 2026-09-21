import {createHash} from 'node:crypto';
import {z} from 'zod';
import {isManualTarget} from './manual-policy.js';

const id = z.string().min(1).max(120);
const label = z.string().min(1).max(240);
const date = z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/);
const range = z.object({start:date,end:date.optional(),current:z.boolean().optional()}).strict();
const scalar = z.union([z.string().max(20_000),z.number().finite(),z.boolean()]);
export const factSchema = z.object({
  value:z.union([scalar,z.array(z.string().min(1).max(500)).max(80),range]),
  source:z.string().min(1).max(500),
}).strict();
const actionFields = {
  id, field:label, source_ref:id, overwrite:z.boolean().default(false),
  depends_on:z.array(id).max(500).default([]),
};
export const planStepSchema = z.discriminatedUnion('action',[
  z.object({...actionFields,action:z.literal('fill')}).strict(),
  z.object({...actionFields,action:z.literal('select'),selection_mode:z.enum(['add','replace']).default('replace'),query_from_value:z.boolean().default(false),allow_custom:z.boolean().default(false)}).strict(),
  z.object({...actionFields,action:z.literal('path')}).strict(),
  z.object({...actionFields,action:z.literal('date')}).strict(),
]);
export const formPlanSchema = z.object({
  schema_version:z.literal(1),
  page_id:z.number().int().positive(),
  navigation_id:id,
  observation_id:id,
  profile_revision:id,
  test_mode:z.boolean().default(false),
  facts:z.record(id,factSchema),
  records:z.array(z.object({
    id, section:label, mode:z.enum(['existing','new','reveal']),
    binding:id.optional(), add_target:label.default('添加'),
    steps:z.array(planStepSchema).max(500),
  }).strict()).min(1).max(100),
  protected_fields:z.array(z.object({record_id:id,field:label}).strict()).max(500).default([]),
  unresolved:z.array(z.object({
    record_id:id,field:label,status:z.enum(['missing_information','needs_judgment','keep_existing']),
    reason:z.string().min(1).max(500),
  }).strict()).max(500).default([]),
  budget_ms:z.number().int().min(1000).max(180_000).default(180_000),
}).strict();
export type FormPlan = z.infer<typeof formPlanSchema>;
export type PlanRecord = FormPlan['records'][number];
export type PlanStep = PlanRecord['steps'][number];
export type PlanFact = z.infer<typeof factSchema>;
export interface PlanIssue {code:string;path:string}
export type PlanValidation = {ok:true;plan:FormPlan;digest:string} | {ok:false;issues:PlanIssue[]};
const targetKey = (record:string,field:string):string => `${record}\u0000${field.trim().toLowerCase()}`;

function validDate(value:string):boolean {
  const [year,month,day]=value.split('-').map(Number);
  if (!year || !month || month<1 || month>12) return false;
  return day===undefined || day>0 && day<=new Date(Date.UTC(year,month,0)).getUTCDate();
}

// Pure preflight: no DOM, profile store or browser dependency. A malformed last
// record must prevent adding the first one. Diagnostics contain paths, not facts.
export function validateFormPlan(input:unknown):PlanValidation {
  let encoded:string;
  try {encoded=JSON.stringify(input);} catch {return {ok:false,issues:[{code:'invalid_json',path:'plan'}]};}
  if (!encoded || Buffer.byteLength(encoded)>1_048_576) return {ok:false,issues:[{code:'plan_too_large',path:'plan'}]};
  const parsed=formPlanSchema.safeParse(input);
  if (!parsed.success) return {ok:false,issues:parsed.error.issues.map(issue=>({code:issue.code,path:issue.path.join('.')}))};
  const plan=parsed.data;
  const issues:PlanIssue[]=[];
  const error=(code:string,path:string):void=>{issues.push({code,path});};
  const records=new Set<string>();
  const bindings=new Set<string>();
  const actions=new Map<string,PlanStep>();
  const owners=new Map<string,number>();
  const targets=new Set<string>();
  const protectedFields=new Set(plan.protected_fields.map(p=>targetKey(p.record_id,p.field)));
  let count=0;
  for (const [recordIndex,record] of plan.records.entries()) {
    const path=`records.${recordIndex}`;
    if (records.has(record.id)) error('duplicate_record',path);
    records.add(record.id);
    if (record.mode==='existing' && !record.binding || record.mode!=='existing' && record.binding) error('invalid_record_binding',path);
    if(record.mode!=='existing' && !record.steps.length)error('empty_new_record',path);
    if (record.binding) {
      if (bindings.has(record.binding)) error('duplicate_binding',path);
      bindings.add(record.binding);
    }
    if (isManualTarget(record.section) || isManualTarget(record.add_target,record.section)) error('manual_boundary',path);
    for (const [stepIndex,step] of record.steps.entries()) {
      count++;
      const stepPath=`${path}.steps.${stepIndex}`;
      if (actions.has(step.id)) error('duplicate_action',stepPath);
      actions.set(step.id,step);owners.set(step.id,recordIndex);
      const target=targetKey(record.id,step.field);
      if ([...targets].some(other=>other===target || other.startsWith(`${target} / `) || target.startsWith(`${other} / `))) error('conflicting_target',stepPath);
      targets.add(target);
      if ([...protectedFields].some(other=>other===target || other.startsWith(`${target} / `) || target.startsWith(`${other} / `))) error('protected_field',stepPath);
      if (step.field.startsWith('field:')) error('plan_requires_semantic_label',stepPath);
      if (isManualTarget(step.field,record.section)) error('manual_boundary',stepPath);
      const fact=plan.facts[step.source_ref];
      if (!fact) {error('missing_fact',stepPath);continue;}
      const value=fact.value;
      if (step.action==='fill' && typeof value==='object') error('invalid_fill_value',stepPath);
      if (step.action==='select' && !(typeof value==='string' && value.length>0 || Array.isArray(value))) error('invalid_select_value',stepPath);
      if(step.action==='select' && (step.query_from_value || step.allow_custom) && typeof value!=='string')error('custom_requires_scalar',stepPath);
      if (step.action==='path' && !(Array.isArray(value) && value.length>0)) error('invalid_path_value',stepPath);
      if (step.action==='date') {
        if (typeof value==='string') {
          if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value) || !validDate(value)) error('invalid_date',stepPath);
        } else if (typeof value!=='object' || Array.isArray(value)
          || !validDate(value.start) || value.current && value.end
          || !value.current && (!value.end || !validDate(value.end) || value.start.length!==value.end.length || value.start>value.end)) error('invalid_range',stepPath);
      }
    }
  }
  if (count>500) error('too_many_actions','records');
  for (const [index,entry] of plan.protected_fields.entries()) {
    if (!records.has(entry.record_id)) error('unknown_record',`protected_fields.${index}`);
    else if(plan.records.find(record=>record.id===entry.record_id)?.mode!=='existing')error('protected_record_must_exist',`protected_fields.${index}`);
  }
  for (const [index,entry] of plan.unresolved.entries()) {
    if (!records.has(entry.record_id)) error('unknown_record',`unresolved.${index}`);
    if (targets.has(targetKey(entry.record_id,entry.field))) error('conflicting_disposition',`unresolved.${index}`);
  }
  for (const [actionId,step] of actions) for (const dependency of step.depends_on) {
    if (!actions.has(dependency)) error('unknown_dependency',`action.${actionId}`);
    // Record units execute in plan order. Dependencies can reorder a record's
    // fields, but cannot silently pull a later record before an earlier one.
    else if (owners.get(dependency)!>owners.get(actionId)!) error('forward_record_dependency',`action.${actionId}`);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(key:string):void=>{
    if (visiting.has(key)) {error('dependency_cycle',`action.${key}`);return;}
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of actions.get(key)?.depends_on ?? []) if (actions.has(dependency)) visit(dependency);
    visiting.delete(key);visited.add(key);
  };
  for (const key of actions.keys()) visit(key);
  if (issues.length) return {ok:false,issues};
  return {ok:true,plan,digest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
