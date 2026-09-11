import { z } from 'zod';
import resolveSchema from './ResolveRequest.schema.json';
import draftSchema from './DraftRequest.schema.json';
import resolveResponseSchema from './ResolveResponse.schema.json';
import draftResponseSchema from './DraftResponse.schema.json';
import catalog from './source-catalog.json';
import type { DraftRequest, DraftResponse, ResolveRequest, ResolveResponse } from './types.generated';

// This module builds explicit network DTOs; it never serializes a whole profile or snapshot.
type JsonSchemaInput = Parameters<typeof z.fromJSONSchema>[0];
const resolveValidator = z.fromJSONSchema(resolveSchema as JsonSchemaInput);
const draftValidator = z.fromJSONSchema(draftSchema as JsonSchemaInput);
const resolveOutput = z.fromJSONSchema(resolveResponseSchema as JsonSchemaInput);
const draftOutput = z.fromJSONSchema(draftResponseSchema as JsonSchemaInput);
const contactPattern = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\d)(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}(?!\d)|(?<!\d)\d{17}[\dXx](?!\w)|(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)|(?:bearer\s+|sk-)[A-Za-z0-9_-]{12,}/gi;
export function redactContacts(text: string) {
  return text.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '').replace(contactPattern, '[已隐藏]');
}
interface FieldMetadata {
  id: string; label: string; groupLabel: string; section: string; kind: string;
  required: boolean; options: { label: string }[]; blocked?: string;
}
export function buildResolveRequest(requestId: string, fields: FieldMetadata[]): ResolveRequest {
  const supported = new Set(['text', 'email', 'tel', 'textarea', 'select-one', 'radio', 'date', 'month', 'checkbox']);
  const groups = new Set(['basic', 'education', 'experience', 'project', 'skills']);
  const body = {
    protocol_version: '1.0', request_id: requestId,
    fields: fields.filter(f => !f.blocked && supported.has(f.kind)).map(f => {
      const group = f.section === 'projects' ? 'project' : f.section;
      return { field_id: f.id, label: redactContacts(f.label), group: groups.has(group) ? group : 'other',
        group_label: redactContacts(f.groupLabel), input_kind: f.kind, required: f.required,
        option_labels: f.options.map(option => redactContacts(option.label)) };
    }),
    source_catalog: catalog,
  };
  const parsed = resolveValidator.parse(body) as ResolveRequest;
  if (new Set(parsed.fields.map(f => f.field_id)).size !== parsed.fields.length) throw new Error('字段标识重复');
  if (parsed.fields.some(f => redactContacts(f.field_id) !== f.field_id)) throw new Error('字段标识包含联系信息');
  return parsed;
}
export function buildDraftRequest(requestId: string, selected: {
  question: string; jobRequirements: string[]; facts: { id: string; text: string }[]; maxCharacters: number;
}): DraftRequest {
  const body = { protocol_version: '1.0', request_id: requestId, question: redactContacts(selected.question),
    job_requirements: selected.jobRequirements.map(redactContacts),
    facts: selected.facts.map(f => ({ id: f.id, text: redactContacts(f.text) })),
    constraints: { language: 'zh-CN', tone: 'professional_plain', max_characters: selected.maxCharacters } };
  const parsed = draftValidator.parse(body) as DraftRequest;
  if (new Set(parsed.facts.map(f => f.id)).size !== parsed.facts.length) throw new Error('事实标识重复');
  if (parsed.facts.some(f => redactContacts(f.id) !== f.id)) throw new Error('事实标识包含联系信息');
  return parsed;
}
export function parseResolveResponse(raw: unknown, request: ResolveRequest): ResolveResponse {
  const response = resolveOutput.parse(raw) as ResolveResponse;
  if (response.request_id !== request.request_id) throw new Error('请求标识不匹配');
  const fields = new Map(request.fields.map(f => [f.field_id, f]));
  const sources = new Map(request.source_catalog.map(s => [s.path, s]));
  if (response.results.length !== fields.size || new Set(response.results.map(r => r.field_id)).size !== fields.size) throw new Error('字段结果不完整');
  for (const result of response.results) {
    const field = fields.get(result.field_id);
    if (!field) throw new Error('未知字段');
    if (result.status === 'abstain') { if (result.source_path !== null) throw new Error('放弃结果包含来源'); continue; }
    const source = sources.get(result.source_path ?? '');
    if (!source || (field.group !== 'other' && field.group !== source.group)) throw new Error('来源不匹配');
    if (field.input_kind === 'checkbox' && (source.path !== 'skills' || field.group !== 'skills')) throw new Error('控件不匹配');
    if (field.input_kind === 'email' && source.path !== 'basic.email') throw new Error('控件不匹配');
    if (field.input_kind === 'tel' && source.path !== 'basic.phone') throw new Error('控件不匹配');
    if (['date', 'month'].includes(field.input_kind) && source.value_type !== 'month') throw new Error('控件不匹配');
  }
  return response;
}
export function parseDraftResponse(raw: unknown, request: DraftRequest): DraftResponse {
  const response = draftOutput.parse(raw) as DraftResponse;
  if (response.request_id !== request.request_id) throw new Error('请求标识不匹配');
  if (Array.from(response.text).length > request.constraints.max_characters) throw new Error('草稿过长');
  const facts = new Map(request.facts.map(f => [f.id, f.text]));
  if (new Set(response.used_fact_ids).size !== response.used_fact_ids.length || response.used_fact_ids.some(id => !facts.has(id))) throw new Error('事实引用不匹配');
  if (response.status === 'needs_review' && (!response.text.trim() || !response.used_fact_ids.length)) throw new Error('草稿缺少依据');
  if (response.status === 'insufficient_facts' && (response.text || response.used_fact_ids.length)) throw new Error('事实不足时不应返回草稿');
  if (response.text.normalize('NFKC').match(contactPattern)) throw new Error('草稿包含联系信息');
  const placeholders = (text: string) => text.match(/\[\[[^\[\]\n]{1,80}\]\]/g) ?? [];
  const known = new Set(response.used_fact_ids.flatMap(id => placeholders(facts.get(id)!)));
  if (placeholders(response.text).some(value => !known.has(value))) throw new Error('未知占位符');
  const remainder = response.text.replace(/\[\[[^\[\]\n]{1,80}\]\]/g, '');
  if (remainder.includes('[[') || remainder.includes(']]')) throw new Error('占位符格式不完整');
  if (response.warnings.some(w => ['UNRESOLVED_PLACEHOLDER', 'LENGTH_LIMIT'].includes(w))) throw new Error('草稿仍需修复');
  return response;
}

export function restoreDraftPlaceholders(text: string, localEntities: Record<string, string>, maxCharacters: number) {
  const restored = text.replace(/\[\[[^\[\]\n]{1,80}\]\]/g, placeholder => {
    if (!Object.hasOwn(localEntities, placeholder)) throw new Error('缺少占位符对应资料');
    return localEntities[placeholder];
  });
  if (restored.includes('[[') || restored.includes(']]')) throw new Error('占位符未完整恢复');
  if (Array.from(restored).length > maxCharacters) throw new Error('恢复资料后的草稿超过网页长度限制');
  return restored;
}
