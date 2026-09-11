import {test,expect,chromium,type BrowserContext,type Page,type Worker} from '@playwright/test';
import {cp,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let context:BrowserContext,worker:Worker,root:string,id:string;
test.beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'resume-widget-'));const path=join(root,'extension');await cp('dist',path,{recursive:true});context=await chromium.launchPersistentContext(join(root,'profile'),{headless:true,executablePath:process.env.RESUME_TEST_BROWSER,args:[`--disable-extensions-except=${path}`,`--load-extension=${path}`]});worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');id=new URL(worker.url()).hostname;});
test.afterAll(async()=>{await context?.close();await rm(root,{recursive:true,force:true});});
test.beforeEach(async()=>{for(const p of context.pages())await p.close();await context.unrouteAll();await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.session.clear();});});
async function editor(){const p=await context.newPage();await p.goto(`chrome-extension://${id}/options.html`);return p;}
async function save(page:Page){await page.getByRole('button',{name:'保存资料',exact:true}).click();await expect(page.getByText('资料已保存到本机',{exact:true})).toBeVisible();}
async function data(){return worker.evaluate(async()=>(await chrome.storage.local.get('resume_state')).resume_state as any);}
async function versions(){
  const page=await editor();await page.getByLabel('姓名',{exact:true}).fill('版本甲');await page.getByLabel('现居城市',{exact:true}).fill('北京');await save(page);const first=(await data()).activeVersionId;
  await page.getByRole('button',{name:'复制为新版本',exact:true}).click();await page.getByLabel('版本名称',{exact:true}).fill('开发岗位版');await page.getByRole('button',{name:'确认创建版本',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByLabel('姓名',{exact:true}).fill('版本乙');await page.getByLabel('现居城市',{exact:true}).fill('上海');await save(page);return {page,first,second:(await data()).activeVersionId};
}
test('多版本：复制、修改、切换和备份保留各自内容',async()=>{
  const {page,first,second}=await versions();let s=await data();expect(s.versions).toHaveLength(2);expect(s.versions.find((v:any)=>v.id===first).current.profile.basic.city).toBe('北京');expect(s.versions.find((v:any)=>v.id===second).current.profile.basic.city).toBe('上海');
  await page.getByLabel('编辑的简历版本',{exact:true}).selectOption(first);await expect(page.getByLabel('姓名',{exact:true})).toHaveValue('版本甲');await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByLabel('版本名称',{exact:true}).fill('算法岗位版');await page.getByRole('button',{name:'确认重命名',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const backup=await page.evaluate(async()=>(await chrome.runtime.sendMessage({type:'PROFILE_EXPORT'})).data);expect(backup.state.versions.map((v:any)=>v.name).sort()).toEqual(['开发岗位版','算法岗位版'].sort());
  await page.getByRole('button',{name:'删除版本',exact:true}).click();await page.getByRole('button',{name:'确认删除版本',exact:true}).click();await expect.poll(async()=>(await data()).versions.length).toBe(1);
  await page.getByRole('button',{name:'备份与恢复',exact:true}).first().click();await page.locator('input[type=file]').setInputFiles({name:'versions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByRole('button',{name:'确认恢复完整备份'}).click();await expect.poll(async()=>(await data()).versions.length).toBe(2);const restored=await data();expect(restored.versions.every((v:any)=>v.current.profile.revision===restored.revision)).toBe(true);await page.getByRole('button',{name:/基本资料/}).first().click();
  await page.getByLabel('姓名',{exact:true}).fill('尚未保存');await expect(page.getByLabel('编辑的简历版本',{exact:true})).toBeDisabled();
});
test('悬浮窗口：自动出现、选择本次版本、确认填写，网页不能读到资料',async()=>{
  const {page,first,second}=await versions();await page.getByLabel('姓名',{exact:true}).fill('编辑区未保存内容');await expect(page.getByText(/草稿已保存/)).toBeVisible();
  const url='http://127.0.0.1:4174/widget-test';await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>招聘申请表</title><style>body{font:16px sans-serif;padding:40px;background:#eee}input{display:block;margin:15px;padding:12px}</style><h1>招聘申请表</h1><form><fieldset><legend>基本资料</legend><label>姓名<input id="name"></label><label>现居城市<input id="city"></label></fieldset></form>'}));
  const form=await context.newPage();await form.goto(url);await expect(form.locator('#resume-companion-widget')).toBeVisible();expect(await form.locator('#resume-companion-widget').evaluate(el=>el.shadowRoot)).toBeNull();await form.locator('#resume-companion-widget').click();
  await expect.poll(()=>form.frames().filter(f=>f.url().includes('sidepanel.html?widget=')).length).toBe(1);const frame=form.frames().find(f=>f.url().includes('sidepanel.html?widget='))!;
  await expect(frame.getByLabel('本次填写的简历版本',{exact:true})).toHaveValue(second);await frame.getByLabel('本次填写的简历版本',{exact:true}).selectOption(first);await expect(frame.getByRole('button',{name:/确认填写 2 项/})).toBeEnabled();expect(await form.locator('body').innerText()).not.toContain('版本甲');await expect(form.locator('#name')).toHaveValue('');
  await frame.getByRole('button',{name:/确认填写 2 项/}).click();await expect(form.locator('#name')).toHaveValue('版本甲');await expect(form.locator('#city')).toHaveValue('北京');await expect(frame.getByText('2 项填写成功',{exact:true})).toBeVisible();expect((await data()).activeVersionId).toBe(second);expect((await data()).draft.profile.basic.full_name).toBe('编辑区未保存内容');
  await mkdir('artifacts/screenshots',{recursive:true});await form.screenshot({path:'artifacts/screenshots/悬浮窗口选择简历.png',fullPage:true});
});
test('悬浮窗口：伪造网页 iframe 不具备读取资料的会话',async()=>{
  await versions();const page=await context.newPage();await page.goto('http://127.0.0.1:4174');await page.evaluate(url=>{const f=document.createElement('iframe');f.src=url;document.body.append(f);},`chrome-extension://${id}/sidepanel.html?widget=1#forged`);
  await expect.poll(()=>page.frames().some(f=>f.url().includes('#forged'))).toBe(true);const frame=page.frames().find(f=>f.url().includes('#forged'))!;
  const response=await frame.evaluate(async()=>chrome.runtime.sendMessage({type:'PROFILE_LOAD',widgetToken:'forged'}));expect(response.ok).toBe(false);expect(JSON.stringify(response)).not.toContain('版本甲');
});
