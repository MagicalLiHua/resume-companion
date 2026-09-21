#!/usr/bin/env node

import { existsSync } from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { BrowserDebugBridge } from './browser/debug-bridge.js';
import { redactBrowserText } from './browser/privacy.js';
import { FormEngine, type FieldRequest, type ObserveRequest } from './browser/form-engine.js';
import {ProfileStore} from './profile-store.js';
import {compilePlan,policySchema} from './browser/planning/compiler.js';
import {PreparedPlans,catalogDigest,preparationSummary} from './browser/planning/prepared-plans.js';
import {preparePointerTarget} from './browser/pointer-target.js';
import {guardLowLevelAction} from './browser/low-level-policy.js';
import {assertSupportedForm,inspectSupport,capabilityCatalog,UnsupportedFormError} from './browser/planning/capabilities.js';
import {PagePresentation} from './browser/page-presentation.js';
import {executionReport,reportDetails} from './browser/execution-report.js';
import {FormJourney} from './browser/form-journey.js';
import {FormRunner} from './browser/form-runner.js';
import {formPlanSchema,factSchema} from './browser/form-plan.js';
import { installStaleUidRecovery } from './browser/stale-uid-recovery.js';
import { ensurePageRuntime, runtimeState } from './browser/page-runtime.js';
import { ChromeProfileLock, profileHash, resolveChromeProfileDir } from './chrome-profile.js';
import { RUNTIME_PLUGIN_VERSION } from './version.js';

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

const batchField = z.object({field: z.string().min(1).max(240), value: z.union([z.string().max(20_000), z.boolean(), z.number()]), overwrite: z.boolean().optional()});
const batchSteps = z.array(z.discriminatedUnion('action', [
  z.object({action: z.literal('fill'), fields: z.array(batchField).min(1).max(30)}),
  z.object({action: z.literal('select'), field: z.string().min(1).max(240), value: z.string().max(500).optional(), values: z.array(z.string().min(1).max(500)).max(40).optional(), selection_mode: z.enum(['add','replace']).optional(), query: z.string().max(500).optional(), allow_custom:z.boolean().optional(), overwrite: z.boolean().optional()}),
  z.object({action: z.literal('date'), field: z.string().min(1).max(240), value: z.string().max(80).optional(), range: z.object({start:z.string().min(4).max(10),end:z.string().min(4).max(10).optional(),current:z.boolean().optional()}).optional(), overwrite: z.boolean().optional()}),
])).min(1).max(16);

const snapshotBearingTools = new Set(['take_snapshot', 'wait_for', 'fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text']);
const ledgerAwareLowLevelTools = new Set(['fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text', 'upload_file']);

function sanitizeBrowserResult(value: unknown): unknown {
  if (typeof value === 'string') return redactBrowserText(value);
  if (Array.isArray(value)) return value.map(sanitizeBrowserResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'data' ? item : sanitizeBrowserResult(item)]));
}

function annotateTimeout(result: AnyRecord, toolName: string): AnyRecord {
  const text = Array.isArray(result?.content) ? result.content.filter((item: AnyRecord) => item.type === 'text').map((item: AnyRecord) => item.text).join('\n') : '';
  // Upstream describes navigation failures in text but leaves isError unset.
  if (toolName === 'navigate_page' && /Unable to (?:reload|navigate)/.test(text)) {
    const cancelled = /Dismissed a beforeunload dialog/.test(text);
    result = {...result, isError:true, structuredContent:{ok:false,error:{
      code:cancelled ? 'navigation_cancelled' : 'navigation_failed',
      message:cancelled ? 'Navigation was cancelled by dismissing beforeunload; the page was not reloaded.' : 'Navigation did not complete; inspect the current page before retrying.',
      recovery:'preserve_unsaved_page',
    }}};
  }
  if (!result?.isError || !/timed out after waiting \d+ms|timeout/i.test(text)) return result;
  const phase = ['fill', 'fill_form', 'click', 'hover', 'press_key', 'type_text'].includes(toolName)
    ? 'element_locator_or_event_confirmation'
    : toolName === 'take_screenshot' ? 'screenshot_capture' : 'upstream_page_operation';
  const note = `ApplyMCP: timeout_phase=${phase}; preserve_unsaved_page=true; inspect runtime status or re-observe before retrying. Never repeat an unconfirmed write or reload an unsaved form automatically.`;
  return {
    ...result,
    content: [...(result.content ?? []), { type: 'text', text: note }],
  };
}

