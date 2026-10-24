"""Bottom-up Monte Carlo sizing of Indian B2C voice-agent segments (lane l3-segments, 2026-10-17).

For each segment:
  firms_phone   = firms_in_reach x p_phone                (registry counts -> firms that run phone work)
  seats         = lognormal(p10, p90) per firm             (telecalling seats per such firm)
  minutes/seat  = talk_hours/day x days/month x 60         (same distribution as lane l2's telecaller model)
  human_spend   = firms_phone x seats x loaded_cost x 12   (the money we would displace, INR Cr/yr)
  ai_minutes    = firms_phone x seats x minutes/seat x automatable_share x 12
  SAM           = ai_minutes x price_per_min               (INR Cr/yr at today's market list prices)
  ARPA          = SAM / firms_phone                        (annual revenue per account, INR lakh)
Event-based cross-checks for D2C, insurance renewals and auto service, plus a top-down check against
TRAI's 1600-series and 140-series call volumes (PR 111/2026).

All inputs are ranges with a written source or rationale (see SEGMENTS[...]['why']). Nothing here is a
point estimate. Run: python3 -I sizing.py  -> writes sizing.csv, sizing-crosschecks.csv, sizing.json
"""
import csv, json, math, os
import numpy as np

N = 20000
RNG = np.random.default_rng(20261017)
HERE = os.path.dirname(os.path.abspath(__file__))


def tri(lo, mode, hi, n=N):
    return RNG.triangular(lo, mode, hi, n)


def logn(p10, p90, n=N):
    """Lognormal with the given 10th and 90th percentiles."""
    mu = (math.log(p10) + math.log(p90)) / 2
    sigma = (math.log(p90) - math.log(p10)) / (2 * 1.2815515655446004)
    return RNG.lognormal(mu, sigma, n)


# Shared inputs (consistent with lane l2 telecaller_model, cost-model.py lines 296-320)
TALK_H = (1.5, 2.5, 3.5)        # connected talk hours per seat per day (vendor claims 2-3 h)
DAYS = (22, 24, 26)
LOADED = (20000, 28000, 40000)  # INR/month fully loaded per seat: Apna median fixed mid ~17k (n=1,234, l2) x
                                # statutory 0-22% + seat/dialer/supervision/attrition (l2 components)
PRICE_STD = (3.0, 4.5, 8.0)     # INR per connected min, Indian list prices 2026-10-17: Sarvam 3.0-3.5 (+0.40 telephony),
                                # Bolna ~4.2-5.5, Ringg 6 all-in, SquadStack 2-5 (l2 vendor-and-telephony-prices.csv)
PRICE_D2C = (2.375, 3.0, 4.0)   # Scalysis Shopify app INR 2.375-3.3/min (apps.shopify.com/scalysis-ai-calling, read 2026-10-17)

