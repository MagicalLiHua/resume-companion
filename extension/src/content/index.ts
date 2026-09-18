import { FormEngine } from './engine';
import { AutomationEngine } from './automation/engine';
import { documentLock } from './automation/lock';
import { trustedPage } from '../domain/types';
import {armJournal,readJobMetadata,installJournal} from './journal';
import {installWidget,isWidgetSender,setWidgetVisible} from './widget';
import {inspectForm} from './diagnostics';
import {openBankcommSection} from './bankcomm-actions';

declare global { interface Window { __resumeCompanionInstalled?: boolean } }
if (!window.__resumeCompanionInstalled) {
  window.__resumeCompanionInstalled = true;
  const engine = new FormEngine();
  const automation = new AutomationEngine();
  installWidget();installJournal();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if(message?.type==='WIDGET_VISIBILITY'&&sender.id===chrome.runtime.id&&!sender.tab){setWidgetVisible(message.enabled===true);respond({ok:true});return false;}
    const codexBridge=message?.codexBridge===true&&sender.id===chrome.runtime.id&&!sender.tab;
    if (!message || (!trustedPage(sender)&&!isWidgetSender(sender,message)&&!codexBridge) || !['SCAN', 'FILL', 'UNDO', 'FOCUS', 'VALIDATE', 'VERIFY', 'JOURNAL_ARM', 'JOB_METADATA', 'INSPECT', 'OPEN_SECTION', 'OPTIONS', 'PAGE_STATE', 'AUTOMATION', 'AUTOMATION_CANCEL'].includes(message.type)) return false;
    const execute = async () => {
      switch (message.type) {
        case 'AUTOMATION_CANCEL': if (!codexBridge) throw new Error('仅本地桥接可用'); automation.cancel(message.requestId); return {cancelled:true};
        case 'AUTOMATION': if (!codexBridge) throw new Error('仅本地桥接可用'); return automation.handle(message.method,message.params,message.epoch,message.requestId);
        case 'PAGE_STATE': return { visibility: document.visibilityState, focused: document.hasFocus() };
        case 'INSPECT': return inspectForm();
        case 'OPEN_SECTION': return openBankcommSection(message.label);
        case 'OPTIONS': return engine.options(message);
        case 'SCAN': return engine.scan();
        case 'FILL': return engine.fill(message);
        case 'UNDO': return engine.undo(message);
        case 'FOCUS': return engine.focus(message);
        case 'VALIDATE': return engine.validate(message);
        case 'VERIFY': return engine.verify(message);
        case 'JOURNAL_ARM': return armJournal(message.sessionKey);
        case 'JOB_METADATA': return readJobMetadata();
      }
    };
    const pending = ['AUTOMATION','AUTOMATION_CANCEL','PAGE_STATE'].includes(message.type) ? execute() : documentLock.run('legacy', execute);
    pending.then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : '页面操作失败', errorCode: error && typeof error==='object' && 'code' in error ? String(error.code) : undefined }));
    return true;
  });
}
