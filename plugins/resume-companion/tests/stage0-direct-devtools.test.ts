import { spawn, type ChildProcess } from 'node:child_process';
import { access, copyFile, mkdtemp, readlink, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { debugSocketPath } from '../src/browser/debug-bridge.js';
import { supervisorSocketPath } from '../src/browser/supervisor-protocol.js';
import { RUNTIME_PLUGIN_VERSION } from '../src/version.js';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const profileRoot = await mkdtemp(join(tmpdir(), 'resume-companion-stage0-profile-'));
const profileDir = join(profileRoot, 'chrome-profile');
const isCi = process.env.CI === 'true';
const benchmarkRuns = isCi ? 1 : 5;
let lab: ChildProcess | null = null;
let client: Client | null = null;
let pageId = 0;

function percentile(values: number[], percentileValue: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.ceil((sorted.length - 1) * percentileValue)]!;
}

function ciTimeout(localTimeoutMs: number): number {
  return isCi ? localTimeoutMs * 4 : localTimeoutMs;
}

const textOf = (result: ToolResult): string => Array.isArray(result.content)
  ? result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  : '';

function uidFor(snapshot: string, name: string): string {
  const candidates = snapshot.split('\n').filter(candidate => candidate.includes(`\"${name}`));
  const exactCandidates = candidates.filter(candidate => candidate.includes(`\"${name}\"`));
  const actionable = /\b(textbox|combobox|checkbox|radio|button|treeitem|spinbutton|DateTime)\b/;
  const option = /\boption\b/;
  const line = exactCandidates.find(candidate => actionable.test(candidate))
    ?? candidates.find(candidate => actionable.test(candidate))
    ?? exactCandidates.find(candidate => option.test(candidate))
    ?? candidates.find(candidate => option.test(candidate))
    ?? exactCandidates[0]
    ?? candidates[0];
  const uid = line?.match(/uid=([^\s]+)/)?.[1];
  if (!uid) throw new Error(`Snapshot did not contain a UID for ${name}:\n${snapshot}`);
  return uid;
}

function selectedPageId(text: string): number {
  const selected = text.split('\n').find(line => line.includes('[selected]'));
  const id = selected?.match(/^(\d+):/)?.[1] ?? text.match(/^(\d+):/m)?.[1];
  if (!id) throw new Error(`Unable to parse page id:\n${text}`);
  return Number(id);
}

async function call(name: string, arguments_: Record<string, unknown> = {}): Promise<ToolResult> {
  if (!client) throw new Error('Stage 0 MCP client is not connected');
  const result = await client.callTool(
    { name, arguments: arguments_ },
    undefined,
    { timeout: ciTimeout(60_000) },
  );
  if (result.isError) throw new Error(`${name}: ${textOf(result)}`);
  return result;
}

async function ensureLab(): Promise<void> {
  try {
    if ((await fetch('http://127.0.0.1:4174')).ok) return;
  } catch {
    // Start the fixture below.
  }
  lab = spawn(process.execPath, ['scripts/lab-server.mjs'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:4174')).ok) return;
    } catch {
      // Retry while the local fixture starts.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error('Local form fixture did not start');
}

async function currentChromePid(): Promise<number> {
  const singletonLock = join(profileDir, 'SingletonLock');
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const target = await readlink(singletonLock);
      const pid = /-(\d+)$/.exec(target)?.[1];
      if (pid) return Number(pid);
    } catch {
      // Chrome may still be starting or replacing its singleton lock.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error('Chrome singleton process id did not become available');
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM';
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!processIsAlive(pid)) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Chrome process ${pid} did not exit after SIGTERM`);
}

async function connectChromeMcp(): Promise<Client> {
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['chrome-launcher.bundle.mjs'],
    cwd: pluginRoot,
    env: {
      ...environment,
      RESUME_COMPANION_CHROME_DATA_DIR: profileDir,
      RESUME_COMPANION_CHROME_HEADLESS: '1',
      RESUME_COMPANION_SUPERVISOR_EPHEMERAL: '1',
      RESUME_COMPANION_TEST_DIAGNOSTICS: '1',
    },
    stderr: 'pipe',
  });
  if (process.env.RESUME_COMPANION_TEST_STDERR === '1') {
    transport.stderr?.on('data', chunk => process.stderr.write(chunk));
  }
  const connected = new Client({ name: 'resume-companion-stage0-direct', version: '1.0.0' });
  await connected.connect(transport);
  return connected;
}

async function debugRequest(request: Record<string, unknown>): Promise<Record<string, any>> {
  return await new Promise((resolveResponse, reject) => {
    const socket = createConnection(debugSocketPath(profileDir));
    let output = '';
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', chunk => { output += chunk; });
    socket.once('end', () => {
      try { resolveResponse(JSON.parse(output) as Record<string, any>); } catch (error) { reject(error); }
    });
    socket.once('error', reject);
  });
}

beforeAll(async () => {
  await ensureLab();
  client = await connectChromeMcp();
  const opened = await call('new_page', {
    url: `http://127.0.0.1:4174/agent-lab.html?run=stage0-${Date.now()}`,
  });
  pageId = selectedPageId(textOf(opened));
}, 30_000);

afterAll(async () => {
  await client?.close();
  if (process.platform !== 'win32') {
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        await access(supervisorSocketPath(profileDir));
      } catch {
        break;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
    }
  }
  lab?.kill('SIGTERM');
  await rm(profileRoot, { recursive: true, force: true });
});

