import { z } from 'zod';
import { canonical, createAutomationSchemas, type ActParams, type ObserveParams, type ProfileParams, type SourceValue, type Write } from '../../../plugins/resume-companion/protocol';
import type { LocalState } from '../domain/state';
import { blockedLabel, sources } from '../domain/rules';
const schemas = createAutomationSchemas(z);
export type BridgeContext = { epoch: string; requestId: string; signal: AbortSignal };
type Session = { tabId: number; documentId: string; epoch: string; url: string; touched: number };
const publicError = (error: unknown) => error instanceof Error ? error.message : '页面连接中断';
export class AutomationTools {
  private sessions = new Map<string, Session>();
  private operations = new Map<string, { signature: string; promise: Promise<any> }>();
  private cursors = new Map<string, { key: string; offset: number }>();
  private epoch = '';
  constructor(private readonly loadState: () => Promise<LocalState>) {}
  forgetTab(tabId: number) { for (const [id, s] of this.sessions) if (s.tabId === tabId) this.sessions.delete(id); }
  async pendingMetadata() {
    const stored = await chrome.storage.session.get(null);
    const entries = Object.entries(stored).filter(([key,value])=>key.startsWith('automation_pending_') && value && typeof value === 'object').sort(([,a],[,b])=>Number((b as any).created_at)-Number((a as any).created_at));
    const expired = entries.filter(([,v],index)=>index>=200 || Date.now()-Number((v as any).created_at)>7200000).map(([key])=>key);
    if(expired.length)await chrome.storage.session.remove(expired);
    return entries.filter(([key])=>!expired.includes(key)).slice(0,20).map(([,value])=>value);
  }
  private version(state: LocalState, id: string) {
    const version = state.versions.find(v => v.id === id);
    if (!version) throw new Error('profile_missing: 指定的正式简历版本不存在');
    return version;
  }
  private profileRows(state: LocalState, params: ProfileParams) {
    const version = this.version(state, params.version_id), profile = version.current.profile;
    const mapped = new Map(sources(profile).map(s => [s.ref, s]));
    const rows: Record<string, any>[] = [];
    for (const section of ['basic','education','experience','projects','skills','certificates','custom_answers','supplemental_fields'] as const) {
      if (params.section && section !== params.section) continue;
      const value = profile[section];
      if (!params.section && !params.source_refs) {
        rows.push({ section, records: Array.isArray(value) ? value.length : 1, available_fields: section === 'basic' ? Object.keys(value) : undefined }); continue;
      }
      const push = (ref: string, raw: unknown, recordId?: string, field?: string) => {
        if (params.source_refs && !params.source_refs.includes(ref)) return;
        const info = mapped.get(ref), label = info?.definition.label ?? field ?? section;
        if (blockedLabel(label)) return;
        const metadata = recordId && field ? version.current.fieldMetadata[`${recordId}.${field}`] : undefined;
        rows.push({ source_ref: ref, section, record_id: recordId, field, label, value: raw, display_value: raw === null ? null : info?.value ?? raw, unknown: raw === null, metadata: metadata ?? null });
      };
      if (section === 'basic') for (const [key, val] of Object.entries(profile.basic)) push(`basic/${key}`, val, undefined, key);
      else if (section === 'skills') push('skills', profile.skills);
      else for (const record of profile[section]) {
        if (params.record_id && record.id !== params.record_id) continue;
        if (section === 'custom_answers') { push(`${section}/${record.id}`, (record as {text:string}).text, record.id, 'text'); continue; }
        if (section === 'supplemental_fields') { const f = record as any; if (!blockedLabel(f.label)) push(`${section}/${f.id}`, f.value, f.id, 'value'); continue; }
        for (const [key, val] of Object.entries(record)) if (key !== 'id') push(`${section}/${record.id}/${key}`, val, record.id, key);
      }
    }
    if (params.source_refs && params.source_refs.some(ref => !rows.some(r => r.source_ref === ref))) throw new Error('source_missing: 某个来源不存在或属于受限字段');
    return { version, rows };
  }
  private async profile(raw: unknown) {
    const params = schemas.read_profile.parse(raw) as ProfileParams, state = await this.loadState(), { version, rows } = this.profileRows(state, params);
    if (params.record_id && !params.section) throw new Error('record_id 需要同时指定 section');
    const key = canonical([version.id, version.current.profile.revision, params.section, params.record_id, params.source_refs]);
    const cursor = params.cursor ? this.cursors.get(params.cursor) : undefined;
    if (params.cursor && (!cursor || cursor.key !== key)) throw new Error('stale_cursor: 资料已更新或分页条件不一致');
    const offset = cursor?.offset ?? 0, entries: Record<string, any>[] = [], result: Record<string, any> = { version_id: version.id, version_name: version.name, profile_revision: version.current.profile.revision, directory: !params.section && !params.source_refs, total: rows.length, offset, entries };
    for (const row of rows.slice(offset, offset + (params.limit ?? 30))) {
      entries.push(row);
      if (new TextEncoder().encode(JSON.stringify(result)).length > 11000) { entries.pop(); break; }
    }
    if (!entries.length && offset < rows.length) {
      // A single long fact is returned as a bounded excerpt, never a partial source silently treated as whole.
      const row = rows[offset]; entries.push({ ...row, value: canonical(row.value).slice(0, 2400), display_value: undefined, truncated: true });
    }
    result.truncated = offset + entries.length < rows.length;
    if (result.truncated) { const id = crypto.randomUUID(); this.cursors.set(id, { key, offset: offset + entries.length }); result.next_cursor = id; while (this.cursors.size > 100) this.cursors.delete(this.cursors.keys().next().value!); }
    return result;
  }
  private async resolveValues(params: ActParams) {
    const result = structuredClone(params), state = await this.loadState();
    const resolve = (value: SourceValue): SourceValue => {
      if ('literal' in value) return value;
      const source = value.source, version = this.version(state, source.version_id);
      if (version.current.profile.revision !== source.profile_revision) throw new Error('profile_changed: 正式简历已更新，请重新读取');
      const { rows } = this.profileRows(state, { version_id: source.version_id, source_refs: [source.source_ref] });
      const row = rows[0];
      if (row.value === null) throw new Error('source_unknown: 资料未提供该事实，不自动编造');
      const resolved = row.display_value;
      if (typeof resolved !== 'string' && typeof resolved !== 'boolean') throw new Error('source_type: 来源不是单个可填写值，请读取后明确选择');
      if (typeof resolved === 'string' && resolved.length > 10000) throw new Error('source_too_long: 来源内容超过单次填写上限');
      return { literal: resolved };
    };
    const write = (action: Write) => { if (action.kind === 'set_value') action.value = resolve(action.value); };
    if (result.action.kind === 'set_values') result.action.items.forEach(write);
    else if (result.action.kind === 'set_value') write(result.action);
    return result;
  }
  async handle(method: string, raw: unknown, context: BridgeContext) {
    if (this.epoch !== context.epoch) { this.sessions.clear(); this.operations.clear(); this.epoch = context.epoch; }
    if (context.signal.aborted) throw new Error('cancelled: 请求已取消');
    if (method === 'read_profile') return this.profile(raw);
    const parsed = schemas[method as keyof typeof schemas]?.parse(raw);
    if (!parsed) throw new Error('未知基础工具');
    if (method === 'observe') return this.observe(parsed, context);
    const params = parsed as { session_id: string; operation_id?: string }, session = this.sessions.get(params.session_id);
    if (!session || session.epoch !== context.epoch || Date.now() - session.touched > 7200000) throw new Error('stale: 页面会话已过期，请重新观察');
    session.touched = Date.now();
    const tab = await chrome.tabs.get(session.tabId);
    if (tab.url !== session.url) throw new Error('stale: 页面已导航，请用 tab_id 重新观察');
    const job = async () => {
      let input = parsed;
      if (method === 'act') input = await this.resolveValues(parsed);
      if (context.signal.aborted) throw new Error('cancelled: 请求已取消');
      const opId = params.operation_id, key = `automation_pending_${params.session_id}_${opId}`;
      if (opId) await this.pendingMetadata();
      if (opId) await chrome.storage.session.set({ [key]: { operation_id: opId, session_id: params.session_id, tab_id: session.tabId, document_id: session.documentId, epoch: context.epoch, status: 'dispatched_or_unknown', created_at: Date.now(), kind: input.action?.kind ?? method, effect_kind: input.action?.effect_kind } });
      try {
        const response = await this.send(session, method, input, context);
        if (opId && !['unknown','dispatched'].includes(response.status)) await chrome.storage.session.remove(key);
        return response;
      } catch (error) {
        if (!opId) throw error;
        if (/^(stale|blocked|invalid_request|operation_conflict|reference_limit):/.test(publicError(error))) {await chrome.storage.session.remove(key);return {operation_id:opId,status:publicError(error).startsWith('stale:')?'stale':'blocked',dispatched:false,error:{code:publicError(error).split(':')[0],message:publicError(error)}};}
        const current = await chrome.tabs.get(session.tabId).catch(() => null);
        const navigation = current && current.url !== session.url;
        return { operation_id: opId, status: 'unknown', message: publicError(error), transition: navigation ? { from: session.url, to: current.url, expected: input.action?.effect_kind === 'advance_step', same_origin: new URL(current.url!).origin === new URL(session.url).origin, requires_observe: true } : undefined, retry: '先重新观察操作结果；不要直接重放未知保存或下一步' };
      }
    };
    if (!params.operation_id) return job();
    const id = `${params.session_id}/${params.operation_id}`, signature = canonical(parsed), prior = this.operations.get(id);
    if (prior) { if (prior.signature !== signature) throw new Error('operation_conflict: 相同操作 ID 参数不同'); return prior.promise; }
    const promise = job(); this.operations.set(id, { signature, promise });
    while (this.operations.size > 200) this.operations.delete(this.operations.keys().next().value!);
    return promise;
  }
  private async observe(params: ObserveParams, context: BridgeContext) {
    if (Number(params.tab_id !== undefined) + Number(params.session_id !== undefined) !== 1) throw new Error('observe 需要且仅需要 tab_id 或 session_id');
    let session: Session | undefined;
    if (params.session_id) { session = this.sessions.get(params.session_id); if (!session || session.epoch !== context.epoch) throw new Error('stale: 页面会话失效，请用 tab_id 重新观察'); }
    else {
      const tab = await chrome.tabs.get(params.tab_id!);
      if (!/^https?:\/\//.test(tab.url ?? '')) throw new Error('只支持普通 HTTP/HTTPS 网页');
      const injected = await chrome.scripting.executeScript({ target: { tabId: params.tab_id! }, files: ['content.js'] });
      const documentId = injected.find(r => r.frameId === 0)?.documentId;
      if (!documentId) throw new Error('无法确认文档身份');
      session = { tabId: params.tab_id!, documentId, epoch: context.epoch, url: tab.url!, touched: Date.now() };
    }
    const response = await this.send(session, 'observe', params, context);
    session.url = response.page.url; session.touched = Date.now(); this.sessions.set(response.session_id, session);
    while (this.sessions.size > 50) this.sessions.delete(this.sessions.keys().next().value!);
    return { ...response, page: { ...response.page, tab_id: session.tabId, document_id: session.documentId } };
  }
  private async send(session: Session, method: string, params: unknown, context: BridgeContext) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { void chrome.tabs.sendMessage(session.tabId, { type: 'AUTOMATION_CANCEL', codexBridge: true, requestId: context.requestId }, { documentId: session.documentId }).catch(() => {}); };
    let abort!: () => void;
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(session.tabId, { type: 'AUTOMATION', codexBridge: true, method, params, epoch: context.epoch, requestId: context.requestId }, { documentId: session.documentId }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { cancel(); reject(new Error('页面响应超时；后续动作已取消')); }, 25000); abort = () => { cancel(); reject(new Error('桥接断开或请求已取消')); }; context.signal.addEventListener('abort', abort, { once: true }); if (context.signal.aborted) abort(); }),
      ]);
      if (!response?.ok) throw new Error(`${response?.errorCode ? response.errorCode+': ' : ''}${response?.error ?? '页面没有返回可确认结果'}`);
      return response.data;
    } finally { if (timer) clearTimeout(timer); context.signal.removeEventListener('abort', abort); }
  }
}
