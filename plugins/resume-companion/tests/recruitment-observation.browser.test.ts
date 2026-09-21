import {afterAll,beforeAll,expect,test} from 'vitest';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {FormEngine} from '../src/browser/form-engine.js';
import {guardLowLevelAction} from '../src/browser/low-level-policy.js';
import {compilePlan,policySchema} from '../src/browser/planning/compiler.js';
import {FormRunner} from '../src/browser/form-runner.js';
import {ProfileSchema} from '../src/profile-store.js';
import {assertSupportedForm,inspectSupport} from '../src/browser/planning/capabilities.js';
import {manualTasks,fieldMissing} from '../src/browser/manual-policy.js';

let browser:any;
beforeAll(async()=>{
  const {puppeteer}=await import(pathToFileURL(resolve('runtime/chrome-devtools-mcp/build/src/third_party/index.js')).href);
  browser=await puppeteer.launch({channel:'chrome',headless:true,pipe:true,args:['--no-sandbox']});
},20_000);
afterAll(async()=>{await browser?.close();});

test('a required native radio question is one manual task and an existing no answer satisfies the group',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<fieldset><legend>是否有亲属在本公司工作</legend><label><input type="radio" name="relative" value="yes" required>是</label><label><input type="radio" name="relative" value="no">否</label></fieldset>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  let raw=(await engine.captureRun(1)).raw;
  expect(manualTasks(raw)).toEqual([expect.objectContaining({field:'是否有亲属在本公司工作',required:true,state:'pending',blocks_navigation:true})]);
  await page.click('input[value="no"]');
  raw=(await engine.captureRun(1)).raw;
  expect(manualTasks(raw)).toEqual([expect.objectContaining({state:'already_present',blocks_navigation:false})]);
  expect(raw.fields.filter(fieldMissing)).toEqual([]);
  expect(raw.fields.some(f=>f.checked===false)).toBe(true);
 }finally{await page.close();}
});

test('attachments across ordinary form layouts stay manual and a selected filename is not upload confirmation',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<section aria-label="附件"><div class="ant-form-item"><label for="file">学历证明</label><input id="file" type="file" required style="display:none"></div></section>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  let raw=(await engine.captureRun(1)).raw;
  expect(raw.fields.some(f=>f.type==='file')).toBe(false);
  expect(manualTasks(raw)).toContainEqual(expect.objectContaining({field:'学历证明',reason:'attachment',required:true,state:'pending'}));
  await page.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['synthetic'],'private-filename-sentinel.pdf'));document.querySelector<HTMLInputElement>('#file')!.files=transfer.files;});
  raw=(await engine.captureRun(1)).raw;
  expect(manualTasks(raw)).toContainEqual(expect.objectContaining({state:'verification_required',blocks_navigation:true}));
  expect(JSON.stringify(raw.attachments)).not.toContain('private-filename-sentinel');
  await page.evaluate(()=>{const done=document.createElement('div');done.className='ant-upload-list-item-done';done.textContent='已上传';document.querySelector('.ant-form-item')!.append(done);});
  raw=(await engine.captureRun(1)).raw;
  expect(manualTasks(raw)).toContainEqual(expect.objectContaining({state:'already_present',blocks_navigation:false}));
 }finally{await page.close();}
});
const legacy = `<div class="corner_right"><h1>个人信息</h1>
 <dl><dt>姓名 *</dt><dd><input id="cc_Cname_1_1" name="cc_Cname_1_1"><label><font>姓名不能为空!</font></label></dd></dl>
 <dl><dt>出生日期 *</dt><dd><select><option value="0">----</option><option>2001</option><option>2002</option></select>年<select><option value="0">--</option><option>01</option><option>08</option></select>月</dd></dl>
 <dl><dt>籍贯 *</dt><dd><select><option>--请选择--</option><option>浙江</option></select><select><option>--请选择--</option><option>杭州</option></select></dd></dl>
 <input type="submit" id="imgbtnNext" title="Next" value="">
 </div>`;

