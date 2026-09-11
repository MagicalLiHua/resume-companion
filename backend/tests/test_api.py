import json
from pathlib import Path

import pytest
from conftest import ORIGIN, TOKEN, TOKEN_B, update_token

from app.admin import atomic_json, issue
from app.auth import TokenFile
from app.config import Settings


def test_health_capabilities_contract_and_ready(client, headers):
    health = client.get("/healthz")
    assert health.json() == {"status": "ok"}
    assert health.headers["cache-control"] == "no-store"
    assert len(health.headers["x-request-id"]) == 36
    assert client.get("/v1/capabilities", headers=headers).json()["mode"] == "mock"
    assert client.get("/v1/readiness", headers=headers).json()["status"] == "ready"
    assert len(client.get("/v1/source-catalog", headers=headers).json()["source_catalog"]) == 25
    schema = client.get("/v1/openapi.json", headers=headers).json()
    assert schema["paths"]["/v1/fields/resolve"]["post"]["security"] == [{"BearerToken": []}]


@pytest.mark.parametrize(
    "path", ["/v1/capabilities", "/v1/readiness", "/v1/source-catalog", "/v1/openapi.json"]
)
def test_every_private_get_requires_token(client, path):
    assert client.get(path).status_code == 401


def test_invalid_token_and_live_revocation(client, config, headers):
    assert (
        client.get("/v1/capabilities", headers={"Authorization": "Bearer invalid"}).json()["error"]["code"]
        == "TOKEN_INVALID"
    )
    update_token(config, enabled=False)
    assert client.get("/v1/capabilities", headers=headers).status_code == 401
    assert client.get("/v1/capabilities", headers={"Authorization": f"Bearer {TOKEN_B}"}).status_code == 200
    Path(config.tokens_file).write_text("corrupt")
    assert client.get("/v1/capabilities", headers=headers).status_code == 503


