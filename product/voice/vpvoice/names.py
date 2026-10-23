# The contact's name in both scripts, and the guard that she never calls them by anyone else's name. Plain string
# work, no model call. Staging 2026-10-23: one opening asked for "अक्षरा जी" when the contact was Asha; a "haan" to
# that question would have counted as identity confirmed (RD11), so a wrong name is an identity defect, not only a
# courtesy one.
#
# Transliteration here is a rule-based approximation for Indian personal names (enough for the brief's hint and for
# matching), not a general transliterator. Matching compares a script-neutral skeleton (first letter + consonants), so
# "Asha", "Aasha", "आशा" and "Ashaji" all match and "अक्षरा" does not.
import re

DEVA = re.compile(r'[ऀ-ॿ]')

# Roman -> Devanagari, longest first. Consonants are bare (inherent a); vowels are (independent, matra).
_CONS = [('ksh', 'क्ष'), ('chh', 'छ'), ('kh', 'ख'), ('gh', 'घ'), ('ch', 'च'), ('jh', 'झ'), ('th', 'थ'), ('dh', 'ध'), ('ph', 'फ'),
         ('bh', 'भ'), ('sh', 'श'), ('k', 'क'), ('g', 'ग'), ('c', 'क'), ('j', 'ज'), ('t', 'त'), ('d', 'द'), ('n', 'न'), ('p', 'प'),
         ('b', 'ब'), ('m', 'म'), ('y', 'य'), ('r', 'र'), ('l', 'ल'), ('v', 'व'), ('w', 'व'), ('s', 'स'), ('h', 'ह'), ('f', 'फ़'),
         ('z', 'ज़'), ('q', 'क'), ('x', 'क्स')]
_VOW = [('aa', 'आ', 'ा'), ('ai', 'ऐ', 'ै'), ('au', 'औ', 'ौ'), ('ee', 'ई', 'ी'), ('ii', 'ई', 'ी'), ('oo', 'ऊ', 'ू'), ('uu', 'ऊ', 'ू'),
        ('a', 'अ', ''), ('i', 'इ', 'ि'), ('u', 'उ', 'ु'), ('e', 'ए', 'े'), ('o', 'ओ', 'ो')]
VIRAMA = '्'


# Common names whose spelling the rules get wrong (a long first "A", a long "aa" written "a"): exact forms
KNOWN = {'asha': 'आशा', 'aarti': 'आरती', 'arti': 'आरती', 'akash': 'आकाश', 'aakash': 'आकाश', 'anand': 'आनंद', 'aditya': 'आदित्य',
         'rahul': 'राहुल', 'rajesh': 'राजेश', 'raj': 'राज', 'ramesh': 'रमेश', 'suresh': 'सुरेश', 'mahesh': 'महेश', 'ganesh': 'गणेश',
         'kavita': 'कविता', 'sunita': 'सुनीता', 'anita': 'अनीता', 'geeta': 'गीता', 'gita': 'गीता', 'seema': 'सीमा', 'meena': 'मीना',
         'pooja': 'पूजा', 'puja': 'पूजा', 'neha': 'नेहा', 'priya': 'प्रिया', 'riya': 'रिया', 'kumar': 'कुमार', 'verma': 'वर्मा',
         'sharma': 'शर्मा', 'gupta': 'गुप्ता', 'singh': 'सिंह', 'patel': 'पटेल', 'shah': 'शाह', 'jain': 'जैन', 'mehta': 'मेहता',
         'yadav': 'यादव', 'rao': 'राव', 'reddy': 'रेड्डी', 'nair': 'नायर', 'iyer': 'अय्यर', 'das': 'दास', 'khan': 'ख़ान', 'mishra': 'मिश्रा',
         'tiwari': 'तिवारी', 'pandey': 'पांडे', 'joshi': 'जोशी', 'kapoor': 'कपूर', 'malhotra': 'मल्होत्रा', 'chauhan': 'चौहान',
         'vikram': 'विक्रम', 'amit': 'अमित', 'anil': 'अनिल', 'sanjay': 'संजय', 'deepak': 'दीपक', 'manoj': 'मनोज', 'vijay': 'विजय',
         'lakshmi': 'लक्ष्मी', 'radha': 'राधा', 'sita': 'सीता', 'savita': 'सविता', 'rekha': 'रेखा', 'usha': 'उषा', 'nisha': 'निशा'}


