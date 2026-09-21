import {afterEach,describe,expect,test,vi} from 'vitest';
import {FormRunner} from '../src/browser/form-runner.js';
import type {FormEngine,RawField,RawPageForm,RunRecordBinding} from '../src/browser/form-engine.js';

const field=(scope:string):RawField=>({frame:0,index:0,identity:scope,tag:'input',role:'',type:'text',label:'学校',scope,
  value:'原学校',checked:null,disabled:false,readonly:false,required:false,visible:true,options:[],
  constraints:{minlength:null,maxlength:null,min:null,max:null,step:null,pattern:null},invalid:false,error:''});
function fixture() {
  const page:RawPageForm={documentId:'document',url:'https://example.test',title:'test',fields:[field('教育 / 第1条'),field('教育 / 第2条')],
    overlays:[],sections:['教育'],validations:[],records:[{scope:'教育 / 第1条',identity:'one',frame:0},{scope:'教育 / 第2条',identity:'two',frame:0}]};
  const bindings=page.records!.map((record,index):RunRecordBinding=>({...record,pageId:1,navigationId:'nav',observationId:'obs',section:'教育',fields:[structuredClone(page.fields[index]!)]}));
  let navigationId='nav';
  const writes:string[]=[];
  let onWrite:((scope:string)=>Promise<void>) | undefined;
  const engine={
    captureRun:async()=>({raw:structuredClone(page),navigationId,generation:1}),
    getRunBinding:(token:string)=>structuredClone(bindings[Number(token)]),
    fillFields:async(args:any)=>{
      const request=args.fields[0];writes.push(request.scope);
      await onWrite?.(request.scope);
      page.fields.find(f=>f.scope===request.scope)!.value=String(request.value);
      return {structuredContent:{ok:true,results:[{status:'filled'}]}};
    },
  } as unknown as FormEngine;
  const plan={schema_version:1,page_id:1,navigation_id:'nav',observation_id:'obs',profile_revision:'v1',
    facts:{school:{value:'新学校',source:'fixture'}},records:bindings.map((_,index)=>({id:`r${index}`,section:'教育',mode:'existing',binding:String(index),
      steps:[{id:`step${index}`,action:'fill',field:'学校',source_ref:'school',overwrite:true}]}))};
  return {page,engine,plan,writes,setNavigation:(nav:string)=>{navigationId=nav;},setOnWrite:(fn:(scope:string)=>Promise<void>)=>{onWrite=fn;}};
}
afterEach(()=>vi.restoreAllMocks());
describe('whole-form execution lifecycle',()=>{
  test('a recovered run clears the old error and does not reuse an earlier audit',async()=>{
    const f=fixture(),runner=new FormRunner(),entry=runner.start('owner','recovery-error',f.plan),id=entry.run_id as string;
    f.page.fields[1]!.value='用户临时修改';
    expect((await runner.executeWindow('owner',id,f.engine)).error).toMatchObject({code:'external_change'});
    f.page.fields[1]!.value='原学校';runner.resume('owner',id);
    const recovered=await runner.executeWindow('owner',id,f.engine);
    expect(recovered.status).toBe('completed');expect(recovered.error).toBeUndefined();
    expect(f.writes).toHaveLength(2);
  });
  test('protected fields are reported without values and lose verification on a failed recheck',async()=>{
    const f=fixture(),runner=new FormRunner();
    const plan={...f.plan,records:[f.plan.records[0],{...f.plan.records[1],steps:[]}],
      protected_fields:[{record_id:'r1',field:'学校'}],unresolved:[{record_id:'r0',field:'学院',status:'missing_information',reason:'missing_information'}]};
    const entry=runner.start('owner','protected-report',plan),id=entry.run_id as string;
    expect(entry.protected_fields).toEqual([expect.objectContaining({verification:'not_verified'})]);
    const first=await runner.executeWindow('owner',id,f.engine);
    expect(first.protected_fields).toEqual([{record_id:'r1',field:'学校',scope:'教育 / 第2条',verification:'unchanged_ui'}]);
    expect(JSON.stringify(first)).not.toContain('原学校');expect(f.writes).toHaveLength(1);
    f.page.fields[1]!.value='用户更改';runner.resume('owner',id);
    const changed=await runner.executeWindow('owner',id,f.engine);
    expect(changed.page_audit).toBeUndefined();
    expect(changed.protected_fields).toEqual([expect.objectContaining({verification:'not_verified'})]);
    expect(f.writes).toHaveLength(1);
  });
  test.each([false,true])('accepts declared cascade descendants but still rejects unrelated changes (%s)',async(unrelated)=>{
    const fields=['类型','类别','明细','其他字段'].map((label,index)=>({...field('个人信息'),label,index,identity:String(index),value:'',inputMode:'choice' as const}));
    const raw:RawPageForm={documentId:'doc',url:'https://example.test',title:'test',fields,overlays:[],sections:['个人信息'],validations:[],records:[{scope:'个人信息',identity:'record',frame:0}]};
    const binding:RunRecordBinding={...raw.records![0]!,pageId:1,navigationId:'nav',observationId:'obs',section:'个人信息',fields:structuredClone(fields)};
    let writes=0;
    const engine={captureRun:async()=>({raw:structuredClone(raw),navigationId:'nav',generation:1}),getRunBinding:()=>structuredClone(binding),selectOption:async()=>{writes++;fields.slice(0,unrelated?4:3).forEach(f=>{f.value='否';});return {structuredContent:{ok:true}};}} as unknown as FormEngine;
    const plan={schema_version:1,page_id:1,navigation_id:'nav',observation_id:'obs',profile_revision:'v1',facts:{no:{value:'否',source:'fixture'}},records:[{id:'r',section:'个人信息',mode:'existing',binding:'r',steps:fields.slice(0,3).map((f,i)=>({id:`s${i}`,field:f.label,action:'select',source_ref:'no',depends_on:i?[`s${i-1}`]:[]}))}]};
    const runner=new FormRunner(),entry=runner.start('owner','cascade-guard',plan);
    const result=await runner.executeWindow('owner',entry.run_id as string,engine);
    expect(writes).toBe(1);
    if(unrelated)expect(result.error).toEqual({code:'unexpected_record_change'});
    else {expect(result.status).toBe('completed');expect(result.counts).toEqual({verified_ui:3});}
  });
  test.each([true,false])('absent optional fields in a new record are distinguished only for generated plans (%s)',async(automatic)=>{
    const f=fixture(),runner=new FormRunner();f.page.fields=[];f.page.records=[];
    (f.engine as any).activate=async()=>{f.page.fields=[{...field('项目 / 第1条'),value:''}];f.page.records=[{scope:'项目 / 第1条',identity:'new',frame:0}];return {structuredContent:{ok:true}};};
    const plan={...f.plan,records:[{id:'new',section:'项目',mode:'new',steps:[{id:'name',action:'fill',field:'学校',source_ref:'school'},{id:'optional',action:'fill',field:'企业未开放字段',source_ref:'school'}]}]};
    const entry=runner.start('owner','absent-new',plan),id=entry.run_id as string;
    if(automatic)runner.markPrepared('owner',id);
    const result=await runner.executeWindow('owner',id,f.engine);
    expect((result.results as any[])[1].status).toBe(automatic?'not_exposed':'failed');expect(f.writes).toHaveLength(1);
    expect(result.status).toBe(automatic?'completed':'partial');
  });
  test.each([true,false])('only a declared readonly matching derived update is accepted (%s)',async(readonly)=>{
    const f=fixture(),runner=new FormRunner();
    f.page.fields[1]!.disabled=readonly;
    const plan={...f.plan,unresolved:[{record_id:'r0',field:'其他',status:'missing_information',reason:'fixture'}],records:[f.plan.records[0]!,{...f.plan.records[1]!,steps:[]}]};
    const entry=runner.start('owner','derived-guard',plan),id=entry.run_id as string;
    runner.setDerivedEffects('owner',id,[{source_step:'step0',target_record:'r1',field:'学校'}]);
    f.setOnWrite(async()=>{f.page.fields[1]!.value='新学校';});
    const first=await runner.executeWindow('owner',id,f.engine);
    // A second window preflights every existing binding, including the derived one.
    runner.resume('owner',id);
    const second=await runner.executeWindow('owner',id,f.engine);
    if(readonly)expect(second.error).toBeUndefined();
    else expect(second.error).toEqual(expect.objectContaining({code:'external_change'}));
  });
  test.each([true,false])('a declared editable dependency must match its own planned target fact (%s)',async(matches)=>{
    const f=fixture(),runner=new FormRunner(),entry=runner.start('owner','editable-derived',f.plan),id=entry.run_id as string;
    runner.setDerivedEffects('owner',id,[{source_step:'step0',value_step:'step1',target_record:'r1',field:'学校',planned_target:true}]);
    f.setOnWrite(async()=>{f.page.fields[1]!.value=matches?'新学校':'其他学校';});
    const result=await runner.executeWindow('owner',id,f.engine);
    expect(f.writes).toHaveLength(1);
    if(matches)expect(result.status).toBe('completed');
    else expect(result.error).toMatchObject({code:'external_change'});
  });
  test('a changed source revision stops dispatch at the next record boundary',async()=>{
    const f=fixture(),runner=new FormRunner();let revision=1;
    const entry=runner.start('owner','source-guard',f.plan),id=entry.run_id as string;
    runner.setGuard('owner',id,async()=>{if(revision!==1)throw Object.assign(new Error('资料已变更'),{code:'profile_changed'});});
    f.setOnWrite(async()=>{revision=2;});
    const result=await runner.executeWindow('owner',id,f.engine);
    expect(result.status).toBe('needs_input');expect(result.error).toEqual({code:'profile_changed'});expect(f.writes).toHaveLength(1);
  });

  test('additive selections retain existing choices and verify the complete resulting set',async()=>{
    const f=fixture();f.plan.records=f.plan.records.slice(0,1);
    (f.engine as any).selectOption=async()=>{f.page.fields[0]!.value='原学校 / 新学校';return {structuredContent:{ok:true}};};
    const plan={...f.plan,facts:{school:{value:['新学校'],source:'fixture'}},records:[{...f.plan.records[0]!,steps:[{id:'s',action:'select',selection_mode:'add',field:'学校',source_ref:'school'}]}]};
    const runner=new FormRunner(),entry=runner.start('owner','additive',plan);
    const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect(result.status).toBe('completed');expect(result.counts).toEqual({verified_ui:1});
  });
  test.each([true,false])('reveal binds the unique new ordinal record, even when the click result is uncertain (%s)',async(ok)=>{
    const f=fixture();
    f.page.fields=[];f.page.records=[];
    let adds=0;
    (f.engine as any).activate=async()=>{
      adds++;f.page.records=[{scope:'自我评价 / 第1条',frame:0,identity:'revealed'}];
      f.page.fields=[{...field('自我评价 / 第1条'),value:''}];
      return {structuredContent:{ok}};
    };
    const plan={...f.plan,records:[{id:'reveal',section:'自我评价',mode:'reveal',steps:[{id:'s',action:'fill',field:'学校',source_ref:'school'}]}]};
    const runner=new FormRunner(),entry=runner.start('owner','reveal',plan);
    const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect(result.status).toBe('completed');expect(result.counts).toEqual({verified_ui:1});
    expect(result.uncertain_adds).toEqual([]);expect(adds).toBe(1);
    expect(f.writes).toEqual(['自我评价 / 第1条']);
  });
  test('reveal rejects already populated child scopes before dispatch',async()=>{
    const f=fixture();f.page.fields=[field('自我评价 / 第1条')];
    const activate=vi.fn();(f.engine as any).activate=activate;
    const plan={...f.plan,records:[{id:'reveal',section:'自我评价',mode:'reveal',steps:[{id:'s',action:'fill',field:'学校',source_ref:'school'}]}]};
    const runner=new FormRunner(),entry=runner.start('owner','existing-reveal',plan);
    const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect((result.results as any[])[0].code).toBe('section_already_has_fields');
    expect(activate).not.toHaveBeenCalled();expect(f.writes).toEqual([]);
  });
  test('status and cancellation remain available while an in-flight write drains',async()=>{
    const f=fixture(),runner=new FormRunner();
    let release!:()=>void,started!:()=>void;
    const dispatched=new Promise<void>(resolve=>{started=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    f.setOnWrite(async()=>{started();await gate;});
    const entry=runner.start('owner','cancel-test',f.plan);
    const pending=runner.executeWindow('owner',entry.run_id as string,f.engine);
    await dispatched;
    expect(runner.status('owner',entry.run_id as string).status).toBe('working');
    expect(runner.cancel('owner',entry.run_id as string).status).toBe('cancelling');
    expect(runner.activeId).toBe(entry.run_id);
    release();
    const result=await pending;
    expect(result.status).toBe('cancelled');expect(f.writes).toHaveLength(1);
    expect(runner.activeId).toBeUndefined();
    expect((result.results as any[])[0].status).toBe('unknown');
  });
  test('a paused window resumes the same plan without replaying successful fields',async()=>{
    const f=fixture(),runner=new FormRunner();let time=Date.now();
    vi.spyOn(Date,'now').mockImplementation(()=>time);
    f.setOnWrite(async()=>{time+=70;});
    const entry=runner.start('owner','window-test',f.plan),id=entry.run_id as string;
    const paused=await runner.executeWindow('owner',id,f.engine,undefined,100);
    expect(paused.status).toBe('paused_window');expect(f.writes).toHaveLength(1);
    expect(runner.resume('owner',id).status).toBe('ready');
    expect((await runner.executeWindow('owner',id,f.engine,undefined,1000)).status).toBe('completed');
    expect(f.writes).toEqual(['教育 / 第1条','教育 / 第2条']);
  });
  test('an automatic singleton checkpoints pending fields without marking them failed',async()=>{
    let time=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>time);
    const fields=['甲','乙','丙'].map((label,i)=>({...field('个人信息'),label,index:i,value:''}));
    const raw:RawPageForm={documentId:'doc',url:'https://example.test',title:'test',fields,overlays:[],sections:['个人信息'],validations:[],records:[{scope:'个人信息',identity:'record',frame:0}]};
    const binding:RunRecordBinding={...raw.records![0]!,section:'个人信息',pageId:1,navigationId:'nav',observationId:'obs',fields:structuredClone(fields)};
    const writes:string[]=[];
    const engine={captureRun:async()=>({raw:structuredClone(raw),navigationId:'nav',generation:1}),getRunBinding:()=>structuredClone(binding),fillFields:async(a:any)=>{const f=a.fields[0];writes.push(f.field);fields.find(x=>x.label===f.field)!.value=f.value;time+=45;return {structuredContent:{ok:true}};}} as unknown as FormEngine;
    const runner=new FormRunner(),entry=runner.start('owner','singleton',{schema_version:1,page_id:1,navigation_id:'nav',observation_id:'obs',profile_revision:'v1',facts:{v:{value:'明确事实',source:'fixture'}},records:[{id:'r',section:'个人信息',mode:'existing',binding:'r',steps:fields.map((f,i)=>({id:`s${i}`,field:f.label,action:'fill',source_ref:'v'}))}]}),id=entry.run_id as string;
    runner.markPrepared('owner',id);
    const paused=await runner.executeWindow('owner',id,engine,undefined,100);
    expect(paused.status).toBe('paused_window');expect(paused.counts).toMatchObject({verified_ui:2,pending:1});
    runner.resume('owner',id);
    expect((await runner.executeWindow('owner',id,engine,undefined,1000)).status).toBe('completed');
    expect(writes).toEqual(['甲','乙','丙']);
  });
  test('foreign clients cannot inspect or recreate a request; recovery requires its credential',()=>{
    const f=fixture(),runner=new FormRunner();const entry=runner.start('owner','private-test',f.plan),id=entry.run_id as string;
    expect(()=>runner.status('stranger',id)).toThrow('run_access_denied');
    expect((runner.start('stranger','private-test',f.plan).error as any).code).toBe('run_access_denied');
    expect(runner.status('stranger',id,entry.resume_token as string).run_id).toBe(id);
  });
  test('checks all existing bindings and navigation before the first write',async()=>{
    const f=fixture(),runner=new FormRunner();const entry=runner.start('owner','external-test',f.plan);
    f.page.fields[1]!.value='用户刚修改';
    const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect((result.error as any).code).toBe('external_change');expect(f.writes).toEqual([]);
    const other=fixture(),next=new FormRunner();const run=next.start('owner','navigation-test',other.plan);other.setNavigation('new-document');
    expect(((await next.executeWindow('owner',run.run_id as string,other.engine)).error as any).code).toBe('page_changed');
    expect(other.writes).toEqual([]);
  });
  test('final readback catches a later record resetting an earlier success',async()=>{
    const f=fixture(),runner=new FormRunner();
    f.setOnWrite(async(scope)=>{if(scope==='教育 / 第2条')f.page.fields[0]!.value='网站回滚';});
    const entry=runner.start('owner','final-test',f.plan);
    const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect(result.status).toBe('partial');
    expect(result.counts).toEqual({failed:1,verified_ui:1});
    expect(JSON.stringify(result)).not.toContain('网站回滚');
  });
  test('reports required and invalid fields outside the planned steps without echoing values',async()=>{
    const f=fixture(),runner=new FormRunner();
    f.page.fields.push({...field('其他'),label:'精通程度',value:'',required:true,invalid:true,error:'需要选择'});
    f.page.validations=['原始错误不能泄露值'];
    const entry=runner.start('owner','audit',f.plan),result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
    expect(result.status).toBe('partial');expect(result.counts).toEqual({verified_ui:2});
    expect((result.page_audit as any).required_missing).toEqual([{scope:'其他',field:'精通程度'}]);
    expect((result.page_audit as any).page_error_count).toBe(1);
    expect(JSON.stringify(result)).not.toContain('原始错误');
  });
  test('unique unchanged remount rebinds; indistinguishable records stop before writing',async()=>{
    const f=fixture();f.plan.records=f.plan.records.slice(0,1);
    const runner=new FormRunner(),entry=runner.start('owner','ambiguous-remount',f.plan);
    f.page.records![0]!.identity='new-one';
    expect(((await runner.executeWindow('owner',entry.run_id as string,f.engine)).error as any).code).toBe('record_identity_changed');
    expect(f.writes).toHaveLength(0);
    const unique=fixture();unique.plan.records=unique.plan.records.slice(0,1);
    unique.page.records=unique.page.records!.slice(0,1);unique.page.fields=unique.page.fields.slice(0,1);
    unique.page.records[0]!.identity='remounted';
    const next=new FormRunner(),prepared=next.start('owner','unique-remount',unique.plan);
    expect((await next.executeWindow('owner',prepared.run_id as string,unique.engine)).status).toBe('completed');
  });
  test('expired budgets release a prepared run and never reset during resume',()=>{
    let time=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>time);
    const f=fixture(),runner=new FormRunner(),entry=runner.start('owner','budget',f.plan);
    time+=180001;
    expect((runner.resume('owner',entry.run_id as string).error as any).code).toBe('run_budget_exhausted');
    expect(runner.activeId).toBeUndefined();
    expect(runner.start('owner','replacement',f.plan).created).toBe(true);
    time+=30*60_000;
    expect(()=>runner.status('owner',entry.run_id as string)).toThrow('run_not_found');
  });
});

