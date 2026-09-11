// Generated from backend Pydantic schemas; run scripts/export_contracts.py.
export type SourceItem = { "path": string; "label": string; "group": "basic" | "education" | "experience" | "project" | "skills" | "other"; "value_type": "text" | "enum" | "month" | "list" };
export type WebField = { "field_id": string; "label": string; "group": "basic" | "education" | "experience" | "project" | "skills" | "other"; "group_label": string; "input_kind": "text" | "email" | "tel" | "textarea" | "select-one" | "radio" | "date" | "month" | "checkbox"; "required": boolean; "option_labels": Array<string> };
export type ResolveRequest = { "protocol_version": "1.0"; "request_id": string; "fields": Array<WebField>; "source_catalog": Array<SourceItem> };
export type FieldResult = { "field_id": string; "status": "suggested" | "abstain"; "source_path": string | null; "confidence": number; "reason_code": "LABEL_AND_GROUP_MATCH" | "ALIAS_MATCH" | "AMBIGUOUS_FIELD" | "NO_COMPATIBLE_SOURCE" | "INSUFFICIENT_CONTEXT" };
export type ResolveResponse = { "protocol_version": "1.0"; "request_id": string; "results": Array<FieldResult> };
export type DraftConstraints = { "language": "zh-CN"; "tone": "professional_plain"; "max_characters": number };
export type Fact = { "id": string; "text": string };
export type DraftRequest = { "protocol_version": "1.0"; "request_id": string; "question": string; "job_requirements": Array<string>; "facts": Array<Fact>; "constraints": DraftConstraints };
export type DraftResponse = { "protocol_version": "1.0"; "request_id": string; "status": "needs_review" | "insufficient_facts"; "text": string; "used_fact_ids": Array<string>; "warnings": Array<"INSUFFICIENT_FACTS" | "UNVERIFIED_NUMBER" | "UNVERIFIED_CLAIM" | "UNRESOLVED_PLACEHOLDER" | "LENGTH_LIMIT"> };
