# Operator announcements and answering machines, heard before her opening (must-be audit brief 5). An Indian carrier
# often answers an unreachable number with a recorded line ("आप जिस नंबर पर कॉल कर रहे हैं वह अभी बंद है", "the number
# you are calling is switched off"); an answering machine asks for a message after the tone. On an outbound phone call
# she listens first (CascadeSession.LISTEN_FIRST); if what is heard matches one of these, the call ends with the end
# reason below, before any opening, with no caller turn recorded (so no analysis model runs on it).
#
# String matching on the recogniser's words, no model call. Each class is a list of regexes over the lowercased text,
# Roman and Devanagari, with spelling variants the recognisers produce. Order matters: the first class that matches.
import re

CLASSES = [
    ('invalid_number', [
        r'\b(does not|doesn\'?t|do not) exist', r'\bnot (a )?valid (number|mobile)', r'\binvalid (number|mobile)',
        r'\b(dialled|dialed|called) (is )?(incorrect|wrong|not correct)', r'please check the number',
        r'(मौजूद|मोजूद) नहीं', r'(अस्तित्व|अस्तित्त्व) में नहीं', r'(गलत|ग़लत) (है|नंबर)', r'नंबर (की )?जाँच कर', r'नंबर (की )?जांच कर',
        r'\b(maujood|mojood) nahi', r'\bgalat (hai|number)']),
    ('switched_off', [
        r'\bswitch(ed)? off', r'\bnot reachable', r'\bunreachable', r'\bout of (the )?(coverage|network|service) area',
        r'\bnot available (right now|at the moment|currently)', r'\bcurrently not available', r'\bnot responding',
        r'स्विच(्ड)? ऑफ', r'स्विच ओफ', r'(अभी )?बंद है', r'पहुँच से बाहर', r'पहुंच से बाहर', r'(नेटवर्क|कवरेज) (क्षेत्र )?से बाहर',
        r'(अभी )?उपलब्ध नहीं', r'संपर्क (नहीं हो|से बाहर)', r'जवाब नहीं दे रहा',
        r'\bpahunch se bahar', r'\bnetwork (kshetra )?se bahar', r'\babhi band hai', r'\bupalabdh nahi']),
    ('busy', [
        r'\bbusy (on|with) another call', r'\b(is|currently) busy\b', r'\bon another call', r'\bline is busy',
        r'(दूसरी|अन्य) (कॉल|काल) पर', r'(अभी )?व्यस्त है', r'\bvyast hai', r'\bdoosri call par']),
    ('voicemail', [
        r'\bleave (a|your) (message|voice ?mail)', r'\bafter the (beep|tone)', r'\bvoice ?mail', r'\brecord your message',
        r'\bnot available to take your call', r'\bcannot take your call',
        r'(संदेश|मैसेज) (रिकॉर्ड|छोड़|छोड)', r'(बीप|टोन) के बाद', r'वॉइस ?मेल', r'\bmessage chhod', r'\bbeep ke baad']),
]
_RX = [(cls, [re.compile(p, re.I) for p in pats]) for cls, pats in CLASSES]

# What a person says when they pick up: a short greeting means a human, so she opens at once
GREETING = re.compile(r'^\W*(hello|helo|hallo|hi|haan|han|haa|ji|jee|bolo|boliye|bolie|kaun|kon|namaste|namaskar|yes|haanji|'
                      r'हेलो|हैलो|हाँ|हां|जी|बोलो|बोलिए|बोलिये|कौन|नमस्ते|नमस्कार)(?=[\s,.?!।]|$)', re.I)   # no \b: it fails after a matra


def classify(text):
    """The end reason an announcement or machine maps to ('invalid_number', 'switched_off', 'busy', 'voicemail'), or None."""
    t = (text or '').strip()
    if not t: return None
    for cls, rxs in _RX:
        if any(rx.search(t) for rx in rxs): return cls
    return None


def sounds_human(text):
    """A short greeting, the way people answer a phone: open now, do not wait to rule out an announcement."""
    t = (text or '').strip()
    return bool(t) and len(t.split()) <= 6 and bool(GREETING.search(t))
