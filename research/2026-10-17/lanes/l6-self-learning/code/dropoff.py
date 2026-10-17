"""VP lane l6-self-learning: drop-off line mining, proxy metrics and label noise (H7). 2026-10-17.
Pure computation. Run from the lane directory: python3 code/dropoff.py

A. Mining: can per-line hang-up hazards (measured in code from telephony hang-up time vs the TTS clause timestamps,
   no LLM in the label) find the one bad line in a script, and how often do they flag a line that is fine?
B. Confirming a fix: calls per arm when the test reads the LOCAL metric (hazard at the rewritten line, among callers
   who reached it) vs whole-call completion vs the business outcome.
C. Goodhart: a rewrite that keeps people on the line without changing the outcome. What a learner optimising the
   proxy does, and what it does to billed minutes.
D. Label noise: if the outcome label comes from an LLM reading the transcript (agreement < 1), how many more calls a
   test needs, and how a label that is biased toward one variant manufactures a winner.
"""
import os, math, csv, json
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__)); LANE = os.path.dirname(HERE)
DATA = os.path.join(LANE, "data"); CH = os.path.join(LANE, "charts")
rng = np.random.default_rng(20261017)
Z = stats.norm.ppf


def n_two_prop(p0, p1, alpha=0.05, power=0.8):
    za, zb = Z(1 - alpha / 2), Z(power); pbar = (p0 + p1) / 2
    return math.ceil((za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))) ** 2 / (p0 - p1) ** 2)


# Position hazard curve (ASSUMED shape, not measured: first turn carries the AI disclosure and the opener, where
# early hang-ups concentrate; later turns lower and flat). Probability the caller hangs up during line l, given they
# reached it.
H0 = np.array([0.15, 0.08, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04]); L = len(H0); BAD = 3


def simulate_calls(h, n):
    """Returns (reached[l], hung[l]) counts for n calls through hazards h."""
    reached = np.zeros(L, int); hung = np.zeros(L, int); alive = n
    for l in range(L):
        reached[l] = alive
        k = rng.binomial(alive, h[l]); hung[l] = k; alive -= k
    return reached, hung


def flags(reached, hung, ref, ratio=1.25, conf=0.99):
    """Flag line l if P(h_l > ratio x ref_l | data) >= conf under a Beta(1,1) prior."""
    a = 1 + hung; b = 1 + reached - hung
    return stats.beta.sf(ratio * ref, a, b) >= conf


# ---------------- A. mining
rowsA = []
SIMS = 3000
for n in (100, 200, 500, 1000, 2000, 5000, 10000):
    for label, mult, natural_sd in (("null: script exactly on the segment curve", 1.0, 0.0),
                                    ("null: lines vary naturally (sd 0.2 log)", 1.0, 0.2),
                                    ("bad line 4 at 1.5x", 1.5, 0.0), ("bad line 4 at 2x", 2.0, 0.0),
                                    ("bad line 4 at 2x, lines vary (sd 0.2)", 2.0, 0.2)):
        det = 0; anyfalse = 0; falsecount = 0
        for _ in range(SIMS):
            h = H0 * np.exp(rng.normal(0, natural_sd, L)) if natural_sd else H0.copy()
            h[BAD] *= mult
            reached, hung = simulate_calls(np.clip(h, 0, 0.95), n)
            f = flags(reached, hung, H0)
            if mult > 1: det += f[BAD]
            others = np.delete(f, BAD) if mult > 1 else f
            # a flag on a line whose true hazard is < 1.25x the curve is a false flag
            truly_bad = (h >= 1.25 * H0)
            fa = f & ~truly_bad
            anyfalse += fa.any(); falsecount += fa.sum()
        rowsA.append(dict(calls=n, scenario=label, calls_reaching_line4=round(n * np.prod(1 - H0[:BAD])),
                          p_detect_bad_line=round(det / SIMS, 3) if mult > 1 else None,
                          p_any_false_flag=round(anyfalse / SIMS, 3), mean_false_flags=round(falsecount / SIMS, 3)))
