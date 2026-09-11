from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .catalog import CATALOG_BY_PATH

ID = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")]
Group = Literal["basic", "education", "experience", "project", "skills", "other"]
InputKind = Literal["text", "email", "tel", "textarea", "select-one", "radio", "date", "month", "checkbox"]
Reason = Literal[
    "LABEL_AND_GROUP_MATCH", "ALIAS_MATCH", "AMBIGUOUS_FIELD", "NO_COMPATIBLE_SOURCE", "INSUFFICIENT_CONTEXT"
]
WarningCode = Literal[
    "INSUFFICIENT_FACTS", "UNVERIFIED_NUMBER", "UNVERIFIED_CLAIM", "UNRESOLVED_PLACEHOLDER", "LENGTH_LIMIT"
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class RequestBase(StrictModel):
    protocol_version: Literal["1.0"]
    request_id: ID


class WebField(StrictModel):
    field_id: ID
    label: Annotated[str, Field(min_length=1, max_length=120)]
    group: Group
    group_label: Annotated[str, Field(max_length=80)]
    input_kind: InputKind
    required: bool
    option_labels: list[Annotated[str, Field(max_length=80)]] = Field(max_length=80)


class SourceItem(StrictModel):
    path: Annotated[str, Field(max_length=80)]
    label: Annotated[str, Field(max_length=80)]
    group: Group
    value_type: Literal["text", "enum", "month", "list"]

    @model_validator(mode="after")
    def canonical_metadata(self):
        item = CATALOG_BY_PATH.get(self.path)
        if not item or (self.label, self.group, self.value_type) != (item.label, item.group, item.value_type):
            raise ValueError("Unknown source or altered catalog metadata")
        return self


class ResolveRequest(RequestBase):
    fields: list[WebField] = Field(min_length=1, max_length=40)
    source_catalog: list[SourceItem] = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({f.field_id for f in self.fields}) != len(self.fields):
            raise ValueError("Duplicate fields")
        if len({s.path for s in self.source_catalog}) != len(self.source_catalog):
            raise ValueError("Duplicate sources")
        return self


class FieldResult(StrictModel):
    field_id: ID
    status: Literal["suggested", "abstain"]
    source_path: str | None
    confidence: float = Field(ge=0, le=1)
    reason_code: Reason

    @model_validator(mode="after")
    def consistent(self):
        suggested = self.status == "suggested"
        if suggested != (self.source_path is not None):
            raise ValueError("Inconsistent suggestion")
        if suggested != (self.reason_code in {"LABEL_AND_GROUP_MATCH", "ALIAS_MATCH"}):
            raise ValueError("Inconsistent reason")
        return self


class ResolveOutput(StrictModel):
    results: list[FieldResult] = Field(max_length=40)


class ResolveResponse(ResolveOutput, RequestBase):
    pass


class Fact(StrictModel):
    id: ID
    text: Annotated[str, Field(min_length=1, max_length=500)]


class DraftConstraints(StrictModel):
    language: Literal["zh-CN"]
    tone: Literal["professional_plain"]
    max_characters: int = Field(ge=1, le=1000)


class DraftRequest(RequestBase):
    question: Annotated[str, Field(min_length=1, max_length=1000)]
    job_requirements: list[Annotated[str, Field(min_length=1, max_length=300)]] = Field(max_length=10)
    facts: list[Fact] = Field(max_length=20)
    constraints: DraftConstraints

    @model_validator(mode="after")
    def unique_facts(self):
        if len({f.id for f in self.facts}) != len(self.facts):
            raise ValueError("Duplicate facts")
        return self


class DraftOutput(StrictModel):
    status: Literal["needs_review", "insufficient_facts"]
    text: Annotated[str, Field(max_length=1000)]
    used_fact_ids: list[ID] = Field(max_length=20)
    warnings: list[WarningCode] = Field(max_length=5)

    @model_validator(mode="after")
    def consistent(self):
        if len(set(self.used_fact_ids)) != len(self.used_fact_ids):
            raise ValueError("Duplicate citations")
        if self.status == "needs_review":
            if not self.text.strip() or not self.used_fact_ids or "INSUFFICIENT_FACTS" in self.warnings:
                raise ValueError("Draft lacks evidence")
        elif self.text or self.used_fact_ids or self.warnings != ["INSUFFICIENT_FACTS"]:
            raise ValueError("Insufficient facts cannot yield a draft")
        return self


class DraftResponse(DraftOutput, RequestBase):
    pass


class ErrorDetail(StrictModel):
    code: str
    message: str
    retryable: bool


class ErrorResponse(StrictModel):
    request_id: str
    error: ErrorDetail


class HealthResponse(StrictModel):
    status: Literal["ok"]


class ReadyResponse(StrictModel):
    status: Literal["ready"]
    mode: Literal["mock", "private_model"]
    model: str | None


class Features(StrictModel):
    resolve_fields: bool
    draft_answer: bool


class Limits(StrictModel):
    max_body_bytes: int
    max_fields: int
    max_facts: int
    max_answer_characters: int
    max_input_characters: int
    request_deadline_seconds: float
    max_concurrent: int
    max_concurrent_per_token: int


class CapabilitiesResponse(StrictModel):
    protocol_version: Literal["1.0"]
    mode: Literal["mock", "private_model"]
    features: Features
    limits: Limits


class CatalogResponse(StrictModel):
    protocol_version: Literal["1.0"]
    source_catalog: list[SourceItem]


def abstain(field_id: str, reason="INSUFFICIENT_CONTEXT"):
    return FieldResult(
        field_id=field_id, status="abstain", source_path=None, confidence=0.0, reason_code=reason
    )


def insufficient():
    return DraftOutput(
        status="insufficient_facts", text="", used_fact_ids=[], warnings=["INSUFFICIENT_FACTS"]
    )