SEGMENTS = {
    "lending_collections": dict(
        firms=(800, 1500, 3000), p_phone=(0.4, 0.6, 0.85), seats=(5, 150), auto=(0.25, 0.4, 0.6), price=(3.0, 5.0, 8.0),
        why="RBI: ~9,300 NBFCs, 7% middle layer (~650) + base-layer retail lenders, SFBs, UCBs, DLA lenders (695-1,600 apps), "
            "collection agencies; minus top ~50 with enterprise contact centres. Early-bucket reminders automatable; late bucket stays human/field."),
    "lending_origination": dict(
        firms=(1500, 3000, 6000), p_phone=(0.4, 0.6, 0.8), seats=(3, 60), auto=(0.15, 0.3, 0.5), price=PRICE_STD,
        why="Retail NBFCs + DSAs/loan aggregators (no DSA registry; RBI DSA lists are per lender). Lead follow-up on consented applications."),
    "insurance_renewals": dict(
        firms=(800, 1300, 2200), p_phone=(0.5, 0.7, 0.9), seats=(2, 80), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="IRDAI 2026-10-17: 874 brokers, 689 corporate agents, 940 IMFs, 23 web aggregators, ~60 insurers (LIC + top private excluded). "
            "Handbook 2024-25: 13th-month persistency LIC 64.1%, private median 77% (n=21); LIC 68.6 lakh lapses/yr."),
    "insurance_sales": dict(
        firms=(800, 1300, 2500), p_phone=(0.4, 0.6, 0.85), seats=(3, 100), auto=(0.15, 0.3, 0.45), price=PRICE_STD,
        why="Same IRDAI entities; telesales on inbound/aggregator leads. IRDAI distance-marketing rules + 140/1600 split apply."),
    "edtech_admissions": dict(
        firms=(8000, 15000, 30000), p_phone=(0.3, 0.5, 0.7), seats=(2, 40), auto=(0.25, 0.35, 0.5), price=PRICE_STD,
        why="AISHE 2023-24: 46,468 colleges, 70% private unaided (32,513) + coaching institutes (no registry) + edtechs; "
            "in reach = those running admission counselling teams."),
    "study_abroad": dict(
        firms=(2000, 4000, 9000), p_phone=(0.6, 0.75, 0.9), seats=(1, 25), auto=(0.2, 0.35, 0.5), price=PRICE_STD,
        why="No registry for consultants. Demand falling: BoI outbound students 9.08 lakh (2023) -> 6.26 lakh (2025)."),
    "k12_school_admissions_fees": dict(
        firms=(15000, 30000, 50000), p_phone=(0.3, 0.5, 0.7), seats=(0.5, 4), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="UDISE+ 2024-25: 339,583 private unaided schools; 5-15% have scale for admission/fee calling (chains, >1,000 students). Seasonal."),
    "real_estate": dict(
        firms=(8000, 14000, 23000), p_phone=(0.6, 0.75, 0.9), seats=(2, 50), auto=(0.25, 0.35, 0.5), price=PRICE_STD,
        why="CREDAI 13,000+ developers; RERA 1,16,117 projects / 82,755 agents (Nov 2023). In reach: developers with live projects + larger channel partners."),
    "d2c_ecom_post_purchase": dict(
        firms=(13000, 20000, 30000), p_phone=(0.3, 0.45, 0.6), seats=(0.5, 15), auto=(0.5, 0.65, 0.8), price=PRICE_D2C,
        why="Shiprocket UDRHP: 10,005 Power Merchants (>100 orders/month) FY25 on one aggregator; x1.3-3 for other aggregators/own logistics. "
            "WhatsApp utility message INR 0.115 is the cheaper first touch."),
    "healthcare_hospitals_clinics": dict(
        firms=(12000, 22000, 38000), p_phone=(0.4, 0.6, 0.8), seats=(1, 40), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="HFR 5.47 lakh facilities (Aug 2026), 4,650 NABH hospitals (Dec 2024), 3.6 lakh clinics (mostly 1-doctor). In reach: hospitals + clinic chains."),
    "diagnostics": dict(
        firms=(3000, 7000, 15000), p_phone=(0.4, 0.6, 0.8), seats=(1, 30), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="No NABL medical-lab count found; organised chains + standalone labs with home collection. Big chains (Lal, Metropolis, Thyrocare) in-house."),
    "auto_dealers": dict(
        firms=(12000, 15000, 18000), p_phone=(0.7, 0.85, 0.95), seats=(1, 20), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="FADA: 15,000+ dealerships, 30,000+ outlets; CRE/service-reminder teams are standard; OEM DMS integration."),
    "travel_hospitality": dict(
        firms=(5000, 10000, 20000), p_phone=(0.3, 0.45, 0.6), seats=(1, 25), auto=(0.2, 0.3, 0.5), price=PRICE_STD,
        why="No registry count fetched; organised agencies/tour operators + independent mid-size hotels; seasonal."),
    "telecom_isp_retention": dict(
        firms=(300, 600, 900), p_phone=(0.4, 0.6, 0.8), seats=(1, 30), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="TRAI: ~1,520 broadband operators report, but top 5 hold 98.6% of subscribers (Mar 2026). Only regional ISPs/cable are in reach."),
    "fintech_saas_onboarding": dict(
        firms=(500, 1200, 2500), p_phone=(0.4, 0.6, 0.8), seats=(2, 80), auto=(0.3, 0.45, 0.6), price=PRICE_STD,
        why="Mid-size consumer fintech/broking/app companies (giants excluded). KYC completion, activation, first-transaction nudges."),
    "solar_rooftop": dict(
        firms=(5000, 9000, 15000), p_phone=(0.5, 0.7, 0.9), seats=(1, 15), auto=(0.3, 0.4, 0.5), price=PRICE_STD,
        why="PM Surya Ghar: 8,000+ vendors (2024), target 25,000; scheme ends FY2026-27, so the pool is time-limited."),
    "utilities_billing": dict(
        firms=(50, 100, 150), p_phone=(0.3, 0.5, 0.7), seats=(10, 300), auto=(0.3, 0.5, 0.7), price=PRICE_STD,
        why="DISCOMs, city-gas and water utilities; mostly state-owned; 1601 series allocated to utilities from 2026-08-10 (TRAI)."),
    "matrimony_fitness_misc": dict(
        firms=(3000, 8000, 20000), p_phone=(0.2, 0.35, 0.5), seats=(0.5, 5), auto=(0.2, 0.35, 0.5), price=PRICE_STD,
        why="Marriage bureaus, gyms, salons/wellness chains; matrimony portals themselves are concentrated and in-house."),
}
NOT_SIZED = {"political_government_outreach": "Seasonal (election cycles), reputational and IT-Rules synthetic-audio disclosure exposure; volumes not observable from primary data."}


