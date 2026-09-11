"""Isolated real-provider smoke test. Mount a private key file; synthetic data only."""

import io
import json
import os
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.config import Settings
from app.main import create_app


def synthetic_pdf():
    writer = PdfWriter()
    page = writer.add_blank_page(595, 842)
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
        b"BT /F1 12 Tf 40 800 Td (Name: Example Student) Tj 0 -16 Td "
        b"(Email: student@example.com) Tj 0 -16 Td "
        b"(Skills: Python, SQL) Tj ET"
    )
    page[NameObject("/Contents")] = writer._add_object(stream)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def verify():
    secret = Path("/run/provider-test/key").read_text().strip()
    report = {"backend_version": "0.4.0", "synthetic_data_only": True, "protocols": {}}
    with tempfile.TemporaryDirectory(prefix="resume-provider-smoke-") as folder:
        root = Path(folder)
        (root / "tokens.json").write_text('{"tokens":[]}')
        (root / "providers.key").write_bytes(os.urandom(32))
        (root / "providers.key").chmod(0o600)
        settings = Settings(
            mode="private_model",
            model_provider="personal",
            data_directory=str(root / "data"),
            tokens_file=str(root / "tokens.json"),
            provider_key_file=str(root / "providers.key"),
            request_deadline_seconds=165.0,
            model_timeout_seconds=150.0,
        )
        app = create_app(settings)
        with TestClient(app, base_url="http://127.0.0.1:18080") as client:
            response = client.post(
                "/v1/auth/register",
                json={"username": "synthetic-smoke", "password": "synthetic-smoke-passphrase-2026"},
            )
            assert response.status_code == 201, "open registration failed"
            client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
            report["open_registration"] = True
            for revision, protocol in enumerate(["anthropic", "openai"]):
                response = client.put(
                    "/v1/model-settings",
                    json={
                        "expected_revision": revision,
                        "protocol": protocol,
                        "base_url": "https://api.deepseek.com"
                        + ("/anthropic" if protocol == "anthropic" else ""),
                        "model": "deepseek-v4-flash",
                        "api_key": secret,
                    },
                )
                assert response.status_code == 200, "model configuration failed"
                assert secret not in response.text, "secret readback"
                started = time.monotonic()
                response = client.post("/v1/model-settings/test", json={"expected_revision": revision + 1})
                outcome = {
                    "http_status": response.status_code,
                    "seconds": round(time.monotonic() - started, 2),
                }
                if response.status_code != 200:
                    outcome["error_code"] = response.json().get("error", {}).get("code")
                report["protocols"][protocol] = outcome
                print(json.dumps({"connection": protocol, **outcome}), flush=True)
                assert response.status_code == 200, "real provider connection failed"
                if protocol == "openai":
                    continue
                response = client.post(
                    "/v1/imports",
                    headers={
                        "Content-Type": "application/pdf",
                        "X-File-Name": "synthetic.pdf",
                        "X-Model-Revision": "1",
                    },
                    content=synthetic_pdf(),
                )
                assert response.status_code == 202, "PDF upload failed"
                path = "/v1/imports/" + response.json()["id"]
                started = time.monotonic()
                deadline = started + 165
                while time.monotonic() < deadline:
                    response = client.get(path)
                    assert response.status_code == 200
                    row = response.json()
                    if row["status"] not in {"queued", "extracting", "generating"}:
                        break
                    time.sleep(2)
                report["pdf"] = {
                    "status": row["status"],
                    "error_code": row["error_code"],
                    "seconds": round(time.monotonic() - started, 2),
                }
                print(json.dumps({"pdf": report["pdf"]}), flush=True)
                assert row["status"] == "ready", "real PDF parsing failed"
                assert row["draft"]["basic"]["full_name"] == "Example Student", "name not preserved"
                assert row["draft"]["basic"]["email"] == "student@example.com", "email not preserved"
                assert client.get("/v1/resumes").json()["resumes"] == [], "saved without confirmation"
                response = client.post(
                    path + "/confirm", json={"name": "Synthetic smoke", "profile": row["draft"]}
                )
                assert response.status_code == 201, "confirmation failed"
                report["pdf"]["name_email_and_confirmation_verified"] = True
                assert client.request("DELETE", path, json={}).status_code == 200
            report["status"] = "passed"
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    verify()
