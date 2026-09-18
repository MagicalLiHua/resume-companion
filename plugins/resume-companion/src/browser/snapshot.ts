import { createHash, randomUUID } from 'node:crypto';
import { canonical, type Scalar } from '../protocol.js';
import { evaluateSafety } from './safety-policy.js';
import { BrowserError } from './errors.js';

export type AxNode = {
  id: string;
  role?: string;
  name?: string;
  value?: string | number;
  description?: string;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  focusable?: boolean;
  multiline?: boolean;
  children?: AxNode[];
  [key: string]: unknown;
};

export type NormalizedElement = {
  ref: string;
  uid: string;
  role: string;
  kind: string;
  name: string;
  scope_ref: string;
  value: Scalar | null;
  expected_value_token?: string;
  allowed_actions: string[];
  blocked_reason?: string;
  effect_kind?: string;
  option_ref?: string;
  owner_ref?: string;
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  disabled?: boolean;
  description?: string;
  evidence_refs?: string[];
  validation?: { state: 'unknown'; messages: string[] };
  in_viewport: true;
  [key: string]: unknown;
};

type FlatNode = { node: AxNode; parent?: FlatNode; children: FlatNode[]; ref: string };
export type SnapshotEntry = { node: AxNode; flat: FlatNode; public: NormalizedElement; token: string; value: Scalar | null };
export type NormalizedSnapshot = {
  id: string;
  pageId: number;
  url: string;
  title: string;
  entries: Map<string, SnapshotEntry>;
  uidToRef: Map<string, string>;
  order: string[];
  signature: string;
  createdAt: number;
  exposed: Set<string>;
};

const actionableRoles = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'checkbox', 'radio', 'switch', 'button', 'link', 'tab', 'option', 'treeitem']);
const structuralRoles = new Set(['RootWebArea', 'WebArea', 'form', 'group', 'region', 'article', 'listitem', 'dialog', 'alert', 'status', 'heading', 'listbox', 'tree']);
const scopeRoles = new Set(['form', 'group', 'region', 'article', 'listitem', 'dialog']);

function kindFor(node: AxNode): string {
  switch (node.role) {
    case 'textbox': return node.multiline ? 'textarea' : 'text';
    case 'searchbox': return 'text';
    case 'spinbutton': return 'number';
    case 'switch': return 'checkbox';
    case 'RootWebArea':
    case 'WebArea': return 'document';
    default: return node.role ?? 'unknown';
  }
}

function valueFor(node: AxNode): Scalar | null {
  if (typeof node.checked === 'boolean') return node.checked;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  if (node.role === 'checkbox' || node.role === 'radio' || node.role === 'switch') return false;
  if (node.role === 'textbox' || node.role === 'searchbox' || node.role === 'combobox' || node.role === 'spinbutton') return '';
  return null;
}

function tokenFor(node: AxNode, value: Scalar | null): string {
  return createHash('sha256').update(canonical([node.id, node.role, node.name, value, node.disabled, node.expanded, node.selected])).digest('base64url').slice(0, 22);
}

function flatten(root: AxNode, refForUid: (uid: string) => string): FlatNode[] {
  const result: FlatNode[] = [];
  const visit = (node: AxNode, parent?: FlatNode): FlatNode => {
    const flat: FlatNode = { node, ...(parent ? { parent } : {}), children: [], ref: refForUid(node.id) };
    result.push(flat);
    flat.children = (node.children ?? []).map(child => visit(child, flat));
    return flat;
  };
  visit(root);
  return result;
}

function scopeOf(flat: FlatNode): FlatNode {
  let current: FlatNode | undefined = flat.parent;
  while (current) {
    if (scopeRoles.has(current.node.role ?? '')) return current;
    current = current.parent;
  }
  let root = flat;
  while (root.parent) root = root.parent;
  return root;
}

function nearestOwner(flat: FlatNode, all: FlatNode[]): FlatNode | undefined {
  let current = flat.parent;
  while (current) {
    if (current.node.role === 'combobox' || current.node.role === 'listbox') return current;
    current = current.parent;
  }
  const expanded = all.filter(candidate => candidate.node.role === 'combobox' && candidate.node.expanded === true);
  return expanded.length === 1 ? expanded[0] : undefined;
}

function contextOf(flat: FlatNode): string {
  const names: string[] = [];
  let current = flat.parent;
  while (current) {
    const name = String(current.node.name ?? '').trim();
    if (name && !names.includes(name)) names.push(name);
    current = current.parent;
  }
  return names.slice(0, 5).join(' / ');
}

