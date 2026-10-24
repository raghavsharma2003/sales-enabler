# Runtime -> control plane: RuntimeEvent batches, signed, POSTed to {VP_CONTROL_URL}/hooks/runtime.
# seq is per call and strictly increasing; batches go out one at a time, in order; a failed batch is retried as the
# same batch (the control plane is idempotent on conversationId + seq). call.ended always goes in a batch of its own,
# after every other event of the call has been delivered.
import asyncio, json, logging, time
from datetime import datetime, timezone
from . import signing

log = logging.getLogger('vp.voice.events')


def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def encode(batch):
    return json.dumps(batch, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


class HttpPoster:
    """Signs and POSTs one batch body. Returns True on a 2xx."""
    def __init__(self, http, control_url, secret):
        self.http = http; self.url = control_url.rstrip('/') + '/hooks/runtime'; self.secret = secret

    async def __call__(self, body: bytes) -> bool:
        import aiohttp
        hdr = {'content-type': 'application/json', signing.HEADER: signing.sign(self.secret, body)}
        try:
            async with self.http.post(self.url, data=body, headers=hdr, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if 200 <= r.status < 300: return True
                log.warning('control plane answered %s for a batch', r.status)
                return r.status in (409,)       # 409: already have it (idempotent duplicate)
        except Exception as e:
            log.warning('batch post failed: %r', e)
            return False


class MemoryPoster:
    """For tests and the in-process sim: keeps every body it was given (signed like the real one)."""
    def __init__(self, secret='test-secret', fail_first=0):
        self.secret = secret; self.bodies = []; self.headers = []; self.fail_first = fail_first; self.calls = 0

    async def __call__(self, body: bytes) -> bool:
        self.calls += 1
        if self.calls <= self.fail_first: return False
        self.headers.append(signing.sign(self.secret, body)); self.bodies.append(body)
        return True

    def events(self):
        seen = {}
        for b in self.bodies:
            for e in json.loads(b)['events']: seen.setdefault(e['seq'], e)
        return [seen[k] for k in sorted(seen)]


# String limits as calls/ingest.ts validates them: a field over its limit made ingest refuse the WHOLE batch (422), and
# every event in it was lost (staging 2026-10-23: a 79-character tone note). The runtime trims to fit before sending.
FIELD_MAX = {'turn': {'text': 20_000, 'tone': 50}, 'safety': {'detail': 2000}, 'moment': {'note': 2000}, 'tool': {'name': 100},
             'hand_off': {'reason': 500, 'target': 200, 'summary': 2000}, 'cost': {'provider': 100}, 'call.ended': {'recordingUri': 2000}}
TRANSCRIPT_MAX = 5000


def fit(text, n):
    """text cut to at most n characters, at a word boundary when one is near, never mid-way through a code point."""
    if not isinstance(text, str) or len(text) <= n: return text
    cut = text[:n - 1]; sp = cut.rfind(' ')
    return (cut[:sp] if sp > n * 0.6 else cut).rstrip(' ,;:') + '…'


def sanitise(type_, fields):
    for k, n in FIELD_MAX.get(type_, {}).items():
        if k in fields: fields[k] = fit(fields[k], n)
    if type_ == 'call.ended' and isinstance(fields.get('transcript'), list):
        tr = fields['transcript'][:TRANSCRIPT_MAX]
        fields['transcript'] = [dict(x, text=fit(x.get('text', ''), 20_000)) for x in tr]
    return fields


class EventSink:
    MAX_BATCH = 50

    def __init__(self, conversation_id, poster, retry_delays=(0.25, 0.5, 1, 2, 4, 8, 16), flush_every_s=1.0):
        self.cid = conversation_id; self.poster = poster; self.seq = 0; self.pending = []
        self.lock = asyncio.Lock(); self.retry = retry_delays; self.ended = False; self.flush_every = flush_every_s
        self.task = None; self.undelivered = 0

    def emit(self, type_, **fields):
        if self.ended:                     # a reply still finishing after the call ended: nothing more is reported
            log.info('dropped a %s event after call.ended for %s', type_, self.cid)
            return None
        self.seq += 1
        ev = {'seq': self.seq, 'type': type_, 'at': iso_now(), **sanitise(type_, fields)}
        self.pending.append(ev)
        return ev

    def start(self):
        if self.task is None: self.task = asyncio.ensure_future(self._loop())

    async def _loop(self):
        try:
            while not self.ended:
                await asyncio.sleep(self.flush_every)
                await self.flush()
        except asyncio.CancelledError:
            pass

    async def _post(self, events):
        body = encode({'protocol': 1, 'conversationId': self.cid, 'events': events})
        for i, d in enumerate((0,) + tuple(self.retry)):
            if d: await asyncio.sleep(d)
            if await self.poster(body): return True
        self.undelivered += len(events)
        log.error('gave up on a batch of %d events for %s (seq %d-%d)', len(events), self.cid, events[0]['seq'], events[-1]['seq'])
        return False

    async def flush(self):
        async with self.lock:
            while self.pending:
                batch, self.pending = self.pending[:self.MAX_BATCH], self.pending[self.MAX_BATCH:]
                await self._post(batch)

    async def end(self, **ended_fields):
        """Flush everything, then send call.ended alone, last."""
        if self.ended: return None
        await self.flush()
        ev = self.emit('call.ended', **ended_fields)
        self.pending.remove(ev)
        self.ended = True
        if self.task: self.task.cancel()
        async with self.lock:
            await self._post([ev])
        return ev
