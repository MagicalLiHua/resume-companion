"""Private PDF jobs: bounded extraction, one model attempt, explicit user confirmation."""

import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from .account_schemas import ResumeCreate
from .database import encode
from .errors import APIError
from .profile_schema import Profile, empty_profile

ACTIVE = {"queued", "extracting", "generating"}
TTL = 86400


async def extract_pdf(path):
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        *(["--pdf-worker"] if getattr(sys, "frozen", False) else ["-I", str(Path(__file__).with_name("pdf_worker.py"))]),
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env={"PATH": os.defpath, "LANG": "C.UTF-8"},
        limit=512000,
    )
    try:
        async with asyncio.timeout(18):
            output, _ = await process.communicate()
        if process.returncode or len(output) > 500000:
            return {"error": "PDF_COMPLEX"}
        return json.loads(output)
    except TimeoutError:
        return {"error": "PDF_COMPLEX"}
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


def replace_ids(data, profile_id):
    # Identifiers belong to our system, never to model-generated resume claims.
    data = {**data, "profile_id": profile_id, "revision": 0, "schema_version": "1.0"}
    for section in ["education", "experience", "projects", "certificates", "custom_answers"]:
        for record in data.get(section, []):
            record["id"] = str(uuid.uuid4())
            for fact in record.get("facts", []):
                fact["id"] = str(uuid.uuid4())
    return Profile.model_validate(data)


class ImportJobs:
    def __init__(self, db, adapter, model_jobs, extractor=extract_pdf, providers=None):
        self.db, self.adapter, self.model_jobs, self.extractor = db, adapter, model_jobs, extractor
        self.tasks = {}
        self.providers = providers
        self.cleaner = None

    def update(self, job_id, **values):
        values["updated_at"] = int(time.time())
        with self.db.connect(write=True) as conn:
            return conn.execute(
                "UPDATE imports SET "
                + ",".join(f"{key}=?" for key in values)
                + " WHERE id=? AND deleted_at IS NULL AND status NOT IN ('cancelled','confirmed')",
                (*values.values(), job_id),
            ).rowcount

    def cleanup(self):
        cutoff = int(time.time()) - TTL
        with self.db.connect(write=True) as conn:
            old = [row[0] for row in conn.execute("SELECT id FROM imports WHERE created_at<=?", (cutoff,))]
            conn.execute("DELETE FROM imports WHERE created_at<=?", (cutoff,))
        for job_id in old:
            (self.db.uploads / (job_id + ".pdf")).unlink(missing_ok=True)
        for path in self.db.uploads.glob("*.pdf"):
            if path.stat().st_mtime <= cutoff and not self.db.one(
                "SELECT 1 FROM imports WHERE id=?", (path.stem,)
            ):
                path.unlink(missing_ok=True)

    async def start(self):
        with self.db.connect(write=True) as conn:
            conn.execute(
                "UPDATE imports SET status='failed',error_code='IMPORT_INTERRUPTED',updated_at=? WHERE status IN ('queued','extracting','generating')",
                (int(time.time()),),
            )
        self.cleanup()

        async def clean_periodically():
            while True:
                await asyncio.sleep(600)
                self.cleanup()

        self.cleaner = asyncio.create_task(clean_periodically())

    def begin(self, job_id, principal, model_snapshot=None):
        task = asyncio.create_task(self.process(job_id, principal, model_snapshot))
        self.tasks[job_id] = task

        def done(result):
            self.tasks.pop(job_id, None)
            if not result.cancelled():
                result.exception()

        task.add_done_callback(done)

    async def process(self, job_id, principal, model_snapshot=None):
        try:
            self.update(job_id, status="extracting")
            result = await self.extractor(self.db.uploads / (job_id + ".pdf"))
            if "error" in result:
                self.update(job_id, status="failed", error_code=result["error"])
                return
            source, warnings = result["text"], result["warnings"]
            blank = empty_profile(job_id)
            if not self.update(
                job_id, status="generating", extracted_text=source, draft=encode(blank.model_dump())
            ):
                return
            if not self.db.one("SELECT 1 FROM users WHERE id=? AND enabled=1", (principal.user_id,)):
                raise APIError("TOKEN_INVALID")
            try:
                # Long text remains fully visible to the owner; never silently truncate it for inference.
                if len(source.encode()) > 14000:
                    raise APIError("PDF_MODEL_TEXT_LIMIT")

                async def generate(deadline):
                    if self.providers:
                        if model_snapshot is None:
                            raise APIError("MODEL_NOT_CONFIGURED")
                        async with self.providers.adapter(model_snapshot) as adapter:
                            data = await adapter.generate(
                                "parse_resume", {"text": source}, Profile.model_json_schema(), False
                            )
                        return replace_ids(data, job_id)
                    await self.adapter.prepare()
                    data = await self.adapter.generate(
                        "parse_resume", {"text": source}, Profile.model_json_schema(), False
                    )
                    return replace_ids(data, job_id)

                if self.providers and model_snapshot is None:
                    raise APIError("MODEL_NOT_CONFIGURED")
                draft = await self.model_jobs.submit(principal, generate)
                warnings.append("REVIEW_ALL_FIELDS")
                self.update(
                    job_id, status="ready", draft=encode(draft.model_dump()), warnings=encode(warnings)
                )
            except (APIError, ValidationError, KeyError, TypeError, ValueError) as error:
                # A failed model cannot prevent the user from maintaining their own resume.
                warnings.append("MODEL_PARSE_INCOMPLETE")
                self.update(
                    job_id,
                    status="needs_manual",
                    warnings=encode(warnings),
                    error_code=error.code
                    if isinstance(error, APIError) and error.code != "MODEL_NOT_CONFIGURED"
                    else None,
                )
        except asyncio.CancelledError:
            self.update(job_id, status="failed", error_code="IMPORT_INTERRUPTED")
            raise
        except Exception:
            self.update(job_id, status="failed", error_code="IMPORT_FAILED")

    async def close(self):
        if self.cleaner:
            self.cleaner.cancel()
            await asyncio.gather(self.cleaner, return_exceptions=True)
        for task in list(self.tasks.values()):
            task.cancel()
        await asyncio.gather(*list(self.tasks.values()), return_exceptions=True)


