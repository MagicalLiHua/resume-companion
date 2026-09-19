import { createHash, randomUUID } from 'node:crypto';

// The browser runtime is loaded dynamically from a pinned upstream package,
// which does not publish TypeScript declarations for these internal objects.
// Keep the unsafe boundary local to this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

export type ObserveMode = 'overview' | 'focus' | 'delta' | 'full';
export type IncludeValues = 'state' | 'masked' | 'needed';

export interface ObserveRequest {
  page_id: number;
  mode: ObserveMode;
  target?: string;
  scope?: string;
  since_observation_id?: string;
  max_bytes?: number;
  include_values?: IncludeValues;
  include_test_ledger?: boolean;
}

export interface FieldRequest {
  field: string;
  scope?: string;
  value: string | boolean | number;
  overwrite?: boolean;
}

export interface RawField {
  frame: number;
  index: number;
  tag: string;
  role: string;
  type: string;
  label: string;
  scope: string;
  value: string;
  checked: boolean | null;
  disabled: boolean;
  readonly: boolean;
  required: boolean;
  visible: boolean;
  options: string[];
  constraints: {
    minlength: number | null;
    maxlength: number | null;
    min: string | null;
    max: string | null;
    step: string | null;
    pattern: string | null;
  };
  invalid: boolean;
  error: string;
}

export interface RawOverlay {
  frame: number;
  role: string;
  label: string;
  options: string[];
}

export interface RawPageForm {
  url: string;
  title: string;
  fields: RawField[];
  overlays: RawOverlay[];
  sections: string[];
  validations: string[];
}

interface PublicField {
  ref: string;
  label: string;
  scope?: string;
  kind: string;
  state: 'blank' | 'filled' | 'selected' | 'disabled';
  value?: string | boolean;
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
  constraints?: RawField['constraints'];
  options?: string[];
}

interface PublicSnapshot {
  observation_id: string;
  page_id: number;
  navigation_id: string;
  generation: number;
  mode: ObserveMode;
  target?: string;
  scope?: string;
  page: { title: string; url: string };
  sections: string[];
  fields: PublicField[];
  overlays: RawOverlay[];
  validations: string[];
  changes?: {
    fields: PublicField[];
    removed_refs: string[];
    overlays_changed: boolean;
    validations_changed: boolean;
  };
  locality?: {
    mode: 'focused';
    changed_outside_scope: number;
    removed_outside_scope: number;
    outside_change_labels: string[];
    widen_recommended: boolean;
  };
  truncated: boolean;
  omitted_counts: { fields: number; options: number; sections: number; validations: number };
  next_observation?: { mode: 'focus' | 'full'; target?: string; scope?: string };
  metrics: { response_bytes: number; observed_fields: number; returned_fields: number };
  test_ledger?: LedgerEntry[];
}

interface CachedSnapshot {
  observationId: string;
  structuralHash: string;
  fields: PublicField[];
  overlays: RawOverlay[];
  validations: string[];
}

interface PageState {
  navigationId: string;
  url: string;
  generation: number;
  snapshots: Map<string, CachedSnapshot>;
  refToTarget: Map<string, { label: string; scope: string }>;
  latestObservationId?: string;
}

interface LedgerEntry {
  operation_id: string;
  action: string;
  target: string;
  scope?: string;
  result: string;
  created_at: string;
}

interface ActionContext {
  pageId: number;
  expectedGeneration?: number;
  operationId?: string;
  testMode?: boolean;
}

interface TargetSpec {
  field: string;
  scope?: string | undefined;
  option?: string | undefined;
  roles?: string[] | undefined;
}

interface CandidateMeta {
  frame: number;
  index: number;
  label: string;
  scope: string;
  tag: string;
  role: string;
  type: string;
  value: string;
  checked: boolean | null;
  disabled: boolean;
  readonly: boolean;
  visible: boolean;
  score: number;
  constraints: RawField['constraints'];
}

interface ResolvedCandidate {
  frame: AnyRecord;
  meta: CandidateMeta;
}

const DEFAULT_MAX_BYTES = 12_000;
const MAX_MAX_BYTES = 80_000;
const HISTORY_LIMIT = 8;
const ACTION_TIMEOUT = 4_000;
const sensitiveLabelPattern = /(身份证|证件|护照|手机号|联系电话|手机号码|电子邮箱|邮箱|住址|地址|账号|银行卡)/i;
const manualBoundaryPattern = /(最终提交|提交申请|立即申请|确认投递|声明|承诺|同意条款|上传|删除|支付|签署|验证码|密码)/i;

function normalize(value: unknown): string {
  return String(value ?? '').replace(/[\s*：:]+/g, '').trim().toLowerCase();
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slug(value: string): string {
  const normalized = normalize(value);
  if (!normalized) return 'unnamed';
  const latin = normalized.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return latin.slice(0, 56) || 'unnamed';
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 7);
}

function navigationId(url: string): string {
  return `nav_${shortHash(url.split('#')[0] ?? url)}`;
}

function fieldKind(field: RawField): string {
  if (field.type === 'checkbox' || field.role === 'checkbox' || field.role === 'switch') return 'checkbox';
  if (field.type === 'radio' || field.role === 'radio') return 'radio';
  if (field.tag === 'select') return 'select';
  if (field.type === 'date' || field.type === 'month' || field.type === 'datetime-local') return 'date';
  if (field.tag === 'textarea') return 'textarea';
  if (field.tag === 'button' || field.role === 'button') return 'button';
  if (field.role === 'combobox') return 'combobox';
  if (field.role === 'treeitem') return 'treeitem';
  return 'text';
}

