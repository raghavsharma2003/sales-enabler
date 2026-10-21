# The reply door and caller signals: the Python twin of product/shared/safety/index.ts, held to the same test vectors
# (product/shared/safety/cases.json, run by tests/test_safety_cases.py when the file is present). Safety is by
# predicate, not instruction: these functions decide; the brief only helps.
#
#   reply_door(text, ctx)  -> {'action': 'pass'} | {'action': 'replace', 'rule', 'text', 'reason'} | {'action': 'block', 'rule', 'reason'}
#   caller_signals(text)   -> {'crisis', 'asksIfAi', 'refusesRecording', 'optOut', 'readingSensitiveDigits', 'wantsHuman'}
#   redact(text)           -> text with OTP / card / CVV / PIN / UPI PIN / full Aadhaar spans masked
#
# Patterns cover Hindi in Devanagari, Hinglish in Latin letters and English, because the ears return all three.
import re
from dataclasses import dataclass, field, fields

I = re.I
REDACTED = '[redacted]'

# ---------------------------------------------------------------- shared vocabulary
AI_SAID = re.compile(r'\bA\.?I\b|ए\s?\.?\s?आई|एआई|artificial intelligence', I)
NEG = re.compile(r"\b(nahi|nahin|nahee|never|mat|not|don'?t|do not|kabhi nahi|kabhi na)\b|नहीं|नही|मत|कभी\s*न|न\s+(बताएं|बताइए|बताइये|करें|दें)", I)
SECOND_PERSON = re.compile(r"\b(aap|ap|tum|tu|you|u|ye|yeh|this|r u|are you)\b|आप|तुम|ये|यह", I)
QUESTION = re.compile(r"\?|\b(kya|ho|hai|hain|hu|are you|r u|or not|ya nahi|na)\b|क्या|हो\b|है|हैं|ना\b", I)

# ---------------------------------------------------------------- RD2: never deny being an AI
DENIAL = [
    re.compile(r"\b(main|mai|mein|me)\s+(koi\s+)?(ai|a\.i\.?|robot|bot|machine|computer)\s+(nahi|nahin|nhi)\b", I),
    re.compile(r"मैं\s+(कोई\s+)?(AI|एआई|ए\.?आई|रोबोट|बॉट|मशीन|कंप्यूटर)\s+(नहीं|नही)", I),
    re.compile(r"\b(i\s*am|i'?m|im)\s+(not\s+(an?\s+)?(ai|a\.i\.?|bot|robot|machine|computer|virtual)|(an?\s+)?(real\s+)?(human|person)\b(?!'s))", I),
    re.compile(r"\b(main|mai)\s+(ek\s+)?(asli\s+|real\s+)?(insaan|insan|human|real person|aadmi|ladki|ladka)\s+(hi\s+)?(hoon|hu|hun|hoo)\b", I),
    re.compile(r"मैं\s+(एक\s+)?(असली\s+)?(इंसान|इन्सान|ह्यूमन|आदमी|लड़की|लड़का)\s+(ही\s+)?(हूँ|हूं|हु|हूँ।)", I),
    re.compile(r"\b(main|mai)\s+.{0,30}\b(ki|ka|ke)\s+(employee|staff|executive|karmchari)\s+(hoon|hu|hun)\b", I),
    re.compile(r"मैं\s+.{0,30}(की|का|के)\s+(एम्प्लॉयी|कर्मचारी|स्टाफ़|स्टाफ|एग्जीक्यूटिव)\s+(हूँ|हूं)", I),
    re.compile(r"\b(main|mai)\s+(yahan|wahan)\s+kaam\s+(karti|karta)\s+(hoon|hu|hun)\b|मैं\s+(यहाँ|यहां|वहाँ)\s+काम\s+(करती|करता)\s+(हूँ|हूं)|\bi\s+work\s+(at|for|in)\b", I),
]

# ---------------------------------------------------------------- RD4: never ask for secrets
SENSITIVE = re.compile(r"\b(otp|o\.t\.p|m-?pin|atm\s*pin|upi\s*pin|pin|cvv|cvc|password|passcode|card\s*(number|no\.?|details|ka number)|debit\s*card|credit\s*card|aadhaa?r)\b"
                       r"|ओटीपी|पिन|सीवीवी|पासवर्ड|कार्ड\s*(नंबर|नम्बर|डिटेल|का नंबर)|डेबिट\s*कार्ड|क्रेडिट\s*कार्ड|आधार", I)
