# g4-market-selfhost (2026-10-18): published prices -> INR per connected minute, self-host estimates, vendor risk.
# No paid API calls. Every price row carries its source URL, read date and method. Raw pages are in
# scratchpad research-raw-1018/g4-market-selfhost/{pages,terms,hf,gh}. Run: python3 compute.py
import csv, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
FX = 95.0            # INR per USD (task instruction)
D = '2026-10-18'     # date every page below was read

# ------------------------------------------------------------------------------------------------
# WORKLOAD per connected minute (matches g3 reference shape "ref 5/min, agent 40%"; l2 measured chars)
# ------------------------------------------------------------------------------------------------
W = dict(
    exchanges_per_min=5,            # g3 analyze.py reference shape
    agent_speech_s=24.0,            # 40% agent talk share (g3 reference)
    caller_speech_s=24.0,           # 40% caller talk share (g3 reference)
    tts_chars_per_agent_min=800,    # l2 measured 612 (Swara) / 803 (MAI-Voice) / 1038 (DragonHD); range 610-1040
    tts_waste=1.10,                 # synthesised-but-not-played (l2 base)
    stt_streamed_s=60.0,            # streaming STT billed on the whole streamed call (Azure/Deepgram/ElevenLabs convention)
    stt_vad_gated_s=30.0,           # alt: VAD-gated (caller share x 1.25, as g3)
    llm_in_tok_per_exch=2500,       # ~1.6k system (g3 component_bench prompt) + avg history + context
    llm_out_tok_per_exch=60,
    llm_waste=1.2,                  # prefetch/hedge/retry multiplier (l2 base 1.2)
    llm_cache_share=0.70,           # share of input tokens served from prompt cache where the provider caches
    gem_tts_audio_tok_per_s=25,     # Gemini TTS audio tokens/s (g1; g3 measured 24.8)
    gem_tts_text_tok=150,           # text-in tokens for ~352 chars (assumption)
)
TTS_CHARS = W['agent_speech_s'] / 60 * W['tts_chars_per_agent_min'] * W['tts_waste']          # 352
TTS_CHARS_HI = W['agent_speech_s'] / 60 * 1000 * W['tts_waste']                              # 440 (vendor ~1000 chars/min convention)
LLM_IN = W['exchanges_per_min'] * W['llm_in_tok_per_exch'] * W['llm_waste']                   # 15,000
LLM_OUT = W['exchanges_per_min'] * W['llm_out_tok_per_exch'] * W['llm_waste']                 # 360
AGENT_AUDIO_S = W['agent_speech_s'] * W['tts_waste']                                         # 26.4

rows = []
def add(component, vendor, product, unit_price, unit, currency, inr_per_min, basis, inr_alt=None, alt_basis='',
        hindi='', url='', method='read-primary', conf='high', notes='', date=D):
    rows.append(dict(component=component, vendor=vendor, product=product, unit_price=unit_price, unit=unit, currency=currency,
                     inr_per_conn_min=round(inr_per_min, 3) if inr_per_min is not None else '',
                     workload_basis=basis, inr_per_conn_min_alt=round(inr_alt, 3) if inr_alt is not None else '',
                     alt_basis=alt_basis, hindi_support=hindi, source=url, date_read=date, method=method,
                     confidence=conf, notes=notes))

# ---------------- TTS: USD (or INR) per 1M characters ----------------
def tts_usd_per_1m(v, product, usd, url, hindi, notes='', conf='high', method='read-primary'):
    add('TTS', v, product, usd, 'per 1M chars', 'USD', TTS_CHARS * usd / 1e6 * FX, f'{TTS_CHARS:.0f} billed chars/min (24 s agent speech x 800 chars/agent-min x 1.10 waste)',
        TTS_CHARS_HI * usd / 1e6 * FX, f'{TTS_CHARS_HI:.0f} chars/min (1,000 chars/agent-min vendor convention)', hindi, url, method, conf, notes)
def tts_inr_per_1k(v, product, inr1k, url, hindi, notes=''):
    add('TTS', v, product, inr1k, 'per 1K chars', 'INR', TTS_CHARS * inr1k / 1e3, f'{TTS_CHARS:.0f} billed chars/min', TTS_CHARS_HI * inr1k / 1e3, f'{TTS_CHARS_HI:.0f} chars/min', hindi, url, notes=notes)

EL = 'https://elevenlabs.io/pricing/api'
tts_usd_per_1m('ElevenLabs', 'Eleven v4 / v3 / v2 Multilingual (API PAYG)', 80.0, EL, 'yes (70-90+ languages)', 'v4 launched (banner "Introducing Eleven v4"); usage billed in USD; Business plan says low-latency TTS as low as 5c/min')
tts_usd_per_1m('ElevenLabs', 'v4 Turbo / v3 Conversational / Flash-Turbo (API PAYG)', 40.0, EL, 'yes', 'realtime-tuned models; ~75-280 ms vendor latency')
CA = 'https://cartesia.ai/pricing'
tts_usd_per_1m('Cartesia', 'Sonic-3.6 on Scale plan ($299/mo for 8M credits; 1 credit = 1 char)', 299 / 8.0, CA, 'yes (Hinglish voices per l7 radar 2026-08-27)', 'overage $38/1M on Scale; $45 Startup; $65 Pro')
tts_usd_per_1m('Cartesia', 'Sonic-3.6 overage on Pro plan', 65.0, CA, 'yes', 'small-volume rate')
add('TTS', 'Hume', 'Octave 2 (preview)', '', 'n/a', 'USD', None, 'API sunset: access ends 2026-11-13; pricing page no longer lists voice APIs',
    hindi='Octave 2 lists Hindi', url='https://dev.hume.ai/docs/text-to-speech-tts/overview', conf='high', notes='KILL: Hume is sunsetting TTS and EVI APIs; data deleted after 2026-11-13')
MM = 'https://platform.minimax.io/docs/guides/pricing'
tts_usd_per_1m('MiniMax', 'speech-2.8-hd (T2A sync)', 100.0, MM, 'not verified', 'legacy speech-2.6/02 same price')
tts_usd_per_1m('MiniMax', 'speech-2.8-turbo (T2A sync)', 60.0, MM, 'not verified')
IW = 'https://inworld.ai/pricing'
tts_usd_per_1m('Inworld', 'Realtime TTS-2 (On-Demand)', 25.0, IW, 'yes (Hindi Tier 1 per inworld.ai/tts)', 'Growth $12.50; Enterprise as low as $5')
tts_usd_per_1m('Inworld', 'Realtime TTS-2 (Growth plan, $1,500/mo)', 12.5, IW, 'yes')
tts_usd_per_1m('Inworld', 'Realtime TTS-2 Flash (On-Demand)', 15.0, IW, 'yes', '~50 ms first audio (vendor)')
tts_usd_per_1m('Inworld', 'Realtime TTS-2 Flash (Growth plan)', 7.0, IW, 'yes', 'Enterprise "sub-$5"')
SV = 'https://www.sarvam.ai/api-pricing'
tts_inr_per_1k('Sarvam', 'Bulbul V4 Flash (PAYG; real-time/streaming/WebSocket)', 2.00, SV, 'yes (11 Indic + English)', 'Pro 1.85, Growth/Business 1.70; prices exclude GST')
tts_inr_per_1k('Sarvam', 'Bulbul V4 Flash (Growth/Business plan)', 1.70, SV, 'yes')
tts_inr_per_1k('Sarvam', 'Bulbul V3 (PAYG)', 3.00, SV, 'yes', 'Growth 2.70')
SM = 'https://smallest.ai/pricing/models'
tts_usd_per_1m('Smallest.ai', 'Lightning V3.1 ($0.175 per 10K chars)', 17.5, SM, 'yes (Hindi, Tamil, Kannada, Marathi, Telugu, Odia, Punjabi)')
tts_usd_per_1m('Smallest.ai', 'Lightning V3.1 Pro ($0.195 per 10K chars)', 19.5, SM, 'yes')
AZ = 'https://prices.azure.com/api/retail/prices (centralindia, Azure Speech)'
tts_usd_per_1m('Microsoft Azure (grant)', 'Neural HD TTS (DragonHD) PAYG', 22.0, AZ, 'DragonHD en-IN speaks Hindi; hi-IN neural voices', 'effective 2026-03-01')
tts_usd_per_1m('Microsoft Azure (grant)', 'S1 Neural TTS PAYG', 15.0, AZ, 'yes (hi-IN 9 voices per l7)')
tts_usd_per_1m('Microsoft Azure (grant)', 'Neural TTS commitment 400M chars/mo ($3,900/mo; overage $9.75)', 9.75, AZ, 'yes', 'tier 4000M = $6.00/1M')
tts_usd_per_1m('Deepgram', 'Aura-2 (PAYG)', 30.0, 'https://deepgram.com/pricing', 'not verified for Hindi', 'Flux TTS $45/1M; Aura-1 $15/1M')
tts_usd_per_1m('Groq', 'Canopy Labs Orpheus V1 English (preview)', 22.0, 'https://console.groq.com/docs/models', 'NO (English; Arabic Saudi variant $40)', 'preview models may be discontinued at short notice', conf='high')
# Gemini TTS (cross-check, token priced): audio out 25 tok/s
GTTS = 'https://ai.google.dev/gemini-api/docs/pricing (also lanes/g1-gemini-desk/prices.json)'
for name, tin, tout, tin27, tout27 in [('gemini-3.8-flash-tts', 0.5, 9.0, 1.0, 18.0), ('gemini-3.8-flash-lite-tts', 0.5, 6.0, 1.0, 12.0)]:
    a = AGENT_AUDIO_S * W['gem_tts_audio_tok_per_s']
    usd = (W['gem_tts_text_tok'] * tin + a * tout) / 1e6; usd27 = (W['gem_tts_text_tok'] * tin27 + a * tout27) / 1e6
    add('TTS', 'Google Gemini API (paid tier)', f'{name} (to 2026-12-31)', f'{tin} text in / {tout} audio out', 'per 1M tokens', 'USD', usd * FX,
        f'{a:.0f} audio tokens/min (26.4 s x 25 tok/s) + ~150 text tokens', usd27 * FX, 'from 2027-01-01 price (doubles, announced on page)', 'yes (Despina etc.; g3 samples)', GTTS,
        notes='GA 2026-09-22 on Gemini API; free tier "used to improve our products: Yes", paid "No"')

