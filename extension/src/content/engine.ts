import { blockedLabel, classifyGroup } from '../domain/rules';
import type { Field, FieldResult, Operation, SessionRequest, Snapshot, Value } from '../domain/types';
import { siteField } from './site-adapters';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Target = { node: HTMLElement; radios?: HTMLInputElement[]; field: Field; signature: string };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const compact = (s: string | null | undefined, max = 120) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function visible(el: HTMLElement) {
  if (!el.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.getClientRects().length > 0;
}
function labelText(el: Element | null) {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('input,select,textarea,button,script,style,[aria-hidden="true"]').forEach(child => child.remove());
  return clone.textContent ?? '';
}
function ownLabel(el: HTMLElement) {
  const labels = 'labels' in el ? (el as Control).labels : null;
  const described = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => labelText(document.getElementById(id))).join(' ');
  return compact(labels?.length ? Array.from(labels).map(labelText).join(' ') : el.getAttribute('aria-label') || described || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '未命名字段');
}
function groupFor(el: HTMLElement) {
  let fallback: HTMLElement | null = null;
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (!parent.matches('fieldset,section,[data-resume-group]')) continue;
    fallback ??= parent;
    const title = compact(parent.querySelector(':scope > legend, :scope > h2, :scope > h3, :scope > .section-title')?.textContent || parent.getAttribute('aria-label'));
    const section = classifyGroup(title);
    if (section !== 'other') return { root: parent, label: title, section };
  }
  const root = fallback ?? el.closest('form') ?? document.body;
  return { root, label: compact(root.querySelector(':scope > legend, :scope > h2, :scope > h3')?.textContent) || '当前表单', section: 'other' as const };
}
function read(t: Target): Value {
  if (t.radios) return t.radios.find(r => r.checked)?.value ?? '';
  if (t.node instanceof HTMLInputElement && t.node.type === 'checkbox') return t.node.checked;
  return (t.node as Control).value;
}
export class FormEngine {
  private pageToken = crypto.randomUUID();
  private sessionId = '';
  private url = '';
  private targets: Target[] = [];
  private groupIds = new WeakMap<HTMLElement, string>();
  private completed = new Map<string, FieldResult[]>();
  private undoLog: { target: Target; oldValue: Value; written: Value }[] = [];
  private busy = false;

