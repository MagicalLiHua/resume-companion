import {describe,expect,test} from 'vitest';
import {manualReason} from '../src/browser/manual-policy.js';
import {fixtureDiagnosticsAllowed,guardLowLevelAction} from '../src/browser/low-level-policy.js';
import {validateFormPlan} from '../src/browser/form-plan.js';

describe('shared manual policy',()=>{
 test('checks replacement context after a detached UID instead of allowing the old target',async()=>{
  let resolutions=0,disposed=0;
  const page={pptrPage:{url:()=> 'https://jobs.bytedance.com/campus/resume/edit'},getElementByUid:async()=>{
   const attempt=++resolutions;
   return {evaluate:async()=>{if(attempt===1)throw new Error('target_detached_before_policy');return {label:'姓名',policyContext:'是否有亲属在本公司工作'};},dispose:async()=>{disposed++;}};
  }};
  await expect(guardLowLevelAction('fill',{uid:'1_2',value:'不应输入'},page)).rejects.toThrow('manual_boundary');
  expect(resolutions).toBe(2);expect(disposed).toBe(2);
 });
 test.each([
  '是否有亲属受雇本公司','是否有亲属受雇于中粮集团系统','是否有近亲属在交银集团工作',
  '有无亲戚在某某科技任职','配偶是否为本行员工','亲属所在部门',
 ])('requires user handling for %s regardless of a negative source fact',label=>{
  expect(manualReason({label,scope:'个人信息'})).toBe('employer_relatives');
  const result=validateFormPlan({schema_version:1,page_id:1,navigation_id:'n',observation_id:'o',profile_revision:'p',
   facts:{f:{value:'否',source:'user-provided'}},records:[{id:'r',binding:'r',mode:'existing',section:'个人信息',steps:[{id:'s',action:'fill',field:label,source_ref:'f'}]}]});
  expect(result.ok).toBe(false);if(!result.ok)expect(result.issues.some(i=>i.code==='manual_boundary')).toBe(true);
 });
 test('inherits employer question context but keeps ordinary family records fillable',()=>{
  expect(manualReason({label:'姓名',scope:'个人信息',policyContext:'是否有亲属在本公司工作'})).toBe('employer_relatives');
  expect(manualReason({label:'工作单位',scope:'亲属任职 / 第1条'})).toBe('employer_relatives');
  for(const label of ['姓名','关系','工作单位','父亲工作单位及职位','亲属姓名']){
   expect(manualReason({label,scope:'家庭关系 / 第1条',policyContext:label})).toBeUndefined();
  }
  expect(manualReason({label:'是否接受外派',scope:'个人信息'})).toBeUndefined();
 });
 test('manual attachment, consent and credential types are not ordinary fill targets',()=>{
  expect(manualReason({label:'照片',type:'file'})).toBe('attachment');
  expect(manualReason({label:'是否同意提供身份证号码'})).toBe('consent');
  expect(manualReason({label:'登录口令',type:'password'})).toBe('credential');
 });
 test('fixture scripts require process configuration and a local fixture URL',()=>{
  const env={RESUME_COMPANION_TEST_DIAGNOSTICS:'1',RESUME_COMPANION_CHROME_HEADLESS:'1',RESUME_COMPANION_SUPERVISOR_EPHEMERAL:'1'};
  expect(fixtureDiagnosticsAllowed('http://127.0.0.1:4174/test',env)).toBe(true);
  expect(fixtureDiagnosticsAllowed('https://jobs.bytedance.com/campus/resume/edit',env)).toBe(false);
  expect(fixtureDiagnosticsAllowed('http://127.0.0.1.attacker.test',env)).toBe(false);
  expect(fixtureDiagnosticsAllowed('http://127.0.0.1:4174',{})).toBe(false);
  expect(fixtureDiagnosticsAllowed('http://127.0.0.1:4174',{...env,RESUME_COMPANION_CHROME_HEADLESS:'0'})).toBe(false);
 });
});
