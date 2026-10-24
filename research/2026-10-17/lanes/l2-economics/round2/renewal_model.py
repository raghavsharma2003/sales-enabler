"""Per-renewal unit economics for the VP beachhead (round 2, package r2-economics-renewal, critic item A4).

Chain, per due policy on an intermediary's renewal list, line by line (2W motor, 4W motor, health, life years 2+):

  due list -> (some renew before any call) -> called pool -> attempts (retries, ring time) -> answered ->
  right-party connects (RPC) -> minutes -> incremental renewals (AI vs human vs no calling) ->
  intermediary commission gained -> VP fee (per renewal collected / per incremental save / per minute) ->
  VP cost (managed COGS per connected minute from round-1 l2v, 1600 adder, unanswered attempts, WhatsApp
  utility messages, human escalation) -> VP gross margin; buyer net gain; holdout cost; measurability.

Every input is a range with a source tag in SOURCES below. Tags:
  [prim]  read from a primary source this session or in round 1 (URL in findings.md)
  [comp]  computed from a primary table (IRDAI Handbook 2024-25 extracts in data/)
  [sec]   secondary source
  [vend]  vendor claim
  [asm]   assumption (nobody observed it; the interviews must measure it)

Nothing here is a measurement of AI renewal performance: AI-vs-human outcome parity is an explicit assumption.

Run: python3 -I renewal_model.py   -> renewal-results.csv, renewal-pricing-grid.csv, renewal-buyers.csv,
                                      renewal-mde.csv, renewal-model.json, charts/*.png
"""
import csv
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
N = 20000
SEED = 20261017
RNG = np.random.default_rng(SEED)
HOLDOUT = 0.10            # share of the due list held out (not AI-called) to measure lift [design choice]
DISCOUNT = 0.12           # annual discount rate for the 3-year commission LTV [asm]
WA_PRICE = 0.115          # INR per WhatsApp utility template, India, effective 2026-10-01 [prim: Meta INR rate card, l1/l3v]
Z = 1.959964 + 0.841621   # two-sided 5% test, 80% power


def tri(lo, mode, hi, n=N):
    return RNG.triangular(lo, mode, hi, n)


def logn(p10, p90, n=N):
    mu = (math.log(p10) + math.log(p90)) / 2
    sigma = (math.log(p90) - math.log(p10)) / (2 * 1.2815515655446004)
    return RNG.lognormal(mu, sigma, n)


def pct(a, q):
    return float(np.percentile(a, q))


