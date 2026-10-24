#!/bin/bash
# Stage 8 (test build at 9b34ff7), step 1: pre-flight, read-only. Nothing is changed. Prints no secret values: env
# entries are reported by NAME as set/unset, never their values.
# - deployed SHA, unit states and restart counts, active staging calls, lab health;
# - the env contract (product/ops/STAGING.md): VP_DEV_AUTH, VP_LLM_FAKE, VP_WEBHOOK_ALLOW_*, VP_DEVSIM*, VP_PAYMENTS,
#   VP_TELEPHONY_LIVE, in /opt/vp-stage/.env and in the running control and runtime processes; also the names the
#   buyer journey depends on (VP_LLM_*, VP_RECORDINGS_DIR, VP_RUNTIME_PUBLIC_URL, VP_OPERATOR_BRAINS, VP_ANALYSIS_MODELS);
# - migration 0109 needs VP_SECRET_KEY only when intake_source rows hold a plaintext hook_secret: count them;
# - money_config.trial_credit_inr_milli; spend so far (conversation cost, cost lines, test runs) for the job's baseline.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com
echo "== preflight8 $(date -u)"
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime postgresql | tr '\n' ' '; echo
for u in voicelab vp-stage-control vp-stage-runtime postgresql; do echo "$u $(systemctl show $u -p ActiveEnterTimestamp --value) restarts $(systemctl show $u -p NRestarts --value)"; done
echo "deployed: $(cat $S/app/BUNDLE_SHA 2>/dev/null)"; grep '^VERTEX_OFF=' $S/.env
curl -s -m 5 http://127.0.0.1:8090/v1/health | $S/venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('runtime activeCalls', d['activeCalls'], {k: v['available'] for k, v in d['stacks'].items()})"
echo "lab ping: $(curl -s -m 5 http://127.0.0.1:8080/api/ping)"; curl -s -m 10 -o /dev/null -w "lab public ping %{http_code}\n" https://$FQDN/api/ping
echo "== env contract (names only)"
CP=$(systemctl show vp-stage-control -p MainPID --value); RP=$(systemctl show vp-stage-runtime -p MainPID --value)
names() { cut -d= -f1 "$1" | grep -v '^#'; }
penv() { tr '\0' '\n' < /proc/$1/environ | cut -d= -f1; }
for pat in '^VP_DEV_AUTH$' '^VP_LLM_FAKE$' '^VP_WEBHOOK_ALLOW_' '^VP_DEVSIM' '^VP_PAYMENTS$' '^VP_TELEPHONY_LIVE$' \
           '^VP_LLM_' '^VP_RECORDINGS_DIR$' '^VP_RUNTIME_PUBLIC_URL$' '^VP_OPERATOR_BRAINS$' '^VP_ANALYSIS_MODELS$' '^VP_SAFETY_JUDGE_' '^PLIVO_'; do
  e=$(names $S/.env | grep -cE "$pat"); c=$(penv $CP | grep -cE "$pat"); r=$(penv $RP | grep -cE "$pat")
  echo "  $pat  .env=$e control=$c runtime=$r  -> $([ $((e + c + r)) = 0 ] && echo unset || echo SET)"
done
echo "  .env names: $(names $S/.env | tr '\n' ' ')"
echo "== database"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
echo "schema_migrations: $(q 'SELECT count(*) FROM schema_migrations')"
echo "intake_source has hook_secret column: $(q "SELECT count(*) FROM information_schema.columns WHERE table_name='intake_source' AND column_name='hook_secret'")"
echo "intake_source rows with a plaintext hook_secret: $(q 'SELECT count(*) FROM intake_source WHERE hook_secret IS NOT NULL' | head -1)"
echo "money_config.trial_credit_inr_milli: $(q 'SELECT trial_credit_inr_milli, updated_at FROM money_config')"
echo "workspaces: $(q 'SELECT count(*) FROM workspace'); trial grants: $(q 'SELECT count(*) FROM money_trial_grant')"
echo "smoke/owner-named workspaces already present: $(q "SELECT count(*) FROM workspace WHERE name IN ('Smoke Test Co','Vyakti Test Workspace')")"
echo "test spend today (IST) by workspace, INR milli: $(q "SELECT coalesce(string_agg(w.name || '=' || s, ', '), 'none') FROM (SELECT workspace_id, sum(cost_inr_milli) s FROM conversation WHERE channel = 'test' AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' GROUP BY 1) x JOIN workspace w ON w.id = x.workspace_id")"
echo "baseline totals (INR milli): conversation $(q 'SELECT coalesce(sum(cost_inr_milli),0) FROM conversation'), cost_line without a call $(q 'SELECT coalesce(sum(inr_milli),0) FROM cost_line WHERE conversation_id IS NULL'), agent_test_run rows $(q 'SELECT count(*) FROM agent_test_run')"
echo "live conversations: $(q "SELECT count(*) FROM conversation WHERE status = 'live'")"
cat /proc/loadavg; free -m | head -2; df -h / | tail -1
echo "== preflight8 done $(date -u)"
