"""Synthflow price and COGS reconstruction for an Indian outbound minute (lane synthflow, 2026-10-20).
Inputs are cited; nothing here is an invoice. Usage: python3 -I pricing.py <out.json>"""
import json, sys
FX = 95.0
src = {
    "enterprise_floor": "synthflow.ai/pricing read 2026-10-20: 'Enterprise contracts start at $30,000 annually' (data/teardown/synthflow/site/pricing.html)",
    "last_public_paygo": "research/2026-10-17/lanes/l4a-competitors/pricing-history.json obs 2026-03-14 and 2026-06-16 (Common Crawl): voice engine $0.09/min + LLM $0.02 (GPT-4.1 mini) .. $0.05 (GPT-4.1) + managed Twilio $0.02 (US)",
    "twilio_india_mobile": "research/2026-10-20/teardown/vapi/pricing.json: twilio.com/en-us/voice/pricing/in India-Mobile $0.0496/min; outbound to India only from non-Indian numbers",
    "vapi_calculator_components": "research/2026-10-20/teardown/vapi/pricing.json: Deepgram $0.0095-0.0099, OpenAI $0.0077-0.0452, ElevenLabs $0.0146-0.0238 per min (pass-through list prices)",
    "plivo_india": "research/2026-10-17/lanes/l2-economics (vendor-and-telephony-prices.csv): Plivo India INR 0.38/min, 30 s pulse; media anchoring in India required",
}
floor_usd_yr = 30000
platform = (0.09 + 0.02, 0.09 + 0.05)          # voice engine + LLM, last public list (H1 2026)
tw_in = 0.0496
allin_twilio = (platform[0] + tw_in, platform[1] + tw_in)
out = {
    "date": "2026-10-20", "fx_inr_per_usd": FX, "sources": src,
    "current_public_price": {"model": "sales-led enterprise only; no per-minute list price published",
        "floor_usd_per_year": floor_usd_yr, "floor_inr_per_year": floor_usd_yr * FX,
        "floor_inr_per_month": round(floor_usd_yr * FX / 12), "grade": "observed"},
    "last_public_per_minute_usd": {"platform_lo": platform[0], "platform_hi": platform[1],
        "platform_inr": [round(platform[0] * FX, 2), round(platform[1] * FX, 2)], "grade": "observed (Common Crawl, 2026-03/06)"},
    "india_outbound_allin_estimate": {
        "path": "last public platform rate + BYO Twilio to an Indian mobile from a non-Indian caller ID (Synthflow sells US/CA/AU numbers only; SIP trunk is Enterprise-only and Synthflow has no India PoP)",
        "usd_per_min": [round(allin_twilio[0], 4), round(allin_twilio[1], 4)],
        "inr_per_min": [round(allin_twilio[0] * FX, 2), round(allin_twilio[1] * FX, 2)],
        "grade": "inferred", "caveat": "the 2026 enterprise per-minute rate is unpublished; the H1 2026 PAYG rate is used as the best public anchor"},
    "effective_inr_per_min_at_floor": {},
    "cogs_reconstruction_usd_per_min": {
        "third_party_stack": {"stt_deepgram": [0.0095, 0.0099], "llm_openai_class": [0.0077, 0.0452],
            "tts_elevenlabs": [0.0146, 0.0238], "own_infra_sbc_freeswitch_janus_gcp": [0.002, 0.006]},
        "grade": "inferred (stack from docs/bundle/job posts; component prices are other vendors' list prices, Synthflow's negotiated rates unknown)"},
}
for vol in (5000, 10000, 25000, 50000):
    floor_per_min = floor_usd_yr / 12 / vol
    lo = max(floor_per_min, allin_twilio[0]); hi = max(floor_per_min, allin_twilio[1])
    out["effective_inr_per_min_at_floor"][f"{vol}_min_per_month"] = [round(lo * FX, 2), round(hi * FX, 2)]
tp = out["cogs_reconstruction_usd_per_min"]["third_party_stack"]
c_lo = sum(v[0] for v in tp.values()); c_hi = sum(v[1] for v in tp.values())
out["cogs_reconstruction_usd_per_min"]["third_party_total"] = [round(c_lo, 4), round(c_hi, 4)]
out["cogs_reconstruction_usd_per_min"]["third_party_total_inr"] = [round(c_lo * FX, 2), round(c_hi * FX, 2)]
out["cogs_reconstruction_usd_per_min"]["gross_margin_vs_last_public_platform_rate"] = [
    round(1 - c_hi / platform[1], 2), round(1 - c_lo / platform[0], 2)]
out["cogs_reconstruction_usd_per_min"]["note"] = ("Since 2026-08-25 non-enterprise agents run on Synthflow LLM, and Synthflow STT/TTS exist; "
    "moving the three AI lines in-house is consistent with pushing COGS below the third-party floor (inferred; in-house cost unknown).")
out["vs_2026_10_17"] = {"pricing_history_typical_usd": [0.15, 0.24], "at_fx95_inr": [round(0.15 * FX, 2), round(0.24 * FX, 2)],
    "change": "no new public per-minute price since 2026-06; enterprise-only floor $30k/yr confirmed unchanged since 2026-09-10"}
json.dump(out, open(sys.argv[1], "w"), indent=1)
print(json.dumps({k: out[k] for k in ("india_outbound_allin_estimate", "effective_inr_per_min_at_floor")}, indent=1))
print(out["cogs_reconstruction_usd_per_min"]["third_party_total"], out["cogs_reconstruction_usd_per_min"]["third_party_total_inr"], out["cogs_reconstruction_usd_per_min"]["gross_margin_vs_last_public_platform_rate"])