NOT_SECRET = re.compile(r"\bpin\s*code\b|\bpincode\b|पिन\s*कोड|पिनकोड", I)
AADHAAR_PART = re.compile(r"last\s*(4|four)|aakhri\s*(4|char|chaar)|आखिरी\s*(4|चार)|अंतिम\s*(4|चार)", I)
ASK = re.compile(r"\b(bata|batao|bataiye|bataye|batayein|batana|share|tell|give|provide|de\s*(do|dijiye|dein|dijie)|dijiye|read|padh|padhiye|bol|boliye|bolo|enter|type|send|bhej|bhejiye|confirm|chahiye|need|maang|note|likh|likhiye)\b"
                 r"|बता|शेयर|दे\s*(दो|दीजिए|दीजिये|दें)|दीजिए|दीजिये|पढ़|बोल|भेज|चाहिए|माँग|मांग|लिख|कन्फ़र्म|कन्फर्म", I)

# ---------------------------------------------------------------- RD5: no payment on the call
PAY = re.compile(r"\b(payment|pay|paisa|paise|transfer|upi)\b|पेमेंट|भुगतान|पैसे|ट्रांसफर|यूपीआई", I)
ON_CALL = re.compile(r"\b(on|over|during)\s+(this|the)\s+call\b|\bcall\s+(pe|par|mein|me|par hi|pe hi)\b|कॉल\s+(पे|पर|में)\b|\babhi\s+(isi|is)\s+call\b"
                     r"|(payment|pay|पेमेंट|भुगतान).{0,25}(le\s+leti|le\s+lungi|le\s+sakti|le\s+leta|le\s+sakta|process\s+kar|ले\s+लेती|ले\s+लूँगी|ले\s+सकती|ले\s+लेता|ले\s+सकता)"
                     r"|\bupi\s*id\b|यूपीआई\s*आईडी|\baccount\s*(number|no)\b|अकाउंट\s*(नंबर|नम्बर)|\bifsc\b|\bqr\s*code\s*(scan|bhej)", I)
DOMAIN = re.compile(r"\b((?:[a-z0-9-]+\.)+(?:com|in|net|org|io|app|link|ly|me|info|co|biz|xyz|site|online))\b", I)

# ---------------------------------------------------------------- RD3: crisis
CRISIS_LINES = ('14416', '112')
GOAL_PURSUIT = re.compile(r"link|लिंक|payment|pay\b|पेमेंट|offer|ऑफ़र|ऑफर|renew|रिन्यू|book|बुक|premium|प्रीमियम|discount|डिस्काउंट|\d[\d,]{2,}", I)

# ---------------------------------------------------------------- RD6: anti-scam framing
SCAM = [
    re.compile(r"(refund|bonus|fund\s*value|maturity|cashback|रिफंड|बोनस|मैच्योरिटी|कैशबैक).{0,40}(fee|charge|processing|jama|deposit|फ़ीस|फीस|चार्ज|जमा|प्रोसेसिंग)", I),
    re.compile(r"(lapse|laps|band|बंद|लैप्स).{0,30}(revive|reviv|chalu|चालू|रिवाइव).{0,30}(pay|payment|पेमेंट|जमा|fee)", I),
    re.compile(r"\b(warna|nahi to|otherwise|varna)\b.{0,40}\b(band|cancel|block|lapse|khatam|suspend|legal)\b|(वरना|नहीं तो).{0,40}(बंद|कैंसल|ब्लॉक|लैप्स|ख़त्म|खत्म)", I),
    re.compile(r"last chance|aakhri mauka|आखिरी मौका|आख़िरी मौका|only today|sirf aaj|सिर्फ़ आज|सिर्फ आज|abhi nahi kiya to|अभी नहीं किया तो", I),
]

# ---------------------------------------------------------------- RD7: promotion fence on service / transactional calls
PROMO = re.compile(r"\b(offer|discount|cashback|special price|deal|sale|coupon|upgrade|limited period)\b|ऑफ़र|ऑफर|डिस्काउंट|छूट|कैशबैक|सेल\b|कूपन", I)

