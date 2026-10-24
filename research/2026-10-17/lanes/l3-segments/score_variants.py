"""Round-2 scorecard variants (package r2-model-corrections, critic A10; l3 verify.md claims 1 and 5). 2026-10-17.

The frozen scorecard (score_segments.py -> scorecard.csv, weights frozen 2026-10-17T09:02:54Z) is NOT changed. This
script re-runs the same sub-scores under the two corrections the verifier asked for and writes scorecard-variants.csv:

  V1  post_sales_share weight = 0. The criterion is not in the brief's H3 list, overlaps regulatory_safety, and
      supplies insurance renewals' whole 0.40 lead over real estate. Remaining weights renormalise (sum 90).
  V2  symmetric price gate. value-gate.csv (written after the weights were frozen) failed D2C on a per-minute test
      while every other segment passed on "outcome pricing possible", although the generic market p50 per minute is
      also below managed COGS for them. Here ONE rule is applied to every segment that has a value-gate row:
        G_out  (the outcome rule the other segments passed on): one outcome's low-end value must cover the VP managed
               COGS of the minutes spent on one call. Value per outcome = value-gate low end (D2C's value is already
               per COD order called, i.e. per call). COGS = l2 round-2 MC p50 for scenario A (managed today,
               INR 5.88/min); minutes per call = l2 avg_call_min base 2.0, D2C 0.94 (l3 verify.md claim 5).
               Reported as break-even calls per outcome = value_low / (COGS x minutes per call); PASS if >= 1.
        G_min  (the per-minute rule applied to everyone): market AI price per minute (value-gate range) against VP
               COGS p50, at the range low / mid / high and against scenario A (5.88) and B (3.23, optimised at
               1M min/month). Shown as a grid because the answer depends on which statistic is used.
      V2 ranks = the frozen weighted score among segments that pass G_out. Segments without a value-gate row are not
      gated (marked "not evaluated").
  V3  V1 and V2 together.
Also reported: the Dirichlet weight-perturbation P(top1)/P(top3) under V1 (seed 17, 10,000 draws, as in S2).

Run: python3 -P score_variants.py  -> scorecard-variants.csv, scorecard-gate-grid.csv
"""
import csv, json, os
import numpy as np
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("score_segments", os.path.join(HERE, "score_segments.py"))
ss = importlib.util.module_from_spec(spec); spec.loader.exec_module(ss)   # reuse the frozen sub-scores S and weights W
S, W, KEYS = ss.S, ss.W, ss.KEYS

L2 = json.load(open(os.path.join(HERE, "..", "l2-economics", "cost-model.json")))
COGS = {sc["name"][:2].strip(". "): sc["mc"]["cogs_p50"] for sc in L2["scenarios"]}
COGS_A, COGS_B = COGS["A"], COGS["B"]
MIN_PER_CALL = {"d2c_ecom_post_purchase": 0.94}       # l3 verify.md claim 5; others use l2 avg_call_min base
DEFAULT_MIN_PER_CALL = 2.0


def score(sc, w):
    return sum(sc[i] * w[k] for i, k in enumerate(KEYS)) / sum(w.values())


def ranks(d):
    """Competition ranking with ties (1, 1, 3 ...); ties are scores equal to 1e-9."""
    out = {}
    for n in d:
        out[n] = 1 + sum(1 for m in d if d[m] > d[n] + 1e-9)
    return out


def rng_range(txt):
    lo, hi = txt.split("(")[0].strip().split("-")
    return float(lo), float(hi)