def test_origins_hosts_and_preflight(client, headers):
    assert (
        client.get("/v1/capabilities", headers={**headers, "Origin": "https://evil.example"}).status_code
        == 403
    )
    ok = client.get("/v1/capabilities", headers={**headers, "Origin": ORIGIN})
    assert ok.headers["access-control-allow-origin"] == ORIGIN
    assert "access-control-allow-origin" not in client.get("/healthz").headers
    preflight = client.options(
        "/v1/fields/resolve",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert preflight.status_code == 204
    for host in [
        "evil.example",
        "localhost.evil.example",
        "localhost@evil.example",
        "[broken",
        "localhost:bad",
    ]:
        assert client.get("/healthz", headers={"Host": host}).status_code == 403
    assert client.get("/healthz?token=secret").status_code == 403
    assert client.post("/healthz").status_code == 405
    assert client.get("/docs").status_code == 404


def test_resolve_and_draft(client, headers, resolve_body, draft_body):
    resolve_body["fields"][0]["label"] = "所获学位"
    result = client.post("/v1/fields/resolve", json=resolve_body, headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["results"][0]["source_path"] == "education[].degree"
    assert result.json()["request_id"] == resolve_body["request_id"]
    result = client.post("/v1/answers/draft", json=draft_body, headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "needs_review"
    assert result.json()["used_fact_ids"] == ["fact-a", "fact-b"]
    draft_body["facts"] = []
    assert (
        client.post("/v1/answers/draft", json=draft_body, headers=headers).json()["status"]
        == "insufficient_facts"
    )


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate_field",
        "duplicate_source",
        "unknown_key",
        "unknown_source",
        "source_metadata",
        "wrong_group",
        "string_bool",
        "too_many_fields",
        "overlong_label",
        "protocol",
    ],
)
def test_request_schema_rejections(client, headers, resolve_body, mutation):
    field = resolve_body["fields"][0]
    if mutation == "duplicate_field":
        resolve_body["fields"] *= 2
    if mutation == "duplicate_source":
        resolve_body["source_catalog"] *= 2
    if mutation == "unknown_key":
        resolve_body["profile"] = {"full_name": "SYNTHETIC-SECRET"}
    if mutation == "unknown_source":
        resolve_body["source_catalog"][0]["path"] = "__proto__.secret"
    if mutation == "source_metadata":
        resolve_body["source_catalog"][0]["label"] = "SYNTHETIC-SECRET"
    if mutation == "wrong_group":
        field["group"] = "admin"
    if mutation == "string_bool":
        field["required"] = "true"
    if mutation == "too_many_fields":
        resolve_body["fields"] *= 41
    if mutation == "overlong_label":
        field["label"] = "SYNTHETIC-SECRET" * 50
    if mutation == "protocol":
        resolve_body["protocol_version"] = "future"
    response = client.post("/v1/fields/resolve", json=resolve_body, headers=headers)
    assert response.status_code == (400 if mutation == "protocol" else 422)
    assert "SYNTHETIC-SECRET" not in response.text


@pytest.mark.parametrize(
    "location", ["question", "fact", "requirements", "label", "group_label", "option", "fact_id", "field_id"]
)
@pytest.mark.parametrize(
    "sentinel", ["student@example.com", "13800138000", "110101200001011234", "１３８００１３８０００"]
)
def test_sensitive_data_never_reaches_model(client, headers, resolve_body, draft_body, location, sentinel):
    body, path = draft_body, "/v1/answers/draft"
    if location == "question":
        body["question"] = sentinel
    elif location == "fact":
        body["facts"][0]["text"] = sentinel
    elif location == "requirements":
        body["job_requirements"] = [sentinel]
    elif location == "fact_id":
        body["facts"][0]["id"] = sentinel
    else:
        body, path = resolve_body, "/v1/fields/resolve"
        field = body["fields"][0]
        if location == "option":
            field["option_labels"] = [sentinel]
        else:
            field[{"label": "label", "group_label": "group_label", "field_id": "field_id"}[location]] = (
                sentinel
            )
    response = client.post(path, json=body, headers=headers)
    assert response.status_code == 422
    assert sentinel not in response.text


@pytest.mark.parametrize("label", ["密码", "是否同意调剂", "最高学历", "身份证号码", "紧急联系人"])
def test_protected_fields_abstain(client, headers, resolve_body, label):
    resolve_body["fields"][0]["label"] = label
    response = client.post("/v1/fields/resolve", json=resolve_body, headers=headers)
    assert response.json()["results"][0]["status"] == "abstain"


def test_body_bounds_and_errors_are_sanitized(client, headers, resolve_body, caplog):
    caplog.set_level("INFO", logger="resume_api.audit")
    request_headers = {**headers, "Content-Type": "application/json"}
    for body in [
        '{"x":"SYNTHETIC-SECRET"',
        '{"protocol_version":"1.0","protocol_version":"future"}',
        '{"x":NaN}',
        "[]",
    ]:
        result = client.post("/v1/fields/resolve", content=body, headers=request_headers)
        assert result.status_code == 422
    assert (
        client.post("/v1/fields/resolve", content=b"x" * 131073, headers=request_headers).status_code == 413
    )
    assert (
        client.post(
            "/v1/fields/resolve", json=resolve_body, headers={**headers, "Content-Encoding": "gzip"}
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/v1/fields/resolve", content="{}", headers={**headers, "Content-Type": "text/plain"}
        ).status_code
        == 415
    )
    assert "SYNTHETIC-SECRET" not in caplog.text
    assert TOKEN not in caplog.text


def test_rate_and_daily_quota_are_per_token(client, config, headers, resolve_body):
    update_token(config, requests_per_minute=1)
    assert client.get("/v1/capabilities", headers=headers).status_code == 200
    blocked = client.get("/v1/capabilities", headers=headers)
    assert blocked.status_code == 429 and blocked.headers["retry-after"] == "5"
    assert client.get("/v1/capabilities", headers={"Authorization": f"Bearer {TOKEN_B}"}).status_code == 200
    update_token(config, requests_per_minute=600, daily_requests=1)
    assert client.post("/v1/fields/resolve", headers=headers, json=resolve_body).status_code == 200
    assert (
        client.post("/v1/fields/resolve", headers=headers, json=resolve_body).json()["error"]["code"]
        == "QUOTA_EXCEEDED"
    )


def test_admin_writes_hash_only_and_private_secret(tmp_path):
    registry, secret = tmp_path / "tokens.json", tmp_path / "owner.token"
    atomic_json(registry, TokenFile(tokens=[]).model_dump())
    issue(registry, "owner", secret)
    assert secret.stat().st_mode & 0o777 == 0o600
    assert registry.stat().st_mode & 0o777 == 0o600
    assert secret.read_text().strip() not in registry.read_text()
    before = registry.read_text()
    with pytest.raises(ValueError):
        issue(registry, "owner", tmp_path / "other.token")
    assert registry.read_text() == before
    assert json.loads(before)["tokens"][0]["enabled"] is True


@pytest.mark.parametrize(
    "updates",
    [
        {"allowed_hosts": ["*"]},
        {"allowed_origins": ["*"]},
        {"allowed_origins": ["http://evil.example"]},
        {"ollama_url": "http://user:secret@localhost"},
        {"ollama_url": "http://localhost/path"},
        {"ollama_model": "qwen-cloud"},
        {"max_concurrent": 3},
    ],
)
def test_invalid_deployment_settings_fail_closed(updates):
    with pytest.raises(ValueError):
        Settings(**updates)
