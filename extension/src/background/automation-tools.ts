import { z } from 'zod';
import { canonical, createAutomationSchemas, type ObserveParams } from '../../../plugins/resume-companion/src/protocol';
import type { DebuggerController } from './debugger-controller';

const schemas = createAutomationSchemas(z, { allowSources: false });
export type BridgeContext = { epoch: string; requestId: string; signal: AbortSignal };
type Session = { tabId: number; documentId: string; epoch: string; url: string; touched: number };
const publicError = (error: unknown) => error instanceof Error ? error.message : '页面连接中断';

export class AutomationTools {
  constructor(private readonly debuggerController: DebuggerController) {}

  private sessions = new Map<string, Session>();
  private operations = new Map<string, { signature: string; promise: Promise<any> }>();
  private epoch = '';

  forgetTab(tabId: number) {
    for (const [id, session] of this.sessions) if (session.tabId === tabId) this.sessions.delete(id);
    void this.debuggerController.detach(tabId);
  }

  async pendingMetadata() {
    const stored = await chrome.storage.session.get(null);
    const entries = Object.entries(stored)
      .filter(([key, value]) => key.startsWith('automation_pending_') && value && typeof value === 'object')
      .sort(([, a], [, b]) => Number((b as any).created_at) - Number((a as any).created_at));
    const expired = entries
      .filter(([, value], index) => index >= 200 || Date.now() - Number((value as any).created_at) > 7_200_000)
      .map(([key]) => key);
    if (expired.length) await chrome.storage.session.remove(expired);
    return entries.filter(([key]) => !expired.includes(key)).slice(0, 20).map(([, value]) => value);
  }

  async handle(method: string, raw: unknown, context: BridgeContext) {
    if (this.epoch !== context.epoch) {
      this.sessions.clear();
      this.operations.clear();
      this.epoch = context.epoch;
    }
    if (context.signal.aborted) throw new Error('cancelled: 请求已取消');
    const schema = schemas[method as keyof typeof schemas];
    if (!schema) throw new Error('invalid_request: 未知基础工具');
    const parsed = schema.parse(raw) as any;
    if (method === 'observe') return this.observe(parsed as ObserveParams, context);

    const params = parsed as { session_id: string; operation_id?: string; action?: { kind?: string; effect_kind?: string } };
    const session = this.sessions.get(params.session_id);
    if (!session || session.epoch !== context.epoch || Date.now() - session.touched > 7_200_000) throw new Error('stale: 页面会话已过期，请重新观察');
    session.touched = Date.now();
    const tab = await chrome.tabs.get(session.tabId);
    if (tab.url !== session.url) throw new Error('stale: 页面已导航，请用 tab_id 重新观察');

    const job = async () => {
      if (context.signal.aborted) throw new Error('cancelled: 请求已取消');
      const operationId = params.operation_id;
      const key = `automation_pending_${params.session_id}_${operationId}`;
      if (operationId) await this.pendingMetadata();
      if (operationId) {
        await chrome.storage.session.set({
          [key]: {
            operation_id: operationId,
            session_id: params.session_id,
            tab_id: session.tabId,
            document_id: session.documentId,
            epoch: context.epoch,
            status: 'dispatched_or_unknown',
            created_at: Date.now(),
            kind: params.action?.kind ?? method,
            effect_kind: params.action?.effect_kind,
          },
        });
      }
      try {
        const response = await this.send(session, method, parsed, context);
        if (operationId && !['unknown', 'dispatched'].includes(response.status)) await chrome.storage.session.remove(key);
        return response;
      } catch (error) {
        if (!operationId) throw error;
        if (/^(stale|blocked|invalid_request|operation_conflict|reference_limit):/.test(publicError(error))) {
          await chrome.storage.session.remove(key);
          return {
            operation_id: operationId,
            status: publicError(error).startsWith('stale:') ? 'stale' : 'blocked',
            dispatched: false,
            error: { code: publicError(error).split(':')[0], message: publicError(error) },
          };
        }
        const current = await chrome.tabs.get(session.tabId).catch(() => null);
        const navigation = current && current.url !== session.url;
        return {
          operation_id: operationId,
          status: 'unknown',
          message: publicError(error),
          transition: navigation ? {
            from: session.url,
            to: current.url,
            expected: params.action?.effect_kind === 'advance_step',
            same_origin: new URL(current.url!).origin === new URL(session.url).origin,
            requires_observe: true,
          } : undefined,
          retry: '先重新观察操作结果；不要直接重放未知保存或下一步',
        };
      }
    };

    if (!params.operation_id) return job();
    const id = `${params.session_id}/${params.operation_id}`;
    const signature = canonical(parsed);
    const prior = this.operations.get(id);
    if (prior) {
      if (prior.signature !== signature) throw new Error('operation_conflict: 相同操作 ID 参数不同');
      return prior.promise;
    }
    const promise = job();
    this.operations.set(id, { signature, promise });
    while (this.operations.size > 200) this.operations.delete(this.operations.keys().next().value!);
    return promise;
  }

  private async observe(params: ObserveParams, context: BridgeContext) {
    if (Number(params.tab_id !== undefined) + Number(params.session_id !== undefined) !== 1) throw new Error('invalid_request: observe 需要且仅需要 tab_id 或 session_id');
    let session: Session | undefined;
    if (params.session_id) {
      session = this.sessions.get(params.session_id);
      if (!session || session.epoch !== context.epoch) throw new Error('stale: 页面会话失效，请用 tab_id 重新观察');
    } else {
      const tab = await chrome.tabs.get(params.tab_id!);
      if (!/^https?:\/\//.test(tab.url ?? '')) throw new Error('blocked: 只支持普通 HTTP/HTTPS 网页');
      const injected = await chrome.scripting.executeScript({ target: { tabId: params.tab_id! }, files: ['content.js'] });
      const documentId = injected.find(result => result.frameId === 0)?.documentId;
      if (!documentId) throw new Error('stale: 无法确认文档身份');
      session = { tabId: params.tab_id!, documentId, epoch: context.epoch, url: tab.url!, touched: Date.now() };
    }
    const response = await this.send(session, 'observe', params, context);
    session.url = response.page.url;
    session.touched = Date.now();
    this.sessions.set(response.session_id, session);
    while (this.sessions.size > 50) this.sessions.delete(this.sessions.keys().next().value!);
    return { ...response, page: { ...response.page, tab_id: session.tabId, document_id: session.documentId } };
  }

  private async send(session: Session, method: string, params: unknown, context: BridgeContext) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      void chrome.tabs.sendMessage(session.tabId, { type: 'AUTOMATION_CANCEL', codexBridge: true, requestId: context.requestId }, { documentId: session.documentId }).catch(() => {});
    };
    let abort = () => {};
    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(session.tabId, { type: 'AUTOMATION', codexBridge: true, method, params, epoch: context.epoch, requestId: context.requestId }, { documentId: session.documentId }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { cancel(); reject(new Error('页面响应超时；后续动作已取消')); }, 25_000);
          abort = () => { cancel(); reject(new Error('桥接断开或请求已取消')); };
          context.signal.addEventListener('abort', abort, { once: true });
          if (context.signal.aborted) abort();
        }),
      ]);
      if (!response?.ok) throw new Error(`${response?.errorCode ? `${response.errorCode}: ` : ''}${response?.error ?? '页面没有返回可确认结果'}`);
      return response.data;
    } finally {
      if (timer) clearTimeout(timer);
      context.signal.removeEventListener('abort', abort);
    }
  }
}
