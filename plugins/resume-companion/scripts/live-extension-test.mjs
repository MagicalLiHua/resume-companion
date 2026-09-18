import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from '@playwright/test';

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const extensionPath = resolve(projectRoot, 'test-results/codex-bridge-extension');
const extensionId = 'feifaflnkjdihpbbhnihidjjkeapamnh';
const port = 45000 + process.pid % 1000;
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
  try {
    const response = await fetch('http://127.0.0.1:4174');
    if (response.ok) return;
  } catch { /* Start a local fixture server below. */ }
  lab = spawn(process.execPath, ['scripts/lab-server.mjs'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4174');
      if (response.ok) return;
    } catch { /* Retry while the server starts. */ }
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
  await mkdir(extensionPath, { recursive: true });
  await cp(resolve(projectRoot, 'dist'), extensionPath, { recursive: true });
  const manifestPath = resolve(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace('127.0.0.1:43117',`127.0.0.1:${port}`);
  const backgroundPath = resolve(extensionPath,manifest.background.service_worker);
  await writeFile(backgroundPath,(await readFile(backgroundPath,'utf8')).replaceAll('127.0.0.1:43117',`127.0.0.1:${port}`));
  await writeFile(manifestPath, JSON.stringify(manifest));

  const transport = new StdioClientTransport({ command: process.execPath, args: ['./server.bundle.mjs'], cwd: pluginRoot, env:{...Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==='string')),RESUME_COMPANION_BRIDGE_PORT:String(port),RESUME_COMPANION_TOOLSET:'all'}, stderr: 'pipe' });
  client = new Client({ name: 'resume-companion-live-test', version: '0.2.0' });
  await client.connect(transport);

  context = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath: installedBrowser(),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  assert.equal(new URL(worker.url()).hostname, extensionId);

  let status = await call('resume_status');
  assert.equal(status.connected,false);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('button', { name: '用示例资料体验' }).click();
  await options.getByRole('button', { name: '替换编辑内容' }).click();
  await options.getByRole('button', { name: '保存资料' }).click();
  await options.getByRole('button', { name: '备份与恢复', exact: true }).first().click();
  await options.getByText('Codex 本地桥接').scrollIntoViewIfNeeded();
  await options.getByLabel('允许本机 Codex 枚举标签页并通过 DOM 扫描、填写和撤销').click();
  for (let attempt = 0; attempt < 30; attempt++) {
    status = await call('resume_status');
    if (status.enabled) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  assert.equal(status.enabled, true, `bridge preference did not persist: ${await options.locator('[role="alert"]').allTextContents()}`);

  const forms = [];
  for (const application of ['alpha', 'beta', 'gamma']) {
    const form = await context.newPage();
    await form.goto(`http://127.0.0.1:4174/?application=${application}`);
    forms.push(form);
  }
  await forms[0].bringToFront();
  status = await call('resume_status');
  assert.equal(status.enabled, true);
  assert.equal(status.batchSupported, true);
  assert.equal(status.activeTab.url, 'http://127.0.0.1:4174/?application=alpha');

  // Backward-compatible single-tab tools still work.
  const scan = await call('resume_scan_current_form');
  const name = scan.fields.find(field => field.label === '姓名');
  assert.equal(name.suggestion.value, '示例同学');
  assert.equal(await forms[0].locator('#full-name').inputValue(), '');

  const fill = await call('resume_fill_plan', {
    session_id: scan.sessionId,
    fields: [{ field_id: name.fieldId, use_suggestion: true }],
  });
  assert.equal(fill.results[0].status, 'filled');
  assert.equal(await forms[0].locator('#full-name').inputValue(), '示例同学');
  assert.equal(await forms[0].evaluate(() => globalThis.__submitted), 0);

  const verify = await call('resume_verify_fill', { session_id: scan.sessionId });
  assert.equal(verify.results[0].status, 'filled');
  const undo = await call('resume_undo_fill', { session_id: scan.sessionId });
  assert.equal(undo.results[0].status, 'undone');
  assert.equal(await forms[0].locator('#full-name').inputValue(), '');

  // Batch tools operate on background tabs without changing the active tab.
  const listing = await call('resume_list_tabs', { current_window_only: true, url_contains: '127.0.0.1:4174' });
  assert.equal(listing.total, 3);
  assert.equal(listing.tabs.length, 3);
  assert.equal(listing.tabs.filter(tab => tab.active).length, 1);
  const activeBeforeBatch = listing.tabs.find(tab => tab.active).tabId;

  const batchScan = await call('resume_scan_tabs', { tab_ids: listing.tabs.map(tab => tab.tabId) });
  assert.deepEqual(batchScan.summary, { requested: 3, scanned: 3, failed: 0 });
  for (const result of batchScan.results) {
    assert.equal(result.ok, true);
    assert.equal(result.fields.find(field => field.label === '姓名').suggestion.value, '示例同学');
  }

  const plans = batchScan.results.map(result => ({
    session_id: result.sessionId,
    fields: [{ field_id: result.fields.find(field => field.label === '姓名').fieldId, use_suggestion: true }],
  }));
  const batchFill = await call('resume_fill_batch', { plans });
  assert.deepEqual(batchFill.summary, { requested: 3, completed: 3, failed: 0 });
  assert.equal(batchFill.results.every(result => result.ok && result.results[0].status === 'filled'), true);
  for (const form of forms) {
    assert.equal(await form.locator('#full-name').inputValue(), '示例同学');
    assert.equal(await form.evaluate(() => globalThis.__submitted), 0);
  }

  const batchVerify = await call('resume_verify_batch', { session_ids: plans.map(plan => plan.session_id) });
  assert.deepEqual(batchVerify.summary, { requested: 3, completed: 3, failed: 0 });
  assert.equal(batchVerify.results.every(result => result.ok && result.results[0].status === 'filled'), true);
  const activeAfterBatch = (await call('resume_list_tabs', { url_contains: '127.0.0.1:4174' })).tabs.find(tab => tab.active).tabId;
  assert.equal(activeAfterBatch, activeBeforeBatch);

  await forms[1].locator('#full-name').fill('用户后续修改');
  const batchUndo = await call('resume_undo_batch', { session_ids: plans.map(plan => plan.session_id) });
  assert.deepEqual(batchUndo.summary, { requested: 3, completed: 3, failed: 0 });
  assert.equal(await forms[0].locator('#full-name').inputValue(), '');
  assert.equal(await forms[1].locator('#full-name').inputValue(), '用户后续修改');
  assert.equal(await forms[2].locator('#full-name').inputValue(), '');
  const betaSession = batchScan.results.find(result => result.tab.url.includes('application=beta')).sessionId;
  assert.equal(batchUndo.results.find(result => result.sessionId === betaSession).results[0].status, 'skipped');
  for (const form of forms) assert.equal(await form.evaluate(() => globalThis.__submitted), 0);

  const corePage = await context.newPage();
  await corePage.goto('http://127.0.0.1:4174/agent-lab.html?run=live-'+Date.now());
  const coreTab = (await call('resume_list_tabs',{url_contains:'agent-lab.html'})).tabs[0];
  const observed = await call('resume_observe',{tab_id:coreTab.tabId});
  const coreName = observed.elements.find(e=>e.kind==='text' && e.name==='姓名 *');
  const version = (await call('resume_status')).versions.find(v=>v.active);
  const profile = await call('resume_read_profile',{version_id:version.id,section:'basic'});
  assert.equal(profile.entries.find(e=>e.source_ref==='basic/full_name').value,'示例同学');
  const operationId = crypto.randomUUID();
  const parameters = {session_id:observed.session_id,snapshot_id:observed.snapshot_id,operation_id:operationId,action:{kind:'set_value',ref:coreName.ref,expected_value_token:coreName.expected_value_token,value:{source:{version_id:version.id,profile_revision:profile.profile_revision,source_ref:'basic/full_name'}}}};
  const written = await call('resume_act',parameters);
  assert.equal(written.status,'applied',JSON.stringify(written));
  assert.equal(await corePage.locator('[name=full_name]').inputValue(),'示例同学');
  assert.deepEqual(await call('resume_act',parameters),written);
  await call('resume_observe',{session_id:observed.session_id});
  const checked = await call('resume_observe',{session_id:observed.session_id,mode:'verify',operation_ids:[operationId]});
  assert.equal(checked.operations[0].values[0].value_retained,true);
  const undone = await call('resume_undo_operations',{session_id:observed.session_id,operation_ids:[operationId],operation_id:crypto.randomUUID()});
  assert.equal(undone.status,'applied');
  assert.equal(await corePage.locator('[name=full_name]').inputValue(),'');
  await corePage.reload();
  const stale = await client.callTool({name:'resume_act',arguments:{...parameters,operation_id:crypto.randomUUID()}});
  assert.equal(stale.isError===true || stale.structuredContent?.status==='unknown',true);
  assert.equal(await corePage.evaluate(()=>window.Lab.read().finalSubmits),0);
  console.log('Resume Companion live MCP-to-Chrome legacy + core/source/verify/undo/reload test: OK');
} finally {
  await context?.close();
  await client?.close();
  lab?.kill('SIGTERM');
}