test.each([false,true])('an absent current toggle satisfies only an explicit false in generated new records (%s)',async(value)=>{
 const f=fixture(),runner=new FormRunner();f.page.fields=[];f.page.records=[];
 (f.engine as any).activate=async()=>{f.page.fields=[{...field('项目 / 第1条'),value:''}];f.page.records=[{scope:'项目 / 第1条',identity:'new',frame:0}];return {structuredContent:{ok:true}};};
 const plan={...f.plan,facts:{...f.plan.facts,current:{value,source:'fixture'}},records:[{id:'new',section:'项目',mode:'new',steps:[{id:'current',action:'fill',field:'至今',source_ref:'current'},{id:'school',action:'fill',field:'学校',source_ref:'school',depends_on:['current']}]}]};
 const entry=runner.start('owner','absent-current',plan),id=entry.run_id as string;runner.markPrepared('owner',id);
 const result=await runner.executeWindow('owner',id,f.engine);
 expect((result.results as any[])[1].status).toBe(value?'blocked':'verified_ui');expect(f.writes).toHaveLength(value?0:1);
});

test.each([true,false])('Guopin leaf-only display needs a verified complete path (%s)',async(valid)=>{
 const f=fixture();f.page.fields=[{...field('教育 / 第1条'),label:'期望行业',value:'计算机软件',plannerFamily:'guopin',inputMode:'choice'}];f.page.records=f.page.records!.slice(0,1);
 const binding={...f.page.records[0]!,pageId:1,navigationId:'nav',observationId:'obs',section:'教育',fields:structuredClone(f.page.fields)};
 f.engine.getRunBinding=()=>structuredClone(binding);
 let checks=0;f.engine.selectPath=async()=>{checks++;return {structuredContent:{ok:true,verification:{matched:true},completed_path:valid?['互联网/IT/电子/通信','计算机软件']:['其他','计算机软件'],readback_value:'计算机软件'}};};
 const runner=new FormRunner(),entry=runner.start('owner','path-proof',{...f.plan,facts:{path:{source:'fixture',value:['互联网/IT/电子/通信','计算机软件']}},records:[{id:'r',section:'教育',mode:'existing',binding:'0',steps:[{id:'p',field:'期望行业',action:'path',source_ref:'path'}]}]});
 const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
 expect(checks).toBe(1);expect(result.counts).toEqual(valid?{verified_ui:1}:{failed:1});
});

