"""Desk cost model for Gemini Live and a Gemini-only cascade (lane g1-gemini-desk, 2026-10-18).

COMPUTED, not measured. Every price comes from prices.json (read 2026-10-18 from
ai.google.dev/gemini-api/docs/pricing and the Agent Platform (ex-Vertex) pricing page).
Billing rules come from ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing:
  - each turn bills ALL tokens in the session context window (system instruction + every
    retained past turn, audio kept as audio tokens) at the input rate, plus the new input;
  - output audio is billed at the audio output rate once, then re-billed as input history;
  - transcription text (input and output) is billed at the text OUTPUT rate;
  - with proactive audio (always on for gemini-3.8-live) input is billed the whole time
    the model listens;
  - sliding-window compression drops the oldest turns once the context exceeds
    triggerTokens (default 80% of the 131,072 window) down to targetTokens (default trigger/2).
Audio = 25 tokens/s (Live, TTS and Transcribe pages). FX = INR 95 per USD.

Behavioural parameters (turns/min, talk shares, prompt size) are ASSUMPTIONS, marked
below; g2-gemini-live measures the real per-turn usageMetadata. Re-run with
`python3 -I live_cost_model.py` to regenerate live_cost_model.csv.
"""
import csv
import os
from collections import deque

FX = 95.0
TOK_S = 25  # audio tokens per second (documented)
TX_TOK_S = 175 / 60  # transcript text tokens per second of speech (Google's own estimate: 175/min)
DEFAULT_TRIGGER = int(0.8 * 131072)  # documented default triggerTokens

# USD per 1M tokens, Standard tier, paid (prices.json)
LIVE = {
    "gemini-3.1-flash-live-preview": dict(text_in=0.75, audio_in=3.00, text_out=4.50, audio_out=12.00),
    "gemini-3.8-live": dict(text_in=0.75, audio_in=3.00, text_out=4.50, audio_out=12.00),
    "gemini-2.5-flash-native-audio-preview-12-2025": dict(text_in=0.50, audio_in=3.00, text_out=2.00, audio_out=12.00),
}


def meera_2026_08_23_style(a=0.39, S=14000, connection_min=10.0, tx=True):
    """Reconstruction (ours, approximate) of the per-minute arithmetic behind Meera's
    callcost-2026-08-23 'live voice $0.0142/min': a continuously streamed minute of input audio
    (60 s x 25 tok) billed ONCE, her output audio billed once, the system instruction billed once
    per connection (the entry says ~$0.0105 per goAway rotation, i.e. ~14k text tokens at $0.75/M),
    plus transcripts. No per-turn re-billing of context. The original calc script was in an
    ephemeral scratchpad and is lost; this only shows the published figure is consistent with
    non-compounding arithmetic."""
    audio_in = 60 * TOK_S * 3.00 / 1e6
    audio_out = a * 60 * TOK_S * 12.00 / 1e6
    sysi = S * 0.75 / 1e6 / connection_min
    trans = (60 * TX_TOK_S * 4.50 / 1e6) if tx else 0.0
    return audio_in + audio_out + sysi + trans


def live_call(minutes, model, S, tax, tpm=6, u=0.35, a=0.40, trigger=None, target=None,
              listen_all=False, listen_in_ctx=False, transcripts=True):
    """Return dict of billed tokens and USD for one call.

    S       system-instruction text tokens (in context every turn)
    tax     constant AUDIO prompt tokens per turn (Meera measured +201 when voiceConfig is declared)
    tpm     turns (user utterance + agent reply) per minute
    u, a    user / agent speech share of wall-clock time
    listen_all     proactive-audio regime: silence (1-u-a) is billed as fresh input each turn
    listen_in_ctx  ...and is also retained in the context (upper bound)
    """
    p = LIVE[model]
    n = round(minutes * tpm)
    sec = 60.0 / tpm
    U = u * sec * TOK_S
    A = a * sec * TOK_S
    L = (1 - u - a) * sec * TOK_S if listen_all else 0.0
    trig = trigger or DEFAULT_TRIGGER
    targ = target or trig // 2
    hist = deque()
    hsum = 0.0
    tin = ain = aout = tout = 0.0
    compressions = 0
    for _ in range(n):
        if S + tax + hsum + U + L > trig:
            compressions += 1
            while hist and S + tax + hsum > targ:
                hsum -= hist.popleft()
        tin += S
        ain += tax + hsum + U + L
        aout += A
        if transcripts:
            tout += (u + a) * sec * TX_TOK_S
        block = U + A + (L if listen_in_ctx else 0.0)
        hist.append(block)
        hsum += block
    usd = (tin * p["text_in"] + ain * p["audio_in"] + aout * p["audio_out"] + tout * p["text_out"]) / 1e6
    return dict(turns=n, text_in=tin, audio_in=ain, audio_out=aout, text_out=tout,
                compressions=compressions, usd=usd, usd_per_min=usd / minutes,
                inr_per_min=usd / minutes * FX, final_ctx=S + tax + hsum)


