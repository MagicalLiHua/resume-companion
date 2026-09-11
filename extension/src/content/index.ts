import { FormEngine } from './engine';
import { trustedPage } from '../domain/types';
import {armJournal,readJobMetadata,installJournal} from './journal';
import {installWidget,isWidgetSender,setWidgetVisible} from './widget';

declare global { interface Window { __resumeCompanionInstalled?: boolean } }
if (!window.__resumeCompanionInstalled) {
  window.__resumeCompanionInstalled = true;
  const engine = new FormEngine();
  installWidget();installJournal();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if(message?.type==='WIDGET_VISIBILITY'&&sender.id===chrome.runtime.id&&!sender.tab){setWidgetVisible(message.enabled===true);respond({ok:true});return false;}
    const codexBridge=message?.codexBridge===true&&sender.id===chrome.runtime.id&&!sender.tab;
    if (!message || (!trustedPage(sender)&&!isWidgetSender(sender,message)&&!codexBridge) || !['SCAN', 'FILL', 'UNDO', 'FOCUS', 'VALIDATE', 'VERIFY', 'JOURNAL_ARM', 'JOB_METADATA'].includes(message.type)) return false;
    (async () => {
      switch (message.type) {
        case 'SCAN': return engine.scan();
        case 'FILL': return engine.fill(message);
        case 'UNDO': return engine.undo(message);
        case 'FOCUS': return engine.focus(message);
        case 'VALIDATE': return engine.validate(message);
        case 'VERIFY': return engine.verify(message);
        case 'JOURNAL_ARM': return armJournal(message.sessionKey);
        case 'JOB_METADATA': return readJobMetadata();
      }
    })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : '页面操作失败' }));
    return true;
  });
}
