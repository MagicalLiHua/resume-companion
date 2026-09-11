#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const port = Number.parseInt(process.env.RESUME_COMPANION_BRIDGE_PORT ?? '43117', 10);
const extensionId = process.env.RESUME_COMPANION_EXTENSION_ID ?? 'feifaflnkjdihpbbhnihidjjkeapamnh';
const expectedOrigin = `chrome-extension://${extensionId}`;
const timeoutMs = 15_000;

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
    done(info.origin === expectedOrigin, info.origin === expectedOrigin ? 101 : 403, 'Forbidden');
  },
});

bridge.on('connection', socket => {
  if (extension && extension.readyState === extension.OPEN) extension.close(1012, 'A newer extension connection replaced this one');
  extension = socket;
  extensionInfo = null;

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message?.type === 'hello' && message.extensionId === extensionId) {
      extensionInfo = { extensionId, version: String(message.version ?? 'unknown') };
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
      failPending('简历随行 Chrome 扩展已断开');
    }
  });
});

bridge.on('error', error => {
  console.error(`[resume-companion] bridge error: ${error.message}`);
});

function callExtension(method, params = {}) {
  if (!extension || extension.readyState !== extension.OPEN || !extensionInfo) {
    throw new Error('简历随行 Chrome 扩展未连接。请确认扩展已加载并重新加载一次。');
  }
  const id = `mcp-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Chrome 扩展响应超时，请保持目标标签页打开后重试'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    extension.send(JSON.stringify({ id, method, params }));
  });
}

function toolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

async function runTool(method, params) {
  try {
    return toolResult(await callExtension(method, params));
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : '工具执行失败' }],
    };
  }
}

const versionIdSchema = z.string().max(100).optional().describe('可选的简历版本 ID；省略时使用当前版本');
const sessionIdSchema = z.string().min(1).max(100);
const fieldSchema = z.object({
  field_id: z.string().min(1).max(100),
  use_suggestion: z.boolean().optional(),
  source_ref: z.string().max(240).optional(),
  value: z.union([z.string().max(10_000), z.boolean()]).optional(),
  overwrite: z.boolean().optional(),
}).refine(item => Number(item.use_suggestion === true) + Number(item.source_ref !== undefined) + Number(item.value !== undefined) === 1, {
  message: '每个字段必须且只能使用本地建议、候选资料来源或明确值之一',
});
const fillPlanSchema = z.object({
  session_id: sessionIdSchema,
  fields: z.array(fieldSchema).min(1).max(300),
});

const server = new McpServer({ name: 'resume-companion', version: '0.2.0' });

server.registerTool('resume_status', {
  title: '检查简历随行状态',
  description: '检查本地 Chrome 扩展是否连接、当前标签页是否可扫描，以及有哪些简历版本。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => {
  if (!extension || extension.readyState !== extension.OPEN || !extensionInfo) {
    return toolResult({ connected: false, bridgePort: port, message: 'Chrome 扩展尚未连接' });
  }
  return runTool('status', {});
});

server.registerTool('resume_scan_current_form', {
  title: '扫描当前网申表单',
  description: '扫描 Chrome 当前标签页并返回结构化字段、本地规则建议、受限项和未解决项。只读取，不填写。',
  inputSchema: {
    version_id: versionIdSchema,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
}, async input => runTool('scan', input));

server.registerTool('resume_fill_plan', {
  title: '填写已确认字段',
  description: '一次性填写用户已经确认的字段计划。每项使用扫描时的本地建议、指定候选资料来源，或用户明确提供的值。不会提交或进入下一步。',
  inputSchema: {
    session_id: sessionIdSchema,
    fields: z.array(fieldSchema).min(1).max(300),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async input => runTool('fill', input));

server.registerTool('resume_verify_fill', {
  title: '验证本轮填写',
  description: '回读当前页面，确认本轮写入值是否仍被网页保留。',
  inputSchema: { session_id: sessionIdSchema },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runTool('verify', input));

server.registerTool('resume_undo_fill', {
  title: '撤销本轮填写',
  description: '尝试恢复当前会话中本轮填写前的页面值；无法撤销网站已经在服务器端自动保存的内容。',
  inputSchema: { session_id: sessionIdSchema },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
}, async input => runTool('undo', input));

server.registerTool('resume_list_tabs', {
  title: '列出可处理的 Chrome 标签页',
  description: '列出当前 Chrome 窗口中的普通 HTTP/HTTPS 标签页，只返回标题、网址和标签页 ID，不扫描网页内容。可选择跨窗口或按标题/网址过滤。',
  inputSchema: {
    current_window_only: z.boolean().optional().describe('默认 true；设为 false 时枚举所有 Chrome 窗口'),
    url_contains: z.string().trim().max(500).optional().describe('可选的标题或网址过滤文本'),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runTool('tabs', input));

server.registerTool('resume_scan_tabs', {
  title: '批量扫描选中的网申标签页',
  description: '扫描用户选中的最多 20 个 Chrome 标签页，返回每页的结构化字段、建议、受限项和未解决项。只读取，不填写；应先用 resume_list_tabs 取得标签页 ID。',
  inputSchema: {
    tab_ids: z.array(z.number().int().positive()).min(1).max(20),
    version_id: versionIdSchema,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
}, async input => runTool('scan_batch', input));

server.registerTool('resume_fill_batch', {
  title: '批量执行已确认的填写计划',
  description: '顺序填写最多 20 个已经扫描且由用户明确确认的标签页计划。不会激活标签页、提交申请、进入下一步或上传文件；每页独立返回结果。',
  inputSchema: {
    plans: z.array(fillPlanSchema).min(1).max(20),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async input => runTool('fill_batch', input));

server.registerTool('resume_verify_batch', {
  title: '批量回读填写结果',
  description: '回读最多 20 个填写会话，确认每个网页是否仍保留本轮写入值。',
  inputSchema: { session_ids: z.array(sessionIdSchema).min(1).max(20) },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runTool('verify_batch', input));

server.registerTool('resume_undo_batch', {
  title: '批量撤销填写结果',
  description: '逐页尝试恢复最多 20 个会话填写前的值；用户随后手改的内容会被保留，网站已自动保存到服务器的内容可能无法撤回。',
  inputSchema: { session_ids: z.array(sessionIdSchema).min(1).max(20) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
}, async input => runTool('undo_batch', input));

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown() {
  failPending('MCP 服务正在关闭');
  for (const socket of bridge.clients) socket.close(1001, 'Server shutdown');
  await new Promise(resolve => bridge.close(resolve));
  await server.close();
}

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