# ----------------------------------------------------------------------------------------------------------
# Inputs. (low, mode, high) triangular unless stated.
# ----------------------------------------------------------------------------------------------------------
LINES = {
    "2W_motor": dict(
        P=(714, 1500, 3000),          # premium per renewal, INR. TP 75-150cc INR 714 (MoRTH 2022 tariff via press) [sec]; OD on top [asm]
        c=(0.08, 0.15, 0.25),         # blended commission+reward share of premium [asm anchored on comp: motor-heavy private
                                      # insurers' net commission / NPE FY25 = 23-28%, Handbook T50; TP-heavy 2W lower]
        b0=(0.30, 0.45, 0.60),        # renews through this intermediary with no calling (SMS/WhatsApp only) [asm; signals:
                                      # 16.54 of 30.48 crore vehicles uninsured (MoF LS reply 2023, cited by SC 2026-08-04) [sec]]
        s_pre=(0.10, 0.25, 0.40),     # share of baseline renewers who renew before the first call [asm]
        covH=(0.10, 0.30, 0.60),      # share of the due list a human desk actually works [asm; ICICI Lombard blog: low 2W
                                      # renewal 'largely attributed to the limited distributor interest' (small ticket) [vend]]
        persH=(0.10, 0.25, 0.40),     # P(renews via us | reached by a human, would otherwise lapse) [asm; anchor: two-way
                                      # bank call LATE +34.4pp on timely repayment, Laudenbach et al. JF 2025, l4cv [prim]]
        m_rpc=(1.0, 1.6, 2.5),        # minutes per right-party conversation incl. callbacks [asm; Callyzer avg connected
                                      # outgoing call 1.6 min [vend, large n]]
        r_future=(0.40, 0.55, 0.70),  # annual retention after a save, for the 3-year LTV [asm]
        trough=(0.70, 0.80, 0.90),    # trough-month due list / mean month [asm: festive-season vehicle sales]
    ),
    "4W_motor": dict(
        P=(5000, 11000, 25000),       # TP 2,094 / 3,416 / 7,897 by engine size (2022 tariff via press) [sec] + OD [asm]
        c=(0.10, 0.18, 0.28),         # [asm anchored on comp T50 23-28% for motor-heavy insurers, all lines and channels]
        b0=(0.45, 0.60, 0.75),        # [asm; re-quote market, dealer and online competition]
        s_pre=(0.10, 0.20, 0.35),
        covH=(0.50, 0.80, 1.00),
        persH=(0.10, 0.25, 0.40),
        m_rpc=(1.5, 2.5, 4.0),        # re-quote, NCB/IDV questions [asm]
        r_future=(0.50, 0.65, 0.80),
        trough=(0.70, 0.80, 0.90),
    ),
    "health": dict(
        P=(9000, 17000, 30000),       # [comp] T104 FY25 avg individual health premium: all 18,508; brokers 15,267; IMF 22,541; PoS 13,144
        c=(0.10, 0.15, 0.20),         # [comp] T50 FY25 net commission / NPE: Star 15.1%, Care 21.4%, Niva Bupa 21.8% (new+renewal blended)
        b0=(0.75, 0.84, 0.92),        # [asm anchored on prim: Policybazaar health persistency (NOP) FY23 79% -> FY26 87%,
                                      # R1 85%, R2 90%, with heavy servicing (PB Analyst Day 2026-05-11, AR FY26); Star 94-98% by GWP [sec]]
        s_pre=(0.15, 0.30, 0.45),
        covH=(0.50, 0.80, 1.00),
        persH=(0.08, 0.20, 0.35),
        m_rpc=(1.2, 2.0, 3.0),
        r_future=(0.80, 0.87, 0.92),  # [prim anchor: PB R2 90%, overall 87%]
        trough=(0.85, 0.92, 0.97),
    ),
    "life_yr2plus": dict(
        P=(15000, 30000, 75000),      # [asm anchored on comp T99 FY25 NB premium/policy incl. single premium: agents 41,955; brokers 59,484]
        c=(0.03, 0.05, 0.075),        # renewal commission [asm: pre-2023 caps 7.5% yrs 2-3, 5% yr 4+ (2016 regs, not re-read);
                                      # EoM 2024 renewal allowance 17.5% savings / 25% pure risk is an overall expense cap [prim]]
        b0=(0.70, 0.80, 0.90),        # [comp/prim anchors: 13th-month persistency private median 77% (T28); PB 88% (AR FY26)]
        s_pre=(0.15, 0.30, 0.45),
        covH=(0.50, 0.80, 1.00),
        persH=(0.08, 0.20, 0.35),
        m_rpc=(1.5, 2.5, 3.5),
        r_future=(0.85, 0.90, 0.95),
        trough=(0.55, 0.70, 0.85),    # [asm: January-March new-business concentration repeats in renewal dues]
    ),
}

COMMON = dict(
    p_ans=(0.30, 0.42, 0.55),       # P(answered) per attempt [vend anchor: Callyzer 46-48% connect rate, all telecalling]
    q_rpc=(0.75, 0.88, 0.95),       # P(right party | answered) [asm]
    r_max=(0.75, 0.88, 0.95),       # share of the list reachable at all in the window (valid, active number) [asm]
    f1600=(0.70, 0.90, 1.05),       # AI on a 1600xx number vs the status-quo caller ID, pickup multiplier [asm; unmeasured]
    parity=(0.50, 0.80, 1.05),      # AI persuasion / human persuasion [asm; NBER w33669: AI collectors -9 to -12pp NPV, l5v]
    m_nr=(0.2, 0.4, 0.8),           # minutes on an answered wrong-party / not-now call [asm]
    short=(0.4, 0.6, 0.8),          # RPC minutes for a customer who was going to renew anyway, relative to m_rpc [asm]
    wa=(1.0, 2.0, 3.0),             # WhatsApp utility messages per due policy (reminder + payment link) [asm]
    c_att=(0.0, 0.03, 0.15),        # INR per unanswered attempt (gateway time while ringing; CPaaS bills answered calls) [asm]
    esc=(0.05, 0.12, 0.25),         # share of RPCs escalated to a human [asm]
    m_esc=(2.0, 3.5, 6.0),          # human minutes per escalation [asm]
    h=(5.5, 6.3, 9.0),              # INR per connected human minute, VP escalation seat [l2v corrected: 6-9, 6.3 at 200 talk-min/day]
    h_desk=(6.0, 7.5, 11.0),        # INR per connected minute for the buyer's renewal desk: l2 8.86 at 150 talk-min/day, l2v 6.3
                                    # at 200; renewal desks also quote on insurer portals and chase payments [asm on l2/l2v range]
    m_follow=(1.0, 2.0, 4.0),       # extra connected minutes per saved customer (payment chase, quote follow-up) [asm]
    seat_cost=(20000, 28000, 40000),  # INR/month fully loaded renewal-desk seat [l3 LOADED, built on l2 Apna median 17k, n=1,234]
    due_per_seat=(800, 1500, 3000),   # due renewals one seat works per month incl. dialling, quotes, payment chase [asm; ASK]
    add1600=(0.0, 0.10, 0.40),      # INR/min adder for 1600-series carriage over the l2 telephony line [asm; quotes pending (A1/B8)]
)
COGS = {  # managed Azure COGS per connected minute, all-in (telephony, ASR, LLM, TTS, infra, fixed platform, support)
    "launch_100k": (5.00, 6.96),    # [l2v] MC p10 / p90 at 100k aggregate min/month (p50 5.88); lognormal fitted to p10/p90
    "scale_1M": (2.67, 3.51),       # [l2] MC p10 / p90 at 1M min/month, scenario B (p50 3.06)
}
K_AI_CHOICES, K_AI_P = [3, 4, 5, 6], [0.2, 0.4, 0.25, 0.15]   # attempts per contact for the AI [design range]
K_H_CHOICES, K_H_P = [1, 2, 3], [0.3, 0.5, 0.2]               # human attempts per worked contact [asm]