def to_devanagari(name):
    out = []
    for word in (name or '').split():
        if word.lower() in KNOWN: out.append(KNOWN[word.lower()]); continue
        w = word.lower(); i = 0; s = ''; after_cons = False
        while i < len(w):
            v = next((x for x in _VOW if w.startswith(x[0], i)), None)
            if v:
                i += len(v[0])
                if after_cons:
                    s += 'ा' if v[0] == 'a' and i == len(w) else v[2]      # a final "a" is long in names: Asha -> आशा
                else:
                    s += v[1]
                after_cons = False; continue
            c = next((x for x in _CONS if w.startswith(x[0], i)), None)
            if not c: i += 1; continue                                     # not a letter we know: dropped
            if after_cons: s += VIRAMA                                     # a cluster: Priya -> प्रिया
            s += c[1]; i += len(c[0]); after_cons = True
        out.append(s)
    return ' '.join(x for x in out if x)


# Devanagari -> Roman (for matching and for writing the name into Roman text)
_D_CONS = {'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th',
           'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh',
           'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h'}
_D_VOW = {'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'}
_D_MAT = {'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o'}


def to_roman(name):
    out = []
    for word in (name or '').split():
        s = ''; pend = False
        for ch in word:
            if ch in _D_CONS:
                if pend: s += 'a'
                s += _D_CONS[ch]; pend = True
            elif ch in _D_MAT: s += _D_MAT[ch]; pend = False
            elif ch == VIRAMA: pend = False
            elif ch in _D_VOW: s += _D_VOW[ch]; pend = False
            elif ch in 'ंँ': s += 'n'
            elif ch == 'ः': s += 'h'
            elif ch == '़': pass
            elif ch.isascii() and ch.isalpha(): s += ch.lower()
        out.append(s)                                                     # a final inherent a is dropped (Rahul, not Rahula)
    return ' '.join(x for x in out if x)


def key(word):
    """Script-neutral skeleton of one name word: its first letter (any vowel as 'a') and its consonants."""
    w = to_roman(word) if DEVA.search(word or '') else (word or '').lower()
    w = re.sub(r'[^a-z]', '', w)
    w = w.replace('ksh', 'ks').replace('x', 'ks').replace('q', 'k').replace('w', 'v').replace('z', 'j').replace('f', 'p')
    w = re.sub(r'(?<=[bcdgjklmnprstv])h', '', w)                         # aspirates and sh/ch: kh->k, sh->s, ph->p
    if not w: return ''
    head = 'a' if w[0] in 'aeiou' else w[0]
    return re.sub(r'(.)\1+', r'\1', head + re.sub(r'[aeiou]', '', w[1:]))


def forms(display_name):
    """The contact's name as the brief gives it: (roman, devanagari)."""
    n = (display_name or '').strip()
    if not n: return '', ''
    return (to_roman(n).title(), n) if DEVA.search(n) else (n, to_devanagari(n))


# Words that come before "ji" / "जी" or after a greeting and are not a name
NOT_NAMES = {
    'haan', 'han', 'ha', 'haa', 'achha', 'acha', 'accha', 'theek', 'thik', 'sahi', 'bilkul', 'shukriya', 'dhanyavaad', 'dhanyawad',
    'namaste', 'namaskar', 'sir', 'madam', 'maam', 'mam', 'bhai', 'bhaiya', 'didi', 'aunty', 'uncle', 'beta', 'aap', 'aapse', 'mata', 'pita',
    'bas', 'are', 'arre', 'ok', 'okay', 'jee', 'ji', 'aur', 'to', 'toh', 'hello', 'hi', 'please', 'sorry', 'bataiye', 'boliye', 'suniye',
    'main', 'mai', 'mein', 'hum', 'ham', 'yeh', 'ye', 'woh', 'vo', 'kya', 'kaun', 'ek', 'abhi', 'nahi', 'nahin', 'good', 'morning', 'evening',
    'afternoon', 'dear', 'guru', 'babu', 'saheb', 'sahab', 'shri', 'shrimati', 'mr', 'mrs', 'ms', 'miss', 'dr',
    'हाँ', 'हां', 'हा', 'अच्छा', 'ठीक', 'सही', 'बिल्कुल', 'बिलकुल', 'शुक्रिया', 'धन्यवाद', 'नमस्ते', 'नमस्कार', 'सर', 'मैडम', 'भाई', 'भैया',
    'दीदी', 'आंटी', 'अंकल', 'बेटा', 'आप', 'आपसे', 'माता', 'पिता', 'बस', 'अरे', 'ओके', 'जी', 'और', 'तो', 'हैलो', 'हेलो', 'प्लीज़', 'सॉरी',
    'बताइए', 'बोलिए', 'सुनिए', 'मैं', 'हम', 'यह', 'ये', 'वो', 'वह', 'क्या', 'कौन', 'एक', 'अभी', 'नहीं', 'गुड', 'मॉर्निंग', 'श्री', 'श्रीमती',
    'डॉक्टर', 'साहब', 'साहेब'}
