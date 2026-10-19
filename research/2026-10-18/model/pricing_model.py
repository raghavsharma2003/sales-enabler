#!/usr/bin/env python3
"""VP voice-stack pricing model (synthesis lane, 2026-10-19).

Turns the measured and published inputs of lanes g1-g5 (research/2026-10-18/lanes/) into INR per
connected minute and per call, by stack and call length (1/3/5/10 min), with a Monte Carlo over the
uncertain inputs, the allowed AI budget for a INR 2/min PRICE, a volume curve, and a 3-tier offer.

Method tags used in inputs.csv:
  read-primary  price read from the vendor's own page/API by a lane (lane file cited)
  measured      our own measurement (lane file cited, n stated there)
  computed      arithmetic on the two above
  vendor-claim  a vendor's own statement, not checked by us
  assumption    a modelled input nobody observed; a range is always given

Nothing here calls a paid API. Deterministic case = the "reference shape" g3 used and its verifier
confirmed (5 exchanges/min, agent 24 s/min, caller 24 s/min), FX 95, 2026 prices unless stated.

Run:  python3 -I pricing_model.py          (writes results/*.csv and charts/*.png)
"""
import csv
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
CH = os.path.join(HERE, "charts")
os.makedirs(RES, exist_ok=True)
os.makedirs(CH, exist_ok=True)

SEED = 20261019
N_MC = 20000
LENGTHS = (1, 3, 5, 10)
FX0 = 95.0

L1 = "lanes/g1-gemini-desk/prices.json"
L3C = "lanes/g3-cascade-measured/results/cost_inputs.csv"
L3U = "lanes/g3-cascade-measured/results/rederived_usage_per_exchange.csv"
L4P = "lanes/g4-market-selfhost/prices.csv"
L4S = "lanes/g4-market-selfhost/selfhost.csv"
L5 = "lanes/g5-gemini-paid/results/"
AZCV = "model/inputs/azure_custom_voice_centralindia_2026-10-19.json"
L2T = "2026-10-17/lanes/l2-economics/data/vendor-and-telephony-prices.csv"

# --------------------------------------------------------------------------------------------
# 1. Inputs register (every number the model uses; exported to results/inputs.csv)
# --------------------------------------------------------------------------------------------
INPUTS = []


def inp(key, value, unit, source, date, method, lo=None, hi=None, note=""):
    INPUTS.append(dict(key=key, value=value, lo=lo if lo is not None else "", hi=hi if hi is not None else "",
                       unit=unit, source=source, date=date, method=method, note=note))
    return value


# FX
inp("fx", 95.0, "INR per USD", "task instruction; g2 verify read Pluang mid-market 94.95 on 2026-10-19", "2026-10-19",
    "assumption", 90, 100, "MC uniform 90-100")

# Workload (reference shape, g3 + verifier)
inp("exch_per_min", 5, "caller-agent exchanges per connected minute", L3U + " (battery 3.15-4.96); g5 Live 3.7-7.3 billed turns/min",
    "2026-10-18", "assumption", 3, 7, "MC triangular(3,5,7)")
inp("agent_s", 24, "seconds of agent speech per connected minute", "g3 reference shape; g5/g2 Live calls 20-41 s (lanes/g2.../verify.md #7)",
    "2026-10-18", "assumption", 15, 40, "MC triangular(15,24,40)")
inp("caller_s", 24, "seconds of caller speech per connected minute", "g3 reference shape; g5 Live sessions.csv 13-19 s VAD speech",
    "2026-10-18", "assumption", 12, 32, "MC triangular(12,22,32); agent+caller capped at 56 s")
inp("stt_gated_ratio", 1.186, "audio seconds sent per second of caller speech when VAD-gated", L3U + " (C1+gated, C6+gated)",
    "2026-10-18", "measured", 1.1, 1.4, "n=30 exchanges per gated run; MC uniform")

# Azure Speech (centralindia)
inp("az_stt_usd_h", 1.00, "USD per audio hour (S1 real-time STT, centralindia)", L3C + "; re-read 2026-10-19 (g3 verify.md)", "2026-10-19", "read-primary")
inp("az_tts_neural_usd_1m", 15.0, "USD per 1M chars (S1 Neural TTS)", L3C, "2026-10-19", "read-primary")
inp("az_tts_hd_usd_1m", 22.0, "USD per 1M chars (Neural HD / DragonHD)", L3C, "2026-10-19", "read-primary")
inp("az_cnv_usd_1m", 24.0, "USD per 1M chars (S1 Custom Neural Realtime Characters)", AZCV, "2026-10-19", "read-primary")
inp("az_cnv_host_usd_h", 4.032, "USD per hour per hosted custom neural voice model", AZCV, "2026-10-19", "read-primary",
    note="= USD 2,943/month = INR 2.80 lakh/month per voice at FX 95")
inp("cps_az_neural", 10.03, "billed chars per agent-second, hi-IN-SwaraNeural (incl. cancelled requests)", L3U + " C1", "2026-10-18", "measured", 9.3, 10.3)
inp("cps_az_hd", 17.18, "billed chars per agent-second, en-IN-Aarti DragonHD", L3U + " C2 (C3 17.51)", "2026-10-18", "measured", 15.3, 17.5)
inp("cps_vendor", 14.67, "billed chars per agent-second, unmeasured vendor voices", L4P + " (800 chars/agent-min x 1.10 waste)", "2026-10-18", "assumption", 11.0, 17.5)

# Gemini (Gemini API Standard, paid list)
inp("gtl_audio_usd_1m", 3.50, "USD per 1M audio tokens in, gemini-3.5-transcribe-live (25 tok/s)", L1, "2026-10-18", "read-primary")
inp("gtl_text_usd_1m", 21.0, "USD per 1M text tokens out, gemini-3.5-transcribe-live", L1, "2026-10-18", "read-primary")
inp("gtl_text_tok_per_utt", 14.6, "transcript text tokens per caller utterance", "lanes/g3.../results/cost_inputs.csv note (countTokens, not metered)",
    "2026-10-18", "measured", note="MC: per-minute text tokens uniform(14.6 x exch, 175 = Google's published estimate)")
inp("gem_lite_tts_out_usd_1m_2026", 6.0, "USD per 1M audio tokens out, gemini-3.8-flash-lite-tts to 2026-12-31", L1, "2026-10-18", "read-primary")
inp("gem_lite_tts_out_usd_1m_2027", 12.0, "same, from 2027-01-01 (announced)", L1, "2026-10-18", "read-primary")
inp("gem_flash_tts_out_usd_1m_2026", 9.0, "USD per 1M audio tokens out, gemini-3.8-flash-tts to 2026-12-31", L1, "2026-10-18", "read-primary")
inp("gem_flash_tts_out_usd_1m_2027", 18.0, "same, from 2027-01-01 (announced)", L1, "2026-10-18", "read-primary")
inp("gem_tts_text_in_usd_1m_2026", 0.50, "USD per 1M text tokens in, 3.8 TTS models (1.00 from 2027-01-01)", L1, "2026-10-18", "read-primary")
inp("gem_tts_lead_s", 0.25, "leading silence billed per TTS request (s)", L5 + "tts_summary.csv (0.14-0.36 s)", "2026-10-18", "measured")
inp("flashlite_usd_1m", 0.30, "USD per 1M input tokens, gemini-3.5-flash-lite (cached 0.03, output 2.50); not in the 2027 doubling", L1, "2026-10-18", "read-primary")
inp("live_text_in_usd_1m", 0.75, "USD per 1M, gemini-3.8-live / 3.1-flash-live text in", L1 + "; g2/g5 verify re-read", "2026-10-19", "read-primary")
inp("live_audio_in_usd_1m", 3.00, "USD per 1M audio tokens in (re-billed every invocation)", L1, "2026-10-19", "read-primary")
inp("live_text_out_usd_1m", 4.50, "USD per 1M text out (thinking, transcripts)", L1, "2026-10-19", "read-primary")
inp("live_audio_out_usd_1m", 12.00, "USD per 1M audio tokens out", L1, "2026-10-19", "read-primary", note="no announced change for Live")