function allowedActions(kind: string, blocked: boolean, node: AxNode): string[] {
  if (blocked || node.disabled) return [];
  if (['text', 'textarea', 'number', 'slider'].includes(kind)) return ['set_value', 'press_key'];
  if (kind === 'combobox') return ['set_value', 'select_option', 'click', 'press_key'];
  if (kind === 'checkbox' || kind === 'radio') return ['set_checked', 'click'];
  if (['button', 'link', 'tab', 'option', 'treeitem'].includes(kind)) return ['click'];
  return [];
}

export class ReferenceBook {
  private readonly refs = new Map<string, string>();
  private sequence = 0;
  refForUid = (uid: string): string => {
    const existing = this.refs.get(uid);
    if (existing) return existing;
    const ref = `e${++this.sequence}`;
    this.refs.set(uid, ref);
    return ref;
  };
}

export function normalizeSnapshot(input: { root: AxNode; pageId: number; url: string; title: string; references: ReferenceBook }): NormalizedSnapshot {
  const flat = flatten(input.root, input.references.refForUid);
  const entries = new Map<string, SnapshotEntry>();
  const uidToRef = new Map<string, string>();
  for (const item of flat) uidToRef.set(item.node.id, item.ref);
  for (const item of flat) {
    const node = item.node;
    const role = node.role ?? 'unknown';
    const name = String(node.name ?? '').trim();
    if (!actionableRoles.has(role) && !structuralRoles.has(role) && !name) continue;
    const kind = kindFor(node);
    const scope = scopeOf(item);
    const value = valueFor(node);
    const token = tokenFor(node, value);
    const safety = evaluateSafety({ name, role: kind, context: contextOf(item), ...(node.description ? { description: node.description } : {}) });
    const owner = role === 'option' || role === 'treeitem' ? nearestOwner(item, flat) : undefined;
    const element: NormalizedElement = {
      ref: item.ref,
      uid: node.id,
      role,
      kind,
      name,
      scope_ref: scope.ref,
      value,
      allowed_actions: allowedActions(kind, safety.blocked, node),
      effect_kind: safety.effect,
      in_viewport: true,
    };
    if (actionableRoles.has(role) && !safety.blocked) element.expected_value_token = token;
    if (safety.reason) element.blocked_reason = safety.reason;
    if (node.expanded !== undefined) element.expanded = node.expanded;
    if (node.selected !== undefined) element.selected = node.selected;
    if (node.required !== undefined) element.required = node.required;
    if (node.disabled !== undefined) element.disabled = node.disabled;
    if (node.description) element.description = node.description;
    if (['text', 'textarea', 'number', 'combobox', 'checkbox', 'radio', 'slider'].includes(kind)) element.validation = { state: 'unknown', messages: [] };
    if (owner) {
      element.owner_ref = owner.ref;
      element.option_ref = item.ref;
    }
    if (['button', 'link', 'tab'].includes(kind)) element.evidence_refs = [item.ref, scope.ref];
    entries.set(item.ref, { node, flat: item, public: element, token, value });
  }
  const order = [...entries.keys()];
  return {
    id: randomUUID(),
    pageId: input.pageId,
    url: input.url,
    title: input.title,
    entries,
    uidToRef,
    order,
    signature: createHash('sha256').update(canonical(order.map(ref => entries.get(ref)?.public))).digest('base64url'),
    createdAt: Date.now(),
    exposed: new Set<string>(),
  };
}

export function assertSnapshotEntry(snapshot: NormalizedSnapshot, ref: string, expectedToken?: string, requireExposed = true): SnapshotEntry {
  const entry = snapshot.entries.get(ref);
  if (!entry || (requireExposed && !snapshot.exposed.has(ref))) throw new BrowserError('stale', '元素没有出现在指定观察范围中，请重新观察');
  if (expectedToken !== undefined && entry.token !== expectedToken) throw new BrowserError('stale', '观察后字段内容已改变，已保留当前值');
  if (entry.public.blocked_reason) throw new BrowserError('blocked', entry.public.blocked_reason);
  return entry;
}

export function descendantsOf(entry: SnapshotEntry, snapshot: NormalizedSnapshot): Set<string> {
  const refs = new Set<string>([entry.public.ref]);
  const walk = (node: FlatNode): void => {
    for (const child of node.children) {
      refs.add(child.ref);
      walk(child);
    }
  };
  walk(entry.flat);
  for (const candidate of snapshot.entries.values()) if (candidate.public.owner_ref === entry.public.ref) refs.add(candidate.public.ref);
  return refs;
}
