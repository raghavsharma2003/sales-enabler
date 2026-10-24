"""VP lane l6-self-learning: bandit script-learning simulation (H7). 2026-10-17. Pure computation, no network.

Run from the lane directory:  python3 code/sim.py [--quick]
Writes data/sim-*.csv and charts/sim-*.png.

Model. Each "call" is one connected call with a binary outcome (e.g. lead qualified, renewal paid, did NOT hang up
early). A tenant runs K script variants (e.g. K opening lines). Policies allocate each day's calls; posteriors are
updated once per day (batched), which is how a production system with nightly analysis behaves. Outcomes can arrive
D days late (conversion known later). True rates can change mid-run (seasonality, novelty).

Policies
  uniform  equal split (classic A/B/n), the reference
  eps      epsilon-greedy, 10% exploration spread uniformly, 90% to the empirical best
  ts       Thompson sampling, Beta(1,1) priors (batched: allocation share = P(arm is best))
  ttts     top-two Thompson sampling (Russo 2016), beta = 0.5: built to IDENTIFY the best arm, not only to earn
  dts      discounted TS (counts x gamma per day) for non-stationary rates
  swts     sliding-window TS (last W days only)
Every policy is scored with the same Bayesian read-out: P(arm is best) from Beta posteriors on the revealed data,
"declare a winner" when P(best) >= 0.95 at a daily check (P(best) by Gauss-Hermite quadrature on the normal
approximation of each Beta posterior, so the check itself adds no Monte Carlo noise) (the common dashboard rule), "current choice" = arm with
the highest posterior mean.
"""
import os, sys, json, math, time
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); LANE = os.path.dirname(HERE)
DATA = os.path.join(LANE, "data"); CH = os.path.join(LANE, "charts")
QUICK = "--quick" in sys.argv
R = 120 if QUICK else 400          # Monte Carlo runs per configuration
DRAWS = 300 if QUICK else 500      # posterior draws per day for P(best)
SEED = 20261017
THRESH = 0.95
from scipy.special import ndtr
_GH_X, _GH_W = np.polynomial.hermite.hermgauss(48)


def pbest_normal(mu, sd):
    """Deterministic P(arm k is best) for independent normal posteriors (..., K): a 1-D Gauss-Hermite integral per
    arm, so the daily 'declare at 0.95' check carries no Monte Carlo noise."""
    sd = np.maximum(sd, 1e-9)
    X = mu[..., :, None, None] + np.sqrt(2) * sd[..., :, None, None] * _GH_X      # (..., K, 1, Q)
    Zs = (X - mu[..., None, :, None]) / sd[..., None, :, None]                     # (..., K, K, Q)
    Ph = ndtr(Zs)
    K = mu.shape[-1]
    eye = np.eye(K, dtype=bool)[..., None]
    Ph = np.where(eye, 1.0, Ph)
    return (Ph.prod(-2) * _GH_W).sum(-1) / np.sqrt(np.pi)


def pbest_beta(a, b):
    """P(best) for Beta(a, b) posteriors via the normal approximation (mean, variance of the Beta)."""
    m = a / (a + b); v = a * b / ((a + b) ** 2 * (a + b + 1))
    return pbest_normal(m, np.sqrt(v))


def pbest_from_draws(s):
    """s: (R, K, D) posterior draws -> (R, K) share of draws in which each arm is the leader."""
    w = s.argmax(1)
    K = s.shape[1]
    return np.stack([(w == k).mean(1) for k in range(K)], 1)


def ttts_alloc(s, beta=0.5):
    """Top-two TS allocation from draws: leader of draw d gets beta; the challenger (leader of a second draw with
    the first leader excluded) gets 1 - beta."""
    Rr, K, D = s.shape
    lead = s.argmax(1)                                     # (R, D)
    s2 = np.roll(s, 1, axis=2).copy()                      # an independent-ish second draw (shifted)
    np.put_along_axis(s2, lead[:, None, :], -np.inf, axis=1)
    chal = s2.argmax(1)
    alloc = np.zeros((Rr, K))
    for k in range(K):
        alloc[:, k] = beta * (lead == k).mean(1) + (1 - beta) * (chal == k).mean(1)
    return alloc


