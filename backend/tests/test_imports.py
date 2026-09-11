import asyncio
import io
import time

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from test_accounts import accounts, new_key, register  # noqa: F401

from app.errors import APIError
from app.imports import ImportJobs, extract_pdf


def pdf(text="Name: Example Student\nEmail: student@example.com", pages=1, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(595, 842)
        if text:
            font = DictionaryObject(
                {
                    NameObject("/Type"): NameObject("/Font"),
                    NameObject("/Subtype"): NameObject("/Type1"),
                    NameObject("/BaseFont"): NameObject("/Helvetica"),
                }
            )
            page[NameObject("/Resources")] = DictionaryObject(
                {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
            )
            stream = DecodedStreamObject()
            stream.set_data(
                (
                    "BT /F1 12 Tf 40 800 Td "
                    + " 0 -16 Td ".join("(" + line + ") Tj" for line in text.splitlines())
                    + " ET"
                ).encode()
            )
            page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("synthetic-pdf-password")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def upload(client, content=None, filename="resume.pdf"):
    return client.post(
        "/v1/imports",
        content=pdf() if content is None else content,
        headers={"Content-Type": "application/pdf", "X-File-Name": filename},
    )


def completed(client, job_id):
    deadline = time.monotonic() + 6
    while time.monotonic() < deadline:
        response = client.get("/v1/imports/" + job_id)
        assert response.status_code == 200, response.text
        row = response.json()
        if row["status"] not in {"queued", "extracting", "generating"}:
            return row
        time.sleep(0.12)
    pytest.fail("PDF job did not finish")


def test_pdf_requires_confirmation_and_owner_only(accounts):  # noqa: F811
    admin, app, db = accounts
    r = upload(admin)
    assert r.status_code == 202, r.text
    row = completed(admin, r.json()["id"])
    assert row["status"] == "ready", row
    assert row["draft"]["basic"]["email"] == "student@example.com"
    assert admin.get("/v1/resumes").json()["resumes"] == []
    path = "/v1/imports/" + row["id"]
    foreign = register(app)
    assert foreign.get(path).status_code == 404
    assert foreign.get(path + "/file").status_code == 404
    assert (
        foreign.post(path + "/confirm", json={"name": "Stolen", "profile": row["draft"]}).status_code == 404
    )
    key = new_key(admin)
    assert TestClient(app).get(path, headers={"Authorization": "Bearer " + key["key"]}).status_code == 403
    row["draft"]["basic"]["full_name"] = "User Confirmed Name"
    saved = admin.post(path + "/confirm", json={"name": "我的求职简历", "profile": row["draft"]})
    assert saved.status_code == 201, saved.text
    assert saved.json()["profile"]["basic"]["full_name"] == "User Confirmed Name"
    assert (
        admin.post(path + "/confirm", json={"name": "duplicate", "profile": row["draft"]}).status_code == 409
    )
    source = db.uploads / (row["id"] + ".pdf")
    assert source.stat().st_mode & 0o777 == 0o600
    assert admin.get(path + "/file").content == pdf()
    assert admin.request("DELETE", path, json={}).status_code == 200
    assert not source.exists()
    assert admin.get(path).status_code == 404
    assert admin.get("/v1/resumes/" + saved.json()["id"]).status_code == 200


@pytest.mark.parametrize(
    "data,code",
    [
        (pdf(text=""), "PDF_NO_TEXT"),
        (pdf(encrypted=True), "PDF_ENCRYPTED"),
        (pdf(pages=31), "PDF_PAGE_LIMIT"),
        (b"%PDF-1.7\nbroken", "PDF_INVALID"),
    ],
)
async def test_pdf_invalid_encrypted_blank_and_page_limit(tmp_path, data, code):
    source = tmp_path / "test.pdf"
    source.write_bytes(data)
    assert (await extract_pdf(source))["error"] == code


def test_model_failure_preserves_text_for_manual_confirmation(accounts):  # noqa: F811
    client, app, db = accounts

    async def fail(*args):
        raise APIError("MODEL_UNAVAILABLE")

    app.state.import_jobs.adapter.generate = fail
    result = completed(client, upload(client).json()["id"])
    assert result["status"] == "needs_manual"
    assert "Example Student" in result["extracted_text"]
    assert result["draft"]["basic"]["full_name"] is None
    assert (
        client.post(
            "/v1/imports/" + result["id"] + "/confirm", json={"name": "手动整理", "profile": result["draft"]}
        ).status_code
        == 201
    )


def test_binary_boundary_limits_and_cancellation(accounts):  # noqa: F811
    client, app, db = accounts
    assert upload(client, b"not pdf").status_code == 422
    assert upload(client, filename="..%2fother.pdf").status_code == 422
    assert upload(client, filename="%FF.pdf").status_code == 422
    assert upload(client, b"%PDF-" + b"0" * (10 * 1024**2)).status_code == 413
    assert (
        TestClient(app)
        .post("/v1/imports", content=pdf(), headers={"Content-Type": "application/pdf"})
        .status_code
        == 401
    )

    async def wait(path):
        await asyncio.Event().wait()

    app.state.import_jobs.extractor = wait
    r = upload(client)
    assert r.status_code == 202, r.text
    assert upload(client).status_code == 429
    path = "/v1/imports/" + r.json()["id"]
    assert client.post(path + "/confirm", json={"name": "too soon", "profile": {}}).status_code == 422
    assert client.request("DELETE", path, json={}).status_code == 200
    assert db.one("SELECT status FROM imports WHERE id=?", (r.json()["id"],))["status"] == "cancelled"
    assert not list(db.uploads.glob("*.pdf"))


def test_restart_recovery_and_expiry_removes_source_and_draft(accounts):  # noqa: F811
    client, app, db = accounts
    row = completed(client, upload(client).json()["id"])
    with db.connect(write=True) as conn:
        conn.execute("UPDATE imports SET status='generating' WHERE id=?", (row["id"],))

    async def restart():
        jobs = ImportJobs(db, app.state.import_jobs.adapter, app.state.jobs)
        await jobs.start()
        await jobs.close()

    asyncio.run(restart())
    assert (
        db.one("SELECT error_code FROM imports WHERE id=?", (row["id"],))["error_code"]
        == "IMPORT_INTERRUPTED"
    )
    with db.connect(write=True) as conn:
        conn.execute("UPDATE imports SET created_at=? WHERE id=?", (int(time.time()) - 86401, row["id"]))
    assert client.get("/v1/imports/" + row["id"]).status_code == 404
    app.state.import_jobs.cleanup()
    assert not db.one("SELECT * FROM imports WHERE id=?", (row["id"],))
    assert not list(db.uploads.glob("*.pdf"))