function maskEmail(value: string): string {
  const [name, domain] = value.split('@');
  if (!name || !domain) return '<masked>';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

export function maskSensitiveValue(label: string, value: string): string {
  const text = cleanText(value);
  if (!text) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return maskEmail(text);
  if (/^1\d{10}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(-4)}`;
  if (/^\d{15}$|^\d{17}[\dXx]$/.test(text)) return `${text.slice(0, 3)}***********${text.slice(-4)}`;
  if (sensitiveLabelPattern.test(label)) {
    if (text.length <= 4) return '<masked>';
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }
  return text;
}

function publicValue(field: RawField, includeValues: IncludeValues, target?: string): string | boolean | undefined {
  if (field.checked !== null) return field.checked;
  if (!field.value) return undefined;
  if (includeValues === 'state') return undefined;
  const needed = includeValues === 'needed' && target && normalize(field.label).includes(normalize(target));
  if (needed && !sensitiveLabelPattern.test(field.label)) return cleanText(field.value).slice(0, 300);
  return maskSensitiveValue(field.label, field.value).slice(0, 300);
}

function fieldState(field: RawField): PublicField['state'] {
  if (field.disabled) return 'disabled';
  if (field.checked !== null) return field.checked ? 'selected' : 'blank';
  return field.value ? 'filled' : 'blank';
}

function isRelevant(text: string, target?: string, scope?: string): boolean {
  const normalizedText = normalize(text);
  const normalizedTarget = normalize(target);
  const normalizedScope = normalize(scope);
  return (!normalizedTarget || normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText))
    && (!normalizedScope || normalizedText.includes(normalizedScope) || normalizedScope.includes(normalizedText));
}

function structuralHash(raw: RawPageForm): string {
  const structure = {
    fields: raw.fields.map(field => [normalize(field.scope), normalize(field.label), fieldKind(field), field.disabled]),
    overlays: raw.overlays.map(overlay => [overlay.role, normalize(overlay.label), overlay.options.map(normalize)]),
    sections: raw.sections.map(normalize),
  };
  return shortHash(JSON.stringify(structure));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function contentResult(data: AnyRecord, isError = false): AnyRecord {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
    ...(isError ? { isError: true } : {}),
  };
}

function codedError(code: string, message: string, details: AnyRecord = {}): AnyRecord {
  return contentResult({ ok: false, error: { code, message, ...details } }, true);
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ambiguous/i.test(message)) return 'target_ambiguous';
  if (/not found|unresolved|no candidate/i.test(message)) return 'target_unresolved';
  if (/constraint/i.test(message)) return 'constraint_violation';
  if (/manual_boundary/i.test(message)) return 'manual_boundary';
  if (/unknown/i.test(message)) return 'action_result_unknown';
  return 'postcondition_failed';
}

/** Runs inside a page frame. Keep this function self-contained. */
export function collectDomForm(): Omit<RawPageForm, 'url' | 'title'> {
  const text = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const ownLabel = (element: Element): string => {
    const aria = text(element.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map(id => text(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map(label => text(label.textContent)).filter(Boolean).join(' ');
      if (labels) return labels;
      if (element.id) {
        const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(element.id) : element.id.replace(/["\\]/g, '\\$&');
        const explicit = document.querySelector(`label[for="${escaped}"]`);
        if (explicit) return text(explicit.textContent);
      }
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    if (item) {
      const candidate = item.querySelector('label, .ant-form-item-label, .el-form-item__label, legend, [data-label]');
      if (candidate && candidate !== element) {
        const result = text(candidate.textContent);
        if (result) return result;
      }
    }
    const placeholder = text(element.getAttribute('placeholder'));
    if (placeholder) return placeholder;
    const name = text(element.getAttribute('name'));
    if (name) return name;
    return text((element as HTMLElement).innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element: Element): string => {
    let current: Element | null = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      if (current.matches('fieldset')) {
        const legend = current.querySelector(':scope > legend');
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute('aria-label'));
        if (aria) return aria;
        const heading = current.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header');
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
      const record = current.getAttribute('data-record-label');
      if (record) return text(record);
    }
    return '';
  };
  const valueOf = (element: Element): { value: string; checked: boolean | null } => {
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') return { value: element.value, checked: element.checked };
      if (element.type === 'password') return { value: element.value ? '<present>' : '', checked: null };
      return { value: element.value, checked: null };
    }
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) {
      return { value: Array.from(element.selectedOptions).map(option => text(option.textContent)).join(' / '), checked: null };
    }
    const role = element.getAttribute('role');
    if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      return { value: '', checked: element.getAttribute('aria-checked') === 'true' };
    }
    if ((element as HTMLElement).isContentEditable) return { value: text((element as HTMLElement).innerText), checked: null };
    return { value: text(element.getAttribute('aria-valuetext') || element.getAttribute('aria-valuenow') || ''), checked: null };
  };
  const selector = [
    'input:not([type="hidden"])', 'textarea', 'select', 'button', '[contenteditable="true"]',
    '[role="textbox"]', '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[role="button"]', '[role="treeitem"]', '[role="slider"]', '[role="spinbutton"]',
  ].join(',');
  const nodes = Array.from(document.querySelectorAll(selector));
  const fields = nodes.map((element, index) => {
    const value = valueOf(element);
    const input = element instanceof HTMLInputElement ? element : null;
    const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const errorId = element.getAttribute('aria-errormessage');
    const error = errorId ? text(document.getElementById(errorId)?.textContent) : '';
    return {
      frame: 0,
      index,
      tag: element.tagName.toLowerCase(),
      role: text(element.getAttribute('role') || (element instanceof HTMLButtonElement ? 'button' : '')),
      type: text(input?.type || element.getAttribute('type') || ''),
      label: ownLabel(element),
      scope: scopeOf(element),
      value: value.value,
      checked: value.checked,
      disabled: Boolean('disabled' in control && control.disabled) || element.getAttribute('aria-disabled') === 'true',
      readonly: Boolean(input?.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute('aria-readonly') === 'true',
      required: Boolean('required' in control && control.required) || element.getAttribute('aria-required') === 'true',
      visible: visible(element),
      options: element instanceof HTMLSelectElement ? Array.from(element.options).filter(option => !option.disabled).map(option => text(option.textContent)).filter(Boolean) : [],
      constraints: {
        minlength: 'minLength' in control && control.minLength >= 0 ? control.minLength : null,
        maxlength: 'maxLength' in control && control.maxLength >= 0 ? control.maxLength : null,
        min: text(element.getAttribute('min')) || null,
        max: text(element.getAttribute('max')) || null,
        step: text(element.getAttribute('step')) || null,
        pattern: text(element.getAttribute('pattern')) || null,
      },
      invalid: element.getAttribute('aria-invalid') === 'true' || Boolean('validity' in control && !control.validity.valid),
      error,
    };
  }).filter(field => field.label || field.role || field.type);
  const overlayNodes = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [role="tree"], [role="dialog"], .ant-select-dropdown, .ant-cascader-menus, .ant-picker-dropdown, .el-select-dropdown, .el-cascader__dropdown, .el-picker-panel'));
  const overlays = overlayNodes.filter(visible).map(element => ({
    frame: 0,
    role: text(element.getAttribute('role') || 'overlay'),
    label: ownLabel(element) || text(element.getAttribute('aria-label')),
    options: Array.from(element.querySelectorAll('[role="option"], [role="treeitem"], [role="menuitem"], li, td, button'))
      .filter(visible).map(option => ownLabel(option) || text(option.textContent)).filter(Boolean).slice(0, 120),
  }));
  const sections = Array.from(document.querySelectorAll('h1, h2, h3, h4, fieldset > legend, section[aria-label], [role="region"][aria-label]'))
    .filter(visible).map(element => text(element.getAttribute('aria-label') || element.textContent)).filter(Boolean);
  const validations = Array.from(document.querySelectorAll('[role="alert"], [aria-live], .ant-form-item-explain-error, .el-form-item__error, .error, .invalid-feedback'))
    .filter(visible).map(element => text(element.textContent)).filter(Boolean).slice(0, 80);
  return { fields, overlays, sections, validations };
}

/** Runs inside a page frame. Keep this function self-contained. */
function findSemanticCandidates(spec: TargetSpec): CandidateMeta[] {
  const normalized = (value: unknown): string => String(value ?? '').replace(/[\s*：:]+/g, '').trim().toLowerCase();
  const text = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const labelOf = (element: Element): string => {
    const aria = text(element.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map(id => text(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map(label => text(label.textContent)).filter(Boolean).join(' ');
      if (labels) return labels;
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    const itemLabel = item?.querySelector('label, .ant-form-item-label, .el-form-item__label, legend, [data-label]');
    if (itemLabel && itemLabel !== element && text(itemLabel.textContent)) return text(itemLabel.textContent);
    return text(element.getAttribute('placeholder') || element.getAttribute('name') || (element as HTMLElement).innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element: Element): string => {
    let current: Element | null = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      const record = current.getAttribute('data-record-label');
      if (record) return text(record);
      if (current.matches('fieldset')) {
        const legend = current.querySelector(':scope > legend');
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute('aria-label'));
        if (aria) return aria;
        const heading = current.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header');
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
    }
    return '';
  };
  const valueOf = (element: Element): { value: string; checked: boolean | null } => {
    if (element instanceof HTMLInputElement) return element.type === 'checkbox' || element.type === 'radio'
      ? { value: element.value, checked: element.checked }
      : { value: element.value, checked: null };
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) return { value: Array.from(element.selectedOptions).map(option => text(option.textContent)).join(' / '), checked: null };
    const role = element.getAttribute('role');
    if (role === 'checkbox' || role === 'radio' || role === 'switch') return { value: '', checked: element.getAttribute('aria-checked') === 'true' };
    return { value: text(element.getAttribute('aria-valuetext') || (element as HTMLElement).innerText || ''), checked: null };
  };
  const selector = [
    'input:not([type="hidden"])', 'textarea', 'select', 'button', '[contenteditable="true"]',
    '[role="textbox"]', '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[role="button"]', '[role="option"]', '[role="treeitem"]', '[role="menuitem"]',
    '.ant-select-item-option', '.ant-cascader-menu-item', '.el-select-dropdown__item', '.el-cascader-node', 'li',
  ].join(',');
  const target = normalized(spec.option || spec.field);
  const scopeTarget = normalized(spec.scope);
  const roleSet = new Set((spec.roles ?? []).map(normalized));
  return Array.from(document.querySelectorAll(selector)).map((element, index) => {
    const label = labelOf(element);
    const scope = scopeOf(element);
    const labelNorm = normalized(label);
    const scopeNorm = normalized(scope);
    const role = text(element.getAttribute('role') || (element instanceof HTMLButtonElement ? 'button' : ''));
    const type = element instanceof HTMLInputElement ? element.type : text(element.getAttribute('type'));
    let score = 0;
    if (labelNorm === target) score += 120;
    else if (target && labelNorm.includes(target)) score += 72;
    else if (target && target.includes(labelNorm) && labelNorm.length >= 2) score += 48;
    if (scopeTarget && scopeNorm === scopeTarget) score += 55;
    else if (scopeTarget && (scopeNorm.includes(scopeTarget) || scopeTarget.includes(scopeNorm))) score += 28;
    if (scopeTarget && !scopeNorm) score -= 12;
    if (roleSet.size && (roleSet.has(normalized(role)) || roleSet.has(normalized(type)) || roleSet.has(normalized(element.tagName)))) score += 16;
    if (visible(element)) score += 12;
    else score -= 100;
    if ((element as HTMLInputElement).disabled || element.getAttribute('aria-disabled') === 'true') score -= 30;
    const value = valueOf(element);
    const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    return {
      frame: 0,
      index,
      label,
      scope,
      tag: element.tagName.toLowerCase(),
      role,
      type,
      value: value.value,
      checked: value.checked,
      disabled: Boolean('disabled' in control && control.disabled) || element.getAttribute('aria-disabled') === 'true',
      readonly: Boolean(element instanceof HTMLInputElement && element.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute('aria-readonly') === 'true',
      visible: visible(element),
      score,
      constraints: {
        minlength: 'minLength' in control && control.minLength >= 0 ? control.minLength : null,
        maxlength: 'maxLength' in control && control.maxLength >= 0 ? control.maxLength : null,
        min: text(element.getAttribute('min')) || null,
        max: text(element.getAttribute('max')) || null,
        step: text(element.getAttribute('step')) || null,
        pattern: text(element.getAttribute('pattern')) || null,
      },
    };
  }).filter(candidate => candidate.score > 0).sort((left, right) => right.score - left.score).slice(0, 20);
}

/** Runs inside a page frame. Keep this function self-contained. */
function resolveSemanticElement(spec: TargetSpec): Element | null {
  const normalized = (value: unknown): string => String(value ?? '').replace(/[\s*：:]+/g, '').trim().toLowerCase();
  const text = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const labelOf = (element: Element): string => {
    const aria = text(element.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map(id => text(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map(label => text(label.textContent)).filter(Boolean).join(' ');
      if (labels) return labels;
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    const itemLabel = item?.querySelector('label, .ant-form-item-label, .el-form-item__label, legend, [data-label]');
    if (itemLabel && itemLabel !== element && text(itemLabel.textContent)) return text(itemLabel.textContent);
    return text(element.getAttribute('placeholder') || element.getAttribute('name') || (element as HTMLElement).innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element: Element): string => {
    let current: Element | null = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      const record = current.getAttribute('data-record-label');
      if (record) return text(record);
      if (current.matches('fieldset')) {
        const legend = current.querySelector(':scope > legend');
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute('aria-label'));
        if (aria) return aria;
        const heading = current.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header');
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
    }
    return '';
  };
  const selector = [
    'input:not([type="hidden"])', 'textarea', 'select', 'button', '[contenteditable="true"]',
    '[role="textbox"]', '[role="combobox"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[role="button"]', '[role="option"]', '[role="treeitem"]', '[role="menuitem"]',
    '.ant-select-item-option', '.ant-cascader-menu-item', '.el-select-dropdown__item', '.el-cascader-node', 'li',
  ].join(',');
  const target = normalized(spec.option || spec.field);
  const scopeTarget = normalized(spec.scope);
  const roleSet = new Set((spec.roles ?? []).map(normalized));
  const ranked = Array.from(document.querySelectorAll(selector)).map(element => {
    const label = labelOf(element);
    const scope = scopeOf(element);
    const labelNorm = normalized(label);
    const scopeNorm = normalized(scope);
    const role = text(element.getAttribute('role') || (element instanceof HTMLButtonElement ? 'button' : ''));
    const type = element instanceof HTMLInputElement ? element.type : text(element.getAttribute('type'));
    let score = 0;
    if (labelNorm === target) score += 120;
    else if (target && labelNorm.includes(target)) score += 72;
    else if (target && target.includes(labelNorm) && labelNorm.length >= 2) score += 48;
    if (scopeTarget && scopeNorm === scopeTarget) score += 55;
    else if (scopeTarget && (scopeNorm.includes(scopeTarget) || scopeTarget.includes(scopeNorm))) score += 28;
    if (scopeTarget && !scopeNorm) score -= 12;
    if (roleSet.size && (roleSet.has(normalized(role)) || roleSet.has(normalized(type)) || roleSet.has(normalized(element.tagName)))) score += 16;
    if (visible(element)) score += 12;
    else score -= 100;
    if ((element as HTMLInputElement).disabled || element.getAttribute('aria-disabled') === 'true') score -= 30;
    return { element, score };
  }).filter(candidate => candidate.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score === ranked[1]?.score) return null;
  return ranked[0].element;
}

/** Atomic DOM fallback for inputs that are continuously replaced. */
function atomicSetValue(spec: TargetSpec, rawValue: string | boolean | number): { applied: boolean; value: string | boolean | null } {
  const element = resolveSemanticElement(spec);
  if (!element) return { applied: false, value: null };
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    const next = Boolean(rawValue);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    descriptor?.set?.call(element, next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: true, value: element.checked };
  }
  if (element instanceof HTMLSelectElement) {
    const wanted = String(rawValue);
    const option = Array.from(element.options).find(item => item.value === wanted || (item.textContent ?? '').trim() === wanted);
    if (!option || option.disabled) return { applied: false, value: element.value };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    descriptor?.set?.call(element, option.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: true, value: (element.selectedOptions[0]?.textContent ?? element.value).trim() };
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const next = String(rawValue);
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, next);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: next }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: true, value: element.value };
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = String(rawValue);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(rawValue) }));
    return { applied: true, value: element.innerText };
  }
  return { applied: false, value: null };
}

function atomicClick(spec: TargetSpec): { applied: boolean } {
  const element = resolveSemanticElement(spec);
  if (!(element instanceof HTMLElement)) return { applied: false };
  element.focus({ preventScroll: true });
  element.click();
  return { applied: true };
}

export class FormEngine {
  private readonly states = new Map<number, PageState>();
  private readonly ledger = new Map<number, LedgerEntry[]>();
  private readonly completedOperations = new Map<string, AnyRecord>();

  constructor(private readonly getPage: (pageId: number) => AnyRecord) {}

  clear(): void {
    this.states.clear();
    this.ledger.clear();
    this.completedOperations.clear();
  }

  async observe(request: ObserveRequest): Promise<AnyRecord> {
    const maxBytes = Math.min(Math.max(request.max_bytes ?? DEFAULT_MAX_BYTES, 2_000), MAX_MAX_BYTES);
    const includeValues = request.include_values ?? 'state';
    const raw = await this.collect(request.page_id);
    const state = this.updateState(request.page_id, raw);
    const latest = state.latestObservationId ? state.snapshots.get(state.latestObservationId) : undefined;
    const observationId = `obs_${state.generation}_${randomUUID().slice(0, 8)}`;
    const refs = new Map<string, number>();
    const publicFields = raw.fields.map(field => {
      const base = `field:${slug(field.scope || 'page')}/${slug(field.label || `${fieldKind(field)}-${field.index}`)}`;
      const occurrence = (refs.get(base) ?? 0) + 1;
      refs.set(base, occurrence);
      const ref = occurrence === 1 ? base : `${base}~${occurrence}`;
      state.refToTarget.set(ref, { label: field.label, scope: field.scope });
      const value = publicValue(field, includeValues, request.target);
      const constraints = Object.values(field.constraints).some(item => item !== null) ? field.constraints : undefined;
      return {
        ref,
        label: field.label,
        ...(field.scope ? { scope: field.scope } : {}),
        kind: fieldKind(field),
        state: fieldState(field),
        ...(value !== undefined ? { value } : {}),
        ...(field.required ? { required: true } : {}),
        ...(field.readonly ? { readonly: true } : {}),
        ...(field.disabled ? { disabled: true } : {}),
        ...(field.invalid ? { invalid: true } : {}),
        ...(field.error ? { error: field.error.slice(0, 300) } : {}),
        ...(constraints ? { constraints } : {}),
        ...(field.options.length ? { options: field.options.slice(0, 80) } : {}),
      } satisfies PublicField;
    });

    let fields: PublicField[] = publicFields;
    let overlays: RawOverlay[] = raw.overlays.map(overlay => ({ ...overlay, options: overlay.options.slice(0, 100) }));
    let sections: string[] = raw.sections;
    const rawValidations = raw.validations.map(item => item.slice(0, 300));
    let validations: string[] = rawValidations;
    let locality: PublicSnapshot['locality'];
    if (request.mode === 'focus') {
      fields = publicFields.filter(field => isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope));
      overlays = overlays.filter(overlay => !request.target || isRelevant(`${overlay.label} ${overlay.options.join(' ')}`, request.target));
      sections = sections.filter(section => !request.scope || isRelevant(section, undefined, request.scope));
      if (latest) {
        const before = new Map(latest.fields.map(field => [field.ref, field]));
        const now = new Map(publicFields.map(field => [field.ref, field]));
        const changedOutside = publicFields.filter(field => !sameJson(before.get(field.ref), field)
          && !isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope));
        const removedOutside = latest.fields.filter(field => !now.has(field.ref)
          && !isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope));
        locality = {
          mode: 'focused',
          changed_outside_scope: changedOutside.length,
          removed_outside_scope: removedOutside.length,
          outside_change_labels: changedOutside.slice(0, 12).map(field => field.label),
          widen_recommended: changedOutside.length + removedOutside.length > 0,
        };
      }
    }
    if (request.mode === 'overview') {
      overlays = overlays.map(overlay => ({ ...overlay, options: overlay.options.slice(0, 20) }));
      validations = validations.slice(0, 20);
    }

    const previous = request.since_observation_id ? state.snapshots.get(request.since_observation_id) : undefined;
    let changes: PublicSnapshot['changes'];
    if (request.mode === 'delta') {
      if (!previous) {
        return codedError('observation_not_found', '指定的 observation 已过期，请执行一次 overview 或 focus 观察', {
          current_generation: state.generation,
        });
      }
      const before = new Map(previous.fields.map(field => [field.ref, field]));
      const now = new Map(publicFields.map(field => [field.ref, field]));
      const allChanged = publicFields.filter(field => !sameJson(before.get(field.ref), field));
      const allRemoved = previous.fields.filter(field => !now.has(field.ref));
      const focused = Boolean(request.target || request.scope);
      const localChanged = focused
        ? allChanged.filter(field => isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope))
        : allChanged;
      const localRemoved = focused
        ? allRemoved.filter(field => isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope))
        : allRemoved;
      const outsideChanged = focused ? allChanged.filter(field => !localChanged.includes(field)) : [];
      const outsideRemoved = focused ? allRemoved.filter(field => !localRemoved.includes(field)) : [];
      changes = {
        fields: localChanged,
        removed_refs: localRemoved.map(field => field.ref),
        overlays_changed: !sameJson(previous.overlays, raw.overlays),
        validations_changed: !sameJson(previous.validations, rawValidations),
      };
      if (focused) {
        locality = {
          mode: 'focused',
          changed_outside_scope: outsideChanged.length,
          removed_outside_scope: outsideRemoved.length,
          outside_change_labels: outsideChanged.slice(0, 12).map(field => field.label),
          widen_recommended: outsideChanged.length + outsideRemoved.length > 0,
        };
      }
      fields = changes.fields;
      sections = [];
      overlays = changes.overlays_changed ? overlays : [];
      validations = changes.validations_changed ? validations : [];
    }

    const snapshot: PublicSnapshot = {
      observation_id: observationId,
      page_id: request.page_id,
      navigation_id: state.navigationId,
      generation: state.generation,
      mode: request.mode,
      ...(request.target ? { target: request.target } : {}),
      ...(request.scope ? { scope: request.scope } : {}),
      page: { title: raw.title.slice(0, 200), url: raw.url.split('#')[0]?.slice(0, 500) ?? raw.url.slice(0, 500) },
      sections,
      fields,
      overlays,
      validations,
      ...(changes ? { changes } : {}),
      ...(locality ? { locality } : {}),
      truncated: false,
      omitted_counts: { fields: 0, options: 0, sections: 0, validations: 0 },
      metrics: { response_bytes: 0, observed_fields: raw.fields.length, returned_fields: fields.length },
      ...(request.include_test_ledger ? { test_ledger: this.ledger.get(request.page_id) ?? [] } : {}),
    };
    this.fitBudget(snapshot, maxBytes);
    snapshot.metrics.response_bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    snapshot.metrics.returned_fields = snapshot.fields.length;

    const cached: CachedSnapshot = {
      observationId,
      structuralHash: structuralHash(raw),
      fields: publicFields,
      overlays: raw.overlays,
      validations: rawValidations,
    };
    state.snapshots.set(observationId, cached);
    state.latestObservationId = observationId;
    while (state.snapshots.size > HISTORY_LIMIT) {
      const oldest = state.snapshots.keys().next().value as string | undefined;
      if (!oldest) break;
      state.snapshots.delete(oldest);
    }
    return contentResult(snapshot as unknown as AnyRecord);
  }

  async fillFields(params: ActionContext & { fields: FieldRequest[] }): Promise<AnyRecord> {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const results: AnyRecord[] = [];
    for (const field of params.fields) {
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const candidate = await this.resolve(params.pageId, { field: target.label, scope: target.scope, roles: ['input', 'textarea', 'select', 'textbox', 'combobox', 'checkbox', 'radio', 'switch'] });
        const wanted = field.value;
        const currentMatches = this.valueMatches(candidate.meta, wanted);
        if (currentMatches) {
          results.push({ field: field.field, status: 'unchanged' });
          continue;
        }
        if (!field.overwrite && this.hasExistingValue(candidate.meta)) {
          results.push({ field: field.field, status: 'preserved', reason: 'existing_value' });
          continue;
        }
        const constraint = this.constraintError(candidate.meta, wanted);
        if (constraint) {
          results.push({ field: field.field, status: 'constraint_violation', constraint });
          continue;
        }
        await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, wanted);
        const after = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
        results.push(this.valueMatches(after.meta, wanted)
          ? { field: field.field, status: 'filled' }
          : { field: field.field, status: 'postcondition_failed', state: this.safeCandidateState(after.meta) });
      } catch (error) {
        results.push({ field: field.field, status: errorCode(error), message: this.safeError(error) });
      }
    }
    const ok = results.every(result => result.status === 'filled' || result.status === 'unchanged' || result.status === 'preserved');
    const result = contentResult({ ok, operation_id: params.operationId ?? randomUUID(), results, change_summary: this.summarize(results) }, !ok);
    this.recordOperation(params, 'form_fill_fields', `${params.fields.length} fields`, ok ? 'completed' : 'partial', result);
    return result;
  }

  async selectOption(params: ActionContext & { field: string; value: string; scope?: string; query?: string }): Promise<AnyRecord> {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    try {
      const trigger = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      if (trigger.meta.tag === 'select') {
        await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.value);
      } else if (trigger.meta.type === 'radio' || trigger.meta.type === 'checkbox') {
        const option = await this.resolve(params.pageId, { field: params.value, scope: target.scope, roles: ['radio', 'checkbox'] }).catch(() => trigger);
        if (!this.valueMatches(option.meta, true)) await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope }, true);
      } else {
        await this.clickResolved(params.pageId, { field: target.label, scope: target.scope }, true);
        if (params.query) await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.query);
        const option = await this.waitResolve(params.pageId, { field: target.label, scope: target.scope, option: params.value, roles: ['option', 'treeitem', 'menuitem', 'li'] });
        await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, option: params.value }, true);
      }
      await this.delay(30);
      const verified = await this.verifySelected(params.pageId, target, params.value);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        selected: params.value,
        field_state: verified ? 'selected' : 'unknown',
        overlay: await this.overlayState(params.pageId),
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, 'form_select_option', params.field, verified ? 'completed' : 'unknown', result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { field: params.field, value: params.value });
      this.recordOperation(params, 'form_select_option', params.field, 'failed', result);
      return result;
    }
  }

  async selectPath(params: ActionContext & { field: string; path: string[]; scope?: string }): Promise<AnyRecord> {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const completed: string[] = [];
    try {
      await this.clickResolved(params.pageId, { field: target.label, scope: target.scope }, true);
      for (const segment of params.path) {
        const option = await this.waitResolve(params.pageId, { field: target.label, scope: target.scope, option: segment, roles: ['option', 'treeitem', 'menuitem', 'li'] });
        await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, option: segment }, true);
        completed.push(segment);
        await this.delay(35);
      }
      const verified = await this.verifySelected(params.pageId, target, params.path.at(-1) ?? '');
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        field_state: verified ? 'selected' : 'partial',
        overlay: await this.overlayState(params.pageId),
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, 'form_select_path', params.field, verified ? 'completed' : 'partial', result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), {
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        failed_level: completed.length,
      });
      this.recordOperation(params, 'form_select_path', params.field, 'failed', result);
      return result;
    }
  }

  async setDate(params: ActionContext & { field: string; value: string; scope?: string; overwrite?: boolean }): Promise<AnyRecord> {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    try {
      const before = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      if (!params.overwrite && before.meta.value && !this.valueMatches(before.meta, params.value)) {
        return contentResult({ ok: true, operation_id: params.operationId ?? randomUUID(), field: params.field, status: 'preserved', value_state: 'existing' });
      }
      const constraint = this.constraintError(before.meta, params.value);
      if (constraint) return codedError('constraint_violation', constraint, { field: params.field });
      await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.value);
      await this.delay(40);
      const after = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      const verified = this.valueMatches(after.meta, params.value);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        status: verified ? 'filled' : 'partial',
        value_state: verified ? 'matched' : 'mismatched',
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, 'form_set_date', params.field, verified ? 'completed' : 'partial', result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { field: params.field, status: 'partial' });
      this.recordOperation(params, 'form_set_date', params.field, 'failed', result);
      return result;
    }
  }

  async activate(params: ActionContext & { target: string; scope?: string; intent: 'focus' | 'open' | 'close' | 'add_record' | 'save_record' | 'next_step' }): Promise<AnyRecord> {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    if (manualBoundaryPattern.test(params.target)) return codedError('manual_boundary', '该控件属于最终提交、声明、上传或不可逆边界，必须由用户操作', { target: params.target });
    const target = this.expandTarget(params.pageId, params.target, params.scope);
    try {
      const before = await this.collect(params.pageId);
      if (params.intent === 'focus') await this.focusResolved(params.pageId, { field: target.label, scope: target.scope });
      else await this.clickResolved(params.pageId, { field: target.label, scope: target.scope, roles: ['button'] }, params.intent === 'open' || params.intent === 'close');
      await this.delay(60);
      const after = await this.collect(params.pageId);
      const changed = structuralHash(before) !== structuralHash(after) || !sameJson(before.validations, after.validations);
      const accepted = params.intent === 'focus' || changed || params.intent === 'save_record';
      const data = {
        ok: accepted,
        operation_id: params.operationId ?? randomUUID(),
        target: params.target,
        intent: params.intent,
        result: accepted ? 'completed' : 'action_result_unknown',
        page_changed: before.url !== after.url,
        structure_changed: structuralHash(before) !== structuralHash(after),
        overlay: after.overlays.length ? 'open' : 'closed',
      };
      const result = contentResult(data, !accepted);
      this.recordOperation(params, 'form_activate', params.target, accepted ? 'completed' : 'unknown', result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { target: params.target, intent: params.intent });
      this.recordOperation(params, 'form_activate', params.target, 'failed', result);
      return result;
    }
  }

  private async collect(pageId: number): Promise<RawPageForm> {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames() as AnyRecord[];
    const gathered = await Promise.all(frames.map(async (frame, frameIndex) => {
      try {
        const part = await (frame.evaluate as (fn: typeof collectDomForm) => Promise<Omit<RawPageForm, 'url' | 'title'>>)(collectDomForm);
        return {
          ...part,
          fields: part.fields.map(field => ({ ...field, frame: frameIndex })),
          overlays: part.overlays.map(overlay => ({ ...overlay, frame: frameIndex })),
        };
      } catch {
        return { fields: [], overlays: [], sections: [], validations: [] };
      }
    }));
    return {
      url: cleanText((page.pptrPage.url as () => string)()),
      title: cleanText(await (page.pptrPage.title as () => Promise<string>)()),
      fields: gathered.flatMap(part => part.fields),
      overlays: gathered.flatMap(part => part.overlays),
      sections: [...new Set(gathered.flatMap(part => part.sections))],
      validations: [...new Set(gathered.flatMap(part => part.validations))],
    };
  }

  private updateState(pageId: number, raw: RawPageForm): PageState {
    const nav = navigationId(raw.url);
    const existing = this.states.get(pageId);
    if (!existing || existing.navigationId !== nav) {
      const created: PageState = { navigationId: nav, url: raw.url, generation: 1, snapshots: new Map(), refToTarget: new Map() };
      this.states.set(pageId, created);
      return created;
    }
    const latest = existing.latestObservationId ? existing.snapshots.get(existing.latestObservationId) : undefined;
    const currentHash = structuralHash(raw);
    if (latest && latest.structuralHash !== currentHash) existing.generation += 1;
    existing.url = raw.url;
    return existing;
  }

  private fitBudget(snapshot: PublicSnapshot, maxBytes: number): void {
    const byteLength = (): number => Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    const original = {
      fields: snapshot.fields.length,
      options: snapshot.fields.reduce((sum, field) => sum + (field.options?.length ?? 0), 0) + snapshot.overlays.reduce((sum, overlay) => sum + overlay.options.length, 0),
      sections: snapshot.sections.length,
      validations: snapshot.validations.length,
    };
    while (byteLength() > maxBytes && snapshot.overlays.some(overlay => overlay.options.length > 8)) {
      const largest = snapshot.overlays.slice().sort((a, b) => b.options.length - a.options.length)[0];
      if (!largest) break;
      largest.options.pop();
    }
    while (byteLength() > maxBytes && snapshot.fields.some(field => (field.options?.length ?? 0) > 8)) {
      const largest = snapshot.fields.slice().sort((a, b) => (b.options?.length ?? 0) - (a.options?.length ?? 0))[0];
      largest?.options?.pop();
    }
    while (byteLength() > maxBytes && snapshot.fields.length > 1) snapshot.fields.pop();
    while (byteLength() > maxBytes && snapshot.sections.length > 0) snapshot.sections.pop();
    while (byteLength() > maxBytes && snapshot.validations.length > 1) snapshot.validations.pop();
    const currentOptions = snapshot.fields.reduce((sum, field) => sum + (field.options?.length ?? 0), 0) + snapshot.overlays.reduce((sum, overlay) => sum + overlay.options.length, 0);
    snapshot.omitted_counts = {
      fields: original.fields - snapshot.fields.length,
      options: original.options - currentOptions,
      sections: original.sections - snapshot.sections.length,
      validations: original.validations - snapshot.validations.length,
    };
    snapshot.truncated = Object.values(snapshot.omitted_counts).some(value => value > 0);
    if (snapshot.truncated) snapshot.next_observation = { mode: snapshot.target ? 'focus' : 'full', ...(snapshot.target ? { target: snapshot.target } : {}), ...(snapshot.scope ? { scope: snapshot.scope } : {}) };
  }

  private expandTarget(pageId: number, field: string, scope?: string): { label: string; scope?: string } {
    const mapped = this.states.get(pageId)?.refToTarget.get(field);
    return mapped ? { label: mapped.label, ...(mapped.scope ? { scope: mapped.scope } : {}) } : { label: field, ...(scope ? { scope } : {}) };
  }

  private checkGeneration(pageId: number, expected?: number): AnyRecord | null {
    if (expected === undefined) return null;
    const current = this.states.get(pageId)?.generation;
    return current !== undefined && current !== expected
      ? codedError('generation_conflict', '页面结构已经变化，请先执行 focus 或 delta 观察', { expected_generation: expected, current_generation: current })
      : null;
  }

  private async resolve(pageId: number, spec: TargetSpec): Promise<ResolvedCandidate> {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames() as AnyRecord[];
    const candidates: ResolvedCandidate[] = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      if (!frame) continue;
      try {
        const found = await (frame.evaluate as (fn: typeof findSemanticCandidates, value: TargetSpec) => Promise<CandidateMeta[]>)(findSemanticCandidates, spec);
        for (const item of found) candidates.push({ frame, meta: { ...item, frame: frameIndex } });
      } catch {
        // Ignore inaccessible or detached frames and continue with live frames.
      }
    }
    candidates.sort((left, right) => right.meta.score - left.meta.score);
    const best = candidates[0];
    if (!best) throw new Error(`target_unresolved: no candidate for ${spec.option ?? spec.field}`);
    const runnerUp = candidates[1];
    if (runnerUp && runnerUp.meta.score === best.meta.score && normalize(runnerUp.meta.label) === normalize(best.meta.label)) {
      throw new Error(`target_ambiguous: ${spec.option ?? spec.field} matched ${candidates.filter(candidate => candidate.meta.score === best.meta.score).length} controls`);
    }
    return best;
  }

  private async elementHandle(resolved: ResolvedCandidate, spec: TargetSpec): Promise<AnyRecord> {
    const handle = await (resolved.frame.evaluateHandle as (fn: typeof resolveSemanticElement, value: TargetSpec) => Promise<AnyRecord>)(resolveSemanticElement, spec);
    const element = (handle.asElement as () => AnyRecord | null)();
    if (!element) {
      (handle[Symbol.dispose] as (() => void) | undefined)?.();
      throw new Error('target_unresolved: semantic element changed before action');
    }
    return element;
  }

  private async fillResolved(pageId: number, spec: TargetSpec, value: string | boolean | number): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      try {
        let locator = (handle.asLocator as () => AnyRecord)();
        if (typeof locator.setTimeout === 'function') locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === 'function') locator = locator.setWaitForStableBoundingBox(false);
        await (locator.fill as (next: string | boolean) => Promise<void>)(typeof value === 'number' ? String(value) : value);
        return;
      } catch (error) {
        lastError = error;
      } finally {
        (handle[Symbol.dispose] as (() => void) | undefined)?.();
      }
      await this.delay(15);
    }
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames() as AnyRecord[];
    for (const frame of frames) {
      try {
        const result = await (frame.evaluate as (fn: typeof atomicSetValue, arg1: TargetSpec, arg2: string | boolean | number) => Promise<{ applied: boolean }>)(atomicSetValue, spec, value);
        if (result.applied) return;
      } catch {
        // Continue to the next live frame.
      }
    }
    throw new Error(`postcondition_failed: unable to fill semantic target (${this.safeError(lastError)})`);
  }

  private async clickResolved(pageId: number, spec: TargetSpec, allowAtomicFallback: boolean): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      let started = false;
      let locator: AnyRecord;
      const listener = (): void => { started = true; };
      try {
        locator = (handle.asLocator as () => AnyRecord)();
        if (typeof locator.setTimeout === 'function') locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === 'function') locator = locator.setWaitForStableBoundingBox(false);
        (locator.on as ((event: string, callback: () => void) => void) | undefined)?.('action', listener);
        await (locator.click as () => Promise<void>)();
        return;
      } catch (error) {
        lastError = error;
        if (started) throw new Error('action_result_unknown: click started before the node changed', { cause: error });
      } finally {
        (locator?.off as ((event: string, callback: () => void) => void) | undefined)?.('action', listener);
        (handle[Symbol.dispose] as (() => void) | undefined)?.();
      }
      await this.delay(15);
    }
    if (allowAtomicFallback) {
      const page = this.getPage(pageId);
      for (const frame of page.pptrPage.frames() as AnyRecord[]) {
        try {
          const result = await (frame.evaluate as (fn: typeof atomicClick, value: TargetSpec) => Promise<{ applied: boolean }>)(atomicClick, spec);
          if (result.applied) return;
        } catch {
          // Continue.
        }
      }
    }
    throw new Error(`postcondition_failed: unable to activate semantic target (${this.safeError(lastError)})`);
  }

  private async focusResolved(pageId: number, spec: TargetSpec): Promise<void> {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
      await (handle.evaluate as (fn: (element: HTMLElement) => void) => Promise<void>)((element: HTMLElement) => element.focus({ preventScroll: false }));
    } finally {
      (handle[Symbol.dispose] as (() => void) | undefined)?.();
    }
  }

  private async waitResolve(pageId: number, spec: TargetSpec): Promise<ResolvedCandidate> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        return await this.resolve(pageId, spec);
      } catch (error) {
        lastError = error;
        await this.delay(50);
      }
    }
    throw lastError ?? new Error(`option_not_found: ${spec.option ?? spec.field}`);
  }

  private valueMatches(candidate: CandidateMeta, wanted: string | boolean | number): boolean {
    if (candidate.checked !== null) return candidate.checked === Boolean(wanted);
    const actual = normalize(candidate.value);
    const expected = normalize(wanted);
    return actual === expected || actual.includes(expected) || expected.includes(actual) && actual.length > 1;
  }

  private hasExistingValue(candidate: CandidateMeta): boolean {
    if (candidate.checked !== null) return false;
    const value = normalize(candidate.value);
    if (!value) return false;
    return !/^(请选择|选择|未选择|请选择一项|pleasechoose|select)$/.test(value);
  }

  private constraintError(candidate: CandidateMeta, value: string | boolean | number): string | null {
    if (typeof value === 'boolean') return null;
    const text = String(value);
    if (candidate.disabled) return 'target is disabled';
    if (candidate.readonly) return 'target is readonly';
    if (candidate.constraints.maxlength !== null && text.length > candidate.constraints.maxlength) return `value exceeds maxlength ${candidate.constraints.maxlength}`;
    if (candidate.constraints.minlength !== null && text.length < candidate.constraints.minlength) return `value is shorter than minlength ${candidate.constraints.minlength}`;
    if (candidate.constraints.pattern) {
      try {
        if (!new RegExp(`^(?:${candidate.constraints.pattern})$`).test(text)) return `value does not match pattern ${candidate.constraints.pattern}`;
      } catch {
        // Browser accepted a pattern that Node cannot compile; leave validation to the page.
      }
    }
    if (candidate.constraints.min && text < candidate.constraints.min) return `value is below min ${candidate.constraints.min}`;
    if (candidate.constraints.max && text > candidate.constraints.max) return `value is above max ${candidate.constraints.max}`;
    return null;
  }

  private async verifySelected(pageId: number, target: { label: string; scope?: string }, value: string): Promise<boolean> {
    try {
      const field = await this.resolve(pageId, { field: target.label, scope: target.scope });
      if (normalize(field.meta.value).includes(normalize(value))) return true;
      const selected = await this.resolve(pageId, { field: value, scope: target.scope, roles: ['option', 'radio', 'checkbox', 'treeitem'] });
      return selected.meta.checked === true || normalize(selected.meta.value).includes(normalize(value));
    } catch {
      try {
        const raw = await this.collect(pageId);
        const wanted = normalize(value);
        const wantedScope = normalize(target.scope);
        return raw.fields.some(field => {
          const sameScope = !wantedScope || normalize(field.scope).includes(wantedScope) || wantedScope.includes(normalize(field.scope));
          return sameScope && (normalize(field.label).includes(wanted) || normalize(field.value).includes(wanted) || field.options.some(option => normalize(option) === wanted && field.value.includes(option)));
        });
      } catch {
        return false;
      }
    }
  }

  private async overlayState(pageId: number): Promise<'open' | 'closed' | 'unknown'> {
    try {
      return (await this.collect(pageId)).overlays.length ? 'open' : 'closed';
    } catch {
      return 'unknown';
    }
  }

  private safeCandidateState(candidate: CandidateMeta): AnyRecord {
    return {
      label: candidate.label,
      scope: candidate.scope,
      value_state: candidate.value ? 'filled' : candidate.checked ? 'selected' : 'blank',
      disabled: candidate.disabled,
      readonly: candidate.readonly,
    };
  }

  private summarize(results: AnyRecord[]): AnyRecord {
    const summary: Record<string, number> = {};
    for (const result of results) {
      const key = String(result.status ?? 'unknown');
      summary[key] = (summary[key] ?? 0) + 1;
    }
    return summary;
  }

  private operationResult(operationId?: string): AnyRecord | null {
    return operationId ? this.completedOperations.get(operationId) ?? null : null;
  }

  private recordOperation(context: ActionContext, action: string, target: string, resultName: string, result: AnyRecord): void {
    if (context.operationId) this.completedOperations.set(context.operationId, result);
    if (!context.testMode) return;
    const entries = this.ledger.get(context.pageId) ?? [];
    entries.push({
      operation_id: context.operationId ?? randomUUID(),
      action,
      target,
      result: resultName,
      created_at: new Date().toISOString(),
    });
    this.ledger.set(context.pageId, entries.slice(-100));
  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/(cookie|authorization|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>').slice(0, 400);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }
}