export class ResumeBrowserHost {
  readonly presentation=new PagePresentation();
  readonly runner=new FormRunner();
  readonly journeys=new FormJourney();
  readonly preparedPlans=new PreparedPlans();
  readonly profiles=new ProfileStore();
  readonly mutex: AnyRecord = new thirdPartyModule.Mutex();
  readonly unlockedMutex = { acquire: async () => ({ [Symbol.dispose]: (): void => undefined }) };
  private browser: AnyRecord | undefined;
  private context: AnyRecord | undefined;
  private engine: FormEngine | undefined;
  private debugBridge: BrowserDebugBridge | undefined;
  private lockHeld = false;
  private closing = false;
  private leaseOwner: string | undefined;
  private readonly revokedSessions = new Set<string>();

  async run<T>(sessionId: string, callback: () => Promise<T>, signal?: AbortSignal, runId?:string, journeyId?:string): Promise<T> {
    signal?.throwIfAborted();
    if(this.runner.activeId && this.runner.activeId!==runId || this.journeys.activeId && this.journeys.activeId!==journeyId)throw new Error('run_in_progress');
    const guard = await this.mutex.acquire();
    try {
      signal?.throwIfAborted();
      if(this.runner.activeId && this.runner.activeId!==runId || this.journeys.activeId && this.journeys.activeId!==journeyId)throw new Error('run_in_progress');
      this.claimUnsafe(sessionId);
      return await callback();
    } finally {
      guard[Symbol.dispose]();
    }
  }

  async handleForm(sessionId: string, pageId: number, callback: (engine: FormEngine) => Promise<AnyRecord>, signal?: AbortSignal): Promise<AnyRecord> {
    try {
      return await this.run(sessionId, async () => {
        const context = await this.getContext();
        await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if (!this.engine) this.engine = new FormEngine(id => context.getPageById(id),assertSupportedForm);
        return await callback(this.engine);
      }, signal);
    } catch (error) {
      return browserErrorResult(error);
    }
  }

  async handlePrepare(sessionId:string,params:AnyRecord,signal?:AbortSignal):Promise<AnyRecord> {
    const respond=(data:AnyRecord)=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
    if(params.action==='inspect') {
      try {return respond({ok:true,prepared_plan_id:params.prepared_plan_id,...preparationSummary(this.preparedPlans.get(sessionId,params.prepared_plan_id).compilation,params.offset??0,params.limit??20)});}
      catch(error){return browserErrorResult(error);}
    }
    if(!params.page_id||!params.profile_id||!params.expected_revision)return browserErrorResult(new Error('invalid_arguments'));
    return this.handleForm(sessionId,params.page_id,async engine=>{
      const started=Date.now();
      const profile=await this.profiles.readForPlanning(params.profile_id,params.expected_revision);
      let catalog=await engine.capturePlanning(params.page_id,signal);
      // New SPA navigation can finish before its form mounts. Wait locally only
      // while the page has no controls; a login or unsupported form is not retried.
      for(let attempt=0;!catalog.raw.fields.length&&attempt<8;attempt++){await pause(250,undefined,{signal});catalog=await engine.capturePlanning(params.page_id,signal);}
      const support=inspectSupport(catalog.raw);
      if(!support.autofill_allowed)return respond({ok:true,status:'unsupported',support,prepare_ms:Date.now()-started});
      const compilation=compilePlan(catalog,profile,policySchema.parse(params.policy),params.test_mode);
      const entry=compilation.plan?this.preparedPlans.put(sessionId,profile.profile_id,profile.revision,catalog.raw,compilation):undefined;
      return respond({ok:true,status:entry?'prepared':'needs_input',support,...(entry?{prepared_plan_id:entry.id,expires_in_ms:600000}:{}),profile_revision:profile.revision,prepare_ms:Date.now()-started,...preparationSummary(compilation)});
    },signal);
  }

  async handleJourney(sessionId:string,params:AnyRecord,signal?:AbortSignal):Promise<AnyRecord> {
    const respond=(data:AnyRecord)=>{const report=executionReport(data,params);return {content:[{type:'text',text:JSON.stringify(report)}],structuredContent:report};};
    try {
      if(params.expected_report_id&&params.action!=='status')throw new Error('invalid_arguments');
      if(params.action==='status')return respond(this.journeys.status(sessionId,params.journey_id,params.resume_token));
      if(params.action==='cancel')return respond(this.journeys.cancel(sessionId,params.journey_id,params.resume_token));
      if(params.action==='start') {
        if(!params.page_id||!params.profile_id||!params.expected_revision||!params.request_id)throw new Error('invalid_arguments');
        return this.handleForm(sessionId,params.page_id,async engine=>{
          await this.profiles.readForPlanning(params.profile_id,params.expected_revision);
          const {raw}=await engine.captureRun(params.page_id,signal);
          return respond(this.journeys.start(sessionId,params.request_id,{pageId:params.page_id,profileId:params.profile_id,revision:params.expected_revision,policy:policySchema.parse(params.policy),testMode:params.test_mode},raw));
        },signal);
      }
      if(!params.journey_id||this.leaseOwner!==sessionId)throw new Error('browser_takeover_required');
      const pageId=this.journeys.page(sessionId,params.journey_id,params.resume_token);
      return await this.run(sessionId,async()=>{
        const context=await this.getContext();await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if(!this.engine)this.engine=new FormEngine(id=>context.getPageById(id),assertSupportedForm);
        return respond(await this.journeys.execute(sessionId,params.journey_id,this.engine,(id,revision)=>this.profiles.readForPlanning(id,revision),signal));
      },signal,undefined,params.journey_id);
    }catch(error){return browserErrorResult(error);}
  }

