# VP staging (2026-10-24): passive probes on the product voice runtime. Measurement only, no behaviour change: every
# wrapper calls the original and returns its result unchanged; it only appends one JSON line to VP_STAGE_PROBE_LOG
# (/opt/vp-stage/data/probes.jsonl). Lines carry the conversation id, monotonic and wall times, counts and verdict kinds;
# never caller or agent text. Installed by run_runtime.py after pace.py, before the runtime starts.
#   k=hold   the opening hold (RD1 decides on the whole opening, 639168b): when the first sentence was held, when the
#            hold released, how many sentences it held, and why it let go (a sentence discloses, or the reply ended)
#   k=judge  each crisis-judge call (judge.judge_caller_crisis): start and end (monotonic), the judge's own latencyMs
#            (it includes any pacer wait), its event type, and whether it said crisis / opt-out (booleans only)
#   k=reply  each reply's stage marks (CascadeSession.record_timing) as absolute monotonic times, so a judge verdict can
#            be placed against her first sentence of the same reply
#   k=lags   the raw partial lags of a call (speech onset -> the recogniser's first words), once per timing read
import contextvars, json, os, time

LOG = os.environ.get('VP_STAGE_PROBE_LOG', '/opt/vp-stage/data/probes.jsonl')
_cid = contextvars.ContextVar('vps_probe_cid', default=None)


def _log(rec):
    try:
        rec['wall'] = round(time.time(), 3)
        with open(LOG, 'a') as f: f.write(json.dumps(rec) + '\n')
    except Exception:
        pass


def _r(x): return None if x is None else round(x, 4)


def install():
    from vpvoice import cascade as K, conversation as C, judge as J

    # ---- the opening hold
    orig_release = C.Conversation.release

    def release(self, new, draft, end=False):
        holding = draft.hold is not None
        if not holding: return orig_release(self, new, draft, end)
        new = list(new)
        if new and getattr(draft, '_vps_t0', None) is None: draft._vps_t0 = self.clock()
        out = orig_release(self, new, draft, end)
        if out:
            t1 = self.clock(); t0 = getattr(draft, '_vps_t0', None)
            try:
                _log({'k': 'hold', 'cid': self.t.get('conversationId'), 't0': _r(t0), 't1': _r(t1), 'heldMs': None if t0 is None else int(round((t1 - t0) * 1000)),
                      'n': len(out), 'why': 'discloses' if draft.opening_discloses else 'end', 'brainReq': _r(draft.t.get('brain_req')), 'brainFirst': _r(draft.t.get('brain_first'))})
            except Exception:
                pass
        return out
    C.Conversation.release = release

    # ---- the judge: which call it belongs to (a context var set while start_judge creates its task)
    orig_start = C.Conversation.start_judge

    def start_judge(self, text, prev='', floor=False):
        tok = _cid.set(self.t.get('conversationId'))
        try: return orig_start(self, text, prev, floor)
        finally: _cid.reset(tok)
    C.Conversation.start_judge = start_judge

    orig_judge = J.judge_caller_crisis

    async def judge_caller_crisis(*a, **kw):
        t0 = time.monotonic()
        res = await orig_judge(*a, **kw)
        try:
            v = res.get('judge') or {}
            _log({'k': 'judge', 'cid': _cid.get(), 't0': _r(t0), 't1': _r(time.monotonic()), 'latencyMs': int(round(res.get('latencyMs') or 0)),
                  'called': bool(res.get('called')), 'mode': res.get('mode'), 'event': (res.get('event') or {}).get('type'),
                  'reason': (res.get('event') or {}).get('reason'), 'crisis': v.get('crisis'), 'optOut': (v.get('optOut') or {}).get('value'),
                  'usage': res.get('usage')})
        except Exception:
            pass
        return res
    J.judge_caller_crisis = judge_caller_crisis

    # ---- each reply's marks, absolute
    orig_record = K.CascadeSession.record_timing

    def record_timing(self, r):
        out = orig_record(self, r)
        try:
            t = r.draft.t
            _log({'k': 'reply', 'cid': self.id, 'rid': r.rid, 'gapMs': r.latency_ms, 'speculative': r.from_partial,
                  **{m: _r(t.get(m)) for m in ('eos', 'final', 'brain_req', 'brain_first', 'sentence', 'tts_req', 'tts_first', 'release', 'audio')}})
        except Exception:
            pass
        return out
    K.CascadeSession.record_timing = record_timing

    orig_summary = K.CascadeSession.timing_summary

    def timing_summary(self):
        out = orig_summary(self)
        try: _log({'k': 'lags', 'cid': self.id, 'lags': list(self.partial_lags)})
        except Exception: pass
        return out
    K.CascadeSession.timing_summary = timing_summary
