"""Session and plugin credentials; secrets are never stored in plaintext."""

import hashlib
import hmac
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from .errors import APIError

SESSION_COOKIE = "resume_session"
SCOPES = {"resumes:read", "model:use"}
PASSWORD_SLOTS = threading.BoundedSemaphore(2)


def digest(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    with PASSWORD_SLOTS:
        derived = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=131072, r=8, p=1, dklen=32, maxmem=268435456
        )
    return f"scrypt$131072$8$1${salt}${derived.hex()}"


def check_password(password, stored):
    try:
        algorithm, n, r, p, salt, _ = stored.split("$")
        if (algorithm, n, r, p) != ("scrypt", "131072", "8", "1"):
            return False
        return hmac.compare_digest(password_hash(password, salt), stored)
    except (ValueError, TypeError):
        return False


DUMMY_HASH = password_hash("unavailable-account-password")


def csrf_token(session):
    return hmac.new(session.encode(), b"resume-csrf-v1", hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Principal:
    user_id: str
    username: str
    role: str
    auth_kind: str
    requests_per_minute: int
    daily_requests: int
    key_id: str | None = None
    key_rpm: int = 60
    key_daily: int = 500
    scopes: tuple[str, ...] = ()


class Identity:
    def __init__(self, db, legacy):
        self.db, self.legacy = db, legacy

    def authenticate(self, authorization):
        if not authorization:
            raise APIError("AUTH_REQUIRED")
        parts = authorization.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise APIError("TOKEN_INVALID")
        secret = parts[1]
        if not secret.startswith("rck_"):
            return self.legacy.authenticate(authorization)
        if not 40 <= len(secret) <= 100:
            raise APIError("TOKEN_INVALID")
        row = self.db.one(
            """SELECT k.*,u.username,u.role,u.enabled,u.requests_per_minute AS user_rpm,
        u.daily_requests AS user_daily FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.digest=?""",
            (digest(secret),),
        )
        if not row or not row["enabled"] or row["revoked_at"] or row["expires_at"] <= time.time():
            raise APIError("TOKEN_INVALID")
        import json

        with self.db.connect(write=True) as conn:
            conn.execute("UPDATE api_keys SET last_used_at=? WHERE id=?", (int(time.time()), row["id"]))
        return Principal(
            row["user_id"],
            row["username"],
            row["role"],
            "key",
            row["user_rpm"],
            row["user_daily"],
            row["id"],
            row["requests_per_minute"],
            row["daily_requests"],
            tuple(json.loads(row["scopes"])),
        )

    def session(self, secret):
        if not secret or not 32 <= len(secret) <= 100:
            raise APIError("AUTH_REQUIRED")
        row = self.db.one(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires_at>? AND u.enabled=1",
            (digest(secret), int(time.time())),
        )
        if not row:
            raise APIError("AUTH_REQUIRED")
        return Principal(
            row["id"],
            row["username"],
            row["role"],
            "session",
            row["requests_per_minute"],
            row["daily_requests"],
            scopes=tuple(SCOPES),
        )

    def create_session(self, conn, user_id, seconds):
        secret = secrets.token_urlsafe(32)
        now = int(time.time())
        conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
        conn.execute("INSERT INTO sessions VALUES(?,?,?,?)", (digest(secret), user_id, now + seconds, now))
        # Limit active sessions without making the newest sign-in unusable.
        conn.execute(
            "DELETE FROM sessions WHERE user_id=? AND digest NOT IN (SELECT digest FROM sessions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 10)",
            (user_id, user_id),
        )
        return secret

    def bootstrap(self, username, password):
        hashed = password_hash(password)
        with self.db.connect(write=True) as conn:
            if conn.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
                raise ValueError("Administrator already exists")
            user_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)",
                (user_id, username, hashed, "admin", int(time.time())),
            )
            self.db.audit(conn, user_id, "administrator_bootstrapped", user_id)
        return user_id


class DurableUsage:
    def __init__(self, db, legacy_usage):
        self.db, self.legacy = db, legacy_usage

    def public_rate(self, subject, limit=12):
        self._rate([(subject, limit)])

    def _rate(self, subjects):
        now = time.time()
        with self.db.connect(write=True) as conn:
            conn.execute("DELETE FROM rate_events WHERE at<=?", (now - 60,))
            for subject, limit in subjects:
                count = conn.execute(
                    "SELECT count(*) FROM rate_events WHERE subject=?", (subject,)
                ).fetchone()[0]
                if count >= limit:
                    raise APIError("RATE_LIMITED")
            conn.executemany(
                "INSERT INTO rate_events VALUES(?,?)", [(subject, now) for subject, _ in subjects]
            )

    def rate(self, principal):
        if not isinstance(principal, Principal):
            return self.legacy.rate(principal)
        limits = [("user:" + principal.user_id, principal.requests_per_minute)]
        if principal.key_id:
            limits.append(("key:" + principal.key_id, principal.key_rpm))
        self._rate(limits)

    def charge(self, principal):
        if not isinstance(principal, Principal):
            return self.legacy.charge(principal)
        today = datetime.now(UTC).date().isoformat()
        limits = [("user:" + principal.user_id, principal.daily_requests)]
        if principal.key_id:
            limits.append(("key:" + principal.key_id, principal.key_daily))
        with self.db.connect(write=True) as conn:
            for subject, limit in limits:
                row = conn.execute(
                    "SELECT count FROM usage WHERE subject=? AND day=?", (subject, today)
                ).fetchone()
                if row and row[0] >= limit:
                    raise APIError("QUOTA_EXCEEDED")
            for subject, _ in limits:
                conn.execute(
                    "INSERT INTO usage VALUES(?,?,1) ON CONFLICT(subject,day) DO UPDATE SET count=count+1",
                    (subject, today),
                )