def cascade_call(minutes, llm, tts, S, tpm=6, u=0.35, a=0.40, cached_frac=0.607, year=2026,
                 stt_usd_per_min=0.008925):
    """Gemini-only cascade: gemini-3.5-transcribe-live (Google's blended $/min, streamed for the
    whole call) -> text LLM (history as transcript text; implicit-cache share of the prompt,
    Meera measured 60.7% on gemini-3.6-flash, n=20) -> Gemini TTS (agent speech at 25 tok/s)."""
    LLM = {
        "gemini-3.5-flash-lite": dict(i=0.30, c=0.03, o=2.50),
        "gemini-3.1-flash-lite": dict(i=0.25, c=0.025, o=1.50),
        "gemini-3.8-flash": dict(i=0.75, c=0.075, o=3.75) if year == 2026 else dict(i=1.50, c=0.15, o=7.50),
    }[llm]
    TTS = {
        "gemini-3.8-flash-lite-tts": dict(i=0.50, o=6.00) if year == 2026 else dict(i=1.00, o=12.00),
        "gemini-3.8-flash-tts": dict(i=0.50, o=9.00) if year == 2026 else dict(i=1.00, o=18.00),
    }[tts]
    n = round(minutes * tpm)
    sec = 60.0 / tpm
    ut = u * sec * TX_TOK_S
    at = a * sec * TX_TOK_S
    hist = 0.0
    llm_in = llm_out = 0.0
    for _ in range(n):
        prompt = S + hist + ut
        llm_in += prompt
        llm_out += at
        hist += ut + at
    llm_usd = (llm_in * cached_frac * LLM["c"] + llm_in * (1 - cached_frac) * LLM["i"] + llm_out * LLM["o"]) / 1e6
    tts_usd = (llm_out * TTS["i"] + a * minutes * 60 * TOK_S * TTS["o"]) / 1e6
    stt_usd = stt_usd_per_min * minutes
    usd = llm_usd + tts_usd + stt_usd
    return dict(usd=usd, usd_per_min=usd / minutes, inr_per_min=usd / minutes * FX,
                stt_share=stt_usd / usd, tts_share=tts_usd / usd, llm_share=llm_usd / usd)


