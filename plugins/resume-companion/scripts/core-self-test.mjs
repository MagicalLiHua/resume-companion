import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

const root = resolve(import.meta.dirname, '..');
const extensionId = 'feifaflnkjdihpbbhnihidjjkeapamnh';
const port = 47_000 + process.pid % 500;
const dataDir = await mkdtemp(join(tmpdir(), 'resume-companion-mcp-'));
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'));
const client = new Client({ name: 'resume-companion-contract', version: '1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['server.bundle.mjs'],
  cwd: root,
  env: {
    ...baseEnv,
    RESUME_COMPANION_BRIDGE_PORT: String(port),
    RESUME_COMPANION_DATA_DIR: dataDir,
  },
  stderr: 'pipe',
});

const call = async (name, arguments_ = {}) => client.callTool({ name, arguments: arguments_ });
await client.connect(transport);
let socket;
try {
  const listed = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(listed, [
    'resume_act', 'resume_activate_tab', 'resume_list_tabs', 'resume_observe',
    'resume_profile_list', 'resume_profile_read', 'resume_profile_save',
    'resume_status', 'resume_undo_operations', 'resume_wait',
  ].sort());

  const initial = await call('resume_status');
  assert.equal(initial.structuredContent.storage.profile_count, 0);
  assert.equal(initial.structuredContent.browser.connected, false);

  const created = await call('resume_profile_save', {
    name: '合成测试简历',
    changes: {
      basic: { full_name: '测试同学', email: 'test@example.com', city: '南京' },
      education: [{
        school: '示例大学', major: '软件工程', education_level: 'bachelor', degree: '工学学士',
        expected_degree: null, completed: true, study_mode: 'full_time',
        start_month: '2020-09', end_month: '2024-06', is_current: false, is_expected_end: false,
      }],
    },
  });
  assert.equal(created.isError, undefined);
  const profile = created.structuredContent.profile;
  assert.equal(profile.revision, 1);
  assert.equal((await call('resume_profile_list')).structuredContent.profiles.length, 1);
  const basic = await call('resume_profile_read', { profile_id: profile.id, section: 'basic' });
  assert.equal(basic.structuredContent.data.full_name, '测试同学');
  const stale = await call('resume_profile_save', {
    profile_id: profile.id,
    expected_revision: 0,
    changes: { basic: { city: '上海' } },
  });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error.code, 'profile_changed');

  socket = await new Promise((resolveSocket, rejectSocket) => {
    const value = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `chrome-extension://${extensionId}` });
    value.once('open', () => resolveSocket(value));
    value.once('error', rejectSocket);
  });
  socket.send(JSON.stringify({ type: 'hello', extensionId, version: '0.7.0', epoch: 'test-epoch', protocolVersion: '2.0' }));
  const forwarded = [];
  let cancelled = false;
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.type === 'cancel') { cancelled = true; return; }
    if (!message.id) return;
    forwarded.push(message);
    if (message.method === 'wait') return;
    socket.send(JSON.stringify({ id: message.id, ok: true, result: { received: message.method, params: message.params } }));
  });
  await new Promise(resolveDelay => setTimeout(resolveDelay, 20));

  const observed = await call('resume_observe', { tab_id: 12, mode: 'overview' });
  assert.equal(observed.structuredContent.received, 'observe');
  const acted = await call('resume_act', {
    session_id: 'session',
    snapshot_id: 'snapshot',
    operation_id: 'write-name',
    action: {
      kind: 'set_value',
      ref: 'e1',
      expected_value_token: 'token',
      value: { source: { profile_id: profile.id, profile_revision: 1, source_ref: 'basic/full_name' } },
    },
  });
  assert.equal(acted.structuredContent.params.action.value.literal, '测试同学');
  assert.equal('source' in acted.structuredContent.params.action.value, false);

  const invalid = await call('resume_act', {
    session_id: 'session', snapshot_id: 'snapshot', operation_id: 'bad',
    action: { kind: 'press_key', ref: 'e1', key: 'Enter' },
  });
  assert.equal(invalid.isError, true);
  assert.equal(forwarded.filter(item => item.method === 'act').length, 1);

  const controller = new AbortController();
  const waiting = client.callTool({
    name: 'resume_wait',
    arguments: { session_id: 'session', snapshot_id: 'snapshot', condition: { kind: 'visible', ref: 'e1' } },
  }, undefined, { signal: controller.signal }).catch(() => null);
  while (!forwarded.some(item => item.method === 'wait')) await new Promise(resolveDelay => setTimeout(resolveDelay, 10));
  controller.abort();
  await waiting;
  for (let attempt = 0; attempt < 30 && !cancelled; attempt++) await new Promise(resolveDelay => setTimeout(resolveDelay, 10));
  assert.equal(cancelled, true);
} finally {
  socket?.close();
  await client.close();
  await rm(dataDir, { recursive: true, force: true });
}
console.log('MCP local storage, source resolution, strict browser wire and cancellation: OK');
