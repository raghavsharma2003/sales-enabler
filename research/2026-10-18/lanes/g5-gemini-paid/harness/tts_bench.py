# g5-gemini-paid: Gemini TTS bench on the PAID key. gemini-3.8-flash-tts and gemini-3.8-flash-lite-tts, 20 short Hinglish
# agent lines with natural-language style prompts, voice Despina (Meera's). Per request: time to first audio byte
# (streamGenerateContent?alt=sse, and non-streaming generateContent for comparison), total time, audio seconds, real-time
# factor, usageMetadata and its cost at paid Standard list price. One ledger line per request.
# Usage: python tts_bench.py OUT_DIR --ledger L --stop-file S [--reps-stream 2] [--save N] [--budget-usd B]
import argparse, base64, json, os, sys, time, wave
import requests
HERE = os.path.dirname(os.path.abspath(__file__))
API = 'https://generativelanguage.googleapis.com/v1beta/models/'
MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
# paid Standard, USD per 1M tokens: (text in, audio out) now -> 2026-12-31, and from 2027-01-01 (g1 prices.json)
PRICE = {'gemini-3.8-flash-tts': ((0.50, 9.00), (1.00, 18.00)), 'gemini-3.8-flash-lite-tts': ((0.50, 6.00), (1.00, 12.00))}
LINES = [
 ('Say warmly and politely, like a kind didi from the branch, at an easy phone-call pace', 'नमस्ते जी, मैं सुरक्षा हेल्थ से आशा बोल रही हूँ, क्या अभी दो मिनट बात हो सकती है?'),
 ('Say in a calm, reassuring voice to a worried caller', 'आप बिल्कुल चिंता मत कीजिए, डेढ़ लाख का bill आपके cover के अंदर है।'),
 ('Say slowly and clearly to an elderly woman who is hard of hearing', 'जी अम्मा जी, आपकी policy पंद्रह नवंबर को renew होनी है।'),
 ('Say cheerfully, with a smile', 'अरे वाह, बधाई हो! तो चलिए, नई policy में बेटी का नाम भी जोड़ देते हैं।'),
 ('Say apologetically and sincerely', 'माफ़ कीजिए, मुझसे गलती हो गई, सही premium चौबीस हज़ार पाँच सौ रुपये है।'),
 ('Say calmly, confirming the details', 'तो मैं confirm कर लूँ, कल साढ़े तीन बजे callback, ठीक है?'),
 ('Say plainly and honestly, without hesitation', 'जी, मैं सुरक्षा हेल्थ की AI assistant हूँ, चाहें तो मैं किसी advisor से call करवा दूँ।'),
 ('Say gently, with real empathy', 'ओह, ये सुनकर बहुत बुरा लगा, पहले आप अपना ध्यान रखिए, बाकी बातें हम बाद में कर लेंगे।'),
 ('Say briskly and efficiently to a caller in a hurry', 'बस एक line में बताऊँ तो, premium चौबीस हज़ार पाँच सौ, due date पंद्रह नवंबर।'),
 ('Say warmly, closing a friendly call', 'आपसे बात करके अच्छा लगा, renewal का link WhatsApp पे आ जाएगा, ध्यान रखिए।'),
 ('Say softly, as a listening backchannel', 'हाँ जी, हाँ, मैं सुन रही हूँ, आप आराम से बताइए।'),
 ('Say patiently, repeating the number clearly', 'कोई बात नहीं, मैं फिर से बताती हूँ, quarterly option में छह हज़ार तीन सौ रुपये हर तीन महीने।'),
 ('Say reassuringly', 'अगर date निकल भी जाए, तो भी तीस दिन का grace period मिलता है।'),
 ('Say with light, friendly humour', 'AQI का तो मुझे पता नहीं, पर आपकी policy की date ज़रूर याद है!'),
 ('Say firmly but kindly, as a safety reminder', 'मैं आपसे कभी OTP या card number नहीं माँगूँगी, payment सिर्फ़ WhatsApp link से होगा।'),
 ('Say tenderly to an elderly caller, slowly', 'आपने खाना खाया? अच्छा, तो आराम से, मैं धीरे धीरे बताती हूँ।'),
 ('Say in a bright, informative tone', 'Cashless इलाज आठ हज़ार से ज़्यादा hospitals में मिलता है।'),
 ('Say carefully, making clear it is an estimate', 'सत्तर साल के parent के लिए premium लगभग अठारह से बाईस हज़ार हो सकता है, advisor confirm करेंगे।'),
 ('Say politely and apologetically', 'बिल्कुल, मैं आपको दोबारा call नहीं करूँगी, sorry for the trouble.'),
 ('Say affectionately, saying goodbye to an elderly caller', 'अपना ख़याल रखिएगा अम्मा जी, नमस्ते।'),
]
def key():
    k = os.environ.get('GEMINI_PAID_KEY')
    if k: return k
    env = dict(l.strip().split('=', 1) for l in open('/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/vp-gemini-or.env') if '=' in l and not l.startswith('#'))
    return env['GEMINI_PAID_KEY']
