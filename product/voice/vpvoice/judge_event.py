# The 'judge' runtime event, built from the one contract both sides read: product/shared/judge-event.json (calls'
# ingest validator reads the same file). A shadow verdict is a record and nothing else; an opt-out raise also sends the
# 'moment' opt_out that drives suppression, and a crisis raise the 'safety' RD3 event.
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load():
    for p in (os.path.join(HERE, 'judge-event.json'), os.path.join(HERE, '..', '..', 'shared', 'judge-event.json')):
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f: return json.load(f)
    raise FileNotFoundError('product/shared/judge-event.json not found')


CONTRACT = _load()
VALUES = CONTRACT['values']
FIELDS = set(CONTRACT['fields']) - {'seq', 'type', 'at'}      # the sink adds those three


def check(rec):
    """The contract's rules, so the runtime never sends what ingest would refuse with 422. Returns rec."""
    extra = set(rec) - FIELDS
    if extra: raise ValueError(f'judge event fields outside the contract: {sorted(extra)}')
    for k, allowed in VALUES.items():
        if k in rec and rec[k] not in allowed: raise ValueError(f'judge event {k}={rec[k]!r} not in {allowed}')
    label = rec.get('label', CONTRACT['rules']['label_default'])
    if rec['outcome'] == 'unavailable':
        if label != 'crisis' or 'reason' not in rec or 'kind' in rec or 'confidence' in rec:
            raise ValueError('an unavailable judge event is crisis-labelled, with a reason and no verdict')
    else:
        if 'reason' in rec or 'confidence' not in rec: raise ValueError('a verdict has a confidence and no reason')
        if (label == 'crisis') != ('kind' in rec): raise ValueError('a crisis verdict has a kind; an opt-out verdict has none')
    return rec


def crisis(mode, outcome, latency_ms, kind=None, confidence=None, reason=None):
    rec = {'judge': 'caller_crisis', 'mode': mode, 'outcome': outcome, 'latencyMs': latency_ms}
    if outcome == 'unavailable': rec['reason'] = reason
    else: rec['kind'] = kind; rec['confidence'] = float(confidence)
    return check(rec)


def opt_out(mode, outcome, latency_ms, confidence):
    return check({'judge': 'caller_crisis', 'label': 'opt_out', 'mode': mode, 'outcome': outcome, 'latencyMs': latency_ms,
                  'confidence': float(confidence)})