  recordLowLevelOperation(pageId: number, action: string, operationId: string | undefined, target: string, resultName: string, scope?: string, elapsedMs?: number): void {
    this.engine?.recordLowLevelOperation(pageId, action, operationId, target, resultName, scope, elapsedMs);
  }

  /** Called only inside run(), so the lease and mutex already fence writes. */
  async requireSupportedPage(pageId:number):Promise<void> {
    const context=await this.getContext();
    if(!this.engine)this.engine=new FormEngine(id=>context.getPageById(id),assertSupportedForm);
    const {raw}=await this.engine.captureRun(pageId);
    assertSupportedForm(raw);
  }

  async handleRun(sessionId:string,params:AnyRecord,signal?:AbortSignal,progress?:(completed:number,total:number)=>void):Promise<AnyRecord> {
    const response=(data:AnyRecord):AnyRecord=>{const report=executionReport(data,params);return {content:[{type:'text',text:JSON.stringify(report)}],structuredContent:report,
      ...(report.error && !report.run_id?{isError:true}:{})};};
    let prepared:AnyRecord={};
    try {
      if(params.expected_report_id&&params.action!=='status')throw new Error('invalid_arguments');
      if(params.action==='status')return response(this.runner.status(sessionId,params.run_id,params.resume_token));
      if(params.action==='cancel')return response(this.runner.cancel(sessionId,params.run_id,params.resume_token));
      if(params.action==='start') {
        if(!params.request_id || Boolean(params.plan)===Boolean(params.prepared_plan_id) || params.run_id || params.revision)throw new Error('invalid_arguments');
        if(params.prepared_plan_id){
          if(this.leaseOwner!==sessionId)throw new Error('browser_takeover_required');
          const entry=this.preparedPlans.get(sessionId,params.prepared_plan_id);
          if(entry.requestId && entry.requestId!==params.request_id)throw new Error('prepared_plan_already_started');
          await this.profiles.readForPlanning(entry.profileId,entry.revision);
          prepared=this.runner.start(sessionId,params.request_id,entry.plan);
          if(prepared.created){
            entry.requestId=params.request_id;entry.runId=prepared.run_id;
            this.runner.markPrepared(sessionId,prepared.run_id);
            this.runner.setDerivedEffects(sessionId,prepared.run_id,entry.compilation.derived_effects??[]);
            this.runner.setGuard(sessionId,prepared.run_id,async(raw,first)=>{
              assertSupportedForm(raw);
              await this.profiles.readForPlanning(entry.profileId,entry.revision);
              if(first&&catalogDigest(raw)!==entry.digest)throw new Error('prepared_page_changed');
            });
          }
        } else prepared=this.runner.start(sessionId,params.request_id,params.plan);
        if(!prepared.created)return response(prepared);
        if(params.defer_execution ?? Boolean(params.prepared_plan_id))return response(prepared);
      } else {
        if(!params.run_id || params.plan || params.prepared_plan_id || params.request_id || params.defer_execution)throw new Error('invalid_arguments');
        // A new connection must explicitly acquire the lease before resuming;
        // a run token alone never transfers browser control.
        if(this.leaseOwner!==sessionId)throw new Error('browser_takeover_required');
        prepared=this.runner.resume(sessionId,params.run_id,params.resume_token,params.revision);
        if(prepared.status!=='ready')return response(prepared);
      }
      const runId=prepared.run_id as string;
      const result=await this.run(sessionId,async()=>{
        const context=await this.getContext();
        const pageId=params.plan?.page_id;
        if(typeof pageId==='number')await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if(!this.engine)this.engine=new FormEngine(id=>context.getPageById(id),assertSupportedForm);
        return await this.runner.executeWindow(sessionId,runId,this.engine,signal,90_000,progress);
      },signal,runId);
      return response({...result,...(prepared.resume_token?{resume_token:prepared.resume_token}:{})});
    } catch(error) {
      if(prepared.run_id && prepared.status==='ready' && this.runner.activeId===prepared.run_id)this.runner.cancel(sessionId,prepared.run_id);
      return browserErrorResult(error);
    }
  }

