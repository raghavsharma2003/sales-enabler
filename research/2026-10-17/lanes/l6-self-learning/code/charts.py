"""Charts for lane l6 from data/*.csv. Run from the lane directory: python3 code/charts.py"""
import os, json
import pandas as pd, numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__)); LANE = os.path.dirname(HERE)
DATA = os.path.join(LANE, "data"); CH = os.path.join(LANE, "charts")
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
SER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]
plt.rcParams.update({"font.size": 9, "axes.edgecolor": INK2, "axes.labelcolor": INK2, "xtick.color": INK2,
                     "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF, "axes.titlecolor": INK,
                     "legend.frameon": False})
POL = {"uniform": ("fixed split (A/B/n)", SER[0]), "eps": ("epsilon-greedy 10%", SER[1]), "ts": ("Thompson sampling", SER[2]),
       "ttts": ("top-two Thompson", SER[3])}


def style(ax):
    ax.grid(axis="y", color=GRID, lw=0.6); ax.spines[["top", "right"]].set_visible(False)


cur = pd.read_csv(os.path.join(DATA, "sim-bandit-curves.csv"))
summ = pd.read_csv(os.path.join(DATA, "sim-bandit-summary.csv"))

# 1. P(current choice is the true best) by day; rows = effect size, cols = volume
fig, axes = plt.subplots(2, 3, figsize=(11, 6), dpi=150, sharey=True)
for i, sc in enumerate(["small: best +5% rel", "medium: best +10% rel"]):
    for j, vol in enumerate([100, 1000, 10000]):
        ax = axes[i, j]
        for pol, (lab, col) in POL.items():
            c = cur[(cur.experiment == "main") & (cur.scenario == sc) & (cur.policy == pol) & (cur.calls_per_day == vol)]
            ax.plot(c.day, c.p_correct, color=col, lw=2, label=lab)
        ax.axhline(0.25, color=GRID, lw=1, ls="--")
        ax.set_ylim(0, 1.02); style(ax)
        ax.set_title(f"{sc.split(':')[0]} effect ({sc.split(': ')[1]}), {vol:,} calls/day", loc="left", fontsize=9)
        if j == 0: ax.set_ylabel("P(current pick is truly best)")
        if i == 1: ax.set_xlabel("Day")
axes[0, 0].legend(loc="lower right", fontsize=8)
fig.suptitle("Script learning, K = 4 variants, baseline outcome 20%: how fast the pick becomes right (400 runs each; dashed = chance)",
             x=0.01, ha="left", color=INK, fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(CH, "sim-time-to-correct.png")); plt.close(fig)

# 2. A/A: cumulative probability a "winner" (P(best) >= 0.95) has been declared, by day
fig, axes = plt.subplots(1, 3, figsize=(11, 3.4), dpi=150, sharey=True)
for j, vol in enumerate([100, 1000, 10000]):
    ax = axes[j]
    for pol, (lab, col) in POL.items():
        c = cur[(cur.experiment == "main") & (cur.scenario == "AA (all equal 20%)") & (cur.policy == pol) & (cur.calls_per_day == vol)]
        ax.plot(c.day, c.p_declared, color=col, lw=2, label=lab)
    ax.axhline(0.05, color=GRID, lw=1, ls="--"); ax.set_ylim(0, 0.35); style(ax)
    ax.set_title(f"A/A, {vol:,} calls/day", loc="left", fontsize=9); ax.set_xlabel("Day")
    if j == 0: ax.set_ylabel("Share of runs that declared a winner")
axes[0].legend(loc="upper left", fontsize=8)
fig.suptitle("Identical variants, checked daily, 'winner' when P(best) >= 0.95: the false-winner rate keeps climbing (dashed = 5%)",
             x=0.01, ha="left", color=INK, fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(CH, "sim-aa-false-winner.png")); plt.close(fig)

# 3. delayed outcomes: median day a CORRECT winner is declared vs delay
d = summ[summ.experiment == "delay"]
fig, ax = plt.subplots(figsize=(7, 3.8), dpi=150)
for j, vol in enumerate([100, 1000, 10000]):
    for pol, ls in (("ts", "-"), ("uniform", ":")):
        c = d[(d.calls_per_day == vol) & (d.policy == pol)].sort_values("delay_days")
        ax.plot(c.delay_days, c.declared_correct_day_median, color=SER[j], lw=2, ls=ls, marker="o", ms=4,
                label=f"{vol:,}/day, {'Thompson' if pol == 'ts' else 'fixed split'}")
ax.set_xlabel("Outcome delay (days until the conversion is known)"); ax.set_ylabel("Median day a correct winner is declared")
style(ax); ax.legend(fontsize=7.5, ncol=2)
ax.set_title("Delayed outcomes add roughly the delay to every decision (medium effect, K = 4)", loc="left", fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(CH, "sim-delay.png")); plt.close(fig)

