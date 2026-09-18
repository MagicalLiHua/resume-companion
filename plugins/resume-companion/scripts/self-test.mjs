import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

const root = resolve(import.meta.dirname, '..');
const serverEntry = process.env.RESUME_COMPANION_SERVER_ENTRY ?? './server.bundle.mjs';
const port = 44_000 + (process.pid % 1_000);
const extensionId = 'feifaflnkjdihpbbhnihidjjkeapamnh';
const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'));
env.RESUME_COMPANION_BRIDGE_PORT = String(port);
env.RESUME_COMPANION_EXTENSION_ID = extensionId;
env.RESUME_COMPANION_TOOLSET = 'all';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  cwd: root,
  env,
  stderr: 'pipe',
});
const client = new Client({ name: 'resume-companion-self-test', version: '0.2.0' });

async function connectFakeExtension() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return await new Promise((resolveConnection, rejectConnection) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `chrome-extension://${extensionId}` });
        socket.once('open', () => resolveConnection(socket));
        socket.once('error', rejectConnection);
      });
    } catch (error) {
      lastError = error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
    }
  }
  throw new Error(`MCP bridge did not start: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

await client.connect(transport);
const socket = await connectFakeExtension();
socket.send(JSON.stringify({ type: 'hello', extensionId, version: '0.5.0' }));

const calls = [];
socket.on('message', raw => {
  const request = JSON.parse(raw.toString());
  if (!request.id) return;
  calls.push(request);
  const responses = {
    activate_tab: { tabId: 11, status: 'visible', pageState: { visibility: 'visible', focused: true } },
    inspect: { controls: [{ tag: 'input', role: 'combobox', classes: 'ant-select-selection-search-input' }], truncated: false },
    open_section: { opened: true, label: '添加教育信息' },
    options: { kind: 'select', status: 'ready', searchSupported: true, levels: [['汉族','白族']], totalRendered: [2], truncated: false },
    status: { connected: true, extensionVersion: '0.5.0', activeTab: { title: 'Test form', url: 'https://jobs.example/apply' }, versions: [{ id: 'v1', name: '测试简历' }] },
    tabs: { total: 2, tabs: [{ tabId: 11, title: 'Application A', url: 'https://jobs.example/a' }, { tabId: 12, title: 'Application B', url: 'https://jobs.example/b' }] },
    scan: { sessionId: 'session-1', summary: { total: 2, suggested: 1, unresolved: 1, blocked: 0 }, fields: [{ fieldId: 'name', label: '姓名', suggestion: { value: '测试同学' } }] },
    scan_batch: { summary: { requested: 2, scanned: 2, failed: 0 }, results: [{ ok: true, sessionId: 'session-1', tab: { tabId: 11 } }, { ok: true, sessionId: 'session-2', tab: { tabId: 12 } }] },
    fill: { results: [{ fieldId: 'name', status: 'filled', message: '已填写并回读确认' }] },
    fill_batch: { summary: { requested: 2, completed: 2, failed: 0 }, results: [{ ok: true, sessionId: 'session-1' }, { ok: true, sessionId: 'session-2' }] },
    verify: { results: [{ fieldId: 'name', status: 'filled', message: '网页仍保留本轮填写值' }] },
    verify_batch: { summary: { requested: 2, completed: 2, failed: 0 }, results: [{ ok: true, sessionId: 'session-1' }, { ok: true, sessionId: 'session-2' }] },
    undo: { results: [{ fieldId: 'name', status: 'undone', message: '已恢复填写前的值' }] },
    undo_batch: { summary: { requested: 2, completed: 2, failed: 0 }, results: [{ ok: true, sessionId: 'session-1' }, { ok: true, sessionId: 'session-2' }] },
  };
  socket.send(JSON.stringify({ id: request.id, ok: true, result: responses[request.method] }));
});

await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
const tools = await client.listTools();
assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [
  'resume_fill_batch', 'resume_fill_plan', 'resume_list_tabs', 'resume_scan_current_form', 'resume_scan_tabs',
  'resume_status', 'resume_undo_batch', 'resume_undo_fill', 'resume_verify_batch', 'resume_verify_fill',
  'resume_read_profile','resume_observe','resume_act','resume_wait','resume_undo_operations',
  'resume_inspect_controls', 'resume_open_form_section', 'resume_field_options', 'resume_activate_tab',
].sort());

const status = await client.callTool({ name: 'resume_status', arguments: {} });
assert.equal(status.structuredContent.connected, true);
// A second browser with the same extension ID must not replace the active one.
const competing = await connectFakeExtension();
const rejected = await new Promise(resolve => competing.once('close', code => resolve(code)));
assert.equal(rejected, 1013);
assert.equal((await client.callTool({ name: 'resume_status', arguments: {} })).structuredContent.connected, true);
calls.pop(); // Keep the command-forwarding sequence below independent of this check.
const scan = await client.callTool({ name: 'resume_scan_current_form', arguments: { version_id: 'v1' } });
assert.equal(scan.structuredContent.sessionId, 'session-1');
const fill = await client.callTool({ name: 'resume_fill_plan', arguments: { session_id: 'session-1', fields: [{ field_id: 'name', use_suggestion: true }] } });
assert.equal(fill.structuredContent.results[0].status, 'filled');
const verify = await client.callTool({ name: 'resume_verify_fill', arguments: { session_id: 'session-1' } });
assert.equal(verify.structuredContent.results[0].status, 'filled');
const undo = await client.callTool({ name: 'resume_undo_fill', arguments: { session_id: 'session-1' } });
assert.equal(undo.structuredContent.results[0].status, 'undone');
const tabs = await client.callTool({ name: 'resume_list_tabs', arguments: {} });
assert.equal(tabs.structuredContent.total, 2);
const scans = await client.callTool({ name: 'resume_scan_tabs', arguments: { tab_ids: [11, 12], version_id: 'v1' } });
assert.equal(scans.structuredContent.summary.scanned, 2);
const fills = await client.callTool({ name: 'resume_fill_batch', arguments: { plans: [
  { session_id: 'session-1', fields: [{ field_id: 'name', use_suggestion: true }] },
  { session_id: 'session-2', fields: [{ field_id: 'name', value: '另一位测试同学' }] },
] } });
assert.equal(fills.structuredContent.summary.completed, 2);
const verifies = await client.callTool({ name: 'resume_verify_batch', arguments: { session_ids: ['session-1', 'session-2'] } });
assert.equal(verifies.structuredContent.summary.completed, 2);
const undoes = await client.callTool({ name: 'resume_undo_batch', arguments: { session_ids: ['session-1', 'session-2'] } });
assert.equal(undoes.structuredContent.summary.completed, 2);
assert.deepEqual(calls.map(call => call.method), ['status', 'scan', 'fill', 'verify', 'undo', 'tabs', 'scan_batch', 'fill_batch', 'verify_batch', 'undo_batch']);

assert.equal((await client.callTool({ name: 'resume_inspect_controls', arguments: { tab_id: 11 } })).structuredContent.controls.length, 1);
assert.equal((await client.callTool({ name: 'resume_activate_tab', arguments: { tab_id: 11 } })).structuredContent.status, 'visible');
assert.equal(calls.at(-1).params.tab_id, 11);
assert.equal((await client.callTool({ name: 'resume_open_form_section', arguments: { tab_id: 11, label: '添加教育信息' } })).structuredContent.opened, true);
assert.deepEqual((await client.callTool({ name: 'resume_field_options', arguments: { session_id: 'session-1', field_id: 'ethnicity' } })).structuredContent.levels, [['汉族','白族']]);
const queried = await client.callTool({ name: 'resume_field_options', arguments: { session_id: 'session-1', field_id: 'school', query: '示例' } });
assert.equal(queried.structuredContent.status, 'ready');
assert.equal(calls.at(-1).params.query, '示例');
await client.callTool({ name: 'resume_field_options', arguments: { session_id: 'session-1', field_id: 'school', path: ['国内', '江苏省'] } });
assert.deepEqual(calls.at(-1).params.path, ['国内', '江苏省']);
const callsBeforeInvalid = calls.length;
assert.equal((await client.callTool({ name: 'resume_field_options', arguments: { session_id: 'session-1', field_id: 'school', path: [] } })).isError, true);
assert.equal((await client.callTool({ name: 'resume_field_options', arguments: { session_id: 'session-1', field_id: 'school', query: 'x'.repeat(121) } })).isError, true);
const invalid = await client.callTool({ name: 'resume_open_form_section', arguments: { tab_id: 11, label: '提交申请' } });
assert.equal(invalid.isError, true);
assert.equal(calls.length, callsBeforeInvalid);

socket.close();
await client.close();
console.log('Resume Companion MCP bridge self-test: OK');
