import { createHash, randomUUID } from 'node:crypto';
import { createDomFormRuntime } from './form-dom.js';
import { ControlDriver } from './controls/driver.js';
import { ControlFailure, fencedLocatorAction } from './controls/transaction.js';
import { readCalendarText, parseCalendarValue, sameValue } from './controls/verify.js';
import {manualReason,isManualTarget,manualTasks,type ManualTask,type ManualReason} from './manual-policy.js';
import {UnsupportedFormError} from './planning/capabilities.js';

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
  cursor?: string;
  ledger_cursor?: number;
  ledger_limit?: number;
}

export interface FieldRequest {
  field: string;
  scope?: string;
  value: string | boolean | number;
  overwrite?: boolean;
}

export interface RawField {
  choiceGroup?:{id:string;label:string;answered:boolean;required:boolean};
  policyContext?:string;
  plannerFamily?: 'sd'|'phoenix'|'ud'|'dayee'|'job51'|'guopin';
  inputMode?: 'text' | 'choice' | 'choice_or_custom' | 'date' | 'boolean';
  pendingInput?: boolean;
  datePrecision?: 'date'|'month';
  relatedFields?: string[];
  educationSlot?: 'high_school'|'highest'|'other';
  frame: number;
  index: number;
  identity?: string;
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
  authenticationRequired?:boolean;
  attachments?:Array<{frame:number;scope:string;field:string;required:boolean;state:'pending'|'selected_unverified'|'accepted_ui'}>;
  workflow?: {family:'job51';template:string;steps:string[];current:number;heading:string;next:boolean;optionalAttachment:boolean;manual?:string[]};
  documentId?: string;
  url: string;
  title: string;
  fields: RawField[];
  overlays: RawOverlay[];
  sections: string[];
  validations: string[];
  records?: Array<{identity: string; scope: string; frame: number}>;
}

interface PublicField {
  manual_reason?:ManualReason;
  ref: string;
  label: string;
  scope?: string;
  kind: string;
  input_mode?: RawField['inputMode'];
  commit_state?: 'empty' | 'editing' | 'committed';
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
  manual_tasks?:ManualTask[];
  manual_task_count?:number;
  observation_id: string;
  page_id: number;
  navigation_id: string;
  generation: number;
  mode: ObserveMode;
  target?: string;
  scope?: string;
  page: { title: string; url: string };
  sections: string[];
  records?: Array<{binding:string;scope:string;section:string}>;
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
  coverage?: { total_fields: number; offset: number; returned_fields: number; complete: boolean; next_cursor?: string };
  test_run?: AnyRecord;
}

interface CachedSnapshot {
  observationId: string;
  structuralHash: string;
  fields: PublicField[];
  fieldStates: Record<string, string>;
  overlays: RawOverlay[];
  validations: string[];
}

interface PageState {
  navigationId: string;
  url: string;
  generation: number;
  lastStructuralHash: string;
  snapshots: Map<string, CachedSnapshot>;
  refToTarget: Map<string, { label: string; scope: string; identity?: string; frame?: number }>;
  latestObservationId?: string;
}

export interface RunRecordBinding {
  pageId:number;
  navigationId:string;
  observationId:string;
  scope:string;
  section:string;
  identity?:string;
  frame:number;
  fields:RawField[];
}

interface LedgerEntry {
  operation_id: string;
  action: string;
  target: string;
  scope?: string;
  result: string;
  tracking?: 'semantic' | 'low_level_unverified';
  targets?: string[];
  elapsed_ms?: number;
  created_at: string;
}

interface ActionContext {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  pageId: number;
  expectedGeneration?: number | undefined;
  operationId?: string;
  testMode?: boolean;
}

export interface TargetSpec {
  identity?: string | undefined;
  frame?: number | undefined;
  optionLevel?: number | undefined;
  field: string;
  scope?: string | undefined;
  option?: string | undefined;
  roles?: string[] | undefined;
}

export interface CandidateMeta {
  policyContext?:string;
  plannerFamily?:RawField['plannerFamily'];
  invalid?: boolean;
  identity?: string;
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
const OBSERVE_FRAME_TIMEOUT = 3_500;
const sensitiveLabelPattern = /(身份证|证件|护照|手机号|联系电话|手机号码|电子邮箱|邮箱|住址|地址|账号|银行卡)/i;
const fieldControlRoles = ['input', 'textarea', 'select', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'button'];
const optionRoles = ['option', 'treeitem', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'li', 'button'];

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

function navigationId(url: string, documentId = ''): string {
  return `nav_${shortHash(`${url}|${documentId}`)}`;
}

function fieldKind(field: RawField): string {
  if (field.role === 'date-group') return 'date_group';
  if (field.type === 'checkbox' || field.role === 'checkbox' || field.role === 'switch') return 'checkbox';
  if (field.type === 'radio' || field.role === 'radio') return 'radio';
  if (field.tag === 'select') return 'select';
  if (field.inputMode === 'date' || field.type === 'date' || field.type === 'month' || field.type === 'datetime-local') return 'date';
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
  const normalizedScope = normalize(scope) === 'page' ? '' : normalize(scope);
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
  return contentResult({ ok: false, ...(typeof details.generation === 'number' ? {generation:details.generation} : {}), error: { code, message, ...details } }, true);
}

function errorCode(error: unknown): string {
  if (error instanceof ControlFailure) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|operation_cancelled/i.test(message)) return 'operation_cancelled';
  if (/observe_timeout|phase=.*timeout|timed out/i.test(message)) return 'operation_timeout';
  if (/ambiguous/i.test(message)) return 'target_ambiguous';
  if (/not found|unresolved|no candidate/i.test(message)) return 'target_unresolved';
  if (/constraint/i.test(message)) return 'constraint_violation';
  if (/manual_boundary/i.test(message)) return 'manual_boundary';
  if (/unknown/i.test(message)) return 'action_result_unknown';
  return 'postcondition_failed';
}

// Puppeteer serializes functions without their module closure. Inline the shared DOM
// runtime so observation, targeting and atomic fallbacks use identical semantics.
function domFunction<T>(method: string, parameters: string[]): T {
  return new Function(...parameters, `return (${createDomFormRuntime.toString()})().${method}(${parameters.join(',')});`) as T;
}
export const collectDomForm = domFunction<() => Omit<RawPageForm, 'url' | 'title'>>('collect', []);
const findSemanticCandidates = domFunction<(spec: TargetSpec) => CandidateMeta[]>('candidates', ['spec']);
const resolveSemanticElement = domFunction<(spec: TargetSpec) => Element | null>('resolve', ['spec']);
const atomicSetValue = domFunction<(spec: TargetSpec, value: string | boolean | number) => { applied: boolean }>('setValue', ['spec', 'value']);
const hasDomOverlay = domFunction<(spec: TargetSpec) => boolean>('hasOverlay', ['spec']);
const atomicClick = domFunction<(spec: TargetSpec) => { applied: boolean }>('click', ['spec']);

export class FormEngine {
  private readonly states = new Map<number, PageState>();
  private readonly ledger = new Map<number, LedgerEntry[]>();
  private readonly completedOperations = new Map<string, {fingerprint: string; navigation: string; result: AnyRecord}>();
  private activeSignal: AbortSignal | undefined;
  private readonly expiredOperations = new Set<string>();
  private readonly fieldPages = new Map<string, {pageId: number; generation: number; snapshot: PublicSnapshot; fields: PublicField[]}>();
  private readonly runs = new Map<number, {id: string; total: number; counts: Record<string, number>; elapsed: number}>();
  private actionStartedAt = 0;
  private readonly runBindings = new Map<string,RunRecordBinding>();

  constructor(private readonly getPage: (pageId: number) => AnyRecord,private readonly writePolicy?:(raw:RawPageForm)=>void) {}

  requireSupported(raw:RawPageForm):void {this.writePolicy?.(raw);}

  clear(): void {
    this.states.clear();
    this.ledger.clear();
    this.completedOperations.clear();
    this.expiredOperations.clear();
    this.fieldPages.clear();
    this.runs.clear();
    this.runBindings.clear();
  }

  async captureRun(pageId:number,signal?:AbortSignal):Promise<{raw:RawPageForm;navigationId:string;generation:number}> {
    this.activeSignal=signal;
    signal?.throwIfAborted();
    const raw=await this.collect(pageId);
    signal?.throwIfAborted();
    const state=this.updateState(pageId,raw);
    return {raw,navigationId:state.navigationId,generation:state.generation};
  }

  getRunBinding(token:string,pageId:number,navigationId:string,observationId:string):RunRecordBinding | undefined {
    const binding=this.runBindings.get(token);
    return binding && binding.pageId===pageId && binding.navigationId===navigationId && binding.observationId===observationId
      ? structuredClone(binding) : undefined;
  }

