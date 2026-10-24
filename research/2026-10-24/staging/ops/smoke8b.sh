#!/bin/bash
# Stage 8, step 4 (finish): smoke8.py stopped at its last settings read (usage.get, an extra read the brief does not list:
# it answers a list and the script expected an object), after every listed API step and the browser call, before the
# :8443 checks. The smoke is NOT re-run (one smoke workspace; one test call). This Run Command does what was left, with
# no new workspace, no sign-in and no model or call:
#   - the :8443 checks with curl: 401 without auth, 200 with it and the app's title, its JS and CSS assets, /v1/health and
#     /rt/v1/health (basic auth from the protected parameters; nothing printed);
#   - a read-only DB read-back of the smoke workspace __WS__ (its call row, turns, cost lines, analysis, the proposed
#     launch card, what it holds), in place of the smoke's JSON, which the crash did not write.
# Prints no secret values.
S=/opt/vp-stage; FQDN=vp-voicelab-1019.centralindia.cloudapp.azure.com; WS=__WS__; CALL=__CALL__
U="${VP_STAGE_USER:-vp}:$VP_STAGE_PASS"
echo "== smoke8b $(date -u)"
echo "== :8443"
curl -s -m 10 -o /dev/null -w ":8443 / without auth %{http_code}\n" https://$FQDN:8443/
curl -s -m 10 -o /tmp/vps8b-index.html -w ":8443 / with auth %{http_code}\n" -u "$U" https://$FQDN:8443/; echo "  title: $(grep -o '<title>[^<]*' /tmp/vps8b-index.html | cut -c8-)"
for a in $(grep -oE '(src|href)="/assets/[^"]+\.(js|css)"' /tmp/vps8b-index.html | cut -d'"' -f2 | sort -u); do
  curl -s -m 10 -o /dev/null -w "  asset $a %{http_code} %{size_download} bytes %{content_type}\n" -u "$U" https://$FQDN:8443$a
done
rm -f /tmp/vps8b-index.html
curl -s -m 10 -o /dev/null -w ":8443 /v1/health %{http_code}\n" -u "$U" https://$FQDN:8443/v1/health
curl -s -m 10 -o /dev/null -w ":8443 /rt/v1/health %{http_code}\n" -u "$U" https://$FQDN:8443/rt/v1/health
curl -s -m 10 -o /dev/null -w ":8443 /v1/health without auth %{http_code}\n" https://$FQDN:8443/v1/health
echo "== the smoke workspace $WS (read-only)"
cd /tmp
q() { runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "$1" 2>&1; }
echo "workspace: $(q "SELECT name, plan, status, created_at FROM workspace WHERE id = '$WS'")"
echo "members: $(q "SELECT name || ' (' || role || ', ' || status || ', email ' || CASE WHEN email LIKE 'smoke+%@example.com' THEN 'smoke+<ts>@example.com' ELSE 'OTHER' END || ')' FROM member WHERE workspace_id = '$WS'")"
echo "wallet: $(q "SELECT balance_inr_milli, state FROM wallet WHERE workspace_id = '$WS'"); top-ups: $(q "SELECT string_agg(kind || ' ' || inr_milli || ' ' || status, ', ') FROM wallet_topup WHERE workspace_id = '$WS'")"
echo "agents: $(q "SELECT string_agg(name || ' [' || status || ']', ', ') FROM agent WHERE workspace_id = '$WS'"); versions: $(q "SELECT count(*) FROM agent_version v JOIN agent a ON a.id = v.agent_id WHERE a.workspace_id = '$WS'")"
echo "knowledge sources: $(q "SELECT count(*) FROM knowledge_source WHERE workspace_id = '$WS'" | head -1)"
echo "contacts: $(q "SELECT string_agg(e164, ' ' ORDER BY e164) FROM contact WHERE workspace_id = '$WS'"); audiences: $(q "SELECT string_agg(name, ', ') FROM audience WHERE workspace_id = '$WS'")"
echo "campaigns: $(q "SELECT string_agg(name || ' [' || state || '] window ' || (policy->'window')::text || ' retry ' || (policy->'retry'->>'pattern') || '/' || (policy->'retry'->>'maxAttempts') || ' cap ' || (policy->>'capInrMilli'), '; ') FROM campaign WHERE workspace_id = '$WS'")"
echo "actions: $(q "SELECT string_agg(tool || ' ' || status || ' (' || risk_class || '): ' || summary, ' || ' ORDER BY created_at) FROM action WHERE workspace_id = '$WS'")"
echo "attempts: $(q "SELECT count(*) FROM attempt WHERE workspace_id = '$WS'") (0 = nothing queued to dial)"
echo "== the test call $CALL"
echo "row: $(q "SELECT channel, direction, status, end_reason, reason_code, duration_s, cost_inr_milli, outcome, (recording_uri IS NOT NULL) AS has_recording, jsonb_array_length(coalesce(transcript, '[]'::jsonb)) AS transcript_lines, run_manifest->>'combinationId', started_at, ended_at FROM conversation WHERE id = '$CALL' AND workspace_id = '$WS'")"
echo "analysis: $(q "SELECT analysis->>'status' || ' / ' || coalesce(analysis->>'reason', '') FROM conversation WHERE id = '$CALL'")"
echo "turns: $(q "SELECT speaker || ' ' || count(*) FROM turn WHERE conversation_id = '$CALL' GROUP BY speaker ORDER BY speaker" | tr '\n' ' ')"
echo "reply gaps (turn.latency.latencyMs, agent turns): $(q "SELECT string_agg((latency->>'latencyMs'), ' ' ORDER BY idx) FROM turn WHERE conversation_id = '$CALL' AND speaker = 'agent'")"
echo "cost lines by component (INR milli): $(q "SELECT string_agg(component || '=' || s || ' (' || n || ')', ', ') FROM (SELECT component, sum(inr_milli) s, count(*) n FROM cost_line WHERE conversation_id = '$CALL' GROUP BY 1) x")"
echo "safety events: $(q "SELECT coalesce(string_agg(rule || ' ' || action, ', '), 'none') FROM call_safety_event WHERE conversation_id = '$CALL'"); judge events: $(q "SELECT count(*) FROM call_judge_event WHERE conversation_id = '$CALL'")"
echo "first agent turn: $(q "SELECT left(text, 220) FROM turn WHERE conversation_id = '$CALL' AND speaker = 'agent' ORDER BY idx LIMIT 1")"
echo "recordings dir on the runtime: $(grep -c '^VP_RECORDINGS_DIR=' $S/.env) env line(s); VP_RUNTIME_PUBLIC_URL: $(grep -c '^VP_RUNTIME_PUBLIC_URL=' $S/.env) env line(s)"
echo "== smoke8b done $(date -u)"
