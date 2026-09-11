import {test,expect,chromium,type BrowserContext,type Page,type Worker} from '@playwright/test';
import {cp,mkdir,readFile,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
let context:BrowserContext,worker:Worker,extensionId:string,root:string;
test.beforeAll(async()=>{
  root=await mkdtemp(join(tmpdir(),'resume-pure-e2e-'));const extension=join(root,'extension');await cp('dist',extension,{recursive:true});
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*','https://model.example.invalid/*'];await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(join(root,'profile'),{headless:true,executablePath:process.env.RESUME_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');extensionId=new URL(worker.url()).hostname;
});
test.afterAll(async()=>{await context?.close();if(root)await rm(root,{recursive:true,force:true});});
test.beforeEach(async()=>{for(const page of context.pages())await page.close();await context.unrouteAll();await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.session.clear();});});
async function pageFor(name='options'){const page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/${name}.html`);return page;}
async function sample(){const page=await pageFor();await page.getByRole('button',{name:'载入示例资料',exact:true}).click();await page.getByRole('button',{name:'替换编辑内容',exact:true}).click();await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();return page;}
async function state(){return worker.evaluate(async()=>(await chrome.storage.local.get('resume_state')).resume_state as any);}
async function model(page:Page){
  await context.route('https://model.example.invalid/**',async route=>{
    const body=route.request().postDataJSON();
    const payload=body.messages?.[0]?.content;
    const data=typeof payload==='string'&&payload.startsWith('{')?JSON.parse(payload):null;
    const input=data?.fields?{matches:data.fields.map((f:any)=>({fieldId:f.fieldId,status:'matched',sourceRefs:[data.sources.find((s:any)=>s.label==='现居城市').sourceRef],reason:'对应当前居住城市'}))}:{ok:true};
    await route.fulfill({contentType:'application/json',body:JSON.stringify({role:'assistant',model:'synthetic-model',stop_reason:'tool_use',content:[{type:'tool_use',name:'field_matches',input}],usage:{input_tokens:10,output_tokens:5}})});
  });
  await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.getByLabel('提供商 Base URL').fill('https://model.example.invalid');await page.getByLabel('模型 API Key',{exact:true}).fill('synthetic-model-api-key');await page.getByRole('button',{name:'连接并测试',exact:true}).click();await expect(page.getByText(/连接成功 · synthetic-model/)).toBeVisible();
}
test('纯插件：手动资料、补充信息和重启草稿恢复',async()=>{
  let page=await pageFor();await page.getByLabel('姓名',{exact:true}).fill('本地草稿姓名');await expect(page.getByText(/草稿已保存/)).toBeVisible();await page.close();
  page=await pageFor();await expect(page.getByRole('button',{name:'恢复草稿并接管'})).toBeVisible();await page.getByRole('button',{name:'恢复草稿并接管'}).click();await expect(page.getByLabel('姓名',{exact:true})).toHaveValue('本地草稿姓名');
  await page.getByRole('button',{name:/补充资料/}).first().click();await page.getByRole('button',{name:'＋ 籍贯',exact:true}).click();await page.getByLabel('资料内容',{exact:true}).fill('示例籍贯');await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();
  expect((await state()).current.profile.supplemental_fields[0].value).toBe('示例籍贯');await page.reload();await page.getByRole('button',{name:/补充资料/}).first().click();await expect(page.getByLabel('资料内容',{exact:true})).toHaveValue('示例籍贯');
});
test('纯插件：Markdown 预览不改正式资料，导入保留补充表',async()=>{
  const page=await sample();await page.getByRole('button',{name:/补充资料/}).first().click();await page.getByRole('button',{name:'＋ 生源地',exact:true}).click();await page.getByLabel('资料内容',{exact:true}).fill('已维护生源地');await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'从 AI 导入',exact:true}).click();await page.getByLabel('Markdown 简历').fill('# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：Markdown 导入姓名\n- 邮箱：markdown@example.com');await page.getByRole('button',{name:'解析并预览',exact:true}).click();await expect(page.getByRole('button',{name:'应用到编辑区'})).toBeEnabled();expect((await state()).current.profile.basic.full_name).toBe('示例同学');
  await page.getByRole('button',{name:'应用到编辑区'}).click();await expect(page.getByLabel('姓名',{exact:true})).toHaveValue('Markdown 导入姓名');await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();
  const saved=await state();expect(saved.current.profile.education).toEqual([]);expect(saved.current.profile.supplemental_fields[0].value).toBe('已维护生源地');expect(saved.current.sourceDocument.text).toContain('Markdown 导入姓名');
  await mkdir('artifacts/screenshots',{recursive:true});await page.screenshot({path:'artifacts/screenshots/纯插件资料页.png',fullPage:true});
});
test('纯插件：无效日期和重复值阻塞导入，修改输入作废预览',async()=>{
  const page=await pageFor();await page.getByRole('button',{name:'从 AI 导入',exact:true}).first().click();await page.getByLabel('Markdown 简历').fill('# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：甲\n- 姓名：乙');await page.getByRole('button',{name:'解析并预览'}).click();await expect(page.getByRole('button',{name:'应用到编辑区'})).toBeDisabled();await expect(page.getByText(/字段重复/)).toBeVisible();expect((await state()).current).toBeNull();
  await page.getByLabel('Markdown 简历').fill('# 简历\n模板版本：resume-md/1\n## 基本信息\n- 姓名：甲');await expect(page.getByRole('button',{name:'应用到编辑区'})).toHaveCount(0);
});
test('纯插件：两个窗口接管草稿后旧窗口不能覆盖',async()=>{
  const first=await pageFor();await first.getByLabel('姓名',{exact:true}).fill('第一个窗口');await expect(first.getByText(/草稿已保存/)).toBeVisible();
  const second=await pageFor();await second.getByRole('button',{name:'恢复草稿并接管'}).click();await second.getByLabel('姓名',{exact:true}).fill('第二个窗口');await expect(second.getByText(/草稿已保存/)).toBeVisible();await expect(first.getByRole('button',{name:'保存资料',exact:true})).toBeDisabled();expect((await state()).draft.profile.basic.full_name).toBe('第二个窗口');
});
test('纯插件：完整备份可恢复两份快照且不包含 Key',async()=>{
  const page=await sample();await model(page);await page.getByRole('button',{name:/基本资料/}).first().click();await page.getByLabel('姓名',{exact:true}).fill('第二份资料');await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();
  const backup=await page.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'PROFILE_EXPORT'});if(!r.ok)throw new Error(r.error);return r.data;});expect(JSON.stringify(backup)).not.toContain('synthetic-model-api-key');expect(backup.state.previous.profile.basic.full_name).toBe('示例同学');
  await page.getByRole('button',{name:'备份与恢复',exact:true}).first().click();await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByLabel('选择备份中的版本').selectOption('previous');await page.getByRole('button',{name:'确认恢复完整备份'}).click();await expect(page.getByText('本地资料已更新',{exact:true})).toBeVisible();expect((await state()).current.profile.basic.full_name).toBe('示例同学');expect((await state()).previous.profile.basic.full_name).toBe('第二份资料');
});
test('纯插件：存储失败不破坏正式资料或上一份',async()=>{
  const page=await sample(),before=await state();
  await worker.evaluate(()=>{const original=chrome.storage.local.set; (globalThis as any).__restoreSet=()=>{chrome.storage.local.set=original;};chrome.storage.local.set=async()=>{throw new Error('Synthetic quota failure');};});
  await page.getByLabel('姓名',{exact:true}).fill('不能覆盖');await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Synthetic quota failure');expect((await state()).current).toEqual(before.current);expect((await state()).previous).toEqual(before.previous);await worker.evaluate(()=>(globalThis as any).__restoreSet());
});
test('纯插件：模型设置与建议核对后填写，不暴露 Key 或直接写入',async()=>{
  const editor=await sample();await model(editor);
  const form=await context.newPage();await form.goto('http://127.0.0.1:4174');await form.setContent('<form><fieldset><legend>基本资料</legend><label>您现在落脚的城市<input id="city"></label></fieldset><button type="submit">提交</button></form><script>window.submitted=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submitted++}</script>');
  const panel=await pageFor('sidepanel');await form.bringToFront();await panel.getByRole('button',{name:'扫描当前页',exact:true}).evaluate((b:HTMLButtonElement)=>b.click());await panel.getByRole('button',{name:'用模型辅助匹配'}).evaluate((b:HTMLButtonElement)=>b.click());await expect(panel.getByLabel('模型发送内容',{exact:true})).toBeVisible();
  const disclosure=await panel.getByLabel('模型发送内容',{exact:true}).inputValue();expect(disclosure).not.toContain('南京');expect(disclosure).not.toContain('示例同学');expect(disclosure).not.toContain('synthetic-model-api-key');await panel.getByRole('button',{name:'确认发送并匹配'}).evaluate((b:HTMLButtonElement)=>b.click());await expect(panel.getByText('模型建议 · 请核对')).toBeVisible();await expect(form.locator('#city')).toHaveValue('');
  await panel.getByRole('button',{name:'使用此来源'}).evaluate((b:HTMLButtonElement)=>b.click());await panel.getByRole('button',{name:/填写选中的 1 项/}).evaluate((b:HTMLButtonElement)=>b.click());await expect(form.locator('#city')).toHaveValue('南京');expect(await form.evaluate(()=>(window as any).submitted)).toBe(0);
  const read=await worker.evaluate(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.scripting.executeScript({target:{tabId:t.id!},func:async()=>{try{return JSON.stringify(await chrome.storage.local.get('resume_model'));}catch{return 'denied';}}});});expect(read[0].result).not.toContain('synthetic-model-api-key');
  await panel.setViewportSize({width:440,height:900});await panel.screenshot({path:'artifacts/screenshots/纯插件模型填写.png',fullPage:true});
});
test('纯插件：模型域名授权被拒绝时不发送或保存 Key',async()=>{
  const page=await pageFor();await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.evaluate(()=>{chrome.permissions.request=async()=>false;});await page.getByLabel('提供商 Base URL').fill('https://denied.example.invalid');await page.getByLabel('模型 API Key',{exact:true}).fill('synthetic-denied-key');await page.getByRole('button',{name:'连接并测试'}).click();await expect(page.getByRole('alert')).toContainText('未授权');expect(await worker.evaluate(async()=>JSON.stringify(await chrome.storage.local.get('resume_model')))).not.toContain('synthetic-denied-key');
});
test('模型失败后仍能使用本地匹配，不自动写入未知字段',async()=>{test.setTimeout(15000);
  const editor=await sample();await model(editor);await context.route('https://model.example.invalid/**',route=>route.fulfill({status:401,body:'unauthorized'}));
  const url='http://127.0.0.1:4174/fallback';await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><title>招聘表</title><form><fieldset><legend>基本资料</legend><label>姓名<input id="name"></label><label>您目前落脚的城市<input id="city"></label></fieldset></form>'}));const form=await context.newPage();await form.goto(url);const panel=await pageFor('sidepanel');await form.bringToFront();await panel.getByRole('button',{name:'扫描当前页',exact:true}).evaluate((b:HTMLButtonElement)=>b.click());await panel.getByRole('button',{name:'用模型辅助匹配'}).evaluate((b:HTMLButtonElement)=>b.click());await panel.getByRole('button',{name:'确认发送并匹配'}).evaluate((b:HTMLButtonElement)=>b.click());await expect(panel.getByRole('alert')).toContainText('认证失败');await panel.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).evaluate((b:HTMLButtonElement)=>b.click());await panel.getByRole('button',{name:/填写选中的 1 项/}).evaluate((b:HTMLButtonElement)=>b.click());await expect(form.locator('#name')).toHaveValue('示例同学');await expect(form.locator('#city')).toHaveValue('');
});
test('投递记录：提取岗位、捕获提交、去重、直接统计及备份',async()=>{
  await sample();const form=await context.newPage();await form.goto('http://127.0.0.1:4174');
  await form.setContent('<script type="application/ld+json">{"@type":"JobPosting","title":"质量工程师","hiringOrganization":{"name":"示例招聘公司"}}</script><h1>质量工程师</h1><form><label>姓名<input></label><button type="submit">提交申请</button></form><div id="message"></div><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();document.querySelector("#message").textContent="申请成功"}</script>');
  const panel=await pageFor('sidepanel');await form.bringToFront();await panel.getByRole('button',{name:'扫描当前页',exact:true}).evaluate((b:HTMLButtonElement)=>b.click());await expect(panel.getByRole('heading',{name:'填写预览'})).toBeVisible();
  await form.getByRole('button',{name:'提交申请',exact:true}).click();await expect.poll(async()=>(await state()).applicationJournal.length).toBe(1);await form.getByRole('button',{name:'提交申请',exact:true}).click();await expect.poll(async()=>(await state()).applicationJournal[0].evidence).toBe('success_detected');expect((await state()).applicationJournal).toHaveLength(1);
  const journal=await pageFor('journal');await expect(journal.locator('tbody')).toContainText('示例招聘公司');await expect(journal.locator('tbody')).toContainText('质量工程师');await expect(journal.locator('tbody')).toContainText('已记录');
  await journal.getByRole('button',{name:'编辑',exact:true}).click();await journal.getByLabel('跟进状态',{exact:true}).selectOption('interview');await journal.getByRole('button',{name:'保存记录',exact:true}).click();await expect(journal.getByRole('dialog')).toHaveCount(0);expect((await state()).applicationJournal[0]).toMatchObject({status:'interview',company:'示例招聘公司',role:'质量工程师',url:'http://127.0.0.1:4174/'});
  await expect(journal.locator('.stat-card').filter({hasText:'记录岗位'}).locator('strong')).toHaveText('1');const backup=await journal.evaluate(async()=>(await chrome.runtime.sendMessage({type:'PROFILE_EXPORT'})).data);expect(backup.state.applicationJournal).toHaveLength(1);
  await journal.screenshot({path:'artifacts/screenshots/投递记录与统计.png',fullPage:true});
  await journal.getByRole('button',{name:'删除',exact:true}).click();await journal.getByRole('button',{name:'确认删除记录',exact:true}).click();await expect.poll(async()=>(await state()).applicationJournal.length).toBe(0);
  const restore=await pageFor();await restore.getByRole('button',{name:'备份与恢复',exact:true}).first().click();await restore.locator('input[type=file]').setInputFiles({name:'journal-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await restore.getByRole('button',{name:'确认恢复完整备份'}).click();await expect.poll(async()=>(await state()).applicationJournal.length).toBe(1);
});