describe('Stage 0 direct Chrome DevTools MCP validation', () => {
  test('uses background defaults and validates handoff reasons through MCP',async()=>{
    const catalog=(await client!.listTools()).tools;
    expect((catalog.find(t=>t.name==='new_page')!.inputSchema.properties!.background as any).default).toBe(true);
    expect((catalog.find(t=>t.name==='select_page')!.inputSchema.properties!.bringToFront as any).default).toBe(false);
    const opened=await call('new_page',{url:'http://127.0.0.1:4174/agent-lab.html?quiet-tab'}),other=selectedPageId(textOf(opened));
    try{
      await call('select_page',{pageId:other});
      const invalid=await client!.callTool({name:'select_page',arguments:{pageId:other,bringToFront:true}});
      expect(invalid.isError).toBe(true);expect(textOf(invalid)).toContain('attention_reason_required');
      const show={pageId:other,bringToFront:true,attention_reason:'manual_action',attention_event_id:'pause-photo'};
      await call('select_page',show);await call('select_page',show);
      // Upstream emulates focused pages for all tabs, so visibilityState cannot
      // prove native focus. Dispatch de-duplication has a separate unit test.
    }finally{await call('close_page',{pageId:other});await call('select_page',{pageId});}
  });
  test('uploads only explicitly authorized files to an actual file input', async () => {
    const opened=await call('new_page',{url:'about:blank'}),id=selectedPageId(textOf(opened));
    await call('evaluate_script',{pageId:id,function:`()=>{document.body.innerHTML='<label>测试照片<input type="file" id="photo"></label><button id="proxy" onclick="document.body.dataset.clicked=\\"yes\\"">上传代理</button>';return true;}`,waitForStableDom:false});
    const snapshot=textOf(await call('take_snapshot',{pageId:id}));
    const fixture=join(profileRoot,'test-blank-photo.jpg');await copyFile(resolve(projectRoot,'tests/fixtures/test-blank-photo.jpg'),fixture);
    const args={pageId:id,uid:uidFor(snapshot,'测试照片'),filePaths:[fixture]};
    const denied=await client!.callTool({name:'upload_file',arguments:args});
    expect(denied.isError).toBe(true);expect(textOf(denied)).toContain('manual_boundary');
    await call('upload_file',{...args,user_authorized:true});
    expect(textOf(await call('evaluate_script',{pageId:id,function:`()=>document.querySelector('#photo').files[0].name`,waitForStableDom:false}))).toContain('test-blank-photo.jpg');
    const proxy=await client!.callTool({name:'upload_file',arguments:{...args,uid:uidFor(snapshot,'上传代理'),user_authorized:true}});
    expect(proxy.isError).toBe(true);expect(textOf(proxy)).toContain('upload_target_not_file_input');
    await call('close_page',{pageId:id});
  },20_000);
  test('exposes the expected stable tools without experimental vision', async () => {
    if (!client) throw new Error('client unavailable');
    const names = (await client.listTools()).tools.map(tool => tool.name);
    expect(names).toContain('fill_form');
    expect(names).toContain('take_snapshot');
    expect(names).toContain('list_network_requests');
    expect(names).toContain('evaluate_script');
    expect(names).toEqual(expect.arrayContaining([
      'browser_takeover', 'form_support', 'form_observe', 'form_fill_fields', 'form_select_option', 'form_select_path', 'form_set_date', 'form_activate',
    ]));
    expect(names).not.toContain('click_at');
    const catalog=JSON.parse(textOf(await call('form_support')));
    expect(catalog.templates).toHaveLength(8);
    expect(catalog.platforms).toHaveLength(6);
    expect(catalog.templates.find((t:any)=>t.id==='dayee/faw').status).toBe('ordinary_fill_verified');
    const inspection=JSON.parse(textOf(await call('form_support',{page_ids:[pageId,pageId]})));
    expect(inspection.pages).toHaveLength(1);
    expect(inspection.pages[0]).toMatchObject({page_id:pageId,support:{status:'fixture',autofill_allowed:true}});
  });

  test.skipIf(process.platform === 'win32')('supports read-only live debugging through the owning browser process', async () => {
    const status = await debugRequest({ command: 'status' });
    expect(status.ok).toBe(true);
    expect(status.result.version).toBe(RUNTIME_PLUGIN_VERSION);
    expect(status.result.pages).toBeGreaterThan(0);

    const pages = await debugRequest({ command: 'list_pages' });
    expect(pages.ok).toBe(true);
    expect(pages.result.pages.some((page: { page_id: number }) => page.page_id === pageId)).toBe(true);

    const observation = await debugRequest({ command: 'observe', page_id: pageId, mode: 'focus', target: '姓名' });
    expect(observation.ok).toBe(true);
    expect(observation.result.page_id).toBe(pageId);
    expect(observation.result.metrics.response_bytes).toBeLessThanOrEqual(8_500);
  });

  test('moves the shared browser lease to a new task and requires explicit reclaim by the old task', async () => {
    const newer = await connectChromeMcp();
    try {
      const pages = await newer.callTool({ name: 'list_pages', arguments: {} });
      expect(pages.isError).not.toBe(true);
      expect(textOf(pages)).toContain(`${pageId}:`);

      const revoked = await client!.callTool({ name: 'list_pages', arguments: {} });
      expect(revoked.isError).toBe(true);
      expect(textOf(revoked)).toContain('browser_lease_revoked');

      const reclaimed = await client!.callTool({ name: 'browser_takeover', arguments: {} });
      expect(reclaimed.isError).not.toBe(true);
      expect(textOf(reclaimed)).toContain('taken_over');

      const newerRevoked = await newer.callTool({ name: 'list_pages', arguments: {} });
      expect(newerRevoked.isError).toBe(true);
      expect(textOf(newerRevoked)).toContain('browser_lease_revoked');
    } finally {
      await newer.close();
    }
  }, 20_000);

  test('returns a budgeted semantic overview instead of the complete 220-field page', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/long-form.html?semantic=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const observed = await call('form_observe', {
      page_id: pageId,
      mode: 'overview',
      max_bytes: 5_000,
      include_values: 'state',
    });
    const output = textOf(observed);
    const data = JSON.parse(output) as {
      truncated: boolean;
      fields: unknown[];
      metrics: { observed_fields: number; returned_fields: number };
    };
    expect(data.metrics.observed_fields).toBe(220);
    expect(data.metrics.returned_fields).toBeLessThan(220);
    expect(data.truncated).toBe(true);
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(5_400);
  }, 20_000);

  test('separates field triggers from popup options, advances generation, finds heading scopes, redacts raw snapshots and tracks low-level fallback', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/semantic-regressions.html?run=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const initial = JSON.parse(textOf(await call('form_observe', {
      page_id: pageId,
      mode: 'focus',
      target: '性别',
      scope: '基本信息',
      include_values: 'state',
    }))) as { generation: number; sections: string[]; fields: Array<{ label: string; scope?: string }> };
    expect(initial.sections).toContain('基本信息');
    expect(initial.fields.some(field => field.label === '性别' && field.scope === '基本信息')).toBe(true);

    const selectedGender = JSON.parse(textOf(await call('form_select_option', {
      page_id: pageId,
      expected_generation: initial.generation,
      operation_id: `gender-${Date.now()}`,
      field: '性别',
      scope: '基本信息',
      value: '男',
      test_mode: true,
    }))) as { ok: boolean; generation: number; field_state: string };
    expect(selectedGender.ok).toBe(true);
    expect(selectedGender.field_state).toBe('selected');
    expect(selectedGender.generation).toBeGreaterThan(initial.generation);

    const stale = await client!.callTool({
      name: 'form_select_path',
      arguments: { page_id: pageId, expected_generation: initial.generation, field: '籍贯', path: ['北京市', '海淀区'] },
    });
    expect(stale.isError).toBe(true);
    expect(textOf(stale)).toContain('generation_conflict');

    const selectedOrigin = JSON.parse(textOf(await call('form_select_path', {
      page_id: pageId,
      expected_generation: selectedGender.generation,
      operation_id: `origin-${Date.now()}`,
      field: '籍贯',
      scope: '基本信息',
      path: ['北京市', '海淀区'],
      test_mode: true,
    }))) as { ok: boolean; generation: number; completed_path: string[] };
    expect(selectedOrigin.ok).toBe(true);
    expect(selectedOrigin.completed_path).toEqual(['北京市', '海淀区']);
    expect(selectedOrigin.generation).toBeGreaterThan(selectedGender.generation);

    const snapshot = textOf(await call('take_snapshot', { pageId }));
    expect(snapshot).toContain('138****1234');
    expect(snapshot).toContain('pe******@example.com');
    expect(snapshot).not.toContain('11010120000101123X');
    expect(snapshot).not.toContain('2000-01-02');
    await call('hover', {
      pageId,
      uid: uidFor(snapshot, '北京市 / 海淀区'),
      operation_id: `low-level-${Date.now()}`,
      test_mode: true,
    });
    const ledger = JSON.parse(textOf(await call('form_observe', {
      page_id: pageId,
      mode: 'focus',
      target: '籍贯',
      include_test_ledger: true, ledger_limit: 25,
    }))) as { test_ledger: Array<{ action: string; tracking?: string }> };
    expect(ledger.test_ledger.some(entry => entry.action === 'hover' && entry.tracking === 'low_level_unverified')).toBe(true);
  }, 35_000);

  test('handles nested Ant Select, StaticText options, variable-depth cascaders and exact scoped references', async () => {
    pageId = selectedPageId(textOf(await call('new_page', { url: `http://127.0.0.1:4174/custom-select-regressions.html?run=${Date.now()}` })));
    const observe = async (args: Record<string, unknown> = {}) => JSON.parse(textOf(await call('form_observe', { page_id: pageId, mode: 'overview', max_bytes: 20_000, ...args })));
    const initial = await observe();
    expect(initial.sections).toEqual(['基本信息', '教育信息', '其他信息']);
    expect(initial.overlays).toHaveLength(0);
    expect(initial.fields.find((field: any) => field.label === '预填性别').state).toBe('filled');
    const gender = initial.fields.find((field: any) => field.label === '性别');
    for (const target of ['性别', gender.ref]) {
      const focus = await observe({ mode: 'focus', target, scope: 'page' });
      expect(focus.fields.map((field: any) => field.label)).toContain('性别');
    }
    const missing = await client!.callTool({ name: 'form_observe', arguments: { page_id: pageId, mode: 'focus', target: '不存在', scope: 'page' } });
    expect(textOf(missing)).toContain('target_unresolved');
    await call('form_activate', { page_id: pageId, target: gender.ref, intent: 'open' });
    const popup = await observe({ mode: 'focus', target: gender.ref });
    expect(popup.overlays[0].options).toEqual(['男', '女']);
    const absentOption = await client!.callTool({ name: 'form_select_option', arguments: { page_id: pageId, field: gender.ref, value: '不存在的选项' } });
    expect(absentOption.isError).toBe(true);
    expect((await observe({ mode: 'focus', target: gender.ref })).overlays[0].options).toEqual(['男', '女']);
    await call('form_select_option', { page_id: pageId, field: gender.ref, value: '男' });
    await call('form_select_option', { page_id: pageId, field: '民族', scope: '基本信息', value: '汉族' });
    for (const [field, path] of [['籍贯', ['上海市', '浦东新区']], ['现居住地', ['北京市', '市辖区', '海淀区']]] as const) {
      const result = JSON.parse(textOf(await call('form_select_path', { page_id: pageId, field, scope: '基本信息', path })));
      expect(result.ok).toBe(true);
      expect(result.completed_path).toEqual(path);
    }
    const filled = await observe();
    for (const label of ['性别', '民族', '籍贯', '现居住地']) expect(filled.fields.find((field: any) => field.label === label).state).toBe('filled');
    const saves = filled.fields.filter((field: any) => field.label.replace(/\s/g, '') === '保存');
    expect(saves.map((field: any) => field.scope)).toEqual(['基本信息', '其他信息']);
    const before = filled.generation;
    const ambiguous = JSON.parse(textOf(await client!.callTool({ name: 'form_activate', arguments: { page_id: pageId, target: '保存', scope: 'page', intent: 'save_record' } })));
    expect(ambiguous.error).toMatchObject({ code: 'target_ambiguous', generation: before, status: 'failed', side_effects: 'none' });
    const wrongScope = await client!.callTool({ name: 'form_activate', arguments: { page_id: pageId, target: '保存', scope: '不存在', intent: 'save_record' } });
    expect(textOf(wrongScope)).toContain('target_unresolved');
    await call('form_activate', { page_id: pageId, target: saves[0].ref, scope: 'page', intent: 'save_record' });
    await call('form_activate', { page_id: pageId, target: '保存', scope: '其他信息', intent: 'save_record' });
    const duplicates = filled.fields.filter((field: any) => field.label === '重复动作');
    await call('form_activate', { page_id: pageId, target: duplicates[1].ref, scope: 'page', intent: 'save_record' });
    const events = textOf(await call('evaluate_script', { pageId, function: '() => window.events', waitForStableDom: false }));
    expect(events).toContain('"basic":1'); expect(events).toContain('"other":1');
    expect(events).toContain('"duplicateA":0'); expect(events).toContain('"duplicateB":1');
    expect(events).toContain('"gender":1');
    const tools = await client!.listTools();
    expect(JSON.stringify(tools.tools.find(tool => tool.name === 'evaluate_script')?.inputSchema)).toContain('Element UIDs');
  }, 30_000);

  test('recognizes CSS-module selects, sibling titles, committed displays and scoped menus', async () => {
    pageId = selectedPageId(textOf(await call('new_page', { url: `http://127.0.0.1:4174/sd-controls-regressions.html?run=${Date.now()}` })));
    const observe = async (args: Record<string, unknown> = {}) => JSON.parse(textOf(await call('form_observe', { page_id: pageId, mode: 'overview', max_bytes: 20_000, ...args })));
    const action = async (field: string, value: string, scope = '个人信息') => JSON.parse(textOf(await client!.callTool({ name: 'form_select_option', arguments: { page_id: pageId, field, value, scope } })));
    const initial = await observe();
    expect(initial.sections).toEqual(['个人信息', '其他信息', '教育背景', '自我描述']);
    const gender = initial.fields.find((f: any) => f.label === '性别' && f.scope === '个人信息');
    expect(gender.state).toBe('filled');
    expect(gender.kind).toBe('combobox');
    expect(initial.fields.filter((f: any) => f.label === '请选择')).toHaveLength(0);
    expect(initial.fields.filter((f: any) => f.label === '手机号码')).toHaveLength(1);
    expect(initial.fields.find((f: any) => f.label === '手机号码 / 区号').kind).toBe('combobox');
    expect(initial.fields.find((f: any) => f.label === '简介').scope).toBe('自我描述');
    expect(initial.fields.filter((f: any) => f.scope === '教育背景' && f.kind === 'combobox').map((f: any) => f.label)).toEqual([
      '就读时间 / 开始年', '就读时间 / 开始月', '就读时间 / 结束年', '就读时间 / 结束月',
    ]);
    expect((await action('性别', '女')).status).toBe('preserved');
    expect((await action(gender.ref, '男', 'page')).status).toBe('unchanged');
    expect((await action('性别', '女', 'page')).error.code).toBe('target_ambiguous');
    await call('form_activate', { page_id: pageId, target: '民族', scope: '个人信息', intent: 'open' });
    const popup = await observe({ mode: 'focus', target: '民族', scope: '个人信息' });
    expect(popup.overlays[0]).toMatchObject({ label: '民族', options: ['汉族', '蒙古族', '不可选'] });
    // A search string is not a committed selection, even without ARIA roles.
    await call('evaluate_script', { pageId, waitForStableDom: false, function: `() => { const input = Array.from(document.querySelectorAll('.field')).find(el => el.firstElementChild.textContent.startsWith('民族')).querySelector('input'); input.value = '汉'; input.dispatchEvent(new Event('input', {bubbles:true})); }` });
    expect((await observe({ mode: 'focus', target: '民族' })).fields[0].state).toBe('blank');
    expect((await action('民族', '汉族')).status).toBe('verified_ui');
    expect((await observe({ mode: 'focus', target: '民族' })).fields[0].state).toBe('filled');
    const disabled = JSON.parse(textOf(await client!.callTool({ name: 'form_select_option', arguments: { page_id: pageId, field: '民族', value: '不可选', scope: '个人信息', overwrite: true } })));
    expect(disabled.error.code).toBe('constraint_violation');
    expect((await action('政治面貌', '共青团员')).status).toBe('verified_ui');
    expect((await action('性别', '女', '其他信息')).status).toBe('verified_ui');
    expect((await action('就读时间 / 开始年', '2024', '教育背景')).status).toBe('verified_ui');
    const duplicate = await action('重名选项', '甲');
    expect(duplicate.error.code).toBe('option_ambiguous');
    const facts = textOf(await call('evaluate_script', { pageId, function: '() => window.sdFixture()', waitForStableDom: false }));
    expect(facts).toContain('"gender":"男"');
    expect(facts).toContain('"otherGender":"女"');
    expect(facts).toContain('"ethnicity":"汉族"');
    expect(facts).toContain('"duplicate":0');
    expect(facts).toContain('"ethnicity":1');
  }, 30_000);

  test('sets split year/month groups in one call with record isolation and current-state protection', async () => {
    pageId = selectedPageId(textOf(await call('new_page', { url: `http://127.0.0.1:4174/sd-controls-regressions.html?extended=1&run=${Date.now()}` })));
    const date = async (args: Record<string, unknown>) => JSON.parse(textOf(await client!.callTool({ name: 'form_set_date', arguments: { page_id: pageId, ...args } })));
    const facts = async () => textOf(await call('evaluate_script', { pageId, function: '() => window.sdFixture()', waitForStableDom: false }));
    const observed = JSON.parse(textOf(await call('form_observe', { page_id: pageId, mode: 'overview', max_bytes: 20_000 })));
    const first = observed.fields.find((f: any) => f.label === '任职时间' && f.scope === '工作经历一');
    expect(first.kind).toBe('date_group');
    const batch = JSON.parse(textOf(await client!.callTool({ name: 'form_fill_fields', arguments: { page_id: pageId, fields: [
      { field: '任职时间 / 开始月', scope: '工作经历一', value: '6' },
      { field: '简介', scope: '自我描述', value: '先完成独立的简单字段' },
    ] } })));
    expect(batch.results.map((result: any) => result.status)).toEqual(['constraint_violation', 'filled']);
    expect((await date({ field: '任职时间', range: { start: '2024-06', end: '2026-07' } })).error.code).toBe('target_ambiguous');
    // Precision and reverse ranges are rejected without selecting any part.
    expect((await date({ field: first.ref, range: { start: '2024-06-15', end: '2026-07-15' } })).error.code).toBe('date_precision_mismatch');
    expect((await date({ field: first.ref, range: { start: '2026-07', end: '2024-06' } })).ok).toBe(false);
    expect(await facts()).toContain('"工作经历一.startYear":0');
    const args = { field: first.ref, range: { start: '2024-06', end: '2026-07' }, operation_id: 'split-month-range-1' };
    expect((await date(args)).status).toBe('verified_ui');
    const after = await facts();
    expect(after).toContain('"工作经历一.startYear":"2024年"');
    expect(after).toContain('"工作经历一.endMonth":"7月"');
    expect(after).toContain('"工作经历二.startYear":""');
    expect((await date(args)).status).toBe('verified_ui');
    expect(await facts()).toBe(after);
    expect((await date({ ...args, operation_id: 'split-month-range-2' })).status).toBe('unchanged');
    expect(await facts()).toBe(after);
    expect((await date({ field: first.ref, range: { start: '2024-06', current: true } })).status).toBe('preserved');
    expect((await date({ field: first.ref, range: { start: '2024-06', current: true }, overwrite: true })).status).toBe('verified_ui');
    expect(await facts()).toContain('"工作经历一.current":true');
    expect((await date({ field: first.ref, range: { start: '2023-07', end: '2025-06' }, overwrite: true })).status).toBe('verified_ui');
    expect(await facts()).toContain('"工作经历一.current":false');
    expect((await date({ field: '获得月份', scope: '个人信息', value: '2025-07' })).status).toBe('verified_ui');
    expect((await date({ field: '歧义月份', scope: '个人信息', value: '2024-06' })).error.code).toBe('option_ambiguous');
    expect(await facts()).toContain('"ambiguousMonth":0');
    const rollback = await date({ field: '回滚月份', scope: '个人信息', value: '2024-06' });
    expect(rollback.ok).toBe(false);
    expect(rollback.error.verification.matched).toBe(false);
    const final = JSON.parse(textOf(await call('form_observe', { page_id: pageId, mode: 'focus', target: '任职时间', scope: '工作经历一', include_values: 'needed' })));
    expect(final.fields.find((f: any) => f.kind === 'date_group').value).toBe('2023-07 / 2025-06');
  }, 45_000);

  test('selects scoped SD cascader columns and rejects incomplete or incorrect committed paths', async () => {
    pageId = selectedPageId(textOf(await call('new_page', { url: `http://127.0.0.1:4174/sd-controls-regressions.html?extended=1&run=${Date.now()}` })));
    const path = ['甲省', '甲城市', '同名区'];
    const choose = async (field: string, parts = path, overwrite = false) => JSON.parse(textOf(await client!.callTool({ name: 'form_select_path', arguments: { page_id: pageId, field, scope: '个人信息', path: parts, overwrite } })));
    const facts = async () => textOf(await call('evaluate_script', { pageId, function: '() => window.sdFixture()', waitForStableDom: false }));
    // Another visible popup must not contribute candidates to this field.
    await call('form_activate', { page_id: pageId, target: '异常选择', scope: '个人信息', intent: 'open' });
    expect((await choose('完整地址')).status).toBe('verified_ui');
    const after = await facts();
    expect(after).toContain('"address":["甲省","甲城市","同名区"]');
    expect(after).toContain('"address":3');
    expect((await choose('完整地址')).status).toBe('unchanged');
    expect(await facts()).toBe(after);
    expect((await choose('完整地址', ['乙省','乙城市','同名区'])).status).toBe('preserved');
    expect((await choose('完整地址', ['乙省','乙城市','同名区'], true)).status).toBe('verified_ui');
    const leaf = await choose('叶子回显地址');
    expect(leaf.error.verification.matched).toBe(false);
    expect(leaf.error.status).toBe('partial');
    const wrong = await choose('错误父级地址');
    expect(wrong.error.verification.matched).toBe(false);
    const missing = await choose('完整地址', ['甲省','甲城市','不存在的区'], true);
    expect(missing.error.code).toBe('option_not_found');
    expect(missing.error.completed_path).toEqual(['甲省','甲城市']);
    const disabled = await choose('完整地址', ['甲省','甲城市','禁用区'], true);
    expect(disabled.error.code).toBe('constraint_violation');
  }, 45_000);

  test('fills a semantic batch and masks existing phone and email values in observations', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/index.html?semantic-fill=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const filled = await call('form_fill_fields', {
      page_id: pageId,
      operation_id: `fill-${Date.now()}`,
      fields: [
        { field: '姓名', scope: '基本资料', value: '语义填写同学' },
        { field: '手机号', scope: '基本资料', value: '13800001234' },
        { field: '电子邮箱', scope: '基本资料', value: 'semantic@example.test' },
        { field: '现居城市', scope: '基本资料', value: '杭州' },
      ],
    });
    const fillData = JSON.parse(textOf(filled)) as { ok: boolean; change_summary: Record<string, number> };
    expect(fillData.ok).toBe(true);
    expect(fillData.change_summary.filled).toBe(4);
    const observed = textOf(await call('form_observe', {
      page_id: pageId,
      mode: 'focus',
      scope: '基本资料',
      include_values: 'masked',
    }));
    expect(observed).toContain('138****1234');
    expect(observed).toContain('se******@example.test');
    expect(observed).not.toContain('13800001234');
    expect(observed).not.toContain('semantic@example.test');
  }, 25_000);

  test('completes a three-level cascader in one semantic transaction', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/complex-controls-lab.html?semantic-path=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const selected = await call('form_select_path', {
      page_id: pageId,
      operation_id: `path-${Date.now()}`,
      field: '打开专业级联',
      path: ['工学', '计算机类', '软件工程'],
    });
    const data = JSON.parse(textOf(selected)) as { ok: boolean; completed_path: string[] };
    expect(data.ok).toBe(true);
    expect(data.completed_path).toEqual(['工学', '计算机类', '软件工程']);
    const report = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.ComplexControlsLab.report()`,
      waitForStableDom: false,
    }));
    expect(report).toContain('"cascader":"工学 / 计算机类 / 软件工程"');
  }, 25_000);

  test('handles custom options, complete dates, deltas, idempotency and manual boundaries', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/complex-controls-lab.html?semantic-actions=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const initial = JSON.parse(textOf(await call('form_observe', {
      page_id: pageId,
      mode: 'overview',
      include_values: 'state',
    }))) as { observation_id: string; generation: number };

    const locationOperation = `location-${Date.now()}`;
    const location = await call('form_select_option', {
      page_id: pageId,
      expected_generation: initial.generation,
      operation_id: locationOperation,
      field: '请选择工作地点',
      value: '上海',
      test_mode: true,
    });
    const locationResult = JSON.parse(textOf(location)) as { ok: boolean; generation: number };
    expect(locationResult.ok).toBe(true);
    expect(locationResult.generation).toBeGreaterThan(initial.generation);
    expect(textOf(await call('form_select_option', {
      page_id: pageId,
      operation_id: locationOperation,
      field: '请选择工作地点',
      value: '上海',
      test_mode: true,
    }))).toBe(textOf(location));

    const staleDate = await client!.callTool({ name: 'form_set_date', arguments: {
      page_id: pageId,
      expected_generation: initial.generation,
      field: '经历开始月份',
      value: '2024-09',
    } });
    expect(staleDate.isError).toBe(true);
    expect(textOf(staleDate)).toContain('generation_conflict');

    const dateResult = JSON.parse(textOf(await call('form_set_date', {
      page_id: pageId,
      expected_generation: locationResult.generation,
      field: '经历开始月份',
      value: '2024-09',
    }))) as { ok: boolean; generation: number };
    expect(dateResult.ok).toBe(true);
    expect(dateResult.generation).toBeGreaterThan(locationResult.generation);
    const summaryResult = JSON.parse(textOf(await call('form_fill_fields', {
      page_id: pageId,
      expected_generation: dateResult.generation,
      fields: [{ field: '个人简介', value: '用于验证局部观察的区域外变化。' }],
    }))) as { ok: boolean; generation: number };
    expect(summaryResult.ok).toBe(true);
    expect(summaryResult.generation).toBeGreaterThan(dateResult.generation);

    const delta = JSON.parse(textOf(await call('form_observe', {
      page_id: pageId,
      mode: 'delta',
      since_observation_id: initial.observation_id,
      include_values: 'needed',
      target: '经历开始月份',
      include_test_ledger: true, ledger_limit: 25,
    }))) as {
      changes: { fields: Array<{ label: string }> };
      locality: { changed_outside_scope: number; outside_change_labels: string[]; widen_recommended: boolean };
      test_ledger: unknown[];
    };
    expect(delta.changes.fields.some(field => field.label.includes('经历开始月份'))).toBe(true);
    expect(delta.changes.fields.some(field => field.label.includes('个人简介'))).toBe(false);
    expect(delta.locality.changed_outside_scope).toBeGreaterThanOrEqual(1);
    expect(delta.locality.outside_change_labels).toContain('个人简介');
    expect(delta.locality.widen_recommended).toBe(true);
    expect(delta.test_ledger).toHaveLength(1);

    const boundary = await client!.callTool({
      name: 'form_activate',
      arguments: { page_id: pageId, target: '最终提交申请（禁止自动点击）', intent: 'next_step' },
    });
    expect(boundary.isError).toBe(true);
    expect(textOf(boundary)).toContain('manual_boundary');
    const report = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.ComplexControlsLab.report()`,
      waitForStableDom: false,
    }));
    expect(report).toContain('"location":"上海"');
    expect(report).toContain('"start":"2024-09"');
    expect(report).toContain('"finalSubmits":0');
  }, 30_000);

  test('fills by semantics while the target DOM is continuously replaced', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/dom-churn.html?semantic-churn=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    await call('evaluate_script', {
      pageId,
      function: `() => { window.ChurnLab.churnFor(300); return true; }`,
      waitForStableDom: false,
    });
    const filled = JSON.parse(textOf(await call('form_fill_fields', {
      page_id: pageId,
      fields: [{ field: '姓名', scope: '基本信息', value: '语义抗抖同学' }],
    }))) as { ok: boolean };
    expect(filled.ok).toBe(true);
    const state = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.ChurnLab.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('"name":"语义抗抖同学"');
  }, 25_000);

  test('fills ordinary fields and a checkbox in one call and returns the next snapshot', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/agent-lab.html?legacy-flow=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const initial = textOf(await call('take_snapshot', { pageId }));
    const startedAt = performance.now();
    const filled = await call('fill_form', {
      pageId,
      includeSnapshot: true,
      elements: [
        { uid: uidFor(initial, '姓名 *'), value: '阶段零示例同学' },
        { uid: uidFor(initial, '电子邮箱 *'), value: 'stage0@example.com' },
        { uid: uidFor(initial, '联系电话 *'), value: '13800000000' },
        { uid: uidFor(initial, '现居城市 *'), value: '示例市' },
        { uid: uidFor(initial, '求职意向'), value: '测试开发工程师' },
        { uid: uidFor(initial, '可以接受异地办公'), value: 'true' },
        { uid: uidFor(initial, '个人简介'), value: '只用于本地阶段零评测。' },
      ],
    });
    const elapsedMs = performance.now() - startedAt;
    const output = textOf(filled);
    expect(output).toContain('Successfully filled out the form');
    expect(output).toContain('阶段零示例同学');
    expect(output).toContain('st******@example.com');
    expect(output).not.toContain('stage0@example.com');
    expect(output).toMatch(/checked|true/);
    expect(Buffer.byteLength(output, 'utf8')).toBeGreaterThan(100);
    expect(elapsedMs).toBeLessThan(15_000);
  }, 25_000);

  test('preflights all raw batch UIDs before writing a prefix', async () => {
    const snapshot = textOf(await call('take_snapshot', { pageId }));
    const result = await client!.callTool({
      name: 'fill_form',
      arguments: {
        pageId,
        includeSnapshot: true,
        elements: [
          { uid: uidFor(snapshot, '现居城市 *'), value: '部分成功市' },
          { uid: 'does-not-exist', value: '触发失败' },
        ],
      },
    });
    expect(result.isError).toBe(true);
    const after = textOf(await call('take_snapshot', { pageId }));
    expect(after).not.toContain('部分成功市');
    expect(after).toContain('示例市');
  }, 15_000);

  test('wait_for returns a reusable snapshot', async () => {
    const waited = textOf(await call('wait_for', { pageId, text: ['保存简历草稿'], timeout: 2_000 }));
    expect(waited).toContain('保存简历草稿');
    expect(waited).toContain('uid=');
  });

  test('dismissed beforeunload reports cancelled navigation and preserves the draft', async () => {
    const opened = await call('new_page', {url:'http://127.0.0.1:4174/long-form.html?cancelled-reload'});
    const targetPage = selectedPageId(textOf(opened));
    try {
      await call('evaluate_script',{pageId:targetPage,waitForStableDom:false,function:'() => {window.testDraft = "unsaved"; window.onbeforeunload = e => {e.preventDefault(); e.returnValue="";}; return true;}'});
      await call('press_key',{pageId:targetPage,key:'Tab'});
      const result = await client!.callTool({name:'navigate_page',arguments:{pageId:targetPage,type:'reload',handleBeforeUnload:'dismiss',timeout:1000}});
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ok:false,error:{code:'navigation_cancelled'}});
      const draft = await call('evaluate_script',{pageId:targetPage,waitForStableDom:false,function:'() => window.testDraft'});
      expect(textOf(draft)).toContain('unsaved');
    } finally {
      await call('evaluate_script',{pageId:targetPage,waitForStableDom:false,function:'() => {window.onbeforeunload=null;return true;}'});
      await call('close_page',{pageId:targetPage});
    }
  }, 15_000);

  test('completes a dynamic cascader record without any site-specific browser adapter', async () => {
    let snapshot = textOf(await call('take_snapshot', { pageId }));
    await call('form_activate', {page_id:pageId,target:'下一步',intent:'next_step'});
    snapshot = textOf(await call('take_snapshot', {pageId}));
    expect(snapshot).toContain('教育背景');
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '添加教育信息'), includeSnapshot: true }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '学校名称'), includeSnapshot: true }));
    snapshot = textOf(await call('wait_for', { pageId, text: ['国内'], timeout: 2_000 }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '国内'), includeSnapshot: true }));
    snapshot = textOf(await call('wait_for', { pageId, text: ['江苏省'], timeout: 2_000 }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '江苏省'), includeSnapshot: true }));
    snapshot = textOf(await call('wait_for', { pageId, text: ['示例理工大学'], timeout: 2_000 }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '示例理工大学'), includeSnapshot: true }));
    const filled = textOf(await call('fill_form', {
      pageId,
      includeSnapshot: true,
      elements: [
        { uid: uidFor(snapshot, '专业名称 *'), value: '软件工程' },
        { uid: uidFor(snapshot, '学历'), value: '本科' },
        { uid: uidFor(snapshot, '入学时间 *'), value: '2020-09' },
        { uid: uidFor(snapshot, '毕业时间 *'), value: '2024-06' },
      ],
    }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(filled, '保存教育经历'), includeSnapshot: true }));
    expect(snapshot).toContain('国内 / 江苏省 / 示例理工大学');
    const submitCount = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.Lab.read().finalSubmits`,
      waitForStableDom: false,
    }));
    expect(submitCount).toMatch(/\b0\b/);
  }, 30_000);

  test('fills 20 ordinary controls within the hot-run target and records snapshot cost', async () => {
    const durations: number[] = [];
    const responseBytes: number[] = [];
    const expected: Array<[string, string]> = [
      ['姓名', '基准同学'], ['邮箱', 'benchmark@example.com'], ['电话', '13800000000'], ['城市', '示例市'],
      ['意向岗位', '测试开发'], ['学校', '示例大学'], ['专业', '软件工程'], ['学历说明', '本科'],
      ['公司', '示例科技'], ['职位', '实习生'], ['项目名称', '虚构项目'], ['技能摘要', 'TypeScript'],
      ['岗位类别', '测试'], ['最高学历', '本科'], ['工作地点', '上海'], ['到岗时间', '一个月内'],
      ['能力选项 1', 'true'], ['能力选项 2', 'true'], ['能力选项 3', 'true'], ['能力选项 4', 'true'],
    ];
    let latest = '';
    for (let iteration = 0; iteration < benchmarkRuns; iteration++) {
      const opened = await call('new_page', { url: `http://127.0.0.1:4174/benchmark-form.html?iteration=${iteration}&run=${Date.now()}` });
      pageId = selectedPageId(textOf(opened));
      const snapshot = textOf(await call('take_snapshot', { pageId }));
      const startedAt = performance.now();
      latest = textOf(await call('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: expected.map(([name, value]) => ({ uid: uidFor(snapshot, name), value })),
      }));
      durations.push(performance.now() - startedAt);
      responseBytes.push(Buffer.byteLength(latest, 'utf8'));
      expect(latest).toContain('be******@example.com');
      expect(latest).not.toContain('benchmark@example.com');
      expect(latest).toContain('TypeScript');
      expect(latest).toMatch(/checked|true/);
    }
    const p50 = percentile(durations, 0.5);
    const p95 = percentile(durations, 0.95);
    if (!isCi) expect(p50).toBeLessThan(15_000);
    const state = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.Benchmark.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('benchmark@example.com');
    expect(state).toContain('"finalSubmits":0');
    console.log(JSON.stringify({ benchmark: 'direct-fill-form-20', runs: durations.length, p50_ms: Math.round(p50), p95_ms: Math.round(p95), max_response_bytes: Math.max(...responseBytes) }));
  }, 60_000);

  test('fills the same 20 ordinary controls in one semantic transaction with compact output', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/benchmark-form.html?semantic-batch=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const fields = [
      ['姓名', '语义基准同学'], ['邮箱', 'semantic-benchmark@example.com'], ['电话', '13800000000'], ['城市', '示例市'],
      ['意向岗位', '测试开发'], ['学校', '示例大学'], ['专业', '软件工程'], ['学历说明', '本科'],
      ['公司', '示例科技'], ['职位', '实习生'], ['项目名称', '虚构项目'], ['技能摘要', 'TypeScript'],
      ['岗位类别', '测试'], ['最高学历', '本科'], ['工作地点', '上海'], ['到岗时间', '一个月内'],
      ['能力选项 1', true], ['能力选项 2', true], ['能力选项 3', true], ['能力选项 4', true],
    ].map(([field, value]) => ({ field, value }));
    const startedAt = performance.now();
    const output = textOf(await call('form_fill_fields', { page_id: pageId, fields }));
    const elapsedMs = performance.now() - startedAt;
    const result = JSON.parse(output) as { ok: boolean; change_summary: { filled: number } };
    expect(result.ok).toBe(true);
    expect(result.change_summary.filled).toBe(20);
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThan(3_000);
    const state = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.Benchmark.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('semantic-benchmark@example.com');
    expect(state).toContain('"finalSubmits":0');
    console.log(JSON.stringify({ benchmark: 'semantic-fill-fields-20', calls: 1, elapsed_ms: Math.round(elapsedMs), response_bytes: Buffer.byteLength(output, 'utf8') }));
  }, 30_000);

  test('measures a 12-checkbox batch on the direct upstream route', async () => {
    const durations: number[] = [];
    for (let iteration = 0; iteration < benchmarkRuns; iteration++) {
      const opened = await call('new_page', { url: `http://127.0.0.1:4174/checkbox-benchmark.html?iteration=${iteration}` });
      pageId = selectedPageId(textOf(opened));
      const snapshot = textOf(await call('take_snapshot', { pageId }));
      const startedAt = performance.now();
      const filled = textOf(await call('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: Array.from({ length: 12 }, (_, index) => ({ uid: uidFor(snapshot, `批量选项 ${index + 1}`), value: 'true' })),
      }));
      durations.push(performance.now() - startedAt);
      expect((filled.match(/checked/g) ?? [])).toHaveLength(12);
    }
    console.log(JSON.stringify({ benchmark: 'direct-checkboxes-12', runs: durations.length, p50_ms: Math.round(percentile(durations, 0.5)), p95_ms: Math.round(percentile(durations, 0.95)) }));
  }, 45_000);

  test('records the unscoped snapshot cost of a long form', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/long-form.html?run=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const snapshot = textOf(await call('take_snapshot', { pageId }));
    const bytes = Buffer.byteLength(snapshot, 'utf8');
    expect(snapshot).toContain('字段 219');
    console.log(JSON.stringify({ benchmark: 'direct-long-snapshot-220', response_bytes: bytes, estimated_tokens: Math.ceil(bytes / 4), truncated: false }));
  }, 30_000);

  test('supports focused Network, Console, screenshot and read-only element diagnostics', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/diagnostics.html?run=${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const snapshot = textOf(await call('wait_for', { pageId, text: ['诊断请求完成'], timeout: 3_000 }));
    const dateUid = uidFor(snapshot, '入学日期');

    const constraints = textOf(await call('evaluate_script', {
      pageId,
      function: `(element) => { const input = element.matches('input') ? element : element.querySelector('input'); return { tagName: input?.tagName, min: input?.getAttribute('min'), max: input?.getAttribute('max'), readOnly: Boolean(input?.hasAttribute('readonly')), disabled: Boolean(input?.hasAttribute('disabled')) }; }`,
      args: [dateUid],
      waitForStableDom: false,
    }));
    expect(constraints).toContain('2020-01-01');
    expect(constraints).toContain('2030-12-31');
    expect(constraints).toContain('readOnly');

    const network = textOf(await call('list_network_requests', { pageId, pageSize: 10, pageIdx: 0, resourceTypes: ['fetch'] }));
    expect(network).toContain('/api/schools');
    const requestId = network.match(/reqid=(\d+)/)?.[1];
    expect(requestId).toBeTruthy();
    const request = textOf(await call('get_network_request', { pageId, reqid: Number(requestId) }));
    expect(request).toContain('示例大学');
    expect(request).not.toContain('synthetic-secret');

    const consoleList = textOf(await call('list_console_messages', { pageId, pageSize: 5, pageIdx: 0, types: ['error'] }));
    expect(consoleList).toContain('合成组件错误');
    const messageId = consoleList.match(/msgid=(\d+)/)?.[1];
    expect(messageId).toBeTruthy();
    expect(textOf(await call('get_console_message', { pageId, msgid: Number(messageId) }))).toContain('合成组件错误');

    // GitHub's displayless runner can stall in Chromium element rasterization.
    if (!isCi) {
      const screenshot = await call('take_screenshot', { pageId, uid: dateUid, format: 'webp' });
      expect(Array.isArray(screenshot.content) && screenshot.content.some(item => item.type === 'image')).toBe(true);
    }
  }, ciTimeout(30_000));

  test('opens the dedicated acceptance lab and completes its dynamic first step', async () => {
    const opened = await call('new_page', {
      url: `http://127.0.0.1:4174/acceptance-lab.html?run=stage0-acceptance-${Date.now()}&fresh=1`,
    });
    pageId = selectedPageId(textOf(opened));
    let snapshot = textOf(await call('take_snapshot', { pageId }));
    expect(snapshot).toContain('AI 网申综合验收');
    expect(snapshot).toContain('联系偏好备注');
    expect(snapshot).toContain('最终提交');
    snapshot = textOf(await call('fill_form', {
      pageId,
      includeSnapshot: true,
      elements: [
        { uid: uidFor(snapshot, '姓名'), value: '林星遥' },
        { uid: uidFor(snapshot, '英文名'), value: 'Xingyao Lin' },
        { uid: uidFor(snapshot, '手机号'), value: '13800001234' },
        { uid: uidFor(snapshot, '电子邮箱'), value: 'lin.xingyao@example.test' },
        { uid: uidFor(snapshot, '出生日期'), value: '2001-05-16' },
        { uid: uidFor(snapshot, '现居城市'), value: '杭州' },
        { uid: uidFor(snapshot, '省份'), value: '浙江省' },
      ],
    }));
    snapshot = textOf(await call('wait_for', { pageId, text: ['杭州市'], timeout: 3_000 }));
    snapshot = textOf(await call('fill_form', {
      pageId,
      includeSnapshot: true,
      elements: [{ uid: uidFor(snapshot, '城市'), value: '杭州市' }],
    }));
    snapshot = textOf(await call('wait_for', { pageId, text: ['西湖区'], timeout: 3_000 }));
    snapshot = textOf(await call('fill_form', {
      pageId,
      includeSnapshot: true,
      elements: [
        { uid: uidFor(snapshot, '区县'), value: '西湖区' },
        { uid: uidFor(snapshot, '申请职位'), value: '质量工程师' },
        { uid: uidFor(snapshot, '最早到岗日期'), value: '2026-07-15' },
        { uid: uidFor(snapshot, '杭州'), value: 'true' },
        { uid: uidFor(snapshot, '上海'), value: 'true' },
        { uid: uidFor(snapshot, '期望月薪'), value: '18000' },
        { uid: uidFor(snapshot, '可以接受异地办公'), value: 'true' },
      ],
    }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '保存并继续'), includeSnapshot: true }));
    expect(snapshot).toContain('教育与实习经历');
    expect(snapshot).toContain('添加教育经历');

    const report = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.AcceptanceLab.report()`,
      waitForStableDom: false,
    }));
    expect(report).toContain('"finalSubmitCount":0');
    expect(report).toContain('"agreementUnchecked":true');
  }, ciTimeout(35_000));

  test('runs the complex control recipes through deterministic passes', async () => {
    const durations: number[] = [];
    const callCounts: number[] = [];
    for (let iteration = 0; iteration < benchmarkRuns; iteration++) {
      const startedAt = performance.now();
      let calls = 0;
      const recipeCall = async (name: string, arguments_: Record<string, unknown> = {}): Promise<string> => {
        calls += 1;
        return textOf(await call(name, arguments_));
      };

      const opened = await call('new_page', {
        url: `http://127.0.0.1:4174/complex-controls-lab.html?iteration=${iteration}&run=${Date.now()}`,
      });
      calls += 1;
      pageId = selectedPageId(textOf(opened));
      let snapshot = await recipeCall('take_snapshot', { pageId });

      snapshot = await recipeCall('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: [
          { uid: uidFor(snapshot, '测试姓名'), value: '配方测试同学' },
          { uid: uidFor(snapshot, '最高学历'), value: '硕士研究生' },
          { uid: uidFor(snapshot, '校招'), value: 'true' },
          { uid: uidFor(snapshot, '接受远程办公'), value: 'true' },
          { uid: uidFor(snapshot, '个人简介'), value: '本地复杂控件回归资料。' },
          { uid: uidFor(snapshot, '项目亮点'), value: '把动态表单拆成可验证的交互配方。' },
          { uid: uidFor(snapshot, '经历开始月份'), value: '2024-09' },
          { uid: uidFor(snapshot, '经历结束月份'), value: '2026-06' },
        ],
      });
      snapshot = await recipeCall('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: [{ uid: uidFor(snapshot, '工作至今'), value: 'true' }],
      });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '请选择工作地点'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '上海'), includeSnapshot: true });

      snapshot = await recipeCall('fill', { pageId, uid: uidFor(snapshot, '学校名称（异步搜索）'), value: '星河', includeSnapshot: true });
      snapshot = await recipeCall('wait_for', { pageId, text: ['星河理工大学 · 杭州'], timeout: 3_000 });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '星河理工大学 · 杭州'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '打开专业级联'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '工学'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '计算机类'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '软件工程'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '展开计算机方向'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '测试开发'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '打开申请渠道选择'), includeSnapshot: true });
      snapshot = await recipeCall('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: [
          { uid: uidFor(snapshot, '校园官网'), value: 'true' },
          { uid: uidFor(snapshot, '接受岗位调剂'), value: 'true' },
        ],
      });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '确认申请渠道'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '打开证书候选'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '下一批候选'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '下一批候选'), includeSnapshot: true });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '证书 9'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '添加教育记录'), includeSnapshot: true });
      snapshot = await recipeCall('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: [
          { uid: uidFor(snapshot, '记录学校名称'), value: '星河理工大学' },
          { uid: uidFor(snapshot, '记录专业'), value: '软件工程' },
          { uid: uidFor(snapshot, '记录学历'), value: '本科' },
          { uid: uidFor(snapshot, '记录入学月份'), value: '2020-09' },
        ],
      });
      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '保存教育记录'), includeSnapshot: true });

      snapshot = await recipeCall('click', { pageId, uid: uidFor(snapshot, '展开补充资料'), includeSnapshot: true });
      snapshot = await recipeCall('wait_for', { pageId, text: ['补充昵称'], timeout: 3_000 });
      snapshot = await recipeCall('fill', { pageId, uid: uidFor(snapshot, '补充昵称'), value: '小星', includeSnapshot: true });

      snapshot = await recipeCall('fill_form', {
        pageId,
        includeSnapshot: true,
        elements: [
          { uid: uidFor(snapshot, '推荐人姓名（iframe）'), value: '示例推荐人' },
          { uid: uidFor(snapshot, '已获推荐人同意'), value: 'true' },
        ],
      });
      snapshot = await recipeCall('fill', { pageId, uid: uidFor(snapshot, '内推码'), value: 'LAB-2026', includeSnapshot: true });
      snapshot = await recipeCall('wait_for', { pageId, text: ['校验通过并已自动保存'], timeout: 3_000 });
      expect(snapshot).toContain('最终提交申请（禁止自动点击）');

      const report = await recipeCall('evaluate_script', {
        pageId,
        function: `() => window.ComplexControlsLab.report()`,
        waitForStableDom: false,
      });
      expect(report).toContain('"fullName":"配方测试同学"');
      expect(report).toContain('"degree":"硕士研究生"');
      expect(report).toContain('"highlight":"把动态表单拆成可验证的交互配方。"');
      expect(report).toContain('"location":"上海"');
      expect(report).toContain('"school":"星河理工大学"');
      expect(report).toContain('"cascader":"工学 / 计算机类 / 软件工程"');
      expect(report).toContain('"tree":"测试开发"');
      expect(report).toContain('"channel":"校园官网"');
      expect(report).toContain('"transfer":true');
      expect(report).toContain('"certificate":"证书 9"');
      expect(report).toContain('"current":true');
      expect(report).toContain('"endDisabled":true');
      expect(report).toContain('"nickname":"小星"');
      expect(report).toContain('"name":"示例推荐人"');
      expect(report).toContain('"state":"saved"');
      expect(report).toContain('"finalSubmits":0');
      expect(report).toContain('"boundaryViolations":0');
      expect(report).not.toContain('final_submit');

      durations.push(performance.now() - startedAt);
      callCounts.push(calls);
    }
    expect(callCounts).toEqual(Array.from({ length: benchmarkRuns }, () => 32));
    console.log(JSON.stringify({
      benchmark: 'complex-control-recipes',
      runs: durations.length,
      p50_ms: Math.round(percentile(durations, 0.5)),
      p95_ms: Math.round(percentile(durations, 0.95)),
      calls_per_run: callCounts[0],
      boundary_violations: 0,
    }));
  }, 240_000);

  test('re-resolves detached SPA controls by unique accessibility semantics', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/dom-churn.html?run=${Date.now()}` });
    const churnPageId = selectedPageId(textOf(opened));
    const snapshot = textOf(await call('take_snapshot', { pageId: churnPageId }));
    const nameUid = uidFor(snapshot, '姓名');
    const addUid = uidFor(snapshot, '添加教育信息');

    await call('evaluate_script', {
      pageId: churnPageId,
      function: `() => { window.ChurnLab.replaceControls(); return true; }`,
      waitForStableDom: false,
    });
    await call('fill', { pageId: churnPageId, uid: nameUid, value: '节点恢复同学' });
    await call('click', { pageId: churnPageId, uid: addUid });

    const state = textOf(await call('evaluate_script', {
      pageId: churnPageId,
      function: `() => window.ChurnLab.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('"name":"节点恢复同学"');
    expect(state).toContain('"clicked":"已点击 1 次"');
    expect(state).toContain('"clickCount":1');
    await call('close_page', { pageId: churnPageId });
  }, 20_000);

  test('recovers once when SPA nodes are replaced during locator actions', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/dom-churn.html?action-time=${Date.now()}` });
    const churnPageId = selectedPageId(textOf(opened));
    const snapshot = textOf(await call('take_snapshot', { pageId: churnPageId }));
    const nameUid = uidFor(snapshot, '姓名');
    const addUid = uidFor(snapshot, '添加教育信息');

    await call('evaluate_script', {
      pageId: churnPageId,
      function: `() => { window.ChurnLab.churnFor(300); return true; }`,
      waitForStableDom: false,
    });
    await call('fill', { pageId: churnPageId, uid: nameUid, value: '动作期恢复同学' });

    await call('evaluate_script', {
      pageId: churnPageId,
      function: `() => { window.ChurnLab.churnFor(300); return true; }`,
      waitForStableDom: false,
    });
    await call('click', { pageId: churnPageId, uid: addUid });

    const state = textOf(await call('evaluate_script', {
      pageId: churnPageId,
      function: `() => window.ChurnLab.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('"name":"动作期恢复同学"');
    expect(state).toContain('"clickCount":1');
    await call('close_page', { pageId: churnPageId });
  }, 30_000);

  test('reuses a running dedicated Chrome and relaunches it after the window exits', async () => {
    const opened = await call('new_page', { url: `http://127.0.0.1:4174/agent-lab.html?run=browser-relaunch-${Date.now()}` });
    pageId = selectedPageId(textOf(opened));
    const marker = `browser-relaunch-${Date.now()}`;
    await call('evaluate_script', {
      pageId,
      function: `() => { localStorage.setItem('resume-browser-relaunch', ${JSON.stringify(marker)}); return true; }`,
      waitForStableDom: false,
    });

    const initialPid = await currentChromePid();
    await call('list_pages');
    expect(await currentChromePid()).toBe(initialPid);

    process.kill(initialPid, 'SIGTERM');
    await waitForProcessExit(initialPid);
    let relaunched = '';
    let lastError: unknown;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        relaunched = textOf(await call('list_pages'));
        if (relaunched) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
    if (!relaunched) throw lastError ?? new Error('Chrome did not relaunch after its process exited');
    const relaunchedPid = await currentChromePid();
    expect(relaunchedPid).not.toBe(initialPid);

    const reopened = await call('new_page', { url: `http://127.0.0.1:4174/agent-lab.html?run=browser-relaunch-check-${Date.now()}` });
    pageId = selectedPageId(textOf(reopened));
    const persisted = textOf(await call('evaluate_script', {
      pageId,
      function: `() => localStorage.getItem('resume-browser-relaunch')`,
      waitForStableDom: false,
    }));
    expect(persisted).toContain(marker);
  }, 40_000);

  test('restarts with the same dedicated profile and keeps site state', async () => {
    const marker = `kept-${Date.now()}`;
    const written = textOf(await call('evaluate_script', {
      pageId,
      function: `() => { const marker = ${JSON.stringify(marker)}; localStorage.setItem('resume-stage0-persistence', marker); return localStorage.getItem('resume-stage0-persistence'); }`,
      waitForStableDom: false,
    }));
    expect(written).toContain(marker);
    await client!.close();
    client = null;
    client = await connectChromeMcp();
    const reopened = await call('new_page', { url: `http://127.0.0.1:4174/agent-lab.html?run=persistence-${Date.now()}` });
    pageId = selectedPageId(textOf(reopened));
    const read = textOf(await call('evaluate_script', {
      pageId,
      function: `() => localStorage.getItem('resume-stage0-persistence')`,
      waitForStableDom: false,
    }));
    expect(read).toContain(marker);
  }, 30_000);
});
