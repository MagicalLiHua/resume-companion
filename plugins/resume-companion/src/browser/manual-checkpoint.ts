import {createHash} from 'node:crypto';
import type {RawField,RawPageForm} from './form-engine.js';
import {manualReason} from './manual-policy.js';

export interface ManualCheckpoint {fields:Array<{frame:number;scope:string;field:string;digest:string}>;}
const digest=(fields:RawField[])=>createHash('sha256').update(JSON.stringify(fields.map(f=>[f.tag,f.type,f.value,f.checked]).sort())).digest('hex');
/** Process-local fingerprints, never included in an Agent response. */
export function manualCheckpoint(raw:RawPageForm):ManualCheckpoint {
 const ordinary=raw.fields.filter(f=>f.visible&&f.role!=='button'&&f.tag!=='button'&&!manualReason(f));
 const fields:ManualCheckpoint['fields']=[];
 for(const f of ordinary){
  if(fields.some(row=>row.frame===f.frame&&row.scope===f.scope&&row.field===f.label))continue;
  fields.push({frame:f.frame,scope:f.scope,field:f.label,digest:digest(ordinary.filter(o=>o.frame===f.frame&&o.scope===f.scope&&o.label===f.label))});
 }
 return {fields};
}
export function verifyManualCheckpoint(checkpoint:ManualCheckpoint,raw:RawPageForm):boolean {
 return checkpoint.fields.every(f=>digest(raw.fields.filter(o=>o.frame===f.frame&&o.scope===f.scope&&o.label===f.field))===f.digest);
}