# ---------------- STT ----------------
def stt_usd_per_min(v, product, usd_min, url, hindi, notes='', conf='high', method='read-primary', unit='per audio minute', price=None):
    add('STT', v, product, price if price is not None else usd_min, unit, 'USD', W['stt_streamed_s'] / 60 * usd_min * FX, '60 s streamed per connected minute (whole call)',
        W['stt_vad_gated_s'] / 60 * usd_min * FX, '30 s (VAD-gated, caller share x 1.25)', hindi, url, method, conf, notes)
DG = 'https://deepgram.com/pricing ; languages: https://developers.deepgram.com/docs/models-languages-overview'
stt_usd_per_min('Deepgram', 'Nova-3 Multilingual streaming (promo rate)', 0.0058, DG, 'yes (hi; multi code-switch incl. Hindi)', 'limited-time promo; regular $0.0092/min; Growth promo $0.0050')
stt_usd_per_min('Deepgram', 'Nova-3 Multilingual streaming (regular rate)', 0.0092, DG, 'yes')
stt_usd_per_min('Deepgram', 'Flux Multilingual (turn detection built in)', 0.0078, DG, 'yes (hi in flux-general-multi)', 'Growth $0.0068')
add('STT', 'Sarvam', 'Speech to text real-time (PAYG)', 0.49, 'per minute', 'INR', W['stt_streamed_s'] / 60 * 0.49, '60 s streamed', W['stt_vad_gated_s'] / 60 * 0.49, '30 s VAD-gated',
    'yes (11 Indic + English, code-mixed)', SV, notes='Pro 0.45, Growth/Business 0.41; excl. GST')
add('STT', 'Sarvam', 'Speech to text real-time (Growth/Business)', 0.41, 'per minute', 'INR', W['stt_streamed_s'] / 60 * 0.41, '60 s streamed', W['stt_vad_gated_s'] / 60 * 0.41, '30 s VAD-gated', 'yes', SV)
stt_usd_per_min('Microsoft Azure (grant)', 'S1 real-time STT PAYG ($1.00/h)', 1.00 / 60, AZ, 'yes (hi-IN, en-IN)', 'real-time audio processed in memory, not stored at rest (Azure Speech data-privacy doc)', unit='per audio hour', price=1.00)
stt_usd_per_min('Microsoft Azure (grant)', 'STT commitment 100K h/mo ($40,000/mo; overage $0.40/h)', 0.40 / 60, AZ, 'yes', '2K h tier $0.80/h; 10K $0.65; 50K $0.50', unit='per audio hour', price=0.40)
stt_usd_per_min('ElevenLabs', 'Scribe v2 Realtime ($0.39/h)', 0.39 / 60, EL, 'yes (90+ languages)', 'keyterm +$0.08/h; batch Scribe v2 $0.22/h', unit='per audio hour', price=0.39)
stt_usd_per_min('Google Gemini API (paid tier)', 'gemini-3.5-transcribe-live (blended ~$0.009/min)', 0.00525 + 0.004, GTTS, 'yes', 'audio $3.50/1M at 25 tok/s + text $21/1M at ~175 tok/min (Google estimate)', unit='per audio minute (blended)', price='3.50 audio in / 21.00 text out per 1M')
stt_usd_per_min('Inworld', 'Realtime STT-1 (On-Demand $0.15/h)', 0.15 / 60, IW, 'not verified for Hindi', 'paid plans $0.10/h', unit='per audio hour', price=0.15)
stt_usd_per_min('Inworld', 'Realtime STT-1 (paid plans $0.10/h)', 0.10 / 60, IW, 'not verified', unit='per audio hour', price=0.10)
stt_usd_per_min('Cartesia', 'Ink-2 on Scale (3 credits/s; ~$0.39/h)', 0.39 / 60, CA, 'not verified', unit='per audio hour', price=0.39)
stt_usd_per_min('Smallest.ai', 'Pulse realtime (~$0.004/min)', 0.004, SM, 'yes (22+ languages per page)')
stt_usd_per_min('MiniMax', 'Speech-to-Text ($0.38/h)', 0.38 / 60, MM, 'not verified', unit='per audio hour', price=0.38)
stt_usd_per_min('OpenAI', 'gpt-realtime-whisper / gpt-live-transcribe ($0.017/min)', 0.017, 'https://developers.openai.com/api/docs/pricing', 'yes (multilingual)', 'Azure meter identical: $1.02/h Global')
stt_usd_per_min('Groq', 'whisper-large-v3-turbo ($0.04/h; batch/file API, not streaming)', 0.04 / 60, 'https://console.groq.com/docs/models', 'yes (Whisper multilingual)', 'not a streaming endpoint: needs chunking; quality on Hindi not measured', unit='per audio hour', price=0.04)

# ---------------- LLM (per 1M tokens: in, cached in, out) ----------------
def llm(v, product, pin, pc, pout, url, notes='', fee=0.0, conf='high', currency='USD'):
    k = 1.0 if currency == 'INR' else FX
    nocache = (LLM_IN * pin + LLM_OUT * pout) / 1e6 * k * (1 + fee)
    pc_eff = pc if pc is not None else pin
    cache = (LLM_IN * (1 - W['llm_cache_share']) * pin + LLM_IN * W['llm_cache_share'] * pc_eff + LLM_OUT * pout) / 1e6 * k * (1 + fee)
    add('LLM', v, product, f'{pin} / {pc if pc is not None else "-"} / {pout}', 'per 1M tokens (in / cached in / out)', currency, nocache,
        f'{LLM_IN:.0f} in + {LLM_OUT:.0f} out tokens/min (5 exch x 2,500 in / 60 out x 1.2), no cache', cache, '70% of input from prompt cache', 'via prompt', url,
        conf=conf, notes=notes + (f'; incl. OpenRouter {fee*100:.1f}% credit fee' if fee else ''))
