"""Summarise Retell's published OpenAPI spec (read-only; run with python3 -I).

usage: python3 -I openapi_summary.py <openapi.yaml> <out.json>
"""
import json
import sys

import yaml

src, out = sys.argv[1], sys.argv[2]
spec = yaml.safe_load(open(src, encoding="utf-8"))
ops = []
for path, item in spec.get("paths", {}).items():
    for method, op in item.items():
        if method not in ("get", "post", "put", "patch", "delete"):
            continue
        ops.append({
            "method": method.upper(),
            "path": path,
            "operationId": op.get("operationId"),
            "summary": op.get("summary"),
            "tags": op.get("tags"),
            "deprecated": op.get("deprecated", False),
        })
schemas = spec.get("components", {}).get("schemas", {})


def enum_props(name, sch, acc, prefix=""):
    if not isinstance(sch, dict):
        return
    for pname, p in (sch.get("properties") or {}).items():
        if isinstance(p, dict):
            if "enum" in p:
                acc.append({"schema": name, "prop": prefix + pname, "enum": p["enum"]})
            if p.get("type") == "array" and isinstance(p.get("items"), dict) and "enum" in p["items"]:
                acc.append({"schema": name, "prop": prefix + pname + "[]", "enum": p["items"]["enum"]})
            if p.get("type") == "object":
                enum_props(name, p, acc, prefix + pname + ".")
    for k in ("allOf", "oneOf", "anyOf"):
        for sub in sch.get(k, []) or []:
            enum_props(name, sub, acc, prefix)


enums = []
for n, s in schemas.items():
    enum_props(n, s, enums)

webhooks = list((spec.get("webhooks") or {}).keys())
result = {
    "info": spec.get("info"),
    "servers": spec.get("servers"),
    "n_ops": len(ops),
    "n_schemas": len(schemas),
    "ops": ops,
    "schema_names": sorted(schemas.keys()),
    "enums": enums,
    "webhooks": webhooks,
}
json.dump(result, open(out, "w", encoding="utf-8"), indent=1)
print("ops", len(ops), "schemas", len(schemas), "enums", len(enums), "webhooks", webhooks)
