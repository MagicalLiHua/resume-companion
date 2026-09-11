import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    mode: str = "mock"
    model_provider: str = "ollama"
    openai_url: str = "http://127.0.0.1:8000"
    openai_model: str = "resume-model"
    model_api_key_file: str | None = None
    provider_key_file: str | None = None
    tokens_file: str = ".runtime/tokens.json"
    allowed_hosts: list[str] = ["127.0.0.1", "localhost", "[::1]"]
    allowed_origins: list[str] = []
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3.5:9b"
    max_concurrent: int = Field(default=2, ge=1, le=2)
    request_deadline_seconds: float = Field(default=45, gt=0, le=180)
    model_timeout_seconds: float = Field(default=30, gt=0, le=150)
    body_timeout_seconds: float = Field(default=10, gt=0, le=10)
    max_body_bytes: int = Field(default=131072, ge=1024, le=131072)
    max_input_characters: int = Field(default=14000, ge=1000, le=14000)
    model_context_tokens: int = Field(default=32768, ge=4096, le=32768)
    model_output_tokens: int = Field(default=4096, ge=256, le=4096)
    preload_timeout_seconds: float = Field(default=180, ge=30, le=300)
    data_directory: str | None = None
    web_directory: str | None = None
    web_origin: str = "http://127.0.0.1:18080"
    session_seconds: int = Field(default=604800, ge=300, le=604800)
    desktop_mode: bool = False

    @field_validator("model_provider")
    @classmethod
    def provider_known(cls, value):
        if value not in {"ollama", "openai", "personal"}:
            raise ValueError("Unknown model provider")
        return value

    @field_validator("mode")
    @classmethod
    def mode_known(cls, value):
        if value not in {"mock", "private_model"}:
            raise ValueError("mode must be mock or private_model")
        return value

    @field_validator("allowed_hosts")
    @classmethod
    def literal_hosts(cls, values):
        if not values or any(not re.fullmatch(r"[a-z0-9.\-]+|\[::1\]", v) for v in values):
            raise ValueError("Use explicit hosts without ports or wildcards")
        return values

    @field_validator("allowed_origins")
    @classmethod
    def exact_origins(cls, values):
        for value in values:
            u = urlsplit(value)
            extension = re.fullmatch(r"chrome-extension://[a-p]{32}", value)
            https = u.scheme == "https" and u.netloc and not u.username and not u.password
            local = u.scheme == "http" and u.hostname in {"localhost", "127.0.0.1", "::1"}
            if not (extension or https or local) or u.path or u.query or u.fragment:
                raise ValueError("Use exact extension or HTTPS origins (HTTP only on loopback)")
        return values

    @field_validator("ollama_url", "openai_url")
    @classmethod
    def upstream_origin(cls, value):
        u = urlsplit(value)
        if u.scheme not in {"http", "https"} or not u.hostname or u.username or u.password:
            raise ValueError("Invalid Ollama origin")
        if u.path not in {"", "/"} or u.query or u.fragment:
            raise ValueError("Ollama URL must be an origin")
        return value.rstrip("/")

    @field_validator("ollama_model", "openai_model")
    @classmethod
    def local_model(cls, value):
        if not re.fullmatch(r"[A-Za-z0-9_.:/-]{1,100}", value) or "cloud" in value.lower():
            raise ValueError("Use a locally installed model")
        return value

    @model_validator(mode="after")
    def timeout_order(self):
        if self.model_timeout_seconds > self.request_deadline_seconds:
            raise ValueError("Model timeout exceeds total deadline")
        self.exact_origins([self.web_origin])
        return self


def load_settings() -> Settings:
    path = Path(os.environ.get("RESUME_API_CONFIG", ".runtime/config.json")).resolve()
    try:
        settings = Settings.model_validate(json.loads(path.read_text()))
        token_path = Path(settings.tokens_file)
        if not token_path.is_absolute():
            settings.tokens_file = str(path.parent / token_path)
        for name in ["data_directory", "web_directory", "model_api_key_file", "provider_key_file"]:
            value = getattr(settings, name)
            if value and not Path(value).is_absolute():
                setattr(settings, name, str(path.parent / value))
        return settings
    except Exception:
        raise RuntimeError("Backend configuration unavailable or invalid; check RESUME_API_CONFIG") from None
