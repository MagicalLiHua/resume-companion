import {describe,expect,test} from 'vitest';
import {validateFormPlan} from '../src/browser/form-plan.js';

const plan=()=>({schema_version:1,page_id:1,navigation_id:'nav',observation_id:'obs',profile_revision:'fixture-v1',
  facts:{name:{value:'虚构学校',source:'fixture#school'},date:{value:{start:'2019-09',end:'2023-06'},source:'fixture#dates'}},
  records:[{id:'education',section:'教育经历',mode:'new',steps:[{id:'school',action:'fill',field:'学校名称',source_ref:'name'},
    {id:'dates',action:'date',field:'起止时间',source_ref:'date',depends_on:['school']}]}]});
describe('whole-form plan preflight',()=>{
  test('validates facts and dependency graph without browser access',()=>{
    const first=validateFormPlan(plan());expect(first.ok).toBe(true);
    expect(validateFormPlan(plan())).toEqual(first);
  });
  test.each([
    ['missing_fact',(p:any)=>{p.records[0].steps[1].source_ref='absent';}],
    ['invalid_range',(p:any)=>{p.facts.date.value.end='2018-01';}],
    ['dependency_cycle',(p:any)=>{p.records[0].steps[0].depends_on=['dates'];}],
    ['unknown_dependency',(p:any)=>{p.records[0].steps[1].depends_on=['absent'];}],
    ['conflicting_target',(p:any)=>{p.records[0].steps[1].field='学校名称';}],
    ['protected_field',(p:any)=>{p.protected_fields=[{record_id:'education',field:'学校名称'}];}],
    ['manual_boundary',(p:any)=>{p.records[0].steps[0].field='验证码';}],
    ['invalid_record_binding',(p:any)=>{p.records[0].mode='existing';}],
    ['invalid_fill_value',(p:any)=>{p.records[0].steps[1].action='fill';}],
  ])('rejects %s before any record could be added',(code,mutate)=>{
    const input=plan();mutate(input);const result=validateFormPlan(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {expect(result.issues.some(issue=>issue.code===code)).toBe(true);expect(JSON.stringify(result)).not.toContain('虚构学校');}
  });
  test('rejects oversize plans and invalid real calendar dates',()=>{
    expect(validateFormPlan({blob:'x'.repeat(1_048_577)}).ok).toBe(false);
    const p=plan();p.facts.date.value.start='2023-02-29';p.facts.date.value.end='2023-04-30';
    expect(validateFormPlan(p).ok).toBe(false);
  });
});
