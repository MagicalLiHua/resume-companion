import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {createRequire} from 'node:module';
import {createAutomationSchemas, canonical} from '../../plugins/resume-companion/protocol';
import {AutomationTools} from '../../extension/src/background/automation-tools';
import {freshState, syncActiveVersion} from '../../extension/src/domain/state';
import {demoProfile} from '../../extension/src/domain/profile';
const require=createRequire(import.meta.url),z3=require('../../plugins/resume-companion/node_modules/zod').z;
const a=createAutomationSchemas(z), b=createAutomationSchemas(z3);
const valid={session_id:'s',snapshot_id:'snapshot',operation_id:'op',action:{kind:'set_values',items:[{kind:'set_value',ref:'e1',expected_value_token:'t',value:{source:{version_id:'v',profile_revision:1,source_ref:'basic/full_name'}}}]}};
describe('neutral contract shared by Zod 3 and 4',()=>{
 for(const [label,params,ok] of [
  ['valid source batch',valid,true],
  ['unknown property',{...valid,selector:'input'},false],
  ['unlimited batch',{...valid,action:{...valid.action,items:Array(21).fill(valid.action.items[0])}},false],
  ['arbitrary JS',{...valid,action:{kind:'evaluate',script:'alert(1)'}},false],
  ['source plus literal',{...valid,action:{...valid.action.items[0],value:{literal:'x',source:{version_id:'v',profile_revision:1,source_ref:'basic/full_name'}}}},false],
  ['Enter implicit submission',{...valid,action:{kind:'press_key',ref:'e1',key:'Enter'}},false],
 ] as const)test(label,()=>{expect(a.act.safeParse(params).success).toBe(ok);expect(b.act.safeParse(params).success).toBe(ok)});
 test('conditional modes and exclusive selection share validation',()=>{
  for(const schema of [a,b]){
   expect(schema.observe.safeParse({tab_id:1}).success).toBe(true);
   for(const params of [{},{tab_id:1,session_id:'s'},{tab_id:1,mode:'verify'}])expect(schema.observe.safeParse(params).success).toBe(false);
   expect(schema.observe.safeParse({session_id:'s',mode:'verify',operation_ids:['op']}).success).toBe(true);
   for(const options of [{},{option_ref:'e2',option_value:'value'}])expect(schema.act.safeParse({...valid,action:{kind:'select_option',ref:'e1',expected_value_token:'token',...options}}).success).toBe(false);
  }
 });
 test('canonical request equality is independent of property order',()=>expect(canonical({a:1,b:{d:2,c:3}})).toBe(canonical({b:{c:3,d:2},a:1})));
});
test('formal profile directory, scoped sources, unknown facts and profile revisions',async()=>{
 const state=freshState();state.current={profile:demoProfile(),fieldMetadata:{'edu-master.end_month':{raw:'预计2027年6月',precision:'month',normalized:'2027-06'}},sourceDocument:null};syncActiveVersion(state);
 const tools=new AutomationTools(async()=>state),context={epoch:'e',requestId:'r',signal:new AbortController().signal};
 const directory=await tools.handle('read_profile',{version_id:'demo-profile'},context);expect(directory.directory).toBe(true);expect(directory.entries[0]).not.toHaveProperty('value');
 const scope=await tools.handle('read_profile',{version_id:'demo-profile',section:'education',record_id:'edu-master'},context);expect(scope.entries.find((e:any)=>e.field==='degree').value).toBeNull();expect(scope.entries.find((e:any)=>e.field==='completed').value).toBe(false);expect(scope.entries.find((e:any)=>e.field==='end_month').metadata.precision).toBe('month');
 const source=await tools.handle('read_profile',{version_id:'demo-profile',source_refs:['basic/full_name']},context);expect(source.entries[0].value).toBe('示例同学');
 const page=await tools.handle('read_profile',{version_id:'demo-profile',section:'education',limit:1},context);state.current.profile.revision++;await expect(tools.handle('read_profile',{version_id:'demo-profile',section:'education',limit:1,cursor:page.next_cursor},context)).rejects.toThrow('stale_cursor');
});
