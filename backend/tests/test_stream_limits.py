import asyncio
import json

import httpx
import pytest

from app.adapters import OllamaAdapter
from app.errors import APIError
from app.main import create_app


async def invoke(app, headers, messages):
    queue = asyncio.Queue()
    for message in messages:
        await queue.put(message)
    output = []
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/v1/fields/resolve",
        "raw_path": b"/v1/fields/resolve",
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"host", b"testserver"),
            (b"content-type", b"application/json"),
            (b"authorization", headers["Authorization"].encode()),
        ],
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 1234),
    }

    async def send(message):
        output.append(message)

    await app(scope, queue.get, send)
    status = next(m["status"] for m in output if m["type"] == "http.response.start")
    body = json.loads(b"".join(m.get("body", b"") for m in output if m["type"] == "http.response.body"))
    return status, body


async def test_chunked_body_is_capped_without_content_length(config, headers):
    status, body = await invoke(
        create_app(config),
        headers,
        [
            {"type": "http.request", "body": b"x" * 70000, "more_body": True},
            {"type": "http.request", "body": b"x" * 70000, "more_body": False},
        ],
    )
    assert status == 413 and body["error"]["code"] == "PAYLOAD_TOO_LARGE"


async def test_slow_partial_body_has_its_own_deadline(config, headers):
    config.body_timeout_seconds = 0.02
    status, body = await invoke(
        create_app(config), headers, [{"type": "http.request", "body": b"{", "more_body": True}]
    )
    assert status == 408 and body["error"]["code"] == "REQUEST_TIMEOUT"


async def test_over_budget_prompt_is_rejected_before_upstream(config):
    calls = []

    async def endpoint(request):
        calls.append(request)
        return httpx.Response(200, json={})

    adapter = OllamaAdapter(config, httpx.MockTransport(endpoint))
    with pytest.raises(APIError, match="PAYLOAD_TOO_LARGE"):
        await adapter.generate("draft_answer", {"text": "甲" * 14000}, {}, False)
    assert calls == []
    await adapter.close()
