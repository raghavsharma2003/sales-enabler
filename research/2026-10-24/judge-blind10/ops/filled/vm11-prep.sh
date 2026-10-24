#!/bin/bash
# vm11 job (PREREG-10), step 1, no model traffic. Adapted from ../../judge-optout-b/ops/prep10.sh: staging stays at what
# it runs (680c5e6) and is not touched. Records lab and staging health before the job, fetches the 0e77e47 bundle (git
# archive of product/, package.json, package-lock.json, plus BUNDLE_SHA) from blob into a VM-only tree /tmp/je11, reuses
# staging's node_modules only if package.json and the lockfile are byte-identical, re-checks the PREREG-10 file hashes on
# the VM copy (a mismatch stops the job), and does dry runs with a scripted fake model (no network) on the DEV sets only:
# crisis pooled (dev-7 + dev-lookalike-9) under A and under C (--prompt-file), and opt-out (optout-dev) under C.
# BLIND 10 (heldout-10.json) is hashed with sha256sum, never run or read here. Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; B="https://vpresearchraw1017.blob.core.windows.net/vl-transfer"
echo "== prep11 $(date -u)"
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
echo "lab journal error lines since 05:00: $(journalctl -u voicelab --since '2026-10-24 05:00' --no-pager | grep -ciE 'error|traceback')"
echo "service account file: lab $( [ -f /opt/voicelab/vertex-sa.json ] && echo present || echo absent ), staging $( [ -f $S/vertex-sa.json ] && echo present || echo absent )"
echo "earlier eval trees in /tmp: $(ls -d /tmp/je* 2>/dev/null | tr '\n' ' ')"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
set -e
echo "== build /tmp/je11 from blob vm11-je11-bundle.tgz"
rm -rf /tmp/je11 /tmp/je11t /tmp/je11-bundle.tgz && mkdir -p /tmp/je11
curl -fsS -o /tmp/je11-bundle.tgz -H "x-ms-version: 2022-11-02" "$B/vm11-je11-bundle.tgz?$SAS"
echo "bundle sha256 $(sha256sum /tmp/je11-bundle.tgz | cut -c1-64) (expect c7281ce2c7ebbdb8cb7f932378fb1cce67c48503d2100af4852b324a41e20461)"
[ "$(sha256sum /tmp/je11-bundle.tgz | cut -c1-64)" = "c7281ce2c7ebbdb8cb7f932378fb1cce67c48503d2100af4852b324a41e20461" ]
tar xzf /tmp/je11-bundle.tgz -C /tmp/je11 && rm -f /tmp/je11-bundle.tgz
echo "je11 BUNDLE_SHA $(cat /tmp/je11/BUNDLE_SHA)"
cmp -s /tmp/je11/package-lock.json $S/app/package-lock.json && cmp -s /tmp/je11/package.json $S/app/package.json \
  && echo "package.json and lockfile identical to staging's: node_modules reused" || { echo "lockfile differs from staging's; stop"; exit 6; }
ln -s $S/app/node_modules /tmp/je11/node_modules
cd /tmp/je11
$S/venv/bin/python - <<'PY'
import hashlib
# PREREG-10 fixes the first five (judge-prereg10/PREREG.md); the rest are recorded so the report can name what ran.
want = {'product/shared/safety/prompts/caller_crisis.c.txt': '272fa8494de3cff0', 'product/shared/safety/judge.json': '1d467ad8ee1ad73e',
        'product/shared/safety/sets/heldout-10.json': 'aae1d6019dabf339', 'product/scripts/judge-eval.mjs': 'a790b0a86d705963',
        'product/shared/safety/rules.json': '8108de0b7641ad0a',
        'product/shared/safety/cases.json': 'cd2a957d77cb24cf', 'product/shared/safety/sets/dev-lookalike-9.json': '335647f6a0f0e6d2',
        'product/shared/safety/judge.ts': 'fdce56943ff4a6f5', 'product/server/llm.ts': 'e3288671a3428d41'}
