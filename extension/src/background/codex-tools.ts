import {AutomationTools, type BridgeContext} from './automation-tools';
import { z } from 'zod';
import { proposedValue, sourceCompatible, sources, suggestSource, type Source } from '../domain/rules';
import type { Profile } from '../domain/profile';
import type { Field, FieldResult, Snapshot, Value } from '../domain/types';
import type { LocalState } from '../domain/state';
import {bankcommSections} from '../content/bankcomm-actions';

const MAX_BATCH_TABS = 20;
const MAX_SESSIONS = 50;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const VersionId = z.string().max(100).optional();
const ListTabsParams = z.strictObject({
  current_window_only: z.boolean().optional(),
  url_contains: z.string().trim().max(500).optional(),
});
const ScanParams = z.strictObject({ version_id: VersionId });
const InspectParams = z.strictObject({ tab_id: z.number().int().positive() });
const OpenSectionParams = z.strictObject({ tab_id: z.number().int().positive(), label: z.enum(bankcommSections) });
const ScanTabsParams = z.strictObject({
  tab_ids: z.array(z.number().int().positive()).min(1).max(MAX_BATCH_TABS),
  version_id: VersionId,
});
const FillField = z.strictObject({
  field_id: z.string().min(1).max(100),
  use_suggestion: z.boolean().optional(),
  source_ref: z.string().max(240).optional(),
  value: z.union([z.string().max(10_000), z.boolean()]).optional(),
  overwrite: z.boolean().optional(),
}).refine(item => Number(item.use_suggestion === true) + Number(item.source_ref !== undefined) + Number(item.value !== undefined) === 1, {
  message: '每个字段必须且只能使用本地建议、候选资料来源或明确值之一',
});
const FillParams = z.strictObject({
  session_id: z.string().min(1).max(100),
  fields: z.array(FillField).min(1).max(300),
});
const FillBatchParams = z.strictObject({ plans: z.array(FillParams).min(1).max(MAX_BATCH_TABS) });
const SessionParams = z.strictObject({ session_id: z.string().min(1).max(100) });
const OptionsParams = SessionParams.extend({ field_id: z.string().min(1).max(100), query: z.string().max(120).optional(), path: z.array(z.string().trim().min(1).max(120)).min(1).max(6).optional() });
const SessionBatchParams = z.strictObject({
  session_ids: z.array(z.string().min(1).max(100)).min(1).max(MAX_BATCH_TABS),
});

type LoadState = () => Promise<LocalState>;
type ChosenProfile = { profile: Profile; versionId: string; versionName: string };
type Planned = { field: Field; suggestion?: { source: Source; value: Value; reason: string }; sources: Source[] };
type ActiveSession = {
  tabId: number;
  windowId: number;
  documentId: string;
  title: string;
  snapshot: Snapshot;
  profileRevision: number;
  versionId: string;
  planned: Map<string, Planned>;
  filled: boolean;
  createdAt: number;
};

const hasValue = (value: Value | null) => value !== null && value !== '' && value !== false;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '插件执行失败';
const unique = <T>(items: T[], label: string) => {
  if (new Set(items).size !== items.length) throw new Error(`${label}包含重复项`);
};
const send = async <T>(tabId: number, documentId: string, message: Record<string, unknown>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { ...message, codexBridge: true }, { documentId }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('页面响应中断或超时，请检查页面后重新扫描；不要直接重试旧填写计划')), ['FILL','UNDO'].includes(String(message.type)) ? 30_000 : message.type === 'OPTIONS' ? 16_000 : 5_000); }),
    ]);
    if (!response?.ok) throw new Error(response?.error ?? '网页没有响应，请重新扫描');
    return response.data as T;
  } finally { if (timer !== undefined) clearTimeout(timer); }
};

export class CodexTools {
  private readonly sessions = new Map<string, ActiveSession>();

  private readonly automation: AutomationTools;
  constructor(private readonly loadState: LoadState) {this.automation = new AutomationTools(loadState);}

