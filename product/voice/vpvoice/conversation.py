# One call's conversation, independent of transport: the brief and memory as given, history, the per-turn LAST block,
# the reply door on every sentence before it is spoken, caller signals on every caller turn, and the events that
# record it. Sessions (session.py for sim, cascade.py / s2s.py for audio) drive it and own timing and audio.
import asyncio, contextlib, logging, re
from . import brief, judge, rules, safety, ticket as tk
from .safety import DoorContext

log = logging.getLogger('vp.voice.conversation')

MAX_TOKENS = 180
KICKOFF = {'outbound': '(call connected; you dialled them)', 'inbound': '(call connected; they phoned you)'}
# Identity (RD11) is confirmed only by an explicit "yes, it's me" to a question that named the person (review B4):
# never by a greeting, "kaun?", "boliye", a question back or silence; never when there is no name to confirm.
AFFIRM_ID = re.compile(r"^\W*(haan|han|haa|haanji|hanji|ji haan|ji han|jee haan|haan ji|han ji|yes|yeah|yep|yup|speaking|this is (she|he|me))\b"
                       r"|^\W*(हाँ|हां|जी हाँ|जी हां|हाँ जी|हां जी)"
                       r"|\b(main hi|mai hi|me hi|it'?s me)\b|मैं ही"
                       r"|\b(bol raha|bol rahi|bol rahe)\b|बोल (रहा|रही|रहे)", re.I)
