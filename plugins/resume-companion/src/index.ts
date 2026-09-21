#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ProfileReadSchema, ProfileSaveSchema, ProfileStore } from './profile-store.js';
import { RUNTIME_PLUGIN_VERSION } from './version.js';
import {ProfilePreparation,PreparationReadSchema,PreparationApplySchema} from './profile-requirements.js';
import {requirementsCatalog} from './browser/planning/requirements.js';

type ToolData = Record<string, unknown>;
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: ToolData;
  isError?: boolean;
};

const store = new ProfileStore();
await store.initialize();
const preparation=new ProfilePreparation(store,requirementsCatalog());

function toolResult(data: unknown): ToolResult {
  const structuredContent = isRecord(data) ? data : { value: data };
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const prefixed = /^([a-z_]+):/.exec(message)?.[1];
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  const code = prefixed ?? (name === 'ZodError' ? 'invalid_request' : 'internal_error');
  const status = code === 'profile_changed' ? 'stale' : 'blocked';
  const data = { status, error: { code, message }, side_effects: 'none' };
  return { isError: true, ...toolResult(data) };
}

async function runLocal(job: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return toolResult(await job());
  } catch (error) {
    return errorResult(error);
  }
}

const server = new McpServer({ name: 'resume-companion', version: RUNTIME_PLUGIN_VERSION });

server.registerTool('resume_status', {
  title: '检查 ApplyMCP 资料库状态',
  description: '返回本地资料库目录、格式版本和资料数量。浏览器由独立的 ApplyMCP Browser 提供，因此本工具不会启动或检查 Chrome。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => runLocal(async () => ({
  storage: await store.status(),
  service: { name: 'resume-companion', version: RUNTIME_PLUGIN_VERSION, role: 'profile_library' },
})));

server.registerTool('resume_profile_list', {
  title: '列出本地简历资料',
  description: '列出本地资料库中的简历 ID、名称、修订号和更新时间，不返回简历正文。',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async () => runLocal(async () => ({ profiles: await store.list() })));

server.registerTool('resume_profile_read', {
  title: '读取本地简历资料',
  description: '读取指定资料的目录、栏目、记录或来源引用。首次读取省略 expected_revision；后续读取携带首次返回的 profile_revision，资料已变化时会停止并要求重新读取。未知值保持 null。',
  inputSchema: ProfileReadSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async input => runLocal(() => store.readView(ProfileReadSchema.parse(input))));

server.registerTool('resume_profile_save', {
  title: '创建或更新本地简历资料',
  description: '创建时省略 profile_id 并提供名称；更新时提供 profile_id 和最近读取的 expected_revision。只保存用户明确提供的事实，未知值使用 null。',
  inputSchema: ProfileSaveSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async input => runLocal(() => store.save(ProfileSaveSchema.parse(input))));

server.registerTool('resume_prepare',{
  title:'生成一次性简历资料补充表',
  description:'从固定资料 revision 和已验证企业需求并集生成缺项 Markdown，不返回已有答案。默认 all_supported；仅运行前差异检查使用 selected_modules。没有的经历不展开，身份证号等证件号码标记为本地录入，手机号/邮箱已有则不再问。分页未结束时需继续读取并合并清单。',
  inputSchema:PreparationReadSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true},
},async input=>runLocal(()=>preparation.read(input)));

server.registerTool('resume_prepare_apply',{
  title:'合并用户明确补充的资料',
  description:'按 question ID、资料 revision、目录版本和 questionnaire_id 合并用户答案，保留其他记录，不覆盖已有事实。none 仅用于无记录栏目；not_applicable/withheld/deferred 不会变成网站上的否。证件号码不能通过此工具录入。有新经历时先通过资料保存工具建立记录，再重新生成补充表。',
  inputSchema:PreparationApplySchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false},
},async input=>runLocal(()=>preparation.apply(input)));

const transport = new StdioServerTransport();
await server.connect(transport);

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await server.close();
}

process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });

function isRecord(value: unknown): value is ToolData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