with open(os.path.join(DATA, "dropoff-mining.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rowsA[0].keys())); w.writeheader(); w.writerows(rowsA)

# ---------------- B. confirming a fix of line 4 (hazard 0.10 -> 0.05)
hb = H0.copy(); hb[BAD] = 0.10; hf = H0.copy(); hf[BAD] = 0.05
reach4 = np.prod(1 - H0[:BAD])
comp_b = np.prod(1 - hb); comp_f = np.prod(1 - hf)
conv_given_complete = 0.30   # ASSUMED: 30% of callers who hear the whole script convert
rowsB = [
    dict(metric="hazard at line 4 among callers who reached it", p_control=0.10, p_variant=0.05,
         n_per_arm_on_metric=n_two_prop(0.10, 0.05), calls_per_arm=math.ceil(n_two_prop(0.10, 0.05) / reach4)),
    dict(metric="whole-call completion (reached the end)", p_control=round(comp_b, 4), p_variant=round(comp_f, 4),
         n_per_arm_on_metric=n_two_prop(comp_b, comp_f), calls_per_arm=n_two_prop(comp_b, comp_f)),
    dict(metric="conversion (completion x 0.30, if survivors convert like everyone else)",
         p_control=round(comp_b * conv_given_complete, 4), p_variant=round(comp_f * conv_given_complete, 4),
         n_per_arm_on_metric=n_two_prop(comp_b * conv_given_complete, comp_f * conv_given_complete),
         calls_per_arm=n_two_prop(comp_b * conv_given_complete, comp_f * conv_given_complete)),
]

# ---------------- C. Goodhart: the rewrite keeps the extra callers on the line but they never convert
# Variant B (e.g. moves the price later) halves the line-4 hazard, but the callers it retains are those who would
# have said no anyway: conversions are unchanged, billed minutes rise.
extra_survivors = comp_f - comp_b                     # share of calls that now run to the end
sec_per_line = 20.0                                   # ASSUMED average seconds per agent line incl. the caller's turn
def exp_minutes(h):
    alive = 1.0; m = 0.0
    for l in range(L):
        m += alive * (1 - h[l]) * sec_per_line / 60 + alive * h[l] * (sec_per_line / 2) / 60
        alive *= (1 - h[l])
    return m
min_b, min_f = exp_minutes(hb), exp_minutes(hf)
rowsC = dict(completion_control=round(comp_b, 4), completion_variant=round(comp_f, 4),
             conversion_control=round(comp_b * conv_given_complete, 4),
             conversion_variant_if_retained_never_convert=round(comp_b * conv_given_complete, 4),
             minutes_per_call_control=round(min_b, 3), minutes_per_call_variant=round(min_f, 3),
             billed_minutes_change_pct=round(100 * (min_f / min_b - 1), 2),
             proxy_test_calls_per_arm=n_two_prop(comp_b, comp_f),
             note="A learner rewarded on completion or talk time adopts the variant with certainty at ~"
                  f"{n_two_prop(comp_b, comp_f)} calls/arm; the buyer gains nothing and pays "
                  f"{round(100 * (min_f / min_b - 1), 1)}% more minutes under per-minute pricing.")

# ---------------- D. label noise from an LLM judge
rowsD = []
for acc in (1.0, 0.95, 0.90, 0.85, 0.80):
    sens = spec = acc
    for p0, p1 in ((0.20, 0.22), (0.20, 0.25), (0.10, 0.12)):
        q0 = p0 * sens + (1 - p0) * (1 - spec); q1 = p1 * sens + (1 - p1) * (1 - spec)
        rowsD.append(dict(judge_accuracy=acc, true_p0=p0, true_p1=p1, observed_p0=round(q0, 4), observed_p1=round(q1, 4),
                          n_per_arm_true_labels=n_two_prop(p0, p1), n_per_arm_judge_labels=n_two_prop(q0, q1),
                          inflation=round(n_two_prop(q0, q1) / n_two_prop(p0, p1), 2)))
# differential bias: the judge is 3 points more likely to call "qualified" on variant B because B's wording echoes
# the rubric (the judge reads the agent's words, not the buyer's behaviour). A/A in truth.
p = 0.20; bias_pts = 0.03
nA = 2000
sims = 4000
a = rng.binomial(nA, p * 0.9 + (1 - p) * 0.1, sims); b = rng.binomial(nA, min(p * 0.9 + (1 - p) * 0.1 + bias_pts, 1), sims)
pa, pb = a / nA, b / nA; pp = (a + b) / (2 * nA); se = np.sqrt(pp * (1 - pp) * 2 / nA)
false_win = float(np.mean((pb - pa) / se > 1.96))
rowsD_bias = dict(truth="A/A (identical true outcome rate 20%)", judge_accuracy=0.9, judge_bias_toward_B_pts=bias_pts,
                  calls_per_arm=nA, share_of_tests_declaring_B_better=round(false_win, 3))

with open(os.path.join(DATA, "dropoff-label-noise.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rowsD[0].keys())); w.writeheader(); w.writerows(rowsD)
out = dict(position_hazard_curve_assumed=H0.tolist(), mining=rowsA, confirm_fix=rowsB, goodhart=rowsC,
           label_noise=rowsD, judge_bias_aa=rowsD_bias)
with open(os.path.join(DATA, "dropoff-summary.json"), "w") as f:
    json.dump(out, f, indent=1)
for r in rowsA: print(r)
for r in rowsB: print(r)
print(rowsC)
for r in rowsD: print(r)
print(rowsD_bias)
