#!/bin/bash
# g5-gemini-paid India job: paired paid/free latency plan, then paid sample calls. Keys arrive as protected-parameter env
# vars (GEMINI_PAID_KEY, GEMINI_TEST_KEY); nothing secret is written to disk. VM-local paid ledger with a 3.0 USD budget
# (reserved in the sandbox ledger as VM_ALLOTMENT).
cd /opt/g5
mkdir -p runs_in
export GEMINI_PAID_KEY GEMINI_TEST_KEY
up() { tar czf /opt/g5/$1.tgz -C /opt/g5 runs_in paid-ledger.jsonl 2>/dev/null; curl -sS -o /dev/null -w "upload $1 %{http_code}\n" -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @/opt/g5/$1.tgz "https://vpresearchraw1017.blob.core.windows.net/g5-transfer/$1.tgz?$SAS"; }
( while true; do sleep 300; up runs_in_partial >/dev/null; done ) &
UP=$!
./venv/bin/python harness/runplan.py harness/plan_latency.json in runs_in --ledger /opt/g5/paid-ledger.jsonl --stop-file /opt/g5/STOP_PAID --budget-usd 3.0 > runs_in/stream_lat.log 2>&1
./venv/bin/python harness/runplan.py harness/plan_samples.json in runs_in --ledger /opt/g5/paid-ledger.jsonl --stop-file /opt/g5/STOP_PAID --budget-usd 3.0 > runs_in/stream_samples.log 2>&1
kill $UP 2>/dev/null
up runs_in
ls runs_in | wc -l
tail -n 3 runs_in/stream_*.log | cut -c1-300
cat paid-ledger.jsonl | python3 -c "import sys,json;print('VM paid usd', round(sum(json.loads(l)['usd'] for l in sys.stdin),4))"
