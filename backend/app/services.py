import time

from pydantic import ValidationError

from .catalog import ambiguous_without_group, compatible, known_source
from .errors import APIError
from .safety import BLOCKED, CLAIM, NUMBER, PLACEHOLDER, normalized_text, sensitive
from .schemas import DraftOutput, FieldResult, ResolveOutput, abstain, insufficient


class AssistantService:
    def __init__(self, adapter):
        self.adapter = adapter

    async def validated(self, task, payload, output_type, validate, deadline):
        await self.adapter.prepare()
        for attempt in range(2):
            if time.monotonic() >= deadline:
                raise APIError("MODEL_TIMEOUT")
            try:
                raw = await self.adapter.generate(
                    task, payload, output_type.model_json_schema(), bool(attempt)
                )
                output = output_type.model_validate(raw)
                return validate(output)
            except (ValidationError, ValueError, TypeError, KeyError):
                if attempt:
                    raise APIError("MODEL_OUTPUT_INVALID") from None
            except APIError as error:
                if error.code != "MODEL_OUTPUT_INVALID" or attempt:
                    raise
        raise APIError("MODEL_OUTPUT_INVALID")

    async def resolve(self, request, deadline):
        available = {s.path for s in request.source_catalog}
        protected = {
            f.field_id
            for f in request.fields
            if BLOCKED.search(
                normalized_text(
                    f.label + " " + f.group_label,
                )
            )
            or ambiguous_without_group(f)
        }
        known = {}
        for field in request.fields:
            if field.field_id in protected:
                known[field.field_id] = abstain(field.field_id, "NO_COMPATIBLE_SOURCE")
            elif path := known_source(field, available):
                known[field.field_id] = FieldResult(
                    field_id=field.field_id,
                    status="suggested",
                    source_path=path,
                    confidence=1.0,
                    reason_code="ALIAS_MATCH",
                )
        fields = [f for f in request.fields if f.field_id not in known]
        if not fields:
            return ResolveOutput(results=[known[f.field_id] for f in request.fields])
        payload = request.model_dump(exclude={"request_id", "protocol_version"})
        # Include protocol only for the strict mock parser; no correlation IDs enter the model.
        payload.update(protocol_version="1.0", request_id="model-request")
        payload["fields"] = [f.model_dump() for f in fields]
        by_id = {f.field_id: f for f in fields}

        def validate(output):
            seen = dict(known)
            for result in output.results:
                if result.field_id not in by_id or result.field_id in seen:
                    raise ValueError("Unknown or duplicate field")
                if result.status == "suggested":
                    if result.source_path not in available or not compatible(
                        by_id[result.field_id], result.source_path
                    ):
                        raise ValueError("Source incompatible with this field")
                seen[result.field_id] = result
            return ResolveOutput(
                results=[
                    seen.get(f.field_id)
                    or abstain(
                        f.field_id,
                        "NO_COMPATIBLE_SOURCE" if f.field_id in protected else "INSUFFICIENT_CONTEXT",
                    )
                    for f in request.fields
                ]
            )

        return await self.validated("resolve_fields", payload, ResolveOutput, validate, deadline)

    async def draft(self, request, deadline):
        if not request.facts or not any(f.text.strip() for f in request.facts):
            return insufficient()
        payload = request.model_dump(exclude={"request_id", "protocol_version"})
        facts = {f.id: f.text for f in request.facts}

        def validate(output):
            if output.status == "insufficient_facts":
                return output
            if any(key not in facts for key in output.used_fact_ids):
                raise ValueError("Unknown evidence")
            if len(output.text) > request.constraints.max_characters or sensitive(output.text):
                raise ValueError("Draft violates length or contact constraints")
            if (
                "<" in output.text
                or "```" in output.text
                or "http://" in output.text
                or "https://" in output.text
            ):
                raise ValueError("Draft must be plain text without external links")
            evidence = "\n".join(facts[key] for key in output.used_fact_ids)
            if not set(PLACEHOLDER.findall(output.text)) <= set(PLACEHOLDER.findall(evidence)):
                raise ValueError("Unknown placeholder")
            # Reject malformed placeholders as well, without guessing restoration values.
            remainder = PLACEHOLDER.sub("", output.text)
            if "[[" in remainder or "]]" in remainder:
                raise ValueError("Malformed placeholder")
            warnings = set(output.warnings)
            if {"UNRESOLVED_PLACEHOLDER", "LENGTH_LIMIT"} & warnings:
                raise ValueError("Model reports unresolved content")
            if not set(NUMBER.findall(output.text)) <= set(NUMBER.findall(evidence)):
                warnings.add("UNVERIFIED_NUMBER")
            if not set(CLAIM.findall(output.text)) <= set(CLAIM.findall(evidence)):
                warnings.add("UNVERIFIED_CLAIM")
            output.warnings = sorted(warnings)
            return output

        return await self.validated("draft_answer", payload, DraftOutput, validate, deadline)
