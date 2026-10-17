# Render the round-2 listener-panel stimuli (r2-listener-panel, 2026-10-17). Do not rate them here.
#
# Text: ../stimuli-round2/stimuli-text.json (stimuli_text_round2.py). Processing is identical to round 1
# (render_stimuli.py): 24 kHz synthesis, leading and trailing silence trimmed to about 150 ms, -16 LUFS, a wideband
# mp3 and a phone-band mp3 (300-3,400 Hz, 8 kHz G.711 mu-law round trip). Blind file names; manifest.csv holds the key.
#
# Voices (evidence: protocol.md v2.0 section 3.1 and the r2-listener-panel write-up):
#   neural  hi-IN-SwaraNeural (F), hi-IN-MadhurNeural (M): 0/20 number misreads each in the l8 probe; the r2 India
#           cascade that met the 1.5 s latency bar used Swara.
#   hd      en-IN-Meera / en-IN-Arjun DragonHD (multilingual): rate-matched to the neural voice of the same gender
#           (a calibration pass renders R1-R8 at rate 0 and sets the HD rate from the median duration ratio), so the
#           tier contrast compares voice quality at equal pace.
#   native  ta-IN Pallavi (F) / Valluvar (M); mr-IN Aarohi (F) / Manohar (M).
#   indic   en-IN-AartiIndicNeural (F) / en-IN-ArjunIndicNeural (M): multilingual neural voices that speak Marathi and
#           Hindi, so Marathi-vs-Hinglish can be compared within voice (round 1 needed the preview Diya Dragon voice,
#           which misread numbers).
#   Not used: hi-IN-Diya:DragonLatestNeural (misread Rs 1,299 in 10/13 round-1 renders); MAI-Voice-2.1 voices (preview,
#   no meter, trailing junk audio in 7/20 and 11/20 l8 renders).
# Pace: 'slow' = 0.85 x the voice's default speed (SSML prosody rate).
#
# Automatic QA (no human has listened): each phone-band clip is transcribed by MAI-Transcribe-2 and by fast
# transcription pinned to the clip's locale. Every key token (amounts, dates, digit strings, the AI disclosure) is looked
# for in both transcripts. qa_auto = pass | fail | needs_listen (rules in token_status()).
#
#   python render_stimuli_round2.py --dry-run      print the plan, character count and cost estimate; no calls
#   python render_stimuli_round2.py                calibrate (if needed), render everything missing, QA, write manifest
#   python render_stimuli_round2.py --requeue-fail re-render clips whose QA failed (HD/indic voices only; neural is
#                                                  deterministic), up to 3 attempts in total
#   python render_stimuli_round2.py --recheck      recompute token checks from the stored transcripts only
# Keys are read at run time from the env file in $VP_AZURE_ENV (VP_AI_KEY); nothing is written to disk.
import os, sys, json, csv, time, html, re, hashlib, statistics, subprocess, threading
from concurrent.futures import ThreadPoolExecutor
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ST = os.environ.get('R2P_STIM_DIR') or os.path.normpath(os.path.join(HERE, '..', 'stimuli-round2'))   # override only for tests
SCRATCH = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad'
TMP = os.environ.get('R2P_TMP', os.path.join(SCRATCH, 'research-raw', 'l8-azure-bench', 'stim_r2_tmp'))
MAN = os.path.join(ST, 'manifest.csv')
CAL = os.path.join(ST, 'calibration.json')
TEXT = json.load(open(os.path.join(ST, 'stimuli-text.json'), encoding='utf-8'))
C, SPEC = TEXT['content'], TEXT['turn_specs']
R_TURNS = [f'R{i}' for i in range(1, 9)]
C_TURNS = ['C1', 'C2', 'C3', 'C4']
SLOW = 0.85

