# Synthesise fixed passages with Azure Speech voices; record billed chars, audio seconds, TTFB.
# Usage: python3 -I tts_measure.py PASSAGE_DIR RAW_OUT_DIR RESULT_JSON   (reads VP_AI_KEY, VP_AI_REGION from env)
import os, sys, json, time, wave, io, urllib.request, html
PD, RAW, RES = sys.argv[1], sys.argv[2], sys.argv[3]
KEY, REG = os.environ["VP_AI_KEY"], os.environ["VP_AI_REGION"]
RUNS = [
 ("hinglish_deva", "hi-IN-SwaraNeural", "hi-IN", "Neural (S1 $15/1M)"),
 ("hinglish_deva", "en-IN-Aarti:DragonHDLatestNeural", "en-IN", "Neural HD ($22/1M)"),
 ("hinglish_deva", "hi-IN-Kavya:MAI-Voice-2.1-Flash", "hi-IN", "MAI-Voice-2.1-Flash (preview; meter unknown)"),
 ("hinglish_roman", "en-IN-Aarti:DragonHDLatestNeural", "en-IN", "Neural HD ($22/1M)"),
 ("tamil_mix", "ta-IN-PallaviNeural", "ta-IN", "Neural (S1 $15/1M)"),
]
out = []
for p, voice, loc, tier in RUNS:
    text = open(f"{PD}/passage_{p}.txt", encoding="utf-8").read().strip()
    ssml = f"<speak version='1.0' xml:lang='{loc}'><voice name='{voice}'>{html.escape(text, quote=False)}</voice></speak>"
    req = urllib.request.Request(f"https://{REG}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode("utf-8"), method="POST",
        headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "vp-l2-econ"})
    t0 = time.time(); rec = {"passage": p, "voice": voice, "tier": tier, "chars_codepoints": len(text), "words": len(text.split())}
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            first = r.read(4096); ttfb = time.time() - t0; rest = r.read(); total = time.time() - t0
        audio = first + rest
        fn = f"{RAW}/{p}__{voice.replace(':','_')}.wav"; open(fn, "wb").write(audio)
        with wave.open(io.BytesIO(audio)) as w: dur = w.getnframes() / w.getframerate()
        rec.update({"ok": True, "audio_s": round(dur, 2), "ttfb_ms": round(ttfb*1000), "total_ms": round(total*1000), "chars_per_audio_s": round(len(text)/dur, 2), "chars_per_audio_min": round(60*len(text)/dur, 1), "words_per_min": round(60*len(text.split())/dur, 1), "wav": fn})
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:300]
        rec.update({"ok": False, "error": str(e), "body": body.decode("utf-8", "replace")})
    print(json.dumps(rec, ensure_ascii=False)); out.append(rec)
json.dump({"measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "region": REG, "client": "US-hosted sandbox container via proxy", "runs": out}, open(RES, "w"), ensure_ascii=False, indent=1)
