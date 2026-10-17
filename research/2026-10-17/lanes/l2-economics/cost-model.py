# VP lane l2-economics: unit economics of an Indian AI voice agent per CONNECTED minute (INR), 2026-10-17.
#
#   python3 -I cost-model.py            -> writes cost-model.json, cost-model.xlsx, tornado.png next to this file
#
# Every price below is either (P) a published price read on 2026-10-17 (Azure Retail Prices API, vendor price page),
# (M) measured by this lane or by the harvest, or (E) an assumption with a stated range. See report.md for sources.
# Ranges are (low, base, high) and feed a triangular Monte Carlo (n=20,000, seed 7) and a one-at-a-time tornado.
#
# ROUND-2 CORRECTIONS (2026-10-17, package r2-model-corrections, critic A10, l2 verify.md). Round-1 files are kept as
# cost-model.round1.py / .json / .xlsx and tornado.round1.png. Changes, each switchable in FIX for attribution:
#   nvaie   NVIDIA AI Enterprise licence ($4,500 per GPU-year = P["nvaie_per_gpu_hr"], defined but unused in round 1)
#           is added to every self-hosted GPU-hour, because the stream counts are Riva/NIM benchmarks and NVIDIA's NIM
#           page says production use needs NVAIE.
#   tiers   Commitment tiers now STEP with volume: Neural TTS (PAYG $15, 80M/$960, 400M/$3,900, 2000M/$15,000,
#           4000M/$24,000 per month with overage) and S1 STT (PAYG $1/h, 2K/$1,600, 10K/$6,500, 50K/$25,000,
#           100K/$40,000 per month). The cheapest option for the month's usage is chosen, so an under-filled tier is
#           paid in full. Round 1 applied the 400M TTS rate at every volume. Voice Live and HD TTS have no tiers.
#   sol6    Scenarios B, C, D and B-HD speak with gpt-6-sol, not gpt-6.1-sol: the harvest bake-off measured 6.1-sol at
#           3,294 / 9,461 ms (p50 / p95) to first speakable clause vs 1,475 / 2,416 ms for 6-sol (n=30 each).
#   headline  The decision number is the Monte Carlo p50, not the all-modes base case (A's base sits below its MC p10
#           because the triangular ranges are right-skewed). JSON "headline", the xlsx Headline sheet and tornado.png
#           all lead with MC p50 (p10-p90).
#   Not changed: FX was already 95 (range 88-97); LLM provisioned throughput (PTU) is still not modelled; data
#   residency and 1600-series number costs are still unpriced; AI-human outcome parity is still assumed.
import json, math, os, random, copy

FIX = {"nvaie": True, "tiers": True, "sol6": True}   # round-2 corrections; all True = corrected model

HERE = os.path.dirname(os.path.abspath(__file__))
M = 1e6

# ---------------------------------------------------------------------------------------------------------------
# Published unit prices (P). USD unless the name ends in _inr. Read 2026-10-17 from prices.azure.com unless noted.
# ---------------------------------------------------------------------------------------------------------------
P = {
    # Azure Speech / Voice Live (Foundry Tools, centralindia)
    "s1_stt_per_hr": 1.00,                 # S1 Speech To Text, real-time
    "s1_stt_commit_100k_per_hr": 0.40,     # Commitment Tier STT Azure 100K overage rate
    "fast_tx_per_hr": 0.36,                # Fast Transcription (batch); promo 0.10 from 2026-09-01
    "vl_std_speech_in_per_1k": 0.015,      # Voice Live API Std - Standard Speech Audio Input Tokens
    "vl_byo_speech_in_per_1k": 0.0125,     # Voice Live BYO Standard Speech Audio Input Tokens
    "neural_tts_per_1m": 15.0,             # S1 Neural Text To Speech Characters
    "hd_tts_per_1m": 22.0,                 # Neural HD Text to Speech Characters (eff. 2026-03-01)
    "neural_tts_commit_80m_per_1m": 12.0,  # Commitment tier 80M chars/month (overage rate)
    "neural_tts_commit_400m_per_1m": 9.75, # Commitment tier 400M chars/month
    "neural_tts_commit_2000m_per_1m": 7.5,
    "neural_tts_commit_4000m_per_1m": 6.0,
    # Foundry Models, Global Standard, per 1M tokens: (input, cached input, cache write, output)
    "gpt6_sol": (2.00, 0.20, 2.50, 10.0),
    "gpt61_sol": (2.00, 0.10, 2.50, 10.0),
    "gpt6_luna": (0.10, 0.01, 0.125, 0.50),
    "gpt56_terra": (2.00, 0.20, 2.50, 12.0),
    "gpt56_luna": (0.20, 0.02, 0.25, 1.20),
    "gpt54_nano": (0.20, 0.02, 0.20, 1.25),
    "gpt41_mini": (0.40, 0.10, 0.40, 1.60),
    "gpt41_nano": (0.10, 0.025, 0.10, 0.40),
    "deepseek_v4_flash": (0.19, 0.028, 0.19, 0.51),
    "grok41_fast": (0.20, 0.20, 0.20, 0.50),
    "gpt_oss_120b": (0.15, 0.15, 0.15, 0.60),
    "llama33_70b": (0.71, 0.71, 0.71, 0.71),
    # Azure Container Apps consumption, centralindia
    "aca_vcpu_s": 0.000024, "aca_gib_s": 0.000003, "aca_env_hr": 0.14,
    # Storage / logs, centralindia
    "blob_hot_gb_mo": 0.02, "log_ingest_gb": 3.22,
    # GPU VMs centralindia, $/hr: on-demand, 1-yr RI (term/8760), 3-yr RI (term/26280)
    "t4_vm":   (0.579, 2982 / 8760, 5778 / 26280),     # NC4as_T4_v3 (1x T4)
    "a10_vm":  (4.48, 25117 / 8760, 51803 / 26280),    # NV36ads_A10_v5 (1x A10)
    "a100_vm": (5.142, 29446 / 8760, 50149 / 26280),   # NC24ads_A100_v4 (1x A100 80GB)
    "h100_vm": (9.772, 64202 / 8760, 141244 / 26280),  # NC40ads_H100_v5 (1x H100 NVL)
    "nvaie_per_gpu_hr": 4500 / 8760,                   # NVIDIA AI Enterprise list, only if NIM is used
    # Indian telephony (INR)
    "plivo_min_inr": 0.38, "plivo_pulse_s": 30, "plivo_number_mo_inr": 200,          # plivo.com/voice/pricing/in
    "vobiz_via_sarvam_min_inr": 0.40, "sarvam_number_mo_inr": 59,                    # sarvam.ai voice-agents pricing
    "tata_stream_unl_conc_mo_inr": 1100, "tata_fup_min_per_user": 5000,              # tatatelebusiness.com Smartflo
    "acs_direct_routing_min": 0.004,                                                  # ACS meter, carrier extra
    "twilio_in_mobile_min": 0.0496,                                                   # twilio.com/voice/pricing/in
}

# Commitment tiers (Azure Retail Prices API, centralindia, data/azure-retail-prices-2026-10-17.csv):
# (included units per month, monthly fee USD, overage USD per unit). The first row is pay-as-you-go.
TTS_NEURAL_TIERS = [(0, 0, 15.0 / M), (80e6, 960, 12.0 / M), (400e6, 3900, 9.75 / M), (2000e6, 15000, 7.5 / M), (4000e6, 24000, 6.0 / M)]
STT_TIERS = [(0, 0, 1.00), (2000, 1600, 0.80), (10000, 6500, 0.65), (50000, 25000, 0.50), (100000, 40000, 0.40)]

def tiered_usd(units, tiers):
    """Cheapest monthly bill for `units` across PAYG and every commitment tier (an under-filled tier is paid in full)."""
    return min(fee + max(0.0, units - incl) * over for incl, fee, over in tiers)

def best_tier(units, tiers):
    """Label of the cheapest option for `units` per month."""
    names = ["PAYG", "80M", "400M", "2000M", "4000M"] if tiers is TTS_NEURAL_TIERS else ["PAYG", "2K h", "10K h", "50K h", "100K h"]
    return names[min(range(len(tiers)), key=lambda k: tiers[k][1] + max(0.0, units - tiers[k][0]) * tiers[k][2])]

