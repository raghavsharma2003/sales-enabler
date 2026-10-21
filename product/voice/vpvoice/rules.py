# The shared safety rules (product/shared/safety/rules.json), evaluated exactly as product/shared/safety/index.ts does:
# first reply rule that fires decides; scope predicates; the five builtins (links vs verified domains, per-contact fact
# leakage, neverSay, rupee amounts vs facts, digit runs with Luhn / Verhoeff). This is a line-by-line port: when
# index.ts changes semantics, change this file the same way. Both are held to cases.json (tests/test_safety_cases.py).
#
# Regex dialect: rules.json patterns are the common subset of ECMAScript 'iu' and Python re. JS \b, \w and \d are
# ASCII-only even with the u flag, so they compile here with re.ASCII (case folding then only matters for ASCII, and
# the text is lowercased by normalise() first).
import json, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
FLAGS = re.I | re.ASCII


def _rules_path():
    for p in (os.environ.get('VP_SAFETY_RULES'), os.path.join(HERE, 'rules.json'),
              os.path.join(HERE, '..', '..', 'shared', 'safety', 'rules.json')):
        if p and os.path.exists(p): return p
    raise FileNotFoundError('product/shared/safety/rules.json not found (set VP_SAFETY_RULES)')


with open(_rules_path(), encoding='utf-8') as _f:
    RULES = json.load(_f)
VERSION = RULES.get('version')


# ---------------------------------------------------------------- parity guard
# Every key and enum value this port understands. A rules.json carrying anything else means index.ts has new
# semantics this file does not have yet: refuse to load (CI breaks at import), never evaluate it partially.
KNOWN = {
    'top': {'schema', 'version', 'about', 'regex', 'texts', 'masks', 'lexicon', 'reply', 'caller', 'redact', 'lint', 'links',
            'normalisation', 'words_to_amounts'},
    'normalisation': {'about', 'steps', 'form', 'strip', 'fold', 'drop', 'space'},
    'words_to_amounts': {'about', 'units', 'multipliers'},
    'regex': {'dialect', 'normalise', 'clause_split', 'clause_scope', 'back_reference'},
    'reply': {'id', 'rule', 'kind', 'action', 'replacement', 'reason', 'scope', 'any', 'all', 'none', 'noneClause', 'anchor', 'coClause', 'check', 'about', 'note'},
    'caller': {'id', 'signal', 'any', 'all', 'none', 'noneClause', 'builtin', 'context', 'about', 'note'},
    'scope': {'packs', 'categories', 'when', 'join'},
    'when': {'crisis', 'undisclosed', 'unverified', 'recordingRefused', 'dues'},
    'action': {'block', 'replace'},
    'builtin': {'links', 'per_contact_facts', 'never_say', 'amounts'},
    'caller_builtin': {'sensitive_digits'},
    'signal': {'crisis', 'asksIfAi', 'refusesRecording', 'optOut', 'readingSensitiveDigits', 'wantsHuman'},
    'redact': {'about', 'digit_token', 'words_to_digits', 'context_window_chars', 'kinds', 'not_secret_code'},
    'redact_kind': {'kind', 'context', 'minDigits', 'maxDigits', 'about'},
    'masks': {'otp', 'card', 'cvv', 'upi_pin', 'aadhaar'},
    'lint': {'T-L1', 'T-L2', 'T-L3', 'T-L4'},
    'T-L1': {'about', 'any', 'none', 'never_say_hides_ai', 'disclosure_clause_requires'},
    'T-L2': {'about', 'categories', 'dropPurposes'},
    'T-L3': {'about', 'allowedPurposes', 'offerLanguage'},
    'T-L4': {'about', 'shorteners'},
    'links': {'pattern', 'about'},
}


class RulesSchemaError(Exception):
    pass