# LLMs
inp("oss_groq_usd_1m", 0.15, "USD per 1M in, gpt-oss-120b on Groq via OpenRouter (cache read 0.075, out 0.60)", L3C, "2026-10-19", "read-primary")
inp("openrouter_fee", 0.055, "OpenRouter platform fee on credit purchases", L4P + " / vendor-risk.csv", "2026-10-18", "read-primary", note="g3 costs did not include it")
inp("openrouter_ledger_factor", 1.2, "OpenRouter account ledger / per-response usage.cost (cancelled streams)", "lanes/g3-cascade-measured/verify.md #7",
    "2026-10-19", "measured", 1.0, 1.45, "verifier: model ~1.2x below ledger; ledger windows not fully attributable")
inp("gpt41mini_usd_1m", 0.44, "USD per 1M in, gpt-4.1-mini regional South India (cached 0.11, out 1.76); Legacy, retires 2027-04-14", L3C, "2026-10-19", "read-primary")
inp("gemma4_inworld_usd_1m", 0.07, "USD per 1M in, Gemma 4 26B-A4B on Inworld (out 0.34, no cache price)", L4P, "2026-10-18", "read-primary")

# Indian / other vendors (desk)
inp("sarvam_stt_inr_min", 0.41, "INR per audio minute, Sarvam real-time STT (Growth/Business), excl. GST", L4P, "2026-10-18", "read-primary")
inp("bulbul_v4f_inr_1k", 1.70, "INR per 1K chars, Sarvam Bulbul V4 Flash (Growth/Business), excl. GST", L4P, "2026-10-18", "read-primary")
inp("inworld_stt_usd_h", 0.10, "USD per audio hour, Inworld STT-1 (paid plans)", L4P, "2026-10-18", "read-primary")
inp("inworld_tts2f_usd_1m", 7.0, "USD per 1M chars, Inworld TTS-2 Flash (Growth, USD 1,500/month credits); on-demand 15", L4P, "2026-10-18", "read-primary")
inp("inworld_growth_usd_month", 1500, "USD per month, Inworld Growth plan (credits)", L4P, "2026-10-18", "read-primary")
inp("realtime_mini_inr_min_3", 1.911, "INR/min, gpt-realtime-2.1-mini 3-min call with prefix caching (no cache 6.93; output cached 1.50)", "lanes/g4-market-selfhost/summary.json",
    "2026-10-18", "computed", 1.50, 6.93, "desk computation from OpenAI price page; not measured")

# Self-host (g4, Indian GPU clouds, vendor-claim throughput)
inp("sh_stt_inr_min_u50", 0.0467, "INR per connected min, IndicConformer on E2E L4 at 50% utilisation", L4S, "2026-10-18", "computed",
    note="throughput vendor-claim/assumed; cost scales as 0.5/util; MC util uniform(0.3,0.7)")
inp("sh_tts_inr_min_u50", 0.139, "INR per connected min, Veena on E2E H100 on-demand at 50% utilisation", L4S, "2026-10-18", "computed")
inp("sh_stt_fleet_inr_month", 71540, "INR/month, 2x L4 minimum fleet", L4S, "2026-10-18", "computed")
inp("sh_tts_fleet_inr_month", 553413, "INR/month, 2x H100 minimum fleet (E2E on-demand)", L4S, "2026-10-18", "computed")

# Telephony, infra, budget
inp("tel_inr_min", 0.43, "INR per billed minute, Indian CPaaS (Plivo 0.38 / Sarvam-Vobiz 0.40, 30 s pulses)", "voice-stack-brief.md section 1; " + L2T,
    "2026-10-17", "read-primary", 0.38, 0.48, "MC uniform; 30-s pulse rounding modelled on call length")
inp("tel_1600_inr_min", "", "INR per minute on a 1600-series number", "SYNTHESIS-v2 3.1 [REG-24]: not published by any CPaaS", "2026-10-17", "assumption",
    0.48, 0.80, "sensitivity only; no price exists in any source")
inp("tel_tata_inr_min", 0.22, "INR/min, Tata Smartflo concurrency plan at full FUP (lever)", L2T, "2026-10-17", "computed")
inp("infra_inr_min", 0.03, "INR per connected minute, orchestration VM + egress + recordings", "computed from Standard_D4s_v5 USD 0.202/h at ~20 concurrent calls (concurrency per VM not measured)",
    "2026-10-19", "assumption", 0.01, 0.06, "MC triangular(0.01,0.03,0.06)")
inp("gst", 0.18, "GST rate on the platform's sale", "Indian GST on SaaS (standard rate)", "2026-10-19", "read-primary",
    note="input GST (and IGST paid under reverse charge on imported services) is recoverable as ITC, so COGS are modelled ex-GST; CA to confirm")
inp("price_inr_min", 2.0, "target PRICE per connected minute", "owner directive 2026-10-18", "2026-10-18", "assumption")

FX = 95.0
HOST_CNV_INR_MONTH = 4.032 * 730 * FX0


# --------------------------------------------------------------------------------------------
# 2. Component cost functions (vectorised; every argument may be a numpy array)
# --------------------------------------------------------------------------------------------
def stt_cost(kind, W, D):
    fx, e, cs = W["fx"], W["e"], W["caller_s"]
    gr = D.get("gr", 1.186)
    if kind == "none":
        return 0.0 * e
    if kind == "az_full":
        return 60 / 3600 * 1.00 * fx + 0 * e
    if kind == "az_gated":
        return cs * gr / 3600 * 1.00 * fx
    txt = D.get("gtl_txt_tok_min", None)
    if txt is None:
        txt = e * 14.6
    if kind == "gtl_full":
        return 60 * 25 * 3.5e-6 * fx + txt * 21e-6 * fx
    if kind == "gtl_gated":
        return cs * gr * 25 * 3.5e-6 * fx + txt * 21e-6 * fx
    if kind == "sarvam_gated":
        return cs * gr / 60 * 0.41
    if kind == "inworld_full":
        return 60 / 3600 * 0.10 * fx + 0 * e
    if kind == "selfhost":
        return 0.0467 * 0.5 / D.get("util", 0.5) + 0 * e
    raise KeyError(kind)


# LLM shapes measured by g3 (rederived_usage_per_exchange.csv): first-exchange prompt, growth per exchange,
# request waste factor (speculative/cancelled requests), cached share, completion tokens per exchange
LLM_SHAPE = {
    "C1": dict(P0=1727, g=51.3, waste=1.842, cache=0.94, out=28.6),
    "C2": dict(P0=1725, g=52.7, waste=1.841, cache=0.948, out=30.4),
    "C3": dict(P0=1771, g=70.0, waste=1.823, cache=0.82, out=85.2),
    "C6": dict(P0=1773, g=64.8, waste=1.864, cache=0.831, out=76.5),
    "C6g": dict(P0=1920, g=40.3, waste=1.793, cache=0.851, out=66.7),
    "C7": dict(P0=1794, g=36.2, waste=1.796, cache=0.0, out=20.4),
    "C8": dict(P0=1788, g=37.3, waste=1.78, cache=0.0, out=22.6),
}
LLM_PRICE = {  # USD per 1M: in, cached, out; route
    "oss_groq_or": (0.15, 0.075, 0.60, "openrouter"),
    "gpt41mini_si": (0.44, 0.11, 1.76, "azure"),
    "flashlite35": (0.30, 0.03, 2.50, "gemini"),
    "gemma4_inworld": (0.07, 0.07, 0.34, "inworld"),
}


def llm_cost(model, shape, W, D, s_extra=0.0, cache_override=None):
    fx, e, L = W["fx"], W["e"], W["L"]
    pin, pc, pout, route = LLM_PRICE[model]
    sh = LLM_SHAPE[shape]
    cs = sh["cache"] if cache_override is None else cache_override
    if model == "flashlite35":
        cs = D.get("flashlite_cache", 0.0)
    if model == "oss_groq_or":
        cs = D.get("groq_cache", cs)
    if model == "gemma4_inworld":
        cs = 0.0
    n_exch = np.maximum(e * L, 1.0)
    prompt = (sh["P0"] + s_extra + sh["g"] * (n_exch - 1) / 2) * sh["waste"]
    usd_exch = (prompt * ((1 - cs) * pin + cs * pc) + sh["out"] * pout) / 1e6
    fac = 1.0
    if route == "openrouter":
        fac = (1 + 0.055) * D.get("or_ledger", 1.2)
    elif route == "azure":
        fac = D.get("az_ledger", 1.0)
    elif route == "gemini":
        fac = D.get("gem_ledger", 1.0)
    return e * usd_exch * fac * fx


