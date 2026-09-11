import concurrent.futures
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import TokenStore
from app.database import Database
from app.errors import APIError
from app.identity import DurableUsage, Identity, Principal
from app.limits import UsageLimiter
from app.main import create_app
from app.profile_schema import Profile

PASSWORD = "synthetic-passphrase-2026"


@pytest.fixture
def accounts(config, tmp_path):
    config.data_directory = str(tmp_path / "data")
    config.web_origin = "http://127.0.0.1:18080"
    db = Database(config.data_directory)
    identity = Identity(db, TokenStore(config.tokens_file))
    identity.bootstrap("administrator", PASSWORD)
    application = create_app(config)
    with TestClient(application) as client:
        r = client.post("/v1/auth/login", json={"username": "administrator", "password": PASSWORD})
        assert r.status_code == 200, r.text
        client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
        yield client, application, db


def register(application, name="student", password=PASSWORD):
    client = TestClient(application)
    response = client.post("/v1/auth/register", json={"username": name, "password": password})
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return client


def new_resume(client, name="测试简历"):
    r = client.post("/v1/resumes", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def new_key(client, scopes=None):
    body = {"name": "测试插件"}
    if scopes is not None:
        body["scopes"] = scopes
    r = client.post("/v1/keys", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_registration_is_open_and_passwords_are_hashed(accounts):
    admin, app, db = accounts
    user = register(app)
    assert user.get("/v1/me").json()["user"]["role"] == "user"
    assert user.get("/v1/admin/users").status_code == 403
    assert user.get("/v1/keys").json() == {"keys": []}
    assert (
        "HttpOnly"
        in admin.post("/v1/auth/login", json={"username": "administrator", "password": PASSWORD}).headers[
            "set-cookie"
        ]
    )
    row = db.one("SELECT password_hash FROM users WHERE username='student'")
    assert row["password_hash"].startswith("scrypt$131072$") and PASSWORD not in row["password_hash"]
    assert admin.get("/v1/admin/invitations").status_code == 404
    assert db.one("SELECT count(*) AS n FROM invitation_uses")["n"] == 0


def test_duplicate_username_is_transactional_under_concurrent_registration(accounts):
    _, app, db = accounts

    def attempt(_):
        return (
            TestClient(app)
            .post("/v1/auth/register", json={"username": "same-student", "password": PASSWORD})
            .status_code
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(attempt, range(2)))
    assert sorted(statuses) == [201, 409]
    assert db.one("SELECT count(*) AS n FROM users WHERE username='same-student'")["n"] == 1


def test_registration_rejects_role_injection_and_weak_credentials(accounts):
    _, app, _ = accounts
    client = TestClient(app)
    for extra in [
        {"role": "admin"},
        {"password": "short"},
        {"username": "../admin"},
        {"invitation": "legacy-code"},
    ]:
        assert (
            client.post(
                "/v1/auth/register", json={"username": "student", "password": PASSWORD, **extra}
            ).status_code
            == 422
        )


def test_sessions_require_csrf_and_keys_cannot_manage_accounts_or_write_resumes(accounts):
    admin, app, _ = accounts
    user = register(app)
    csrf = user.headers.pop("X-CSRF-Token")
    assert user.post("/v1/resumes", json={"name": "forbidden"}).status_code == 403
    user.headers["X-CSRF-Token"] = csrf
    resume = new_resume(user)
    key = new_key(user)
    plugin = TestClient(app, headers={"Authorization": "Bearer " + key["key"]})
    assert plugin.get("/v1/me").status_code == 200
    assert plugin.get("/v1/resumes/" + resume["id"]).status_code == 200
    assert plugin.post("/v1/resumes", json={"name": "forbidden"}).status_code == 403
    assert plugin.get("/v1/keys").status_code == 403
    assert plugin.get("/v1/admin/users").status_code == 403
    assert (
        plugin.post(
            "/v1/auth/password", json={"current_password": PASSWORD, "new_password": PASSWORD + "x"}
        ).status_code
        == 403
    )
    listing = user.get("/v1/keys").json()
    assert key["key"] not in json.dumps(listing)
    assert user.request("DELETE", "/v1/keys/" + key["id"], json={}).status_code == 200
    assert plugin.get("/v1/resumes").status_code == 401


def test_resume_ownership_revision_history_default_trash_and_restore(accounts):
    admin, app, _ = accounts
    a = register(app, "student-a")
    b = register(app, "student-b")
    resume = new_resume(a)
    rid = resume["id"]
    assert a.get("/v1/resumes").json()["default_resume_id"] == rid
    assert b.get("/v1/resumes/" + rid).status_code == 404
    assert (
        b.patch(
            "/v1/resumes/" + rid,
            json={"name": "stolen", "profile": resume["profile"], "expected_revision": 1},
        ).status_code
        == 404
    )
    profile = resume["profile"]
    profile["basic"]["full_name"] = "合成学生"
    update = {"name": "更新的简历", "profile": profile, "expected_revision": 1}
    saved = a.patch("/v1/resumes/" + rid, json=update)
    assert saved.status_code == 200 and saved.json()["revision"] == 2
    assert a.patch("/v1/resumes/" + rid, json=update).status_code == 409
    assert a.get("/v1/resumes/" + rid).json()["profile"]["basic"]["full_name"] == "合成学生"
    restored = a.post("/v1/resumes/" + rid + "/restore-version", json={"expected_revision": 2, "revision": 1})
    assert restored.status_code == 200
    assert restored.json()["profile"]["basic"]["full_name"] is None
    assert restored.json()["revision"] == 3
    copied = a.post("/v1/resumes/" + rid + "/copy", json={"expected_revision": 3})
    assert copied.status_code == 201
    copy_id = copied.json()["id"]
    assert copy_id != rid and copied.json()["profile"]["profile_id"] == copy_id
    assert a.request("DELETE", "/v1/resumes/" + rid, json={"expected_revision": 3}).status_code == 200
    assert a.get("/v1/resumes/" + rid).status_code == 404
    assert a.get("/v1/resumes").json()["default_resume_id"] == copy_id
    trashed = a.get("/v1/trash").json()["resumes"][0]
    restored = a.post("/v1/resumes/" + rid + "/restore", json={"expected_revision": trashed["revision"]})
    assert restored.status_code == 200 and restored.json()["revision"] == 5
    assert restored.json()["profile"]["revision"] == 5


def test_disable_user_revokes_sessions_keys_and_last_admin_is_preserved(accounts):
    admin, app, db = accounts
    user = register(app)
    key = new_key(user)
    uid = user.get("/v1/me").json()["user"]["id"]
    admin_id = admin.get("/v1/me").json()["user"]["id"]
    patch = {"enabled": False, "requests_per_minute": 90, "daily_requests": 500}
    assert admin.patch("/v1/admin/users/" + admin_id, json=patch).status_code == 409
    assert admin.patch("/v1/admin/users/" + uid, json=patch).status_code == 200
    assert user.get("/v1/me").status_code == 401
    assert (
        TestClient(app, headers={"Authorization": "Bearer " + key["key"]}).get("/v1/resumes").status_code
        == 401
    )
    assert db.one("SELECT revoked_at FROM api_keys WHERE id=?", (key["id"],))["revoked_at"]
    assert admin.patch("/v1/admin/users/" + uid, json={**patch, "enabled": True}).status_code == 200
    assert (
        TestClient(app, headers={"Authorization": "Bearer " + key["key"]}).get("/v1/resumes").status_code
        == 401
    )


def test_recovery_is_single_use_and_revokes_old_credentials(accounts):
    admin, app, _ = accounts
    user = register(app)
    uid = user.get("/v1/me").json()["user"]["id"]
    key = new_key(user)
    code = admin.post("/v1/admin/users/" + uid + "/recovery", json={}).json()["code"]
    guest = TestClient(app)
    body = {"username": "student", "recovery_code": code, "new_password": PASSWORD + "-new"}
    assert guest.post("/v1/auth/recover", json=body).status_code == 200
    assert guest.post("/v1/auth/recover", json=body).status_code == 422
    assert user.get("/v1/me").status_code == 401
    assert (
        TestClient(app, headers={"Authorization": "Bearer " + key["key"]}).get("/v1/resumes").status_code
        == 401
    )
    assert guest.post("/v1/auth/login", json={"username": "student", "password": PASSWORD}).status_code == 401
    assert (
        guest.post("/v1/auth/login", json={"username": "student", "password": PASSWORD + "-new"}).status_code
        == 200
    )


def test_key_scope_expiration_and_cross_account_revocation(accounts):
    admin, app, db = accounts
    a = register(app, "student-a")
    b = register(app, "student-b")
    read = new_key(a, ["resumes:read"])
    model = new_key(a, ["model:use"])
    reader = TestClient(app, headers={"Authorization": "Bearer " + read["key"]})
    assert reader.post("/v1/answers/draft", json={}).status_code == 403
    assert (
        TestClient(app, headers={"Authorization": "Bearer " + model["key"]}).get("/v1/resumes").status_code
        == 403
    )
    assert b.request("DELETE", "/v1/keys/" + read["id"], json={}).status_code == 404
    with db.connect(write=True) as conn:
        conn.execute("UPDATE api_keys SET expires_at=0 WHERE id=?", (read["id"],))
    assert reader.get("/v1/resumes").status_code == 401


def test_durable_quota_and_per_key_limits_survive_reopen(accounts):
    _, _, db = accounts
    principal = Principal("quota-user", "quota", "user", "key", 90, 2, key_id="quota-key", key_daily=1)
    limiter = DurableUsage(db, UsageLimiter())
    limiter.charge(principal)
    reopened = DurableUsage(Database(db.directory), UsageLimiter())
    with pytest.raises(APIError, match="QUOTA_EXCEEDED"):
        reopened.charge(principal)
    another = Principal("quota-user", "quota", "user", "key", 90, 2, key_id="second", key_daily=2)
    reopened.charge(another)
    with pytest.raises(APIError, match="QUOTA_EXCEEDED"):
        reopened.charge(another)


def test_profile_schema_accepts_existing_fixtures_and_rejects_wrong_dates():
    for path in (Path(__file__).resolve().parents[2] / "contracts/fixtures").glob("*.json"):
        data = json.loads(path.read_text())
        Profile.model_validate(data)
    from app.profile_schema import empty_profile

    profile = empty_profile("example").model_dump()
    profile["certificates"] = [{"id": "example", "name": "证书", "issuer": None, "obtained_month": None}]
    with pytest.raises(ValueError):
        Profile.model_validate(profile)