def run(policy, p_fn, calls_day, T, K, rng, delay=0, gamma=None, window=None, eps=0.1, R=R):
    """Simulate R independent tenants/runs. p_fn(day) -> (K,) true rates. Returns dict of per-day arrays."""
    succ_rev = np.zeros((R, K)); fail_rev = np.zeros((R, K))            # revealed counts (cumulative, maybe discounted)
    pend_s = np.zeros((T + delay + 1, R, K)); pend_f = np.zeros((T + delay + 1, R, K))
    hist_s = []; hist_f = []                                            # for sliding window (revealed per day)
    correct = np.zeros((R, T), bool); declared_day = np.full(R, -1); declared_arm = np.full(R, -1)
    regret = np.zeros((R, T)); outcomes = np.zeros((R, T)); best_share = np.zeros((R, T)); maxshare = np.zeros((R, T))
    pmax = np.zeros((R, T))
    for d in range(T):
        p = np.asarray(p_fn(d), float)                                  # (K,)
        a = 1 + succ_rev; b = 1 + fail_rev
        s = rng.beta(a[..., None], b[..., None], size=(R, K, DRAWS))
        pb = pbest_from_draws(s)
        # ----- allocation
        if policy == "uniform":
            alloc = np.full((R, K), 1.0 / K)
        elif policy == "eps":
            mean = a / (a + b)
            jitter = rng.random((R, K)) * 1e-9
            g = (mean + jitter).argmax(1)
            alloc = np.full((R, K), eps / K); alloc[np.arange(R), g] += 1 - eps
        elif policy in ("ts", "dts", "swts"):
            alloc = pb
        elif policy == "ttts":
            alloc = ttts_alloc(s)
        else:
            raise ValueError(policy)
        alloc = np.clip(alloc, 0, None); alloc = alloc / alloc.sum(1, keepdims=True)
        n = rng.multinomial(calls_day, alloc)                           # (R, K)
        sc = rng.binomial(n, p[None, :])
        fc = n - sc
        regret[:, d] = (n * (p.max() - p[None, :])).sum(1)
        outcomes[:, d] = sc.sum(1)
        best = p.argmax()
        best_share[:, d] = n[:, best] / max(calls_day, 1)
        maxshare[:, d] = n.max(1) / max(calls_day, 1)
        pend_s[d + delay] += sc; pend_f[d + delay] += fc
        # ----- reveal outcomes due today (end of day d)
        rs, rf = pend_s[d], pend_f[d]
        if policy == "dts" and gamma is not None:
            succ_rev *= gamma; fail_rev *= gamma
        if policy == "swts" and window is not None:
            hist_s.append(rs.copy()); hist_f.append(rf.copy())
            if len(hist_s) > window:
                succ_rev -= hist_s.pop(0); fail_rev -= hist_f.pop(0)
        succ_rev += rs; fail_rev += rf
        # ----- read-out after the update
        a = 1 + succ_rev; b = 1 + fail_rev
        mean = a / (a + b) + rng.random((R, K)) * 1e-9
        choice = mean.argmax(1)
        tie_all = np.allclose(p, p[0])
        correct[:, d] = True if tie_all else (choice == best)
        pb = pbest_beta(a, b)
        pmax[:, d] = pb.max(1)
        newly = (declared_day < 0) & (pb.max(1) >= THRESH)
        declared_day[newly] = d + 1; declared_arm[newly] = pb.argmax(1)[newly]
    return dict(correct=correct, declared_day=declared_day, declared_arm=declared_arm, regret=regret,
                outcomes=outcomes, best_share=best_share, maxshare=maxshare, pmax=pmax)


def lock_in_day(correct):
    """First day after which the current choice is the true best on every remaining day (inf if not at horizon)."""
    R, T = correct.shape
    out = np.full(R, np.inf)
    for r in range(R):
        c = correct[r]
        if not c[-1]:
            continue
        wrong = np.where(~c)[0]
        out[r] = 1 if len(wrong) == 0 else wrong[-1] + 2
    return out


def summarise(res, p_fn, T, calls_day, label, best_idx_final=None):
    p_last = np.asarray(p_fn(T - 1)); best = p_last.argmax() if best_idx_final is None else best_idx_final
    aa = np.allclose(p_last, p_last[0])
    lid = lock_in_day(res["correct"])
    dd, da = res["declared_day"], res["declared_arm"]
    out = dict(label=label, calls_per_day=calls_day, days=T, runs=res["correct"].shape[0])
    for day in (3, 7, 14, 30, 60, 90):
        if day <= T:
            out[f"p_correct_choice_day{day}"] = round(float(res["correct"][:, day - 1].mean()), 3)
    out["lockin_day_median"] = float(np.median(lid)) if np.isfinite(np.median(lid)) else None
    out["share_locked_in_by_horizon"] = round(float(np.isfinite(lid).mean()), 3)
    for day in (7, 30, 90):
        if day <= T:
            dec = (dd > 0) & (dd <= day)
            out[f"declared_winner_by_day{day}"] = round(float(dec.mean()), 3)
            if not aa:
                out[f"declared_and_wrong_by_day{day}"] = round(float((dec & (da != best)).mean()), 3)
    if not aa:
        okd = dd[(dd > 0) & (da == best)]
        out["declared_correct_day_median"] = float(np.median(okd)) if len(okd) else None
    tot_reg = res["regret"].sum(1); possible = calls_day * sum(np.asarray(p_fn(d)).max() for d in range(T))
    out["regret_outcomes_mean"] = round(float(tot_reg.mean()), 1)
    out["regret_pct_of_possible"] = round(100 * float(tot_reg.mean()) / possible, 2)
    out["final_day_share_to_best"] = round(float(res["best_share"][:, -1].mean()), 3)
    out["final_day_max_share_gt80pct"] = round(float((res["maxshare"][:, -1] > 0.8).mean()), 3)
    return out


