import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const pluginRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(pluginRoot, '../..');
const dataDir = await mkdtemp(join(tmpdir(), 'resume-companion-devtools-'));
let lab: ChildProcess | null = null;
let client: Client | null = null;

async function ensureLab(): Promise<void> {
  try {
    if ((await fetch('http://127.0.0.1:4174')).ok) return;
  } catch {
    // Start it below.
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

async function call(name: string, arguments_: Record<string, unknown> = {}): Promise<Record<string, any>> {
  if (!client) throw new Error('MCP test client is not connected');
  const result = await client.callTool({ name, arguments: arguments_ });
  const text = Array.isArray(result.content) ? result.content.find(item => item.type === 'text') : undefined;
  if (result.isError) throw new Error(text?.type === 'text' ? text.text : `${name} failed`);
  return result.structuredContent as Record<string, any>;
}

beforeAll(async () => {
  await ensureLab();
  const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['server.bundle.mjs'],
    cwd: pluginRoot,
    env: {
      ...environment,
      RESUME_COMPANION_DATA_DIR: dataDir,
      RESUME_COMPANION_CHROME_PROFILE_MODE: 'isolated',
      RESUME_COMPANION_DEVTOOLS_HEADLESS: '1',
      RESUME_COMPANION_DEVTOOLS_START_URL: `http://127.0.0.1:4174/agent-lab.html?run=devtools-${Date.now()}`,
    },
    stderr: 'pipe',
  });
  client = new Client({ name: 'resume-companion-devtools-live', version: '1.0.0' });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
  lab?.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
});

describe('DevTools MCP browser driver', () => {
  test('fills, verifies and conditionally undoes fields through Chrome DevTools', async () => {
    const status = await call('resume_status');
    expect(status.browser).toMatchObject({ kind: 'devtools', connected: false, profile_mode: 'isolated' });

    const created = await call('resume_profile_save', {
      name: 'DevTools 合成资料',
      changes: { basic: { full_name: 'DevTools 示例同学', email: 'devtools@example.com', phone: '13800000000', city: '示例市' } },
    });
    const profile = created.profile;
    const tabs = await call('resume_list_tabs', { url_contains: 'agent-lab.html' });
    expect(tabs.tabs).toHaveLength(1);

    const observed = await call('resume_observe', { tab_id: tabs.tabs[0].tabId });
    const name = observed.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '姓名 *');
    const email = observed.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '电子邮箱 *');
    const phone = observed.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '联系电话 *');
    const city = observed.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '现居城市 *');
    const document = observed.elements.find((element: Record<string, unknown>) => element.kind === 'document');
    expect(name).toBeTruthy();
    expect(email).toBeTruthy();
    expect(phone).toBeTruthy();
    expect(city).toBeTruthy();
    expect(document).toBeTruthy();
    const operationId = crypto.randomUUID();
    const written = await call('resume_act', {
      session_id: observed.session_id,
      snapshot_id: observed.snapshot_id,
      operation_id: operationId,
      action: {
        kind: 'set_value',
        ref: name.ref,
        expected_value_token: name.expected_value_token,
        value: { source: { profile_id: profile.id, profile_revision: profile.revision, source_ref: 'basic/full_name' } },
      },
    });
    expect(written).toMatchObject({ status: 'applied', dispatched: true });

    const batchId = crypto.randomUUID();
    const batchInput = {
      session_id: observed.session_id,
      snapshot_id: observed.snapshot_id,
      operation_id: batchId,
      action: {
        kind: 'set_values',
        items: [
          { kind: 'set_value', ref: email.ref, expected_value_token: email.expected_value_token, value: { source: { profile_id: profile.id, profile_revision: profile.revision, source_ref: 'basic/email' } } },
          { kind: 'set_value', ref: phone.ref, expected_value_token: phone.expected_value_token, value: { source: { profile_id: profile.id, profile_revision: profile.revision, source_ref: 'basic/phone' } } },
          { kind: 'set_value', ref: city.ref, expected_value_token: city.expected_value_token, value: { source: { profile_id: profile.id, profile_revision: profile.revision, source_ref: 'basic/city' } } },
        ],
      },
    };
    const batch = await call('resume_act', batchInput);
    expect(batch).toMatchObject({ status: 'applied', dispatched: true });
    expect(await call('resume_act', batchInput)).toEqual(batch);

    const scrolled = await call('resume_act', {
      session_id: observed.session_id,
      snapshot_id: observed.snapshot_id,
      operation_id: crypto.randomUUID(),
      action: { kind: 'scroll', ref: document.ref, direction: 'down', pixels: 600 },
    });
    expect(scrolled).toMatchObject({ status: 'applied', dispatched: true });

    const verified = await call('resume_observe', { session_id: observed.session_id, mode: 'verify', operation_ids: [operationId, batchId] });
    expect(verified.operations[0].values[0].value_retained).toBe(true);
    expect(verified.operations[1].values.every((value: Record<string, unknown>) => value.value_retained === true)).toBe(true);

    const undone = await call('resume_undo_operations', {
      session_id: observed.session_id,
      operation_ids: [operationId, batchId],
      operation_id: crypto.randomUUID(),
    });
    expect(undone.status).toBe('applied');
    const after = await call('resume_observe', { session_id: observed.session_id });
    expect(after.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '姓名 *')?.value).toBe('');
    expect(after.elements.find((element: Record<string, unknown>) => element.kind === 'text' && element.name === '电子邮箱 *')?.value).toBe('');
  }, 45_000);

  test('starts and reconnects to a persistent dedicated profile', async () => {
    const dedicatedDataDir = await mkdtemp(join(tmpdir(), 'resume-companion-dedicated-'));
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['server.bundle.mjs'],
      cwd: pluginRoot,
      env: {
        ...environment,
        RESUME_COMPANION_DATA_DIR: dedicatedDataDir,
        RESUME_COMPANION_CHROME_PROFILE_MODE: 'dedicated',
        RESUME_COMPANION_DEVTOOLS_HEADLESS: '1',
        RESUME_COMPANION_DEVTOOLS_START_URL: `http://127.0.0.1:4174/agent-lab.html?run=dedicated-${Date.now()}`,
      },
      stderr: 'pipe',
    });
    const dedicatedClient = new Client({ name: 'resume-companion-dedicated-live', version: '1.0.0' });
    const dedicatedCall = async (name: string, arguments_: Record<string, unknown> = {}): Promise<Record<string, any>> => {
      const result = await dedicatedClient.callTool({ name, arguments: arguments_ });
      const content = Array.isArray(result.content) ? result.content.find(item => item.type === 'text') : undefined;
      if (result.isError) throw new Error(content?.type === 'text' ? content.text : `${name} failed`);
      return result.structuredContent as Record<string, any>;
    };
    try {
      await dedicatedClient.connect(transport);
      expect((await dedicatedCall('resume_status')).browser).toMatchObject({
        connected: false,
        profile_mode: 'dedicated',
        permission_state: 'not_required',
      });
      const tabs = await dedicatedCall('resume_list_tabs', { url_contains: 'agent-lab.html' });
      expect(tabs.tabs).toHaveLength(1);
      expect((await dedicatedCall('resume_status')).browser).toMatchObject({ connected: true, profile_mode: 'dedicated' });
    } finally {
      await dedicatedClient.close();
      await rm(dedicatedDataDir, { recursive: true, force: true });
    }
  }, 45_000);
});
