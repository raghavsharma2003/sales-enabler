#!/bin/bash
# g5-gemini-paid India TTS bench (paid key as protected-parameter env var). Own small budget on a VM-local ledger.
cd /opt/g5
export GEMINI_PAID_KEY
curl -sS -o harness/tts_bench.py -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/g5-transfer/tts_bench.py?$SAS"
mkdir -p tts_in
./venv/bin/python harness/tts_bench.py tts_in --ledger /opt/g5/tts-ledger.jsonl --stop-file /opt/g5/STOP_PAID --reps-stream 2 --save 4 --budget-usd 0.6 --vantage centralindia > tts_in/tts.log 2>&1
tar czf /opt/g5/tts_in.tgz -C /opt/g5 tts_in tts-ledger.jsonl
curl -sS -o /dev/null -w "upload tts %{http_code}\n" -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @/opt/g5/tts_in.tgz "https://vpresearchraw1017.blob.core.windows.net/g5-transfer/tts_in.tgz?$SAS"
tail -n 3 tts_in/tts.log | cut -c1-300
python3 -c "import json;print('tts usd', round(sum(json.loads(l)['usd'] for l in open('/opt/g5/tts-ledger.jsonl')),5))"
