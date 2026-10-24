#!/bin/bash
# Dry run of bargein.py against a LOCAL devsim runtime (fake ears, brain and voice; the real cascade turn-taking and the
# real Silero VAD; no network, no keys, no cost). It proves the driver's mechanics only: devsim's fake ears turn every
# stretch of speech into a scripted line ("Haan ji, boliye."), so its outcomes say nothing about the real recogniser.
# Usage: dry_devsim.sh WORKTREE OUT.jsonl
set -e
WT=$1; OUT=$2; PORT=${PORT:-18790}; SECRET=dry-devsim-secret-not-real
V=$WT/product/voice
cd $V
VP_DEVSIM=1 VP_RUNTIME_SECRET=$SECRET VP_CONTROL_URL=http://127.0.0.1:9 PORT=$PORT VP_PUBLIC_URL=http://127.0.0.1:$PORT \
  VP_VAD_MODEL=$WT/voicelab/server/models/silero_vad.onnx VP_LOG_LEVEL=WARNING python3 -c "
# devsim's fake voice says ~0.1 s of tone per 10 characters, too short to talk over; here it says 70 ms per character
# (her replies run 2-12 s, as on staging), streamed at twice real time. Nothing else changes.
import asyncio, vpvoice.devsim as D
async def speak(self, text, style, usage, timing):
    n = max(1, int(len(text) * 0.07 / 0.04))
    usage['audio_s'] = usage.get('audio_s', 0) + n * 0.04; usage['chars'] = usage.get('chars', 0) + len(text)
    for _ in range(n):
        await asyncio.sleep(0.02); yield self.TONE
D.FakeVoice.speak = speak; D.main()" > /tmp/dry-devsim.log 2>&1 &
P=$!; trap "kill $P 2>/dev/null || true" EXIT
for i in $(seq 1 100); do curl -s -m 1 http://127.0.0.1:$PORT/v1/health >/dev/null && break; sleep 0.1; done
VPS_TOOLS=$WT/research/2026-10-24/staging/ops/tools VPS_VOICE=$V VPS_CLIPS=$WT/research/2026-10-18/lanes/g5-gemini-paid/harness/audio_phone16k \
  VPS_LOCAL_N=${N:-2} python3 $WT/research/2026-10-24/staging/ops/tools7/bargein.py --local http://127.0.0.1:$PORT $SECRET $OUT
