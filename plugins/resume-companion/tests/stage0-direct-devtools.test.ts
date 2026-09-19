import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const profileRoot = await mkdtemp(join(tmpdir(), 'resume-companion-stage0-profile-'));
const profileDir = join(profileRoot, 'chrome-profile');
let lab: ChildProcess | null = null;
let client: Client | null = null;
let pageId = 0;

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
  const result = await client.callTool({ name, arguments: arguments_ });
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
    },
    stderr: 'pipe',
  });
  const connected = new Client({ name: 'resume-companion-stage0-direct', version: '1.0.0' });
  await connected.connect(transport);
  return connected;
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
  lab?.kill('SIGTERM');
  await rm(profileRoot, { recursive: true, force: true });
});

describe('Stage 0 direct Chrome DevTools MCP validation', () => {
  test('exposes the expected stable tools without experimental vision', async () => {
    if (!client) throw new Error('client unavailable');
    const names = (await client.listTools()).tools.map(tool => tool.name);
    expect(names).toContain('fill_form');
    expect(names).toContain('take_snapshot');
    expect(names).toContain('list_network_requests');
    expect(names).toContain('evaluate_script');
    expect(names).not.toContain('click_at');
  });

  test('fills ordinary fields and a checkbox in one call and returns the next snapshot', async () => {
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
    expect(output).toContain('stage0@example.com');
    expect(output).toMatch(/checked|true/);
    expect(Buffer.byteLength(output, 'utf8')).toBeGreaterThan(100);
    expect(elapsedMs).toBeLessThan(15_000);
  }, 25_000);

  test('preserves a successful prefix when a later batch element fails so recovery can re-observe', async () => {
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
    expect(after).toContain('部分成功市');
  }, 15_000);

  test('wait_for returns a reusable snapshot', async () => {
    const waited = textOf(await call('wait_for', { pageId, text: ['保存简历草稿'], timeout: 2_000 }));
    expect(waited).toContain('保存简历草稿');
    expect(waited).toContain('uid=');
  });

  test('completes a dynamic cascader record without any site-specific browser adapter', async () => {
    let snapshot = textOf(await call('take_snapshot', { pageId }));
    snapshot = textOf(await call('click', { pageId, uid: uidFor(snapshot, '下一步'), includeSnapshot: true }));
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
    for (let iteration = 0; iteration < 5; iteration++) {
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
      expect(latest).toContain('benchmark@example.com');
      expect(latest).toContain('TypeScript');
      expect(latest).toMatch(/checked|true/);
    }
    const sorted = durations.slice().sort((left, right) => left - right);
    const p50 = sorted[2]!;
    const p95 = sorted[4]!;
    expect(p50).toBeLessThan(15_000);
    const state = textOf(await call('evaluate_script', {
      pageId,
      function: `() => window.Benchmark.read()`,
      waitForStableDom: false,
    }));
    expect(state).toContain('benchmark@example.com');
    expect(state).toContain('"finalSubmits":0');
    console.log(JSON.stringify({ benchmark: 'direct-fill-form-20', runs: durations.length, p50_ms: Math.round(p50), p95_ms: Math.round(p95), max_response_bytes: Math.max(...responseBytes) }));
  }, 60_000);

  test('measures a 12-checkbox batch on the direct upstream route', async () => {
    const durations: number[] = [];
    for (let iteration = 0; iteration < 5; iteration++) {
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
    const sorted = durations.slice().sort((left, right) => left - right);
    console.log(JSON.stringify({ benchmark: 'direct-checkboxes-12', runs: durations.length, p50_ms: Math.round(sorted[2]!), p95_ms: Math.round(sorted[4]!) }));
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

    const screenshot = await call('take_screenshot', { pageId, uid: dateUid, format: 'webp' });
    expect(Array.isArray(screenshot.content) && screenshot.content.some(item => item.type === 'image')).toBe(true);
  }, 30_000);

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
  }, 35_000);

  test('runs the complex control recipes through five deterministic passes', async () => {
    const durations: number[] = [];
    const callCounts: number[] = [];
    for (let iteration = 0; iteration < 5; iteration++) {
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
    const sorted = durations.slice().sort((left, right) => left - right);
    expect(callCounts).toEqual([32, 32, 32, 32, 32]);
    console.log(JSON.stringify({
      benchmark: 'complex-control-recipes',
      runs: durations.length,
      p50_ms: Math.round(sorted[2]!),
      p95_ms: Math.round(sorted[4]!),
      calls_per_run: callCounts[0],
      boundary_violations: 0,
    }));
  }, 240_000);

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