def check_schema(r):
    """Raise on any key or value this port does not understand (see KNOWN)."""
    bad = []
    def keys(obj, kind, where):
        extra = set(obj) - KNOWN[kind]
        if extra: bad.append(f'{where}: {sorted(extra)}')
    if r.get('schema') != 1: bad.append(f"schema {r.get('schema')!r} (this port reads 1)")
    keys(r, 'top', 'rules.json'); keys(r.get('regex', {}), 'regex', 'regex'); keys(r.get('masks', {}), 'masks', 'masks')
    keys(r.get('normalisation', {}), 'normalisation', 'normalisation'); keys(r.get('words_to_amounts', {}), 'words_to_amounts', 'words_to_amounts')
    if r.get('normalisation', {}).get('form') not in (None, 'NFC', 'NFD', 'NFKC', 'NFKD'): bad.append(f"normalisation.form {r['normalisation']['form']!r}")
    keys(r.get('redact', {}), 'redact', 'redact'); keys(r.get('lint', {}), 'lint', 'lint'); keys(r.get('links', {}), 'links', 'links')
    for k in (r.get('redact', {}).get('kinds') or []):
        keys(k, 'redact_kind', f"redact.kinds[{k.get('kind')}]")
        if k.get('kind') not in KNOWN['masks']: bad.append(f"redact kind {k.get('kind')!r}")
    for name in KNOWN['lint'] & set(r.get('lint', {})): keys(r['lint'][name], name, f'lint.{name}')
    for x in r.get('reply') or []:
        keys(x, 'reply', f"reply[{x.get('id')}]")
        if x.get('action') not in KNOWN['action']: bad.append(f"reply[{x.get('id')}].action {x.get('action')!r}")
        if str(x.get('kind', '')).startswith('builtin:') and x['kind'][8:] not in KNOWN['builtin']: bad.append(f"reply[{x.get('id')}] {x['kind']}")
        if x.get('replacement') and x['replacement'] not in (r.get('texts') or {}): bad.append(f"reply[{x.get('id')}] replacement {x['replacement']!r}")
        sc = x.get('scope') or {}
        keys(sc, 'scope', f"reply[{x.get('id')}].scope")
        if sc.get('when') and sc['when'] not in KNOWN['when']: bad.append(f"reply[{x.get('id')}].scope.when {sc['when']!r}")
        if sc.get('join') not in (None, 'and', 'or'): bad.append(f"reply[{x.get('id')}].scope.join {sc['join']!r}")
    for x in r.get('caller') or []:
        keys(x, 'caller', f"caller[{x.get('id')}]")
        if x.get('signal') not in KNOWN['signal']: bad.append(f"caller[{x.get('id')}].signal {x.get('signal')!r}")
        if x.get('builtin') and x['builtin'] not in KNOWN['caller_builtin']: bad.append(f"caller[{x.get('id')}].builtin {x['builtin']!r}")
    if bad:
        raise RulesSchemaError('rules.json has semantics vpvoice/rules.py does not implement (port them from '
                               'product/shared/safety/index.ts first): ' + '; '.join(bad))


check_schema(RULES)


def fold_devanagari(s):
    return unicodedata.normalize('NFC', s).replace('ँ', 'ं').replace('़', '')


_NORM = None


def _norm():
    """rules.json normalisation compiled once: code-point ranges become character classes."""
    global _NORM
    if _NORM is None:
        N = RULES['normalisation']
        def cls(ranges):
            return re.compile('[' + ''.join('-'.join(chr(int(h, 16)) for h in r.split('-')) for r in ranges).replace('\\', '\\\\').replace(']', '\\]').replace('^', '\\^') + ']')
        keys = ''.join(re.escape(k) for k in N['fold'])
        _NORM = {'form': N['form'], 'strip': cls(N['strip']), 'fold': N['fold'], 'fold_re': re.compile('[' + keys + ']'),
                 'drop': cls(N['drop']), 'space': cls(N['space'])}
    return _NORM


def normalise(text):
    """The one normalisation both doors apply (rules.json normalisation): form, strip, lower, fold, drop, digits, space."""
    n = _norm()
    t = n['strip'].sub('', unicodedata.normalize(n['form'], text or '')).lower()
    t = n['drop'].sub('', n['fold_re'].sub(lambda m: n['fold'][m.group(0)], t))
    t = re.sub('[\u0966-\u096F]', lambda m: str(ord(m.group(0)) - 0x0966), t)
    return re.sub(' {2,}', ' ', n['space'].sub(' ', t)).strip()


