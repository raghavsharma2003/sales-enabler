# VP voice lab: the components and presets the owner can call. Prices are USD list prices with their source; the lab
# meters real usage against them so every call shows its own rupees per minute. FX is the research programme's ₹95/$.
import os
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
# host: sin = vp-lab-ai-sin (South India account), sea = vp-research-ai-sea, or = OpenRouter, gm = Gemini API
BRAINS = {
    'gpt-oss-120b@groq': {'ttft_ms': 483, 'label': 'gpt-oss-120b on Groq (report baseline)', 'host': 'or', 'model': 'openai/gpt-oss-120b', 'provider': 'groq',
                          'in': 0.15, 'out': 0.60, 'extra': {'reasoning': {'effort': 'low', 'exclude': True}}, 'out_pad': 400},
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

# ---------------------------------------------------------------- presets: the owner's list from the report
# ref = the report's numbers (AI ₹/min, latency) so the lab can show "report said" next to "you measured".
P = lambda **k: k
PRESETS = [
    P(id='base', label='Base: gated Gemini transcription + gpt-oss + Azure voice', ref='₹0.94 · 1.04 s · 23% cut-ins',
      stt='gemini', gated=True, brain='gpt-oss-120b@groq', tts='azure'),
    P(id='base-gemvoice', label='Gated transcription + gpt-oss + Gemini voice', ref='₹0.98 · ~2.0 s (computed)',
      stt='gemini', gated=True, brain='gpt-oss-120b@groq', tts='gemini-lite'),
    P(id='sarvam', label='Sarvam speech + gpt-oss + Bulbul voice', ref='₹1.04 · not tested', needs='SARVAM_API_KEY',
      stt='sarvam', gated=True, brain='gpt-oss-120b@groq', tts='sarvam'),
    P(id='base-ungated', label='Same as base, ungated transcription', ref='₹1.24 · 1.03 s · 32% cut-ins',
      stt='gemini', gated=False, brain='gpt-oss-120b@groq', tts='azure'),
    P(id='azure-gated', label='All-Azure, gated (India-processed)', ref='₹1.36 · 0.99 s · 30% cut-ins',
      stt='azure', gated=True, brain='gpt-4.1-mini-in', tts='azure'),
    P(id='base-hd', label='Base with Azure HD voice', ref='₹1.47 · ~1.09 s (computed)',
      stt='gemini', gated=True, brain='gpt-oss-120b@groq', tts='azure-hd'),
    P(id='gem-lite-azure', label='Gemini transcription + 3.5 Flash-Lite + Azure voice', ref='₹1.53 · 1.69 s',
      stt='gemini', gated=False, brain='gemini-3.5-flash-lite', tts='azure'),
    P(id='all-gemini', label='All-Gemini pipeline', ref='₹1.56 · ~2.5 s (computed)',
      stt='gemini', gated=False, brain='gemini-3.5-flash-lite', tts='gemini'),
    P(id='azure-rt-mini', label='OpenAI realtime mini (Azure)', ref='₹1.91 · not tested', s2s='azure-rt-mini'),
    P(id='azure-stream', label='All-Azure, full stream (round-2 baseline)', ref='₹2.19 · 1.03 s · 27% cut-ins',
      stt='azure', gated=False, brain='gpt-4.1-mini-in', tts='azure'),
    P(id='azure-hd-stack', label='Azure speech + Azure HD voice', ref='₹2.70 · 1.04–1.13 s · 15–27% cut-ins',
      stt='azure', gated=False, brain='gpt-4.1-mini-in', tts='azure-hd'),
    P(id='gemini-3.1-live', label='Gemini 3.1 Flash Live, 6k compression (Maya)', ref='₹4.19 · 1.95 s', s2s='gemini-3.1-live'),
    P(id='gemini-3.8-live', label='Gemini 3.8 Live', ref='₹5.72 · 1.0 s · 42% talk-over', s2s='gemini-3.8-live'),
    # added 2026-10-19 after the owner's notes: Asha's architecture, Azure's new emotional voices, a Maya-voice cascade
    P(id='asha', label="Asha's architecture: gpt-4o-transcribe + GPT-4.1 + DragonHD", ref='new · Taxila tutor stack',
      stt='asha', gated=False, brain='gpt-4.1', tts='azure-hd', new=True),
    P(id='mai-emotion', label='Azure MAI-Voice emotional voice + per-reply emotion', ref='new · preview voice',
      stt='gemini', gated=True, brain='gpt-4.1-mini-in', tts='azure-mai', notes=True, new=True),
    P(id='sarvam-india', label='All-Sarvam: Saaras + Sarvam-105B + Bulbul (Indian stack)', ref='new', needs='SARVAM_API_KEY',
      stt='sarvam', gated=True, brain='sarvam-105b', tts='sarvam', new=True),
    P(id='maya-cascade', label='Maya voice (Despina) cascade, with delivery notes', ref='new',
      stt='gemini', gated=True, brain='gemini-3.5-flash-lite', tts='gemini', notes=True, new=True),
    # round 2 (2026-10-20): the human-conversation brief v2 (voicelab/server/persona_v2.py) with its agenda ledger and
    # her own hang-up. Brains picked by the text bake-off (evals/convo_bench.py) and the India latency bench.
    P(id='v2-live', label='v2 · Gemini 3.8 Live, Despina (speech-to-speech)', ref='round 2 · judges’ best brain family, ~1.2 s',
      s2s='gemini-3.8-live', brief='v2', round=2, new=True),
    P(id='v2-flashlite', label='v2 · Gemini ears + Gemini 3.5 Flash-Lite + Gemini voice', ref='round 2 · fastest good brain, 0.70 s',
      stt='gemini', gated=True, brain='gemini-3.5-flash-lite', tts='gemini-lite', brief='v2', round=2, new=True),
    P(id='v2-54mini', label='v2 · Gemini ears + GPT-5.4 mini + Gemini voice', ref='round 2 · OpenAI fast tier, 0.96 s',
      stt='gemini', gated=True, brain='gpt-5.4-mini', tts='gemini-lite', brief='v2', round=2, new=True),
    P(id='v2-38flash', label='v2 · Gemini ears + Gemini 3.8 Flash + Gemini voice', ref='round 2 · best judged brain, slow (2.0 s)',
      stt='gemini', gated=True, brain='gemini-3.8-flash', tts='gemini-lite', brief='v2', round=2, new=True),
    P(id='v2-mai', label='v2 · Gemini ears + Gemini 3.5 Flash-Lite + Azure MAI-Voice (emotion styles)', ref='round 2 · fastest voice, 0.43 s',
      stt='gemini', gated=True, brain='gemini-3.5-flash-lite', tts='azure-mai', brief='v2', round=2, new=True),
    P(id='v2-luna', label='v2 · Gemini ears + GPT-6 Luna + Gemini voice', ref='owner’s pick, judged last in the bake-off, 1.4 s',
      stt='gemini', gated=True, brain='gpt-6-luna@or', tts='gemini-lite', brief='v2', new=True),
]

def enabled(p):
    need = p.get('needs')
    return not need or bool(os.environ.get(need))

SCENARIOS = {
    'renewal': {'label': 'Insurance renewal (she calls you)', 'agent_first': True},
    'support': {'label': 'Late order support (you call her)', 'agent_first': True},
    'followup': {'label': 'Study-abroad enquiry follow-up (she calls you)', 'agent_first': True, 'v2_only': True},
    'open':    {'label': 'Open chat, she remembers you', 'agent_first': True},
}
