# Component prices, ported from voicelab/server/catalog.py (USD list prices with their source). The cost meter turns
# measured usage into integer milli-rupees at the research programme's FX of ₹95/$. Lab-only presets and scenarios are
# not carried over: in the product the ticket names the stack and the brief.
FX = 95.0

# ---------------------------------------------------------------- speech-to-text
# usd_min = USD per minute of audio actually sent (gated = only around caller speech).
STT = {
    'gemini':  {'label': 'Gemini 3.5 transcribe-live', 'kind': 'gemini', 'model': 'gemini-3.5-transcribe-live', 'lang': 'hi-IN',
                'usd_min': 0.005 + 0.0005, 'src': 'g1 prices.json: audio in $3.5/1M (25 tok/s) + text out'},
    'azure':   {'label': 'Azure Speech hi-IN (Central India)', 'kind': 'azure', 'lang': 'hi-IN',
                'usd_min': 1.0 / 60, 'src': 'Azure S1 real-time STT $1.00/audio hour'},
    'sarvam':  {'label': 'Sarvam Saaras v4 realtime (codemix)', 'kind': 'sarvam', 'model': 'saaras:v4', 'lang': 'hi-IN',
                'usd_min': 0.5 / FX, 'src': 'Sarvam docs: ₹30 per audio hour, billed per second'},
    'asha':    {'label': 'gpt-4o-transcribe realtime (Asha-style ears)', 'kind': 'oai_rt_tx', 'deployment': 'lab-4otx',
                'usd_min': 0.006, 'src': 'Azure retail: gpt-4o-transcribe audio in $6/1M tokens ≈ $0.006/min'},
}