# ---------------------------------------------------------------------------------------------------------------
# Scenario inputs: name -> (low, base, high). Same keys in every scenario so the tornado compares like with like.
# ---------------------------------------------------------------------------------------------------------------
COMMON = {
    "fx_inr_per_usd":        (88.0, 95.0, 97.0),   # 3 FX feeds read 2026-10-16/17: 94.93-95.11
    "avg_call_min":          (1.0, 2.0, 3.5),      # connected call length; Callyzer human avg 1.6 min (vendor, n~5 crore)
    "agent_talk_share":      (0.35, 0.50, 0.65),   # share of the connected minute the agent is speaking
    "tts_chars_per_agent_min": (610, 800, 1040),   # MEASURED this lane: 612 (Swara) / 803 (MAI-Voice Flash) / 1038 (DragonHD)
    "tts_waste":             (1.00, 1.10, 1.25),   # synthesised but not played (barge-in, lookahead clause)
    "turns_per_min":         (3.0, 4.0, 6.0),      # agent turns per connected minute (Taxila §5b assumed 4)
    "llm_out_tok_per_turn":  (50, 70, 110),        # say (~25 words x 1.41 o200k tok/word, measured) + JSON/actions
    "llm_hist_tok":          (200, 400, 800),      # mean conversation history re-sent per turn
    "llm_ctx_tok":           (100, 300, 1000),     # per-turn dynamic context (CRM, RAG, state)
    "llm_call_multiplier":   (1.0, 1.2, 1.6),      # prefetch on partials, hedges, retries (harvest: hedges doubled)
    "guard_in_tok_per_turn": (800, 1500, 2500),    # small-model per-turn guard/classifier on 6-luna
    "post_call_tok":         (2000, 4000, 8000),   # summary + disposition + QA per call on 6-luna
    "vl_tok_per_s":          (9.3, 10.0, 12.0),    # Voice Live audio input tokens per second (harvest measured 9/0.97 s)
    "infra_vcpu_per_call":   (0.10, 0.25, 0.50),
    "infra_gib_per_call":    (0.25, 0.50, 1.00),
    "infra_headroom":        (1.2, 1.5, 2.5),      # min replicas + peak buffer
    "rec_mb_per_min":        (0.12, 0.24, 1.92),   # Opus 16 kbps x2 ch .. 8 kHz PCM stereo
    "rec_retention_mo":      (3, 12, 36),
    "log_kb_per_min":        (5, 20, 100),
    "support_inr_per_min":   (0.05, 0.15, 0.40),   # CS, human QA review, on-call, at scale
    "fixed_platform_usd_mo": (300, 800, 2500),     # ACA env, Neon, monitoring, CI, misc SaaS
    "gross_margin":          (0.50, 0.60, 0.70),
    "minutes_per_number_mo": (2000, 4000, 10000),
}

def scen(name, monthly_min, **over):
    s = {k: v for k, v in COMMON.items()}
    s.update(over)
    return {"name": name, "monthly_min": monthly_min, "inputs": s}

def build_scenarios():
  SOL = "gpt6_sol" if FIX["sol6"] else "gpt61_sol"     # round 2: speaking model at the latency bar
  TTS_N = "neural_tiered"                              # round 2: tiers step with volume (= 400M fixed when FIX["tiers"] is off)
  return [
    scen("A. Managed today (quality bar)", 100_000,
         telephony="plivo", asr="voicelive_std", llm="gpt6_sol", tts="hd", selfhost=None,
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 2.0),
         llm_sys_tok=(2000, 3000, 5000), llm_cache_hit=(0.60, 0.85, 0.92), tts_cache_share=(0.0, 0.0, 0.10),
         pulse_s=(30, 30, 60)),
    scen("A0. Plain cascade reference (S1 STT + 5.6 terra + HD)", 100_000,
         telephony="plivo", asr="s1", llm="gpt56_terra", tts="hd", selfhost=None,
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 1.0),
         llm_sys_tok=(2000, 3000, 5000), llm_cache_hit=(0.60, 0.85, 0.92), tts_cache_share=(0.0, 0.0, 0.10),
         pulse_s=(30, 30, 60)),
    scen("B. Managed optimised", 1_000_000,
         telephony="tata_unlimited", asr="voicelive_byo", llm=SOL, tts=TTS_N, selfhost=None,
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 2.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.10, 0.25, 0.35),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0)),
    scen("C. Hybrid (self-hosted ASR on T4, managed LLM+TTS)", 1_000_000,
         telephony="tata_unlimited", asr="selfhost", llm=SOL, tts=TTS_N,
         selfhost={"asr": ("t4_vm", 2, 50)},
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 1.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.10, 0.25, 0.35),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0),
         gpu_util=(0.20, 0.35, 0.55), gpu_derate=(0.3, 0.5, 0.8), gpu_term=2, gpu_ops_inr_mo=(150_000, 250_000, 400_000)),
    scen("D. Self-hosted at scale (ASR+TTS on H100, managed LLM)", 5_000_000,
         telephony="tata_unlimited", asr="selfhost", llm=SOL, tts="selfhost",
         selfhost={"asr": ("h100_vm", 2, 366), "tts": ("h100_vm", 2, 580)},
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 1.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.0, 0.0, 0.0),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0),
         gpu_util=(0.20, 0.35, 0.55), gpu_derate=(0.3, 0.5, 0.8), gpu_term=2, gpu_ops_inr_mo=(300_000, 500_000, 900_000)),
    scen("B-luna. Managed optimised + 6-luna speaking model", 1_000_000,
         telephony="tata_unlimited", asr="voicelive_byo", llm="gpt6_luna", tts=TTS_N, selfhost=None,
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 2.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.10, 0.25, 0.35),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0)),
    scen("B-HD. Managed optimised but DragonHD voice", 1_000_000,
         telephony="tata_unlimited", asr="voicelive_byo", llm=SOL, tts="hd", selfhost=None,
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 2.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.10, 0.25, 0.35),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0)),
    scen("D-lite. Self-hosted at scale + 6-luna speaking model", 5_000_000,
         telephony="tata_unlimited", asr="selfhost", llm="gpt6_luna", tts="selfhost",
         selfhost={"asr": ("h100_vm", 2, 366), "tts": ("h100_vm", 2, 580)},
         asr_stream_share=(1.0, 1.0, 1.0), asr_ref_factor=(1.0, 1.0, 1.0),
         llm_sys_tok=(1500, 2000, 3000), llm_cache_hit=(0.80, 0.90, 0.95), tts_cache_share=(0.0, 0.0, 0.0),
         pulse_s=(1, 1, 1), tata_fup_use=(0.5, 0.8, 1.0),
         gpu_util=(0.20, 0.35, 0.55), gpu_derate=(0.3, 0.5, 0.8), gpu_term=2, gpu_ops_inr_mo=(300_000, 500_000, 900_000)),
  ]

SCENARIOS = build_scenarios()

TTS_PRICE = {"hd": "hd_tts_per_1m", "neural": "neural_tts_per_1m", "neural_commit400m": "neural_tts_commit_400m_per_1m",
             "neural_commit80m": "neural_tts_commit_80m_per_1m",
             "neural_tiered": "neural_tts_commit_400m_per_1m"}   # only used when FIX["tiers"] is off (round-1 behaviour)

def pick(v, which):
    if isinstance(v, tuple):
        return v[{"low": 0, "base": 1, "high": 2}[which]] if which in ("low", "base", "high") else v[1]
    return v

