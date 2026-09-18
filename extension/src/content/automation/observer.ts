import { canonical, type ObserveParams, type Scalar } from '../../../../plugins/resume-companion/protocol';
import { antSelect } from '../ant-controls';
import { candidateSelector, compact, editable, kindOf, nameOf, plainText, popupOwner, readSearch, readValue, scopeSelector, scrollable, semanticSignature, validation, visible } from './dom';
import { policy } from './policy';
export type Entry = { ref: string; node: HTMLElement; scope: HTMLElement; scopeRef: string; signature: string; scopeSignature: string; childrenSignature: string; token: string; value: Scalar | null; search?: string; public: Record<string, any> };
export type Snapshot = { id: string; entries: Map<string, Entry>; order: string[]; signature: string; created: number; scopeRef?: string; exposed: Set<string> };
export class AutomationError extends Error { constructor(public code: string, message: string) { super(message); } }
export class Observer {
  readonly instance = crypto.randomUUID();
  session = crypto.randomUUID();
  epoch = '';
  url = location.href;
  private ids = new WeakMap<HTMLElement, string>();
  private nodes = new Map<string, HTMLElement>();
  private tokens = new WeakMap<HTMLElement, { value: string; token: string }>();
  snapshots = new Map<string, Snapshot>();
  private cursors = new Map<string, { snapshot: string; offset: number; mode: string; scope?: string }>();
  private sequence = 0;
  onReset = () => {};
  bind(epoch: string) {
    if (epoch !== this.epoch || this.url !== location.href) {
      this.epoch = epoch; this.url = location.href; this.session = crypto.randomUUID();
      this.ids = new WeakMap(); this.nodes.clear(); this.tokens = new WeakMap(); this.snapshots.clear(); this.cursors.clear(); this.onReset();
    }
  }
  assertSession(session: string) { if (session !== this.session || location.href !== this.url) throw new AutomationError('stale', '页面、路由或桥接会话已变化，请重新观察'); }
  id(node: HTMLElement) {
    let id = this.ids.get(node);
    if (!id) {
      for (const [ref, el] of this.nodes) if (!el.isConnected) this.nodes.delete(ref);
      if (this.nodes.size >= 5000) throw new AutomationError('reference_limit', '当前引用超过 5000 个，请缩小页面范围或重载页面');
      id = `e${++this.sequence}`; this.ids.set(node, id); this.nodes.set(id, node);
    }
    return id;
  }
  node(ref: string) { const node = this.nodes.get(ref); if (!node) throw new AutomationError('stale', '元素引用不存在，请重新观察'); return node; }
  scope(node: HTMLElement) { return node.parentElement?.closest<HTMLElement>(scopeSelector) ?? document.body; }
  structure(scope: HTMLElement) {
    return canonical([...scope.querySelectorAll<HTMLElement>(candidateSelector)].filter(n=>this.scope(n)===scope && visible(n)).map(n=>[this.id(n),semanticSignature(n,scope)]));
  }
  describe(node: HTMLElement): Entry {
    const ref = this.id(node), scope = node === document.body ? node : this.scope(node), scopeRef = this.id(scope);
    const p = policy(node), sensitive = p.blocked_reason?.startsWith('restricted:');
    const value = sensitive ? null : readValue(node), search = sensitive ? undefined : readSearch(node);
    const signature = semanticSignature(node, scope), tokenValue = canonical([value, search, signature, scopeRef]);
    let previous = this.tokens.get(node);
    if (!previous || previous.value !== tokenValue) { previous = { value: tokenValue, token: crypto.randomUUID() }; this.tokens.set(node, previous); }
    const rect = node.getBoundingClientRect(), owner = popupOwner(node);
    const data: Record<string, any> = { ref, name: nameOf(node), scope_ref: scopeRef, ...p,
      in_viewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth };
    if (value !== null || editable(node)) Object.assign(data, { value: typeof value === 'string' ? value.slice(0, 240) : value, value_truncated: typeof value === 'string' && value.length > 240, expected_value_token: sensitive ? undefined : previous.token, required: editable(node) && node.required || node.getAttribute('aria-required') === 'true', validation: validation(node) });
    if (search !== undefined) { data.search_value = search.slice(0, 240); data.search_only = true; }
    if (owner) { data.owner_ref = this.id(owner); data.owner_value_token = this.describeOwnerToken(owner); }
    if (node.getAttribute('aria-expanded')) data.expanded = node.getAttribute('aria-expanded') === 'true';
    if (node.matches('.ant-cascader-menu-item')) { data.expandable = node.matches('.ant-cascader-menu-item-expand') || Boolean(node.querySelector('.ant-cascader-menu-item-expand-icon')); data.selected = node.matches('.ant-cascader-menu-item-active'); }
    if (node instanceof HTMLOptionElement) { data.option_value = node.value; data.owner_ref = this.id(node.parentElement?.closest('select') ?? node.parentElement!); data.option_ref = ref; }
    if (p.kind === 'option' || p.kind === 'date_option') data.option_ref = ref;
    if (editable(node)) {
      data.constraints = Object.fromEntries(['min','max','step','pattern','maxlength'].map(a => [a, node.getAttribute(a)]).filter(([, v]) => v !== null));
      if (['date','month'].includes(p.kind)) data.date_precision = p.kind === 'date' ? 'day' : 'month';
      const desc = (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(id => plainText(document.getElementById(id))).join(' ');
      if (desc) data.description = compact(desc);
    }
    if (['button','link','tab'].includes(p.kind)) data.evidence_refs = [ref, scopeRef];
    if (node === document.body || scrollable(node)) { const s = node === document.body ? document.scrollingElement! : node; data.scroll = { top: s.scrollTop, left: s.scrollLeft, height: s.scrollHeight, viewport_height: s.clientHeight, more_below: s.scrollTop + s.clientHeight < s.scrollHeight - 2 }; }
    if (node.matches(scopeSelector) || node.matches('[role="status"],[role="alert"],h1,h2,h3,h4,legend,.ant-form-item-explain-error,.ant-empty')) data.text = plainText(node);
    return { ref, node, scope, scopeRef, signature, scopeSignature: this.structure(scope), childrenSignature: this.structure(node), token: previous.token, value, search, public: data };
  }
  private describeOwnerToken(owner: HTMLElement) {
    const scope = this.scope(owner), signature = semanticSignature(owner, scope), value = canonical([readValue(owner), readSearch(owner), signature, this.id(scope)]);
    let token = this.tokens.get(owner);
    if (!token || token.value !== value) { token = { value, token: crypto.randomUUID() }; this.tokens.set(owner, token); }
    return token.token;
  }
  collect(scopeRef?: string) {
    const root = scopeRef ? this.node(scopeRef) : document.body;
    if (!root.isConnected) throw new AutomationError('stale', '观察范围已被替换');
    const nodes = new Set<HTMLElement>([root]);
    const add = (node: HTMLElement) => {
      if (!visible(node) || node.closest('#resume-companion-widget,[data-resume-companion]')) return;
      nodes.add(node);
      for (let p = this.scope(node); p !== document.body; p = this.scope(p)) { nodes.add(p); if (nodes.size > 5000) break; }
      nodes.add(document.body);
    };
    root.querySelectorAll<HTMLElement>(candidateSelector).forEach(add);
    // Rendered scroll containers have no universal role (e.g. rc-virtual-list-holder).
    root.querySelectorAll<HTMLElement>('[style],.rc-virtual-list-holder').forEach(n => { if (visible(n) && scrollable(n)) add(n); });
    if (scopeRef) {
      document.querySelectorAll<HTMLElement>('[role="listbox"],[role="tree"],.ant-select-dropdown,.ant-cascader-dropdown,.ant-picker-dropdown').forEach(p => {
        const owner = popupOwner(p);
        if (visible(p) && owner && (owner === root || root.contains(owner))) { add(p); p.querySelectorAll<HTMLElement>(candidateSelector).forEach(add); }
      });
      if (root instanceof HTMLSelectElement) Array.from(root.options).forEach(o => nodes.add(o));
    }
    if (nodes.size > 5000) throw new AutomationError('reference_limit', '范围过大，请缩小观察范围');
    const entries = new Map<string, Entry>();
    for (const node of nodes) { const e = this.describe(node); entries.set(e.ref, e); }
    const signature = canonical([...entries.values()].map(e => [e.ref, e.signature, e.public]));
    return { entries, signature };
  }
  snapshot(id: string) { const s = this.snapshots.get(id); if (!s) throw new AutomationError('stale', '快照已过期，请重新观察'); return s; }
  assertEntry(snapshot: string, ref: string, token?: string) {
    const source=this.snapshot(snapshot);
    const previous = source.exposed.has(ref) ? source.entries.get(ref) : undefined;
    if (!previous) throw new AutomationError('stale', '该元素未出现在指定观察范围');
    const current = this.describe(previous.node);
    if (!previous.node.isConnected || current.signature !== previous.signature || current.scope !== previous.scope || current.scopeRef !== previous.scopeRef || current.scopeSignature !== previous.scopeSignature) throw new AutomationError('stale', '元素或所在栏目已变化，请重新观察');
    if (token !== undefined && (token !== previous.token || token !== current.token)) throw new AutomationError('stale', '观察后内容已改变，已保留当前值');
    if (current.public.blocked_reason) throw new AutomationError('blocked', current.public.blocked_reason);
    return current;
  }
  observe(params: ObserveParams = {}, extra: Record<string, unknown> = {}) {
    if (params.session_id) this.assertSession(params.session_id);
    if (params.scope_ref && ![...this.snapshots.values()].some(s=>s.exposed.has(params.scope_ref!))) throw new AutomationError('stale', '请先观察页面后使用返回的范围引用');
    const mode = params.mode ?? 'overview';
    let snapshot: Snapshot, offset = 0;
    if (params.cursor) {
      const cursor = this.cursors.get(params.cursor);
      if (!cursor || cursor.scope !== params.scope_ref || cursor.mode !== mode) throw new AutomationError('stale_cursor', '分页条件变化或游标已过期');
      snapshot = this.snapshot(cursor.snapshot); offset = cursor.offset;
      if (this.collect(snapshot.scopeRef).signature !== snapshot.signature) throw new AutomationError('stale_cursor', '页面已变化，请重新观察，不拼接旧分页');
    } else {
      const current = this.collect(params.scope_ref);
      snapshot = { id: crypto.randomUUID(), ...current, order: [...current.entries.keys()], created: Date.now(), scopeRef: params.scope_ref, exposed: new Set<string>() };
      this.snapshots.set(snapshot.id, snapshot);
      while (this.snapshots.size > 20) { const old = this.snapshots.keys().next().value!; this.snapshots.delete(old); for (const [c, v] of this.cursors) if (v.snapshot === old) this.cursors.delete(c); }
    }
    const old = params.snapshot_id ? this.snapshots.get(params.snapshot_id) : undefined;
    let all = snapshot.order.map(ref => snapshot.entries.get(ref)!.public);
    const removed = mode === 'changes' && old ? [...old.entries.keys()].filter(ref => !snapshot.entries.has(ref)) : [];
    if (mode === 'changes' && old) all = all.filter(e => canonical(e) !== canonical(old.entries.get(e.ref)?.public));
    if (mode === 'detail' && params.scope_ref) {
      all = all.map(e => e.ref === params.scope_ref && typeof snapshot.entries.get(e.ref)?.value === 'string' ? { ...e, value: (snapshot.entries.get(e.ref)!.value as string).slice(0, 3000), value_truncated: (snapshot.entries.get(e.ref)!.value as string).length > 3000 } : e);
    }
    const response: Record<string, any> = { protocol_version: '1.0', session_id: this.session, snapshot_id: snapshot.id,
      page: { url: location.href, title: compact(document.title), content_instance: this.instance, bridge_epoch: this.epoch, frame_id: 0, root: 'document', visibility: document.visibilityState, focused: document.hasFocus() },
      mode, scope_ref: params.scope_ref ?? this.id(document.body), elements: [], total: all.length, offset,
      removed_refs: removed.slice(0, 80), requires_full_observation: mode === 'changes' && !old,
      notices: [...(document.querySelector('iframe') ? ['iframe 内的表单尚未支持'] : []), ...([...document.querySelectorAll('*')].some(n => n.shadowRoot) ? ['Shadow DOM 内的表单尚未支持'] : [])], ...extra };
    const limit = params.limit ?? (mode === 'overview' ? 80 : 50), byteSize = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
    while (offset + response.elements.length < all.length && response.elements.length < limit) {
      const item = all[offset + response.elements.length];
      response.elements.push(item);
      if (byteSize(response) > 11200) { response.elements.pop(); break; }
    }
    for(const e of response.elements) for(const ref of [e.ref,e.scope_ref,e.owner_ref,...(e.evidence_refs??[])]) if(ref && snapshot.entries.has(ref))snapshot.exposed.add(ref);
    const next = offset + response.elements.length;
    response.truncated = next < all.length;
    if (response.truncated) { const cursor = crypto.randomUUID(); this.cursors.set(cursor, { snapshot: snapshot.id, offset: next, mode, scope: params.scope_ref }); response.next_cursor = cursor; }
    response.rendered_only = true;
    response.response_bytes = byteSize(response);
    return response;
  }
}