  releaseSession(sessionId: string): void {
    this.presentation.clearOwner(sessionId);
    this.runner.cancelOwner(sessionId);
    this.journeys.cancelOwner(sessionId);
    this.preparedPlans.clearOwner(sessionId);
    if (this.leaseOwner === sessionId) this.leaseOwner = undefined;
    this.revokedSessions.delete(sessionId);
  }

  async takeover(sessionId: string): Promise<AnyRecord> {
    // Signal before waiting for the browser lock; acknowledgement is not proof
    // that in-flight commands have drained. The lock provides that final fence.
    this.runner.cancelActive();
    if(this.leaseOwner)this.journeys.cancelOwner(this.leaseOwner);
    this.preparedPlans.clear();
    const guard = await this.mutex.acquire();
    try {
      const previousOwner = this.leaseOwner;
      if (previousOwner && previousOwner !== sessionId) this.revokedSessions.add(previousOwner);
      this.revokedSessions.delete(sessionId);
      this.leaseOwner = sessionId;
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, status: previousOwner && previousOwner !== sessionId ? 'taken_over' : 'already_owner' }) }],
        structuredContent: { ok: true, status: previousOwner && previousOwner !== sessionId ? 'taken_over' : 'already_owner' },
      };
    } finally {
      guard[Symbol.dispose]();
    }
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.runner.clear();this.journeys.clear();
    this.preparedPlans.clear();
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
    }
  }

  async getContext(): Promise<AnyRecord> {
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
      if(this.engine){this.runner.clear();this.journeys.clear();}
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
      this.engine = new FormEngine(id => context.getPageById(id),assertSupportedForm);
      await this.debugBridge?.close();
      this.debugBridge = new BrowserDebugBridge(profileDir, request => this.handleDebugRequest(request));
      await this.debugBridge.start();
      console.error(`Resume Browser read-only debug socket ready at ${this.debugBridge.endpoint}`);
    }
    if (!this.context) throw new Error('browser_context_unavailable');
    return this.context;
  }

  private claimUnsafe(sessionId: string): void {
    if (this.revokedSessions.has(sessionId)) {
      throw new Error('browser_lease_revoked: 这个任务的浏览器控制权已由更新的任务接管；请在当前任务明确请求重新接管或继续使用新任务');
    }
    if (this.leaseOwner && this.leaseOwner !== sessionId) {this.revokedSessions.add(this.leaseOwner);this.preparedPlans.clearOwner(this.leaseOwner);}
    this.leaseOwner = sessionId;
  }

  private async handleDebugRequest(request: AnyRecord): Promise<AnyRecord> {
    const guard = await this.mutex.acquire();
    try {
      const context = this.context;
      const engine = this.engine;
      if (!context || !engine) throw new Error('browser_context_unavailable');
      if (request.command === 'status') {
        return { version: RUNTIME_PLUGIN_VERSION, pid: process.pid, profile_hash: profileHash(profileDir), pages: context.getPages().length, lease_active: Boolean(this.leaseOwner) };
      }
      if (request.command === 'runtime_status') {
        const page = context.getPageById(Number(request.page_id));
        return {page_id: page.id, frames: runtimeState(page.pptrPage)};
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
      throw new Error('unsupported debug command; use status, runtime_status, list_pages, or observe');
    } finally {
      guard[Symbol.dispose]();
    }
  }
}

export class ResumeBrowserServer {
  private readonly server: AnyRecord;
  private closing = false;

  private constructor(private readonly host: ResumeBrowserHost, private readonly sessionId: string) {
    this.server = new thirdPartyModule.McpServer({
      name: 'resume_browser',
      title: 'ApplyMCP Browser',
      version: RUNTIME_PLUGIN_VERSION,
    }, { capabilities: { logging: {} } });
  }

  static async create(host = new ResumeBrowserHost(), sessionId: string = randomUUID()): Promise<ResumeBrowserServer> {
    const instance = new ResumeBrowserServer(host, sessionId);
    instance.registerUpstreamTools();
    instance.registerFormTools();
    return instance;
  }

  async connect(transport: AnyRecord = new thirdPartyModule.StdioServerTransport()): Promise<void> {
    await this.server.connect(transport);
    console.error(`ApplyMCP Browser ${RUNTIME_PLUGIN_VERSION} session ready; Chrome profile ${profileHash(profileDir)} is acquired on first browser call.`);
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.host.releaseSession(this.sessionId);
    await this.server.close().catch(() => undefined);
  }