def compute(s, x, monthly_min):
    """s: scenario dict; x: resolved numeric inputs. Returns INR per connected minute by component."""
    fx = x["fx_inr_per_usd"]; c = {}
    calls_per_min = 1.0 / x["avg_call_min"]
    # 1. Telephony
    t = s["inputs"]["telephony"]
    if t == "plivo":
        pulse_min = x["pulse_s"] / 60.0
        overhead = 1 + (pulse_min / 2) / x["avg_call_min"]          # mean rounding loss = half a pulse per call
        c["telephony"] = P["plivo_min_inr"] * overhead + P["plivo_number_mo_inr"] / x["minutes_per_number_mo"]
    elif t == "tata_unlimited":
        per_min = P["tata_stream_unl_conc_mo_inr"] / (P["tata_fup_min_per_user"] * x["tata_fup_use"])
        c["telephony"] = per_min + 20_000 / 36 / max(monthly_min, 1)  # one-time fee over 3 years
    # 2. ASR (the "ear")
    a = s["inputs"]["asr"]
    stream = x["asr_stream_share"] * x["asr_ref_factor"]
    if a == "voicelive_std":
        c["asr"] = 60 * x["vl_tok_per_s"] / 1000 * P["vl_std_speech_in_per_1k"] * stream * fx
    elif a == "voicelive_byo":
        c["asr"] = 60 * x["vl_tok_per_s"] / 1000 * P["vl_byo_speech_in_per_1k"] * stream * fx
    elif a == "s1":
        if FIX["tiers"]:   # round 2: cheapest of PAYG and the 2K/10K/50K/100K-hour commitments for this month's hours
            hours = monthly_min * stream / 60
            c["asr"] = tiered_usd(hours, STT_TIERS) / max(monthly_min, 1) * fx
        else:
            c["asr"] = P["s1_stt_per_hr"] / 60 * stream * fx
    elif a == "selfhost":
        c["asr"] = 0.0  # computed in GPU block
    # 3. LLM (speaking model) + guard + post-call on 6-luna
    pin, pcache, pwrite, pout = P[s["inputs"]["llm"]]
    tin = x["llm_sys_tok"] + x["llm_hist_tok"] + x["llm_ctx_tok"] + 20
    hit = x["llm_cache_hit"]
    per_turn = tin * (hit * pcache + (1 - hit) * max(pin, pwrite)) / M + x["llm_out_tok_per_turn"] * pout / M
    lin, lc, lw, lo = P["gpt6_luna"]
    guard = x["guard_in_tok_per_turn"] * (0.8 * lc + 0.2 * lw) / M + 20 * lo / M
    post = (x["post_call_tok"] * lin + 300 * lo) / M * calls_per_min
    c["llm"] = (x["turns_per_min"] * x["llm_call_multiplier"] * (per_turn + guard) + post) * fx
    # 4. TTS
    chars = x["agent_talk_share"] * x["tts_chars_per_agent_min"] * x["tts_waste"] * (1 - x["tts_cache_share"])
    tt = s["inputs"]["tts"]
    if tt == "selfhost":
        c["tts"] = 0.0
    elif tt == "neural_tiered" and FIX["tiers"]:   # round 2: tier chosen for this month's characters
        c["tts"] = tiered_usd(chars * monthly_min, TTS_NEURAL_TIERS) / max(monthly_min, 1) * fx
    else:
        c["tts"] = chars * P[TTS_PRICE[tt]] / M * fx
    # 5. Self-hosted GPU (ASR / TTS): $/hr / (streams x derate) / 60 / utilisation, plus licence-free open weights
    gpu_fixed_inr = 0.0
    if s["inputs"].get("selfhost"):
        for role, (vm, min_gpus, streams) in s["inputs"]["selfhost"].items():
            price = P[vm][int(x["gpu_term"])] + (P["nvaie_per_gpu_hr"] if FIX["nvaie"] else 0.0)   # round 2: NVAIE
            eff = streams * x["gpu_derate"]
            if role == "tts":  # TTS capacity is in concurrent CALLS (throughput-bound; see report)
                per_min = price / 60 / eff / x["gpu_util"] * fx
            else:
                per_min = price / 60 / eff / x["gpu_util"] * fx * x["asr_stream_share"]
            # minimum fleet: N+1 GPUs whatever the volume
            min_fleet_inr = min_gpus * price * 730 * fx
            c["asr" if role == "asr" else "tts"] = max(per_min, min_fleet_inr / max(monthly_min, 1))
        gpu_fixed_inr = x["gpu_ops_inr_mo"]
    # 6. Realtime infra, storage, observability
    c["infra"] = (x["infra_vcpu_per_call"] * P["aca_vcpu_s"] + x["infra_gib_per_call"] * P["aca_gib_s"]) * 60 * x["infra_headroom"] * fx
    c["storage"] = x["rec_mb_per_min"] / 1024 * P["blob_hot_gb_mo"] * x["rec_retention_mo"] * fx
    c["observability"] = x["log_kb_per_min"] / 1024 / 1024 * P["log_ingest_gb"] * fx
    c["fixed_platform"] = (x["fixed_platform_usd_mo"] * fx + gpu_fixed_inr) / max(monthly_min, 1)
    c["support"] = x["support_inr_per_min"]
    cogs = sum(c.values())
    return c, cogs, cogs / (1 - x["gross_margin"])

def resolve(s, which="base", override=None):
    x = {k: pick(v, which) for k, v in s["inputs"].items() if isinstance(v, tuple) or isinstance(v, (int, float))}
    for k in ("gpu_term",):
        if k in s["inputs"]: x[k] = s["inputs"][k]
    if override: x.update(override)
    return x

def tri(rng, lo, mode, hi):
    if hi == lo: return lo
    return rng.triangular(lo, hi, mode)

def monte_carlo(s, n=20000, seed=7):
    rng = random.Random(seed); out = []; comps = {}
    keys = [k for k, v in s["inputs"].items() if isinstance(v, tuple)]
    for _ in range(n):
        x = resolve(s)
        for k in keys:
            lo, b, hi = s["inputs"][k]
            if k == "pulse_s": x[k] = rng.choice([lo, b, b, hi]); continue
            x[k] = tri(rng, lo, b, hi)
        c, cogs, price = compute(s, x, s["monthly_min"])
        out.append((cogs, price))
        for k2, v2 in c.items(): comps.setdefault(k2, []).append(v2)
    def pct(a, q):
        a = sorted(a); return a[min(len(a) - 1, int(q * len(a)))]
    cg = [o[0] for o in out]; pr = [o[1] for o in out]
    return {"cogs_p10": pct(cg, .10), "cogs_p50": pct(cg, .50), "cogs_p90": pct(cg, .90),
            "price_p10": pct(pr, .10), "price_p50": pct(pr, .50), "price_p90": pct(pr, .90),
            "p_cogs_le_2": sum(1 for v in cg if v <= 2.0) / len(cg),
            "comp_p50": {k: pct(v, .5) for k, v in comps.items()}}

def tornado(s):
    base = compute(s, resolve(s), s["monthly_min"])[1]; rows = []
    for k, v in s["inputs"].items():
        if not isinstance(v, tuple) or v[0] == v[2] or k == "gross_margin": continue
        lo = compute(s, resolve(s, override={k: v[0]}), s["monthly_min"])[1]
        hi = compute(s, resolve(s, override={k: v[2]}), s["monthly_min"])[1]
        rows.append({"input": k, "low_val": v[0], "high_val": v[2], "cogs_at_low": lo, "cogs_at_high": hi, "swing": abs(hi - lo)})
    # monthly volume as an input too (fixed costs and GPU minimum fleet amortise over it)
    v = s["monthly_min"]
    lo = compute(s, resolve(s), v / 3)[1]; hi = compute(s, resolve(s), v * 3)[1]
    rows.append({"input": "monthly_min", "low_val": v / 3, "high_val": v * 3, "cogs_at_low": lo, "cogs_at_high": hi, "swing": abs(hi - lo)})
    rows.sort(key=lambda r: -r["swing"])
    return base, rows

def lever_swaps(s):
    """Discrete architecture choices swapped one at a time on a scenario's base inputs."""
    base = compute(s, resolve(s), s["monthly_min"])[1]; out = []
    swaps = {"llm": ["gpt6_luna", "gpt54_nano", "gpt41_nano", "gpt41_mini", "deepseek_v4_flash", "gpt56_luna", "gpt61_sol", "gpt6_sol", "gpt56_terra"],
             # round 2: fixed-rate tier options dropped when tiers step (a fixed 400M rate ignores the under-filled fee)
             "tts": (["neural_tiered", "neural", "hd"] if FIX["tiers"] else ["neural_commit400m", "neural_commit80m", "neural", "hd"]),
             "asr": ["voicelive_byo", "voicelive_std", "s1"],
             "telephony": ["tata_unlimited", "plivo"]}
    for key, opts in swaps.items():
        for o in opts:
            s2 = copy.deepcopy(s); s2["inputs"][key] = o
            if key == "asr" and s2["inputs"].get("selfhost"): s2["inputs"]["selfhost"] = {k: v for k, v in s2["inputs"]["selfhost"].items() if k != "asr"} or None
            if key == "tts" and s2["inputs"].get("selfhost"): s2["inputs"]["selfhost"] = {k: v for k, v in s2["inputs"]["selfhost"].items() if k != "tts"} or None
            x = resolve(s2)
            if key == "telephony" and o == "plivo": x["pulse_s"] = 30
            if key == "telephony" and o == "tata_unlimited": x.setdefault("tata_fup_use", 0.8)
            c, cogs, _ = compute(s2, x, s2["monthly_min"])
            out.append({"lever": key, "option": o, "cogs": cogs, "delta_vs_base": cogs - base, "component": c})
    return base, out

def volume_curve(s, vols):
    res = []
    for v in vols:
        c, cogs, price = compute(s, resolve(s), v); res.append({"monthly_min": v, "cogs": cogs, "price": price})
    return res

def selfhost_breakeven():
    """Utilisation at which self-hosted ASR / TTS beats the managed per-minute price (3-yr RI, base derate 0.5)."""
    fx = 95.0; out = {}
    managed_asr = 60 * 10 / 1000 * P["vl_byo_speech_in_per_1k"] * fx              # INR/min
    managed_tts_neu = 0.5 * 800 * 1.1 * 0.75 * P["neural_tts_commit_400m_per_1m"] / M * fx
    managed_tts_hd = 0.5 * 800 * 1.1 * P["hd_tts_per_1m"] / M * fx
    for vm, streams, role in [("t4_vm", 50, "asr"), ("a10_vm", 116, "asr"), ("a100_vm", 233, "asr"), ("h100_vm", 366, "asr"),
                              ("a100_vm", 394, "tts"), ("h100_vm", 580, "tts")]:
        for term, tn in [(0, "on-demand"), (1, "1-yr RI"), (2, "3-yr RI")]:
            per_min_full = (P[vm][term] + (P["nvaie_per_gpu_hr"] if FIX["nvaie"] else 0.0)) / 60 / (streams * 0.5) * fx   # round 2: + NVAIE
            tgt = managed_asr if role == "asr" else managed_tts_neu
            out[f"{role}:{vm}:{tn}"] = {"inr_per_min_at_100pct": per_min_full, "managed_inr_per_min": tgt,
                                        "breakeven_util": per_min_full / tgt,
                                        "breakeven_util_vs_hd": (per_min_full / managed_tts_hd) if role == "tts" else None}
    return out

