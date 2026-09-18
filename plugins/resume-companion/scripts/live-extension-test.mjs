import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from '@playwright/test';

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const extensionPath = resolve(projectRoot, 'test-results/mcp-first-extension');
const extensionId = 'feifaflnkjdihpbbhnihidjjkeapamnh';
const port = 45_000 + process.pid % 1_000;
const dataDir = await mkdtemp(join(tmpdir(), 'resume-companion-live-data-'));
let lab = null;
let context = null;
let client = null;

function installedBrowser() {
  if (process.env.RESUME_TEST_BROWSER) return process.env.RESUME_TEST_BROWSER;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const folder of readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))) {
    const executable = join(cache, folder, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(executable)) return executable;
  }
  return undefined;
}

async function ensureLab() {
  try { if ((await fetch('http://127.0.0.1:4174')).ok) return; } catch { /* Start it below. */ }
  lab = spawn(process.execPath, ['scripts/lab-server.mjs'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:4174')).ok) return; } catch { /* Retry. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error('Local form fixture did not start');
}

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text ?? `${name} failed`);
  return result.structuredContent;
}

try {
  await ensureLab();
  await rm(extensionPath, { recursive: true, force: true });
  await mkdir(extensionPath, { recursive: true });
  await cp(resolve(projectRoot, 'dist'), extensionPath, { recursive: true });
  const manifestPath = resolve(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace('127.0.0.1:43117', `127.0.0.1:${port}`);
  const backgroundPath = resolve(extensionPath, manifest.background.service_worker);
  await writeFile(backgroundPath, (await readFile(backgroundPath, 'utf8')).replaceAll('127.0.0.1:43117', `127.0.0.1:${port}`));
  await writeFile(manifestPath, JSON.stringify(manifest));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['./server.bundle.mjs'],
    cwd: pluginRoot,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
      RESUME_COMPANION_BRIDGE_PORT: String(port),
      RESUME_COMPANION_DATA_DIR: dataDir,
      RESUME_COMPANION_BROWSER_DRIVER: 'extension',
    },
    stderr: 'pipe',
  });
  client = new Client({ name: 'resume-companion-live-test', version: '0.5.0' });
  await client.connect(transport);

  let status = await call('resume_status');
  assert.equal(status.storage.profile_count, 0);
  assert.equal(status.browser.connected, false);

  context = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath: installedBrowser(),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  assert.equal(new URL(worker.url()).hostname, extensionId);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('开启本地桥接').check();
  for (let attempt = 0; attempt < 40; attempt++) {
    status = await call('resume_status');
    if (status.browser.connected && status.browser.compatible) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  assert.equal(status.browser.connected, true);
  assert.equal(status.browser.compatible, true);
  await options.getByText('已连接本地 MCP').waitFor();

  const saved = await call('resume_profile_save', {
    name: '端到端合成资料',
    changes: { basic: { full_name: '示例同学', email: 'student@example.com', city: '南京' } },
    source_markdown: '# 仅用于自动化测试的合成简历',
  });
  const profile = saved.profile;
  assert.equal((await call('resume_profile_list')).profiles.length, 1);
  assert.equal((await call('resume_profile_read', { profile_id: profile.id, section: 'basic' })).data.full_name, '示例同学');

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4174/agent-lab.html?run=live-${Date.now()}`);
  const tab = (await call('resume_list_tabs', { url_contains: 'agent-lab.html' })).tabs[0];
  const observed = await call('resume_observe', { tab_id: tab.tabId });
  const name = observed.elements.find(element => element.kind === 'text' && element.name === '姓名 *');
  assert(name, 'name field was not observed');
  const operationId = crypto.randomUUID();
  const parameters = {
    session_id: observed.session_id,
    snapshot_id: observed.snapshot_id,
    operation_id: operationId,
    action: {
      kind: 'set_value',
      ref: name.ref,
      expected_value_token: name.expected_value_token,
      value: { source: { profile_id: profile.id, profile_revision: profile.revision, source_ref: 'basic/full_name' } },
    },
  };
  const written = await call('resume_act', parameters);
  assert.equal(written.status, 'applied', JSON.stringify(written));
  assert.equal(await page.locator('[name=full_name]').inputValue(), '示例同学');
  const verified = await call('resume_observe', { session_id: observed.session_id, mode: 'verify', operation_ids: [operationId] });
  assert.equal(verified.operations[0].values[0].value_retained, true);
  const undone = await call('resume_undo_operations', { session_id: observed.session_id, operation_ids: [operationId], operation_id: crypto.randomUUID() });
  assert.equal(undone.status, 'applied');
  assert.equal(await page.locator('[name=full_name]').inputValue(), '');
  assert.equal(await page.evaluate(() => window.Lab.read().finalSubmits), 0);

  const browserStorage = await worker.evaluate(async () => chrome.storage.local.get(null));
  assert.deepEqual(Object.keys(browserStorage), ['resume_bridge_settings']);
  assert.equal(JSON.stringify(browserStorage).includes('示例同学'), false);
  assert.equal(JSON.stringify(browserStorage).includes('student@example.com'), false);
  console.log('MCP profile store -> literal-only Chrome bridge -> observe/act/verify/undo: OK');
} finally {
  await context?.close();
  await client?.close();
  lab?.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
