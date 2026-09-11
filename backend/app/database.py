"""Private, transactional account and resume storage for a single-host service."""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

MIGRATIONS = [
    (
        1,
        """
CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','user')), enabled INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, requests_per_minute INTEGER NOT NULL DEFAULT 90,
 daily_requests INTEGER NOT NULL DEFAULT 500, default_resume_id TEXT
);
CREATE TABLE invitations (
 id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, label TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses>0), uses INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE invitation_uses (
 invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
 used_at INTEGER NOT NULL, PRIMARY KEY(invitation_id,user_id)
);
CREATE TABLE sessions (
 digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE api_keys (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, prefix TEXT NOT NULL,
 digest TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 revoked_at INTEGER, last_used_at INTEGER, requests_per_minute INTEGER NOT NULL DEFAULT 60,
 daily_requests INTEGER NOT NULL DEFAULT 500
);
CREATE TABLE resumes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 profile TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 deleted_at INTEGER
);
CREATE INDEX resumes_owner ON resumes(user_id,deleted_at);
CREATE TABLE resume_versions (
 resume_id TEXT NOT NULL REFERENCES resumes(id), revision INTEGER NOT NULL,
 profile TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(resume_id, revision)
);
CREATE TABLE imports (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL,
 status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 extracted_text TEXT, draft TEXT, warnings TEXT NOT NULL DEFAULT '[]', error_code TEXT,
 resume_id TEXT REFERENCES resumes(id), deleted_at INTEGER
);
CREATE INDEX imports_owner ON imports(user_id,created_at);
CREATE TABLE usage (
 subject TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
 PRIMARY KEY(subject,day)
);
CREATE TABLE rate_events (subject TEXT NOT NULL, at REAL NOT NULL);
CREATE INDEX rate_subject ON rate_events(subject,at);
CREATE TABLE audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT NOT NULL,
 target_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE recovery_codes (
 digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, used_at INTEGER
);
""",
    ),
    (
        2,
        """
CREATE TABLE model_providers (
 user_id TEXT PRIMARY KEY REFERENCES users(id), protocol TEXT NOT NULL,
 base_url TEXT NOT NULL, model TEXT NOT NULL, encrypted_key TEXT,
 revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
ALTER TABLE imports ADD COLUMN provider_label TEXT;
ALTER TABLE imports ADD COLUMN provider_revision INTEGER;
""",
    ),
    (
        3,
        """
CREATE TABLE applications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 company TEXT NOT NULL, position TEXT NOT NULL, url TEXT NOT NULL,
 applied_on TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NOT NULL,
 revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX applications_owner ON applications(user_id,applied_on);
""",
    ),
]


class Database:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.path = self.directory / "resume.sqlite3"
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        self.uploads = self.directory / "uploads"
        self.uploads.mkdir(exist_ok=True, mode=0o700)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)")
            current = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            for version, script in MIGRATIONS:
                if version not in current:
                    conn.executescript(
                        "BEGIN IMMEDIATE;\n"
                        + script
                        + f"\nINSERT INTO schema_migrations VALUES ({version}); COMMIT;"
                    )
        os.chmod(self.path, 0o600)

    @contextmanager
    def connect(self, write=False):
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except BaseException:
            if write:
                connection.rollback()
            raise
        finally:
            connection.close()

    def one(self, sql, values=()):
        with self.connect() as conn:
            row = conn.execute(sql, values).fetchone()
            return dict(row) if row else None

    def all(self, sql, values=()):
        with self.connect() as conn:
            return [dict(row) for row in conn.execute(sql, values)]

    @staticmethod
    def audit(conn, actor, action, target=None):
        conn.execute(
            "INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES(?,?,?,?)",
            (actor, action, target, int(time.time())),
        )


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
