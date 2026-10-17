# Ask an Azure-hosted LLM (vp account) to write matched sales turns. Usage: python3 -I gen_text.py OUT_JSON
import os, sys, json, urllib.request, time
EP = os.environ["VP_OPENAI_ENDPOINT"].rstrip("/"); KEY = os.environ["VP_AI_KEY"]
DEP = "l5-gpt-5-4"
SYS = ("You write test stimuli for a listening study on Indian voice agents. Output strict JSON only. "
       "Write natural SPOKEN register as a real telecaller from that region would speak on the phone, not written or literary language.")
USER = """Scenario: an outbound follow-up call. The customer filled an enquiry form yesterday on a two-wheeler dealer's website for a Hero Splendor Plus on EMI. The caller is an AI assistant named Priya calling for "Shree Ram Motors". She must say she is an AI assistant in the first sentence. Content of the single turn, in this order: greeting + AI disclosure + reason for call; on-road price Rs 82,500; down payment Rs 15,000; EMI about Rs 2,950 for 24 months; asks if a test ride on Saturday 25 October at 11 am suits them, or another time. About 60-75 words. Use digits for amounts, dates and times.

Return JSON with keys:
"bhojpuri_mix": the turn for a customer in Siwan, Bihar: Bhojpuri-dominant with Hindi and the common English loanwords a Bhojpuri-speaking telecaller in Patna really uses (EMI, test ride, down payment). Devanagari script. Use genuine Bhojpuri grammar (verb endings, pronouns like raua/hamni, copula ba/bani) not Hindi with one Bhojpuri word.
"neutral_hinglish": the same content in neutral urban Hindi-English (Hinglish) as a Delhi or Mumbai telecaller speaks, Devanagari script.
"tamil_mix_latin_english": the same content for a customer in Madurai: colloquial spoken Tamil-English code-mix, Tamil words in Tamil script and English words in Latin script.
"tamil_mix_all_tamil_script": exactly the same words as tamil_mix_latin_english but English loanwords transliterated into Tamil script.
"bhojpuri_markers": array of objects {"bhojpuri": token as written in bhojpuri_mix, "hindi_equivalent": ..., "note": ...} for every token in bhojpuri_mix that is Bhojpuri and NOT standard Hindi.
"gloss_en": English translation of the turn.
"""
body = {"messages": [{"role": "system", "content": SYS}, {"role": "user", "content": USER}],
        "max_completion_tokens": 4000, "response_format": {"type": "json_object"}}
req = urllib.request.Request(f"{EP}/openai/deployments/{DEP}/chat/completions?api-version=2025-04-01-preview",
      data=json.dumps(body).encode(), method="POST", headers={"api-key": KEY, "Content-Type": "application/json"})
t0 = time.time()
try:
    d = json.load(urllib.request.urlopen(req, timeout=180))
except urllib.error.HTTPError as e:
    print(e.code, e.read()[:600].decode()); sys.exit(1)
out = {"model": d.get("model"), "deployment": DEP, "usage": d.get("usage"), "latency_s": round(time.time()-t0, 1),
       "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "prompt_system": SYS, "prompt_user": USER,
       "content": json.loads(d["choices"][0]["message"]["content"])}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
print(json.dumps(out["usage"]), out["model"])
