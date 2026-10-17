#!/bin/bash
# Copy final call recordings into the lane as small stereo Opus files (L = caller, R = agent) plus their run JSON.
cd "$(dirname "$0")"
RUNS=${VP_REC_DIR:-/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs}
DST=../recordings; mkdir -p $DST
for w in $RUNS/{vapi,elevenlabs,ultravox}__P?__r[12].wav $RUNS/calib*__c1.wav $RUNS/vyora__P1__probe4.wav; do
  [ -f "$w" ] || continue; b=$(basename $w .wav)
  ffmpeg -y -loglevel error -i "$w" -c:a libopus -b:a 16k -ac 2 "$DST/$b.opus"
  python3 -c "
import json,sys; d=json.load(open('$RUNS/$b.json'))
for k in ('harnessLog',): d.pop(k,None)
for f in d.get('frames',[]): f['ev']=[e for e in f['ev'] if e[1]!='cand'][:400]
import re; t=json.dumps(d,ensure_ascii=False); t=re.sub(r'(access_token|token|key)=[^&\" ]+', r'\\1=REDACTED', t); open('$DST/$b.json','w').write(t)"
done
du -sh $DST; ls $DST | wc -l