  async handle(method: string, raw: unknown, context?: BridgeContext) {
    if (method === 'status') return this.status();
    const state = await this.loadState();
    if (!state.preferences.codexBridgeEnabled) throw new Error('Codex 桥接尚未开启。请在简历随行设置页中显式开启后重试。');
    if (['read_profile','observe','act','wait','undo_operations'].includes(method)) { if (!context) throw new Error('缺少桥接连接身份'); return this.automation.handle(method,raw,context); }
    if (method === 'tabs') return this.listTabs(ListTabsParams.parse(raw));
    if (method === 'activate_tab') return this.activateTab(InspectParams.parse(raw));
    if (method === 'inspect') return this.inspect(InspectParams.parse(raw));
    if (method === 'open_section') {
      const params = OpenSectionParams.parse(raw);
      this.forgetTab(params.tab_id);
      return this.inspect(params, { type: 'OPEN_SECTION', label: params.label });
    }
    if (method === 'scan') return this.scanCurrent(state, ScanParams.parse(raw));
    if (method === 'scan_batch') return this.scanBatch(state, ScanTabsParams.parse(raw));
    if (method === 'fill') return this.fill(FillParams.parse(raw));
    if (method === 'fill_batch') return this.fillBatch(FillBatchParams.parse(raw));
    if (method === 'verify') return this.verify(SessionParams.parse(raw));
    if (method === 'options') {
      const params = OptionsParams.parse(raw), session = this.assertSession(params.session_id);
      await this.assertPage(session);
      return send(session.tabId, session.documentId, { type: 'OPTIONS', sessionId: params.session_id, pageToken: session.snapshot.pageToken, fieldId: params.field_id, query: params.query, path: params.path });
    }
    if (method === 'verify_batch') return this.verifyBatch(SessionBatchParams.parse(raw));
    if (method === 'undo') return this.undo(SessionParams.parse(raw));
    if (method === 'undo_batch') return this.undoBatch(SessionBatchParams.parse(raw));
    throw new Error('不支持的 Codex 工具命令');
  }

  forgetTab(tabId: number) {
    this.automation.forgetTab(tabId);
    for (const [sessionId, session] of this.sessions) if (session.tabId === tabId) this.sessions.delete(sessionId);
  }

