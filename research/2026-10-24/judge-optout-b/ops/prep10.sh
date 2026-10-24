#!/bin/bash
# vm10 job, step 1 (no model traffic). Adapted from ../../judge-blind9/ops/prep9.sh, without the staging redeploy:
# staging stays at what it runs (680c5e6) and is not touched. Records lab and staging health before the job, fetches
# the 7c17724 bundle (git archive of product/, package.json, package-lock.json, plus BUNDLE_SHA) from blob into a
# VM-only tree /tmp/je10, reuses staging's node_modules only if the lockfile and package.json are byte-identical, checks
# the files this job reads by sha256 (first 16 hex), and does dry runs with a scripted fake model (no network) on the
# DEV sets only: opt-out under prompt B (--prompt-file) and the brief review on dev-brief-review.json. The blind
# brief-review set is hashed, never run or read here. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
echo "== prep10 $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql || true
systemctl show voicelab -p ActiveEnterTimestamp -p NRestarts
systemctl show vp-stage-runtime -p ActiveEnterTimestamp -p NRestarts; systemctl show vp-stage-control -p ActiveEnterTimestamp -p NRestarts
echo "lab ping local: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"
curl -s -m 10 -o /dev/null -w "lab public ping %{http_code} %{time_total}s\n" https://$FQDN/api/ping
curl -s -m 10 -o /dev/null -w "staging no-auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /dev/null -w "staging auth /v1/health %{http_code}\n" -u "${VP_STAGE_USER:-vp}:$VP_STAGE_PASS" https://$FQDN:8443/v1/health
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
echo "staging deployed: $(cat $S/app/BUNDLE_SHA)"; grep '^VERTEX_OFF=' $S/.env
echo "runtime judge env vars: $(tr '\0' '\n' < /proc/$(systemctl show vp-stage-runtime -p MainPID --value)/environ | grep -c '^VP_LLM_SAFETY_JUDGE_')"
echo "lab journal error lines since 04:00: $(journalctl -u voicelab --since '2026-10-24 04:00' --no-pager | grep -ciE 'error|traceback')"
echo "service account file: staging $( [ -f $S/vertex-sa.json ] && echo present || echo absent ), lab $( [ -f /opt/voicelab/vertex-sa.json ] && echo present || echo absent )"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
set -e
echo "== build /tmp/je10 from blob vm10-je10-bundle.tgz"
rm -rf /tmp/je10 /tmp/je10-bundle.tgz && mkdir -p /tmp/je10
curl -fsS -o /tmp/je10-bundle.tgz -H "x-ms-version: 2022-11-02" "$B/vm10-je10-bundle.tgz?$SAS"
echo "bundle sha256 $(sha256sum /tmp/je10-bundle.tgz | cut -c1-64) (expect __BUNDLE_SHA256__)"
[ "$(sha256sum /tmp/je10-bundle.tgz | cut -c1-64)" = "__BUNDLE_SHA256__" ]
tar xzf /tmp/je10-bundle.tgz -C /tmp/je10 && rm -f /tmp/je10-bundle.tgz
echo "je10 BUNDLE_SHA $(cat /tmp/je10/BUNDLE_SHA)"
cmp -s /tmp/je10/package-lock.json $S/app/package-lock.json && cmp -s /tmp/je10/package.json $S/app/package.json \
  && echo "package.json and lockfile identical to staging's: node_modules reused" || { echo "lockfile differs from staging's; stop"; exit 6; }
ln -s $S/app/node_modules /tmp/je10/node_modules
cd /tmp/je10
$S/venv/bin/python - <<'PY'
import hashlib
want = {'product/shared/safety/sets/heldout-brief-review.json': '6b2a5721e3029acb', 'product/shared/safety/sets/dev-brief-review.json': '244cb376d11421c1',
        'product/shared/safety/brief-review.json': '242800cdee0bde81', 'product/shared/safety/judge.json': '1d467ad8ee1ad73e',
        'product/shared/safety/prompts/caller_crisis.risk100.txt': '14fcc3ac8fcb181a', 'product/shared/safety/rules.json': '846bab6697b31ad2',
        'product/shared/safety/cases.json': '714e3158a49d088e', 'product/scripts/judge-eval.mjs': 'a790b0a86d705963',
        'product/server/modules/agents/review.ts': '11e6178bc8a42b3a', 'product/server/modules/agents/guard.ts': '71bb0ff61913ac43',
        'product/server/modules/agents/templates.ts': '5e24d6bdc033e488', 'product/shared/safety/judge.ts': 'fdce56943ff4a6f5',
        'product/server/llm.ts': 'e3288671a3428d41'}