  private registerUpstreamTools(): void {
    const blocked = new Set(['lighthouse_audit']);
    for (const tool of toolsModule.createTools(upstreamArgs) as AnyRecord[]) {
      if (blocked.has(tool.name)) continue;
      const guardedTool=tool.name==='click'?{...tool,handler:async(request:AnyRecord,response:AnyRecord)=>{
        const deadline=Date.now()+1500;
        for(;;){
          const handle=await request.page.getElementByUid(request.params.uid);
          try{await preparePointerTarget(handle);break;}
          catch(error){
            // No pointer event has been dispatched. Re-resolve only a detached
            // node, using the existing unique-semantic UID recovery rules.
            if(!(error instanceof Error)||!error.message.includes('target_detached_before_click')||Date.now()>=deadline)throw error;
            await new Promise(resolve=>setTimeout(resolve,50));
          }finally{await handle.dispose();}
        }
        return tool.handler(request,response);
      }}:tool.name==='upload_file'?{...tool,handler:async(request:AnyRecord,response:AnyRecord)=>{
        const handle=await request.page.getElementByUid(request.params.uid);
        try{
          if(!await handle.evaluate((el:Element)=>el instanceof HTMLInputElement&&el.type==='file'&&!el.disabled))throw new Error('upload_target_not_file_input');
          await handle.uploadFile(...request.params.filePaths);
          response.appendResponseLine('Authorized files selected in the file input; server upload is not confirmed.');
          if(request.params.includeSnapshot)response.includeSnapshot();
        }finally{await handle.dispose();}
      }}:tool;
      const handler = new toolHandlerModule.ToolHandler(guardedTool, upstreamArgs, () => this.host.getContext(), this.host.unlockedMutex);
      if (!handler.shouldRegister) continue;
      if(tool.name==='select_page'||tool.name==='new_page'){
        handler.inputSchema={...handler.inputSchema,
          ...(tool.name==='select_page'?{bringToFront:z.boolean().default(false)}:{background:z.boolean().default(true)}),
          attention_reason:z.enum(['user_request','manual_action','error','completed']).optional().describe('Required only when bringing the dedicated browser to the foreground.'),
          attention_event_id:z.string().min(1).max(120).optional().describe('Stable ID for this pause/error/completion; repeating it does not focus the window again. Not required for an explicit user request.'),
        };
        handler.registeredInputSchema=z.object(handler.inputSchema).passthrough();
      }
      if (ledgerAwareLowLevelTools.has(tool.name)) {
        handler.inputSchema = {
          ...handler.inputSchema,
          operation_id: z.string().min(4).max(120).optional().describe('可选的测试操作关联 ID。'),
          test_mode: z.boolean().optional().describe('把这次低层回退记入短期测试清单；字段语义和清理状态仍标记为未验证。'),
          semantic_target: z.string().max(240).optional().describe('测试回退对应的字段引用或标签，只用于记录，不能替代实际 UID。'),
          semantic_scope: z.string().max(240).optional(),
        };
        handler.registeredInputSchema = z.object(handler.inputSchema).passthrough();
      }
      if(tool.name==='upload_file'){
        handler.inputSchema={...handler.inputSchema,user_authorized:z.boolean().default(false).describe('Only true after the user explicitly authorizes these files and this destination. A general autofill request does not authorize uploading.')};
        handler.registeredInputSchema=z.object(handler.inputSchema).passthrough();
      }
      if (tool.name === 'evaluate_script') {
        handler.inputSchema = {
          ...handler.inputSchema,
          args: z.array(z.string()).optional().describe('Element UIDs from the latest accessibility snapshot. Each string is resolved to a DOM element; ordinary JSON/string values are not supported. For literal values, include JSON literals in the function body.'),
        };
        handler.registeredInputSchema = z.object(handler.inputSchema).passthrough();
      }
      this.server.registerTool(tool.name, {
        description: tool.name==='upload_file'?'Normal mode requires the user to upload files in the dedicated browser. The tool is retained only for isolated local fixtures with explicit authorization.':tool.name==='evaluate_script'?'Arbitrary scripts are disabled in normal mode. Use form_observe or take_snapshot. Only isolated local developer fixtures can enable this tool.':tool.description,
        inputSchema: handler.registeredInputSchema,
        annotations: tool.annotations,
      }, async (params: AnyRecord) => {
        try {
          return await this.host.run(this.sessionId, async () => {
            const startedAt = Date.now();
            if(tool.name==='upload_file'){
              if(!params.user_authorized)return {isError:true,content:[{type:'text',text:'manual_boundary: uploading requires explicit user authorization for the file and destination.'}]};

            }
            if (ledgerAwareLowLevelTools.has(tool.name) || ['evaluate_script', 'drag','click_at'].includes(tool.name)) {
              const context = await this.host.getContext();
              const page=typeof params.pageId==='number'?context.getPageById(params.pageId):context.getSelectedPageFallback();
              await ensurePageRuntime(page.pptrPage);
              await guardLowLevelAction(tool.name,params,page);
              await this.host.requireSupportedPage(page.id);
            }
            let result = await this.host.presentation.run<AnyRecord>(tool.name,params,this.sessionId,p=>handler.handle(p));
            result = annotateTimeout(result, tool.name);
            if (snapshotBearingTools.has(tool.name)) result = sanitizeBrowserResult(result) as AnyRecord;
            if (params.test_mode && typeof params.pageId === 'number') {
              this.host.recordLowLevelOperation(
                params.pageId,
                tool.name,
                params.operation_id,
                params.semantic_target ?? (typeof params.uid === 'string' ? params.uid : Array.isArray(params.elements) ? `${params.elements.length} elements` : 'keyboard_or_pointer_target'),
                result?.isError ? 'failed_or_partial' : 'completed_unverified',
                params.semantic_scope, Date.now() - startedAt,
              );
            }
            return result;
          });
        } catch (error) {
          return browserErrorResult(error);
        }
      });
    }
  }

