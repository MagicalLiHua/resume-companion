"""Owner-only consistent backup and restoration into a new directory."""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import tarfile
import tempfile
from pathlib import Path

from .config import Settings, load_settings
from .database import Database


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def create_backup(settings, output):
    db = Database(settings.data_directory)
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if output.exists():
        raise ValueError("Backup output already exists")
    with tempfile.TemporaryDirectory(prefix="resume-backup-", dir=output.parent) as folder:
        stage = Path(folder)
        (stage / "data/uploads").mkdir(parents=True, mode=0o700)
        (stage / "config").mkdir(mode=0o700)
        # An immediate writer lock prevents new uploads/deletions while copying.
        # A second, read-only snapshot connection can back up committed WAL pages.
        with db.connect(write=True) as locked:
            with db.connect() as source, sqlite3.connect(stage / "data/resume.sqlite3") as target:
                source.backup(target)
            for row in locked.execute("SELECT id FROM imports WHERE deleted_at IS NULL"):
                name = row[0] + ".pdf"
                shutil.copyfile(db.uploads / name, stage / "data/uploads" / name)
        config = settings.model_dump()
        config["data_directory"] = "../data"
        config["tokens_file"] = "tokens.json"
        # Built frontend assets belong to the release, not to the private backup.
        config["web_directory"] = settings.web_directory
        shutil.copyfile(settings.tokens_file, stage / "config/tokens.json")
        if settings.model_api_key_file:
            shutil.copyfile(settings.model_api_key_file, stage / "config/model.key")
            config["model_api_key_file"] = "model.key"
        if settings.provider_key_file:
            shutil.copyfile(settings.provider_key_file, stage / "config/providers.key")
            config["provider_key_file"] = "providers.key"
        (stage / "config/config.json").write_text(json.dumps(config, ensure_ascii=False))
        files = sorted(path for path in stage.rglob("*") if path.is_file())
        manifest = {str(path.relative_to(stage)): checksum(path) for path in files}
        with os.fdopen(os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as target:
            try:
                with tarfile.open(fileobj=target, mode="w:gz") as archive:
                    for path in files:
                        info = archive.gettarinfo(str(path), arcname=str(path.relative_to(stage)))
                        info.mode, info.uid, info.gid, info.uname, info.gname = 0o600, 0, 0, "", ""
                        with path.open("rb") as source:
                            archive.addfile(info, source)
                    data = json.dumps(manifest, sort_keys=True).encode()
                    info = tarfile.TarInfo("manifest.json")
                    info.size, info.mode = len(data), 0o600
                    archive.addfile(info, io.BytesIO(data))
            except BaseException:
                output.unlink(missing_ok=True)
                raise
    return checksum(output)


def restore_backup(archive_path, destination, expected_sha256):
    source, destination = Path(archive_path).resolve(), Path(destination).resolve()
    if (
        destination.exists()
        or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256)
        or checksum(source) != expected_sha256
    ):
        raise ValueError("Restore needs a new destination and matching checksum")
    with tempfile.TemporaryDirectory(prefix="resume-restore-", dir=destination.parent) as folder:
        stage = Path(folder)
        with tarfile.open(source) as archive:
            members = archive.getmembers()
            if len(members) > 10000 or len({m.name for m in members}) != len(members):
                raise ValueError("Invalid backup inventory")
            for member in members:
                allowed = re.fullmatch(
                    r"manifest\.json|config/(config\.json|tokens\.json|model\.key|providers\.key)|data/resume\.sqlite3|data/uploads/[a-f0-9-]{36}\.pdf",
                    member.name,
                )
                if not member.isfile() or not allowed or not 0 <= member.size <= 10 * 1024**3:
                    raise ValueError("Invalid backup member")
                path = stage / member.name
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with archive.extractfile(member) as content, path.open("xb") as target:
                    shutil.copyfileobj(content, target)
                os.chmod(path, 0o600)
        manifest = json.loads((stage / "manifest.json").read_text())
        inventory = {str(path.relative_to(stage)) for path in stage.rglob("*") if path.is_file()} - {
            "manifest.json"
        }
        if set(manifest) != inventory or any(
            checksum(stage / name) != value for name, value in manifest.items()
        ):
            raise ValueError("Backup member checksum mismatch")
        config = Settings.model_validate_json((stage / "config/config.json").read_text())
        if config.data_directory != "../data" or config.tokens_file != "tokens.json":
            raise ValueError("Unexpected restored configuration")
        if config.provider_key_file and (
            config.provider_key_file != "providers.key" or not (stage / "config/providers.key").is_file()
        ):
            raise ValueError("Provider encryption key is missing")
        with sqlite3.connect(stage / "data/resume.sqlite3") as db:
            if (
                db.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
                or db.execute("PRAGMA foreign_key_check").fetchall()
            ):
                raise ValueError("Database integrity check failed")
            for (job_id,) in db.execute("SELECT id FROM imports WHERE deleted_at IS NULL"):
                if not (stage / "data/uploads" / (job_id + ".pdf")).is_file():
                    raise ValueError("Missing source document")
        (stage / "data/uploads").mkdir(exist_ok=True, mode=0o700)
        # Destination is never replaced. The staging folder is on the same filesystem.
        destination.mkdir(mode=0o700)
        for path in stage.iterdir():
            shutil.move(str(path), destination / path.name)
    return destination


def main():
    parser = argparse.ArgumentParser(description="私有账号、简历和 PDF 的备份恢复")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--config", default=".runtime/config.json")
    create.add_argument("--output", required=True)
    restore = sub.add_parser("restore")
    restore.add_argument("--archive", required=True)
    restore.add_argument("--destination", required=True)
    restore.add_argument("--sha256", required=True)
    args = parser.parse_args()
    try:
        if args.command == "create":
            os.environ["RESUME_API_CONFIG"] = args.config
            settings = load_settings()
            if not settings.data_directory:
                raise ValueError("Account storage not configured")
            print(json.dumps({"status": "created", "sha256": create_backup(settings, args.output)}))
        else:
            restore_backup(args.archive, args.destination, args.sha256)
            print(json.dumps({"status": "restored", "integrity": "ok"}))
    except Exception:
        parser.exit(1, "备份或恢复未完成；请检查摘要、文件权限、可用空间及目标是否为全新目录。\n")


if __name__ == "__main__":
    main()