test('live template checks fence explicit runs and direct writes after the page changes',async()=>{
 const page=await browser.newPage();try{
  // Intercept the whole document; this test never contacts the recruitment site.
  await page.setRequestInterception(true);
  page.on('request',(request:any)=>void request.respond({status:200,contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><div class="applyFormModuleWrapper__test"><h2 class="applyFormModuleWrapper-title">基本信息</h2><input id="name" aria-label="姓名"></div>'}));
  await page.goto('https://jobs.bytedance.com/campus/resume/edit');
  const engine=new FormEngine(()=>({pptrPage:page}),assertSupportedForm),catalog=await engine.capturePlanning(1);
  expect(inspectSupport(catalog.raw).autofill_allowed,JSON.stringify(inspectSupport(catalog.raw))).toBe(true);
  const plan={schema_version:1,page_id:1,navigation_id:catalog.navigation_id,observation_id:catalog.observation_id,profile_revision:'virtual@1',facts:{f:{value:'虚拟用户',source:'user-provided'}},records:[{id:'r',section:'基本信息',mode:'existing',binding:catalog.records[0]!.binding,steps:[{id:'s',action:'fill',field:'姓名',source_ref:'f'}]}]};
  const runner=new FormRunner(),started=runner.start('owner','support-fence',plan);
  await page.evaluate(()=>{const added=document.createElement('input');added.required=true;added.setAttribute('aria-label','企业新增必填问卷');document.querySelector('.applyFormModuleWrapper__test')!.append(added);});
  const direct=await engine.fillFields({pageId:1,fields:[{field:'姓名',value:'不应写入'}]});
  expect(direct.structuredContent.error.code).toBe('form_not_supported');
  expect(direct.structuredContent.error.support.differences).toContainEqual(expect.objectContaining({code:'unknown_required_field'}));
  const run=await runner.executeWindow('owner',started.run_id as string,engine);
  expect(run.error).toEqual({code:'form_not_supported'});expect(await page.$eval('#name',(e:HTMLInputElement)=>e.value)).toBe('');
  await page.$eval('input[required]',(e:Element)=>e.remove());
  runner.resume('owner',started.run_id as string);
  const resumed=await runner.executeWindow('owner',started.run_id as string,engine);
  expect(resumed.status).toBe('completed');expect(await page.$eval('#name',(e:HTMLInputElement)=>e.value)).toBe('虚拟用户');
 }finally{await page.close();}
});

test('a single page fills all ordinary fields before reporting a required employer-relative question',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>个人信息</h1>
   <dl><dt>是否有亲属受雇本公司 *</dt><dd><select id="relative"><option value="">请选择</option><option>否</option></select></dd></dl>
   <dl><dt>姓名 *</dt><dd><input id="name"></dd></dl>
   <dl><dt>性别 *</dt><dd><select id="gender"><option value="">请选择</option><option>女</option></select></dd></dl>
   <input type="submit" id="imgbtnSave" title="Save"></div>`);
  const engine=new FormEngine(()=>({pptrPage:page}));
  const catalog=await engine.capturePlanning(1);
  const profile=ProfileSchema.parse({schema_version:'1.1',profile_id:'virtual',revision:1,basic:{full_name:'虚拟用户',gender:'女',email:null,phone:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:[]});
  const compilation=compilePlan(catalog,profile,policySchema.parse({}));
  const runner=new FormRunner(),start=runner.start('owner','single-page',compilation.plan);
  const result=await runner.executeWindow('owner',start.run_id as string,engine);
  expect(result.counts).toEqual({verified_ui:2});
  expect(result.status).toBe('partial'); // required manual item remains, not a full completion claim
  expect((result.page_audit as any).manual_tasks).toContainEqual(expect.objectContaining({field:'是否有亲属受雇本公司',state:'pending',required:true}));
  expect(await page.$$eval('#relative,#name,#gender',(els:HTMLInputElement[])=>els.map(e=>e.value))).toEqual(['','虚拟用户','女']);
 }finally{await page.close();}
});

test('manual policy blocks semantic choices, field references and raw UID batches without touching ordinary family fields',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>个人信息</h1>
   <dl><dt>姓名</dt><dd><input id="ordinary"></dd></dl>
   <dl><dt>是否有亲属受雇本公司 *</dt><dd><select id="relative"><option value="">请选择</option><option>否</option><option>是</option></select></dd></dl>
   <dl><dt>是否同意提供身份证号码</dt><dd><select id="consent"><option value="">请选择</option><option>是</option></select></dd></dl>
   <fieldset><legend>是否有亲属在本公司工作</legend><label>部门<input id="department"></label><label><input type="radio" id="radio" name="relative">否</label></fieldset>
   <input id="imgbtnNext" type="submit" title="Next"></div>
   <section aria-label="家庭关系"><label>亲属姓名<input id="family"></label></section>`);
  const engine=new FormEngine(()=>({pptrPage:page}));
  const observation=(await engine.observe({page_id:1,mode:'overview'})).structuredContent;
  const ref=observation.fields.find((f:any)=>f.label==='是否有亲属受雇本公司').ref;
  expect((await engine.selectOption({pageId:1,field:ref,value:'否'})).structuredContent.error.code).toBe('manual_boundary');
  expect((await engine.selectOption({pageId:1,field:'是否同意提供身份证号码',value:'是'})).structuredContent.error.code).toBe('manual_boundary');
  expect((await engine.fillFields({pageId:1,fields:[{field:'部门',value:'不应写入'}]})).structuredContent.results[0].status).toBe('manual_boundary');
  const rawPage={pptrPage:page,getElementByUid:async(uid:string)=>page.$(`#${uid}`)};
  await expect(guardLowLevelAction('fill_form',{elements:[{uid:'ordinary',value:'测试'},{uid:'relative',value:'否'}]},rawPage)).rejects.toThrow('manual_boundary');
  await expect(guardLowLevelAction('click',{uid:'radio',semantic_target:'普通字段'},rawPage)).rejects.toThrow('manual_boundary');
  await page.focus('#department');
  await expect(guardLowLevelAction('type_text',{text:'不应写入'},rawPage)).rejects.toThrow('manual_boundary');
  await expect(guardLowLevelAction('evaluate_script',{function:'()=>document.body.remove()'},rawPage)).rejects.toThrow('controlled_mode_script_disabled');
  expect(await page.$$eval('#ordinary,#relative,#department,#consent',(els:HTMLInputElement[])=>els.map(e=>e.value))).toEqual(['','','','']);
  expect(await page.$eval('#radio',(el:HTMLInputElement)=>el.checked)).toBe(false);
  const ordinary=await engine.fillFields({pageId:1,fields:[{field:'亲属姓名',scope:'家庭关系',value:'虚构家人'}]});
  expect(ordinary.structuredContent.ok,JSON.stringify(ordinary)).toBe(true);
  await expect(guardLowLevelAction('fill',{uid:'family'},rawPage)).resolves.toBeUndefined();
 }finally{await page.close();}
});

test('bank education preserves three semantic slots and keeps required reports outside degree records',async()=>{
 const page=await browser.newPage();try{
  const row=(label:string,control='<input>')=>`<dl><dt>${label}</dt><dd>${control}</dd></dl>`;
  await page.setContent(`<div class="corner_right"><h1>教育背景</h1>
   ${row('高中毕业学校')}${row('高中入学时间')}${row('高中毕业时间')}
   ${row('最高学历','<select><option>硕士</option></select>')}
   ${row('最高学历毕业学校','<select><option>其他院校</option></select><select><option>其他院校</option></select>')}
   ${row('最高学历专业')}${row('学信网报告 *','<input type="file">')}
   ${row('其他学历2','<select><option>本科</option></select>')}${row('毕业学校2')}${row('专业2')}
   ${row('本科学信网报告 *','<input type="file">')}
   <input type="submit" id="imgbtnNext" title="Next"></div>`);
  const engine=new FormEngine(()=>({pptrPage:page})),c=await engine.capturePlanning(1);
  expect(c.raw.fields.find(f=>f.label==='毕业学校'&&f.educationSlot==='high_school')?.scope).toBe('教育背景 / 第1条');
  expect(c.raw.fields.find(f=>f.label==='毕业学校 / 类型'&&f.educationSlot==='highest')?.scope).toBe('教育背景 / 第2条');
  expect(c.raw.fields.find(f=>f.label==='专业'&&f.educationSlot==='other')?.scope).toBe('教育背景 / 第3条');
  expect(c.raw.fields.find(f=>f.label==='最高学历')).toMatchObject({scope:'教育背景'});
  // Upload controls are excluded from writable fields; their page gates must
  // still remain visible to the coordinator.
  expect(c.raw.fields.filter(f=>f.type==='file')).toEqual([]);
  expect(c.raw.workflow?.manual).toEqual(['学信网报告','本科学信网报告']);
 }finally{await page.close();}
});

test('51job exposes human labels, required errors, navigation actions and dates without treating city pairs as dates',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(legacy);
  const engine=new FormEngine(()=>({pptrPage:page}));
  const observed=(await engine.observe({page_id:1,mode:'overview'})).structuredContent;
  expect(observed.fields.find((f:any)=>f.label==='姓名')).toMatchObject({required:true,invalid:true,error:'姓名不能为空!'});
  expect(observed.validations).toContain('姓名不能为空!');
  expect(observed.fields.find((f:any)=>f.label==='下一步')).toMatchObject({kind:'button'});
  expect(observed.fields.filter((f:any)=>f.kind==='date_group').map((f:any)=>f.label)).toEqual(['出生日期']);
  expect(observed.fields.find((f:any)=>f.label==='籍贯 / 省份')).toMatchObject({state:'blank'});
  expect(observed.fields.find((f:any)=>f.label==='籍贯 / 城市')).toMatchObject({state:'blank'});
  const selected=(await engine.selectOption({pageId:1,field:'籍贯 / 省份',scope:'个人信息',value:'浙江'})).structuredContent;
  expect(selected.ok,JSON.stringify(selected)).toBe(true);
  expect(await page.$eval('dl:nth-of-type(3) select',(el:HTMLSelectElement)=>el.selectedOptions[0]!.textContent)).toBe('浙江');
  const result=(await engine.setDate({pageId:1,field:'出生日期',scope:'个人信息',value:'2001-08'})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(await page.$$eval('dl:nth-of-type(2) select',(els:HTMLSelectElement[])=>els.map(el=>el.value))).toEqual(['2001','08']);
 }finally{await page.close();}
},15_000);