# 4. non-stationarity: best arm switches at day 60, 1,000 calls/day
n = cur[(cur.experiment == "nonstationary") & (cur.calls_per_day == 1000)]
fig, axes = plt.subplots(1, 2, figsize=(11, 3.6), dpi=150, sharey=True)
for ax, sc in zip(axes, ["switch at day 60", "novelty decays (arm1 +25% -> -5%)"]):
    for k, (pol, lab) in enumerate((("uniform", "fixed split"), ("ts", "Thompson"), ("dts(g=0.97)", "discounted Thompson (0.97/day)"),
                                    ("swts(W=21)", "sliding-window Thompson (21 d)"))):
        c = n[(n.scenario == sc) & (n.policy == pol)]
        ax.plot(c.day, c.share_to_best, color=SER[k], lw=1.6, label=lab)
    if sc.startswith("switch"): ax.axvline(60, color=INK2, lw=1, ls="--")
    ax.set_title(f"{sc}, 1,000 calls/day", loc="left", fontsize=9); ax.set_xlabel("Day"); style(ax)
axes[0].set_ylabel("Share of today's calls on today's best variant"); axes[1].legend(fontsize=8, loc="center right", bbox_to_anchor=(1, 0.56))
fig.suptitle("When the world changes, a learner that never forgets keeps serving yesterday's winner", x=0.01, ha="left", color=INK, fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(CH, "sim-nonstationary.png")); plt.close(fig)

# 5. hierarchical pooling
h = pd.read_csv(os.path.join(DATA, "sim-hierarchical.csv"))
scen = ["homogeneous tau=0.05", "heterogeneous tau=0.20", "unlike tenants tau=0.40"]
pols = [("indep", "each tenant alone"), ("pooled", "one segment policy"), ("hier", "partial pooling")]
fig, axes = plt.subplots(1, 2, figsize=(11, 3.6), dpi=150)
x = np.arange(len(scen)); w = 0.26
for k, (pol, lab) in enumerate(pols):
    v = [h[(h.scenario == s) & (h.policy == pol)].regret_pct_of_possible.iloc[0] for s in scen]
    axes[0].bar(x + (k - 1) * w, v, w - 0.02, color=SER[k], label=lab)
    v2 = [h[(h.scenario == s) & (h.policy == pol)].tenants_declared_wrong_by_day90.iloc[0] * 100 for s in scen]
    v2 = [h[(h.scenario == "A/A") & (h.policy == pol)].tenants_declared_winner_by_day90.iloc[0] * 100] + v2
    axes[1].bar(np.arange(4) + (k - 1) * w, v2, w - 0.02, color=SER[k], label=lab)
axes[0].set_xticks(x, ["alike tenants\n(tau 0.05)", "different tenants\n(tau 0.20)", "unlike tenants\n(tau 0.40)"])
axes[0].set_ylabel("Outcomes lost vs always-best (%)"); axes[0].set_title("Regret over 90 days", loc="left", fontsize=9); style(axes[0])
axes[1].set_xticks(np.arange(4), ["A/A\n(any winner)", "alike", "different", "unlike"])
axes[1].set_ylabel("Tenants with a wrong winner (%)"); axes[1].set_title("False or wrong winners declared by day 90", loc="left", fontsize=9); style(axes[1])
axes[0].legend(fontsize=8)
fig.suptitle("30 tenants in one segment, median 100 calls/day each, K = 3: pooling helps only when tenants are alike",
             x=0.01, ha="left", color=INK, fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(CH, "sim-hierarchical.png")); plt.close(fig)

# 6. drop-off mining
m = pd.read_csv(os.path.join(DATA, "dropoff-mining.csv"))
fig, ax = plt.subplots(figsize=(7, 3.8), dpi=150)
for k, (sc, lab) in enumerate((("bad line 4 at 2x", "bad line at 2x hazard"), ("bad line 4 at 2x, lines vary (sd 0.2)", "2x, other lines vary"),
                               ("bad line 4 at 1.5x", "bad line at 1.5x hazard"))):
    c = m[m.scenario == sc]
    ax.plot(c.calls, c.p_detect_bad_line, color=SER[k], lw=2, marker="o", ms=4, label=lab)
c = m[m.scenario == "null: lines vary naturally (sd 0.2 log)"]
ax.plot(c.calls, c.p_any_false_flag, color=SER[3], lw=2, ls=":", marker="o", ms=4, label="any false flag (no bad line)")
ax.set_xscale("log"); ax.set_ylim(0, 1.02); style(ax)
ax.set_xlabel("Calls on one script (log scale)"); ax.set_ylabel("Probability")
ax.set_title("Finding the line where callers hang up (flag at P(hazard > 1.25x curve) >= 0.99)", loc="left", fontsize=10)
ax.legend(fontsize=8, loc="center right")
fig.tight_layout(); fig.savefig(os.path.join(CH, "dropoff-detection.png")); plt.close(fig)
print("charts written:", sorted(os.listdir(CH)))
