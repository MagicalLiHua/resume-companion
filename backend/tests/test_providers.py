import json
import os
import socket
import subprocess
import sys

import httpx
import pytest
from fastapi.testclient import TestClient
from test_accounts import PASSWORD, accounts, new_key, register  # noqa: F401
from test_imports import completed, pdf

from app.backup import create_backup, restore_backup
from app.config import Settings, load_settings
from app.database import Database
from app.errors import APIError
from app.provider_adapter import ProviderAdapter
from app.provider_http import PublicTransport, normalize_endpoint
from app.providers import PersonalProviders

SECRET = "synthetic-personal-provider-key"


def test_enabling_personal_models_preserves_master_key_and_account_config(tmp_path):
    config = tmp_path / "config.json"
    config.write_text(Settings(data_directory=str(tmp_path / "data")).model_dump_json())
    command = [sys.executable, "-m", "app.admin", "enable-personal-models", "--config", str(config)]
    subprocess.run(command, check=True, capture_output=True)
    key = tmp_path / "providers.key"
    original = key.read_bytes()
    assert len(original) == 32 and key.stat().st_mode & 0o777 == 0o600
    subprocess.run(command, check=True, capture_output=True)
    assert key.read_bytes() == original
    settings = Settings.model_validate_json(config.read_text())
    assert settings.model_provider == "personal"
    assert settings.data_directory == str(tmp_path / "data")
    assert settings.provider_key_file == "providers.key"
    assert settings.model_timeout_seconds < settings.request_deadline_seconds


def setup(providers, tmp_path):
    key = tmp_path / "providers.key"
    key.write_bytes(os.urandom(32))
    key.chmod(0o600)
    providers.settings.provider_key_file = str(key)


def body(revision=0, **changes):
    return {
        "expected_revision": revision,
        "protocol": "anthropic",
        "base_url": "https://api.deepseek.com/anthropic",
        "model": "deepseek-v4-flash",
        "api_key": SECRET,
        **changes,
    }


def test_settings_are_encrypted_isolated_and_not_available_to_plugin_keys(accounts, tmp_path):  # noqa: F811
    admin, app, db = accounts
    setup(app.state.providers, tmp_path)
    a, b = register(app, "student-a"), register(app, "student-b")
    user_id = a.get("/v1/me").json()["user"]["id"]
    assert a.put("/v1/model-settings", json=body()).status_code == 200
    public = a.get("/v1/model-settings")
    assert public.json()["configured"] and SECRET not in public.text and "encrypted_key" not in public.text
    row = db.one("SELECT * FROM model_providers WHERE user_id=?", (user_id,))
    assert SECRET not in row["encrypted_key"]
    assert app.state.providers.snapshot(user_id)["api_key"] == SECRET
    assert not b.get("/v1/model-settings").json()["configured"]
    assert b.request("DELETE", "/v1/model-settings", json={"expected_revision": 1}).status_code == 409
    plugin = TestClient(app, headers={"Authorization": "Bearer " + new_key(a)["key"]})
    assert plugin.get("/v1/model-settings").status_code == 403
    assert plugin.post("/v1/model-settings/test", json={"expected_revision": 1}).status_code == 403
    csrf = a.headers.pop("X-CSRF-Token")
    assert a.put("/v1/model-settings", json=body(1)).status_code == 403
    a.headers["X-CSRF-Token"] = csrf
    assert a.put("/v1/model-settings", json=body(0)).status_code == 409
    assert (
        a.put(
            "/v1/model-settings", json=body(1, base_url="https://other.example.com", api_key=None)
        ).status_code
        == 422
    )
    assert a.put("/v1/model-settings", json=body(1, model="deepseek-v4-pro", api_key=None)).status_code == 200
    assert app.state.providers.snapshot(user_id)["api_key"] == SECRET
    assert (
        a.request("DELETE", "/v1/model-settings", json={"expected_revision": 2}).json()["configured"] is False
    )
    assert a.put("/v1/model-settings", json=body(2)).status_code == 409
    with pytest.raises(APIError, match="MODEL_NOT_CONFIGURED"):
        app.state.providers.snapshot(user_id)


def test_provider_key_is_bound_to_user_and_destination_and_survives_private_restore(
    accounts, tmp_path, monkeypatch  # noqa: F811
):
    admin, app, db = accounts
    setup(app.state.providers, tmp_path)
    assert admin.put("/v1/model-settings", json=body()).status_code == 200
    user_id = admin.get("/v1/me").json()["user"]["id"]
    row = db.one("SELECT * FROM model_providers WHERE user_id=?", (user_id,))
    for change in [{"user_id": "other"}, {"base_url": "https://other.example.com"}, {"model": "different"}]:
        with pytest.raises(APIError, match="AUTH_CONFIG_UNAVAILABLE"):
            app.state.providers.decrypt({**row, **change})
    archive = tmp_path / "backup.tar.gz"
    checksum = create_backup(app.state.settings, archive)
    restored = restore_backup(archive, tmp_path / "restored", checksum)
    monkeypatch.setenv("RESUME_API_CONFIG", str(restored / "config/config.json"))
    settings = load_settings()
    assert (
        PersonalProviders(Database(settings.data_directory), settings).snapshot(user_id)["api_key"] == SECRET
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://api.deepseek.com",
        "https://localhost",
        "https://127.0.0.1",
        "https://169.254.169.254",
        "https://[::1]",
        "https://[::ffff:127.0.0.1]",
        "https://10.160.108.2",
        "https://api.example.com/?key=x",
        "https://key@api.example.com",
        "https://api.example.com/a/../b",
        "https://api.example.com/%2e%2e",
    ],
)
def test_disallows_private_or_ambiguous_provider_addresses(url):
    with pytest.raises(ValueError):
        normalize_endpoint(url)