def telecaller_model(n=20000, seed=11, salary_samples=None):
    """Fully loaded in-house telecaller cost per productive connected minute and per qualified lead (INR)."""
    rng = random.Random(seed); cpm = []; cpl = []; cpc = []
    for _ in range(n):
        sal = rng.choice(salary_samples) if salary_samples else tri(rng, 12000, 18000, 28000)
        statutory = tri(rng, 0.00, 0.13, 0.22)      # employer PF/ESI/bonus/gratuity; informal SMBs ~0
        seat = tri(rng, 2500, 5000, 10000)          # rent+power+PC+headset amortised, Tier-2..Tier-1
        dialer = tri(rng, 950, 1250, 3000)          # Smartflo licence (unlimited calls, FUP) .. CRM+dialer stack
        supervision = tri(rng, 0.06, 0.10, 0.15) * tri(rng, 30000, 38000, 50000) / 1.0  # TL salary share (1 TL per 7-15)
        attr_mo = tri(rng, 0.04, 0.07, 0.12)        # monthly attrition
        hire_cost = tri(rng, 8000, 15000, 30000)    # sourcing + 2-3 weeks of ramp at partial productivity
        monthly = sal * (1 + statutory) + seat + dialer + supervision + attr_mo * hire_cost
        talk_h = tri(rng, 1.5, 2.5, 3.5)            # connected talk hours/day (vendor claims 2-3 h)
        days = tri(rng, 22, 24, 26)
        minutes = talk_h * 60 * days
        cpm.append(monthly / minutes)
        # outcome view: connected call 1.6 min avg (Callyzer); qualified share of connects
        q = tri(rng, 0.10, 0.20, 0.35)
        cpc.append(monthly / (minutes / 1.6))
        cpl.append(monthly / (minutes / 1.6 * q))
    def pct(a, qq): a = sorted(a); return a[int(qq * (len(a) - 1))]
    return {"inr_per_connected_min": {"p10": pct(cpm, .1), "p50": pct(cpm, .5), "p90": pct(cpm, .9)},
            "inr_per_connected_call": {"p10": pct(cpc, .1), "p50": pct(cpc, .5), "p90": pct(cpc, .9)},
            "inr_per_qualified_lead": {"p10": pct(cpl, .1), "p50": pct(cpl, .5), "p90": pct(cpl, .9)}}

def crossing_volume(s, target=2.0):
    """Smallest monthly connected-minute volume at which base COGS <= target (None if never below 50M)."""
    lo, hi = 1_000, 50_000_000
    if compute(s, resolve(s), hi)[1] > target: return None
    while hi / lo > 1.01:
        mid = math.sqrt(lo * hi)
        if compute(s, resolve(s), mid)[1] <= target: hi = mid
        else: lo = mid
    return hi

def buyer_outcome_compare(tele):
    """AI vs in-house telecaller per outcome for four call types (computed; assumptions in report)."""
    human_min = tele["inr_per_connected_min"]["p50"]
    cases = {  # avg AI connected minutes per connected call, human minutes per call, outcome share of connects, pulse s
        "lead qualification (speed-to-lead)": (2.5, 1.6, 0.20, 60),
        "COD confirmation / NDR": (0.75, 0.75, 0.85, 60),
        "EMI reminder (early bucket)": (1.5, 1.6, 0.35, 60),
        "appointment reminder": (1.0, 1.0, 0.70, 60)}
    out = {}
    for name, (ai_m, hu_m, share, pulse) in cases.items():
        billed = math.ceil(ai_m * 60 / pulse) * pulse / 60 if pulse >= 60 else ai_m
        row = {"human_inr_per_outcome": human_min * hu_m / share}
        for price in (2.0, 3.5, 5.0, 6.0):
            row[f"ai_at_{price:g}_per_min"] = price * billed / share
        row["ai_breakeven_price_per_min"] = row["human_inr_per_outcome"] * share / billed
        out[name] = row
    return out

T1 = ("mumbai", "navi mumbai", "thane", "mira", "delhi", "noida", "gurgaon", "gurugram", "ghaziabad", "faridabad", "bengaluru",
      "bangalore", "chennai", "hyderabad", "kolkata", "pune", "pimpri", "ahmedabad")

def load_salaries():
    """Unique Apna postings (deduped across city pages), assigned to the city named in their locality string."""
    path = os.path.join(HERE, "data", "apna-telecaller-jobs.jsonl")
    if not os.path.exists(path): return None, {}
    rows = [json.loads(l) for l in open(path)]
    seen, mids, by_city, tiers = set(), [], {}, {"tier1_metro": [], "tier2_3": [], "wfh": []}
    for r in rows:
        k = (r["title"], r["company"], r["locality"], r["sal_lo"], r["sal_hi"])
        if k in seen: continue
        seen.add(k)
        if not (5000 <= r["sal_lo"] <= r["sal_hi"] <= 80000): continue
        city = r["locality"].split(",")[-1].strip().lower().replace(" region", "")
        mid = (r["sal_lo"] + r["sal_hi"]) / 2; mids.append(mid); by_city.setdefault(city, []).append(mid)
        if "work from home" in city: tiers["wfh"].append(mid)
        elif any(t in city for t in T1): tiers["tier1_metro"].append(mid)
        else: tiers["tier2_3"].append(mid)
    by_city["_tiers"] = tiers
    return mids, by_city

def attribution():
    """Base and MC p50 per scenario as the round-2 fixes are switched on one at a time (cumulative)."""
    global SCENARIOS
    steps = [("round 1", {"nvaie": False, "tiers": False, "sol6": False}),
             ("+ NVAIE licence", {"nvaie": True, "tiers": False, "sol6": False}),
             ("+ stepped commitment tiers", {"nvaie": True, "tiers": True, "sol6": False}),
             ("+ 6-sol speaking model (= round 2)", {"nvaie": True, "tiers": True, "sol6": True})]
    saved = dict(FIX); out = []
    for label, flags in steps:
        FIX.update(flags); SCENARIOS = build_scenarios()
        row = {"step": label, "flags": dict(flags), "scenarios": {}}
        for sc in SCENARIOS:
            mc = monte_carlo(sc)
            row["scenarios"][sc["name"]] = {"base_cogs_inr": compute(sc, resolve(sc), sc["monthly_min"])[1],
                                            "mc_p10": mc["cogs_p10"], "mc_p50": mc["cogs_p50"], "mc_p90": mc["cogs_p90"],
                                            "p_cogs_le_2": mc["p_cogs_le_2"], "crossing_volume_inr2": crossing_volume(sc)}
        out.append(row)
    FIX.update(saved); SCENARIOS = build_scenarios()
    return out

