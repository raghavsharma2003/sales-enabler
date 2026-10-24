# Duplex feel: her short backchannels ("haan", "hmm") in a pause of a long caller turn, the way a person on the phone
# shows they are listening. The cascade (CascadeSession._backchannel) decides when; this module holds what she says and
# how the clips are made.
#
# A backchannel is never a turn: it is not in the transcript, never reaches the brain, and the door has nothing to judge
# (a fixed token from the table below, never model text). It is in the recording and the trace (event 'backchannel').
# Clips are rendered once per call in the call's own voice, trimmed of the TTS's leading and trailing quiet, so one
# plays at once when the pause comes; a render that is too long after trimming is dropped (it would talk over them).
import numpy as np

# Tokens by the call's script language (safety.script_language). A short affirmative and a hum; never "achha" alone
# (it reads as surprise or as her taking the turn) and never a word that answers a question.
TOKENS = {'hi-IN': ['हाँ', 'हम्म'], 'hinglish': ['haan', 'hmm'], 'en-IN': ['mm-hmm', 'right']}
TRIM_LEVEL = 200                 # |sample| below this (about -44 dBFS) is quiet the TTS padded the token with
MAX_CLIP_S = 0.7                 # a backchannel longer than this, once trimmed, is not a backchannel
MIN_CLIP_S = 0.08


def tokens(language):
    return TOKENS.get(language) or TOKENS['hinglish']


def trim(pcm24):
    """The clip without its leading and trailing quiet (24 kHz s16le), or None when it is too short or too long."""
    x = np.frombuffer(pcm24[:len(pcm24) // 2 * 2], dtype='<i2')
    loud = np.flatnonzero(np.abs(x.astype(np.int32)) >= TRIM_LEVEL)
    if not len(loud): return None
    pad = int(0.02 * 24000)                                  # keep 20 ms either side: no clipped onset
    a = max(0, loud[0] - pad); b = min(len(x), loud[-1] + pad)
    d = (b - a) / 24000
    if d < MIN_CLIP_S or d > MAX_CLIP_S: return None
    y = x[a:b].astype(np.float32)
    f = min(len(y) // 4, int(0.01 * 24000))                  # 10 ms fades: no click at either end
    if f:
        ramp = np.linspace(0.0, 1.0, f, dtype=np.float32); y[:f] *= ramp; y[-f:] *= ramp[::-1]
    return y.astype('<i2').tobytes()