ORE = 'https://openrouter.ai/api/v1/models/{id}/endpoints'
llm('Groq (direct)', 'openai/gpt-oss-120b (~500 tok/s vendor)', 0.15, 0.075, 0.60, 'https://console.groq.com/docs/models', 'cache price from OpenRouter Groq endpoint; dev plan 250K TPM / 1K RPM')
llm('Groq via OpenRouter', 'openai/gpt-oss-120b', 0.15, 0.075, 0.60, ORE.format(id='openai/gpt-oss-120b'), fee=0.055)
llm('Groq (direct)', 'openai/gpt-oss-20b (~1000 tok/s vendor)', 0.075, 0.0375, 0.30, 'https://console.groq.com/docs/models')
llm('Groq via OpenRouter', 'meta-llama/llama-3.3-70b-instruct', 0.59, 0.295, 0.79, ORE.format(id='meta-llama/llama-3.3-70b-instruct'), 'Groq direct now lists Llama 3.3 70B as "Enterprise / Contact Sales"', fee=0.055)
llm('Cerebras (direct)', 'gpt-oss-120b (~3000 tok/s vendor)', 0.35, None, 0.75, 'https://inference-docs.cerebras.ai/models/openai-oss.md', 'OpenRouter lists same; no cache discount listed; PAYG 1M uncached TPM / 1K RPM')
llm('Google AI Studio (direct or via OpenRouter)', 'gemini-3.1-flash-lite', 0.25, 0.025, 1.50, ORE.format(id='google/gemini-3.1-flash-lite'), 'flex tier 0.125/0.75; g3 saw 0 implicit cache hits on free tier')
llm('Google AI Studio', 'gemini-3.5-flash-lite', 0.30, 0.03, 2.50, ORE.format(id='google/gemini-3.5-flash-lite'))
llm('OpenAI / Azure Global', 'gpt-6-luna', 0.10, 0.01, 0.50, 'https://developers.openai.com/api/docs/pricing ; OpenRouter endpoints (OpenAI, Azure)', 'Azure Global same price (OpenRouter Azure endpoint); data-residency endpoints +10%')
llm('Microsoft Azure (grant)', 'gpt-4.1-mini regional South India Standard', 0.44, 0.11, 1.76, 'lanes/g3-cascade-measured/results/cost_inputs.csv (Retail API southindia)', 'Legacy; India-processed; retires 2027-04-14 (l8)')
llm('DeepSeek (cheapest OR endpoint)', 'deepseek/deepseek-v4.1-flash', 0.04, 0.0016, 0.144, ORE.format(id='deepseek/deepseek-v4.1-flash'), 'cheapest provider fp4; quality/latency not measured', fee=0.055, conf='medium')
llm('Inworld', 'Gemma 4 26B-A4B (Inworld Inference)', 0.07, None, 0.34, 'https://inworld.ai/models', 'vendor-reported 0.23 s TTFT best hour')
llm('Sarvam', 'Sarvam 105B', 15.0, 5.0, 60.0, SV, 'INR prices excl. GST', currency='INR')

# ---------------- S2S / all-in agent platforms ----------------
def realtime(L, a_in, a_cin, a_out, t_in, t_cin, t_out, sys_tok=2000, txt_out=60, E=5, cpad=1.2, out_cached=False):
    """OpenAI-style realtime: user audio 10 tok/s, assistant audio 20 tok/s (developers.openai.com realtime-costs);
    every turn re-sends the whole conversation; prefix cached except the previous assistant reply and the new user audio
    (out_cached=True: optimistic variant where the previous assistant reply is also served from cache)."""
    N = int(round(E * L)); u = W['caller_speech_s'] / E * cpad * 10; a = W['agent_speech_s'] / E * 20
    usd = 0.0; hist = 0.0
    for k in range(1, N + 1):
        if k == 1: unc_a, c_a, unc_t, c_t = u, 0, sys_tok, 0
        elif out_cached: unc_a, c_a, unc_t, c_t = u, hist, 0, sys_tok
        else: unc_a, c_a, unc_t, c_t = a + u, hist - a, 0, sys_tok
        usd += (unc_a * a_in + c_a * a_cin + unc_t * t_in + c_t * t_cin) / 1e6
        usd += (a * a_out + txt_out * t_out) / 1e6
        hist += u + a
    return usd / L * FX
RT = {'gpt-realtime-2.1-mini': (10.0, 0.30, 20.0, 0.60, 0.06, 2.40), 'gpt-realtime-2.1': (32.0, 0.40, 64.0, 4.00, 0.40, 24.0)}
rt_tab = {}; rt_tab_opt = {}
for m, p in RT.items():
    rt_tab[m] = {L: round(realtime(L, *p), 3) for L in (1, 3, 5, 10)}
    rt_tab_opt[m] = {L: round(realtime(L, *p, out_cached=True), 3) for L in (1, 3, 5, 10)}
    for surface, url, extra in [('OpenAI (direct)', 'https://developers.openai.com/api/docs/pricing ; token rates https://developers.openai.com/api/docs/guides/realtime-costs', ''),
                                ('Microsoft Azure Global (grant)', 'Azure Retail Prices API meters "%s ... Gl" (southindia lists Global meters)' % m, 'Data Zone +10% (US/EU only); Global may process outside India')]:
        add('S2S', surface, m, f'audio {p[0]} / cached {p[1]} / out {p[2]}; text {p[3]} / {p[4]} / {p[5]}', 'per 1M tokens', 'USD', rt_tab[m][3],
            '3-min call, 5 exch/min, caller 24 s/min (x1.2 padding) at 10 tok/s, agent 24 s/min at 20 tok/s, 2k-token system prompt, context re-billed with prefix caching',
            rt_tab[m][10], '10-min call', 'yes (multilingual)', url, 'computed', 'medium',
            f'1/3/5/10-min INR/min = {rt_tab[m][1]}/{rt_tab[m][3]}/{rt_tab[m][5]}/{rt_tab[m][10]}; if the previous reply is also cache-served: {rt_tab_opt[m][1]}/{rt_tab_opt[m][3]}/{rt_tab_opt[m][5]}/{rt_tab_opt[m][10]}; excludes input transcription model; {extra}')
luna_cache = (LLM_IN * 0.3 * 0.10 + LLM_IN * 0.7 * 0.01 + LLM_OUT * 0.50) / 1e6 * FX
add('S2S', 'OpenAI (direct)', 'gpt-live-1 voice session ($0.05/min, per-second) + backend gpt-6-luna', 0.05, 'per session minute', 'USD', 0.05 * FX + luna_cache,
    'session minutes = connected minutes; backend gpt-6-luna at our LLM workload (cached)', 0.05 * FX, 'voice session only', 'yes', 'https://developers.openai.com/api/docs/pricing ; guides/realtime-costs',
    'computed', 'high', 'billed for silence too ("active session time includes ... both are silent")')
add('S2S', 'Ultravox (acquired by Inworld)', 'Ultravox calls PAYG ($0.05/min; first 30 min free)', 0.05, 'per call minute', 'USD', 0.05 * FX, 'published per-minute price', 0.05 * FX + 0.005 * FX,
    '+ Ultravox SIP 0.5c/min', 'Ultravox v0.7 lists hi input (l7); output voices not verified', 'https://www.ultravox.ai/pricing', notes='PAYG hard cap 5 concurrent calls; Pro $100/mo removes cap')
add('S2S', 'ElevenLabs', 'ElevenAgents / Speech Engine ($0.08/min; burst $0.16) + BYO LLM', 0.08, 'per minute', 'USD', 0.08 * FX + LLM_IN * 0.15e-6 * FX * 0.65 + LLM_OUT * 0.6e-6 * FX,
    '$0.08/min + gpt-oss-120b@Groq LLM (cached)', 0.16 * FX, 'burst rate', 'yes', EL, 'computed', 'medium', 'LLM billed separately (pass-through); concurrency 4-40 by plan')
add('S2S', 'Sarvam', 'Samvaad Voice Agents (all models included)', '3.50 PAYG / 3.25 Pro / 3.15 Growth / 3.00 Business', 'per 60-s pulse', 'INR', 3.15, 'Growth plan (4K+ min/mo); 60-s pulses round up',
    3.00, 'Business (16K-2 lakh min/mo; "coming soon")', 'yes (11 Indic + English)', 'https://www.sarvam.ai/products/voice-agents/pricing', notes='excl. GST and telephony (Vobiz INR 0.20/30 s); this is a competitor retail price, not a component')
add('S2S', 'Deepgram', 'Voice Agent API Standard (STT+LLM+TTS)', 0.075, 'per WebSocket minute', 'USD', 0.075 * FX, 'PAYG Standard', 0.050 * FX, 'Custom: BYO LLM + TTS', 'STT yes; TTS Hindi not verified', 'https://deepgram.com/pricing',
    notes='Growth $0.068; Advanced $0.163')
add('S2S', 'Cartesia', 'Managed Agents call duration', 0.06, 'per minute', 'USD', 0.06 * FX, 'call duration only (LLM free for UI-created agents, limited time)', (0.06 + 0.014) * FX, '+ Cartesia telephony $0.014/min', 'yes', CA)
add('S2S', 'Smallest.ai', 'Atoms agents PAYG (models selected)', '0.09-0.21', 'per minute', 'USD', 0.09 * FX, 'low end of PAYG range', 0.05 * FX, 'enterprise "as low as $0.05"', 'yes', 'https://smallest.ai/pricing',
    notes='includes $0.01/min hosting; realtime-mini S2S layer ~$0.02/min listed')
