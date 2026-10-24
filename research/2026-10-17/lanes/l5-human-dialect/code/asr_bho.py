# Re-transcribe Hindi-belt clips with Azure bho-IN fast transcription. Usage: python3 -I asr_bho.py TTS_RUNS_JSON OUT_JSON
import os, sys, json, uuid, urllib.request
KEY, REG = os.environ["VP_AI_KEY"], os.environ["VP_AI_REGION"]
res = json.load(open(sys.argv[1])); out = []
def transcribe(wav, locales):
    b = "----" + uuid.uuid4().hex; audio = open(wav, "rb").read()
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + audio + \
           (f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"definition\"\r\n\r\n" + json.dumps({"locales": locales}) + f"\r\n--{b}--\r\n").encode()
    req = urllib.request.Request(f"https://{REG}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15", data=body, method="POST",
          headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=180))
for r in res["runs"]:
    if r["text_key"] not in ("bhojpuri_mix", "neutral_hinglish"): continue
    rec = {"text_key": r["text_key"], "voice": r["voice"]}
    for tag, locs in (("bho", ["bho-IN"]), ("lid_hi_bho", ["hi-IN", "bho-IN"])):
        try:
            d = transcribe(r["wav"], locs)
            rec[tag] = {"locales": locs, "text": " ".join(p["text"] for p in d.get("combinedPhrases", [])), "phrase_locales": [p.get("locale") for p in d.get("phrases", [])]}
        except Exception as e:
            rec[tag] = {"locales": locs, "error": str(e), "body": getattr(e, "read", lambda: b"")()[:300].decode("utf-8", "replace")}
    print(json.dumps({"k": r["text_key"], "v": r["voice"], "lid": rec["lid_hi_bho"].get("phrase_locales"), "err": rec["bho"].get("error"), "body": rec["bho"].get("body")}, ensure_ascii=False), flush=True); out.append(rec)
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
