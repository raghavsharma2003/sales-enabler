# What the runtime adds to the control plane's brief: nothing inside it (brief.text is compiled once and never
# re-worded), only a generic, data-driven LAST block per turn, because position is mechanism: a rule mid-brief fired
# 0/8, appended last 8/8 (voicelab/server/persona_v2.py). The block is a pure function of the transcript, the agent
# config and the call state: a ledger of what is spent, how they sound, what is still open, then the turn rules.
#
# Marker vocabulary (stripped before speaking, never heard):
#   <end_call>            at the very end of her goodbye reply
#   <goal:ID>             a goal from agent.goals is settled (optionally <goal:ID=outcome-note>)
#   <tool:NAME>           ask the control plane to run a granted tool after this turn
#   <handoff:REASON>      the conversation needs a human (REASON from agent.handOff.when)
#   [tone: ...]           optional delivery note at the start of a reply (styled voices only)
import re

LAST = """Before you write each reply:
1. Length: most turns are one short sentence. When they asked for information, or are worried or confused, give the
   real answer in up to three short sentences; concrete facts are the kind thing then. When they are enjoying the chat,
   two easy sentences are fine. Questions: most turns have none, never more than one, and never end two turns in a row
   with a question.
2. Goal: move toward it when their last turn opens a door, or, if the ledger says the goal has not moved for a while
   and they are relaxed, build a natural bridge to it from what they said. At most one small step per turn, never on
   two turns running. Anything marked spent in the ledger stays spent."""

END = re.compile(r'<\s*/?\s*end[_ ]?call\s*/?\s*>|\[\s*end[_ ]?call\s*\]', re.I)
GOAL = re.compile(r'<\s*goal\s*:\s*([A-Za-z0-9_.-]{1,64})(?:\s*=\s*([^<>]{0,120}))?\s*>', re.I)
TOOL = re.compile(r'<\s*tool\s*:\s*([A-Za-z0-9_.-]{1,64})\s*(\{[^<>]{0,400}\})?\s*>', re.I)     # <tool:NAME {"arg": 1}> (tools.py)
HANDOFF = re.compile(r'<\s*hand_?off\s*(?::\s*([A-Za-z_]{1,40}))?\s*>', re.I)
DTMF = re.compile(r'<\s*dtmf\s*:?\s*([0-9*#]{1,4})\s*>', re.I)      # keys for an automated menu ("press 1"), at most 4
# An automated menu the caller side is playing (an IVR she reached): then the LAST block tells her how to press a key
MENU = re.compile(r'\bpress\s+(\d|one|two|three|star|hash)\b|\bdial\s+\d\b|\bdabaiye\b|\bdabaaye\b|\bdabayen\b|दबाएं|दबाएँ|दबाइए|दबाये', re.I)
TONE = re.compile(r'^\s*\[tone:\s*([^\]]{0,80})\]\s*', re.I)
SOUND_TAG = re.compile(r'<\s*(laugh|laughter|chuckle|chuckles|giggle|sigh|sighs|breath|exhales|short pause|long pause)\s*>', re.I)
ANY_TAG = re.compile(r'<[^<>]{1,40}>')

AI_SAID = re.compile(r'\bA\.?I\b|ए\s?\.?\s?आई|एआई', re.I)
NO = re.compile(r'नहीं|नही|\bno\b|not now|बाद में|later|\bmat\b|मत|रहने दो|busy', re.I)
YES = re.compile(r'हाँ|हां|\bhaan\b|\bok\b|ओके|ठीक|भेज दो|\bsend\b|कर दो|\byes\b|चलो|\bbook\b|बुक|\bji\b|जी', re.I)
CLOSING = re.compile(r'\bbye\b|बाय|thank you|thanks|थैंक|धन्यवाद|शुक्रिया|चलो ठीक है|ठीक है फिर|बाद में बात|रखती? हूँ|रखता हूँ|done hai|हो गया|that.s all|बस इतना|ok bye', re.I)
CUES = [('in a hurry', re.compile(r'जल्दी|busy|meeting|\bcab\b|driving|गाड़ी|time नहीं|टाइम नहीं|quick', re.I)),
        ('irritated', re.compile(r'loot|लूट|बकवास|scam|fraud|गुस्सा|irritate|पागल|बेकार|क्या मज़ाक|spam', re.I)),
        ('worried', re.compile(r'डर|चिंता|tension|worried|क्या होगा|परेशान', re.I)),
        ('joking or chatty', re.compile(r'haha|हाहा|मज़ाक|robot|रोबोट|\bbhai\b|भाई|weekend|cricket', re.I)),
        ('confused', re.compile(r'समझ नहीं|क्या\?|कौन सी|which|confus|मतलब\?', re.I))]