inw = (W['stt_streamed_s'] / 3600 * 0.10 + (LLM_IN * 0.07 + LLM_OUT * 0.34) / 1e6 + TTS_CHARS * 7.0 / 1e6) * FX
inw_od = (W['stt_streamed_s'] / 3600 * 0.15 + (LLM_IN * 0.07 + LLM_OUT * 0.34) / 1e6 + TTS_CHARS * 15.0 / 1e6) * FX
add('S2S', 'Inworld', 'Realtime speech-to-speech session (STT-1 + hosted LLM + TTS-2 Flash; "no S2S fee on top")', 'component rates', 'sum of components', 'USD', inw,
    'Growth plan: STT $0.10/h + Gemma 4 26B $0.07/$0.34 + TTS-2 Flash $7/1M', inw_od, 'On-Demand: STT $0.15/h + TTS-2 Flash $15/1M', 'TTS Hindi Tier 1; STT Hindi not verified',
    'https://inworld.ai/speech-to-speech ; https://inworld.ai/pricing', 'computed', 'medium', 'Growth plan is $1,500/mo (credits)')
add('S2S', 'Hume', 'EVI 4-mini', '', 'n/a', 'USD', None, 'sunset 2026-11-13', hindi='EVI 4-mini lists Hindi', url='https://dev.hume.ai/docs/speech-to-speech-evi/overview', notes='KILL: API access ends 2026-11-13')
G5 = 'lanes/g5-gemini-paid/results/cost_per_minute_summary.csv (measured usage x paid list price)'
add('S2S', 'Google Gemini API (paid tier)', 'gemini-3.8-live (measured, compression off)', '0.75 text / 3.00 audio in; 4.50 / 12.00 out', 'per 1M tokens', 'USD', 5.72, '3-min call, measured (g5, n=2 calls)', 12.7, '10-min call measured (n=2)',
    'yes', G5, 'measured', 'medium', 'with compression (trigger 6000) 10-min = 9.05; proactive audio bills listening time')
add('S2S', 'Google Gemini API (paid tier)', 'gemini-3.1-flash-live-preview (measured, compression off)', 'same rates', 'per 1M tokens', 'USD', 4.71, '3-min call, measured (g5, n=2)', 10.74, '10-min (n=2)', 'yes', G5, 'measured', 'medium',
    'legacy preview; earliest shutdown 2026-11-17 (g1); compression trigger 2500 -> 2.85 at 10 min (n=1)')

# ------------------------------------------------------------------------------------------------
# SELF-HOST: GPU prices (INR/h) and model capacity (real-time streams per GPU)
# ------------------------------------------------------------------------------------------------
E2E = 'https://www.e2enetworks.com/pricing.md (INR authoritative, excl. 18% GST)'
JL = 'https://jarvislabs.ai/pricing (USD list; India INR rates not machine-readable; x95)'
YT = 'https://shakticloud.ai/pricing (Yotta Shakti Cloud, INR)'
AZV = 'Azure Retail Prices API, Virtual Machines, centralindia, Linux'
GPU = [  # provider, sku, gpu_class, inr_per_h, term, source
    ('E2E Networks', 'T4 16GB', 'T4', 30.0, 'on-demand', E2E), ('E2E Networks', 'L4 24GB', 'L4', 49.0, 'on-demand', E2E),
    ('E2E Networks', 'L40S 48GB', 'L40S', 102.0, 'on-demand', E2E), ('E2E Networks', 'A100 80GB', 'A100', 189.0, 'on-demand', E2E),
    ('E2E Networks', 'H100 80GB', 'H100', 379.05, 'on-demand', E2E), ('E2E Networks', 'H100 80GB', 'H100', 347.70, 'committed', E2E),
    ('E2E Networks', 'H100 80GB', 'H100', 70.0, 'spot', E2E),
    ('Jarvislabs', 'L4 24GB', 'L4', 0.44 * FX, 'on-demand', JL), ('Jarvislabs', 'A100 80GB', 'A100', 1.49 * FX, 'on-demand', JL),
    ('Jarvislabs', 'H100 SXM 80GB', 'H100', 3.49 * FX, 'on-demand', JL),
    ('Yotta Shakti Cloud', 'VM 1x L40S on-demand', 'L40S', 137.0, 'on-demand', YT), ('Yotta Shakti Cloud', 'VM 1x L40S dedicated 1-month (INR 80,221/mo)', 'L40S', 80221 / 730, 'monthly', YT),
    ('Yotta Shakti Cloud', 'VM 1x H100 SXM on-demand', 'H100', 356.0, 'on-demand', YT), ('Yotta Shakti Cloud', 'VM 1x H100 SXM dedicated 1-month (INR 1,96,113/mo)', 'H100', 196113 / 730, 'monthly', YT),
    ('Azure centralindia', 'NC4as_T4_v3 (1x T4)', 'T4', 0.579 * FX, 'on-demand', AZV), ('Azure centralindia', 'NC4as_T4_v3 (1x T4)', 'T4', 5778 / 26280 * FX, '3-yr RI', AZV),
    ('Azure centralindia', 'NV36ads_A10_v5 (1x A10)', 'A10', 4.48 * FX, 'on-demand', AZV), ('Azure centralindia', 'NV36ads_A10_v5 (1x A10)', 'A10', 51803 / 26280 * FX, '3-yr RI', AZV),
    ('Azure centralindia', 'NC24ads_A100_v4 (1x A100 80GB)', 'A100', 5.142 * FX, 'on-demand', AZV), ('Azure centralindia', 'NC24ads_A100_v4 (1x A100 80GB)', 'A100', 29446 / 8760 * FX, '1-yr RI', AZV),
    ('Azure centralindia', 'NC24ads_A100_v4 (1x A100 80GB)', 'A100', 50149 / 26280 * FX, '3-yr RI', AZV),
    ('Azure centralindia', 'NC40ads_H100_v5 (1x H100 NVL)', 'H100', 9.772 * FX, 'on-demand', AZV), ('Azure centralindia', 'NC40ads_H100_v5 (1x H100 NVL)', 'H100', 64202 / 8760 * FX, '1-yr RI', AZV),
    ('Azure centralindia', 'NC40ads_H100_v5 (1x H100 NVL)', 'H100', 141244 / 26280 * FX, '3-yr RI', AZV),
]
RIVA = 'https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-performance.html (On-Prem, Riva 2.15, Conformer-CTC Hindi, streaming low-latency 160 ms chunk, max effective streams; parsed riva_asr_streams.json)'
RIVA_STREAMS = {'T4': 50, 'L4': 116, 'A10': 116, 'A100': 233, 'L40S': 294, 'H100': 366}   # L40S uses the L40 row (assumption: L40S >= L40)
# TTS scale vs H100 for decode-bound 3B LLM-TTS: ASSUMPTION (not measured), memory-bandwidth-class proxy
LLMTTS_SCALE = {'H100': 1.0, 'A100': 0.6, 'L40S': 0.45, 'L4': 0.15, 'A10': 0.2, 'T4': 0.0}
NVAIE_INR_H = 4500 / 8760 * FX   # NVIDIA AI Enterprise list $4,500/GPU-yr (l2 cost-model.py), only for Riva/NIM in production
MODELS = []
def model(name, role, lic, hindi, params, cap, src, method, conf, gpu_note, notes='', nvaie=False):
    MODELS.append(dict(name=name, role=role, lic=lic, hindi=hindi, params=params, cap=cap, src=src, method=method, conf=conf, gpu_note=gpu_note, notes=notes, nvaie=nvaie))
# cap: {gpu_class: (low, base, high) real-time streams per GPU at interactive latency}
model('NVIDIA Riva Conformer-CTC Hindi (reference ASR)', 'ASR', 'Riva; production needs NVAIE licence', 'yes', 'n/a', {g: (round(s * 0.3), round(s * 0.5), round(s * 0.8)) for g, s in RIVA_STREAMS.items()},
      RIVA, 'vendor-claim (max streams) x derate 0.3/0.5/0.8 (l2 convention)', 'medium', 'any; T4 50 .. H100 366 max streams', 'NVAIE $4,500/GPU-yr added to GPU price', nvaie=True)
model('AI4Bharat IndicConformer 600M multilingual', 'ASR', 'MIT (HF gated)', 'yes (22 Indian languages)', '~600M (name)', {g: (round(s * 0.15), round(s * 0.3), round(s * 0.5)) for g, s in RIVA_STREAMS.items()},
      'https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual (gated; no throughput published) + Riva Conformer table', 'computed: ASSUMPTION 0.15/0.3/0.5 x Riva Conformer max streams (bigger model, no TensorRT/Riva serving)', 'low',
      'fits T4/L4 (24 GB)', 'no published streaming throughput; streaming support depends on NeMo cache-aware config; MEASURE before relying')
