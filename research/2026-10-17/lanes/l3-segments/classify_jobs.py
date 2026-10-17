"""Classify Apna telecalling-type job postings into VP candidate segments.

Input : JSONL produced by the Apna crawler (one job per line; fields title, company, skills, text,
        min/max salary, fixed salary, no_of_openings, job_category, city, date_posted, slug).
Output: job-posts-classified.csv (one row per posting; employer name replaced by a 10-char hash; job text
        not copied), job-posts-by-segment.csv (aggregates).

Method (rules, not a model):
  1. Telecalling-type filter: the title or Apna job_category must name a phone role
     (telecaller, telesales, tele, voice process, BPO, call centre, customer support/care,
     inside sales, counsellor, CRE, collection/recovery executive, ...). Field-sales titles are excluded.
  2. Segment = first keyword set (priority order below) that matches title + company + skills + text.
  3. Rows that match no industry keyword are 'unspecified_bpo_or_unknown'.
Validated by a hand-labelled random sample (see validate_sample()).
Usage: python3 -I classify_jobs.py <apna_jobs.jsonl> <outdir>
"""
import csv, json, re, sys, os, statistics as st, random, hashlib
from collections import Counter, defaultdict

PHONE_ROLE = re.compile(
    r"tele|voice process|\bbpo\b|call ?cent|calling|caller|customer (support|care|service|relationship)|"
    r"inside sales|counsell?or|\bcre\b|collection|recovery|chat ?process|helpdesk|help desk|"
    r"inbound|outbound|appointment|front office|patient (care )?coordinator|relationship executive|"
    r"lead (generation|qualification)|sales (executive|associate|representative)", re.I)
FIELD_ONLY = re.compile(r"field (sales|executive|officer|collection|job)|delivery (boy|partner|executive)|driver|"
                        r"\bmanager\b|\bhead\b|vice president|\bvp\b|director|team lead", re.I)

# Priority order matters: specific before generic.
SEGMENTS = [
    ("lending_collections", r"collection|recovery|overdue|\bdpd\b|delinquen|\bnpa\b|bounce|debt|repayment"),
    ("study_abroad", r"study abroad|overseas education|\bielts\b|\bpte\b|student visa|abroad|immigration"),
    ("insurance", r"insurance (sales|advisor|telecall|agent|broker|policies|products|plans|company|marketing|renewal)|"
                  r"(sell|selling|life|motor|term|general) insurance|policy ?bazaar|\bposp\b|\birda|bima|"
                  r"policy (renewal|sales)|(life|general|health) insurance (company|limited|ltd)"),
    ("lending_origination", r"\bloans?\b|credit card|\bnbfc|\bdsa\b|fincorp|fintech|lending|banking/loan|"
                            r"\bemi\b|mortgage|\blap\b|gold loan|credit line"),
    ("solar", r"solar|rooftop|surya ghar"),
    ("real_estate", r"real ?estate|realty|realtor|propert|builders?\b|\bplots?\b|\bflats?\b|villa|"
                    r"site visit|channel partner|infratech|apartment|township"),
    ("edtech_admissions", r"admission|academic|edtech|educat(ion|ional) (counsell?or|consultant|sales|services|institute|company)|"
                          r"students?\b|\bcourses?\b|academy|institute|universit|college|coaching|school|tuition|"
                          r"\bupsc\b|\bneet\b|\bjee\b|e-?learning|career counsell?or|enrol"),
    ("diagnostics", r"diagnostic|patholog|\blabs?\b|blood test|health check|radiolog|scan"),
    ("healthcare", r"hospital|clinic|patient|doctor|dental|\bivf\b|fertility|health ?care|medical|ayurved|"
                   r"hair transplant|dermat|skin|physio|homeopath|wellness|pharma"),
    ("auto", r"automobile|(car|bike|vehicle|two[- ]wheeler|auto) (showroom|dealer|dealership|service|sales)|motors\b|"
             r"service advisor|test drive|maruti|hyundai|toyota|honda cars|tata motors"),
    ("travel_hospitality", r"travel|tour|holiday|hotel|resort|flight|airline|ticket|tourism|vacation|"
                           r"timeshare|club mahindra"),
    ("telecom_isp", r"broadband|internet|fib(er|re)|\bisp\b|airtel|\bjio\b|vodafone|\bvi\b|\bdth\b|telecom|"
                    r"\bsim\b|wifi"),
    ("d2c_ecom", r"e-?commerce|order confirmation|\bcod\b|\bndr\b|\brto\b|shopify|\bd2c\b|online store|"
                 r"amazon|flipkart|meesho|myntra|online shopping|product orders?"),
    ("fintech_saas_onboarding", r"demat|trading account|stock ?brok|mutual fund|\bkyc\b|wealth|invest|"
                                r"share market|trading"),
    ("matrimony", r"matrimon|shaadi|marriage bureau|rishta"),
    ("fitness_beauty", r"\bgym\b|fitness|yoga|salon|beauty|spa\b|slimming|weight loss"),
    ("b2b_sales", r"\bb2b\b|business development|saas|software|\bit services|digital marketing|\bseo\b|"
                  r"website|lead generation|crm|erp|advertis|marketing agency|logistics|courier|freight|"
                  r"export|import|manufactur|wholesale|distribut|industrial|machin"),
]
SEG_RE = [(s, re.compile(p, re.I)) for s, p in SEGMENTS]
UNKNOWN = "unspecified_bpo_or_unknown"