def tts_cost(kind, W, D, regime=2026):
    fx, e, a = W["fx"], W["e"], W["agent_s"]
    if kind == "az_neural":
        return a * D.get("cps_neural", 10.03) * 15e-6 * fx
    if kind == "az_neural_c6":
        return a * D.get("cps_neural_c6", 10.24) * 15e-6 * fx
    if kind == "az_neural_c6g":
        return a * D.get("cps_neural_c6g", 9.66) * 15e-6 * fx
    if kind == "az_hd":
        return a * D.get("cps_hd", 17.18) * 22e-6 * fx
    if kind == "az_cnv":
        return a * D.get("cps_neural", 10.03) * 24e-6 * fx
    if kind in ("gem_lite", "gem_flash"):
        pout = {("gem_lite", 2026): 6.0, ("gem_lite", 2027): 12.0, ("gem_flash", 2026): 9.0, ("gem_flash", 2027): 18.0}[(kind, regime)]
        pin = 0.5 if regime == 2026 else 1.0
        return ((a + 0.25 * e) * 25 * pout + e * 26 * pin) / 1e6 * fx
    if kind == "inworld_tts2f":
        return a * D.get("cps_vendor", 14.67) * 7e-6 * fx
    if kind == "bulbul_v4f":
        return a * D.get("cps_vendor", 14.67) / 1000 * 1.70
    if kind == "selfhost_veena":
        return 0.139 * 0.5 / D.get("util", 0.5) + 0 * e
    raise KeyError(kind)


# --------------------------------------------------------------------------------------------
# 3. Gemini Live model (per-invocation re-billing), calibrated against g5's paid meter
# --------------------------------------------------------------------------------------------
LIVE = {
    # S: system text tokens of the lanes' harness persona; A0: first-prompt audio (voiceConfig etc.);
    # g_t: text-history growth/min; und: untyped prompt tokens as a share of the retained history (they grow with the
    # call: 27 at the first invocation, 1,681-1,955 at 10 min; g5 token_growth_per_turn.csv), priced at the audio rate as g5 did;
    # thoughts per invocation (3.8 interleaved thinking); r_inv: invocations per caller exchange
    "3.1": dict(S=869, A0=316, g_t=188, und=0.13, thoughts=0.0, r_inv=0.86, r_lo=0.75, r_hi=1.0),
    "3.8": dict(S=1029, A0=257, g_t=187, und=0.085, thoughts=64.0, r_inv=1.24, r_lo=1.12, r_hi=1.46),
}
OUT_TOK_S = 25.7   # measured response audio tokens per agent-second (g5 sessions: 8,121 tok / 316 s)
TX_INR_MIN95 = 0.084  # transcription text, g5 sessions.csv usd_transcripts / minutes at FX 95


def live_cost(model, W, D, comp=None, s_extra=0.0, n_inv=None):
    """INR per connected minute for one Live call of length W['L'] minutes.
    comp: None (no compression; Meera's slidingWindow:{} default never fires in calls this short, g1 verify #3)
          or (trigger, target) tokens as configured; the API fires late and cuts high (g2 verify #3, g1 verify #3),
          modelled as effective trigger x1.45 and target x1.5 (fits 8.2-9.9k / 3.9-5.2k for 6000/3000)."""
    p = LIVE[model]
    fx, L = W["fx"], W["L"]
    a, cs, e = W["agent_s"], W["caller_s"], W["e"]
    ni = n_inv if n_inv is not None else e * D.get("r_" + model, p["r_inv"])
    S = p["S"] + s_extra
    S0 = S + p["A0"]
    g_a = OUT_TOK_S * a + 25 * cs        # audio context growth per minute (VAD speech + agent audio)
    g = g_a + p["g_t"]
    share_t = p["g_t"] / g
    und = D.get("und_" + model, p["und"])
    L = np.asarray(L, dtype=float)
    ni = np.asarray(ni, dtype=float)
    g = np.asarray(g, dtype=float)
    nmax = int(np.ceil(np.max(ni * L))) + 1
    total = 0.0
    for j in range(nmax):
        t = (j + 0.5) / ni
        mask = (j < np.floor(ni * L + 0.5)).astype(float)  # round(ni x L) invocations per call
        H = g * t
        if comp is not None:
            trig, targ = comp
            hh = np.maximum(trig * D.get("trig_mult", 1.45) - S0, 500.0)
            hl = np.minimum(np.maximum(targ * D.get("targ_mult", 1.5) - S0, 0.0), hh - 250)
            over = H > hh
            H = np.where(over, hl + np.mod(H - hh, hh - hl), H)
        txt = S + H * share_t
        aud = p["A0"] + H * (1 - share_t)
        usd = (txt * 0.75 + aud * 3.0 + und * H * 3.0 + p["thoughts"] * 4.5) / 1e6
        total = total + mask * usd
    per_min = total / L + (a * OUT_TOK_S * 12.0) / 1e6 + TX_INR_MIN95 / FX0
    listen = D.get("listen_s_" + model, 0.0)  # proactive listening billed at the audio-in rate (docs; not on the meter)
    per_min = per_min + listen * 25 * 3.0 / 1e6
    return per_min * fx


# --------------------------------------------------------------------------------------------
# 4. Stacks
# --------------------------------------------------------------------------------------------
# kind: cascade | live | table ; evidence label; latency (India VM, first audio after caller end, p50/p90 ms)
STACKS = [
    dict(id="C1", name="Azure STT + gpt-4.1-mini (South India) + Azure neural", kind="cascade",
         stt="az_full", llm=("gpt41mini_si", "C1"), tts="az_neural", ev="measured end-to-end (g3)",
         lat="1,026 / 1,143", cut="27% main, 12/12 pause", lat_src="g3 rederived_latency.csv", india_processed="yes"),
    dict(id="C1g", name="C1 with VAD-gated STT", kind="cascade", stt="az_gated", llm=("gpt41mini_si", "C1"), tts="az_neural",
         ev="measured end-to-end, 1 pass (g3)", lat="989 / 1,072", cut="30% main, 6/6 pause", lat_src="g3 rederived_latency.csv", india_processed="yes"),
    dict(id="C2", name="Azure STT + gpt-4.1-mini + Azure DragonHD", kind="cascade", stt="az_full", llm=("gpt41mini_si", "C2"), tts="az_hd",
         ev="measured end-to-end (g3)", lat="1,133 / 1,231", cut="15% main, 12/12 pause", lat_src="g3 rederived_latency.csv", india_processed="yes"),
    dict(id="C3", name="Azure STT + gpt-oss-120b@Groq + Azure DragonHD", kind="cascade", stt="az_full", llm=("oss_groq_or", "C3"), tts="az_hd",
         ev="measured end-to-end (g3)", lat="1,044 / 1,230", cut="27% main, 12/12 pause", lat_src="g3 rederived_latency.csv", india_processed="no (LLM US)"),
    dict(id="C6", name="Gemini transcribe-live + gpt-oss-120b@Groq + Azure neural", kind="cascade", stt="gtl_full", llm=("oss_groq_or", "C6"), tts="az_neural_c6",
         ev="measured end-to-end (g3)", lat="1,031 / 1,404", cut="32% main, 12/12 pause", lat_src="g3 rederived_latency.csv", india_processed="no"),
    dict(id="C6g", name="C6 with VAD-gated STT (cheapest measured)", kind="cascade", stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="az_neural_c6g",
         ev="measured end-to-end, 1 pass (g3)", lat="1,038 / 1,453", cut="23% main, 6/6 pause", lat_src="g3 rederived_latency.csv", india_processed="no"),
    dict(id="C6g-HD", name="C6g with Azure DragonHD voice", kind="cascade", stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="az_hd",
         ev="computed from measured parts", lat="~1,090 (computed: C6 + 56 ms HD first byte)", cut="as C6g", lat_src="g3 tts_india_az / rederived_latency", india_processed="no"),
    dict(id="C8", name="transcribe-live + gemini-3.5-flash-lite + Azure neural", kind="cascade", stt="gtl_full", llm=("flashlite35", "C8"), tts="az_neural",
         ev="measured end-to-end (g3, free tier)", lat="1,688 / 1,789 (fails 1.2 s)", cut="3% main, 12/12 pause", lat_src="g3 rederived_latency.csv", india_processed="no"),
    dict(id="G-A", name="All-Gemini: transcribe-live + 3.5-flash-lite + 3.8-flash-lite-tts", kind="cascade", stt="gtl_full", llm=("flashlite35", "C8"), tts="gem_lite",
         ev="computed composite (g3 + g5 TTS)", lat="2,532 / 2,722 (fails)", cut="n/a", lat_src="g3 composite_gemini_tts_latency.csv", india_processed="no"),
    dict(id="G-E", name="transcribe-live gated + gpt-oss@Groq + 3.8-flash-lite-tts", kind="cascade", stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="gem_lite",
         ev="computed composite (g3 + g5 TTS)", lat="1,978 / 2,405 (fails)", cut="n/a", lat_src="g3 composite_gemini_tts_latency.csv", india_processed="no"),
    dict(id="SARV", name="Sarvam STT gated + gpt-oss@Groq + Bulbul V4 Flash (Growth)", kind="cascade", stt="sarvam_gated", llm=("oss_groq_or", "C6"), tts="bulbul_v4f",
         ev="desk-priced (g4); not measured", lat="not measured", cut="not measured", lat_src="-", india_processed="partly (LLM US)"),
    dict(id="INW", name="Inworld all-in (STT-1 + Gemma 4 26B + TTS-2 Flash, Growth)", kind="cascade", stt="inworld_full", llm=("gemma4_inworld", "C1"), tts="inworld_tts2f",
         ev="desk-priced (g4); Hindi and India latency not measured", lat="vendor-claim 462 ms after turn close (+~954 ms VAD)", cut="not measured", lat_src="g4 prices.csv (vendor-claim, inworld.ai/speech-to-speech)", india_processed="no (Enterprise only)"),
    dict(id="SELF", name="Self-host IndicConformer (L4) + gpt-oss@Groq + Veena (H100), E2E Networks", kind="cascade", stt="selfhost", llm=("oss_groq_or", "C6"), tts="selfhost_veena",
         ev="desk; throughput vendor-claim; needs ~0.7-0.9M min/month", lat="not measured (Veena vendor-claim <80 ms TTS)", cut="not measured", lat_src="g4", india_processed="partly (LLM US)"),
    dict(id="L31", name="Gemini 3.1 flash live (Meera's model; shuts 2026-11-17)", kind="live", model="3.1", comp=None,
         ev="measured paid meter (g5) + calibrated model", lat="1,950 / 5,299", cut="11% main, 26/26 pause", lat_src="g5 latency_summary.csv", india_processed="no"),
    dict(id="L38", name="Gemini 3.8 Live, no compression", kind="live", model="3.8", comp=None,
         ev="measured paid meter (g5) + calibrated model", lat="1,006 / 1,524", cut="42% talk-over, 8/8 pause", lat_src="g5 latency_summary.csv", india_processed="no (us/eu only)"),
    dict(id="L38c", name="Gemini 3.8 Live, compression 6000/3000", kind="live", model="3.8", comp=(6000, 3000),
         ev="measured paid meter (g5) + calibrated model", lat="as L38", cut="as L38", lat_src="g5", india_processed="no (us/eu only)"),
    dict(id="RTM", name="OpenAI gpt-realtime-2.1-mini (prefix caching)", kind="table",
         table={1: 1.811, 3: 1.911, 5: 2.019, 10: 2.291}, lo3=1.50, hi3=6.93,
         ev="desk computation (g4); not measured", lat="not measured from India", cut="not measured", lat_src="-", india_processed="no (Global only)"),
]
SID = {s["id"]: s for s in STACKS}

