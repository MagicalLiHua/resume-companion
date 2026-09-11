"""Isolated loopback-only E2E server; these synthetic credentials never enter releases."""
import json
import os
import httpx
import base64
import hashlib
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
import uvicorn
from app.auth import TokenStore
from app.adapters import MockAdapter
from app.config import Settings
from app.database import Database
from app.identity import Identity
from app.main import create_app

with tempfile.TemporaryDirectory(prefix="resume-web-test-") as folder:
    private = Path(folder)
    tokens = private / "tokens.json"
    tokens.write_text(json.dumps({"tokens": []}))
    config = Settings(tokens_file=str(tokens), data_directory=str(private / "data"), web_directory=str(root / "backend/web"), web_origin="http://127.0.0.1:4180")
    manifest = json.loads((root / "extension/public/manifest.json").read_text())
    hashed = hashlib.sha256(base64.b64decode(manifest["key"])).hexdigest()[:32]
    extension_id = "".join(chr(ord("a") + int(c, 16)) for c in hashed)
    config.allowed_origins = ["chrome-extension://" + extension_id]
    keyfile = private / "providers.key"
    keyfile.write_bytes(os.urandom(32))
    keyfile.chmod(0o600)
    config.provider_key_file = str(keyfile)
    config.model_provider = "personal"
    db = Database(config.data_directory)
    Identity(db, TokenStore(config.tokens_file)).bootstrap("administrator", "synthetic-web-passphrase-2026")
    async def provider_response(request):
        body = json.loads(request.content)
        key = request.headers.get("x-api-key") or request.headers.get("authorization", "").removeprefix("Bearer ")
        if not key.startswith("synthetic-"):
            return httpx.Response(401, json={"error": "invalid synthetic key"})
        payload = json.loads(body["messages"][-1]["content"])
        result = {"ok": True} if payload["task"] == "connection_test" else await MockAdapter().generate(payload["task"], payload["data"], {}, False)
        if "tools" in body:
            return httpx.Response(200, json={"role": "assistant", "stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "resume_result", "input": result}]})
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": json.dumps(result)}}]})
    application = create_app(config)
    application.state.providers.transport_factory = lambda: httpx.MockTransport(provider_response)
    uvicorn.run(application, host="127.0.0.1", port=4180, access_log=False, log_level="warning")
