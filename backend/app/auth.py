import hashlib
import hmac
import json
from pathlib import Path

from pydantic import Field

from .errors import APIError
from .schemas import ID, StrictModel


class TokenRecord(StrictModel):
    user_id: ID
    digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    enabled: bool = True
    requests_per_minute: int = Field(default=30, ge=1, le=600)
    daily_requests: int = Field(default=500, ge=1, le=100000)


class TokenFile(StrictModel):
    version: int = Field(default=1, ge=1, le=1)
    tokens: list[TokenRecord] = Field(max_length=100)


class TokenStore:
    def __init__(self, path: str):
        self.path = Path(path)

    def records(self):
        try:
            data = TokenFile.model_validate(json.loads(self.path.read_text()))
            if len({t.user_id for t in data.tokens}) != len(data.tokens):
                raise ValueError("Duplicate user")
            if len({t.digest for t in data.tokens}) != len(data.tokens):
                raise ValueError("Duplicate token")
            return data.tokens
        except Exception:
            raise APIError("AUTH_CONFIG_UNAVAILABLE") from None

    def authenticate(self, authorization: str | None):
        if not authorization:
            raise APIError("AUTH_REQUIRED")
        parts = authorization.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer" or not 32 <= len(parts[1]) <= 256:
            raise APIError("TOKEN_INVALID")
        digest = hashlib.sha256(parts[1].encode()).hexdigest()
        matched = None
        for record in self.records():
            if hmac.compare_digest(digest, record.digest) and record.enabled:
                matched = record
        if matched is None:
            raise APIError("TOKEN_INVALID")
        return matched
