"""Code Indian voice-AI / telephony / telecalling complaints with the round-1 taxonomy (l4a code/taxonomy.py),
plus a documented India supplement for wording the round-1 regexes miss (e.g. 'customer care', 'demo', 'overlapping of calls').
Inputs (raw, scraped 2026-10-17 into the session scratchpad; not copied into the repo):
  <raw>/tp/tp-*.json            Trustpilot (via Playwright, __NEXT_DATA__), up to 5 pages each, sort=recency
  <raw>/play_reviews2.json      Google Play 'See all reviews' dialog (default 'Most relevant' order), first ~40-240 per app
  data/voc-handcoded-items.csv  Reddit / Capterra.in items selected and coded by hand
Complaint rule: Trustpilot and Play items with <=3 stars; hand-coded items are complaints by selection.
Reviewer names are never written out. Usage: python3 -I code_voc.py <raw_dir> <lane_dir>"""
import csv, json, glob, os, re, sys, collections, importlib.util
RAW, LANE = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('tax', os.path.join(LANE, '..', 'l4a-competitors', 'code', 'taxonomy.py'))
tax = importlib.util.module_from_spec(spec); spec.loader.exec_module(tax)
SUPP = [  # India supplement, applied after the round-1 rules (union)
 ('SUPPORT', r"support|customer care|customer service|no response|not respond|no reply|don'?t resolve|never attend|call ?back|not reachable|follow[- ]?up|escalat"),
 ('SALES_DELIVERY', r"\bdemo\b|pilot|onboard|on-boarding|executive|promised|setup fee|set you up|activation|activate|verification|documents"),
 ('BILLING', r"refund|money|payment|paid|loot|expensive|price|cost|charge|plan\b|payout|commission|points|incentive"),
 ('TELEPHONY', r"connected wrongly|wrong connection|overlapping of calls|unable to connect|connectivity|network issue|call drop|not getting connected|calling never happens|calls? (are )?not connect"),
 ('RELIABILITY', r"glitch|not working|logs? ?out|stops|crash|compromised|hang"),
 ('ACCOUNT_UI', r"login|log in|interface|navigate|dashboard|disposition|button|refresh"),
 ('COMPLIANCE_DATA', r"spam calls?|privacy|data (leak|breach|sold|theft)|steal"),
]
SUPPC = [(c, re.compile(p, re.I)) for c, p in SUPP]
SPEC = {"LATENCY","TURN_TAKING","ASR","LANGUAGE","VOICE_TTS","TELEPHONY","TOOLS_INTEGRATION","VOICEMAIL_IVR_DTMF","SUPPORT","BILLING","SALES_DELIVERY","ACCOUNT_UI","COMPLIANCE_DATA"}
def code(text):
    # round-1 regex artefact: LATENCY's 'stall' matches 'install'; neutralise before applying the round-1 rules
    out = [c for c in tax.codes(re.sub(r'(?i)install', 'instal_', text or '')) if c != 'OTHER_QUESTION']
    # in app-store reviews 'slow'/'delay' usually means app performance or payout delay, not voice-turn latency
    if 'LATENCY' in out and not re.search(r"call|voice|awaa?z|latenc|response time|\bbot\b|agent", text or '', re.I):
        out.remove('LATENCY')
        alt = 'BILLING' if re.search(r"payout|payment|commission|points|credited", text or '', re.I) else 'ACCOUNT_UI'
        if alt not in out: out.append(alt)
    out += [c for c, rx in SUPPC if rx.search(text or '') and c not in out]
    if 'RELIABILITY' in out and any(c in SPEC for c in out) and not re.search(r"glitch|crash|not working|down\b|outage", text or '', re.I):
        out.remove('RELIABILITY')
    return out or ['OTHER_QUESTION']
PLAY = {'com.myoperatorapp':('MyOperator','Cloud telephony'), 'com.myoperator.app':('MyOperator','Cloud telephony'), 'com.myoperator.dialer':('MyOperator','Cloud telephony'),
        'com.ameyo.mobilevoiceagentapp':('Exotel (Ameyo)','CPaaS/contact centre'), 'com.ttsl.smartflo.android':('Tata Tele Business (Smartflo)','Cloud telephony'),
        'com.ttsl.smartflo.softphone':('Tata Tele Business (Smartflo)','Cloud telephony'), 'com.ozonetel.mobile.agentconsole':('Ozonetel','Contact centre'),
        'in.servetel.android.servetelv3':('Servetel','Cloud telephony'), 'com.websoptimization.callyzerbiz':('Callyzer','Telecalling analytics'),
        'app.telecrm.enterprise3.in':('TeleCRM','Telecalling CRM'), 'in.mintpro':('Turtlemint (PoSP app)','Insurance PoSP platform (buyer-side)')}