model('OpenAI Whisper-large-v3-turbo', 'ASR', 'MIT', 'yes (multilingual; Hindi quality not measured)', '809M (HF)', {'T4': (1, 2, 4), 'L4': (3, 6, 12), 'A10': (3, 6, 12), 'A100': (10, 20, 40), 'L40S': (8, 15, 30), 'H100': (15, 30, 60)},
      'https://github.com/SYSTRAN/faster-whisper (large-v2: 13 min audio in 16-17 s, batch 8, RTX 3070 Ti) ; card: decoder 32->4 layers', 'computed: ASSUMPTION streams = batch RTFx/4 for re-decoding streaming (whisper_streaming), scaled by GPU class', 'low',
      'fits 8 GB+', 'not a streaming model; Groq hosts it at $0.04/h (batch)')
VE = 'https://huggingface.co/maya-research/Veena (latency <80 ms H100, ~120 ms A100-40GB, ~200 ms RTX 4090; RTF 0.05; ~170k tok/s on 8xH100)'
ORP = 'https://www.baseten.co/library/orpheus-tts/ (16 RT streams variable / 24 consistent traffic on H100 MIG 40GB; ~83 tok/s real-time)'
llmtts_h100 = (24, 40, 120)   # low: SAIL baseline 24/H100 (third-party); base: Baseten 16-24 per MIG 40GB x2 (computed); high: between SAIL optimised 216 (single source) and base
model('Maya Research Veena (3.78B Llama + SNAC 24 kHz)', 'TTS', 'Apache-2.0', 'yes (Hindi, English, code-mixed)', '3.78B (HF)', {g: tuple(round(x * s) for x in llmtts_h100) for g, s in LLMTTS_SCALE.items() if s > 0},
      VE + ' ; ' + ORP, 'vendor-claim (Veena latency/RTF; Baseten Orpheus streams) + computed analogy (same 3B Llama+SNAC arch) + ASSUMPTION GPU scale', 'low-medium',
      'H100/A100 for density; 16 GB+ VRAM (4-bit option in card)', 'Veena batch ceiling: 170k tok/s / 8 GPUs / 82 tok/s (SNAC 0.98 kbps / 12 bit) = ~260 RT-equivalent per H100 (upper bound, not streaming)')
model('Canopy Labs Orpheus 3B (3.78B)', 'TTS', 'Apache-2.0 (gated); Hindi pretrain research release under llama3.2 licence', 'NO for the fine-tuned release (English); Hindi research pretrain only', '3.78B (HF)',
      {g: tuple(round(x * s) for x in llmtts_h100) for g, s in LLMTTS_SCALE.items() if s > 0}, ORP + ' ; https://github.com/canopyai/Orpheus-TTS (~200 ms streaming latency)',
      'vendor-claim (Baseten) + third-party (SAIL via letsdatascience.com) + ASSUMPTION GPU scale', 'medium (H100) / low (others)', 'H100 MIG 40GB is Baseten reference', 'Groq hosts English Orpheus at $22/1M chars (preview)')
model('AI4Bharat IndicF5 (F5-TTS, 351M)', 'TTS', 'MIT (HF gated)', 'yes (11 Indian languages)', '351M (HF)', {'T4': (0, 0, 0), 'L4': (4, 7, 15), 'A10': (4, 7, 15), 'L40S': (12, 25, 50), 'A100': (12, 25, 50), 'H100': (18, 35, 70)},
      'https://github.com/SWivid/F5-TTS (TRT-LLM on L20: RTF 0.0394 at concurrency 2, avg latency 253 ms; PyTorch offline RTF 0.1467) ; docs/harvest/hp-private-voice.md (owner-measured IndicF5 RTF 2.87 on T4, n=6)',
      'vendor-claim (F5-TTS on L20) + measured-by-owner (T4, prior project) + ASSUMPTION scale', 'low',
      'T4 not real-time (measured RTF 2.87); L20/L40S-class with TRT-LLM', 'non-streaming (sentence chunks); needs reference audio per voice; owner bake-off: likeness unsolved')
model('AI4Bharat Indic Parler-TTS (938M)', 'TTS', 'Apache-2.0 (HF gated)', 'yes (21 languages per l7)', '938M (HF)', {'L4': (3, 6, 18), 'A10': (4, 8, 24), 'L40S': (9, 18, 54), 'A100': (12, 24, 72), 'H100': (20, 40, 120)},
      'https://github.com/huggingface/parler-tts/blob/main/INFERENCE.md (TTFA <500 ms with streaming on modern GPU; up to 4x faster with SDPA/compile; 86 decode steps per audio second)',
      'ASSUMPTION: 1x (0.5-3x) Orpheus-class density; no throughput published', 'low', 'any 16 GB+', 'description-prompted voice; consistency of a fixed persona voice not tested')
model('Resemble Chatterbox Multilingual V3 + Hindi pack (0.5B; hi pack 938M on HF)', 'TTS', 'MIT', 'yes (Hindi single-language finetune)', '0.5B (card)', {'T4': (1, 1, 2), 'L4': (2, 4, 8), 'A10': (2, 4, 8), 'L40S': (6, 12, 24), 'A100': (8, 16, 32), 'H100': (12, 24, 48)},
      'docs/harvest/hp-private-voice.md (owner-measured warm RTF 0.79 on Azure ACA T4, single stream) ; chatterbox-vllm third-party claim ~4x (no batch) to >10x (batched) token throughput',
      'measured-by-owner (T4 single stream) + ASSUMPTION scale', 'low', 'T4 OK for 1 stream (measured)', 'only open model the owner ran in production (Aug 2026); ECAPA likeness 0.775 zero-shot')
model('Sesame CSM-1B (1.55B)', 'TTS', 'Apache-2.0 (HF gated)', 'NO (English)', '1.55B (HF)', {}, 'https://github.com/SesameAILabs/csm (requires CUDA GPU; no throughput published)', 'not estimable', 'low', 'CUDA GPU', 'English-only: not a fit for Hindi calls')
model('hexgrad Kokoro-82M', 'TTS', 'Apache-2.0', 'weak (4 Hindi voices, overall grade C)', '82M (card)', {'T4': (10, 20, 40), 'L4': (20, 35, 70), 'A10': (20, 35, 70), 'L40S': (40, 70, 140), 'A100': (40, 70, 140), 'H100': (60, 100, 200)},
      'https://github.com/remsky/Kokoro-FastAPI (35x-100x realtime on RTX 4060 Ti 16GB; ~300 ms first token GPU) ; https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md (Hindi grade C)', 'third-party benchmark (single stream) + ASSUMPTION scale', 'low',
      'tiny; CPU-capable', 'not expressive; Hindi data thin')
model('Kyutai TTS 1.6B (en/fr)', 'TTS', 'CC-BY-4.0', 'NO (English, French)', '1.6B (name)', {'L40S': (16, 32, 64), 'H100': (32, 64, 128)},
      'https://huggingface.co/kyutai/tts-1.6b-en_fr (batched throughput 75x generated audio per compute unit; hardware unstated) ; Kyutai STT: H100 400 streams, L40S 64 connections at 3x RT (github delayed-streams-modeling)',
      'vendor-claim + ASSUMPTION', 'low', 'L40S/H100', 'not a fit for Hindi; reference for streaming density')
model('NVIDIA Magpie TTS Multilingual 357M (reference)', 'TTS', 'NVIDIA open model; NIM production needs NVAIE', 'yes (includes hi; no Hindi quality metric)', '357M', {'A100': (round(44 * 0.5), 44, 60), 'H100': (round(64 * 0.5), 64, 80)},
      'lanes/l2-economics/report.md row 16 (HF blog nvidia 2026-08-10: H100 64 streams TTFA 275 ms RTFX 291; A100 395 ms)', 'vendor-claim (secondary, read 2026-10-17); A100 44 = 64 x 197/291 (computed)', 'medium', 'A100/H100', '', nvaie=True)