FEE_GRID = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 300]
SAVE_GRID = [100, 150, 200, 300, 400, 500, 750, 1000, 1500]
YIELDS = [6.0, 8.0]                 # SYNTHESIS price: INR 6-8 per AI-connected minute effective yield

BUYERS = {  # due renewals per month and line mix. All [asm]: the interviews must measure these.
    "small_IMF_or_agency": dict(due=150, mix={"2W_motor": 0.5, "4W_motor": 0.2, "health": 0.2, "life_yr2plus": 0.1}),
    "mid_retail_broker_or_CA": dict(due=1500, mix={"2W_motor": 0.4, "4W_motor": 0.3, "health": 0.25, "life_yr2plus": 0.05}),
    "large_PoSP_platform": dict(due=25000, mix={"2W_motor": 0.5, "4W_motor": 0.3, "health": 0.15, "life_yr2plus": 0.05}),
}
HUMAN_MIN_PER_SEAT_MONTH = 200 * 24  # l2v basis: ~200 talk-min/day x 24 days (used only for the KC1 desk-size bridge)


def draw_common():
    d = {k: tri(*v) for k, v in COMMON.items()}
    d["K_AI"] = RNG.choice(K_AI_CHOICES, N, p=K_AI_P)
    d["K_H"] = RNG.choice(K_H_CHOICES, N, p=K_H_P)
    for k, (p10, p90) in COGS.items():
        d["cogs_" + k] = logn(p10, p90)
    return d


def reach(r_max, a, K):
    """Reach and attempts with up to K attempts, per-attempt RPC probability a among reachable contacts."""
    hit = 1 - (1 - a) ** K
    e_att_reach = hit / a
    return r_max * hit, r_max * e_att_reach + (1 - r_max) * K, e_att_reach