TPV = {'exotel.com':('Exotel','CPaaS/cloud telephony'), 'bolna.ai':('Bolna','Voice-agent platform (India)'), 'knowlarity.com':('Knowlarity','Cloud telephony'),
       'ozonetel.com':('Ozonetel','Contact centre'), 'tatatelebusiness.com':('Tata Tele Business (Smartflo)','Cloud telephony'), 'squadstack.com':('SquadStack','Telecalling (human+AI)'),
       'haptik.ai':('Haptik','Conversational AI'), 'yellow.ai':('Yellow.ai','Conversational AI'), 'plivo.com':('Plivo','CPaaS (India + global)'), 'smallest.ai':('Smallest.ai','Voice AI (India)'),
       'callerdesk.io':('CallerDesk','Cloud telephony'), 'telecrm.in':('TeleCRM','Telecalling CRM')}
items, fetched = [], collections.defaultdict(list)
for f in sorted(glob.glob(os.path.join(RAW, 'tp', 'tp-*.json'))):
    dom = os.path.basename(f)[3:-5]; d = json.load(open(f))
    if dom not in TPV: continue
    v, vt = TPV[dom]
    for r in d['rows']:
        fetched[v].append(r.get('stars'))
        if (r.get('stars') or 5) > 3: continue
        if dom == 'plivo.com' and r.get('country') != 'IN': continue  # keep Plivo's Indian reviewers only
        t = re.sub(r'(?i)led by their staff \w+', 'led by their staff [name]', ((r.get('title') or '') + ' | ' + (r.get('text') or '')).replace('\n', ' '))
        side = 'worker' if dom == 'squadstack.com' else 'buyer'
        items.append(dict(vendor=v, vendor_type=vt, source='Trustpilot', url=f'https://www.trustpilot.com/review/{dom}', date=(r.get('date') or '')[:10],
                          stars=r.get('stars'), side=side, text=t[:400], codes=';'.join(code(t)), method='read-primary; rule-coded (round-1 taxonomy + India supplement), spot-read', notes=f"country={r.get('country')}"))
pj = os.path.join(RAW, 'play_reviews2.json')
if os.path.exists(pj):
    for app, d in json.load(open(pj)).items():
        if app not in PLAY: continue
        v, vt = PLAY[app]
        for r in d.get('reviews', []):
            m = re.search(r'Rated (\d)', r.get('stars') or ''); st = int(m.group(1)) if m else None
            fetched[v].append(st)
            if st is None or st > 3: continue
            t = re.sub(r'\s+', ' ', r.get('text') or '')
            side = 'buyer-posp-agent' if app == 'in.mintpro' else 'buyer'
            items.append(dict(vendor=v, vendor_type=vt, source='Google Play', url=f'https://play.google.com/store/apps/details?id={app}', date=r.get('date') or '',
                              stars=st, side=side, text=t[:400], codes=';'.join(code(t)), method='read-primary; rule-coded (round-1 taxonomy + India supplement), spot-read', notes='Play default sort'))
for r in csv.DictReader(open(os.path.join(LANE, 'data', 'voc-handcoded-items.csv'))):
    fetched[r['vendor']].append(int(r['stars']) if r['stars'] else None)
    items.append(r)
OUT = os.path.join(LANE, 'voc-indian-complaints.csv')
cols = ['vendor','vendor_type','source','url','date','stars','side','text','codes','method','notes']
with open(OUT, 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); [w.writerow({k: it.get(k, '') for k in cols}) for it in items]
order = ['TELEPHONY','SUPPORT','BILLING','SALES_DELIVERY','ACCOUNT_UI','RELIABILITY','TOOLS_INTEGRATION','AGENT_BEHAVIOUR','ASR','VOICE_TTS','TURN_TAKING','LANGUAGE','LATENCY','VOICEMAIL_IVR_DTMF','COMPLIANCE_DATA','OTHER_QUESTION']
cnt = collections.defaultdict(collections.Counter); n = collections.Counter(); src = collections.defaultdict(set)
for it in items:
    n[it['vendor']] += 1; src[it['vendor']].add(it['source'])
    for c in it['codes'].split(';'): cnt[it['vendor']][c] += 1
with open(os.path.join(LANE, 'voc-indian-vendor-counts.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['vendor','n_items_fetched','n_complaints_coded','sources'] + order)
    for v in sorted(n, key=lambda x: -n[x]):
        w.writerow([v, len(fetched[v]), n[v], '+'.join(sorted(src[v]))] + [cnt[v][c] for c in order])
    tot = collections.Counter(); [tot.update(cnt[v]) for v in cnt]
    w.writerow(['ALL', sum(len(x) for x in fetched.values()), sum(n.values()), ''] + [tot[c] for c in order])
print(sum(n.values()), dict(n)); print({c: tot[c] for c in order})
