"""Vapi all-in price per connected minute for an Indian outbound call, and a reconstructed Vapi-side COGS.
Inputs are the prices read on 2026-10-20 (vapi.ai/pricing calculator ranges, Twilio India voice pricing page).
Run: python3 -I pricing.py > ../pricing.json"""
import json
FX = 95.0
src = {
  'hosting': (0.05, 0.05, 'vapi.ai/pricing: Pre-paid, $0.05/min Vapi hosting (data/teardown/vapi/pricing/vapi.ai_pricing.html)'),
  'stt_deepgram': (0.0095, 0.0099, 'vapi.ai/pricing calculator, Transcriber Deepgram $0.0095-$0.0099/min'),
  'llm_openai': (0.0077, 0.0452, 'vapi.ai/pricing calculator, Intelligence Model OpenAI $0.0077-$0.0452/min'),
  'tts_elevenlabs': (0.0146, 0.0238, 'vapi.ai/pricing calculator, Voice ElevenLabs $0.0146-$0.0238/min'),
  'telephony_twilio_to_india_mobile': (0.0496, 0.0496, 'twilio.com/en-us/voice/pricing/in: India - Mobile $0.0496/min; Twilio IN guideline: outbound to India only from non-Indian numbers (data/teardown/vapi/pricing/twilio_voice_pricing_in.html)'),
}
lo = sum(v[0] for v in src.values()); hi = sum(v[1] for v in src.values())
floor_no_ai = src['hosting'][0] + src['telephony_twilio_to_india_mobile'][0]
out = {
  'date': '2026-10-20', 'fx_inr_per_usd': FX,
  'components_usd_per_min': {k: {'lo': v[0], 'hi': v[1], 'source': v[2]} for k, v in src.items()},
  'all_in_usd_per_min': {'lo': round(lo, 4), 'hi': round(hi, 4)},
  'all_in_inr_per_min': {'lo': round(lo * FX, 2), 'hi': round(hi * FX, 2)},
  'platform_plus_telephony_floor_inr_per_min': round(floor_no_ai * FX, 2),
  'hosting_fee_inr_per_min': round(0.05 * FX, 2),
  'telephony_inr_per_min': round(0.0496 * FX, 2),
  'compare_2026_10_17_ECO17': 'ECO-17: INR 11.6-17.5 at FX 88 (Vapi + Twilio). Same platform fee; at FX 95 with the India-mobile rate the range is the one above.',
  'fixed_monthly_usd': {
    'usage_only': {'fee': 0, 'concurrent_lines': 4, 'note': 'email support without SLA'},
    'core': {'fee': 29, 'concurrent_lines': 10},
    'pro': {'fee': 'max(999, 10% of hosting fees)', 'concurrent_lines': 30},
    'extra_line': 10, 'extra_org': 20, 'hipaa_addon': 2000,
    'example_30_lines_core': 29 + 20 * 10,
  },
  'vapi_side_cogs_reconstruction': {
    'grade': 'inferred',
    'pass_through': 'STT/LLM/TTS billed "at cost / no markup" (vendor-claimed on pricing page); telephony billed by the customer\'s own carrier (Twilio/Telnyx/Vonage/SIP), so 0 margin to Vapi on those lines unless platform-key volume discounts exist (unknown).',
    'hosting_cost_drivers': ['per-call isolated VM (vendor blog 2025-08-12)', 'Kubernetes multi-cluster + Lambda burst workers', 'own SIP SBC auto-scaling groups (AWS)', 'Daily WebRTC + Twilio/Cloudflare TURN for web calls', 'Neon + Aurora DBs, Redis cache, Kafka/ClickHouse logs (job posts)', 'LLM latency polling ~$400/day (vendor blog 2025-07-14)'],
    'hosting_cogs_usd_per_min_estimate': [0.001, 0.005],
    'hosting_gross_margin_estimate': [0.90, 0.98],
    'basis': 'compute at roughly 0.25-1 vCPU per concurrent call at USD 0.03-0.05 per vCPU-hour = USD 0.0001-0.0008/min, plus media relay, storage, logging and fixed platform cost spread over volume; not measured. An HN user (item 46189900) reported the platform fee was 60-70% of their total spend.',
  },
  'price_floor_note': 'Even at zero AI cost, an Indian outbound minute on Vapi costs the buyer about INR %.2f (hosting %.2f + Twilio India mobile %.2f) before any model, against Indian all-in list prices of INR 3.5-7/min (rejected.2026-10-17.parity-undercut) and VP\'s INR 2-3.5/min target tiers.' % (floor_no_ai * FX, 0.05 * FX, 0.0496 * FX),
}
print(json.dumps(out, indent=1))
