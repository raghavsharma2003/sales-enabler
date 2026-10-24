# The per-call trace for the owner's review (integrator, 2026-10-24): turn by turn, in a stable shape the call page and
# the review script read. It travels on call.ended (field 'trace') and calls stores it in conversation.trace.
#
# It carries no words: a turn row points at the transcript by its index (`i`), so the transcript's own retention and
# erasure (calls' transcript purge) cover the text, and the trace never holds a copy that could outlive it.
#
#   {schema: 1, stack: {id, combinationId}, components: {stt, llm, tts, s2s, voice},
#    turns: [ {i, speaker: 'caller', startMs, endMs, asrConfidence, partialLagMs}
#           | {i, speaker: 'agent', rid, startMs, callerEndMs, firstAudioMs, gapMs, stages: {...}, speculative,
#              tts: {provider, voice, style}, state, door: [{rule, action}], interrupted} ],
#    events: [ {atMs, kind: 'barge_pause' | 'barge_resume' | 'barge_stop' | 'backchannel' | 'judge' | 'error' | 'fallback'
#                         | 'tool' | 'keypad', ...} ]}
#
# Times are ms from the start of the call. Bounded: MAX_TURNS rows and MAX_EVENTS events (the rest are counted).
SCHEMA = 1
MAX_TURNS = 400
MAX_EVENTS = 600


class Trace:
    def __init__(self):
        self.turns = []; self.events = []; self.dropped = {'turns': 0, 'events': 0}
        self.pending = {}           # rid -> extras recorded before the agent turn is committed (timing, tts, door, state)

    # ---------------------------------------------------------------- turns
    def caller(self, i, start_ms=None, end_ms=None, confidence=None, partial_lag_ms=None):
        self._turn({'i': i, 'speaker': 'caller', 'startMs': start_ms, 'endMs': end_ms, 'asrConfidence': confidence,
                    'partialLagMs': partial_lag_ms})

    def agent(self, i, rid=None, start_ms=None, interrupted=False):
        row = {'i': i, 'speaker': 'agent', 'rid': rid, 'startMs': start_ms, 'interrupted': bool(interrupted), 'door': []}
        row.update(self.pending.pop(rid, {}) if rid is not None else {})
        self._turn(row)

    def note(self, rid, **kv):
        """Extras for the agent turn `rid` (timing, tts, state), kept until that turn is committed."""
        if rid is None: return
        d = self.pending.setdefault(rid, {})
        for k, v in kv.items():
            if k == 'door': d.setdefault('door', []).append(v)
            else: d[k] = v

    def _turn(self, row):
        if len(self.turns) >= MAX_TURNS: self.dropped['turns'] += 1; return
        self.turns.append({k: v for k, v in row.items() if v is not None})

    # ---------------------------------------------------------------- events
    def event(self, at_ms, kind, **kv):
        if len(self.events) >= MAX_EVENTS: self.dropped['events'] += 1; return
        self.events.append({'atMs': at_ms, 'kind': kind, **{k: v for k, v in kv.items() if v is not None}})

    def to_json(self, manifest):
        c = manifest.get('components') or {}
        out = {'schema': SCHEMA, 'stack': {'id': manifest.get('stackId'), 'combinationId': manifest.get('combinationId')},
               'components': {k: v for k, v in c.items() if v}, 'turns': self.turns, 'events': self.events}
        if self.dropped['turns'] or self.dropped['events']: out['dropped'] = dict(self.dropped)
        return out
