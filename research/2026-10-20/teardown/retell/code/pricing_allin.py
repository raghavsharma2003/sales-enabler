"""All-in INR per connected minute for an Indian outbound call on Retell (rate card read 2026-10-20).

Inputs are the observed public rate card (data/teardown/retell/web/www.retellai.com_pricing.txt,
docs international-call / billing-exceptions pages) plus VP's Indian telephony input
(research/2026-10-18/model/results/inputs.csv: tel_inr_min 0.43, 30 s pulses).
usage: python3 -I pricing_allin.py <out.csv>
"""
import csv
import math
import sys

FX = 95.0
GST = 0.18
INFRA = 0.055            # Retell voice infra, USD/min
TTS = {"platform/cartesia/minimax 0.015": 0.015, "elevenlabs flash 0.040": 0.040, "elevenlabs v3 0.100": 0.100}
LLM = {"gpt-5-mini 0.008": 0.008, "calculator default 0.040": 0.040, "gpt-5.6-terra (recommended) 0.064": 0.064}
BATCH_PER_DIAL = 0.005   # USD per dial
TEL = {
    "retell-twilio US CLI -> India 0.15": ("usd_per_min", 0.15),
    "retell-telnyx US CLI -> India 0.25": ("usd_per_min", 0.25),
    "BYO Indian SIP trunk INR 0.43 (30 s pulse)": ("inr_per_billed_min_30s_pulse", 0.43),
}
LENGTHS = [30, 60, 90, 180]
PROMPT_TOKENS = [3000, 6000]  # >4,000 scales billed duration (billing-exceptions Rule 2)


def row(tel_name, tel, tts_name, tts, llm_name, llm, secs, ptok, scale_scope):
    mins = secs / 60.0
    factor = max(1.0, math.ceil(ptok / 4000 * 100) / 100) if ptok > 4000 else 1.0
    if scale_scope == "llm_only":
        retell = (INFRA + tts) * mins + llm * mins * factor
    else:  # whole Retell duration scaled
        retell = (INFRA + tts + llm) * mins * factor
    kind, val = tel
    if kind == "usd_per_min":
        tel_inr = val * mins * FX
    else:
        tel_inr = val * (math.ceil(secs / 30.0) * 0.5)
    usd = retell + BATCH_PER_DIAL
    inr_call = usd * FX + tel_inr
    per_min = inr_call / mins
    return {
        "telephony": tel_name, "tts": tts_name, "llm": llm_name, "call_seconds": secs,
        "prompt_tokens": ptok, "surcharge_scope": scale_scope if ptok > 4000 else "n/a",
        "inr_per_connected_min_ex_gst": round(per_min, 2),
        "inr_per_connected_min_incl_18pct_gst": round(per_min * (1 + GST), 2),
    }


out = []
for tn, t in TEL.items():
    for sn, s in TTS.items():
        for ln, l in LLM.items():
            for secs in LENGTHS:
                for ptok in PROMPT_TOKENS:
                    scopes = ["llm_only", "whole_duration"] if ptok > 4000 else ["llm_only"]
                    for sc in scopes:
                        out.append(row(tn, t, sn, s, ln, l, secs, ptok, sc))
with open(sys.argv[1], "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
    w.writeheader()
    w.writerows(out)
print(len(out), "rows")
for r in out:
    if r["call_seconds"] == 60 and r["prompt_tokens"] == 3000 and r["tts"].startswith("platform"):
        print(r["telephony"][:30], "|", r["llm"][:30], "|", r["inr_per_connected_min_ex_gst"], r["inr_per_connected_min_incl_18pct_gst"])
