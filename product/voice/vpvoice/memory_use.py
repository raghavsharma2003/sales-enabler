# Relational memory in the call, voice half (seam agreed with the memory module, open.2026-10-24.relational-memory-
# voice-half). The memory brief (ticket.contact.memoryBrief, compiled by memory: one group per line, prefix first:
# callback: / prefs: / open: / heard: / last: / personal:) is used under four rules:
#   1. identity gate: before the person is verified the brain sees only `prefs:` lines (configuration: language, pace);
#      an unknown or never-verified caller never gets the rest;
#   2. at most one thing from earlier calls per call, in passing, never in a turn that asks for something (a ledger
#      shape); once one of her turns reuses an item's words, the shape turns to "already used";
#   3. a caller who says not to remember (phrases.json forget / forgetAll) gets the brief dropped for the rest of the
#      call, a one-breath acknowledgement shape, and a 'forget_request' moment (note 'call' or 'all', never their words);
#   4. a volunteered personal, non-sensitive detail gets one ask-to-keep shape per call, never on collections,
#      complaint or no-marketing calls (memory's extraction checks the ask and the caller's yes).
# The phrase lists live in product/shared/memory/phrases.json (memory owns them; read as-is here, no copy to drift).
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))


def _load():
    for p in (os.environ.get('VP_MEMORY_PHRASES'), os.path.join(HERE, 'memory-phrases.json'), os.path.join(HERE, '..', '..', 'shared', 'memory', 'phrases.json')):
        if p and os.path.exists(p):
            with open(p, encoding='utf-8') as f: return json.load(f)
    raise FileNotFoundError('product/shared/memory/phrases.json not found (set VP_MEMORY_PHRASES)')


PHRASES = _load()
GROUPS = ('callback', 'prefs', 'open', 'heard', 'last', 'personal')
NO_KEEP_JOB = re.compile(r'collect|recover|overdue|dues|complain|grievance', re.I)
STOP = set('the a an and or of to for in on at is was were said ago days day weeks week months month hai ka ki ke ko se mein ne'.split())


def _has(text, key):
    t = (text or '').lower()
    return any(p in t for p in PHRASES.get(key) or [])


def groups(brief):
    out = {}
    for line in (brief or '').splitlines():
        m = re.match(r'\s*([a-z]+)\s*:\s*(.+)', line)
        if m and m.group(1) in GROUPS: out.setdefault(m.group(1), []).append(m.group(2).strip())
    return out


def prompt_block(brief, verified, forgotten):
    """What the brain may see of the brief now ('' for nothing)."""
    if forgotten or not brief: return ''
    if verified: return brief
    prefs = groups(brief).get('prefs') or []
    return '\n'.join('prefs: ' + p for p in prefs)


def items(brief):
    """The things she could bring up (everything but prefs and the dial's own callback reason)."""
    g = groups(brief)
    return [v for k in ('open', 'heard', 'last', 'personal') for v in g.get(k) or []]


def _words(s):
    return {w for w in re.findall(r'[a-zऀ-ॿ]{3,}', (s or '').lower()) if w not in STOP}


def used(her_text, brief):
    """True when her line reuses an item: a content word of its value (after =; 4+ letters), or two of its words. Errs
    toward "used" (a false hit only makes her mention earlier calls less)."""
    said = _words(her_text)
    for it in items(brief):
        it = re.sub(r'\(said[^)]*\)', '', it).replace('_', ' ')
        val = {w.rstrip("'s") for w in _words(it.split('=', 1)[1]) if len(w) >= 4} if '=' in it else set()
        if val & {w.rstrip("'s") for w in said} or len(_words(it) & said) >= 2: return True
    return False


def forget_kind(caller_text):
    if _has(caller_text, 'forgetAll'): return 'all'
    if _has(caller_text, 'forget'): return 'call'
    return None


def keep_ask_allowed(agent, no_marketing):
    return not no_marketing and not NO_KEEP_JOB.search((agent or {}).get('job') or '')


def personal_detail(caller_text, signals):
    """A volunteered personal, non-sensitive detail (personalCues, none of sensitiveCues, no safety signal)."""
    if not _has(caller_text, 'personalCues') or _has(caller_text, 'sensitiveCues'): return False
    return not any(signals.get(k) for k in ('crisis', 'readingSensitiveDigits', 'optOut'))


SHAPES = {
    'forget_ack': 'they asked you not to remember: say in one easy breath that you will not, then carry on with what they need; never bring up earlier calls again',
    'one_item': 'from earlier calls (the memory brief): at most one thing, in passing, only if it helps them now, never in a turn that asks for something, never say how you know',
    'used': 'earlier calls: already brought up once on this call; do not bring them up again',
    'keep_ask': 'they shared something personal: if it fits, ask once, lightly, whether you may remember it for next time; if they say no or hesitate, let it go',
}