# g5 measured paid meter (INR/min at FX 95), cost_per_minute_summary.csv means
G5 = {
    ("3.1", "off"): {1: 2.47, 3: 4.71, 5: 6.85, 10: 10.74},
    ("3.1", "on6k"): {1: 2.55, 3: 4.19, 5: 5.34, 10: 6.38},
    ("3.8", "off"): {1: 3.31, 3: 5.72, 5: 8.05, 10: 12.70},
    ("3.8", "on6k"): {1: 3.34, 3: 5.72, 5: 7.94, 10: 9.05},
}


def stack_cost(s, W, D, regime=2026, s_extra=0.0):
    """Return dict of component INR/min arrays (stt, llm, tts, ai)."""
    if s["kind"] == "cascade":
        st = stt_cost(s["stt"], W, D)
        ll = llm_cost(s["llm"][0], s["llm"][1], W, D, s_extra=s_extra)
        tt = tts_cost(s["tts"], W, D, regime=regime)
        return dict(stt=st, llm=ll, tts=tt, ai=st + ll + tt)
    if s["kind"] == "live":
        ai = live_cost(s["model"], W, D, comp=s["comp"], s_extra=s_extra)
        z = 0 * ai
        return dict(stt=z, llm=ai, tts=z, ai=ai)
    if s["kind"] == "table":
        L = W["L"]
        Ls = np.asarray(L, dtype=float)
        xs = sorted(s["table"])
        base = np.interp(Ls, xs, [s["table"][x] for x in xs])
        ai = base * W["fx"] / FX0 * D.get("rtm_mult", 1.0)
        z = 0 * ai
        return dict(stt=z, llm=ai, tts=z, ai=ai)
    raise KeyError(s["kind"])


def telephony(W, D, L_cont=None):
    rate = D.get("tel", 0.43)
    if L_cont is None:  # deterministic: expected 30-s pulse overhead of +0.25 min per call
        return rate * (W["L"] + 0.25) / W["L"]
    billed = np.ceil(L_cont * 2.0) / 2.0
    return rate * billed / L_cont


def budget(price, margin, tel, infra, gst_inclusive=False):
    net = price / (1 + 0.18) if gst_inclusive else price
    return net * (1 - margin) - tel - infra


DET_W = dict(fx=95.0, e=5.0, agent_s=24.0, caller_s=24.0)
DET_D = {}


def det_workload(L):
    W = dict(DET_W)
    W["L"] = float(L)
    return W


# --------------------------------------------------------------------------------------------
# 5. Monte Carlo draws (common random numbers across stacks)
# --------------------------------------------------------------------------------------------
def tri(rng, lo, mode, hi, n):
    return rng.triangular(lo, mode, hi, n)


def mc_draws(n=N_MC, seed=SEED):
    rng = np.random.default_rng(seed)
    W = dict(fx=rng.uniform(90, 100, n), e=tri(rng, 3, 5, 7, n), agent_s=tri(rng, 15, 24, 40, n),
             caller_s=tri(rng, 12, 22, 32, n))
    tot = W["agent_s"] + W["caller_s"]
    scale = np.where(tot > 56, 56 / tot, 1.0)
    W["agent_s"] = W["agent_s"] * scale
    W["caller_s"] = W["caller_s"] * scale
    D = dict(gr=rng.uniform(1.1, 1.4, n),
             gtl_txt_tok_min=rng.uniform(0, 1, n),  # mapped below
             or_ledger=rng.uniform(1.0, 1.45, n), az_ledger=rng.uniform(1.0, 1.1, n), gem_ledger=rng.uniform(1.0, 1.2, n),
             groq_cache=rng.uniform(0.75, 0.9, n), flashlite_cache=rng.uniform(0.0, 0.9, n),
             cps_neural=rng.uniform(9.3, 10.3, n), cps_hd=rng.uniform(15.3, 17.5, n), cps_vendor=rng.uniform(11.0, 17.5, n),
             util=rng.uniform(0.3, 0.7, n),
             r_31=None, und_31=rng.uniform(0.09, 0.15, n), und_38=rng.uniform(0.05, 0.10, n),
             trig_mult=rng.uniform(1.25, 1.65, n), targ_mult=rng.uniform(1.3, 1.7, n),
             listen_s_38=rng.uniform(0, 60, n),
             rtm_mult=rng.triangular(1.50 / 1.911, 1.0, 1.6, n),  # g4: 1.50 output-cached .. 1.91 cached; >1 = partial cache misses (no-cache 6.93 excluded)
             tel=rng.uniform(0.38, 0.48, n), infra=tri(rng, 0.01, 0.03, 0.06, n))
    D["gtl_txt_tok_min"] = W["e"] * 14.6 + D["gtl_txt_tok_min"] * np.maximum(175 - W["e"] * 14.6, 0)
    D["cps_neural_c6"] = D["cps_neural"]
    D["cps_neural_c6g"] = D["cps_neural"] * 9.66 / 10.03
    D["r_3.1"] = rng.uniform(LIVE["3.1"]["r_lo"], LIVE["3.1"]["r_hi"], n)
    D["r_3.8"] = rng.uniform(LIVE["3.8"]["r_lo"], LIVE["3.8"]["r_hi"], n)
    D["und_3.1"] = D.pop("und_31")
    D["und_3.8"] = D.pop("und_38")
    D["listen_s_3.8"] = D.pop("listen_s_38")
    D.pop("r_31")
    # call-length mixes for the blended per-minute figure (assumptions; minute-weighted)
    Lmix = dict(short=np.clip(rng.lognormal(math.log(2.5), 0.75, n), 0.25, 20.0),
                companion=np.clip(rng.lognormal(math.log(8.0), 0.6, n), 1.0, 40.0))
    return W, D, Lmix