def main():
    res = {"generated": "2026-10-17", "round2_corrected": "2026-10-17", "fix_flags": dict(FIX),
           "prices": {k: v for k, v in P.items()},
           "commitment_tiers": {"tts_neural": [{"included_chars": a, "fee_usd_mo": b, "overage_usd_per_1m": c * M} for a, b, c in TTS_NEURAL_TIERS],
                                "stt_s1": [{"included_hours": a, "fee_usd_mo": b, "overage_usd_per_h": c} for a, b, c in STT_TIERS]},
           "scenarios": [], "tornado": {}}
    for s in SCENARIOS:
        c, cogs, price = compute(s, resolve(s), s["monthly_min"])
        mc = monte_carlo(s)
        xb = resolve(s)
        chars_mo = xb["agent_talk_share"] * xb["tts_chars_per_agent_min"] * xb["tts_waste"] * (1 - xb["tts_cache_share"]) * s["monthly_min"]
        res["scenarios"].append({"name": s["name"], "monthly_min": s["monthly_min"],
                                 "headline_cogs_inr_mc_p50": mc["cogs_p50"], "headline_cogs_inr_mc_p10_p90": [mc["cogs_p10"], mc["cogs_p90"]],
                                 "headline_price_inr_at_gm_mc_p50": mc["price_p50"],
                                 "base_components_inr": c,
                                 "base_cogs_inr": cogs, "base_cogs_note": "all inputs at their mode; NOT the headline (see headline_cogs_inr_mc_p50)",
                                 "base_price_inr_at_gm": price, "mc": mc,
                                 "llm": s["inputs"]["llm"], "tts": s["inputs"]["tts"], "asr": s["inputs"]["asr"],
                                 "telephony": s["inputs"]["telephony"],
                                 "tts_tier_at_base": best_tier(chars_mo, TTS_NEURAL_TIERS) if s["inputs"]["tts"] == "neural_tiered" and FIX["tiers"] else None,
                                 "stt_tier_at_base": best_tier(s["monthly_min"] / 60, STT_TIERS) if s["inputs"]["asr"] == "s1" and FIX["tiers"] else None})
    for idx in (0, 2, 4):
        base, rows = tornado(SCENARIOS[idx]); res["tornado"][SCENARIOS[idx]["name"]] = {"base": base, "rows": rows}
    res["levers_B"] = dict(zip(("base", "rows"), lever_swaps(SCENARIOS[2])))
    res["levers_A"] = dict(zip(("base", "rows"), lever_swaps(SCENARIOS[0])))
    res["fx88"] = {sc["name"]: compute(sc, resolve(sc, override={"fx_inr_per_usd": 88.0}), sc["monthly_min"])[1] for sc in SCENARIOS}
    res["volume_curve_B"] = volume_curve(SCENARIOS[2], [10_000, 50_000, 100_000, 300_000, 1_000_000, 3_000_000, 10_000_000, 50_000_000])
    # round 2: the managed floor if the ear switches to S1 STT on the stepped commitment tiers at volume
    sB_s1 = copy.deepcopy(SCENARIOS[2]); sB_s1["name"] = "B with S1 STT ear on stepped commitment tiers"; sB_s1["inputs"]["asr"] = "s1"
    sB_s1["inputs"]["asr_ref_factor"] = (1.0, 1.0, 1.0)   # as in A0: the echo-reference billing question is Voice Live-specific
    res["volume_curve_B_s1_tiered_ear"] = volume_curve(sB_s1, [10_000, 100_000, 1_000_000, 3_000_000, 10_000_000, 50_000_000])
    res["mc_B_s1_tiered_ear_at_10M"] = {k: v for k, v in monte_carlo(dict(sB_s1, monthly_min=10_000_000)).items() if k != "comp_p50"}
    # round 2: D's 3-year reservations are a ~USD 565k commitment; show the other terms
    res["gpu_term_sensitivity_D"] = {}
    for term, label in ((2, "3-yr RI"), (1, "1-yr RI"), (0, "on demand")):
        sD = copy.deepcopy(SCENARIOS[4]); sD["inputs"]["gpu_term"] = term
        res["gpu_term_sensitivity_D"][label] = {"base_cogs_inr": compute(sD, resolve(sD), sD["monthly_min"])[1],
                                                "crossing_volume_inr2": crossing_volume(sD)}
    res["volume_curve_D"] = volume_curve(SCENARIOS[4], [100_000, 300_000, 1_000_000, 3_000_000, 5_000_000, 10_000_000, 30_000_000])
    res["selfhost_breakeven"] = selfhost_breakeven()
    mids, by_city = load_salaries()
    res["salary_sample"] = None
    if mids:
        mids_s = sorted(mids)
        tiers = by_city.pop("_tiers")
        q = lambda v, f: sorted(v)[int(f * (len(v) - 1))] if v else None
        res["salary_sample"] = {"n": len(mids), "p10": q(mids, .1), "p25": q(mids, .25), "p50": q(mids, .5), "p75": q(mids, .75),
                                "p90": q(mids, .9), "basis": "mid-point of posted monthly band, unique postings, Apna, 2026-10-17",
                                "tiers": {k: {"n": len(v), "p25": q(v, .25), "p50": q(v, .5), "p75": q(v, .75)} for k, v in tiers.items()},
                                "by_city_median": {k: q(v, .5) for k, v in by_city.items() if len(v) >= 15},
                                "by_city_n": {k: len(v) for k, v in sorted(by_city.items(), key=lambda kv: -len(kv[1])) if len(v) >= 15}}
    res["telecaller"] = telecaller_model(salary_samples=mids)
    res["telecaller_fixed_salary_check"] = telecaller_model(salary_samples=None)
    res["buyer_outcome_compare"] = buyer_outcome_compare(res["telecaller"])
    res["crossing_volume_inr2"] = {sc["name"]: crossing_volume(sc) for sc in SCENARIOS}
    res["round2_attribution"] = attribution()
    res["headline"] = {
        "basis": "Monte Carlo p50 of COGS, INR per connected minute (n=20,000, seed 7); p10-p90 in brackets. The base case is all modes and is not the decision number.",
        "by_scenario": {sc["name"]: {"mc_p50": round(sc["mc"]["cogs_p50"], 3), "mc_p10": round(sc["mc"]["cogs_p10"], 3),
                                     "mc_p90": round(sc["mc"]["cogs_p90"], 3), "p_cogs_le_2": round(sc["mc"]["p_cogs_le_2"], 3),
                                     "base_all_modes": round(sc["base_cogs_inr"], 3), "monthly_min": sc["monthly_min"]}
                        for sc in res["scenarios"]}}
    json.dump(res, open(os.path.join(HERE, "cost-model.json"), "w"), indent=1, default=str)
    write_xlsx(res); plot_tornado(res)
    for s in res["scenarios"]:
        m = s["mc"]
        print(f"{s['name'][:58]:58s} HEADLINE MC p50 {m['cogs_p50']:.2f} (p10-p90 {m['cogs_p10']:.2f}-{m['cogs_p90']:.2f})"
              f"  P(<=2) {m['p_cogs_le_2']:.2f}  base(all modes) {s['base_cogs_inr']:.2f}  price@GM p50 {m['price_p50']:.2f}")
    for row in res["round2_attribution"]:
        print(row["step"], {k[:6]: (round(v["base_cogs_inr"], 2), round(v["mc_p50"], 2)) for k, v in row["scenarios"].items()})
    print("telecaller", json.dumps(res["telecaller"]))
    print("salary", json.dumps(res["salary_sample"]))

