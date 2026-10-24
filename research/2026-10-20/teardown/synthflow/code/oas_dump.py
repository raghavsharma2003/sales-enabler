"""Dump a request/response schema from the Synthflow OpenAPI file, resolving $refs (depth-limited).
Usage: python3 -I oas_dump.py <openapi.json> <METHOD> <path> [req|resp]"""
import json, sys
d = json.load(open(sys.argv[1]))
S = d["components"]["schemas"]

def res(x, depth=0, seen=()):
    if depth > 40:
        return "..."
    if isinstance(x, dict):
        if "$ref" in x:
            name = x["$ref"].split("/")[-1]
            if name in seen:
                return f"<{name}>"
            return res(S.get(name, {}), depth + 1, seen + (name,))
        out = {}
        for k, v in x.items():
            if k in ("example", "examples"):
                continue
            out[k] = res(v, depth + 1, seen)
        return out
    if isinstance(x, list):
        return [res(i, depth + 1, seen) for i in x]
    return x

def flat(x, pre="", out=None):
    out = [] if out is None else out
    if isinstance(x, dict):
        if isinstance(x.get("properties"), dict):
            req = set(x.get("required", []))
            for k, v in x["properties"].items():
                t = v.get("type") if isinstance(v, dict) else None
                en = v.get("enum") if isinstance(v, dict) else None
                desc = (v.get("description") or "")[:160].replace("\n", " ") if isinstance(v, dict) else ""
                out.append(f"{pre}{k}{'*' if k in req else ''} [{t}]{' enum=' + str(en) if en else ''} {desc}")
                flat(v, pre + k + ".", out)
        for key in ("items",):
            if key in x:
                flat(x[key], pre + "[]", out)
        for key in ("oneOf", "anyOf", "allOf"):
            if key in x:
                for i, sub in enumerate(x[key]):
                    flat(sub, pre + f"{key}{i}.", out)
    return out

m, p = sys.argv[2].lower(), sys.argv[3]
part = sys.argv[4] if len(sys.argv) > 4 else "req"
op = d["paths"][p][m]
if part == "req":
    body = op.get("requestBody", {}).get("content", {})
    sch = next(iter(body.values()), {}).get("schema", {}) if body else {}
    for prm in op.get("parameters", []):
        prm = res(prm)
        print("PARAM", prm.get("in"), prm.get("name"), prm.get("schema", {}).get("type"), (prm.get("description") or "")[:150])
else:
    r = op["responses"]
    sch = next(iter(next(iter(r.values())).get("content", {}).values()), {}).get("schema", {})
print("\n".join(flat(res(sch))))