# ---------------------------------------------------------------- brains (LLM)
# ttft_ms: median time to first token from the lab VM (Central India), n=6, renewal brief, 2026-10-19 (tests/brain_bench.py)
# host: sin = vp-lab-ai-sin (South India account), sea = vp-research-ai-sea, or = OpenRouter, gm = Google Vertex AI
BRAINS = {
    # gpt-oss-120b@groq is not offered: gpt-oss-120b is on our Azure Foundry (routing, directive.2026-10-22.provider-routing),
    # at a first-token cost (Groq 0.48 s vs Azure 1.47 s, n=6, 2026-10-19) logged for the owner to reverse.
    'gpt-oss-120b':      {'ttft_ms': 1466, 'label': 'gpt-oss-120b (Azure)', 'host': 'sin', 'model': 'lab-gptoss120b', 'in': 0.15, 'out': 0.60,
                          'extra': {'reasoning_effort': 'low'}, 'out_pad': 400},
    'gpt-4.1-mini-in':   {'ttft_ms': 641, 'label': 'GPT-4.1 mini (Azure, India-resident)', 'host': 'sin', 'model': 'lab-gpt41mini-in', 'in': 0.44, 'out': 1.76},
    'gpt-4.1':           {'ttft_ms': 1765, 'label': 'GPT-4.1 (Azure)', 'host': 'sin', 'model': 'lab-gpt41', 'in': 2.0, 'out': 8.0},
    'gpt-chat-latest':   {'label': 'gpt-chat-latest (Azure, premium)', 'host': 'sin', 'model': 'lab-gptchat', 'in': 5.0, 'out': 30.0, 'no_temp': True},
    'kimi-k2.6':         {'ttft_ms': 1629, 'label': 'Kimi K2.6 (Azure, open weights)', 'host': 'sea', 'model': 'lab-kimik26', 'in': 0.95, 'out': 4.0,
                          'extra': {'reasoning_effort': 'none'}},
    'llama-4-maverick':  {'ttft_ms': 1060, 'label': 'Llama 4 Maverick (Azure, open weights)', 'host': 'sin', 'model': 'lab-llama4mav', 'in': 0.25, 'out': 1.0},
    'mistral-medium-3.5':{'ttft_ms': 1508, 'label': 'Mistral Medium 3.5 (Azure)', 'host': 'sin', 'model': 'lab-mistralmed', 'in': 0.40, 'out': 2.0, 'price_note': 'unverified'},
    'sarvam-105b':       {'label': 'Sarvam-105B conversations (India)', 'host': 'sv', 'model': 'sarvam-105b-conversations',
                          'in': 15 / FX, 'out': 60 / FX, 'extra': {'reasoning_effort': None}},
    'gemini-3.8-flash':  {'ttft_ms': 1991, 'label': 'Gemini 3.8 Flash', 'host': 'gm', 'model': 'gemini-3.8-flash', 'in': 0.75, 'out': 3.75, 'thinking': {'thinkingLevel': 'low'}},
    'gemini-3.5-flash-lite': {'ttft_ms': 826, 'label': 'Gemini 3.5 Flash-Lite', 'host': 'gm', 'model': 'gemini-3.5-flash-lite', 'in': 0.30, 'out': 2.50, 'thinking': {'thinkingLevel': 'minimal'}},
    'gemini-3.6-flash':  {'ttft_ms': 1102, 'label': 'Gemini 3.6 Flash', 'host': 'gm', 'model': 'gemini-3.6-flash', 'in': 0.75, 'out': 3.75, 'thinking': {'thinkingLevel': 'minimal'}},
    # conversation bake-off candidates, deployed 2026-10-20 (prices filled from the vendor pages before any cost claim)
    'gpt-5.4-mini':      {'ttft_ms': 960, 'label': 'GPT-5.4 mini (Azure)', 'host': 'sin', 'model': 'lab-gpt54mini', 'in': 0.75, 'out': 4.50, 'no_temp': True,
                          'extra': {'reasoning_effort': 'none'}, 'price_note': 'OpenAI list price (2026-10-20 sweep); Azure meter not read'},
    'deepseek-v4.1-flash': {'ttft_ms': 2800, 'label': 'DeepSeek V4.1 Flash (Azure, open weights)', 'host': 'sin', 'model': 'lab-dsv41flash', 'in': 0.0, 'out': 0.0, 'price_note': 'unverified'},
    'mistral-large-3':   {'label': 'Mistral Large 3 (Azure, open weights)', 'host': 'sin', 'model': 'lab-mistrall3', 'in': 0.0, 'out': 0.0, 'legacy_max': True, 'price_note': 'unverified'},
    # OpenAI's newest tiers through OpenRouter (provider pinned to OpenAI), thinking off; Azure quota for these is held by
    # Taxila's deployments, so the bake-off reaches them here. Prices: OpenAI pricing page via the 2026-10-20 research sweep.
    'gpt-6-luna@or':     {'ttft_ms': 1438, 'label': 'GPT-6 Luna (OpenAI via OpenRouter)', 'host': 'or', 'model': 'openai/gpt-6-luna', 'provider': 'openai',
                          'in': 0.10, 'out': 0.50, 'no_temp': True, 'extra': {'reasoning': {'effort': 'none'}}},
    'gpt-6-sol@or':      {'ttft_ms': 1739, 'label': 'GPT-6 Sol (OpenAI via OpenRouter)', 'host': 'or', 'model': 'openai/gpt-6-sol', 'provider': 'openai',
                          'in': 2.0, 'out': 10.0, 'no_temp': True, 'extra': {'reasoning': {'effort': 'none'}}},
    'gpt-5.6-sol@or':    {'ttft_ms': 1174, 'label': 'GPT-5.6 Sol (OpenAI via OpenRouter)', 'host': 'or', 'model': 'openai/gpt-5.6-sol', 'provider': 'openai',
                          'in': 4.0, 'out': 20.0, 'no_temp': True, 'extra': {'reasoning': {'effort': 'none'}}},
    'gpt-5.6-terra@or':  {'ttft_ms': 1604, 'label': 'GPT-5.6 Terra (OpenAI via OpenRouter)', 'host': 'or', 'model': 'openai/gpt-5.6-terra', 'provider': 'openai',
                          'in': 2.0, 'out': 12.0, 'no_temp': True, 'extra': {'reasoning': {'effort': 'none'}}},
    # Gemini through OpenRouter was retired 2026-10-21 (decision.2026-10-21.gemini-vertex-only): Gemini runs on Vertex only.
    'gemini-3.1-flash-lite': {'ttft_ms': 2843, 'label': 'Gemini 3.1 Flash-Lite', 'host': 'gm', 'model': 'gemini-3.1-flash-lite', 'in': 0.25, 'out': 1.50, 'thinking': {'thinkingLevel': 'minimal'}},
}