def main():
    rows = []
    profiles = {"lean_1.5k": (1500, 201), "lean_1.5k_notax": (1500, 0), "meera_12k": (12000, 201)}

    def comp_for(S, tax):
        # history caps are set RELATIVE to the fixed prefix: a trigger below S+tax would evict
        # every past turn on every turn (the agent forgets the call), which is not a usable config
        return {"none(default trigger 104858)": (None, None),
                "trig25k_targ8k(doc example)": (max(25000, S + tax + 2000), max(8000, S + tax + 1000)),
                "history<=8k(trig S+8k,targ S+4k)": (S + tax + 8000, S + tax + 4000),
                "history<=4k(trig S+4k,targ S+2k)": (S + tax + 4000, S + tax + 2000)}

    comp = comp_for(1500, 201)
    for model in LIVE:
        regimes = [("speech_only", False, False)]
        if model == "gemini-3.8-live":
            regimes = [("proactive_listen_billed", True, False), ("proactive_listen_in_ctx", True, True)]
        for prof, (S, tax) in profiles.items():
            for cname, (tr, tg) in comp_for(S, tax).items():
                for reg, la, lic in regimes:
                    for tpm in (4, 6, 10):
                        for m in (1, 3, 5, 10):
                            r = live_call(m, model, S, tax, tpm=tpm, trigger=tr, target=tg,
                                          listen_all=la, listen_in_ctx=lic)
                            rows.append(dict(stack="live", model=model, profile=prof, compression=cname,
                                             regime=reg, turns_per_min=tpm, minutes=m,
                                             usd_per_min=round(r["usd_per_min"], 5),
                                             inr_per_min=round(r["inr_per_min"], 3),
                                             compressions=r["compressions"],
                                             final_ctx_tokens=int(r["final_ctx"])))
    for llm in ("gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"):
        for tts in ("gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"):
            for year in (2026, 2027):
                for prof, (S, _) in profiles.items():
                    for m in (1, 3, 5, 10):
                        r = cascade_call(m, llm, tts, S, year=year)
                        rows.append(dict(stack=f"cascade(3.5-transcribe-live+{llm}+{tts})", model=llm,
                                         profile=prof, compression=f"prices_{year}", regime="n/a",
                                         turns_per_min=6, minutes=m,
                                         usd_per_min=round(r["usd_per_min"], 5),
                                         inr_per_min=round(r["inr_per_min"], 3), compressions=0,
                                         final_ctx_tokens=0))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live_cost_model.csv")
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {out}")

    # headline tables
    m = meera_2026_08_23_style()
    print(f"\nReconstruction of Meera's non-compounding arithmetic: ${m:.4f}/min = INR {m*FX:.2f} at 95 (INR {m*86:.2f} at ~86, the FX implied by that entry's Rs.1,096/$13)")
    print("\nLIVE (gemini-3.1-flash-live-preview == gemini-3.8-live prices), 6 turns/min, u=0.35 a=0.40, INR/min")
    for prof, (S, tax) in profiles.items():
        for cname, (tr, tg) in comp_for(S, tax).items():
            vals = [live_call(m, "gemini-3.1-flash-live-preview", S, tax, trigger=tr, target=tg)["inr_per_min"] for m in (1, 3, 5, 10)]
            print(f"  {prof:10s} {cname:30s} " + "  ".join(f"{m}m={v:5.2f}" for m, v in zip((1, 3, 5, 10), vals)))
    print("\nTurn-rate sensitivity, lean_1.5k (tax 201), no compression:")
    for tpm in (4, 6, 10):
        vals = [live_call(m, "gemini-3.1-flash-live-preview", 1500, 201, tpm=tpm)["inr_per_min"] for m in (1, 3, 5, 10)]
        print(f"  {tpm:2d} turns/min " + "  ".join(f"{m}m={v:5.2f}" for m, v in zip((1, 3, 5, 10), vals)))
    print("\nTalk-share sensitivity (lean, 6 tpm, no compression): agent a / user u")
    for u, a in ((0.25, 0.25), (0.35, 0.40), (0.30, 0.55)):
        vals = [live_call(m, "gemini-3.1-flash-live-preview", 1500, 201, u=u, a=a)["inr_per_min"] for m in (1, 3, 5, 10)]
        print(f"  u={u} a={a} " + "  ".join(f"{m}m={v:5.2f}" for m, v in zip((1, 3, 5, 10), vals)))
    print("\n2.5 native audio (cheaper text rates), lean, no compression:")
    vals = [live_call(m, "gemini-2.5-flash-native-audio-preview-12-2025", 1500, 201)["inr_per_min"] for m in (1, 3, 5, 10)]
    print("  " + "  ".join(f"{m}m={v:5.2f}" for m, v in zip((1, 3, 5, 10), vals)))
    print("\n3.8 Live proactive regimes, lean, no compression:")
    for la, lic, lab in ((True, False, "listen billed"), (True, True, "listen kept in ctx")):
        vals = [live_call(m, "gemini-3.8-live", 1500, 201, listen_all=la, listen_in_ctx=lic)["inr_per_min"] for m in (1, 3, 5, 10)]
        print(f"  {lab:20s} " + "  ".join(f"{m}m={v:5.2f}" for m, v in zip((1, 3, 5, 10), vals)))
    print("\nCASCADE lean, 6 turns/min, INR/min:")
    for llm in ("gemini-3.5-flash-lite", "gemini-3.1-flash-lite"):
        for year in (2026, 2027):
            vals = [cascade_call(m, llm, "gemini-3.8-flash-lite-tts", 1500, year=year) for m in (1, 3, 5, 10)]
            print(f"  {llm:24s} {year} " + "  ".join(f"{m}m={v['inr_per_min']:5.2f}" for m, v in zip((1, 3, 5, 10), vals))
                  + f"   shares@3m stt={vals[1]['stt_share']:.0%} tts={vals[1]['tts_share']:.0%} llm={vals[1]['llm_share']:.0%}")


if __name__ == "__main__":
    main()
