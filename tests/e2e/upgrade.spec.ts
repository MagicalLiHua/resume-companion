import {test,expect,chromium,type BrowserContext} from '@playwright/test';
import {cp,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

for(const version of ['0.3.1','0.3.2'])test(`实际升级：${version} 迁移到纯插件，重启保留资料，旧 JSON 可用于回退`,async()=>{
  test.setTimeout(60000);const root=await mkdtemp(join(tmpdir(),'resume-upgrade-'));let context:BrowserContext|undefined;
  try{
    execFileSync('unzip',['-q',`tests/fixtures/resume-companion-${version}.zip`,'-d',root]);
    const old=join(root,`resume-companion-${version}/extension`),installed=join(root,'installed');
    async function launch(reload=false){
      context=await chromium.launchPersistentContext(join(root,'browser'),{headless:true,executablePath:process.env.RESUME_TEST_BROWSER,args:[`--disable-extensions-except=${installed}`,`--load-extension=${installed}`]});
      let worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;expect(id).toBe('feifaflnkjdihpbbhnihidjjkeapamnh');

      const manager=await context.newPage();await manager.goto('chrome://extensions');
      const mode=manager.locator('extensions-toolbar').locator('#devMode');if(!await mode.evaluate((el:any)=>el.checked))await mode.click();
      if(reload){
        const oldWorker=worker;await manager.locator(`extensions-item#${id}`).locator('#dev-reload-button').click();
        await expect.poll(()=>context!.serviceWorkers().some(w=>w!==oldWorker),{timeout:10000}).toBe(true);worker=context.serviceWorkers().find(w=>w!==oldWorker)!;
      }
      await manager.close();

      const editor=await context.newPage();await editor.goto(`chrome-extension://${id}/options.html`);return {worker,editor};
    }
    await cp(old,installed,{recursive:true});const first=await launch();await first.editor.getByLabel('姓名',{exact:true}).fill('升级验证资料');await first.editor.getByRole('button',{name:'保存资料'}).click();await expect(first.editor.getByText('资料已保存到本机',{exact:true})).toBeVisible();
    const legacy=await first.worker.evaluate(async()=>(await chrome.storage.local.get('resume_profile')).resume_profile);
    await first.editor.getByLabel('姓名',{exact:true}).fill('升级后的当前资料');await first.editor.getByRole('button',{name:'保存资料'}).click();await expect(first.editor.getByText('资料已保存到本机',{exact:true})).toBeVisible();
    await first.worker.evaluate(async()=>chrome.storage.local.set({resume_connection:{id:'synthetic',origin:'https://old.example.invalid',key:'rck_'+'s'.repeat(43)}}));
    await context!.close();context=undefined;await rm(installed,{recursive:true,force:true});await cp('dist',installed,{recursive:true});
    const current=await launch(true);await expect(current.editor.getByLabel('姓名',{exact:true})).toHaveValue('升级后的当前资料');
    const migrated=await current.worker.evaluate(async()=>{const s=await chrome.storage.local.get(['resume_state','resume_connection']);return {state:s.resume_state as any,hasConnection:s.resume_connection!==undefined};});
    expect(migrated.hasConnection).toBe(false);expect(migrated.state.current.profile.schema_version).toBe('1.1');expect(migrated.state.previous.profile.basic.full_name).toBe('升级验证资料');
    await context!.close();context=undefined;const restarted=await launch();await expect(restarted.editor.getByLabel('姓名',{exact:true})).toHaveValue('升级后的当前资料');
    await context!.close();context=undefined;await rm(installed,{recursive:true,force:true});await cp(old,installed,{recursive:true});const rollback=await launch(true);
    await rollback.editor.locator('input[type=file]').setInputFiles({name:'before-upgrade.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await rollback.editor.getByRole('button',{name:'替换编辑内容'}).click();await rollback.editor.getByRole('button',{name:'保存资料'}).click();await expect(rollback.editor.getByLabel('姓名',{exact:true})).toHaveValue('升级验证资料');
  }finally{await context?.close();await rm(root,{recursive:true,force:true});}
});