def simulate_line(name, L, C):
    x = {k: tri(*v) for k, v in L.items()}
    W = 1 - x["b0"]
    called = 1 - x["b0"] * x["s_pre"]                       # share of due list still unrenewed at first call
    share_wl = W / called
    m_mix = share_wl * x["m_rpc"] + (1 - share_wl) * x["m_rpc"] * C["short"]

    # AI arm
    p_ai = np.clip(C["p_ans"] * C["f1600"], 0.01, 0.95)
    a_ai = p_ai * C["q_rpc"]
    reach_ai, att_ai, eatt_r_ai = reach(C["r_max"], a_ai, C["K_AI"])
    answered_ai = C["r_max"] * p_ai * eatt_r_ai
    nonrpc_ai = answered_ai - reach_ai
    unans_ai = att_ai - answered_ai
    pers_ai = np.clip(x["persH"] * C["parity"], 0, 1)
    d_ai = W * reach_ai * pers_ai                          # incremental renewals per due policy vs no calling
    min_ai = called * (reach_ai * m_mix + nonrpc_ai * C["m_nr"]) + d_ai * C["m_follow"]   # AI-connected minutes per worked due policy
    rpc_ai = called * reach_ai

    # Human arm (status quo desk)
    a_h = C["p_ans"] * C["q_rpc"]
    reach_h, att_h, eatt_r_h = reach(C["r_max"], a_h, C["K_H"])
    answered_h = C["r_max"] * C["p_ans"] * eatt_r_h
    d_h = W * x["covH"] * reach_h * x["persH"]
    min_h = called * x["covH"] * (reach_h * m_mix + (answered_h - reach_h) * C["m_nr"]) + d_h * C["m_follow"]
    human_cost = min_h * C["h_desk"]                       # method T: talk-minute loading (low bound)
    human_cost_S = x["covH"] * C["seat_cost"] / C["due_per_seat"]   # method S: seat capacity (high bound)

    v = x["c"] * x["P"]                                     # intermediary commission per incremental save, this year
    g = x["r_future"] / (1 + DISCOUNT)
    v_ltv = v * (1 + g + g * g)                             # 3-year commission value of a save

    out = dict(W=W, called=called, reach_ai=reach_ai, reach_h=reach_h, att_ai=called * att_ai, att_h=called * x["covH"] * att_h,
               d_ai=d_ai, d_h=d_h, min_ai=min_ai, min_h=min_h, human_cost=human_cost, v=v, v_ltv=v_ltv,
               renew_ai=x["b0"] + d_ai, renew_h=x["b0"] + d_h, b0=x["b0"], trough=x["trough"], P=x["P"], c=x["c"])
    for stage in COGS:
        cost = (min_ai * (C["cogs_" + stage] + C["add1600"])
                + called * unans_ai * C["c_att"]
                + C["wa"] * WA_PRICE
                + rpc_ai * C["esc"] * C["m_esc"] * C["h"])
        out["cost_" + stage] = cost                         # VP cost per worked due policy
        out["cost_per_renewal_" + stage] = cost / (x["b0"] + d_ai)
        out["cost_per_save_" + stage] = cost / np.maximum(d_ai, 1e-6)
        for gm in (0.4, 0.5):
            out[f"fc_floor_gm{int(gm*100)}_{stage}"] = cost / ((1 - gm) * (x["b0"] + d_ai))
            out[f"fs_floor_gm{int(gm*100)}_{stage}"] = cost / ((1 - gm) * np.maximum(d_ai, 1e-6))
    out["fc_max_nocall"] = d_ai * v / (x["b0"] + d_ai)
    out["fc_max_vs_human"] = ((d_ai - d_h) * v + human_cost) / (x["b0"] + d_ai)
    out["fc_max_vs_human_S"] = ((d_ai - d_h) * v + human_cost_S) / (x["b0"] + d_ai)
    out["human_cost_S"] = human_cost_S
    out["human_cost_per_renewal_S"] = human_cost_S / (x["b0"] + d_h)
    out["fc_max_nocall_ltv"] = d_ai * v_ltv / (x["b0"] + d_ai)
    out["min_per_renewal"] = min_ai / (x["b0"] + d_ai)
    out["human_cost_per_renewal"] = human_cost / (x["b0"] + d_h)
    out["holdout_cost"] = HOLDOUT * d_ai * v                # buyer's forgone commission per due policy (proof cost)
    out["_inputs"] = {**{k: x[k] for k in x if k != "trough"},
                      **{k: C[k] for k in ("p_ans", "q_rpc", "r_max", "f1600", "parity", "m_nr", "short", "wa", "c_att",
                                           "esc", "m_esc", "h", "h_desk", "m_follow", "add1600", "cogs_launch_100k",
                                           "seat_cost", "due_per_seat")},
                      "K_AI": C["K_AI"].astype(float), "K_H": C["K_H"].astype(float)}
    return out


def rank(a):
    r = np.empty(len(a))
    r[np.argsort(a, kind="mergesort")] = np.arange(len(a))
    return r


def spearman(a, b):
    ra, rb = rank(a), rank(b)
    return float(np.corrcoef(ra, rb)[0, 1])


def summarize(a):
    return dict(p10=pct(a, 10), p50=pct(a, 50), p90=pct(a, 90), mean=float(np.mean(a)))


