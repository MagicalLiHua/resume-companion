import { CodexTools } from './codex-tools.js';
import { DebuggerController } from './debugger-controller.js';
import { startNativeBridge, type NativeBridgeStatus } from './native-bridge.js';

const debuggerController = new DebuggerController();
const codexTools = new CodexTools(debuggerController);
let bridgeStatus: NativeBridgeStatus = 'disconnected';
let paused = false;

const bridge = startNativeBridge(
  (method, params, context) => codexTools.handle(method, params, context),
  status => { bridgeStatus = status; void updateBadge(status); },
  () => { void debuggerController.detachAll(); scheduleReconnect(); },
);

chrome.runtime.onStartup.addListener(() => { if (!paused) bridge.connect(); });
chrome.runtime.onInstalled.addListener(() => { scheduleReconnect(); if (!paused) bridge.connect(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'resume-companion-reconnect' && !paused) bridge.connect(); });
chrome.tabs.onRemoved.addListener(tabId => { codexTools.forgetTab(tabId); void debuggerController.detach(tabId); });

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'RESUME_COMPANION_WAKE') { if (!paused) bridge.connect(); respond({ ok: true, bridgeStatus, paused }); return false; }
  if (sender.id === chrome.runtime.id && !sender.tab && message?.type === 'RESUME_COMPANION_BRIDGE_STATUS') { respond({ ok: true, bridgeStatus, paused, version: chrome.runtime.getManifest().version }); return false; }
  if (sender.id === chrome.runtime.id && !sender.tab && message?.type === 'RESUME_COMPANION_BRIDGE_RESUME') {
    paused = false; void chrome.storage.local.set({ resumeCompanionBridgePaused: false }); bridge.connect(); respond({ ok: true }); return false;
  }
  if (sender.id === chrome.runtime.id && !sender.tab && message?.type === 'RESUME_COMPANION_BRIDGE_PAUSE') {
    paused = true; void chrome.storage.local.set({ resumeCompanionBridgePaused: true }); bridge.disconnect(); void debuggerController.detachAll(); respond({ ok: true }); return false;
  }
  if (message?.type !== 'RESUME_COMPANION_TRUSTED_INPUT' || !sender.tab?.id || sender.id !== chrome.runtime.id) return false;
  const tabId = sender.tab.id;
  const run = async (): Promise<void> => {
    if (message.action === 'click' && Number.isFinite(message.x) && Number.isFinite(message.y)) return debuggerController.click(tabId, message.x, message.y);
    if (message.action === 'key' && typeof message.key === 'string') return debuggerController.pressKey(tabId, message.key);
    throw new Error('invalid_request: 不支持的可信输入动作');
  };
  run().then(() => respond({ ok: true }), error => respond({ ok: false, error: error instanceof Error ? error.message : '可信输入失败' }));
  return true;
});

function scheduleReconnect(): void {
  void chrome.alarms.create('resume-companion-reconnect', { delayInMinutes: 0.25, periodInMinutes: 0.5 });
}

async function updateBadge(status: NativeBridgeStatus): Promise<void> {
  const text = status === 'connected' ? '●' : '';
  await chrome.action.setBadgeText({ text }).catch(() => undefined);
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' }).catch(() => undefined);
  await chrome.action.setTitle({ title: status === 'connected' ? '简历随行：已连接本地 MCP' : '简历随行：点击重连本地 MCP' }).catch(() => undefined);
}

scheduleReconnect();
void chrome.storage.local.get('resumeCompanionBridgePaused').then(value => {
  paused = value.resumeCompanionBridgePaused === true;
  if (!paused) bridge.connect();
});