def main():
    os.makedirs(DATA, exist_ok=True); os.makedirs(CH, exist_ok=True)
    rng = np.random.default_rng(SEED)
    t0 = time.time()
    rows = []; curves = []
    K = 4; base = 0.20
    SC = {
        "AA (all equal 20%)": [base] * 4,
        "small: best +5% rel": [base, 0.97 * base, 1.01 * base, 1.05 * base],
        "medium: best +10% rel": [base, 0.95 * base, 1.02 * base, 1.10 * base],
        "large: best +25% rel": [base, 0.95 * base, 1.02 * base, 1.25 * base],
    }
    T = 90
    # ---------------- 1. main grid: volume x scenario x policy
    for vol in (100, 1000, 10000):
        for sname, p in SC.items():
            for pol in ("uniform", "eps", "ts", "ttts"):
                pf = (lambda pp: (lambda d: pp))(p)
                res = run(pol, pf, vol, T, K, rng)
                row = summarise(res, pf, T, vol, f"{sname} | {pol}"); row.update(scenario=sname, policy=pol, experiment="main")
                rows.append(row)
                for d in range(T):
                    curves.append(dict(experiment="main", scenario=sname, policy=pol, calls_per_day=vol, day=d + 1,
                                       p_correct=float(res["correct"][:, d].mean()),
                                       p_declared=float(((res["declared_day"] > 0) & (res["declared_day"] <= d + 1)).mean()),
                                       share_to_best=float(res["best_share"][:, d].mean()),
                                       cum_regret=float(res["regret"][:, :d + 1].sum(1).mean())))
                print(f"[{time.time()-t0:6.1f}s] main {vol} {sname} {pol}", flush=True)
    # ---------------- 2. delayed outcomes (medium effect)
    p = SC["medium: best +10% rel"]
    for vol in (100, 1000, 10000):
        for delay in (0, 3, 7, 14, 30):
            for pol in ("ts", "uniform"):
                pf = (lambda pp: (lambda d: pp))(p)
                res = run(pol, pf, vol, T, K, rng, delay=delay)
                row = summarise(res, pf, T, vol, f"delay {delay}d | {pol}"); row.update(scenario="medium: best +10% rel", policy=pol, experiment="delay", delay_days=delay)
                rows.append(row)
                for d in range(T):
                    curves.append(dict(experiment="delay", scenario=f"delay {delay}d", policy=pol, calls_per_day=vol, day=d + 1,
                                       p_correct=float(res["correct"][:, d].mean()),
                                       p_declared=float(((res["declared_day"] > 0) & (res["declared_day"] <= d + 1)).mean()),
                                       share_to_best=float(res["best_share"][:, d].mean()),
                                       cum_regret=float(res["regret"][:, :d + 1].sum(1).mean())))
            print(f"[{time.time()-t0:6.1f}s] delay {vol} {delay}", flush=True)
    # ---------------- 3. non-stationarity: (a) best arm switches at day 60; (b) novelty effect decays
    T2 = 150; K3 = 3
    switch = lambda d: [0.20, 0.22, 0.20] if d < 60 else [0.22, 0.19, 0.20]
    novelty = lambda d: [0.20, 0.20 * (0.95 + 0.30 * 0.5 ** (d / 10.0)), 0.21]   # arm1 starts +25%, decays to -5%
    for nsname, pf, best_final in (("switch at day 60", switch, None), ("novelty decays (arm1 +25% -> -5%)", novelty, None)):
        for vol in (100, 1000):
            for pol, kw in (("uniform", {}), ("ts", {}), ("dts", dict(gamma=0.97)), ("swts", dict(window=21)), ("eps", {})):
                res = run(pol, pf, vol, T2, K3, rng, **kw)
                row = summarise(res, pf, T2, vol, f"{nsname} | {pol}"); row.update(scenario=nsname, policy=pol + (f"(g={kw.get('gamma')})" if 'gamma' in kw else f"(W={kw.get('window')})" if 'window' in kw else ""), experiment="nonstationary")
                # regret split before/after day 60
                row["regret_after_day60"] = round(float(res["regret"][:, 60:].sum(1).mean()), 1)
                row["p_correct_day90"] = round(float(res["correct"][:, 89].mean()), 3)
                row["p_correct_day150"] = round(float(res["correct"][:, -1].mean()), 3)
                rows.append(row)
                for d in range(T2):
                    curves.append(dict(experiment="nonstationary", scenario=nsname, policy=row["policy"], calls_per_day=vol, day=d + 1,
                                       p_correct=float(res["correct"][:, d].mean()),
                                       p_declared=float(((res["declared_day"] > 0) & (res["declared_day"] <= d + 1)).mean()),
                                       share_to_best=float(res["best_share"][:, d].mean()),
                                       cum_regret=float(res["regret"][:, :d + 1].sum(1).mean())))
                print(f"[{time.time()-t0:6.1f}s] nonstat {nsname} {vol} {pol}", flush=True)
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(DATA, "sim-bandit-summary.csv"), index=False)
    pd.DataFrame(curves).to_csv(os.path.join(DATA, "sim-bandit-curves.csv"), index=False)
    print(f"done in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