bad = [p for p, h in want.items() if hashlib.sha256(open('/tmp/je10/' + p, 'rb').read()).hexdigest()[:16] != h]
print('hash check:', f'all {len(want)} match' if not bad else f'MISMATCH {bad}')
b = open('/tmp/je10/product/shared/safety/prompts/caller_crisis.risk100.txt', encoding='utf-8').read().strip()
print('prompt B trimmed sha256_16 (what --prompt-file records):', hashlib.sha256(b.encode()).hexdigest()[:16])
raise SystemExit(1 if bad else 0)
PY
$S/venv/bin/python -c "
import json
j = json.load(open('/tmp/je10/product/shared/safety/judge.json'))['judges']['caller_crisis']
print('judge.json: threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'])
r = json.load(open('/tmp/je10/product/shared/safety/brief-review.json'))
print('brief-review.json: threshold', r['threshold'], 'timeout_ms', r['timeout_ms'], 'max_tokens', r['max_tokens'], 'temperature', r['temperature'])"
chmod -R go-w /tmp/je10
echo "== dry runs: scripted fake model, no network, DEV sets only"
export PATH=$S/node/bin:$PATH
cat > /tmp/je10-fake-b.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "risk": 5, "kind": "none", "opt_out": true, "opt_out_confidence": 0.9}', toolCalls: [], usage: { inputTokens: 800, outputTokens: 32 }, model: 'fake', provider: 'fake' });
EOF
cat > /tmp/je10-fake-br.mjs <<'EOF'
export default () => ({ text: '{"findings": []}', toolCalls: [], usage: { inputTokens: 950, outputTokens: 8 }, model: 'fake', provider: 'fake' });
EOF
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER
cd /tmp/je10 && VP_JUDGE_EVAL_FAKE=/tmp/je10-fake-b.mjs VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
  timeout 300 node product/scripts/judge-eval.mjs --task opt_out --source optout-dev --prompt-file product/shared/safety/prompts/caller_crisis.risk100.txt \
  --rps 0 --concurrency 4 --price-in 28.5 --price-out 237.5 --label j10-dry-b --out-dir /tmp/judge-eval/j10-dry-b 2>&1 | grep -E "^Sources|^Thresholds|^\| overall" | cut -c1-240
$S/venv/bin/python -c "import json; r=json.load(open('/tmp/judge-eval/j10-dry-b/report.json')); print('  dry B prompt', r['prompt'], 'n', r['n'], 'unavailable', r['judge_unavailable']['k'], 'opt_out_threshold', r['opt_out_threshold'])"
cd /tmp/je10 && VP_JUDGE_EVAL_FAKE=/tmp/je10-fake-br.mjs VP_LLM_BRIEF_REVIEW_URL=http://127.0.0.1:9 VP_LLM_BRIEF_REVIEW_KEY=x VP_LLM_BRIEF_REVIEW_MODEL=fake \
  timeout 300 node product/scripts/judge-eval.mjs --task brief-review --set product/shared/safety/sets/dev-brief-review.json \
  --rps 0 --concurrency 4 --price-in 28.5 --price-out 237.5 --label j10-dry-br --out-dir /tmp/judge-eval/j10-dry-br 2>&1 | grep -E "^Sources|^Threshold|^\| overall" | cut -c1-240
$S/venv/bin/python -c "import json; r=json.load(open('/tmp/judge-eval/j10-dry-br/report.json')); print('  dry brief prompt', r['prompt'], 'n', r['n'], 'unavailable', r['judge_unavailable']['k'], 'threshold', r['threshold'], 'timeout_ms', r['timeout_ms'])"
rm -rf /tmp/judge-eval/j10-dry-* /tmp/je10-fake-b.mjs /tmp/je10-fake-br.mjs
echo "earlier eval outputs kept on the VM: $(ls /tmp/judge-eval 2>/dev/null | tr '\n' ' ')"
echo "== prep10 done $(date -u)"
