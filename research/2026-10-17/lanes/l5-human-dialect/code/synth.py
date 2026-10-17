# Synthesize l5 stimuli with Azure Speech voices. Usage: python3 -I synth.py STIMULI_JSON RAW_DIR RESULT_JSON
import os, sys, json, time, wave, io, urllib.request, html
ST, RAW, RES = sys.argv[1], sys.argv[2], sys.argv[3]
KEY, REG = os.environ["VP_AI_KEY"], os.environ["VP_AI_REGION"]
C = json.load(open(ST))["content"]
HI_VOICES = [("hi-IN-SwaraNeural", None), ("hi-IN-MadhurNeural", None), ("hi-IN-Kavya:MAI-Voice-2.1", None),
             ("hi-IN-Diya:DragonLatestNeural", None), ("en-IN-Aarti:DragonHDLatestNeural", "hi-IN"), ("en-IN-AartiIndicNeural", "hi-IN")]
TA_VOICES = [("ta-IN-PallaviNeural", None), ("ta-IN-ValluvarNeural", None), ("en-IN-Meera:DragonHDLatestNeural", "ta-IN"), ("en-IN-AartiIndicNeural", "ta-IN")]
RUNS = [(t, v, l) for t in ("bhojpuri_mix", "neutral_hinglish") for v, l in HI_VOICES] + \
       [(t, v, l) for t in ("tamil_mix_latin_english", "tamil_mix_all_tamil_script") for v, l in TA_VOICES]
out = []; chars = 0
for tkey, voice, lang in RUNS:
    text = C[tkey].strip(); loc = voice[:5]
    inner = html.escape(text, quote=False)
    if lang: inner = f"<lang xml:lang='{lang}'>{inner}</lang>"
    ssml = f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='{loc}'><voice name='{voice}'>{inner}</voice></speak>"
    req = urllib.request.Request(f"https://{REG}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode("utf-8"), method="POST",
        headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "vp-l5-dialect"})
    t0 = time.time(); rec = {"text_key": tkey, "voice": voice, "lang_tag": lang, "chars": len(text), "words": len(text.split())}
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            first = r.read(4096); ttfb = time.time() - t0; rest = r.read()
        audio = first + rest
        fn = f"{RAW}/{tkey}__{voice.replace(':','_')}.wav"; open(fn, "wb").write(audio)
        with wave.open(io.BytesIO(audio)) as w: dur = w.getnframes() / w.getframerate()
        rec.update({"ok": True, "audio_s": round(dur, 2), "ttfb_ms": round(ttfb*1000), "words_per_min": round(60*len(text.split())/dur, 1), "wav": fn}); chars += len(text)
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:300]
        rec.update({"ok": False, "error": str(e), "body": body.decode("utf-8", "replace")})
    print(json.dumps({k: v for k, v in rec.items() if k != "wav"}, ensure_ascii=False)); out.append(rec)
json.dump({"measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "region": REG, "billed_chars_est": chars, "runs": out}, open(RES, "w"), ensure_ascii=False, indent=1)
print("chars synthesized", chars)
