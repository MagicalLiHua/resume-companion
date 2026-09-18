import { antProxy, antRead, antSelect } from '../ant-controls';
import type { Scalar } from '../../../../plugins/resume-companion/src/protocol';
export const compact = (value: string | null | undefined, max = 240) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const editable = (el: HTMLElement): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
export function visible(node: HTMLElement) {
  const el = antProxy(node) ?? node;
  if (!el.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"],.ant-select-dropdown-hidden,.ant-picker-dropdown-hidden')) return false;
  for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || [...parent.classList].some(c => /-leave(?:-|$)/.test(c))) return false;
  }
  return el.getClientRects().length > 0;
}
export function plainText(el: Element | null, max = 240) {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script,style,input,textarea,select,[hidden],[aria-hidden="true"]').forEach(n => n.remove());
  return compact(clone.textContent, max);
}
export function nameOf(el: HTMLElement) {
  const labels = editable(el) ? el.labels : null;
  const by = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map(id => plainText(document.getElementById(id))).join(' ');
  const antLabel = el.closest('.ant-form-item')?.querySelector('.ant-form-item-label');
  const heading = el.matches('form,section,fieldset,[role="dialog"],dialog,article,.ant-modal') ? el.querySelector('legend,h1,h2,h3,h4,.ant-modal-title') : null;
  const associated = el.closest('.ant-picker-cell')?.getAttribute('title');
  return compact(el.getAttribute('aria-label') || by || (labels?.length ? Array.from(labels).map(l => plainText(l)).join(' ') : '') || plainText(antLabel ?? null) || plainText(heading) || associated || (el.matches('option,button,a,[role="button"],[role="option"],[role="tab"],.ant-cascader-menu-item,.ant-select-item-option,.ant-picker-cell') ? plainText(el) : '') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || (el === document.body ? document.title || '页面' : '未命名'));
}
export const scopeSelector = 'dialog,[role="dialog"],.ant-modal,fieldset,section,article,form,[role="tabpanel"],[role="listbox"],[role="tree"],.ant-select-dropdown,.ant-cascader-dropdown,.ant-cascader-menu,.ant-picker-dropdown,[data-resume-group]';
export const candidateSelector = '[role="group"],[class*="scroll"],[class*="Scroll"],.rc-virtual-list-holder,input:not([type="hidden"]),textarea,select,button,a[href],[role="button"],[role="combobox"],[role="checkbox"],[role="radio"],[role="tab"],[role="option"],[role="treeitem"],[role="dialog"],[role="listbox"],[role="tree"],[role="tabpanel"],dialog,fieldset,section,article,form,[data-resume-group],[role="alert"],[role="status"],h1,h2,h3,h4,legend,.ant-modal,.ant-select-dropdown,.ant-cascader-dropdown,.ant-cascader-menu,.ant-cascader-menu-item,.ant-select-item-option,.ant-picker-dropdown,.ant-picker-cell-inner,.ant-picker-header button,.ant-picker-header-view button,.ant-empty,.ant-form-item-explain-error,[contenteditable="true"]';
export function kindOf(el: HTMLElement) {
  if (el === document.body) return 'document';
  if (antSelect(el)) return antSelect(el)!.matches('.ant-cascader') ? 'cascader' : 'combobox';
  if (el.matches('.ant-cascader-menu-item,.ant-select-item-option')) return 'option';
  if (el.matches('.ant-picker-cell-inner')) return 'date_option';
  if (el.getAttribute('role') === 'combobox') return 'combobox';
  if (el instanceof HTMLInputElement) return ['button', 'submit', 'reset', 'image'].includes(el.type) ? 'button' : el.type;
  if (el instanceof HTMLSelectElement) return el.multiple ? 'multiselect' : 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  return el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName.toLowerCase());
}
export function readValue(el: HTMLElement): Scalar | null {
  if (antSelect(el)) return antRead(el);
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) return el.checked;
  if (editable(el)) return el.value;
  if (el.matches('[role="checkbox"],[role="radio"]')) return el.getAttribute('aria-checked') === 'true';
  if (el.matches('[role="combobox"]')) return el.getAttribute('aria-valuetext') || plainText(el);
  return null;
}
export function readSearch(el: HTMLElement): string | undefined { return el instanceof HTMLInputElement && (antSelect(el) || el.getAttribute('role')==='combobox') ? el.value : undefined; }
export function nativeSet(el: HTMLElement, value: Scalar) {
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) {
    if (typeof value !== 'boolean') throw new Error('布尔字段需要 true/false');
    // click invokes framework checked-state handlers. Never click twice to force a framework rejection.
    if (el.checked !== value) el.click();
    return;
  }
  if (!editable(el) || typeof value !== 'string') throw new Error('unsupported: 不支持此字段的直接写入');
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}
export function validation(el: HTMLElement) {
  const linked = (el.getAttribute('aria-errormessage') ?? '').split(/\s+/).map(id => plainText(document.getElementById(id))).filter(Boolean);
  const errors = [...(el.closest('.ant-form-item')?.querySelectorAll<HTMLElement>('.ant-form-item-explain-error') ?? [])].filter(visible).map(n => plainText(n));
  const invalid = el.getAttribute('aria-invalid') === 'true' || (editable(el) && !el.validity.valid);
  return { state: invalid || errors.length || linked.length ? 'invalid' : editable(el) ? 'valid' : 'unknown', messages: [...linked, ...errors, ...(editable(el) && !el.validity.valid ? [el.validationMessage] : [])].map(t => compact(t)) };
}
export function popupOwner(node: HTMLElement): HTMLElement | null {
  const popup = node.closest<HTMLElement>('[role="listbox"],[role="tree"],.ant-select-dropdown,.ant-cascader-dropdown,.ant-picker-dropdown');
  if (!popup) return null;
  const matches = [...document.querySelectorAll<HTMLElement>('[aria-controls],[aria-owns]')].filter(el => {
    const ids = `${el.getAttribute('aria-controls') ?? ''} ${el.getAttribute('aria-owns') ?? ''}`.split(/\s+/).filter(Boolean);
    return ids.some(id => { const linked = document.getElementById(id); return linked && (linked === popup || popup.contains(linked)); });
  });
  if (matches.length === 1) return matches[0] ?? null;
  const expanded = [...document.querySelectorAll<HTMLElement>('[role="combobox"][aria-expanded="true"]')].filter(visible);
  if (expanded.length === 1 && !popup.matches('.ant-picker-dropdown')) return expanded[0] ?? null;
  if (popup.matches('.ant-picker-dropdown')) {
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.closest('.ant-picker')) return focused;
    const open = [...document.querySelectorAll<HTMLElement>('.ant-picker-focused input')].filter(visible);
    if (open.length === 1) return open[0] ?? null;
  }
  return null;
}
export function semanticSignature(el: HTMLElement, scope: HTMLElement) {
  return JSON.stringify([kindOf(el), nameOf(el), scope === document.body ? 'document' : nameOf(scope),
    ...['type','name','min','max','step','pattern','maxlength','required','readonly','disabled','autocomplete','href','formaction','aria-disabled','aria-readonly'].map(a => el.getAttribute(a)),
    el instanceof HTMLSelectElement ? Array.from(el.options).map(o => [o.value, o.label, o.disabled]) : null]);
}
export function scrollable(el: HTMLElement) { const style = getComputedStyle(el); return (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(style.overflowY)) || (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(style.overflowX)); }
export function topDialog() { return [...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"],.ant-modal')].filter(visible).at(-1); }
