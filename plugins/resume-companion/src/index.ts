#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createBrowserDriver } from './browser/driver-factory.js';
import { messageOf } from './browser/errors.js';
import type { BrowserDriver } from './browser/types.js';
import { ProfileSaveSchema, ProfileStore } from './profile-store.js';
import { createAutomationSchemas, type ActParams, type ResolvedActParams, type SourceValue } from './protocol.js';

type ToolData = Record<string, unknown>;
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: ToolData;
  isError?: boolean;
};

const store = new ProfileStore();
await store.initialize();
const driver = createBrowserDriver(store.dataDir);
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

function toolResult(data: unknown): ToolResult {
  const structuredContent = isRecord(data) ? data : { value: data };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent };
}

function errorResult(error: unknown, sideEffects: 'none' | 'possible' = 'none'): ToolResult {
  const message = messageOf(error) || '工具执行失败';
  const prefixed = /^([a-z_]+):/.exec(message)?.[1];
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  const code = prefixed ?? (name === 'ZodError' ? 'invalid_request' : 'internal_error');
  const status = code === 'stale' ? 'stale' : code === 'unknown' || code === 'timeout' ? 'unknown' : 'blocked';
  const data = { status, error: { code, message }, side_effects: sideEffects };
  return { isError: true, ...toolResult(data) };
}

async function runLocal(job: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return toolResult(await job());
  } catch (error) {
    return errorResult(error);
  }
}

async function runBrowser(method: 'listTabs' | 'activateTab' | 'observe' | 'act' | 'wait' | 'undo', params: unknown, signal?: AbortSignal): Promise<ToolResult> {
  try {
    const fn = driver[method] as (input: never, signal?: AbortSignal) => Promise<unknown>;
    return toolResult(await fn.call(driver, params as never, signal));
  } catch (error) {
    const possible = (method === 'act' || method === 'undo') && /disconnected|timeout|cancelled|unknown/i.test(messageOf(error));
    return errorResult(error, possible ? 'possible' : 'none');
  }
}

async function resolveActionSources(params: ActParams): Promise<ResolvedActParams> {
  const resolved = structuredClone(params);
  const resolveValue = async (value: SourceValue) => {
    if ('literal' in value) return value;
    return { literal: await store.resolveSource(value.source) };
  };
  const writes = resolved.action.kind === 'set_values' ? resolved.action.items : [resolved.action];
  for (const write of writes) if (write.kind === 'set_value') write.value = await resolveValue(write.value);
  return wireSchemas.act.parse(resolved) as ResolvedActParams;
}

const server = new McpServer({ name: 'resume-companion', version: '0.7.0' });

server.registerTool('resume_status', {
  title: '检查简历随行状态',
  description: '返回 MCP 本地资料库、已保存简历和浏览器驱动状态。浏览器尚未连接时资料管理仍可正常使用；网页工具首次调用会按需连接 Chrome。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => runLocal(async () => {
  const [storage, profiles, browser] = await Promise.all([store.status(), store.list(), driver.status()]);
  return { storage, profiles, browser };
}));

server.registerTool('resume_profile_list', {
  title: '列出本地简历资料',
  description: '列出 MCP 本地资料库中的简历 ID、名称、修订号和更新时间，不返回简历正文。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => runLocal(async () => ({ profiles: await store.list() })));

server.registerTool('resume_profile_read', {
  title: '读取本地简历资料',
  description: '读取指定资料的目录、某个栏目、记录或来源引用。省略 section 时只返回目录；未知值保持 null。',
  inputSchema: profileReadSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runLocal(() => store.readView(profileReadSchema.parse(input))));

server.registerTool('resume_profile_save', {
  title: '创建或更新本地简历资料',
  description: '创建时省略 profile_id 并提供名称；更新时提供 profile_id 和最近读取的 expected_revision。只保存用户明确提供的事实，未知值使用 null。',
  inputSchema: ProfileSaveSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async input => runLocal(() => store.save(ProfileSaveSchema.parse(input))));

server.registerTool('resume_list_tabs', {
  title: '列出可处理的 Chrome 标签页',
  description: '按需连接已配置的 Chrome 上下文，列出普通 HTTP/HTTPS 标签页，只返回标题、网址和标签页 ID，不读取页面正文。',
  inputSchema: {
    current_window_only: z.boolean().optional().describe('DevTools 驱动枚举已授权浏览器上下文；当前版本不区分 Chrome 窗口'),
    url_contains: z.string().trim().max(500).optional().describe('可选的标题或网址过滤文本'),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (input, extra) => runBrowser('listTabs', input, extra?.signal));

server.registerTool('resume_activate_tab', {
  title: '激活招聘标签页',
  description: '把指定普通网页标签页切到前台并回读可见状态；不会刷新、导航或填写。',
  inputSchema: { tab_id: z.number().int().positive() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (input, extra) => runBrowser('activateTab', input, extra?.signal));

const browserTools = [
  ['observe', 'observe', '观察招聘页面', '首次提供 tab_id，后续使用 session_id。返回基于无障碍树的结构化元素、候选、变化或操作核对；不接受选择器和脚本。', true],
  ['act', 'act', '执行一个表单基础动作', '使用观察返回的引用、快照和值 token 执行输入、选择、点击或有限批量写入。最终提交、声明、验证、删除和上传由用户处理。', false],
  ['wait', 'wait', '等待页面的有限条件', '等待引用可见、消失、展开、候选就绪、值、文本或结构变化；超时返回 unknown。', true],
  ['undo_operations', 'undo', '条件撤销字段操作', '只在网页当前值仍等于工具写入值时逆序恢复字段；不能回滚网站已经保存的数据。', false],
] as const;

for (const [toolMethod, driverMethod, title, description, readOnly] of browserTools) {
  server.registerTool(`resume_${toolMethod}`, {
    title,
    description,
    inputSchema: clientSchemas[toolMethod],
    annotations: { readOnlyHint: readOnly, destructiveHint: toolMethod === 'undo_operations', idempotentHint: toolMethod !== 'act' },
  }, async (input: unknown, extra: { signal?: AbortSignal }) => {
    try {
      const parsed = clientSchemas[toolMethod].parse(input);
      const params = toolMethod === 'act' ? await resolveActionSources(parsed as ActParams) : parsed;
      return runBrowser(driverMethod, params, extra?.signal);
    } catch (error) {
      return errorResult(error);
    }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await driver.close();
  await server.close();
}

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });

function isRecord(value: unknown): value is ToolData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void (driver satisfies BrowserDriver);
