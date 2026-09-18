import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.setContent(await readFile('tests/fixtures/bankcomm-controls.html','utf8'));
 await page.addScriptTag({content:await readFile('test-results/test-engine.js','utf8')});
 await page.evaluate(()=>{const w=window as any;w.engine=new w.ResumeTest.FormEngine();w.snapshot=w.engine.scan()});
});

test('透明 Ant 控件按可见外壳扫描，禁用手机号和邮箱不泄漏为标签',async({page})=>{
 const fields=await page.evaluate(()=>(window as any).snapshot.fields);
 expect(fields.filter((f:any)=>f.kind==='ant-select').map((f:any)=>f.label)).toEqual(['民族','婚姻状况']);
 expect(fields.find((f:any)=>f.kind==='ant-cascader').label).toBe('户口所在地');
 expect(fields.filter((f:any)=>f.kind==='radio').map((f:any)=>f.label)).toEqual(['是否为社招应聘者','另一独立问题']);
 expect(fields.find((f:any)=>f.kind==='checkbox').blocked).toBeTruthy();
 expect(JSON.stringify(fields)).not.toContain('19999999999');expect(JSON.stringify(fields)).not.toContain('private-fixture@');
});
test('动态候选读取不改值，选择更新应用状态，回读与清空撤销一致',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,f=s.fields.find((f:any)=>f.label==='民族');
  const options=await w.engine.options({...s,fieldId:f.id});const before=w.__model.nationality??'';
  const filled=await w.engine.fill({...s,operationId:'select',operations:[{fieldId:f.id,expectedValue:'',value:'汉族'}]});
  const model=w.__model.nationality,verify=w.engine.verify(s),undo=await w.engine.undo(s);
  return {options,before,filled,model,verify,undo,after:w.__model.nationality,submitted:w.__submitted};
 });
 expect(result.options.levels).toEqual([['汉族','白族']]);expect(result.before).toBe('');expect(result.model).toBe('汉族');
 expect(result.filled[0].status).toBe('filled');expect(result.verify[0].status).toBe('filled');expect(result.undo[0].status).toBe('undone');expect(result.after).toBe('');expect(result.submitted).toBe(0);
});
test('级联必须完整路径，按各层真实选项写入并撤销',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,f=s.fields.find((f:any)=>f.label==='户口所在地');
  const partial=await w.engine.fill({...s,operationId:'partial',operations:[{fieldId:f.id,expectedValue:'',value:'南京'}]});
  const filled=await w.engine.fill({...s,operationId:'full',operations:[{fieldId:f.id,expectedValue:'',value:'江苏省 / 南京市 / 玄武区'}]});
  const value=w.__model.home,undo=await w.engine.undo(s);return {partial,filled,value,undo,after:w.__model.home};
 });
 expect(result.partial[0].status).toBe('failed');expect(result.filled[0].status).toBe('filled');expect(result.value).toBe('江苏省 / 南京市 / 玄武区');expect(result.undo[0].status).toBe('undone');expect(result.after).toBe('');
});
test('无 name 且重复 id 的单选组独立，触发应用 change 而不混组',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,fields=s.fields.filter((f:any)=>f.kind==='radio');
  const filled=await w.engine.fill({...s,operationId:'radios',operations:[{fieldId:fields[0].id,expectedValue:'',value:'yes'},{fieldId:fields[1].id,expectedValue:'',value:'no'}]});
  return {filled,model:w.__model,checked:[...document.querySelectorAll('input[type=radio]')].map((i:any)=>i.checked)};
 });
 expect(result.filled.every((r:any)=>r.status==='filled')).toBe(true);expect(result.model).toMatchObject({radio0:'yes',radio1:'no'});expect(result.checked).toEqual([true,false,false,true]);
});
test('弹窗打开后旧计划失效，新扫描仅包含弹窗内容并识别教育分组',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot;const modal=document.createElement('div');modal.className='ant-modal';modal.innerHTML='<div class="ant-modal-title">添加教育信息</div><label>学校<input></label>';document.body.append(modal);
  let stale=false;try{w.engine.validate(s)}catch{stale=true}return {stale,fields:w.engine.scan().fields};
 });
 expect(result.stale).toBe(true);expect(result.fields).toHaveLength(1);expect(result.fields[0]).toMatchObject({label:'学校',section:'education',groupLabel:'添加教育信息'});
});