VOICES = {   # voice -> (tier, gender, primary ssml lang)
    'hi-IN-SwaraNeural': ('neural', 'F', 'hi-IN'), 'hi-IN-MadhurNeural': ('neural', 'M', 'hi-IN'),
    'en-IN-Meera:DragonHDLatestNeural': ('hd', 'F', 'hi-IN'), 'en-IN-Arjun:DragonHDLatestNeural': ('hd', 'M', 'hi-IN'),
    'ta-IN-PallaviNeural': ('native', 'F', 'ta-IN'), 'ta-IN-ValluvarNeural': ('native', 'M', 'ta-IN'),
    'mr-IN-AarohiNeural': ('native', 'F', 'mr-IN'), 'mr-IN-ManoharNeural': ('native', 'M', 'mr-IN'),
    'en-IN-AartiIndicNeural': ('indic', 'F', 'hi-IN'), 'en-IN-ArjunIndicNeural': ('indic', 'M', 'hi-IN'),
}
MATCH_TO = {'en-IN-Meera:DragonHDLatestNeural': 'hi-IN-SwaraNeural', 'en-IN-Arjun:DragonHDLatestNeural': 'hi-IN-MadhurNeural'}
REG_LANG = {'neutral_hinglish': 'hi-IN', 'neutral_hinglish_safety': 'hi-IN', 'bhojpuri_mix': 'hi-IN', 'tamil_english': 'ta-IN',
            'marathi_mix': 'mr-IN', 'indian_english': 'en-IN'}
REGISTER_OF = {'neutral_hinglish_safety': 'neutral_hinglish'}


# Text versions: a clip whose text was edited after a QA finding gets a new code; the old row is kept as superseded.
TEXT_VERSION = {('R3', 'tamil_english'): 'v2'}


def plan():
    """Every clip to render: dicts with sets, turn, register, script, voice, pace, rate_mode."""
    P = []
    def add(sets, turns, text_key, voices, paces, script='plain', rate_mode='matched'):
        for t in turns:
            for v in voices:
                for pace in paces:
                    P.append({'sets': sets, 'turn': t, 'text_key': text_key, 'register': REGISTER_OF.get(text_key, text_key),
                              'script': script, 'voice': v, 'pace': pace, 'rate_mode': rate_mode})
    N = ['hi-IN-SwaraNeural', 'hi-IN-MadhurNeural']
    HD = ['en-IN-Meera:DragonHDLatestNeural', 'en-IN-Arjun:DragonHDLatestNeural']
    # hindi set (primary): neural and HD, default and slow, R1-R8 plain
    add(['hindi', 'bihar'], R_TURNS, 'neutral_hinglish', N, ['default'])                 # shared with the Bihar set
    add(['hindi'], R_TURNS, 'neutral_hinglish', N, ['slow'])
    add(['hindi'], R_TURNS, 'neutral_hinglish', HD, ['default'])
    add(['hindi'], R_TURNS, 'neutral_hinglish', HD, ['slow'])
    add(['hindi'], ['R7'], 'neutral_hinglish_safety', N, ['default'], script='safety')  # S1 script contrast
    add(['hindi_c'], C_TURNS, 'neutral_hinglish', N + HD, ['default'], script='blockc')  # Block C TTS side
    # secondary sets
    add(['bihar'], R_TURNS, 'bhojpuri_mix', N, ['default'])
    # Tamil Nadu: the HD voices speak all three registers at their own default rate (rate_mode native). Rate-matching
    # them to the Hindi neural voices (as in the hindi set) made Tamil and English clips 15-17 s long.
    add(['tamilnadu'], R_TURNS, 'neutral_hinglish', HD, ['default'], rate_mode='native')
    add(['tamilnadu'], R_TURNS, 'tamil_english', HD, ['default'], rate_mode='native')
    add(['tamilnadu'], R_TURNS, 'indian_english', HD, ['default'], rate_mode='native')
    add(['tamilnadu'], R_TURNS, 'tamil_english', ['ta-IN-PallaviNeural', 'ta-IN-ValluvarNeural'], ['default'])
    add(['maharashtra'], R_TURNS, 'marathi_mix', ['en-IN-AartiIndicNeural', 'en-IN-ArjunIndicNeural'], ['default'])
    add(['maharashtra'], R_TURNS, 'neutral_hinglish', ['en-IN-AartiIndicNeural', 'en-IN-ArjunIndicNeural'], ['default'])
    add(['maharashtra'], R_TURNS, 'marathi_mix', ['mr-IN-AarohiNeural', 'mr-IN-ManoharNeural'], ['default'])
    return P


def text_for(clip):
    g = VOICES[clip['voice']][1]
    v = C[clip['turn']][clip['text_key']]
    return v.get(g) or v['F']


def code_for(clip):
    k = f"{clip['turn']}|{clip['text_key']}|{clip['voice']}|{clip['pace']}|r2-2026-10-17"
    if clip.get('rate_mode') == 'native' and clip['voice'] in MATCH_TO:
        k += '|native-rate'
    if (clip['turn'], clip['text_key']) in TEXT_VERSION:
        k += '|' + TEXT_VERSION[(clip['turn'], clip['text_key'])]
    return 'R2_' + hashlib.sha1(k.encode()).hexdigest()[:6]