  private async activateTab(params: z.infer<typeof InspectParams>) {
    const tab = await chrome.tabs.get(params.tab_id);
    if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('指定标签页不是普通网页');
    const window = await chrome.windows.get(tab.windowId);
    if (window.state === 'minimized') await chrome.windows.update(tab.windowId, { state: 'normal' });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    // Activation is a request to Chrome, not proof that the OS made the page visible.
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const documentId = injected.find(result => result.frameId === 0)?.documentId;
    if (!documentId) throw new Error('无法确认目标页面');
    const deadline = Date.now() + 1800;
    let pageState: { visibility: string; focused: boolean };
    do {
      const current = await chrome.tabs.get(tab.id);
      if (current.url !== tab.url || current.windowId !== tab.windowId) throw new Error('激活期间目标页面已变化，请重新枚举标签页');
      pageState = await send(tab.id, documentId, { type: 'PAGE_STATE' });
      if (pageState.visibility === 'visible') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return { tabId: tab.id, windowId: tab.windowId, status: pageState.visibility === 'visible' ? 'visible' : 'hidden', pageState,
      note: pageState.visibility === 'visible' ? '页面已可见，可以继续查询控件' : '已请求激活，但页面仍不可见；请检查所在桌面、遮挡或锁屏状态' };
  }

  private async inspect(params: z.infer<typeof InspectParams>, message: Record<string, unknown> = { type: 'INSPECT' }) {
    const tab = await chrome.tabs.get(params.tab_id);
    if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('指定标签页不是普通网页');
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const documentId = injected.find(result => result.frameId === 0)?.documentId;
    if (!documentId) throw new Error('无法确认目标页面');
    return send(tab.id, documentId, message);
  }

  private pruneSessions() {
    const expiredBefore = Date.now() - SESSION_TTL_MS;
    for (const [sessionId, session] of this.sessions) if (session.createdAt < expiredBefore) this.sessions.delete(sessionId);
    while (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as string);
  }

  private async status() {
    this.pruneSessions();
    const state = await this.loadState();
    if (!state.preferences.codexBridgeEnabled) {
      return { connected: true, enabled: false, extensionVersion: chrome.runtime.getManifest().version, message: '请先在插件设置页开启 Codex 桥接' };
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      connected: true,
      enabled: true,
      extensionVersion: chrome.runtime.getManifest().version,
      batchSupported: true,
      capabilities: { coreProtocol:'1.0', coreTools:true, continuousForms:true, finalSubmit:false, trustedEvents:false, frames:'top-only', shadowDOM:false, activateTab: true, dynamicOptions: { search: true, cascadePath: true, statuses: ['ready', 'empty', 'timeout'] } },
      activeSessions: this.sessions.size,
      recentUnconfirmedOperations: await this.automation.pendingMetadata(),
      activeTab: tab?.id && /^https?:\/\//.test(tab.url ?? '') ? { tabId: tab.id, title: tab.title ?? '', url: tab.url } : null,
      versions: state.versions.map(version => ({ id: version.id, name: version.name, active: version.id === state.activeVersionId })),
      hasProfile: Boolean(state.current),
    };
  }

  private async listTabs(params: z.infer<typeof ListTabsParams>) {
    const currentWindowOnly = params.current_window_only !== false;
    const needle = params.url_contains?.toLocaleLowerCase();
    const queried = await chrome.tabs.query(currentWindowOnly ? { currentWindow: true } : {});
    const matching = queried.filter(tab => {
      if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) return false;
      return !needle || `${tab.title ?? ''}\n${tab.url}`.toLocaleLowerCase().includes(needle);
    });
    const tabs = matching.slice(0, 100).map(tab => ({
      tabId: tab.id!,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
      title: tab.title ?? '',
      url: tab.url!,
    }));
    return { currentWindowOnly, total: matching.length, truncated: matching.length > tabs.length, tabs };
  }

  private profileFor(state: LocalState, versionId?: string): ChosenProfile {
    if (versionId) {
      const version = state.versions.find(item => item.id === versionId);
      if (!version) throw new Error('指定的简历版本不存在，请重新检查状态');
      return { profile: version.current.profile, versionId: version.id, versionName: version.name };
    }
    const version = state.versions.find(item => item.id === state.activeVersionId);
    if (version) return { profile: version.current.profile, versionId: version.id, versionName: version.name };
    if (state.current) return { profile: state.current.profile, versionId: state.current.profile.profile_id, versionName: '当前简历' };
    throw new Error('还没有保存正式简历，请先在插件设置页保存资料');
  }

