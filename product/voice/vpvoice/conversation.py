# One call's conversation, independent of transport: the brief and memory as given, history, the per-turn LAST block,
# the reply door on every sentence before it is spoken, caller signals on every caller turn, and the events that
# record it. Sessions (session.py for sim, cascade.py / s2s.py for audio) drive it and own timing and audio.
import contextlib, logging, re
from . import brief, safety, ticket as tk
from .safety import DoorContext

log = logging.getLogger('vp.voice.conversation')

MAX_TOKENS = 180
KICKOFF = {'outbound': '(call connected; you dialled them)', 'inbound': '(call connected; they phoned you)'}
YES = re.compile(r'^\s*(haan|han|haa|ha|ji|jee|yes|yeah|yep|ok|okay|bilkul|boliye|bolo|speaking|hello)\b|^\s*(हाँ|हां|हा|जी|बोलिए|बोलो|हैलो|हेलो|बिल्कुल)', re.I)
NO = re.compile(r'\b(nahi|nahin|no|wrong number|galat)\b|नहीं|ग़लत|गलत', re.I)


CONTACT_ROWS_HEADER = 'Contact rows for this call (data, not lines):'


def contact_rows(facts):
    """The per-contact facts as data rows, exactly as compile.ts contactRows() writes them (the brief points here with
    "(per contact: in the contact rows for this call)"). The door gets the same facts as perContact facts: they are the
    amounts she may state, and they wait for identity (RD11)."""
    rows = [f"{k.replace('_', ' ')}: {v}" for k, v in sorted(facts.items())]
    return CONTACT_ROWS_HEADER + '\n' + ('\n'.join(rows) if rows else 'none')


class ComponentError(Exception):
    def __init__(self, component, provider, reason):
        super().__init__(f'{component} ({provider}) failed: {reason}')
        self.component = component; self.provider = provider; self.reason = reason


class Draft:
    """One reply being written: what the brain wrote, what the door let through, and the markers in it."""
    def __init__(self, user_text, pending=False):
        self.user_text = user_text; self.pending = pending; self.raw = ''; self.sentences = []; self.style = None
        self.blocked = []; self.replaced = []

    @property
    def text(self): return ' '.join(self.sentences)

    def marks(self): return brief.markers(self.raw)