# --------------------------------------------------------------------------------------------
# 7. Latency evidence (copied from lane result files; first agent audio after caller end of speech)
# --------------------------------------------------------------------------------------------
LATENCY = [
    # stack, vantage, p50, ci, p90, n turns (calls), cut-in / talk-over, source
    ("C1 Azure STT + gpt-4.1-mini + Azure neural", "Central India VM, no phone leg", 1026, "1,017-1,035", 1143, "58 (6)", "16/60 main (27%); 12/12 pause", "g3 results/rederived_latency.csv"),
    ("C1g C1 + VAD-gated STT", "Central India VM", 989, "967-994", 1072, "28 (3)", "9/30; 6/6 pause", "g3 rederived_latency.csv"),
    ("C2 Azure STT + gpt-4.1-mini + DragonHD", "Central India VM", 1133, "1,118-1,140", 1231, "58 (6)", "9/60 (15%); 12/12", "g3 rederived_latency.csv"),
    ("C3 Azure STT + gpt-oss-120b@Groq + DragonHD", "Central India VM", 1044, "1,029-1,077", 1230, "57 (6)", "16/60 (27%); 12/12", "g3 rederived_latency.csv"),
    ("C6 transcribe-live + gpt-oss@Groq + Azure neural", "Central India VM", 1031, "1,010-1,052", 1404, "60 (6)", "19/60 (32%); 12/12", "g3 rederived_latency.csv"),
    ("C6g C6 + VAD-gated STT", "Central India VM", 1038, "990-1,163", 1453, "30 (3)", "7/30 (23%); 6/6", "g3 rederived_latency.csv"),
    ("C7 Azure STT + gemini-3.5-flash-lite (free) + neural", "Central India VM", 1568, "1,514-1,602", 1790, "56 (6)", "2/60; 12/12", "g3 rederived_latency.csv"),
    ("C8 transcribe-live + flash-lite (free) + neural", "Central India VM", 1688, "1,654-1,718", 1789, "59 (6)", "2/60; 12/12", "g3 rederived_latency.csv"),
    ("G-D Azure STT + gpt-oss + 3.8-flash-lite-tts (computed)", "Central India VM components", 1842, "1,782-1,901", 2180, "57 x 40 TTS", "n/a", "g3 composite_gemini_tts_latency.csv"),
    ("G-A all-Gemini lite (computed)", "Central India VM components", 2532, "2,498-2,566", 2722, "59 x 40", "n/a", "g3 composite_gemini_tts_latency.csv"),
    ("Round-2 config A (Azure STT 500 ms + gpt-4.1-mini + neural, say-first)", "Central India VM", 1004, "989-1,017", 1105, "48 clean", "18-50% by config; 12/12", "2026-10-17 SYNTHESIS-v2 section 5 [LAT-02]"),
    ("Gemini 3.8 Live, paid key, Meera VAD", "Central India VM", 1006, "950-1,253", 1524, "30 (6)", "22/53 talk-over (42%); 8/8 pause", "g5 results/latency_summary.csv"),
    ("Gemini 3.8 Live, free key, Meera VAD", "Central India VM", 1089, "958-1,291", 1584, "31 (6)", "23/54", "g5 latency_summary.csv"),
    ("Gemini 3.8 Live + thinkingBudget:0 (free key)", "Central India VM", 819, "784-847", 1514, "26 (4)", "52% of spoken turns", "g2 results/latency_summary.csv"),
    ("Gemini 3.8 Live, default thinking (free key)", "Central India VM", 1250, "1,122-1,428", 1656, "52 (6)", "34%", "g2 results/latency_summary.csv"),
    ("Gemini 3.1 flash live, paid key (Meera's model)", "Central India VM", 1950, "1,705-2,125", 5299, "33 (6)", "4/37; 6/6 pause", "g5 latency_summary.csv"),
    ("Gemini 3.1 flash live, Meera config (free key)", "Central India VM", 1970, "1,949-2,135", 3214, "37 (5)", "server VAD end alone 1.36 s", "g2 results/latency_summary.csv"),
    ("Gemini 2.5 native audio (free key)", "Central India VM", 2977, "-", 7604, "23 (4)", "48%", "g2 results/latency_summary.csv"),
    ("Gemini 3.8 Live, paid key", "sandbox US-East via proxy", 1382, "1,164-1,572", 1815, "43 (6)", "11/54", "g5 latency_summary.csv"),
    ("TTS gemini-3.8-flash-lite-tts stream (paid), first byte", "Central India VM", 857, "-", 997, "40 requests", "+0.14-0.36 s leading silence", "g5 tts_summary.csv"),
    ("TTS Azure neural Swara, first byte", "Central India VM", 113, "-", 162, "24", "-", "g3 results/tts_india_az.csv"),
    ("LLM gpt-oss-120b@Groq via OpenRouter, TTFT", "Central India VM", 253, "-", 490, "30", "-", "g3 results/llm_india_summary.csv"),
    ("LLM gpt-4.1-mini South India, TTFT", "Central India VM", 526, "-", 636, "30", "-", "g3 results/llm_india_summary.csv"),
    ("LLM gemini-3.5-flash-lite free tier, TTFT", "Central India VM", 783, "-", 980, "30", "-", "g3 results/llm_india_summary.csv"),
]

def pct(x, q):
    return float(np.percentile(x, q))


# --------------------------------------------------------------------------------------------
# 6. Runs
# --------------------------------------------------------------------------------------------
def write_csv(name, rows):
    path = os.path.join(RES, name)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return path


def r3(x):
    return round(float(x), 3)


def run_calibration():
    """Model vs g5 paid meter, per call, using each call's own measured turn rate and speech seconds."""
    sess = list(csv.DictReader(open(os.path.join(HERE, "..", "lanes", "g5-gemini-paid", "results", "sessions.csv"))))
    tpm_by_call_s = {round(float(r["call_s"]), 2): float(r["turns_per_min"]) for r in
                     csv.DictReader(open(os.path.join(HERE, "..", "lanes", "g5-gemini-paid", "results", "cost_per_minute.csv")))}
    rows = []
    for s in sess:
        if s["phase"] != "cost":
            continue
        model = "3.1" if s["model"].startswith("3.1") else "3.8"
        comp_s = s["compression"]
        comp = None if comp_s == "off" else ((6000, 3000) if "6000" in comp_s else (2500, 1500))
        L = float(s["call_s"]) / 60
        tpm = tpm_by_call_s[round(float(s["call_s"]), 2)]
        W = dict(fx=95.0, L=L, e=5.0, agent_s=float(s["agent_audio_s"]) / L, caller_s=float(s["caller_speech_s"]) / L)
        m = live_cost(model, W, {}, comp=comp, n_inv=tpm)
        rows.append(dict(tag=s["tag"], model=model, compression=comp_s, call_min=r3(L), invocations_per_min=tpm,
                         agent_s_per_min=r3(W["agent_s"]), caller_s_per_min=r3(W["caller_s"]),
                         measured_inr_min=r3(float(s["inr_per_min"])), model_inr_min=r3(m),
                         model_vs_measured=r3(m / float(s["inr_per_min"]) - 1)))
    return rows


