# VP voice lab: latency of the pieces a v2 call is built from, measured from the lab VM (India). Brains: time to first
# token on the v2 brief with a realistic history. Voices: time to first audio for a short Hinglish reply, for
#   gemini-stream   Gemini 3.8 TTS via streamGenerateContent (the lab's current path, Vertex first)
#   gemini-interact Gemini 3.8 TTS via the Interactions API: style in speech_metadata, 8 kHz mu-law, streamed
#   azure-mai       Azure MAI-Voice-2.1-Flash (hi-IN-Kavya) REST, 8 kHz mu-law, with an express-as style
# n rounds, interleaved so network drift hits every arm. Usage: python voice_bench.py [rounds] [brains,...]
import asyncio, sys, os, time, json, base64, statistics
sys.path.insert(0, os.environ.get('LAB_SERVER_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server'))
import aiohttp
import providers as pv
import persona_v2 as p2

BRAINS = ['gpt-6-luna@or', 'gpt-6-sol@or', 'gpt-5.6-terra@or', 'gpt-5.6-sol@or', 'gemini-3.8-flash', 'gemini-3.6-flash',
          'gemini-3.5-flash-lite', 'gpt-5.4-mini', 'deepseek-v4.1-flash', 'gpt-4.1-mini-in', 'gpt-oss-120b@groq']
TRANSCRIPT = [{'who': 'agent', 'text': 'हेलो, Raghav जी?'}, {'who': 'caller', 'text': 'हाँ बोलो, कौन?'},
              {'who': 'agent', 'text': 'मैं Riya, Suraksha Health की AI assistant... आपकी policy renewal के लिए call किया था।'}]
ASKS = ['अच्छा, premium कितना है इस बार? last year तो पच्चीस हज़ार था', 'यार मैं meeting में हूँ, जल्दी बताओ', 'tum robot ho kya sach mein?',
        'मेरे husband की surgery हुई थी last year, वो cover रहेगा ना?']
LINES = [('playful, amused', 'अरे <chuckle> robot? हाँ भई, AI ही हूँ... पर आपकी policy की बात तो पूरे दिल से करूँगी।'),
         ('soft, warm', 'नहीं नहीं, घबराइए मत... surgery से premium पर कोई असर नहीं पड़ा है।'),
         ('quick, friendly', 'Done, link अभी WhatsApp पर भेज रही हूँ।')]

async def brain_once(http, b, i):
    sys_ = p2.compile_prompt('renewal', caller='Raghav')
    hist = [{'role': 'user', 'content': p2.KICKOFF}]
    for t in TRANSCRIPT: hist.append({'role': 'assistant' if t['who'] == 'agent' else 'user', 'content': t['text']})
    hist.append({'role': 'user', 'content': ASKS[i % len(ASKS)]})
    tr = TRANSCRIPT + [{'who': 'caller', 'text': ASKS[i % len(ASKS)]}]
    msgs = [{'role': 'system', 'content': sys_}] + hist + [{'role': 'system', 'content': p2.tail(tr)}]
    u, tm = {}, {}; out = ''; t0 = time.perf_counter()
    async for d in pv.llm_stream(http, b, msgs, u, tm, max_tokens=160): out += d
    return (tm['first'] - t0) * 1000 if 'first' in tm else None, tm.get('err'), out[:100]

async def tts_stream(http, model, style, text):
    t0 = time.perf_counter(); first = None; n = 0
    async for pcm in pv.gemini_tts(http, model, 'Despina', text, None, {}, {}):
        if first is None: first = time.perf_counter() - t0
        n += len(pcm)
    return first, n / 48000

