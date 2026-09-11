import json
import sqlite3
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response

from .account_schemas import (
    ChangePassword,
    KeyCreate,
    Login,
    Recover,
    Register,
    ResumeCreate,
    ResumeUpdate,
    Revision,
    UserUpdate,
    VersionRestore,
)
from .database import encode
from .errors import APIError
from .identity import DUMMY_HASH, SESSION_COOKIE, check_password, csrf_token, digest, password_hash
from .profile_schema import Profile, empty_profile


def account_router(db, identity, usage, settings):
    import secrets

    router = APIRouter()

    def now():
        return int(time.time())

    def actor(request):
        return request.state.token

    def session_result(conn, user_id, response):
        secret = identity.create_session(conn, user_id, settings.session_seconds)
        response.set_cookie(
            SESSION_COOKIE,
            secret,
            max_age=settings.session_seconds,
            httponly=True,
            secure=settings.web_origin.startswith("https://"),
            samesite="strict",
            path="/",
        )
        user = conn.execute("SELECT id,username,role FROM users WHERE id=?", (user_id,)).fetchone()
        return {"user": dict(user), "csrf_token": csrf_token(secret)}

    def owned(conn, user_id, resume_id, *, deleted=False):
        row = conn.execute("SELECT * FROM resumes WHERE id=? AND user_id=?", (resume_id, user_id)).fetchone()
        if not row or (row["deleted_at"] is not None and not deleted):
            raise APIError("NOT_FOUND")
        return dict(row)

    def cas(row, revision):
        if row["revision"] != revision:
            raise APIError("REVISION_CONFLICT")

    def serialize(row, include_profile=True):
        result = {
            key: row[key] for key in ["id", "name", "revision", "created_at", "updated_at", "deleted_at"]
        }
        if include_profile:
            result["profile"] = json.loads(row["profile"])
        return result

    def insert_resume(conn, user_id, name, profile):
        if (
            conn.execute(
                "SELECT count(*) FROM resumes WHERE user_id=? AND deleted_at IS NULL", (user_id,)
            ).fetchone()[0]
            >= 30
        ):
            raise APIError("RESOURCE_LIMIT")
        resume_id = str(uuid.uuid4())
        profile = (profile or empty_profile(resume_id)).model_copy(
            update={"profile_id": resume_id, "revision": 1}
        )
        profile = Profile.model_validate(profile.model_dump())
        timestamp = now()
        conn.execute(
            "INSERT INTO resumes(id,user_id,name,profile,revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
            (resume_id, user_id, name, encode(profile.model_dump()), timestamp, timestamp),
        )
        conn.execute(
            "UPDATE users SET default_resume_id=? WHERE id=? AND default_resume_id IS NULL",
            (resume_id, user_id),
        )
        db.audit(conn, user_id, "resume_created", resume_id)
        return serialize(owned(conn, user_id, resume_id))

    router.insert_resume = insert_resume

    @router.post("/v1/auth/register", status_code=201)
    def register(body: Register, response: Response):
        hashed = password_hash(body.password)
        user_id = str(uuid.uuid4())
        try:
            with db.connect(write=True) as conn:
                conn.execute(
                    "INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,'user',?)",
                    (user_id, body.username, hashed, now()),
                )
                db.audit(conn, user_id, "user_registered", user_id)
                return session_result(conn, user_id, response)
        except sqlite3.IntegrityError:
            raise APIError("REGISTRATION_CONFLICT") from None

    @router.post("/v1/auth/login")
    def login(body: Login, response: Response):
        usage.public_rate("login:" + digest(body.username), 8)
        user = db.one("SELECT * FROM users WHERE username=?", (body.username,))
        matches = check_password(body.password, user["password_hash"] if user else DUMMY_HASH)
        if not user or not matches or not user["enabled"]:
            raise APIError("LOGIN_FAILED")
        with db.connect(write=True) as conn:
            # Recheck after hashing in case an administrator disabled the account.
            if not conn.execute(
                "SELECT 1 FROM users WHERE id=? AND enabled=1 AND password_hash=?",
                (user["id"], user["password_hash"]),
            ).fetchone():
                raise APIError("LOGIN_FAILED")
            db.audit(conn, user["id"], "user_logged_in", user["id"])
            return session_result(conn, user["id"], response)

    @router.get("/v1/me")
    def me(request: Request):
        principal = actor(request)
        user = db.one(
            "SELECT id,username,role,default_resume_id,requests_per_minute,daily_requests FROM users WHERE id=?",
            (principal.user_id,),
        )
        result = {
            "user": user, "auth_kind": principal.auth_kind, "scopes": principal.scopes,
            "desktop_mode": settings.desktop_mode,
        }
        if principal.auth_kind == "session":
            result["csrf_token"] = csrf_token(request.cookies[SESSION_COOKIE])
        return result

    @router.post("/v1/auth/logout")
    def logout(request: Request, response: Response):
        with db.connect(write=True) as conn:
            conn.execute("DELETE FROM sessions WHERE digest=?", (digest(request.cookies[SESSION_COOKIE]),))
        response.delete_cookie(
            SESSION_COOKIE,
            path="/",
            secure=settings.web_origin.startswith("https://"),
            httponly=True,
            samesite="strict",
        )
        return {"status": "ok"}

    @router.post("/v1/auth/password")
    def change_password(body: ChangePassword, request: Request, response: Response):
        user_id = actor(request).user_id
        usage.public_rate("password:" + user_id, 5)
        user = db.one("SELECT password_hash FROM users WHERE id=?", (user_id,))
        if not check_password(body.current_password, user["password_hash"]):
            raise APIError("LOGIN_FAILED")
        hashed = password_hash(body.new_password)
        with db.connect(write=True) as conn:
            if not conn.execute(
                "UPDATE users SET password_hash=? WHERE id=? AND password_hash=?",
                (hashed, user_id, user["password_hash"]),
            ).rowcount:
                raise APIError("REVISION_CONFLICT")
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            conn.execute(
                "UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (now(), user_id)
            )
            db.audit(conn, user_id, "password_changed", user_id)
            return session_result(conn, user_id, response)

    @router.post("/v1/auth/recover")
    def recover(body: Recover):
        usage.public_rate("recover:" + digest(body.username), 5)
        hashed = password_hash(body.new_password)
        with db.connect(write=True) as conn:
            row = conn.execute(
                "SELECT r.*,u.enabled FROM recovery_codes r JOIN users u ON u.id=r.user_id WHERE r.digest=? AND u.username=?",
                (digest(body.recovery_code), body.username),
            ).fetchone()
            if not row or row["used_at"] or row["expires_at"] <= now() or not row["enabled"]:
                raise APIError("RECOVERY_INVALID")
            conn.execute("UPDATE recovery_codes SET used_at=? WHERE digest=?", (now(), row["digest"]))
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, row["user_id"]))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (row["user_id"],))
            conn.execute(
                "UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
                (now(), row["user_id"]),
            )
            db.audit(conn, row["user_id"], "password_recovered", row["user_id"])
        return {"status": "ok"}

    @router.get("/v1/keys")
    def keys(request: Request):
        rows = db.all(
            "SELECT id,name,prefix,scopes,expires_at,created_at,revoked_at,last_used_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC",
            (actor(request).user_id,),
        )
        return {"keys": [{**row, "scopes": json.loads(row["scopes"])} for row in rows]}

    @router.post("/v1/keys", status_code=201)
    def create_key(body: KeyCreate, request: Request):
        user_id = actor(request).user_id
        secret = "rck_" + secrets.token_urlsafe(32)
        key_id = str(uuid.uuid4())
        with db.connect(write=True) as conn:
            if (
                conn.execute(
                    "SELECT count(*) FROM api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>?",
                    (user_id, now()),
                ).fetchone()[0]
                >= 10
            ):
                raise APIError("RESOURCE_LIMIT")
            conn.execute(
                "INSERT INTO api_keys(id,user_id,name,prefix,digest,scopes,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (
                    key_id,
                    user_id,
                    body.name,
                    secret[:12],
                    digest(secret),
                    encode(body.scopes),
                    now() + body.expires_in_days * 86400,
                    now(),
                ),
            )
            db.audit(conn, user_id, "api_key_created", key_id)
        return {"id": key_id, "key": secret, "prefix": secret[:12], "scopes": body.scopes}

    @router.delete("/v1/keys/{key_id}")
    def revoke_key(key_id: str, request: Request):
        with db.connect(write=True) as conn:
            if not conn.execute(
                "UPDATE api_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=?",
                (now(), key_id, actor(request).user_id),
            ).rowcount:
                raise APIError("NOT_FOUND")
            db.audit(conn, actor(request).user_id, "api_key_revoked", key_id)
        return {"status": "ok"}

    @router.get("/v1/resumes")
    def resumes(request: Request):
        rows = db.all(
            "SELECT * FROM resumes WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id",
            (actor(request).user_id,),
        )
        user = db.one("SELECT default_resume_id FROM users WHERE id=?", (actor(request).user_id,))
        return {
            "resumes": [serialize(row, False) for row in rows],
            "default_resume_id": user["default_resume_id"],
        }

    @router.post("/v1/resumes", status_code=201)
    def create_resume(body: ResumeCreate, request: Request):
        with db.connect(write=True) as conn:
            return insert_resume(conn, actor(request).user_id, body.name, body.profile)

    @router.get("/v1/resumes/{resume_id}")
    def get_resume(resume_id: str, request: Request):
        with db.connect() as conn:
            return serialize(owned(conn, actor(request).user_id, resume_id))

    def update_resume(conn, user_id, row, name, profile):
        revision = row["revision"] + 1
        profile = Profile.model_validate(
            {**profile.model_dump(), "profile_id": row["id"], "revision": revision}
        )
        conn.execute(
            "INSERT INTO resume_versions VALUES(?,?,?,?)", (row["id"], row["revision"], row["profile"], now())
        )
        conn.execute(
            "UPDATE resumes SET name=?,profile=?,revision=?,updated_at=? WHERE id=?",
            (name, encode(profile.model_dump()), revision, now(), row["id"]),
        )
        conn.execute(
            "DELETE FROM resume_versions WHERE resume_id=? AND revision NOT IN (SELECT revision FROM resume_versions WHERE resume_id=? ORDER BY revision DESC LIMIT 20)",
            (row["id"], row["id"]),
        )
        db.audit(conn, user_id, "resume_updated", row["id"])
        return serialize(owned(conn, user_id, row["id"]))

    @router.patch("/v1/resumes/{resume_id}")
    def save_resume(resume_id: str, body: ResumeUpdate, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id)
            cas(row, body.expected_revision)
            if body.profile.profile_id != resume_id or body.profile.revision != body.expected_revision:
                raise APIError("REVISION_CONFLICT")
            return update_resume(conn, actor(request).user_id, row, body.name, body.profile)

    @router.delete("/v1/resumes/{resume_id}")
    def delete_resume(resume_id: str, body: Revision, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id)
            cas(row, body.expected_revision)
            conn.execute(
                "UPDATE resumes SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=?",
                (now(), now(), resume_id),
            )
            conn.execute(
                "UPDATE users SET default_resume_id=(SELECT id FROM resumes WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1) WHERE id=? AND default_resume_id=?",
                (actor(request).user_id, actor(request).user_id, resume_id),
            )
            db.audit(conn, actor(request).user_id, "resume_trashed", resume_id)
        return {"status": "ok"}

    @router.get("/v1/trash")
    def trash(request: Request):
        return {
            "resumes": [
                serialize(row, False)
                for row in db.all(
                    "SELECT * FROM resumes WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
                    (actor(request).user_id,),
                )
            ]
        }

    @router.post("/v1/resumes/{resume_id}/restore")
    def restore_resume(resume_id: str, body: Revision, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id, deleted=True)
            cas(row, body.expected_revision)
            if row["deleted_at"] is None:
                raise APIError("REVISION_CONFLICT")
            if (
                conn.execute(
                    "SELECT count(*) FROM resumes WHERE user_id=? AND deleted_at IS NULL",
                    (actor(request).user_id,),
                ).fetchone()[0]
                >= 30
            ):
                raise APIError("RESOURCE_LIMIT")
            profile = json.loads(row["profile"])
            profile["revision"] = row["revision"] + 1
            conn.execute(
                "UPDATE resumes SET deleted_at=NULL,profile=?,revision=revision+1,updated_at=? WHERE id=?",
                (encode(profile), now(), resume_id),
            )
            conn.execute(
                "UPDATE users SET default_resume_id=? WHERE id=? AND default_resume_id IS NULL",
                (resume_id, actor(request).user_id),
            )
            return serialize(owned(conn, actor(request).user_id, resume_id))

    @router.post("/v1/resumes/{resume_id}/default")
    def default_resume(resume_id: str, body: Revision, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id)
            cas(row, body.expected_revision)
            conn.execute(
                "UPDATE users SET default_resume_id=? WHERE id=?", (resume_id, actor(request).user_id)
            )
        return {"status": "ok"}

    @router.post("/v1/resumes/{resume_id}/copy", status_code=201)
    def copy_resume(resume_id: str, body: Revision, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id)
            cas(row, body.expected_revision)
            return insert_resume(
                conn,
                actor(request).user_id,
                (row["name"] + " 副本")[:80],
                Profile.model_validate_json(row["profile"]),
            )

    @router.get("/v1/resumes/{resume_id}/history")
    def history(resume_id: str, request: Request):
        with db.connect() as conn:
            owned(conn, actor(request).user_id, resume_id)
            return {
                "versions": [
                    dict(row)
                    for row in conn.execute(
                        "SELECT revision,saved_at FROM resume_versions WHERE resume_id=? ORDER BY revision DESC",
                        (resume_id,),
                    )
                ]
            }

    @router.post("/v1/resumes/{resume_id}/restore-version")
    def restore_version(resume_id: str, body: VersionRestore, request: Request):
        with db.connect(write=True) as conn:
            row = owned(conn, actor(request).user_id, resume_id)
            cas(row, body.expected_revision)
            version = conn.execute(
                "SELECT profile FROM resume_versions WHERE resume_id=? AND revision=?",
                (resume_id, body.revision),
            ).fetchone()
            if not version:
                raise APIError("NOT_FOUND")
            return update_resume(
                conn,
                actor(request).user_id,
                row,
                row["name"],
                Profile.model_validate_json(version["profile"]),
            )

    @router.get("/v1/usage")
    def get_usage(request: Request):
        day = datetime.now(UTC).date().isoformat()
        row = db.one(
            "SELECT count FROM usage WHERE subject=? AND day=?", ("user:" + actor(request).user_id, day)
        )
        return {"day": day, "used": row["count"] if row else 0, "limit": actor(request).daily_requests}

    @router.get("/v1/admin/users")
    def users():
        rows = db.all(
            "SELECT id,username,role,enabled,created_at,requests_per_minute,daily_requests FROM users ORDER BY created_at DESC"
        )
        day = datetime.now(UTC).date().isoformat()
        used = {
            row["subject"]: row["count"]
            for row in db.all("SELECT subject,count FROM usage WHERE day=?", (day,))
        }
        return {"users": [{**row, "used_today": used.get("user:" + row["id"], 0)} for row in rows]}

    @router.patch("/v1/admin/users/{user_id}")
    def update_user(user_id: str, body: UserUpdate, request: Request):
        with db.connect(write=True) as conn:
            target = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not target:
                raise APIError("NOT_FOUND")
            if (
                not body.enabled
                and target["role"] == "admin"
                and conn.execute("SELECT count(*) FROM users WHERE enabled=1 AND role='admin'").fetchone()[0]
                <= 1
            ):
                raise APIError("LAST_ADMIN_REQUIRED")
            conn.execute(
                "UPDATE users SET enabled=?,requests_per_minute=?,daily_requests=? WHERE id=?",
                (body.enabled, body.requests_per_minute, body.daily_requests, user_id),
            )
            if not body.enabled:
                conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
                conn.execute(
                    "UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
                    (now(), user_id),
                )
            db.audit(conn, actor(request).user_id, "user_updated", user_id)
        return {"status": "ok"}

    @router.post("/v1/admin/users/{user_id}/recovery")
    def recovery_code(user_id: str, request: Request):
        secret = "rcr_" + secrets.token_urlsafe(32)
        with db.connect(write=True) as conn:
            if not conn.execute("SELECT 1 FROM users WHERE id=? AND enabled=1", (user_id,)).fetchone():
                raise APIError("NOT_FOUND")
            conn.execute("DELETE FROM recovery_codes WHERE user_id=?", (user_id,))
            conn.execute(
                "INSERT INTO recovery_codes VALUES(?,?,?,NULL)", (digest(secret), user_id, now() + 900)
            )
            db.audit(conn, actor(request).user_id, "recovery_created", user_id)
        return {"code": secret, "expires_in_seconds": 900}

    return router
