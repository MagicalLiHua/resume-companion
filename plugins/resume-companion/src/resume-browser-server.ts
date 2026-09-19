#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { BrowserDebugBridge } from './browser/debug-bridge.js';
import { redactBrowserText } from './browser/privacy.js';
import { FormEngine, type FieldRequest, type ObserveRequest } from './browser/form-engine.js';
import { installStaleUidRecovery } from './browser/stale-uid-recovery.js';
import { ChromeProfileLock, profileHash, resolveChromeProfileDir } from './chrome-profile.js';

type AnyRecord = Record<string, any>;

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeEntry = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
  resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
].find(existsSync) ?? resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
const runtimeSource = resolve(dirname(runtimeEntry), '..');

function runtimeModule(path: string): string {
  return pathToFileURL(resolve(runtimeSource, path)).href;
}

const [browserModule, contextModule, pageModule, toolHandlerModule, toolsModule, thirdPartyModule] = await Promise.all([
  import(runtimeModule('browser.js')) as Promise<AnyRecord>,
  import(runtimeModule('McpContext.js')) as Promise<AnyRecord>,
  import(runtimeModule('McpPage.js')) as Promise<AnyRecord>,
  import(runtimeModule('ToolHandler.js')) as Promise<AnyRecord>,
  import(runtimeModule('tools/tools.js')) as Promise<AnyRecord>,
  import(runtimeModule('third_party/index.js')) as Promise<AnyRecord>,
]);

installStaleUidRecovery(pageModule.McpPage);

const profileDir = resolveChromeProfileDir();
const lock = new ChromeProfileLock(profileDir);
const upstreamArgs: AnyRecord = {
  channel: 'stable',
  userDataDir: profileDir,
  headless: process.env.RESUME_COMPANION_CHROME_HEADLESS === '1',
  usageStatistics: false,
  performanceCrux: false,
  redactNetworkHeaders: true,
  pageIdRouting: true,
  javascriptEvaluation: true,
  sourceMaps: true,
  experimentalStructuredContent: false,
  experimentalDataFormat: 'default',
  experimentalDevtools: false,
  experimentalVision: false,
  experimentalIncludeAllPages: false,
  categoryInput: true,
  categoryNavigation: true,
  categoryNetwork: true,
  categoryDebugging: true,
  categoryEmulation: false,
  categoryPerformance: false,
  categoryMemory: false,
  categoryExtensions: false,
  categoryExperimentalThirdParty: false,
  categoryExperimentalWebmcp: false,
  categoryPwa: false,
  memoryDebugging: false,
  screenshotFormat: 'webp',
  screenshotQuality: 80,
  screenshotMaxWidth: 1440,
  screenshotMaxHeight: 1200,
  chromeArg: [],
  ignoreDefaultChromeArg: [],
  slim: false,
  viaCli: false,
};

const operationFields = {
  page_id: z.number().int().positive().describe('目标页面 ID。使用 list_pages 获取。'),
  expected_generation: z.number().int().positive().optional().describe('可选的观察 generation；不一致时停止。'),
  operation_id: z.string().min(4).max(120).optional().describe('可选幂等 ID；同一进程内重复调用返回第一次结果。'),
  test_mode: z.boolean().optional().describe('记录本次测试操作清单，不写入长期资料库。'),
};

const snapshotBearingTools = new Set(['take_snapshot', 'wait_for', 'fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text']);
const ledgerAwareLowLevelTools = new Set(['fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text']);

function sanitizeBrowserResult(value: unknown): unknown {
  if (typeof value === 'string') return redactBrowserText(value);
  if (Array.isArray(value)) return value.map(sanitizeBrowserResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'data' ? item : sanitizeBrowserResult(item)]));
}

