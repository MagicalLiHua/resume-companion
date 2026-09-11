import hashlib
import json
from dataclasses import asdict

import pytest
from fastapi.testclient import TestClient

from app.auth import TokenFile, TokenRecord
from app.catalog import CATALOG
from app.config import Settings
from app.main import create_app

TOKEN = "synthetic-test-token-" + "a" * 32
TOKEN_B = "synthetic-test-token-" + "b" * 32
ORIGIN = "chrome-extension://" + "a" * 32


@pytest.fixture
def config(tmp_path):
    path = tmp_path / "tokens.json"
    records = [
        TokenRecord(
            user_id=user,
            digest=hashlib.sha256(token.encode()).hexdigest(),
            requests_per_minute=600,
            daily_requests=1000,
        )
        for user, token in [("user-a", TOKEN), ("user-b", TOKEN_B)]
    ]
    path.write_text(TokenFile(tokens=records).model_dump_json())
    return Settings(
        tokens_file=str(path),
        allowed_hosts=["testserver", "127.0.0.1", "localhost"],
        allowed_origins=[ORIGIN],
        request_deadline_seconds=0.3,
        model_timeout_seconds=0.15,
    )


@pytest.fixture
def headers():
    return {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(config):
    with TestClient(create_app(config), raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def resolve_body():
    return {
        "protocol_version": "1.0",
        "request_id": "req-test",
        "fields": [
            {
                "field_id": "f-degree",
                "label": "实际授予的学位名称",
                "group": "education",
                "group_label": "教育经历",
                "input_kind": "select-one",
                "required": True,
                "option_labels": ["学士", "硕士"],
            },
        ],
        "source_catalog": [{k: v for k, v in asdict(item).items() if k != "aliases"} for item in CATALOG],
    }


@pytest.fixture
def draft_body():
    return {
        "protocol_version": "1.0",
        "request_id": "req-draft",
        "question": "请介绍测试开发实践",
        "job_requirements": ["接口测试"],
        "facts": [
            {"id": "fact-a", "text": "使用 Python 编写接口回归测试用例"},
            {"id": "fact-b", "text": "实现测试结果汇总和失败用例定位"},
        ],
        "constraints": {"language": "zh-CN", "tone": "professional_plain", "max_characters": 300},
    }


def update_token(config, **changes):
    from pathlib import Path

    path = Path(config.tokens_file)
    body = json.loads(path.read_text())
    body["tokens"][0].update(changes)
    path.write_text(json.dumps(body))
