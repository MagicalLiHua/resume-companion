import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let context: BrowserContext;
let worker: Worker;
let extensionId: string;
let root: string;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'resume-bridge-e2e-'));
  const extension = join(root, 'extension');
  await cp('dist', extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(join(root, 'profile'), {
    headless: true,
    executablePath: process.env.RESUME_TEST_BROWSER,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).hostname;
});
test.afterAll(async () => {
  await context?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
test.beforeEach(async () => {
  for (const page of context.pages()) await page.close();
  await worker.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.session.clear(); });
});

async function options(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  return page;
}

test('极简扩展只配置本地桥接，不创建浏览器简历数据', async () => {
  const page = await options();
  await expect(page.getByRole('heading', { name: '浏览器执行桥' })).toBeVisible();
  await expect(page.getByText('简历和补充资料现在由本地 MCP 管理')).toBeVisible();
  await page.getByLabel('开启本地桥接').check();
  await expect(page.getByText('等待本地 MCP 启动')).toBeVisible();
  const stored = await worker.evaluate(async () => chrome.storage.local.get(null));
  expect(stored).toEqual({ resume_bridge_settings: { version: 1, bridgeEnabled: true } });
  expect(JSON.stringify(stored)).not.toContain('profile');
});

test('升级只迁移桥接开关，旧浏览器资料保持原样', async () => {
  const legacy = {
    storageSchemaVersion: 2,
    preferences: { floatingEnabled: true, codexBridgeEnabled: true },
    current: { profile: { basic: { full_name: '旧版合成姓名' } } },
  };
  await worker.evaluate(async value => {
    await chrome.storage.local.set({ resume_state: value });
    await chrome.storage.local.remove('resume_bridge_settings');
  }, legacy);
  const page = await options();
  await expect(page.getByLabel('开启本地桥接')).toBeChecked();
  const stored = await worker.evaluate(async () => chrome.storage.local.get(null));
  expect(stored.resume_state).toEqual(legacy);
  expect(stored.resume_bridge_settings).toEqual({ version: 1, bridgeEnabled: true });
});

test('发布清单没有简历页面、悬浮注入或模型权限', async () => {
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  expect(manifest.side_panel).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
  expect(manifest.options_page).toBe('options.html');
});