# workload per connected minute: TTS stream-minutes and ASR stream-minutes
TTS_SM = AGENT_AUDIO_S / 60    # 0.44
ASR_SM = W['stt_streamed_s'] / 60   # 1.0
sh_rows = []
for m in MODELS:
    if not m['cap']:
        sh_rows.append(dict(model=m['name'], role=m['role'], licence=m['lic'], hindi=m['hindi'], params=m['params'], provider='', gpu_sku='', gpu_class='', term='', gpu_inr_per_h='',
                            streams_low='', streams_base='', streams_high='', inr_per_conn_min_util30='', inr_per_conn_min_util50='', inr_per_conn_min_util70='', inr_per_conn_min_util50_low_cap='',
                            min_fleet_2gpu_inr_per_month='', inr_per_min_at_100k_min_month='', inr_per_min_at_1M_min_month='', inr_per_min_at_5M_min_month='',
                            throughput_source=m['src'], throughput_method=m['method'], confidence=m['conf'], gpu_note=m['gpu_note'], notes=m['notes']))
        continue
    sm = TTS_SM if m['role'] == 'TTS' else ASR_SM
    for prov, sku, gc, inr_h, term, gsrc in GPU:
        if gc not in m['cap'] or m['cap'][gc][1] <= 0: continue
        lo, base, hi = m['cap'][gc]
        price = inr_h + (NVAIE_INR_H if m['nvaie'] and term != 'spot' else 0)
        per = lambda streams, u: price / 60 / streams * sm / u
        fleet = 2 * price * 730
        def at_vol(V, streams=base, u=0.5):
            return max(per(streams, u), fleet / V)
        sh_rows.append(dict(model=m['name'], role=m['role'], licence=m['lic'], hindi=m['hindi'], params=m['params'], provider=prov, gpu_sku=sku, gpu_class=gc, term=term,
                            gpu_inr_per_h=round(price, 1), streams_low=lo, streams_base=base, streams_high=hi,
                            inr_per_conn_min_util30=round(per(base, .3), 4), inr_per_conn_min_util50=round(per(base, .5), 4), inr_per_conn_min_util70=round(per(base, .7), 4),
                            inr_per_conn_min_util50_low_cap=round(per(max(lo, 1), .5), 4),
                            min_fleet_2gpu_inr_per_month=round(fleet), inr_per_min_at_100k_min_month=round(at_vol(1e5), 3), inr_per_min_at_1M_min_month=round(at_vol(1e6), 3),
                            inr_per_min_at_5M_min_month=round(at_vol(5e6), 3), throughput_source=m['src'], throughput_method=m['method'], confidence=m['conf'],
                            gpu_note=m['gpu_note'], notes=(m['notes'] + ('; GPU price includes NVAIE $4,500/GPU-yr' if m['nvaie'] and term != 'spot' else '') + f'; GPU price source: {gsrc}').strip('; ')))