async def test_dns_is_pinned_with_tls_identity_and_private_resolution_never_connects():
    calls = []
    private = False

    async def resolve(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1" if private else "1.1.1.1", 443))]

    async def receive(request):
        calls.append(request)
        assert request.url.host == "1.1.1.1"
        assert request.headers["host"] == "provider.example.com"
        assert request.extensions["sni_hostname"] == "provider.example.com"
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=PublicTransport(httpx.MockTransport(receive), resolve)) as client:
        assert (await client.get("https://provider.example.com/v1/messages")).status_code == 200
        private = True
        with pytest.raises(APIError, match="MODEL_ENDPOINT_DENIED"):
            await client.get("https://provider.example.com/v1/messages")
    assert len(calls) == 1


@pytest.mark.parametrize(
    "protocol,base,path",
    [
        ("anthropic", "https://api.deepseek.com/anthropic", "/anthropic/v1/messages"),
        ("anthropic", "https://provider.example.com/v1", "/v1/messages"),
        ("openai", "https://provider.example.com/v1", "/v1/chat/completions"),
    ],
)
async def test_adapter_preserves_prefix_and_requests_only_structured_data(protocol, base, path):
    async def receive(request):
        assert request.url.path == path
        data = json.loads(request.content)
        assert data["stream"] is False
        if protocol == "anthropic":
            assert request.headers["x-api-key"] == SECRET
            assert data["tool_choice"] == {"type": "tool", "name": "resume_result"}
            assert data["thinking"]["type"] == "disabled"
            return httpx.Response(
                200,
                json={
                    "role": "assistant",
                    "stop_reason": "tool_use",
                    "content": [{"type": "tool_use", "name": "resume_result", "input": {"ok": True}}],
                },
            )
        assert request.headers["authorization"] == "Bearer " + SECRET
        assert data["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"finish_reason": "stop", "message": {"role": "assistant", "content": '{"ok":true}'}}
                ]
            },
        )

    adapter = ProviderAdapter(
        {"protocol": protocol, "base_url": base, "model": "synthetic-model", "api_key": SECRET},
        Settings(),
        httpx.MockTransport(receive),
    )
    try:
        assert (await adapter.readiness())["status"] == "ready"
    finally:
        await adapter.close()


@pytest.mark.parametrize(
    "response,code",
    [
        (httpx.Response(401, text="secret-key-should-not-leak"), "MODEL_KEY_INVALID"),
        (httpx.Response(429, text="billing details"), "MODEL_RATE_LIMITED"),
        (httpx.Response(302, headers={"Location": "https://other.example.com"}), "MODEL_UNAVAILABLE"),
        (
            httpx.Response(200, json={"role": "assistant", "stop_reason": "max_tokens", "content": []}),
            "MODEL_OUTPUT_INVALID",
        ),
        (
            httpx.Response(
                200,
                json={
                    "role": "assistant",
                    "stop_reason": "tool_use",
                    "content": [{"type": "tool_use", "name": "execute_command", "input": {}}],
                },
            ),
            "MODEL_OUTPUT_INVALID",
        ),
    ],
)
async def test_adapter_rejects_auth_redirects_truncation_and_unexpected_tools(response, code):
    adapter = ProviderAdapter(body(), Settings(), httpx.MockTransport(lambda request: response))
    try:
        with pytest.raises(APIError, match=code):
            await adapter.readiness()
    finally:
        await adapter.close()


def test_pdf_uses_explicit_owner_config_and_manual_mode_does_not_call_model(accounts, tmp_path):  # noqa: F811
    admin, app, db = accounts
    setup(app.state.providers, tmp_path)
    app.state.import_jobs.providers = app.state.providers
    calls = []

    async def respond(request):
        calls.append(request.headers["x-api-key"])
        return httpx.Response(401, json={})

    app.state.providers.transport_factory = lambda: httpx.MockTransport(respond)
    assert admin.put("/v1/model-settings", json=body()).status_code == 200
    headers = {"Content-Type": "application/pdf", "X-File-Name": "synthetic.pdf"}
    manual = admin.post("/v1/imports", headers=headers, content=pdf())
    assert completed(admin, manual.json()["id"])["status"] == "needs_manual"
    assert not calls
    assert (
        admin.post("/v1/imports", headers={**headers, "X-Model-Revision": "0"}, content=pdf()).status_code
        == 409
    )
    assert not calls
    live = admin.post("/v1/imports", headers={**headers, "X-Model-Revision": "1"}, content=pdf())
    result = completed(admin, live.json()["id"])
    assert result["status"] == "needs_manual" and result["error_code"] == "MODEL_KEY_INVALID"
    assert result["provider_label"] == "https://api.deepseek.com/anthropic · deepseek-v4-flash"
    assert calls == [SECRET]