def main():
    C = draw_common()
    sims = {name: simulate_line(name, L, C) for name, L in LINES.items()}
    os.makedirs(os.path.join(HERE, "charts"), exist_ok=True)

    # 1. per-line distributions (per 1,000 due policies where marked)
    metrics = [
        ("value_per_save_inr", "v", 1), ("value_per_save_3yr_ltv_inr", "v_ltv", 1),
        ("baseline_renewal_rate", "b0", 1), ("incremental_renewals_ai_per_1000_due", "d_ai", 1000),
        ("incremental_renewals_human_per_1000_due", "d_h", 1000), ("ai_reach_rpc", "reach_ai", 1),
        ("ai_attempts_per_1000_due", "att_ai", 1000), ("ai_connected_minutes_per_1000_due", "min_ai", 1000),
        ("human_minutes_per_1000_due", "min_h", 1000), ("human_cost_inr_per_1000_due", "human_cost", 1000),
        ("human_cost_inr_per_renewal_collected", "human_cost_per_renewal", 1),
        ("human_cost_inr_per_1000_due_seat_method", "human_cost_S", 1000),
        ("human_cost_inr_per_renewal_collected_seat_method", "human_cost_per_renewal_S", 1),
        ("ai_minutes_per_renewal_collected", "min_per_renewal", 1),
        ("vp_cost_inr_per_1000_worked_due_launch", "cost_launch_100k", 1000),
        ("vp_cost_inr_per_1000_worked_due_scale", "cost_scale_1M", 1000),
        ("vp_cost_inr_per_renewal_collected_launch", "cost_per_renewal_launch_100k", 1),
        ("vp_cost_inr_per_renewal_collected_scale", "cost_per_renewal_scale_1M", 1),
        ("vp_cost_inr_per_incremental_save_launch", "cost_per_save_launch_100k", 1),
        ("vp_cost_inr_per_incremental_save_scale", "cost_per_save_scale_1M", 1),
        ("buyer_max_fee_per_renewal_vs_nocall", "fc_max_nocall", 1),
        ("buyer_max_fee_per_renewal_vs_nocall_3yr_ltv", "fc_max_nocall_ltv", 1),
        ("buyer_max_fee_per_renewal_vs_human_desk", "fc_max_vs_human", 1),
        ("buyer_max_fee_per_renewal_vs_human_desk_seat_method", "fc_max_vs_human_S", 1),
        ("vp_min_fee_per_renewal_gm40_launch", "fc_floor_gm40_launch_100k", 1),
        ("vp_min_fee_per_renewal_gm50_scale", "fc_floor_gm50_scale_1M", 1),
        ("vp_min_fee_per_save_gm40_launch", "fs_floor_gm40_launch_100k", 1),
        ("vp_min_fee_per_save_gm50_scale", "fs_floor_gm50_scale_1M", 1),
        ("holdout_cost_inr_per_1000_due", "holdout_cost", 1000),
    ]
    rows = []
    for name, s in sims.items():
        for label, key, mult in metrics:
            st = summarize(s[key] * mult)
            rows.append(dict(line=name, metric=label, **{k: round(v, 4) for k, v in st.items()}))
        # probabilities that a pricing window exists at all
        for label, cond in [
            ("P(value_per_save >= 150)", s["v"] >= 150),
            ("P(window per-renewal fee exists vs no-call, launch GM40)", s["fc_floor_gm40_launch_100k"] <= s["fc_max_nocall"]),
            ("P(window per-renewal fee exists vs no-call, scale GM50)", s["fc_floor_gm50_scale_1M"] <= s["fc_max_nocall"]),
            ("P(window per-renewal fee exists vs human desk, launch GM40)", s["fc_floor_gm40_launch_100k"] <= s["fc_max_vs_human"]),
            ("P(window per-renewal fee exists vs human desk, scale GM50)", s["fc_floor_gm50_scale_1M"] <= s["fc_max_vs_human"]),
            ("P(AI incremental > human incremental)", s["d_ai"] > s["d_h"]),
            ("P(VP cost per worked due < human cost per due)", s["cost_launch_100k"] < s["human_cost"]),
            ("P(VP cost per worked due < human cost per due), scale", s["cost_scale_1M"] < s["human_cost"]),
            ("P(VP cost per worked due < human cost per due, seat method), launch", s["cost_launch_100k"] < s["human_cost_S"]),
        ]:
            rows.append(dict(line=name, metric=label, p10="", p50="", p90="", mean=round(float(np.mean(cond)), 4)))
    with open(os.path.join(HERE, "renewal-results.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["line", "metric", "p10", "p50", "p90", "mean"])
        w.writeheader()
        w.writerows(rows)

    # 2. pricing grid: per-renewal fee, per-save fee, per-minute yield
    grid = []
    for name, s in sims.items():
        ren = (1 - HOLDOUT) * s["renew_ai"]
        save = (1 - HOLDOUT) * s["d_ai"]
        mins = (1 - HOLDOUT) * s["min_ai"]
        gain_nc = (1 - HOLDOUT) * s["d_ai"] * s["v"]
        gain_h = (1 - HOLDOUT) * ((s["d_ai"] - s["d_h"]) * s["v"] + s["human_cost"])
        gain_hS = (1 - HOLDOUT) * ((s["d_ai"] - s["d_h"]) * s["v"] + s["human_cost_S"])
        schemes = [("per_renewal_collected", f, f * ren) for f in FEE_GRID]
        schemes += [("per_incremental_save", f, f * save) for f in SAVE_GRID]
        schemes += [("per_ai_minute_yield", y, y * mins) for y in YIELDS]
        for scheme, fee, rev in schemes:
            r = dict(line=name, scheme=scheme, fee_inr=fee,
                     vp_revenue_per_1000_due_p50=round(pct(rev * 1000, 50)),
                     buyer_net_vs_nocall_per_1000_due_p50=round(pct((gain_nc - rev) * 1000, 50)),
                     p_buyer_gains_vs_nocall=round(float(np.mean(gain_nc > rev)), 3),
                     p_buyer_gains_vs_human_desk=round(float(np.mean(gain_h > rev)), 3),
                     p_buyer_gains_vs_human_desk_seat_method=round(float(np.mean(gain_hS > rev)), 3),
                     fee_as_share_of_commission_gain_p50=round(pct(rev / np.maximum(gain_nc, 1e-6), 50), 3),
                     yield_inr_per_ai_minute_p50=round(pct(rev / np.maximum(mins, 1e-9), 50), 2))
            for stage in COGS:
                cost = (1 - HOLDOUT) * s["cost_" + stage]
                gm = (rev - cost) / np.maximum(rev, 1e-9)
                r[f"vp_gm_p50_{stage}"] = round(pct(gm, 50), 3)
                r[f"p_gm_ge_40_{stage}"] = round(float(np.mean(gm >= 0.4)), 3)
            grid.append(r)
    with open(os.path.join(HERE, "renewal-pricing-grid.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(grid[0].keys()))
        w.writeheader()
        w.writerows(grid)

    # 3. recommended concept-test price per line (rule stated in findings.md)
    rec = {}
    for name, s in sims.items():
        cands = [g for g in grid if g["line"] == name and g["scheme"] == "per_renewal_collected"]
        status_quo_human = name != "2W_motor"
        ok = [g for g in cands if g["p_buyer_gains_vs_nocall"] >= 0.8 and (not status_quo_human or g["p_buyer_gains_vs_human_desk"] >= 0.6)]
        best = max(ok, key=lambda g: g["fee_inr"]) if ok else None
        rec[name] = dict(recommended_fee_per_renewal=best["fee_inr"] if best else None, row=best)

    # 4. holdout measurability: minimum detectable lift (pp) by monthly worked volume
    mde_rows = []
    for name, L in LINES.items():
        b = L["b0"][1]
        d_med = pct(sims[name]["d_ai"], 50)
        for due in (150, 500, 1500, 5000, 25000):
            for hh in (0.10, 0.20):
                se = math.sqrt(b * (1 - b) * (1 / (due * (1 - hh)) + 1 / (due * hh)))
                mde = Z * se
                months = (Z * math.sqrt(b * (1 - b) * (1 / (1 - hh) + 1 / hh)) / d_med) ** 2 / due
                mde_rows.append(dict(line=name, due_per_month=due, holdout=hh, baseline=b,
                                     mde_pp_one_month=round(100 * mde, 2), median_modelled_lift_pp=round(100 * d_med, 2),
                                     months_to_detect_median_lift=round(months, 1)))
    with open(os.path.join(HERE, "renewal-mde.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(mde_rows[0].keys()))
        w.writeheader()
        w.writerows(mde_rows)

    # 5. buyer archetypes per month at the recommended fees, trough month, and KC1 bridge
    buyers = []
    for bname, B in BUYERS.items():
        rev = np.zeros(N); gain = np.zeros(N); cost_l = np.zeros(N); cost_s = np.zeros(N); hum_min = np.zeros(N)
        rev_trough = np.zeros(N); seats_S = np.zeros(N)
        for line, share in B["mix"].items():
            s = sims[line]; due = B["due"] * share
            fee = rec[line]["recommended_fee_per_renewal"] or 0
            r_line = fee * (1 - HOLDOUT) * s["renew_ai"] * due
            rev += r_line
            rev_trough += r_line * s["trough"]
            gain += (1 - HOLDOUT) * s["d_ai"] * s["v"] * due
            cost_l += (1 - HOLDOUT) * s["cost_launch_100k"] * due
            cost_s += (1 - HOLDOUT) * s["cost_scale_1M"] * due
            hum_min += s["min_h"] * due
            seats_S += s["_inputs"]["covH"] * due / C["due_per_seat"]
        buyers.append(dict(buyer=bname, due_per_month=B["due"], mix=json.dumps(B["mix"]),
                           vp_revenue_month_p50=round(pct(rev, 50)), vp_revenue_trough_month_p50=round(pct(rev_trough, 50)),
                           buyer_commission_gain_month_p50=round(pct(gain, 50)),
                           buyer_commission_gain_month_p10=round(pct(gain, 10)),
                           vp_gm_launch_p50=round(pct((rev - cost_l) / np.maximum(rev, 1e-9), 50), 3),
                           vp_gm_scale_p50=round(pct((rev - cost_s) / np.maximum(rev, 1e-9), 50), 3),
                           human_desk_seats_equivalent_p50=round(pct(hum_min / HUMAN_MIN_PER_SEAT_MONTH, 50), 2),
                           human_desk_seats_seat_method_p50=round(pct(seats_S, 50), 2),
                           supports_min_25k_in_trough=bool(pct(rev_trough, 50) >= 25000),
                           max_min_fee_at_50pct_of_gain_p50=round(pct(0.5 * gain, 50))))
    with open(os.path.join(HERE, "renewal-buyers.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(buyers[0].keys()))
        w.writeheader()
        w.writerows(buyers)

    # KC1 bridge: due list per month that a 3-seat human renewal desk works
    kc1 = {}
    for name, s in sims.items():
        per_due = s["min_h"]  # human talk minutes per due policy (coverage covH already included)
        cov = s["_inputs"]["covH"]
        kc1[name] = dict(talk_method=round(pct(3 * HUMAN_MIN_PER_SEAT_MONTH / np.maximum(per_due, 1e-6), 50)),
                         seat_method=round(pct(3 * C["due_per_seat"] / cov, 50)))

    # 6. sensitivity: Spearman rank correlation of each input with the buyer's net gain vs its own desk and VP launch GM,
    #    both at the recommended per-renewal fee
    sens = []
    for name, s in sims.items():
        fee = rec[name]["recommended_fee_per_renewal"] or 0
        rev = fee * s["renew_ai"]
        net_h = (s["d_ai"] - s["d_h"]) * s["v"] + s["human_cost"] - rev
        net_nc = s["d_ai"] * s["v"] - rev
        gm = (rev - s["cost_launch_100k"]) / np.maximum(rev, 1e-9)
        for k, arr in s["_inputs"].items():
            sens.append(dict(line=name, input=k, rho_buyer_net_vs_desk=round(spearman(arr, net_h), 3),
                             rho_buyer_net_vs_nocall=round(spearman(arr, net_nc), 3),
                             rho_vp_gm_launch=round(spearman(arr, gm), 3)))
    with open(os.path.join(HERE, "renewal-sensitivity.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(sens[0].keys()))
        w.writeheader()
        w.writerows(sens)

    json.dump(dict(seed=SEED, n=N, holdout=HOLDOUT, inputs=dict(lines=LINES, common=COMMON, cogs_p10_p90=COGS,
                                                               k_ai=[K_AI_CHOICES, K_AI_P], k_h=[K_H_CHOICES, K_H_P]),
                   recommended=rec, kc1_due_per_month_for_3_seat_desk=kc1, kc3_breakeven_baseline_mode_case=kc3_breakeven()),
              open(os.path.join(HERE, "renewal-model.json"), "w"), indent=1, default=float)
    charts(sims)
    print(json.dumps({k: v["recommended_fee_per_renewal"] for k, v in rec.items()}))
    print("KC3 break-even baseline renewal rate (mode case):", kc3_breakeven())
    print("KC1 bridge (due/month for 3 seats):", kc1)


def mode_chain(L, b0=None, fee=None, cogs=5.88):
    """Deterministic chain at mode values (same algebra as simulate_line); used for break-even searches."""
    C = {k: v[1] for k, v in COMMON.items()}
    x = {k: v[1] for k, v in L.items()}
    if b0 is not None:
        x["b0"] = b0
    W = 1 - x["b0"]; called = 1 - x["b0"] * x["s_pre"]; share_wl = W / called
    m_mix = share_wl * x["m_rpc"] + (1 - share_wl) * x["m_rpc"] * C["short"]
    p_ai = min(max(C["p_ans"] * C["f1600"], 0.01), 0.95); a = p_ai * C["q_rpc"]; K = 4
    hit = 1 - (1 - a) ** K; reach_ai = C["r_max"] * hit; e_att = hit / a
    att = C["r_max"] * e_att + (1 - C["r_max"]) * K; answered = C["r_max"] * p_ai * e_att
    d_ai = W * reach_ai * min(1, x["persH"] * C["parity"])
    min_ai = called * (reach_ai * m_mix + (answered - reach_ai) * C["m_nr"]) + d_ai * C["m_follow"]
    cost = (min_ai * (cogs + C["add1600"]) + called * (att - answered) * C["c_att"] + C["wa"] * WA_PRICE
            + called * reach_ai * C["esc"] * C["m_esc"] * C["h"])
    v = x["c"] * x["P"]
    return dict(fc_max_nocall=d_ai * v / (x["b0"] + d_ai), fc_floor_gm40=cost / (0.6 * (x["b0"] + d_ai)))


def kc3_breakeven():
    """Baseline renewal rate (no calling) above which the buyer's max per-renewal fee vs no calling falls below VP's
    40%-GM floor at launch COGS, mode case. Kill criterion 3 restated in model terms."""
    out = {}
    for name, L in LINES.items():
        lo, hi = 0.30, 0.995
        if mode_chain(L, b0=hi)["fc_max_nocall"] >= mode_chain(L, b0=hi)["fc_floor_gm40"]:
            out[name] = ">0.995"
            continue
        for _ in range(60):
            mid = (lo + hi) / 2
            r = mode_chain(L, b0=mid)
            if r["fc_max_nocall"] >= r["fc_floor_gm40"]:
                lo = mid
            else:
                hi = mid
        out[name] = round(lo, 3)
    return out


def charts(sims):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    S1, S2, S3, S4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
    names = list(LINES.keys())
    labels = {"2W_motor": "2W motor", "4W_motor": "4W motor", "health": "Health", "life_yr2plus": "Life, years 2+"}
    plt.rcParams.update({"font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2, "xtick.color": INK2,
                         "ytick.color": INK2, "axes.facecolor": SURF, "figure.facecolor": SURF, "text.color": INK})

    def rng_rows(ax, series, color, offset, label):
        for i, n in enumerate(names):
            a = series[n]
            lo, mid, hi = pct(a, 10), pct(a, 50), pct(a, 90)
            y = i + offset
            ax.plot([lo, hi], [y, y], color=color, lw=2, solid_capstyle="round")
            ax.plot([mid], [y], "o", color=color, ms=8, mec=SURF, mew=2)
        ax.plot([], [], "o-", color=color, lw=2, ms=8, label=label)

    # Chart 1: value per incremental save, this-year and 3-year LTV, with the INR 150 floor
    fig, ax = plt.subplots(figsize=(8, 4.2))
    rng_rows(ax, {n: sims[n]["v"] for n in names}, S1, -0.12, "This year's commission")
    rng_rows(ax, {n: sims[n]["v_ltv"] for n in names}, S2, 0.12, "3-year commission value")
    ax.axvline(150, color=INK2, lw=1, ls="--")
    ax.text(158, 0.55, "INR 150 floor\n(kill criterion 2)", color=INK2, fontsize=9, va="center")
    ax.set_xscale("log")
    ax.set_yticks(range(len(names)), [labels[n] for n in names])
    ax.invert_yaxis()
    ax.set_xlabel("INR per incremental renewal saved (log scale); dot = p50, bar = p10-p90")
    ax.set_title("What one saved renewal is worth to the intermediary", loc="left", fontsize=12, color=INK)
    ax.grid(axis="x", color=GRID, lw=0.6)
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=2, fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "charts", "value-per-save.png"), dpi=160)
    plt.close(fig)

    # Chart 2: the pricing window per renewal collected
    fig, ax = plt.subplots(figsize=(8.5, 4.2))
    rng_rows(ax, {n: sims[n]["fc_max_nocall"] for n in names}, S1, -0.2, "Buyer's max fee vs no calling")
    rng_rows(ax, {n: sims[n]["fc_max_vs_human"] for n in names}, S3, -0.07, "Buyer's max fee vs own human desk")
    rng_rows(ax, {n: sims[n]["fc_floor_gm40_launch_100k"] for n in names}, S2, 0.07, "VP min fee, 40% GM at launch COGS")
    rng_rows(ax, {n: sims[n]["fc_floor_gm50_scale_1M"] for n in names}, S4, 0.2, "VP min fee, 50% GM at 1M min/month")
    ax.set_xscale("log")
    ax.set_yticks(range(len(names)), [labels[n] for n in names])
    ax.invert_yaxis()
    ax.set_xlabel("INR per renewal collected on the AI-worked list (log scale); dot = p50, bar = p10-p90")
    ax.set_title("Per-renewal pricing works where the blue/green bars sit right of the orange/yellow", loc="left", fontsize=11, color=INK)
    ax.grid(axis="x", color=GRID, lw=0.6)
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=2, fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "charts", "pricing-window.png"), dpi=160)
    plt.close(fig)

    # Chart 3: VP cost vs human cost per 1,000 due
    fig, ax = plt.subplots(figsize=(8.5, 4.4))
    rng_rows(ax, {n: sims[n]["human_cost"] * 1000 for n in names}, S3, -0.2, "Own desk, talk-minute costing (low bound)")
    rng_rows(ax, {n: sims[n]["human_cost_S"] * 1000 for n in names}, S1, -0.07, "Own desk, seat-capacity costing (high bound)")
    rng_rows(ax, {n: sims[n]["cost_launch_100k"] * 1000 for n in names}, S2, 0.07, "VP cost, launch COGS (100k min/month)")
    rng_rows(ax, {n: sims[n]["cost_scale_1M"] * 1000 for n in names}, S4, 0.2, "VP cost, 1M min/month COGS")
    ax.set_yticks(range(len(names)), [labels[n] for n in names])
    ax.invert_yaxis()
    ax.set_xlabel("INR per 1,000 due policies; dot = p50, bar = p10-p90")
    ax.set_title("Calling cost per 1,000 due renewals: AI vs desk depends on desk productivity", loc="left", fontsize=11, color=INK)
    ax.grid(axis="x", color=GRID, lw=0.6)
    ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=2, fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "charts", "cost-per-1000-due.png"), dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    main()