def fold_for_digits(text):
    """The case-preserving part (form, strip, spaces as U+0020): digit runs and redaction read this, so fullwidth digits,
    no-break or thin spaces and invisible characters cannot split or hide a number."""
    n = _norm()
    return n['space'].sub(' ', n['strip'].sub('', unicodedata.normalize(n['form'], text or '')))


def expand_lexicon(p):
    """'@name' expands to the lexicon entry, recursively, up to 5 levels (as index.ts expandLexicon)."""
    for _ in range(5):
        if not re.search('@[a-z_]+', p): break
        p = re.sub('@([a-z_]+)', lambda m: RULES['lexicon'].get(m.group(1), m.group(0)), p)
    return p


_CACHE = {}


def rx(pattern, brand=''):
    key = (brand, pattern)
    r = _CACHE.get(key)
    if r is None:
        src = fold_devanagari(expand_lexicon(pattern))
        src = src.replace('{brand}', re.escape(normalise(brand)) if brand else '(?!x)x')
        r = re.compile(src, FLAGS); _CACHE[key] = r
    return r


def fires(r, t, brand=''):
    if r.get('all') and not all(rx(p, brand).search(t) for p in r['all']): return False
    if r.get('any') and not any(rx(p, brand).search(t) for p in r['any']): return False
    if not r.get('all') and not r.get('any'): return False
    if r.get('none') and any(rx(p, brand).search(t) for p in r['none']): return False     # sentence-wide exemptions
    if not r.get('noneClause') and not r.get('coClause'): return True
    # clause-scoped exemptions (negations) shield only the clause that holds the anchor match
    def shielded(c): return any(rx(p, brand).search(c) for p in r.get('noneClause') or [])
    anchors = [r['all'][r['anchor'] if r.get('anchor') is not None else len(r['all']) - 1]] if r.get('all') else r['any']
    for p in anchors:
        for m in rx(p, brand).finditer(t):
            clause = clause_at(t, m.start(), m.end())
            if r.get('noneClause') and shielded(clause): continue
            # coClause: every all-group must sit in the anchor's clause; a back-reference lets the previous clause count
            if r.get('coClause') and r.get('all') and not all(rx(q, brand).search(clause) for q in r['all']):
                back = clause_before(t, m.start()) if rx(RULES['regex']['back_reference']).search(clause) else ''
                if not back or (r.get('noneClause') and shielded(back)) or not all(rx(q, brand).search(back + ' ' + clause) for q in r['all']):
                    continue
            return True
    return False


def clause_before(t, i):
    """The clause just before the one holding index i, walking back over tiny segments (", bas", ", aur")."""
    cuts = [(m.start(), m.end()) for m in rx(RULES['regex']['clause_split']).finditer(t) if m.end() <= i]
    for k in range(len(cuts) - 1, -1, -1):
        seg = t[cuts[k - 1][1] if k > 0 else 0:cuts[k][0]]
        if len(seg.strip()) >= 12 or k == 0: return seg
    return ''


def clause_at(t, start, end):
    """The clause around [start, end), bounded by regex.clause_split; a segment under 12 characters just before it
    ("never,", "kabhi bhi,") binds to the clause it introduces."""
    cuts = [(m.start(), m.end()) for m in rx(RULES['regex']['clause_split']).finditer(t)]
    before = [c for c in cuts if c[1] <= start]
    frm = before[-1][1] if before else 0
    prev = before[-2][1] if len(before) >= 2 else 0
    if before and len(t[prev:before[-1][0]].strip()) < 12: frm = prev
    after = next((c for c in cuts if c[0] >= end), None)
    return t[frm:after[0] if after else len(t)]


_RUN3 = re.compile(r'[0-9\u0966-\u096F](?:[\s-]?[0-9\u0966-\u096F]){2,}')


def local_prefix(lower, i, n=30):
    """Up to n characters before i, cut after the last run of 3+ digits, so another number's context does not leak."""
    pre = lower[max(0, i - n):i]
    ms = list(_RUN3.finditer(pre))
    return pre[ms[-1].end():] if ms else pre