def run_deterministic():
    rows = []
    for s in STACKS:
        for L in LENGTHS:
            W = det_workload(L)
            for regime in ((2026, 2027) if s["kind"] == "cascade" and s["tts"].startswith("gem") else (2026,)):
                c = stack_cost(s, W, DET_D, regime=regime)
                tel = telephony(W, DET_D)
                cogs = c["ai"] + tel + 0.03
                rows.append(dict(stack=s["id"], name=s["name"], evidence=s["ev"], price_regime=regime, call_min=L,
                                 stt_inr_min=r3(c["stt"]), llm_or_s2s_inr_min=r3(c["llm"]), tts_inr_min=r3(c["tts"]),
                                 ai_inr_min=r3(c["ai"]), ai_inr_call=r3(c["ai"] * L), telephony_inr_min=r3(tel), infra_inr_min=0.03,
                                 cogs_inr_min=r3(cogs), cogs_inr_call=r3(cogs * L),
                                 price_ex_gst_at_40=r3(cogs / 0.6), price_ex_gst_at_50=r3(cogs / 0.5), price_ex_gst_at_60=r3(cogs / 0.4),
                                 margin_at_inr2_ex_gst=r3(1 - cogs / 2.0), margin_at_inr2_gst_incl=r3(1 - cogs / (2.0 / 1.18)),
                                 latency_india_p50_p90_ms=s["lat"], cutins=s["cut"]))
    # g5 measured rows for Live (primary source)
    for (model, comp), tab in G5.items():
        for L in LENGTHS:
            W = det_workload(L)
            tel = telephony(W, DET_D)
            cogs = tab[L] + tel + 0.03
            rows.append(dict(stack=f"L{model.replace('.', '')}-g5-{comp}", name=f"Gemini {model} Live, compression {comp} (g5 paid meter)",
                             evidence="measured paid meter, n=1-2 calls per cell (g5 cost_per_minute_summary.csv)", price_regime="2026 (no change announced)",
                             call_min=L, stt_inr_min=0, llm_or_s2s_inr_min=tab[L], tts_inr_min=0, ai_inr_min=tab[L], ai_inr_call=r3(tab[L] * L),
                             telephony_inr_min=r3(tel), infra_inr_min=0.03, cogs_inr_min=r3(cogs), cogs_inr_call=r3(cogs * L),
                             price_ex_gst_at_40=r3(cogs / 0.6), price_ex_gst_at_50=r3(cogs / 0.5), price_ex_gst_at_60=r3(cogs / 0.4),
                             margin_at_inr2_ex_gst=r3(1 - cogs / 2.0), margin_at_inr2_gst_incl=r3(1 - cogs / (2.0 / 1.18)),
                             latency_india_p50_p90_ms=SID["L31" if model == "3.1" else "L38"]["lat"],
                             cutins=SID["L31" if model == "3.1" else "L38"]["cut"]))
    return rows


def run_mc():
    W0, D, Lmix = mc_draws()
    rows = []
    store = {}
    for s in STACKS:
        regimes = (2026, 2027) if s["kind"] == "cascade" and s["tts"].startswith("gem") else (2026,)
        for regime in regimes:
            cases = [(str(L), np.full(N_MC, float(L))) for L in LENGTHS] + [("mix-short", Lmix["short"]), ("mix-companion", Lmix["companion"])]
            for lab, Larr in cases:
                Wl = dict(W0)
                Wl["L"] = Larr
                c = stack_cost(s, Wl, D, regime=regime)
                ai = c["ai"]
                tel = telephony(Wl, D, L_cont=Larr if lab.startswith("mix") else None) if lab.startswith("mix") else D["tel"] * (Larr + 0.25) / Larr
                cogs = ai + tel + D["infra"]
                if lab.startswith("mix"):
                    # minute-weighted: total cost / total minutes
                    ai_pm = float(np.sum(ai * Larr) / np.sum(Larr))
                    cogs_pm = float(np.sum(cogs * Larr) / np.sum(Larr))
                    rows.append(dict(stack=s["id"], price_regime=regime, call_min=lab, ai_p10="", ai_p50=r3(ai_pm), ai_p90="",
                                     ai_mean=r3(ai_pm), cogs_p50=r3(cogs_pm), ai_call_p50=r3(np.median(ai * Larr)),
                                     p_ai_within_budget_50pct="", p_margin_ge_40_at_inr2="", note="minute-weighted mean over the call-length mix"))
                    continue
                store[(s["id"], regime, lab)] = (ai, cogs)
                m2 = 1 - cogs / 2.0
                bud = budget(2.0, 0.5, D["tel"] * (Larr + 0.25) / Larr, D["infra"])
                rows.append(dict(stack=s["id"], price_regime=regime, call_min=lab, ai_p10=r3(pct(ai, 10)), ai_p50=r3(pct(ai, 50)),
                                 ai_p90=r3(pct(ai, 90)), ai_mean=r3(np.mean(ai)), cogs_p50=r3(pct(cogs, 50)),
                                 ai_call_p50=r3(pct(ai * Larr, 50)),
                                 p_ai_within_budget_50pct=r3(np.mean(ai <= bud)), p_margin_ge_40_at_inr2=r3(np.mean(m2 >= 0.4)), note=""))
    return rows, store, (W0, D, Lmix)


def run_budget():
    rows = []
    for gst_incl in (False, True):
        for m in (0.4, 0.5, 0.6):
            for tel in (0.38, 0.43, 0.48, 0.60, 0.80):
                for infra in (0.0, 0.03):
                    rows.append(dict(price_inr_min=2.0, gst_treatment="GST-inclusive (18% inside)" if gst_incl else "ex-GST (GST added on top)",
                                     net_revenue=r3(2.0 / 1.18 if gst_incl else 2.0), gross_margin=m, telephony_inr_min=tel,
                                     telephony_note="1600-series sensitivity (no published price)" if tel > 0.48 else "brief range 0.38-0.48",
                                     infra_inr_min=infra, allowed_ai_inr_min=r3(budget(2.0, m, tel, infra, gst_incl))))
    return rows


def azure_commit_cost(hours, tiers, payg):
    best = hours * payg
    for fee, incl, over in tiers:
        best = min(best, fee + max(0.0, hours - incl) * over)
    return best


def run_volume():
    """AI INR/min at monthly volume V for stacks whose unit cost depends on volume (3-min reference call)."""
    W = det_workload(3)
    vols = [25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6]
    rows = []
    llm_oss = float(llm_cost("oss_groq_or", "C6g", W, {}))
    c6g = float(stack_cost(SID["C6g"], W, {})["ai"])
    inw_od = float(stt_cost("inworld_full", W, {}) * 1.5 + llm_cost("gemma4_inworld", "C1", W, {}) + W["agent_s"] * 14.67 * 15e-6 * FX)
    inw_gr = float(stack_cost(SID["INW"], W, {})["ai"])
    for V in vols:
        # Azure-optimised: Azure STT gated with commitment tiers + gpt-oss + Azure neural with commitment tiers
        hours = V * W["caller_s"] * 1.186 / 3600
        stt_usd = azure_commit_cost(hours, [(1600, 2000, 0.80), (6500, 10000, 0.65), (25000, 50000, 0.50), (40000, 100000, 0.40)], 1.00)
        mchars = V * W["agent_s"] * 10.03 / 1e6
        tts_usd = azure_commit_cost(mchars, [(3900, 400, 9.75), (15000, 2000, 7.50), (24000, 4000, 6.00)], 15.0)
        az_opt = (stt_usd + tts_usd) * FX / V + llm_oss
        c6g_commit = float(stt_cost("gtl_gated", W, {})) + llm_oss + tts_usd * FX / V
        inw = min(max(inw_gr * V, 1500 * FX), inw_od * V) / V
        sh = llm_cost("oss_groq_or", "C6", W, {}) + max(0.0467, 71540 / V) + max(0.139, 553413 / V)
        rows.append(dict(minutes_per_month=int(V), C6g_payg=r3(c6g), C6g_with_azure_tts_commit=r3(c6g_commit),
                         azure_gated_stt_commit_oss_neural_commit=r3(az_opt), inworld_allin_growth_credits=r3(inw),
                         selfhost_e2e_fleet_floor=r3(sh)))
    return rows


TIER_DEFS = {
    # s_extra: persona + memory tokens above the lanes' harness prompt (~1.8k cascade, ~1k Live): assumption ranges
    "base": dict(stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="az_neural_c6g", s_mode=1000, s_rng=(0, 1000, 3000), learn=False,
                 price=2.99, voice_fee_inr_month=0,
                 desc="C6g: gated gemini-3.5-transcribe-live + gpt-oss-120b on Groq + Azure neural stock voice; persona + light memory"),
    "base-HD": dict(stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="az_hd", s_mode=1000, s_rng=(0, 1000, 3000), learn=False,
                    price=3.49, voice_fee_inr_month=0,
                    desc="base with Azure DragonHD voice (the fallback if the panel rejects the neural voice)"),
    "plus": dict(stt="gtl_gated", llm=("oss_groq_or", "C6g"), tts="az_neural_c6g", s_mode=4000, s_rng=(2000, 4000, 8000), learn=True,
                 price=3.99, voice_fee_inr_month=0,
                 desc="base + learned memory in context (~4k tokens) + post-call learning pass (gpt-4.1-mini South India)"),
    "premium": dict(stt="az_gated", llm=("gpt41mini_si", "C1"), tts="az_cnv", s_mode=10000, s_rng=(5000, 10000, 16000), learn=True,
                    price=6.49, voice_fee_inr_month=350000,
                    desc="India-processed: Azure STT gated (Central India) + gpt-4.1-mini (South India) + Azure Custom Neural Voice; ~10k-token personal memory"),
}