function annotateTimeout(result: AnyRecord, toolName: string): AnyRecord {
  const text = Array.isArray(result?.content) ? result.content.filter((item: AnyRecord) => item.type === 'text').map((item: AnyRecord) => item.text).join('\n') : '';
  if (!result?.isError || !/timed out after waiting \d+ms|timeout/i.test(text)) return result;
  const phase = ['fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text'].includes(toolName)
    ? 'element_locator_or_event_confirmation'
    : toolName === 'take_screenshot' ? 'screenshot_capture' : 'upstream_page_operation';
  const note = `Resume Companion: timeout_phase=${phase}; recovery=take_snapshot_or_form_observe_then_retry_once; if the page remains continuously updating, reload the page once.`;
  return {
    ...result,
    content: [...(result.content ?? []), { type: 'text', text: note }],
  };
}

export class ResumeBrowserServer {
  private readonly server: AnyRecord;
  private readonly mutex: AnyRecord;
  private browser: AnyRecord | undefined;
  private context: AnyRecord | undefined;
  private engine: FormEngine | undefined;
  private debugBridge: BrowserDebugBridge | undefined;
  private lockHeld = false;
  private closing = false;

  private constructor() {
    this.server = new thirdPartyModule.McpServer({
      name: 'resume_browser',
      title: 'Resume Browser MCP',
      version: '0.15.1',
    }, { capabilities: { logging: {} } });
    this.mutex = new thirdPartyModule.Mutex();
  }

  static async create(): Promise<ResumeBrowserServer> {
    const instance = new ResumeBrowserServer();
    instance.registerUpstreamTools();
    instance.registerFormTools();
    return instance;
  }