def pct(a, q):
    return float(np.percentile(a, q))


def run():
    talk = tri(*TALK_H); days = tri(*DAYS); min_seat = talk * 60 * days
    loaded = tri(*LOADED)
    out, sims = [], {}
    for name, s in SEGMENTS.items():
        firms = tri(*s["firms"]); p = tri(*s["p_phone"]); seats = logn(*s["seats"])
        auto = tri(*s["auto"]); price = tri(*s["price"])
        fp = firms * p
        seats_tot = fp * seats
        human_min = seats_tot * min_seat * 12
        human_spend = seats_tot * loaded * 12 / 1e7
        ai_min = human_min * auto
        sam = ai_min * price / 1e7
        arpa = (seats * min_seat * auto * 12 * price) / 1e5  # INR lakh per account per year
        sims[name] = dict(sam=sam, human_min=human_min, ai_min=ai_min, seats=seats_tot)
        row = dict(segment=name, firms_in_reach_mode=s["firms"][1], firms_phone_p50=round(pct(fp, 50)),
                   seats_total_p10=round(pct(seats_tot, 10)), seats_total_p50=round(pct(seats_tot, 50)), seats_total_p90=round(pct(seats_tot, 90)),
                   human_spend_cr_p10=round(pct(human_spend, 10)), human_spend_cr_p50=round(pct(human_spend, 50)), human_spend_cr_p90=round(pct(human_spend, 90)),
                   ai_min_bn_p50=round(pct(ai_min, 50) / 1e9, 3),
                   sam_cr_p10=round(pct(sam, 10)), sam_cr_p50=round(pct(sam, 50)), sam_cr_p90=round(pct(sam, 90)),
                   arpa_lakh_p25=round(pct(arpa, 25), 2), arpa_lakh_p50=round(pct(arpa, 50), 2), arpa_lakh_p75=round(pct(arpa, 75), 2),
                   monthly_ticket_inr_p50=round(pct(arpa, 50) * 1e5 / 12),
                   why=s["why"])
        out.append(row)
    for name, why in NOT_SIZED.items():
        out.append(dict(segment=name, why="NOT SIZED: " + why))
    return out, sims, min_seat