  private describe(node: HTMLElement, radios?: HTMLInputElement[]): Target {
    const kind = node instanceof HTMLInputElement ? node.type : node instanceof HTMLSelectElement ? node.type : node instanceof HTMLTextAreaElement ? 'textarea' : 'custom';
    const group = groupFor(node);
    let groupId = this.groupIds.get(group.root);
    if (!groupId) { groupId = crypto.randomUUID(); this.groupIds.set(group.root, groupId); }
    const radioLegend = radios ? compact(node.closest('fieldset')?.querySelector(':scope > legend')?.textContent) : '';
    const site = siteField(node, labelText);
    const label = kind !== 'checkbox' && site ? site.label : radios ? compact(node.getAttribute('data-group-label') || (radioLegend && classifyGroup(radioLegend) === 'other' ? radioLegend : '') || node.getAttribute('name')) : ownLabel(node);
    const safetyText = [label, site?.label, node.id, node.getAttribute('name'), node.getAttribute('autocomplete'), node.getAttribute('aria-label')].join(' ');
    let blocked: string | null = null;
    if (blockedLabel(safetyText) || /(?:^|\s)(?:cc-|one-time-code)/.test(safetyText)) blocked = '敏感信息、验证或声明项，请手动处理';
    else if (site?.blocked) blocked = site.blocked;
    else if (!['text', 'email', 'tel', 'textarea', 'select-one', 'radio', 'date', 'month', 'checkbox'].includes(kind)) blocked = '当前版本不支持此控件，请手动填写';
    else if (node.matches(':disabled') || (node as HTMLInputElement).readOnly || node.getAttribute('aria-disabled') === 'true') blocked = '此字段不可编辑';
    else if (node.hasAttribute('role') && node.getAttribute('role') === 'combobox' && !(node instanceof HTMLSelectElement)) blocked = '自定义下拉框需要专用适配，请手动选择';
    else if (kind === 'checkbox' && group.section !== 'skills') blocked = '只支持明确的技能复选项，其他选项请手动勾选';
    const options = node instanceof HTMLSelectElement
      ? Array.from(node.options).filter(o => !o.disabled && !o.closest('optgroup[disabled]') && o.value !== '').map(o => ({ label: compact(o.label), value: o.value }))
      : radios?.filter(r => visible(r) && !r.matches(':disabled') && !blockedLabel(ownLabel(r))).map(r => ({ label: ownLabel(r), value: r.value })) ?? [];
    const field: Field = { id: '', label, kind, groupId, groupLabel: group.label, section: group.section,
      currentValue: null, options, maxLength: 'maxLength' in node ? (node as HTMLInputElement).maxLength : -1,
      required: ('required' in node && (node as HTMLInputElement).required) || node.getAttribute('aria-required') === 'true', blocked };
    const signature = JSON.stringify({ ...field, min: node.getAttribute('min'), max: node.getAttribute('max'), pattern: node.getAttribute('pattern'), autocomplete: node.getAttribute('autocomplete') });
    const target = { node, radios, field, signature };
    if (!blocked) field.currentValue = read(target);
    return target;
  }
  private collect(): Target[] {
    const all = Array.from(document.querySelectorAll<HTMLElement>('input,textarea,select,[role="combobox"],[contenteditable="true"]')).filter(el => visible(el) && !(el instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset', 'image'].includes(el.type)));
    const seen = new Set<HTMLElement>();
    const targets: Target[] = [];
    for (const node of all) {
      if (seen.has(node)) continue;
      if (node instanceof HTMLInputElement && node.type === 'radio' && node.name) {
        const radios = all.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'radio' && el.name === node.name && el.form === node.form);
        radios.forEach(r => seen.add(r));
        targets.push(this.describe(node, radios));
      } else { seen.add(node); targets.push(this.describe(node)); }
    }
    return targets;
  }
  scan(): Snapshot {
    if (this.busy) throw new Error('填写正在进行，请稍后重新扫描');
    this.targets = this.collect();
    if (this.targets.length > 300) { this.targets = []; throw new Error('当前页字段超过 300 个，请展开需要填写的栏目后再扫描'); }
    this.targets.forEach(t => { t.field.id = crypto.randomUUID(); });
    this.sessionId = crypto.randomUUID(); this.url = location.href;
    this.completed.clear(); this.undoLog = [];
    const notices = [];
    if (document.querySelector('iframe')) notices.push('嵌入页面中的表单尚未扫描，请自行检查。');
    if (Array.from(document.querySelectorAll('*')).some(el => el.shadowRoot)) notices.push('Shadow DOM 内的控件暂需手动处理。');
    return { sessionId: this.sessionId, pageToken: this.pageToken, url: this.url, fields: this.targets.map(t => t.field), notices };
  }
  private assertSession(req: SessionRequest) {
    if (!this.sessionId || req.sessionId !== this.sessionId || req.pageToken !== this.pageToken || location.href !== this.url) throw new Error('页面或扫描结果已变化，请重新扫描');
  }
  private assertStructure() {
    const fresh = this.collect();
    if (fresh.length !== this.targets.length || fresh.some((t, i) => t.node !== this.targets[i].node || t.signature !== this.targets[i].signature || t.radios?.some((r, j) => r !== this.targets[i].radios?.[j]))) {
      throw new Error('表单结构或字段含义已变化，请重新扫描');
    }
  }
  validate(req:SessionRequest){
    this.assertSession(req);this.assertStructure();
    if(this.targets.some(t=>!t.field.blocked&&read(t)!==t.field.currentValue))throw new Error('网页内容已变化，请重新扫描后再匹配');
    return {valid:true};
  }
  verify(req:SessionRequest):FieldResult[]{
    this.assertSession(req);this.assertStructure();
    return this.undoLog.map(({target,written})=>read(target)===written
      ? {fieldId:target.field.id,status:'filled',message:'网页仍保留本轮填写值'}
      : {fieldId:target.field.id,status:'failed',message:'网页已修改或清除了本轮填写值'});
  }
  private setValue(target: Target, value: Value) {
    const el = target.node;
    let eventNode = el;
    if (target.radios) {
      if (typeof value !== 'string') throw new Error('选项格式错误');
      const selected = target.radios.find(r => r.value === value && visible(r) && !r.matches(':disabled'));
      if (value && !selected) throw new Error('选项已不存在');
      for (const r of target.radios) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!.call(r, r === selected);
      eventNode = selected ?? el;
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (typeof value !== 'boolean') throw new Error('复选项格式错误');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!.call(el, value);
    } else {
      if (typeof value !== 'string') throw new Error('字段值格式错误');
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    }
    eventNode.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    eventNode.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async fill(req: SessionRequest & { operationId: string; operations: Operation[] }): Promise<FieldResult[]> {
    this.assertSession(req);
    if (this.completed.has(req.operationId)) return this.completed.get(req.operationId)!;
    if (this.busy) throw new Error('填写正在进行，请勿重复操作');
    if (!Array.isArray(req.operations) || req.operations.length > 300 || typeof req.operationId !== 'string' || req.operationId.length > 100) throw new Error('无效的填写计划');
    this.assertStructure();
    const ids = new Set<string>();
    for (const op of req.operations) {
      const target = this.targets.find(t => t.field.id === op.fieldId);
      if (!target || ids.has(op.fieldId) || target.field.blocked || !['string', 'boolean'].includes(typeof op.value) || (typeof op.value === 'string' && op.value.length > 10000)) throw new Error('填写计划含无效、受限或重复字段');
      ids.add(op.fieldId);
      if (target.field.kind === 'checkbox' && (target.field.section !== 'skills' || op.value !== true)) throw new Error('复选框只允许确认已掌握的技能');
    }
    this.busy = true; this.undoLog = [];
    const results: FieldResult[] = [];
    try {
      for (const op of req.operations) {
        const t = this.targets.find(t => t.field.id === op.fieldId)!;
        try {
          this.assertSession(req); this.assertStructure();
          if (read(t) !== op.expectedValue) { results.push({ fieldId: op.fieldId, status: 'skipped', message: '预览后内容已被修改，保留当前值' }); continue; }
          if (typeof op.value === 'string' && t.field.maxLength >= 0 && op.value.length > t.field.maxLength) throw new Error('内容超过网页长度限制');
          if (t.field.kind === 'date' && (typeof op.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(op.value))) throw new Error('网页需要完整日期，不会补造日期');
          if (['select-one', 'radio'].includes(t.field.kind) && !t.field.options.some(o => o.value === op.value)) throw new Error('网页选项已变化');
          const oldValue = read(t);
          this.setValue(t, op.value);
          this.undoLog.push({ target: t, oldValue, written: op.value });
          await wait(35);
          this.assertSession(req);
          if (!t.node.isConnected || read(t) !== op.value) throw new Error('页面未保留填写值，请手动检查');
          if ('validity' in t.node && !(t.node as Control).validity.valid) {
            if (read(t) === op.value) this.setValue(t, oldValue);
            throw new Error('未通过网页字段校验，已尝试恢复原值');
          }
          results.push({ fieldId: op.fieldId, status: 'filled', message: '已填写并回读确认' });
        } catch (error) {
          results.push({ fieldId: op.fieldId, status: 'failed', message: error instanceof Error ? error.message : '填写失败，请检查页面' });
          // A stale document invalidates the remainder, even if only one target changed.
          try { this.assertSession(req); this.assertStructure(); } catch { break; }
        }
      }
      await wait(60);
      for (const result of results) if (result.status === 'filled') {
        const op = req.operations.find(o => o.fieldId === result.fieldId)!;
        const t = this.targets.find(t => t.field.id === result.fieldId)!;
        if (location.href !== this.url || !t.node.isConnected || read(t) !== op.value) { result.status = 'failed'; result.message = '页面随后修改了内容，请手动检查'; }
      }
      for (const op of req.operations) if (!results.some(r => r.fieldId === op.fieldId)) results.push({ fieldId: op.fieldId, status: 'skipped', message: '表单已变化，后续填写已停止' });
      this.completed.set(req.operationId, results);
      return results;
    } finally { this.busy = false; }
  }
  async undo(req: SessionRequest): Promise<FieldResult[]> {
    this.assertSession(req);
    if (this.busy) throw new Error('填写正在进行');
    this.assertStructure(); this.busy = true;
    const results: FieldResult[] = [];
    try {
      for (const { target: t, oldValue, written } of [...this.undoLog].reverse()) {
        try {
          this.assertSession(req); this.assertStructure();
          if (read(t) !== written) { results.push({ fieldId: t.field.id, status: 'skipped', message: '此项已被继续修改，保留当前内容' }); continue; }
          this.setValue(t, oldValue); await wait(35);
          results.push({ fieldId: t.field.id, status: read(t) === oldValue ? 'undone' : 'failed', message: read(t) === oldValue ? '已恢复填写前的值' : '页面未保留恢复值' });
        } catch { results.push({ fieldId: t.field.id, status: 'skipped', message: '目标已变化，未撤销此项' }); }
      }
      this.undoLog = [];
      return results;
    } finally { this.busy = false; }
  }
  focus(req: SessionRequest & { fieldId: string }) {
    this.assertSession(req); this.assertStructure();
    const target = this.targets.find(t => t.field.id === req.fieldId);
    if (!target) throw new Error('找不到该字段');
    target.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.node.focus({ preventScroll: true });
  }
}