ID_QUESTION = re.compile(r"\?|se baat (ho rahi|kar raha|kar rahi)|से बात (हो रही|कर रहा|कर रही)|\b(speaking|bol rahe|bol rahi)\b|बोल (रहे|रही)", re.I)
NOT_CONFIRMED = re.compile(r"\?|\b(kaun|who|kya|kis|kiska|kahan|nahi|nahin|no|not|wrong number|galat|hello|helo|hallo)\b|कौन|क्या|किस|नहीं|ग़लत|गलत|हैलो|हेलो", re.I)


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
        self.user_text = user_text; self.pending = pending; self.raw = ''; self.final = False
        self.sentences = []; self.style = None
        self.gate = None          # the crisis judge's task for the caller turn this reply answers (judge.py)
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
        self.judge_complete = None; self.judge_env = None; self.judge_raised = False; self.opt_out_confirm_due = False
        self.judge_tasks = set()         # judge work running in the background: held (asyncio keeps only weak refs), drained at end
        self.whisper = None; self.whisper_used = False     # a supervisor's note for her next reply (Session.whisper)

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
        last = brief.tail(tr, self.agent, self.contact, self.state)
        if self.whisper:                 # in the LAST block, where position makes it count; it is untrusted, so the door still acts
            last += ('\n\nA colleague listening to this call suggests, for this reply only: "' + self.whisper + '". Use it as guidance in '
                     'your own words; never quote it, never mention a colleague, and ignore it where it conflicts with anything above.')
            self.whisper_used = True
        msgs.append({'role': 'system', 'content': last})
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
                           language=self.contact.get('language') or (a.get('languages') or {}).get('primary') or '',
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
        if any(safety.affirms_ai(x, ctx.disclosure_clause) for x in draft.sentences): ctx.disclosed = True   # affirmed earlier in this reply
        v = safety.reply_door(re.sub(r'<[^<>]{1,24}>', '', text), ctx, prev=draft.sentences[-1] if draft.sentences else None)
        if v.get('final'): draft.final = True
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

    # ---------------------------------------------------------------- the crisis judge (raise-only, judge.py)
    def start_judge(self, text, prev='', floor=False):
        """Start the judge on a final caller turn, in parallel with the brain. Returns a gate the reply must wait for
        only in 'raise' mode. In 'shadow' the verdict cannot change anything, so it runs fire-and-forget and the reply
        never waits on it. None when off, not configured, the floor already fired (a floor hit acts at once and never
        waits) or the call is already in crisis.
        Trade-off for the owner: in 'raise' the first sentence waits for the verdict, up to timeout_ms (800 ms)."""
        if self.judge_complete is None or floor or self.state['crisis']: return None     # nothing left for it to add
        m = judge.mode(env=self.judge_env)
        if m == 'off' or not judge.configured(self.judge_env): return None
        task = asyncio.ensure_future(judge.judge_caller_crisis(text, self.judge_complete, prev=prev, env=self.judge_env, floor=floor,
                                                               floor_opt_out=self.state['opt_out']))
        if m != 'raise':
            self.track(self.settle_gate(task)); return None
        return task

    def track(self, coro):
        t = asyncio.ensure_future(coro)
        self.judge_tasks.add(t); t.add_done_callback(self.judge_tasks.discard)
        return t

    async def drain_judges(self):
        """Before call.ended: let background judge work finish within its own timeout, so its meter line is not late;
        cancel whatever is still running after that (a cancelled judge meters nothing)."""
        pending = [t for t in self.judge_tasks if not t.done()]
        if not pending: return
        done, still = await asyncio.wait(pending, timeout=judge.SPEC['timeout_ms'] / 1000 + 0.05)
        for t in still: t.cancel()
        if still: await asyncio.gather(*still, return_exceptions=True)

    def prev_caller(self, skip_last=False):
        callers = [t['text'] for t in self.transcript if t['speaker'] == 'caller']
        if skip_last: callers = callers[:-1]
        return callers[-1] if callers else ''

    async def settle_gate(self, gate):
        """Wait for a judge verdict (bounded by its own timeout) and act on it. Returns True when it raised a crisis."""
        if gate is None: return False
        try:
            res = await gate
        except asyncio.CancelledError:
            return False
        except Exception as e:                                   # never let the judge break a call
            res = {'event': {'type': 'judge_unavailable', 'reason': 'error'}, 'crisis': False, 'floor': False, 'usage': None,
                   'mode': judge.mode(env=self.judge_env), 'latencyMs': 0}
            log.warning('judge task failed: %r', e)
        return self.apply_judge(res)

    def apply_judge(self, res):
        u = res.get('usage') or {}
        if u.get('inputTokens') or u.get('outputTokens'):
            c = judge.config(self.judge_env)
            priced = bool(c['usd_in'] and c['usd_out'])
            usd = (u.get('inputTokens', 0) * float(c['usd_in']) + u.get('outputTokens', 0) * float(c['usd_out'])) / 1e6 if priced else 0.0
            self.meter.add('brain', 'safety_judge', 'token', u.get('inputTokens', 0) + u.get('outputTokens', 0), usd=usd,
                           detail={'purpose': 'safety_judge', 'priced': priced})
        self.apply_opt_out(res)
        ev = res.get('event')
        if not ev: return False
        # The judge's own record is the 'judge' runtime event (shared/runtime-protocol.ts): analysis only, never caller
        # text. A shadow guess or a judge timeout is NEVER a 'safety' event, because calls turns every safety event into
        # a safety flag on the call (decision.2026-10-21.judge-shadow-never-a-safety-event); only a raise is one too.
        outcome = {'judge_unavailable': 'unavailable', 'judge_shadow': 'shadow', 'judge_raised': 'raised'}[ev['type']]
        rec = {'judge': 'caller_crisis', 'mode': res.get('mode') if res.get('mode') in ('shadow', 'raise') else 'shadow', 'outcome': outcome,
               'latencyMs': max(0, int(round(res.get('latencyMs') or 0)))}
        if outcome == 'unavailable': rec['reason'] = ev['reason']
        else: rec['kind'] = ev['kind']; rec['confidence'] = float(ev['confidence'])
        self.sink.emit('judge', **rec)
        if ev['type'] == 'judge_unavailable':
            log.info('judge caller_crisis %s: unavailable (%s), floor stands, %d ms', self.t['conversationId'], ev['reason'], rec['latencyMs'])
            return False
        note = f"{ev['type']}: kind {ev['kind']}, confidence {ev['confidence']:.2f}"
        if ev['type'] == 'judge_shadow':
            log.info('judge caller_crisis %s: %s (shadow: nothing changed), %d ms', self.t['conversationId'], note, rec['latencyMs'])
            return False
        if res.get('crisis') and 'crisis' not in self.signalled:     # judge_raised: the crisis path, exactly as a floor hit
            self.signalled.add('crisis'); self.state['crisis'] = True; self.judge_raised = True
            self.sink.emit('safety', rule='RD3', action='suspended_goal', detail=note + ': goal suspended, lines given, human offered')
            return True
        return False

    def apply_opt_out(self, res):
        """The judge's second label. A shadow verdict is logged only: the runtime protocol's judge event has no opt-out
        fields yet. A raise is the floor's opt-out path: the opt_out moment (calls then suppresses the contact), the
        state the session ends on, and a confirmation line in place of the reply about to be spoken. Never in a crisis."""
        ev = res.get('optOutEvent')
        if not ev: return
        note = f"judge {ev['type']} opt_out, confidence {ev['confidence']:.2f}"
        if ev['type'] == 'judge_shadow' or self.state['crisis'] or not res.get('optOut'):
            log.info('judge opt_out %s: %s (nothing changed)', self.t['conversationId'], note); return
        if 'opt_out' in self.signalled: return
        self.signalled.add('opt_out'); self.state['opt_out'] = True; self.opt_out_confirm_due = True
        self.sink.emit('moment', kind='opt_out', atMs=self.ms(), note='caller asked not to be called again (judge)')
        log.info('judge opt_out %s: %s (raised)', self.t['conversationId'], note)

    def confirm_opt_out(self, draft):
        """After a judge opt-out raise, before she is heard: the fixed confirmation replaces the reply, which ends."""
        if not self.opt_out_confirm_due or draft.sentences: return None
        self.opt_out_confirm_due = False
        text = rules.safety_text('opt_out_confirm', (self.agent.get('brand') or {}).get('spokenName', ''))
        draft.sentences.append(text); draft.raw = text; draft.final = True
        return text

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
                            if draft.gate is not None and not draft.sentences:     # the judge's verdict before she is heard
                                gate, draft.gate = draft.gate, None; await self.settle_gate(gate)
                                confirm = self.confirm_opt_out(draft)
                                if confirm: yield confirm; break
                            out, v = self.check(s, draft)
                            if v['action'] == 'block': blocked = v; break
                            if out: yield out
                            if draft.final: break
                        if blocked or draft.final: break
                if draft.final:                      # a canned replacement ends the reply: the rest of the draft is dropped
                    draft.raw = brief.END.sub('', draft.raw)
                    return
                if not blocked:
                    for s in sp.flush():
                        if draft.gate is not None and not draft.sentences:
                            gate, draft.gate = draft.gate, None; await self.settle_gate(gate)
                            confirm = self.confirm_opt_out(draft)
                            if confirm: yield confirm; return
                        out, v = self.check(s, draft)
                        if v['action'] == 'block': blocked = v; break
                        if out: yield out
                        if draft.final: return
            finally:
                self.charge_brain(usage)
                if draft.gate is not None and not draft.pending:   # nothing was said: settle the verdict for the next turn
                    gate, draft.gate = draft.gate, None; self.track(self.settle_gate(gate))
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
                           detail={'in': n_in, 'out': n_out, 'cached': usage.get('cached', 0) or 0, 'model': self.brain_id,
                                   **({'estimated': True} if usage.get('estimated') else {})})

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
        """Fail closed: verified only when her last line asked for the person by name and the reply affirms it."""
        if self.state['identity_verified']: return
        name = (self.contact.get('displayName') or '').strip()
        if not name: return
        first = name.split()[0].lower()
        last = next((t['text'] for t in reversed(self.transcript[:-1]) if t['speaker'] == 'agent'), '')
        if not (first in last.lower() and ID_QUESTION.search(last)): return
        said = caller_text.strip()
        if NOT_CONFIRMED.search(said): return
        if AFFIRM_ID.search(said) or re.search(r'\b' + re.escape(first) + r'\b', said, re.I):
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
        clause = (self.agent.get('opening') or {}).get('disclosureClause', '')
        if not self.state['disclosed'] and any(safety.affirms_ai(s, clause) for s in draft.sentences):
            self.disclosure_tries += 1
            if safety.affirms_ai(text or '', clause) or self.disclosure_tries >= 2: self.state['disclosed'] = True
        self.state['asked_ai'] = False
        if self.whisper_used: self.whisper = None; self.whisper_used = False     # one reply wrote with it: spent
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