def load_env():
    env = os.environ.get('VP_AZURE_ENV', os.path.join(SCRATCH, 'vp-azure.env'))
    for line in open(env):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k, v.strip().strip('"').strip("'"))
    return os.environ['VP_AI_KEY']


_local = threading.local()
def sess():
    if not hasattr(_local, 's'): _local.s = requests.Session()
    return _local.s


def synth(key, voice, lang, text, rate_pct):
    body = html.escape(text)
    if abs(rate_pct) > 0.05:
        body = f"<prosody rate='{rate_pct:+.1f}%'>{body}</prosody>"
    ssml = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'>"
            f"<voice name='{voice}'>{body}</voice></speak>")
    err = None
    for attempt in range(4):
        try:
            r = sess().post('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=90,
                            headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                                     'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm', 'User-Agent': 'r2-listener-panel'})
            if r.status_code == 200 and len(r.content) > 1000:
                return r.content, ssml, None
            err = f'{r.status_code} {r.text[:160]}'
        except Exception as e:
            err = repr(e)[:160]
        time.sleep(3 * (attempt + 1))
    return None, ssml, err


def asr(key, path, engine, locale):
    d = {'enhancedMode': {'enabled': True, 'model': 'MAI-Transcribe-2'}} if engine == 'mai2' else {'locales': [locale]}
    for attempt in range(3):
        try:
            with open(path, 'rb') as f:
                r = sess().post('https://vp-research-ai-sea.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15',
                                headers={'Ocp-Apim-Subscription-Key': key},
                                files={'audio': ('a.wav', f, 'audio/wav'), 'definition': (None, json.dumps(d), 'application/json')}, timeout=120)
            if r.status_code == 200:
                j = r.json()
                return (' '.join(p.get('text', '') for p in j.get('combinedPhrases', [])),
                        ','.join(sorted({p.get('locale', '') for p in j.get('phrases', []) if p.get('locale')})))
            err = f'ERR {r.status_code}'
        except Exception as e:
            err = 'ERR ' + repr(e)[:80]
        time.sleep(2 * (attempt + 1))
    return err, ''


def ff(*a): subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *a], check=True, stdin=subprocess.DEVNULL, timeout=120)
def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())


