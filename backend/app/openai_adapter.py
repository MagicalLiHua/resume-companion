"""OpenAI-compatible local serving adapter, including vLLM's JSON-schema response format."""

import json
from pathlib import Path

import httpx

from .adapters import PDF_SYSTEM, SYSTEM, OllamaAdapter
from .errors import APIError
from .safety import parse_json


class OpenAIAdapter(OllamaAdapter):
    def __init__(self, settings, transport=None):
        self.settings = settings
        headers = {}
        if settings.model_api_key_file:
            path = Path(settings.model_api_key_file)
            if path.stat().st_size > 1024:
                raise RuntimeError("Invalid private model credential file")
            secret = path.read_text().strip()
            if not secret or not secret.isascii() or any(c.isspace() for c in secret):
                raise RuntimeError("Invalid private model credential file")
            headers["Authorization"] = "Bearer " + secret
        self.client = httpx.AsyncClient(
            base_url=settings.openai_url,
            headers=headers,
            trust_env=False,
            follow_redirects=False,
            timeout=httpx.Timeout(settings.model_timeout_seconds, connect=5),
            limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
            transport=transport,
        )
        self.warmup_task = None

    async def start(self):
        # Loading and parallelism belong to the externally managed inference service.
        pass

    async def readiness(self):
        data = await self._json("GET", "/v1/models", deadline_seconds=5)
        try:
            if not any(item["id"] == self.settings.openai_model for item in data["data"]):
                raise APIError("MODEL_UNAVAILABLE")
        except (KeyError, TypeError):
            raise APIError("MODEL_OUTPUT_INVALID") from None
        return {"status": "ready", "mode": "private_model", "model": self.settings.openai_model}

    async def generate(self, task, payload, schema, repair=False):
        system = PDF_SYSTEM if task == "parse_resume" else SYSTEM
        if repair:
            system += "\n上次结果未通过校验。重新检查引用、字段与长度，只输出完整 JSON。"
        system += "\n输出必须遵守 JSON Schema：" + json.dumps(
            schema, ensure_ascii=False, separators=(",", ":")
        )
        data_text = (
            json.dumps({"task": task, "data": payload}, ensure_ascii=False, separators=(",", ":"))
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
        )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": data_text}]
        if (
            len(json.dumps(messages, ensure_ascii=False).encode()) + self.settings.model_output_tokens + 1024
            > self.settings.model_context_tokens
        ):
            raise APIError("PAYLOAD_TOO_LARGE")
        data = await self._json(
            "POST",
            "/v1/chat/completions",
            {
                "model": self.settings.openai_model,
                "messages": messages,
                "stream": False,
                "temperature": 0,
                "max_tokens": self.settings.model_output_tokens,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": "resume_task", "strict": True, "schema": schema},
                },
            },
        )
        try:
            if len(data["choices"]) != 1:
                raise ValueError("Ambiguous completion")
            choice = data["choices"][0]
            message = choice["message"]
            if (
                choice["finish_reason"] != "stop"
                or message.get("role") != "assistant"
                or message.get("tool_calls")
                or message.get("refusal")
            ):
                raise ValueError("Incomplete completion")
            if not isinstance(message["content"], str):
                raise ValueError("Expected text")
            parsed = parse_json(message["content"])
            if not isinstance(parsed, dict):
                raise ValueError("Expected object")
            return parsed
        except (KeyError, IndexError, TypeError, ValueError, RecursionError):
            raise APIError("MODEL_OUTPUT_INVALID") from None