test('51job next step activates a native submit button and detects a new form at the same URL',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(legacy);
  await page.evaluate(()=>document.getElementById('imgbtnNext')!.addEventListener('click',()=>{
   document.querySelector('.corner_right')!.innerHTML='<h1>教育经历</h1><dl><dt>学校 *</dt><dd><input></dd></dl><input type="submit" id="imgbtnPrevious" title="Previous">';
  }));
  const engine=new FormEngine(()=>({pptrPage:page}));
  await engine.observe({page_id:1,mode:'overview'});
  const url=page.url();
  const result=(await engine.activate({pageId:1,target:'下一步',intent:'next_step'})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(result.structure_changed).toBe(true);
  expect(page.url()).toBe(url);
  expect((await engine.observe({page_id:1,mode:'overview'})).structuredContent.sections).toContain('教育经历');
 }finally{await page.close();}
});

test('closing a modal clicks its Cancel button and verifies removal rather than claiming a button is not expanded',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<h1>个人信息</h1><input aria-label="学校"><div role="dialog" style="position:fixed;inset:0;background:white"><input placeholder="请输入学校名称"><button onclick="this.parentElement.remove()">取消</button></div>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  await engine.observe({page_id:1,mode:'overview'});
  const result=(await engine.activate({pageId:1,target:'取消',intent:'close'})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(await page.$('[role=dialog]')).toBeNull();
  await page.setContent('<div role="dialog"><button>取消</button></div>');
  await engine.observe({page_id:1,mode:'overview'});
  const failed=(await engine.activate({pageId:1,target:'取消',intent:'close'})).structuredContent;
  expect(failed.ok).toBe(false);
  expect(failed.error.code).toBe('postcondition_failed');
 }finally{await page.close();}
},10_000);

test('a hidden iframe cannot contribute calendar internals to the visible form catalog',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<h1>个人信息</h1><input aria-label="姓名"><div style="display:none"><iframe srcdoc="<input aria-label=隐藏日期>"></iframe></div>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  const observed=(await engine.observe({page_id:1,mode:'overview'})).structuredContent;
  expect(observed.fields.map((f:any)=>f.label)).toEqual(['姓名']);
 }finally{await page.close();}
});

test('51job fixed education slots keep labels and record identities distinct',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>教育经历</h1><div class="ci">
   <dl><dt>最高学历 *</dt><dd><select><option value="">--请选择--</option><option>本科</option></select></dd></dl>
   <dl><dt>毕业学校 *</dt><dd><input></dd></dl><dl><dt>专业 *</dt><dd><input></dd></dl>
   <dl><dt>其他学历</dt><dd><select><option value="">--请选择--</option><option>高中</option></select></dd></dl>
   <dl><dt>毕业学校2</dt><dd><input></dd></dl><dl><dt>专业2</dt><dd><input></dd></dl>
   </div><input id="imgbtnNext" type="submit" title="Next"></div>`);
  const engine=new FormEngine(()=>({pptrPage:page}));const c=await engine.capturePlanning(1);
  expect(c.records.map(r=>r.scope)).toEqual(['教育经历 / 第1条','教育经历 / 第2条']);
  expect(c.raw.fields.filter(f=>f.label==='毕业学校').map(f=>f.scope)).toEqual(['教育经历 / 第1条','教育经历 / 第2条']);
  expect(c.raw.records).toHaveLength(2);
 }finally{await page.close();}
});

test('51job repeated cards expose only the final Add and newly added record identity',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>实习/工作经验</h1><div id="container">
   ${[1,2].map(()=>'<div class="ci"><div class="tb"><input class="btnAppend" type="button" title="添加" onclick="this.closest(\'.ci\').after(this.closest(\'.ci\').cloneNode(true))"></div><dl><dt>公司名称</dt><dd><input></dd></dl></div>').join('')}
   </div><input id="imgbtnNext" type="submit" title="Next"></div>`);
  const engine=new FormEngine(()=>({pptrPage:page}));const c=await engine.capturePlanning(1);
  expect(c.raw.fields.filter(f=>f.label==='添加')).toHaveLength(1);
  expect(c.raw.records).toHaveLength(2);
  const r=(await engine.activate({pageId:1,scope:'实习/工作经验',target:'添加',intent:'add_record'})).structuredContent;
  expect(r.ok,JSON.stringify(r)).toBe(true);expect(r.added_records[0].scope).toBe('实习/工作经验 / 第3条');
 }finally{await page.close();}
});

