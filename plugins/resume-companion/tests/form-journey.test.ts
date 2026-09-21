import {describe,it,expect} from 'vitest';
import {FormJourney} from '../src/browser/form-journey.js';
import {ProfileSchema} from '../src/profile-store.js';
import {policySchema} from '../src/browser/planning/compiler.js';
import type {FormEngine,RawField,RawPageForm} from '../src/browser/form-engine.js';
const profile=ProfileSchema.parse({schema_version:'1.1',profile_id:'virtual',revision:1,basic:{full_name:'虚拟用户',self_description:'虚拟自评',email:null,phone:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:[]});
function fixture(steps=['基本信息','自我评价']){
 let index=0,clicks=0;const values=new Map<number,string>();
 let transform=(raw:RawPageForm)=>raw;
 const raw=():RawPageForm=>transform({url:'https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=test',title:'简历录入',documentId:`document${index}`,sections:[steps[index]!],overlays:[],validations:[],records:[],workflow:{family:'job51',template:'company-test',steps,current:index,heading:steps[index]!,next:true,optionalAttachment:false},fields:[{frame:0,index:0,tag:'input',role:'textbox',type:'text',scope:steps[index]!,label:index===0?'姓名':'自我评价',value:values.get(index)??'',checked:null,inputMode:'text',plannerFamily:'job51',disabled:false,readonly:false,required:true,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:''} as RawField]});
 let binding:any;let advance=true;
 const engine={captureRun:async()=>({raw:raw(),navigationId:`nav${index}`,generation:1}),capturePlanning:async()=>{
  const r=raw();binding={pageId:1,navigationId:`nav${index}`,observationId:`obs${index}`,scope:steps[index],section:steps[index],frame:0,fields:structuredClone(r.fields)};
  return {page_id:1,navigation_id:`nav${index}`,observation_id:`obs${index}`,raw:r,records:[{binding:`binding${index}`,scope:steps[index],section:steps[index],frame:0}]};
 },getRunBinding:()=>structuredClone(binding),fillFields:async(p:any)=>{values.set(index,String(p.fields[0].value));return {structuredContent:{ok:true,results:[{status:'filled'}]}};},activate:async()=>{clicks++;if(advance)index++;else throw new Error('transport_closed');return {structuredContent:{ok:true}};}} as unknown as FormEngine;
 const journeys=new FormJourney();const entry=journeys.start('owner','request',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},raw());
 return {journeys,entry,engine,raw,values,clicks:()=>clicks,setAdvance:(v:boolean)=>advance=v,setIndex:(v:number)=>index=v,setTransform:(fn:typeof transform)=>transform=fn};
}
describe('51job foreground page coordination',()=>{
 it('resumes after the user advances a whole declaration page without replaying its Next',async()=>{
  const f=fixture(['基本信息','用户声明','自我评价']);
  f.setTransform(raw=>{if(raw.workflow!.current===1)raw.fields=[{...raw.fields[0]!,label:'本人声明',type:'checkbox',inputMode:'boolean',value:'',checked:false}];return raw;});
  const paused=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(paused.status).toBe('manual_boundary');expect(f.clicks()).toBe(1);
  const stillWaiting=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(stillWaiting.status).toBe('manual_boundary');expect(f.clicks()).toBe(1);
  f.setIndex(2);
  const resumed=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(resumed.status).toBe('ready_for_review');expect(f.clicks()).toBe(1);
  expect(resumed.pages).toContainEqual({index:1,step:'用户声明',status:'user_advanced_unverified'});
  expect(f.values.get(2)).toBe('虚拟自评');
 });
 it('does not accept a manual jump that hides ordinary fields before their checkpoint is verified',async()=>{
  const f=fixture(['基本信息','用户声明','自我评价']);
  f.setTransform(raw=>{if(raw.workflow!.current===1)raw.fields[0]!.scope='基本信息';return raw;});
  await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  f.setIndex(2);
  const resumed=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(resumed.issue.code).toBe('workflow_position_changed');expect(f.clicks()).toBe(1);expect(f.values.has(2)).toBe(false);
 });
 it.each(['relative','attachment'])('fills ordinary facts then resumes after user handles a required %s',async(kind)=>{
  const f=fixture();let handled=false;
  f.setTransform(raw=>{
   if(raw.workflow!.current!==0)return raw;
   if(kind==='relative')raw.fields.push({...raw.fields[0]!,index:1,label:'是否有亲属受雇本公司',value:handled?'否':'',inputMode:'choice',options:['是','否']});
   else raw.workflow!.manual=handled?[]:['照片'];
   return raw;
  });
  const paused=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(paused.status).toBe('manual_boundary');expect(f.values.get(0)).toBe('虚拟用户');expect(f.clicks()).toBe(0);
  expect(paused.issue.tasks[0].blocks_navigation).toBe(true);
  const waiting=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(waiting.status).toBe('manual_boundary');expect(f.clicks()).toBe(0);
  handled=true;
  const resumed=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(resumed.status).toBe('ready_for_review');expect(f.clicks()).toBe(1);expect(f.values.get(1)).toBe('虚拟自评');
 });
 it('does not overwrite a user change made during the manual pause',async()=>{
  const f=fixture();let handled=false;
  f.setTransform(raw=>{if(raw.workflow!.current===0)raw.workflow!.manual=handled?[]:['照片'];return raw;});
  await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  handled=true;f.values.set(0,'用户手改');
  const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.issue.code).toBe('ordinary_fields_changed_during_manual_pause');expect(f.values.get(0)).toBe('用户手改');expect(f.clicks()).toBe(0);
 });
 it('optional unanswered employer relatives do not prevent ordinary pagination',async()=>{
  const f=fixture();f.setTransform(raw=>{raw.fields.push({...raw.fields[0]!,index:1,label:'是否有亲属在本公司工作',required:false,value:''});return raw;});
  const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.status).toBe('ready_for_review');expect(f.clicks()).toBe(1);
 });
 it('recompiles same-URL documents and never clicks the last Next',async()=>{
  const f=fixture();expect(f.values.size).toBe(0);
  const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.status).toBe('ready_for_review');expect(f.clicks()).toBe(1);expect([...f.values.values()]).toEqual(['虚拟用户','虚拟自评']);expect(r.pages).toHaveLength(2);
 });
 it('stops before declarations even with a Next button',async()=>{
  const f=fixture(['基本信息','本人承诺']);const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.status).toBe('manual_boundary');expect(f.clicks()).toBe(1);expect(f.values.size).toBe(1);
 });
 it('does not replay unknown Next and confirms a late transition on resume',async()=>{
  const f=fixture();f.setAdvance(false);
  await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  const again=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(again.issue.code).toBe('transition_result_unknown');expect(f.clicks()).toBe(1);
  f.setIndex(1);
  const recovered=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(recovered.status).toBe('ready_for_review');expect(f.clicks()).toBe(1);
 });
 it('stops on profile change before writing',async()=>{
  const f=fixture();const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>{throw new Error('profile_changed');});
  expect(r.issue.code).toBe('profile_changed');expect(f.values.size).toBe(0);expect(f.clicks()).toBe(0);
 });
 it('rejects a replacement company',async()=>{
  const f=fixture();const old=f.engine.capturePlanning.bind(f.engine);f.engine.capturePlanning=async(...args)=>{const c=await old(...args);c.raw.workflow!.template='another-company';return c;};
  const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.issue.code).toBe('workflow_changed');expect(f.values.size).toBe(0);
 });
 it('rejects another resume at the same company before writing',async()=>{
  const f=fixture();const old=f.engine.capturePlanning.bind(f.engine);f.engine.capturePlanning=async(...args)=>{const c=await old(...args);c.raw.url+='&ResumeID=another-resume';return c;};
  const r=await f.journeys.execute('owner',f.entry.journey_id,f.engine,async()=>profile);
  expect(r.issue.code).toBe('workflow_changed');expect(f.values.size).toBe(0);expect(f.clicks()).toBe(0);
 });

});
