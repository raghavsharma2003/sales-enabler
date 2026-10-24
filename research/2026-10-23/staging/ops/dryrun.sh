#!/bin/bash
# Dry run of the reply-gap driver on an Azure-only built stack (no Google traffic): 1 call.
set -e
S=/opt/vp-stage
curl -fsS -o $S/tools.tgz -H "x-ms-version: 2022-11-02" "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/vp-stage-tools.tgz?$SAS" && tar xzf $S/tools.tgz -C $S/tools && chown -R vpstage:vpstage $S/tools
date -u; grep '^VERTEX_OFF=' $S/.env
mkdir -p $S/data/replygap && chown vpstage:vpstage $S/data/replygap
OUT=$S/data/replygap/dryrun-$(date +%H%M%S).jsonl
cd $S/tools && timeout 400 runuser -u vpstage -- $S/venv/bin/python replygap.py "${DRY_STACK:?custom:EARS,BRAIN,VOICE of Azure-only parts}" 1 $OUT 2>&1 | tail -20
$S/venv/bin/python -c "
import json,sys
for l in open('$OUT'):
    d=json.loads(l); print({k: d.get(k) for k in ('conversationId','socketGaps','turnGaps','endReason','socketEnded','durationS','costInrMilli','costByComponent','aiSaid','aiInFirstReply','agentTurns','callerTurns','errors','fatal')})
"
journalctl -u vp-stage-runtime --since "-6min" --no-pager | grep -vE 'aiohttp.access' | tail -15 | cut -c1-260
systemctl is-active voicelab caddy vp-stage-control vp-stage-runtime