  async capturePlanning(pageId:number,signal?:AbortSignal) {
    const state=await this.captureRun(pageId,signal);
    const observationId=`prepare_${randomUUID()}`;
    const records:Array<{binding:string;scope:string;section:string;frame:number}>=[];
    const scopes=new Set(state.raw.fields.filter(f=>f.tag!=='button' && f.role!=='button').map(f=>`${f.frame}\u0000${f.scope}`));
    for(const key of scopes){
      const [frameText,scope='']=key.split('\u0000'),frame=Number(frameText);
      const record=state.raw.records?.find(r=>r.scope===scope && r.frame===frame);
      const section=scope.replace(/ \/ 第\d+条$/,''),binding=`record_${randomUUID()}`;
      this.runBindings.set(binding,{pageId,navigationId:state.navigationId,observationId,scope,section,frame,
        ...(record?{identity:record.identity}:{}),fields:structuredClone(state.raw.fields.filter(f=>f.scope===scope && f.frame===frame && f.tag!=='button' && f.role!=='button'))});
      records.push({binding,scope,section,frame});
    }
    while(this.runBindings.size>1000)this.runBindings.delete(this.runBindings.keys().next().value!);
    return {page_id:pageId,navigation_id:state.navigationId,observation_id:observationId,raw:state.raw,records};
  }