def process(raw_bytes, code):
    """Round-1 chain. Returns (duration_s, phone16 wav path)."""
    raw = os.path.join(TMP, code + '.raw.wav'); open(raw, 'wb').write(raw_bytes)
    trim = os.path.join(TMP, code + '.trim.wav')
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', raw, '-af',
                        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,'
                        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-ar', '24000', trim], check=True, stdin=subprocess.DEVNULL, timeout=45)
    except subprocess.TimeoutExpired:
        # ffmpeg 7 occasionally stalls on this one-pass graph (seen on 1 of 194 clips); the same steps in separate passes
        sr = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15'
        a, b, c2 = (os.path.join(TMP, code + x) for x in ('.s1.wav', '.s2.wav', '.s3.wav'))
        ff('-i', raw, '-af', sr, a); ff('-i', a, '-af', 'areverse', b); ff('-i', b, '-af', sr, c2)
        ff('-i', c2, '-af', 'areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', trim)
    ff('-i', trim, '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(ST, 'wideband', code + '.mp3'))
    mu = os.path.join(TMP, code + '.mulaw.wav'); ff('-i', trim, '-af', 'highpass=f=300,lowpass=f=3400', '-ar', '8000', '-c:a', 'pcm_mulaw', mu)
    ph16 = os.path.join(TMP, code + '.ph16.wav'); ff('-i', mu, '-ar', '16000', '-c:a', 'pcm_s16le', ph16)
    ff('-i', ph16, '-c:a', 'libmp3lame', '-b:a', '48k', os.path.join(ST, 'phone', code + '.mp3'))
    return dur(trim), ph16


# ---------------------------------------------------------------------------------------------------------------------
# Key-token check
# ---------------------------------------------------------------------------------------------------------------------
DEV = str.maketrans('०१२३४५६७८९', '0123456789')
TAMIL_DIGITS = str.maketrans('௦௧௨௩௪௫௬௭௮௯', '0123456789')
MONTHS = {
    1: ['जनवरी', 'January', 'जानेवारी', 'ஜனவரி', 'जनवरि'], 5: [], 8: ['अगस्त', 'August', 'ऑगस्ट', 'आगस्त', 'ஆகஸ்ட', 'ஆகஸ்டு'],
    10: ['अक्टूबर', 'अक्तूबर', 'October', 'ऑक्टोबर', 'अक्टोबर', 'அக்டோப'], 11: ['नवंबर', 'नवम्बर', 'November', 'नोव्हेंबर', 'नवेंबर', 'நவம்ப'],
    12: ['दिसंबर', 'दिसम्बर', 'December', 'डिसेंबर', 'டிசம்ப'],
}
HI_UNITS = {'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
            'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'पन्द्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20,
            'इक्कीस': 21, 'बाईस': 22, 'तेईस': 23, 'चौबीस': 24, 'पच्चीस': 25, 'छब्बीस': 26, 'सत्ताईस': 27, 'अट्ठाईस': 28, 'अठाईस': 28, 'उनतीस': 29, 'तीस': 30,
            'इकतीस': 31, 'बत्तीस': 32, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90, 'पैंसठ': 65, 'छियासठ': 66,
            'चौंसठ': 64, 'सैंतालीस': 47, 'पैंतालीस': 45, 'बयालीस': 42, 'तैंतालीस': 43, 'छत्तीस': 36, 'अड़तीस': 38, 'छियासी': 86, 'तिरसठ': 63}
EN_UNITS = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11,
            'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
            'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90}
SCALE = {'सौ': 100, 'हज़ार': 1000, 'हजार': 1000, 'लाख': 100000, 'hundred': 100, 'thousand': 1000, 'lakh': 100000, 'lakhs': 100000,
         'லட்சம்': 100000, 'லட்சமாவே': 100000, 'लाखच': 100000, 'लाखे': 100000, 'लाखा': 100000}


def numbers_in(text):
    """Numbers an ASR transcript contains, as ints. Digit runs, Indian grouping, 'N lakh/hazar', simple number words,
    and runs of single digits ('4 3 2 1' -> 4321, also kept as the single digits)."""
    t = text.translate(DEV).translate(TAMIL_DIGITS)
    t = re.sub(r'(?<=\d)[,٬](?=\d)', '', t)
    out = []
    # N lakh / N hazar written with a digit
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*(लाख\w*|lakh\w*|லட்ச\w*|हज़ार|हजार|thousand|ஆயிரம்)', t, flags=re.I):
        mult = 100000 if re.match(r'लाख|lakh|லட்ச', m.group(2), re.I) else 1000
        out.append(int(round(float(m.group(1)) * mult)))
    toks = re.findall(r'\d+', t)
    out += [int(x) for x in toks]
    # runs of single digits separated by spaces, hyphens or commas
    for m in re.finditer(r'(?<!\d)(\d(?:[\s,\-]+\d){2,})(?!\d)', t):
        out.append(int(re.sub(r'\D', '', m.group(1))))
    # number words (Hindi, Marathi overlaps partly, English); greedy left-to-right accumulation
    words = re.findall(r'[ऀ-ॿ]+|[A-Za-z]+', t)
    cur, total, seen = 0, 0, False
    for w in words + ['|']:
        lw = w.lower()
        if w in HI_UNITS or lw in EN_UNITS:
            cur += HI_UNITS.get(w, EN_UNITS.get(lw, 0)); seen = True
        elif (w in SCALE or lw in SCALE) and seen:
            s = SCALE.get(w, SCALE.get(lw))
            if s == 100: cur = max(cur, 1) * 100
            else: total += max(cur, 1) * s; cur = 0
        else:
            if seen: out.append(total + cur)
            cur, total, seen = 0, 0, False
    return out


def has_month(text, month):
    alts = MONTHS.get(month, [])
    return any(a.lower() in text.lower() for a in alts) if alts else True


def check_engine(text, tokens):
    """Per-engine result: found ids, missing ids, unexpected numbers."""
    if not text or text.startswith('ERR'):
        return {'ok': False, 'found': [], 'missing': [t['id'] for t in tokens], 'unexpected': [], 'error': text}
    nums = numbers_in(text)
    expected = set()
    found, missing = [], []
    for tk in tokens:
        if tk['kind'] == 'num':
            v = tk['value']; expected.add(v)
            if tk['id'] in ('vehicle_digits', 'phone_last4'):
                expected.update(int(c) for c in str(v))
            ok = v in nums
        elif tk['kind'] == 'date':
            expected.add(tk['day'])
            ok = tk['day'] in nums and has_month(text, tk['month'])
        else:
            ok = any(a.lower() in text.lower() for a in tk['alts'])
        (found if ok else missing).append(tk['id'])
    # numbers that the text does not contain: evidence of a misread (small spoken numbers like "2 minutes" allowed)
    allowed = expected | {1, 2, 3}
    unexpected = sorted({n for n in nums if n not in allowed and not any(str(n) in str(e) for e in expected if e > 99)})
    # a missing amount whose digits appear only in part (Rs 1,538 heard as 538): kept separately, see token_status()
    partials = {tk['id']: sorted({n for n in nums if n > 9 and n != tk['value'] and str(n) in str(tk['value'])})
                for tk in tokens if tk['kind'] == 'num' and tk['id'] in missing and tk['value'] > 99}
    partials = {k: v for k, v in partials.items() if v}
    return {'ok': not missing, 'found': found, 'missing': missing, 'unexpected': unexpected, 'partials': partials}


def token_status(tokens, res_a, res_b):
    """pass: every token heard by at least one engine and no engine heard an unexpected number while missing a token.
    fail: some token heard by neither engine and an unexpected number was heard (a likely misread).
    needs_listen: anything else (for example both engines wrote words the parser does not read)."""
    if not tokens:
        return 'pass', 'no key tokens'
    heard = set(res_a['found']) | set(res_b['found'])
    missing_all = [t['id'] for t in tokens if t['id'] not in heard]
    conflict = [r for r in (res_a, res_b) if r['missing'] and r['unexpected']]
    if not missing_all and not conflict:
        return 'pass', 'all tokens heard' + ('' if res_a['ok'] and res_b['ok'] else ' (by one engine only for ' +
                                            ','.join(sorted(set(res_a['missing']) ^ set(res_b['missing']))) + ')')
    if missing_all and conflict:
        return 'fail', f'not heard by either engine: {",".join(missing_all)}; unexpected numbers ' + \
            '; '.join(str(r['unexpected']) for r in conflict)
    trunc = [t for t in tokens if t['id'] in missing_all and t['kind'] == 'num' and
             all(r.get('partials', {}).get(t['id']) for r in (res_a, res_b))]
    if trunc:
        return 'fail', 'both engines heard only part of ' + ', '.join(f"{t['id']} {t['value']} ({res_a['partials'][t['id']]} / {res_b['partials'][t['id']]})" for t in trunc)
    if missing_all:
        return 'needs_listen', f'not heard by either engine (no conflicting number): {",".join(missing_all)}'
    return 'needs_listen', 'one engine heard an unexpected number: ' + '; '.join(f'missing {r["missing"]} heard {r["unexpected"]}' for r in conflict)


def tokens_for(clip):
    spec = SPEC[clip['turn']]
    tk = list(spec['key_tokens'])
    if clip['script'] == 'safety':
        tk += spec.get('key_tokens_safety_extra', [])
    return tk


# ---------------------------------------------------------------------------------------------------------------------
FIELDS = ['file_code', 'stim_sets', 'turn', 'register', 'script', 'source', 'tier', 'voice', 'gender', 'pace', 'ssml_lang',
          'rate_pct', 'voice_role', 'duration_s', 'in_range', 'wideband_mp3', 'phone_mp3', 'text', 'gloss_en', 'key_tokens',
          'asr_mai2_phone', 'asr_mai2_locale', 'asr_fast_phone', 'asr_fast_locale', 'check_mai2', 'check_fast',
          'qa_auto', 'qa_detail', 'render_attempts', 'tts_chars', 'text_author', 'rendered', 'audio_sha256', 'superseded']


def rate_for(clip, cal):
    base = cal.get(clip['voice'], 0.0) if (clip['voice'] in MATCH_TO and clip['sets'] != ['calibration']
                                           and clip.get('rate_mode', 'matched') == 'matched') else 0.0
    if clip['pace'] == 'slow':
        return ((1 + base / 100) * SLOW - 1) * 100
    return base


def voice_role(clip):
    tier, g, _ = VOICES[clip['voice']]
    return {'neural': f'product neural voice {g}', 'hd': f'HD multilingual {g}, rate-matched to the neural {g} voice',
            'native': f'native-locale voice {g}', 'indic': f'multilingual Indic neural {g}'}[tier]


def render_one(key, clip, cal, attempt=1):
    code = code_for(clip)
    text = text_for(clip)
    lang = REG_LANG[clip['text_key']]
    rate = rate_for(clip, cal)
    audio, ssml, err = synth(key, clip['voice'], lang, text, rate)
    if audio is None:
        print('TTS FAIL', code, clip, err, flush=True)
        return None
    d, ph16 = process(audio, code)
    loc = lang
    mai, mai_loc = asr(key, ph16, 'mai2', None)
    fast, fast_loc = asr(key, ph16, 'fast', loc)
    tk = tokens_for(clip)
    ca, cb = check_engine(mai, tk), check_engine(fast, tk)
    st, detail = token_status(tk, ca, cb)
    lim = 16.5 if clip['pace'] == 'slow' else 14.5
    tier, g, _ = VOICES[clip['voice']]
    row = {'file_code': code, 'stim_sets': '|'.join(clip['sets']), 'turn': clip['turn'], 'register': clip['register'], 'script': clip['script'],
           'source': 'tts', 'tier': tier, 'voice': clip['voice'], 'gender': g, 'pace': clip['pace'], 'ssml_lang': lang, 'rate_pct': round(rate, 1),
           'voice_role': voice_role(clip), 'duration_s': round(d, 2), 'in_range': 7.5 <= d <= lim,
           'wideband_mp3': f'wideband/{code}.mp3', 'phone_mp3': f'phone/{code}.mp3', 'text': text,
           'gloss_en': C[clip['turn']].get('gloss_en_safety' if clip['script'] == 'safety' else 'gloss_en'),
           'key_tokens': json.dumps([t['id'] for t in tk]), 'asr_mai2_phone': mai, 'asr_mai2_locale': mai_loc, 'asr_fast_phone': fast,
           'asr_fast_locale': fast_loc, 'check_mai2': json.dumps(ca, ensure_ascii=False), 'check_fast': json.dumps(cb, ensure_ascii=False),
           'qa_auto': st, 'qa_detail': detail, 'render_attempts': attempt, 'tts_chars': len(text),
           'text_author': TEXT['authors'].get(clip['text_key'], ''), 'rendered': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'audio_sha256': hashlib.sha256(open(os.path.join(ST, 'phone', code + '.mp3'), 'rb').read()).hexdigest()[:16]}
    print(f'{code} {clip["turn"]} {clip["register"][:9]} {clip["script"][:6]} {clip["voice"][:18]} {clip["pace"]} r{rate:+.0f} {d:.1f}s {st}: {detail[:90]}', flush=True)
    return row


def calibrate(key):
    """Render R1-R8 (F/M Hinglish) at rate 0 in the neural and HD voices; HD rate = (median duration ratio - 1)."""
    if os.path.exists(CAL):
        return json.load(open(CAL))
    rows = {}
    for v in list(MATCH_TO) + list(MATCH_TO.values()):
        for t in R_TURNS:
            clip = {'sets': ['calibration'], 'turn': t, 'text_key': 'neutral_hinglish', 'voice': v, 'pace': 'default'}
            audio, _, err = synth(key, v, 'hi-IN', text_for(clip), 0)
            if audio is None:
                sys.exit(f'calibration TTS failed: {v} {t} {err}')
            p = os.path.join(TMP, f'cal_{v.split(":")[0]}_{t}.wav'); open(p, 'wb').write(audio)
            q = p.replace('.wav', '.trim.wav')
            ff('-i', p, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse,'
               'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.15,areverse', q)
            rows[(v, t)] = dur(q)
    cal = {'_method': 'R1-R8 neutral Hinglish at SSML rate 0; HD rate_pct = 100 * (median over turns of HD duration / '
                      'neural duration - 1), so the HD voice speaks at the neural voice\'s pace', '_durations_s': {}}
    for hd, nv in MATCH_TO.items():
        ratios = [rows[(hd, t)] / rows[(nv, t)] for t in R_TURNS]
        speed = statistics.median(ratios)          # < 1 means HD finishes sooner, so it must be slowed
        cal[hd] = round((speed - 1) * 100, 1)
        cal['_durations_s'][hd] = {t: round(rows[(hd, t)], 2) for t in R_TURNS}
        cal['_durations_s'][nv] = {t: round(rows[(nv, t)], 2) for t in R_TURNS}
        cal.setdefault('_ratios', {})[hd] = [round(x, 3) for x in ratios]
    json.dump(cal, open(CAL, 'w'), indent=1)
    print('calibration', {k: v for k, v in cal.items() if not k.startswith('_')})
    return cal


def write_manifest(rows):
    rows = sorted(rows, key=lambda r: (r['stim_sets'], r['turn'], r['register'], r['script'], r['voice'], r['pace']))
    with open(MAN, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)


def main():
    os.makedirs(TMP, exist_ok=True)
    for sub in ('wideband', 'phone'):
        os.makedirs(os.path.join(ST, sub), exist_ok=True)
    P = plan()
    have = {r['file_code']: r for r in csv.DictReader(open(MAN, encoding='utf-8'))} if os.path.exists(MAN) else {}
    planned = {code_for(c): c for c in P}
    for code, r in have.items():            # keep every rendered row; mark the ones the current plan no longer uses
        if code in planned:
            r['stim_sets'] = '|'.join(planned[code]['sets']); r['superseded'] = ''
        elif not r.get('superseded'):
            if r['turn'] == 'R3' and r['register'] == 'tamil_english':
                r['superseded'] = 'text v2 (digits with commas): ta-IN normaliser merged "4 7 2 9" with the following date'
            elif r['stim_sets'] == 'tamilnadu' and r['tier'] == 'hd':
                r['superseded'] = 'Tamil Nadu HD clips re-rendered at the voice default rate (rate-matched versions ran 15-17 s)'
            else:
                r['superseded'] = 'not in the current plan'
    if have and '--dry-run' not in sys.argv:
        write_manifest(list(have.values()))
    if '--dry-run' in sys.argv:
        chars = sum(len(text_for(c)) for c in P)
        hd_chars = sum(len(text_for(c)) for c in P if VOICES[c['voice']][0] == 'hd')
        print(f'{len(P)} clips, {chars} TTS chars ({hd_chars} HD); calibration 32 clips ~{32 * 115} chars')
        usd = (chars - hd_chars) * 15e-6 + hd_chars * 22e-6 + 32 * 115 * 18e-6
        mins = len(P) * 12 / 60
        print(f'estimate: TTS ${usd:.2f}; ASR {mins:.0f} audio-min x 2 engines (MAI-2 assumed <= $1/h, fast $0.36/h) '
              f'<= ${mins / 60 * 1.36:.2f}; total about INR {95 * (usd + mins / 60 * 1.36):.0f} before retries')
        from collections import Counter
        print(Counter('|'.join(c['sets']) + ' ' + c['register'] + ' ' + c['pace'] for c in P))
        return
    if '--recheck' in sys.argv:
        for r in have.values():
            clip = {'turn': r['turn'], 'script': r['script']}
            tk = tokens_for(clip)
            ca, cb = check_engine(r['asr_mai2_phone'], tk), check_engine(r['asr_fast_phone'], tk)
            r['check_mai2'], r['check_fast'] = json.dumps(ca, ensure_ascii=False), json.dumps(cb, ensure_ascii=False)
            r['qa_auto'], r['qa_detail'] = token_status(tk, ca, cb)
        write_manifest(list(have.values()))
        from collections import Counter
        print(Counter(r['qa_auto'] for r in have.values()))
        return
    key = load_env()
    cal = calibrate(key)
    todo = [c for c in P if code_for(c) not in have]
    if '--requeue-fail' in sys.argv:
        todo = [c for c in P if code_for(c) in have and have[code_for(c)]['qa_auto'] == 'fail'
                and VOICES[c['voice']][0] in ('hd', 'indic') and int(have[code_for(c)]['render_attempts']) < 3]
    lock = threading.Lock()
    def job(c):
        att = int(have[code_for(c)]['render_attempts']) + 1 if code_for(c) in have else 1
        row = render_one(key, c, cal, att)
        if row:
            with lock:
                have[row['file_code']] = row
                write_manifest(list(have.values()))
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(job, todo))
    from collections import Counter
    rows = list(have.values())
    print('clips', len(rows), Counter(r['qa_auto'] for r in rows), 'out of range', sum(str(r['in_range']) != 'True' for r in rows),
          'tts chars', sum(int(r['tts_chars']) for r in rows))


if __name__ == '__main__':
    main()
