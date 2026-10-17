"""VP lane l6-self-learning: power analysis for "agents that learn from every call" (H7). 2026-10-17.

Pure computation (no network, no paid calls). Re-run: python3 -I code/power.py  (from the lane directory).

Outputs (data/):
  power-n-per-arm.csv        calls per arm to detect p0 -> p1 (two-sided alpha 0.05, power 0.80), plus K-arm Bonferroni
  power-what-100-tells.csv   95% intervals and minimum detectable effects at n = 50/100/200/500/1000
  power-peeking-aa.csv       false-positive rate of an A/A test checked daily with a naive z-test (simulated)
  power-segment-volumes.csv  AI-handled connected calls per buyer per month (l3 sizing distributions) vs calls needed
Charts (charts/):
  power-mde-vs-n.png         minimum detectable absolute change vs calls per arm, by baseline rate
"""
import math, csv, json, os
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
LANE = os.path.dirname(HERE)
DATA = os.path.join(LANE, "data"); CH = os.path.join(LANE, "charts")
os.makedirs(DATA, exist_ok=True); os.makedirs(CH, exist_ok=True)
ALPHA, POWER = 0.05, 0.80
Z = lambda q: stats.norm.ppf(q)


def n_two_prop(p0, p1, alpha=ALPHA, power=POWER, two_sided=True):
    """Classic two-proportion z-test sample size per arm (pooled SE under H0, unpooled under H1; Fleiss without
    continuity correction). Same formula as statsmodels/G*Power 'difference between two independent proportions'."""
    za = Z(1 - alpha / 2) if two_sided else Z(1 - alpha)
    zb = Z(power)
    pbar = (p0 + p1) / 2
    num = (za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2
    return math.ceil(num / (p0 - p1) ** 2)


def n_cohen_h(p0, p1, alpha=ALPHA, power=POWER):
    h = abs(2 * math.asin(math.sqrt(p0)) - 2 * math.asin(math.sqrt(p1)))
    return math.ceil(((Z(1 - alpha / 2) + Z(power)) / h) ** 2)


def n_exact_sim(p0, p1, n, sims=4000, rng=None):
    """Simulated power of a two-sided two-proportion z test at n per arm (checks the closed form)."""
    rng = rng or np.random.default_rng(1)
    a = rng.binomial(n, p0, sims); b = rng.binomial(n, p1, sims)
    pa, pb = a / n, b / n; pp = (a + b) / (2 * n)
    se = np.sqrt(np.maximum(pp * (1 - pp) * 2 / n, 1e-12))
    return float(np.mean(np.abs(pa - pb) / se > Z(1 - ALPHA / 2)))


def wilson(x, n, conf=0.95):
    z = Z(1 - (1 - conf) / 2); p = x / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return c - h, c + h


def newcombe_diff(x1, n1, x2, n2, conf=0.95):
    """Newcombe (1998) method 10 hybrid-score interval for p1 - p2."""
    l1, u1 = wilson(x1, n1, conf); l2, u2 = wilson(x2, n2, conf)
    p1, p2 = x1 / n1, x2 / n2; d = p1 - p2
    lo = d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return lo, hi


def mde_abs(p0, n, alpha=ALPHA, power=POWER, direction=-1):
    """Smallest absolute change (in the given direction) detectable at n per arm. Bisection on n_two_prop."""
    lo, hi = 1e-5, (p0 - 1e-4) if direction < 0 else (1 - p0 - 1e-4)
    for _ in range(80):
        mid = (lo + hi) / 2
        if n_two_prop(p0, p0 + direction * mid, alpha, power) <= n:
            hi = mid
        else:
            lo = mid
    return hi


# -------------------------------------------------------------------------------------------------------------
# 1. Calls per arm for the brief's scenarios plus realistic relative lifts.
# Baselines: drop-off (early hang-up) and conversion scenarios from the brief; outcome shares of connects from
# lane l2 buyer_outcome_compare (ASSUMED there, not measured): lead qualification 0.20, EMI reminder 0.35,
# appointment reminder 0.70, COD confirmation 0.85.
# -------------------------------------------------------------------------------------------------------------
SCEN = [
    ("brief: drop-off 50->45 (-5 pts, -10% rel)", 0.50, 0.45),
    ("brief: drop-off 30->27 (-3 pts, -10% rel)", 0.30, 0.27),
    ("brief: conversion 10->8 (-2 pts, -20% rel)", 0.10, 0.08),
    ("drop-off 30->25 (-5 pts)", 0.30, 0.25),
    ("lead qualified 20->15 (-5 pts)", 0.20, 0.15),
    ("conversion 10->5 (-5 pts)", 0.10, 0.05),
    ("drop-off 50->40 (-10 pts)", 0.50, 0.40),
    ("drop-off 40->30 (-10 pts)", 0.40, 0.30),
    ("lead qualified 20->22 (+10% rel)", 0.20, 0.22),
    ("lead qualified 20->25 (+25% rel)", 0.20, 0.25),
    ("conversion 10->11 (+10% rel)", 0.10, 0.11),
    ("conversion 10->12 (+20% rel)", 0.10, 0.12),
    ("conversion 5->6 (+20% rel)", 0.05, 0.06),
    ("EMI promise-to-pay 35->38.5 (+10% rel)", 0.35, 0.385),
    ("appointment confirmed 70->75 (+5 pts)", 0.70, 0.75),
    ("COD confirmed 85->88 (+3 pts)", 0.85, 0.88),
]

rows = []
rng = np.random.default_rng(20261017)
for name, p0, p1 in SCEN:
    n = n_two_prop(p0, p1)
    r = dict(scenario=name, p0=p0, p1=p1, abs_change_pts=round(100 * (p1 - p0), 2),
             rel_change_pct=round(100 * (p1 - p0) / p0, 1),
             n_per_arm=n, n_total_2arm=2 * n, n_per_arm_cohen_h=n_cohen_h(p0, p1),
             sim_power_at_n=round(n_exact_sim(p0, p1, n, rng=rng), 3),
             n_per_arm_K3_bonf=n_two_prop(p0, p1, alpha=ALPHA / 2),   # 3 variants: 2 comparisons vs control
             n_per_arm_K5_bonf=n_two_prop(p0, p1, alpha=ALPHA / 4),   # 5 variants: 4 comparisons vs control
             n_per_arm_power90=n_two_prop(p0, p1, power=0.9),
             n_per_arm_one_sided=n_two_prop(p0, p1, two_sided=False))
    r["n_total_K5"] = 5 * r["n_per_arm_K5_bonf"]
    r["dialled_total_2arm_at_50pct_connect"] = math.ceil(r["n_total_2arm"] / 0.5)
    rows.append(r)
with open(os.path.join(DATA, "power-n-per-arm.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

# -------------------------------------------------------------------------------------------------------------
# 2. What n calls can and cannot tell you.
# -------------------------------------------------------------------------------------------------------------
tell = []
for n in (50, 100, 200, 500, 1000, 2000, 5000):
    for p in (0.05, 0.10, 0.20, 0.30, 0.50):
        x = round(p * n)
        lo, hi = wilson(x, n)
        cp_lo = stats.beta.ppf(0.025, x, n - x + 1) if x > 0 else 0.0
        cp_hi = stats.beta.ppf(0.975, x + 1, n - x) if x < n else 1.0
        # two arms of n each, same observed rate: interval on the difference
        dlo, dhi = newcombe_diff(x, n, x, n)
        down = mde_abs(p, n, direction=-1); up = mde_abs(p, n, direction=+1)
        pw5 = n_exact_sim(p, max(p - 0.05, 0.001), n, sims=4000, rng=rng) if p > 0.05 else float("nan")
        tell.append(dict(n_per_arm=n, rate=p, observed=x, wilson_lo=round(lo, 4), wilson_hi=round(hi, 4),
                         wilson_halfwidth_pts=round(100 * (hi - lo) / 2, 1),
                         clopper_pearson_lo=round(cp_lo, 4), clopper_pearson_hi=round(cp_hi, 4),
                         diff_ci_two_arms_lo_pts=round(100 * dlo, 1), diff_ci_two_arms_hi_pts=round(100 * dhi, 1),
                         mde_down_pts=round(100 * down, 1), mde_up_pts=round(100 * up, 1),
                         mde_down_rel_pct=round(100 * down / p, 0),
                         power_to_detect_minus5pts=round(pw5, 3)))
with open(os.path.join(DATA, "power-what-100-tells.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(tell[0].keys())); w.writeheader(); w.writerows(tell)

# -------------------------------------------------------------------------------------------------------------
# 3. Peeking: an A/A test (both arms identical) checked every day with a naive two-sided z test, stop at the first
# "significant" day. This is what a dashboard that "learns from every call" does if nobody fixes the horizon.
# -------------------------------------------------------------------------------------------------------------
peek = []
for calls_day in (100, 1000):
    for p in (0.10, 0.30):
        for days in (7, 30, 90):
            sims = 4000
            a = rng.binomial(calls_day // 2, p, (sims, days)).cumsum(1)
            b = rng.binomial(calls_day // 2, p, (sims, days)).cumsum(1)
            n = (np.arange(1, days + 1) * (calls_day // 2))[None, :]
            pp = (a + b) / (2 * n)
            se = np.sqrt(np.maximum(pp * (1 - pp) * 2 / n, 1e-12))
            zz = np.abs(a / n - b / n) / se
            fp_any = float(np.mean((zz > 1.96).any(1)))
            fp_end = float(np.mean(zz[:, -1] > 1.96))
            peek.append(dict(calls_per_day=calls_day, rate=p, days_checked_daily=days, sims=sims,
                             false_positive_if_stop_at_first_significant_day=round(fp_any, 3),
                             false_positive_fixed_horizon=round(fp_end, 3)))
with open(os.path.join(DATA, "power-peeking-aa.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(peek[0].keys())); w.writeheader(); w.writerows(peek)

# -------------------------------------------------------------------------------------------------------------
# 4. Per-buyer monthly volume, from lane l3 sizing.py distributions (seats per firm lognormal p10/p90, talk hours,
# days, automatable share) and lane l2 avg connected call length tri(1.0, 2.0, 3.5) min. Calls per buyer per month
# that an AI agent would handle = seats x talk_h x 60 x days x auto / avg_call_min.
# -------------------------------------------------------------------------------------------------------------
R = np.random.default_rng(20261017)
N = 20000
tri = lambda a, b, c: R.triangular(a, b, c, N)
def logn(p10, p90):
    mu = (math.log(p10) + math.log(p90)) / 2; s = (math.log(p90) - math.log(p10)) / (2 * 1.2815515655446004)
    return R.lognormal(mu, s, N)
SEG = {  # copied from l3-segments/sizing.py SEGMENTS (seats, auto) for the scorecard's top segments
    "insurance_renewals": dict(seats=(2, 80), auto=(0.3, 0.45, 0.6), outcome="renewal paid", p=0.35),
    "real_estate": dict(seats=(2, 50), auto=(0.25, 0.35, 0.5), outcome="site visit booked", p=0.20),
    "d2c_ecom_post_purchase": dict(seats=(0.5, 15), auto=(0.5, 0.65, 0.8), outcome="COD confirmed", p=0.85),
    "lending_collections": dict(seats=(5, 150), auto=(0.25, 0.4, 0.6), outcome="promise to pay", p=0.35),
    "fintech_saas_onboarding": dict(seats=(2, 80), auto=(0.3, 0.45, 0.6), outcome="KYC completed", p=0.20),
    "healthcare_hospitals_clinics": dict(seats=(1, 40), auto=(0.3, 0.45, 0.6), outcome="appointment kept", p=0.70),
    "edtech_admissions": dict(seats=(2, 40), auto=(0.25, 0.35, 0.5), outcome="counselling booked", p=0.20),
    "auto_dealers": dict(seats=(1, 20), auto=(0.3, 0.45, 0.6), outcome="service booked", p=0.30),
}
talk = tri(1.5, 2.5, 3.5); days = tri(22, 24, 26); call_min = tri(1.0, 2.0, 3.5)
vol = []
need_10rel = {}
for seg, s in SEG.items():
    seats = logn(*s["seats"]); auto = tri(*s["auto"])
    calls = seats * talk * 60 * days * auto / call_min
    p = s["p"]
    n10 = n_two_prop(p, min(p * 1.10, 0.999)) * 2           # +10% relative lift, 2 arms
    n20 = n_two_prop(p, min(p * 1.20, 0.999)) * 2           # +20% relative lift
    if p > 0.5:  # high-rate outcomes: a relative lift on the miss rate is the natural unit
        n10 = n_two_prop(p, 1 - (1 - p) * 0.90) * 2; n20 = n_two_prop(p, 1 - (1 - p) * 0.80) * 2
    n_drop = n_two_prop(0.40, 0.36) * 2                      # early hang-up 40% -> 36% (-10% rel)
    q = lambda a: float(np.percentile(calls, a))
    share_ge = lambda need: float(np.mean(calls >= need))
    vol.append(dict(segment=seg, outcome=s["outcome"], assumed_rate=p,
                    calls_per_buyer_month_p10=round(q(10)), calls_per_buyer_month_p25=round(q(25)),
                    calls_per_buyer_month_p50=round(q(50)), calls_per_buyer_month_p75=round(q(75)),
                    calls_per_buyer_month_p90=round(q(90)),
                    total_calls_for_10pct_rel_lift_2arm=n10, total_calls_for_20pct_rel_lift_2arm=n20,
                    total_calls_for_dropoff_40_to_36_2arm=n_drop,
                    months_at_p50_for_10pct_rel=round(n10 / q(50), 2), months_at_p50_for_20pct_rel=round(n20 / q(50), 2),
                    share_of_buyers_reaching_10pct_rel_in_1_month=round(share_ge(n10), 3),
                    share_of_buyers_reaching_20pct_rel_in_1_month=round(share_ge(n20), 3),
                    share_of_buyers_reaching_dropoff_test_in_1_month=round(share_ge(n_drop), 3),
                    # PILOT: ASSUMED 20% of steady-state automatable volume in the first month (one campaign/team)
                    pilot_calls_month_p50=round(0.2 * q(50)),
                    pilot_share_reaching_10pct_rel_in_1_month=round(float(np.mean(0.2 * calls >= n10)), 3),
                    pilot_share_reaching_20pct_rel_in_1_month=round(float(np.mean(0.2 * calls >= n20)), 3),
                    pilot_share_reaching_local_line_test_in_1_month=round(float(np.mean(0.2 * calls >= 1184)), 3)))
with open(os.path.join(DATA, "power-segment-volumes.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(vol[0].keys())); w.writeheader(); w.writerows(vol)

# -------------------------------------------------------------------------------------------------------------
# Chart: MDE (absolute, downward) vs calls per arm for baselines 10/30/50%.
# -------------------------------------------------------------------------------------------------------------
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
SER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
plt.rcParams.update({"font.size": 10, "axes.edgecolor": INK2, "axes.labelcolor": INK2, "xtick.color": INK2,
                     "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF})
fig, ax = plt.subplots(figsize=(8, 4.8), dpi=150)
ns = np.unique(np.round(np.logspace(np.log10(50), np.log10(20000), 60)).astype(int))
for i, p in enumerate((0.10, 0.30, 0.50)):
    m = [100 * mde_abs(p, int(n)) for n in ns]
    ax.plot(ns, m, color=SER[i], lw=2, label=f"baseline {int(p*100)}%")
    ax.annotate(f"{int(p*100)}%", (ns[-1], m[-1]), xytext=(4, 0), textcoords="offset points", color=INK2, va="center")
for n in (100, 1000, 10000):
    ax.axvline(n, color=GRID, lw=1, zorder=0)
    ax.text(n, ax.get_ylim()[1] if False else 21.5, f"{n:,}/arm", color=INK2, ha="center", fontsize=8)
ax.set_xscale("log"); ax.set_ylim(0, 22)
ax.set_xlabel("Calls per arm (log scale)"); ax.set_ylabel("Smallest detectable drop (percentage points)")
ax.set_title("What a two-arm test can detect (alpha 0.05 two-sided, power 0.80)", color=INK, loc="left")
ax.grid(axis="y", color=GRID, lw=0.6); ax.spines[["top", "right"]].set_visible(False)
ax.legend(frameon=False, loc="upper right", bbox_to_anchor=(1, 0.93))
fig.tight_layout(); fig.savefig(os.path.join(CH, "power-mde-vs-n.png")); plt.close(fig)

summary = dict(n_per_arm={r["scenario"]: r["n_per_arm"] for r in rows},
               n100={f"p={t['rate']}": (t["wilson_lo"], t["wilson_hi"], t["mde_down_pts"]) for t in tell if t["n_per_arm"] == 100},
               peeking=peek, volumes=vol)
with open(os.path.join(DATA, "power-summary.json"), "w") as f:
    json.dump(summary, f, indent=1)
print(json.dumps(summary["n_per_arm"], indent=1))
for t in tell:
    if t["n_per_arm"] in (100, 1000):
        print(t)
for p_ in peek: print(p_)
for v in vol: print(v)