def crosschecks(sims):
    rows = []
    # 1. D2C event-based: direct-commerce GMV / AOV -> orders; COD share; calls for COD confirm and NDR
    gmv = tri(58800, 66000, 74700) * 1e7         # INR, Redseer via Shiprocket UDRHP (CY2024)
    aov = tri(700, 1000, 1500)                   # INR per order (assumption; no primary D2C AOV found)
    orders = gmv / aov
    cod = tri(0.40, 0.55, 0.70)                  # Meesho 72-77% is a marketplace ceiling; D2C lower (assumption)
    call_share = tri(0.15, 0.30, 0.50)           # COD orders that still need a voice call after WhatsApp/IVR
    ndr = tri(0.05, 0.10, 0.18)                  # failed first attempt share; Meesho COD success 77.7% => ~22% COD fail
    ndr_call = tri(0.5, 0.75, 1.0)
    mins = tri(0.6, 0.94, 1.5)                   # Scalysis plan: 2,828 min ~ 100 calls/day => ~0.94 min/call
    ai_min = orders * (cod * call_share + ndr * ndr_call) * mins
    sam = ai_min * tri(*PRICE_D2C) / 1e7
    rows.append(dict(check="D2C event-based (orders x COD/NDR calls)", metric="SAM INR Cr/yr", p10=pct(sam, 10), p50=pct(sam, 50), p90=pct(sam, 90),
                     bottom_up_p50=pct(sims["d2c_ecom_post_purchase"]["sam"], 50)))
    # 2. Insurance renewals event-based: private individual new life policies 92.4 lakh/yr (IRDAI Table 9)
    new_priv = 92.39e5
    in_pp = new_priv * tri(3.0, 4.5, 6.0)        # policies in premium-paying status (avg 3-6 years of cohorts surviving)
    health = tri(1.5e7, 2.5e7, 3.5e7)            # retail health policies renewing yearly (assumption; handbook table not parsed)
    motor_via_intermediary = tri(1.0e7, 2.0e7, 3.5e7)  # motor renewals handled by brokers/aggregators/dealers (assumption)
    at_risk_called = tri(0.15, 0.3, 0.5)          # share of due renewals that get a phone follow-up
    calls_each = tri(1.5, 2.5, 4.0); m = tri(1.5, 2.5, 3.5)
    ai_share = tri(0.3, 0.45, 0.6)
    ai_min = (in_pp + health + motor_via_intermediary) * at_risk_called * calls_each * m * ai_share
    sam = ai_min * tri(*PRICE_STD) / 1e7
    rows.append(dict(check="Insurance renewals event-based (policies due x follow-up calls)", metric="SAM INR Cr/yr", p10=pct(sam, 10), p50=pct(sam, 50), p90=pct(sam, 90),
                     bottom_up_p50=pct(sims["insurance_renewals"]["sam"], 50)))
    # 3. Auto service reminders event-based: FADA 2025 retail 2.82 Cr vehicles (PV 44.75 lakh)
    pv_parc = 44.75e5 * tri(3, 4, 5) * tri(0.5, 0.6, 0.7)    # PVs within dealer-service window, retained
    tw_parc = 2.0e7 * tri(2, 3, 4) * tri(0.3, 0.4, 0.5)     # 2W retained at authorised workshops
    reminders = pv_parc * tri(2, 2.5, 3) + tw_parc * tri(1.5, 2, 3)
    m = tri(0.8, 1.2, 1.8); ai_share = tri(0.3, 0.45, 0.6); calls_each = tri(1.0, 1.4, 2.0)
    ai_min = reminders * calls_each * m * ai_share
    sam = ai_min * tri(*PRICE_STD) / 1e7
    rows.append(dict(check="Auto service reminders event-based (vehicle parc x reminders)", metric="SAM INR Cr/yr", p10=pct(sam, 10), p50=pct(sam, 50), p90=pct(sam, 90),
                     bottom_up_p50=pct(sims["auto_dealers"]["sam"], 50)))
    # 4. Top-down: TRAI 1600-series (BFSI service/transactional) 1.15 bn calls/quarter (PR 111/2026)
    calls = 1.15e9 * 4
    conn = tri(0.35, 0.5, 0.65); avg = tri(0.5, 1.0, 2.0)   # many are IVR/OBD robocalls (short)
    td_min = calls * conn * avg
    bu = sims["lending_collections"]["human_min"] + sims["insurance_renewals"]["human_min"] + sims["fintech_saas_onboarding"]["human_min"]
    rows.append(dict(check="Top-down TRAI 1600-series connected minutes vs bottom-up BFSI post-sales human minutes (in-reach firms only)", metric="bn min/yr",
                     p10=pct(td_min, 10) / 1e9, p50=pct(td_min, 50) / 1e9, p90=pct(td_min, 90) / 1e9, bottom_up_p50=pct(bu, 50) / 1e9))
    # 5. Top-down: 140-series promotional 13.16 bn calls/quarter vs bottom-up pre-sales human minutes
    calls = 13.16e9 * 4; conn = tri(0.2, 0.35, 0.5); avg = tri(0.3, 0.8, 1.5)
    td_min = calls * conn * avg
    pre = ["lending_origination", "insurance_sales", "edtech_admissions", "study_abroad", "real_estate", "solar_rooftop", "travel_hospitality"]
    bu = sum(sims[k]["human_min"] for k in pre)
    rows.append(dict(check="Top-down TRAI 140-series promotional connected minutes vs bottom-up pre-sales human minutes (in-reach firms only)", metric="bn min/yr",
                     p10=pct(td_min, 10) / 1e9, p50=pct(td_min, 50) / 1e9, p90=pct(td_min, 90) / 1e9, bottom_up_p50=pct(bu, 50) / 1e9))
    for r in rows:
        r["ratio_bottom_up_to_check_p50"] = r["bottom_up_p50"] / r["p50"] if r["p50"] else None
    return rows


