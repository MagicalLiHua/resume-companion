import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const runtime = resolve(pluginRoot, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
const profileDir = await mkdtemp(join(tmpdir(), 'resume-companion-stage0-profile-'));
let lab: ChildProcess | null = null;
let client: Client | null = null;
let pageId = 0;

const textOf = (result: ToolResult): string => Array.isArray(result.content)
  ? result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  : '';

function uidFor(snapshot: string, name: string): string {
  const candidates = snapshot.split('\n').filter(candidate => candidate.includes(`\"${name}\"`));
  const line = candidates.find(candidate => /\b(textbox|combobox|checkbox|radio|button|option)\b/.test(candidate)) ?? candidates[0];
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

beforeAll(async () => {
  await ensureLab();
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      runtime,
      '--headless',
      `--user-data-dir=${profileDir}`,
      '--no-usage-statistics',
      '--no-performance-crux',
      '--no-category-performance',
      '--no-category-emulation',
      '--redact-network-headers',
      '--screenshot-format=webp',
      '--screenshot-max-width=1440',
      '--screenshot-max-height=1200',
    ],
    cwd: pluginRoot,
    env: {
      ...environment,
      CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
    },
    stderr: 'pipe',
  });
  client = new Client({ name: 'resume-companion-stage0-direct', version: '1.0.0' });
  await client.connect(transport);
  const opened = await call('new_page', {
    url: `http://127.0.0.1:4174/agent-lab.html?run=stage0-${Date.now()}`,
  });
  pageId = selectedPageId(textOf(opened));
}, 30_000);

afterAll(async () => {
  await client?.close();
  lab?.kill('SIGTERM');
  await rm(profileDir, { recursive: true, force: true });
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
});