# ---------------------------------------------------------------------------------------------------------------
def write_xlsx(res):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook(); ws = wb.active; ws.title = "Model"
    bold = Font(bold=True); inp = PatternFill("solid", fgColor="FFF4CC"); hdr = PatternFill("solid", fgColor="DDE7F5")
    ws["A1"] = "VP l2-economics: INR per CONNECTED minute at BASE inputs (all modes). Yellow cells are inputs; everything else is a formula. HEADLINE = Monte Carlo p50 (rows at the bottom and sheet Headline)."; ws["A1"].font = bold
    ws["A2"] = "Prices from Azure Retail Prices API and vendor pages read 2026-10-17; see sheet Prices and report.md. Round-2 corrections 2026-10-17: NVAIE licence, stepped commitment tiers, 6-sol speaking model (see sheet Headline)."
    cols = ["B", "C", "D", "E", "F", "G", "H", "I"]
    names = [s["name"] for s in SCENARIOS]
    ws["A4"] = "Input / line"; ws["A4"].font = bold
    for col, s in zip(cols, SCENARIOS):
        ws[f"{col}4"] = s["name"]; ws[f"{col}4"].font = bold; ws[f"{col}4"].fill = hdr
        ws[f"{col}4"].alignment = Alignment(wrap_text=True)
    ws["J4"] = "unit / note"; ws["J4"].font = bold
    def unit_prices(s):
        x = resolve(s)
        a = s["inputs"]["asr"]; t = s["inputs"]["telephony"]; tt = s["inputs"]["tts"]
        llm = P[s["inputs"]["llm"]]
        asr_usd_min = {"voicelive_std": None, "voicelive_byo": None, "s1": P["s1_stt_per_hr"] / 60, "selfhost": 0}[a]
        asr_per_1k = {"voicelive_std": P["vl_std_speech_in_per_1k"], "voicelive_byo": P["vl_byo_speech_in_per_1k"]}.get(a, 0)
        tts_per_1m = 0 if tt == "selfhost" else P[TTS_PRICE[tt]]
        return x, asr_usd_min, asr_per_1k, tts_per_1m, llm, t
    rows = [
        ("monthly_min", "Connected minutes per month", lambda s, x: s["monthly_min"], "min"),
        ("fx", "FX INR per USD", lambda s, x: x["fx_inr_per_usd"], "3 feeds 2026-10-16/17"),
        ("avg_call", "Average connected call length", lambda s, x: x["avg_call_min"], "min"),
        ("tel_rate", "Telephony INR per min (per-minute plans)", lambda s, x: P["plivo_min_inr"] if s["inputs"]["telephony"] == "plivo" else 0, "Plivo IN domestic"),
        ("pulse", "Pulse seconds", lambda s, x: x["pulse_s"], "s"),
        ("num_mo", "Number rental INR/month", lambda s, x: P["plivo_number_mo_inr"] if s["inputs"]["telephony"] == "plivo" else 0, ""),
        ("min_per_num", "Minutes per number per month", lambda s, x: x["minutes_per_number_mo"], ""),
        ("conc_mo", "Unlimited plan INR per concurrency per month", lambda s, x: P["tata_stream_unl_conc_mo_inr"] if s["inputs"]["telephony"] == "tata_unlimited" else 0, "Tata Smartflo Voice Streaming Unlimited"),
        ("fup_min", "FUP minutes per concurrency x share used", lambda s, x: P["tata_fup_min_per_user"] * x.get("tata_fup_use", 1) if s["inputs"]["telephony"] == "tata_unlimited" else 0, ""),
        ("asr_usd_min", "ASR USD per streamed min (S1 style; effective stepped-tier rate at this volume)",
         lambda s, x: ((tiered_usd(s["monthly_min"] * x["asr_stream_share"] * x["asr_ref_factor"] / 60, STT_TIERS) / (s["monthly_min"] * x["asr_stream_share"] * x["asr_ref_factor"])
                        if FIX["tiers"] else P["s1_stt_per_hr"] / 60) if s["inputs"]["asr"] == "s1" else 0),
         "round 2: cheapest of PAYG $1/h and 2K/10K/50K/100K-h commitments"),
        ("vl_per_1k", "Voice Live speech-in USD per 1K tokens", lambda s, x: {"voicelive_std": P["vl_std_speech_in_per_1k"], "voicelive_byo": P["vl_byo_speech_in_per_1k"]}.get(s["inputs"]["asr"], 0), ""),
        ("vl_tps", "Voice Live audio tokens per second", lambda s, x: x["vl_tok_per_s"], "harvest measured ~9.3"),
        ("asr_ref", "ASR stream factor (stereo ref billed?)", lambda s, x: x["asr_stream_share"] * x["asr_ref_factor"], "1 = not billed"),
        ("gpu_asr_usd_hr", "Self-host ASR GPU USD/hr", lambda s, x: P[s["inputs"]["selfhost"]["asr"][0]][s["inputs"]["gpu_term"]] if s["inputs"].get("selfhost") and "asr" in s["inputs"]["selfhost"] else 0, "3-yr RI"),
        ("gpu_asr_streams", "Self-host ASR streams per GPU (vendor)", lambda s, x: s["inputs"]["selfhost"]["asr"][2] if s["inputs"].get("selfhost") and "asr" in s["inputs"]["selfhost"] else 0, "Riva 2.15 Hindi Conformer"),
        ("gpu_tts_usd_hr", "Self-host TTS GPU USD/hr", lambda s, x: P[s["inputs"]["selfhost"]["tts"][0]][s["inputs"]["gpu_term"]] if s["inputs"].get("selfhost") and "tts" in s["inputs"]["selfhost"] else 0, "3-yr RI"),
        ("gpu_tts_calls", "Self-host TTS calls per GPU (derived)", lambda s, x: s["inputs"]["selfhost"]["tts"][2] if s["inputs"].get("selfhost") and "tts" in s["inputs"]["selfhost"] else 0, "Magpie NIM H100 64 streams RTFX 291"),
        ("nvaie", "NVIDIA AI Enterprise licence USD per GPU-hour", lambda s, x: (P["nvaie_per_gpu_hr"] if (s["inputs"].get("selfhost") and FIX["nvaie"]) else 0), "round 2: $4,500/GPU-year; Riva/NIM production licence"),
        ("gpu_derate", "GPU derate vs vendor benchmark", lambda s, x: x.get("gpu_derate", 0), ""),
        ("gpu_util", "GPU average utilisation", lambda s, x: x.get("gpu_util", 0), "diurnal + N+1"),
        ("gpu_min", "Minimum GPUs per role", lambda s, x: (s["inputs"]["selfhost"].get("asr", (0, 0, 0))[1] if s["inputs"].get("selfhost") else 0), "N+1"),
        ("gpu_ops", "GPU ops staff INR/month", lambda s, x: x.get("gpu_ops_inr_mo", 0), ""),
        ("llm_in", "LLM input USD/1M", lambda s, x: P[s["inputs"]["llm"]][0], ""),
        ("llm_cached", "LLM cached input USD/1M", lambda s, x: P[s["inputs"]["llm"]][1], ""),
        ("llm_write", "LLM cache-write USD/1M", lambda s, x: P[s["inputs"]["llm"]][2], ""),
        ("llm_out", "LLM output USD/1M", lambda s, x: P[s["inputs"]["llm"]][3], ""),
        ("turns", "Agent turns per minute", lambda s, x: x["turns_per_min"], ""),
        ("mult", "LLM call multiplier (prefetch/hedge)", lambda s, x: x["llm_call_multiplier"], ""),
        ("sys", "System prompt tokens", lambda s, x: x["llm_sys_tok"], ""),
        ("hist", "History tokens", lambda s, x: x["llm_hist_tok"], ""),
        ("ctx", "Dynamic context tokens", lambda s, x: x["llm_ctx_tok"], ""),
        ("hit", "Prompt-cache hit share", lambda s, x: x["llm_cache_hit"], ""),
        ("outtok", "Output tokens per turn", lambda s, x: x["llm_out_tok_per_turn"], "o200k: 1.41 tok/word Hinglish (measured)"),
        ("guard", "Guard tokens per turn (6-luna)", lambda s, x: x["guard_in_tok_per_turn"], ""),
        ("post", "Post-call tokens per call (6-luna)", lambda s, x: x["post_call_tok"], ""),
        ("talk", "Agent talk share", lambda s, x: x["agent_talk_share"], ""),
        ("chars", "TTS chars per agent-speech minute", lambda s, x: x["tts_chars_per_agent_min"], "measured 612-1038"),
        ("waste", "TTS waste factor", lambda s, x: x["tts_waste"], ""),
        ("tcache", "TTS phrase-cache share", lambda s, x: x["tts_cache_share"], ""),
        ("tts_1m", "TTS USD per 1M chars (effective; neural = cheapest stepped tier at this volume)",
         lambda s, x: (0 if s["inputs"]["tts"] == "selfhost" else
                       (tiered_usd(x["agent_talk_share"] * x["tts_chars_per_agent_min"] * x["tts_waste"] * (1 - x["tts_cache_share"]) * s["monthly_min"], TTS_NEURAL_TIERS)
                        / (x["agent_talk_share"] * x["tts_chars_per_agent_min"] * x["tts_waste"] * (1 - x["tts_cache_share"]) * s["monthly_min"]) * M
                        if (s["inputs"]["tts"] == "neural_tiered" and FIX["tiers"]) else P[TTS_PRICE[s["inputs"]["tts"]]])),
         "round 2: tiers step with volume; an under-filled tier is paid in full"),
        ("vcpu", "vCPU per concurrent call", lambda s, x: x["infra_vcpu_per_call"], ""),
        ("gib", "GiB per concurrent call", lambda s, x: x["infra_gib_per_call"], ""),
        ("head", "Infra headroom", lambda s, x: x["infra_headroom"], ""),
        ("recmb", "Recording MB per min", lambda s, x: x["rec_mb_per_min"], ""),
        ("ret", "Recording retention months", lambda s, x: x["rec_retention_mo"], ""),
        ("logkb", "Log KB per min", lambda s, x: x["log_kb_per_min"], ""),
        ("support", "Support/ops INR per min", lambda s, x: x["support_inr_per_min"], ""),
        ("fixed", "Fixed platform USD/month", lambda s, x: x["fixed_platform_usd_mo"], ""),
        ("gm", "Target gross margin", lambda s, x: x["gross_margin"], ""),
    ]
    R = {}; r0 = 5
    for i, (key, label, fn, note) in enumerate(rows):
        r = r0 + i; R[key] = r; ws[f"A{r}"] = label; ws[f"J{r}"] = note
        for col, s in zip(cols, SCENARIOS):
            x = resolve(s); ws[f"{col}{r}"] = fn(s, x); ws[f"{col}{r}"].fill = inp
    r = r0 + len(rows) + 1
    ws[f"A{r}"] = "OUTPUT: INR per connected minute"; ws[f"A{r}"].font = bold; r += 1
    def ref(k, col): return f"{col}{R[k]}"
    out_rows = {}
    for label, f in [
        ("Telephony", lambda c: f"IF({ref('conc_mo',c)}>0,{ref('conc_mo',c)}/{ref('fup_min',c)}+20000/36/{ref('monthly_min',c)},{ref('tel_rate',c)}*(1+({ref('pulse',c)}/60/2)/{ref('avg_call',c)})+{ref('num_mo',c)}/{ref('min_per_num',c)})"),
        ("ASR (ear)", lambda c: f"IF({ref('gpu_asr_usd_hr',c)}>0,MAX(({ref('gpu_asr_usd_hr',c)}+{ref('nvaie',c)})/60/({ref('gpu_asr_streams',c)}*{ref('gpu_derate',c)})/{ref('gpu_util',c)}*{ref('fx',c)},{ref('gpu_min',c)}*({ref('gpu_asr_usd_hr',c)}+{ref('nvaie',c)})*730*{ref('fx',c)}/{ref('monthly_min',c)}),({ref('asr_usd_min',c)}+60*{ref('vl_tps',c)}/1000*{ref('vl_per_1k',c)})*{ref('asr_ref',c)}*{ref('fx',c)})"),
        ("LLM", lambda c: f"({ref('turns',c)}*{ref('mult',c)}*((({ref('sys',c)}+{ref('hist',c)}+{ref('ctx',c)}+20)*({ref('hit',c)}*{ref('llm_cached',c)}+(1-{ref('hit',c)})*MAX({ref('llm_in',c)},{ref('llm_write',c)}))+{ref('outtok',c)}*{ref('llm_out',c)})/1000000+({ref('guard',c)}*(0.8*0.01+0.2*0.125)+20*0.5)/1000000)+({ref('post',c)}*0.1+300*0.5)/1000000/{ref('avg_call',c)})*{ref('fx',c)}"),
        ("TTS", lambda c: f"IF({ref('gpu_tts_usd_hr',c)}>0,MAX(({ref('gpu_tts_usd_hr',c)}+{ref('nvaie',c)})/60/({ref('gpu_tts_calls',c)}*{ref('gpu_derate',c)})/{ref('gpu_util',c)}*{ref('fx',c)},{ref('gpu_min',c)}*({ref('gpu_tts_usd_hr',c)}+{ref('nvaie',c)})*730*{ref('fx',c)}/{ref('monthly_min',c)}),{ref('talk',c)}*{ref('chars',c)}*{ref('waste',c)}*(1-{ref('tcache',c)})*{ref('tts_1m',c)}/1000000*{ref('fx',c)})"),
        ("Realtime infra", lambda c: f"({ref('vcpu',c)}*0.000024+{ref('gib',c)}*0.000003)*60*{ref('head',c)}*{ref('fx',c)}"),
        ("Recording storage", lambda c: f"{ref('recmb',c)}/1024*0.02*{ref('ret',c)}*{ref('fx',c)}"),
        ("Observability", lambda c: f"{ref('logkb',c)}/1048576*3.22*{ref('fx',c)}"),
        ("Fixed platform + GPU ops / volume", lambda c: f"({ref('fixed',c)}*{ref('fx',c)}+{ref('gpu_ops',c)})/{ref('monthly_min',c)}"),
        ("Support / ops", lambda c: f"{ref('support',c)}"),
    ]:
        ws[f"A{r}"] = label; out_rows[label] = r
        for col in cols: ws[f"{col}{r}"] = "=" + f(col); ws[f"{col}{r}"].number_format = "0.000"
        r += 1
    first, last = out_rows["Telephony"], out_rows["Support / ops"]
    ws[f"A{r}"] = "COGS INR per connected minute"; ws[f"A{r}"].font = bold
    for col in cols: ws[f"{col}{r}"] = f"=SUM({col}{first}:{col}{last})"; ws[f"{col}{r}"].number_format = "0.00"; ws[f"{col}{r}"].font = bold
    cr = r; r += 1
    ws[f"A{r}"] = "Price INR per connected minute at target gross margin"; ws[f"A{r}"].font = bold
    for col in cols: ws[f"{col}{r}"] = f"={col}{cr}/(1-{ref('gm',col)})"; ws[f"{col}{r}"].number_format = "0.00"
    r += 1
    ws[f"A{r}"] = "Below INR 2 COGS?"
    for col in cols: ws[f"{col}{r}"] = f'=IF({col}{cr}<=2,"yes","no")'
    r += 2
    ws[f"A{r}"] = "HEADLINE: Monte Carlo COGS p50, INR per connected minute (n=20,000; values from cost-model.py)"; ws[f"A{r}"].font = bold
    for col, sc in zip(cols, res["scenarios"]): ws[f"{col}{r}"] = round(sc["mc"]["cogs_p50"], 3); ws[f"{col}{r}"].font = bold; ws[f"{col}{r}"].number_format = "0.00"
    r += 1; ws[f"A{r}"] = "Monte Carlo COGS p10"
    for col, sc in zip(cols, res["scenarios"]): ws[f"{col}{r}"] = round(sc["mc"]["cogs_p10"], 3); ws[f"{col}{r}"].number_format = "0.00"
    r += 1; ws[f"A{r}"] = "Monte Carlo COGS p90"
    for col, sc in zip(cols, res["scenarios"]): ws[f"{col}{r}"] = round(sc["mc"]["cogs_p90"], 3); ws[f"{col}{r}"].number_format = "0.00"
    r += 1; ws[f"A{r}"] = "P(COGS <= INR 2)"
    for col, sc in zip(cols, res["scenarios"]): ws[f"{col}{r}"] = round(sc["mc"]["p_cogs_le_2"], 3)
    r += 1; ws[f"A{r}"] = "Note: the formula rows above are the all-modes base case. Right-skewed ranges put it below the MC p50 (in A, below the MC p10). Quote the MC p50."
    ws.column_dimensions["A"].width = 52
    for col in cols: ws.column_dimensions[col].width = 22
    ws.column_dimensions["J"].width = 40
    # Headline sheet (round 2): first sheet in the workbook
    hd = wb.create_sheet("Headline", 0)
    hd["A1"] = "VP l2-economics, round-2 corrected 2026-10-17. HEADLINE = Monte Carlo p50 COGS, INR per connected minute (p10-p90)."; hd["A1"].font = bold
    hd["A2"] = "Corrections: NVAIE licence on self-hosted GPUs; commitment tiers step with volume (TTS neural, S1 STT); speaking model gpt-6-sol (not 6.1-sol) in B, C, D, B-HD. FX 95. Round-1 file: cost-model.round1.xlsx."
    hd.append([])
    hd.append(["scenario", "monthly connected min", "MC p50 (HEADLINE)", "MC p10", "MC p90", "P(COGS<=2)", "base, all modes (not headline)",
               "round-1 MC p50", "round-1 base", "price at target GM, MC p50"])
    for c_ in hd[4]: c_.font = bold; c_.fill = hdr
    r1 = {}
    try:
        r1 = {sc["name"]: sc for sc in json.load(open(os.path.join(HERE, "cost-model.round1.json")))["scenarios"]}
    except Exception:
        pass
    for sc in res["scenarios"]:
        o = r1.get(sc["name"], {})
        hd.append([sc["name"], sc["monthly_min"], round(sc["mc"]["cogs_p50"], 2), round(sc["mc"]["cogs_p10"], 2), round(sc["mc"]["cogs_p90"], 2),
                   round(sc["mc"]["p_cogs_le_2"], 3), round(sc["base_cogs_inr"], 2),
                   round(o["mc"]["cogs_p50"], 2) if o else None, round(o["base_cogs_inr"], 2) if o else None, round(sc["mc"]["price_p50"], 2)])
    hd.append([])
    hd.append(["Attribution (cumulative): base / MC p50 per scenario as each fix is switched on"]); hd[hd.max_row][0].font = bold
    hd.append(["step"] + [sc["name"][:40] for sc in res["scenarios"]])
    for row in res.get("round2_attribution", []):
        hd.append([row["step"]] + [f'{row["scenarios"][sc["name"]]["base_cogs_inr"]:.2f} / {row["scenarios"][sc["name"]]["mc_p50"]:.2f}' for sc in res["scenarios"]])
    hd.column_dimensions["A"].width = 58
    for col in "BCDEFGHIJ": hd.column_dimensions[col].width = 18
    # Telecaller sheet (formulas)
    t = wb.create_sheet("Telecaller")
    t["A1"] = "In-house telecaller: fully loaded INR per productive connected minute and per outcome (formulas; yellow = inputs)"; t["A1"].font = bold
    sal_p50 = (res.get("salary_sample") or {}).get("p50") or 17000
    trows = [("Gross salary INR/month", sal_p50, "Apna job posts 2026-10-17, measured median of band mid-points (n=1,234); round 1 used 18,000"),
             ("Employer statutory loading (PF/ESI/bonus/gratuity)", 0.13, "0 for informal SMBs .. ~0.22"),
             ("Seat: rent, power, PC, headset INR/month", 5000, "assumption, Tier-2..Tier-1"),
             ("Dialer/telephony licence INR/month", 1250, "Tata Smartflo Pro unlimited (FUP 5000 min)"),
             ("Team-lead salary INR/month", 38000, "assumption"),
             ("Callers per team lead", 10, "assumption 7-15"),
             ("Monthly attrition", 0.07, "assumption; BPO/telecalling attrition commonly 4-12%/month"),
             ("Cost per hire incl. ramp INR", 15000, "assumption"),
             ("Connected talk hours per day", 2.5, "vendor claims 2-3 h (RMDialer); Callyzer 1.6 min avg call"),
             ("Working days per month", 24, ""),
             ("Avg connected call minutes", 1.6, "Callyzer, 5 crore calls (vendor data)"),
             ("Qualified share of connected calls", 0.20, "assumption")]
    for i, (lab, val, note) in enumerate(trows):
        t[f"A{3+i}"] = lab; t[f"B{3+i}"] = val; t[f"B{3+i}"].fill = inp; t[f"C{3+i}"] = note
    t["A16"] = "Fully loaded cost INR/month"; t["B16"] = "=B3*(1+B4)+B5+B6+B7/B8+B9*B10"
    t["A17"] = "Productive connected minutes/month"; t["B17"] = "=B11*60*B12"
    t["A18"] = "INR per connected minute"; t["B18"] = "=B16/B17"; t["A18"].font = bold
    t["A19"] = "INR per connected call"; t["B19"] = "=B18*B13"
    t["A20"] = "INR per qualified lead"; t["B20"] = "=B19/B14"; t["A20"].font = bold
    t["A22"] = "Monte Carlo (cost-model.py, n=20,000) p10 / p50 / p90:"
    tc = res["telecaller"]
    for i, k in enumerate(["inr_per_connected_min", "inr_per_connected_call", "inr_per_qualified_lead"]):
        t[f"A{23+i}"] = k; t[f"B{23+i}"] = round(tc[k]["p10"], 2); t[f"C{23+i}"] = round(tc[k]["p50"], 2); t[f"D{23+i}"] = round(tc[k]["p90"], 2)
    t.column_dimensions["A"].width = 52; t.column_dimensions["C"].width = 60
    # Monte Carlo + tornado (values computed by cost-model.py)
    mc = wb.create_sheet("MonteCarlo")
    mc.append(["scenario", "monthly_min", "COGS p10", "COGS p50", "COGS p90", "P(COGS<=2)", "price p10", "price p50", "price p90"])
    for s in res["scenarios"]:
        m = s["mc"]; mc.append([s["name"], s["monthly_min"], m["cogs_p10"], m["cogs_p50"], m["cogs_p90"], m["p_cogs_le_2"], m["price_p10"], m["price_p50"], m["price_p90"]])
    tw = wb.create_sheet("Tornado")
    tw.append(["scenario", "input", "low value", "high value", "COGS at low", "COGS at high", "swing"])
    for name, d in res["tornado"].items():
        for row in d["rows"]: tw.append([name, row["input"], row["low_val"], row["high_val"], row["cogs_at_low"], row["cogs_at_high"], row["swing"]])
    vc = wb.create_sheet("Volume")
    vc.append(["scenario", "monthly connected min", "COGS INR/min", "price INR/min"])
    for k in ("volume_curve_B", "volume_curve_D"):
        for row in res[k]: vc.append([k, row["monthly_min"], row["cogs"], row["price"]])
    lv = wb.create_sheet("Levers")
    lv.append(["scenario", "lever", "option", "COGS INR/min", "delta vs scenario base"])
    for nm in ("levers_A", "levers_B"):
        for row in res[nm]["rows"]: lv.append([nm, row["lever"], row["option"], row["cogs"], row["delta_vs_base"]])
    be = wb.create_sheet("SelfHostBreakeven")
    be.append(["role:vm:term", "INR/min at 100% util", "managed INR/min", "break-even utilisation (vs neural/VL)", "break-even vs HD TTS"])
    for k, v in res["selfhost_breakeven"].items(): be.append([k, v["inr_per_min_at_100pct"], v["managed_inr_per_min"], v["breakeven_util"], v["breakeven_util_vs_hd"]])
    bo = wb.create_sheet("BuyerOutcome")
    bo.append(["call type", "human INR/outcome (p50 telecaller)", "AI @ INR2/min", "AI @ INR3.5/min", "AI @ INR5/min", "AI @ INR6/min", "AI break-even INR/min"])
    for k, v in res["buyer_outcome_compare"].items():
        bo.append([k, v["human_inr_per_outcome"], v["ai_at_2_per_min"], v["ai_at_3.5_per_min"], v["ai_at_5_per_min"], v["ai_at_6_per_min"], v["ai_breakeven_price_per_min"]])
    bo.append([]); bo.append(["Monthly connected minutes at which base COGS <= INR 2"])
    for k, v in res["crossing_volume_inr2"].items(): bo.append([k, v if v else "not below INR 2 at any volume up to 50M"])
    pr = wb.create_sheet("Prices")
    pr.append(["key", "value", "note"])
    for k, v in P.items(): pr.append([k, json.dumps(v) if isinstance(v, tuple) else v, "USD unless _inr; Azure Retail Prices API / vendor page, read 2026-10-17"])
    pr.append([]); pr.append(["Commitment tiers (round 2)", "included / fee USD per month / overage", "Azure Retail Prices API centralindia 2026-10-17"])
    for a, b, c in TTS_NEURAL_TIERS: pr.append(["tts_neural_tier", f"{a/1e6:g}M chars / {b} / {c*M:g} per 1M", ""])
    for a, b, c in STT_TIERS: pr.append(["stt_s1_tier", f"{a:g} h / {b} / {c:g} per h", ""])
    wb.save(os.path.join(HERE, "cost-model.xlsx"))

