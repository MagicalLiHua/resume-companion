#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { ProfileSaveSchema, ProfileStore } from './profile-store.mjs';
import { createAutomationSchemas, PROTOCOL_VERSION } from './protocol.ts';

const port = Number.parseInt(process.env.RESUME_COMPANION_BRIDGE_PORT ?? '43117', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('RESUME_COMPANION_BRIDGE_PORT 不是有效端口');
const extensionId = process.env.RESUME_COMPANION_EXTENSION_ID ?? 'feifaflnkjdihpbbhnihidjjkeapamnh';
const expectedOrigin = `chrome-extension://${extensionId}`;
const timeoutMs = 60_000;
const store = new ProfileStore();
await store.initialize();

let extension = null;
let extensionInfo = null;
let sequence = 0;
const pending = new Map();

function failPending(message) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error(message));
  }
  pending.clear();
}

const bridge = new WebSocketServer({
  host: '127.0.0.1',
  port,
  verifyClient(info, done) {
    const accepted = info.origin === expectedOrigin;
    done(accepted, accepted ? 101 : 403, 'Forbidden');
  },
});

bridge.on('connection', socket => {
  if (extension && extension.readyState === extension.OPEN) {
    socket.close(1013, 'Another browser is already connected');
    return;
  }
  extension = socket;
  extensionInfo = null;
  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message?.type === 'hello' && message.extensionId === extensionId) {
      extensionInfo = {
        extensionId,
        version: String(message.version ?? 'unknown'),
        epoch: message.epoch ?? null,
        protocolVersion: message.protocolVersion ?? null,
      };
      return;
    }
    if (message?.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }
    if (typeof message?.id !== 'string') return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.result);
    else request.reject(new Error(typeof message.error === 'string' ? message.error : 'Chrome 扩展执行失败'));
  });
  socket.on('close', () => {
    if (extension === socket) {
      extension = null;
      extensionInfo = null;
      failPending('bridge_error: 简历随行 Chrome 扩展已断开');
    }
  });
});

bridge.on('error', error => {
  console.error(`[resume-companion] bridge error: ${error.message}`);
});

