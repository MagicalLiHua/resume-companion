import { AutomationEngine } from './automation/engine';

declare global { interface Window { __resumeCompanionInstalled?: boolean } }

if (!window.__resumeCompanionInstalled) {
  window.__resumeCompanionInstalled = true;
  const automation = new AutomationEngine();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    const fromBridge = message?.codexBridge === true && sender.id === chrome.runtime.id && !sender.tab;
    if (!fromBridge || !['AUTOMATION', 'AUTOMATION_CANCEL', 'PAGE_STATE'].includes(message?.type)) return false;
    const execute = async () => {
      if (message.type === 'AUTOMATION_CANCEL') {
        automation.cancel(message.requestId);
        return { cancelled: true };
      }
      if (message.type === 'PAGE_STATE') return { visibility: document.visibilityState, focused: document.hasFocus() };
      return automation.handle(message.method, message.params, message.epoch, message.requestId);
    };
    execute().then(
      data => respond({ ok: true, data }),
      error => respond({
        ok: false,
        error: error instanceof Error ? error.message : '页面操作失败',
        errorCode: error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
      }),
    );
    return true;
  });
}
