# Verify synthesized clips by Azure Fast Transcription. Usage: python3 -I fast_transcribe_check.py TTS_RESULT_JSON OUT_JSON
import os, sys, json, uuid, urllib.request
KEY, REG = os.environ["VP_AI_KEY"], os.environ["VP_AI_REGION"]
res = json.load(open(sys.argv[1])); out = []
for r in res["runs"]:
    if not r.get("ok"): continue
    loc = {"hinglish_deva": ["hi-IN", "en-IN"], "hinglish_roman": ["hi-IN", "en-IN"], "tamil_mix": ["ta-IN", "en-IN"]}[r["passage"]]
    b = "----" + uuid.uuid4().hex; audio = open(r["wav"], "rb").read()
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + audio + \
           (f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"definition\"\r\n\r\n" + json.dumps({"locales": loc[:1]}) + f"\r\n--{b}--\r\n").encode()
    req = urllib.request.Request(f"https://{REG}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15", data=body, method="POST",
          headers={"Ocp-Apim-Subscription-Key": KEY, "Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=180)); txt = " ".join(p["text"] for p in d.get("combinedPhrases", []))
        rec = {"voice": r["voice"], "passage": r["passage"], "durationMs": d.get("durationMilliseconds"), "transcript_chars": len(txt), "transcript_words": len(txt.split()), "source_words": r["words"], "transcript": txt}
    except Exception as e:
        rec = {"voice": r["voice"], "error": str(e), "body": getattr(e, "read", lambda: b"")()[:300].decode("utf-8", "replace")}
    print(json.dumps({k: v for k, v in rec.items() if k != "transcript"}, ensure_ascii=False)); out.append(rec)
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
