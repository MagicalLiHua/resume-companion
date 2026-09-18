/** Version-neutral wire contract. The factory accepts Zod 3 (MCP) or Zod 4 (extension). */
export const PROTOCOL_VERSION = '1.0';
export type Scalar = string | boolean;
export type Effect = 'interaction' | 'save_record' | 'save_draft' | 'advance_step' | 'final_submit' | 'unknown';
export type SourceValue = { literal: Scalar } | { source: { version_id: string; profile_revision: number; source_ref: string } };
export type Write = { kind: 'set_value'; ref: string; expected_value_token: string; value: SourceValue }
  | { kind: 'set_checked'; ref: string; expected_value_token: string; checked: boolean }
  | { kind: 'select_option'; ref: string; expected_value_token: string; option_ref?: string; option_value?: string };
export type Action = Write | { kind: 'set_values'; items: Write[] }
  | { kind: 'click'; ref: string; effect_kind: Effect; evidence_refs?: string[]; expected_value_token?: string }
  | { kind: 'press_key'; ref: string; key: 'Escape' | 'ArrowDown' | 'ArrowUp' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'; expected_value_token?: string }
  | { kind: 'scroll'; ref: string; direction: 'up' | 'down' | 'left' | 'right'; pixels?: number };
export type Condition = { kind: 'visible' | 'hidden' | 'expanded' | 'options_ready' | 'structure_changed'; ref: string }
  | { kind: 'value_equals'; ref: string; value: Scalar }
  | { kind: 'text_present'; ref: string; text: string };
export type ObserveParams = { tab_id?: number; session_id?: string; mode?: 'overview' | 'detail' | 'changes' | 'verify'; scope_ref?: string; snapshot_id?: string; operation_ids?: string[]; limit?: number; cursor?: string };
export type ActParams = { session_id: string; snapshot_id: string; operation_id: string; action: Action; wait_for?: Condition; timeout_ms?: number };
export type WaitParams = { session_id: string; snapshot_id: string; condition: Condition; timeout_ms?: number };
export type UndoParams = { session_id: string; operation_ids: string[]; operation_id: string };
export type ProfileParams = { version_id: string; section?: string; record_id?: string; source_refs?: string[]; cursor?: string; limit?: number };
// This is the sole intentionally untyped Zod boundary; both implementations execute identical schemas.
export function createAutomationSchemas(z: any) {
  const id = z.string().min(1).max(160), scalar = z.union([z.string().max(10000), z.boolean()]);
  const object = (shape: Record<string, any>) => z.object(shape).strict();
  const source = object({ version_id: id, profile_revision: z.number().int().nonnegative(), source_ref: z.string().min(1).max(240) });
  const value = z.union([object({ literal: scalar }), object({ source })]);
  const effect = z.enum(['interaction', 'save_record', 'save_draft', 'advance_step', 'final_submit', 'unknown']);
  const writes = [object({ kind: z.literal('set_value'), ref: id, expected_value_token: id, value }),
    object({ kind: z.literal('set_checked'), ref: id, expected_value_token: id, checked: z.boolean() }),
    object({ kind: z.literal('select_option'), ref: id, expected_value_token: id, option_ref: id.optional(), option_value: z.string().max(10000).optional() })];
  const write = z.discriminatedUnion('kind', writes);
  const action = z.discriminatedUnion('kind', [...writes,
    object({ kind: z.literal('set_values'), items: z.array(write).min(1).max(20) }),
    object({ kind: z.literal('click'), ref: id, effect_kind: effect, evidence_refs: z.array(id).max(10).optional(), expected_value_token: id.optional() }),
    object({ kind: z.literal('press_key'), ref: id, key: z.enum(['Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']), expected_value_token: id.optional() }),
    object({ kind: z.literal('scroll'), ref: id, direction: z.enum(['up', 'down', 'left', 'right']), pixels: z.number().int().min(1).max(2000).optional() }),
  ]);
  const condition = z.union([
    object({ kind: z.enum(['visible', 'hidden', 'expanded', 'options_ready', 'structure_changed']), ref: id }),
    object({ kind: z.literal('value_equals'), ref: id, value: scalar }),
    object({ kind: z.literal('text_present'), ref: id, text: z.string().min(1).max(1000) }),
  ]);
  return {
    read_profile: object({ version_id: id, section: z.enum(['basic', 'education', 'experience', 'projects', 'skills', 'certificates', 'custom_answers', 'supplemental_fields']).optional(), record_id: id.optional(), source_refs: z.array(z.string().min(1).max(240)).min(1).max(20).optional(), cursor: id.optional(), limit: z.number().int().min(1).max(50).optional() }),
    observe: object({ tab_id: z.number().int().positive().optional(), session_id: id.optional(), mode: z.enum(['overview', 'detail', 'changes', 'verify']).optional(), scope_ref: id.optional(), snapshot_id: id.optional(), operation_ids: z.array(id).min(1).max(20).optional(), limit: z.number().int().min(1).max(80).optional(), cursor: id.optional() }).superRefine((v: any, ctx: any) => {
      if (Number(v.tab_id !== undefined) + Number(v.session_id !== undefined) !== 1) ctx.addIssue({code:'custom',message:'observe requires exactly one tab_id or session_id'});
      if (v.mode === 'verify' && !v.operation_ids?.length) ctx.addIssue({code:'custom',path:['operation_ids'],message:'verify requires operation_ids'});
    }),
    act: object({ session_id: id, snapshot_id: id, operation_id: id, action, wait_for: condition.optional(), timeout_ms: z.number().int().min(100).max(12000).optional() }).superRefine((v: any, ctx: any) => {
      for (const item of v.action.kind === 'set_values' ? v.action.items : [v.action]) if (item.kind === 'select_option' && Number(item.option_ref !== undefined) + Number(item.option_value !== undefined) !== 1) ctx.addIssue({code:'custom',path:['action'],message:'select_option requires exactly one option_ref or option_value'});
    }),
    wait: object({ session_id: id, snapshot_id: id, condition, timeout_ms: z.number().int().min(100).max(10000).optional() }),
    undo_operations: object({ session_id: id, operation_ids: z.array(id).min(1).max(20), operation_id: id }),
  };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