async def tts_interact(http, model, style, text):
    key = os.environ.get('GEMINI_PAID_KEY', '')
    body = {'model': model, 'stream': True, 'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': style}]}]}],
            'response_format': {'type': 'audio', 'mime_type': 'audio/mulaw', 'sample_rate': 8000}, 'generation_config': {'speech_config': [{'voice': 'Despina'}]}}
    t0 = time.perf_counter(); first = None; n = 0
    async with http.post('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse', headers={'x-goog-api-key': key}, json=body, timeout=aiohttp.ClientTimeout(total=60)) as r:
        if r.status != 200: return None, f'{r.status} {(await r.text())[:120]}'
        async for raw in r.content:
            line = raw.strip()
            if not line.startswith(b'data:'): continue
            try: ev = json.loads(line[5:])
            except Exception: continue
            d = ev.get('delta') or {}
            if d.get('type') == 'audio' and d.get('data'):
                if first is None: first = time.perf_counter() - t0
                n += len(base64.b64decode(d['data']))
    return first, n / 8000

async def tts_mai(http, style, text):
    region = os.environ.get('LAB_SPEECH_REGION', 'centralindia'); key = os.environ.get('LAB_SPEECH_KEY', '')
    mai = {'playful, amused': 'joyful', 'soft, warm': 'softvoice', 'quick, friendly': 'happy'}.get(style, 'neutral')
    ssml = ("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='hi-IN'>"
            f"<voice name='hi-IN-Kavya:MAI-Voice-2.1-Flash'><mstts:express-as style='{mai}'>{text.replace('<chuckle>', '').replace('&', 'and')}</mstts:express-as></voice></speak>")
    t0 = time.perf_counter(); first = None; n = 0
    async with http.post(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode(),
                         headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'raw-8khz-8bit-mono-mulaw'},
                         timeout=aiohttp.ClientTimeout(total=60)) as r:
        if r.status != 200: return None, f'{r.status} {(await r.text())[:120]}'
        async for chunk in r.content.iter_any():
            if first is None and chunk: first = time.perf_counter() - t0
            n += len(chunk)
    return first, n / 8000

async def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    brains = sys.argv[2].split(',') if len(sys.argv) > 2 else BRAINS
    pv.VERTEX.load('/tmp/vb-vertex.jsonl'); pv.GKEYS.load('/tmp/vb-gem.jsonl')
    res = {}
    async with aiohttp.ClientSession() as http:
        for b in brains:
            try: await brain_once(http, b, 0)                     # warm the connection, not measured
            except Exception as e: print('warm', b, repr(e)[:100])
        for i in range(n):
            for b in brains:
                try: ms, err, txt = await brain_once(http, b, i + 1)
                except Exception as e: ms, err, txt = None, repr(e)[:100], ''
                res.setdefault(b, []).append((ms, err, txt))
            for j, (style, text) in enumerate(LINES):
                arms = [('gemini-stream flash', tts_stream(http, 'gemini-3.8-flash-tts', style, text)),
                        ('gemini-stream lite', tts_stream(http, 'gemini-3.8-flash-lite-tts', style, text)),
                        ('gemini-interact flash', tts_interact(http, 'gemini-3.8-flash-tts', style, text)),
                        ('gemini-interact lite', tts_interact(http, 'gemini-3.8-flash-lite-tts', style, text)),
                        ('azure-mai flash', tts_mai(http, style, text))]
                for name, coro in arms:
                    try: first, extra = await coro
                    except Exception as e: first, extra = None, repr(e)[:100]
                    res.setdefault(name, []).append((first * 1000 if first else None, None if first else extra, ''))
    print(f"{'arm':26s} {'n':>3s} {'p50 ms':>7s} {'p90 ms':>7s}  errors / sample")
    for k, v in res.items():
        ok = sorted(x[0] for x in v if x[0] is not None)
        p = lambda q: ok[min(len(ok) - 1, int(q * len(ok)))] if ok else None
        errs = [x[1] for x in v if x[1]][:1]; smp = next((x[2] for x in v if x[2]), '')
        print(f"{k:26s} {len(ok):3d} {str(round(p(.5))) if ok else '-':>7s} {str(round(p(.9))) if ok else '-':>7s}  {errs} {smp[:70]}")

asyncio.run(main())