# ---------------------------------------------------------------- reply door
def _get(ctx, k, d=None):
    return ctx.get(k, d) if isinstance(ctx, dict) else getattr(ctx, k, d)


def is_dues_call(ctx):
    if _get(ctx, 'job') == 'payment_reminder': return True
    k = rx(RULES['lexicon']['dues_fact_key'])
    return any(k.search(f.get('key', '')) for f in _get(ctx, 'facts') or [])


def in_scope(s, ctx):
    if not s: return True
    checks = []
    if s.get('packs'): checks.append(any(p in (_get(ctx, 'sectorPacks') or []) for p in s['packs']))
    if s.get('categories'): checks.append(_get(ctx, 'category') in s['categories'])
    if s.get('when'):
        checks.append({'crisis': bool(_get(ctx, 'crisis')), 'undisclosed': not _get(ctx, 'disclosed'), 'unverified': not _get(ctx, 'identityVerified'),
                       'recordingRefused': bool(_get(ctx, 'recordingRefused')), 'dues': is_dues_call(ctx)}[s['when']])
    return any(checks) if s.get('join') == 'or' else all(checks)


def safety_text(key, brand):
    t = RULES['texts'].get(key)
    if t is None: raise KeyError(f'rules.json has no text "{key}"')
    return t.replace('{brand}', brand)


def reply_door(text, ctx, only=None):
    """ctx uses the TS field names (category, sectorPacks, brand, facts, neverSay, disclosed, identityVerified,
    recordingRefused, crisis, turnIndex, job). only: evaluate just these rule ids (e.g. {'RD2'}); the runtime uses it to
    ask "is this a denial?" without other rules answering first. None = the contract door."""
    t = normalise(text)
    if not t: return {'action': 'pass'}
    brand = (_get(ctx, 'brand') or {}).get('name', '')
    for r in RULES['reply']:
        if only is not None and r['rule'] not in only: continue
        if not in_scope(r.get('scope'), ctx): continue
        hit = builtin(r['kind'][8:], text, t, ctx) if r['kind'].startswith('builtin:') else fires(r, t, brand)
        if not hit: continue
        reason = f"{r['reason']}: {hit}" if isinstance(hit, str) else r['reason']
        if r['action'] == 'replace' and r.get('replacement'):
            return {'action': 'replace', 'rule': r['rule'], 'text': safety_text(r['replacement'], brand), 'reason': reason, 'id': r['id']}
        return {'action': 'block', 'rule': r['rule'], 'reason': reason, 'id': r['id']}
    return {'action': 'pass'}


def builtin(name, raw, t, ctx):
    if name == 'links':
        bad = next((h for h in find_links(raw) if not host_verified(h, (_get(ctx, 'brand') or {}).get('verifiedDomains') or [])), None)
        return f'host {bad}' if bad else False
    if name == 'per_contact_facts':
        for f in _get(ctx, 'facts') or []:
            if not f.get('perContact') or f.get('purpose') == 'identity': continue
            v = normalise(str(f.get('value', '')))
            if len(v) < 3: continue
            if v in t: return f"fact {f.get('key')}"
            # compare digits, not spellings: "₹18,450" in the facts and "18450" or "18,450" in speech are the same figure
            digits = re.sub('[\u0966-\u096F]', lambda m: str(ord(m.group(0)) - 0x0966), re.sub('[^0-9\u0966-\u096F]', '', str(f.get('value', ''))))
            if len(digits) >= 3 and any(r['digits'] == digits or r['digits'].lstrip('0') == digits for r in digit_runs(raw)): return f"fact {f.get('key')}"
            amt = parse_amounts(str(f.get('value', '')), True)
            if amt and any(a in amt for a in parse_amounts(raw, True)): return f"fact {f.get('key')}"
        return False
    if name == 'never_say':
        for p in _get(ctx, 'neverSay') or []:
            n = normalise(p)
            if not n: continue
            latin = re.fullmatch(r"[a-z0-9 '.-]+", n) is not None
            if (rx('(^|[^a-z0-9])' + re.escape(n) + '([^a-z0-9]|$)').search(t) if latin else n in t): return 'listed phrase'
        return False
    if name == 'amounts':
        allowed = {a for f in _get(ctx, 'facts') or [] for a in parse_amounts(str(f.get('value', '')), True)}
        stray = next((a for a in amounts_in(raw) if a not in allowed), None)
        return f'amount {stray}' if stray is not None else False
    raise ValueError(f'unknown builtin {name}')