test('结构诊断不返回输入值或占位数据，银行栏目操作拒绝相似域名',async({page})=>{
 const result=await page.evaluate(()=>{
  const w=window as any;(document.querySelector('#name') as HTMLInputElement).value='PRIVATE-VALUE';
  let rejected=false;try{w.ResumeTest.openBankcommSection('添加教育信息')}catch{rejected=true}
  return {diagnostics:w.ResumeTest.inspectForm(),rejected};
 });
 expect(result.rejected).toBe(true);const content=JSON.stringify(result.diagnostics);expect(content).not.toContain('PRIVATE-VALUE');expect(content).not.toContain('19999999999');expect(content).not.toContain('private-fixture@');
});
test('只有城市的资料不会被建议为完整级联地区',async({page})=>{
 const result=await page.evaluate(()=>{const w=window as any,s=w.snapshot,f=s.fields.find((f:any)=>f.kind==='ant-cascader');const source=w.ResumeTest.sources(w.ResumeTest.demoProfile()).find((s:any)=>s.ref==='basic/city');return w.ResumeTest.proposedValue(f,source)});
 expect(result.value).toBeNull();expect(result.reason).toContain('完整');
});

test('关闭动画残留的级联菜单不会阻塞当前下拉框',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,f=s.fields.find((f:any)=>f.kind==='ant-cascader');
  const input=document.querySelector('#home')!;
  input.setAttribute('aria-controls','missing-link');
  const old=document.createElement('div');old.className='ant-select-dropdown ant-slide-up-leave ant-slide-up-leave-start';old.textContent='退出动画';document.body.append(old);
  return w.engine.options({...s,fieldId:f.id});
 });
 expect(result.levels).toEqual([['江苏省']]);
});
test('级联路径超过网页层数时报告失败并恢复应用中的原值',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,f=s.fields.find((f:any)=>f.kind==='ant-cascader');
  const filled=await w.engine.fill({...s,operationId:'too-deep',operations:[{fieldId:f.id,expectedValue:'',value:'江苏省 / 南京市 / 玄武区 / 不存在的街道'}]});
  return {filled,value:w.__model.home,read:w.engine.scan().fields.find((f:any)=>f.kind==='ant-cascader').currentValue};
 });
 expect(result.filled[0].status).toBe('failed');expect(result.filled[0].message).toContain('已恢复');expect(result.value).toBe('');expect(result.read).toBe('');
});
test('长时间挂起后停止后续字段，不在已超时的请求中继续填写',async({page})=>{
 const result=await page.evaluate(async()=>{
  const w=window as any,s=w.snapshot,name=s.fields.find((f:any)=>f.label==='姓名'),select=s.fields.find((f:any)=>f.label==='民族');
  const now=Date.now;let offset=0;Date.now=()=>now()+offset;
  document.querySelector('#name')!.addEventListener('input',()=>{offset=30000},{once:true});
  try { const filled=await w.engine.fill({...s,operationId:'suspend',operations:[{fieldId:name.id,expectedValue:'',value:'测试姓名'},{fieldId:select.id,expectedValue:'',value:'汉族'}]});return {filled,value:w.__model.nationality??''}; }
  finally { Date.now=now; }
 });
 expect(result.filled[0].status).toBe('filled');expect(result.filled[1].status).toBe('failed');expect(result.filled[1].message).toContain('超时');expect(result.value).toBe('');
});
test('交通银行页内教育表单按记录分组，GPA 两个输入有独立含义',async({page})=>{
 const body='<meta charset="utf-8"><label>姓名<input id="name"></label>'+[0,1].map(()=>'<form class="ant-form"><label>学校名称<input id="school"></label><label>专业名称<input id="major"></label><label>起始日期<input id="startDate" readonly></label><label>结束日期<input id="endDate" readonly></label><input id="gpa"><input id="gpaTotal"></form>').join('');
 await page.route('https://job.bankcomm.com/**',route=>route.fulfill({contentType:'text/html',body}));
 await page.goto('https://job.bankcomm.com/index.do#/personal/resume');
 await page.addScriptTag({content:await readFile('test-results/test-engine.js','utf8')});
 const fields=await page.evaluate(()=>new (window as any).ResumeTest.FormEngine().scan().fields);
 expect(fields[0].section).toBe('other');expect(fields.slice(1).every((f:any)=>f.section==='education')).toBe(true);
 expect(fields.filter((f:any)=>f.label==='平均绩点（GPA）')).toHaveLength(2);
 expect(fields.filter((f:any)=>f.label==='绩点满分')).toHaveLength(2);
 const schools=fields.filter((f:any)=>f.label==='学校名称');expect(schools[0].groupId).not.toBe(schools[1].groupId);
});
test('下拉内部搜索框不作为简历字段，不使已有扫描失效',async({page})=>{
 const result=await page.evaluate(()=>{
  const w=window as any,s=w.snapshot,popup=document.createElement('div');popup.className='ant-cascader-dropdown';popup.innerHTML='<input type="search" placeholder="搜索学校"><input placeholder="搜索地区">';document.body.append(popup);
  return {valid:w.engine.validate(s),count:w.engine.scan().fields.length,previous:s.fields.length};
 });
 expect(result.valid.valid).toBe(true);expect(result.count).toBe(result.previous);
});
