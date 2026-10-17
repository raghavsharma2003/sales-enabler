"""Score candidate segments with the weights frozen in weights.json (2026-10-17T09:02:54Z) and run the
pre-declared sensitivity checks S1-S4. Sub-scores are judgments against the written anchors; each carries a
one-line rationale and evidence links. Job-post shares come from job-posts-by-segment-generic.csv (measured).
Run: python3 -I score_segments.py  -> scorecard.csv, scorecard-sensitivity.csv
"""
import csv, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(os.path.join(HERE, "weights.json")))["weights"]
KEYS = list(W.keys())

E = {  # evidence shorthands -> URLs (all accessed 2026-10-17)
    "irdai_hb": "https://irdai.gov.in/handbook-of-indian-insurance",
    "irdai_lists": "https://irdai.gov.in/list-of-brokers",
    "irdai_1600": "https://www.trai.gov.in/sites/default/files/2025-12/Direction_16122025.pdf",
    "rbi_1600": "https://www.trai.gov.in/sites/default/files/2025-11/Direction_19112025.pdf",
    "trai_q1": "https://www.trai.gov.in/sites/default/files/2026-08/PR_No111of2026.pdf",
    "trai_3rd": "https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf",
    "trai_1601": "https://www.trai.gov.in/sites/default/files/2026-08/Direction_10082026.pdf",
    "dpdp": "https://www.trai.gov.in/sites/default/files/2024-09/DPDT_11082024.pdf",
    "rbi_recovery": "https://www.corplawupdates.in/updates/rbi-amendment-directions-recovery-agents-loan-dues-2026",
    "rbi_bajaj": "https://website.rbi.org.in/web/rbi/-/press-releases/reserve-bank-of-india-imposes-monetary-penalty-on-bajaj-finance-limited-50918",
    "rbi_itout": "https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12941",
    "fsr_fintech": "https://www.loansjagat.com/news/fintech-small-ticket-personal-loan-defaults-rose-to-6-4-percent-by-march-2026-rbi-fsr-warns",
    "crif": "https://www.crifhighmark.com/media/7364/microlend-quarterly-report-august-2026.pdf",
    "coll_vendors": "https://cxotoday.com/press-release/saarthi-ai-collaborates-with-microsoft-and-g7-cr-technologies-to-revolutionize-indias-debt-collection-industry-collects-usd-400-mn-worth-of-debts-for-20-bfsi-leaders/",
    "meesho": "https://www.bseindia.com/corporates/download/381966/IPO%20Open/6RHP_20251201135547.pdf",
    "shiprocket": "https://www.bseindia.com/corporates/download/384619/IPO%20Prior/UDRHP1_20251212214115.pdf",
    "scalysis": "https://apps.shopify.com/scalysis-ai-calling",
    "ringg_shop": "https://apps.shopify.com/ringg-ai",
    "wa_rates": "https://developers.facebook.com/docs/whatsapp/pricing/",
    "credai": "https://credai.org/",
    "rera": "https://www.business-standard.com/finance/personal-finance/record-rally-realty-project-registrations-under-rera-touch-1-16-lakh-in-2-years-123122200750_1.html",
    "acres99": "https://propnewstime.com/latestnewsstories/MzA3NDg=/99acres-revenue-rises-but-fy26-losses-persist-amid-growth-investments",
    "aishe": "https://www.deccanherald.com/education/seven-out-of-10-colleges-in-india-are-privately-managed-art-remains-most-popular-stream-aishe-report-4067474",
    "udise": "https://www.education.gov.in/sites/upload_files/mhrd/files/parliament_annexure_en/RSUQ_533_en.pdf",
    "boi_students": "https://m.greaterkashmir.com/article/steady-decline-in-indian-students-going-abroad-for-higher-education-education-ministry-tells-rs/477811",
    "hfr": "https://www.digitalhealthnews.com/india-s-state-wise-digital-health-progress-in-2026-from-scale-to-utilization-interoperability-and-connected-care",
    "noshow": "https://www.ijcmph.com/index.php/ijcmph/article/view/15981",
    "fada": "https://fada.in/about-us.php",
    "trai_bb": "https://www.trai.gov.in/sites/default/files/2026-06/PR_No.76of2026.pdf",
    "pmsg": "https://powerpeakdigest.com/mnre-deactivates-66-pm-surya-ghar-vendors/",
    "apna": "job-posts-by-segment-generic.csv (Apna crawl 2026-10-17, this lane)",
    "sizing": "sizing.csv (this lane)",
    "l1": "../l1-regulation/usecase-map.csv",
    "l2": "../l2-economics/cost-model.json",
}

