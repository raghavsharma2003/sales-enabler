#!/bin/bash
# Run the headless caller against every enabled stack, on the VM (India vantage). Results -> blob runlogs.
cd /opt/voicelab
mkdir -p smoke && cd smoke
curl -sS -o smoke.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/smoke.tgz?$SAS" && tar xzf smoke.tgz
PRESETS=${PRESETS:-"base base-gemvoice base-ungated azure-gated base-hd gem-lite-azure all-gemini azure-rt-mini azure-stream azure-hd-stack gemini-3.1-live gemini-3.8-live asha mai-emotion maya-cascade"}
for p in $PRESETS; do
  echo "=== $p"
  timeout 170 /opt/voicelab/venv/bin/python voicelab/tests/sim_caller.py http://127.0.0.1:8080 "$LAB_PASSCODE" $p --turns 3 --tester smoke 2>&1 | grep -E "^\s+\[|ERROR|^\{" | cut -c1-260
done
