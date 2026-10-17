"""Expansion-path sizing (critic A14), incumbent-revenue reconciliation (A15) and the corrected TRAI comparison.

Round 2, package r2-economics-renewal, 2026-10-17. Every input is a range with a source tag:
  [prim] primary  [comp] computed from IRDAI Handbook 2024-25 extracts (data/)  [sec] secondary  [vend] vendor claim
  [asm] assumption  [l3] reused from lane l3's sizing.py (imported, same seed)

Stages (serviceable market, INR crore per year, at today's prices, as of 2026-10):
  S0  beachhead: renewal books of in-reach intermediaries (brokers incl. PoSP platforms, non-bank corporate agents, IMFs,
      web aggregators), priced per renewal collected at the round-2 concept-test fees
  S1  insurers' own renewal desks (ex-LIC), all other channels, priced per renewal collected at insurer-grade fees
  S2  other BFSI 1600-series service calls (ex-insurance), mid-market share, per minute, from TRAI's 1600 volume
  S3  rest of post-sales outside BFSI (l3 triangulated segments), per minute
Run: python3 expansion_sizing.py   -> expansion-sizing.csv, trai-reconciliation.csv, incumbent-reconciliation.csv,
                                     charts/expansion.png
"""
import csv
import importlib.util
import os
import sys

sys.dont_write_bytecode = True  # never write __pycache__ into the l3 lane folder

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
L3 = os.path.normpath(os.path.join(HERE, "..", "..", "l3-segments", "sizing.py"))
N = 20000
RNG = np.random.default_rng(20261018)


def tri(lo, mode, hi, n=N):
    return RNG.triangular(lo, mode, hi, n)


def pct(a, q):
    return float(np.percentile(a, q))


def load_l3():
    spec = importlib.util.spec_from_file_location("l3_sizing", L3)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out, sims, min_seat = mod.run()
    return mod, sims