def main():
    names = list(S)
    gate = {r["segment"]: r for r in csv.DictReader(open(os.path.join(HERE, "value-gate.csv"), encoding="utf-8"))}

    base = {n: score(S[n]["s"], W) for n in names}
    w1 = dict(W); w1["post_sales_share"] = 0
    v1 = {n: score(S[n]["s"], w1) for n in names}

    # gates
    g = {}
    grid = []
    for n in names:
        if n not in gate:
            g[n] = {"G_out": "not evaluated (no value-gate row)", "breakeven_calls": None}
            continue
        r = gate[n]
        vlo, vhi = float(r["value_per_outcome_inr_low"]), float(r["value_per_outcome_inr_high"])
        mpc = MIN_PER_CALL.get(n, DEFAULT_MIN_PER_CALL)
        be = vlo / (COGS_A * mpc)
        g[n] = {"G_out": "PASS" if be >= 1 else "FAIL", "breakeven_calls": be, "value_low": vlo, "value_high": vhi, "min_per_call": mpc,
                "round1_gate": r["gate_result"]}
        plo, phi = rng_range(r["market_ai_price_inr_per_min"])
        for stat, p in (("low", plo), ("mid", (plo + phi) / 2), ("high", phi)):
            for ref, c in (("A managed today", COGS_A), ("B optimised 1M", COGS_B)):
                grid.append({"segment": n, "market_price_stat": stat, "market_price_inr_per_min": round(p, 3),
                             "cogs_reference": ref, "vp_cogs_mc_p50_inr_per_min": round(c, 3),
                             "result": "PASS" if p >= c else "FAIL"})
    passes = {n for n in names if g[n]["G_out"] != "FAIL"}
    v2 = {n: base[n] for n in passes}
    v3 = {n: v1[n] for n in passes}
    r0, r1, r2, r3 = ranks(base), ranks(v1), ranks(v2), ranks(v3)

    # per-minute grid summary: which segments pass each (stat, ref) cell
    cells = {}
    for row in grid:
        cells.setdefault((row["market_price_stat"], row["cogs_reference"]), []).append((row["segment"], row["result"]))

    # Dirichlet perturbation under V1 (same alpha construction as score_segments.py S2, post_sales removed)
    rng = np.random.default_rng(17)
    keys1 = [k for k in KEYS if k != "post_sales_share"]
    alpha = np.array([W[k] / 100 * 8 * 4 for k in keys1])
    M = np.array([[S[n]["s"][KEYS.index(k)] for k in keys1] for n in names], dtype=float)
    top1 = np.zeros(len(names)); top3 = np.zeros(len(names))
    for _ in range(10000):
        sc = M @ rng.dirichlet(alpha)
        o = np.argsort(-sc); top1[o[0]] += 1; top3[o[:3]] += 1

    rows = []
    for n in sorted(names, key=lambda x: (r0[x], x)):
        j = names.index(n)
        rows.append({
            "segment": n,
            "frozen_score": round(base[n], 3), "frozen_rank": r0[n],
            "V1_post_sales_0_score": round(v1[n], 3), "V1_rank": r1[n],
            "V1_dirichlet_p_top1": round(top1[j] / 10000, 3), "V1_dirichlet_p_top3": round(top3[j] / 10000, 3),
            "round1_value_gate": g[n].get("round1_gate", ""),
            "G_out_symmetric_outcome_gate": g[n]["G_out"],
            "G_out_breakeven_calls_per_outcome": round(g[n]["breakeven_calls"], 2) if g[n]["breakeven_calls"] is not None else "",
            "V2_symmetric_gate_rank": r2.get(n, "excluded"),
            "V3_post_sales_0_plus_symmetric_gate_rank": r3.get(n, "excluded"),
            "G_min_mid_vs_A": next((x["result"] for x in grid if x["segment"] == n and x["market_price_stat"] == "mid" and x["cogs_reference"] == "A managed today"), "not evaluated"),
            "G_min_high_vs_A": next((x["result"] for x in grid if x["segment"] == n and x["market_price_stat"] == "high" and x["cogs_reference"] == "A managed today"), "not evaluated"),
            "G_min_mid_vs_B": next((x["result"] for x in grid if x["segment"] == n and x["market_price_stat"] == "mid" and x["cogs_reference"] == "B optimised 1M"), "not evaluated"),
            "rank_S1_multiplicative_unchanged": None,
        })
    # S1 does not use weights, so it is unchanged by V1; copy it for reference
    s1 = {}
    for n in names:
        sc = S[n]["s"]; s1[n] = sc[0] * sc[1] * ((sc[4] + sc[5]) / 2) / (6 - sc[3])
    rs1 = ranks(s1)
    for row in rows: row["rank_S1_multiplicative_unchanged"] = rs1[row["segment"]]

    with open(os.path.join(HERE, "scorecard-variants.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n"); w.writeheader(); w.writerows(rows)
    with open(os.path.join(HERE, "scorecard-gate-grid.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(grid[0].keys()), lineterminator="\n"); w.writeheader(); w.writerows(grid)

    print(f"COGS reference (l2 round-2 MC p50): A {COGS_A:.2f}, B {COGS_B:.2f} INR/min")
    for row in rows[:10]:
        print(f"{row['segment']:30s} frozen #{row['frozen_rank']:<2} {row['frozen_score']:.3f} | V1 #{row['V1_rank']:<2} {row['V1_post_sales_0_score']:.3f} "
              f"P1 {row['V1_dirichlet_p_top1']:.2f} P3 {row['V1_dirichlet_p_top3']:.2f} | G_out {row['G_out_symmetric_outcome_gate'][:4]} "
              f"be {row['G_out_breakeven_calls_per_outcome']} | V2 #{row['V2_symmetric_gate_rank']} V3 #{row['V3_post_sales_0_plus_symmetric_gate_rank']} | S1 #{row['rank_S1_multiplicative_unchanged']}")
    for (stat, ref), lst in sorted(cells.items()):
        print(f"G_min market {stat:4s} vs {ref:16s}: PASS {sum(1 for _, r in lst if r == 'PASS')}/{len(lst)}; FAIL: {[s for s, r in lst if r == 'FAIL']}")


if __name__ == "__main__":
    main()