bad = [p for p, h in want.items() if hashlib.sha256(open('/tmp/je11/' + p, 'rb').read()).hexdigest()[:16] != h]
print('hash check (5 PREREG-10 files + 4 recorded):', f'all {len(want)} match' if not bad else f'MISMATCH {bad}')
c = open('/tmp/je11/product/shared/safety/prompts/caller_crisis.c.txt', encoding='utf-8').read().strip()
print('prompt C trimmed sha256_16 (what --prompt-file records):', hashlib.sha256(c.encode()).hexdigest()[:16], '(expect c97392ae76abeec2)')
raise SystemExit(1 if bad or hashlib.sha256(c.encode()).hexdigest()[:16] != 'c97392ae76abeec2' else 0)
PY
$S/venv/bin/python -c "
import json, hashlib
j = json.load(open('/tmp/je11/product/shared/safety/judge.json'))['judges']['caller_crisis']
print('judge.json: threshold', j['threshold'], 'opt_out_threshold', j['opt_out_threshold'], 'timeout_ms', j['timeout_ms'], 'max_tokens', j['max_tokens'], 'temperature', j['temperature'],
      'system_prompt sha256_16', hashlib.sha256(j['system_prompt'].encode()).hexdigest()[:16])"
chmod -R go-w /tmp/je11
echo "== dry runs: scripted fake model, no network, DEV sets only"
export PATH=$S/node/bin:$PATH
cat > /tmp/je11-fake-c.mjs <<'EOF'
export default () => ({ text: '{"crisis": true, "risk": 70, "kind": "indirect", "opt_out": true, "opt_out_confidence": 0.9}', toolCalls: [], usage: { inputTokens: 700, outputTokens: 34 }, model: 'fake', provider: 'fake' });
EOF
cat > /tmp/je11-fake-a.mjs <<'EOF'
export default () => ({ text: '{"crisis": false, "confidence": 0.1, "kind": "none", "opt_out": false, "opt_out_confidence": 0.1}', toolCalls: [], usage: { inputTokens: 640, outputTokens: 30 }, model: 'fake', provider: 'fake' });
EOF
unset VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_MODEL VP_LLM_DEFAULT_KEY_HEADER
DLK=product/shared/safety/sets/dev-lookalike-9.json; PC=product/shared/safety/prompts/caller_crisis.c.txt
dry() { local fake=$1 label=$2; shift 2
  cd /tmp/je11 && VP_JUDGE_EVAL_FAKE=$fake VP_LLM_SAFETY_JUDGE_URL=http://127.0.0.1:9 VP_LLM_SAFETY_JUDGE_KEY=x VP_LLM_SAFETY_JUDGE_MODEL=fake \
    timeout 300 node product/scripts/judge-eval.mjs "$@" --rps 0 --concurrency 4 --price-in 28.5 --price-out 237.5 --label $label --out-dir /tmp/judge-eval/$label 2>&1 | grep -E "^Sources|^Thresholds|^\| overall" | cut -c1-240
  $S/venv/bin/python -c "import json; r=json.load(open('/tmp/judge-eval/$label/report.json')); t=list(r['tasks'])[0]; print('  dry', '$label', 'prompt', r['prompt'], 'sources', r['sources'], 'n', r['n'], 'task n', r['tasks'][t]['n'], 'unavailable', r['judge_unavailable']['k'], 'threshold', r['threshold'], 'opt_out_threshold', r['opt_out_threshold'], 'stopped', r['stopped_early'])"; }
dry /tmp/je11-fake-a.mjs j11-dry-a-crisis --task crisis --source dev-7 --set $DLK
dry /tmp/je11-fake-c.mjs j11-dry-c-crisis --task crisis --source dev-7 --set $DLK --prompt-file $PC
dry /tmp/je11-fake-c.mjs j11-dry-c-optout --task opt_out --source optout-dev --prompt-file $PC
rm -rf /tmp/judge-eval/j11-dry-* /tmp/je11-fake-a.mjs /tmp/je11-fake-c.mjs
echo "earlier eval outputs kept on the VM: $(ls /tmp/judge-eval 2>/dev/null | tr '\n' ' ')"
echo "== prep11 done $(date -u)"
