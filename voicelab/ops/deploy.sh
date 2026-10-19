#!/bin/bash
# Package voicelab (server + web, no data, no keys) -> blob -> run vm_setup.sh on the VM.
set -e
SP=/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE" && tar czf $SP/voicelab/voicelab-bundle.tgz --exclude='__pycache__' server web
cd "$HERE/ops"
python3 lab_ops.py sas >/dev/null
python3 lab_ops.py put $SP/voicelab/voicelab-bundle.tgz voicelab-bundle.tgz
python3 lab_ops.py prune >/dev/null           # Azure allows 25 managed Run Commands per VM
python3 lab_ops.py run "deploy-$(date +%H%M%S)" vm_setup.sh 1200
