import { z } from 'zod';
import { canonical, createAutomationSchemas, type ActParams, type Action, type Condition, type ObserveParams, type Scalar, type UndoParams, type WaitParams, type Write } from '../../../../plugins/resume-companion/src/protocol';
import { antRead, antSelect, antWrite } from '../ant-controls';
import { compact, editable, nameOf, nativeSet, plainText, popupOwner, readSearch, readValue, scopeSelector, validation, visible } from './dom';
import { documentLock } from './lock';
import { AutomationError, Observer, type Entry } from './observer';
import { trustedClick, trustedKey } from '../trusted-input';
const schemas = createAutomationSchemas(z, { allowSources: false });
const pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
type Status = 'applied' | 'no_change' | 'dispatched' | 'blocked' | 'stale' | 'failed' | 'unknown';
type Change = { entry: Entry; before: Scalar; written: Scalar; channel: 'value' | 'search'; undone?: boolean; boundary?: boolean };
type Receipt = { operation_id: string; status: Status; [key: string]: any };
type RecordEntry = { request: string; promise: Promise<Receipt>; result?: Receipt; changes: Change[]; created: number; effect?: string; scope?: HTMLElement; expected?: string[]; baselineMatches?: number; url?: string };
export class AutomationEngine {
  readonly observer = new Observer();
  private records = new Map<string, RecordEntry>();
  private active = new Map<string, { cancelled: boolean; deadline: number }>();
  private cancelledRequests = new Set<string>();
  private lastActivity = Date.now();
  constructor() { this.observer.onReset = () => { this.cancel(); this.records.clear(); }; }
  cancel(id?: string) { if(id) {this.cancelledRequests.add(id);while(this.cancelledRequests.size>200)this.cancelledRequests.delete(this.cancelledRequests.values().next().value!);} for (const [key, active] of this.active) if (!id || key === id) active.cancelled = true; }
  bind(epoch: string) {
    if (Date.now() - this.lastActivity > 7200000) { this.cancel(); this.records.clear(); this.observer.epoch = ''; }
    this.observer.bind(epoch); this.lastActivity = Date.now();
  }
  async handle(method: string, raw: unknown, epoch: string, requestId?: string) {
    this.bind(epoch);
    if (method === 'observe') {
      const params = schemas.observe.parse(raw) as ObserveParams;
      documentLock.assertIdle();
      if (params.mode === 'verify') {
        const all = this.verify(params.operation_ids ?? []), operations = [];
        for (const operation of all) {if(new TextEncoder().encode(JSON.stringify([...operations,operation])).length>7500)break; operations.push(operation);}
        return this.observer.observe(params, {operations,remaining_operation_ids:all.slice(operations.length).map(r=>r.operation_id)});
      }
      return this.observer.observe(params);
    }
    if (method === 'act') return this.act(schemas.act.parse(raw) as ActParams, requestId);
    if (method === 'wait') return this.wait(schemas.wait.parse(raw) as WaitParams, requestId);
    if (method === 'undo_operations') return this.undo(schemas.undo_operations.parse(raw) as UndoParams, requestId);
    throw new Error('未知基础工具');
  }
  private verify(ids: string[]) {
    return ids.map(id => {
      const record = this.records.get(id);
      if (!record) return { operation_id: id, status: 'unknown', message: '操作记录已过期或属于旧文档' };
      const values = record.changes.map(change => {
        const connected = change.entry.node.isConnected, actual = connected ? change.channel === 'search' ? readSearch(change.entry.node) : readValue(change.entry.node) : null;
        return { ref: change.entry.ref, value_retained: connected && actual === change.written, validation: connected ? validation(change.entry.node) : { state: 'unknown', messages: [] }, reversible: connected && !change.boundary && !change.undone && actual === change.written };
      });
      const persistence = this.persistence(record);
      return { operation_id: id, status: record.result?.status ?? 'unknown', values, ...persistence };
    });
  }
  private savedCandidates(expected: string[]) {
    return [...document.querySelectorAll<HTMLElement>('article,section,[role="listitem"],.ant-card')].filter(n=>visible(n) && !n.querySelector('input,select,textarea,article,[role="listitem"],.ant-card') && expected.length>0 && expected.every(value=>plainText(n,10000).includes(value)));
  }
  private persistence(record: RecordEntry) {
    if (!record.effect || !['save_record','save_draft','advance_step'].includes(record.effect)) return {};
    const matching = this.savedCandidates(record.expected ?? []);
    const arrived = record.effect === 'advance_step' && (location.href !== record.url || Boolean(record.scope && !visible(record.scope)));
    const acknowledged = matching.length > (record.baselineMatches ?? 0);
    if (acknowledged || arrived) {
      for (const entry of this.records.values()) if (entry.created <= record.created) entry.changes.forEach(c => { c.boundary = true; });
    }
    return { persistence: acknowledged ? 'ui_acknowledged' : arrived ? 'step_changed' : 'unconfirmed', evidence: matching.slice(0, 3).map(n => ({ ref: this.observer.id(n), text: plainText(n) })), note: '仅核对页面回显；不表示服务端事务保证。保存结果未知时先观察，不重复新增或重放。' };
  }
  private begin(requestId: string, timeout: number, session: string) {
    const active = { cancelled: this.cancelledRequests.has(requestId), deadline: Date.now() + timeout };
    this.active.set(requestId, active);
    return () => {
      if (active.cancelled) throw new AutomationError('cancelled', '操作已取消，未派发的后续动作已停止');
      if (Date.now() >= active.deadline) throw new AutomationError('timeout', '操作已超时，未派发的后续动作已停止');
      this.observer.assertSession(session);
    };
  }
  private async dedupe(id: string, input: unknown, job: (record: RecordEntry) => Promise<Receipt>) {
    const signature = canonical(input), existing = this.records.get(id);
    if (existing) {
      if (existing.request !== signature) throw new AutomationError('operation_conflict', '相同 operation_id 的参数不同，未重复执行');
      return existing.promise;
    }
    let resolve!: (receipt: Receipt) => void;
    const promise = new Promise<Receipt>(r => { resolve = r; });
    const record: RecordEntry = { request: signature, promise, changes: [], created: Date.now() };
    this.records.set(id, record);
    while (this.records.size > 200) { const removable = [...this.records].find(([, r]) => r.result); if (!removable) break; this.records.delete(removable[0]); }
    try { record.result = await job(record); }
    catch (error) { record.result = { operation_id: id, status: error instanceof AutomationError && error.code === 'stale' ? 'stale' : 'blocked', error: error instanceof AutomationError ? error.code : 'invalid_request', message: error instanceof Error ? error.message : '操作失败', dispatched: false }; }
    if (new TextEncoder().encode(JSON.stringify(record.result)).length > 12000) {
      if (record.result.observation) record.result.observation = {session_id:record.result.observation.session_id,snapshot_id:record.result.observation.snapshot_id,requires_full_observation:true,reason:'response_budget'};
      if (record.result.results) record.result.results = record.result.results.map((r:any)=>({...r,value:undefined,message:typeof r.message==='string'?r.message.slice(0,100):r.message}));
      record.result.response_truncated = true;
    }
    resolve(record.result); return record.result;
  }
  private ensureAction(entry: Entry, kind: string) {
    if (!entry.public.allowed_actions.includes(kind)) throw new AutomationError('blocked', `该元素不允许 ${kind}，请依据 allowed_actions 选择动作`);
  }
  async act(params: ActParams, requestId = params.operation_id) {
    return this.dedupe(params.operation_id, params, record => documentLock.run('core', async () => {
      const start = Date.now(), deadline = params.action.kind === 'set_values' ? 20000 : params.wait_for ? Math.min(params.timeout_ms ?? 12000, 12000) : Math.min(params.timeout_ms ?? 8000, 8000);
      const guard = this.begin(requestId, deadline, params.session_id);
      let dispatched = false;
      const mark = () => { guard(); dispatched = true; };
      try {
        guard(); this.observer.snapshot(params.snapshot_id);
        const items = params.action.kind === 'set_values' ? params.action.items : [params.action];
        if (params.action.kind === 'set_values') {
          if (new Set(items.map(item => 'ref' in item ? item.ref : '')).size !== items.length) throw new AutomationError('blocked', '批量含重复字段');
          for (const action of params.action.items) {
            const e = this.observer.assertEntry(params.snapshot_id, action.ref, action.expected_value_token);
            if (antSelect(e.node) || e.public.kind === 'combobox' || action.kind === 'select_option' && !(e.node instanceof HTMLSelectElement)) throw new AutomationError('blocked', '批量仅支持独立原生字段；动态控件请单独操作');
          }
        }
        const results = [];
        for (const action of items) {
          try { guard(); results.push(await this.execute(action, params.snapshot_id, record, guard, mark)); }
          catch (error) {
            results.push({ status: error instanceof AutomationError && error.code === 'stale' ? 'stale' : error instanceof AutomationError && ['blocked','unsupported'].includes(error.code) ? 'blocked' : dispatched && error instanceof AutomationError && ['timeout','cancelled'].includes(error.code) ? 'unknown' : 'failed', message: error instanceof Error ? error.message : '动作失败', error: error instanceof AutomationError ? error.code : 'action_failed' }); break;
          }
          if (results.at(-1)?.status === 'failed' || results.at(-1)?.status === 'unknown') break;
        }
        let waiting;
        if (params.wait_for && location.href === this.observer.url && results.every(r => ['applied','no_change','dispatched'].includes(r.status))) waiting = await this.waitCondition(params.wait_for, params.snapshot_id, guard);
        if (location.href === this.observer.url) guard();
        const persistence = this.persistence(record);
        let status: Status = results.find(r => !['applied','no_change','dispatched'].includes(r.status))?.status as Status ?? (results.some(r => r.status === 'dispatched') ? 'dispatched' : results.every(r => r.status === 'no_change') ? 'no_change' : 'applied');
        if (record.effect && ['save_record','save_draft'].includes(record.effect) && persistence.persistence !== 'ui_acknowledged') status = 'dispatched';
        if (persistence.persistence === 'ui_acknowledged' || persistence.persistence === 'step_changed') status = 'applied';
        const receipt: Receipt = { operation_id: params.operation_id, status, dispatched, results, stopped_at: results.length < items.length ? results.length : null, elapsed_ms: Date.now() - start, reversible: record.changes.length > 0 && record.changes.every(c => !c.boundary && c.entry.node.isConnected), wait: waiting, ...persistence };
        if (location.href !== this.observer.url) receipt.transition = { status: record.effect === 'advance_step' ? 'observed_navigation' : 'unexpected_navigation', from: this.observer.url, to: location.href, requires_observe: true };
        else receipt.observation = this.observer.observe({ session_id: params.session_id, mode: 'changes', snapshot_id: params.snapshot_id, limit: 12 });
        return receipt;
      } catch (error) {
        return { operation_id: params.operation_id, status: dispatched ? 'unknown' : error instanceof AutomationError && error.code === 'stale' ? 'stale' : 'blocked', dispatched, error: error instanceof AutomationError ? error.code : 'action_failed', message: error instanceof Error ? error.message : '动作失败', reversible: false, elapsed_ms: Date.now() - start };
      } finally { this.active.delete(requestId); }
    }));
  }
  private async execute(action: Action, snapshot: string, record: RecordEntry, guard: () => void, mark: () => void): Promise<Record<string, any> & { status: Status }> {
    if (action.kind === 'set_values') throw new AutomationError('blocked', '不支持嵌套批量');
    const token = 'expected_value_token' in action ? action.expected_value_token : undefined;
    const target = this.observer.snapshot(snapshot).entries.get(action.ref);
    const entry = this.observer.assertEntry(snapshot, action.ref, target && popupOwner(target.node) ? undefined : token);
    const node = entry.node;
    this.ensureAction(entry, action.kind);
    if (action.kind === 'set_value' || action.kind === 'set_checked' || action.kind === 'select_option') return this.write(action as Write, entry, snapshot, record, guard, mark);
    if (action.kind === 'scroll') {
      const target = node === document.body ? document.scrollingElement! : node;
      const before = { top: target.scrollTop, left: target.scrollLeft }, distance = action.pixels ?? 500;
      mark(); target.scrollBy({ top: action.direction === 'down' ? distance : action.direction === 'up' ? -distance : 0, left: action.direction === 'right' ? distance : action.direction === 'left' ? -distance : 0, behavior: 'instant' });
      await pause(100); guard();
      return { status: target.scrollTop === before.top && target.scrollLeft === before.left ? 'no_change' : 'applied', ref: entry.ref, before, after: { top: target.scrollTop, left: target.scrollLeft }, rendered_only: true };
    }
    const owner = popupOwner(node), isValueInteraction = owner || editable(node);
    if (isValueInteraction) {
      const expected = action.expected_value_token;
      const ownerEntry = owner ? this.observer.assertEntry(snapshot, this.observer.id(owner), expected) : entry;
      if (!expected || expected !== ownerEntry.token) throw new AutomationError('stale', '此交互可能改变字段，需要所属字段的值 token');
    }
    if (action.kind === 'press_key') {
      mark(); await trustedKey(node, action.key);
      await pause(100); guard();
      return { status: 'dispatched', ref: entry.ref, note: '已通过 Chrome debugger 派发可信按键，请依据观察继续' };
    }
    if (owner && ['option','treeitem'].includes(entry.public.kind) && !entry.public.expandable) throw new AutomationError('blocked', '叶子候选请通过所属控件的 select_option 选择并核对');
    if (action.effect_kind !== entry.public.effect_kind || ['unknown','final_submit'].includes(action.effect_kind)) throw new AutomationError('blocked', '动作效果与页面证据不符，未点击');
    if (['save_record','save_draft','advance_step'].includes(action.effect_kind)) {
      if (!action.evidence_refs?.includes(entry.ref) || !action.evidence_refs.includes(entry.scopeRef)) throw new AutomationError('blocked', '保存/前进需要按钮及其栏目证据引用');
      for (const ref of action.evidence_refs) this.observer.assertEntry(snapshot, ref);
      documentLock.persistenceBoundary();
      record.effect = action.effect_kind; record.scope = entry.scope; record.url = location.href;
      record.expected = [...this.observer.snapshot(snapshot).entries.values()].filter(e => entry.scope.contains(e.node) && typeof e.value === 'string' && e.value.trim() && !e.public.blocked_reason).map(e => String(e.value)).slice(0, 20);
      record.baselineMatches = this.savedCandidates(record.expected).length;
      // Once dispatched, local field undo cannot promise reversal of a possible server save.
      for (const prior of this.records.values()) prior.changes.forEach(c => { c.boundary = true; });
    }
    const valueNode = owner ?? (editable(node) ? node : null), before = valueNode ? readValue(valueNode) : null;
    const beforeSignature = this.observer.collect().signature;
    mark();
    if (antSelect(node)) {
      const trigger = antSelect(node)!.querySelector<HTMLElement>('.ant-select-selector')!;
      trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); node.focus({ preventScroll: true });
    } else await trustedClick(node);
    await pause(160);
    if (location.href !== this.observer.url) return { status: 'dispatched', ref: entry.ref, effect_kind: action.effect_kind };
    guard();
    if (valueNode && before !== null && valueNode.isConnected && readValue(valueNode) !== before) {
      const ownerEntry = owner ? this.observer.snapshot(snapshot).entries.get(this.observer.id(owner))! : entry;
      record.changes.push({ entry: ownerEntry, before, written: readValue(valueNode)!, channel: 'value' });
    }
    return { status: action.effect_kind === 'interaction' && beforeSignature !== this.observer.collect().signature ? 'applied' : 'dispatched', ref: entry.ref, effect_kind: action.effect_kind, value_side_effect: valueNode ? readValue(valueNode) !== before : false };
  }
  private async write(action: Write, entry: Entry, snapshot: string, record: RecordEntry, guard: () => void, mark: () => void) {
    const node = entry.node;
    let value: Scalar, channel: Change['channel'] = 'value', option: HTMLElement | undefined;
    if (action.kind === 'set_value') {
      if (!('literal' in action.value)) throw new AutomationError('blocked', '资料引用须先由后台解析');
      value = action.value.literal;
      if (typeof value !== 'string') throw new AutomationError('blocked', '文本字段需要字符串');
      if (node instanceof HTMLInputElement && (antSelect(node) || node.getAttribute('role') === 'combobox')) channel = 'search';
      if (node instanceof HTMLInputElement && node.readOnly) throw new AutomationError('blocked', '该控件只允许通过候选选择');
      if (editable(node) && 'maxLength' in node && node.maxLength >= 0 && value.length > node.maxLength) throw new AutomationError('blocked', '超出字段长度限制');
      if (node instanceof HTMLInputElement && node.type === 'date' && value !== '' && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) throw new AutomationError('blocked', '日期需要完整 YYYY-MM-DD，不会补造日期');
      if (node instanceof HTMLInputElement && node.type === 'month' && value !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new AutomationError('blocked', '月份需要 YYYY-MM');
    } else if (action.kind === 'set_checked') {
      value = action.checked;
      if (node instanceof HTMLInputElement && node.type === 'radio' && !value) throw new AutomationError('blocked','单选组请选择明确的另一个候选，不直接取消整组');
    }
    else {
      if (Number(action.option_ref !== undefined) + Number(action.option_value !== undefined) !== 1) throw new AutomationError('blocked', '选择需要唯一 option_ref 或原生 option_value');
      if (node instanceof HTMLSelectElement) {
        if (action.option_ref) {
          const selected = this.observer.assertEntry(snapshot, action.option_ref);
          if (!(selected.node instanceof HTMLOptionElement) || selected.node.closest('select') !== node) throw new AutomationError('blocked', '候选不属于此字段');
          value = selected.node.value;
        } else value = action.option_value!;
        const matches = Array.from(node.options).filter(o => o.value === value && !o.disabled && !o.closest('optgroup[disabled]'));
        if (matches.length !== 1) throw new AutomationError('stale', '没有唯一可用的原生选项');
        // Native values are only valid after a detail observation exposed the option.
        if (![...this.observer.snapshot(snapshot).entries.values()].some(e => this.observer.snapshot(snapshot).exposed.has(e.ref) && e.node instanceof HTMLOptionElement && e.node.closest('select') === node && e.node.value === value)) throw new AutomationError('stale', '请先 detail 观察该原生下拉的选项');
      } else {
        if (!action.option_ref) throw new AutomationError('blocked', '自定义下拉必须选择已观察的 option_ref');
        const selected = this.observer.assertEntry(snapshot, action.option_ref);
        if (popupOwner(selected.node) !== node || !['option','treeitem','date_option'].includes(selected.public.kind)) throw new AutomationError('blocked', '候选不属于此控件');
        if (selected.public.expandable) throw new AutomationError('blocked', '分支请先 click 展开，然后选择实际叶子');
        if (/作为我的|新建|新增|create|add\s*new/i.test(selected.public.name)) throw new AutomationError('blocked', '创建自定义候选需手动处理');
        const siblings = [...this.observer.collect(entry.ref).entries.values()].filter(e => popupOwner(e.node) === node && e.public.kind === selected.public.kind && e.public.name === selected.public.name && e.scope === selected.scope && !e.public.blocked_reason);
        if (siblings.length !== 1) throw new AutomationError('blocked', '同一候选范围内存在同名选项，无法唯一核实选择');
        option = selected.node; value = selected.public.name;
      }
    }
    const before = channel === 'search' ? readSearch(node)! : readValue(node);
    if (before === null) throw new AutomationError('unsupported', '无法回读此控件的值');
    if (before === value && !option) return { status: 'no_change' as const, ref: entry.ref, value_retained: true, validation: validation(node) };
    const radioPeers = node instanceof HTMLInputElement && node.type === 'radio' && node.name ? [...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter(n=>n!==node&&n.name===node.name&&n.form===node.form&&n.checked) : [];
    for (const peer of radioPeers) { const prior=this.observer.snapshot(snapshot).entries.get(this.observer.id(peer)); if(!prior)throw new AutomationError('stale','请观察整个单选组后选择');this.observer.assertEntry(snapshot,prior.ref,prior.token); }
    guard(); mark();
    if (option) await trustedClick(option);
    else if (channel === 'search') {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (node.matches('[role="checkbox"],[role="radio"]') && !editable(node)) { if (readValue(node) !== value) await trustedClick(node); }
    else nativeSet(node, value);
    for(const peer of radioPeers)record.changes.push({entry:this.observer.snapshot(snapshot).entries.get(this.observer.id(peer))!,before:true,written:false,channel:'value'});
    const change: Change = { entry, before, written: value, channel }; record.changes.push(change);
    const settleDelay = node instanceof HTMLInputElement && ['checkbox', 'radio'].includes(node.type) ? 80 : 160;
    await pause(settleDelay); guard();
    const actual = channel === 'search' ? readSearch(node) : readValue(node);
    // A cascader displays its complete path; verify the selected rendered leaf and path suffix.
    const retained = node.isConnected && (actual === value || Boolean(option && antSelect(node)?.matches('.ant-cascader') && typeof actual === 'string' && actual.split(/\s*\/\s*/).at(-1) === value));
    if (retained && actual !== undefined && actual !== null) change.written = actual;
    return { status: retained ? 'applied' as const : 'failed' as const, ref: entry.ref, value_retained: retained, validation: validation(node), value: typeof actual === 'string' ? actual.slice(0, 240) : actual, search_only: channel === 'search', message: retained ? '已回读字段值' : '页面未保留期望值；停止后续填写' };
  }
  private async waitCondition(condition: Condition, snapshot: string, guard: () => void) {
    const previous = this.observer.snapshot(snapshot), entry = previous.entries.get(condition.ref);
    if (!entry) throw new AutomationError('stale', '等待引用不在指定快照');
    const node = entry.node; let last = '', stable = Date.now();
    for (;;) {
      guard(); if(condition.kind !== 'hidden' && !node.isConnected)throw new AutomationError('stale','等待目标已被替换，请重新观察'); let met = false;
      if (condition.kind === 'visible') met = visible(node);
      if (condition.kind === 'hidden') met = !visible(node);
      if (condition.kind === 'expanded') met = node.getAttribute('aria-expanded') === 'true';
      if (condition.kind === 'value_equals') met = node.isConnected && readValue(node) === condition.value;
      if (condition.kind === 'text_present') met = node.isConnected && plainText(node, 10000).includes(condition.text);
      if (condition.kind === 'structure_changed') met = this.observer.structure(node) !== entry.childrenSignature;
      if (condition.kind === 'options_ready') {
        const popups = [...document.querySelectorAll<HTMLElement>('[role="listbox"],[role="tree"],.ant-select-dropdown,.ant-cascader-dropdown,.ant-picker-dropdown')].filter(p => visible(p) && popupOwner(p) === node);
        const candidates = popups.flatMap(p => [...p.querySelectorAll<HTMLElement>('[role="option"],[role="treeitem"],.ant-select-item-option,.ant-cascader-menu-item,.ant-picker-cell-inner')].filter(visible));
        const busy = popups.some(p => p.matches('[aria-busy="true"]') || p.querySelector('[aria-busy="true"],.ant-spin-spinning,.ant-cascader-menu-item-loading'));
        const empty = popups.some(p => [...p.querySelectorAll<HTMLElement>('.ant-empty,[role="status"]')].filter(visible).some(e => /无|没有|empty|no results/i.test(plainText(e))));
        const signature = canonical(candidates.map(n => [this.observer.id(n), nameOf(n)]));
        if (signature !== last || busy) { stable = Date.now(); last = signature; }
        met = !busy && (candidates.length > 0 || empty) && Date.now() - stable >= 240;
        if (met) return { status: candidates.length ? 'ready' : 'empty', rendered_only: true };
      }
      if (met) return { status: 'satisfied' };
      await pause(60);
    }
  }
  private async wait(params: WaitParams, requestId: string = crypto.randomUUID()) {
    documentLock.assertIdle();
    const guard = this.begin(requestId, params.timeout_ms ?? 3000, params.session_id);
    try { const result = await this.waitCondition(params.condition, params.snapshot_id, guard); return { ...result, observation: this.observer.observe({ session_id: params.session_id, mode: 'detail', scope_ref: params.condition.ref, limit: 12 }) }; }
    catch (error) { return { status: 'unknown', reason: error instanceof AutomationError ? error.code : 'wait_failed', message: error instanceof Error ? error.message : '等待失败', page_visibility: document.visibilityState }; }
    finally { this.active.delete(requestId); }
  }
  private async undo(params: UndoParams, requestId = params.operation_id) {
    return this.dedupe(params.operation_id, params, record => documentLock.run('core-undo', async () => {
      const guard = this.begin(requestId, 20000, params.session_id), selected = new Set(params.operation_ids), results: Record<string, unknown>[] = [];
      try {
        guard();
        let remaining: string[]=[];
        const entries = [...this.records.entries()].filter(([id]) => selected.has(id)).sort(([, a], [, b]) => b.created - a.created);
        for (const id of selected) if (!this.records.has(id)) results.push({ operation_id: id, status: 'unknown', message: '操作已过期' });
        outer: for (const [id, original] of entries) for (const change of [...original.changes].reverse()) {
          if(results.length>=30) {remaining=entries.slice(entries.findIndex(([key])=>key===id)).map(([key])=>key);break outer;}
          guard();
          const node = change.entry.node;
          const later = [...this.records.values()].some(r => r !== record && r.created > original.created && r.changes.some(c => c.entry.node === node && !c.undone));
          const current = this.observer.describe(node);
          const actual = change.channel === 'search' ? readSearch(node) : readValue(node);
          if (change.undone) { results.push({ operation_id: id, ref: change.entry.ref, status: 'no_change' }); continue; }
          if (later || change.boundary || !node.isConnected || current.signature !== change.entry.signature || current.scope !== change.entry.scope || current.public.blocked_reason || actual !== change.written) {
            results.push({ operation_id: id, ref: change.entry.ref, status: 'blocked', message: later ? '存在后续写入，请逆序撤销' : change.boundary ? '已经派发保存/转场，不能用字段撤销承诺网站回滚' : '字段已变化，保留当前内容' }); continue;
          }
          if (antSelect(node) && change.channel === 'value') await antWrite(node, String(change.before), guard);
          else if (change.channel === 'search') { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, change.before); node.dispatchEvent(new Event('input', { bubbles: true })); }
          else if (node instanceof HTMLInputElement && node.type === 'radio' && change.before === false) {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked')!.set!.call(node,false);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}
          else if (editable(node)) nativeSet(node, change.before);
          else if (node.matches('[role="checkbox"],[role="radio"]')) node.click();
          else { results.push({ operation_id: id, ref: change.entry.ref, status: 'blocked', message: '控件不支持恢复' }); continue; }
          await pause(100); guard();
          const restored = (change.channel === 'search' ? readSearch(node) : readValue(node)) === change.before;
          change.undone = restored; results.push({ operation_id: id, ref: change.entry.ref, status: restored ? 'applied' : 'failed' });
        }
        return { operation_id: params.operation_id, status: !remaining.length && results.every(r => ['applied','no_change'].includes(String(r.status))) ? 'applied' : 'blocked', results, remaining_operation_ids:remaining, observation: this.observer.observe({ session_id: params.session_id, mode: 'overview', limit: 12 }) };
      } finally { this.active.delete(requestId); }
    }));
  }
}
