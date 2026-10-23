#!/bin/bash
# Voice runtime unit suite and door timing on the staging host (no network beyond localhost, no keys).
S=/opt/vp-stage
cd $S/app/product/voice
nproc; $S/venv/bin/python --version
timeout 900 runuser -u vpstage -- env -i PATH=$S/node/bin:/usr/bin:/bin HOME=/tmp $S/venv/bin/python -m unittest discover 2>&1 | tail -6
timeout 300 runuser -u vpstage -- env -i PATH=$S/node/bin:/usr/bin:/bin HOME=/tmp $S/venv/bin/python bench/door_bench.py 2>&1 | tail -25
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