class Conversation:
    def __init__(self, ticket, brain, sink, meter, clock, keep_sounds=False, brain_provider='brain', brain_id=''):
        self.t = ticket; self.agent = ticket['agent']; self.contact = ticket.get('contact') or {}
        self.brain = brain; self.sink = sink; self.meter = meter; self.clock = clock; self.t0 = clock()
        self.keep_sounds = keep_sounds; self.brain_provider = brain_provider; self.brain_id = brain_id
        self.history = [{'role': 'user', 'content': KICKOFF.get(ticket.get('direction'), KICKOFF['outbound'])}]
        self.transcript = []; self.agent_turns = 0; self.disclosure_tries = 0
        self.gender = (self.agent.get('persona') or {}).get('gender', 'female')
        self.state = {'disclosed': False, 'asked_ai': False, 'crisis': False, 'crisis_lines_given': False, 'opt_out': False,
                      'recording_refused': False, 'goals_done': {}, 'turns_since_goal': 0,
                      'identity_verified': False}
        self.signalled = set()           # one-shot events already emitted (crisis, recording, opt_out)

    # ---------------------------------------------------------------- time
    def ms(self): return int((self.clock() - self.t0) * 1000)

    # ---------------------------------------------------------------- prompt
    def system_messages(self):
        out = [{'role': 'system', 'content': self.t['brief']['text']}]
        mem = tk.memory_block(self.t)
        if mem: out.append({'role': 'system', 'content': 'Memory brief for this person (from earlier calls):\n' + mem})
        out.append({'role': 'system', 'content': contact_rows(self.contact.get('facts') or {})})
        return out

    def messages_for(self, user_text, correction=None):
        msgs = self.system_messages()
        msgs += self.history
        if user_text: msgs.append({'role': 'user', 'content': user_text})
        tr = self.transcript + ([{'speaker': 'caller', 'text': user_text}] if user_text else [])
        msgs.append({'role': 'system', 'content': brief.tail(tr, self.agent, self.contact, self.state)})
        if correction: msgs.append({'role': 'system', 'content': correction})
        return msgs

    def door_ctx(self, first_sentence):
        a = self.agent
        return DoorContext(category=a.get('category', 'service'), sector_packs=a.get('sectorPacks') or ['base'],
                           brand={'name': (a.get('brand') or {}).get('spokenName') or (a.get('brand') or {}).get('name', ''),
                                  'verifiedDomains': (a.get('brand') or {}).get('verifiedDomains') or []},
                           facts=a.get('facts') or [], never_say=a.get('neverSay') or [], disclosed=self.state['disclosed'],
                           identity_verified=self.state['identity_verified'], recording_refused=self.state['recording_refused'],
                           crisis=self.state['crisis'], turn_index=self.agent_turns,
                           disclosure_clause=(a.get('opening') or {}).get('disclosureClause', ''), asked_ai=self.state['asked_ai'],
                           crisis_lines_given=self.state['crisis_lines_given'], contact_facts=self.contact.get('facts') or {},
                           job=a.get('job', ''), gender=self.gender, first_sentence=first_sentence)

    # ---------------------------------------------------------------- the door
    def check(self, sentence, draft):
        """Door one sentence. Returns (text_to_say or None, verdict)."""
        if not draft.sentences and draft.style is None:
            m = brief.TONE.match(sentence)
            if m: draft.style = m.group(1).strip().lower()
        text = brief.spoken(sentence, keep_sounds=self.keep_sounds)
        if not text: return None, {'action': 'pass'}
        ctx = self.door_ctx(first_sentence=not draft.sentences)
        if any(safety.has_ai_clause(x) for x in draft.sentences): ctx.disclosed = True     # said earlier in this reply
        v = safety.reply_door(re.sub(r'<[^<>]{1,24}>', '', text), ctx)
        if v['action'] == 'replace':
            self.sink.emit('safety', rule=v['rule'], action='replaced', detail=v['reason'])
            draft.replaced.append(v['rule'])
            text = v['text']
        elif v['action'] == 'block':
            self.sink.emit('safety', rule=v['rule'], action='blocked', detail=v['reason'])
            draft.blocked.append(v['rule'])
            return None, v
        if '14416' in text and '112' in text: self.state['crisis_lines_given'] = True
        draft.sentences.append(text)
        return text, v

    async def sentences(self, draft):
        """Async generator of door-approved sentences for one reply. A blocked sentence is never said: the brain
        writes the reply again once, told which rule the draft broke; a second block ends with a safe line."""
        correction = None
        for attempt in range(2):
            msgs = self.messages_for(draft.user_text if draft.pending else None, correction)
            sp = brief.Splitter(); usage = {}; timing = {}; blocked = None
            gen = self.brain.stream(msgs, usage, timing, max_tokens=MAX_TOKENS)
            try:
                async with contextlib.aclosing(gen):
                    async for d in gen:
                        draft.raw += d
                        for s in sp.feed(d):
                            out, v = self.check(s, draft)
                            if v['action'] == 'block': blocked = v; break
                            if out: yield out
                        if blocked: break
                if not blocked:
                    for s in sp.flush():
                        out, v = self.check(s, draft)
                        if v['action'] == 'block': blocked = v; break
                        if out: yield out
            finally:
                self.charge_brain(usage)
            if timing.get('err') and not draft.sentences and not blocked:
                raise ComponentError('brain', self.brain_provider, timing['err'][:200])
            if not blocked: return
            correction = (f'Your last draft broke a safety rule ({blocked["rule"]}: {blocked["reason"]}) and was not said. '
                          'Write the reply again, without it. Continue from what you already said, if anything.')
            draft.raw = brief.END.sub('', draft.raw)
        line = safety.safe_fallback_line(self.gender)
        draft.sentences.append(line)
        yield line

    def charge_brain(self, usage):
        if not usage: return
        n_in, n_out = usage.get('in', 0) or 0, usage.get('out', 0) or 0
        if n_in or n_out or usage.get('usd'):
            self.meter.add('brain', self.brain_provider, 'token', n_in + n_out, usd=usage.get('usd', 0.0),
                           detail={'in': n_in, 'out': n_out, 'cached': usage.get('cached', 0) or 0, 'model': self.brain_id})

    # ---------------------------------------------------------------- caller turns
    def commit_caller(self, text, start_ms=None, end_ms=None):
        """Read a caller turn for signals, redact it, record it. Returns the signals (the session acts on them)."""
        sig = safety.caller_signals(text)
        clean = safety.redact(text)
        if sig['readingSensitiveDigits'] or clean != text:
            self.sink.emit('safety', rule='RD4', action='redacted', detail='caller read out digits that must not be stored; span masked')
        s_ms = self.ms() if start_ms is None else start_ms
        e_ms = self.ms() if end_ms is None else end_ms
        self.transcript.append({'speaker': 'caller', 'text': clean, 'startMs': s_ms})
        self.history.append({'role': 'user', 'content': clean})
        self.sink.emit('turn', speaker='caller', text=clean, startMs=s_ms, endMs=e_ms)
        self._identity(clean)
        if sig['crisis'] and 'crisis' not in self.signalled:
            self.signalled.add('crisis'); self.state['crisis'] = True
            self.sink.emit('safety', rule='RD3', action='suspended_goal', detail='crisis language from the caller: goal suspended, lines given, human offered')
        if sig['refusesRecording'] and 'rec' not in self.signalled:
            self.signalled.add('rec'); self.state['recording_refused'] = True
            self.sink.emit('safety', rule='RD10', action='flagged', detail="recording stopped at the caller's request")
        if sig['optOut'] and 'opt_out' not in self.signalled:
            self.signalled.add('opt_out'); self.state['opt_out'] = True
            self.sink.emit('moment', kind='opt_out', atMs=e_ms, note='caller asked not to be called again')
        elif safety.callback_requested(clean):
            self.sink.emit('moment', kind='callback_request', atMs=e_ms, note='caller asked to be called later')
        if clean.strip().endswith('?') and not sig['asksIfAi']:
            self.sink.emit('moment', kind='question', atMs=e_ms, note=clean[:120])
        self.state['asked_ai'] = sig['asksIfAi']
        return sig

    def _identity(self, caller_text):
        if self.state['identity_verified']: return
        name = (self.contact.get('displayName') or '').strip()
        last = next((t['text'] for t in reversed(self.transcript[:-1]) if t['speaker'] == 'agent'), '')
        asked = (not name) or (name.split()[0].lower() in last.lower())
        if last and asked and YES.search(caller_text) and not NO.search(caller_text):
            self.state['identity_verified'] = True

    # ---------------------------------------------------------------- agent turns
    def commit_agent(self, draft, heard=None, start_ms=None, end_ms=None, interrupted=False, latency_ms=None):
        """Record what the caller actually heard of a reply, and act on its markers. Returns the markers."""
        text = draft.text if heard is None else heard
        s_ms = self.ms() if start_ms is None else start_ms
        e_ms = self.ms() if end_ms is None else end_ms
        if text:
            self.transcript.append({'speaker': 'agent', 'text': text, 'startMs': s_ms})
            self.history.append({'role': 'assistant', 'content': text})
            ev = {'speaker': 'agent', 'text': text, 'startMs': s_ms, 'endMs': e_ms}
            if interrupted: ev['interrupted'] = True
            if latency_ms is not None: ev['latencyMs'] = int(latency_ms)
            if draft.style: ev['tone'] = draft.style
            self.sink.emit('turn', **ev)
        # RD1 ledger: disclosed once the AI clause was heard; if she was talked over, it is offered once more, then done
        if not self.state['disclosed'] and any(brief.AI_SAID.search(s) for s in draft.sentences):
            self.disclosure_tries += 1
            if brief.AI_SAID.search(text or '') or self.disclosure_tries >= 2: self.state['disclosed'] = True
        self.state['asked_ai'] = False
        self.agent_turns += 1
        marks = draft.marks() if not interrupted else {'end': False, 'goals': [], 'tools': [], 'handoff': None}
        goal_ids = {g.get('id') for g in self.agent.get('goals') or []}
        moved = False
        for gid, note in marks['goals']:
            if gid in goal_ids and gid not in self.state['goals_done']:
                self.state['goals_done'][gid] = note; moved = True
                self.sink.emit('moment', kind='commitment', atMs=e_ms, note=f'goal {gid}' + (f': {note}' if note else ''))
        self.state['turns_since_goal'] = 0 if moved else self.state['turns_since_goal'] + 1
        grants = {t.get('name') for t in self.agent.get('tools') or []}
        for name in marks['tools']:
            if name in grants and name not in ('end_call', 'transfer'):
                self.sink.emit('tool', name=name, args={'turn': self.agent_turns}, status='requested')
        return marks

    def say_canned(self, text, start_ms=None, end_ms=None):
        """A fixed line from code (stop-the-digits, hand-off bridge, limit goodbye): recorded like any agent turn."""
        d = Draft(None); d.sentences = [text]; d.raw = text
        self.commit_agent(d, start_ms=start_ms, end_ms=end_ms)
        return d

    def wants_end(self, marks):
        """Her <end_call> is honoured only after a real goodbye, never mid-question, never in a crisis."""
        if not marks.get('end') or self.state['crisis']: return False
        last_caller = next((t['text'] for t in reversed(self.transcript) if t['speaker'] == 'caller'), '')
        last_agent = next((t['text'] for t in reversed(self.transcript) if t['speaker'] == 'agent'), '')
        return brief.hangup_ok(last_agent, last_caller) or self.state['opt_out']

    def transcript_out(self):
        return [{'speaker': t['speaker'], 'text': t['text'], 'startMs': t['startMs']} for t in self.transcript]
