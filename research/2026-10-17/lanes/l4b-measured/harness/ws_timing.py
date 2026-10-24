#!/usr/bin/env python3
"""Decompose ElevenLabs demo latency from its WebSocket events (harness clock, ms after the caller clip ended):
user_transcript (their ASR final), agent_response (their LLM text), first agent audio after agent_response, and the
platform's own ping_ms (round trip measured by its client). Output: ../data/elevenlabs-ws-timing.csv
"""
import csv, glob, json, os
import numpy as np
RUNS = os.environ.get('VP_REC_DIR', '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'elevenlabs-ws-timing.csv')
rows = []
for js in sorted(glob.glob(os.path.join(RUNS, 'elevenlabs__P*__r*.json'))):
    run = json.load(open(js))
    wsf = js.replace('.json', '.ws.jsonl')
    if not os.path.exists(wsf):
        continue
    ev, pings = [], []
    for line in open(wsf):
        r = json.loads(line)
        try:
            j = json.loads(r.get('p') or r.get('head') or '')
        except Exception:
            continue
        t = j.get('type')
        if t == 'ping' and (j.get('ping_event') or {}).get('ping_ms'):
            pings.append(j['ping_event']['ping_ms'])
        ev.append((r['t'], t))
    played = [(e[2], e[0]) for e in run.get('harnessLog', []) if e[1] == 'played']
    for i, (tid, tend) in enumerate(played):
        nxt_play = played[i + 1][1] if i + 1 < len(played) else 1e12
        win = [(t - tend, k) for t, k in ev if tend < t < nxt_play]
        ut = next((d for d, k in win if k == 'user_transcript'), None)
        ar = next((d for d, k in win if k == 'agent_response'), None)
        au = next((d for d, k in win if k == 'audio' and ar is not None and d >= ar), None)
        rows.append({'call': os.path.basename(js)[:-5], 'turn': tid, 'user_transcript_ms': ut, 'agent_response_ms': ar, 'first_audio_after_response_ms': au,
                     'ping_ms_median_call': float(np.median(pings)) if pings else None})
with open(OUT, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); [w.writerow(r) for r in rows]
for k in ('user_transcript_ms', 'agent_response_ms', 'first_audio_after_response_ms'):
    v = [r[k] for r in rows if r[k] is not None]
    print(k, 'n', len(v), 'p50', np.percentile(v, 50) if v else None, 'p90', np.percentile(v, 90) if v else None)
print('ping_ms per call', sorted(set(r['ping_ms_median_call'] for r in rows)))