# ------------------------------------------------------------------------------------------------
# VENDOR RISK
# ------------------------------------------------------------------------------------------------
T = 'scratchpad research-raw-1018/g4-market-selfhost/terms/'
VR = [
 dict(provider='OpenAI (direct API)', products='gpt-realtime-2.1 / -mini, gpt-live-1, gpt-6-luna, transcribe', training='Not used to train unless customer opts in (since 2023-03-01)', retention='/v1/realtime: abuse-monitoring logs 30 days, no app state; ZDR / Modified Abuse Monitoring only with OpenAI approval',
      india_residency='in.api.openai.com: storage in India YES, processing in India NO; +10% uplift on data-residency endpoints (models from 2026-03-05)', lifecycle='gpt-realtime-2.1(-mini) 2026-07-07; gpt-live-1 new (duration-billed); OpenAI deprecations page not read', rate_limits='usage-tier based (not read)',
      inr_billing='USD', verdict='usable; no India processing', sources='https://developers.openai.com/api/docs/guides/your-data ; /api/docs/pricing', confidence='high'),
 dict(provider='Microsoft Azure OpenAI / Foundry (founder grant)', products='gpt-realtime-2.1-mini (Global), gpt-6-luna, gpt-4.1-mini regional', training='Prompts/completions NOT used to train or improve models; not available to OpenAI',
      retention='stateless models; abuse monitoring per Azure policy', india_residency='Regional (South India) deployments process in-geography; realtime models only Global (process anywhere) or Data Zone (US/EU only) -> realtime audio leaves India',
      lifecycle='GA models retire 18 months after launch by default -> gpt-realtime-2.1-mini ~2028-01 (computed); gpt-4.1-mini Legacy, retires 2027-04-14 (l8)', rate_limits='per-subscription TPM quota; GPU quota hard to obtain (harvest: 26 A100 + 4 H100 validations hit quota)',
      inr_billing='grant credits; INR invoicing not verified', verdict='grant-covered; India-processed only for regional text models', sources='https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy ; .../openai/concepts/model-retirements ; Retail Prices API', confidence='high'),
 dict(provider='Microsoft Azure Speech (founder grant)', products='real-time STT, Neural/HD TTS, Voice Live', training='not used to train (Azure terms)', retention='real-time STT: processed in server memory, no data stored at rest',
      india_residency='YES: Central India resource processes in region', lifecycle='GA; HD price cut to $22 on 2026-03-01', rate_limits='concurrency quotas per resource', inr_billing='grant credits', verdict='safe residency; STT price is the cost problem',
      sources='https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security', confidence='high'),
 dict(provider='Azure GPU VMs centralindia (founder grant)', products='NC T4 / NV A10 / NC A100 / NC H100', training='n/a (own models)', retention='own control', india_residency='YES (Central India)', lifecycle='NCasT4 v3 since 2021; H100 NVL since 2024-05',
      rate_limits='GPU quota approval required; harvest records quota failures', inr_billing='grant credits', verdict='grant makes them free short-term but list price is 2.5-3x Indian GPU clouds', sources=AZV, confidence='high'),
 dict(provider='Google Gemini API', products='gemini-3.8-live, 3.1-flash-live-preview, 3.8 Flash(-Lite) TTS, 3.5 Transcribe Live', training='Paid tier: "Used to improve our products: No"; free tier: Yes, human reviewers may read',
      retention='per Gemini API terms (g1)', india_residency='Gemini API global processing; Vertex asia-south1 only via Provisioned Throughput for some models (g1 prices.json)',
      lifecycle='3.1-flash-live-preview legacy, earliest shutdown 2026-11-17; 3.8 Live GA 2026-09-15; TTS GA 2026-09-22 with price DOUBLING 2027-01-01', rate_limits='free-tier limits not published (AI Studio only); per-project',
      inr_billing='USD (Google Cloud billing)', verdict='free tier unusable for customer audio; Meera model being shut down', sources='https://ai.google.dev/gemini-api/docs/pricing ; lanes/g1-gemini-desk/live-billing-mechanics.md', confidence='high'),
 dict(provider='Ultravox (acquired by Inworld)', products='Ultravox realtime calls', training='Inworld terms (served at ultravox.ai/terms): no training of generally available models on non-public Materials, except feedback / trust-and-safety',
      retention='not stated on pricing page', india_residency='not offered on Ultravox page', lifecycle='ownership change (acquired by Inworld; banner on site)', rate_limits='PAYG hard cap 5 concurrent calls; Pro removes caps',
      inr_billing='USD', verdict='roadmap risk after acquisition', sources='https://www.ultravox.ai/pricing ; https://www.ultravox.ai/terms', confidence='medium'),
 dict(provider='Inworld', products='Realtime TTS-2 / TTS-2 Flash, STT-1, hosted LLMs, S2S sessions', training='No training on non-public Materials (terms)', retention='ZDR, HIPAA/BAA as add-ons on Growth',
      india_residency='EU & India data residency on Enterprise only', lifecycle='TTS-2 new; Ultravox folded in', rate_limits='concurrent requests 5 / 10 / 50 / 150 / 500 by plan', inr_billing='USD credits (card); Enterprise invoicing',
      verdict='cheapest managed stack; Hindi listening test needed', sources='https://inworld.ai/pricing ; https://inworld.ai/terms', confidence='high'),
 dict(provider='Hume AI', products='EVI 3/4-mini, Octave TTS', training='n/a', retention='account data permanently deleted after 2026-11-13', india_residency='n/a', lifecycle='SUNSET: TTS and EVI access ends 2026-11-13 12:01 a.m. EST',
      rate_limits='EVI max session 30 min', inr_billing='n/a', verdict='KILL', sources='https://dev.hume.ai/docs/speech-to-speech-evi/overview ; https://dev.hume.ai/docs/text-to-speech-tts/overview', confidence='high'),
 dict(provider='ElevenLabs', products='v4/v3/Flash TTS, Scribe v2, ElevenAgents', training='Content used to improve models by default; opt-out in account Data-use settings (terms)', retention='Zero Retention Mode (enterprise/API)',
      india_residency='India isolated environment (in.residency.elevenlabs.io) for STORAGE, Enterprise only; processing may occur elsewhere (EU processing restriction via ZRM only documented for EU)',
      lifecycle='v4 just launched; v3 still listed', rate_limits='agent concurrency 4-40 by plan; burst at 2x price', inr_billing='USD; prices exclude taxes', verdict='quality benchmark; price 2-4x Indian TTS',
      sources='https://elevenlabs.io/terms-of-use ; https://elevenlabs.io/docs/overview/administration/data-residency', confidence='high'),
 dict(provider='Sarvam AI', products='Bulbul V4 Flash / V3, STT, Samvaad agents, Sarvam 105B', training='Privacy policy lists "model training / service improvement: inputs and outputs, where applicable" on CONSENT basis',
      retention='deletion on request subject to law (DPDPA framing)', india_residency='Indian company; but policy allows cross-border transfer (US cloud: AWS/GCP/Azure; EU model providers)', lifecycle='Bulbul V4 Flash new; Business plan "coming soon"',
      rate_limits='agents: 4 / 10 / 30 / 120 concurrent; API higher limits by custom arrangement', inr_billing='YES, INR prepaid credits, GST extra, non-refundable', verdict='rupee pricing; get written no-training + India-only processing',
      sources='https://www.sarvam.ai/privacy-policy ; https://www.sarvam.ai/terms-of-service ; pricing pages', confidence='high'),
 dict(provider='Cartesia', products='Sonic-3.6 TTS, Ink-2 STT, Managed Agents', training='Privacy policy: may use content to train models; opt-out via form', retention='not stated', india_residency='no; privacy policy says services designed for users in the United States only; on-prem/VPC via sales',
      lifecycle='Sonic-3.6 current', rate_limits='TTS concurrency 2/3/5/15; agents 8/12/20/60 by plan', inr_billing='USD', verdict='terms risk for Indian customer data', sources='https://cartesia.ai/legal/privacy-policy ; https://cartesia.ai/pricing', confidence='high'),
 dict(provider='MiniMax', products='speech-2.8-hd/turbo TTS, STT', training='NOT VERIFIED (policy JS-rendered); third-party summary says inputs may be used to improve services', retention='not verified; third-party: no ZDR', india_residency='no; third-party: data stored in US',
      lifecycle='speech-2.8 current; 2.6/02 legacy same price', rate_limits='audio subscription RPM 10-500 by plan', inr_billing='USD', verdict='unverified terms; China-linked vendor risk for regulated buyers', sources='https://platform.minimax.io/docs/guides/pricing ; https://standardcompute.com/providers/minimax (secondary)', confidence='low'),
 dict(provider='Smallest.ai', products='Lightning V3.1 TTS, Pulse STT, Atoms agents', training='Terms: will not use User Content or Input to train/improve services', retention='ZDR add-on $1,000/mo (HIPAA)', india_residency='not stated; on-prem deployment on Enterprise',
      lifecycle='Lightning V3.1 current', rate_limits='20 concurrency included (agents); STT 100 concurrent streams', inr_billing='USD', verdict='Indian-founded, good terms; listen-test Hindi', sources='https://smallest.ai/terms-of-service ; https://smallest.ai/pricing', confidence='high'),
 dict(provider='Deepgram', products='Nova-3 / Flux STT, Aura-2 TTS, Voice Agent API', training='Model Improvement Program ON by default; opt out per request with mip_opt_out=true', retention='opted-out data kept only for processing duration',
      india_residency='no India endpoint (EU endpoint api.eu.deepgram.com exists)', lifecycle='streaming prices are limited-time PROMO (Nova-3 multi $0.0058 vs regular $0.0092)', rate_limits='WSS STT 150 (PAYG) / 225 (Growth); TTS 45/60; agent 45/60',
      inr_billing='USD', verdict='must set mip_opt_out; promo expiry risk', sources='https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program ; https://deepgram.com/pricing', confidence='high'),
 dict(provider='Groq', products='gpt-oss-120b/20b, Whisper turbo, Orpheus (preview)', training='no customer-data retention by default', retention='ZDR toggle available to all; retained data (batch/fine-tune) in GCP US', india_residency='no (US)',
      lifecycle='Llama 3.3 70B moved to "Enterprise / Contact Sales" on direct; preview models may be discontinued at short notice', rate_limits='developer plan gpt-oss-120b 250K TPM / 1K RPM', inr_billing='USD',
      verdict='fast and cheap; no India processing', sources='https://console.groq.com/docs/your-data ; https://console.groq.com/docs/models', confidence='high'),
 dict(provider='Cerebras', products='gpt-oss-120b, qwen-3.8-27b (shared inference)', training='ToS: no right to use Service Content for training or fine-tuning', retention='not stated', india_residency='no (US-administered)',
      lifecycle='only 2 shared models listed; free trial not for production', rate_limits='PAYG gpt-oss-120b 1M uncached TPM / 3M total / 1K RPM', inr_billing='USD', verdict='fastest tok/s; 2.3x Groq price for gpt-oss-120b',
      sources='https://www.cerebras.ai/terms-of-service ; https://inference-docs.cerebras.ai/support/rate-limits', confidence='high'),
 dict(provider='OpenRouter', products='router to 471 models (incl. Groq/Cerebras/Google endpoints)', training='per-provider training/retention flags; account setting to exclude training providers', retention='per provider; ZDR routing option',
      india_residency='no; in-region routing only EU and US (Business/Enterprise)', lifecycle='n/a', rate_limits='passthrough from providers', inr_billing='USD credits; 5.5% fee on credit purchase (Standard), 8% (Business)',
      verdict='research convenience; adds 5.5% and a hop', sources='https://openrouter.ai/pricing ; https://openrouter.ai/docs/guides/features/in-region-routing.md', confidence='high'),
 dict(provider='E2E Networks', products='GPU cloud T4..B200', training='n/a', retention='own control', india_residency='YES (Indian DCs; page says MeitY empanelled)', lifecycle='n/a', rate_limits='capacity by availability',
      inr_billing='YES, INR authoritative, excl. 18% GST; hourly/per-minute', verdict='cheapest published H100/L4 in INR', sources=E2E, confidence='high'),
 dict(provider='Yotta Shakti Cloud', products='H100 SXM / L40S VMs, bare metal, serverless', training='n/a', retention='own control', india_residency='YES (Mumbai HQ; Indian DCs)', lifecycle='n/a', rate_limits='n/a',
      inr_billing='YES, INR; data transfer included', verdict='monthly dedicated H100 ~INR 269/h', sources=YT, confidence='high'),
 dict(provider='Jarvislabs', products='L4 / A100 / H100 / H200', training='n/a', retention='own control', india_residency='YES (India Noida region)', lifecycle='n/a', rate_limits='25+ GPUs via sales',
      inr_billing='INR for Indian customers (rates not machine-readable); USD outside India', verdict='per-minute billing, good for bursty research', sources=JL, confidence='medium'),
 dict(provider='Open model licences (self-host)', products='Veena, IndicF5, Indic Parler, Orpheus, Chatterbox, CSM-1B, Kokoro, Kyutai TTS, IndicConformer, Whisper turbo', training='own control',
      retention='own control', india_residency='YES if hosted in India', lifecycle='community models: no SLA', rate_limits='own capacity',
      inr_billing='n/a', verdict='Apache-2.0: Veena, Indic Parler (gated), Orpheus (gated), CSM-1B (gated), Kokoro; MIT: IndicF5 (gated), Chatterbox, IndicConformer (gated), Whisper; CC-BY-4.0: Kyutai; Orpheus Hindi pretrain = llama3.2 research; Riva/NIM production needs NVAIE',
      sources='Hugging Face API cardData.license (2026-10-18)', confidence='high'),
]

def write(name, rs):
    keys = list(dict.fromkeys(k for r in rs for k in r))
    with open(os.path.join(HERE, name), 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); [w.writerow(r) for r in rs]
write('prices.csv', rows); write('selfhost.csv', sh_rows)
for r in VR: r['date_read'] = D
write('vendor-risk.csv', VR)

# ------------------------------------------------------------------------------------------------
# Summary for findings.md: budget, stack totals
# ------------------------------------------------------------------------------------------------
def f(component, vendor_sub, product_sub, alt=False):
    for r in rows:
        if r['component'] == component and vendor_sub in r['vendor'] and product_sub in r['product']:
            return float(r['inr_per_conn_min_alt' if alt else 'inr_per_conn_min'])
    raise KeyError((component, vendor_sub, product_sub))
def sh(model_sub, prov, gc, term, col='inr_per_conn_min_util50'):
    for r in sh_rows:
        if model_sub in r['model'] and r['provider'] == prov and r['gpu_class'] == gc and r['term'] == term: return float(r[col])
    raise KeyError((model_sub, prov, gc, term))
out = {'workload': W, 'tts_chars_per_min': TTS_CHARS, 'llm_in_per_min': LLM_IN, 'llm_out_per_min': LLM_OUT, 'realtime_inr_per_min': rt_tab}
# budget: price 2.00; GST exclusive or inclusive; telephony 0.38-0.48; margin 40/50/60
bud = []
for gst in ('exclusive', 'inclusive'):
    net = 2.0 if gst == 'exclusive' else 2.0 / 1.18
    for tel in (0.38, 0.48):
        for gm in (0.4, 0.5, 0.6):
            bud.append(dict(gst=gst, net_price=round(net, 3), telephony=tel, gross_margin=gm, ai_plus_infra_budget=round(net * (1 - gm) - tel, 3)))
