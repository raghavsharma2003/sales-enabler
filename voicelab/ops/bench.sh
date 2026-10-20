#!/bin/bash
# Run a lab bench script on the VM (India vantage) against a fresh copy of server/ + tests/, without touching the
# running service. Usage via lab_ops: BENCH="voice_bench.py 5" python lab_ops.py run NAME ops/bench.sh
set -e
mkdir -p /opt/voicelab/bench && cd /opt/voicelab/bench && rm -rf b && mkdir b && cd b
curl -sS -o bench.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/bench.tgz?$SAS" && tar xzf bench.tgz
set -a; . /opt/voicelab/.env; set +a
export LAB_SERVER_DIR=/opt/voicelab/bench/b/server
cd tests && timeout 1500 /opt/voicelab/venv/bin/python __SCRIPT__ 2>&1 | tail -60
