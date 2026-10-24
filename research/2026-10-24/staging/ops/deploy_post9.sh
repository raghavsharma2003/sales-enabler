
# Redeploy wrapper, part 5 (2026-10-24, stage 8 config fix): sent after deploy_pre.sh + stage_setup_v2.sh + deploy_post.sh
# + deploy_post7.sh in the same Run Command. Confirms the config fix by NAME (never a value): the new names in .env and in
# both running processes, no VP_LLM_SAFETY_JUDGE_*, the recordings folder, VP_RUNTIME_PUBLIC_URL equal to the runtime's
# VP_PUBLIC_URL, the model URL's shape, and what each side's own code makes of it (llm.ts, judge.ts, judge.py, analysis.ts).
echo "== post9 $(date -u)"
S=/opt/vp-stage
NEW="VP_LLM_DEFAULT_URL VP_LLM_DEFAULT_KEY VP_LLM_DEFAULT_KEY_HEADER VP_LLM_DEFAULT_MODEL VP_LLM_OPERATOR_MODEL VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_IN VP_LLM_OPERATOR_INR_MILLI_PER_MTOK_OUT VP_ANALYSIS_MODELS VP_ANALYSIS_DEFAULT_MODEL VP_SAFETY_JUDGE_MODE VP_RECORDINGS_DIR VP_RUNTIME_PUBLIC_URL VP_TEST_BUDGET_DEFAULT_INR"
CP=$(systemctl show vp-stage-control -p MainPID --value); RP=$(systemctl show vp-stage-runtime -p MainPID --value)
for n in $NEW; do
  e=$(grep -c "^$n=" $S/.env); c=$(tr '\0' '\n' < /proc/$CP/environ | grep -c "^$n="); r=$(tr '\0' '\n' < /proc/$RP/environ | grep -c "^$n=")
  echo "  $n  .env=$e control=$c runtime=$r"
done
echo "VP_LLM_SAFETY_JUDGE_* names: .env $(grep -c '^VP_LLM_SAFETY_JUDGE_' $S/.env), control $(tr '\0' '\n' < /proc/$CP/environ | grep -c '^VP_LLM_SAFETY_JUDGE_'), runtime $(tr '\0' '\n' < /proc/$RP/environ | grep -c '^VP_LLM_SAFETY_JUDGE_') (0 = unset)"
echo "forbidden names (VP_DEV_AUTH VP_LLM_FAKE VP_WEBHOOK_ALLOW_* VP_DEVSIM* VP_PAYMENTS VP_TELEPHONY_LIVE): .env $(grep -cE '^(VP_DEV_AUTH|VP_LLM_FAKE|VP_WEBHOOK_ALLOW_[A-Z_]*|VP_DEVSIM[A-Z_]*|VP_PAYMENTS|VP_TELEPHONY_LIVE)=' $S/.env), control $(tr '\0' '\n' < /proc/$CP/environ | grep -cE '^(VP_DEV_AUTH|VP_LLM_FAKE|VP_WEBHOOK_ALLOW_[A-Z_]*|VP_DEVSIM[A-Z_]*|VP_PAYMENTS|VP_TELEPHONY_LIVE)='), runtime $(tr '\0' '\n' < /proc/$RP/environ | grep -cE '^(VP_DEV_AUTH|VP_LLM_FAKE|VP_WEBHOOK_ALLOW_[A-Z_]*|VP_DEVSIM[A-Z_]*|VP_PAYMENTS|VP_TELEPHONY_LIVE)=')"
echo ".env.extra: $( [ -f $S/.env.extra ] && echo "present, names $(cut -d= -f1 $S/.env.extra | grep -v '^#' | tr '\n' ' ')" || echo absent)"
echo "recordings folder: $(stat -c '%U:%G %a' $S/data/recordings 2>&1)"
$S/venv/bin/python - <<'PY'
import re
env = dict(l.rstrip('\n').split('=', 1) for l in open('/opt/vp-stage/.env') if '=' in l and not l.startswith('#'))
print('VP_RUNTIME_PUBLIC_URL equals the runtime VP_PUBLIC_URL:', env.get('VP_RUNTIME_PUBLIC_URL') == env.get('VP_PUBLIC_URL') and bool(env.get('VP_PUBLIC_URL')))
print('VP_RECORDINGS_DIR is /opt/vp-stage/data/recordings:', env.get('VP_RECORDINGS_DIR') == '/opt/vp-stage/data/recordings')
u = env.get('VP_LLM_DEFAULT_URL', '')
print('VP_LLM_DEFAULT_URL shape https://<resource>.<azure host>/openai/v1/chat/completions:', bool(re.fullmatch(r'https://[a-z0-9-]+\.(cognitiveservices|openai|services\.ai)\.azure\.com/openai/v1/chat/completions', u)))
print('VP_LLM_DEFAULT_KEY non-empty and equal to the LAB_AI_KEY line:', bool(env.get('VP_LLM_DEFAULT_KEY')) and env.get('VP_LLM_DEFAULT_KEY') == env.get('LAB_AI_KEY'))
print('VP_LLM_DEFAULT_URL built from the LAB_AI_ENDPOINT line:', u == env.get('LAB_AI_ENDPOINT', '').rstrip('/') + '/openai/v1/chat/completions')
PY
echo "-- what the runtime's own judge code makes of its process env"
cd $S/app/product/voice && $S/venv/bin/python - <<PY
env = dict(l.split('=', 1) for l in open('/proc/$RP/environ').read().split('\0') if '=' in l)
from vpvoice import judge
print('runtime judge: mode', judge.mode(env=env), '| configured (model falls back to VP_LLM_DEFAULT_*)', judge.configured(env), '| runs', judge.mode(env=env) != 'off' and judge.configured(env))
PY
echo "-- what the control plane's own code makes of its process env"
cd $S/app && $S/venv/bin/python - <<PY
import subprocess
env = dict(l.split('=', 1) for l in open('/proc/$CP/environ').read().split('\0') if '=' in l)
code = """
const ns = m => (m && Object.keys(m).length > 1) ? m : (m.default ?? m);     // tsx loads these .ts as CommonJS here
const llm = ns(await import('./product/server/llm.ts'));
const j = ns(await import('./product/shared/safety/judge.ts'));
const a = ns(await import('./product/server/modules/calls/analysis.ts'));
const ps = ['operator', 'simulate', 'analysis', 'compile', 'memory', 'learning', 'judge', 'brief_review', 'safety_judge'];
console.log('control plane: model configured per purpose', JSON.stringify(Object.fromEntries(ps.map(p => [p, llm.llmKeysConfigured(p)]))));
console.log('control plane: judge mode', j.judgeMode(), '| judgeConfigured', j.judgeConfigured(), '| curated analysis models', JSON.stringify(a.curatedAnalysisModels()), '| default analysis model', a.defaultAnalysisModel());
"""
r = subprocess.run(['$S/node/bin/node', '--import', 'tsx', '--input-type=module', '-e', code], env=env, capture_output=True, text=True, timeout=120)
print(r.stdout.strip()); print(r.stderr.strip()[-400:]) if r.returncode else None
PY
sleep 2
echo "control journal since the restart: setup warnings $(journalctl -u vp-stage-control --since '-3min' --no-pager | grep -c 'setup: no model'), errors $(journalctl -u vp-stage-control --since '-3min' --no-pager | grep -ciE 'error|traceback')"
echo "== post9 done $(date -u)"
