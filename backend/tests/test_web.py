from fastapi.testclient import TestClient

from app.main import create_app


def test_plugin_download_is_public_attachment_and_confined_to_bundle(config, tmp_path):
    root = tmp_path / "web"
    downloads = root / "downloads"
    downloads.mkdir(parents=True)
    archive = downloads / "resume-companion-0.3.2.zip"
    archive.write_bytes(b"PK\x03\x04synthetic-bundle")
    private = tmp_path / "private.zip"
    private.write_bytes(b"must not be served")
    (downloads / "resume-companion-9.9.9.zip").symlink_to(private)
    config.web_directory = str(root)
    with TestClient(create_app(config)) as client:
        response = client.get("/downloads/resume-companion-0.3.2.zip")
        assert response.status_code == 200
        assert response.content == archive.read_bytes()
        assert response.headers["content-type"] == "application/zip"
        assert response.headers["content-disposition"] == 'attachment; filename="resume-companion-0.3.2.zip"'
        assert response.headers["x-content-type-options"] == "nosniff"
        for path in [
            "/downloads/resume-companion-9.9.9.zip",
            "/downloads/resume-companion-0.0.0.zip",
            "/downloads/private.zip",
            "/downloads/config.json",
            "/downloads/..%2f..%2fprivate.zip",
            "/assets/resume-companion-0.3.2.zip",
        ]:
            assert client.get(path).status_code == 404
        assert client.post("/downloads/resume-companion-0.3.2.zip").status_code == 405
        assert client.get("/downloads/resume-companion-0.3.2.zip?path=private.zip").status_code == 403
