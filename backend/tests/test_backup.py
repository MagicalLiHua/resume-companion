import os
import sqlite3
import tarfile

import pytest
from test_accounts import accounts, new_resume  # noqa: F401
from test_imports import completed, upload

from app.backup import create_backup, restore_backup
from app.config import load_settings


def test_consistent_backup_restore_preserves_accounts_profiles_keys_and_pdf(accounts, tmp_path, monkeypatch):  # noqa: F811
    client, app, db = accounts
    resume = new_resume(client)
    imported = completed(client, upload(client).json()["id"])
    destination = tmp_path / "private-backup.tar.gz"
    digest = create_backup(app.state.settings, destination)
    assert destination.stat().st_mode & 0o777 == 0o600
    with db.connect(write=True) as conn:
        conn.execute("UPDATE resumes SET name='After snapshot' WHERE id=?", (resume["id"],))
    restored = restore_backup(destination, tmp_path / "restored", digest)
    with sqlite3.connect(restored / "data/resume.sqlite3") as conn:
        assert (
            conn.execute("SELECT name FROM resumes WHERE id=?", (resume["id"],)).fetchone()[0]
            == resume["name"]
        )
        assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 1
        assert (
            conn.execute("SELECT status FROM imports WHERE id=?", (imported["id"],)).fetchone()[0] == "ready"
        )
    assert (restored / "data/uploads" / (imported["id"] + ".pdf")).is_file()
    monkeypatch.setenv("RESUME_API_CONFIG", str(restored / "config/config.json"))
    settings = load_settings()
    assert os.path.samefile(settings.data_directory, restored / "data")
    with pytest.raises(ValueError):
        restore_backup(destination, restored, digest)
    with pytest.raises(ValueError):
        restore_backup(destination, tmp_path / "wrong", "0" * 64)
    assert not (tmp_path / "wrong").exists()


def test_restore_rejects_link_and_traversal(tmp_path):
    import hashlib

    for name, link in [("../escape", False), ("config/config.json", True)]:
        path = tmp_path / ("link.tar" if link else "traversal.tar")
        with tarfile.open(path, "w") as archive:
            info = tarfile.TarInfo(name)
            if link:
                info.type = tarfile.SYMTYPE
                info.linkname = "/etc/passwd"
            archive.addfile(info)
        with pytest.raises(ValueError):
            restore_backup(path, tmp_path / "restored", hashlib.sha256(path.read_bytes()).hexdigest())
        assert not (tmp_path / "escape").exists()
        assert not (tmp_path / "restored").exists()
