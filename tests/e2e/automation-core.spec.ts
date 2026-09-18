import {test,expect, type Page} from '@playwright/test';
const call = (page:Page, method:string, params:unknown, requestId?:string):Promise<any> => page.evaluate(async ({method,params,requestId}) => (window as any).labEngine.handle(method,params,'test-epoch',requestId),{method,params,requestId});
const observe=(page:Page,params:Record<string,unknown>={})=>call(page,'observe',{tab_id:1,mode:'overview',...params});
const element=(o:any,name:string,kind?:string)=>o.elements.find((e:any)=>e.name===name&&(!kind||e.kind===kind));
const act=(page:Page,o:any,action:any,id=crypto.randomUUID())=>call(page,'act',{session_id:o.session_id,snapshot_id:o.snapshot_id,operation_id:id,action});
const write=(e:any,value:string)=>({kind:'set_value',ref:e.ref,expected_value_token:e.expected_value_token,value:{literal:value}});
const click=(e:any,extra={})=>({kind:'click',ref:e.ref,effect_kind:e.effect_kind,evidence_refs:e.evidence_refs,...extra});
test.beforeEach(async({page})=>{await page.goto('/agent-lab.html?run='+crypto.randomUUID());});
test('independent observation, batch, retained undo across observations and exact replay',async({page})=>{
 const o=await observe(page),name=element(o,'姓名 *','text'),email=element(o,'电子邮箱 *','email');
 expect(name).toBeTruthy();const id=crypto.randomUUID(); const action={kind:'set_values',items:[write(name,'测试同学'),write(email,'fiction@example.com')]};
 const result=await act(page,o,action,id);expect(result.status).toBe('applied');expect(result.results.every((r:any)=>r.value_retained)).toBe(true);
 expect(await act(page,o,action,id)).toEqual(result);await expect(act(page,o,{...action,items:[write(name,'其他')]},id)).rejects.toThrow(/operation_id/);
 await observe(page);const undone=await call(page,'undo_operations',{session_id:o.session_id,operation_ids:[id],operation_id:crypto.randomUUID()});expect(undone.status).toBe('applied');await expect(page.getByRole('textbox',{name:'姓名 *',exact:true})).toHaveValue('');
});
test('protects user edits and dependent undo',async({page})=>{
 let o=await observe(page);const first=crypto.randomUUID();await act(page,o,write(element(o,'姓名 *','text'),'甲'),first);o=await observe(page);const second=crypto.randomUUID();await act(page,o,write(element(o,'姓名 *','text'),'乙'),second);
 const blocked=await call(page,'undo_operations',{session_id:o.session_id,operation_ids:[first],operation_id:crypto.randomUUID()});expect(blocked.results[0].message).toContain('后续');
 await page.getByRole('textbox',{name:'姓名 *',exact:true}).fill('用户修改');const stale=await act(page,o,write(element(o,'姓名 *','text'),'丙'));expect(stale.status).toBe('stale');await expect(page.getByRole('textbox',{name:'姓名 *',exact:true})).toHaveValue('用户修改');
});
test('replacement refs and cursor changes are rejected',async({page})=>{
 const o=await observe(page,{limit:3});expect(o.next_cursor).toBeTruthy();await page.evaluate(()=>document.querySelector('input')!.outerHTML=document.querySelector('input')!.outerHTML);await expect(observe(page,{limit:3,cursor:o.next_cursor})).rejects.toThrow(/页面已变化/);
 const full=await observe(page),name=element(full,'姓名 *','text');await page.evaluate(()=>document.querySelector('input')!.outerHTML=document.querySelector('input')!.outerHTML);expect((await act(page,full,write(name,'不会写入'))).status).toBe('stale');
});
test('framework rejecting a value cannot report success',async({page})=>{
 await page.goto('/agent-lab.html?case=reject&run='+crypto.randomUUID());const o=await observe(page);const r=await act(page,o,{kind:'set_values',items:[write(element(o,'姓名 *','text'),'拒绝'),write(element(o,'电子邮箱 *','email'),'never@example.com')]});expect(r.status).toBe('failed');expect(r.stopped_at).toBe(1);await expect(page.getByRole('textbox',{name:'电子邮箱 *',exact:true})).toHaveValue('');
});
test('draft save proves record readback and prevents misleading field undo',async({page})=>{
 const o=await observe(page),id=crypto.randomUUID();await act(page,o,write(element(o,'姓名 *','text'),'本地虚构姓名'),id);const fresh=await observe(page);const save=await act(page,fresh,click(element(fresh,'保存简历草稿','button')));expect(save.persistence).toBe('ui_acknowledged');expect(save.status).toBe('applied');const undo=await call(page,'undo_operations',{session_id:o.session_id,operation_ids:[id],operation_id:crypto.randomUUID()});expect(undo.status).toBe('blocked');expect(await page.evaluate(()=>(window as any).Lab.read().finalSubmits)).toBe(0);
});
test('final submit, disguised next, declaration and upload are blocked',async({page})=>{
 await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('resume-agent-lab'))!;const s=JSON.parse(localStorage.getItem(k)!);s.step=4;localStorage.setItem(k,JSON.stringify(s));});await page.reload();const o=await observe(page),final=element(o,'确认并提交申请','button');expect(final.effect_kind).toBe('final_submit');expect((await act(page,o,click({...final,effect_kind:'interaction'}))).status).toBe('blocked');
 const declaration=o.elements.find((e:any)=>e.kind==='checkbox');expect(declaration.allowed_actions).toEqual([]);expect(await page.evaluate(()=>(window as any).Lab.read().finalSubmits)).toBe(0);
 await page.goto(page.url()+'&case=disguised');const disguised=element(await observe(page),'下一步','button');expect(disguised.effect_kind).toBe('final_submit');
});
test('cancel interrupts wait and queued batch writes',async({page})=>{
 const o=await observe(page),requestId='cancel-test';const waiting=call(page,'wait',{session_id:o.session_id,snapshot_id:o.snapshot_id,condition:{kind:'text_present',ref:o.scope_ref,text:'永远不出现'},timeout_ms:10000},requestId);await page.waitForTimeout(100);await page.evaluate(()=> (window as any).labEngine.cancel('cancel-test'));expect((await waiting).reason).toBe('cancelled');
});
test('native option requires observed detail and checks ownership',async({page})=>{
 const o=await observe(page),select=o.elements.find((e:any)=>e.kind==='select');expect((await act(page,o,{kind:'select_option',ref:select.ref,expected_value_token:select.expected_value_token,option_value:'test'})).status).toBe('stale');
 const detail=await observe(page,{mode:'detail',scope_ref:select.ref});const current=detail.elements.find((e:any)=>e.ref===select.ref),option=detail.elements.find((e:any)=>e.option_value==='test');expect(option).toBeTruthy();expect((await act(page,detail,{kind:'select_option',ref:current.ref,expected_value_token:current.expected_value_token,option_ref:option.ref})).status).toBe('applied');
});
for(const layout of ['A','B'])test(`continuous multi-record form through core primitives, layout ${layout}`,async({page})=>{
 await page.goto('/agent-lab.html?layout='+layout+'&run='+crypto.randomUUID());
 let o=await observe(page);let r=await act(page,o,{kind:'set_values',items:[write(element(o,layout==='B'?'真实姓名 *':'姓名 *','text'),'示例同学'),write(element(o,'电子邮箱 *','email'),'fiction@example.com'),write(element(o,'联系电话 *','tel'),'13800000000'),write(element(o,'现居城市 *','text'),'南京')]});expect(r.status).toBe('applied');
 o=await observe(page);const originalSession=o.session_id;r=await act(page,o,click(element(o,'下一步','button')));expect(r.transition.requires_observe).toBe(true);o=await observe(page);expect(o.session_id).not.toBe(originalSession);
 for(const [index,schoolName] of ['示例理工大学','示例科技大学'].entries()){
  o=await observe(page);r=await act(page,o,click(element(o,layout==='B'?'新增教育经历':'添加教育信息','button')));expect(r.status).toBe('applied');o=await observe(page);
  let school=element(o,'学校名称','cascader');r=await act(page,o,click(school,{expected_value_token:school.expected_value_token}));expect(r.status).toBe('applied');
  for(const label of ['国内','江苏省']){
   o=await observe(page,{mode:'detail',scope_ref:school.ref});school=o.elements.find((e:any)=>e.ref===school.ref);const branch=element(o,label,'option')??element(o,label,'treeitem');expect(branch).toBeTruthy();
   r=await act(page,o,click(branch,{expected_value_token:school.expected_value_token}));expect(['applied','dispatched']).toContain(r.status);await page.waitForTimeout(250);
  }
  o=await observe(page,{mode:'detail',scope_ref:school.ref});school=o.elements.find((e:any)=>e.ref===school.ref);const leaf=o.elements.find((e:any)=>e.name===schoolName&&e.option_ref);expect(leaf).toBeTruthy();r=await act(page,o,{kind:'select_option',ref:school.ref,expected_value_token:school.expected_value_token,option_ref:leaf.ref});expect(r.status).toBe('applied');
  o=await observe(page);r=await act(page,o,{kind:'set_values',items:[write(element(o,'专业名称 *','text'),index?'计算机技术':'软件工程'),write(element(o,'入学时间 *','month'),index?'2024-09':'2020-09'),write(element(o,'毕业时间 *','month'),index?'2027-06':'2024-06')]});expect(r.status).toBe('applied');
  o=await observe(page);let level=element(o,'学历','select');o=await observe(page,{mode:'detail',scope_ref:level.ref});level=o.elements.find((e:any)=>e.ref===level.ref);r=await act(page,o,{kind:'select_option',ref:level.ref,expected_value_token:level.expected_value_token,option_value:index?'硕士研究生':'本科'});expect(r.status).toBe('applied');
  o=await observe(page);r=await act(page,o,click(element(o,'保存教育经历','button')));expect(r.status).toBe('applied');expect(r.persistence).toBe('ui_acknowledged');
  expect((await page.evaluate(()=>(window as any).Lab.read())).education).toHaveLength(index+1);
 }
 o=await observe(page);await act(page,o,click(element(o,'下一步','button')));o=await observe(page);await act(page,o,click(element(o,'新增实习经历','button')));
 o=await observe(page);r=await act(page,o,{kind:'set_values',items:[write(element(o,layout==='B'?'实习单位':'单位名称 *','text'),'示例科技公司'),write(element(o,layout==='B'?'实习职务':'担任职位 *','text'),'测试开发实习生'),write(element(o,'开始时间 *','month'),'2026-06'),write(element(o,'结束时间 *','month'),'2026-08'),write(element(o,'工作内容','textarea'),'编写接口回归测试用例。')]});expect(r.status).toBe('applied');
 o=await observe(page);r=await act(page,o,click(element(o,'保存实习经历','button')));expect(r.persistence).toBe('ui_acknowledged');o=await observe(page);await act(page,o,click(element(o,'下一步','button')));o=await observe(page);
 expect(element(o,'确认并提交申请','button').blocked_reason).toContain('final_submit');const state=await page.evaluate(()=>(window as any).Lab.read());expect(state.step).toBe(4);expect(state.education).toHaveLength(2);expect(state.experience).toHaveLength(1);expect(state.nativeSubmits).toBe(3);expect(state.finalSubmits).toBe(0);
 await page.reload();expect((await page.evaluate(()=>(window as any).Lab.read())).education).toHaveLength(2);
});
test('month popup chooses rendered year/month without fabricating a day',async({page})=>{
 await page.goto('/agent-controls.html');let o=await observe(page),date=element(o,'入职年月','text');expect(date.allowed_actions).not.toContain('set_value');let r=await act(page,o,click(date,{expected_value_token:date.expected_value_token}));expect(r.status).toBe('applied');
 o=await observe(page);const previous=element(o,'上一年','button');r=await act(page,o,click(previous,{expected_value_token:date.expected_value_token}));expect(r.status).toBe('applied');
 o=await observe(page);date=element(o,'入职年月','text');const march=element(o,'2025-03','date_option');expect(march).toBeTruthy();r=await act(page,o,click(march,{expected_value_token:date.expected_value_token}));expect(r.status).toBe('applied');await expect(page.getByRole('textbox',{name:'入职年月',exact:true})).toHaveValue('2025-03');
 o=await observe(page);const birthday=element(o,'出生日期','date');expect((await act(page,o,write(birthday,'2000-03'))).status).toBe('blocked');
});
test('ARIA search, explicit empty, rendered virtual options and scroll',async({page})=>{
 await page.goto('/agent-controls.html');let o=await observe(page),skill=element(o,'技能搜索','combobox');await act(page,o,click(skill,{expected_value_token:skill.expected_value_token}));
 let waited=await call(page,'wait',{session_id:o.session_id,snapshot_id:o.snapshot_id,condition:{kind:'options_ready',ref:skill.ref}});expect(waited.status).toBe('ready');
 o=await observe(page,{mode:'detail',scope_ref:skill.ref});let scroll=o.elements.find((e:any)=>e.scroll&&e.name==='技能候选滚动区');expect(scroll).toBeTruthy();let r=await act(page,o,{kind:'scroll',ref:scroll.ref,direction:'down',pixels:900});expect(r.status).toBe('applied');
 o=await observe(page,{mode:'detail',scope_ref:skill.ref});skill=o.elements.find((e:any)=>e.ref===skill.ref);const option=element(o,'技能 31','option');expect(option).toBeTruthy();r=await act(page,o,{kind:'select_option',ref:skill.ref,expected_value_token:skill.expected_value_token,option_ref:option.ref});expect(r.status).toBe('applied');
 o=await observe(page);skill=element(o,'技能搜索','combobox');await act(page,o,write(skill,'无结果'));o=await observe(page);skill=element(o,'技能搜索','combobox');waited=await call(page,'wait',{session_id:o.session_id,snapshot_id:o.snapshot_id,condition:{kind:'options_ready',ref:skill.ref}});expect(waited.status).toBe('empty');
});
test('local structure changes stop remaining batch and unrelated scopes stay usable',async({page})=>{
 await page.goto('/agent-controls.html?mutate=1');const o=await observe(page);const r=await act(page,o,{kind:'set_values',items:[write(element(o,'第一字段','text'),'触发新字段'),write(element(o,'第二字段','text'),'不能继续')]});expect(r.status).toBe('stale');await expect(page.getByRole('textbox',{name:'第二字段',exact:true})).toHaveValue('');
 const checkbox=element(o,'可以出差','checkbox');expect((await act(page,o,{kind:'set_checked',ref:checkbox.ref,expected_value_token:checkbox.expected_value_token,checked:true})).status).toBe('applied');
});
test('old identical record and error toast do not prove a new save',async({page})=>{
 await page.goto('/agent-controls.html');const o=await observe(page);const r=await act(page,o,click(element(o,'保存记录','button')));expect(r.status).toBe('dispatched');expect(r.persistence).toBe('unconfirmed');await expect(page.getByRole('alert')).toHaveText('保存失败，请重试');
});
test('radio group undo restores the previous selection and protects peer edits',async({page})=>{
 await page.goto('/agent-controls.html');await page.getByRole('radio',{name:'本科',exact:true}).check();let o=await observe(page);const masters=element(o,'硕士','radio'),id=crypto.randomUUID();let r=await act(page,o,{kind:'set_checked',ref:masters.ref,expected_value_token:masters.expected_value_token,checked:true},id);expect(r.status).toBe('applied');
 r=await call(page,'undo_operations',{session_id:o.session_id,operation_ids:[id],operation_id:crypto.randomUUID()});expect(r.status).toBe('applied');await expect(page.getByRole('radio',{name:'本科',exact:true})).toBeChecked();await expect(page.getByRole('radio',{name:'硕士',exact:true})).not.toBeChecked();
});
test('large observations page whole references within the byte budget',async({page})=>{
 await page.evaluate(()=>{document.body.innerHTML='<section><h2>大表单</h2>'+Array.from({length:220},(_,i)=>`<label>字段 ${i}<input aria-label="字段 ${i}"></label>`).join('')+'</section>'});let o=await observe(page),refs=new Set<string>();let pages=0;
 for(;;){expect(new TextEncoder().encode(JSON.stringify(o)).length).toBeLessThanOrEqual(12000);for(const e of o.elements){expect(refs.has(e.ref)).toBe(false);refs.add(e.ref)}pages++;if(!o.next_cursor)break;o=await observe(page,{cursor:o.next_cursor})}
 expect(pages).toBeGreaterThan(2);expect(refs.size).toBeGreaterThanOrEqual(220);
});
test('in-flight replay does not dispatch twice and cancellation stops later batch writes',async({page})=>{
 const o=await observe(page),id=crypto.randomUUID(),action={kind:'set_values',items:[write(element(o,'姓名 *','text'),'测试一'),write(element(o,'电子邮箱 *','email'),'never@example.com')]};
 const params={session_id:o.session_id,snapshot_id:o.snapshot_id,operation_id:id,action};const first=call(page,'act',params,'cancel-write'),again=call(page,'act',params,'replayed-write');await page.waitForTimeout(60);await page.evaluate(()=>(window as any).labEngine.cancel('cancel-write'));const [a,b]=await Promise.all([first,again]);expect(a).toEqual(b);expect(a.status).toBe('unknown');await page.waitForTimeout(300);await expect(page.getByRole('textbox',{name:'电子邮箱 *',exact:true})).toHaveValue('');
});

test('duplicate custom options and unexposed scope guesses are rejected',async({page})=>{
 await page.goto('/agent-controls.html');let o=await observe(page),field=element(o,'技能搜索','combobox');await act(page,o,write(field,'Python'));await page.waitForTimeout(350);
 await page.evaluate(()=>{const option=document.querySelector('[role=option]')!;option.parentElement!.append(option.cloneNode(true));});
 o=await observe(page,{mode:'detail',scope_ref:field.ref});field=o.elements.find((e:any)=>e.ref===field.ref);const option=element(o,'Python','option');
 const r=await act(page,o,{kind:'select_option',ref:field.ref,expected_value_token:field.expected_value_token,option_ref:option.ref});expect(r.status).toBe('blocked');expect(r.dispatched).toBe(false);
 await page.goto('/agent-lab.html?run='+crypto.randomUUID());o=await observe(page,{limit:1});await expect(observe(page,{mode:'detail',scope_ref:'e7'})).rejects.toThrow(/先观察/);
});
