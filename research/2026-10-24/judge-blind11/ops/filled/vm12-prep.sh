#!/bin/bash
# vm12 job (BLIND 11 crisis + BLIND-BR2 brief review), step 1, NO model traffic. Adapted from
# ../../judge-blind10/ops/prep11.sh. Staging stays at what it runs (6b0d859, deployed 07:02:07 UTC) and is not touched.
# Records lab and staging health before the job; fetches the bundle (git archive of HEAD's product/, package.json and
# package-lock.json, plus BUNDLE_SHA and ops12/fetch_spy.mjs) from blob into a VM-only tree /tmp/je12; reuses staging's
# node_modules only if package.json and the lockfile are byte-identical; re-checks the pinned file hashes on the VM copy
# (a mismatch stops the job); and makes dry runs with a scripted fake model (no network) on DEV sets only: crisis
# (dev-7 + dev-lookalike-11) and brief review (dev-brief-review, with the attribution spy loaded). BLIND 11 and BLIND-BR2
# are hashed, never run or read here. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
echo "== prep12 $(date -u)"
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
echo "runtime drop-ins: $(ls /etc/systemd/system/vp-stage-runtime.service.d 2>/dev/null | wc -l); judge env file: $( [ -f $S/judge-shadow.env ] && echo present || echo absent )"
echo "lab journal error lines since 07:02: $(journalctl -u voicelab --since '2026-10-24 07:02:07' --no-pager | grep -ciE 'error|traceback')"
echo "service account file: lab $( [ -f /opt/voicelab/vertex-sa.json ] && echo present || echo absent )"
echo "lab Vertex ledger: last row $(( $(date +%s) - $(tail -1 /opt/voicelab/data/vertex-spend.jsonl 2>/dev/null | $S/venv/bin/python -c "import json,sys; print(int(json.loads(sys.stdin.read() or '{\"ts\":0}')['ts']))" 2>/dev/null || echo 0) ))s ago"
echo "earlier eval trees in /tmp: $(ls -d /tmp/je* 2>/dev/null | tr '\n' ' ')"
echo "node $($S/node/bin/node --version)"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
set -e
echo "== build /tmp/je12 from blob vm12-je12-bundle.tgz"
rm -rf /tmp/je12 /tmp/je12-bundle.tgz && mkdir -p /tmp/je12
curl -fsS -o /tmp/je12-bundle.tgz -H "x-ms-version: 2022-11-02" "$B/vm12-je12-bundle.tgz?$SAS"
echo "bundle sha256 $(sha256sum /tmp/je12-bundle.tgz | cut -c1-64) (expect 2e279e68bedce1f50b234d1d67ee39bc25c78e769405152bb0cac3dc69870e8d)"
[ "$(sha256sum /tmp/je12-bundle.tgz | cut -c1-64)" = "2e279e68bedce1f50b234d1d67ee39bc25c78e769405152bb0cac3dc69870e8d" ]
tar xzf /tmp/je12-bundle.tgz -C /tmp/je12 && rm -f /tmp/je12-bundle.tgz
echo "je12 BUNDLE_SHA $(cat /tmp/je12/BUNDLE_SHA)"
cmp -s /tmp/je12/package-lock.json $S/app/package-lock.json && cmp -s /tmp/je12/package.json $S/app/package.json \
  && echo "package.json and lockfile identical to staging's: node_modules reused" || { echo "lockfile differs from staging's; stop"; exit 6; }
ln -s $S/app/node_modules /tmp/je12/node_modules
cd /tmp/je12
$S/venv/bin/python - <<'PY'
import hashlib
# Pinned in ../judge-blind11/PREREG.md and ../brief-review-blind2/PREREG.md (sha256, first 16 hex, at the head 9c16159).
want = {'product/shared/safety/judge.json': '1d467ad8ee1ad73e', 'product/shared/safety/judge.ts': 'fdce56943ff4a6f5',
        'product/shared/safety/rules.json': 'eebd2f947159a2c1', 'product/shared/safety/index.ts': '59d2e92f20c9b7cb',
        'product/shared/safety/cases.json': 'cd2a957d77cb24cf', 'product/scripts/judge-eval.mjs': 'aa468b65609aef78',
        'product/server/llm.ts': 'a54159bdca32094d', 'product/server/vertex-token.ts': '0beadb37530183bb',
        'product/shared/safety/brief-review.json': '674194ac08790e9a', 'product/server/modules/agents/review.ts': 'ddc2047bb1c8dfad',
        'product/server/modules/agents/guard.ts': '1d2260c2daa0af4a', 'product/server/modules/agents/templates.ts': '10674c3840044586',
        'product/shared/safety/sets/heldout-11.json': 'fd83ce9671bc8346', 'product/shared/safety/sets/heldout-brief-review-2.json': '136eba412f14a5f0',
        'product/shared/safety/sets/dev-lookalike-11.json': 'abed721b41b2db2c', 'product/shared/safety/sets/dev-brief-review.json': 'd9a6a2593010267c',
        'product/voice/vpvoice/rules.py': '5774c0496deff640', 'product/voice/vpvoice/safety.py': 'd0349c09ed306f8b',
        'ops12/fetch_spy.mjs': 'a7d874dc1db1ad28'}
