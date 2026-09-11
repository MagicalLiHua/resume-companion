"""User-owned provider settings; ciphertext is bound to user and destination."""

import base64
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Request
from pydantic import Field, field_validator

from .errors import APIError
from .provider_adapter import ProviderAdapter
from .provider_http import normalize_endpoint
from .schemas import StrictModel


class ProviderRevision(StrictModel):
    expected_revision: int = Field(ge=0, le=2147483647)


class ProviderUpdate(ProviderRevision):
    protocol: Literal["anthropic", "openai"]
    base_url: str = Field(min_length=8, max_length=300)
    model: str = Field(pattern=r"^[A-Za-z0-9._:/@-]{1,120}$")
    api_key: str | None = Field(default=None, min_length=8, max_length=1024, repr=False)

    @field_validator("base_url")
    @classmethod
    def endpoint(cls, value):
        return normalize_endpoint(value)

    @field_validator("api_key")
    @classmethod
    def secret(cls, value):
        if value is not None and (
            not value.isascii() or any(c.isspace() or ord(c) < 33 or ord(c) == 127 for c in value)
        ):
            raise ValueError("Invalid API Key")
        return value


class PersonalProviders:
    def __init__(self, db, settings, transport_factory=None):
        self.db, self.settings, self.transport_factory = db, settings, transport_factory

    def cipher(self):
        try:
            path = Path(self.settings.provider_key_file)
            if path.is_symlink() or path.stat().st_mode & 0o077 or path.stat().st_size != 32:
                raise ValueError("Invalid encryption key")
            return AESGCM(path.read_bytes())
        except (OSError, TypeError, ValueError):
            raise APIError("AUTH_CONFIG_UNAVAILABLE") from None

    @staticmethod
    def aad(row):
        return json.dumps(
            [row[key] for key in ["user_id", "protocol", "base_url", "model"]], separators=(",", ":")
        ).encode()

    def decrypt(self, row):
        try:
            raw = base64.b64decode(row["encrypted_key"], validate=True)
            return self.cipher().decrypt(raw[:12], raw[12:], self.aad(row)).decode()
        except (InvalidTag, ValueError, UnicodeError):
            raise APIError("AUTH_CONFIG_UNAVAILABLE") from None

    def public(self, user_id):
        row = self.db.one("SELECT * FROM model_providers WHERE user_id=?", (user_id,))
        return {
            "configured": bool(row and row["encrypted_key"]),
            "protocol": row["protocol"] if row else "anthropic",
            "base_url": row["base_url"] if row else "https://api.deepseek.com/anthropic",
            "model": row["model"] if row else "deepseek-v4-flash",
            "revision": row["revision"] if row else 0,
            "updated_at": row["updated_at"] if row else None,
            "personal_models": self.settings.model_provider == "personal",
        }

    def snapshot(self, user_id, revision=None):
        row = self.db.one("SELECT * FROM model_providers WHERE user_id=?", (user_id,))
        if not row or not row["encrypted_key"]:
            raise APIError("MODEL_NOT_CONFIGURED")
        if revision is not None and row["revision"] != revision:
            raise APIError("MODEL_CONFIG_CHANGED")
        return {
            "protocol": row["protocol"],
            "base_url": row["base_url"],
            "model": row["model"],
            "api_key": self.decrypt(row),
            "revision": row["revision"],
        }

    def save(self, user_id, body):
        with self.db.connect(write=True) as conn:
            previous = conn.execute("SELECT * FROM model_providers WHERE user_id=?", (user_id,)).fetchone()
            if body.expected_revision != (previous["revision"] if previous else 0):
                raise APIError("MODEL_CONFIG_CHANGED")
            secret = body.api_key
            if secret is None:
                if (
                    not previous
                    or not previous["encrypted_key"]
                    or any(previous[k] != getattr(body, k) for k in ["protocol", "base_url"])
                ):
                    raise APIError("MODEL_KEY_REQUIRED")
                secret = self.decrypt(previous)
            row = {
                "user_id": user_id,
                "protocol": body.protocol,
                "base_url": body.base_url,
                "model": body.model,
            }
            nonce = os.urandom(12)
            encrypted = base64.b64encode(
                nonce + self.cipher().encrypt(nonce, secret.encode(), self.aad(row))
            ).decode()
            conn.execute(
                "INSERT INTO model_providers VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET protocol=excluded.protocol,base_url=excluded.base_url,model=excluded.model,encrypted_key=excluded.encrypted_key,revision=excluded.revision,updated_at=excluded.updated_at",
                (
                    user_id,
                    body.protocol,
                    body.base_url,
                    body.model,
                    encrypted,
                    body.expected_revision + 1,
                    int(time.time()),
                ),
            )
            self.db.audit(conn, user_id, "model_settings_saved", user_id)
        return self.public(user_id)

    def delete(self, user_id, revision):
        with self.db.connect(write=True) as conn:
            if not conn.execute(
                "UPDATE model_providers SET encrypted_key=NULL,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?",
                (int(time.time()), user_id, revision),
            ).rowcount:
                raise APIError("MODEL_CONFIG_CHANGED")
            self.db.audit(conn, user_id, "model_settings_deleted", user_id)
        return self.public(user_id)

    @asynccontextmanager
    async def adapter(self, snapshot):
        adapter = ProviderAdapter(
            snapshot, self.settings, self.transport_factory() if self.transport_factory else None
        )
        try:
            yield adapter
        finally:
            await adapter.close()


def provider_router(providers, jobs):
    router = APIRouter()

    @router.get("/v1/model-settings")
    def get(request: Request):
        return providers.public(request.state.token.user_id)

    @router.put("/v1/model-settings")
    def save(body: ProviderUpdate, request: Request):
        return providers.save(request.state.token.user_id, body)

    @router.delete("/v1/model-settings")
    def delete(body: ProviderRevision, request: Request):
        return providers.delete(request.state.token.user_id, body.expected_revision)

    @router.post("/v1/model-settings/test")
    async def test(body: ProviderRevision, request: Request):
        snapshot = providers.snapshot(request.state.token.user_id, body.expected_revision)

        async def check(deadline):
            async with providers.adapter(snapshot) as adapter:
                return await adapter.readiness()

        return await jobs.run(request, check)

    return router
