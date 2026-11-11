"""Write docs/API.md from the application's own OpenAPI schema, so the reference can never drift from the code.

Run from the backend folder:   ./venv/bin/python -m scripts.generate_api_docs
"""

import re
from collections import defaultdict
from pathlib import Path

from app.main import app

OUT = Path(__file__).resolve().parents[2] / "docs" / "API.md"
PUBLIC = {("post", "/auth/register"), ("post", "/auth/login"), ("post", "/auth/refresh"), ("get", "/health")}


def ref_name(schema: dict | None) -> str:
    """A short, readable name for a request/response schema."""
    if not schema:
        return ""
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if schema.get("type") == "array":
        return f"list of {ref_name(schema.get('items'))}"
    return schema.get("type", "")


def main() -> None:
    spec = app.openapi()
    groups: dict[str, list[tuple[str, str, dict]]] = defaultdict(list)
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            groups[(op.get("tags") or ["other"])[0]].append((method, path, op))

    lines = [
        "# API reference",
        "",
        f"_{spec['info']['title']} {spec['info'].get('version', '')}. Generated from the running application's OpenAPI schema by "
        "`backend/scripts/generate_api_docs.py`: do not edit by hand. Interactive docs are served at `/docs` while the API runs._",
        "",
        "**Conventions**",
        "",
        "- **Auth:** every endpoint except the ones marked *public* needs `Authorization: Bearer <access token>`.",
        "- **Money** is always an integer in the currency's minor unit (cents, kopecks; rials have no subunit).",
        "- **Idempotency:** endpoints that move money take an `Idempotency-Key` header (8-64 characters). Repeating a request with the "
        "same key returns the original result and moves no money.",
        "- **Errors** are `{ \"detail\": \"English text\", \"code\": \"stable_code\", \"params\": {...} }`. Clients translate from `code` + `params`, never from the text.",
        "- **Language:** the `Accept-Language` header (`en`, `ru`, `fa`) picks the language of texts the server itself writes (the SMS).",
        "",
    ]
    for tag in sorted(groups):
        lines += [f"## {tag}", "", "| Method | Path | What it does | Request | Response |", "|---|---|---|---|---|"]
        for method, path, op in sorted(groups[tag], key=lambda x: (x[1], x[0])):
            summary = (op.get("description") or op.get("summary") or "").strip().split("\n\n")[0].replace("\n", " ")
            summary = re.sub(r"\s+", " ", summary).replace("|", "\\|")
            body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
            ok = next((v for k, v in op.get("responses", {}).items() if k.startswith("2")), {})
            resp = ok.get("content", {}).get("application/json", {}).get("schema")
            public = " *(public)*" if (method, path) in PUBLIC else ""
            lines.append(f"| `{method.upper()}` | `{path}`{public} | {summary} | {ref_name(body)} | {ref_name(resp)} |")
        lines.append("")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} ({sum(len(v) for v in groups.values())} endpoints)")


if __name__ == "__main__":
    main()
