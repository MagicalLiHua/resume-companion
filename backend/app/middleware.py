import asyncio
import hmac
import json
import logging
import re
import time
import uuid
from http.cookies import CookieError, SimpleCookie
from urllib.parse import urlsplit

from starlette.responses import JSONResponse, Response

from .access import RoutePolicy, account_policy
from .errors import APIError
from .identity import SESSION_COOKIE, Principal, csrf_token, digest
from .safety import parse_json
from .web import web_path

logger = logging.getLogger("resume_api.audit")
GET_ROUTES = {"/healthz", "/v1/capabilities", "/v1/readiness", "/v1/source-catalog", "/v1/openapi.json"}
POST_ROUTES = {"/v1/fields/resolve", "/v1/answers/draft"}


class BoundaryMiddleware:
    def __init__(self, app, settings, tokens, usage):
        self.app, self.settings, self.tokens, self.usage = app, settings, tokens, usage
        self.upload_readers = set()
        self.origins = set(settings.allowed_origins)
        if settings.data_directory:
            self.origins.add(settings.web_origin)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        trace_id = str(uuid.uuid4())
        scope.setdefault("state", {}).update(trace_id=trace_id, request_id=trace_id)
        started = time.monotonic()
        status = 500
        code = "INTERNAL_ERROR"
        origin = None
        upload_user = None
        headers = {}
        for name, value in scope.get("headers", []):
            headers.setdefault(name.lower(), []).append(value.decode("latin-1"))

        async def annotated_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                extra = [
                    (b"x-request-id", trace_id.encode()),
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ]
                if origin in self.origins:
                    extra += [
                        (b"access-control-allow-origin", origin.encode()),
                        (b"vary", b"Origin"),
                        (b"access-control-expose-headers", b"X-Request-ID, Retry-After"),
                    ]
                    if self.settings.data_directory and origin == self.settings.web_origin:
                        extra.append((b"access-control-allow-credentials", b"true"))
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        def one(name, default=None):
            values = headers.get(name, [])
            if len(values) > 1:
                raise APIError("REQUEST_NOT_ALLOWED")
            return values[0] if values else default

        try:
            host = one(b"host", "")
            try:
                parsed = urlsplit("//" + host)
                expected = f"[{parsed.hostname}]" if parsed.hostname == "::1" else parsed.hostname
                _ = parsed.port
            except ValueError:
                raise APIError("REQUEST_NOT_ALLOWED") from None
            if (
                expected not in self.settings.allowed_hosts
                or parsed.username
                or parsed.path
                or parsed.query
                or parsed.fragment
            ):
                raise APIError("REQUEST_NOT_ALLOWED")
            origin = one(b"origin")
            if origin is not None and origin not in self.origins:
                raise APIError("ORIGIN_DENIED")
            if scope.get("query_string"):
                raise APIError("REQUEST_NOT_ALLOWED")
            path, method = scope["path"], scope["method"]
            if self.settings.desktop_mode and path.startswith(("/v1/auth/", "/v1/admin/")):
                raise APIError("NOT_FOUND")
            policy = account_policy(path) if self.settings.data_directory else None
            if self.settings.web_directory and web_path(path):
                policy = RoutePolicy(("GET",), "public")
            if path not in GET_ROUTES | POST_ROUTES and not policy:
                raise APIError("NOT_FOUND")
            policy = policy or RoutePolicy(
                ("GET",) if path in GET_ROUTES else ("POST",),
                "public" if path == "/healthz" else "model",
                self.settings.max_body_bytes,
            )
            allowed = policy.methods
            if method == "OPTIONS":
                if origin is None or one(b"access-control-request-method") not in allowed:
                    raise APIError("REQUEST_NOT_ALLOWED")
                requested = {
                    v.strip().lower()
                    for v in one(b"access-control-request-headers", "").split(",")
                    if v.strip()
                }
                if not requested <= {
                    "authorization",
                    "content-type",
                    "x-csrf-token",
                    "x-file-name",
                    "x-model-revision",
                }:
                    raise APIError("REQUEST_NOT_ALLOWED")
                code = "OK"
                return await Response(
                    status_code=204,
                    headers={
                        "Access-Control-Allow-Methods": ", ".join(allowed),
                        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-CSRF-Token, X-File-Name, X-Model-Revision",
                        "Access-Control-Max-Age": "600",
                    },
                )(scope, receive, annotated_send)
            if method not in allowed:
                raise APIError("METHOD_NOT_ALLOWED")
            if policy.auth != "public":
                authorization = one(b"authorization")
                session_secret = None
                if self.settings.data_directory and not authorization:
                    try:
                        cookies = SimpleCookie()
                        cookies.load(one(b"cookie", ""))
                        session_secret = cookies[SESSION_COOKIE].value if SESSION_COOKIE in cookies else None
                    except CookieError:
                        raise APIError("AUTH_REQUIRED") from None
                token = (
                    self.tokens.session(session_secret)
                    if session_secret
                    else self.tokens.authenticate(authorization)
                )
                if policy.auth != "model" and not isinstance(token, Principal):
                    raise APIError("PERMISSION_DENIED")
                if isinstance(token, Principal):
                    session_only = (
                        policy.auth in {"session", "admin"} or policy.auth == "resume" and method != "GET"
                    )
                    if session_only and token.auth_kind != "session":
                        raise APIError("PERMISSION_DENIED")
                    if policy.auth == "admin" and token.role != "admin":
                        raise APIError("PERMISSION_DENIED")
                    needed = (
                        "resumes:read"
                        if policy.auth == "resume"
                        else "model:use"
                        if policy.auth == "model" and method == "POST"
                        else None
                    )
                    if needed and token.auth_kind == "key" and needed not in token.scopes:
                        raise APIError("PERMISSION_DENIED")
                    if token.auth_kind == "session" and method not in {"GET", "HEAD"}:
                        supplied_csrf = one(b"x-csrf-token", "")
                        if not hmac.compare_digest(supplied_csrf, csrf_token(session_secret)):
                            raise APIError("CSRF_INVALID")
                scope["state"]["token"] = token
                self.usage.rate(token)
            elif self.settings.data_directory and path != "/healthz":
                peer = (scope.get("client") or ("local",))[0]
                self.usage.public_rate("public:" + digest(peer), 60)
                if path == "/v1/auth/register":
                    self.usage.public_rate("register:" + digest(peer), 8)
            if method == "POST" and policy.media == "application/pdf":
                user_id = scope["state"]["token"].user_id
                if user_id in self.upload_readers or len(self.upload_readers) >= 2:
                    raise APIError("SERVER_BUSY")
                upload_user = user_id
                self.upload_readers.add(user_id)
            if method in {"POST", "PUT", "PATCH", "DELETE"}:
                media = one(b"content-type", "").split(";")[0].strip().lower()
                if media != policy.media or one(b"content-encoding", "identity").lower() != "identity":
                    raise APIError("MEDIA_TYPE_UNSUPPORTED")
                length = one(b"content-length")
                if length is not None and (not length.isascii() or not length.isdecimal()):
                    raise APIError("VALIDATION_ERROR")
                if length is not None and int(length) > policy.body_limit:
                    raise APIError("PAYLOAD_TOO_LARGE")
                body = bytearray()
                try:
                    async with asyncio.timeout(self.settings.body_timeout_seconds):
                        while True:
                            message = await receive()
                            if message["type"] == "http.disconnect":
                                raise APIError("CLIENT_DISCONNECTED")
                            body.extend(message.get("body", b""))
                            if len(body) > policy.body_limit:
                                raise APIError("PAYLOAD_TOO_LARGE")
                            if not message.get("more_body", False):
                                break
                except TimeoutError:
                    raise APIError("REQUEST_TIMEOUT") from None
                if policy.media == "application/json":
                    try:
                        raw = parse_json(bytes(body))
                    except (ValueError, UnicodeError, RecursionError):
                        raise APIError("VALIDATION_ERROR") from None
                    if not isinstance(raw, dict):
                        raise APIError("VALIDATION_ERROR")
                    if isinstance(raw.get("request_id"), str) and re.fullmatch(
                        r"[A-Za-z0-9_-]{1,100}", raw["request_id"]
                    ):
                        scope["state"]["request_id"] = raw["request_id"]
                    if "protocol_version" in raw and raw["protocol_version"] != "1.0":
                        raise APIError("PROTOCOL_UNSUPPORTED")
                supplied = False

                async def replay():
                    nonlocal supplied
                    if not supplied:
                        supplied = True
                        return {"type": "http.request", "body": bytes(body), "more_body": False}
                    return await receive()

                await self.app(scope, replay, annotated_send)
            else:
                await self.app(scope, receive, annotated_send)
            code = scope["state"].get("error_code", "OK")
        except APIError as error:
            code = error.code
            extra = {"Retry-After": "5"} if error.status == 429 else {}
            if error.status == 401:
                extra["WWW-Authenticate"] = "Bearer"
            await JSONResponse(
                error.body(scope["state"]["request_id"]), status_code=error.status, headers=extra
            )(scope, receive, annotated_send)
        except Exception:
            error = APIError("INTERNAL_ERROR")
            await JSONResponse(error.body(trace_id), status_code=500)(scope, receive, annotated_send)
        finally:
            if upload_user:
                self.upload_readers.discard(upload_user)
            # Never interpolate exceptions, paths, query strings, headers, or request values.
            logger.info(
                json.dumps(
                    {
                        "request_id": trace_id,
                        "status": status,
                        "code": code,
                        "duration_ms": round((time.monotonic() - started) * 1000),
                    }
                )
            )
