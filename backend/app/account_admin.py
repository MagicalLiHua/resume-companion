"""Offline bootstrap and recovery for the owner of the server filesystem."""

import argparse
import os
import secrets
from pathlib import Path

from .account_schemas import Login
from .auth import TokenStore
from .config import load_settings
from .database import Database
from .identity import Identity, password_hash


def main():
    parser = argparse.ArgumentParser(description="网页账号的离线初始化与恢复")
    parser.add_argument("--config", default=".runtime/config.json")
    parser.add_argument("command", choices=["bootstrap", "reset-password"])
    parser.add_argument("--username", required=True)
    parser.add_argument("--password-output", required=True)
    args = parser.parse_args()
    created = False
    destination = Path(args.password_output)
    try:
        os.environ["RESUME_API_CONFIG"] = args.config
        settings = load_settings()
        if not settings.data_directory:
            raise ValueError("Account storage is not configured")
        password = secrets.token_urlsafe(24)
        Login(username=args.username, password=password)
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with os.fdopen(os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as stream:
            stream.write(password + "\n")
        created = True
        db = Database(settings.data_directory)
        if args.command == "bootstrap":
            Identity(db, TokenStore(settings.tokens_file)).bootstrap(args.username, password)
        else:
            hashed = password_hash(password)
            import time

            with db.connect(write=True) as conn:
                row = conn.execute("SELECT id FROM users WHERE username=?", (args.username,)).fetchone()
                if not row:
                    raise ValueError("Unknown username")
                conn.execute("UPDATE users SET password_hash=?,enabled=1 WHERE id=?", (hashed, row["id"]))
                conn.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
                conn.execute(
                    "UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
                    (int(time.time()), row["id"]),
                )
                db.audit(conn, row["id"], "offline_password_reset", row["id"])
        print("账号操作完成；随机密码已写入指定私有文件，终端不显示密码。")
    except Exception:
        if created:
            destination.unlink(missing_ok=True)
        parser.exit(1, "操作失败：请检查账号、存储配置、文件权限或管理员是否已存在。\n")


if __name__ == "__main__":
    main()