function callExtension(method, params = {}, signal) {
  if (!extension || extension.readyState !== extension.OPEN || !extensionInfo) {
    throw new Error('bridge_error: Chrome 扩展未连接；资料工具仍可使用，网页工具需要先开启浏览器桥接');
  }
  if (method !== 'status' && extensionInfo.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('unsupported_capability: 浏览器扩展与 MCP 协议版本不一致，请重新加载配套扩展');
  }
  const id = `mcp-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      if (extension?.readyState === extension.OPEN) extension.send(JSON.stringify({ type: 'cancel', id }));
      reject(new Error('bridge_error: Chrome 扩展响应超时，请保持目标标签页打开后重试'));
    }, timeoutMs);
    const abort = () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      clearTimeout(timer);
      if (extension?.readyState === extension.OPEN) extension.send(JSON.stringify({ type: 'cancel', id }));
      reject(new Error('cancelled: 请求已取消；请回读已派发动作的结果'));
    };
    const cleanup = fn => value => {
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    pending.set(id, { resolve: cleanup(resolve), reject: cleanup(reject), timer });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    extension.send(JSON.stringify({ id, method, params }));
  });
}

function toolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorResult(error, sideEffects = 'none') {
  const message = error instanceof Error ? error.message : '工具执行失败';
  const prefixed = /^([a-z_]+):/.exec(message)?.[1];
  const code = prefixed ?? (error?.name === 'ZodError' ? 'invalid_request' : 'internal_error');
  const data = {
    status: code === 'stale' ? 'stale' : 'blocked',
    error: { code, message },
    side_effects: sideEffects,
  };
  return { isError: true, ...toolResult(data) };
}

async function runLocal(job) {
  try { return toolResult(await job()); }
  catch (error) { return errorResult(error); }
}

async function runBrowser(method, params, extra) {
  try { return toolResult(await callExtension(method, params, extra?.signal)); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    const possible = ['act', 'undo_operations'].includes(method) && message.startsWith('bridge_error:');
    return errorResult(error, possible ? 'possible' : 'none');
  }
}

const clientSchemas = createAutomationSchemas(z);
const wireSchemas = createAutomationSchemas(z, { allowSources: false });
const profileReadSchema = z.object({
  profile_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  section: z.enum(['basic', 'education', 'experience', 'projects', 'skills', 'certificates', 'custom_answers', 'supplemental_fields']).optional(),
  record_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  source_refs: z.array(z.string().min(1).max(240)).min(1).max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  include_source_markdown: z.boolean().optional(),
}).strict();

async function resolveActionSources(params) {
  const resolved = structuredClone(params);
  const resolveValue = async value => {
    if ('literal' in value) return value;
    return { literal: await store.resolveSource(value.source) };
  };
  const writes = resolved.action.kind === 'set_values' ? resolved.action.items : [resolved.action];
  for (const write of writes) if (write.kind === 'set_value') write.value = await resolveValue(write.value);
  return wireSchemas.act.parse(resolved);
}

const server = new McpServer({ name: 'resume-companion', version: '0.4.1' });

server.registerTool('resume_status', {
  title: '检查简历随行状态',
  description: '返回 MCP 本地资料库位置、简历目录以及 Chrome 执行桥状态。Chrome 未连接时资料管理仍可正常使用。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (_input, extra) => runLocal(async () => {
  const [storage, profiles] = await Promise.all([store.status(), store.list()]);
  let browser = {
    connected: false,
    compatible: false,
    bridgePort: port,
    message: 'Chrome 扩展尚未连接；仅网页工具不可用',
  };
  if (extension && extension.readyState === extension.OPEN && extensionInfo) {
    try {
      const status = await callExtension('status', {}, extra?.signal);
      browser = {
        ...status,
        connected: true,
        compatible: extensionInfo.protocolVersion === PROTOCOL_VERSION,
        protocolVersion: extensionInfo.protocolVersion,
        expectedProtocolVersion: PROTOCOL_VERSION,
        bridgeEpoch: extensionInfo.epoch,
      };
    } catch (error) {
      browser = { ...browser, connected: true, message: error instanceof Error ? error.message : '浏览器状态读取失败' };
    }
  }
  return { storage, profiles, browser };
}));

server.registerTool('resume_profile_list', {
  title: '列出本地简历资料',
  description: '列出 MCP 本地资料库中的简历 ID、名称、修订号和更新时间，不返回简历正文。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => runLocal(async () => ({ profiles: await store.list() })));

server.registerTool('resume_profile_read', {
  title: '读取本地简历资料',
  description: '读取指定资料的目录、某个栏目、记录或来源引用。省略 section 时只返回目录；未知值保持 null。include_source_markdown 只在确有需要时使用。',
  inputSchema: profileReadSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runLocal(() => store.readView(profileReadSchema.parse(input))));

server.registerTool('resume_profile_save', {
  title: '创建或更新本地简历资料',
  description: '创建时省略 profile_id 并提供名称；更新时提供 profile_id 和最近读取的 expected_revision。changes 只替换明确提供的顶层栏目，basic 只合并提供的字段。数组记录的 id 可省略，由资料库生成。未知事实使用 null，不得补造。',
  inputSchema: ProfileSaveSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async input => runLocal(() => store.save(ProfileSaveSchema.parse(input))));

server.registerTool('resume_list_tabs', {
  title: '列出可处理的 Chrome 标签页',
  description: '列出普通 HTTP/HTTPS 标签页，只返回标题、网址和标签页 ID，不读取页面正文。',
  inputSchema: {
    current_window_only: z.boolean().optional().describe('默认 true；false 时枚举所有 Chrome 窗口'),
    url_contains: z.string().trim().max(500).optional().describe('可选的标题或网址过滤文本'),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (input, extra) => runBrowser('tabs', input, extra));

server.registerTool('resume_activate_tab', {
  title: '激活招聘标签页',
  description: '把指定普通网页标签页切到前台并回读可见状态；不会刷新、导航或填写。',
  inputSchema: { tab_id: z.number().int().positive() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (input, extra) => runBrowser('activate_tab', input, extra));

for (const [method, title, description, readOnly] of [
  ['observe', '观察招聘页面', '首次提供 tab_id，后续使用 session_id。读取结构化页面元素、局部候选、变化或操作核对；不接受选择器和脚本。', true],
  ['act', '执行一个表单基础动作', '使用观察返回的引用、快照和值 token 执行输入、选择、点击、滚动或有限批量写入。值可使用本地资料来源，MCP 会在发送浏览器前解析为字面值。最终提交、声明、验证、删除和上传由用户处理。', false],
  ['wait', '等待页面的有限条件', '等待引用可见、消失、展开、候选就绪、值、文本或结构变化；超时返回 unknown。', true],
  ['undo_operations', '条件撤销字段操作', '只在网页当前值仍等于工具写入值时逆序恢复字段；不能回滚网站已经保存的数据。', false],
]) {
  server.registerTool(`resume_${method}`, {
    title,
    description,
    inputSchema: clientSchemas[method],
    annotations: { readOnlyHint: readOnly, destructiveHint: method === 'undo_operations', idempotentHint: method !== 'act' },
  }, async (input, extra) => {
    try {
      const parsed = clientSchemas[method].parse(input);
      const params = method === 'act' ? await resolveActionSources(parsed) : parsed;
      return runBrowser(method, params, extra);
    } catch (error) { return errorResult(error); }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown() {
  failPending('bridge_error: MCP 服务正在关闭');
  for (const socket of bridge.clients) socket.close(1001, 'Server shutdown');
  await new Promise(resolve => bridge.close(resolve));
  await server.close();
}

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
