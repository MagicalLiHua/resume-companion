import asyncio
import hashlib
import json
import time
from pathlib import Path

import httpx
from conftest import TOKEN_B

from app.adapters import MockAdapter
from app.errors import APIError
from app.main import create_app


class WaitingAdapter(MockAdapter):
    def __init__(self):
        self.started = asyncio.Queue()
        self.release = asyncio.Event()

    async def generate(self, *args):
        await self.started.put(True)
        await self.release.wait()
        return await super().generate(*args)


async def test_global_and_per_user_admission_has_no_queue(config, headers, resolve_body):
    config.request_deadline_seconds = 2.0
    config.model_timeout_seconds = 1.0
    path = Path(config.tokens_file)
    registry = json.loads(await asyncio.to_thread(path.read_text))
    token_c = "synthetic-test-token-" + "c" * 32
    registry["tokens"].append(
        {**registry["tokens"][0], "user_id": "user-c", "digest": hashlib.sha256(token_c.encode()).hexdigest()}
    )
    await asyncio.to_thread(path.write_text, json.dumps(registry))
    adapter = WaitingAdapter()
    app = create_app(config, adapter)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as client:
        first = asyncio.create_task(client.post("/v1/fields/resolve", headers=headers, json=resolve_body))
        await asyncio.wait_for(adapter.started.get(), 1)
        assert (await client.post("/v1/fields/resolve", headers=headers, json=resolve_body)).json()["error"][
            "code"
        ] == "SERVER_BUSY"
        second = asyncio.create_task(
            client.post(
                "/v1/fields/resolve", headers={"Authorization": f"Bearer {TOKEN_B}"}, json=resolve_body
            )
        )
        await asyncio.wait_for(adapter.started.get(), 1)
        assert (
            await client.post(
                "/v1/fields/resolve", headers={"Authorization": f"Bearer {token_c}"}, json=resolve_body
            )
        ).status_code == 429
        assert len(app.state.jobs.active_users) == 2
        adapter.release.set()
        assert [r.status_code for r in await asyncio.gather(first, second)] == [200, 200]
        assert not app.state.jobs.active_users
        assert (
            await client.post("/v1/fields/resolve", headers=headers, json=resolve_body)
        ).status_code == 200


async def test_deadline_covers_repair_and_releases_slot(config, headers, resolve_body):
    class InvalidSlow(MockAdapter):
        async def generate(self, *args):
            await asyncio.sleep(0.2)
            return {"invalid": True}

    app = create_app(config, InvalidSlow())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as client:
        started = time.monotonic()
        result = await client.post("/v1/fields/resolve", headers=headers, json=resolve_body)
        assert result.status_code == 504
        assert 0.28 <= time.monotonic() - started < 0.6
        assert not app.state.jobs.active_users


async def test_upstream_timeout_keeps_slot_until_total_deadline(config, headers, resolve_body):
    class ImmediateTimeout(MockAdapter):
        async def generate(self, *args):
            raise APIError("MODEL_TIMEOUT")

    app = create_app(config, ImmediateTimeout())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://testserver") as client:
        first = asyncio.create_task(client.post("/v1/fields/resolve", headers=headers, json=resolve_body))
        await asyncio.sleep(0.05)
        assert (
            await client.post("/v1/fields/resolve", headers=headers, json=resolve_body)
        ).status_code == 429
        assert (await first).status_code == 504
        assert not app.state.jobs.active_users


async def test_disconnect_drains_upstream_before_releasing_slot(config, headers, resolve_body):
    config.request_deadline_seconds = 2.0
    adapter = WaitingAdapter()
    app = create_app(config, adapter)
    incoming = asyncio.Queue()
    outgoing = []
    await incoming.put(
        {"type": "http.request", "body": json.dumps(resolve_body).encode(), "more_body": False}
    )
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
        outgoing.append(message)

    request = asyncio.create_task(app(scope, incoming.get, send))
    await asyncio.wait_for(adapter.started.get(), 1)
    await incoming.put({"type": "http.disconnect"})
    await asyncio.sleep(0.01)
    assert app.state.jobs.active_users == {"user-a"}
    adapter.release.set()
    await request
    assert not app.state.jobs.active_users
    assert next(m["status"] for m in outgoing if m["type"] == "http.response.start") == 499