# ---------------------------------------------------------------- text-to-speech
# Azure voices bill per character; Gemini TTS per audio token (25 tokens per second of audio).
TTS = {
    'azure':  {'label': 'Azure neural voice', 'kind': 'azure', 'default_voice': 'hi-IN-SwaraNeural',
               'voices': ['hi-IN-SwaraNeural', 'hi-IN-AnanyaNeural', 'hi-IN-KavyaNeural', 'hi-IN-AartiNeural', 'en-IN-NeerjaNeural', 'hi-IN-MadhurNeural'],
               'usd_1m_chars': 15.0, 'src': 'Azure S1 neural TTS $15/1M chars'},
    'azure-hd': {'label': 'Azure HD voice (DragonHD)', 'kind': 'azure', 'default_voice': 'en-IN-Aarti:DragonHDLatestNeural',
               'voices': ['en-IN-Aarti:DragonHDLatestNeural', 'en-IN-Meera:DragonHDLatestNeural', 'en-IN-Diya:DragonHDLatestNeural',
                          'en-IN-Neerja:DragonHDLatestNeural', 'hi-in-diya:DragonHDOmniIndicNeural', 'hi-in-hazelmori:DragonHDOmniIndicNeural'],
               'usd_1m_chars': 22.0, 'src': 'Azure Neural HD $22/1M chars'},
    'azure-mai': {'label': 'Azure MAI-Voice-2.1 (emotion styles, preview)', 'kind': 'azure', 'default_voice': 'hi-IN-Kavya:MAI-Voice-2.1-Flash',
               'voices': ['hi-IN-Kavya:MAI-Voice-2.1-Flash', 'hi-IN-Priya:MAI-Voice-2.1-Flash', 'hi-IN-Kavya:MAI-Voice-2.1', 'hi-IN-Priya:MAI-Voice-2.1',
                          'hi-IN-Harper:MAI-Voice-2.1-Flash', 'hi-IN-Dhruv:MAI-Voice-2.1-Flash'],
               'usd_1m_chars': 22.0, 'price_note': 'unverified: priced like HD until the meter is read', 'emotion': True,
               'styles': ['happy', 'sad', 'hopeful', 'relieved', 'softvoice', 'excited', 'joyful', 'regretful', 'surprised', 'confused', 'determined', 'fearful'],
               'src': 'voices list centralindia 2026-10-19'},
    'sarvam': {'label': 'Sarvam Bulbul v4 Flash', 'kind': 'sarvam', 'model': 'bulbul:v4-flash', 'default_voice': 'ishita_enhi_customer_expressive',
               'voices': ['ishita_enhi_customer_expressive', 'simran_enhi_companion', 'simran_enhi_customer', 'shalini_enhi_customer', 'ishita_enhi_companion',
                          'sanchita_enhi_companion', 'simran_enhi_banking_expressive', 'kavya_hi_conversational', 'ritu_hi_conversation', 'aarti_hi_customer',
                          'shubh_enhi_companion', 'sunny_enhi_customer'],
               'usd_1m_chars': 20 * 100 / FX, 'src': 'Sarvam pricing page: ₹20 per 10K chars (v4 Flash, pay as you go)'},
    'gemini': {'label': 'Gemini 3.8 Flash TTS', 'kind': 'gemini', 'model': 'gemini-3.8-flash-tts', 'default_voice': 'Despina',
               'voices': ['Despina', 'Sulafat', 'Achernar', 'Aoede', 'Kore', 'Leda', 'Autonoe', 'Callirrhoe', 'Vindemiatrix', 'Zephyr', 'Puck', 'Charon'],
               'usd_audio_min': 9.0 * 25 * 60 / 1e6, 'src': 'g1: $9/1M audio tokens (doubles 2027-01-01)'},
    'gemini-lite': {'label': 'Gemini 3.8 Flash-Lite TTS', 'kind': 'gemini', 'model': 'gemini-3.8-flash-lite-tts', 'default_voice': 'Despina',
               'voices': ['Despina', 'Sulafat', 'Achernar', 'Aoede', 'Kore', 'Leda', 'Autonoe', 'Callirrhoe', 'Vindemiatrix', 'Zephyr', 'Puck', 'Charon'],
               'usd_audio_min': 6.0 * 25 * 60 / 1e6, 'src': 'g1: $6/1M audio tokens'},
}

# ---------------------------------------------------------------- speech-to-speech
S2S = {
    'gemini-3.1-live': {'label': 'Gemini 3.1 Flash Live (Maya)', 'kind': 'gemini_live', 'model': 'gemini-3.1-flash-live-preview', 'voice': 'Despina',
                        'compression': (6000, 3000), 'voices': TTS['gemini']['voices']},
    'gemini-3.8-live': {'label': 'Gemini 3.8 Live', 'kind': 'gemini_live', 'model': 'gemini-3.8-live', 'voice': 'Despina', 'compression': None,
                        'voices': TTS['gemini']['voices']},
    'azure-rt-mini':   {'label': 'gpt-realtime-mini (Azure)', 'kind': 'azure_rt', 'deployment': 'lab-rtmini', 'voice': 'marin',
                        'voices': ['marin', 'cedar', 'coral', 'shimmer', 'sage', 'alloy', 'verse', 'ballad'],
                        # OpenAI list for gpt-realtime-mini (text in 0.60, audio in 10, text out 2.40, audio out 20 per 1M); Azure meter not yet read
                        'price': {'in_text': 0.60, 'in_audio': 10.0, 'in_cached': 0.06, 'out_text': 2.40, 'out_audio': 20.0}, 'price_note': 'unverified on Azure'},
}

