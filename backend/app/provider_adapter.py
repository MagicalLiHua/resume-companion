"""Personal Anthropic Messages and OpenAI Chat Completions adapters."""

import asyncio
import json

import httpx

from .adapters import PDF_SYSTEM, SYSTEM
from .errors import APIError
from .provider_http import PublicTransport
from .safety import parse_json


class ProviderAdapter:
    def __init__(self, config, settings, transport=None):
        self.config, self.settings = config, settings
        headers = {"Accept-Encoding": "identity"}
        if config["protocol"] == "anthropic":
            headers.update({"x-api-key": config["api_key"], "anthropic-version": "2023-06-01"})
        else:
            headers["Authorization"] = "Bearer " + config["api_key"]
        self.client = httpx.AsyncClient(
            base_url=config["base_url"] + "/",
            headers=headers,
            trust_env=False,
            follow_redirects=False,
            transport=transport or PublicTransport(),
            timeout=httpx.Timeout(settings.model_timeout_seconds, connect=8),
        )

    async def start(self):
        pass

    async def prepare(self):
        pass

    async def close(self):
        await self.client.aclose()

    async def generate(self, task, payload, schema, repair=False):
        system = PDF_SYSTEM if task == "parse_resume" else SYSTEM
        if task == "connection_test":
            system = 'Return the object {"ok":true} using the requested output format.'
        if repair:
            system += "\n上次结果未通过校验，请重新核对结构、事实及字段。"
        system += "\n只返回符合以下 JSON Schema 的结果：" + json.dumps(schema, ensure_ascii=False)
        text = (
            json.dumps({"task": task, "data": payload}, ensure_ascii=False)
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
        )
        anthropic = self.config["protocol"] == "anthropic"
        body = {
            "model": self.config["model"],
            "stream": False,
            "max_tokens": 128 if task == "connection_test" else self.settings.model_output_tokens,
            "temperature": 0,
        }
        if anthropic:
            body.update(
                {
                    "system": system,
                    "messages": [{"role": "user", "content": text}],
                    "thinking": {"type": "disabled"},
                    "tools": [
                        {
                            "name": "resume_result",
                            "description": "Return the validated data. No external action is performed.",
                            "input_schema": schema,
                        }
                    ],
                    "tool_choice": {"type": "tool", "name": "resume_result"},
                }
            )
        else:
            body.update(
                {
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": text}],
                    "response_format": {"type": "json_object"},
                }
            )
            if httpx.URL(self.config["base_url"]).host == "api.deepseek.com":
                body["thinking"] = {"type": "disabled"}
        prefix = "" if self.config["base_url"].endswith("/v1") else "v1/"
        path = prefix + ("messages" if anthropic else "chat/completions")
        if len(json.dumps(body).encode()) > 120000:
            raise APIError("PAYLOAD_TOO_LARGE")
        try:
            async with asyncio.timeout(self.settings.model_timeout_seconds):
                async with self.client.stream("POST", path, json=body) as response:
                    if response.status_code in {401, 403}:
                        raise APIError("MODEL_KEY_INVALID")
                    if response.status_code in {402, 429}:
                        raise APIError("MODEL_RATE_LIMITED")
                    if response.status_code != 200:
                        raise APIError("MODEL_UNAVAILABLE")
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 1048576:
                            raise APIError("MODEL_OUTPUT_INVALID")
                    data = parse_json(bytes(raw))
        except (TimeoutError, httpx.TimeoutException):
            raise APIError("MODEL_TIMEOUT") from None
        except httpx.HTTPError:
            raise APIError("MODEL_UNAVAILABLE") from None
        except (ValueError, UnicodeError, RecursionError):
            raise APIError("MODEL_OUTPUT_INVALID") from None
        try:
            if anthropic:
                blocks = data["content"]
                tools = [block for block in blocks if block.get("type") == "tool_use"]
                if data["stop_reason"] != "tool_use" or data.get("role") != "assistant" or len(tools) != 1:
                    raise ValueError("Incomplete response")
                if tools[0]["name"] != "resume_result" or any(
                    block.get("type") not in {"tool_use", "text"} for block in blocks
                ):
                    raise ValueError("Unexpected tool")
                result = tools[0]["input"]
            else:
                if len(data["choices"]) != 1:
                    raise ValueError("Ambiguous result")
                choice = data["choices"][0]
                if (
                    choice["finish_reason"] != "stop"
                    or choice["message"].get("role") != "assistant"
                    or choice["message"].get("tool_calls")
                    or choice["message"].get("refusal")
                ):
                    raise ValueError("Incomplete response")
                result = parse_json(choice["message"]["content"])
            if not isinstance(result, dict):
                raise ValueError("Object required")
            return result
        except (KeyError, TypeError, ValueError, RecursionError, AttributeError):
            raise APIError("MODEL_OUTPUT_INVALID") from None

    async def readiness(self):
        schema = {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"],
            "additionalProperties": False,
        }
        if await self.generate("connection_test", {}, schema) != {"ok": True}:
            raise APIError("MODEL_OUTPUT_INVALID")
        return {"status": "ready", "mode": "private_model", "model": self.config["model"]}