_AMOUNT = None


def amount_tables():
    """Multipliers and spoken number words from rules.json words_to_amounts (shared with index.ts)."""
    global _AMOUNT
    if _AMOUNT is None:
        W = RULES['words_to_amounts']
        def alt(keys):
            return '|'.join((r'\b' + k + r'\b') if re.fullmatch('[a-z]+', k) else ('(?<![\u0900-\u097F])' + k + '(?![\u0900-\u097F])')
                            for k in sorted(keys, key=len, reverse=True))
        m, u = alt(W['multipliers']), alt(W['units'])
        _AMOUNT = {'mult': W['multipliers'],
                   'num': re.compile(r'(\d[\d,]*(?:\.\d+)?)(?:\s*(' + m + '))?', FLAGS),
                   'spoken': re.compile(r'((?:' + u + r')(?:\s+(?:' + u + r'))*)\s*(?=(?:' + m + '))', FLAGS)}
    return _AMOUNT


def spoken_to_digits(t):
    """'paanch hazaar' -> '5 hazaar': number words before a multiplier become digits (the multiplier stays)."""
    units = RULES['words_to_amounts']['units']
    def rep(mm):
        run = mm.group(0); v = sum(units.get(w, 0) for w in run.strip().split())
        return f'{v} ' if v else run
    return amount_tables()['spoken'].sub(rep, t)


MONEY_TALK = re.compile(r'(premium|emi|amount|payment|pay\b|fee|fees|price|bill|due|kimat|keemat|charge|refund|cashback|bonus|prize|reward|cover|sum assured|salary|income|return|profit|munafa|balance|loan|rent|kiraya|deposit|bhugtan|bakaya|kisht|installment|paise|paisa)', re.I | re.ASCII)


def _js_round(x):
    import math
    return int(math.floor(x + 0.5))


def parse_amounts(s, lenient):
    t = spoken_to_digits(normalise(s)); out = []
    tables = amount_tables(); MULT = tables['mult']; NUM = tables['num']
    cur = rx(RULES['lexicon']['currency'])
    money_talk = lenient or bool(MONEY_TALK.search(t))
    parts = []
    for m in NUM.finditer(t):
        try: base = float(m.group(1).replace(',', ''))
        except ValueError: continue
        u = m.group(2)
        unit = (MULT.get(u, 1) or 1) if u else 1
        start = m.start(); value = base * unit
        prev = parts[-1] if parts else None
        if prev and prev['unit'] > 1 and value < prev['unit'] and re.fullmatch(r'\s*(aur |and )?', t[prev['end']:start]):
            prev['value'] += value; prev['end'] = start + len(m.group(0)); prev['unit'] = unit; continue
        parts.append({'value': value, 'unit': unit, 'start': start, 'end': start + len(m.group(0)), 'm': m})
    for p in parts:
        if p['value'] == 0: continue
        before = t[max(0, p['start'] - 6):p['start']]; after = t[p['end']:p['end'] + 14]
        marked = bool(re.search(r'(₹|rs\.?|inr)\s*$', before) or re.match(r'\s*(₹|rs\b|inr\b|rupe|rupa|रुपय|रुपए|रुपये)', after, re.ASCII))
        multiplied = bool(p['m'].group(2))
        if lenient or marked or (multiplied and money_talk) or (multiplied and cur.search(after)): out.append(_js_round(p['value']))
    return out


def amounts_in(text): return parse_amounts(text, False)


def find_links(text):
    t = normalise(text)
    t = re.sub(r'[^\s@]+@[^\s@]+\.[a-z]{2,}', ' ', t); t = re.sub(r'\s+dot\s+', '.', t); t = re.sub(r'\s+slash\s+', '/', t)
    out = []
    for m in rx(RULES['links']['pattern']).finditer(t):
        host = re.split(r'[/?#]', re.sub(r'^https?://', '', m.group(0)))[0]
        host = re.sub(r'^www\.', '', host); host = re.sub(r'\.$', '', host)
        out.append(host)
    return out


