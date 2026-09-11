export type Section = 'basic' | 'education' | 'experience' | 'projects' | 'skills' | 'custom_answers' | 'supplemental_fields' | 'other';
export type Value = string | boolean;
export interface Field {
  id: string; label: string; kind: string; groupId: string; groupLabel: string; section: Section;
  currentValue: Value | null; options: { label: string; value: string }[];
  maxLength: number; required: boolean; blocked: string | null;
}
export interface Snapshot { sessionId: string; pageToken: string; url: string; fields: Field[]; notices: string[] }
export interface Operation { fieldId: string; value: Value; expectedValue: Value; }
export interface FieldResult { fieldId: string; status: 'filled' | 'skipped' | 'failed' | 'undone'; message: string }
export interface SessionRequest { sessionId: string; pageToken: string }
export const trustedPage = (sender: chrome.runtime.MessageSender) => {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try { const url = new URL(sender.url); return (!sender.frameId||sender.frameId===0)&&!url.searchParams.has('widget')&&url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && ['/options.html', '/sidepanel.html', '/journal.html'].includes(url.pathname); } catch { return false; }
};