  private registerFormTools(): void {
    const reportFields={detail:z.enum(reportDetails).default('summary').describe('Summary and exceptions by default. Read a collection through status with offset/limit. full is an explicit compatibility/diagnostic view.'),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(50).default(20),expected_report_id:z.string().max(64).optional().describe('Pin pagination to an unchanged report; allowed only for status.')};
    this.server.registerTool('form_support',{
      description:'Read-only support and compatibility scan before filling. Omit page_ids to list trusted ATS platforms, verified employer templates and evidence; otherwise inspect up to 12 open pages. A trusted page whose form has not mounted gets one short read-only retry. A trusted platform origin must also match its structural form family. Reports verified-template vs compatible-platform matches, live modules, fillable/skipped modules, blocking/advisory differences and manual tasks. Unsupported or candidate pages are not written.',
      inputSchema:{page_ids:z.array(z.number().int().positive()).min(1).max(12).optional()},
      annotations:{readOnlyHint:true},
    },async(params:AnyRecord,extra:AnyRecord)=>{
      const pages=[];
      for(const pageId of [...new Set<number>(params.page_ids??[])]){
        const result=await this.host.handleForm(this.sessionId,pageId,async engine=>{
          let {raw}=await engine.captureRun(pageId,extra.signal);
          let support=inspectSupport(raw);
          if(support.status==='not_resume_form'&&(support.template||support.platform)){
            await pause(400,undefined,{signal:extra.signal});
            ({raw}=await engine.captureRun(pageId,extra.signal));
            support=inspectSupport(raw);
          }
          return {page_id:pageId,support};
        },extra.signal);
        pages.push(result);
      }
      const data=params.page_ids?{catalog_version:capabilityCatalog().catalog_version,pages}:capabilityCatalog();
      return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
    });
    this.server.registerTool('form_journey',{
      description:'Foreground resume workflow for 51job pages and Guopin module editors. Guopin fills and saves one editor at a time, verifies saved record anchors, preserves existing records, and requires append policy when adding alongside pre-existing records. start is read-only and returns a recovery token; resume compiles and verifies each current page locally, then advances confirmed ordinary Next steps. Next may save that page. Stops at missing facts, unsupported controls, declarations, uploads (except an explicitly optional attachment skip), or final review. Never submits an application or replays an uncertain Next. status/cancel remain available while working. A new connection needs explicit browser_takeover and the resume_token. Process-local checkpoints expire after 30 minutes; browser/service restart requires a new journey.',
      inputSchema:{...reportFields,action:z.enum(['start','resume','status','cancel']),request_id:z.string().min(4).max(120).optional(),page_id:z.number().int().positive().optional(),profile_id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),expected_revision:z.number().int().positive().optional(),policy:policySchema,test_mode:z.boolean().default(false),journey_id:z.string().max(120).optional(),resume_token:z.string().max(200).optional()},
      annotations:{readOnlyHint:false,destructiveHint:false},
    },async(params:AnyRecord,extra:AnyRecord)=>this.host.handleJourney(this.sessionId,params,extra.signal));
    this.server.registerTool('form_prepare',{
      description:'Read-only local preparation of a complete resume plan from a pinned profile revision and the full live form. Does not open controls or write fields. Intersects live page modules with provided/none/unknown profile sections and returns module_selection plus profile-only sections. Omitted sections remain unknown; only explicit none permits negative answers. Returns a bounded summary and prepared_plan_id; form_run start accepts that ID and defaults to deferred execution. Inspect pages through action=inspect without reobserving. Plans expire after 10 minutes or lease/connection loss.',
      inputSchema:{action:z.enum(['prepare','inspect']).default('prepare'),page_id:z.number().int().positive().optional(),profile_id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),expected_revision:z.number().int().positive().optional(),policy:policySchema,test_mode:z.boolean().default(false),prepared_plan_id:z.string().max(120).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(20).default(20)},
      annotations:{readOnlyHint:true,destructiveHint:false},
    },async(params:AnyRecord,extra:AnyRecord)=>this.host.handlePrepare(this.sessionId,params,extra.signal));
    this.server.registerTool('form_run',{
      description:'Execute a whole-form plan in a cancellable foreground window. Prefer prepared_plan_id from form_prepare (defaults to deferred start); alternatively pass an explicit plan. Exactly one is required. start validates the entire plan before writing. paused_window resumes by run_id without replay. status/cancel do not wait for browser actions. No save/submit/upload. UI verification is not persistence. A restarted connection needs the resume_token plus explicit browser_takeover before resume.',
      inputSchema:{
        ...reportFields,
        action:z.enum(['start','status','cancel','resume']),
        request_id:z.string().min(4).max(120).optional(),
        plan:formPlanSchema.optional(),
        prepared_plan_id:z.string().max(120).optional(),
        defer_execution:z.boolean().optional().describe('On start, register without writing and return recovery credentials before the first execution window. Continue with resume. Recommended when connection recovery matters.'),
        run_id:z.string().min(1).max(120).optional(),
        resume_token:z.string().max(200).optional(),
        revision:z.object({facts:z.record(factSchema).optional(),retry_steps:z.array(z.string().max(120)).max(500).optional()}).strict().optional(),
      },
      annotations:{readOnlyHint:false,destructiveHint:false},
    },async(params:AnyRecord,extra:AnyRecord)=>this.host.handleRun(this.sessionId,params,extra.signal,
      extra._meta?.progressToken===undefined?undefined:(progress,total)=>{
        void extra.sendNotification({method:'notifications/progress',params:{progressToken:extra._meta.progressToken,progress,total}}).catch(()=>{});
      }));

    this.server.registerTool('browser_takeover', {
      description: 'Explicitly reclaim the shared ApplyMCP browser lease for this task. The previously controlling task remains open but its browser calls are revoked.',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    }, async () => await this.host.takeover(this.sessionId));

    this.server.registerTool('form_observe', {
      description: 'Observe a recruitment form with local semantic caching. date_group fields combine split year/month selects or a named UD month range; target the group with form_set_date instead of selecting each part. Focused results expose local details and a value-free sentinel for changes elsewhere; full mode is explicit.',
      inputSchema: {
        page_id: z.number().int().positive(),
        mode: z.enum(['overview', 'focus', 'delta', 'full']).default('overview'),
        target: z.string().max(200).optional(),
        scope: z.string().max(200).optional(),
        since_observation_id: z.string().max(120).optional(),
        max_bytes: z.number().int().min(2_000).max(80_000).optional(),
        include_values: z.enum(['state', 'masked', 'needed']).optional(),
        include_test_ledger: z.boolean().optional(),
        cursor: z.string().max(160).optional().describe('Continue the frozen field catalog using coverage.next_cursor; invalid after writes/navigation.'),
        ledger_cursor: z.number().int().nonnegative().optional(),
        ledger_limit: z.number().int().min(0).max(25).optional().describe('0/default returns run counts only; request details explicitly, independently of fields.'),
      },
      annotations: { readOnlyHint: true },
    }, async (params: ObserveRequest) => await this.host.handleForm(this.sessionId, params.page_id, engine => engine.observe(params)));

    this.server.registerTool('form_fill_fields', {
      description: 'Fill ordinary fields, OR execute 1–16 preplanned fill/select/date steps in one observed record scope. Steps run sequentially with fresh generations, stop on uncertainty/conflict, and recheck values at the end. No add/save/submit steps. Provide exactly fields or steps; scope is required for steps. Retry uncertain transport with the same operation_id.',
      inputSchema: {
        ...operationFields,
        fields: z.array(z.object({
          field: z.string().min(1).max(240),
          scope: z.string().max(240).optional(),
          value: z.union([z.string().max(20_000), z.boolean(), z.number()]),
          overwrite: z.boolean().optional(),
        })).min(1).max(80).optional(),
        scope: z.string().min(1).max(240).optional(),
        steps: batchSteps.optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord, extra: AnyRecord) => await this.host.handleForm(this.sessionId, params.page_id, async engine => {
      if (Boolean(params.fields) === Boolean(params.steps) || params.steps && !params.scope) return {isError:true,content:[{type:'text',text:'Provide exactly fields or steps; steps require scope.'}]};
      if (params.steps) return engine.executeBatch({pageId:params.page_id,signal:extra.signal,expectedGeneration:params.expected_generation,operationId:params.operation_id,testMode:params.test_mode,scope:params.scope,steps:params.steps});
      return engine.fillFields({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      fields: (params.fields as FieldRequest[]).map(field => ({...field, scope: field.scope ?? params.scope})),
    }); }, extra.signal));

    this.server.registerTool('form_select_option', {
      description: 'Select one option with value, or a supported multiple Select set with values. Add preserves existing choices; replace requires authorized overwrite. Verify UI state, not persistence.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        value: z.string().min(1).max(500).optional(),
        values: z.array(z.string().min(1).max(500)).max(80).optional(),
        selection_mode: z.enum(['add', 'replace']).optional(),
        scope: z.string().max(240).optional(),
        query: z.string().max(500).optional(),
        allow_custom: z.boolean().optional().describe('Allow the exact supplied name through an observed local custom-school/major option. Does not authorize creating records or submitting.'),
        overwrite: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord, extra: AnyRecord) => await this.host.handleForm(this.sessionId, params.page_id, engine => engine.selectOption({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value ?? '',
      values: params.values,
      selectionMode: params.selection_mode,
      scope: params.scope,
      query: params.query,
      allowCustom: params.allow_custom,
      overwrite: params.overwrite,
    }), extra.signal));

    this.server.registerTool('form_select_path', {
      description: 'Complete a cascader or tree path inside one MCP transaction without returning intermediate full-page snapshots.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        path: z.array(z.string().min(1).max(500)).min(1).max(12),
        overwrite: z.boolean().optional(),
        scope: z.string().max(240).optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord, extra: AnyRecord) => await this.host.handleForm(this.sessionId, params.page_id, engine => engine.selectPath({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      path: params.path,
      overwrite: params.overwrite,
      scope: params.scope,
    }), extra.signal));

    this.server.registerTool('form_set_date', {
      description: 'Set and verify an ISO date/month using value, or a supported date range using range. For observed date_group fields, use the group reference: split year/month parts or both UD month endpoints are handled in one call. A current checkbox is supported only for an explicitly observed compatible group. Separate endpoint fields use end_field and an explicit current_field for current=true. UI verification does not prove saving.',
      inputSchema: {
        ...operationFields,
        field: z.string().min(1).max(240),
        value: z.string().min(4).max(80).optional(),
        range: z.object({start: z.string().min(4).max(10), end: z.string().min(4).max(10).optional(), current: z.boolean().optional()}).optional(),
        end_field: z.string().min(1).max(240).optional(),
        current_field: z.string().min(1).max(240).optional(),
        scope: z.string().max(240).optional(),
        overwrite: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord, extra: AnyRecord) => await this.host.handleForm(this.sessionId, params.page_id, engine => engine.setDate({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value ?? '',
      range: params.range,
      endField: params.end_field,
      currentField: params.current_field,
      scope: params.scope,
      overwrite: params.overwrite,
    }), extra.signal));

    this.server.registerTool('form_activate', {
      description: 'Focus, open, close, add, save, or enter an ordinary next step by semantic target. Final submission and manual boundaries are blocked.',
      inputSchema: {
        ...operationFields,
        target: z.string().min(1).max(240),
        scope: z.string().max(240).optional(),
        intent: z.enum(['focus', 'open', 'close', 'add_record', 'save_record', 'next_step']),
      },
      annotations: { readOnlyHint: false },
    }, async (params: AnyRecord, extra: AnyRecord) => await this.host.handleForm(this.sessionId, params.page_id, engine => engine.activate({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      target: params.target,
      scope: params.scope,
      intent: params.intent,
    }), extra.signal));
  }

}