def host_verified(host, verified):
    if any(host == s or host.endswith('.' + s) for s in RULES['lint']['T-L4']['shorteners']): return False
    for d in verified or []:
        v = re.sub(r'/.*$', '', re.sub(r'^www\.', '', re.sub(r'^https?://', '', d.lower())))
        if v and (host == v or host.endswith('.' + v)): return True
    return False


# ---------------------------------------------------------------- caller signals
SIGNALS = ('crisis', 'asksIfAi', 'refusesRecording', 'optOut', 'readingSensitiveDigits', 'wantsHuman')


def caller_signals(text):
    s = {k: False for k in SIGNALS}
    t = normalise(text)
    if not t: return s
    for r in RULES['caller']:
        if s[r['signal']]: continue
        s[r['signal']] = sensitive_digits(fold_for_digits(text), t, r) if r.get('builtin') == 'sensitive_digits' else fires(r, t)
    return s


def sensitive_digits(raw, t, r):
    lower = raw.lower()
    for run in digit_runs(raw):
        n = len(run['digits'])
        # context and exemptions are read next to this run only, so a pin code elsewhere cannot hide a PIN
        local = normalise(local_prefix(lower, run['start']) + lower[run['start']:min(len(lower), run['end'] + 25)])
        if r.get('none') and any(rx(p).search(local) for p in r['none']): continue
        if r.get('context') and n >= 3 and rx(r['context']).search(
                normalise(local_prefix(lower, run['start'], 60) + ' ' + lower[run['end']:run['end'] + 25])): return True
        if n >= 12 and not looks_like_phone(run['digits']): return True
        if 13 <= n <= 19 and luhn(run['digits']): return True
    return False


def looks_like_phone(d):
    return (len(d) == 12 and re.match(r'91[6-9]', d) is not None) or (len(d) == 11 and re.match(r'0[6-9]', d) is not None)


# ---------------------------------------------------------------- redaction
_RUN = None


def digit_runs(text):
    global _RUN
    w2d = RULES['redact']['words_to_digits']
    if _RUN is None:
        keys = sorted(w2d, key=len, reverse=True)
        latin = '|'.join(k for k in keys if re.fullmatch('[a-z]+', k))
        deva = '|'.join(k for k in keys if not re.fullmatch('[a-z]+', k))
        tok = (f'(?:[0-9०-९]|\\b(?:{latin})\\b|(?<![ऀ-ॣ॰-ॿ])(?:{deva})(?![ऀ-ॣ॰-ॿ]))')
        _RUN = re.compile(f'{tok}(?:[\\s\\-–.,]{{0,3}}{tok})*', FLAGS)
    out = []
    for m in _RUN.finditer(text):
        toks = re.findall('[0-9०-९]|[a-z]+|[ऀ-ॣ॰-ॿ]+', m.group(0).lower())
        digits = ''.join(x if x.isascii() and x.isdigit() else str(ord(x) - 0x0966) if '०' <= x <= '९' else w2d.get(x, '') for x in toks)
        if not re.search('[0-9०-९]', m.group(0)) and len(digits) < 3: continue
        out.append({'start': m.start(), 'end': m.end(), 'digits': digits})
    return out


def redact(text):
    if not text: return text
    text = fold_for_digits(text)
    w = RULES['redact']['context_window_chars']; lower = text.lower(); spans = []
    not_secret = rx(RULES['redact']['not_secret_code'])
    for run in digit_runs(text):
        n = len(run['digits'])
        near = local_prefix(lower, run['start'], w) + lower[run['start']:min(len(lower), run['end'] + w)]
        before = local_prefix(lower, run['start'], 20)
        kind = None
        for k in RULES['redact']['kinds']:
            if n < k['minDigits'] or n > k['maxDigits']: continue
            if k['kind'] in ('otp', 'upi_pin') and not_secret.search(before): continue
            if rx(k['context']).search(near): kind = k['kind']; break
        if not kind and 13 <= n <= 19 and luhn(run['digits']): kind = 'card'
        if not kind and n == 12 and not looks_like_phone(run['digits']) and re.match('[2-9]', run['digits']) and verhoeff(run['digits']): kind = 'aadhaar'
        if kind: spans.append((run['start'], run['end'], RULES['masks'][kind]))
    out = text
    for s, e, mask in sorted(spans, reverse=True): out = out[:s] + mask + out[e:]
    return out