def learn_cost(L, s_extra, fx):
    """Post-call learning pass per call: transcript (~214 tok/min, g2 calibration) + memory + 1k instructions in,
    400 out, gpt-4.1-mini regional prices; returned per connected minute."""
    usd_call = ((214 * L + s_extra + 1000) * 0.44 + 400 * 1.76) / 1e6
    return usd_call * fx / L


def tier_ai(d, W, D, s_extra):
    st = stt_cost(d["stt"], W, D)
    ll = llm_cost(d["llm"][0], d["llm"][1], W, D, s_extra=s_extra)
    tt = tts_cost(d["tts"], W, D)
    le = learn_cost(W["L"], s_extra, W["fx"]) if d["learn"] else 0.0 * st
    return dict(stt=st, llm=ll, tts=tt, learn=le, ai=st + ll + tt + le)


def tier_mc(store_draws, n=N_MC):
    """Tier COGS distributions over the short-call mix (minute-weighted), common random numbers."""
    W0, D, Lmix = store_draws
    rng = np.random.default_rng(SEED + 7)
    Wl = dict(W0)
    Wl["L"] = Lmix["short"]
    tel = telephony(Wl, D, L_cont=Lmix["short"])
    out = {}
    for t, d in TIER_DEFS.items():
        lo, mo, hi = d["s_rng"]
        c = tier_ai(d, Wl, D, tri(rng, lo, mo, hi, n))
        out[t] = dict(desc=d["desc"], ai=c["ai"], tel=tel, infra=D["infra"], cogs=c["ai"] + tel + D["infra"], L=Wl["L"])
    return out


def tier_det():
    rows = []
    for t, d in TIER_DEFS.items():
        for L in LENGTHS:
            W = det_workload(L)
            c = tier_ai(d, W, {}, d["s_mode"])
            tel = float(telephony(W, {}))
            cogs = float(c["ai"]) + tel + 0.03
            rows.append(dict(tier=t, call_min=L, price_inr_min_ex_gst=d["price"], price_inr_call_ex_gst=r3(d["price"] * L),
                             price_inr_min_incl_gst=r3(d["price"] * 1.18),
                             stt=r3(c["stt"]), llm=r3(c["llm"]), tts=r3(c["tts"]), learn=r3(c["learn"]), ai_inr_min=r3(c["ai"]),
                             telephony=r3(tel), infra=0.03, cogs_inr_min=r3(cogs), cogs_inr_call=r3(cogs * L),
                             gross_margin=r3(1 - cogs / d["price"]),
                             margin_if_telephony_passed_through=r3(1 - (cogs - tel) / (d["price"])),
                             margin_if_1600_telephony_0_60=r3(1 - (cogs - tel + 0.60 * (L + 0.25) / L) / d["price"]),
                             margin_if_1600_telephony_0_80=r3(1 - (cogs - tel + 0.80 * (L + 0.25) / L) / d["price"]),
                             voice_fee_inr_month=d["voice_fee_inr_month"]))
    return rows


def minute_weighted(x, L):
    return float(np.sum(x * L) / np.sum(L))


def main():
    cal = run_calibration()
    write_csv("live_calibration_vs_g5.csv", cal)
    det = run_deterministic()
    write_csv("deterministic_by_stack_length.csv", det)
    mc_rows, store, draws = run_mc()
    write_csv("mc_by_stack_length.csv", mc_rows)
    write_csv("ai_budget_inr2.csv", run_budget())
    write_csv("volume_curve.csv", run_volume())
    write_csv("inputs.csv", INPUTS)
    write_csv("latency_by_stack.csv", [dict(stack=a, vantage=b, p50_ms=c, p50_ci95=d, p90_ms=e, n=f, cutins=g, source=h)
                                       for a, b, c, d, e, f, g, h in LATENCY])

    # sensitivity: AI cost of C6g and L38 at 3 min when one input moves across its range (others at reference)
    sens = []
    W = det_workload(3)
    for key, lo, hi in (("e", 3, 7), ("agent_s", 15, 40), ("caller_s", 12, 32), ("fx", 90, 100)):
        for sid in ("C6g", "C6g-HD", "C1", "L38"):
            vals = []
            for v in (lo, hi):
                Wx = dict(W)
                Wx[key] = float(v)
                vals.append(float(stack_cost(SID[sid], Wx, {})["ai"]))
            sens.append(dict(stack=sid, input=key, low=lo, high=hi, ai_at_low=r3(vals[0]), ai_at_high=r3(vals[1]),
                             ai_at_reference=r3(stack_cost(SID[sid], W, {})["ai"])))
    for key, lo, hi in (("or_ledger", 1.0, 1.45), ("gr", 1.1, 1.4), ("groq_cache", 0.75, 0.9)):
        for sid in ("C6g",):
            vals = [float(stack_cost(SID[sid], W, {key: v})["ai"]) for v in (lo, hi)]
            sens.append(dict(stack=sid, input=key, low=lo, high=hi, ai_at_low=r3(vals[0]), ai_at_high=r3(vals[1]),
                             ai_at_reference=r3(stack_cost(SID[sid], W, {})["ai"])))
    for sx in (0, 2000, 4000, 8000, 13000):
        for sid in ("C6g", "L38", "L31"):
            sens.append(dict(stack=sid, input="s_extra_tokens (persona+memory above the lanes' harness prompt)", low=sx, high="",
                             ai_at_low=r3(stack_cost(SID[sid], W, {}, s_extra=sx)["ai"]), ai_at_high="",
                             ai_at_reference=r3(stack_cost(SID[sid], W, {})["ai"])))
    write_csv("sensitivity_3min.csv", sens)

    # tiers
    tiers = tier_mc(draws)
    trow = []
    for t, d in tiers.items():
        L = d["L"]
        price = TIER_DEFS[t]["price"]
        cogs_mw = minute_weighted(d["cogs"], L)
        ai_mw = minute_weighted(d["ai"], L)
        tel_mw = minute_weighted(d["tel"], L)
        margin_draw = 1 - d["cogs"] / price
        trow.append(dict(tier=t, stack=d["desc"], proposed_price_inr_min_ex_gst=price, price_incl_gst=r3(price * 1.18),
                         ai_inr_min_minute_weighted=r3(ai_mw), ai_p10=r3(pct(d["ai"], 10)), ai_p90=r3(pct(d["ai"], 90)),
                         telephony_minute_weighted=r3(tel_mw),
                         cogs_inr_min_minute_weighted=r3(cogs_mw), cogs_p10=r3(pct(d["cogs"], 10)), cogs_p90=r3(pct(d["cogs"], 90)),
                         gross_margin_minute_weighted=r3(1 - cogs_mw / price), p_call_margin_ge_40=r3(np.mean(margin_draw >= 0.4)),
                         price_for_40pct=r3(cogs_mw / 0.6), price_for_50pct=r3(cogs_mw / 0.5), price_for_60pct=r3(cogs_mw / 0.4),
                         price_for_40pct_on_p80_cogs=r3(pct(d["cogs"], 80) / 0.6),
                         margin_at_inr2_all_in=r3(1 - cogs_mw / 2.0),
                         margin_at_inr2_plus_telephony_passthrough=r3(1 - (cogs_mw - tel_mw) / 2.0),
                         voice_fee_inr_month=TIER_DEFS[t]["voice_fee_inr_month"]))
    write_csv("tiers.csv", trow)
    write_csv("tiers_by_length_deterministic.csv", tier_det())

    # headline summary JSON
    summ = dict(seed=SEED, n=N_MC, generated="2026-10-19",
                budget_ex_gst={m: r3(budget(2.0, m, 0.43, 0.03)) for m in (0.4, 0.5, 0.6)},
                budget_gst_incl={m: r3(budget(2.0, m, 0.43, 0.03, True)) for m in (0.4, 0.5, 0.6)},
                det_3min={r["stack"] + ("@2027" if r["price_regime"] == 2027 else ""): r["ai_inr_min"] for r in det if r["call_min"] == 3},
                tiers=trow, calibration_median_abs_err=r3(np.median([abs(r["model_vs_measured"]) for r in cal])))
    json.dump(summ, open(os.path.join(RES, "summary.json"), "w"), indent=1, default=str)
    print(json.dumps({k: summ[k] for k in ("budget_ex_gst", "budget_gst_incl", "calibration_median_abs_err")}, indent=1))
    print("det 3-min AI INR/min:", json.dumps(summ["det_3min"], indent=0))
    for r in trow:
        print(r)
    make_charts(mc_rows, det)


