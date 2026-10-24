
# Redeploy wrapper, part 6 (2026-10-24, ead1bc8): sent after deploy_pre.sh + stage_setup_v2.sh + deploy_post.sh +
# deploy_post7.sh + deploy_post9.sh in the same Run Command. Read-only checks this tree adds, by NAME only:
# - no telephony or WhatsApp env anywhere (VP_TELEPHONY_LIVE, PLIVO_*, VP_TELEPHONY_ALLOWED_TO, VP_TELEPHONY_ALLOWLIST,
#   VP_TELEPHONY_WEBHOOK_SECRET, VP_WHATSAPP_LIVE) in .env and in both running processes;
# - the 9 migrations ead1bc8 adds are recorded; conversation.trace exists;
# - the test-budget rows (scope 'test'): none should exist yet; the owner's workspace must have none, so its first
#   Billing visit or test call creates one from VP_TEST_BUDGET_DEFAULT_INR (2000);
# - the runtime's phone allowlist as its own code reads the process env (browser calls are not phone calls).
# It runs under stage_setup's `set -e` when concatenated, so every count that may be 0 ends in `|| true` (on 2026-10-24
# the first version stopped at its first zero count, after the deploy itself had finished; it was re-run alone).
echo "== post10 $(date -u)"
S=/opt/vp-stage; OWS=fb5d0663-3726-4eac-bda4-8bc7a99107e1
CP=$(systemctl show vp-stage-control -p MainPID --value); RP=$(systemctl show vp-stage-runtime -p MainPID --value)
for pat in '^VP_TELEPHONY_LIVE=' '^PLIVO_' '^VP_TELEPHONY_ALLOWED_TO=' '^VP_TELEPHONY_ALLOWLIST=' '^VP_TELEPHONY_WEBHOOK_SECRET=' '^VP_WHATSAPP_LIVE='; do
  e=$(grep -cE "$pat" $S/.env || true); c=$(tr '\0' '\n' < /proc/$CP/environ | grep -cE "$pat" || true); r=$(tr '\0' '\n' < /proc/$RP/environ | grep -cE "$pat" || true)
  echo "  $pat  .env=$e control=$c runtime=$r  -> $([ $((e + c + r)) = 0 ] && echo unset || echo SET)"
done
cd $S/app/product/voice && $S/venv/bin/python - <<PY
env = dict(l.split('=', 1) for l in open('/proc/$RP/environ').read().split('\0') if '=' in l)
from vpvoice import transports as T
print('runtime phone wall transports.allowed_to(env, +919000000021):', repr(T.allowed_to(env, '+919000000021')),
      '| PLIVO_AUTH_ID in env:', bool(env.get('PLIVO_AUTH_ID')), '(no Plivo credentials: the runtime has no phone route at all; browser calls do not pass this wall)')
PY
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -c "$1" 2>&1; }
echo "migrations recorded: $(q 'SELECT count(*) FROM schema_migrations'); the 9 of ead1bc8: $(q "SELECT count(*) FROM schema_migrations WHERE filename IN ('0108_intake_crm_budget.sql','0109_intake_test_contact.sql','0305_campaigns_plivo_nonce.sql','0609_call_trace.sql','0910_money_test_budget.sql','1050_workspace_script_slowed_alert.sql','1055_workspace_company_facts.sql','1101_channels.sql','1102_channels_templates_followthrough.sql')")"
echo "applied by this deploy: $(q "SELECT string_agg(filename, ' ' ORDER BY filename) FROM schema_migrations WHERE applied_at >= now() - interval '10 minutes'")"
echo "conversation.trace column: $(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'conversation' AND column_name = 'trace'")"
echo "money_config: trial credit $(q 'SELECT trial_credit_inr_milli FROM money_config'), default test budget $(q 'SELECT default_test_budget_inr_milli FROM money_config'), default hold $(q 'SELECT default_test_hold_inr_milli FROM money_config')"
echo "test-budget rows (scope test): $(q "SELECT count(*) FROM budget WHERE scope_type = 'test'"); the owner's workspace: $(q "SELECT count(*) FROM budget WHERE scope_type = 'test' AND workspace_id = '$OWS'")"
echo "workspaces: $(q "SELECT string_agg(name, ', ' ORDER BY created_at) FROM workspace")"
echo "== post10 done $(date -u)"
