import {afterAll, beforeAll, expect, test} from 'vitest';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {ensurePageRuntime, runtimeState} from '../src/browser/page-runtime.js';
import {FormEngine} from '../src/browser/form-engine.js';
import {installStaleUidRecovery} from '../src/browser/stale-uid-recovery.js';

let browser: Record<string, any>;
beforeAll(async () => {
  const {puppeteer} = await import(pathToFileURL(resolve('runtime/chrome-devtools-mcp/build/src/third_party/index.js')).href);
  browser = await puppeteer.launch({channel:'chrome',headless:true,pipe:true,args:['--no-sandbox']});
}, 20_000);
afterAll(async () => {await browser?.close();});

test('lost contexts reproduce AX-only access, then recover the original UID and unsaved form without navigation', async () => {
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(250);
    await page.setContent('<title>Context recovery</title><div class="form-item"><span data-label>姓名</span><input id="name"></div><input><input><button>添加</button>');
    await page.locator('#name').fill('未保存草稿');
    await page.evaluate(() => { (window as any).testDocument = 'same-document'; });
    const root = await page.accessibility.snapshot();
    const nodes = root.children.filter((child:any) => child.role === 'textbox');
    expect(nodes).toHaveLength(3);
    expect(nodes.every((node:any) => !node.name)).toBe(true);
    const node = nodes[0];
    const engine = new FormEngine(() => ({pptrPage:page}));
    const before = (await engine.observe({page_id:1,mode:'full'})).structuredContent;
    // Fault injection models a lost Runtime.executionContextCreated notification.
    // Chrome still owns the DOM/AX nodes while Puppeteer's realm cache is empty.
    page.mainFrame().client.emit('Runtime.executionContextsCleared', {});
    expect(runtimeState(page)[0]).toMatchObject({main:false,utility:false});
    expect(await page.accessibility.snapshot()).toBeTruthy();
    await expect(page.evaluate(() => document.readyState)).rejects.toThrow(/Timed out/);
    await expect(node.elementHandle()).rejects.toThrow(/Timed out/);
    const failed = await engine.observe({page_id:1,mode:'overview'});
    expect(failed.structuredContent.error.code).toBe('observe_timeout');

    await ensurePageRuntime(page);
    expect(runtimeState(page)[0]).toMatchObject({main:true,utility:true});
    const after = (await engine.observe({page_id:1,mode:'full'})).structuredContent;
    expect(after.navigation_id).toBe(before.navigation_id);
    expect(after.fields.find((field:any) => field.label === '姓名').state).toBe('filled');
    expect(await page.evaluate(() => (window as any).testDocument)).toBe('same-document');

    // Match upstream's catch-all wrapper, then exercise our actual UID patch.
    class SnapshotPage {
      pptrPage = page;
      textSnapshot = {root:{id:'root',children:[{...node,id:'original'}]},idToNode:new Map([['original',node]])};
      async getElementByUid(_uid:string) {
        try {return await node.elementHandle();}
        catch(error) {throw new Error('Element with uid original no longer exists on the page.',{cause:error});}
      }
    }
    installStaleUidRecovery(SnapshotPage);
    const snapshotPage = new SnapshotPage();
    const handle:any = await snapshotPage.getElementByUid('original');
    await handle.asLocator().fill('恢复后填写');
    expect(await page.$eval('#name',(element:HTMLInputElement)=>element.value)).toBe('恢复后填写');
    await handle.dispose();
    const unchanged = runtimeState(page);
    await ensurePageRuntime(page);
    expect(runtimeState(page)).toEqual(unchanged);
  } finally {await page.close();}
}, 15_000);

test('semantic select uses trusted pointer input even when viewport observers never deliver',async()=>{
 const page=await browser.newPage();try{
  await page.setContent(`<div class="ant-form-item"><label>民族</label><div class="ant-select"><div role="combobox" aria-controls="options" aria-expanded="false" tabindex="0" style="width:200px;height:35px"><span class="ant-select-selection-selected-value"></span></div></div></div><div id="options" role="listbox" class="ant-select-dropdown" style="display:none"><div role="option" class="ant-select-item-option" style="width:200px;height:35px"><div class="ant-select-item-option-content">汉族</div></div></div>`);
  await page.evaluate(()=>{
   const trigger=document.querySelector('[role=combobox]')!,menu=document.querySelector<HTMLElement>('#options')!;
   trigger.addEventListener('click',()=>{menu.style.display='block';trigger.setAttribute('aria-expanded','true');});
   menu.addEventListener('click',event=>{(window as any).trustedSelection=event.isTrusted;trigger.querySelector('span')!.textContent='汉族';menu.style.display='none';trigger.setAttribute('aria-expanded','false');});
   (window as any).IntersectionObserver=class {observe(){}disconnect(){}unobserve(){}};
  });
  const engine=new FormEngine(()=>({pptrPage:page}));
  const result=(await engine.selectOption({pageId:1,field:'民族',value:'汉族',timeoutMs:1500})).structuredContent;
  expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(await page.evaluate(()=>(window as any).trustedSelection)).toBe(true);
  expect((await engine.capturePlanning(1)).raw.fields.find(f=>f.label==='民族')!.value).toBe('汉族');
 }finally{await page.close();}
},8000);
