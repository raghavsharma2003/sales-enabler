"""Power analysis for the l5 listener panel (H5/H6). Pure numpy/stdlib; deterministic seed.
Usage: python3 -I panel_power.py OUT_JSON
1) Paired preference (matched vs neutral), k trials per listener, listener heterogeneity on the logit scale (sd_u),
   analysed by a cluster-robust test: per-listener preference proportion, one-sample t-test vs 0.5 (equivalent in power to
   a GLMM with random intercepts for these designs, and robust).
2) Within-listener rating difference (7-point), paired t-test, effect d_z.
3) Analytic binomial n (no clustering) for reference."""
import sys, json, math, random
import statistics as st
random.seed(20261017)
Z = {0.05: 1.959964, 0.0125: 2.497705, 0.0167: 2.393980}
def zpow(p=0.8): return 0.841621 if p == 0.8 else 1.281552
def binom_n(p1, alpha=0.05, power=0.8):
    p0 = 0.5; za = Z[alpha]; zb = zpow(power)
    return math.ceil(((za*math.sqrt(p0*(1-p0)) + zb*math.sqrt(p1*(1-p1)))/(p1-p0))**2)
def paired_n(dz, alpha=0.05, power=0.8):
    za = Z[alpha]; zb = zpow(power); return math.ceil(((za+zb)/dz)**2 + za**2/2)
def logit(p): return math.log(p/(1-p))
def expit(x): return 1/(1+math.exp(-x))
def tcrit(df, alpha):
    # two-sided critical t via bisection on a simple t CDF approximation (Hill's approximation is overkill; use normal for df>=30)
    za = Z[alpha]
    return za*(1 + (za**2+1)/(4*df) + (5*za**4+16*za**2+3)/(96*df**2))
def sim_pref(n_listeners, k, p_mean, sd_u, alpha, reps=2000):
    mu = logit(p_mean); hits = 0
    for _ in range(reps):
        props = []
        for _ in range(n_listeners):
            p = expit(random.gauss(mu, sd_u)); props.append(sum(random.random() < p for _ in range(k))/k)
        m = st.mean(props); s = st.stdev(props) or 1e-9
        t = (m-0.5)/(s/math.sqrt(n_listeners))
        if abs(t) > tcrit(n_listeners-1, alpha): hits += 1
    return hits/reps
out = {"seed": 20261017, "analytic_binomial_trials_needed": {}, "paired_rating_listeners_needed": {}, "simulated_preference_power": []}
for p1 in (0.60, 0.65, 0.70):
    out["analytic_binomial_trials_needed"][str(p1)] = {"alpha_0.05": binom_n(p1, 0.05), "alpha_0.0125_holm4": binom_n(p1, 0.0125)}
for dz in (0.3, 0.4, 0.5):
    out["paired_rating_listeners_needed"][str(dz)] = {"alpha_0.05": paired_n(dz, 0.05), "alpha_0.0125_holm4": paired_n(dz, 0.0125)}
for p_mean in (0.60, 0.65):
    for sd_u in (0.5, 1.0):
        for n in (30, 40, 50, 60, 80):
            for alpha in (0.05, 0.0125):
                pw = sim_pref(n, 8, p_mean, sd_u, alpha, reps=1500)
                out["simulated_preference_power"].append({"p_mean": p_mean, "sd_u_logit": sd_u, "listeners": n, "trials_per_listener": 8, "alpha": alpha, "power": round(pw, 3)})
                print(p_mean, sd_u, n, alpha, round(pw, 3), flush=True)
json.dump(out, open(sys.argv[1], "w"), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != "simulated_preference_power"}, indent=1))