def clean_title(t):
    if not t:
        return ""
    return re.split(r"\\u0026|&area=|\\\\", t)[0].strip()


def classify(r):
    title = clean_title(r.get("title"))
    cat = r.get("job_category") or ""
    phone = bool(PHONE_ROLE.search(title) or PHONE_ROLE.search(cat))
    if FIELD_ONLY.search(title) and not re.search(r"tele|call|voice|bpo|counsel", title, re.I):
        phone = False
    t = r.get("text") or ""
    i, j = t.find("Job Description"), t.find("Job role")
    desc = t[i:j] if (i >= 0 and j > i) else (t[i:i + 2500] if i >= 0 else "")
    blob = " ".join([title, r.get("company") or "", cat, " ".join(r.get("skills") or []), desc])
    seg = UNKNOWN
    if re.search(r"\bb2b\b|just ?dial|indiamart|business (clients|owners)|franchise", title + " " + (r.get("company") or "") + " " + desc[:400], re.I):
        seg = "b2b_sales"
    for s, rx in SEG_RE:
        if seg != UNKNOWN:
            break
        if rx.search(title) or rx.search(r.get("company") or "") or rx.search(cat):
            seg = s
            break
    if seg == UNKNOWN and re.search(r"insurance", (r.get("company") or "") + " " + title, re.I):
        seg = "insurance"
    if seg == UNKNOWN and re.search(r"financ|capital|fincorp|\bbank\b", r.get("company") or "", re.I):
        seg = "lending_origination"
    if seg == UNKNOWN and re.search(r"international voice|\bbpo\b|voice process", title, re.I) and not desc:
        return phone, UNKNOWN, title, "unclear"
    if seg == UNKNOWN:
        for s, rx in SEG_RE:
            if rx.search(blob):
                seg = s
                break
    tc = title + " " + cat
    if POST_RE.search(title) or POST_DESC.search(desc[:1200]) or (seg == "lending_collections"):
        phase = "post_sales"
    elif PRE_RE.search(title) or SELL_DESC.search(desc[:1200]):
        phase = "pre_sales"
    else:
        phase = "unclear"
    return phone, seg, title, phase


POST_RE = re.compile(r"collection|recovery|renewal|retention|support|customer care|customer service|onboarding|\bkyc\b|"
                     r"verification|confirmation|appointment|front office|patient|\bcrm\b|service advisor|helpdesk|"
                     r"complaint|grievance|chat process|inbound|back office|operations", re.I)
POST_DESC = re.compile(r"existing (customers|policyholders|borrowers) (for|regarding) (renewal|payment|service)|renewal|overdue|payment reminder|follow up on (payments|dues)|"
                       r"customer queries|resolve (customer )?(queries|complaints)|after[- ]sales|service reminder|"
                       r"order confirmation|appointment (booking|reminder)", re.I)