DW = '[ऀ-ॣ०-ॿ]'                                     # Devanagari letters, not the danda
W = r'(\b[A-Za-z]+|' + DW + '+)'
END = r'(?=[\s,।.?!]|$)'
ADDRESS = [
    re.compile(r'(\b[A-Za-z]+)\s+ji' + END + '|(' + DW + r'+?)\s*जी' + END, re.I),         # "Asha ji", "आशा जी", "आशाजी"
    re.compile(r'(?:क्या\s+मैं|kya\s+(?:main|mai|mein))\s+' + W + r'(?:\s+' + W + r')?\s+(?:(?:जी|ji)\s+)?(?:से|se)\s+(?:बात|baat)', re.I),
    re.compile(r'(?:नमस्ते|नमस्कार|namaste|namaskar|hello|हैलो|हेलो)\s+' + W + END, re.I),       # "Namaste Asha," (not "Namaste, main")
]


def addressed(text):
    """(start, end, [words]) for each name she addresses the person by in this sentence ("Asha Verma" is one)."""
    out = {}
    for rx in ADDRESS:
        for m in rx.finditer(text or ''):
            gs = [g for g in range(1, (m.lastindex or 0) + 1) if m.group(g) and m.group(g).lower() not in NOT_NAMES]
            if not gs: continue
            out.setdefault((m.start(gs[0]), m.end(gs[-1])), [m.group(g) for g in gs])
    spans = sorted(out.items(), key=lambda x: (x[0][0], -x[0][1])); keep = []
    for (s, e), ws in spans:                                  # overlapping finds ("आशाजी" and "आशा"): the outer one
        if keep and s < keep[-1][1]: continue
        keep.append((s, e, ws))
    return keep


def repair(text, display_name, own=()):
    """Her sentence with every name she addresses the person by checked against the contact's. A name is right when
    any of its words matches a word of the contact's name (so "Asha ji", "Verma ji", "Asha Verma" for Asha Verma);
    else it becomes the contact's first name, in the sentence's script, or, with no contact name, is dropped.
    own: names she may say that are not the person's (her persona, the brand). Returns (text, [wrong names])."""
    roman, deva = forms(display_name)
    good = {key(w) for w in (roman + ' ' + deva).split()} - {''}
    mine = {key(w) for n in own for w in (n or '').split()} - {''}
    bare = lambda w: re.sub(r'(?i)(?<=.)(जी|ji)$', '', w)            # "आशाजी" is Asha with the honorific attached
    wrong = [(s, e, ws) for s, e, ws in addressed(text) if not any(key(bare(w)) in good or key(bare(w)) in mine for w in ws)]
    if not wrong: return text, []
    out = text
    for s, e, ws in sorted(wrong, reverse=True):
        first = ((deva if DEVA.search(' '.join(ws)) else roman).split() or [''])[0] if roman else ''
        if first and bare(ws[-1]) != ws[-1]: first += ws[-1][len(bare(ws[-1])):]      # keep an attached जी
        out = out[:s] + first + out[e:]
    if not roman:
        # no name to give: "क्या मैं जी से बात कर रही हूँ?" is no question; ask if now is a good time instead
        out = re.sub(r'(क्या\s+मैं|kya\s+(?:main|mai|mein))\s+(?:(?:जी|ji)\s+)?(?:से|se)\s+(?:बात|baat)[^?।.!]*[?।.!]?',
                     lambda m: 'क्या अभी आपसे दो मिनट बात हो सकती है?' if DEVA.search(m.group(0)) else 'Kya abhi aapse do minute baat ho sakti hai?', out, flags=re.I)
        out = re.sub(r'\s{2,}', ' ', out).replace(' ,', ',').strip()
    return out, [' '.join(ws) for _, _, ws in wrong]