test('51job autocomplete treats typed search as draft and verifies the committed backing select',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>教育经历</h1><dl><dt>毕业学校</dt><dd><select data-dict="school" style="display:none"><option value="">--请选择--</option><option value="test">测试学校</option></select><span class="custom-combobox"><input class="custom-combobox-input"></span></dd></dl><input type="submit" id="imgbtnNext" title="Next"></div><ul class="ui-autocomplete" style="display:none"><li class="ui-menu-item">测试学校</li></ul>`);
  await page.evaluate(()=>{
   const input=document.querySelector<HTMLInputElement>('.custom-combobox-input')!,menu=document.querySelector<HTMLElement>('.ui-autocomplete')!,select=document.querySelector('select')!;
   input.oninput=()=>menu.style.display=input.value?'block':'none';
   menu.querySelector('li')!.onclick=()=>{select.value='test';input.value='测试学校';menu.style.display='none';};
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  await page.type('.custom-combobox-input','测试');
  const draft=await engine.capturePlanning(1);expect(draft.raw.fields.find(f=>f.label==='毕业学校')).toMatchObject({value:'',pendingInput:true,inputMode:'choice'});
  await page.$eval('.custom-combobox-input',(el:HTMLInputElement)=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const result=(await engine.selectOption({pageId:1,field:'毕业学校',scope:'教育经历',value:'测试学校'})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);expect(await page.$eval('select',(el:HTMLSelectElement)=>el.value)).toBe('test');
 }finally{await page.close();}
});

test('My97 iframe calendar uses actual day selection and refuses month-only facts',async()=>{
 const {createServer}=await import('node:http');
 const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html; charset=utf-8');
  if(req.url?.includes('My97DatePicker.htm'))res.end(`<div><div class="MMenu"></div><input class="yminput" value="9" onchange="render();document.querySelector('.YMenu').style.display='block'"></div><div><div class="YMenu"></div><input class="yminput" value="2026" onchange="render()"></div><table><tbody><tr class="MTitle"><td onclick="document.querySelector('.YMenu').style.display='none'">日</td></tr></tbody><tbody id="days"></tbody></table><script>
  function render(){const m=Number(document.querySelector('.MMenu+input').value),y=Number(document.querySelector('.YMenu+input').value);document.querySelector('#days').innerHTML='<tr>'+Array.from({length:new Date(y,m,0).getDate()},(_,i)=>'<td onclick="day_Click('+y+','+m+','+(i+1)+');">'+(i+1)+'</td>').join('')+'</tr>';}function day_Click(y,m,d){if(document.querySelector('.YMenu').style.display==='block')return;parent.document.querySelector('#date').value=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');parent.document.querySelector('iframe').style.top='-1970px';parent.document.querySelector('iframe').style.left='-1970px';}render();</script>`);
  else res.end(`<div class="corner_right"><h1>教育经历</h1><dl><dt>毕业时间 *</dt><dd><input id="date" readonly onfocus="setday(this);"></dd></dl><input type="submit" id="imgbtnNext" title="Next"></div><iframe src="/My97DatePicker/My97DatePicker.htm" style="position:absolute;top:-1970px;left:-1970px;width:650px;height:180px"></iframe><script>function setday(){document.querySelector('iframe').style.top='100px';document.querySelector('iframe').style.left='0';}</script>`);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const page=await browser.newPage();
 try{
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  const engine=new FormEngine(()=>({pptrPage:page}));
  expect((await engine.capturePlanning(1)).raw.fields.every(f=>f.frame===0)).toBe(true);
  const rejected=(await engine.setDate({pageId:1,field:'毕业时间',value:'2024-06'})).structuredContent;
  expect(rejected.ok).toBe(false);expect(rejected.error.code).toBe('precision_mismatch');expect(await page.$eval('#date',(el:HTMLInputElement)=>el.value)).toBe('');
  const result=(await engine.setDate({pageId:1,field:'毕业时间',value:'2024-06-30',signal:AbortSignal.timeout(6500)})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);expect(await page.$eval('#date',(el:HTMLInputElement)=>el.value)).toBe('2024-06-30');
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},15_000);

test('low-level pointer guard centers a covered Add and refuses a persistent consent overlay',async()=>{
 const {preparePointerTarget}=await import('../src/browser/pointer-target.js');
 const page=await browser.newPage();try{
  await page.setContent('<div style="height:1500px"></div><button id="add">添加家庭关系</button><div style="height:1000px"></div><label id="footer" style="position:fixed;bottom:0;left:0;width:100%;height:100px;background:white"><input id="consent" type="checkbox">隐私声明</label>');
  const target=await page.$('#add');await preparePointerTarget(target);await target.click();
  expect(await page.$eval('#consent',(el:HTMLInputElement)=>el.checked)).toBe(false);
  await page.$eval('#footer',(el:HTMLElement)=>{el.style.inset='0';el.style.height='100vh';});
  await expect(preparePointerTarget(target)).rejects.toThrow('target_obscured');
  expect(await page.$eval('#consent',(el:HTMLInputElement)=>el.checked)).toBe(false);await target.dispose();
 }finally{await page.close();}
});

test.each(['','硕士'])('51job %s Other-school fallback commits the supplied name to its paired field',async(prefix)=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="corner_right"><h1>教育经历</h1><dl><dt>${prefix}毕业学校</dt><dd><select data-dict="school" style="display:none"><option value="">--请选择--</option><option value="other">其他院校</option></select><span class="custom-combobox"><input class="custom-combobox-input"></span></dd></dl><dl><dt>${prefix}其他学校</dt><dd><input id="other"></dd></dl><input type="submit" id="imgbtnNext" title="Next"></div><ul class="ui-autocomplete" style="display:none"><li class="ui-menu-item" aria-disabled="true">没有找到合适的结果，请选择其他院校</li><li class="ui-menu-item" id="choice">其他院校</li></ul>`);
  await page.evaluate(()=>{
   const input=document.querySelector<HTMLInputElement>('.custom-combobox-input')!,menu=document.querySelector<HTMLElement>('.ui-autocomplete')!,select=document.querySelector('select')!;
   input.oninput=()=>menu.style.display=input.value?'block':'none';
   document.getElementById('choice')!.onclick=()=>{select.value='other';input.value='其他院校';menu.style.display='none';};
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.selectOption({pageId:1,field:`${prefix}毕业学校`,scope:'教育经历',value:'虚拟未知学校',allowCustom:true})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  const actual=(await engine.capturePlanning(1)).raw.fields.find(f=>f.label===`${prefix}毕业学校`);
  expect(actual).toMatchObject({value:'虚拟未知学校',pendingInput:false,relatedFields:[`${prefix}其他学校`]});
  expect(await page.$eval('#other',(el:HTMLInputElement)=>el.value)).toBe('虚拟未知学校');
 }finally{await page.close();}
});

test('Guopin editor scopes nested labels, radio buttons and an Ant month range to its module',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(request:any)=>request.respond({status:200,contentType:'text/html; charset=utf-8',body:`<div class="resume-left-content"><div class="item-section education-section" id="education"><div class="section-title"><h2>教育经历</h2></div><div class="item-section-content-multiple"><div class="edit-section"><form>
   <div class="ant-form-item resume-common-form-item"><div class="ant-form-item-row"><div class="ant-form-item-label"><label class="ant-form-item-required">学校名称<span class="tip">（提示不能进入字段名称）</span></label></div><div class="ant-form-item"><input></div></div></div>
   <div class="ant-form-item resume-common-form-item"><div class="ant-form-item-row"><div class="ant-form-item-label"><label>全日制</label></div><div class="ant-radio-group"><label class="ant-radio-button-wrapper ant-radio-button-wrapper-checked"><input type="radio" checked>全日制</label><label class="ant-radio-button-wrapper"><input type="radio">非全日制</label></div></div></div>
   <div class="ant-form-item resume-common-form-item"><div class="ant-form-item-row"><div class="ant-form-item-label"><label>就读年月</label></div><div class="ant-picker ant-picker-range"><input value="2020-09" readonly><input value="2024-06" readonly></div></div></div>
   <button type="button">保 存</button></form></div></div></div></div>`}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  const engine=new FormEngine(()=>({pptrPage:page})),c=await engine.capturePlanning(1);
  expect(c.raw.fields.find(f=>f.label==='学校名称')).toMatchObject({scope:'教育经历 / 第1条',plannerFamily:'guopin'});
  expect(c.raw.fields.find(f=>f.label==='全日制')).toMatchObject({value:'全日制',inputMode:'choice'});
  expect(c.raw.fields.filter(f=>f.role==='date-group')).toEqual([expect.objectContaining({label:'就读年月',value:'2020-09 / 2024-06'})]);
  expect(c.raw.fields.some(f=>f.label==='保存'&&f.role==='button')).toBe(true);
  expect(c.raw.records).toHaveLength(1);
 }finally{await page.close();}
});

test('51job distinguishes compound employer controls and preserves an already user-completed consent',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="cornercol1"><h1>个人信息</h1><dl><dt>身份证号 *</dt><dd><select><option>国外身份证</option></select><input></dd></dl><dl><dt>专业技术资格 *</dt><dd><select><option>无</option></select><select></select><select></select></dd></dl><dl><dt>是否同意提供身份证号码 *</dt><dd><select id="consent"><option value="">--请选择--</option><option value="yes">同意</option></select></dd></dl><input id="imgbtnNext" type="submit" title="Next"></div>`);
  const engine=new FormEngine(()=>({pptrPage:page}));let c=await engine.capturePlanning(1);
  expect(c.raw.fields.filter(f=>f.label.startsWith('身份证号')).map(f=>f.label)).toEqual(['身份证号 / 类型','身份证号 / 号码']);
  expect(c.raw.fields.filter(f=>f.label.startsWith('专业技术资格')).map(f=>f.label)).toEqual(['专业技术资格 / 类型','专业技术资格 / 类别','专业技术资格 / 明细']);
  expect(c.raw.workflow!.manual).toEqual(['是否同意提供身份证号码']);
  await page.select('#consent','yes');c=await engine.capturePlanning(1);
  expect(c.raw.workflow!.manual).toEqual([]);expect(await page.$eval('#consent',(e:HTMLSelectElement)=>e.value)).toBe('yes');
 }finally{await page.close();}
});