test.each(['empty','populated','unrelated'] as const)('declared education visibility changes preserve unrelated and populated fields: %s',async(mode)=>{
 const fields=['学历','专业名称','其他字段'].map((label,index)=>({...field('教育经历 / 第1条'),label,index,identity:String(index),value:mode==='populated'&&index===1?'已有专业':'',inputMode:'choice' as const}));
 const raw:RawPageForm={documentId:'doc',url:'https://example.test',title:'test',fields,overlays:[],sections:['教育经历'],validations:[],records:[{scope:'教育经历 / 第1条',identity:'record',frame:0}]};
 const binding:RunRecordBinding={...raw.records![0]!,pageId:1,navigationId:'nav',observationId:'obs',section:'教育经历',fields:structuredClone(fields)};
 const engine={captureRun:async()=>({raw:structuredClone(raw),navigationId:'nav',generation:1}),getRunBinding:()=>structuredClone(binding),selectOption:async()=>{raw.fields[0]!.value='高中';raw.fields=raw.fields.filter(f=>f.label!==(mode==='unrelated'?'其他字段':'专业名称'));return {structuredContent:{ok:true}};}} as unknown as FormEngine;
 const plan={schema_version:1,page_id:1,navigation_id:'nav',observation_id:'obs',profile_revision:'v1',facts:{level:{value:'高中',source:'fixture'}},records:[{id:'r',section:'教育经历',mode:'existing',binding:'r',steps:[{id:'level',field:'学历',action:'select',source_ref:'level'}]}]};
 const runner=new FormRunner(),entry=runner.start('owner','education-change',plan);
 runner.setDerivedEffects('owner',String(entry.run_id),[{source_step:'level',target_record:'r',field:'专业名称',remove_empty:true}]);
 const result=await runner.executeWindow('owner',String(entry.run_id),engine);
 if(mode==='empty')expect(result.error).toBeUndefined();else expect(result.error).toEqual({code:'unexpected_record_change'});
});
test.each([true,false])('certificate leaf-only values require all complete path proofs (%s)',async(valid)=>{
 const f=fixture();f.page.fields=[{...field('资格证书'),label:'证书名称',value:'CET6 / 驾驶证C1',plannerFamily:'guopin',inputMode:'choice'}];f.page.records=[{scope:'资格证书',identity:'cert',frame:0}];
 const binding={...f.page.records[0]!,pageId:1,navigationId:'nav',observationId:'obs',section:'资格证书',fields:structuredClone(f.page.fields)};
 f.engine.getRunBinding=()=>structuredClone(binding);
 let checks=0;const paths=['英语类 / CET6','驾驶类 / 驾驶证C1'];f.engine.selectOption=async()=>{checks++;return {structuredContent:{ok:true,verification:{matched:true},completed_paths:valid?paths:['其他类 / CET6',paths[1]],readback_values:['CET6','驾驶证C1'],commit_state:'pending_confirmation'}};};
 const runner=new FormRunner(),entry=runner.start('owner','certificate-proof',{...f.plan,facts:{paths:{source:'fixture',value:paths}},records:[{id:'r',section:'资格证书',mode:'existing',binding:'0',steps:[{id:'p',field:'证书名称',action:'select',source_ref:'paths',selection_mode:'replace'}]}]});
 const result=await runner.executeWindow('owner',entry.run_id as string,f.engine);
 expect(checks).toBe(1);expect(result.counts).toEqual(valid?{verified_ui:1}:{failed:1});expect(result.persistence).toBe('not_verified');
});
test('expired authentication prevents verification even when the current values already match',async()=>{
 const f=fixture();f.page.authenticationRequired=true;f.plan.facts.school.value='原学校';
 const runner=new FormRunner(),entry=runner.start('owner','expired-matching',f.plan);
 const result=await runner.executeWindow('owner',String(entry.run_id),f.engine);
 expect(result.status).toBe('needs_input');expect(result.error).toEqual({code:'authentication_required'});expect(f.writes).toHaveLength(0);expect(result.counts).not.toHaveProperty('verified_ui');
});
