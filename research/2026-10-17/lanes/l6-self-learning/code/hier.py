"""VP lane l6-self-learning: pooling script learning across tenants in one segment (H7). 2026-10-17.
Pure computation. Run from the lane directory: python3 code/hier.py [--quick]

M tenants in one segment, each with its own daily call volume (lognormal, p10 30 / p90 330 calls per day, so the
median tenant is ~100 calls/day: the brief's "100 calls" world). K = 3 script variants.
True model: logit p[t,k] = alpha[t] + beta[k] + u[t,k]
  alpha[t] ~ N(logit 0.20, 0.4^2)   tenant baseline (lead quality, product, list)
  beta     = (0, +0.10, -0.05)      segment-level variant effects (+0.10 logit ~ +8% relative at 20%)
  u[t,k]   ~ N(0, tau^2)            tenant-specific deviation; tau = 0.05 (homogeneous segment), 0.20 (heterogeneous),
                                    0.40 (pooling across unlike tenants, e.g. across segments)
A/A: beta = 0, tau = 0.

Policies
  indep  Thompson sampling per tenant on its own data only
  pooled one segment-level Thompson sampler on summed counts; every tenant gets the same allocation and choice
  hier   partial pooling: per-tenant log-odds contrasts vs variant 0, shrunk toward the segment mean contrast with a
         DerSimonian-Laird between-tenant variance (normal approximation; ignores the covariance from the shared
         control arm). Thompson sampling on the tenant's posterior.
"""
import os, sys, time
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); LANE = os.path.dirname(HERE)
DATA = os.path.join(LANE, "data")
QUICK = "--quick" in sys.argv
R = 60 if QUICK else 200
M = 30; K = 3; T = 90; D = 200
THRESH = 0.95
from scipy.special import ndtr
_GH_X, _GH_W = np.polynomial.hermite.hermgauss(48)


def pbest_normal(mu, sd):
    """Deterministic P(arm k is best) for independent normal posteriors (..., K) by Gauss-Hermite quadrature."""
    sd = np.maximum(sd, 1e-9)
    X = mu[..., :, None, None] + np.sqrt(2) * sd[..., :, None, None] * _GH_X
    Zs = (X - mu[..., None, :, None]) / sd[..., None, :, None]
    Ph = np.where(np.eye(mu.shape[-1], dtype=bool)[..., None], 1.0, ndtr(Zs))
    return (Ph.prod(-2) * _GH_W).sum(-1) / np.sqrt(np.pi)


def pbest_beta(a, b):
    m = a / (a + b); v = a * b / ((a + b) ** 2 * (a + b + 1))
    return pbest_normal(m, np.sqrt(v))
logit = lambda p: np.log(p / (1 - p)); expit = lambda x: 1 / (1 + np.exp(-x))


def pbest(draws):  # draws (..., K, D)
    w = draws.argmax(-2)
    return np.stack([(w == k).mean(-1) for k in range(draws.shape[-2])], -1)


def hier_posterior(S, N):
    """S, N: (R, M, K) successes and calls. Returns posterior mean and sd of contrasts theta[k] - theta[0], (R,M,K)."""
    y = logit((S + 0.5) / (N + 1.0)); v = 1 / (S + 0.5) + 1 / (N - S + 0.5)
    c = y - y[..., :1]; w = v + v[..., :1]                   # contrasts and their variances; c[...,0] = 0
    mean = np.zeros_like(c); sd = np.zeros_like(c)
    for k in range(1, K):
        ck, wk = c[..., k], w[..., k]                        # (R, M)
        wi = 1 / wk
        fe = (wi * ck).sum(1, keepdims=True) / wi.sum(1, keepdims=True)
        Q = (wi * (ck - fe) ** 2).sum(1, keepdims=True)
        Cc = wi.sum(1, keepdims=True) - (wi ** 2).sum(1, keepdims=True) / wi.sum(1, keepdims=True)
        tau2 = np.maximum((Q - (M - 1)) / np.maximum(Cc, 1e-9), 0.03 ** 2)   # DL estimate, floor tau = 0.03
        wr = 1 / (wk + tau2)
        delta = (wr * ck).sum(1, keepdims=True) / wr.sum(1, keepdims=True)
        Vd = 1 / wr.sum(1, keepdims=True)
        prior_var = tau2 + Vd
        post_var = 1 / (1 / wk + 1 / prior_var)
        mean[..., k] = post_var * (ck / wk + delta / prior_var)
        sd[..., k] = np.sqrt(post_var)
    return mean, sd


