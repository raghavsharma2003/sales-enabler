"""Founder kit, round 2 (critic A12): company-level IRDAI register sample frame + stratum sizing.

Input: a directory holding the three IRDAI register pages saved as list-of-imfs.html, list-of-corporate-agents.html
and list-of-brokers.html (fetched 2026-10-17 20:08 UTC from https://irdai.gov.in/<name>).
Output (in the founder-kit folder; not under data/, which the repo .gitignore excludes):
  register-sample-frame.csv  company-level rows only, in seeded random draw order per frame
  strata.csv                      stratum counts (register, computed) and FY25 volume shares (IRDAI Handbook 2024-25)

PRIVACY: the register pages also carry addresses, phone numbers, principal-officer names and e-mails. This script
reads ONLY the registration code, the entity name, the state (IMFs), the category and the validity date, and it
refuses to write any field that looks like an e-mail or a phone number.
Run: python3 -I code/strata.py <dir-with-register-html>
"""
import csv, datetime, html, os, random, re, sys
from collections import Counter

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = datetime.date(2026, 10, 17)
SEED = 20261019


def eng(n):
    return n.split(" / ", 1)[1].strip() if " / " in n else n.strip()


def pdate(s):
    s = (s or "").strip()
    for f in ("%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y", "%d-%B-%Y"):
        try:
            return datetime.datetime.strptime(s, f).date()
        except ValueError:
            pass
    m = re.search(r"(\d{1,2})[-./](\d{1,2})[-./](\d{4})", s)
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def cells_of(name):
    t = open(os.path.join(SRC, name), encoding="utf-8", errors="ignore").read()
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        if len(cells) >= 5:
            out.append(cells)
    return out


rows = []
for c in cells_of("list-of-imfs.html"):          # 1 code, 2 name, 5 state, 13 valid upto
    rows.append(dict(register="IMF", code=c[1].split("/")[-1].strip(), name=eng(c[2]), state=eng(c[5]),
                     category="IMF", valid_upto=pdate(c[13])))
for c in cells_of("list-of-corporate-agents.html"):  # 1 CoR, 2 name, 3 type, 8 valid upto
    rows.append(dict(register="CA", code=c[1].strip(), name=eng(c[2]), state="", category=eng(c[3]),
                     valid_upto=pdate(c[8]) if len(c) > 8 else None))
for c in cells_of("list-of-brokers.html"):      # 1 CoR, 2 name, 5 category, 8 valid to
    rows.append(dict(register="BRK", code=c[1].strip(), name=eng(c[2]), state="", category=eng(c[5]),
                     valid_upto=pdate(c[8]) if len(c) > 8 else None))

BANK = re.compile(r"\bbank\b|gramin|grameen|co-?operative|sahakari|\bco-op", re.I)
NBFC = re.compile(r"financ|fincorp|finserv|fin\b|capital|credit|loan|fintech|invest|securities|leasing|housing|money|payment|cards|wealth", re.I)
INSNAME = re.compile(r"insur|assur|bima|policy|advis|consult|distribut|marketing|cover|protect|secure|risk", re.I)
for r in rows:
    r["valid_today"] = "" if r["valid_upto"] is None else ("yes" if r["valid_upto"] >= TODAY else "no")
    r["ca_kind"] = ""
    if r["register"] == "CA":
        r["ca_kind"] = "bank" if BANK.search(r["name"]) else ("nbfc_or_fin" if NBFC.search(r["name"]) else "other_non_bank")
    r["valid_upto"] = r["valid_upto"].isoformat() if r["valid_upto"] else ""

# Sample frames in seeded order (seed 20261019; the draw used for targets.csv INS-24..26 and INS-28..29)
frames = {
    "C_IMF_valid": [r for r in rows if r["register"] == "IMF" and r["valid_today"] == "yes"],
    "B_CA_nonbank_insurance_named": [r for r in rows if r["register"] == "CA" and r["ca_kind"] == "other_non_bank"
                                     and r["valid_today"] == "yes" and INSNAME.search(r["name"]) and r["category"] != "Life"],
    "A_or_D_BRK_direct_or_composite": [r for r in rows if r["register"] == "BRK" and r["category"] != "Reinsurance Broker"],
}
in_targets = set()
tpath = os.path.join(HERE, "targets.csv")
if os.path.exists(tpath):
    for t in csv.DictReader(open(tpath, encoding="utf-8")):
        for code in re.findall(r"(IMF\d+|CA\d{4}|CoR \d+)", t["size_signal"] + " " + t["verified_via"]):
            in_targets.add(code.replace("CoR ", ""))
out = []
rng = random.Random(SEED)   # ONE generator, frames shuffled in this order (IMF, CA, brokers): reproduces the draw in targets.csv
for fname, fr in frames.items():
    fr = sorted(fr, key=lambda r: r["code"])
    rng.shuffle(fr)
    for i, r in enumerate(fr, 1):
        out.append(dict(frame=fname, draw_order=i, register=r["register"], code=r["code"], name=r["name"], state=r["state"],
                        category=r["category"], valid_upto=r["valid_upto"], ca_kind=r["ca_kind"],
                        already_in_targets="yes" if r["code"] in in_targets else ""))