test('an open virtual Ant select searches earlier entries after a prior failed search left it scrolled',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<div class="ant-form-item"><label>学制</label><div class="ant-select ant-select-open"><span class="ant-select-selection-item"></span><input role="combobox" aria-controls="years" aria-expanded="true"></div></div><div class="ant-select-dropdown" id="years"><div class="rc-virtual-list-holder" style="height:80px;overflow:auto"><div style="height:600px"><div id="entries" style="position:relative"></div></div></div></div>');
  await page.evaluate(()=>{
   const holder=document.querySelector<HTMLElement>('.rc-virtual-list-holder')!,entries=document.querySelector<HTMLElement>('#entries')!;
   const render=()=>{entries.innerHTML='';entries.style.top=holder.scrollTop+'px';for(const n of holder.scrollTop<100?[1,2,3]:[8,9]){const el=document.createElement('div');el.className='ant-select-item-option';el.style.height='24px';el.textContent=n+'年';el.onclick=()=>{document.querySelector('.ant-select-selection-item')!.textContent=el.textContent;document.querySelector<HTMLElement>('#years')!.style.display='none';document.querySelector('input')!.setAttribute('aria-expanded','false');document.querySelector('.ant-select')!.classList.remove('ant-select-open');};entries.append(el);}};
   holder.onscroll=render;holder.scrollTop=520;render();
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.selectOption({pageId:1,field:'学制',value:'3年'})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(await page.$eval('.ant-select-selection-item',(e:Element)=>e.textContent)).toBe('3年');
 }finally{await page.close();}
});


test('51job completed photo preview clears only that upload boundary',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<div class="cornercol1"><h1>个人信息</h1><dl><dt>照片 *</dt><dd><input type="file"><img id="imgPreview" style="display:none" width="110" height="150"></dd></dl><dl><dt>身份证附件 *</dt><dd><input type="file"></dd></dl><input id="imgbtnNext" type="submit" title="Next"></div>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  expect((await engine.capturePlanning(1)).raw.workflow!.manual).toEqual(['照片','身份证附件']);
  await page.evaluate(async()=>{const img=document.querySelector<HTMLImageElement>('#imgPreview')!;img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';await img.decode();img.style.display='block';});
  expect((await engine.capturePlanning(1)).raw.workflow!.manual).toEqual(['身份证附件']);
  await page.$eval('#imgPreview',(img:HTMLElement)=>img.style.display='none');
  expect((await engine.capturePlanning(1)).raw.workflow!.manual).toEqual(['照片','身份证附件']);
 }finally{await page.close();}
});


test('51job journey locally replans after highest degree reveals level-specific education slots',async()=>{
 const {FormJourney}=await import('../src/browser/form-journey.js');
 const {ProfileSchema}=await import('../src/profile-store.js');
 const {policySchema}=await import('../src/browser/planning/compiler.js');
 const page=await browser.newPage();try{
  const makeRow=(id:string,level:string)=>({id,school:id+'虚构学校',major:null,education_level:level,degree:null,expected_degree:null,completed:true,study_mode:'full_time',start_month:null,end_month:null,is_current:false,is_expected_end:false});
  const profile=ProfileSchema.parse({schema_version:'1.2',profile_id:'virtual',revision:1,basic:{full_name:null,email:null,phone:null,city:null,job_intention:null,self_description:'纯虚构测试'},education:[makeRow('b','bachelor'),makeRow('m','master')],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:['b','m'].map(id=>({id:'supp-'+id,field_key:`education.${id}.enrolled_unified`,label:'统招',description:'测试事实',value_type:'text',value:'是'}))});
  await page.setContent('<ul><li class="leftli2"><span class="lispan">教育经历</span></li><li class="leftli1"><span class="lispan">自我评价</span></li></ul><div class="cornercol1"><h1>教育经历</h1><dl><dt>最高学历 *</dt><dd><select id="degree"><option value="">--请选择--</option><option>本科</option><option>硕士</option></select></dd></dl><div id="degrees" style="display:none">'+['硕士','本科'].map(level=>`<dl><dt>${level}是否统招 *</dt><dd><select><option value="">--请选择--</option><option>是</option><option>否</option></select></dd></dl><dl><dt>${level}毕业学校 *</dt><dd><input></dd></dl>`).join('')+'</div><input type="button" id="imgbtnNext" title="Next"></div>');
  await page.evaluate(()=>{
   document.querySelector<HTMLSelectElement>('#degree')!.onchange=()=>{document.querySelector<HTMLElement>('#degrees')!.style.display='block';};
   document.querySelector<HTMLInputElement>('#imgbtnNext')!.onclick=()=>{
    document.body.dataset.saved=JSON.stringify(Array.from(document.querySelectorAll('#degrees input')).map(e=>(e as HTMLInputElement).value));
    const steps=document.querySelectorAll('li');steps[0]!.className='leftli1';steps[1]!.className='leftli2';
    document.querySelector('.cornercol1')!.innerHTML='<h1>自我评价</h1><dl><dt>自我评价</dt><dd><textarea></textarea></dd></dl><input type="button" id="imgbtnSave" title="Save"><input type="button" id="imgbtnSubmit" title="Submit">';
   };
  });
  const engine=new FormEngine(()=>({pptrPage:page})),catalog=await engine.capturePlanning(1);
  catalog.raw.url='https://xyz.51job.com/External/MyResume/FillInResume.aspx?CtmID=test';
  const capture=engine.captureRun.bind(engine);engine.captureRun=async(...args)=>{const result=await capture(...args);result.raw.url=catalog.raw.url;return result;};
  const journey=new FormJourney(),entry=journey.start('test','conditional-degrees',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},catalog.raw);
  const result=await journey.execute('test',entry.journey_id,engine,async()=>profile);
  expect(result.status,JSON.stringify(result)).toBe('ready_for_review');
  expect(await page.evaluate(()=>document.body.dataset.saved)).toBe(JSON.stringify(['m虚构学校','b虚构学校']));
  expect(await page.$eval('textarea',(el:HTMLTextAreaElement)=>el.value)).toBe('纯虚构测试');
 }finally{await page.close();}
},20_000);

