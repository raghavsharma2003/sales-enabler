"""Reconstructed per-connected-minute COGS for SquadStack's observed stack options (desk computation, not measured).
Component prices: research/2026-10-18/lanes/g4-market-selfhost/prices.csv and research/2026-10-18/model/results/inputs.csv
(read 2026-10-18/19, FX 95). Stack options: observed in SquadStack's public AI-platform bundle (data/teardown/squadstack/ai-platform-js)
and trust-centre subprocessor list (data/teardown/squadstack/trust). Run: python3 -I cogs.py > ../cogs.csv"""
import csv, sys
# INR per connected minute, (lo, mid, hi)
STT = {
    'arth_selfhost': (0.03, 0.047, 0.08),   # proxy: IndicConformer on L4 @30-70% util (inputs.csv sh_stt_inr_min_u50); Arth's real GPU cost unknown
    'sarvam_rt':     (0.205, 0.31, 0.41),   # Sarvam real-time STT Growth, VAD-gated .. whole call (prices.csv)
    'cartesia_ink2': (0.309, 0.46, 0.618),  # Cartesia Ink-2 Scale, gated .. whole call (prices.csv)
}
LLM = {  # in-call LLM; Gemini 2.5 Flash price not read this session -> Gemini flash-lite rows used as proxy (cached .. uncached), +5.5% OpenRouter fee
    'gemini_flash_proxy': (0.175*1.055, 0.4*1.055, 0.655*1.055),
}
TTS = {
    'elevenlabs_multilingual_v2_payg': (2.675, 2.675, 3.344),  # $80/1M chars, 352..440 chars/min (prices.csv); enterprise discount unknown
    'elevenlabs_flash_turbo_payg':     (1.338, 1.338, 1.672),
    'cartesia_sonic36_scale':          (1.25, 1.25, 1.562),
    'sarvam_bulbul_v4_flash_growth':   (0.598, 0.598, 0.748),
    'inhouse_selfhost_proxy':          (0.10, 0.139, 0.23),     # proxy: Veena on H100 @50% util (inputs.csv sh_tts_inr_min_u50)
}
POSTCALL = (0.01, 0.03, 0.06)   # entity extraction (openrouter google/gemini-2.5-flash default) + AI QA pass; assumption
TEL = (0.38, 0.43, 0.48)        # Indian CPaaS per billed minute (inputs.csv tel_inr_min); Exotel/Ozonetel/Plivo are SquadStack subprocessors
INFRA = (0.01, 0.03, 0.06)      # orchestration + recordings (inputs.csv infra_inr_min)
PRICES = [2.0, 3.5, 5.0]        # SquadStack homepage FAQ 'typically INR 2-5/min' incl. dialer + telephony (vendor-claimed)
w = csv.writer(sys.stdout)
w.writerow(['stt','llm','tts','cogs_lo','cogs_mid','cogs_hi'] + [f'margin_mid_at_{p}' for p in PRICES] + ['note'])
for s, sv in STT.items():
    for l, lv in LLM.items():
        for t, tv in TTS.items():
            c = [round(sv[i] + lv[i] + tv[i] + POSTCALL[i] + TEL[i] + INFRA[i], 3) for i in range(3)]
            m = [round(1 - c[1] / p, 3) for p in PRICES]
            w.writerow([s, l, t] + c + m + ['ex GST; excludes human advisors pod, FDE/CSM, setup work, unanswered-dial and voicemail minutes not billed to the buyer'])
