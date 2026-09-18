import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { canonical, type Condition, type LiteralWrite, type ObserveParams, type ResolvedActParams, type Scalar, type UndoParams, type WaitParams } from '../protocol.js';
import { BrowserError, messageOf, normalizeBrowserError } from './errors.js';
import { OperationJournal, type OperationChange, type OperationReceipt } from './operation-journal.js';
import { assertSnapshotEntry, descendantsOf, normalizeSnapshot, ReferenceBook, type AxNode, type NormalizedSnapshot, type SnapshotEntry } from './snapshot.js';
import type { ActivateTabInput, BrowserDriver, DriverStatus, ListTabsInput, ProfileMode } from './types.js';

type UpstreamPage = { id: number; url: string; title: string; selected?: boolean };
type UpstreamResult = { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean };
type Session = {
  id: string;
  pageId: number;
  url: string;
  title: string;
  invalidated: boolean;
  references: ReferenceBook;
  snapshots: Map<string, NormalizedSnapshot>;
  cursors: Map<string, { snapshotId: string; offset: number; mode: string; scopeRef?: string }>;
  journal: OperationJournal;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RUNTIME = [
  resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  resolve(moduleDirectory, '../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
].find(existsSync) ?? resolve(moduleDirectory, 'runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
const sleep = (milliseconds: number): Promise<void> => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const byteSize = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

export class DevToolsDriver implements BrowserDriver {
  readonly kind = 'devtools' as const;
  private readonly runtimePath: string;
  private readonly profileMode: ProfileMode;
  private readonly dataDir: string;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<Client> | null = null;
  private connected = false;
  private permissionState: DriverStatus['permission_state'];
  private seededStartPage = false;
  private readonly sessions = new Map<string, Session>();
  private readonly pageSessions = new Map<number, Session>();

  constructor(options: { runtimePath?: string; profileMode?: ProfileMode; dataDir: string }) {
    this.runtimePath = options.runtimePath ?? process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? DEFAULT_RUNTIME;
    this.profileMode = options.profileMode ?? parseProfileMode(process.env.RESUME_COMPANION_CHROME_PROFILE_MODE);
    this.dataDir = options.dataDir;
    this.permissionState = this.profileMode === 'auto_connect' ? 'unknown' : 'not_required';
  }

  async status(): Promise<DriverStatus> {
    const runtimeReady = existsSync(this.runtimePath);
    return {
      kind: this.kind,
      ready: runtimeReady,
      connected: this.connected,
      compatible: runtimeReady,
      profile_mode: this.profileMode,
      permission_state: this.permissionState,
      runtime_version: '1.9.0',
      capabilities: {
        coreProtocol: '2.1',
        continuousForms: true,
        finalSubmit: false,
        trustedEvents: true,
        verticalScroll: true,
        horizontalScroll: false,
        frames: 'accessibility-tree',
        shadowDOM: 'accessibility-tree',
        activateTab: true,
      },
      message: !runtimeReady
        ? 'Chrome DevTools MCP 运行包缺失，请重新构建或安装完整发行包'
        : this.connected
          ? 'Chrome DevTools 驱动已连接'
          : this.profileMode === 'auto_connect'
            ? '网页工具首次调用时连接当前 Chrome；如出现提示，请在 Chrome 中点击 Allow'
            : '网页工具首次调用时启动 Chrome',
    };
  }

  async listTabs(input: ListTabsInput, signal?: AbortSignal): Promise<unknown> {
    const pages = await this.pages(signal);
    const needle = input.url_contains?.toLocaleLowerCase();
    const matching = pages.filter(page => /^https?:\/\//.test(page.url) && (!needle || `${page.title}\n${page.url}`.toLocaleLowerCase().includes(needle)));
    const tabs = matching.slice(0, 100).map((page, index) => ({
      tabId: page.id,
      windowId: 0,
      index,
      active: Boolean(page.selected),
      title: page.title,
      url: page.url,
    }));
    return {
      currentWindowOnly: false,
      requestedCurrentWindowOnly: input.current_window_only !== false,
      total: matching.length,
      truncated: matching.length > tabs.length,
      tabs,
      notice: input.current_window_only !== false ? 'DevTools 协议按已授权浏览器上下文列出标签页，不区分 Chrome 窗口。' : undefined,
    };
  }

  async activateTab(input: ActivateTabInput, signal?: AbortSignal): Promise<unknown> {
    const structured = await this.call('select_page', { pageId: input.tab_id, bringToFront: true }, signal);
    const page = extractPages(structured).find(item => item.id === input.tab_id);
    if (!page || !/^https?:\/\//.test(page.url)) throw new BrowserError('blocked', '指定标签页不是普通 HTTP/HTTPS 网页');
    return {
      tabId: page.id,
      windowId: 0,
      status: 'visible',
      pageState: { visibility: 'visible', focused: true },
      note: '页面已切到前台，可以继续观察',
    };
  }

  async observe(input: ObserveParams, signal?: AbortSignal): Promise<unknown> {
    const session = await this.sessionForObserve(input, signal);
    const mode = input.mode ?? 'overview';
    if (mode === 'verify') {
      const snapshot = await this.capture(session, signal);
      const operations = this.verifyOperations(session, input.operation_ids ?? [], snapshot);
      return this.formatObservation(session, snapshot, input, { operations, remaining_operation_ids: [] });
    }
    if (input.cursor) {
      const cursor = session.cursors.get(input.cursor);
      if (!cursor || cursor.mode !== mode || cursor.scopeRef !== input.scope_ref) throw new BrowserError('stale', '分页条件变化或游标已过期');
      const stored = session.snapshots.get(cursor.snapshotId);
      if (!stored) throw new BrowserError('stale', '分页快照已过期，请重新观察');
      const current = await this.capture(session, signal);
      if (current.signature !== stored.signature) throw new BrowserError('stale', '页面已变化，请重新观察，不拼接旧分页');
      return this.formatObservation(session, stored, input, {}, cursor.offset);
    }
    const snapshot = await this.capture(session, signal);
    return this.formatObservation(session, snapshot, input);
  }

  async act(input: ResolvedActParams, signal?: AbortSignal): Promise<unknown> {
    const session = this.requireSession(input.session_id);
    return session.journal.run(input.operation_id, input, async record => {
      this.throwIfAborted(signal);
      const source = session.snapshots.get(input.snapshot_id);
      if (!source) throw new BrowserError('stale', '动作引用的快照已过期，请重新观察');
      const writes = input.action.kind === 'set_values' ? input.action.items : isWrite(input.action) ? [input.action] : [];
      for (const write of writes) this.preflightWrite(source, write);
      if (input.action.kind === 'click' || input.action.kind === 'press_key' || input.action.kind === 'scroll') {
        assertSnapshotEntry(source, input.action.ref, 'expected_value_token' in input.action ? input.action.expected_value_token : undefined);
      }
      const before = await this.capture(session, signal);
      if (before.url !== source.url) throw new BrowserError('stale', '页面已经导航，请重新枚举或观察标签页');
      const changes = writes.map(write => this.changeForWrite(before, source, write));
      record.changes.push(...changes);
      try {
        const dispatched = await this.dispatchAction(session, source, before, input, signal);
        const after = await this.capture(session, signal, true);
        const receipt = this.receiptForAction(input, before, after, record.changes, dispatched);
        if (input.action.kind === 'click' && ['save_record', 'save_draft', 'advance_step'].includes(String(receipt.effect_kind))) session.journal.markBoundary();
        return receipt;
      } catch (error) {
        if (error instanceof BrowserError) throw error;
        try {
          const after = await this.capture(session, signal, true);
          const results = this.readBack(record.changes, after);
          return { operation_id: input.operation_id, status: results.some(item => item.value_retained) ? 'unknown' : 'failed', dispatched: true, side_effects: 'possible', results, message: messageOf(error) };
        } catch {
          return { operation_id: input.operation_id, status: 'unknown', dispatched: true, side_effects: 'possible', results: [], message: messageOf(error) };
        }
      }
    });
  }

  async wait(input: WaitParams, signal?: AbortSignal): Promise<unknown> {
    const session = this.requireSession(input.session_id);
    const source = session.snapshots.get(input.snapshot_id);
    if (!source) throw new BrowserError('stale', '等待引用的快照已过期，请重新观察');
    if (input.condition.kind !== 'structure_changed') assertSnapshotEntry(source, input.condition.ref);
    const deadline = Date.now() + (input.timeout_ms ?? 5_000);
    do {
      this.throwIfAborted(signal);
      const current = await this.capture(session, signal);
      const result = evaluateCondition(input.condition, source, current);
      if (result.ready) return { status: 'ready', reason: result.reason, snapshot_id: current.id, condition: input.condition };
      await sleep(120);
    } while (Date.now() < deadline);
    return { status: 'unknown', reason: 'timeout', snapshot_id: source.id, condition: input.condition };
  }

  async undo(input: UndoParams, signal?: AbortSignal): Promise<unknown> {
    const session = this.requireSession(input.session_id);
    return session.journal.run(input.operation_id, input, async () => {
      const results: Array<Record<string, unknown>> = [];
      for (const operationId of [...input.operation_ids].reverse()) {
        this.throwIfAborted(signal);
        const record = session.journal.get(operationId);
        if (!record) {
          results.push({ operation_id: operationId, status: 'unknown', message: '操作记录不存在或已经过期' });
          continue;
        }
        if (record.boundary) {
          results.push({ operation_id: operationId, status: 'blocked', message: '该操作位于保存或页面迁移边界之前，不能安全撤销' });
          continue;
        }
        for (const change of [...record.changes].reverse()) {
          if (change.undone || !change.reversible) continue;
          const current = await this.capture(session, signal);
          const entry = current.entries.get(change.ref);
          if (!entry || entry.value !== change.written) {
            results.push({ operation_id: operationId, ref: change.ref, status: 'blocked', message: '字段已被用户或后续操作修改，未覆盖当前值' });
            continue;
          }
          await this.call('fill', { pageId: session.pageId, uid: entry.node.id, value: scalarToFill(change.before ?? ''), includeSnapshot: false }, signal);
          change.undone = true;
          results.push({ operation_id: operationId, ref: change.ref, status: 'applied' });
        }
      }
      const applied = results.some(result => result.status === 'applied');
      return { operation_id: input.operation_id, status: applied ? 'applied' : 'blocked', results };
    });
  }

  async close(): Promise<void> {
    this.sessions.clear();
    this.pageSessions.clear();
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.connecting = null;
    this.connected = false;
    await client?.close().catch(() => undefined);
  }

  private async ensureClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = this.startClient();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async startClient(): Promise<Client> {
    if (!existsSync(this.runtimePath)) throw new BrowserError('driver_unavailable', `Chrome DevTools MCP 运行包不存在：${this.runtimePath}`);
    if (this.profileMode === 'dedicated') await mkdir(join(this.dataDir, 'chrome-profile'), { recursive: true, mode: 0o700 });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.runtimePath, ...this.upstreamArguments()],
      cwd: dirname(this.runtimePath),
      env: {
        ...stringEnvironment(),
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1',
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
      },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'resume-companion-browser-driver', version: '0.5.0' });
    try {
      await client.connect(transport);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw normalizeBrowserError(error);
    }
    this.transport = transport;
    this.client = client;
    return client;
  }

  private upstreamArguments(): string[] {
    const args = [
      '--experimental-structured-content',
      '--no-usage-statistics',
      '--no-performance-crux',
      '--no-javascript-evaluation',
      '--no-source-maps',
      '--redact-network-headers',
      '--no-category-emulation',
      '--no-category-performance',
      '--no-category-network',
      '--no-category-memory',
      '--no-category-extensions',
      '--no-category-experimental-third-party',
      '--no-category-experimental-webmcp',
      '--no-category-pwa',
    ];
    const browserUrl = process.env.RESUME_COMPANION_DEVTOOLS_BROWSER_URL;
    if (browserUrl) args.push(`--browser-url=${browserUrl}`);
    else if (this.profileMode === 'auto_connect') args.push('--auto-connect', '--channel=stable');
    else if (this.profileMode === 'isolated') args.push('--isolated');
    else args.push(`--user-data-dir=${join(this.dataDir, 'chrome-profile')}`, '--channel=stable');
    if (process.env.RESUME_COMPANION_DEVTOOLS_HEADLESS === '1') args.push('--headless');
    const executable = process.env.RESUME_COMPANION_CHROME_EXECUTABLE;
    if (executable && !browserUrl && this.profileMode !== 'auto_connect') args.push(`--executable-path=${executable}`);
    return args;
  }

  private async call(name: string, arguments_: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const allowed = new Set(['list_pages', 'select_page', 'take_snapshot', 'fill', 'fill_form', 'click', 'press_key']);
    if (name === 'new_page' && process.env.RESUME_COMPANION_DEVTOOLS_START_URL) allowed.add('new_page');
    if (!allowed.has(name)) throw new BrowserError('blocked', `内部浏览器工具不在允许列表：${name}`);
    this.throwIfAborted(signal);
    const client = await this.ensureClient();
    let result: UpstreamResult;
    try {
      result = await client.callTool({ name, arguments: arguments_ }, undefined, signal ? { signal } : undefined) as UpstreamResult;
    } catch (error) {
      this.connected = false;
      throw normalizeBrowserError(error);
    }
    if (result.isError) {
      const text = result.content?.map(item => item.text ?? '').filter(Boolean).join('\n') || `${name} 执行失败`;
      if (/permission|Allow|remote debugging|chrome:\/\/inspect/i.test(text)) this.permissionState = 'required';
      throw normalizeBrowserError(new Error(text));
    }
    this.connected = true;
    if (this.profileMode === 'auto_connect') this.permissionState = 'granted';
    const structured = isRecord(result.structuredContent) ? result.structuredContent : {};
    if (structured.reconnected === true) this.invalidateSessions();
    return structured;
  }

  private async pages(signal?: AbortSignal): Promise<UpstreamPage[]> {
    let structured = await this.call('list_pages', {}, signal);
    let pages = extractPages(structured);
    const startUrl = process.env.RESUME_COMPANION_DEVTOOLS_START_URL;
    if (startUrl && !this.seededStartPage && !pages.some(page => /^https?:\/\//.test(page.url))) {
      const url = new URL(startUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new BrowserError('invalid_request', 'RESUME_COMPANION_DEVTOOLS_START_URL 只允许 HTTP/HTTPS');
      this.seededStartPage = true;
      structured = await this.call('new_page', { url: url.href, background: false, timeout: 10_000 }, signal);
      pages = extractPages(structured);
    }
    return pages;
  }

  private async sessionForObserve(input: ObserveParams, signal?: AbortSignal): Promise<Session> {
    if (input.session_id) return this.requireSession(input.session_id);
    const pageId = input.tab_id;
    if (!pageId) throw new BrowserError('invalid_request', 'observe 需要 tab_id 或 session_id');
    const pages = await this.pages(signal);
    const page = pages.find(item => item.id === pageId);
    if (!page || !/^https?:\/\//.test(page.url)) throw new BrowserError('blocked', '指定标签页不是普通 HTTP/HTTPS 网页');
    const existing = this.pageSessions.get(pageId);
    if (existing && !existing.invalidated && existing.url === page.url) return existing;
    if (existing) this.dropSession(existing);
    const session: Session = {
      id: crypto.randomUUID(),
      pageId,
      url: page.url,
      title: page.title,
      invalidated: false,
      references: new ReferenceBook(),
      snapshots: new Map(),
      cursors: new Map(),
      journal: new OperationJournal(),
    };
    this.sessions.set(session.id, session);
    this.pageSessions.set(pageId, session);
    return session;
  }

  private requireSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session || session.invalidated) throw new BrowserError('stale', '页面、导航或浏览器连接已经变化，请使用 tab_id 重新观察');
    return session;
  }

  private async capture(session: Session, signal?: AbortSignal, allowNavigation = false): Promise<NormalizedSnapshot> {
    const pages = await this.pages(signal);
    const page = pages.find(item => item.id === session.pageId);
    if (!page) {
      this.dropSession(session);
      throw new BrowserError('stale', '标签页已经关闭，请重新枚举标签页');
    }
    const navigated = page.url !== session.url;
    if (navigated && !allowNavigation) {
      this.dropSession(session);
      throw new BrowserError('stale', '页面已经导航，请使用 tab_id 重新观察');
    }
    await this.call('select_page', { pageId: session.pageId, bringToFront: false }, signal);
    const structured = await this.call('take_snapshot', { pageId: session.pageId, verbose: false }, signal);
    const root = structured.snapshot;
    if (!isAxNode(root)) throw new BrowserError('unknown', 'Chrome 没有返回可解析的无障碍快照');
    const snapshot = normalizeSnapshot({ root, pageId: session.pageId, url: page.url, title: page.title, references: session.references });
    session.snapshots.set(snapshot.id, snapshot);
    while (session.snapshots.size > 20) {
      const oldest = session.snapshots.keys().next().value as string | undefined;
      if (!oldest) break;
      session.snapshots.delete(oldest);
      for (const [cursor, state] of session.cursors) if (state.snapshotId === oldest) session.cursors.delete(cursor);
    }
    if (navigated) session.invalidated = true;
    else {
      session.url = page.url;
      session.title = page.title;
    }
    return snapshot;
  }

  private formatObservation(session: Session, snapshot: NormalizedSnapshot, input: ObserveParams, extra: Record<string, unknown> = {}, forcedOffset?: number): Record<string, unknown> {
    const mode = input.mode ?? 'overview';
    let elements = snapshot.order.map(ref => snapshot.entries.get(ref)?.public).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (mode === 'detail' && input.scope_ref) {
      const source = this.findExposedEntry(session, input.scope_ref);
      const refs = descendantsOf(source, snapshot);
      elements = elements.filter(element => refs.has(element.ref));
    }
    const old = input.snapshot_id ? session.snapshots.get(input.snapshot_id) : undefined;
    const removedRefs = mode === 'changes' && old ? old.order.filter(ref => !snapshot.entries.has(ref)).slice(0, 80) : [];
    if (mode === 'changes' && old) elements = elements.filter(element => canonical(element) !== canonical(old.entries.get(element.ref)?.public));
    const cursorState = input.cursor ? session.cursors.get(input.cursor) : undefined;
    const offset = forcedOffset ?? cursorState?.offset ?? 0;
    const limit = input.limit ?? (mode === 'overview' ? 80 : 50);
    const response: Record<string, unknown> = {
      protocol_version: '2.1',
      driver: 'devtools',
      session_id: session.id,
      snapshot_id: snapshot.id,
      page: { url: snapshot.url, title: snapshot.title, page_id: snapshot.pageId, visibility: 'visible', focused: true },
      mode,
      scope_ref: input.scope_ref ?? elements[0]?.scope_ref ?? null,
      elements: [] as Array<Record<string, unknown>>,
      total: elements.length,
      offset,
      removed_refs: removedRefs,
      requires_full_observation: mode === 'changes' && !old,
      rendered_only: true,
      notices: [],
      ...extra,
    };
    const output = response.elements as Array<Record<string, unknown>>;
    while (offset + output.length < elements.length && output.length < limit) {
      const element = elements[offset + output.length];
      if (!element) break;
      output.push(stripInternal(element));
      if (byteSize(response) > 11_200) {
        output.pop();
        break;
      }
    }
    for (const element of output) {
      for (const ref of [element.ref, element.scope_ref, element.owner_ref, ...(Array.isArray(element.evidence_refs) ? element.evidence_refs : [])]) {
        if (typeof ref === 'string' && snapshot.entries.has(ref)) snapshot.exposed.add(ref);
      }
    }
    const next = offset + output.length;
    response.truncated = next < elements.length;
    if (response.truncated) {
      const cursor = crypto.randomUUID();
      session.cursors.set(cursor, { snapshotId: snapshot.id, offset: next, mode, ...(input.scope_ref ? { scopeRef: input.scope_ref } : {}) });
      response.next_cursor = cursor;
    }
    response.response_bytes = byteSize(response);
    return response;
  }

  private findExposedEntry(session: Session, ref: string): SnapshotEntry {
    for (const snapshot of [...session.snapshots.values()].reverse()) {
      if (snapshot.exposed.has(ref)) {
        const entry = snapshot.entries.get(ref);
        if (entry) return entry;
      }
    }
    throw new BrowserError('stale', '请先观察页面后再使用范围引用');
  }

  private preflightWrite(source: NormalizedSnapshot, write: LiteralWrite): void {
    const entry = assertSnapshotEntry(source, write.ref, write.expected_value_token);
    const required = write.kind === 'set_checked' ? 'set_checked' : write.kind === 'select_option' ? 'select_option' : 'set_value';
    if (!entry.public.allowed_actions.includes(required)) throw new BrowserError('blocked', `字段不允许 ${required} 操作`);
    if (write.kind === 'select_option' && write.option_ref) {
      const option = assertSnapshotEntry(source, write.option_ref);
      if (option.public.owner_ref && option.public.owner_ref !== write.ref) throw new BrowserError('blocked', '候选项不属于目标字段');
    }
  }

  private changeForWrite(current: NormalizedSnapshot, source: NormalizedSnapshot, write: LiteralWrite): OperationChange {
    const old = assertSnapshotEntry(source, write.ref, write.expected_value_token);
    const entry = assertSnapshotEntry(current, write.ref, write.expected_value_token, false);
    if (entry.node.id !== old.node.id) throw new BrowserError('stale', '字段引用已经替换，请重新观察');
    return { ref: write.ref, before: entry.value, written: intendedValue(write, source), reversible: true };
  }

  private async dispatchAction(session: Session, source: NormalizedSnapshot, current: NormalizedSnapshot, input: ResolvedActParams, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const action = input.action;
    if (action.kind === 'set_values') {
      const elements = action.items.map(write => this.fillElement(current, source, write));
      return this.call('fill_form', { pageId: session.pageId, elements, includeSnapshot: false }, signal);
    }
    if (isWrite(action)) {
      const element = this.fillElement(current, source, action);
      return this.call('fill', { pageId: session.pageId, ...element, includeSnapshot: false }, signal);
    }
    const entry = assertSnapshotEntry(current, action.ref, 'expected_value_token' in action ? action.expected_value_token : undefined, false);
    if (action.kind === 'click') {
      if (action.effect_kind === 'final_submit' || entry.public.effect_kind === 'final_submit') throw new BrowserError('blocked', '最终申请提交必须由用户完成');
      if (!entry.public.allowed_actions.includes('click')) throw new BrowserError('blocked', '该元素不允许点击');
      return this.call('click', { pageId: session.pageId, uid: entry.node.id, includeSnapshot: false }, signal);
    }
    if (action.kind === 'press_key') {
      if (!entry.public.allowed_actions.includes('press_key')) throw new BrowserError('blocked', '该元素不允许键盘操作');
      await this.call('click', { pageId: session.pageId, uid: entry.node.id, includeSnapshot: false }, signal);
      return this.call('press_key', { pageId: session.pageId, key: action.key, includeSnapshot: false }, signal);
    }
    if (action.direction === 'left' || action.direction === 'right') {
      throw new BrowserError('unsupported_capability', '当前 DevTools 驱动不提供横向滚动；请由用户处理该横向控件');
    }
    const key = action.direction === 'down' ? 'PageDown' : 'PageUp';
    const count = Math.max(1, Math.min(4, Math.ceil((action.pixels ?? 600) / 600)));
    let result: Record<string, unknown> = {};
    for (let index = 0; index < count; index++) {
      result = await this.call('press_key', { pageId: session.pageId, key, includeSnapshot: false }, signal);
    }
    return { ...result, scroll_direction: action.direction, requested_pixels: action.pixels ?? null, key_presses: count };
  }

  private fillElement(current: NormalizedSnapshot, source: NormalizedSnapshot, write: LiteralWrite): { uid: string; value: string } {
    const entry = assertSnapshotEntry(current, write.ref, write.expected_value_token, false);
    if (write.kind === 'set_value') return { uid: entry.node.id, value: scalarToFill(write.value.literal) };
    if (write.kind === 'set_checked') return { uid: entry.node.id, value: String(write.checked) };
    if (write.option_ref) {
      const option = assertSnapshotEntry(source, write.option_ref);
      return { uid: entry.node.id, value: option.public.name };
    }
    return { uid: entry.node.id, value: write.option_value ?? '' };
  }

  private receiptForAction(input: ResolvedActParams, before: NormalizedSnapshot, after: NormalizedSnapshot, changes: OperationChange[], dispatched: Record<string, unknown>): OperationReceipt {
    const action = input.action;
    if (isWrite(action) || action.kind === 'set_values') {
      const results = this.readBack(changes, after);
      const all = results.length > 0 && results.every(item => item.value_retained === true);
      return { operation_id: input.operation_id, status: all ? 'applied' : 'failed', dispatched: true, side_effects: all ? 'confirmed' : 'possible', results };
    }
    if (action.kind === 'click') {
      const navigated = before.url !== after.url || after.signature !== before.signature;
      const effect = action.effect_kind === 'unknown' ? String(assertSnapshotEntry(before, action.ref).public.effect_kind ?? 'interaction') : action.effect_kind;
      return {
        operation_id: input.operation_id,
        status: navigated ? 'applied' : 'dispatched',
        dispatched: true,
        effect_kind: effect,
        persistence: ['save_record', 'save_draft'].includes(effect) ? 'unconfirmed' : undefined,
        transition: effect === 'advance_step' ? { requires_observe: true, page_changed: before.url !== after.url || before.signature !== after.signature } : undefined,
        upstream: dispatched.message,
      };
    }
    return { operation_id: input.operation_id, status: 'applied', dispatched: true, side_effects: 'confirmed' };
  }

  private readBack(changes: OperationChange[], after: NormalizedSnapshot): Array<Record<string, unknown>> {
    return changes.map(change => {
      const actual = after.entries.get(change.ref)?.value;
      return {
        ref: change.ref,
        value_retained: actual === change.written,
        actual_value: actual ?? null,
        validation: after.entries.get(change.ref)?.public.validation ?? { state: 'unknown', messages: [] },
        reversible: change.reversible && actual === change.written,
      };
    });
  }

  private verifyOperations(session: Session, operationIds: string[], snapshot: NormalizedSnapshot): Array<Record<string, unknown>> {
    return operationIds.map(operationId => {
      const record = session.journal.get(operationId);
      if (!record) return { operation_id: operationId, status: 'unknown', message: '操作记录已过期或属于旧页面' };
      return {
        operation_id: operationId,
        status: record.result?.status ?? 'unknown',
        values: record.changes.map(change => {
          const current = snapshot.entries.get(change.ref);
          return {
            ref: change.ref,
            value_retained: current?.value === change.written,
            validation: current?.public.validation ?? { state: 'unknown', messages: [] },
            reversible: Boolean(current && current.value === change.written && change.reversible && !change.undone && !record.boundary),
          };
        }),
      };
    });
  }

  private dropSession(session: Session): void {
    session.invalidated = true;
    session.journal.clear();
    this.sessions.delete(session.id);
    if (this.pageSessions.get(session.pageId) === session) this.pageSessions.delete(session.pageId);
  }

  private invalidateSessions(): void {
    for (const session of this.sessions.values()) session.invalidated = true;
    this.sessions.clear();
    this.pageSessions.clear();
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new BrowserError('cancelled', '请求已取消；请先回读已派发动作的结果');
  }
}

function parseProfileMode(value: string | undefined): ProfileMode {
  if (!value) return 'auto_connect';
  if (value === 'auto_connect' || value === 'dedicated' || value === 'isolated') return value;
  throw new Error('RESUME_COMPANION_CHROME_PROFILE_MODE 必须是 auto_connect、dedicated 或 isolated');
}

function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAxNode(value: unknown): value is AxNode {
  return isRecord(value) && typeof value.id === 'string';
}

function extractPages(value: Record<string, unknown>): UpstreamPage[] {
  if (!Array.isArray(value.pages)) return [];
  return value.pages.filter(isRecord).flatMap(page => {
    if (typeof page.id !== 'number' || typeof page.url !== 'string') return [];
    return [{ id: page.id, url: page.url, title: typeof page.title === 'string' ? page.title : '', selected: page.selected === true }];
  });
}

function stripInternal(element: Record<string, unknown>): Record<string, unknown> {
  const { uid: _uid, ...publicElement } = element;
  return publicElement;
}

function isWrite(action: ResolvedActParams['action']): action is LiteralWrite {
  return action.kind === 'set_value' || action.kind === 'set_checked' || action.kind === 'select_option';
}

function intendedValue(write: LiteralWrite, source: NormalizedSnapshot): Scalar {
  if (write.kind === 'set_value') return write.value.literal;
  if (write.kind === 'set_checked') return write.checked;
  if (write.option_ref) return assertSnapshotEntry(source, write.option_ref).public.name;
  return write.option_value ?? '';
}

function scalarToFill(value: Scalar | null): string {
  return typeof value === 'boolean' ? String(value) : value ?? '';
}

function evaluateCondition(condition: Condition, source: NormalizedSnapshot, current: NormalizedSnapshot): { ready: boolean; reason: string } {
  const entry = current.entries.get(condition.ref);
  switch (condition.kind) {
    case 'visible': return { ready: Boolean(entry), reason: entry ? 'visible' : 'waiting' };
    case 'hidden': return { ready: !entry, reason: entry ? 'waiting' : 'hidden' };
    case 'expanded': return { ready: entry?.public.expanded === true, reason: entry?.public.expanded === true ? 'expanded' : 'waiting' };
    case 'value_equals': return { ready: entry?.value === condition.value, reason: entry?.value === condition.value ? 'value_equals' : 'waiting' };
    case 'structure_changed': return { ready: current.signature !== source.signature, reason: current.signature !== source.signature ? 'structure_changed' : 'waiting' };
    case 'options_ready': {
      const options = [...current.entries.values()].filter(candidate => candidate.public.owner_ref === condition.ref && candidate.public.option_ref);
      if (options.length > 0) return { ready: true, reason: 'options_ready' };
      if (entry?.public.expanded === true) return { ready: true, reason: 'empty' };
      return { ready: false, reason: 'waiting' };
    }
    case 'text_present': {
      if (!entry) return { ready: false, reason: 'waiting' };
      const refs = descendantsOf(entry, current);
      const found = [...refs].some(ref => current.entries.get(ref)?.public.name.includes(condition.text));
      return { ready: found, reason: found ? 'text_present' : 'waiting' };
    }
  }
}
