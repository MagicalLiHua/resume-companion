"""Serve only bundled assets; application data always uses authenticated API routes."""

import re
from pathlib import Path

from fastapi.responses import FileResponse

from .errors import APIError

CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"


def web_path(path):
    return (
        path == "/"
        or bool(re.fullmatch(r"/assets/[A-Za-z0-9_-]+\.(js|css|svg|png|ico|woff2)", path))
        or bool(re.fullmatch(r"/downloads/resume-companion-\d+\.\d+\.\d+\.zip", path))
    )


def add_web(app, directory):
    root = Path(directory).resolve()
    headers = {"Content-Security-Policy": CSP, "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY"}

    def serve(relative, filename=None):
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise APIError("NOT_FOUND")
        return FileResponse(path, headers=headers, filename=filename)

    @app.get("/", include_in_schema=False)
    def index():
        return serve("index.html")

    @app.get("/assets/{filename}", include_in_schema=False)
    def asset(filename: str):
        if not web_path("/assets/" + filename):
            raise APIError("NOT_FOUND")
        return serve("assets/" + filename)

    @app.get("/downloads/{filename}", include_in_schema=False)
    def download(filename: str):
        if not web_path("/downloads/" + filename):
            raise APIError("NOT_FOUND")
        return serve("downloads/" + filename, filename=filename)
