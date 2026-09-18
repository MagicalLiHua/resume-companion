import { z } from 'zod';
import { PROTOCOL_VERSION } from '../../../plugins/resume-companion/src/protocol';
import { AutomationTools, type BridgeContext } from './automation-tools';
import type { DebuggerController } from './debugger-controller';

const ListTabsParams = z.strictObject({
  current_window_only: z.boolean().optional(),
  url_contains: z.string().trim().max(500).optional(),
});
const TabParams = z.strictObject({ tab_id: z.number().int().positive() });

export class CodexTools {
  private readonly automation: AutomationTools;

  constructor(private readonly debuggerController: DebuggerController) {
    this.automation = new AutomationTools(debuggerController);
  }

  async handle(method: string, raw: unknown, context?: BridgeContext) {
    if (method === 'status') return this.status();
    if (method === 'tabs') return this.listTabs(ListTabsParams.parse(raw));
    if (method === 'activate_tab') return this.activateTab(TabParams.parse(raw));
    if (['observe', 'act', 'wait', 'undo_operations'].includes(method)) {
      if (!context) throw new Error('invalid_request: 缺少桥接连接身份');
      return this.automation.handle(method, raw, context);
    }
    throw new Error('invalid_request: 不支持的浏览器工具命令');
  }

  forgetTab(tabId: number) {
    this.automation.forgetTab(tabId);
  }

  private async status() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return {
      connected: true,
      enabled: true,
      extensionVersion: chrome.runtime.getManifest().version,
      capabilities: {
        coreProtocol: PROTOCOL_VERSION,
        continuousForms: true,
        finalSubmit: false,
        trustedEvents: true,
        trustedClickAndKey: true,
        valueWrites: 'dom-setter-with-readback',
        frames: 'top-only',
        shadowDOM: false,
        activateTab: true,
      },
      recentUnconfirmedOperations: await this.automation.pendingMetadata(),
      debuggerAttachedToActiveTab: Boolean(tab?.id && this.debuggerController.isAttached(tab.id)),
      activeTab: tab?.id && /^https?:\/\//.test(tab.url ?? '') ? {
        tabId: tab.id,
        title: tab.title ?? '',
        url: tab.url,
      } : null,
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

  private async activateTab(params: z.infer<typeof TabParams>) {
    const tab = await chrome.tabs.get(params.tab_id);
    if (!tab.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('blocked: 指定标签页不是普通网页');
    const window = await chrome.windows.get(tab.windowId);
    if (window.state === 'minimized') await chrome.windows.update(tab.windowId, { state: 'normal' });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const documentId = injected.find(result => result.frameId === 0)?.documentId;
    if (!documentId) throw new Error('stale: 无法确认目标页面');
    const deadline = Date.now() + 1_800;
    let pageState: { visibility: string; focused: boolean } = { visibility: 'hidden', focused: false };
    do {
      const current = await chrome.tabs.get(tab.id);
      if (current.url !== tab.url || current.windowId !== tab.windowId) throw new Error('stale: 激活期间目标页面已变化，请重新枚举标签页');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'PAGE_STATE', codexBridge: true }, { documentId });
      if (!response?.ok) throw new Error('bridge_error: 页面没有返回可见状态');
      pageState = response.data;
      if (pageState.visibility === 'visible') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      status: pageState.visibility === 'visible' ? 'visible' : 'hidden',
      pageState,
      note: pageState.visibility === 'visible' ? '页面已可见，可以继续观察' : '已请求激活，但页面仍不可见',
    };
  }
}