bad = [p for p, h in want.items() if hashlib.sha256(open('/tmp/je12/' + p, 'rb').read()).hexdigest()[:16] != h]
print('hash check:', f'all {len(want)} match' if not bad else f'MISMATCH {bad}')
raise SystemExit(1 if bad else 0)
PY
$S/venv/bin/python -c "
import json, hashlib
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()[:16]
j = json.load(open('/tmp/je12/product/shared/safety/judge.json'))['judges']['caller_crisis']
print('judge.json: threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'], 'system_prompt sha256_16', sha(j['system_prompt']))
b = json.load(open('/tmp/je12/product/shared/safety/brief-review.json'))
print('brief-review.json: threshold', b['threshold'], 'timeout_ms', b['timeout_ms'], 'max_tokens', b['max_tokens'], 'temperature', b['temperature'], 'system_prompt sha256_16', sha(b['system_prompt']))"
chmod -R go-w /tmp/je12
echo "== dry runs: scripted fake model, no network, DEV sets only"
export PATH=$S/node/bin:$PATH
cat > /tmp/je12-fake-a.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "confidence": 0.1, "kind": "none", "opt_out": false, "opt_out_confidence": 0.1}', toolCalls: [], usage: { inputTokens: 640, outputTokens: 30 }, model: 'fake', provider: 'fake' });
EOF
cat > /tmp/je12-fake-br.mjs <<'EOF'
export default () => ({ text: '{"findings": []}', toolCalls: [], usage: { inputTokens: 900, outputTokens: 10 }, model: 'fake', provider: 'fake' });
EOF
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER
show() { $S/venv/bin/python -c "import json; r=json.load(open('/tmp/judge-eval/$1/report.json')); t=list(r['tasks'])[0]; print('  dry', '$1', 'prompt', r['prompt'], 'sources', r['sources'], 'n', r['n'], 'task', t, 'n', r['tasks'][t]['n'], 'unavailable', r['judge_unavailable']['k'], 'threshold', r['threshold'], 'timeout_ms', r['timeout_ms'], 'stopped', r['stopped_early'])"; }
cd /tmp/je12 && VP_JUDGE_EVAL_FAKE=/tmp/je12-fake-a.mjs VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
  timeout 300 node product/scripts/judge-eval.mjs --task crisis --source dev-7 --set product/shared/safety/sets/dev-lookalike-11.json --rps 0 --concurrency 4 \
  --price-in 28.5 --price-out 237.5 --label j12-dry-crisis --out-dir /tmp/judge-eval/j12-dry-crisis > /dev/null 2>&1; show j12-dry-crisis
cd /tmp/je12 && VP_JUDGE_EVAL_FAKE=/tmp/je12-fake-br.mjs VP_LLM_BRIEF_REVIEW_URL=http://127.0.0.1:9 VP_LLM_BRIEF_REVIEW_KEY=x VP_LLM_BRIEF_REVIEW_MODEL=fake VP_FETCH_SPY_OUT=/tmp/je12-dry-spy.jsonl \
  timeout 300 node --import tsx --import /tmp/je12/ops12/fetch_spy.mjs product/scripts/judge-eval.mjs --task brief-review --set product/shared/safety/sets/dev-brief-review.json --rps 0 --concurrency 1 \
  --price-in 28.5 --price-out 237.5 --label j12-dry-br --out-dir /tmp/judge-eval/j12-dry-br > /dev/null 2>&1; show j12-dry-br
echo "  spy loaded with the VM's node (fake model: no fetch to log): $( [ -e /tmp/je12-dry-spy.jsonl ] && wc -l < /tmp/je12-dry-spy.jsonl || echo 0 ) records"
# The shipped review route, configured exactly as the BR2 run will be (no network: nothing is minted or called here).
cat > /tmp/je12-cfg.mjs <<'EOF'
const r = await import('/tmp/je12/product/server/modules/agents/review.ts');
console.log('  review configured with AUTH=vertex (no network):', r.reviewConfigured());
EOF
cd /tmp/je12 && env -u VP_LLM_BRIEF_REVIEW_KEY -u VP_LLM_BRIEF_REVIEW_KEY_HEADER VP_LLM_BRIEF_REVIEW_AUTH=vertex VERTEX_SA_FILE=/opt/voicelab/vertex-sa.json VP_REGION=centralindia \
  VP_LLM_BRIEF_REVIEW_URL=https://aiplatform.googleapis.com/v1/projects/x/locations/global/endpoints/openapi/chat/completions VP_LLM_BRIEF_REVIEW_MODEL=google/gemini-3.5-flash-lite \
  timeout 60 node --import tsx /tmp/je12-cfg.mjs 2>&1 | grep -v '^\s*$' | cut -c1-200
rm -rf /tmp/judge-eval/j12-dry-* /tmp/je12-fake-a.mjs /tmp/je12-fake-br.mjs /tmp/je12-dry-spy.jsonl /tmp/je12-cfg.mjs
echo "earlier eval outputs kept on the VM: $(ls /tmp/judge-eval 2>/dev/null | tr '\n' ' ')"
echo "== prep12 done $(date -u)"