def main():
    rows = []

    # ---------------- renewal-event universe (per year) ----------------
    health_due = tri(2.0e7, 2.4e7, 2.8e7)          # [comp] T104: 2.52 crore individual health policies issued FY25 (incl. renewals); due share [asm]
    motor_due = tri(8.0e7, 11.0e7, 14.0e7)         # [asm] anchored on 13.94 crore insured vehicles (30.48 - 16.54 crore, MoF Lok Sabha reply 2023-03 [sec])
    life_priv_due = 5.80e7 * tri(0.65, 0.80, 0.90)  # [comp] T10: private individual policies in force end FY25 = 5.80 crore; regular-premium share [asm]
    share_2w = tri(0.65, 0.75, 0.82)               # [asm] two-wheelers ~3/4 of the vehicle parc
    # in-reach intermediary shares of renewal events
    inreach_motor = tri(0.45, 0.55, 0.65)          # [comp] T103 FY25 motor GDP: brokers 49.5%, CA-others 5.9%, 'Others' 10.6% (part)
    inreach_health = tri(0.13, 0.16, 0.19)         # [comp] T104 FY25 individual health policies: brokers 13.1%, CA-other 1.7%, PoS 0.7%, IMF 0.2%, WA 0.1%
    inreach_life = tri(0.05, 0.07, 0.09)           # [comp] T99 FY25 individual NB policies: brokers 3.9%, CA-others 2.8%, IMF 0.1% (of all insurers)
    # renewal rates on worked lists (round-2 model medians, rounded) and fees
    ren = dict(m2=tri(0.45, 0.52, 0.60), m4=tri(0.58, 0.65, 0.73), h=tri(0.80, 0.86, 0.92), l=tri(0.75, 0.82, 0.90))
    fee = dict(m2=20, m4=50, h=15, l=15)            # round-2 concept-test fees per renewal collected (renewal_model.py)

    s0 = (motor_due * inreach_motor * (share_2w * ren["m2"] * fee["m2"] + (1 - share_2w) * ren["m4"] * fee["m4"])
          + health_due * inreach_health * ren["h"] * fee["h"]
          + life_priv_due * inreach_life * ren["l"] * fee["l"]) / 1e7
    # S1: insurers' own desks (ex-LIC). Insurers buy cheaper: fee multiplier vs intermediary card [asm]
    ins_fee_mult = tri(0.4, 0.6, 1.0)
    desk_share = tri(0.3, 0.5, 0.7)                 # share of non-intermediary renewals an insurer would put on outbound calling [asm]
    s1 = ins_fee_mult * desk_share * (
        motor_due * (1 - inreach_motor) * (share_2w * ren["m2"] * fee["m2"] + (1 - share_2w) * ren["m4"] * fee["m4"])
        + health_due * (1 - inreach_health) * ren["h"] * fee["h"]
        + life_priv_due * (1 - inreach_life) * ren["l"] * fee["l"]) / 1e7
    # cross-check of S0+S1 at per-minute prices instead of per-renewal fees
    min_per_due = tri(0.8, 1.1, 1.4)                # [model] AI-connected minutes per due policy (renewal_model.py p50 0.79-1.39)
    price_min = tri(3.0, 4.5, 8.0)                  # [l3] Indian list prices INR/min
    s01_permin = (motor_due + health_due + life_priv_due) * min_per_due * price_min / 1e7
    lic_permin = 26.89e7 * tri(0.6, 0.75, 0.9) * min_per_due * price_min / 1e7   # [comp] T10 LIC in force 26.89 crore; not serviceable (in-house/agents)

    # S2: BFSI 1600 service calls ex-insurance, mid-market share
    calls_1600 = 1.15e9 * 4                         # [prim] TRAI PR 111/2026, Q1 FY27 x 4
    conv = tri(0.20, 0.35, 0.50)                    # [asm] conversational share (rest IVR/OBD/robocalls)
    conn = tri(0.35, 0.50, 0.65)                    # [l3] connect rate used in l3's check
    mins = tri(1.0, 1.6, 2.5)                       # [vend anchor] Callyzer 1.6 min avg connected call
    ins_share_1600 = tri(0.10, 0.20, 0.30)          # [asm] insurance share of 1600 traffic (removed to avoid double count)
    midmkt = tri(0.15, 0.30, 0.50)                  # [asm] share outside the top ~50 banks/NBFCs/insurers and G2C
    pool_1600 = calls_1600 * conv * conn * mins * price_min / 1e7
    s2 = pool_1600 * (1 - ins_share_1600) * midmkt

    # S3: rest of post-sales outside BFSI, from l3 (bottom-up firm model) with l3v's 'probably high' haircut range
    l3mod, l3 = load_l3()
    post = ["d2c_ecom_post_purchase", "healthcare_hospitals_clinics", "diagnostics", "auto_dealers",
            "telecom_isp_retention", "utilities_billing", "k12_school_admissions_fees"]
    s3_raw = sum(l3[k]["sam"] for k in post)
    haircut = tri(0.25, 0.5, 1.0)                   # [asm] l3v: bottom-up 'probably high'; event checks 3-17x lower for D2C/auto
    s3 = s3_raw * haircut

    top_platform_share = tri(0.30, 0.45, 0.60)     # [asm anchored on prim: PB FY26 private-car NOP share 8.6% (14% incl. PoSP), 2W 11.8%,
                                                    # 18-20% of retail-health fresh business; plus InsuranceDekho/Turtlemint/RenewBuy etc.]
    s0_ex_top = s0 * (1 - top_platform_share)
    stages = [("S0 beachhead: intermediaries' renewal books (per renewal)", s0),
              ("S0 excluding the largest broker/PoSP platforms (in-house renewal ops)", s0_ex_top),
              ("S1 insurers' renewal desks ex-LIC (per renewal, insurer fees)", s1),
              ("S2 other BFSI 1600 service calls, mid-market (per minute)", s2),
              ("S3 rest of post-sales outside BFSI (l3, haircut)", s3),
              ("S0+S1 at per-minute list prices (cross-check)", s01_permin),
              ("LIC renewal book at per-minute prices (not serviceable; context)", lic_permin),
              ("All insurance renewal calling incl. LIC, per minute (ceiling)", s01_permin + lic_permin),
              ("Cumulative S0..S3 after the beachhead", s0 + s1 + s2 + s3),
              ("l3 total SAM, all 19 segments (round 1, unhaircut)", sum(v["sam"] for v in l3.values()))]
    for label, a in stages:
        rows.append(dict(stage=label, as_of="2026-10", unit="INR crore / yr", p10=round(pct(a, 10)), p50=round(pct(a, 50)),
                         p90=round(pct(a, 90))))
    with open(os.path.join(HERE, "expansion-sizing.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # ---------------- corrected TRAI comparison (l3v §7) ----------------
    td_min_1600 = calls_1600 * tri(0.35, 0.5, 0.65) * tri(0.5, 1.0, 2.0)   # l3's own top-down (all 1600 traffic, incl. IVR)
    bu_bfsi = l3["lending_collections"]["human_min"] + l3["insurance_renewals"]["human_min"] + l3["fintech_saas_onboarding"]["human_min"]
    bu_ins = l3["insurance_renewals"]["human_min"]
    inreach_share_1600 = tri(0.10, 0.25, 0.40)       # [asm] in-reach (non-giant) entities' share of national 1600 minutes
    calls_140 = 13.16e9 * 4; delivered_140 = (13.16e9 - 1.48e9) * 4   # [prim] PR 111/2026
    td_min_140 = delivered_140 * tri(0.2, 0.35, 0.5) * tri(0.3, 0.8, 1.5)
    pre = ["lending_origination", "insurance_sales", "edtech_admissions", "study_abroad", "real_estate", "solar_rooftop", "travel_hospitality"]
    bu_pre = sum(l3[k]["human_min"] for k in pre)
    inreach_share_140 = tri(0.15, 0.30, 0.50)        # [asm]
    trai = [
        ("l3 as published: bottom-up BFSI post-sales minutes / ALL national 1600 minutes", bu_bfsi / td_min_1600,
         "subset over total; must be < 1 if in-reach calls run on 1600"),
        ("corrected: bottom-up BFSI post-sales minutes / (1600 minutes x in-reach share)", bu_bfsi / (td_min_1600 * inreach_share_1600),
         "> 1 means the bottom-up seat model is high OR in-reach calling runs off-series (10-digit)"),
        ("corrected: bottom-up insurance-renewal minutes / (1600 minutes x insurance share x in-reach share)",
         bu_ins / (td_min_1600 * ins_share_1600 * inreach_share_1600),
         "IRDAI entities had to be on 1600 from 2026-02-15; Q1 FY27 is after the deadline"),
        ("l3 as published: bottom-up pre-sales minutes / ALL 140 minutes (originated)", bu_pre / (calls_140 * tri(0.2, 0.35, 0.5) * tri(0.3, 0.8, 1.5)),
         "subset over total"),
        ("corrected: bottom-up pre-sales minutes / (delivered 140 minutes x in-reach share)", bu_pre / (td_min_140 * inreach_share_140),
         "uses 11.68 bn delivered calls/qtr, not 13.16 bn originated"),
    ]
    trows = [dict(comparison=c, ratio_p10=round(pct(r, 10), 2), ratio_p50=round(pct(r, 50), 2), ratio_p90=round(pct(r, 90), 2),
                  p_ratio_gt_1=round(float(np.mean(r > 1)), 3), reading=note) for c, r, note in trai]
    trows.append(dict(comparison="context: AI-flagged suspected-spam calls per quarter (10-digit series)", ratio_p10="", ratio_p50="",
                      ratio_p90="", p_ratio_gt_1="", reading="22.99 bn/qtr vs 1.15 bn 1600 and 13.16 bn 140 [prim PR 111/2026]"))
    with open(os.path.join(HERE, "trai-reconciliation.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(trows[0].keys()))
        w.writeheader()
        w.writerows(trows)

    # ---------------- incumbent-revenue reconciliation (A15) ----------------
    # revenue in INR crore (MCA-derived via Inc42/Entrackr = read-secondary); share attributable to Indian voice-agent
    # revenue is an assumption range per company.
    inc = [
        # company, FY, revenue_cr (low, high), voice_agent_share (lo, mode, hi), source, note
        ("Exotel", "FY25", (490.5, 490.5), (0.02, 0.05, 0.10), "Entrackr/MediaNama RoC 2026-01 (l4a, l4c)", "CPaaS; telephony cost 212 Cr = 44% of costs; voicebot/AgentStream share unknown"),
        ("Gnani.ai", "FY25", (53.9, 57.0), (0.5, 0.7, 0.9), "Inc42 / Entrepreneur (l4a)", "voice AI + speech analytics; some non-India revenue"),
        ("Sarvam AI", "FY25", (29.1, 29.1), (0.1, 0.3, 0.6), "Inc42 from MCA (l4a)", "models/APIs/enterprise/government; voice agents a part"),
        ("SquadStack", "FY24", (26.5, 26.5), (0.1, 0.3, 0.5), "Inc42 (l4a)", "human + AI telecalling; AI share unknown; FY24 down 50%"),
        ("Yellow.ai", "FY25", (233.6, 235.9), (0.03, 0.08, 0.15), "Inc42 (l4a)", "global CX automation; voice x India-domestic share"),
        ("Haptik", "FY25", (156.6, 231.1), (0.02, 0.05, 0.10), "lapaasvoice (unverified) / Inc42 FY24 (l4a)", "Jio-group heavy; chat-first"),
        ("Ozonetel", "FY24", (110.3, 110.3), (0.02, 0.05, 0.10), "Inc42 (l4a)", "cloud contact centre; AI bot share unknown"),
        ("Knowlarity (Gupshup)", "FY25", (87.8, 87.8), (0.01, 0.03, 0.08), "Inc42 (l4c)", "cloud telephony"),
        ("Uniphore (India entity)", "FY24", (194.2, 194.2), (0.02, 0.06, 0.12), "Inc42 (l4a)", "global; India entity largely serves global work"),
        ("LeadSquared", "FY25", (326.2, 326.2), (0.0, 0.005, 0.02), "Entrackr RoC 2025-10 (l4c)", "CRM; Invorto voice AI new"),
        ("Bolna", "run-rate Jan 2026", (6.0, 6.0), (0.8, 0.9, 1.0), "Inc42 Jan 2026 (l4a)", "~0.5 Cr/month run-rate"),
        ("Ringg AI", "FY25", (0.905, 0.905), (0.9, 1.0, 1.0), "Inc42 (l4a)", ""),
        ("smallest.ai (India entity)", "FY25", (0.932, 0.932), (0.5, 0.8, 1.0), "Inc42 (l4a)", "parent books US revenue"),
        ("Convin", "FY24", (9.1, 9.1), (0.0, 0.05, 0.2), "Inc42 (l4a)", "QA/analytics, not agents"),
    ]
    tot = np.zeros(N); irows = []
    for name, fy, (rlo, rhi), (slo, smo, shi), src, note in inc:
        rev = RNG.uniform(rlo, rhi, N) if rhi > rlo else np.full(N, rlo)
        share = tri(slo, smo, shi)
        va = rev * share
        tot += va
        irows.append(dict(company=name, fy=fy, revenue_cr_low=rlo, revenue_cr_high=rhi, voice_agent_share_low=slo,
                          voice_agent_share_mode=smo, voice_agent_share_high=shi, implied_voice_agent_rev_cr_p50=round(pct(va, 50), 1),
                          source=src, method="read-secondary (MCA via press) x assumption share", note=note))
    l3_total = sum(v["sam"] for v in l3.values())
    l3_ins = l3["insurance_renewals"]["sam"]
    pen = tot / l3_total
    irows.append(dict(company="TOTAL implied Indian voice-agent revenue (FY24-26 mix)", fy="mixed", revenue_cr_low="", revenue_cr_high="",
                      voice_agent_share_low="", voice_agent_share_mode="", voice_agent_share_high="",
                      implied_voice_agent_rev_cr_p50=round(pct(tot, 50), 1), source="sum of rows",
                      method="computed", note=f"p10 {pct(tot, 10):.0f} / p90 {pct(tot, 90):.0f} Cr"))
    irows.append(dict(company="Implied AI penetration of l3 total SAM (revenue / SAM)", fy="", revenue_cr_low="", revenue_cr_high="",
                      voice_agent_share_low="", voice_agent_share_mode="", voice_agent_share_high="",
                      implied_voice_agent_rev_cr_p50=round(100 * pct(pen, 50), 2), source="", method="computed (percent)",
                      note=f"p10 {100 * pct(pen, 10):.2f}% / p90 {100 * pct(pen, 90):.2f}%"))
    irows.append(dict(company="Gnani+SquadStack voice revenue vs l3 insurance-renewal SAM (ratio)", fy="", revenue_cr_low="", revenue_cr_high="",
                      voice_agent_share_low="", voice_agent_share_mode="", voice_agent_share_high="",
                      implied_voice_agent_rev_cr_p50="", source="", method="computed",
                      note="not computable: neither discloses an insurance-renewal revenue split; both sell mainly to insurers, not intermediaries"))
    with open(os.path.join(HERE, "incumbent-reconciliation.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(irows[0].keys()))
        w.writeheader()
        w.writerows(irows)

    print("\n".join(f"{r['stage'][:70]:70s} {r['p10']:>7} {r['p50']:>7} {r['p90']:>7}" for r in rows))
    print()
    print("\n".join(f"{r['comparison'][:95]:95s} {r['ratio_p10']} {r['ratio_p50']} {r['ratio_p90']} P>1={r['p_ratio_gt_1']}" for r in trows))
    print()
    print(f"implied voice-agent revenue p10/p50/p90: {pct(tot, 10):.0f} / {pct(tot, 50):.0f} / {pct(tot, 90):.0f} Cr; "
          f"penetration of l3 SAM p50 {100 * pct(pen, 50):.2f}% (l3 SAM p50 {pct(l3_total, 50):.0f}); l3 ins SAM p50 {pct(l3_ins, 50):.0f}")
    chart(rows)


def chart(rows):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2, GRID, S1 = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df", "#2a78d6"
    keep = [r for r in rows if r["stage"].startswith(("S0", "S1", "S2", "S3", "All insurance"))]
    fig, ax = plt.subplots(figsize=(8.5, 3.6))
    fig.patch.set_facecolor(SURF); ax.set_facecolor(SURF)
    for i, r in enumerate(keep):
        ax.plot([r["p10"], r["p90"]], [i, i], color=S1, lw=2, solid_capstyle="round")
        ax.plot([r["p50"]], [i], "o", color=S1, ms=8, mec=SURF, mew=2)
        ax.text(r["p90"] * 1.08, i, f"p50 {r['p50']:,}", va="center", fontsize=9, color=INK2)
    ax.set_xscale("log")
    ax.set_yticks(range(len(keep)), [r["stage"].split(" (")[0] for r in keep], fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel("INR crore per year, as of 2026-10 (log scale); dot = p50, bar = p10-p90", color=INK2)
    ax.set_title("Serviceable market by expansion stage", loc="left", fontsize=12, color=INK)
    ax.grid(axis="x", color=GRID, lw=0.6)
    for s in ax.spines.values():
        s.set_color(GRID)
    ax.tick_params(colors=INK2)
    fig.tight_layout()
    os.makedirs(os.path.join(HERE, "charts"), exist_ok=True)
    fig.savefig(os.path.join(HERE, "charts", "expansion.png"), dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    main()