# Gemini Live (speech-to-speech) per-modality prices, USD per 1M tokens (voicelab/server/calls.py gemini_usage_usd).
LIVE_PRICE = {'in': {'TEXT': 0.75, 'AUDIO': 3.0}, 'out': {'TEXT': 4.5, 'AUDIO': 12.0}, 'thoughts': 4.5, 'unknown_in': 3.0}

# Telephony, INR per minute with a 60 s pulse (Plivo India console, 2026-10-19; voicelab/server/phone.py). Exotel's
# rate is not read from a meter yet: priced like Plivo until it is (graded 'not_measured' in the cost line detail).
TELEPHONY_INR_MIN = {'plivo': {'inbound': 0.376, 'outbound': 0.38}, 'exotel': {'inbound': 0.38, 'outbound': 0.38}}
TELEPHONY_PULSE_S = 60

# Brain fallbacks for non-test calls only, and only when VP_FALLBACKS=1 (production failover policy is still open,
# open.2026-10-20.product-failover-policy): the same model on another host, never a different model.
BRAIN_FALLBACK = {}   # the Gemini -> OpenRouter fallbacks were retired with OpenRouter Gemini (Vertex only); none today

# Routing policy (directive.2026-10-22.provider-routing): Gemini through Vertex; whatever our Azure Foundry hosts through
# Azure; OpenRouter only for what is in neither (the GPT-6 / GPT-5.6 tiers: our Foundry quota for them is Taxila's).
ROUTE_OF_HOST = {'gm': 'vertex', 'sin': 'azure-foundry', 'sea': 'azure-foundry', 'or': 'openrouter', 'sv': 'sarvam'}
for _b in BRAINS.values(): _b['route'] = ROUTE_OF_HOST[_b['host']]
ROUTE_OF_KIND = {'gemini': 'vertex', 'gemini_live': 'vertex', 'azure': 'azure-speech', 'sarvam': 'sarvam', 'oai_rt_tx': 'azure-foundry', 'azure_rt': 'azure-foundry'}
for _t in (STT, TTS, S2S):
    for _x in _t.values(): _x['route'] = ROUTE_OF_KIND[_x['kind']]

BRAIN_PROVIDER = {'gm': 'gemini', 'or': 'openrouter', 'sin': 'azure-openai', 'sea': 'azure-openai', 'sv': 'sarvam'}


def brain_usd(brain_id, tokens_in, tokens_out, cached=0):
    b = BRAINS[brain_id]
    return (max(0, tokens_in - cached) * b['in'] + cached * b['in'] * 0.25 + tokens_out * b['out']) / 1e6


def ears_usd(stt_id, audio_s):
    return audio_s / 60 * STT[stt_id]['usd_min']


def voice_usd(tts_id, chars=0, audio_s=0.0):
    t = TTS[tts_id]
    if 'usd_1m_chars' in t: return chars * t['usd_1m_chars'] / 1e6      # Azure, Sarvam: per character
    return audio_s / 60 * t['usd_audio_min']                            # Gemini: per audio token


def voice_unit(tts_id):
    return 'char' if 'usd_1m_chars' in TTS[tts_id] else 'second'


def live_usd(usage_metadata):
    """Cost of one Gemini Live usageMetadata block (per-modality token details)."""
    um = usage_metadata or {}; usd = 0.0; seen = 0
    for x in um.get('promptTokensDetails') or []:
        n = x.get('tokenCount', 0) or 0; seen += n; usd += n * LIVE_PRICE['in'].get(x.get('modality'), LIVE_PRICE['unknown_in']) / 1e6
    for x in um.get('responseTokensDetails') or []:
        usd += (x.get('tokenCount', 0) or 0) * LIVE_PRICE['out'].get(x.get('modality'), 12.0) / 1e6
    usd += (um.get('thoughtsTokenCount', 0) or 0) * LIVE_PRICE['thoughts'] / 1e6
    gap = (um.get('promptTokenCount', 0) or 0) - seen
    if gap > 0: usd += gap * LIVE_PRICE['unknown_in'] / 1e6
    return usd


def telephony_inr(trunk, direction, secs):
    rate = TELEPHONY_INR_MIN.get(trunk, TELEPHONY_INR_MIN['plivo'])[direction]
    pulses = -(-max(secs, 1) // TELEPHONY_PULSE_S)
    return pulses * rate, pulses * TELEPHONY_PULSE_S