LAUGH = re.compile(r'हा\s?हा|haha|हे\s?हे|hehe|<\s*(laugh|chuckle|giggle)', re.I)
GOODBYE = re.compile(r'bye|बाय|नमस्ते|ख्याल रख|take care|have a (good|great|nice)|अच्छा दिन|शुभ|धन्यवाद|शुक्रिया|thank|फिर बात|बात करते|चलिए|मिलते|all the best|best of luck', re.I)
ASKING = re.compile(r'\?|\b(क्या|कब|कैसे|क्यों|कितना|कौन|what|when|why|how)\b[^।.!]*$', re.I)
NUM = re.compile(r'\d[\d,]*(?:\.\d+)?')


def amounts(text):
    """Figures of three or more digits, as integers (18,450 -> 18450)."""
    out = set()
    for x in re.findall(r'\d[\d,]{2,}', text or ''):
        d = x.replace(',', '')
        if d.isdigit(): out.add(int(d))
    return out


def spoken(text, keep_sounds=False):
    """What actually gets spoken: no tone note, no markers, no bracketed directions; sound tags only for a voice that
    understands them (Gemini 3.8 TTS does; any other voice reads a tag out or garbles it)."""
    text = DTMF.sub('', HANDOFF.sub('', TOOL.sub('', GOAL.sub('', END.sub('', TONE.sub('', text or ''))))))
    text = re.sub(r'\[[^\]]{0,60}\]', '', text)
    text = re.sub(r'[*_#`~]|[\U0001F300-\U0001FAFF\u2600-\u27BF]', '', text)      # markdown and emoji are never spoken
    if keep_sounds:
        keep = {}
        def hold(m):
            k = f'\x00{len(keep)}\x00'; keep[k] = m.group(0).lower(); return k
        text = ANY_TAG.sub('', SOUND_TAG.sub(hold, text))
        for k, v in keep.items(): text = text.replace(k, v)
    else:
        text = ANY_TAG.sub('', text)
    return re.sub(r'\s{2,}', ' ', text).strip()


def markers(text):
    """The control markers in one reply: {'end': bool, 'goals': [(id, note)], 'tools': [name], 'handoff': reason|None,
    'dtmf': keys|''}."""
    t = text or ''
    h = HANDOFF.search(t)
    return {'end': bool(END.search(t)), 'goals': [(m.group(1), (m.group(2) or '').strip()) for m in GOAL.finditer(t)],
            'tools': [m.group(1) for m in TOOL.finditer(t)], 'tool_calls': [(m.group(1), m.group(2) or '') for m in TOOL.finditer(t)],
            'handoff': (h.group(1) or 'out_of_scope') if h else None,
            'dtmf': ''.join(m.group(1) for m in DTMF.finditer(t))[:4]}


def hangup_ok(reply, last_caller):
    """Honour her <end_call> only when her line is a goodbye and they were not in the middle of asking something (a
    hang-up right after a question measured 17-40% of her text-bench hang-ups, 2026-10-20)."""
    return bool(GOODBYE.search(spoken(reply))) and not ASKING.search((last_caller or '').strip())