def plot_tornado(res):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    names = list(res["tornado"].keys())
    def g(v): return f"{v/1e6:.2g}M" if v >= 1e5 else f"{v:g}"
    fig, axes = plt.subplots(len(names) + 1, 1, figsize=(10, 4.2 * (len(names) + 1)), facecolor="#fcfcfb")
    # panel 0: discrete architecture levers on scenario B (range across options)
    ax = axes[0]; ax.set_facecolor("#fcfcfb"); lv = res["levers_B"]; base = lv["base"]
    groups = {}
    for r in lv["rows"]: groups.setdefault(r["lever"], []).append(r)
    labels = {"llm": "speaking LLM", "tts": "TTS voice tier", "asr": "ASR / ear", "telephony": "telephony plan"}
    order = sorted(groups, key=lambda k: max(r["cogs"] for r in groups[k]) - min(r["cogs"] for r in groups[k]))
    for i, k in enumerate(order):
        rs = sorted(groups[k], key=lambda r: r["cogs"]); lo, hi = rs[0], rs[-1]
        ax.barh(i, hi["cogs"] - lo["cogs"], left=lo["cogs"], height=0.55, color="#2a78d6", edgecolor="#fcfcfb", linewidth=2)
        ax.text(lo["cogs"] - 0.02, i, f"{lo['option']} {lo['cogs']:.2f}", fontsize=8, color="#52514e", ha="right", va="center")
        ax.text(hi["cogs"] + 0.02, i, f"{hi['option']} {hi['cogs']:.2f}", fontsize=8, color="#52514e", ha="left", va="center")
    ax.set_yticks(range(len(order))); ax.set_yticklabels([labels[k] for k in order], fontsize=9, color="#0b0b0b")
    ax.axvline(base, color="#52514e", linewidth=1); ax.axvline(2.0, color="#e34948", linewidth=1, linestyle="--")
    ax.text(2.0, -0.75, " INR 2 target", fontsize=8, color="#52514e", va="center")
    allc = [r["cogs"] for r in lv["rows"]]; ax.set_xlim(min(allc) - 0.75, max(allc) + 0.6); ax.set_ylim(-1.0, len(order) - 0.4)
    mcB = next(sc["mc"] for sc in res["scenarios"] if sc["name"] == SCENARIOS[2]["name"])
    ax.set_title(f"Architecture levers swapped one at a time on scenario B\nheadline MC p50 INR {mcB['cogs_p50']:.2f}; bars around the all-modes base INR {base:.2f}", fontsize=10.5, color="#0b0b0b", loc="left")
    ax.set_xlabel("COGS, INR per connected minute", fontsize=9, color="#52514e")
    for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    for sp in ("left", "bottom"): ax.spines[sp].set_color("#c9c8c3")
    ax.tick_params(colors="#52514e", labelsize=8.5); ax.grid(axis="x", color="#e7e6e2", linewidth=0.8); ax.set_axisbelow(True)
    for ax, name in zip(axes[1:], names):
        d = res["tornado"][name]; rows = d["rows"][:10][::-1]; base = d["base"]
        ax.set_facecolor("#fcfcfb")
        for i, r in enumerate(rows):
            lo, hi = r["cogs_at_low"] - base, r["cogs_at_high"] - base
            ax.barh(i, lo, left=base, height=0.62, color="#2a78d6", edgecolor="#fcfcfb", linewidth=2)
            ax.barh(i, hi, left=base, height=0.62, color="#eb6834", edgecolor="#fcfcfb", linewidth=2)
        ax.set_yticks(range(len(rows)))
        ax.set_yticklabels([f"{r['input']}  ({g(r['low_val'])} .. {g(r['high_val'])})" for r in rows], fontsize=8.5, color="#0b0b0b")
        ax.axvline(base, color="#52514e", linewidth=1)
        mcn = next(sc["mc"] for sc in res["scenarios"] if sc["name"] == name)
        ax.set_title(f"{name}\nheadline MC p50 INR {mcn['cogs_p50']:.2f} (p10-p90 {mcn['cogs_p10']:.2f}-{mcn['cogs_p90']:.2f}); bars = one-at-a-time swings around the all-modes base INR {base:.2f}", fontsize=10, color="#0b0b0b", loc="left")
        ax.axvline(mcn["cogs_p50"], color="#e34948", linewidth=1.2, linestyle=":")
        ax.set_xlabel("COGS, INR per connected minute", fontsize=9, color="#52514e")
        for sp in ("top", "right"): ax.spines[sp].set_visible(False)
        for sp in ("left", "bottom"): ax.spines[sp].set_color("#c9c8c3")
        ax.tick_params(colors="#52514e", labelsize=8.5); ax.grid(axis="x", color="#e7e6e2", linewidth=0.8); ax.set_axisbelow(True)
    from matplotlib.patches import Patch
    axes[1].legend(handles=[Patch(color="#2a78d6", label="input at its low value"), Patch(color="#eb6834", label="input at its high value")],
                   loc="lower right", fontsize=8.5, frameon=False)
    fig.text(0.01, 0.003, "Round-2 corrected 2026-10-17 (NVAIE, stepped tiers, 6-sol). Dotted red line = Monte Carlo p50 (the headline); solid grey = all-modes base.", fontsize=8, color="#52514e")
    fig.tight_layout(rect=(0, 0.01, 1, 1)); fig.savefig(os.path.join(HERE, "tornado.png"), dpi=130, facecolor="#fcfcfb"); plt.close(fig)

if __name__ == "__main__":
    main()