out['budget'] = bud
llm_groq = f('LLM', 'Groq (direct)', 'gpt-oss-120b', alt=True)
stacks = [
    ('Inworld all-in, Growth plan (STT-1 + Gemma 4 26B + TTS-2 Flash)', f('S2S', 'Inworld', 'Realtime speech-to-speech')),
    ('Inworld all-in, On-Demand', f('S2S', 'Inworld', 'Realtime speech-to-speech', alt=True)),
    ('Sarvam STT Growth + gpt-oss-120b@Groq (cached) + Bulbul V4 Flash Growth', f('STT', 'Sarvam', 'Growth') + llm_groq + f('TTS', 'Sarvam', 'Growth/Business plan')),
    ('Sarvam STT PAYG + gpt-oss-120b@Groq + Bulbul V4 Flash PAYG', f('STT', 'Sarvam', 'PAYG') + llm_groq + f('TTS', 'Sarvam', 'V4 Flash (PAYG')),
    ('Smallest Pulse + gpt-oss-120b@Groq + Lightning V3.1', f('STT', 'Smallest', 'Pulse') + llm_groq + f('TTS', 'Smallest', 'Lightning V3.1 ($0.175')),
    ('Deepgram Nova-3 multi (promo) + gpt-oss-120b@Groq + Cartesia Sonic Scale', f('STT', 'Deepgram', 'promo') + llm_groq + f('TTS', 'Cartesia', 'Scale')),
    ('ElevenLabs Scribe RT + gpt-oss-120b@Groq + v3 Conversational/Flash', f('STT', 'ElevenLabs', 'Scribe') + llm_groq + f('TTS', 'ElevenLabs', 'Turbo')),
    ('ElevenLabs Scribe RT + gpt-oss-120b@Groq + v4/v3 expressive', f('STT', 'ElevenLabs', 'Scribe') + llm_groq + f('TTS', 'ElevenLabs', 'v4 / v3')),
    ('Gemini Transcribe Live + 3.1 Flash-Lite (cached) + 3.8 Flash TTS (2026 price)', f('STT', 'Gemini', 'transcribe') + f('LLM', 'Google AI Studio (direct', 'gemini-3.1-flash-lite', alt=True) + f('TTS', 'Gemini', 'gemini-3.8-flash-tts')),
    ('same, 2027 TTS price', f('STT', 'Gemini', 'transcribe') + f('LLM', 'Google AI Studio (direct', 'gemini-3.1-flash-lite', alt=True) + f('TTS', 'Gemini', 'gemini-3.8-flash-tts', alt=True)),
    ('Azure grant PAYG (S1 STT + gpt-4.1-mini regional cached + DragonHD) = g3 config A shape', f('STT', 'Azure', 'S1') + f('LLM', 'Azure', 'gpt-4.1-mini', alt=True) + f('TTS', 'Azure', 'DragonHD')),
    ('Azure grant at scale (STT 100K-h commit + gpt-4.1-mini cached + Neural TTS 400M commit)', f('STT', 'Azure', 'commitment') + f('LLM', 'Azure', 'gpt-4.1-mini', alt=True) + f('TTS', 'Azure', 'commitment 400M')),
    ('Azure grant at scale, VAD-gated STT', f('STT', 'Azure', 'commitment', alt=True) + f('LLM', 'Azure', 'gpt-4.1-mini', alt=True) + f('TTS', 'Azure', 'commitment 400M')),
    ('Self-host IndicConformer (E2E L4, 50%) + gpt-oss-120b@Groq + Bulbul V4 Flash Growth', sh('IndicConformer', 'E2E Networks', 'L4', 'on-demand') + llm_groq + f('TTS', 'Sarvam', 'Growth/Business plan')),
    ('Self-host IndicConformer (E2E L4) + Groq + Veena (E2E H100 on-demand), 50% util, at scale', sh('IndicConformer', 'E2E Networks', 'L4', 'on-demand') + llm_groq + sh('Veena', 'E2E Networks', 'H100', 'on-demand')),
    ('same but Veena at LOW capacity (24 streams/H100)', sh('IndicConformer', 'E2E Networks', 'L4', 'on-demand') + llm_groq + sh('Veena', 'E2E Networks', 'H100', 'on-demand', 'inr_per_conn_min_util50_low_cap')),
    ('Self-host on Azure grant (IndicConformer T4 3-yr RI + Veena H100 NVL 3-yr RI) + gpt-6-luna cached', sh('IndicConformer', 'Azure centralindia', 'T4', '3-yr RI') + f('LLM', 'OpenAI / Azure', 'gpt-6-luna', alt=True) + sh('Veena', 'Azure centralindia', 'H100', '3-yr RI')),
    ('OpenAI/Azure gpt-realtime-2.1-mini (3-min call)', rt_tab['gpt-realtime-2.1-mini'][3]),
    ('Ultravox PAYG', f('S2S', 'Ultravox', 'Ultravox')),
    ('Cartesia Managed Agents', f('S2S', 'Cartesia', 'Managed')),
    ('Deepgram Voice Agent Standard', f('S2S', 'Deepgram', 'Voice Agent')),
    ('Sarvam Samvaad Growth (retail all-in)', 3.15),
    ('GPT-Live-1 + gpt-6-luna backend', f('S2S', 'OpenAI', 'gpt-live-1')),
    ('Gemini 3.1 Flash Live (measured, 3-min)', 4.71), ('Gemini 3.8 Live (measured, 3-min)', 5.72),
    ('ElevenLabs Agents + Groq LLM', f('S2S', 'ElevenLabs', 'ElevenAgents')),
]
out['stacks'] = [(n, round(v, 2)) for n, v in sorted(stacks, key=lambda x: x[1])]
out['realtime_inr_per_min_out_cached'] = rt_tab_opt
# break-even monthly minutes: 2-GPU minimum fleet vs a managed per-minute price
def fleet(model_sub, prov, gc, term):
    for r in sh_rows:
        if model_sub in r['model'] and r['provider'] == prov and r['gpu_class'] == gc and r['term'] == term: return float(r['min_fleet_2gpu_inr_per_month'])
be = []
for (msub, prov, gc, term), (mname, mprice) in [
        (('Veena', 'E2E Networks', 'H100', 'on-demand'), ('Sarvam Bulbul V4 Flash Growth', f('TTS', 'Sarvam', 'Growth/Business plan'))),
        (('Veena', 'E2E Networks', 'H100', 'on-demand'), ('Inworld TTS-2 Flash Growth', f('TTS', 'Inworld', 'Flash (Growth'))),
        (('Veena', 'E2E Networks', 'H100', 'on-demand'), ('ElevenLabs Flash/v3 Conversational', f('TTS', 'ElevenLabs', 'Turbo'))),
        (('Veena', 'Yotta Shakti Cloud', 'H100', 'monthly'), ('Sarvam Bulbul V4 Flash Growth', f('TTS', 'Sarvam', 'Growth/Business plan'))),
        (('IndicConformer', 'E2E Networks', 'L4', 'on-demand'), ('Sarvam STT Growth', f('STT', 'Sarvam', 'Growth'))),
        (('IndicConformer', 'E2E Networks', 'L4', 'on-demand'), ('Inworld STT-1 paid', f('STT', 'Inworld', 'paid plans'))),
        (('IndicConformer', 'E2E Networks', 'L4', 'on-demand'), ('Azure STT 100K-h commit', f('STT', 'Azure', 'commitment'))),
        (('IndicConformer', 'Azure centralindia', 'T4', '3-yr RI'), ('Azure STT PAYG', f('STT', 'Azure', 'S1')))]:
    fl = fleet(msub, prov, gc, term); be.append(dict(selfhost=f'{msub} 2x{gc} {prov} {term}', fleet_inr_month=fl, vs=mname, managed_inr_min=round(mprice, 3), breakeven_min_month=round(fl / mprice)))
out['breakeven'] = be
json.dump(out, open(os.path.join(HERE, 'summary.json'), 'w'), indent=1)
print(json.dumps({'tts_chars': TTS_CHARS, 'llm_in': LLM_IN, 'llm_out': LLM_OUT, 'realtime': rt_tab}, indent=1))
for n, v in out['stacks']: print(f'{v:6.2f}  {n}')
print('budget sample:', [b for b in bud if b['telephony'] == 0.38])
print(len(rows), 'price rows;', len(sh_rows), 'selfhost rows;', len(VR), 'vendor rows')