class Splitter:
    """Cuts a streaming reply into sentences for the door and the voice. Never splits inside a number ("18,450",
    "2.5") or a marker arriving in pieces; a very long run is cut at its last comma or space. With first_clause_at
    (CascadeSession.FIRST_CLAUSE), the reply's first piece is cut at its first comma once that many characters are in,
    so the voice can start before the first sentence ends."""
    BOUND = re.compile(r'[.?!।]+(?=\s|$)|\n')

    def __init__(self, long_at=160, first_clause_at=None):
        self.buf = ''; self.long_at = long_at; self.first_clause_at = first_clause_at; self.cuts = 0

    def feed(self, delta):
        self.buf += delta; out = []
        while True:
            lt = self.buf.rfind('<')
            hold = lt if lt >= 0 and '>' not in self.buf[lt:] else len(self.buf)
            head = self.buf[:hold]
            m = self.BOUND.search(head)
            if m and m.end() < len(self.buf):
                cut = m.end()
            elif m and m.end() == len(self.buf) and head[m.start()] != '.':
                cut = m.end()
            elif self.first_clause_at and not self.cuts and (k := head.find(', ', self.first_clause_at - 1)) > 0:
                cut = k + 1                       # the first clause, comma kept (the voice's pause), the space dropped
            elif len(head) > self.long_at:
                k = max(head.rfind(', ', 0, self.long_at), head.rfind(' ', 0, self.long_at))
                if k <= 0: break
                cut = k + 1
            else:
                break
            s, self.buf = self.buf[:cut], self.buf[cut:]
            if s.strip(): out.append(s.strip()); self.cuts += 1
        return out

    def flush(self):
        s, self.buf = self.buf.strip(), ''
        return [s] if s else []


def _said(value, texts):
    v = str(value or '').strip()
    if len(v) < 3: return False
    if any(ch.isdigit() for ch in v):
        want = amounts(v) or {v}
        return any(want & amounts(x) for x in texts) if amounts(v) else any(v in x for x in texts)
    return any(v.lower() in x.lower() for x in texts)