# ---------------------------------------------------------------- RD8: IRDAI solicitation fence
SOLICIT = re.compile(r"\b(switch|upgrade|top.?up|naya plan|new plan|better plan|another plan|dusra plan|zyada cover)\b|नया प्लान|बेहतर प्लान|दूसरा प्लान|अपग्रेड|स्विच|ज़्यादा कवर|ज्यादा कवर", I)

# ---------------------------------------------------------------- RD9: harsh-practice fence on dues calls
HARSH = re.compile(r"\b(legal action|police|court|case kar|fir\b|jail|arrest|recovery agent|ghar (aa|pe aa|par aa)|office (aa|pe aa)|family ko bata|relatives|neighbou?rs|badnaam|izzat)\b"
                   r"|लीगल|पुलिस|कोर्ट|केस\s+कर|जेल|गिरफ़्तार|गिरफ्तार|रिकवरी\s+एजेंट|घर\s+(आ|पे\s+आ|पर\s+आ)|ऑफ़िस\s+आ|परिवार\s+को\s+बता|रिश्तेदार|पड़ोसी|बदनाम|इज़्ज़त", I)
DUES_JOBS = ('payment_reminder',)

# ---------------------------------------------------------------- caller signals
CRISIS_C = re.compile(
    r"suicid|kill myself|end my life|want to die|don'?t want to live|hurt myself|self.?harm|i am in danger|i'?m in danger|someone is (hurting|beating)"
    r"|marna chaht|mar jaana chaht|mar jaun|mar jaunga|mar jaungi|jeena nahi|jeene ka (mann|man) nahi|zinda nahi rehna|khud ko (khatam|maar|nuksaan|hurt)|aatmahatya|atmahatya|khudkushi"
    r"|main khatre mein|mai khatre me|koi mujhe maar|mujhe maar (raha|degi|dega|rahi)"
    r"|ख़ुदकुशी|खुदकुशी|आत्महत्या|मरना\s+चाहत|मर\s+जाऊँ|मर\s+जाऊं|मर\s+जाना\s+चाह|जीना\s+नहीं|जीने\s+का\s+मन\s+नहीं|ज़िंदा\s+नहीं\s+रहना|जिंदा\s+नहीं\s+रहना"
    r"|(ख़ुद|खुद)\s+को\s+(ख़त्म|खत्म|मार|नुकसान)|मैं\s+(ख़तरे|खतरे)\s+में|कोई\s+मुझे\s+मार|मुझे\s+मार\s+(रहा|देगा|देगी|रही)", I)
AI_WORD = re.compile(r"\b(ai|a\.i\.?|bot|robot|machine|human|insaan|insan|real person)\b|एआई|ए\.?आई|AI|रोबोट|बॉट|मशीन|कंप्यूटर|इंसान|इन्सान|असली", I)
REFUSE_REC = re.compile(r"\brecord\s*(mat|na|nahi|mt|mat karo|mat kijiye)\b|\brecording\s*(band|mat|nahi|off|stop)\b|don'?t record|do not record|stop (the )?recording|no recording|not be recorded"
                        r"|रिकॉर्ड\s*(मत|ना|न|नहीं)|रिकॉर्डिंग\s*(बंद|मत|नहीं)", I)
OPT_OUT = re.compile(r"\b(dobara|phir se|aage se|kabhi)\s+(call|phone)\s*(mat|na|nahi)|don'?t (ever )?call( me)?( again)?|do not call|stop calling|never call|remove my number|\bnumber\s+(hata|delete|remove)|\bdnd\b|unsubscribe"
                     r"|\b(mujhe|humko|hume)\s+(call|phone)\s+(mat|na)\s+(karo|karna|kijiye|kare|karein)|\binterested nahi\b.{0,20}\b(call|phone)\s+mat"
                     r"|(दोबारा|फिर\s+से|आगे\s+से|कभी)\s+(कॉल|फ़ोन|फोन)\s*(मत|ना|नहीं)|(मुझे|हमें|हमको)\s+(कॉल|फ़ोन|फोन)\s+(मत|ना)\s+(करो|करना|कीजिए|कीजिये|करें)|नंबर\s+हटा", I)