for r in out:
    blob = " ".join(str(v) for v in r.values())
    assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", blob), r
    assert not re.search(r"(?<!\d)(\+91[- ]?)?0?[6-9]\d{9}(?!\d)", blob.replace(r["code"], "")), r
with open(os.path.join(HERE, "register-sample-frame.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
    w.writeheader(); w.writerows(out)

c = Counter((r["register"], r["ca_kind"], r["valid_today"]) for r in rows)
def n(reg, kind=None, valid=None):
    return sum(v for (rg, k, vt), v in c.items() if rg == reg and (kind is None or k == kind) and (valid is None or vt == valid))

# FY25 channel volumes, IRDAI Handbook 2024-25 Part V (re-read by l2 round-2 verifier): T103 motor premium (INR Cr),
# T104 individual health policies, T99 individual life new-business policies.
VOL = {"motor_premium_cr": {"brokers": 49051.78, "ca_other": 5879.85, "imf": None},
       "health_policies": {"brokers": 3288653, "ca_other": 435717, "imf": 59809},
       "life_nb_policies": {"brokers": 1040922, "ca_other": 750592, "imf": 33915}}
def share(metric, key):
    d = VOL[metric]; tot = sum(v for v in d.values() if v)
    return "" if d[key] is None else round(d[key] / tot, 3)

strata = [
    dict(stratum="A", label="small/mid retail brokers", register_listed=n("BRK"), register_valid_today=n("BRK", valid="yes"),
         in_reach_firms_low=130, in_reach_firms_mode=200, in_reach_firms_high=260,
         in_reach_basis="assumption: 15-30% of 874 brokers are retail-focused and below platform scale (l3v: 791 direct brokers are mostly commercial lines)",
         motor_share_among_intermediaries=f"{share('motor_premium_cr','brokers')} (A+D together)", health_share=f"{share('health_policies','brokers')} (A+D)",
         life_share=f"{share('life_nb_policies','brokers')} (A+D)", active_targets=6, wave1=5),
    dict(stratum="B", label="non-bank corporate agents", register_listed=n("CA", "other_non_bank") + n("CA", "nbfc_or_fin"),
         register_valid_today=n("CA", "other_non_bank", "yes") + n("CA", "nbfc_or_fin", "yes"),
         in_reach_firms_low=n("CA", "other_non_bank", "yes"), in_reach_firms_mode=250,
         in_reach_firms_high=n("CA", "other_non_bank", "yes") + n("CA", "nbfc_or_fin", "yes"),
         in_reach_basis="computed: valid non-bank CAs by name heuristic (other non-bank = low; + NBFC/finance CAs = high); NBFC CAs mostly sell credit-linked cover to their own borrowers",
         motor_share_among_intermediaries=share("motor_premium_cr", "ca_other"), health_share=share("health_policies", "ca_other"),
         life_share=share("life_nb_policies", "ca_other"), active_targets=5, wave1=4),
    dict(stratum="C", label="IMFs", register_listed=n("IMF"), register_valid_today=n("IMF", valid="yes"),
         in_reach_firms_low=n("IMF", valid="yes"), in_reach_firms_mode=n("IMF", valid="yes"), in_reach_firms_high=799,
         in_reach_basis="computed: register entries with validity on/after 2026-10-17 (low/mode); IRDAI Handbook T98 count at 31-03-2025 = 799 (high)",
         motor_share_among_intermediaries="not separately reported (inside 'Others' in T103)", health_share=share("health_policies", "imf"),
         life_share=share("life_nb_policies", "imf"), active_targets=6, wave1=4),
    dict(stratum="D", label="large brokers and PoSP platforms", register_listed="(inside A's broker count)", register_valid_today="",
         in_reach_firms_low=12, in_reach_firms_mode=20, in_reach_firms_high=30,
         in_reach_basis="assumption: the named platforms and group/OEM-linked brokers in targets.csv plus peers",
         motor_share_among_intermediaries="(see A)", health_share="(see A)", life_share="(see A)", active_targets=3, wave1=2),
]
mode_tot = sum(s["in_reach_firms_mode"] for s in strata if s["stratum"] in "ABC")
for s in strata:
    s["firm_weight_ABC_mode"] = round(s["in_reach_firms_mode"] / mode_tot, 3) if s["stratum"] in "ABC" else "excluded from firm weights"
with open(os.path.join(HERE, "strata.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(strata[0].keys()))
    w.writeheader(); w.writerows(strata)
print("register counts:", dict(c))
for s in strata:
    print(s["stratum"], s["label"], s["register_listed"], s["register_valid_today"], s["in_reach_firms_mode"], s["firm_weight_ABC_mode"],
          s["motor_share_among_intermediaries"], s["health_share"], s["life_share"])
print("frames:", {k: len(v) for k, v in frames.items()}, "rows written:", len(out))
