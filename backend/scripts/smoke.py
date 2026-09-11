"""Exercise a running service using synthetic fixtures; never print credentials."""

import argparse
import json
import time
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--token-file", default=".runtime/owner.token")
    parser.add_argument(
        "--wait-ready-seconds", type=int, default=180, choices=range(0, 301), metavar="0..300"
    )
    args = parser.parse_args()
    token = Path(args.token_file).read_text().strip()
    with httpx.Client(
        base_url=args.url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
        trust_env=False,
        follow_redirects=False,
    ) as client:
        for path in ["/healthz", "/v1/capabilities", "/v1/readiness"]:
            response = client.get(path)
            deadline = time.monotonic() + args.wait_ready_seconds
            while (
                path == "/v1/readiness"
                and response.status_code == 503
                and response.json().get("error", {}).get("code") == "MODEL_WARMING_UP"
                and time.monotonic() < deadline
            ):
                print("模型预热中，5 秒后检查就绪状态", flush=True)
                time.sleep(min(5, max(0, deadline - time.monotonic())))
                response = client.get(path)
            print(
                json.dumps(
                    {"path": path, "status": response.status_code, "body": response.json()},
                    ensure_ascii=False,
                )
            )
            response.raise_for_status()
        sources = client.get("/v1/source-catalog").json()["source_catalog"]
        resolve = {
            "protocol_version": "1.0",
            "request_id": "smoke-fields",
            "fields": [
                {
                    "field_id": "field-1",
                    "label": "所获学位",
                    "group": "education",
                    "group_label": "教育经历",
                    "input_kind": "select-one",
                    "required": True,
                    "option_labels": ["学士", "硕士", "博士"],
                },
                {
                    "field_id": "field-2",
                    "label": "实际授予的学位名称",
                    "group": "education",
                    "group_label": "教育经历",
                    "input_kind": "text",
                    "required": False,
                    "option_labels": [],
                },
            ],
            "source_catalog": sources,
        }
        draft = {
            "protocol_version": "1.0",
            "request_id": "smoke-draft",
            "question": "请介绍你的测试开发实践",
            "job_requirements": ["接口测试"],
            "facts": [
                {"id": "fact-1", "text": "使用 Python 编写接口回归测试用例"},
                {"id": "fact-2", "text": "实现测试结果汇总和失败用例定位"},
            ],
            "constraints": {"language": "zh-CN", "tone": "professional_plain", "max_characters": 300},
        }
        for path, body in [("/v1/fields/resolve", resolve), ("/v1/answers/draft", draft)]:
            response = client.post(path, json=body)
            print(
                json.dumps(
                    {"path": path, "status": response.status_code, "body": response.json()},
                    ensure_ascii=False,
                )
            )
            response.raise_for_status()
            if path.endswith("resolve"):
                assert response.json()["results"][0]["source_path"] == "education[].degree"
                assert response.json()["results"][1]["field_id"] == "field-2"
                assert response.json()["results"][1]["source_path"] in {"education[].degree", None}
            else:
                assert response.json()["status"] == "needs_review"


if __name__ == "__main__":
    main()
