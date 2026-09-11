"""Package an explicit allowlist; runtime credentials never enter releases."""

import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.0"


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def package(offline=False):
    plugin_version = json.loads((ROOT / "extension/public/manifest.json").read_text())["version"]
    names = [
        "README.md",
        "backend/README.md",
        "backend/extension-id.txt",
        "docs/网页维护版进度与验收.md",
        "docs/安装与体验.md",
        "docs/当前交付与启动.md",
        "docs/网站兼容与试用记录.md",
        "artifacts/public-site-inspection.json",
        "artifacts/web-browser-results.json",
        "artifacts/backend-0.4.0-tests.xml",
        "artifacts/web-0.4.0-tests.json",
        "artifacts/personal-provider-live-0.4.0.json",
        "artifacts/backend-deployment-0.4.0.json",
        "artifacts/backend-live-0.4.0.json",
        "artifacts/web-deployment-0.3.1.json",
        "artifacts/web-live-0.3.1.json",
        "artifacts/backend-0.3.0-live.json",
        "artifacts/backend-deployment-0.3.0.json",
        "package.json",
        "package-lock.json",
        f"artifacts/resume-companion-{plugin_version}.zip",
        f"artifacts/resume-companion-{plugin_version}.zip.sha256",
        "vite.web.config.ts",
        "vite.config.ts",
        "tsconfig.json",
        "vitest.config.ts",
        "playwright.config.ts",
        "playwright.web.config.ts",
        "tests/fixtures/resume-companion-0.3.1.zip",
        "web/index.html",
        "extension/options.html",
        "extension/sidepanel.html",
        "extension/connection.html",
        "extension/public/manifest.json",
        "backend/pyproject.toml",
        "backend/uv.lock",
        "backend/requirements.lock",
        "backend/.python-version",
        "backend/.dockerignore",
        "backend/Dockerfile",
        "backend/Dockerfile.offline",
        "backend/compose.yaml",
        "backend/compose.offline.yaml",
        "backend/compose.local-model.yaml",
        "backend/deploy.env.example",
        "backend/OFFLINE.md",
        "docs/后端实现与部署验收.md",
        "docs/网页端与账号体系方案.md",
        "artifacts/backend-evaluation.json",
        "artifacts/backend-evaluation-baseline.json",
        "artifacts/backend-evaluation-scoped-catalog.json",
        "artifacts/backend-smoke.txt",
        "artifacts/backend-live-auth.json",
        "artifacts/backend-tests.xml",
        "artifacts/backend-coverage.json",
        "artifacts/backend-deployment.json",
    ]
    for folder, pattern in [
        ("backend/app", "*.py"),
        ("backend/tests", "*.py"),
        ("backend/scripts", "*.py"),
        ("backend/scripts", "*.sh"),
        ("backend/eval", "*.json"),
        ("contracts/api", "*.json"),
        ("contracts/api", "*.ts"),
        ("scripts", "*.mjs"),
        ("scripts", "*.py"),
        ("docs", "*.md"),
        ("docs/diagrams", "*.drawio"),
        ("docs/diagrams", "*.png"),
    ]:
        names.extend(str(path.relative_to(ROOT)) for path in (ROOT / folder).glob(pattern))
    names.extend(str(path.relative_to(ROOT)) for path in (ROOT / "backend/web").rglob("*") if path.is_file())
    for folder in ["web/src", "extension/src", "tests"]:
        names.extend(
            str(path.relative_to(ROOT))
            for path in (ROOT / folder).rglob("*")
            if path.is_file() and path.suffix in {".ts", ".tsx", ".css", ".json", ".html"} and not path.name.startswith(".")
        )
    names.extend(str(path.relative_to(ROOT)) for path in (ROOT / "contracts/fixtures").glob("*.json"))
    files = {name: ROOT / name for name in sorted(set(names))}
    for dependency in ["react", "react-dom", "scheduler", "zod"]:
        files[f"THIRD_PARTY_NOTICES/{dependency}.txt"] = ROOT / "node_modules" / dependency / "LICENSE"
    if offline:
        source = ROOT / "artifacts/backend-offline"
        metadata = json.loads((source / "python-image.metadata.json").read_text())
        base = source / "python-3.12-linux-amd64.tar.gz"
        if "sha256:" + checksum(base) != metadata["archive_sha256"]:
            raise ValueError("Offline base image checksum mismatch")
        files["backend/python-3.12-linux-amd64.tar.gz"] = base
        files["backend/python-image.metadata.json"] = source / "python-image.metadata.json"
        for wheel in sorted((source / "wheelhouse").glob("*.whl")):
            files["backend/wheelhouse/" + wheel.name] = wheel
        if not any(name.endswith(".whl") for name in files):
            raise ValueError("Offline wheelhouse is missing")
    for name, path in files.items():
        if (
            not path.is_file()
            or path.is_symlink()
            or ".runtime" in Path(name).parts
            or name.endswith(".token")
        ):
            raise ValueError("Invalid release member: " + name)
    manifest = {name: checksum(path) for name, path in files.items()}
    stem = f"resume-companion-backend-{VERSION}"
    target = ROOT / "artifacts" / (stem + ("-offline" if offline else "") + ".tar.gz")
    with tarfile.open(target, "w:gz", compresslevel=6, format=tarfile.PAX_FORMAT) as archive:
        for name, path in files.items():
            info = archive.gettarinfo(str(path), arcname=f"{stem}/{name}")
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.pax_headers = {}
            with path.open("rb") as stream:
                archive.addfile(info, stream)
        data = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
        info = tarfile.TarInfo(f"{stem}/MANIFEST.sha256.json")
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
    digest = checksum(target)
    target.with_suffix(target.suffix + ".sha256").write_text(f"{digest}  {target.name}\n")
    with tarfile.open(target) as archive:
        for name, expected in manifest.items():
            stream = archive.extractfile(f"{stem}/{name}")
            if stream is None or hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise ValueError("Release readback mismatch: " + name)
    print(
        json.dumps(
            {"file": str(target), "bytes": target.stat().st_size, "sha256": digest, "files": len(files)}
        )
    )


if __name__ == "__main__":
    package()
    package(offline=True)