  private async scanCurrent(state: LocalState, params: z.infer<typeof ScanParams>) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Chrome 当前窗口没有可扫描的活动标签页');
    return this.scanTab(this.profileFor(state, params.version_id), tab.id);
  }

  private async scanBatch(state: LocalState, params: z.infer<typeof ScanTabsParams>) {
    unique(params.tab_ids, '标签页列表');
    const chosen = this.profileFor(state, params.version_id);
    const results = [];
    for (const tabId of params.tab_ids) {
      try { results.push({ ok: true, ...(await this.scanTab(chosen, tabId)) }); }
      catch (error) { results.push({ ok: false, tabId, error: errorMessage(error) }); }
    }
    return { summary: { requested: params.tab_ids.length, scanned: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length }, results };
  }

  private async scanTab(chosen: ChosenProfile, tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('指定标签页不是普通 HTTP/HTTPS 网页');
    const injected = await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const documentId = injected.find(result => result.frameId === 0)?.documentId;
    if (!documentId) throw new Error('无法确认目标页面，请更新 Chrome 后重试');
    const snapshot = await send<Snapshot>(tabId, documentId, { type: 'SCAN' });
    const allSources = sources(chosen.profile);
    const planned = new Map<string, Planned>();
    let suggested = 0, unresolved = 0, blocked = 0, protectedCount = 0;

    const fields = snapshot.fields.map(field => {
      const compatible = allSources.filter(source => sourceCompatible(field, source, {}));
      const source = suggestSource(field, allSources, {});
      const proposal = proposedValue(field, source);
      const suggestion = source && proposal.value !== null ? { source, value: proposal.value, reason: proposal.reason } : undefined;
      planned.set(field.id, { field, suggestion, sources: compatible });
      if (field.blocked) blocked++;
      else if (!suggestion) unresolved++;
      else if (hasValue(field.currentValue)) protectedCount++;
      else suggested++;
      return {
        fieldId: field.id,
        label: field.label,
        groupLabel: field.groupLabel,
        section: field.section,
        kind: field.kind,
        required: field.required,
        currentValue: field.currentValue,
        blocked: field.blocked,
        options: field.options,
        suggestion: suggestion ? {
          sourceRef: suggestion.source.ref,
          sourceLabel: suggestion.source.definition.label,
          recordTitle: suggestion.source.recordTitle ?? null,
          value: suggestion.value,
          reason: suggestion.reason,
          requiresOverwrite: hasValue(field.currentValue),
        } : null,
        candidates: suggestion ? [] : compatible.slice(0, 20).map(candidate => ({
          sourceRef: candidate.ref,
          sourceLabel: candidate.definition.label,
          recordTitle: candidate.recordTitle ?? null,
          value: candidate.value,
        })),
        candidatesTruncated: !suggestion && compatible.length > 20,
      };
    });

    for (const [oldId, old] of this.sessions) if (old.tabId === tabId) this.sessions.delete(oldId);
    this.sessions.set(snapshot.sessionId, {
      tabId,
      windowId: tab.windowId,
      documentId,
      title: tab.title ?? '',
      snapshot,
      profileRevision: chosen.profile.revision,
      versionId: chosen.versionId,
      planned,
      filled: false,
      createdAt: Date.now(),
    });
    this.pruneSessions();
    return {
      sessionId: snapshot.sessionId,
      tab: { tabId, windowId: tab.windowId, title: tab.title ?? '', url: snapshot.url, active: tab.active },
      version: { id: chosen.versionId, name: chosen.versionName, revision: chosen.profile.revision },
      summary: { total: fields.length, suggested, unresolved, blocked, protected: protectedCount },
      notices: snapshot.notices,
      fields,
    };
  }

  private assertSession(sessionId: string) {
    this.pruneSessions();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('扫描会话已失效，请重新扫描对应标签页');
    return session;
  }

  private page(session: ActiveSession) {
    return { tabId: session.tabId, windowId: session.windowId, title: session.title, url: session.snapshot.url };
  }

  private async assertPage(session: ActiveSession) {
    let tab: chrome.tabs.Tab;
    try { tab = await chrome.tabs.get(session.tabId); } catch { throw new Error('目标标签页已关闭，请重新枚举标签页'); }
    if (tab.url !== session.snapshot.url) throw new Error('目标标签页已经导航到其他页面，请重新扫描');
    const state = await this.loadState();
    const current = this.profileFor(state, session.versionId).profile;
    if (current.revision !== session.profileRevision) throw new Error('简历版本已经更新，请重新扫描');
  }

  private operations(session: ActiveSession, fields: z.infer<typeof FillParams>['fields']) {
    const ids = new Set<string>();
    return fields.map(input => {
      if (ids.has(input.field_id)) throw new Error('填写计划含重复字段');
      ids.add(input.field_id);
      const planned = session.planned.get(input.field_id);
      if (!planned || planned.field.blocked) throw new Error('填写计划包含不存在或受限字段');
      if (hasValue(planned.field.currentValue) && input.overwrite !== true) throw new Error(`字段“${planned.field.label}”已有内容，必须显式允许覆盖`);

      let value: Value | null = null;
      if (input.use_suggestion) value = planned.suggestion?.value ?? null;
      else if (input.source_ref) {
        const source = planned.sources.find(candidate => candidate.ref === input.source_ref);
        if (!source) throw new Error(`字段“${planned.field.label}”的资料来源无效`);
        value = proposedValue(planned.field, source).value;
      } else value = input.value ?? null;
      if (value === null || value === '') throw new Error(`字段“${planned.field.label}”没有可填写的有效值`);
      return { fieldId: planned.field.id, value, expectedValue: planned.field.currentValue ?? (planned.field.kind === 'checkbox' ? false : '') };
    });
  }

  private async fill(params: z.infer<typeof FillParams>) {
    const session = this.assertSession(params.session_id);
    if (session.filled) throw new Error('这个扫描会话已经执行过填写；如需继续，请先撤销或重新扫描');
    await this.assertPage(session);
    const results = await send<FieldResult[]>(session.tabId, session.documentId, {
      type: 'FILL',
      sessionId: session.snapshot.sessionId,
      pageToken: session.snapshot.pageToken,
      operationId: crypto.randomUUID(),
      operations: this.operations(session, params.fields),
    });
    session.filled = results.some(result => result.status === 'filled');
    return { sessionId: params.session_id, page: this.page(session), results: this.labelResults(session, results) };
  }

  private async fillBatch(params: z.infer<typeof FillBatchParams>) {
    unique(params.plans.map(plan => plan.session_id), '批量填写计划');
    const results = [];
    for (const plan of params.plans) {
      try { results.push({ ok: true, ...(await this.fill(plan)) }); }
      catch (error) { results.push({ ok: false, sessionId: plan.session_id, error: errorMessage(error) }); }
    }
    return this.batchResult(results);
  }

  private async verify(params: z.infer<typeof SessionParams>) {
    const session = this.assertSession(params.session_id);
    await this.assertPage(session);
    if (!session.filled) throw new Error('当前会话还没有成功填写的字段');
    const results = await send<FieldResult[]>(session.tabId, session.documentId, { type: 'VERIFY', sessionId: session.snapshot.sessionId, pageToken: session.snapshot.pageToken });
    return { sessionId: params.session_id, page: this.page(session), results: this.labelResults(session, results) };
  }

  private async verifyBatch(params: z.infer<typeof SessionBatchParams>) {
    unique(params.session_ids, '会话列表');
    const results = [];
    for (const sessionId of params.session_ids) {
      try { results.push({ ok: true, ...(await this.verify({ session_id: sessionId })) }); }
      catch (error) { results.push({ ok: false, sessionId, error: errorMessage(error) }); }
    }
    return this.batchResult(results);
  }

  private async undo(params: z.infer<typeof SessionParams>) {
    const session = this.assertSession(params.session_id);
    await this.assertPage(session);
    if (!session.filled) throw new Error('当前会话没有可撤销的填写');
    const results = await send<FieldResult[]>(session.tabId, session.documentId, { type: 'UNDO', sessionId: session.snapshot.sessionId, pageToken: session.snapshot.pageToken });
    session.filled = false;
    return { sessionId: params.session_id, page: this.page(session), results: this.labelResults(session, results) };
  }

  private async undoBatch(params: z.infer<typeof SessionBatchParams>) {
    unique(params.session_ids, '会话列表');
    const results = [];
    for (const sessionId of params.session_ids) {
      try { results.push({ ok: true, ...(await this.undo({ session_id: sessionId })) }); }
      catch (error) { results.push({ ok: false, sessionId, error: errorMessage(error) }); }
    }
    return this.batchResult(results);
  }

  private labelResults(session: ActiveSession, results: FieldResult[]) {
    return results.map(result => ({ ...result, label: session.planned.get(result.fieldId)?.field.label ?? result.fieldId }));
  }

  private batchResult<T extends { ok: boolean }>(results: T[]) {
    return { summary: { requested: results.length, completed: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length }, results };
  }
}
