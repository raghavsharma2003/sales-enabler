"""Keyword-code Trustpilot reviews of Indian CRM / CPaaS / WhatsApp-BSP incumbents.
Input: Trustpilot JSON dumps scraped 2026-10-17 (tp-*.json, sort=recency, up to 3 pages each).
Output: data/incumbent-complaints.csv (one row per review <=2 stars) and data/incumbent-complaint-summary.csv.
Method: regex rules below, spot-checked by reading every low-star review (see report). Not a sample of all
customers: Trustpilot over-represents angry and non-Indian users; treat shares as a complaint *taxonomy*, not rates."""
import json, glob, re, csv, sys, os, collections
RAW = sys.argv[1]; OUT = sys.argv[2]
RULES = {
 'SUPPORT_SLOW_OR_ABSENT': r"support|no response|not respond|respon|reply|no one|nobody|call support|customer service|ticket|helpdesk|help desk",
 'BILLING_REFUND_CANCEL': r"refund|cancel|charged|charge again|renewal|invoice|billing|money back|keep taking|extortion|wallet",
 'MISSELLING_PROMISES': r"promis|misled|mislead|sales ?person|executive|fake|false|as promised|commit",
 'BUGS_RELIABILITY_DOWNTIME': r"bug|down ?time|not work|doesn't work|does not work|never worked|broken|fail|error|data loss|destroy",
 'INTEGRATION_API': r"integrat|api|webhook|connect",
 'PRICING_HIDDEN_COSTS': r"expensive|pricing|price|costly|hidden|additional credits|additional payment|too high|shady",
 'UX_COMPLEXITY': r"clunky|confus|unintuitive|messy|difficult to understand|hard to|complicated|counter intuitive",
 'AI_QUALITY': r"\bai\b|chatbot|bot ",
 'META_WHATSAPP_ACCOUNT': r"meta|blue tick|whatsapp business account|number|template",
 'VOICE_CALL_QUALITY': r"could not hear|call function|calling|voice agent|ivr",
 'IMPLEMENTATION_DELAY': r"implement|onboard|months|weeks|activated|activation|setup|set up",
}
rows=[]
for f in sorted(glob.glob(os.path.join(RAW,'tp-*.json'))):
    for r in json.load(open(f)):
        if (r.get('stars') or 5) > 2: continue
        t = ((r.get('title') or '') + ' ' + (r.get('text') or '')).lower()
        codes = [k for k,p in RULES.items() if re.search(p,t)]
        rows.append({'vendor': r['domain'], 'source':'Trustpilot', 'url': r['url'].split('?')[0], 'date': (r.get('date') or '')[:10],
                     'stars': r.get('stars'), 'country': r.get('country'), 'text': (r.get('title') or '') + ' | ' + (r.get('text') or '').replace('\n',' ')[:600],
                     'codes': ';'.join(codes) or 'OTHER', 'method':'read-primary; regex-coded + read'})
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT,'incumbent-complaints.csv'),'w',newline='') as fh:
    w=csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
cnt=collections.defaultdict(collections.Counter); n=collections.Counter()
for r in rows:
    n[r['vendor']]+=1
    for c in r['codes'].split(';'): cnt[r['vendor']][c]+=1
codes=list(RULES)+['OTHER']
with open(os.path.join(OUT,'incumbent-complaint-summary.csv'),'w',newline='') as fh:
    w=csv.writer(fh); w.writerow(['vendor','n_low_star_reviews']+codes)
    for v in sorted(n, key=lambda x:-n[x]): w.writerow([v,n[v]]+[cnt[v][c] for c in codes])
    tot=collections.Counter(); [tot.update(cnt[v]) for v in cnt]
    w.writerow(['ALL',sum(n.values())]+[tot[c] for c in codes])
print(sum(n.values()), dict(n)); print({c:tot[c] for c in codes})
