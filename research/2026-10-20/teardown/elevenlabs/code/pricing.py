"""All-in INR/min for an Indian outbound ElevenAgents call, and a reconstructed COGS from the identified stack.
Every input is cited; list prices only (no invoice). FX 95 INR/USD.
Run: python3 -I research/2026-10-20/teardown/elevenlabs/code/pricing.py > research/2026-10-20/teardown/elevenlabs/pricing-allin.json"""
import json
FX = 95.0
P = 'data/teardown/elevenlabs/pricing/'
G4 = 'research/2026-10-18/lanes/g4-market-selfhost/'
platform = {'usd': 0.08, 'burst_usd': 0.16, 'src': P + 'elevenlabs.io_pricing_agents.html.txt ("Additional call minutes cost $0.08 per minute (burst pricing $0.16 per minute ...)"; LLM billed separately; ElevenLabs adds no telephony fee)'}
# plan-included minutes: every plan prices to $0.08/min
plans = {'Starter': (6, 75), 'Creator': (22, 275), 'Pro': (99, 1238), 'Scale': (299, 3738), 'Business': (990, 12375)}
plan_rate = {k: round(v[0] / v[1], 4) for k, v in plans.items()}
# LLM pass-through: g4 workload (19,688 in + 396 out tokens/connected min), flash-lite class, cached vs no cache; +10% Vertex regional uplift
llm_inr = {'lo': round(0.175 * 1.10, 3), 'hi': round(0.655 * 1.10, 3),
           'src': G4 + 'prices.csv rows gemini-3.1-flash-lite (INR 0.175/min with 83% cache) and gemini-3.5-flash-lite (INR 0.655/min no cache); x1.10 for the Vertex regional uplift stated in data/teardown/elevenlabs/docs-md/eleven-agents__customization__llm.md. ElevenAgents default LLM in the OpenAPI schema is gemini-2.5-flash (not priced in g4; same flash class).'}
tel = {'plivo_or_exotel_inr': {'lo': 0.38, 'hi': 0.60, 'src': 'research/2026-10-17/lanes/l2-economics/report.md rows 10/12 and line 360: Plivo India INR 0.38/min (30 s pulse), INR 0.60 in a competitor comparison; Exotel rates are quote-gated'},
       'twilio_to_india_mobile_inr': {'lo': round(0.0496 * FX, 2), 'hi': round(0.0699 * FX, 2), 'src': 'research/2026-10-17/lanes/l2-economics/report.md row 12: Twilio India $0.0496-0.0699/min (outbound to India only from non-Indian numbers per the vapi lane)'}}
plat_inr = round(platform['usd'] * FX, 2); burst_inr = round(platform['burst_usd'] * FX, 2)
allin = {
    'standard_exotel_or_plivo': {'lo': round(plat_inr + llm_inr['lo'] + tel['plivo_or_exotel_inr']['lo'], 2), 'hi': round(plat_inr + llm_inr['hi'] + tel['plivo_or_exotel_inr']['hi'], 2)},
    'burst_exotel_or_plivo': {'lo': round(burst_inr + llm_inr['lo'] + tel['plivo_or_exotel_inr']['lo'], 2), 'hi': round(burst_inr + llm_inr['hi'] + tel['plivo_or_exotel_inr']['hi'], 2)},
    'standard_twilio': {'lo': round(plat_inr + llm_inr['lo'] + tel['twilio_to_india_mobile_inr']['lo'], 2), 'hi': round(plat_inr + llm_inr['hi'] + tel['twilio_to_india_mobile_inr']['hi'], 2)},
}
# Own-API transfer price: what the same ASR + TTS would cost a customer on ElevenLabs' own API list
asr_usd_min = 0.39 / 60   # Scribe v2 Realtime $0.39/hour (pricing/elevenlabs.io_pricing_api.html.txt)
tts_usd_min = 0.04 * 0.352  # Flash/Turbo $0.04 per 1K chars x 352 chars per connected minute (g4 workload)
own_api = {'asr_usd': round(asr_usd_min, 4), 'tts_usd': round(tts_usd_min, 4), 'sum_usd': round(asr_usd_min + tts_usd_min, 4),
           'platform_fee_over_own_api_x': round(platform['usd'] / (asr_usd_min + tts_usd_min), 2),
           'src': P + 'elevenlabs.io_pricing_api.html.txt (Scribe v2 Realtime $0.39/h; Flash/Turbo $0.04 per 1K chars); 352 chars/min from ' + G4 + 'findings.md'}
# COGS reconstruction (inference): own ASR + own TTS on own GPUs, LiveKit media on GCP, LLM passed through at cost
cogs_inr = {
    'asr_own_gpu': {'lo': 0.03, 'hi': 0.09, 'basis': G4 + 'findings.md self-host table: IndicConformer/Riva-class streaming ASR on L4/T4 at 30-70% utilisation (INR 0.03-0.09/min); assumed comparable to Scribe realtime cost'},
    'tts_own_gpu': {'lo': 0.07, 'hi': 0.34, 'basis': G4 + 'findings.md: Veena/Orpheus-class 3B TTS on H100 INR 0.07-0.34/min across clouds/utilisation; assumed comparable to Eleven v4 Turbo'},
    'media_orchestration': {'lo': 0.10, 'hi': 0.95, 'basis': 'upper bound = LiveKit Cloud agent-session list $0.01/min (pricing-history.json LiveKit 2026-10-17) x 95; self-hosted LiveKit on GCP (observed livekit.rtc.*.elevenlabs.io on GCP) should be below it; lower bound assumed'},
}
cogs = {'lo': round(sum(v['lo'] for v in cogs_inr.values()), 2), 'hi': round(sum(v['hi'] for v in cogs_inr.values()), 2)}
out = {'date': '2026-10-20', 'fx_inr_per_usd': FX,
       'platform': {'usd_per_min': platform['usd'], 'burst_usd_per_min': platform['burst_usd'], 'inr_per_min': plat_inr, 'burst_inr_per_min': burst_inr, 'plan_effective_usd_per_min': plan_rate,
                    'silence_billing': 'silent periods billed at 5% of the per-minute rate (docs-md/eleven-agents__customization__llm__optimizing-costs.md)', 'text_message_usd': 0.003, 'src': platform['src']},
       'llm_passthrough_inr_per_min': llm_inr, 'telephony_inr_per_min': tel,
       'all_in_inr_per_min': allin,
       'own_api_transfer_price': own_api,
       'reconstructed_cogs_platform_inr_per_min': {'components': cogs_inr, 'total': cogs,
                                                   'implied_gross_margin_on_platform_fee': {'lo': round(1 - cogs['hi'] / plat_inr, 3), 'hi': round(1 - cogs['lo'] / plat_inr, 3)},
                                                   'grade': 'inferred (GPU-cost analogues, not ElevenLabs data)'},
       'history': {'2026-06-06': '$0.08/min (Common Crawl, l4a pricing-history.json)', '2026-10-17': '$0.08/min, burst $0.16 (l4a live read; INR 7.04 at FX 88)', '2026-10-20': '$0.08/min, burst $0.16, LLM extra, telephony BYO (this read): unchanged in USD; INR 7.60 at FX 95'}}
print(json.dumps(out, indent=1))
