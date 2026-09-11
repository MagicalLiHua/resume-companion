import logging
import re
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .access import account_policy
from .account_routes import account_router
from .applications import application_router
from .adapters import MockAdapter, OllamaAdapter
from .auth import TokenStore
from .catalog import CATALOG
from .config import load_settings
from .database import Database
from .errors import ERRORS, APIError
from .identity import DurableUsage, Identity
from .imports import ImportJobs, import_router
from .limits import ModelJobs, UsageLimiter
from .middleware import BoundaryMiddleware
from .openai_adapter import OpenAIAdapter
from .providers import PersonalProviders, provider_router
from .safety import inspect_input
from .schemas import (
    CapabilitiesResponse,
    CatalogResponse,
    DraftRequest,
    DraftResponse,
    ErrorResponse,
    HealthResponse,
    ReadyResponse,
    ResolveRequest,
    ResolveResponse,
)
from .services import AssistantService
from .web import add_web


def create_app(settings=None, adapter=None):
    settings = settings or load_settings()
    adapter_type = OpenAIAdapter if settings.model_provider == "openai" else OllamaAdapter
    adapter = adapter or (
        MockAdapter()
        if settings.mode == "mock" or settings.model_provider == "personal"
        else adapter_type(settings)
    )
    tokens = TokenStore(settings.tokens_file)
    usage = UsageLimiter()
    database = Database(settings.data_directory) if settings.data_directory else None
    if database:
        tokens = Identity(database, tokens)
        usage = DurableUsage(database, usage)
    jobs = ModelJobs(settings, usage)
    providers = PersonalProviders(database, settings) if database else None
    personal = settings.model_provider == "personal"
    if personal and not database:
        raise RuntimeError("Personal providers require account storage")
    imports = (
        ImportJobs(database, adapter, jobs, providers=providers if personal else None) if database else None
    )

    @asynccontextmanager
    async def selected_adapter(request):
        if personal:
            from .identity import Principal

            if not isinstance(request.state.token, Principal):
                raise APIError("PERMISSION_DENIED")
            snapshot = providers.snapshot(request.state.token.user_id)
            async with providers.adapter(snapshot) as chosen:
                yield chosen
        else:
            yield adapter

    @asynccontextmanager
    async def lifespan(app):
        (tokens.legacy if database else tokens).records()
        if personal:
            providers.cipher()
        # HTTP client request URLs and upstream exception content must not enter logs.
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        await adapter.start()
        if imports:
            await imports.start()
        yield
        if imports:
            await imports.close()
        await jobs.close()
        await adapter.close()

    app = FastAPI(
        title="简历随行私有 API",
        version="0.4.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        responses={
            status: {"model": ErrorResponse, "description": "统一错误；不回显请求内容"}
            for status in sorted({entry[0] for entry in ERRORS.values()})
        },
    )
    app.state.jobs, app.state.settings = jobs, settings
    app.state.database, app.state.identity = database, tokens
    app.state.providers = providers
    app.add_middleware(BoundaryMiddleware, settings=settings, tokens=tokens, usage=usage)
    if settings.web_directory:
        add_web(app, settings.web_directory)
    if database:
        accounts = account_router(database, tokens, usage, settings)
        app.include_router(accounts)
        app.include_router(application_router(database))
        app.include_router(provider_router(providers, jobs))
        app.include_router(import_router(database, imports, accounts.insert_resume))
        app.state.import_jobs = imports

    @app.exception_handler(APIError)
    async def api_error(request, error):
        request.state.error_code = error.code
        headers = {"Retry-After": "5"} if error.status == 429 else {}
        return JSONResponse(error.body(request.state.request_id), status_code=error.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return await api_error(request, APIError("VALIDATION_ERROR"))

    @app.get("/healthz", response_model=HealthResponse)
    async def health():
        return {"status": "ok"}

    @app.get("/v1/capabilities", response_model=CapabilitiesResponse)
    async def capabilities():
        return {
            "protocol_version": "1.0",
            "mode": settings.mode,
            "features": {"resolve_fields": True, "draft_answer": True},
            "limits": {
                "max_body_bytes": settings.max_body_bytes,
                "max_fields": 40,
                "max_facts": 20,
                "max_answer_characters": 1000,
                "max_input_characters": settings.max_input_characters,
                "request_deadline_seconds": settings.request_deadline_seconds,
                "max_concurrent": settings.max_concurrent,
                "max_concurrent_per_token": 1,
            },
        }

    @app.get("/v1/readiness", response_model=ReadyResponse)
    async def readiness(request: Request):
        async with selected_adapter(request) as chosen:
            if personal:
                return await jobs.run(request, lambda deadline: chosen.readiness())
            return await chosen.readiness()

    @app.get("/v1/source-catalog", response_model=CatalogResponse)
    async def source_catalog():
        return {
            "protocol_version": "1.0",
            "source_catalog": [
                {k: v for k, v in asdict(entry).items() if k != "aliases"} for entry in CATALOG
            ],
        }

    @app.post("/v1/fields/resolve", response_model=ResolveResponse)
    async def resolve(body: ResolveRequest, request: Request):
        inspect_input(body, settings.max_input_characters)
        async with selected_adapter(request) as chosen:
            result = await jobs.run(
                request, lambda deadline: AssistantService(chosen).resolve(body, deadline)
            )
        return ResolveResponse(protocol_version="1.0", request_id=body.request_id, **result.model_dump())

    @app.post("/v1/answers/draft", response_model=DraftResponse)
    async def draft(body: DraftRequest, request: Request):
        inspect_input(body, settings.max_input_characters)
        async with selected_adapter(request) as chosen:
            result = await jobs.run(request, lambda deadline: AssistantService(chosen).draft(body, deadline))
        return DraftResponse(protocol_version="1.0", request_id=body.request_id, **result.model_dump())

    original_openapi = app.openapi

    def secured_openapi():
        schema = original_openapi()
        schema.setdefault("components", {})["securitySchemes"] = {
            "BearerToken": {
                "type": "http",
                "scheme": "bearer",
                "description": "个人 API Key；仅可读取已确认简历或调用获授权的模型接口",
            },
            "WebSession": {
                "type": "apiKey",
                "in": "cookie",
                "name": "resume_session",
                "description": "网页登录会话；写操作同时携带 X-CSRF-Token",
            },
        }
        for path, operations in schema["paths"].items():
            policy = account_policy(re.sub(r"\{[^}]+\}", "record", path)) if database else None
            for method, operation in operations.items():
                if not isinstance(operation, dict):
                    continue
                if path == "/healthz" or policy and policy.auth == "public":
                    operation["security"] = []
                elif policy and (
                    policy.auth in {"session", "admin"} or policy.auth == "resume" and method != "get"
                ):
                    operation["security"] = [{"WebSession": []}]
                else:
                    operation["security"] = (
                        [{"BearerToken": []}, {"WebSession": []}] if database else [{"BearerToken": []}]
                    )
        return schema

    app.openapi = secured_openapi

    @app.get("/v1/openapi.json", include_in_schema=False)
    async def openapi():
        return app.openapi()

    return app