def ledger(transcript, agent, contact, state):
    """Telegraphic rows of what is already done on this call; a pure function of its inputs."""
    her = [t['text'] for t in transcript if t['speaker'] == 'agent']
    callers = [t['text'] for t in transcript if t['speaker'] == 'caller']
    rows = []
    if state.get('crisis'):
        rows.append('CRISIS: the goal of this call is suspended. Stay with them, slow and warm; Tele-MANAS 14416 and 112 '
                    'are the numbers; offer a human; never end the call yourself')
    checkin = None if state.get('crisis') else state.get('checkin')
    if checkin in ('due', 'answer'):     # a judge-only crisis raise, check-in on: shapes from rules.json, never lines
        from . import rules
        rows.append('CHECK-IN: ' + ' '.join((rules.RULES.get('checkin') or {}).get('shapes' if checkin == 'due' else 'answer_shapes') or []))
    paused = state.get('crisis') or checkin in ('due', 'answer')
    name = (contact.get('displayName') or '').strip()
    if not state.get('identity_verified'):
        # the brief asks for the person by name; with no name she must never say a blank ("क्या मैं ___ से…")
        from .names import forms
        roman, deva = forms(name)
        rows.append(f'the person you are calling: {roman} (in Devanagari: {deva}); call them by this name only, never another' if name else
                    'their name is not known: never ask for anyone by name and never leave a blank for a name; greet them and ask if now is a good time')
    if not state.get('disclosed'):
        clause = ((agent.get('opening') or {}).get('disclosureClause') or '').strip()
        rows.append('this breath must carry the brand and your one AI clause' + (f' ({clause})' if clause else '') + ', lightly, in passing')
        row_first = ((contact.get('rowOverrides') or {}).get('usefulFirst') or '').strip()
        if row_first:      # the person's list gave this call its own opening (intake rowOverrides): it replaces the brief's
            rows.append(f'for this person, the useful thing to open with is: {row_first[:300]} (this replaces the useful '
                        'first thing in your instructions; a shape for your own words, never recited)')
        from .names import brand_forms
        roman, deva, given = brand_forms(agent.get('brand'))
        if roman:
            rows.append(f'the brand, as you write it: {roman}' + (f' (in Devanagari exactly: {deva})' if given else
                        ' (keep it in these Latin letters, also inside Devanagari; never respell it)'))
    if state.get('asked_ai'):
        rows.append('they just asked if you are an AI: say yes plainly first, lightly, then carry on')
    if state.get('opt_out'):
        rows.append('they asked not to be called again: confirm in one warm line that they will not be called, no pitch, then <end_call>')
    if state.get('recording_refused'):
        rows.append('they asked not to be recorded: recording is off now; say so in a few words if it comes up')
    facts = [(f.get('key'), f.get('value')) for f in agent.get('facts') or []] + list((contact.get('facts') or {}).items())
    known = set()
    for _, v in facts: known |= amounts(str(v))
    last_caller = callers[-1] if callers else ''
    wrong = sorted(n for n in amounts(last_caller) if n >= 1000 and n not in known)
    if wrong and known: rows.append(f'they just said {wrong[0]:,}: that is not in your facts; if it is about this, give the right figure in passing')
    if any(LAUGH.search(x) for x in her[-3:]): rows.append('you laughed recently: no laugh this turn')
    told = (['that you are an AI'] if state.get('disclosed') else [])      # an affirmation the door passed, not a mention
    told += [k for k, v in facts if k and _said(v, her)]
    figures = sorted({n for x in her for n in amounts(x)} - known)
    if told: rows.append('already said (spent): ' + ' · '.join(dict.fromkeys(told)))
    if figures: rows.append('other figures you said: ' + ' · '.join(f'{n:,}' for n in figures[:6]))
    goals = agent.get('goals') or []
    done = state.get('goals_done') or {}
    if goals and not paused:
        open_ = [g for g in goals if g.get('id') not in done]
        if done: rows.append('goals settled: ' + ' · '.join(done))
        if open_: rows.append('goals still open: ' + ' · '.join(f"{g['id']} ({g.get('description', '')[:90]})" for g in open_))
    if callers and MENU.search(callers[-1]):
        rows.append('an automated menu is speaking, not a person: to choose an option write only <dtmf N> (for example <dtmf 1>), '
                    'no words; choose what reaches a person or the purpose of this call; never enter numbers you were not told')
    read = [name for name, rx in CUES if any(rx.search(c) for c in callers[-3:])]
    if read: rows.append('lately they sound: ' + ', '.join(read))
    since = state.get('turns_since_goal', 0)
    if goals and not paused and len(her) >= 3 and since >= 3 and 'irritated' not in read and 'worried' not in read:
        rows.append(f'the goal has not moved for {since} of your turns: when there is a natural bridge, take it')
    if callers and CLOSING.search(callers[-1]) and not state.get('crisis'):
        rows.append('they sound ready to finish: one warm closing line, then <end_call>')
    if her and her[-1].strip().endswith('?'): rows.append('your last turn ended with a question')
    return 'Ledger of this call so far:\n' + ('\n'.join('- ' + r for r in rows) if rows else '- nothing said yet')


def marker_rules(agent):
    lines = ['Markers (written, never spoken): end your goodbye reply with <end_call>.']
    goals = [g['id'] for g in agent.get('goals') or [] if g.get('id')]
    if goals: lines.append('When a goal is settled, add <goal:ID> at the end of that reply (IDs: ' + ', '.join(goals) + ').')
    from .tools import rules_line, specs
    http = specs(agent)
    tools = [t['name'] for t in agent.get('tools') or [] if t.get('name') not in ('end_call', 'transfer') and t.get('name') not in http]
    if tools: lines.append('To use a tool you were given, add <tool:NAME> (' + ', '.join(tools) + '); it runs after the call turn.')
    if http: lines.append(rules_line(agent))
    when = (agent.get('handOff') or {}).get('when') or []
    if when: lines.append('If the conversation needs a human (' + ', '.join(when) + '), add <handoff:REASON>.')
    return ' '.join(lines)


def tail(transcript, agent, contact, state):
    """The per-turn block that goes last: the ledger, the turn rules, the marker rules."""
    return ledger(transcript, agent, contact, state) + '\n\n' + LAST + '\n\n' + marker_rules(agent)
