# The reply door and caller signals for the runtime. The rules are the shared ones (product/shared/safety/rules.json,
# evaluated by vpvoice/rules.py exactly as product/shared/safety/index.ts does), so both doors are held to the same
# cases.json. This file adds only what needs call state the shared door does not have:
#   - RD1: the first breath of her first reply carries the AI clause (prefixed from agent.opening.disclosureClause);
#   - RD2: when the caller has just asked "aap AI ho?", her reply starts with the honest answer;
#   - RD3: in a crisis, until Tele-MANAS 14416 and 112 have been said, her reply is the crisis-support line.
#
#   reply_door(text, ctx)  ctx = DoorContext (runtime, with the extras) or a dict in the TS shape (the contract door)
#   caller_signals(text)   {'crisis', 'asksIfAi', 'refusesRecording', 'optOut', 'readingSensitiveDigits', 'wantsHuman'}
#   redact(text)           masks OTP / card / CVV / UPI PIN / Aadhaar spans ([OTP], [CARD], ...)
import re
from dataclasses import dataclass, field
from . import rules

caller_signals = rules.caller_signals
redact = rules.redact
CRISIS_LINES = ('14416', '112')


def has_ai_clause(text):
    return bool(rules.rx('@ai_clause').search(rules.normalise(text or '')))


def callback_requested(text):
    return bool(re.search(r"(baad mein|baad me|later|kal|shaam ko|subah)\s.{0,20}(call|phone|baat)|call back|callback"
                          r"|(बाद\s+में|कल|शाम\s+को|सुबह).{0,20}(कॉल|फ़ोन|फोन|बात)", text or '', re.I))


@dataclass
class DoorContext:
    category: str = 'service'
    sector_packs: list = field(default_factory=lambda: ['base'])
    brand: dict = field(default_factory=lambda: {'name': '', 'verifiedDomains': []})
    facts: list = field(default_factory=list)
    never_say: list = field(default_factory=list)
    disclosed: bool = False
    identity_verified: bool = False
    recording_refused: bool = False
    crisis: bool = False
    turn_index: int = 0
    job: str = ''
    # runtime-only state
    disclosure_clause: str = ''
    asked_ai: bool = False
    crisis_lines_given: bool = False
    contact_facts: dict = field(default_factory=dict)
    gender: str = 'female'
    first_sentence: bool = True

    def contract(self):
        """The TS DoorContext: per-contact facts join the facts with perContact = true."""
        facts = list(self.facts) + [{'key': k, 'value': str(v), 'purpose': 'service', 'source': 'contact', 'perContact': True}
                                    for k, v in (self.contact_facts or {}).items()]
        return {'category': self.category, 'sectorPacks': self.sector_packs or ['base'], 'brand': self.brand, 'facts': facts,
                'neverSay': self.never_say or [], 'disclosed': self.disclosed, 'identityVerified': self.identity_verified,
                'recordingRefused': self.recording_refused, 'crisis': self.crisis, 'turnIndex': self.turn_index, 'job': self.job}


def g(gender, female, male, neutral=None):
    return female if gender == 'female' else male if gender == 'male' else (neutral or female)


def _brand(ctx):
    b = ctx.brand if isinstance(ctx, DoorContext) else (ctx or {}).get('brand')
    return (b or {}).get('name', '')


def honest_line(ctx):
    return rules.safety_text('honest_ai', _brand(ctx) or 'is company')


def crisis_line(brand=''):
    return rules.safety_text('crisis_support', brand)


def stop_digits_line(brand=''):
    return rules.safety_text('stop_digits', brand)


def safe_fallback_line(gender='female'):
    return f"Ji, ye main pakka karke aapko {g(gender, 'batati', 'batata', 'batati')} hoon."


def reply_door(text, ctx):
    """Check one outgoing sentence before it is spoken."""
    if not isinstance(ctx, DoorContext):
        return rules.reply_door(text, ctx)            # the contract door, as the shared vectors define it
    t = (text or '').strip()
    if not t: return {'action': 'pass'}
    if ctx.crisis and not ctx.crisis_lines_given and not all(x in t for x in CRISIS_LINES):
        return {'action': 'replace', 'rule': 'RD3', 'text': crisis_line(_brand(ctx)), 'reason': 'crisis: Tele-MANAS 14416 and 112 first, and a human offered',
                'id': 'runtime.crisis_lines'}
    pre = None
    if ctx.first_sentence and ctx.asked_ai and not has_ai_clause(t):
        t = honest_line(ctx) + ' ' + t; pre = ('RD2', 'asked if she is an AI: the honest answer comes first', 'runtime.asked_ai')
    elif ctx.first_sentence and not ctx.disclosed and ctx.turn_index == 0 and not has_ai_clause(t):
        clause = (ctx.disclosure_clause or '').strip()
        if clause: t = f'{clause}, {t}'; pre = ('RD1', 'the first breath carries the AI clause', 'runtime.first_breath')
    c = ctx.contract()
    if has_ai_clause(t): c['disclosed'] = True       # said in this very breath
    v = rules.reply_door(t, c)
    if v['action'] == 'pass' and pre:
        return {'action': 'replace', 'rule': pre[0], 'text': t, 'reason': pre[1], 'id': pre[2]}
    return v