  async connect(): Promise<void> {
    const transport = new thirdPartyModule.StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Resume Browser MCP 0.15.1 ready; Chrome profile ${profileHash(profileDir)} is acquired on first browser call.`);
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.engine?.clear();
    await this.debugBridge?.close();
    this.debugBridge = undefined;
    this.context?.dispose?.();
    this.context = undefined;
    this.engine = undefined;
    try {
      await browserModule.closeBrowser();
    } finally {
      if (this.lockHeld) await lock.release();
      this.lockHeld = false;
      await this.server.close().catch(() => undefined);
    }
  }

  private registerUpstreamTools(): void {
    const blocked = new Set(['upload_file', 'lighthouse_audit']);
    for (const tool of toolsModule.createTools(upstreamArgs) as AnyRecord[]) {
      if (blocked.has(tool.name)) continue;
      const handler = new toolHandlerModule.ToolHandler(tool, upstreamArgs, () => this.getContext(), this.mutex);
      if (!handler.shouldRegister) continue;
      if (ledgerAwareLowLevelTools.has(tool.name)) {
        handler.inputSchema = {
          ...handler.inputSchema,
          operation_id: z.string().min(4).max(120).optional().describe('可选的测试操作关联 ID。'),
          test_mode: z.boolean().optional().describe('把这次低层回退记入短期测试清单；字段语义和清理状态仍标记为未验证。'),
        };
        handler.registeredInputSchema = z.object(handler.inputSchema).passthrough();
      }
      this.server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: handler.registeredInputSchema,
        annotations: tool.annotations,
      }, async (params: AnyRecord) => {
        let result = await handler.handle(params);
        result = annotateTimeout(result, tool.name);
        if (snapshotBearingTools.has(tool.name)) result = sanitizeBrowserResult(result) as AnyRecord;
        if (params.test_mode && typeof params.pageId === 'number') {
          this.engine?.recordLowLevelOperation(
            params.pageId,
            tool.name,
            params.operation_id,
            typeof params.uid === 'string' ? params.uid : Array.isArray(params.elements) ? `${params.elements.length} elements` : 'keyboard_or_pointer_target',
            result?.isError ? 'failed_or_partial' : 'completed_unverified',
          );
        }
        return result;
      });
    }
  }

  private registerFormTools(): void {
    this.server.registerTool('form_observe', {
      description: 'Observe a recruitment form with local semantic caching. Focused results expose local details and only a value-free sentinel for changes elsewhere; full mode is explicit.',
      inputSchema: {
        page_id: z.number().int().positive(),
        mode: z.enum(['overview', 'focus', 'delta', 'full']).default('overview'),
        target: z.string().max(200).optional(),
        scope: z.string().max(200).optional(),
        since_observation_id: z.string().max(120).optional(),
        max_bytes: z.number().int().min(2_000).max(80_000).optional(),
        include_values: z.enum(['state', 'masked', 'needed']).optional(),
        include_test_ledger: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    }, async (params: ObserveRequest) => await this.handleForm(params.page_id, engine => engine.observe(params)));

    this.server.registerTool('form_fill_fields', {
      description: 'Fill a dependency-safe batch of ordinary fields by semantic label or logical field reference, then verify each value locally.',
      inputSchema: {
        ...operationFields,
        fields: z.array(z.object({
          field: z.string().min(1).max(240),
          scope: z.string().max(240).optional(),
          value: z.union([z.string().max(20_000), z.boolean(), z.number()]),
          overwrite: z.boolean().optional(),
        })).min(1).max(80),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord) => await this.handleForm(params.page_id, engine => engine.fillFields({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      fields: params.fields as FieldRequest[],
    })));

    this.server.registerTool('form_select_option', {
      description: 'Select one radio, checkbox, native option or custom dropdown candidate and verify the resulting field state.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        value: z.string().min(1).max(500),
        scope: z.string().max(240).optional(),
        query: z.string().max(500).optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord) => await this.handleForm(params.page_id, engine => engine.selectOption({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value,
      scope: params.scope,
      query: params.query,
    })));

    this.server.registerTool('form_select_path', {
      description: 'Complete a cascader or tree path inside one MCP transaction without returning intermediate full-page snapshots.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        path: z.array(z.string().min(1).max(500)).min(1).max(12),
        scope: z.string().max(240).optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord) => await this.handleForm(params.page_id, engine => engine.selectPath({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      path: params.path,
      scope: params.scope,
    })));

    this.server.registerTool('form_set_date', {
      description: 'Set and verify one complete date or month value as a transaction; intermediate picker values are never reported as success.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        value: z.string().min(4).max(80),
        scope: z.string().max(240).optional(),
        overwrite: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord) => await this.handleForm(params.page_id, engine => engine.setDate({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value,
      scope: params.scope,
      overwrite: params.overwrite,
    })));

    this.server.registerTool('form_activate', {
      description: 'Focus, open, close, add, save, or enter an ordinary next step by semantic target. Final submission and manual boundaries are blocked.',
      inputSchema: {
        ...operationFields,
        target: z.string().min(1).max(240),
        scope: z.string().max(240).optional(),
        intent: z.enum(['focus', 'open', 'close', 'add_record', 'save_record', 'next_step']),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord) => await this.handleForm(params.page_id, engine => engine.activate({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      target: params.target,
      scope: params.scope,
      intent: params.intent,
    })));
  }

  private async handleForm(pageId: number, callback: (engine: FormEngine) => Promise<AnyRecord>): Promise<AnyRecord> {
    const guard = await this.mutex.acquire();
    try {
      const context = await this.getContext();
      context.getPageById(pageId);
      if (!this.engine) this.engine = new FormEngine(id => context.getPageById(id));
      return await callback(this.engine);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: 'browser_error', message: redactDiagnostic(message) } }, null, 2) }],
        structuredContent: { ok: false, error: { code: 'browser_error', message: redactDiagnostic(message) } },
        isError: true,
      };
    } finally {
      guard[Symbol.dispose]();
    }
  }

  private async getContext(): Promise<AnyRecord> {
    if (!this.lockHeld) {
      await lock.acquire();
      this.lockHeld = true;
    }
    const browser = await browserModule.ensureBrowserLaunched({
      headless: upstreamArgs.headless,
      channel: upstreamArgs.channel,
      isolated: false,
      userDataDir: upstreamArgs.userDataDir,
      chromeArgs: upstreamArgs.chromeArg,
      ignoreDefaultChromeArgs: upstreamArgs.ignoreDefaultChromeArg,
      devtools: false,
      enableExtensions: false,
      blocklist: undefined,
      allowlist: undefined,
    });
    if (this.browser !== browser || !this.context) {
      this.context?.dispose?.();
      this.engine?.clear();
      this.browser = browser;
      this.context = await contextModule.McpContext.from(browser, undefined, {
        experimentalDevToolsDebugging: false,
        experimentalIncludeAllPages: false,
        performanceCrux: false,
        sourceMaps: true,
        allowList: undefined,
        blocklist: undefined,
        allowUnrestrictedPaths: false,
        reconnected: this.context !== undefined,
        categoryExtensions: false,
      });
      const context = this.context;
      if (!context) throw new Error('browser_context_unavailable');
      this.engine = new FormEngine(id => context.getPageById(id));
      await this.debugBridge?.close();
      this.debugBridge = new BrowserDebugBridge(profileDir, request => this.handleDebugRequest(request));
      await this.debugBridge.start();
      console.error(`Resume Browser read-only debug socket ready at ${this.debugBridge.endpoint}`);
    }
    if (!this.context) throw new Error('browser_context_unavailable');
    return this.context;
  }

  private async handleDebugRequest(request: AnyRecord): Promise<AnyRecord> {
    const guard = await this.mutex.acquire();
    try {
      const context = this.context;
      const engine = this.engine;
      if (!context || !engine) throw new Error('browser_context_unavailable');
      if (request.command === 'status') {
        return { version: '0.15.1', pid: process.pid, profile_hash: profileHash(profileDir), pages: context.getPages().length };
      }
      if (request.command === 'list_pages') {
        const pages = await Promise.all((context.getPages() as AnyRecord[]).map(async page => ({
          page_id: page.id,
          title: String(await page.pptrPage.title()).slice(0, 200),
          url: redactDiagnostic(String(page.pptrPage.url())),
        })));
        return { pages };
      }
      if (request.command === 'observe') {
        const pageId = Number(request.page_id);
        if (!Number.isInteger(pageId) || pageId <= 0) throw new Error('invalid page_id');
        context.getPageById(pageId);
        const mode: ObserveRequest['mode'] = request.mode === 'focus' || request.mode === 'delta' || request.mode === 'full' ? request.mode : 'overview';
        const includeValues: NonNullable<ObserveRequest['include_values']> = request.include_values === 'masked' || request.include_values === 'needed' ? request.include_values : 'state';
        const result = await engine.observe({
          page_id: pageId,
          mode,
          ...(typeof request.target === 'string' ? { target: request.target } : {}),
          ...(typeof request.scope === 'string' ? { scope: request.scope } : {}),
          ...(typeof request.since_observation_id === 'string' ? { since_observation_id: request.since_observation_id } : {}),
          max_bytes: typeof request.max_bytes === 'number' ? Math.min(request.max_bytes, 20_000) : 8_000,
          include_values: includeValues,
          include_test_ledger: Boolean(request.include_test_ledger),
        });
        return result.structuredContent ?? result;
      }
      throw new Error('unsupported debug command; use status, list_pages, or observe');
    } finally {
      guard[Symbol.dispose]();
    }
  }
}

function redactDiagnostic(value: string): string {
  return value
    .replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`)
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, '$1?<redacted>')
    .slice(0, 1_000);
}

export async function runResumeBrowserServer(): Promise<void> {
  const server = await ResumeBrowserServer.create();
  let shutdownPromise: Promise<void> | undefined;
  const requestShutdown = (): void => {
    shutdownPromise ??= server.close().finally(() => process.exit(0));
  };
  process.stdin.once('end', requestShutdown);
  process.stdin.once('close', requestShutdown);
  process.once('SIGTERM', requestShutdown);
  process.once('SIGINT', requestShutdown);
  await server.connect();
}