if __name__ == "__main__":
    out, sims, min_seat = run()
    keys = list(out[0].keys())
    with open(os.path.join(HERE, "sizing.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader()
        for r in out:
            w.writerow({k: r.get(k, "") for k in keys})
    cc = crosschecks(sims)
    with open(os.path.join(HERE, "sizing-crosschecks.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(cc[0].keys())); w.writeheader()
        for r in cc:
            w.writerow({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()})
    tot_sam = sum(s["sam"] for s in sims.values())
    tot_human = sum(s["human_min"] for s in sims.values())
    summary = dict(n=N, seed=20261017, minutes_per_seat_p50=pct(min_seat, 50),
                   total_sam_cr=dict(p10=pct(tot_sam, 10), p50=pct(tot_sam, 50), p90=pct(tot_sam, 90)),
                   total_human_minutes_bn=dict(p50=pct(tot_human, 50) / 1e9))
    json.dump(dict(summary=summary, segments=out, crosschecks=cc), open(os.path.join(HERE, "sizing.json"), "w"), indent=1, default=float)
    print(json.dumps(summary, indent=1, default=float))
    for r in out:
        if "sam_cr_p50" in r:
            print(f"{r['segment']:30s} firms_phone={r['firms_phone_p50']:>7} seats p50={r['seats_total_p50']:>8} human Cr p50={r['human_spend_cr_p50']:>7} SAM Cr p10/50/90={r['sam_cr_p10']}/{r['sam_cr_p50']}/{r['sam_cr_p90']} ARPA lakh p50={r['arpa_lakh_p50']} ticket/mo={r['monthly_ticket_inr_p50']}")
    for r in cc:
        print(r["check"][:70], {k: round(v, 2) for k, v in r.items() if isinstance(v, float)})
