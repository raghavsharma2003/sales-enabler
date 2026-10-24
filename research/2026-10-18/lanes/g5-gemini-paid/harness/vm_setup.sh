#!/bin/bash
# g5-gemini-paid VM bootstrap (run through ARM Run Command; $SAS arrives as a protected parameter env var).
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1 || true
apt-get install -y -qq python3-venv ffmpeg >/dev/null 2>&1 || apt-get install -y -qq python3-venv
mkdir -p /opt/g5 && cd /opt/g5
python3 -m venv venv && ./venv/bin/pip install -q websockets numpy requests
curl -sS -o g5harness.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/g5-transfer/g5harness.tgz?$SAS"
mkdir -p harness && tar xzf g5harness.tgz -C harness
./venv/bin/python -c "import websockets,numpy,requests;print('ws',websockets.__version__,'np',numpy.__version__)"
curl -s -H Metadata:true "http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01" | python3 -c "import json,sys;d=json.load(sys.stdin);print('IMDS',d['location'],d['zone'],d['vmSize'])"
curl -sS -o netprobe.py -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/g5-transfer/netprobe.py?$SAS"
./venv/bin/python netprobe.py 20
nproc; free -m | head -2; ls harness | head