def luhn(digits):
    if not re.fullmatch(r'\d{2,}', digits, re.ASCII): return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9: d -= 9
        total += d
    return total % 10 == 0


VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]


def verhoeff(digits):
    if not re.fullmatch(r'\d+', digits, re.ASCII): return False
    c = 0
    for i, d in enumerate(int(x) for x in reversed(digits)): c = VD[c][VP[i % 8][d]]
    return c == 0


# ---------------------------------------------------------------- compile lints (the runtime does not publish agents;
# ported so the shared vectors run end to end on both doors)
SKIP_PATHS = {'agentId', 'versionHash', 'voice.stackId', 'voice.voiceId'}


def _strings(v, path):
    if isinstance(v, str):
        if path not in SKIP_PATHS: yield path, v
    elif isinstance(v, list):
        for i, x in enumerate(v): yield from _strings(x, f'{path}[{i}]')
    elif isinstance(v, dict):
        for k, x in v.items():
            p = f'{path}.{k}' if path else k
            if p == 'brand.verifiedDomains': continue
            yield from _strings(x, p)


def lint_agent_config(cfg):
    out = []; L = RULES['lint']
    for path, s in _strings(cfg, ''):
        t = normalise(s)
        if path.startswith('neverSay'):
            if rx(L['T-L1']['never_say_hides_ai']).search(t):
                out.append({'rule': 'T-L1', 'path': path, 'message': 'neverSay would stop her saying she is an AI', 'effect': 'refuse'})
            continue
        if fires(L['T-L1'], t):
            out.append({'rule': 'T-L1', 'path': path, 'message': 'tells the agent to claim to be human or hide being an AI', 'effect': 'refuse'})
    clause = (cfg.get('opening') or {}).get('disclosureClause', '') or ''
    if not rx(L['T-L1']['disclosure_clause_requires']).search(normalise(clause)):
        out.append({'rule': 'T-L1', 'path': 'opening.disclosureClause', 'message': 'the disclosure clause must say she is an AI', 'effect': 'refuse'})
    offerish = rx(L['T-L3']['offerLanguage'])
    for i, f in enumerate(cfg.get('facts') or []):
        path = f'facts[{i}]'; cat = cfg.get('category')
        if cat in L['T-L2']['categories'] and f.get('purpose') in L['T-L2']['dropPurposes']:
            out.append({'rule': 'T-L2', 'path': path, 'message': 'offer fact dropped', 'effect': 'drop'}); continue
        if f.get('purpose') not in (L['T-L3']['allowedPurposes'].get(cat) or []):
            out.append({'rule': 'T-L3', 'path': path, 'message': 'fact purpose not allowed on this call', 'effect': 'drop'}); continue
        if cat in L['T-L2']['categories'] and f.get('purpose') != 'offer' and offerish.search(normalise(f"{f.get('key', '').replace('_', ' ')} {f.get('value', '')}")):
            out.append({'rule': 'T-L3', 'path': path, 'message': 'fact reads as an offer', 'effect': 'drop'})
    verified = (cfg.get('brand') or {}).get('verifiedDomains') or []
    for path, s in _strings(cfg, ''):
        for host in find_links(s):
            if not host_verified(host, verified):
                out.append({'rule': 'T-L4', 'path': path, 'message': f'link to {host} is not on a verified domain', 'effect': 'refuse'})
    for i, d in enumerate(verified):
        if any(d.lower() == s for s in L['T-L4']['shorteners']):
            out.append({'rule': 'T-L4', 'path': f'brand.verifiedDomains[{i}]', 'message': f'{d} is a link shortener', 'effect': 'refuse'})
    return out
