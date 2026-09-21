import {describe,expect,test} from 'vitest';
import {capabilityCatalog,inspectSupport} from '../src/browser/planning/capabilities.js';
import type {RawField,RawPageForm} from '../src/browser/form-engine.js';
import {readFileSync} from 'node:fs';

const field=(patch:Partial<RawField>={}):RawField=>({frame:0,index:0,tag:'input',role:'',type:'text',label:'姓名',scope:'基本信息',plannerFamily:'ud',inputMode:'text',value:'',checked:null,disabled:false,readonly:false,required:true,visible:true,options:[],constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:'',...patch});
const page=(fields:RawField[]=[field()],url='https://jobs.bytedance.com/campus/resume/edit'):RawPageForm=>({url,title:'简历',fields,sections:[...new Set(fields.map(f=>f.scope))],overlays:[],validations:[]});
const check=(raw:RawPageForm)=>inspectSupport(raw,{});
describe('employer capability preflight',()=>{
 test('keeps the recorded value-free field inventories within their known template contracts',()=>{
  const samples=JSON.parse(readFileSync(new URL('../../../tests/fixtures/verified-template-field-metadata.json',import.meta.url),'utf8'));
  const urls:Record<string,string>={'feishu/bytedance-campus':'https://jobs.bytedance.com/campus/resume/edit','moka/kingdee-campus':'https://app.mokahr.com/campus-recruitment/kingdeehr/166565','beisen/chery':'https://chery.zhiye.com/form'};
  for(const sample of samples){
   const fields=sample.fields.map((f:any,index:number)=>field({index,label:f.label,scope:f.scope,required:f.required,plannerFamily:f.scope?sample.family:undefined,inputMode:f.kind==='date_group'||f.kind==='date'?'date':f.kind==='combobox'?'choice':f.kind==='checkbox'?'boolean':'text',role:f.kind==='date_group'?'date-group':'',type:f.kind==='checkbox'?'checkbox':'text'}));
   const report=check(page(fields,urls[sample.template]));
   expect(report.autofill_allowed,JSON.stringify(report)).toBe(true);
  }
 });
 test('distinguishes verified templates, trusted platform pages and untrusted structural clones',()=>{
  expect(check(page())).toMatchObject({status:'supported_partial',autofill_allowed:true,match_level:'verified_template',template:{persistence:'not_verified'},platform:{id:'feishu-recruitment'}});
  expect(check(page(undefined,'https://jobs.bytedance.com/another-company/resume'))).toMatchObject({status:'supported_partial',autofill_allowed:true,match_level:'compatible_platform'});
  for(const url of ['https://jobs.bytedance.com.attacker.test/campus/resume/edit','https://jobs.other-company.test/campus/resume/edit'])expect(check(page(undefined,url))).toMatchObject({status:'platform_candidate',autofill_allowed:false,match_level:'platform_candidate'});
  expect(check(page(undefined,'https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=unknown')).autofill_allowed).toBe(false);
 });
 test('missing optional modules and manual required questions do not block ordinary filling',()=>{
  const raw=page([field(),field({index:1,label:'是否有亲属在本公司工作',inputMode:'choice'}),field({index:2,scope:'项目经历',label:'添加',tag:'button',role:'button',required:false})]);
  raw.sections.push('项目经历');
  const report=check(raw);
  expect(report.autofill_allowed).toBe(true);expect(report.manual_task_count).toBe(1);
  expect(report.observed_modules).toEqual(['基本信息','项目经历']);
  expect(report.skipped_modules).toEqual(['项目经历']);
 });
 test.each([true,false])('unknown fields block only when the enterprise made them required, required=%s',required=>{
  const report=check(page([field(),field({index:1,label:'企业新增问卷',required})]));
  expect(report.status).toBe(required?'page_changed':'supported_partial');expect(report.autofill_allowed).toBe(!required);
  expect(report.differences).toContainEqual(expect.objectContaining({code:required?'unknown_required_field':'unknown_field',field:'企业新增问卷'}));
  expect(required?report.blocking_difference_count:report.advisory_difference_count).toBe(1);
 });
 test('known unmapped fields remain explicit and value free instead of masquerading as new unknown controls',()=>{
  const report=check(page([field(),field({scope:'教育经历 / 第1条',label:'导师',required:false,value:'secret-sentinel'})]));
  expect(report.autofill_allowed).toBe(true);expect(report.known_unmapped_fields).toEqual([{scope:'教育经历 / 第1条',field:'导师',required:false}]);
  expect(JSON.stringify(report)).not.toContain('secret-sentinel');
 });
 test('optional differences are skipped while required modules, controls and mixed families stop before execution',()=>{
  expect(check(page([field(),field({index:1,scope:'新增问卷',required:false})]))).toMatchObject({autofill_allowed:true,skipped_modules:['新增问卷']});
  for(const changed of [field({scope:'新增问卷'}),field({inputMode:'boolean',type:'checkbox'}),field({plannerFamily:'sd'})])expect(check(page([changed])).autofill_allowed).toBe(false);
  expect(check(page([field(),field({index:1,inputMode:'boolean',type:'checkbox',required:false})])).autofill_allowed).toBe(true);
  expect(check(page([])).status).toBe('not_resume_form');
 });
 test('a date component needs its observed date group',()=>{
  const component=field({scope:'教育经历 / 第1条',label:'起止时间 / 开始年月',inputMode:'date'});
  expect(check(page([component])).autofill_allowed).toBe(false);
  expect(check(page([component,field({index:1,scope:component.scope,label:'起止时间',role:'date-group',inputMode:'date'})])).autofill_allowed).toBe(true);
 });
 test('51job checks the company and the entire known workflow, not just the current heading',()=>{
  const url='https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=9f8de839-e7de-40c9-8f16-10526e9ac1be&ResumeID=private-sentinel';
  const raw=page([field({plannerFamily:'job51',scope:'个人信息'})],url);
  const steps=['个人信息','教育经历','社团（学生工作、活动）经历','实习/工作经历','研究项目经历','竞赛经历','获奖情况','语言能力/技能证书','家庭成员信息','自我评价','本人承诺'];
  raw.workflow={family:'job51',template:'cofco',steps,current:0,heading:'个人信息',next:true,optionalAttachment:false};
  expect(check(raw).autofill_allowed).toBe(true);
  expect(JSON.stringify(check(raw))).not.toContain('private-sentinel');
  raw.workflow.steps=[...steps,'新增问题'];expect(check(raw).differences).toContainEqual({code:'workflow_changed'});
 });
 test('unfinished templates are listed honestly and client test_mode cannot bypass their status',()=>{
  const catalog=capabilityCatalog();
  expect(catalog.templates.filter(t=>t.status==='in_development').map(t=>t.id)).toEqual(['51job/jiangsu-bank']);
  expect(check(page([field({plannerFamily:'job51'})],'https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=26b69a02-efa5-4674-a984-40bcae578b0a')).status).toBe('template_in_development');
  const env={RESUME_COMPANION_TEST_DIAGNOSTICS:'1',RESUME_COMPANION_CHROME_HEADLESS:'1',RESUME_COMPANION_SUPERVISOR_EPHEMERAL:'1'};
  expect(inspectSupport(page([], 'http://127.0.0.1:4174/fixture'),env).status).toBe('fixture');
  expect(inspectSupport(page([field({label:'未知必填项'})]),env).autofill_allowed).toBe(false);
 });
 test('trusted Moka, Beisen, Dayee and Guopin origins accept structural module subsets',()=>{
  const dayee='https://faw-zhaopin.hotjob.cn/SU603374380dcad4635b836531/pb/resumeOperation.html',guopin='https://c.iguopin.com/resume?id=synthetic';
  expect(check(page([field({plannerFamily:'dayee',scope:'个人基本信息'})],dayee))).toMatchObject({status:'supported_partial',autofill_allowed:true,match_level:'verified_template'});
  expect(check(page([field({plannerFamily:'guopin',scope:'资格证书',label:'证书名称',inputMode:'choice'})],guopin))).toMatchObject({status:'supported_partial',autofill_allowed:true,match_level:'verified_template'});
  for(const scope of ['基本信息','新增语言模块'])expect(check(page([field({plannerFamily:'guopin',scope})],guopin)).autofill_allowed).toBe(false);
  expect(check(page([field({plannerFamily:'dayee',scope:'新增企业问卷'})],dayee)).autofill_allowed).toBe(false);
  expect(check(page([field({plannerFamily:'dayee',scope:'个人基本信息'})],dayee.replace('faw-zhaopin','another')))).toMatchObject({autofill_allowed:true,match_level:'compatible_platform',platform:{id:'dayee'}});
  expect(check(page([field({plannerFamily:'sd',scope:'基础信息'})],'https://app.mokahr.com/campus-recruitment/another/123'))).toMatchObject({autofill_allowed:true,match_level:'compatible_platform',platform:{id:'moka'}});
  expect(check(page([field({plannerFamily:'phoenix',scope:'个人信息'})],'https://another.zhiye.com/form'))).toMatchObject({autofill_allowed:true,match_level:'compatible_platform',platform:{id:'beisen'}});
  expect(check(page([field({plannerFamily:'phoenix',scope:'个人信息'})],'https://zhiye.com.attacker.test/form'))).toMatchObject({autofill_allowed:false,status:'platform_candidate'});
  expect(capabilityCatalog().platforms).toHaveLength(6);
 });
});