SELL_DESC = re.compile(r"\bsell|sales target|convert (leads|prospects)|closing|lead generation|cold call|generate leads|"
                       r"site visit|admission|enrol|pitch", re.I)
PRE_RE = re.compile(r"sales|telesales|tele ?sales|counsell?or|admission|\blead gen|business development|marketing|"
                    r"acquisition|enrol|closing|target|conversion|pitch|sell", re.I)


def main(inp, outdir):
    rows = [json.loads(l) for l in open(inp, encoding="utf-8")]
    rows = [r for r in rows if not r.get("error")]
    out, seen = [], set()
    for r in rows:
        phone, seg, title, phase = classify(r)
        key = (title.lower(), (r.get("company") or "").lower(), r.get("city"))
        dup = key in seen
        seen.add(key)
        mid = None
        if r.get("fixed_min_salary") and r.get("fixed_max_salary"):
            mid = (r["fixed_min_salary"] + r["fixed_max_salary"]) / 2
        elif r.get("min_salary") and r.get("max_salary"):
            mid = (r["min_salary"] + r["max_salary"]) / 2
        out.append(dict(path=r["path"], slug=r.get("slug"), title=title, company=r.get("company"),
                        employer_hash=hashlib.sha1((r.get("company") or "").lower().encode()).hexdigest()[:10],
                        city=r.get("city"), job_category=r.get("job_category"), phone_role=phone,
                        duplicate=dup, segment=seg, phase=phase, fixed_mid_salary=mid,
                        openings=r.get("no_of_openings"), date_posted=(r.get("date_posted") or "")[:10]))
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "job-posts-classified.csv"), "w", newline="", encoding="utf-8") as f:
        # employer names are dropped from the published file (some employers are sole proprietors' personal names)
        cols = [k for k in out[0].keys() if k != "company"]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(out)
    GENERIC = {"telecalling", "tele-caller", "telecaller", "voice-process", "customer-care"}
    res = {}
    for tag, filt in [("all", lambda o: True), ("generic_slugs", lambda o: o["slug"] in GENERIC)]:
        use = [o for o in out if o["phone_role"] and not o["duplicate"] and filt(o)]
        res[tag] = aggregate(use, os.path.join(outdir, "job-posts-by-segment.csv" if tag == "all" else "job-posts-by-segment-generic.csv"))
    n_all, n_known = res["all"]
    print("rows", len(rows), "classified", len(out), "phone-role unique", n_all, "known-industry", n_known)
    return out


def aggregate(use, path):
    agg = defaultdict(list)
    for o in use:
        agg[o["segment"]].append(o)
    n_all = len(use)
    n_known = sum(len(v) for k, v in agg.items() if k != UNKNOWN)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["segment", "postings", "share_all", "share_of_classified", "employers",
                    "median_fixed_mid_salary", "p25_salary", "p75_salary", "sum_openings_capped10",
                    "median_openings", "pre_sales_share", "post_sales_share", "unclear_share", "top_cities"])
        for seg, v in sorted(agg.items(), key=lambda kv: -len(kv[1])):
            sal = sorted(x["fixed_mid_salary"] for x in v if x["fixed_mid_salary"] and 5000 <= x["fixed_mid_salary"] <= 100000)
            op = [min(x["openings"] or 1, 10) for x in v]
            q = (lambda p: sal[int(p * (len(sal) - 1))] if sal else None)
            cities = Counter(x["city"] for x in v).most_common(3)
            w.writerow([seg, len(v), round(len(v) / n_all, 4),
                        round(len(v) / n_known, 4) if seg != UNKNOWN else "",
                        len(set((x["company"] or "").lower() for x in v)),
                        st.median(sal) if sal else "", q(0.25), q(0.75), sum(op),
                        st.median(op) if op else "",
                        round(sum(x["phase"] == "pre_sales" for x in v) / len(v), 3),
                        round(sum(x["phase"] == "post_sales" for x in v) / len(v), 3),
                        round(sum(x["phase"] == "unclear" for x in v) / len(v), 3),
                        "; ".join(f"{c}:{n}" for c, n in cities)])
    return n_all, n_known


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
