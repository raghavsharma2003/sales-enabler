#!/usr/bin/env python3
"""manifest.csv for data/account-phase/vapi: path,bytes,sha256,source,fetched_at"""
import csv, hashlib, os, datetime, json, glob

ROOT = "/home/user/sales-enabler"
BASE = os.path.join(ROOT, "data/account-phase/vapi")
OUT = os.path.join(ROOT, "research/2026-10-20/account-phase/vapi/manifest.csv")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# request path for each saved API response (stem -> "METHOD path")
READS = {
    "analytics-response": "POST /analytics (read-only query)",
    "assistant-list": "GET /assistant",
    "board-default-metrics": "GET /reporting/board/default/metrics-overview",
    "board-list": "GET /reporting/board",
    "call-list": "GET /call",
    "campaign-list": "GET /campaign",
    "chat-list": "GET /chat",
    "eval-list": "GET /eval",
    "eval-run-list": "GET /eval/run",
    "file-list": "GET /file",
    "insight-list": "GET /reporting/insight",
    "org-probe": "GET /org (401 expected)",
    "phone-number-list": "GET /phone-number",
    "provider-11labs-pronunciation": "GET /provider/11labs/pronunciation-dictionary",
    "scorecard-list": "GET /observability/scorecard",
    "sdkop-assistant-versions": "GET /assistant/{id}/versions",
    "sdkop-credential": "GET /credential",
    "sdkop-knowledge-base": "GET /knowledge-base",
    "sdkop-template": "GET /template",
    "sdkop-test-suite": "GET /test-suite",
    "sdkop-token": "GET /token (values redacted)",
    "sdkop-v2-assistant": "GET /v2/assistant",
    "sdkop-v2-call": "GET /v2/call",
    "sdkop-voice-library-vapi": "GET /voice-library/vapi",
    "sdkop-workflow": "GET /workflow",
    "session-list": "GET /session",
    "sim-concurrency": "GET /eval/simulation/concurrency",
    "sim-list": "GET /eval/simulation",
    "sim-personality-list": "GET /eval/simulation/personality",
    "sim-run-list": "GET /eval/simulation/run",
    "sim-scenario-list": "GET /eval/simulation/scenario",
    "sim-suite-list": "GET /eval/simulation/suite",
    "squad-list": "GET /squad",
    "structured-output-list": "GET /structured-output",
    "tool-list": "GET /tool",
    "traffic-allocations-latest": "GET /traffic-allocations/latest (400 without assistantId)",
    "traffic-allocations-list": "GET /traffic-allocations",
    "v2-campaign-counters": "GET /v2/campaign",
    "v2-campaign-list": "GET /v2/campaign",
    "v2-knowledge-base-list": "GET /v2/knowledge-base",
    "v2-phone-number-list": "GET /v2/phone-number",
}


def src_for(rel):
    parts = rel.split("/")
    d, f = parts[0], parts[-1]
    stem = f.split(".")[0]
    if d in ("api-reads", "api-reads2", "api-writes", "api-writes2", "cleanup"):
        if f.endswith(".headers.txt"):
            return "response headers of the call that produced " + f.replace(".headers.txt", ".json") + " (api.vapi.ai, our key; cookie headers redacted)"
        if d == "api-reads" and stem in READS:
            return "https://api.vapi.ai " + READS[stem] + " with our API key"
        return "https://api.vapi.ai authorized call with our API key (" + d + "/" + stem + "); request body, if any, is the synthetic payload described in report.md"
    if d == "openapi":
        return "https://api.vapi.ai/api-json"
    if d == "docs-openapi":
        return "https://docs.vapi.ai/ (llms.txt, openapi/api-reference.json, openapi/webhooks.json)"
    if d == "rea":
        return "npx rea-agents analyze-javascript-application on the public @vapi-ai/web 3.0.0 dist (local analysis output)"
    if d == "derived":
        return "derived locally from openapi/api-json.json, docs-openapi/webhooks, api.ts of @vapi-ai/web and the REA output (no network)"
    if d.startswith("sdk-"):
        return "npm/PyPI package archive (public registry), extracted without install or execution"
    return "local"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ts(path):
    return datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


rows = []
agg = {}
for root, dirs, files in os.walk(BASE):
    dirs.sort()
    for f in sorted(files):
        p = os.path.join(root, f)
        rel = os.path.relpath(p, BASE)
        parts = rel.split("/")
        # extracted package trees: aggregate (13k files)
        if "x" in parts[:3] and parts[0].startswith("sdk-") and "x" in parts[:3]:
            i = parts.index("x")
            key = "/".join(parts[: i + 1])
            agg.setdefault(key, []).append((os.path.relpath(p, os.path.join(BASE, key)), sha(p), os.path.getsize(p), ts(p)))
            continue
        rows.append(("data/account-phase/vapi/" + rel, os.path.getsize(p), sha(p), src_for(rel), ts(p)))

for key, items in sorted(agg.items()):
    items.sort()
    h = hashlib.sha256()
    for rel, s, _, _ in items:
        h.update((rel + " " + s + "\n").encode())
    rows.append(("data/account-phase/vapi/" + key + "/ (tree)", sum(i[2] for i in items), h.hexdigest(),
                 "extracted package tree, %d files; sha256 is over the sorted 'relpath sha256' lines (not executed, not installed)" % len(items),
                 ts(sorted(glob.glob(os.path.join(BASE, os.path.dirname(key), '*.tgz')) + glob.glob(os.path.join(BASE, os.path.dirname(key), '*.whl')))[0])))

with open(OUT, "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["path", "bytes", "sha256", "source", "fetched_at"])
    for r in rows:
        w.writerow(r)
print(len(rows), "rows ->", OUT)