def body(style, line):
    return {'contents': [{'parts': [{'text': f'{style}: {line}'}]}],
            'generationConfig': {'responseModalities': ['AUDIO'],
                                 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': 'Despina'}}}}}
def cost(model, um):
    (ti, ao), (ti2, ao2) = PRICE[model]
    tin = sum(x['tokenCount'] for x in um.get('promptTokensDetails', []) if x.get('modality') == 'TEXT') or um.get('promptTokenCount', 0)
    aout = sum(x['tokenCount'] for x in um.get('candidatesTokensDetails', []) if x.get('modality') == 'AUDIO') or um.get('candidatesTokenCount', 0)
    other_out = (um.get('candidatesTokenCount', 0) or 0) - aout + (um.get('thoughtsTokenCount', 0) or 0)
    return tin, aout, other_out, (tin * ti + aout * ao + max(other_out, 0) * ao) / 1e6, (tin * ti2 + aout * ao2 + max(other_out, 0) * ao2) / 1e6
def run_one(s, model, style, line, stream):
    url = API + model + (':streamGenerateContent?alt=sse' if stream else ':generateContent')
    t0 = time.perf_counter(); ttfb = None; pcm = bytearray(); um = {}; nchunks = 0; mime = None; err = None
    try:
        r = s.post(url, json=body(style, line), headers={'x-goog-api-key': key()}, stream=stream, timeout=120)
        if r.status_code != 200:
            return {'http': r.status_code, 'err': r.text[:300]}
        if stream:
            for raw in r.iter_lines(decode_unicode=True):
                if not raw or not raw.startswith('data:'): continue
                d = json.loads(raw[5:])
                for c in d.get('candidates', []):
                    for p in (c.get('content') or {}).get('parts', []):
                        if p.get('inlineData', {}).get('data'):
                            if ttfb is None: ttfb = time.perf_counter() - t0
                            pcm += base64.b64decode(p['inlineData']['data']); nchunks += 1; mime = p['inlineData'].get('mimeType')
                if d.get('usageMetadata'): um = d['usageMetadata']
        else:
            d = r.json(); ttfb = time.perf_counter() - t0
            for c in d.get('candidates', []):
                for p in (c.get('content') or {}).get('parts', []):
                    if p.get('inlineData', {}).get('data'):
                        pcm += base64.b64decode(p['inlineData']['data']); nchunks += 1; mime = p['inlineData'].get('mimeType')
            um = d.get('usageMetadata', {})
    except Exception as e:
        err = f'{type(e).__name__}: {str(e)[:200]}'
    t_total = time.perf_counter() - t0
    sr = 24000
    if mime and 'rate=' in mime:
        try: sr = int(mime.split('rate=')[1].split(';')[0])
        except Exception: pass
    if pcm[:4] == b'RIFF':  # non-streaming returns a WAV container (audio/wav); streaming returns raw audio/l16 chunks
        import io
        with wave.open(io.BytesIO(bytes(pcm))) as w:
            sr = w.getframerate(); pcm = bytearray(w.readframes(w.getnframes()))
    audio_s = len(pcm) / 2 / sr
    return {'http': 200 if not err else None, 'err': err, 'ttfb_ms': round(ttfb * 1000, 1) if ttfb else None, 'total_ms': round(t_total * 1000, 1),
            'audio_s': round(audio_s, 3), 'rtf': round(t_total / audio_s, 3) if audio_s else None, 'chunks': nchunks, 'mime': mime,
            'usage': um, '_pcm': bytes(pcm), '_sr': sr}
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--ledger', required=True); ap.add_argument('--stop-file', required=True)
    ap.add_argument('--reps-stream', type=int, default=2); ap.add_argument('--save', type=int, default=3)
    ap.add_argument('--budget-usd', type=float, default=18.0); ap.add_argument('--lines', type=int, default=20)
    ap.add_argument('--vantage', default=os.uname().nodename)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    s = requests.Session()
    # warm the connection (TLS) with a free models.get so the first measured request is not paying the handshake
    s.get(API + MODELS[0], headers={'x-goog-api-key': key()}, timeout=30)
    rows = open(os.path.join(a.out, 'tts.jsonl'), 'a')
    def spent():
        tot = 0.0
        if os.path.exists(a.ledger):
            for l in open(a.ledger):
                try: tot += float(json.loads(l).get('usd', 0))
                except Exception: pass
        return tot
    for i, (style, line) in enumerate(LINES[:a.lines]):
        models = MODELS if i % 2 == 0 else MODELS[::-1]
        for model in models:
            for mode in ['stream'] * a.reps_stream + ['nonstream']:
                if os.path.exists(a.stop_file) or spent() > a.budget_usd - 0.05:
                    print('STOP: budget or stop file'); return
                res = run_one(s, model, style, line, mode == 'stream')
                pcm, sr = res.pop('_pcm', b''), res.pop('_sr', 24000)
                um = res.get('usage') or {}
                tin, aout, oth, usd, usd27 = cost(model, um) if um else (0, 0, 0, 0.0, 0.0)
                rec = {'utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'vantage': a.vantage, 'line': i, 'style': style,
                       'chars': len(line), 'model': model, 'mode': mode, **res, 'text_in_tok': tin, 'audio_out_tok': aout, 'other_out_tok': oth,
                       'usd': round(usd, 7), 'usd_2027': round(usd27, 7)}
                rows.write(json.dumps(rec, ensure_ascii=False) + '\n'); rows.flush()
                with open(a.ledger, 'a') as f:
                    f.write(json.dumps({'utc': rec['utc'], 'lane': 'g5-gemini-paid', 'tag': f'tts_{a.vantage}_{model}_{mode}_l{i}', 'model': model, 'kind': 'tts',
                                        'tokens': {'in_TEXT': tin, 'out_AUDIO': aout, 'out_other': oth}, 'usd': round(usd, 7)}) + '\n')
                if i < a.save and mode == 'nonstream' and pcm:
                    with wave.open(os.path.join(a.out, f'tts_{model}_l{i:02d}.wav'), 'wb') as w:
                        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm)
                print(json.dumps({k: rec.get(k) for k in ('line', 'model', 'mode', 'http', 'err', 'ttfb_ms', 'total_ms', 'audio_s', 'rtf', 'chunks', 'audio_out_tok', 'usd')}, ensure_ascii=False), flush=True)
                time.sleep(0.3)
if __name__ == '__main__':
    main()
