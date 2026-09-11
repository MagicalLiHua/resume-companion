import {configureModel} from './helpers';
import {test, expect, chromium} from '@playwright/test';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
test('网页 PDF → 确认 → 密钥 → 插件同步与填写，离线及切换账号隔离', async ({page, request}) => {
  test.setTimeout(60000);
  const password = 'synthetic-web-passphrase-2026';
  const adminLogin = await request.post('/v1/auth/login', {data: {username: 'administrator', password}}); expect(adminLogin.status()).toBe(200);
  const csrf = (await adminLogin.json()).csrf_token;
  const adminKey = await (await request.post('/v1/keys', {headers: {'X-CSRF-Token': csrf}, data: {name: '切换账号验收'}})).json();
  await page.goto('/'); await page.getByRole('button', {name: '注册账号', exact: true}).click();
  await page.getByLabel('用户名', {exact: true}).fill('plugin_' + Date.now()); await page.getByLabel('密码（12–128 位）', {exact: true}).fill(password); await page.getByRole('button', {name: '注册并开始使用'}).click();
  await expect(page.getByRole('heading', {name: '我的简历.'})).toBeVisible();
  await configureModel(page.request);
  await page.getByRole('button', {name: 'PDF 导入'}).click();
  await page.getByLabel('使用我的模型整理简历').check();
  const pdf = execFileSync('backend/.venv/bin/python', ['-c', "import sys;sys.path[:0]=['backend','backend/tests'];from test_imports import pdf;sys.stdout.buffer.write(pdf())"]);
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', {name: '选择 PDF 文件', exact: true}).click(); await (await chooser).setFiles({name: 'extension-test.pdf', mimeType: 'application/pdf', buffer: pdf});
  await page.getByRole('button', {name: '核对并整理'}).click({timeout: 15000}); await page.getByLabel('我已核对简历内容，确认保存当前资料').check(); await page.getByRole('button', {name: '确认并保存简历', exact: true}).click();
  await expect(page.getByText('已保存到「我的简历」，可以创建 API Key 并连接插件。')).toBeVisible();
  await page.getByRole('button', {name: '连接插件'}).click(); await page.getByLabel('密钥名称').fill('真实扩展测试'); await page.getByRole('button', {name: '创建密钥', exact: true}).click();
  const key = await page.getByRole('textbox', {name: '你的 API Key', exact: true}).inputValue(); await page.getByRole('button', {name: '已保存，关闭'}).click();
  const extPath = resolve('test-results/web-extension'); await cp('dist', extPath, {recursive: true}); const manifest = JSON.parse(await readFile(extPath + '/manifest.json', 'utf8'));
  // Test-only loopback grant replaces the native permission prompt in headless Chrome.
  manifest.host_permissions = ['http://127.0.0.1/*']; await writeFile(extPath + '/manifest.json', JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext('', {headless: true, executablePath: process.env.RESUME_TEST_BROWSER, args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`]});
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), id = new URL(worker.url()).hostname;
    const settings = await context.newPage(); await settings.goto(`chrome-extension://${id}/connection.html`);
    await settings.getByLabel('服务地址').fill('http://127.0.0.1:4180'); await settings.getByLabel('API Key', {exact: true}).fill(key); await settings.getByRole('button', {name: '检查连接', exact: true}).click();
    await settings.getByRole('button', {name: '连接并清理旧缓存'}).click(); await settings.getByRole('button', {name: '检查差异并同步'}).click(); await settings.getByRole('button', {name: '确认同步', exact: true}).click();
    await expect(settings.getByText('已同步到本机，请重新扫描需要填写的网页。')).toBeVisible();
    const localEditor = await context.newPage(); await localEditor.goto(`chrome-extension://${id}/options.html`); await expect(localEditor.getByLabel('姓名', {exact: true})).toHaveValue('Example Student');
    const form = await context.newPage(); await form.goto('http://127.0.0.1:4174'); const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`); await form.bringToFront();
    await panel.getByRole('button', {name: '扫描当前页'}).evaluate((b: HTMLButtonElement) => b.click()); await expect(panel.getByRole('heading', {name: '填写预览'})).toBeVisible();
    await context.setOffline(true); await settings.getByRole('button', {name: '刷新列表'}).click(); await expect(settings.getByRole('alert')).toContainText('无法连接服务');
    await form.bringToFront(); await panel.getByRole('button', {name: /^填写选中的/}).evaluate((b: HTMLButtonElement) => b.click()); await expect(form.locator('#full-name')).toHaveValue('Example Student');
    expect(await form.evaluate(() => (window as any).__submitted)).toBe(0); await context.setOffline(false);
    const access = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({url: 'http://127.0.0.1:4174/*'});
      return (await chrome.scripting.executeScript({target: {tabId: tabs[0].id!}, func: async () => {
        let storage = false, message = false;
        try {storage = Boolean((await chrome.storage.local.get('resume_connection')).resume_connection);} catch {}
        try {message = Boolean((await chrome.runtime.sendMessage({type: 'REMOTE_STATE'}))?.data);} catch {}
        return {storage, message};
      }}))[0].result;
    }); expect(access).toEqual({storage: false, message: false});
    // A server edit invalidates an already displayed sync preview.
    await settings.getByRole('button', {name: '检查差异并同步'}).click();
    const me = await (await page.request.get('/v1/me')).json(), list = await (await page.request.get('/v1/resumes')).json();
    const r = await (await page.request.get('/v1/resumes/' + list.resumes[0].id)).json(); r.profile.basic.full_name = 'Updated Student';
    expect((await page.request.patch('/v1/resumes/' + r.id, {headers: {'X-CSRF-Token': me.csrf_token}, data: {expected_revision: r.revision, name: r.name, profile: r.profile}})).status()).toBe(200);
    await settings.getByRole('button', {name: '确认同步', exact: true}).click(); await expect(settings.getByRole('alert')).toContainText('网页简历已更新'); await settings.getByRole('button', {name: '取消', exact: true}).click();
    await settings.getByRole('button', {name: '检查差异并同步'}).click(); await settings.getByRole('button', {name: '确认同步', exact: true}).click();
    await expect(panel.getByText('页面或资料已变化。请重新扫描后再填写。')).toBeVisible();
    await mkdir('artifacts/screenshots/web', {recursive: true}); await settings.screenshot({path: 'artifacts/screenshots/web/plugin-sync.png', fullPage: true});
    // Revocation prevents new requests but leaves the explicitly retained offline cache.
    const keys = await (await page.request.get('/v1/keys')).json(); await page.request.delete('/v1/keys/' + keys.keys[0].id, {headers: {'Content-Type':'application/json','X-CSRF-Token':me.csrf_token}, data:{}});
    await settings.getByRole('button', {name: '刷新列表'}).click(); await expect(settings.getByRole('alert')).toContainText('已过期、撤销');
    await settings.getByLabel('API Key', {exact: true}).fill(adminKey.key); await settings.getByRole('button', {name: '检查连接', exact: true}).click(); await settings.getByRole('button', {name: '连接并清理旧缓存'}).click();
    await expect(settings.getByRole('heading', {name: 'administrator', exact: true})).toBeVisible();
    const cleared = await worker.evaluate(async () => {const v = await chrome.storage.local.get(['resume_profile','resume_backup','resume_connection']); return {profile: Boolean(v.resume_profile), backup: Boolean(v.resume_backup), user: (v.resume_connection as any)?.username};});
    expect(cleared).toEqual({profile:false,backup:false,user:'administrator'});
    await localEditor.getByLabel('姓名', {exact: true}).fill('Old account cache must not return'); await localEditor.getByRole('button', {name: '保存资料'}).click(); await expect(localEditor.getByRole('alert')).toContainText('其他窗口更新');
    settings.once('dialog', d => d.accept()); await settings.getByRole('button', {name: '断开连接', exact: true}).click(); await expect(settings.getByText('已断开连接，账号缓存和密钥已清除。')).toBeVisible();
    expect(await worker.evaluate(async () => Object.keys(await chrome.storage.local.get(['resume_profile','resume_backup','resume_connection'])))).toEqual([]);
  } finally {await context.close();}
});