def import_router(db, jobs, insert_resume):
    router = APIRouter()

    def owned(job_id, user_id, conn=None):
        sql = "SELECT * FROM imports WHERE id=? AND user_id=? AND deleted_at IS NULL AND created_at>?"
        args = (job_id, user_id, int(time.time()) - TTL)
        row = conn.execute(sql, args).fetchone() if conn else db.one(sql, args)
        if not row:
            raise APIError("NOT_FOUND")
        return dict(row)

    def view(row):
        return {
            **{
                key: row[key]
                for key in [
                    "id",
                    "filename",
                    "status",
                    "created_at",
                    "updated_at",
                    "error_code",
                    "resume_id",
                    "extracted_text",
                    "provider_label",
                    "provider_revision",
                ]
            },
            "expires_at": row["created_at"] + TTL,
            "draft": json.loads(row["draft"]) if row["draft"] else None,
            "warnings": json.loads(row["warnings"]),
        }

    @router.post("/v1/imports", status_code=202)
    async def upload(request: Request):
        principal = request.state.token
        model_snapshot = None
        if jobs.providers:
            revision = request.headers.get("x-model-revision", "manual")
            if revision != "manual":
                if not re.fullmatch(r"[0-9]{1,10}", revision):
                    raise APIError("VALIDATION_ERROR")
                model_snapshot = jobs.providers.snapshot(principal.user_id, int(revision))
        if len(jobs.tasks) >= 2:
            raise APIError("SERVER_BUSY")
        body = await request.body()
        if not body.startswith(b"%PDF-"):
            raise APIError("PDF_INVALID")
        job_id, now = str(uuid.uuid4()), int(time.time())
        # The original basename is supplied separately as URI-encoded UTF-8, never a path.
        from urllib.parse import unquote

        try:
            filename = unquote(request.headers.get("x-file-name", "resume.pdf"), errors="strict")
        except UnicodeError:
            raise APIError("VALIDATION_ERROR") from None
        if not re.fullmatch(r"[^/\\\x00-\x1f\x7f]{1,160}\.pdf", filename, re.IGNORECASE):
            raise APIError("VALIDATION_ERROR")
        path = db.uploads / (job_id + ".pdf")

        def persist():
            try:
                with db.connect(write=True) as conn:
                    if (
                        conn.execute(
                            "SELECT count(*) FROM imports WHERE status IN ('queued','extracting','generating') AND deleted_at IS NULL"
                        ).fetchone()[0]
                        >= 2
                    ):
                        raise APIError("SERVER_BUSY")
                    rows = conn.execute(
                        "SELECT status FROM imports WHERE user_id=? AND deleted_at IS NULL AND created_at>?",
                        (principal.user_id, now - TTL),
                    ).fetchall()
                    if any(row[0] in ACTIVE for row in rows):
                        raise APIError("SERVER_BUSY")
                    if len(rows) >= 10:
                        raise APIError("RESOURCE_LIMIT")
                    with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                        output.write(body)
                    conn.execute(
                        "INSERT INTO imports(id,user_id,filename,status,created_at,updated_at,provider_label,provider_revision) VALUES(?,?,?,'queued',?,?,?,?)",
                        (
                            job_id,
                            principal.user_id,
                            filename,
                            now,
                            now,
                            model_snapshot["base_url"] + " · " + model_snapshot["model"]
                            if model_snapshot
                            else None,
                            model_snapshot["revision"] if model_snapshot else None,
                        ),
                    )
                    db.audit(conn, principal.user_id, "pdf_uploaded", job_id)
            except BaseException:
                path.unlink(missing_ok=True)
                raise

        await run_in_threadpool(persist)
        jobs.begin(job_id, principal, model_snapshot)
        return view(owned(job_id, principal.user_id))

    @router.get("/v1/imports")
    def listing(request: Request):
        rows = db.all(
            "SELECT * FROM imports WHERE user_id=? AND deleted_at IS NULL AND created_at>? ORDER BY created_at DESC,id",
            (request.state.token.user_id, int(time.time()) - TTL),
        )
        return {
            "imports": [
                {key: value for key, value in view(row).items() if key not in {"draft", "extracted_text"}}
                for row in rows
            ]
        }

    @router.get("/v1/imports/{job_id}")
    def get_import(job_id: str, request: Request):
        return view(owned(job_id, request.state.token.user_id))

    @router.get("/v1/imports/{job_id}/file")
    def get_file(job_id: str, request: Request):
        row = owned(job_id, request.state.token.user_id)
        path = db.uploads / (job_id + ".pdf")
        if not path.is_file():
            raise APIError("NOT_FOUND")
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=row["filename"],
            headers={"Content-Security-Policy": "sandbox; default-src 'none'"},
        )

    @router.delete("/v1/imports/{job_id}")
    async def remove(job_id: str, request: Request):
        with db.connect(write=True) as conn:
            owned(job_id, request.state.token.user_id, conn)
            conn.execute(
                "UPDATE imports SET status='cancelled',deleted_at=?,draft=NULL,extracted_text=NULL WHERE id=?",
                (int(time.time()), job_id),
            )
            db.audit(conn, request.state.token.user_id, "pdf_deleted", job_id)
        task = jobs.tasks.get(job_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        (db.uploads / (job_id + ".pdf")).unlink(missing_ok=True)
        return {"status": "ok"}

    @router.post("/v1/imports/{job_id}/confirm", status_code=201)
    def confirm(job_id: str, body: ResumeCreate, request: Request):
        if body.profile is None:
            raise APIError("VALIDATION_ERROR")
        with db.connect(write=True) as conn:
            row = owned(job_id, request.state.token.user_id, conn)
            if row["status"] not in {"ready", "needs_manual"}:
                raise APIError("IMPORT_NOT_READY")
            resume = insert_resume(conn, request.state.token.user_id, body.name, body.profile)
            conn.execute(
                "UPDATE imports SET status='confirmed',resume_id=?,updated_at=? WHERE id=?",
                (resume["id"], int(time.time()), job_id),
            )
            db.audit(conn, request.state.token.user_id, "pdf_confirmed", job_id)
        return resume

    return router
