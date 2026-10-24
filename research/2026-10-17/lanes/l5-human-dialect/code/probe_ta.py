# Probe: does ta-IN TTS drop Latin-script English words glued to Tamil suffixes? Usage: python3 -I probe_ta.py RAW_DIR OUT_JSON
import os, sys, json, wave, io, urllib.request, html, uuid
KEY, REG = os.environ["VP_AI_KEY"], os.environ["VP_AI_REGION"]
RAW, OUT = sys.argv[1], sys.argv[2]
VARIANTS = {
 "hyphen_glued": "Shree Ram Motors-ல இருந்து பேசறேன். Hero Splendor Plus-க்கு, 24 monthsக்கு EMI.",
 "space_separated": "Shree Ram Motors ல இருந்து பேசறேன். Hero Splendor Plus க்கு, 24 months க்கு EMI.",
 "tamil_script": "ஸ்ரீ ராம் மோட்டார்ஸ்-ல இருந்து பேசறேன். ஹீரோ ஸ்ப்ளெண்டர் ப்ளஸ்-க்கு, 24 மந்த்ஸ்க்கு ஈஎம்ஐ.",
}
VOICES = [("ta-IN-PallaviNeural", None), ("en-IN-Meera:DragonHDLatestNeural", "ta-IN")]
def tts(text, voice, lang):
    inner = html.escape(text, quote=False)
    if lang: inner = f"<lang xml:lang='{lang}'>{inner}</lang>"
    ssml = f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{voice[:5]}'><voice name='{voice}'>{inner}</voice></speak>"
    req = urllib.request.Request(f"https://{REG}.tts.speech.microsoft.com/cognitiveservices/v1", data=ssml.encode(), method="POST",
        headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "vp-l5"})
    return urllib.request.urlopen(req, timeout=120).read()
def stt(audio, locales):
    b = "----" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + audio + \
           (f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"definition\"\r\n\r\n" + json.dumps({"locales": locales}) + f"\r\n--{b}--\r\n").encode()
    req = urllib.request.Request(f"https://{REG}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15", data=body, method="POST",
          headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": f"multipart/form-data; boundary={b}"})
    d = json.load(urllib.request.urlopen(req, timeout=180)); return " ".join(p["text"] for p in d.get("combinedPhrases", []))
out = []
for k, t in VARIANTS.items():
    for v, l in VOICES:
        a = tts(t, v, l); fn = f"{RAW}/probe_{k}__{v.replace(':','_')}.wav"; open(fn, "wb").write(a)
        with wave.open(io.BytesIO(a)) as w: dur = w.getnframes()/w.getframerate()
        rec = {"variant": k, "voice": v, "text": t, "audio_s": round(dur, 2), "asr_ta": stt(a, ["ta-IN"])}
        print(json.dumps(rec, ensure_ascii=False)); out.append(rec)
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
