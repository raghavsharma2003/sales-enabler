#!/bin/bash
# Read-only: the RD1/RD2 safety events and per-speaker turn counts the control plane stored for the 6 verification calls.
IDS="'0bd97650-35c0-47ff-9ee8-eb656f0003cf','879a60c1-7645-48b7-9bc2-abf0b4a17a0c','b3136d8a-07ab-4817-a05a-b384c6940540','1e651673-7c97-42da-9f84-438b03bb1ccb','967db78a-d4b0-4cd9-bcc9-8a3e4d258756','35c8abe5-9b58-469f-8bbb-749e5dfe6326'"
cd /tmp
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(conversation_id::text,8), seq, rule, action, left(regexp_replace(detail,'\s+',' ','g'),120) FROM call_safety_event WHERE conversation_id IN ($IDS) ORDER BY conversation_id, seq"
echo "== turns per speaker, and min/max idx"
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(conversation_id::text,8), speaker, count(*), min(idx), max(idx), count(DISTINCT idx) FROM turn WHERE conversation_id IN ($IDS) GROUP BY 1,2 ORDER BY 1,2"
echo "== conversation status"
runuser -u vpstage -- psql -d vp_stage -At -F ' | ' -c "SELECT left(id::text,8), status, end_reason FROM conversation WHERE id IN ($IDS) ORDER BY 1" 2>&1 | head -8
systemctl is-active voicelab vp-stage-control vp-stage-runtime; curl -s -m 5 http://127.0.0.1:8080/api/ping; echo