test('Dayee keeps one select during search and assigns incomplete city validation to the child',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<form class="ant-form"><div class="form-cell"><div class="tit-wrap"><div class="tit"><p>个人基本信息</p></div></div><div class="form-cell-right"><div class="ant-form-item"><div class="ant-form-item-label"><label>籍贯</label></div><div class="ant-form-item-control has-error"><div class="cascader-plugins-wrap"><div class="ant-select"><div role="combobox"><span class="ant-select-selection-selected-value">浙江省</span><input class="ant-select-search__field"></div></div><div class="ant-select"><div role="combobox"><input class="ant-select-search__field"></div></div></div><div class="ant-form-explain">请选择籍贯</div></div></div></div></div></form>`);
  const engine=new FormEngine(()=>({pptrPage:page}));const raw=(await engine.capturePlanning(1)).raw;
  expect(raw.fields.map(f=>f.label)).toEqual(['籍贯 / 省份','籍贯 / 城市']);
  expect(raw.fields[0]).toMatchObject({value:'浙江省',invalid:false,error:''});
  expect(raw.fields[1]).toMatchObject({invalid:true,error:'请选择籍贯'});
  expect(raw.validations).toContain('请选择籍贯');
 }finally{await page.close();}
});

test('Guopin observes saved project anchors and one writable end date without its display proxy',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(request:any)=>request.respond({status:200,contentType:'text/html; charset=utf-8',body:`<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>项目经历</h2></div><div class="item-section-content-multiple"><div class="item-section-tpl"><div class="project_name-field"><strong>已保存项目</strong></div><div class="period-field"><span>2024-01至今</span></div><button>编辑</button></div><div class="edit-section"><div class="resume-common-form-item rangepicker-period"><div class="ant-form-item-row"><div class="ant-form-item-label"><label>起止时间</label></div><div class="ant-picker"><input placeholder="开始时间" value="2024-01" readonly></div><div class="period-end"><div class="period-end-temp"><input placeholder="结束时间" value="至今" readonly></div><div class="period-end-date"><div class="ant-picker"><input placeholder="结束时间" readonly></div></div></div></div></div></div></div></div></div>`}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  const engine=new FormEngine(()=>({pptrPage:page}));const c=await engine.capturePlanning(1);
  expect(c.raw.fields.find(f=>f.label==='项目名称')).toMatchObject({scope:'项目经历 / 第1条',value:'已保存项目',disabled:true,readonly:true});
  expect(c.raw.fields.find(f=>f.label==='起止时间')).toMatchObject({value:'2024-01 / 至今',disabled:true});
  expect(c.raw.fields.filter(f=>f.label==='起止时间 / 结束')).toEqual([expect.objectContaining({scope:'项目经历 / 第2条',value:'至今',inputMode:'date',readonly:true})]);
  expect(c.records.map(r=>r.scope).sort()).toEqual(['项目经历 / 第1条','项目经历 / 第2条']);
 }finally{await page.close();}
});

test('semantic activation adds once when background intersection observation is suspended',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<div style="height:1200px"></div><section aria-label="项目经历"><div id="records"></div><button id="add">添加</button></section><div style="height:800px"></div>');
  await page.evaluate(()=>{
   // Background Chrome can stop delivering IntersectionObserver callbacks.
   window.IntersectionObserver=class {observe(){}unobserve(){}disconnect(){}takeRecords(){return [];}readonly root=null;readonly rootMargin='0px';readonly thresholds=[];} as unknown as typeof IntersectionObserver;
   document.querySelector<HTMLButtonElement>('#add')!.onclick=(event)=>{
    if(!event.isTrusted)throw new Error('trusted_pointer_required');
    document.querySelector('#records')!.insertAdjacentHTML('beforeend','<div data-record-label="项目经历 / 第1条"><label>项目名称<input></label></div>');
   };
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.activate({pageId:1,scope:'项目经历',target:'添加',intent:'add_record',operationId:'background-add'})).structuredContent;
  expect(result,JSON.stringify(result)).toMatchObject({ok:true});
  await engine.activate({pageId:1,scope:'项目经历',target:'添加',intent:'add_record',operationId:'background-add'});
  expect(await page.$$eval('#records > div',(nodes:Element[])=>nodes.length)).toBe(1);
 }finally{await page.close();}
},10_000);

test('Guopin nested required taxonomy control selects a literal-slash path in its owned modal',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(request:any)=>request.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>工作/实习经历</h2></div><div class="item-section-content-multiple"><div class="edit-section"><div class="ant-form-item resume-common-form-item cascader-modal-field"><div class="ant-form-item-row"><div class="ant-form-item-label"><label class="ant-form-item-required">所属行业</label></div><div class="ant-form-item"><div id="trigger" class="ant-select ant-cascader"><input readonly role="combobox" aria-expanded="false"><span class="ant-select-selection-placeholder">请选择所属行业</span></div></div></div></div></div></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  await page.evaluate(()=>{
   document.querySelector<HTMLElement>('#trigger')!.onclick=()=>{
    const modal=document.createElement('div');modal.className='my-cascader-modal';modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;inset:0;background:white';
    modal.innerHTML='<div class="title-search"><span class="ant-select-selection-placeholder">请选择所属行业</span></div><div class="flat-left"><div class="level-item">互联网/IT/电子/通信</div></div><div class="label-path"><span class="path-item"><span>不限</span></span></div><div class="flat-leaf"></div>';document.body.append(modal);
    modal.querySelector<HTMLElement>('.level-item')!.onclick=()=>{
     modal.querySelector('.path-item > span')!.textContent='互联网/IT/电子/通信';
     modal.querySelector('.flat-leaf')!.innerHTML='<div class="leaf-item">计算机软件</div>';
     modal.querySelector<HTMLElement>('.leaf-item')!.onclick=()=>{
      const placeholder=document.querySelector('#trigger > span')!;placeholder.className='ant-select-selection-item';placeholder.textContent='互联网/IT/电子/通信 / 计算机软件';modal.remove();
     };
    };
   };
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  expect((await engine.capturePlanning(1)).raw.fields.find(f=>f.label==='所属行业')).toMatchObject({required:true});
  const result=(await engine.selectPath({pageId:1,scope:'工作/实习经历 / 第1条',field:'所属行业',path:['互联网/IT/电子/通信','计算机软件']})).structuredContent;
  expect(result,JSON.stringify(result)).toMatchObject({ok:true});
  expect((await engine.capturePlanning(1)).raw.fields.find(f=>f.label==='所属行业')?.value).toBe('互联网/IT/电子/通信 / 计算机软件');
 }finally{await page.close();}
},15_000);

test.each(['normal','lost_save_reply'] as const)('Guopin coordinator saves once through editor renumbering: %s',async(mode)=>{
 const {FormModuleJourney}=await import('../src/browser/form-module-journey.js');
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>项目经历</h2><button id="add">添加</button></div><div id="records" class="item-section-content-multiple"></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  await page.evaluate(()=>{
   let count=0;document.body.dataset.saves='0';
   document.querySelector<HTMLButtonElement>('#add')!.onclick=()=>{
    if(document.querySelector('.edit-section'))throw new Error('second_unsaved_editor');
    const editor=document.createElement('div');editor.className='edit-section';editor.innerHTML='<div class="resume-common-form-item"><div class="ant-form-item-row"><div class="ant-form-item-label"><label>项目名称</label></div><input required></div></div><button>保存</button>';
    document.querySelector('#records')!.prepend(editor);
    editor.querySelector('button')!.onclick=()=>{
     count++;document.body.dataset.saves=String(count);const saved=document.createElement('div');saved.className='item-section-tpl';saved.innerHTML='<div class="project_name-field"><strong></strong></div>';saved.querySelector('strong')!.textContent=editor.querySelector('input')!.value;editor.replaceWith(saved);
    };
   };
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const profile=ProfileSchema.parse({schema_version:'1.2',profile_id:'virtual',revision:1,basic:{full_name:null,phone:null,email:null,city:null,job_intention:null},education:[],experience:[],projects:['甲','乙'].map((name,i)=>({id:`p${i}`,name,role:null,start_month:null,end_month:null,is_current:false,technologies:[],facts:[]})),certificates:[],skills:[],custom_answers:[],supplemental_fields:[]});
  const journey=new FormModuleJourney(),entry=journey.start('owner','two-projects',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},(await engine.capturePlanning(1)).raw);
  const activate=engine.activate.bind(engine);let lost=false;
  if(mode==='lost_save_reply')engine.activate=async params=>{const r=await activate(params);if(params.intent==='save_record'&&!lost){lost=true;throw new Error('transport_closed');}return r;};
  let result=await journey.execute('owner',entry.journey_id,engine,async()=>profile);
  if(mode==='lost_save_reply'){expect(result).toMatchObject({status:'needs_input',pending_action:'save'});result=await journey.execute('owner',entry.journey_id,engine,async()=>profile);}
  expect(result.status,JSON.stringify(result)).toBe('ready_for_review');
  expect(result.records.map((r:any)=>r.status)).toEqual(['saved_preview_verified','saved_preview_verified']);
  await journey.execute('owner',entry.journey_id,engine,async()=>profile);
  expect(await page.evaluate(()=>document.body.dataset.saves)).toBe('2');
  expect(await page.$$eval('.project_name-field strong',(els:Element[])=>els.map(e=>e.textContent).sort())).toEqual(['乙','甲'].sort());
 }finally{await page.close();}
},20_000);

test('Guopin revalidates a selected industry path without toggling its leaf or counting its badge as label',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>求职意向</h2></div><div class="item-section-content-multiple"><div class="edit-section"><div class="ant-form-item resume-common-form-item cascader-modal-field"><div class="ant-form-item-label"><label>期望行业</label></div><div id="trigger" class="ant-select ant-select-multiple ant-cascader"><input readonly role="combobox"><span class="ant-select-selection-item">计算机软件</span></div></div></div></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  await page.evaluate(()=>{
   document.body.dataset.leafClicks='0';
   document.querySelector<HTMLElement>('#trigger')!.onclick=()=>{
    const modal=document.createElement('div');modal.className='my-cascader-modal';modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;inset:0;background:white';modal.innerHTML='<div class="flat-left"><div class="level-item"><span class="item-txt">互联网/IT/电子/通信</span><span class="item-count">1</span></div></div><div class="label-path"><span class="path-item"><span>互联网/IT/电子/通信</span></span></div><div class="flat-leaf"><div class="leaf-item item-txt active">计算机软件</div></div><button>确 定</button>';document.body.append(modal);
    modal.querySelector<HTMLElement>('.leaf-item')!.onclick=()=>{document.body.dataset.leafClicks='1';};
    modal.querySelector('button')!.onclick=()=>modal.remove();
   };
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.selectPath({pageId:1,scope:'求职意向 / 第1条',field:'期望行业',path:['互联网/IT/电子/通信','计算机软件']})).structuredContent;
  expect(result,JSON.stringify(result)).toMatchObject({ok:true,verification:{matched:true},completed_path:['互联网/IT/电子/通信','计算机软件'],readback_value:'计算机软件'});
  expect(await page.evaluate(()=>document.body.dataset.leafClicks)).toBe('0');
 }finally{await page.close();}
},15_000);

test('Guopin school autocomplete waits for a delayed exact result after an initial empty list',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>教育经历</h2></div><div class="item-section-content-multiple"><div class="edit-section"><div class="ant-form-item"><label>学校名称</label><div class="ant-select ant-select-show-search" id="trigger"><div class="ant-select-selector"><input role="combobox" aria-controls="schools" aria-expanded="false"></div></div></div></div></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  await page.evaluate(()=>{
   const trigger=document.querySelector<HTMLElement>('#trigger')!,input=trigger.querySelector('input')!;
   trigger.onclick=()=>{if(document.getElementById('schools'))return;const list=document.createElement('div');list.className='ant-select-dropdown';list.id='schools';list.innerHTML='<div class="ant-select-item-option"><div class="ant-select-item-option-content">暂无数据</div></div>';document.body.append(list);input.setAttribute('aria-expanded','true');};
   input.oninput=()=>{const query=input.value;setTimeout(()=>{const list=document.getElementById('schools');if(!list||input.value!==query)return;list.innerHTML='<div class="ant-select-item-option"><div class="ant-select-item-option-content"></div></div>';list.querySelector('.ant-select-item-option-content')!.textContent=query;list.querySelector<HTMLElement>('.ant-select-item-option')!.onclick=()=>{const selected=document.createElement('span');selected.className='ant-select-selection-item';selected.textContent=query;trigger.append(selected);input.value='';input.setAttribute('aria-expanded','false');list.remove();};},450);};
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.selectOption({pageId:1,scope:'教育经历 / 第1条',field:'学校名称',value:'浙江工业大学',query:'浙江工业大学'})).structuredContent;
  expect(result,JSON.stringify(result)).toMatchObject({ok:true,verification:{matched:true}});
  expect((await engine.capturePlanning(1)).raw.fields.find(f=>f.label==='学校名称')?.value).toBe('浙江工业大学');
 }finally{await page.close();}
},15_000);

test('an expired-login dialog blocks form writes before dispatch and never clicks re-login',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<label for="name">姓名</label><input id="name"><div role="dialog">当前未登录或登录状态失效<button>重新登录</button></div>');
  const engine=new FormEngine(()=>({pptrPage:page}));
  expect((await engine.captureRun(1)).raw.authenticationRequired).toBe(true);
  const result=(await engine.fillFields({pageId:1,fields:[{field:'姓名',value:'测试'}]})).structuredContent;
  expect(result).toMatchObject({ok:false,error:{code:'authentication_required',side_effects:'none'}});
  expect(await page.$eval('#name',(el:HTMLInputElement)=>el.value)).toBe('');
 }finally{await page.close();}
});

test.each(['normal','lost_save_reply','foreign_selection'] as const)('Guopin certificate journey verifies selections before its single save: %s',async(mode)=>{
 const {FormModuleJourney}=await import('../src/browser/form-module-journey.js');
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div id="certificate" class="item-section"><div class="section-title"><h2>资格证书</h2><button id="edit">编辑</button></div><div class="item-section-content"></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');
  await page.evaluate((foreign:boolean)=>{
   document.body.dataset.saves='0';document.body.dataset.toggles='0';
   document.querySelector<HTMLButtonElement>('#edit')!.onclick=()=>{
    const selected=['CET6',...(foreign?['用户已有证书']:[])];
    const modal=document.createElement('div');modal.className='my-cascader-modal';modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;inset:0;background:white';
    modal.innerHTML='<div class="title-search"><span class="ant-select-selection-placeholder">请填写证书名称</span></div><div class="flat-left"><div class="level-item"><span class="item-txt">英语类</span><span class="item-count">1</span></div><div class="level-item"><span class="item-txt">驾驶类</span></div></div><div class="label-path"></div><div class="flat-leaf"></div><div class="flat-foot"><div class="select-list"></div><button>取 消</button><button id="confirm">确 定</button></div>';
    document.body.append(modal);
    const tags=()=>{modal.querySelector('.select-list')!.replaceChildren(...selected.map(s=>{const e=document.createElement('div');e.className='select-item';e.textContent=s;return e;}));};tags();
    const render=(parts:string[])=>{
     modal.querySelector('.label-path')!.replaceChildren(...parts.map(s=>{const p=document.createElement('span');p.className='path-item';const t=document.createElement('span');t.textContent=s;p.append(t);return p;}));
     const leaf=parts.length===1?(parts[0]==='英语类'?'全国考试':'机动车驾驶证'):(parts[0]==='英语类'?'CET6':'驾驶证C1');
     const item=document.createElement('div');item.className='leaf-item item-txt'+(selected.includes(leaf)?' active':'');item.textContent=leaf;
     item.onclick=()=>{if(parts.length===1){render([...parts,leaf]);return;}document.body.dataset.toggles=String(Number(document.body.dataset.toggles)+1);if(selected.includes(leaf))selected.splice(selected.indexOf(leaf),1);else selected.push(leaf);tags();render(parts);};modal.querySelector('.flat-leaf')!.replaceChildren(item);
    };
    for(const p of modal.querySelectorAll<HTMLElement>('.level-item'))p.onclick=()=>render([p.querySelector('.item-txt')!.textContent!]);
    modal.querySelector<HTMLButtonElement>('#confirm')!.onclick=()=>{document.body.dataset.saves=String(Number(document.body.dataset.saves)+1);const preview=document.createElement('div');preview.className='item-section-tpl';const list=document.createElement('div');list.className='my-tags';list.replaceChildren(...selected.map(s=>{const t=document.createElement('span');t.className='ant-tag';t.textContent=s;return t;}));preview.append(list);document.querySelector('.item-section-content')!.replaceChildren(preview);modal.remove();};
   };
  },mode==='foreign_selection');
  const engine=new FormEngine(()=>({pptrPage:page})),paths=['英语类 / 全国考试 / CET6','驾驶类 / 机动车驾驶证 / 驾驶证C1'];
  const profile=ProfileSchema.parse({schema_version:'1.2',profile_id:'virtual',revision:1,basic:{full_name:null,phone:null,email:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:[{id:'paths',field_key:'basic.guopin_certificate_paths',label:'证书路径',description:'synthetic',value_type:'text',value:JSON.stringify(paths)}]});
  const journey=new FormModuleJourney(),entry=journey.start('owner','certificates',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},(await engine.capturePlanning(1)).raw);
  const activate=engine.activate.bind(engine);let lost=false;
  if(mode==='lost_save_reply')engine.activate=async p=>{const r=await activate(p);if(p.intent==='save_record'&&!lost){lost=true;throw new Error('transport_closed');}return r;};
  let result=await journey.execute('owner',entry.journey_id,engine,async()=>profile);
  if(mode==='lost_save_reply'){expect(result).toMatchObject({status:'needs_input',pending_action:'save'});result=await journey.execute('owner',entry.journey_id,engine,async()=>profile);}
  if(mode==='foreign_selection'){expect(result.status).toBe('needs_input');expect(await page.evaluate(()=>document.body.dataset.saves)).toBe('0');return;}
  expect(result.status,JSON.stringify(result)).toBe('ready_for_review');expect(result.records).toEqual([expect.objectContaining({section:'资格证书',status:'saved_preview_verified'})]);
  expect(await page.evaluate(()=>document.body.dataset.saves)).toBe('1');expect(await page.evaluate(()=>document.body.dataset.toggles)).toBe('1');
  expect((await engine.captureRun(1)).raw.fields.find(f=>f.label==='证书名称')).toMatchObject({disabled:true,value:'CET6 / 驾驶证C1'});
 }finally{await page.close();}
},20_000);

test('Guopin saved-card wrappers do not hide controls after reopening an editor',async()=>{
 const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>工作/实习经历</h2></div><div class="item-section-content-multiple"><div class="item-section-tpl"><div class="edit-section"><div class="resume-common-form-item"><div class="ant-form-item-row"><div class="ant-form-item-label"><label>单位名称</label></div><input value="虚拟单位"></div></div><button>保存</button></div></div></div></div></div>'}));
  await page.goto('https://c.iguopin.com/resume?id=synthetic');const engine=new FormEngine(()=>({pptrPage:page}));
  const raw=(await engine.captureRun(1)).raw;
  expect(raw.fields.filter(f=>f.label==='单位名称')).toEqual([expect.objectContaining({value:'虚拟单位',disabled:false,scope:'工作/实习经历 / 第1条'})]);
  expect((await engine.fillFields({pageId:1,fields:[{field:'单位名称',scope:'工作/实习经历 / 第1条',value:'虚拟单位修正'}]})).structuredContent).toMatchObject({ok:true});
 }finally{await page.close();}
});

test.each(['杭州','上海'] as const)('Guopin intent save compares position, salary, city and industry previews: %s',async(city)=>{
 const {FormModuleJourney}=await import('../src/browser/form-module-journey.js');const page=await browser.newPage();try{
  await page.setRequestInterception(true);page.on('request',(r:any)=>r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<div class="resume-left-content"><div class="item-section"><div class="section-title"><h2>求职意向</h2></div><div class="item-section-content-multiple"><div class="edit-section"></div></div></div></div>'}));await page.goto('https://c.iguopin.com/resume?id=synthetic');
  const location=city==='杭州'?['中国','浙江','杭州']:['中国','上海','上海'];
  await page.evaluate(({location,city}:{location:string[],city:string})=>{
   const fields=[['期望职位','运维/测试 / 测试工程师 / 软件测试'],['工作地区',location.join(' / ')],['期望行业','互联网/IT/电子/通信 / 计算机软件'],['薪资要求（元/月） / 最低','16K'],['薪资要求（元/月） / 最高','18K']];const editor=document.querySelector('.edit-section')!;
   for(const [label,value] of fields){const field=document.createElement('div');field.className='ant-form-item';const title=document.createElement('label');title.textContent=label!;const input=document.createElement('input');input.value=value!;field.append(title,input);editor.append(field);}
   const save=document.createElement('button');save.textContent='保存';editor.append(save);save.onclick=()=>{const p=document.createElement('div');p.className='item-section-tpl';p.innerHTML='<div class="position-field"><strong>软件测试</strong></div><div class="line-separator-list"><ul><li>16-18K</li><li></li><li>计算机软件</li></ul></div>';p.querySelector('li:nth-child(2)')!.textContent=city==='杭州'?'浙江-杭州':'上海市';editor.replaceWith(p);};
  },{location,city});
  const supplemental=[['position_path',JSON.stringify(['运维/测试','测试工程师','软件测试'])],['location_path',JSON.stringify(location)],['industry_path',JSON.stringify(['互联网/IT/电子/通信','计算机软件'])],['salary_min','16000'],['salary_max','18000']].map(([key,value],i)=>({id:String(i),field_key:'intent.'+key,label:key,description:'synthetic',value_type:'text',value}));
  const profile=ProfileSchema.parse({schema_version:'1.2',profile_id:'virtual',revision:1,basic:{full_name:null,phone:null,email:null,city:null,job_intention:null},education:[],experience:[],projects:[],certificates:[],skills:[],custom_answers:[],supplemental_fields:supplemental});
  const engine=new FormEngine(()=>({pptrPage:page})),j=new FormModuleJourney(),e=j.start('owner','intent',{pageId:1,profileId:'virtual',revision:1,policy:policySchema.parse({}),testMode:true},(await engine.capturePlanning(1)).raw);const result=await j.execute('owner',e.journey_id,engine,async()=>profile);
  expect(result.status,JSON.stringify(result)).toBe('ready_for_review');expect(result.records).toEqual([expect.objectContaining({section:'求职意向',status:'saved_preview_verified'})]);
 }finally{await page.close();}
},15_000);