function browserErrorResult(error: unknown): AnyRecord {
  if(error instanceof UnsupportedFormError){
    const data={ok:false,error:{code:error.code},support:error.support,side_effects:'none'};
    return {isError:true,content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }
  const message = error instanceof Error ? error.message : String(error);
  const typedCode=error && typeof error==='object' && 'code' in error?String(error.code):message;
  const safeCode=/^(prepared_[a-z_]+|profile_changed|profile_not_found|invalid_arguments|no_executable_plan)$/.test(typedCode)?typedCode:undefined;
  const code = safeCode ?? (/^browser_lease_revoked:/.test(message) ? 'browser_lease_revoked' : /^page_context_unavailable:/.test(message) ? 'page_context_unavailable' : 'browser_error');
  const data = { ok: false, error: { code, message: redactDiagnostic(message) } };
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: true,
  };
}

function redactDiagnostic(value: string): string {
  return value
    .replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`)
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, '$1?<redacted>')
    .slice(0, 1_000);
}

export async function runResumeBrowserServer(): Promise<void> {
  const host = new ResumeBrowserHost();
  const server = await ResumeBrowserServer.create(host);
  let shutdownPromise: Promise<void> | undefined;
  const requestShutdown = (): void => {
    shutdownPromise ??= server.close().then(() => host.close()).finally(() => process.exit(0));
  };
  process.stdin.once('end', requestShutdown);
  process.stdin.once('close', requestShutdown);
  process.once('SIGTERM', requestShutdown);
  process.once('SIGINT', requestShutdown);
  await server.connect();
}