# sub-scores in KEYS order: pain, spend, volume, regulatory_safety, integration_ease, sales_cycle_short, wtp, post_sales
S = {
    "insurance_renewals": dict(s=[5, 3, 3, 3, 4, 4, 4, 5], ev=["irdai_hb", "irdai_lists", "irdai_1600", "sizing", "apna"],
        why="Persistency (IRDAI Handbook 2024-25, by policy count): 13th month LIC 64.1%, private median 77% (n=21); 61st month ~50%. "
            "Each saved renewal is a premium of Rs 10k+ and a commission. Service calls to existing policyholders (1600 mandatory for IRDAI entities from 2026-02-15). "
            "In reach: 874 brokers, 689 corporate agents, 940 IMFs, 23 web aggregators; renewal lists come as spreadsheets.",
        realism="high (trust, reminders that feel personal)", incumbents="medium (SquadStack/Gnani sell to insurers; intermediaries thinly served)"),
    "real_estate": dict(s=[4, 4, 3, 3, 4, 4, 4, 1], ev=["apna", "credai", "rera", "acres99", "dpdp", "sizing"],
        why="Largest single employer of telecallers in the Apna sample; developers/brokers buy portal leads (99acres Rs 488 Cr FY26) and follow up by phone. "
            "Inquiry follow-up is consented (DPDP s.7(a) illustration is a real-estate broker; TRAI 7-day inquiry window), but cold calling is common. Lead value is high.",
        realism="high (qualification + site-visit booking is persuasion)", incumbents="medium-high (SquadStack, CRM dialers, Exotel)"),
    "edtech_admissions": dict(s=[4, 3, 3, 3, 4, 4, 3, 1], ev=["apna", "aishe", "sizing"],
        why="Admission counselling teams on inbound leads; enrolment fees Rs 20k-3L. 32,513 private-unaided colleges + coaching + edtech. "
            "Pay risk after the 2023-25 edtech downturn. Consented inquiry follow-up.",
        realism="high (counselling, parents)", incumbents="medium-high (LeadSquared ecosystem, SquadStack)"),
    "lending_collections": dict(s=[4, 3, 4, 2, 3, 2, 4, 5], ev=["fsr_fintech", "crif", "rbi_recovery", "rbi_bajaj", "rbi_1600", "rbi_itout", "coll_vendors", "apna"],
        why="Highest-volume post-sales calling; fintech small-ticket PL defaults 6.4% (Mar 2026) but MFI PAR 1-180 fell to 2.3% (Jun 2026). "
            "RBI recovery conduct (08:00-19:00, recording, agency rules from 2027-01-01), 1600-only for RBI entities, IT-outsourcing due diligence for NBFC-ML+. Crowded with AI vendors.",
        realism="low-negative (warmth can read as manipulation; disclosure scrutiny)", incumbents="high (Saarthi, Gnani, Credgenics, DPDzero, RevRag, SquadStack, CredResolve, Exotel)"),
    "lending_origination": dict(s=[3, 3, 3, 2, 3, 3, 4, 1], ev=["apna", "trai_q1", "sizing"],
        why="Loan/credit-card telesales by NBFCs and DSAs; much of it is promotional (140 series) or cold; consented applications are a subset.",
        realism="medium", incumbents="medium-high"),
    "insurance_sales": dict(s=[3, 3, 3, 2, 4, 3, 4, 1], ev=["irdai_lists", "apna", "sizing"],
        why="Telesales on aggregator/inbound leads; IRDAI distance-marketing rules (recording notice, scripts) and mis-selling exposure.",
        realism="medium", incumbents="medium-high"),
    "healthcare_hospitals_clinics": dict(s=[3, 3, 3, 4, 3, 3, 3, 4], ev=["hfr", "noshow", "apna", "sizing"],
        why="5.47 lakh HFR facilities; appointment reminders and follow-ups are service calls. No primary Indian no-show rate found (vendor 32% unverified). "
            "Job posts show hospitals/clinics hiring telecallers mostly for patient acquisition (IVF, aesthetics).",
        realism="medium-high (empathy matters with patients)", incumbents="medium-low"),
    "fintech_saas_onboarding": dict(s=[3, 3, 3, 3, 4, 3, 4, 4], ev=["apna", "sizing"],
        why="KYC completion, activation, first-transaction nudges for mid-size apps; event webhooks; RBI/SEBI overlays where regulated.",
        realism="medium", incumbents="medium"),
    "auto_dealers": dict(s=[3, 3, 3, 4, 3, 3, 3, 3], ev=["fada", "sizing", "apna"],
        why="15,000+ dealerships / 30,000+ outlets; service reminders (post) + test-drive follow-up (pre). OEM DMS limits integration; dealer margins thin.",
        realism="medium", incumbents="medium-low"),
    "d2c_ecom_post_purchase": dict(s=[3, 2, 1, 5, 5, 5, 2, 5], ev=["meesho", "shiprocket", "scalysis", "ringg_shop", "wa_rates", "sizing"],
        why="COD orders fail delivery ~22% (Meesho RHP: 77.7% vs 97.3% prepaid success, FY25) but loss per event is small (~Rs 100-250). "
            "Typical brand needs <2k min/month. Shopify apps already sell at Rs 2.4-3.3/min and WhatsApp utility messages cost Rs 0.115.",
        realism="low (transactional confirmation)", incumbents="high (Scalysis, Ringg, Caller.Digital, Shiprocket Engage, Bolna)"),
    "diagnostics": dict(s=[3, 2, 2, 4, 3, 3, 3, 4], ev=["sizing"],
        why="Home-collection booking and report follow-ups; big chains in-house; no national NABL medical-lab count found.",
        realism="medium", incumbents="medium-low"),
    "study_abroad": dict(s=[3, 3, 2, 3, 4, 5, 3, 1], ev=["boi_students", "apna", "sizing"],
        why="Founder-led consultancies, high commission per student, but outbound students fell 9.08 lakh (2023) -> 6.26 lakh (2025) per BoI.",
        realism="high", incumbents="low-medium"),
    "solar_rooftop": dict(s=[3, 3, 2, 3, 4, 5, 3, 2], ev=["pmsg", "sizing"],
        why="PM Surya Ghar vendors chase scheme applications (60-day rule) but the scheme ends FY2026-27: time-limited pool.",
        realism="medium", incumbents="low"),
    "travel_hospitality": dict(s=[2, 3, 2, 3, 3, 4, 3, 2], ev=["apna", "sizing"],
        why="Seasonal inquiry follow-up; low job-post share; OTAs (large consumer internet) excluded.",
        realism="medium", incumbents="medium"),
    "k12_school_admissions_fees": dict(s=[2, 3, 1, 4, 3, 3, 2, 3], ev=["udise", "sizing"],
        why="339,583 private unaided schools, few with phone teams; seasonal admissions + fee reminders; price-sensitive.",
        realism="medium", incumbents="low"),
    "telecom_isp_retention": dict(s=[3, 1, 2, 4, 3, 4, 2, 5], ev=["trai_bb", "sizing"],
        why="Top 5 providers hold 98.6% of broadband subscribers (Mar 2026); the in-reach regional ISP pool is tiny.",
        realism="low-medium", incumbents="low"),
    "utilities_billing": dict(s=[3, 2, 5, 5, 1, 1, 3, 5], ev=["trai_1601", "sizing"],
        why="1601 series for utilities from 2026-08-10; buyers are mostly state-owned (tenders/GeM).",
        realism="low", incumbents="medium"),
    "matrimony_fitness_misc": dict(s=[2, 1, 1, 3, 4, 5, 2, 2], ev=["sizing"],
        why="Small firms, low ticket; matrimony portals concentrated and in-house.",
        realism="medium", incumbents="low"),
    "political_government_outreach": dict(s=[2, 3, 5, 1, 4, 2, 2, 2], ev=["l1"],
        why="Bursty election-cycle volume; reputational and IT-Rules synthetic-audio disclosure exposure; payment risk; not sized.",
        realism="negative (deception risk)", incumbents="medium (robocall/IVR vendors)"),
}


