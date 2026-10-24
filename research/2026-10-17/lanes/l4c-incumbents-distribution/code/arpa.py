"""Computed revenue-per-customer (ARPA) for Indian CRM / CPaaS / BSP / voice-AI vendors.
ARPA = revenue / claimed customer count / 12. Every input is cited in data/arpa.csv.
These are upper bounds whenever the customer claim is a floor ("7,000+") and the revenue includes
non-India or non-subscription income. FX: INR 88 per USD (programme rule).
Run: python3 -I code/arpa.py data/arpa.csv"""
import csv, sys
FX = 88.0
rows = [
 # vendor, revenue_inr_cr_low, revenue_inr_cr_high, fy, cust_low, cust_high, rev_src, cust_src, note
 ("Bolna", 700_000*FX/1e7, 700_000*FX/1e7, "ARR Jan-2026", 1050, 1050,
  "TechCrunch 2026-01-20: ARR near $700k", "Bolna newsroom/Inc42 Jan-2026: 1,050+ paying customers", "self-serve 75% of revenue"),
 ("AiSensy", 50, 100, "FY25", 230_000, 230_000,
  "Tracxn band INR 50-100 Cr FY25 (read-secondary)", "aisensy.com/pricing 2026-10-17: 2.3L+ businesses (includes free plan)", "denominator includes free users; paying ARPA higher"),
 ("Kylas", 7.6e6*FX/1e7, 7.6e6*FX/1e7, "2025 (Latka est.)", 5_000, 13_000,
  "getlatka.com $7.6M (estimate, low)", "kylas.io 2026-10-17: '5000+' and '13,000+' on same page", "low confidence"),
 ("Zoho (suite only, global)", 7051, 7051, "FY25", 1_000_000, 1_000_000,
  "Medianama 2026-04 (RoC): Zoho suite INR 7,051 Cr", "CXOToday 2026-02-18: >1M paying customers", "global; ManageEngine excluded"),
 ("Exotel (domestic)", 416, 416, "FY25", 7_000, 7_000,
  "Entrackr 2026-01-21 (RoC): domestic services INR 416 Cr", "Exotel claim: 7,000+ enterprises (global)", "upper bound"),
 ("Ozonetel", 110.3, 110.3, "FY24", 2_500, 3_500,
  "Inc42 profile (MCA-derived) FY24 INR 110.3 Cr", "ozonetel.com partner page: 2,500 (body) vs 3,500+ (nav)", "FY25 not found"),
 ("Gupshup (global)", 350e6*FX/1e7, 350e6*FX/1e7, "FY26 (CEO)", 50_000, 50_000,
  "Inc42 2026-09-23: ~$350M FY26 per CEO", "gupshup.io: 50,000+ customers", "global, incl. messaging pass-through"),
 ("LeadSquared", 326.2, 326.2, "FY25", 1_600, 1_600,
  "Entrackr 2025-10-14 / Inc42 (RoC): INR 326 Cr", "leadsquared.com 2026-10-17: 1600+ customers", "includes international"),
 ("Gnani.ai", 53.87, 57.0, "FY25", 200, 200,
  "Inc42 / Entrepreneur (RoC-derived)", "MIT SMR India / press: 200+ enterprise clients", "enterprise BFSI"),
 ("Tally Solutions", 852, 852, "FY26 (unaudited)", 2_700_000, 2_700_000,
  "PTI/Outlook Business 2026-07-13: ~INR 852 Cr", "same: ~27 lakh customers", "licence + renewals; SMB price-point anchor"),
]
out = []
for v, rl, rh, fy, cl, ch, rs, cs, note in rows:
    lo = rl*1e7/ch/12; hi = rh*1e7/cl/12
    out.append({"vendor": v, "fy": fy, "revenue_inr_cr": f"{rl:.1f}" if rl==rh else f"{rl:.1f}-{rh:.1f}",
                "customers": f"{cl}" if cl==ch else f"{cl}-{ch}",
                "arpa_inr_per_month_low": round(lo), "arpa_inr_per_month_high": round(hi),
                "revenue_source": rs, "customer_source": cs, "note": note, "method": "computed (revenue/customers/12); inputs read-secondary or vendor-claim", "computed_on": "2026-10-17"})
with open(sys.argv[1], "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
for o in sorted(out, key=lambda x: x["arpa_inr_per_month_high"]):
    print(f'{o["vendor"]:28s} {o["arpa_inr_per_month_low"]:>9,} - {o["arpa_inr_per_month_high"]:>9,} INR/month')