def run(policy, beta, tau, rng):
    alpha = rng.normal(logit(0.20), 0.4, (R, M))
    u = rng.normal(0, tau, (R, M, K)) if tau > 0 else np.zeros((R, M, K))
    p = expit(alpha[..., None] + np.asarray(beta)[None, None, :] + u)          # (R, M, K)
    vol = np.round(np.exp(rng.normal(np.log(100), (np.log(330) - np.log(30)) / (2 * 1.2816), (R, M)))).astype(int)
    vol = np.clip(vol, 5, None)
    best = p.argmax(-1); aa = (tau == 0 and np.allclose(beta, beta[0]))
    S = np.zeros((R, M, K)); N = np.zeros((R, M, K))
    correct = np.zeros((R, M, T), bool); declared = np.zeros((R, M), bool); declared_day = np.full((R, M), -1)
    declared_arm = np.full((R, M), -1)
    regret = np.zeros((R, M)); possible = np.zeros((R, M))
    for d in range(T):
        # allocation
        if policy == "indep":
            dr = rng.beta(1 + S[..., None], 1 + (N - S)[..., None], size=(R, M, K, D))
            alloc = pbest(dr)
        elif policy == "pooled":
            Sp, Np = S.sum(1), N.sum(1)                                                 # (R, K)
            dr = rng.beta(1 + Sp[..., None], 1 + (Np - Sp)[..., None], size=(R, K, D))
            alloc = np.repeat(pbest(dr)[:, None, :], M, 1)
        elif policy == "hier":
            mu, sd = hier_posterior(S, N)
            dr = mu[..., None] + sd[..., None] * rng.standard_normal((R, M, K, D))
            alloc = pbest(dr)
        alloc = alloc / alloc.sum(-1, keepdims=True)
        n = rng.multinomial(vol, alloc)
        s = rng.binomial(n, p)
        S += s; N += n
        regret += (n * (p.max(-1, keepdims=True) - p)).sum(-1)
        possible += vol * p.max(-1)
        # read-out
        if policy == "indep":
            m = (1 + S) / (2 + N)
            pb = pbest_beta(1 + S, 1 + N - S)
        elif policy == "pooled":
            Sp, Np = S.sum(1), N.sum(1)
            m = np.repeat(((1 + Sp) / (2 + Np))[:, None, :], M, 1)
            pb = np.repeat(pbest_beta(1 + Sp, 1 + Np - Sp)[:, None, :], M, 1)
        else:
            mu, sd = hier_posterior(S, N); m = mu
            pb = pbest_normal(mu, sd)
        choice = (m + rng.random(m.shape) * 1e-9).argmax(-1)
        correct[..., d] = True if aa else (choice == best)
        new = (~declared) & (pb.max(-1) >= THRESH)
        declared_day[new] = d + 1; declared_arm[new] = pb.argmax(-1)[new]; declared |= new
    out = dict(policy=policy, tau=tau, beta=str(list(beta)), runs=R, tenants=M,
               median_calls_per_tenant_day=float(np.median(vol)))
    for day in (7, 30, 90):
        out[f"tenants_on_true_best_day{day}"] = round(float(correct[..., day - 1].mean()), 3)
        dec = (declared_day > 0) & (declared_day <= day)
        out[f"tenants_declared_winner_by_day{day}"] = round(float(dec.mean()), 3)
        if not aa:
            out[f"tenants_declared_wrong_by_day{day}"] = round(float((dec & (declared_arm != best)).mean()), 3)
    # tenants whose own best differs from the segment best (variant 1)
    seg_best = int(np.argmax(beta))
    differ = best != seg_best
    out["share_tenants_best_differs_from_segment"] = round(float(differ.mean()), 3) if not aa else None
    if not aa and differ.any():
        out["on_true_best_day90_when_tenant_differs"] = round(float(correct[..., -1][differ].mean()), 3)
    out["regret_pct_of_possible"] = round(100 * float(regret.sum() / possible.sum()), 2)
    lo = vol <= np.percentile(vol, 25)
    out["regret_pct_low_volume_quartile"] = round(100 * float(regret[lo].sum() / possible[lo].sum()), 2)
    return out


def main():
    rng = np.random.default_rng(20261017)
    rows = []; t0 = time.time()
    for name, beta, tau in (("A/A", (0, 0, 0), 0.0), ("homogeneous tau=0.05", (0, 0.10, -0.05), 0.05),
                            ("heterogeneous tau=0.20", (0, 0.10, -0.05), 0.20),
                            ("unlike tenants tau=0.40", (0, 0.10, -0.05), 0.40)):
        for pol in ("indep", "pooled", "hier"):
            r = run(pol, beta, tau, rng); r["scenario"] = name; rows.append(r)
            print(f"[{time.time()-t0:6.1f}s] {name} {pol}: {r}", flush=True)
    pd.DataFrame(rows).to_csv(os.path.join(DATA, "sim-hierarchical.csv"), index=False)


if __name__ == "__main__":
    main()