LATER = re.compile(r"baad mein|baad me|later|kal\b|shaam|subah|call back|callback|बाद\s+में|कल\b|शाम|सुबह|फिर\s+कभी", I)
HUMAN_WHO = re.compile(r"\b(human|insaan|insan|real person|asli|manager|supervisor|agent|executive|representative|customer care|kisi aadmi|kisi se|someone|person)\b"
                       r"|इंसान|इन्सान|असली|मैनेजर|सुपरवाइज़र|एजेंट|कस्टमर\s+केयर|किसी\s+आदमी|किसी\s+से", I)
HUMAN_ACT = re.compile(r"\b(baat|talk|speak|connect|transfer|jod|jodo|milao|chahiye)\b|बात|जोड़|मिलाओ|मिलाइए|चाहिए|ट्रांसफ़र|ट्रांसफर", I)
DIGIT_KEY = re.compile(r"\b(otp|o\.t\.p|m-?pin|pin|cvv|cvc|card|password|upi|aadhaa?r|expiry)\b|ओटीपी|पिन|सीवीवी|कार्ड|पासवर्ड|यूपीआई|आधार", I)
DIGIT_WORDS = re.compile(r"\b(zero|one|two|three|four|five|six|seven|eight|nine|shunya|ek|teen|char|chaar|paanch|panch|chhe|chhah|saat|aath|nau)\b"
                         r"|शून्य|एक|दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ", I)
DEVANAGARI_DIGITS = str.maketrans('०१२३४५६७८९', '0123456789')
PHONE = re.compile(r'^(\+?91)?[6-9]\d{9}$')


def _digits_runs(text):
    """Runs of digits allowing single spaces or dashes between them, as STT writes read-out numbers."""
    return [re.sub(r'\D', '', m.group(0)) for m in re.finditer(r'\d(?:[ -]?\d)+', text.translate(DEVANAGARI_DIGITS))]


def caller_signals(text):
    t = (text or '').strip()
    s = {'crisis': False, 'asksIfAi': False, 'refusesRecording': False, 'optOut': False, 'readingSensitiveDigits': False, 'wantsHuman': False}
    if not t: return s
    s['crisis'] = bool(CRISIS_C.search(t))
    s['asksIfAi'] = bool(AI_WORD.search(t) and QUESTION.search(t) and SECOND_PERSON.search(t)) and not HUMAN_ACT.search(t)
    s['refusesRecording'] = bool(REFUSE_REC.search(t))
    s['optOut'] = bool(OPT_OUT.search(t)) and not (LATER.search(t) and not re.search(r'dobara|kabhi|never|again|दोबारा|कभी|dnd|remove|हटा', t, I))
    s['wantsHuman'] = bool(HUMAN_WHO.search(t) and HUMAN_ACT.search(t))
    runs = _digits_runs(t)
    long_run = any(13 <= len(r) <= 19 or (len(r) == 12 and r[0] not in '01' and not PHONE.match(r)) for r in runs)
    keyed = bool(DIGIT_KEY.search(t)) and not NOT_SECRET.search(t) and (
        len(re.findall(r'\d', t.translate(DEVANAGARI_DIGITS))) >= 3 or len(DIGIT_WORDS.findall(t)) >= 4)
    s['readingSensitiveDigits'] = long_run or keyed
    return s


def callback_requested(text):
    return bool(re.search(r"(baad mein|baad me|later|kal|shaam ko|subah)\s.{0,20}(call|phone|baat)|call back|callback|(बाद\s+में|कल|शाम\s+को|सुबह).{0,20}(कॉल|फ़ोन|फोन|बात)", text or '', I))


def redact(text):
    """Mask spans that must never be stored. Over-masks on purpose (a +91 number read as 12 digits is masked too)."""
    if not text: return text
    t = text.translate(DEVANAGARI_DIGITS)
    t = re.sub(r'(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)', REDACTED, t)                          # card numbers (13-19) and 12-digit Aadhaar
    t = re.sub(r'(?<!\d)[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?!\d)', REDACTED, t)
    key = r"(otp|o\.t\.p|m-?pin|atm\s*pin|upi\s*pin|pin|cvv|cvc|password|passcode|expiry|ओटीपी|पिन|सीवीवी|पासवर्ड)"
    t = re.sub(key + r"(?!\s*code)([^\d\n]{0,20}?)((?:\d[ -]?){2,7}\d)", lambda m: m.group(1) + m.group(2) + REDACTED, t, flags=I)
    word = r"(?:zero|one|two|three|four|five|six|seven|eight|nine|shunya|ek|do|teen|char|chaar|paanch|panch|chhe|saat|aath|nau|शून्य|एक|दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ)"
    t = re.sub(key + r"([^\n]{0,20}?)((?:" + word + r"[\s,]+){2,}" + word + r")", lambda m: m.group(1) + m.group(2) + REDACTED, t, flags=I)
    return t


