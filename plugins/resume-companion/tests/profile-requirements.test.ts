import {afterEach,describe,expect,test} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProfileStore} from '../src/profile-store.js';
import {ProfilePreparation} from '../src/profile-requirements.js';
import {requirementsCatalog} from '../src/browser/planning/requirements.js';
import {normalizeProfile,resolveFact} from '../src/profile-facts.js';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function setup(changes:Record<string,unknown>={}){
 const dir=await mkdtemp(join(tmpdir(),'resume-requirements-'));dirs.push(dir);
 const store=new ProfileStore(dir),saved=await store.save({name:'虚拟测试',changes});
 const service=new ProfilePreparation(store,requirementsCatalog());
 const read=(revision=1,extra:Record<string,unknown>={})=>service.read({profile_id:saved.profile.id,expected_revision:revision,...extra});
 const apply=(view:Awaited<ReturnType<typeof read>>,answers:unknown[],extra:Record<string,unknown>={})=>service.apply({profile_id:saved.profile.id,expected_revision:view.profile_revision,catalog_version:view.catalog_version,questionnaire_id:view.questionnaire_id,answers,...extra});
 return {store,service,read,apply,id:saved.profile.id};
}
const education=(id:string,patch:Record<string,unknown>={})=>({id,school:'同名虚拟学校',major:null,education_level:'bachelor',degree:null,expected_degree:null,completed:true,study_mode:'full_time',start_month:'2020-09',end_month:'2024-06',is_current:false,is_expected_end:false,...patch});
const all=async(f:Awaited<ReturnType<typeof setup>>,revision=1)=>{
 let offset=0,items:Awaited<ReturnType<typeof f.read>>['items']=[];
 for(;;){const view=await f.read(revision,{offset});items.push(...view.items);if(view.next_offset===null)return items;offset=view.next_offset;}
};
describe('personalized preparation and safe answer merge',()=>{
 test('does not repeat known contact details or expand explicitly absent experiences',async()=>{
  const f=await setup({basic:{full_name:'已有姓名',phone:'13800000000',email:'synthetic@example.test'},section_status:{work:'none',internships:'none',projects:'none'}});
  const questions=await all(f);
  expect(questions.some(q=>['phone','email','full_name'].includes(q.key))).toBe(false);
  expect(questions.some(q=>['work','internships','projects'].includes(q.section))).toBe(false);
  expect(questions.filter(q=>q.section==='education')).toHaveLength(1);
  expect(questions.find(q=>q.key==='identity_number')?.entry).toBe('local_only');
  expect(questions.some(q=>/亲属任职|是否有亲属|承诺|同意提供/.test(q.label))).toBe(false);
  const view=await f.read();expect(JSON.stringify(view)).not.toContain('13800000000');expect(JSON.stringify(view)).not.toContain('synthetic@example.test');
 });
 test('unknown optional sections are one presence question, not fabricated records',async()=>{
  const f=await setup(),questions=await all(f);
  expect(questions.find(q=>q.key==='phone')?.entry).toBe('ordinary');
  expect(questions.find(q=>q.key==='email')?.entry).toBe('ordinary');
  expect(questions.filter(q=>q.section==='work')).toEqual([expect.objectContaining({kind:'presence'})]);
  const view=await f.read(),q=questions.find(q=>q.section==='work')!;
  await f.apply(view,[{question_id:q.id,action:'none'}]);
  expect((await f.store.readForPlanning(f.id,2)).section_status.work).toBe('none');
  expect((await all(f,2)).some(q=>q.section==='work')).toBe(false);
 });
 test('same-name records are merged by stable ID without changing siblings',async()=>{
  const f=await setup({education:[education('first'),education('second',{major:'已确认专业'})]});
  const view=await f.read(),question=(await all(f)).find(q=>q.record_id==='first'&&q.key==='major')!;
  expect(question).toBeDefined();
  await f.apply(view,[{question_id:question.id,action:'set',value:'计算机科学'}]);
  const saved=await f.store.readForPlanning(f.id,2);
  expect(saved.education.map(r=>r.major)).toEqual(['计算机科学','已确认专业']);
  expect((await all(f,2)).some(q=>q.id===question.id)).toBe(false);
  await expect(f.apply(view,[{question_id:question.id,action:'set',value:'覆盖'}])).rejects.toThrow('profile_changed');
 });
 test('withheld and deferred survive regeneration and never become a negative answer',async()=>{
  const f=await setup(),view=await f.read(),q=(await all(f)).find(q=>q.section==='work')!;
  await f.apply(view,[{question_id:q.id,action:'withheld'}]);
  expect((await all(f,2)).some(x=>x.id===q.id)).toBe(false);
  const profile=await f.store.readForPlanning(f.id,2);expect(profile.section_status.work).toBe('unknown');
  const full=await f.read(2,{include_marked:true});expect(full.items.find(x=>x.id===q.id)?.state).toBe('withheld');
  await f.apply(full,[{question_id:q.id,action:'reopen'}]);
  expect((await all(f,3)).find(x=>x.id===q.id)?.state).toBe('missing');
 });
 test('default preparation remains a union; selected modules only narrow the preflight view',async()=>{
  const f=await setup(),union=await all(f);
  const targeted=await f.read(1,{scope:'selected_modules',targets:[{template_id:'feishu/bytedance-campus',modules:['基本信息']}]});
  expect(targeted.items.every(q=>q.uses.every(u=>u.template_id==='feishu/bytedance-campus'&&u.module==='基本信息'))).toBe(true);
  expect(union.some(q=>q.section==='education')).toBe(true);expect((await all(f)).length).toBe(union.length);
  await expect(f.read(1,{targets:[{template_id:'feishu/bytedance-campus',modules:[]}]})).rejects.toThrow('invalid_scope');
  const dayee=await f.read(1,{scope:'selected_modules',targets:[{template_id:'dayee/faw',modules:['个人基本信息']}]});
  expect(dayee.items.length).toBeGreaterThan(0);expect(dayee.items.every(q=>q.uses.every(u=>u.template_id==='dayee/faw'&&u.module==='个人基本信息'))).toBe(true);
  await expect(f.read(1,{scope:'selected_modules',targets:[{template_id:'feishu/bytedance-campus',modules:['未知栏目']}]})).rejects.toThrow('unsupported_module');
 });
 test('degree conditions do not confuse expected and awarded credentials',async()=>{
  const f=await setup({education:[education('studying',{completed:false,degree:null,expected_degree:'硕士',end_month:null,is_current:true}),education('unknown',{completed:null})]});
  const qs=await all(f);
  expect(qs.some(q=>q.record_id==='studying'&&['degree','end'].includes(q.key))).toBe(false);
  expect(qs.find(q=>q.record_id==='unknown'&&q.key==='completed')).toBeDefined();
  expect(qs.some(q=>q.record_id==='unknown'&&q.key==='degree')).toBe(false);
 });
 test('private answers and mixed invalid batches are rejected without partial writes',async()=>{
  const f=await setup(),view=await f.read(),qs=await all(f);
  const name=qs.find(q=>q.key==='full_name')!,privateQ=qs.find(q=>q.key==='identity_number')!;
  await expect(f.apply(view,[{question_id:name.id,action:'set',value:'不得部分写入'},{question_id:privateQ.id,action:'set',value:'SECRET-MARKER'}])).rejects.toThrow('local_entry_required');
  expect((await f.store.readForPlanning(f.id,1)).basic.full_name).toBeNull();
  await expect(f.apply(view,[{question_id:name.id,action:'set',value:'普通事实'}],{catalog_version:'old'})).rejects.toThrow('catalog_changed');
  await expect(f.apply(view,[{question_id:name.id,action:'set',value:'普通事实'}],{questionnaire_id:'other'})).rejects.toThrow('questionnaire_changed');
 });
 test('supplemental answers resolve through the same fact lookup as page plans',async()=>{
  const f=await setup(),view=await f.read(),q=(await all(f)).find(q=>q.section==='basic'&&q.key==='ethnicity')!;
  await f.apply(view,[{question_id:q.id,action:'set',value:'汉族'}]);
  const p=await f.store.readForPlanning(f.id,2),sources=normalizeProfile(p);
  expect(resolveFact(p,sources,sources.basic!.records[0]!,{key:'ethnicity'})?.value).toBe('汉族');
  expect((await all(f,2)).some(x=>x.id===q.id)).toBe(false);
 });
 test('pagination does not lose missing records and identifiers survive reordering',async()=>{
  const f=await setup({education:[education('a'),education('b')]});
  const before=await all(f),ids=before.map(q=>q.id);expect(new Set(ids).size).toBe(ids.length);
  const small=await f.read(1,{limit:2});expect(small.items).toHaveLength(2);expect(small.next_offset).toBe(2);expect(small.total).toBe(before.length);
  await expect(f.read(1,{offset:2,expected_questionnaire_id:'stale'})).rejects.toThrow('questionnaire_changed');
  await f.store.save({profile_id:f.id,expected_revision:1,changes:{education:[education('b'),education('a')]}});
  expect((await all(f,2)).map(q=>q.id).sort()).toEqual(ids.sort());
 });
 test('typed salary and enum answers retain their semantics and reject invalid dates',async()=>{
  const f=await setup({education:[education('a',{study_mode:null,start_month:null})]}),view=await f.read(),qs=await all(f);
  const salary=qs.find(q=>q.key==='expected_salary')!,mode=qs.find(q=>q.record_id==='a'&&q.key==='study_mode')!;
  await f.apply(view,[{question_id:salary.id,action:'set',value:{amount:15000,currency:'CNY',period:'month',tax:'before',benefits:'unknown'}},{question_id:mode.id,action:'set',value:'全日制'}]);
  const p=await f.store.readForPlanning(f.id,2);expect(p.intent.expected_salary?.tax).toBe('before');expect(p.education[0]?.study_mode).toBe('full_time');
  const current=await f.read(2),start=(await all(f,2)).find(q=>q.record_id==='a'&&q.key==='start')!;
  await expect(f.apply(current,[{question_id:start.id,action:'set',value:'2020-13'}])).rejects.toThrow();
  expect((await f.store.readForPlanning(f.id,2)).education[0]?.start_month).toBeNull();
 });
});
