import json
import tempfile
from dataclasses import asdict
from pathlib import Path

from app.catalog import CATALOG
from app.config import Settings
from app.main import create_app
from app.schemas import DraftRequest, DraftResponse, ResolveRequest, ResolveResponse

root = Path(__file__).resolve().parents[2] / "contracts" / "api"
root.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="resume-contracts-") as folder:
    app = create_app(Settings(data_directory=folder))
    openapi = app.openapi()
documents = {
    "openapi.json": openapi,
    "source-catalog.json": [{k: v for k, v in asdict(item).items() if k != "aliases"} for item in CATALOG],
}
for model in [ResolveRequest, ResolveResponse, DraftRequest, DraftResponse]:
    documents[f"{model.__name__}.schema.json"] = model.model_json_schema()
for name, value in documents.items():
    (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def ts(schema):
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]
    if "const" in schema:
        return json.dumps(schema["const"], ensure_ascii=False)
    if "enum" in schema:
        return " | ".join(json.dumps(v, ensure_ascii=False) for v in schema["enum"])
    if "anyOf" in schema:
        return " | ".join(ts(v) for v in schema["anyOf"])
    kind = schema.get("type")
    if kind == "object":
        required = set(schema.get("required", []))
        return (
            "{ "
            + "; ".join(
                json.dumps(k) + ("" if k in required else "?") + ": " + ts(v)
                for k, v in schema.get("properties", {}).items()
            )
            + " }"
        )
    if kind == "array":
        return "Array<" + ts(schema["items"]) + ">"
    return {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "null": "null",
    }.get(kind, "unknown")


definitions = {}
for model in [ResolveRequest, ResolveResponse, DraftRequest, DraftResponse]:
    schema = model.model_json_schema()
    definitions.update(schema.get("$defs", {}))
    definitions[model.__name__] = schema
(root / "types.generated.ts").write_text(
    "// Generated from backend Pydantic schemas; run scripts/export_contracts.py.\n"
    + "\n".join(f"export type {name} = {ts(value)};" for name, value in definitions.items())
    + "\n"
)
print(f"已导出 {len(documents)} 份接口契约至 contracts/api")