def total(sc, w):
    return sum(sc[i] * w[k] for i, k in enumerate(KEYS)) / sum(w.values())


def main():
    names = list(S)
    base = {n: total(S[n]["s"], W) for n in names}
    rank = sorted(names, key=lambda n: -base[n])
    # S1: (pain x spend x ease) / regulatory_risk
    s1 = {}
    for n in names:
        sc = S[n]["s"]; ease = (sc[4] + sc[5]) / 2; risk = 6 - sc[3]
        s1[n] = sc[0] * sc[1] * ease / risk
    # S2: Dirichlet weight perturbation
    rng = np.random.default_rng(17)
    alpha = np.array([W[k] / 100 * 8 * 4 for k in KEYS])
    M = np.array([S[n]["s"] for n in names], dtype=float)
    top3 = np.zeros(len(names)); top1 = np.zeros(len(names))
    for _ in range(10000):
        w = rng.dirichlet(alpha)
        sc = M @ w
        order = np.argsort(-sc)
        top3[order[:3]] += 1; top1[order[0]] += 1
    # S3/S4
    w3 = dict(W); w3["regulatory_safety"] = 0
    w4 = dict(W); w4["regulatory_safety"] = 30
    s3 = {n: total(S[n]["s"], w3) for n in names}; s4 = {n: total(S[n]["s"], w4) for n in names}
    r = lambda d: {n: i + 1 for i, n in enumerate(sorted(d, key=lambda x: -d[x]))}
    r1, r3, r4 = r(s1), r(s3), r(s4)
    with open(os.path.join(HERE, "scorecard.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", "segment"] + KEYS + ["weighted_score_of_5", "rank_S1_multiplicative", "p_top3_S2_dirichlet",
                    "rank_S3_no_regulatory", "rank_S4_double_regulatory", "realism_leverage_flag", "incumbent_density_flag", "rationale", "evidence"])
        for i, n in enumerate(rank):
            w.writerow([i + 1, n] + S[n]["s"] + [round(base[n], 3), r1[n], round(top3[names.index(n)] / 10000, 3), r3[n], r4[n],
                        S[n]["realism"], S[n]["incumbents"], S[n]["why"], " ; ".join(E[e] for e in S[n]["ev"])])
    with open(os.path.join(HERE, "scorecard-sensitivity.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["segment", "base_score", "base_rank", "S1_value", "S1_rank", "S2_p_top1", "S2_p_top3", "S3_rank", "S4_rank"])
        for i, n in enumerate(rank):
            j = names.index(n)
            w.writerow([n, round(base[n], 3), i + 1, round(s1[n], 2), r1[n], round(top1[j] / 10000, 3), round(top3[j] / 10000, 3), r3[n], r4[n]])
    for i, n in enumerate(rank):
        j = names.index(n)
        print(f"{i+1:2d} {n:30s} {base[n]:.2f}  S1#{r1[n]:<2d} P(top3)={top3[j]/10000:.2f} S3#{r3[n]:<2d} S4#{r4[n]}")


if __name__ == "__main__":
    main()