def make_charts(mc_rows, det):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    INK, INK2, MUTED, GRID, SURF = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1", "#fcfcfb"
    S1, S2, S3 = "#2a78d6", "#eb6834", "#1baf7a"
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                         "xtick.color": INK2, "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF})

    # Chart 1: AI cost per connected minute at a 3-minute call, MC p10-p90, against the INR 2 budget band
    order = ["C1", "C2", "C3", "C1g", "C6", "C6g", "C6g-HD", "C8", "G-A", "G-E", "SARV", "INW", "SELF", "RTM", "L31", "L38", "L38c"]
    fam = {"C1": S1, "C2": S1, "C3": S1, "C1g": S1, "C6": S1, "C6g": S1, "C6g-HD": S1, "C8": S1,
           "G-A": S1, "G-E": S1, "SARV": S3, "INW": S3, "SELF": S3, "RTM": S3, "L31": S2, "L38": S2, "L38c": S2}
    label = {"C1": "C1 Azure STT + 4.1-mini + neural", "C2": "C2 Azure STT + 4.1-mini + DragonHD", "C3": "C3 Azure STT + gpt-oss + DragonHD",
             "C1g": "C1g Azure STT gated + 4.1-mini + neural", "C6": "C6 transcribe-live + gpt-oss + neural", "C6g": "C6g transcribe-live gated + gpt-oss + neural",
             "C6g-HD": "C6g-HD C6g + DragonHD (computed)", "C8": "C8 transcribe-live + flash-lite + neural",
             "G-A": "G-A all-Gemini + lite TTS (2027 price)", "G-E": "G-E gated + gpt-oss + lite TTS (2027)",
             "SARV": "Sarvam STT + gpt-oss + Bulbul V4 (desk)", "INW": "Inworld all-in, Growth (desk)", "SELF": "Self-host, Indian GPU cloud (desk)",
             "RTM": "gpt-realtime-2.1-mini (desk)", "L31": "Gemini 3.1 flash live (retires 11-17)", "L38": "Gemini 3.8 Live",
             "L38c": "Gemini 3.8 Live, compression 6k"}
    get = {}
    for r in mc_rows:
        if r["call_min"] == "3":
            if r["stack"] in ("G-A", "G-E") and r["price_regime"] != 2027:
                continue
            get[r["stack"]] = (r["ai_p10"], r["ai_p50"], r["ai_p90"])
    fig, ax = plt.subplots(figsize=(8.6, 6.2), dpi=150)
    ys = list(range(len(order)))[::-1]
    ax.axvspan(0.34, 0.74, color="#d9d8d3", alpha=0.55, lw=0, zorder=0)
    ax.axvline(0.54, color=MUTED, lw=1, zorder=1)
    ax.text(0.545, -1.05, "AI budget at INR 2/min ex-GST:\n0.34-0.74 at 40-60% margin, 0.54 at 50%", ha="center", va="top",
            fontsize=7.2, color=INK2)
    for y, sid in zip(ys, order):
        p10, p50, p90 = get[sid]
        ax.plot([p10, p90], [y, y], color=fam[sid], lw=2.2, solid_capstyle="round", zorder=3)
        ax.plot([p50], [y], "o", ms=6.5, color=fam[sid], mec=SURF, mew=1.5, zorder=4)
        ax.text(p90 + 0.12, y, f"{p50:.2f}", va="center", fontsize=7.5, color=INK)
    ax.set_yticks(ys)
    ax.set_ylim(-2.0, len(order) - 0.4)
    ax.set_yticklabels([label[s] for s in order], fontsize=7.8, color=INK)
    ax.set_xscale("log")
    ax.set_xlim(0.2, 20)
    ax.set_xticks([0.25, 0.5, 1, 2, 5, 10, 20])
    ax.set_xticklabels(["0.25", "0.5", "1", "2", "5", "10", "20"])
    ax.grid(axis="x", color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    for sp in ("top", "right", "left"):
        ax.spines[sp].set_visible(False)
    ax.set_xlabel("AI cost, INR per connected minute (log scale; dot = MC p50, line = p10-p90)")
    ax.set_title("AI cost per minute at a 3-minute call, by stack", loc="left", fontsize=11, color=INK)
    from matplotlib.lines import Line2D
    hand = [Line2D([0], [0], color=S1, lw=2.2, marker="o", ms=6, label="cascade, measured or composed from measured parts"),
            Line2D([0], [0], color=S3, lw=2.2, marker="o", ms=6, label="desk-priced, not measured"),
            Line2D([0], [0], color=S2, lw=2.2, marker="o", ms=6, label="Gemini Live, paid meter-calibrated")]
    fig.legend(handles=hand, loc="lower center", bbox_to_anchor=(0.5, 0.025), ncol=3, frameon=False, fontsize=7.3)
    fig.text(0.01, 0.005, "Sources: lanes g3 (cascades), g5 (Live paid meter), g4 (desk prices); model/pricing_model.py, seed 20261019, n=20,000. "
             "List prices, FX 90-100. Live at the lanes' ~1k-token persona.", fontsize=6.5, color=MUTED)
    fig.tight_layout(rect=(0, 0.065, 1, 1))
    fig.savefig(os.path.join(CH, "ai_cost_by_stack_3min.png"))
    plt.close(fig)

    # Chart 2: volume curve
    vol = list(csv.DictReader(open(os.path.join(RES, "volume_curve.csv"))))
    V = [float(r["minutes_per_month"]) for r in vol]
    series = [("C6g_payg", "C6g pay-as-you-go (measured stack)", S1),
              ("azure_gated_stt_commit_oss_neural_commit", "Azure STT + neural with commitment tiers, gpt-oss", S2),
              ("inworld_allin_growth_credits", "Inworld all-in (desk; USD 1,500/month credit floor)", S3),
              ("selfhost_e2e_fleet_floor", "Self-host on E2E (desk; 2-GPU fleet floor)", "#eda100")]
    fig, ax = plt.subplots(figsize=(8.6, 4.8), dpi=150)
    ax.axhspan(0.34, 0.74, color="#d9d8d3", alpha=0.55, lw=0, zorder=0)
    ax.axhline(0.54, color=MUTED, lw=1, zorder=1)
    ax.text(V[0], 0.355, "AI budget at INR 2/min ex-GST: line 50% margin, band 40-60%", fontsize=7.2, color=INK2, va="bottom")
    for key, lab, col in series:
        ys = [float(r[key]) for r in vol]
        ax.plot(V, ys, color=col, lw=2, marker="o", ms=4.5, mec=SURF, mew=1, zorder=3)
        ax.text(V[-1] * 1.12, ys[-1], lab, fontsize=7.2, color=INK, va="center")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_ylim(0.25, 12)
    ax.set_yticks([0.25, 0.5, 1, 2, 5, 10])
    ax.set_yticklabels(["0.25", "0.5", "1", "2", "5", "10"])
    ax.set_xticks([25e3, 1e5, 1e6, 1e7])
    ax.set_xticklabels(["25k", "100k", "1M", "10M"])
    ax.set_xlim(2e4, 1.1e8)
    ax.grid(color=GRID, lw=0.6)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.set_xlabel("connected minutes per month")
    ax.set_ylabel("AI cost, INR per minute (3-min call)")
    ax.set_title("Where volume moves the AI cost per minute", loc="left", fontsize=11, color=INK)
    fig.text(0.01, 0.005, "Commitment tiers from the Azure Retail Prices API (g3 cost_inputs.csv); self-host fleet floors from g4 selfhost.csv; "
             "Inworld from g4 prices.csv. Deterministic reference workload.", fontsize=6.5, color=MUTED)
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    fig.savefig(os.path.join(CH, "ai_cost_vs_volume.png"))
    plt.close(fig)


if __name__ == "__main__":
    main()
