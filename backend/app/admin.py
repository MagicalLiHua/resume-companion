"""Local-only administration. Secrets go to private files, never stdout."""

import argparse
import fcntl
import hashlib
import json
import os
import secrets
import tempfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from .auth import TokenFile, TokenRecord, TokenStore
from .config import Settings


def atomic_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".new-")
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def locked(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(str(path) + ".lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(descriptor, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def issue(path: Path, user_id: str, destination: Path, rpm=30, daily=500):
    # Validate before writing, and do not overwrite another person's token file.
    secret = secrets.token_urlsafe(32)
    record = TokenRecord(
        user_id=user_id,
        digest=hashlib.sha256(secret.encode()).hexdigest(),
        requests_per_minute=rpm,
        daily_requests=daily,
    )
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with locked(path):
        records = TokenStore(str(path)).records()
        if any(t.user_id == user_id for t in records):
            raise ValueError("User already exists; use a new user ID for rotation")
        if len(records) >= 100:
            raise ValueError("Token registry capacity reached")
        with os.fdopen(os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as stream:
            stream.write(secret + "\n")
        atomic_json(path, TokenFile(tokens=[*records, record]).model_dump())
    return record.user_id


def main():
    parser = argparse.ArgumentParser(description="简历随行后端配置与个人令牌管理")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--directory", default=".runtime")
    init.add_argument("--mode", choices=["mock", "private_model"], default="mock")
    init.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    init.add_argument("--model", default="qwen3.5:9b")
    for name in ["issue", "revoke", "list", "allow-origin", "enable-web", "enable-personal-models"]:
        command = sub.add_parser(name)
        command.add_argument("--config", default=".runtime/config.json")
        if name in {"issue", "revoke"}:
            command.add_argument("--user", required=True)
        if name == "issue":
            command.add_argument("--output", required=True)
            command.add_argument("--rpm", type=int, default=30)
            command.add_argument("--daily", type=int, default=500)
        if name == "allow-origin":
            command.add_argument("--origin", required=True)
        if name == "enable-web":
            command.add_argument("--data-directory", required=True)
            command.add_argument("--web-directory", required=True)
            command.add_argument("--web-origin", default="http://127.0.0.1:18080")
            command.add_argument("--extension-id", required=True)
    args = parser.parse_args()
    try:
        if args.command == "init":
            directory = Path(args.directory)
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            config_path, token_path = directory / "config.json", directory / "tokens.json"
            with locked(config_path):
                if config_path.exists() or token_path.exists():
                    raise ValueError("Configuration already exists; nothing overwritten")
                settings = Settings(
                    mode=args.mode,
                    tokens_file="tokens.json",
                    ollama_url=args.ollama_url,
                    ollama_model=args.model,
                )
                atomic_json(token_path, TokenFile(tokens=[]).model_dump())
                atomic_json(config_path, settings.model_dump())
            print("已创建配置；请用 issue 签发个人令牌。")
            return
        config_path = Path(args.config).resolve()
        settings = Settings.model_validate(json.loads(config_path.read_text()))
        path = Path(settings.tokens_file)
        if not path.is_absolute():
            path = config_path.parent / path
        if args.command == "issue":
            issue(path, args.user, Path(args.output), args.rpm, args.daily)
            print("个人令牌已写入指定文件（权限 600），终端不显示令牌。")
        elif args.command == "list":
            for token in TokenStore(str(path)).records():
                print(
                    json.dumps(
                        {
                            "user_id": token.user_id,
                            "enabled": token.enabled,
                            "requests_per_minute": token.requests_per_minute,
                            "daily_requests": token.daily_requests,
                        }
                    )
                )
        elif args.command == "revoke":
            with locked(path):
                records = TokenStore(str(path)).records()
                selected = next((record for record in records if record.user_id == args.user), None)
                if selected is None:
                    raise ValueError("User does not exist")
                selected.enabled = False
                atomic_json(path, TokenFile(tokens=records).model_dump())
            print("令牌已撤销，对后续请求立即生效。")
        elif args.command == "enable-personal-models":
            with locked(config_path):
                fresh = Settings.model_validate(json.loads(config_path.read_text()))
                if not fresh.data_directory:
                    raise ValueError("Enable account storage first")
                key_path = config_path.parent / "providers.key"
                if not key_path.exists():
                    with os.fdopen(
                        os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb"
                    ) as stream:
                        stream.write(os.urandom(32))
                if key_path.is_symlink() or key_path.stat().st_size != 32 or key_path.stat().st_mode & 0o077:
                    raise ValueError("Invalid encryption key")
                data = fresh.model_dump()
                data.update(
                    model_provider="personal",
                    provider_key_file="providers.key",
                    request_deadline_seconds=165.0,
                    model_timeout_seconds=150.0,
                )
                atomic_json(config_path, Settings.model_validate(data).model_dump())
            print("用户自带模型已配置，重启后生效；请将加密主密钥纳入私有备份。")
        elif args.command == "enable-web":
            with locked(config_path):
                fresh = Settings.model_validate(json.loads(config_path.read_text()))
                data = fresh.model_dump()
                data.update(
                    data_directory=args.data_directory,
                    web_directory=args.web_directory,
                    web_origin=args.web_origin,
                )
                data["allowed_origins"] = sorted(
                    set([*fresh.allowed_origins, "chrome-extension://" + args.extension_id])
                )
                hostname = urlsplit(args.web_origin).hostname
                data["allowed_hosts"] = sorted(
                    set([*fresh.allowed_hosts, "[::1]" if hostname == "::1" else hostname])
                )
                atomic_json(config_path, Settings.model_validate(data).model_dump())
            print("网页与账号配置已启用；初始化管理员后重启服务。")
        else:
            with locked(config_path):
                fresh = Settings.model_validate(json.loads(config_path.read_text()))
                data = fresh.model_dump()
                data["allowed_origins"] = sorted(set([*fresh.allowed_origins, args.origin]))
                atomic_json(config_path, Settings.model_validate(data).model_dump())
            print("来源已加入配置，重启后端后生效。")
    except Exception:
        parser.exit(1, "操作失败：请检查参数、文件权限、重复用户或现有配置；原始内容不回显。\n")


if __name__ == "__main__":
    main()