# ---------------------------------------------------------------- the door
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
    # runtime-side extras (not in the TS interface; defaults keep the shared vectors' meaning)
    disclosure_clause: str = ''
    asked_ai: bool = False
    crisis_lines_given: bool = False
    contact_facts: dict = field(default_factory=dict)
    job: str = ''
    gender: str = 'female'
    first_sentence: bool = True

    CAMEL = {'sectorPacks': 'sector_packs', 'neverSay': 'never_say', 'identityVerified': 'identity_verified', 'recordingRefused': 'recording_refused',
             'turnIndex': 'turn_index', 'disclosureClause': 'disclosure_clause', 'askedAi': 'asked_ai', 'crisisLinesGiven': 'crisis_lines_given',
             'contactFacts': 'contact_facts', 'firstSentence': 'first_sentence'}

    @classmethod
    def from_dict(cls, d):
        names = {f.name for f in fields(cls)}
        kw = {}
        for k, v in (d or {}).items():
            k = cls.CAMEL.get(k, k)
            if k in names: kw[k] = v
        return cls(**kw)


def g(gender, female, male, neutral=None):
    return female if gender == 'female' else male if gender == 'male' else (neutral or female)


def honest_line(ctx):
    clause = (ctx.disclosure_clause or '').strip() or f"{(ctx.brand or {}).get('name') or 'इस कंपनी'} की AI असिस्टेंट"
    return f'जी, मैं {clause} हूँ।'


def crisis_line(gender='female'):
    can = g(gender, 'सकती', 'सकता', 'सकती')
    return ('आप अकेले नहीं हैं, और अभी आपकी बात सबसे ज़रूरी है। Tele-MANAS पर 14416 पर फ़ोन कीजिए, ये free है और 24 घंटे खुला है; '
            f'और अगर अभी ख़तरा है तो 112 पर कॉल कीजिए। आप चाहें तो मैं अभी किसी इंसान से आपकी बात करवा {can} हूँ।')


def stop_digits_line(brand_name='', gender='female'):
    who = brand_name or 'हम'
    return f'रुकिए, ये नंबर मुझे मत बताइए, ये सिर्फ़ आपके लिए है। {who} कभी कॉल पर ये नहीं माँगते।'


def safe_fallback_line(gender='female'):
    return f"जी, ये मैं पक्का करके आपको {g(gender, 'बताती', 'बताता', 'बताती')} हूँ।"


def _verified_domain(dom, verified):
    dom = dom.lower().rstrip('.')
    return any(dom == v.lower() or dom.endswith('.' + v.lower()) for v in verified or [])


def _values(facts, purpose=None):
    out = []
    for f in facts or []:
        if purpose and f.get('purpose') != purpose: continue
        v = str(f.get('value') or '').strip()
        if len(v) >= 3: out.append(v)
    return out


def _contains(text, value):
    return value.lower() in text.lower()