  async observe(request: ObserveRequest): Promise<AnyRecord> {
    const maxBytes = Math.min(Math.max(request.max_bytes ?? DEFAULT_MAX_BYTES, 2_000), MAX_MAX_BYTES);
    const includeValues = request.include_values ?? 'state';
    let raw: RawPageForm;
    try {
      raw = await this.collect(request.page_id);
    } catch (error) {
      const message = this.safeError(error);
      const timeout = /observe_timeout|timed out|timeout/i.test(message);
      return codedError(timeout ? 'observe_timeout' : 'observe_evaluation_failed', message, {
        phase: 'frame_semantic_scan',
        recovery: timeout ? 'inspect_runtime_status_preserve_unsaved_page' : 'inspect_scan_error',
        page_id: request.page_id,
      });
    }
    const state = this.updateState(request.page_id, raw);
    if (request.cursor) {
      const [id, offsetText] = request.cursor.split(':');
      const stored = this.fieldPages.get(id!);
      const offset = Number(offsetText);
      if (!stored || stored.pageId !== request.page_id || stored.generation !== state.generation || !Number.isInteger(offset) || offset < 0 || offset >= stored.fields.length)
        return codedError('observation_cursor_expired', 'Re-observe after page changes or an expired cursor', {generation: state.generation});
      const snapshot = structuredClone(stored.snapshot);
      snapshot.fields = structuredClone(stored.fields.slice(offset));
      return this.pageFields(snapshot, stored.fields.length, offset, maxBytes);
    }
    const latest = state.latestObservationId ? state.snapshots.get(state.latestObservationId) : undefined;
    const observationId = `obs_${state.generation}_${randomUUID().slice(0, 8)}`;
    const refs = new Map<string, number>();
    const publicFields = raw.fields.map(field => {
      const base = `field:${slug(field.scope || 'page')}/${slug(field.label || `${fieldKind(field)}-${field.index}`)}`;
      const occurrence = (refs.get(base) ?? 0) + 1;
      refs.set(base, occurrence);
      const ref = occurrence === 1 ? base : `${base}~${occurrence}`;
      state.refToTarget.set(ref, { label: field.label, scope: field.scope, ...(field.identity ? { identity: field.identity } : {}), frame: field.frame });
      const value = publicValue(field, includeValues, request.target);
      const constraints = Object.values(field.constraints).some(item => item !== null) ? field.constraints : undefined;
      return {
        ref,
        label: field.label,
        ...(manualReason(field)?{manual_reason:manualReason(field)!}:{}),
        ...(field.scope ? { scope: field.scope } : {}),
        kind: fieldKind(field),
        ...(field.inputMode ? {input_mode:field.inputMode,commit_state:field.pendingInput ? 'editing' as const : field.value || field.checked ? 'committed' as const : 'empty' as const} : {}),
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

    // Compare business state independently of the requested display/masking mode.
    // Hashes remain internal; snapshots and diagnostics never expose raw values.
    const fieldStates = Object.fromEntries(publicFields.map((field, index) => {
      const source = raw.fields[index]!;
      return [field.ref, createHash('sha256').update(JSON.stringify({
        ...field, value: source.value, checked: source.checked,
      })).digest('hex')];
    }));
    const expanded = request.target ? this.expandTarget(request.page_id, request.target, request.scope) : undefined;
    const relevant = (field: PublicField): boolean => request.target?.startsWith('field:')
      ? field.ref === request.target && (!request.scope || request.scope === 'page' || normalize(field.scope) === normalize(request.scope))
      : isRelevant(`${field.scope ?? ''} ${field.label}`, request.target, request.scope);
    let fields: PublicField[] = publicFields;
    let overlays: RawOverlay[] = raw.overlays.map(overlay => ({ ...overlay, options: overlay.options.slice(0, 100) }));
    let sections: string[] = raw.sections;
    const rawValidations = raw.validations.map(item => item.slice(0, 300));
    let validations: string[] = rawValidations;
    let locality: PublicSnapshot['locality'];
    if (request.mode === 'focus') {
      fields = publicFields.filter(field => relevant(field));
      overlays = overlays.filter(overlay => !request.target || isRelevant(`${overlay.label} ${overlay.options.join(' ')}`, expanded?.label ?? request.target));
      sections = sections.filter(section => !request.scope || isRelevant(section, undefined, request.scope));
      if (latest) {
        const now = new Map(publicFields.map(field => [field.ref, field]));
        const changedOutside = publicFields.filter(field => latest.fieldStates[field.ref] !== fieldStates[field.ref]
          && !relevant(field));
        const removedOutside = latest.fields.filter(field => !now.has(field.ref)
          && !relevant(field));
        locality = {
          mode: 'focused',
          changed_outside_scope: changedOutside.length,
          removed_outside_scope: removedOutside.length,
          outside_change_labels: changedOutside.slice(0, 12).map(field => field.label),
          widen_recommended: changedOutside.length + removedOutside.length > 0,
        };
      }
    }
    if (request.mode === 'focus' && request.target && !fields.length && !overlays.length) {
      return codedError('target_unresolved', 'No field or overlay matches the requested target and scope', { target: request.target, generation: state.generation });
    }
    if (request.mode === 'overview') {
      overlays = overlays.map(overlay => ({ ...overlay, options: overlay.options.slice(0, 20) }));
      // Validation evidence must not disappear from overview.
    }

    const previous = request.since_observation_id ? state.snapshots.get(request.since_observation_id) : undefined;
    let changes: PublicSnapshot['changes'];
    if (request.mode === 'delta') {
      if (!previous) {
        return codedError('observation_not_found', '指定的 observation 已过期，请执行一次 overview 或 focus 观察', {
          current_generation: state.generation,
        });
      }
      const now = new Map(publicFields.map(field => [field.ref, field]));
      const allChanged = publicFields.filter(field => previous.fieldStates[field.ref] !== fieldStates[field.ref]);
      const allRemoved = previous.fields.filter(field => !now.has(field.ref));
      const focused = Boolean(request.target || request.scope);
      const localChanged = focused
        ? allChanged.filter(field => relevant(field))
        : allChanged;
      const localRemoved = focused
        ? allRemoved.filter(field => relevant(field))
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

    const records:NonNullable<PublicSnapshot['records']>=[];
    if (request.mode!=='delta') {
      const scopes=new Set(raw.fields.filter(f=>f.tag!=='button' && f.role!=='button').map(f=>`${f.frame}\u0000${f.scope}`));
      for (const key of scopes) {
        const [frameText,scope='']=key.split('\u0000');
        const frame=Number(frameText);
        const record=raw.records?.find(r=>r.scope===scope && r.frame===frame);
        const section=scope.replace(/ \/ 第\d+条$/, '');
        const binding=`record_${randomUUID()}`;
        this.runBindings.set(binding,{pageId:request.page_id,navigationId:state.navigationId,observationId,
          scope,section,frame,...(record?{identity:record.identity}:{}),fields:structuredClone(raw.fields.filter(f=>f.scope===scope && f.frame===frame && f.tag!=='button' && f.role!=='button'))});
        records.push({binding,scope,section});
      }
      while(this.runBindings.size>1000)this.runBindings.delete(this.runBindings.keys().next().value!);
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
      ...(records.length ? {records} : {}),
      fields,
      manual_tasks: manualTasks(raw).slice(0,20),
      manual_task_count: manualTasks(raw).length,
      overlays,
      validations,
      ...(changes ? { changes } : {}),
      ...(locality ? { locality } : {}),
      truncated: false,
      omitted_counts: { fields: 0, options: 0, sections: 0, validations: 0 },
      metrics: { response_bytes: 0, observed_fields: raw.fields.length, returned_fields: fields.length },
      ...(request.include_test_ledger ? this.ledgerPage(request.page_id, request.ledger_cursor ?? 0, request.ledger_limit ?? 0) : {}),
    };
    if (request.mode !== 'delta') {
      this.fieldPages.set(observationId, {pageId: request.page_id, generation: state.generation, snapshot: structuredClone(snapshot), fields: structuredClone(fields)});
      while (this.fieldPages.size > 16) this.fieldPages.delete(this.fieldPages.keys().next().value!);
    }

    const cached: CachedSnapshot = {
      observationId,
      structuralHash: structuralHash(raw),
      fields: publicFields,
      fieldStates,
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
    return this.pageFields(snapshot, fields.length, 0, maxBytes);
  }

  private pageFields(snapshot: PublicSnapshot, total: number, offset: number, maxBytes: number): AnyRecord {
    snapshot.fields = [...snapshot.fields];
    if (snapshot.changes) snapshot.changes.fields = snapshot.fields;
    // Reserve room for coverage metadata and final byte counts.
    this.fitBudget(snapshot, maxBytes - 500);
    const end = offset + snapshot.fields.length;
    snapshot.coverage = {total_fields: total, offset, returned_fields: snapshot.fields.length, complete: end >= total,
      ...(end < total && snapshot.mode !== 'delta' ? {next_cursor: `${snapshot.observation_id}:${end}`} : {})};
    snapshot.metrics.returned_fields = snapshot.fields.length;
    snapshot.metrics.response_bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    if (snapshot.metrics.response_bytes > maxBytes) return codedError('observation_budget_too_small', 'Increase max_bytes or focus a section; no complete inventory was returned');
    return contentResult(snapshot);
  }

  private ledgerPage(pageId: number, cursor: number, limit: number): AnyRecord {
    const entries = this.ledger.get(pageId) ?? [];
    const run = this.runs.get(pageId);
    const first = (run?.total ?? 0) - entries.length;
    const start = Math.max(cursor, first);
    const selected = entries.slice(start - first, start - first + Math.min(limit, 25));
    return {test_run: {run_id: run?.id ?? null, total_operations: run?.total ?? 0, counts: run?.counts ?? {}, tool_elapsed_ms: run?.elapsed ?? 0, retained_from: first,
      next_cursor: limit && start + selected.length < (run?.total ?? 0) ? start + selected.length : null,
      details_requested: limit > 0, cursor_gap: cursor < first}, ...(limit ? {test_ledger: selected} : {})};
  }

  private appendLedger(pageId: number, entry: LedgerEntry): void {
    const run = this.runs.get(pageId) ?? {id: randomUUID(), total: 0, counts: {}, elapsed: 0};
    run.total++;
    if (entry.action !== 'form_batch') run.elapsed += entry.elapsed_ms ?? 0;
    const key = `${entry.tracking}:${entry.action}:${entry.result}`;
    run.counts[key] = (run.counts[key] ?? 0) + 1;
    this.runs.set(pageId, run);
    const entries = this.ledger.get(pageId) ?? [];
    entries.push(entry);
    this.ledger.set(pageId, entries.slice(-5000));
  }

  async fillFields(params: ActionContext & { fields: FieldRequest[] }): Promise<AnyRecord> {
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_fill_fields');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const results: AnyRecord[] = [];
    for (const field of params.fields) {
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const candidate = await this.resolve(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        if (manualReason(candidate.meta)) throw new ControlFailure('manual_boundary', 'fill_preflight');
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
        await this.fillResolved(params.pageId, { ...target, field: target.label, roles: fieldControlRoles }, wanted);
        await this.settleInput(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        const after = await this.resolve(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        results.push(this.valueMatches(after.meta, wanted) && !after.meta.invalid
          ? { field: field.field, status: 'filled' }
          : { field: field.field, status: 'postcondition_failed', state: this.safeCandidateState(after.meta) });
      } catch (error) {
        results.push({ field: field.field, status: errorCode(error), message: this.safeError(error) });
      }
    }
    // A later field can rerender the whole record. Verify the successful prefix
    // once more before returning the ordinary batch, too.
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (!['filled', 'unchanged'].includes(result.status)) continue;
      const field = params.fields[index]!;
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const final = await this.resolve(params.pageId, {...target, field: target.label, roles: fieldControlRoles});
        if (!this.valueMatches(final.meta, field.value) || final.meta.invalid) result.status = 'postcondition_failed';
      } catch { result.status = 'postcondition_failed'; }
    }
    const ok = results.every(result => result.status === 'filled' || result.status === 'unchanged' || result.status === 'preserved');
    const attempted = results.some(result => !['unchanged', 'preserved', 'constraint_violation'].includes(String(result.status)));
    const generation = attempted ? await this.advanceGeneration(params.pageId, beforeGeneration) : this.currentGeneration(params.pageId);
    const result = contentResult({ ok, operation_id: params.operationId ?? randomUUID(), generation, results, change_summary: this.summarize(results) }, !ok);
    this.recordOperation(params, 'form_fill_fields', `${params.fields.length} fields`, ok ? 'completed' : 'partial', result);
    return result;
  }

  async executeBatch(params: ActionContext & {scope: string; steps: AnyRecord[]}): Promise<AnyRecord> {
    if (!params.scope || !params.steps.length || params.steps.length > 16)
      return codedError('invalid_arguments', 'A batch requires one observed record scope and 1–16 steps');
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_batch');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const operationId = params.operationId ?? randomUUID();
    const initialPage = await this.collect(params.pageId);
    const record = initialPage.records?.find(item => item.scope === params.scope);
    if (!record && initialPage.records?.some(item => item.scope.startsWith(`${params.scope} / `)))
      return codedError('target_ambiguous', 'Choose one repeated record scope for this batch');
    const started = Date.now();
    const results: AnyRecord[] = [];
    const checkpoints: Array<{field: string; value: string | number | boolean; date?: boolean; values?: string[]}> = [];
    const deadline = Date.now() + 60_000;
    const batchSignal = AbortSignal.any([AbortSignal.timeout(60_000), ...(params.signal ? [params.signal] : [])]);
    let stopped = false;
    for (const [index, step] of params.steps.entries()) {
      if (batchSignal.aborted || Date.now() >= deadline) {stopped = true; break;}
      if (record && !(await this.collect(params.pageId)).records?.some(item => item.scope === params.scope && item.identity === record.identity && item.frame === record.frame)) {
        results.push({index, action:step.action, status:'blocked', result:{error:{code:'record_changed'}}});
        stopped = true; break;
      }
      const context = {...params, signal: batchSignal, operationId: `${operationId}:${index}`, expectedGeneration: this.currentGeneration(params.pageId), timeoutMs: Math.max(1, deadline - Date.now())};
      let result: AnyRecord;
      if (step.action === 'fill') {
        result = await this.fillFields({...context, fields: step.fields.map((field: FieldRequest) => ({...field, scope: params.scope}))});
      } else if (step.action === 'select') {
        result = await this.selectOption({...context, field: step.field, value: step.value ?? '', values: step.values, selectionMode: step.selection_mode, query: step.query, allowCustom:step.allow_custom, overwrite: step.overwrite});
      } else if (step.action === 'date') {
        result = await this.setDate({...context, field: step.field, value: step.value ?? '', range: step.range, overwrite: step.overwrite});
      } else { result = codedError('invalid_arguments', 'Only fill/select/date steps are supported in a record batch'); }
      const data = result.structuredContent;
      const succeeded = !result.isError && data?.ok !== false && data?.status !== 'preserved'
        && !data?.results?.some((item: AnyRecord) => !['filled','unchanged'].includes(item.status));
      results.push({index, action: step.action, status: succeeded ? 'verified_ui' : 'blocked', result: data});
      if (!succeeded) {stopped = true; break;}
      if (step.action === 'fill') checkpoints.push(...step.fields.map((f: FieldRequest) => ({field: f.field, value: f.value})));
      else if (step.action === 'select') checkpoints.push({field: step.field, value: step.value ?? '', ...(step.values ? {values: data.selected ?? step.values} : {})});
      else checkpoints.push({field: step.field, date: true, value: step.range ? `${step.range.start} / ${step.range.current ? '至今' : step.range.end}` : step.value});
    }
    const verification: AnyRecord[] = [];
    if (!params.signal?.aborted) for (const check of checkpoints) {
      try {
        const target = this.expandTarget(params.pageId, check.field, params.scope);
        const {meta} = await this.resolve(params.pageId, {...target, field: target.label});
        const matched = check.values ? meta.value.split(' / ').filter(Boolean).length === check.values.length && check.values.every(value => meta.value.split(' / ').some(part => sameValue(part, value)))
          : check.date ? sameValue(meta.value, String(check.value)) || readCalendarText(meta.value) === String(check.value)
          : this.valueMatches(meta, check.value);
        verification.push({field: check.field, matched: matched && !meta.invalid});
      } catch { verification.push({field: check.field, matched: false}); }
    }
    const recordUnchanged = !record || !batchSignal.aborted && Boolean((await this.collect(params.pageId)).records?.some(item => item.scope === params.scope && item.identity === record.identity && item.frame === record.frame));
    const ok = recordUnchanged && !batchSignal.aborted && !stopped && results.length === params.steps.length && verification.every(item => item.matched);
    const result = contentResult({ok, operation_id: operationId, generation: this.currentGeneration(params.pageId), scope: params.scope,
      status: ok ? 'verified_ui' : 'partial', results, verification, blocked_step: results.find(item => item.status === 'blocked')?.index ?? null, next_step: results.length < params.steps.length ? results.length : null,
      remaining_steps: params.steps.slice(results.length).map((step,index) => ({index: index + results.length, action: step.action})),
      recovery: ok ? undefined : 'Inspect the blocked step and failed final checks; do not replay completed steps. Use a new operation ID for the corrected remainder.',
      record_unchanged: recordUnchanged, elapsed_ms: Date.now() - started, persistence: 'unknown'}, !ok);
    this.recordOperation({...params, operationId}, 'form_batch', params.scope, ok ? 'completed' : 'partial', result);
    return result;
  }

  async selectOption(params: ActionContext & { field: string; value: string; scope?: string; query?: string; overwrite?: boolean; values?: string[]; selectionMode?: 'add' | 'replace'; allowCustom?:boolean }): Promise<AnyRecord> {
    if (Boolean(params.value) === Boolean(params.values)) return codedError('invalid_arguments', 'Provide either value or values');
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_select_option');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const controlled = await this.runControl(params, 'form_select_option');
    if (controlled) return controlled;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    let sideEffect: 'none' | 'overlay_opened' | 'option_attempted' = 'none';
    try {
      const triggerSpec = { ...target, field: target.label, roles: fieldControlRoles } satisfies TargetSpec;
      const trigger = await this.resolve(params.pageId, triggerSpec);
      if (trigger.meta.tag === 'button') Object.assign(target, { identity: trigger.meta.identity, frame: trigger.meta.frame });
      Object.assign(triggerSpec, target);
      if (trigger.meta.tag === 'select') {
        const unchanged = this.valueMatches(trigger.meta, params.value);
        if (unchanged || !params.overwrite && this.hasExistingValue(trigger.meta)) {
          const status = unchanged ? 'unchanged' : 'preserved';
          const result = contentResult({ok:true,status,generation:beforeGeneration,field:params.field,verification:{level:'ui',matched:unchanged}});
          this.recordOperation(params,'form_select_option',params.field,status,result);return result;
        }
        await this.fillResolved(params.pageId, triggerSpec, params.value);
        sideEffect = 'option_attempted';
      } else if (trigger.meta.type === 'radio' || trigger.meta.type === 'checkbox') {
        const option = await this.resolve(params.pageId, { field: params.value, scope: target.scope, roles: ['radio', 'checkbox'] });
        if (!this.valueMatches(option.meta, true)) {
          await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, roles: ['radio', 'checkbox'] }, true);
          sideEffect = 'option_attempted';
        }
      } else {
        const optionSpec = { ...target, field: target.label, option: params.value, roles: optionRoles } satisfies TargetSpec;
        let option = await this.resolve(params.pageId, optionSpec).catch(() => null);
        if (!option) {
          try {
            if (!await this.hasTargetOverlay(params.pageId, triggerSpec)) await this.clickResolved(params.pageId, triggerSpec, true);
            sideEffect = 'overlay_opened';
          } catch (openError) {
            let optionError: unknown;
            option = await this.waitResolve(params.pageId, optionSpec).catch(error => { optionError = error; return null; });
            if (!option) throw new Error(`${this.safeError(openError)}; option_resolution=${this.safeError(optionError)}`);
            sideEffect = 'overlay_opened';
          }
          if (params.query) await this.fillResolved(params.pageId, triggerSpec, params.query);
          option ??= await this.waitResolve(params.pageId, optionSpec);
        }
        try {
          await this.clickResolved(params.pageId, optionSpec, true);
          sideEffect = 'option_attempted';
        } catch (clickError) {
          const selectedDespiteError = await this.verifySelected(params.pageId, target, params.value);
          if (!selectedDespiteError && !await this.keyboardConfirmActiveOption(params.pageId, params.value)) throw clickError;
          sideEffect = 'option_attempted';
        }
      }
      await this.delay(30);
      const verified = await this.verifySelected(params.pageId, target, params.value);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        generation,
        field: params.field,
        selected: params.value,
        field_state: verified ? 'selected' : 'unknown',
        overlay: await this.overlayState(params.pageId),
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, 'form_select_option', params.field, verified ? 'completed' : 'unknown', result);
      return result;
    } catch (error) {
      const overlay = await this.overlayState(params.pageId);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const partial = sideEffect !== 'none' || overlay === 'open';
      const result = codedError(partial ? 'action_result_unknown' : errorCode(error), this.safeError(error), {
        field: params.field,
        value: params.value,
        generation,
        status: partial ? 'partial' : 'failed',
        side_effects: sideEffect,
        overlay,
        recovery: overlay === 'open' ? 'observe the focused overlay; do not reopen the trigger' : 'focus-observe the field and retry once',
      });
      this.recordOperation(params, 'form_select_option', params.field, partial ? 'partial' : 'failed', result);
      return result;
    }
  }

  async selectPath(params: ActionContext & { field: string; path: string[]; scope?: string; overwrite?: boolean }): Promise<AnyRecord> {
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_select_path');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const controlled = await this.runControl(params, 'form_select_path');
    if (controlled) return controlled;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const completed: string[] = [];
    let overlayOpened = false;
    try {
      const triggerSpec = { ...target, field: target.label, roles: fieldControlRoles } satisfies TargetSpec;
      const trigger = await this.resolve(params.pageId, triggerSpec);
      if (trigger.meta.tag === 'button') Object.assign(target, { identity: trigger.meta.identity, frame: trigger.meta.frame });
      Object.assign(triggerSpec, target);
      const firstOption = { ...target, field: target.label, option: params.path[0]!, optionLevel: 0, roles: optionRoles } satisfies TargetSpec;
      if (!await this.resolve(params.pageId, firstOption).then(() => true).catch(() => false)) {
        try {
          if (!await this.hasTargetOverlay(params.pageId, triggerSpec)) await this.clickResolved(params.pageId, triggerSpec, true);
          overlayOpened = true;
        } catch (openError) {
          if (!await this.waitResolve(params.pageId, firstOption).then(() => true).catch(() => false)) throw openError;
          overlayOpened = true;
        }
      } else {
        overlayOpened = true;
      }
      for (const [index, segment] of params.path.entries()) {
        const option = await this.waitResolve(params.pageId, { ...target, field: target.label, option: segment, optionLevel: index, roles: optionRoles });
        try {
          await this.clickResolved(params.pageId, { ...target, field: target.label, option: segment, optionLevel: index, roles: optionRoles }, true);
        } catch (clickError) {
          const nextSegment = params.path[index + 1];
          const advancedDespiteError = nextSegment
            ? await this.waitResolve(params.pageId, { ...target, field: target.label, option: nextSegment, optionLevel: index + 1, roles: optionRoles }).then(() => true).catch(() => false)
            : await this.verifySelected(params.pageId, target, segment);
          if (!advancedDespiteError) throw clickError;
        }
        completed.push(segment);
        await this.delay(35);
      }
      const verified = await this.verifySelected(params.pageId, target, params.path.join(' / '));
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        generation,
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
      const overlay = await this.overlayState(params.pageId);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const partial = overlayOpened || completed.length > 0 || overlay === 'open';
      const result = codedError(partial ? 'action_result_unknown' : errorCode(error), this.safeError(error), {
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        failed_level: completed.length,
        generation,
        status: partial ? 'partial' : 'failed',
        side_effects: overlayOpened ? 'overlay_opened' : 'none',
        overlay,
        recovery: overlay === 'open' ? 'continue from the visible candidate layer; do not reopen the trigger' : 'focus-observe the field and retry once',
      });
      this.recordOperation(params, 'form_select_path', params.field, partial ? 'partial' : 'failed', result);
      return result;
    }
  }

  async setDate(params: ActionContext & {field: string; value: string; range?: {start:string; end?:string; current?:boolean}; endField?:string; currentField?:string; scope?: string; overwrite?: boolean}): Promise<AnyRecord> {
    if (Boolean(params.value) === Boolean(params.range)) return codedError('invalid_arguments', 'Provide either value or range');
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_set_date');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    return (await this.runControl(params, 'form_set_date'))!;
  }

  private async runControl(params: AnyRecord, action: string): Promise<AnyRecord | null> {
    const before = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const driver = new ControlDriver(this.getPage(params.pageId).pptrPage, {...target, field: target.label}, params);
    try {
      const state = await driver.read();
      if(state.family==='guopin-path'&&action==='form_select_option')throw new ControlFailure('path_required','path_preflight');
      if (action === 'form_select_path' && !['guopin-path', 'ant-path', 'el-path', 'sd-select'].includes(state.family)
        || action === 'form_select_option' && !state.nativeOptions && !['guopin-certificates', 'dayee-dictionary', 'ant-select', 'el-select', 'sd-select', 'ud-select', 'phoenix-select', 'phoenix-radio', 'ant-radio', 'phoenix-autocomplete', 'job51-autocomplete'].includes(state.family)) {
        if (params.values) throw new ControlFailure('unsupported_component', 'multiple_probe');
        return null;
      }
      let outcome: AnyRecord;
      if (action === 'form_set_date') {
        if (state.splitDate) {
          if (params.endField || params.currentField) throw new ControlFailure('invalid_group_endpoints', 'range_parse');
          outcome = await driver.setSplitDate(params.range ?? params.value, params.overwrite);
        } else if (params.range) {
          if (params.endField || params.range.current) outcome = await this.setSeparateRange(params, driver);
          else if (params.range.end) outcome = await driver.setRange(params.range.start, params.range.end, params.overwrite);
          else throw new ControlFailure('missing_range_end', 'range_parse');
        } else outcome = await driver.setDate(params.value, params.overwrite);
      } else if (action === 'form_select_path') outcome = await driver.selectPath(params.path, params.overwrite);
      else if (params.values) outcome = await driver.selectMany(params.values, params.selectionMode, params.overwrite);
      else outcome = await driver.selectOption(params.value, params.overwrite, params.query, undefined, params.allowCustom);
      const generation = driver.tx.dispatched ? await this.advanceGeneration(params.pageId, before) : this.currentGeneration(params.pageId);
      const result = contentResult({...outcome, operation_id: params.operationId ?? randomUUID(), generation, field: params.field, phase: driver.tx.phase, actions: driver.tx.actions});
      this.recordOperation(params, action, params.field, outcome.status, result);
      return result;
    } catch (error) {
      const code = error instanceof ControlFailure ? error.code : errorCode(error);
      const phase = error instanceof ControlFailure ? error.phase : driver.tx.phase;
      const popupClosed=params.cleanupOnFailure ? await driver.dismissOwnedPopup() : false;
      const generation = driver.tx.dispatched && !params.signal?.aborted ? await this.advanceGeneration(params.pageId, before) : this.currentGeneration(params.pageId);
      const evidence = await driver.read().catch(() => null);
      const result = codedError(code, 'The requested control value could not be verified', {
        field: params.field, generation, status: driver.tx.dispatched ? 'partial' : 'blocked', phase,
        side_effects: driver.tx.dispatched ? 'action_dispatched' : 'none', verification: {level: 'ui', matched: false},
        completed_path: driver.tx.progress, actions: driver.tx.actions,
        ...(popupClosed?{popup_cleanup:'closed'}:{}),
        ...(action==='form_set_date'?{calendar_probes:driver.calendarProbes}:{}),
        ...(evidence ? {candidates: evidence.options.slice(0, 40).map(option => ({label: option.label, disabled: option.disabled})), overlay: evidence.expanded ? 'open' : 'closed', selected: evidence.tags} : {}),
      });
      this.recordOperation(params, action, params.field, 'failed', result);
      return result;
    } finally { driver.close(); }
  }
  private async setSeparateRange(params: AnyRecord, start: ControlDriver): Promise<AnyRecord> {
    const range = params.range;
    const a = parseCalendarValue(range.start);
    const b = range.end ? parseCalendarValue(range.end) : null;
    if (!a || range.current && range.end || !range.current && (!b || a.precision !== b.precision || range.start > range.end)) throw new ControlFailure('constraint_violation', 'range_parse');
    if (!params.endField || range.current && !params.currentField) throw new ControlFailure('missing_range_fields', 'range_parse');
    const make = (field: string): ControlDriver => {
      const target = this.expandTarget(params.pageId, field, params.scope);
      if (manualReason(target)) throw new ControlFailure('manual_boundary', 'range_preflight');
      return new ControlDriver(this.getPage(params.pageId).pptrPage, {...target, field: target.label}, {...params, transaction: start.tx});
    };
    const end = make(params.endField);
    const current = params.currentField ? make(params.currentField) : undefined;
    const before = await start.read(), endBefore = await end.read(), currentBefore = current ? await current.read() : undefined;
    if (before.scope !== endBefore.scope || before.document !== endBefore.document || currentBefore && (currentBefore.scope !== before.scope || currentBefore.document !== before.document)) throw new ControlFailure('range_scope_conflict', 'range_preflight');
    if (currentBefore && !/(至今|目前|在职|present|current)/i.test(currentBefore.label)) throw new ControlFailure('unsupported_current_field', 'range_preflight');
    if (before.disabled || currentBefore?.disabled || !range.current && endBefore.disabled && !currentBefore?.checked) throw new ControlFailure('constraint_violation', 'range_preflight');
    if (!params.overwrite && (before.value && readCalendarText(before.value) !== range.start || endBefore.value && (range.current || readCalendarText(endBefore.value) !== range.end) || currentBefore?.checked && !range.current)) {
      return {ok:true,status:'preserved',reason:'existing_value',verification:{level:'ui',matched:false}};
    }
    if (current && !range.current) await current.setBoolean(false);
    await start.setDate(range.start, true);
    if (range.current) {
      await current!.setBoolean(true);
      await start.tx.wait(() => end.read(), state => state.disabled || !state.value, 'range_current_verify');
    } else await end.setDate(range.end, true);
    const finalStart = await start.read(), finalEnd = await end.read();
    if (readCalendarText(finalStart.value) !== range.start || !range.current && readCalendarText(finalEnd.value) !== range.end) throw new ControlFailure('postcondition_failed', 'range_verify');
    return {ok:true,status:'verified_ui',range,verification:{level:'ui',matched:true}};
  }

  async activate(params: ActionContext & { target: string; scope?: string; intent: 'focus' | 'open' | 'close' | 'add_record' | 'save_record' | 'next_step' }): Promise<AnyRecord> {
    const preparation = await this.prepareAction({...params, expectedGeneration: undefined});
    if (preparation) return preparation;
    const cached = this.operationResult(params, 'form_activate');
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    if (isManualTarget(params.target,params.scope)) return codedError('manual_boundary', '该控件必须由用户操作', { target: params.target });
    const beforeGeneration = this.currentGeneration(params.pageId);
    let target = this.expandTarget(params.pageId, params.target, params.scope);
    if (manualReason(target)) return codedError('manual_boundary', '该控件必须由用户操作', { target: params.target });
    let actionStarted = false;
    const markStarted = (): void => { actionStarted = true; };
    // Closing a dropdown is an idempotent postcondition, not a toggle click.
    // A second close must never reopen a previously closed control.
    if(params.intent==='close') {
      // A modal's Cancel button is not the dropdown trigger. Verify the actual
      // containing dialog disappears; a non-expanded button proves nothing.
      if (/^(取消|关闭|cancel|close)$/i.test(target.label.replace(/\s/g,''))) {
        let dialog:AnyRecord;
        try {
          const spec={...target,field:target.label,roles:['button']};
          const resolved=await this.resolve(params.pageId,spec);
          const button=await this.elementHandle(resolved,spec);
          try {dialog=await button.evaluateHandle((el:Element)=>el.closest('[role="dialog"],.ant-modal') || (location.hostname==='c.iguopin.com' && location.pathname==='/resume' && /^(取消|cancel)$/i.test((el.textContent||'').replace(/\s/g,'')) ? el.closest('.item-section .edit-section') : null));}
          finally {await button.dispose();}
          if(!dialog.asElement())throw new Error('target_unresolved: close target is not inside a dialog');
          await this.clickResolved(params.pageId,spec,false,markStarted);
          const deadline=Date.now()+1800;
          let closed=false;
          while(Date.now()<deadline){
            this.activeSignal?.throwIfAborted();
            closed=await dialog.evaluate((el:HTMLElement)=>!el.isConnected || el.getBoundingClientRect().width===0 || getComputedStyle(el).visibility==='hidden' || Boolean(el.closest('[hidden],[aria-hidden="true"]')));
            if(closed)break;
            await this.delay(60);
          }
          if(!closed)throw new Error('postcondition_failed: dialog_close');
          const generation=await this.advanceGeneration(params.pageId,beforeGeneration);
          const result=contentResult({ok:true,operation_id:params.operationId??randomUUID(),generation,target:params.target,intent:'close',result:'completed',overlay:'closed'});
          this.recordOperation(params,'form_activate',params.target,'completed',result);
          return result;
        } catch(error) {
          const generation=actionStarted?await this.advanceGeneration(params.pageId,beforeGeneration):beforeGeneration;
          return codedError(errorCode(error),this.safeError(error),{generation,target:params.target,intent:'close',side_effects:actionStarted?'action_may_have_started':'none',overlay:'unknown'});
        } finally {await dialog?.dispose();}
      }
      const driver=new ControlDriver(this.getPage(params.pageId).pptrPage,{...target,field:target.label},params);
      try {
        await driver.dismissPopup();
        const generation=driver.tx.dispatched?await this.advanceGeneration(params.pageId,beforeGeneration):beforeGeneration;
        const result=contentResult({ok:true,operation_id:params.operationId??randomUUID(),generation,target:params.target,intent:'close',result:'completed',overlay:'closed'});
        this.recordOperation(params,'form_activate',params.target,'completed',result);
        return result;
      } catch(error) {
        const generation=driver.tx.dispatched?await this.advanceGeneration(params.pageId,beforeGeneration):beforeGeneration;
        const state=await driver.read().catch(()=>null);
        const result=codedError(errorCode(error),this.safeError(error),{generation,target:params.target,intent:'close',
          side_effects:driver.tx.dispatched?'action_may_have_started':'none',overlay:state?.expanded?'open':state?'closed':'unknown'});
        this.recordOperation(params,'form_activate',params.target,'failed',result);
        return result;
      } finally {driver.close();}
    }
    try {
      const before = await this.collect(params.pageId);
      if(params.intent==='next_step'&&manualTasks(before).some(t=>t.blocks_navigation))return codedError('manual_boundary','请先处理本页必填的人工事项',{tasks:manualTasks(before),side_effects:'none'});
      let resolvedTarget:ResolvedCandidate;
      try {resolvedTarget=await this.resolve(params.pageId,{...target,field:target.label});}
      catch(error) {
        // A cached add-button identity can disappear after a record rerender.
        // Rebind only before dispatch, in the same named scope, and only if the
        // current label resolves uniquely. Never replay an uncertain click.
        if(params.intent!=='add_record' || !target.identity || !target.scope || errorCode(error)!=='target_unresolved')throw error;
        target={label:target.label,scope:target.scope,...(target.frame!==undefined?{frame:target.frame}:{})};
        resolvedTarget=await this.resolve(params.pageId,{...target,field:target.label,roles:['button']});
      }
      if(manualReason(resolvedTarget.meta))throw new ControlFailure('manual_boundary','activate_preflight');
      const targetScope = resolvedTarget.meta.scope;
      const inScope = (scope: string): boolean => scope === targetScope || scope.startsWith(`${targetScope} / `);
      const oldRecords = new Set((before.records ?? []).filter(record => inScope(record.scope)).map(record => `${record.frame}:${record.identity}`));
      if (params.intent === 'focus') await this.focusResolved(params.pageId, { ...target, field: target.label }, markStarted);
      else {
        const roles = params.intent === 'open' ? fieldControlRoles : ['button'];
        if(params.intent==='open') {
          const driver=new ControlDriver(this.getPage(params.pageId).pptrPage,{...target,field:target.label},params);
          try {
            const state=await driver.read();
            if(state.family!=='native' && state.family!=='phoenix-radio')await driver.openPopup();
            else await this.clickResolved(params.pageId,{...target,field:target.label,roles},true,markStarted);
          } finally {if(driver.tx.dispatched)markStarted();driver.close();}
        } else await this.clickResolved(params.pageId, { ...target, field: target.label, roles }, false, markStarted);
      }
      await this.delay(60);
      let after = await this.collect(params.pageId);
      const added = (): NonNullable<RawPageForm['records']> => (after.records ?? []).filter(record => inScope(record.scope) && !oldRecords.has(`${record.frame}:${record.identity}`));
      if (params.intent === 'add_record') {
        const deadline = Date.now() + 1800;
        while (!added().length && Date.now() < deadline && before.url === after.url) {
          await this.delay(80);
          after = await this.collect(params.pageId);
        }
      }
      const changed = structuralHash(before) !== structuralHash(after) || !sameJson(before.validations, after.validations);
      // This observed Dayee family module reveals its dormant first row and
      // appends another on the first Add. Accept only the verified blank pair;
      // any later multi-add or prefilled side effect remains uncertain.
      const dayeeFamilyPair=params.intent==='add_record'&&resolvedTarget.meta.plannerFamily==='dayee'&&targetScope==='家庭关系'&&oldRecords.size===0&&added().length===2
        &&(after.records??[]).filter(r=>inScope(r.scope)).length===2
        &&added().every(r=>{const fields=after.fields.filter(f=>f.scope===r.scope&&f.frame===r.frame&&f.role!=='button');return fields.some(f=>f.label==='姓名')&&fields.every(f=>!f.value&&f.checked!==true);});
      const accepted = params.intent === 'add_record' ? dayeeFamilyPair || added().length === 1 && (after.records ?? []).filter(r => inScope(r.scope)).length === oldRecords.size + 1
        : params.intent === 'focus' || changed || params.intent === 'save_record';
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: accepted,
        operation_id: params.operationId ?? randomUUID(),
        generation,
        target: params.target,
        intent: params.intent,
        result: params.intent === 'save_record' ? 'action_dispatched' : accepted ? 'completed' : 'action_result_unknown',
        ...(params.intent === 'save_record' ? {status: 'action_dispatched', persistence: 'unknown', verification: {level: 'action', matched: false}} : {}),
        page_changed: before.url !== after.url,
        structure_changed: structuralHash(before) !== structuralHash(after),
        overlay: after.overlays.length ? 'open' : 'closed',
        validations: after.fields.filter(field => field.error).map(field => ({field: field.label, scope: field.scope, error: field.error})),
        ...(dayeeFamilyPair?{record_creation:'dayee_initial_family_pair'}:{}),
        ...(params.intent === 'add_record' ? {added_records: added().map(record => ({scope: record.scope,
          fields: after.fields.filter(field => field.scope === record.scope).map(field => ({label: field.label, kind: fieldKind(field), state: fieldState(field), required: field.required}))}))} : {}),
      };
      const result = contentResult(data, !accepted);
      this.recordOperation(params, 'form_activate', params.target, accepted ? 'completed' : 'unknown', result);
      return result;
    } catch (error) {
      const generation = actionStarted ? await this.advanceGeneration(params.pageId, beforeGeneration) : this.currentGeneration(params.pageId);
      const result = codedError(errorCode(error), this.safeError(error), { target: params.target, intent: params.intent, generation, status: actionStarted ? 'partial' : 'failed', side_effects: actionStarted ? 'action_may_have_started' : 'none' });
      this.recordOperation(params, 'form_activate', params.target, 'failed', result);
      return result;
    }
  }

  private async collect(pageId: number): Promise<RawPageForm> {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames() as AnyRecord[];
    let mainFrameFailed = false;
    let mainFrameError: unknown;
    const gathered = await Promise.all(frames.map(async (frame, frameIndex) => {
      try {
        if(frameIndex>0 && typeof frame.frameElement==='function') {
          const host=await frame.frameElement();
          try {
            if(host && !await host.evaluate((el:HTMLElement)=>{
              for(let node:HTMLElement|null=el;node;node=node.parentElement){
                const style=getComputedStyle(node);
                if(node.hidden || node.getAttribute('aria-hidden')==='true' || style.display==='none' || style.visibility==='hidden')return false;
              }
              const rect=el.getBoundingClientRect();
              // My97 hides a preloaded calendar by moving it to -1970px,
              // while leaving display/visibility unchanged.
              const calendar=el instanceof HTMLIFrameElement&&/\/My97DatePicker\/My97DatePicker\.htm(?:[?#]|$)/i.test(el.src);
              return rect.width>0&&rect.height>0&&(!calendar||rect.bottom>0&&rect.right>0);
            })) return {fields:[],overlays:[],sections:[],validations:[]};
          } finally {await host?.dispose();}
        }
        const part = await this.withTimeout(
          (frame.evaluate as (fn: typeof collectDomForm) => Promise<Omit<RawPageForm, 'url' | 'title'>>)(collectDomForm),
          OBSERVE_FRAME_TIMEOUT,
          `observe_timeout: phase=frame_semantic_scan frame=${frameIndex}`,
        );
        return {
          ...part,
          fields: part.fields.map(field => ({ ...field, frame: frameIndex })),
          overlays: part.overlays.map(overlay => ({ ...overlay, frame: frameIndex })),
        };
      } catch (error) {
        if (frameIndex === 0) { mainFrameFailed = true; mainFrameError = error; }
        return { fields: [], overlays: [], sections: [], validations: [] };
      }
    }));
    if (mainFrameFailed) {
      if (!/observe_timeout|timed out|context.*destroyed|cannot find context|detached.*frame|navigat/i.test(this.safeError(mainFrameError))) throw mainFrameError;
      await this.delay(150);
      try {
        const main = (page.pptrPage.frames() as AnyRecord[])[0];
        if (!main) throw new Error('main frame unavailable');
        const retry = await this.withTimeout(
          (main.evaluate as (fn: typeof collectDomForm) => Promise<Omit<RawPageForm, 'url' | 'title'>>)(collectDomForm),
          OBSERVE_FRAME_TIMEOUT,
          'observe_timeout: phase=frame_semantic_scan frame=0 retry=1 recovery=retry_observation',
        );
        gathered[0] = {
          ...retry,
          fields: retry.fields.map(field => ({ ...field, frame: 0 })),
          overlays: retry.overlays.map(overlay => ({ ...overlay, frame: 0 })),
        };
      } catch (error) {
        throw error;
      }
    }
    return {
      url: cleanText((page.pptrPage.url as () => string)()),
      ...(gathered.some(part=>'authenticationRequired' in part&&part.authenticationRequired)?{authenticationRequired:true}:{}),
      ...(gathered[0]?.documentId ? { documentId: gathered[0].documentId } : {}),
      ...('workflow' in (gathered[0]??{}) && gathered[0]?.workflow ? {workflow:gathered[0].workflow} : {}),
      title: cleanText(await this.withTimeout((page.pptrPage.title as () => Promise<string>)(), OBSERVE_FRAME_TIMEOUT, 'observe_timeout: phase=page_metadata recovery=reload_page')),
      fields: gathered.flatMap(part => part.fields),
      attachments:gathered.flatMap((part,frame)=>('attachments' in part?part.attachments??[]:[]).map(attachment=>({...attachment,frame}))),
      overlays: gathered.flatMap(part => part.overlays),
      sections: [...new Set(gathered.flatMap(part => part.sections))],
      validations: [...new Set(gathered.flatMap(part => part.validations))],
      records: gathered.flatMap((part, frame) => ('records' in part ? part.records ?? [] : []).map(record => ({...record, frame}))),
    };
  }

  private updateState(pageId: number, raw: RawPageForm): PageState {
    const nav = navigationId(raw.url, raw.documentId);
    const currentHash = structuralHash(raw);
    const existing = this.states.get(pageId);
    if (!existing || existing.navigationId !== nav) {
      const created: PageState = { navigationId: nav, url: raw.url, generation: existing ? existing.generation + 1 : 1, lastStructuralHash: currentHash, snapshots: new Map(), refToTarget: new Map() };
      this.states.set(pageId, created);
      return created;
    }
    if (existing.lastStructuralHash !== currentHash) existing.generation += 1;
    existing.lastStructuralHash = currentHash;
    existing.url = raw.url;
    return existing;
  }

  private fitBudget(snapshot: PublicSnapshot, maxBytes: number): void {
    const byteLength = (): number => {
      if (snapshot.records) {
        const scopes=new Set(snapshot.fields.map(f=>f.scope ?? ''));
        snapshot.records=snapshot.records.filter(record=>scopes.has(record.scope));
      }
      return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    };
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

  private expandTarget(pageId: number, field: string, scope?: string): { label: string; scope?: string; identity?: string; frame?: number } {
    const mapped = this.states.get(pageId)?.refToTarget.get(field);
    return mapped ? { ...mapped, ...(scope && scope !== 'page' ? { scope } : {}) } : { label: field, ...(scope ? { scope } : {}) };
  }

  private checkGeneration(pageId: number, expected?: number): AnyRecord | null {
    if (expected === undefined) return null;
    const current = this.states.get(pageId)?.generation;
    return current !== undefined && current !== expected
      ? codedError('generation_conflict', '页面结构已经变化，请先执行 focus 或 delta 观察', { expected_generation: expected, current_generation: current })
      : null;
  }

  private async prepareAction(context: ActionContext): Promise<AnyRecord | null> {
    this.activeSignal = context.signal;
    this.actionStartedAt = Date.now();
    try {
      context.signal?.throwIfAborted();
      const raw = await this.collect(context.pageId);
      this.updateState(context.pageId, raw);
      if(raw.authenticationRequired)return codedError('authentication_required','招聘页面登录已失效，请用户在专用浏览器重新登录',{side_effects:'none'});
      this.requireSupported(raw);
    } catch (error) {
      if(error instanceof UnsupportedFormError)return codedError(error.code,'当前企业模板或页面结构尚未通过填写检查',{support:error.support,side_effects:'none'});
      return codedError('operation_timeout', this.safeError(error), {
        phase: 'action_preflight_observation',
        recovery: 'retry_once_then_reload_page',
        page_id: context.pageId,
      });
    }
    return this.checkGeneration(context.pageId, context.expectedGeneration);
  }

  private currentGeneration(pageId: number): number {
    return this.states.get(pageId)?.generation ?? 1;
  }

  private async advanceGeneration(pageId: number, beforeGeneration: number): Promise<number> {
    try {
      const raw = await this.collect(pageId);
      const state = this.updateState(pageId, raw);
      if (state.generation <= beforeGeneration) state.generation = beforeGeneration + 1;
      return state.generation;
    } catch {
      const state = this.states.get(pageId);
      if (!state) return beforeGeneration + 1;
      state.generation = Math.max(state.generation, beforeGeneration + 1);
      return state.generation;
    }
  }

  recordLowLevelOperation(pageId: number, action: string, operationId: string | undefined, target: string, resultName: string, scope?: string, elapsedMs?: number): void {
    this.appendLedger(pageId, {
      operation_id: operationId ?? randomUUID(),
      action,
      target,
      result: resultName,
      tracking: 'low_level_unverified',
      ...(scope ? {scope} : {}),
      ...(elapsedMs !== undefined ? {elapsed_ms: elapsedMs} : {}),
      created_at: new Date().toISOString(),
    });

  }

  private async resolve(pageId: number, spec: TargetSpec): Promise<ResolvedCandidate> {
    this.activeSignal?.throwIfAborted();
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames() as AnyRecord[];
    const candidates: ResolvedCandidate[] = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      if (!frame || spec.frame !== undefined && spec.frame !== frameIndex) continue;
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
    if (runnerUp && runnerUp.meta.score === best.meta.score) {
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
    const initial = await this.resolve(pageId, spec);
    if(manualReason(initial.meta))throw new ControlFailure('manual_boundary','fill_preflight');
    // Focus before selecting: React can restore the old controlled value on
    // focus. The pinned Locator clears before focus for short text, and writes
    // directly for long text; both paths can bypass application state.
    if (typeof value !== 'boolean' && (initial.meta.tag === 'textarea'
      || initial.meta.tag === 'input' && ['text','search','email','tel','url','password','number'].includes(initial.meta.type))) {
      const deadline=Date.now()+800;
      let moving=false;
      do {
        this.activeSignal?.throwIfAborted();
        const resolved=await this.resolve(pageId,spec);
        if(manualReason(resolved.meta))throw new ControlFailure('manual_boundary','fill_preflight');
        const handle=await this.elementHandle(resolved,spec);
        let dispatched=false;
        try {
          await handle.focus();
          // Poll only preparation while an SPA is replacing the node. A stable
          // focused element avoids inserting into whichever control inherits
          // focus after a detached input. No input is replayed after dispatch.
          if(moving)await this.delay(35);
          const selected = await handle.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
            if (!el.isConnected || el !== document.activeElement) return 'moving';
            if(el.disabled || el.readOnly)return 'unsupported';
            el.select();
            // email/number lack selectionStart; Chromium exposes selected text.
            return el.value === '' || (el.selectionStart === 0 && el.selectionEnd === el.value.length)
              || el.ownerDocument.getSelection()?.toString() === el.value ? 'selected' : 'unsupported';
          });
          if(selected==='moving'){moving=true;continue;}
          if(selected!=='selected')throw new ControlFailure('selection_not_confirmed','fill_replace');
          this.activeSignal?.throwIfAborted();
          if(!await handle.evaluate((el:Element)=>el.isConnected && el===document.activeElement)){moving=true;continue;}
          const keyboard=this.getPage(pageId).pptrPage.keyboard;
          dispatched=true;
          if(String(value))await keyboard.sendCharacter(String(value));
          else await keyboard.press('Backspace');
          this.activeSignal?.throwIfAborted();
          return;
        } catch(error) {
          this.activeSignal?.throwIfAborted();
          if(dispatched || error instanceof ControlFailure || !/detach|not connected|not an Element/i.test(String(error)))throw error;
          moving=true;
        } finally {await handle.dispose();}
      } while(Date.now()<deadline);
      throw new ControlFailure('target_unstable','fill_prepare');
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.activeSignal?.throwIfAborted();
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      try {
        let locator = (handle.asLocator as () => AnyRecord)();
        if (typeof locator.setTimeout === 'function') locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === 'function') locator = locator.setWaitForStableBoundingBox(false);
        await fencedLocatorAction(locator, this.activeSignal, (runner, options) => runner.fill(typeof value === 'number' ? String(value) : value, options), () => {}, [handle]);
        return;
      } catch (error) {
        lastError = error;
      } finally {
        (handle[Symbol.dispose] as (() => void) | undefined)?.();
      }
      await this.delay(15);
    }
    this.activeSignal?.throwIfAborted();
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

  private async settleInput(pageId: number, spec: TargetSpec): Promise<void> {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
      this.activeSignal?.throwIfAborted();
      await handle.evaluate((el: HTMLElement) => el.blur());
      // Two render turns after blur catch controlled-component rejection. Later
      // dependent steps still require final batch verification.
      await resolved.frame.evaluate(() => new Promise<void>(resolve => {
        // Background tabs can suspend rAF. Bound the render fence without
        // leaving any delayed input command behind.
        const timer = setTimeout(resolve, 180);
        requestAnimationFrame(() => requestAnimationFrame(() => {clearTimeout(timer); resolve();}));
      }));
      this.activeSignal?.throwIfAborted();
    } finally { await handle.dispose(); }
  }

  private async clickResolved(pageId: number, spec: TargetSpec, allowAtomicFallback: boolean, onActionStarted?: () => void): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      this.activeSignal?.throwIfAborted();
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      let started = false;
      let locator: AnyRecord;
      const listener = (): void => { this.activeSignal?.throwIfAborted(); started = true; onActionStarted?.(); };
      try {
        await handle.evaluate((el: HTMLElement) => el.scrollIntoView({block:'center',inline:'center'}));
        let previousBox = '';
        let ready = false;
        for (let sample = 0; sample < 12; sample++) {
          this.activeSignal?.throwIfAborted();
          const hit = await handle.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {box: [r.x,r.y,r.width,r.height].join(','), hit: r.width > 0 && r.height > 0 && Boolean(top && (top === el || el.contains(top)))};
          });
          if (hit.hit && hit.box === previousBox) {ready = true; break;}
          previousBox = hit.box;
          await this.delay(50);
        }
        if (!ready) throw new ControlFailure('target_obscured', 'activate_hit_test');
        // The stable hit test above already proved visibility. Locator.click
        // repeats IntersectionObserver checks that can stall in background tabs.
        // Use the same frame-aware, trusted mouse dispatch as ControlDriver.
        const enabled=await handle.evaluate((el:HTMLElement)=>el.isConnected && !el.matches(':disabled,[aria-disabled="true"]') && !el.closest('[inert]'));
        if(!enabled)throw new ControlFailure('constraint_violation','activate_disabled');
        const point=await handle.clickablePoint();
        this.activeSignal?.throwIfAborted();
        listener();
        await this.getPage(pageId).pptrPage.mouse.click(point.x,point.y);
        return;
      } catch (error) {
        lastError = error;
        if (error instanceof ControlFailure && error.code === 'target_obscured') throw error;
        if (started) throw new Error('action_result_unknown: click started before the node changed', { cause: error });
      } finally {
        (locator?.off as ((event: string, callback: () => void) => void) | undefined)?.('action', listener);
        (handle[Symbol.dispose] as (() => void) | undefined)?.();
      }
      await this.delay(15);
    }
    this.activeSignal?.throwIfAborted();
    if (allowAtomicFallback) {
      const page = this.getPage(pageId);
      for (const frame of page.pptrPage.frames() as AnyRecord[]) {
        try {
          const result = await (frame.evaluate as (fn: typeof atomicClick, value: TargetSpec) => Promise<{ applied: boolean }>)(atomicClick, spec);
          if (result.applied) { onActionStarted?.(); return; }
        } catch {
          // Continue.
        }
      }
    }
    throw new Error(`postcondition_failed: unable to activate semantic target (${this.safeError(lastError)})`);
  }

  private async focusResolved(pageId: number, spec: TargetSpec, onActionStarted?: () => void): Promise<void> {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
      onActionStarted?.();
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

  private async keyboardConfirmActiveOption(pageId: number, value: string): Promise<boolean> {
    const page = this.getPage(pageId);
    const wanted = normalize(value);
    for (const frame of page.pptrPage.frames() as AnyRecord[]) {
      try {
        const active = await (frame.evaluate as (fn: (expected: string) => boolean, expected: string) => Promise<boolean>)((expected: string) => {
          const norm = (item: unknown): string => String(item ?? '').replace(/[\s*：:]+/g, '').trim().toLowerCase();
          const focused = document.activeElement;
          const activeId = focused?.getAttribute('aria-activedescendant');
          const byId = activeId ? document.getElementById(activeId) : null;
          const highlighted = byId ?? document.querySelector('[role="option"][aria-selected="true"], .ant-select-item-option-active, .el-select-dropdown__item.hover, .el-cascader-node.in-active-path');
          return Boolean(highlighted && norm((highlighted as HTMLElement).innerText || highlighted.textContent) === expected);
        }, wanted);
        if (!active) continue;
        this.activeSignal?.throwIfAborted();
        await (page.pptrPage.keyboard.press as (key: string) => Promise<void>)('Enter');
        await this.delay(30);
        return true;
      } catch {
        // Try the next live frame.
      }
    }
    return false;
  }

  private valueMatches(candidate: CandidateMeta, wanted: string | boolean | number): boolean {
    if (candidate.checked !== null) return typeof wanted === 'boolean' && candidate.checked === wanted;
    return sameValue(candidate.value, String(wanted));
  }

  private hasExistingValue(candidate: CandidateMeta): boolean {
    if (candidate.checked !== null) return false;
    const value = normalize(candidate.value);
    if (!value) return false;
    return !/^(请选择.*|选择.*|未选择.*|尚未选择.*|打开.*|pleasechoose.*|select)$/.test(value);
  }

  private constraintError(candidate: CandidateMeta, value: string | boolean | number): string | null {
    if (candidate.disabled) return 'target is disabled';
    if (candidate.checked !== null && typeof value !== 'boolean') return 'checkbox/radio value must be boolean';
    if (typeof value === 'boolean') return null;
    const text = String(value);
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

  private async verifySelected(pageId: number, target: { label: string; scope?: string; identity?: string; frame?: number }, value: string): Promise<boolean> {
    try {
      const field = await this.resolve(pageId, { ...target, field: target.label, roles: fieldControlRoles });
      if (field.meta.checked !== null) return field.meta.checked;
      return sameValue(field.meta.value, value);
    } catch {
      return false;
    }
  }

  private async hasTargetOverlay(pageId: number, spec: TargetSpec): Promise<boolean> {
    const frames = this.getPage(pageId).pptrPage.frames() as AnyRecord[];
    for (const [index, frame] of frames.entries()) {
      if (spec.frame !== undefined && spec.frame !== index) continue;
      try { if (await frame.evaluate(hasDomOverlay, spec)) return true; } catch { /* Detached frame. */ }
    }
    return false;
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

  private operationFingerprint(params: AnyRecord, action: string): string {
    const {signal: _signal, expectedGeneration: _generation, operationId: _id, testMode: _test, timeoutMs: _timeout, ...request} = params;
    return createHash('sha256').update(JSON.stringify({action, request})).digest('hex');
  }

  private operationResult(params: AnyRecord, action: string): AnyRecord | null {
    const cached = params.operationId ? this.completedOperations.get(params.operationId) : undefined;
    if (!cached) return params.operationId && this.expiredOperations.has(shortHash(params.operationId)) ? codedError('operation_expired', 'Observe before retrying with a new operation ID') : null;
    if (cached.fingerprint !== this.operationFingerprint(params, action) || cached.navigation !== this.states.get(params.pageId)?.navigationId) {
      return codedError('operation_id_conflict', 'This operation ID belongs to a different request or document');
    }
    return cached.result;
  }

  private recordOperation(context: ActionContext, action: string, target: string, resultName: string, result: AnyRecord): void {
    if (context.operationId) {
      this.completedOperations.set(context.operationId, {fingerprint: this.operationFingerprint(context, action), navigation: this.states.get(context.pageId)?.navigationId ?? '', result});
      if (this.completedOperations.size > 256) {
        const oldest = this.completedOperations.keys().next().value!;
        this.expiredOperations.add(shortHash(oldest));
        this.completedOperations.delete(oldest);
      }
    }
    if (!context.testMode) return;
    this.appendLedger(context.pageId, {
      operation_id: context.operationId ?? randomUUID(),
      action,
      target,
      result: resultName,
      tracking: 'semantic',
      ...((context as AnyRecord).scope ? {scope: (context as AnyRecord).scope} : {}),
      ...((context as AnyRecord).fields ? {targets: (context as AnyRecord).fields.map((f: FieldRequest) => `${f.scope ?? ''} / ${f.field}`)} : {}),
      elapsed_ms: result.structuredContent?.elapsed_ms ?? Math.max(0, Date.now() - this.actionStartedAt),
      created_at: new Date().toISOString(),
    });

  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/(cookie|authorization|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>').slice(0, 400);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  private async withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
