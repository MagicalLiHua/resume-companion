import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import TokenFile
from app.config import load_settings
from app.main import create_app


def test_command_line_web_enable_bootstrap_and_private_password_file(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[1]
    config = tmp_path / "config.json"
    tokens = tmp_path / "tokens.json"
    tokens.write_text(TokenFile(tokens=[]).model_dump_json())
    config.write_text(json.dumps({"tokens_file": "tokens.json"}))
    origin = "a" * 32
    configured = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.admin",
            "enable-web",
            "--config",
            str(config),
            "--data-directory",
            str(tmp_path / "data"),
            "--web-directory",
            str(root / "web"),
            "--extension-id",
            origin,
        ],
        cwd=root,
        capture_output=True,
    )
    assert configured.returncode == 0
    before = tokens.read_bytes()
    private = tmp_path / "owner-password.txt"
    command = [
        sys.executable,
        "-m",
        "app.account_admin",
        "--config",
        str(config),
        "bootstrap",
        "--username",
        "administrator",
        "--password-output",
        str(private),
    ]
    setup = subprocess.run(command, cwd=root, capture_output=True)
    assert setup.returncode == 0
    password = private.read_text().strip()
    assert password.encode() not in setup.stdout + setup.stderr
    assert private.stat().st_mode & 0o777 == 0o600
    monkeypatch.setenv("RESUME_API_CONFIG", str(config))
    settings = load_settings()
    assert settings.allowed_origins == ["chrome-extension://" + origin]
    settings.allowed_hosts.append("testserver")
    with TestClient(create_app(settings)) as client:
        assert (
            client.post(
                "/v1/auth/login", json={"username": "administrator", "password": password}
            ).status_code
            == 200
        )
    assert tokens.read_bytes() == before
    assert subprocess.run(command, cwd=root, capture_output=True).returncode == 1
    assert private.read_text().strip() == password
