"""Run the frozen synthetic corpus against a deployed private backend."""

import argparse
import asyncio
import hashlib
import json
import math
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx


def source_hashes():
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((Path(__file__).resolve().parents[1] / "app").glob("*.py"))
    }


def latency(rows):
    values = sorted(row["seconds"] for row in rows)
    return (
        {
            "count": len(values),
            "p50_seconds": round(values[len(values) // 2], 3),
            "p95_seconds": round(values[math.ceil(len(values) * 0.95) - 1], 3),
        }
        if values
        else {}
    )


async def evaluate(args):
    raw = args.cases.read_bytes()
    cases = json.loads(raw)
    token_a = args.token_file.read_text().strip()
    token_b = args.second_token_file.read_text().strip()
    report = {
        "started_at": datetime.now(UTC).isoformat(),
        "corpus_version": cases["version"],
        "corpus_sha256": hashlib.sha256(raw).hexdigest(),
        "scope": cases["scope"],
        "backend_source_sha256": source_hashes(),
        "fields": [],
        "field_requests": [],
        "drafts": [],
        "concurrent": [],
        "max_batch": {},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    async with httpx.AsyncClient(
        base_url=args.url, timeout=60, trust_env=False, follow_redirects=False
    ) as client:

        async def post(path, body, token=token_a):
            start = time.monotonic()
            try:
                response = await client.post(path, json=body, headers={"Authorization": f"Bearer {token}"})
                data = response.json()
                return {
                    "http_status": response.status_code,
                    "seconds": round(time.monotonic() - start, 4),
                    "response": data,
                }
            except (httpx.HTTPError, ValueError):
                return {
                    "http_status": 0,
                    "seconds": round(time.monotonic() - start, 4),
                    "error": "TRANSPORT_ERROR",
                }

        headers = {"Authorization": f"Bearer {token_a}"}
        ready = await client.get("/v1/readiness", headers=headers)
        ready.raise_for_status()
        report["readiness"] = ready.json()
        response = await client.get("/v1/source-catalog", headers=headers)
        response.raise_for_status()
        catalog = response.json()["source_catalog"]

        def field_payload(selected, request_id):
            return {
                "protocol_version": "1.0",
                "request_id": request_id,
                "fields": [{k: v for k, v in f.items() if k != "expected"} for f in selected],
                "source_catalog": catalog,
            }

        for index in range(0, len(cases["fields"]), 10):
            batch = cases["fields"][index : index + 10]
            result = await post("/v1/fields/resolve", field_payload(batch, f"eval-fields-{index}"))
            report["field_requests"].append(result)
            by_id = {r["field_id"]: r for r in result.get("response", {}).get("results", [])}
            for field in batch:
                actual = by_id.get(field["field_id"])
                correct = actual is not None and actual["source_path"] == field["expected"]
                report["fields"].append({**field, "actual": actual, "correct": correct})
            save()
            print(f"字段检查 {index + len(batch)}/{len(cases['fields'])}", flush=True)

        def draft_payload(case, request_id):
            return {
                "protocol_version": "1.0",
                "request_id": request_id,
                "question": case["question"],
                "job_requirements": [],
                "facts": case["facts"],
                "constraints": {"language": "zh-CN", "tone": "professional_plain", "max_characters": 300},
            }

        for index, case in enumerate(cases["drafts"]):
            result = await post("/v1/answers/draft", draft_payload(case, f"eval-draft-{index}"))
            data = result.get("response", {})
            ids = {f["id"] for f in case["facts"]}
            protocol_valid = (
                result["http_status"] == 200
                and set(data.get("used_fact_ids", [])) <= ids
                and len(data.get("text", "")) <= 300
            )
            expected = case["expected_status"]
            status_ok = (
                data.get("status") == expected
                or expected == "review_or_abstain"
                and data.get("status") in {"needs_review", "insufficient_facts"}
            )
            report["drafts"].append(
                {"case": case, **result, "protocol_valid": protocol_valid, "status_ok": status_ok}
            )
            save()
            if (index + 1) % 5 == 0:
                print(f"草稿检查 {index + 1}/30", flush=True)

        positive = [f for f in cases["fields"] if f["expected"] is not None][:40]
        report["max_batch"] = await post("/v1/fields/resolve", field_payload(positive, "eval-max-40"))
        save()
        for index in range(20):
            results = await asyncio.gather(
                *[
                    post(
                        "/v1/answers/draft",
                        draft_payload(cases["drafts"][index], f"eval-concurrent-{index}-{slot}"),
                        token,
                    )
                    for slot, token in enumerate([token_a, token_b])
                ]
            )
            report["concurrent"].extend(results)
            save()
            if (index + 1) % 5 == 0:
                print(f"双并发检查 {index + 1}/20 轮", flush=True)
        positives = [f for f in report["fields"] if f["expected"] is not None]
        suggestions = [
            f for f in report["fields"] if f.get("actual") and f["actual"]["status"] == "suggested"
        ]
        report["summary"] = {
            "field_count": len(report["fields"]),
            "field_correct": sum(f["correct"] for f in report["fields"]),
            "suggestion_count": len(suggestions),
            "suggestion_correct": sum(f["correct"] for f in suggestions),
            "answerable_count": len(positives),
            "answerable_correct": sum(f["correct"] for f in positives),
            "draft_protocol_valid": sum(r["protocol_valid"] for r in report["drafts"]),
            "draft_expected_status": sum(r["status_ok"] for r in report["drafts"]),
            "concurrent_success": sum(r["http_status"] == 200 for r in report["concurrent"]),
            "fields_latency": latency(report["field_requests"]),
            "draft_latency": latency(report["drafts"]),
            "concurrent_latency": latency(report["concurrent"]),
        }
        report["finished_at"] = datetime.now(UTC).isoformat()
        save()
        print(json.dumps(report["summary"], ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--token-file", type=Path, default=Path(".runtime/evaluation.token"))
    parser.add_argument("--second-token-file", type=Path, default=Path(".runtime/evaluation-b.token"))
    parser.add_argument("--cases", type=Path, default=Path("eval/cases.json"))
    parser.add_argument("--output", type=Path, default=Path("../artifacts/backend-evaluation.json"))
    asyncio.run(evaluate(parser.parse_args()))


if __name__ == "__main__":
    main()