def reply_door(text, ctx):
    """Check one outgoing sentence before it is spoken."""
    if isinstance(ctx, dict): ctx = DoorContext.from_dict(ctx)
    t = (text or '').strip()
    if not t: return {'action': 'pass'}
    clauses = [c for c in re.split(r'[,;:—–]|\s-\s|\b(?:lekin|but|bas|aur|and)\b|लेकिन|बस\s|और\s', t, flags=I) if c and c.strip()]

    # RD2: a denial (or a claim to be human or staff) is replaced by the honest answer
    if any(rx.search(t) for rx in DENIAL):
        return {'action': 'replace', 'rule': 'RD2', 'text': honest_line(ctx), 'reason': 'denied being an AI or claimed to be human'}

    # RD4: never ask for OTP, PIN, CVV, card, UPI PIN, password or full Aadhaar
    for c in clauses:
        if SENSITIVE.search(c) and ASK.search(c) and not NEG.search(c) and not NOT_SECRET.search(c):
            aadhaar_only = re.search(r'aadhaa?r|आधार', c, I) and not re.search(r'otp|pin|cvv|password|card|ओटीपी|पिन|सीवीवी|पासवर्ड|कार्ड', c, I)
            if not (aadhaar_only and AADHAAR_PART.search(c)):
                return {'action': 'block', 'rule': 'RD4', 'reason': 'asked for a secret (OTP / PIN / CVV / card / password / Aadhaar)'}

    # RD5: no payment on the call; links only on the brand's verified domains
    if PAY.search(t) and ON_CALL.search(t) and not any(NEG.search(c) for c in clauses if PAY.search(c) or ON_CALL.search(c)):
        return {'action': 'block', 'rule': 'RD5', 'reason': 'offered to take payment on the call'}
    for m in DOMAIN.finditer(t):
        if not _verified_domain(m.group(1), (ctx.brand or {}).get('verifiedDomains')):
            return {'action': 'block', 'rule': 'RD5', 'reason': 'a link outside the brand\'s verified domains'}

    # RD3: in a crisis the goal is suspended and the lines are given
    if ctx.crisis:
        if not ctx.crisis_lines_given and not all(x in t for x in CRISIS_LINES):
            return {'action': 'replace', 'rule': 'RD3', 'text': crisis_line(ctx.gender), 'reason': 'crisis: give Tele-MANAS 14416 and 112 and offer a human'}
        stripped = t.replace('14416', '').replace('112', '')
        if GOAL_PURSUIT.search(stripped):
            return {'action': 'block', 'rule': 'RD3', 'reason': 'crisis: the call goal is suspended'}

    # RD6: anti-scam framing
    if any(rx.search(t) for rx in SCAM):
        return {'action': 'block', 'rule': 'RD6', 'reason': 'scam-shaped framing (fee to release money, revive-by-paying, threat or false deadline)'}

    # RD7: promotion fence on service / transactional calls; the business's never-say list
    for w in ctx.never_say or []:
        if w and _contains(t, w):
            return {'action': 'block', 'rule': 'RD7', 'reason': 'a never-say term from the agent config'}
    if ctx.category in ('service', 'transactional'):
        if PROMO.search(t) or any(_contains(t, v) for v in _values(ctx.facts, 'offer')):
            return {'action': 'block', 'rule': 'RD7', 'reason': f'promotion on a {ctx.category} call'}

    # RD8: IRDAI solicitation fence (persuasion and re-quotes go to a certified human)
    if 'insurance_irdai' in (ctx.sector_packs or []) and SOLICIT.search(t):
        return {'action': 'block', 'rule': 'RD8', 'reason': 'solicitation on an insurance call: route to a certified human'}

    # RD9: harsh-practice fence in the RBI pack and on any dues call
    if ('lending_rbi' in (ctx.sector_packs or []) or ctx.job in DUES_JOBS) and HARSH.search(t):
        return {'action': 'block', 'rule': 'RD9', 'reason': 'harsh collection practice (threat, shaming or third-party pressure)'}

    # RD11: account details only after identity is confirmed
    if not ctx.identity_verified:
        vals = [str(v) for v in (ctx.contact_facts or {}).values() if len(str(v).strip()) >= 3] + _values(ctx.facts, 'identity')
        if any(_contains(t, v) for v in vals):
            return {'action': 'block', 'rule': 'RD11', 'reason': 'account details before the person confirmed who they are'}

    # RD2 (positive side): "aap AI ho?" always gets the truth, first
    if ctx.asked_ai and ctx.first_sentence and not AI_SAID.search(t):
        return {'action': 'replace', 'rule': 'RD2', 'text': honest_line(ctx) + ' ' + t, 'reason': 'asked if she is an AI: the honest answer comes first'}

    # RD1: brand + one AI clause in the first breath
    if not ctx.disclosed and ctx.first_sentence and not AI_SAID.search(t):
        clause = (ctx.disclosure_clause or '').strip() or f"{(ctx.brand or {}).get('name') or ''} की AI असिस्टेंट".strip()
        return {'action': 'replace', 'rule': 'RD1', 'text': f'{clause}, {t}' if clause else t, 'reason': 'first breath must carry the AI clause'}
    return {'action': 'pass'}
