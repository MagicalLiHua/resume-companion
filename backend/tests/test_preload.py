import asyncio

import httpx
import pytest

from app.adapters import OllamaAdapter
from app.errors import APIError


async def test_cold_model_preloads_once_and_readiness_waits(config):
    loaded = False
    release = asyncio.Event()
    calls = []

    async def endpoint(request):
        nonlocal loaded
        calls.append(request.url.path)
        if request.url.path == "/api/generate":
            await release.wait()
            loaded = True
            return httpx.Response(200, json={"done": True})
        return httpx.Response(
            200,
            json={
                "models": [{"name": config.ollama_model, "context_length": config.model_context_tokens}]
                if loaded
                else []
            },
        )

    adapter = OllamaAdapter(config, httpx.MockTransport(endpoint))
    await adapter.start()
    await adapter.start()
    with pytest.raises(APIError, match="MODEL_WARMING_UP"):
        await adapter.readiness()
    release.set()
    await adapter.warmup_task
    assert (await adapter.readiness())["status"] == "ready"
    assert calls.count("/api/generate") == 1
    await adapter.close()


async def test_model_restart_returns_warming_instead_of_accepting_generation(config):
    release = asyncio.Event()

    async def endpoint(request):
        if request.url.path == "/api/generate":
            await release.wait()
            return httpx.Response(200, json={"done": True})
        return httpx.Response(200, json={"models": []})

    adapter = OllamaAdapter(config, httpx.MockTransport(endpoint))
    with pytest.raises(APIError, match="MODEL_WARMING_UP"):
        await adapter.prepare()
    assert adapter.warmup_task is not None
    await adapter.close()
    assert adapter.warmup_task.cancelled()
