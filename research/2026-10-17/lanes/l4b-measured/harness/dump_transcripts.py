#!/usr/bin/env python3
"""Readable per-call transcript sheet for manual coding: caller line, what the vendor's ASR heard (when exposed),
the agent's reply (best-confidence Azure transcript of the agent channel), and the turn metrics.
python3 dump_transcripts.py -> ../data/transcripts.md"""
import csv, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
b = json.load(open(os.path.join(HERE, '..', 'battery', 'battery.json')))
text = {t['id']: t.get('text', '(5 s silence)') for p in b['personas'] for t in p['turns']}
rows = list(csv.DictReader(open(os.path.join(DATA, 'measurements.csv'))))
out = ['# Agent transcripts per call (machine transcription, for manual coding)', '',
       'Agent text is Azure fast transcription of the recorded agent channel (best-confidence pass per turn; the',
       'prefix says which pass). "Heard" is the vendor\'s own ASR result where its demo exposes it over WebSocket',
       '(ElevenLabs user_transcript). Latency is caller-end to agent reply onset on clean turns.', '']
for key in sorted(set((r['vendor'], r['persona'], r['rep']) for r in rows)):
    out += [f'## {key[0]} / {key[1]} / {key[2]}', '', '| turn | trap | caller said | vendor heard | outcome | latency ms | words | agent lang | agent reply (machine transcript) |', '|---|---|---|---|---|---|---|---|---|']
    for r in [r for r in rows if (r['vendor'], r['persona'], r['rep']) == key]:
        cell = lambda s: (s or '').replace('|', '/').replace('\n', ' ')
        out.append(f"| {r['turn_id']} | {r['trap']} | {cell(text.get(r['turn_id'], ''))} | {cell(r['vendor_heard'])} | {r['outcome']} | {r['latency_ms']} | {r['resp_words']} | {r['agent_lang']} | {cell(r['resp_text'])} |")
    out.append('')
open(os.path.join(DATA, 'transcripts.md'), 'w').write('\n'.join(out))
print('wrote', len(out), 'lines')
