# How the caller sounds right now (integrator humanness round, item "emotion and pacing"): one state per caller turn,
# from their words (brief.CUES, the same reading the ledger has always used) and their timing (how often they cut in on
# her lately). It shapes her next reply, logged per turn in the trace (agent turn 'state'):
#   - a ledger row with the SHAPE of the reply for that state (never a line: sentence-shaped text gets recited);
#   - a delivery note for a voice that takes one (Azure MAI styles via tts.mai_style, the OpenRouter instructions
#     field). Gemini 3.8 TTS takes none: a style prefix was spoken aloud (rejected.2026-10-20.gemini-tts-style-prefix),
#     so there the shape of the text is the only control.
# Order of precedence: upset > confused > rushed > warm > neutral. Crisis is not a state here: it is a predicate with
# its own path (safety.py, the CRISIS ledger row), and when it holds no state row is added.
import re
from . import brief

STATES = ('upset', 'confused', 'rushed', 'warm', 'neutral')
CONFUSED = re.compile(r'^\s*(क्या|kya|hain|हैं|sorry|pardon|matlab|मतलब)\s*\??\s*$|फिर से|दोबारा|phir se|dobara|samajh nahi|समझा नहीं|समझी नहीं|'
                      r'समझ नहीं|which one|kaun sa|कौन सा|kya bola|क्या बोला|kya kaha|क्या कहा', re.I)

SHAPES = {
    'upset': 'they sound upset: first acknowledge it in a few plain words, then slow and warm, short sentences, nothing to sell this turn',
    'confused': 'they sound unsure what you meant: say it again more simply, one idea per sentence, everyday words, slower',
    'rushed': 'they sound short of time: the point first, one short sentence, no pleasantries',
    'warm': 'they sound relaxed and friendly: match their ease',
}
DELIVERY = {'upset': 'gentle', 'confused': 'calm'}      # a tone note for styled voices (tts.mai_style: gentle/calm -> softvoice)


def read(callers, cut_ins=0):
    """callers: their turns' texts, oldest first. cut_ins: how many of her last three turns they talked over."""
    if not callers: return 'neutral'
    last = callers[-1]; recent = callers[-2:]
    cue = {name for name, rx in brief.CUES if any(rx.search(c) for c in recent)}
    if cue & {'irritated', 'worried'}: return 'upset'
    if CONFUSED.search(last) or any(rx.search(last) for name, rx in brief.CUES if name == 'confused'): return 'confused'
    if 'in a hurry' in {name for name, rx in brief.CUES if any(rx.search(c) for c in callers[-3:])} or cut_ins >= 2: return 'rushed'
    if 'joking or chatty' in cue or any(brief.LAUGH.search(c) for c in recent): return 'warm'
    return 'neutral'
