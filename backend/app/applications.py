"""User-confirmed application journal. Filling a form never creates an entry."""

import time
import uuid
from datetime import date
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .errors import APIError


class ApplicationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    company: str = Field(min_length=1, max_length=120)
    position: str = Field(min_length=1, max_length=120)
    url: str = Field(default="", max_length=2000)
    applied_on: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: Literal["planned", "applied", "interview", "offer", "rejected", "withdrawn"] = "applied"
    notes: str = Field(default="", max_length=5000)

    @field_validator("applied_on")
    @classmethod
    def real_date(cls, value):
        date.fromisoformat(value)
        return value

    @field_validator("url")
    @classmethod
    def web_url(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Use a web URL without credentials")
            if any(ord(c) < 32 or c.isspace() for c in value):
                raise ValueError("Invalid URL")
        return value


class ApplicationUpdate(ApplicationInput):
    expected_revision: int = Field(ge=1)


def application_router(db):
    router = APIRouter()

    def owned(conn, record_id, user_id):
        row = conn.execute("SELECT * FROM applications WHERE id=? AND user_id=?", (record_id, user_id)).fetchone()
        if row is None:
            raise APIError("NOT_FOUND")
        return {k: row[k] for k in row.keys() if k != "user_id"}

    @router.get("/v1/applications")
    def listing(request: Request):
        rows = db.all("SELECT * FROM applications WHERE user_id=? ORDER BY applied_on DESC,created_at DESC", (request.state.token.user_id,))
        return {"applications": [{k: v for k, v in r.items() if k != "user_id"} for r in rows]}

    @router.post("/v1/applications", status_code=201)
    def create(body: ApplicationInput, request: Request):
        user_id, record_id, now = request.state.token.user_id, str(uuid.uuid4()), int(time.time())
        with db.connect(write=True) as conn:
            if conn.execute("SELECT count(*) FROM applications WHERE user_id=?", (user_id,)).fetchone()[0] >= 2000:
                raise APIError("RESOURCE_LIMIT")
            conn.execute("INSERT INTO applications VALUES(?,?,?,?,?,?,?,?,1,?,?)", (record_id, user_id, body.company, body.position, body.url, body.applied_on, body.status, body.notes, now, now))
            db.audit(conn, user_id, "application_created", record_id)
            return owned(conn, record_id, user_id)

    @router.patch("/v1/applications/{record_id}")
    def update(record_id: str, body: ApplicationUpdate, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, record_id, request.state.token.user_id)
            if row["revision"] != body.expected_revision:
                raise APIError("REVISION_CONFLICT")
            conn.execute("UPDATE applications SET company=?,position=?,url=?,applied_on=?,status=?,notes=?,revision=revision+1,updated_at=? WHERE id=?", (body.company, body.position, body.url, body.applied_on, body.status, body.notes, int(time.time()), record_id))
            db.audit(conn, request.state.token.user_id, "application_updated", record_id)
            return owned(conn, record_id, request.state.token.user_id)

    @router.delete("/v1/applications/{record_id}")
    def delete(record_id: str, request: Request):
        with db.connect(write=True) as conn:
            owned(conn, record_id, request.state.token.user_id)
            conn.execute("DELETE FROM applications WHERE id=?", (record_id,))
            db.audit(conn, request.state.token.user_id, "application_deleted", record_id)
        return {"status": "ok"}

    return router
