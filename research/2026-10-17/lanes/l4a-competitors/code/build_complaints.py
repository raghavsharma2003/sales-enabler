#!/usr/bin/env python3
"""Build complaints.csv + complaint-taxonomy.csv for lane l4a-competitors.

Sources (all read 2026-10-17):
  A. Hand-transcribed review/forum complaints (Trustpilot via WebFetch, HN via Algolia API, Capterra via curl,
     Vapi/Retell community threads surfaced by search). Quotes are short excerpts as returned by the source.
  B. Retell community (Discourse) 'Support Help' topics: 688 titles from /latest.json pages 0-29 (topics
     active 2025-08-14 .. 2026-10-15), auto-coded with taxonomy.py.
  C. bolna-ai/bolna GitHub issues: 125 titles (pages 1-5 of is:issue), auto-coded.
Usage: python3 -I build_complaints.py RETELL_TOPICS_JSON RETELL_CATEGORIES_JSON OUTDIR
"""
import csv, json, sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from taxonomy import codes

HAND = [
 # vendor, source, url, date, stars, quote, codes(;), india_relevant
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2026-03-05","2","Theres a 3-5 second pause after each turn.","LATENCY","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2026-02-24","2","HIPAA-compliant voice receptionist costs $1,000 while competitors charge far less (paraphrase by fetcher)","BILLING","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2026-01-20","1","Your draft agent doesn't hold the prompt.","ACCOUNT_UI;RELIABILITY","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2025-12-11","1","VAPI has cost us $50k in damages so far from downtime","RELIABILITY;SUPPORT","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2025-11-30","1","Hidden charges the pricing they have on there platform is miss leading","BILLING","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2025-08-05","1","The system is glitchy and subpar. (also unrefunded payment)","RELIABILITY;BILLING","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2025-07-01","1","I guess I can only speak to a robot if I need any help.","SUPPORT","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2025-05-06","1","they did not work in testing like dtmf tones.","VOICEMAIL_IVR_DTMF;RELIABILITY","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2024-10-08","1","no support for UK to buy numbers","TELEPHONY","n"),
 ("Vapi","Trustpilot","https://www.trustpilot.com/review/vapi.ai","2024-07-26","1","there is no way to remove or cancel your account.","ACCOUNT_UI;BILLING","n"),
 ("Vapi","Vapi support forum","https://support.vapi.ai/t/23432400/is-someone-else-observing-issues-with-latency-and-the-ai-get","2026","","system latency shows around 575-1000ms, the actual response time during live calls is 3-4 seconds, and sometimes it goes up to 6-7 seconds (search-result excerpt)","LATENCY","n"),
 ("Vapi","Vapi support forum","https://support.vapi.ai/t/27532450/high-latency-problem-in-vapi-what-could-be-the-reason","2026","","high latency problem in vapi (thread title)","LATENCY","n"),
 ("Vapi","Vapi support forum","https://support.vapi.ai/t/22967051/latency-is-too-high-even-higher-than-30sec","2026","","Latency is too high even higher than 30sec (thread title)","LATENCY","n"),
 ("Vapi","HN comment","https://news.ycombinator.com/item?id=46189900","2025-12-08","","60-70% of our total spend was the Vapi platform fee, and only 30-40% was actual LLM/STT/TTS usage.","BILLING","n"),
 ("Vapi","HN comment","https://news.ycombinator.com/item?id=46385230","2025-12-25","","I don't like Vapi due to 1) extensive GUI driven experience, 2) cost","BILLING;ACCOUNT_UI","n"),
 ("Retell","Trustpilot","https://www.trustpilot.com/review/retellai.com","2026-07-08","1","I have an issue with retell Ai batch calling not making outbound calls but no one here to help.","TELEPHONY;SUPPORT","n"),
 ("Retell","Trustpilot","https://www.trustpilot.com/review/retellai.com","2026-03-24","3","The customer support was rather slow... the latency of the model didnt support fast paced conversations.","LATENCY;SUPPORT","n"),
 ("Retell","Trustpilot","https://www.trustpilot.com/review/retellai.com","2026-03-11","1","There is no documentation warning you about this before you spend time and money setting up your entire telephony stack.","TELEPHONY;DOCS","n"),
 ("Retell","HN comment","https://news.ycombinator.com/item?id=46083873","2025-11-28","","teams prototyping with Retell ... running into the same issues once they tried to scale: variable latency, limited visibility into call failures, and telephony behavior that depends on whichever carrier sits underneath","LATENCY;TELEPHONY;RELIABILITY","n"),
 ("Retell","HN comment","https://news.ycombinator.com/item?id=48514222","2026-06-13","","built voice-agent pipeline from scratch, cut cost ~20X vs Retell AI (resume claim)","BILLING","n"),
 ("Retell","Retell community","https://community.retellai.com/t/problem-with-stt/2713","2026-05-15","","numbers are not recognised by a Hindi agent; agent failed on a spoken digit; team: errors come from ASR provider (Deepgram default), try Soniox (search-result summary)","ASR;LANGUAGE","y"),
 ("Retell","Retell community","https://community.retellai.com/t/2502","2026-04-28","","Agent is not Switching Language even on consumer's request (title; 20 posts)","LANGUAGE","y"),
 ("Retell","Retell community","https://community.retellai.com/t/1949","2026-03-20","","Users in India cannot connect to the Retell voice agent (title)","TELEPHONY;RELIABILITY","y"),
 ("Retell","Retell community","https://community.retellai.com/t/2363","2026-04-16","","Call Transfer to India (+91) failing - retell-twilio number permission issue (title; 10 posts)","TELEPHONY","y"),
 ("Retell","Retell community","https://community.retellai.com/t/2856","2026-05-25","","Integration of Indian Language based TTS and STT providers like Sarvam AI (feature request)","LANGUAGE;VOICE_TTS","y"),
 ("Retell","Retell community","https://community.retellai.com/t/3428","2026-07-29","","Pricing for India (title)","BILLING","y"),
 ("Retell","Retell community","https://community.retellai.com/t/789","2026-02-06","","Enable Verified Caller ID (Indian Airtel Number) for Outbound Calls (title)","TELEPHONY","y"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2026-05-04","1","the technology to be fundamentally unreliable for professional use.","RELIABILITY","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2026-04-11","1","I cancelled my subscription over 5 moths ago and continue to get billed each month.","BILLING","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-12-24","1","No support.","SUPPORT","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-08-18","1","Half the platform is crippled unless you're on enterprise.","PLAN_GATING","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-08-10","1","You need to have support as well","SUPPORT","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-05-24","2","the entire rest of the platform is glitchy and doesn't work half the time","RELIABILITY","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-04-25","1","Synthflow's logos and branding remained visible throughout the platform (white-label)","WHITE_LABEL","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-03-26","1","they will not get back to me over me trying to pay them money!","SUPPORT;SALES_DELIVERY","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-03-25","1","Customer support is a complete JOKE!","SUPPORT","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2025-03-05","1","They have no customer support or anything.","SUPPORT","n"),
 ("Synthflow","Trustpilot","https://www.trustpilot.com/review/synthflow.ai","2026-05-18","1","a larger commission of $10,840.55 was marked as approved and scheduled for payout, but was never paid. (partner programme)","BILLING","n"),
 ("Bland","Trustpilot","https://www.trustpilot.com/review/bland.ai","2025-12-24","1","She said she would find my address if i call back. (consumer on the receiving end of a Bland-powered call)","AGENT_BEHAVIOUR;SAFETY","n"),
 ("Bolna","Trustpilot","https://www.trustpilot.com/review/bolna.ai","2026-05-25","1","Their customer support is absolutely terrible and the service quality is even worse.","SUPPORT;RELIABILITY","y"),
 ("Bolna","Trustpilot","https://www.trustpilot.com/review/bolna.ai","2026-03-25","1","We chased them for so many days, made payment and now they are denying to move forward and run pilot for us.","SALES_DELIVERY;BILLING","y"),
 ("Bolna","Trustpilot","https://www.trustpilot.com/review/bolna.ai","2026-02-25","1","Been trying to reach them for months regarding a refund, but there has been absolutely no response.","BILLING;SUPPORT","y"),
 ("Bolna","Trustpilot","https://www.trustpilot.com/review/bolna.ai","2026-01-23","1","Booked Demo many times since last 1 month, but not callback, no response","SALES_DELIVERY","y"),
 ("Exotel","Trustpilot","https://www.trustpilot.com/review/exotel.com","2026-09-21","1","very very very very worest customer service, dont subscripe they waste your time and money.","SUPPORT","y"),
 ("Exotel","Trustpilot","https://www.trustpilot.com/review/exotel.com","2026-04-25","1","The chat assistant is clunky. Everytime i have tried to use it, i have failed.","SUPPORT;ACCOUNT_UI","y"),
 ("Exotel","Trustpilot","https://www.trustpilot.com/review/exotel.com","2026-04-23","1","We expected much better responsiveness and professionalism, especially as a long-term client.","SUPPORT","y"),
 ("Exotel","Trustpilot","https://www.trustpilot.com/review/exotel.com","2023-06-19","1","So far one of the worst team i have communicated with. No commitment to appointments.","SUPPORT","y"),
 ("Exotel","Trustpilot","https://www.trustpilot.com/review/exotel.com","2023-06-14","1","They pick up your calls till payment only and after that you are at God's Sake","SUPPORT;SALES_DELIVERY","y"),
 ("Exotel","Capterra","https://www.capterra.com/p/233144/Exotel/reviews/?page=2","2019-2023","","Not allowed for automated calls for COD verification. Should have an ability to call DND numbers based on flow ID approved internally","COMPLIANCE_DATA;TELEPHONY","y"),
 ("Exotel","Capterra","https://www.capterra.com/p/233144/Exotel/reviews/?page=2","2019-2023","","We get billing error from a matured so called technology driven company !!!","BILLING","y"),
 ("Exotel","Capterra","https://www.capterra.com/p/233144/Exotel/reviews/?page=3","2019-2023","","Call drops - Bad customer support - Would not be able to make calls for some reason","TELEPHONY;SUPPORT","y"),
 ("Exotel","Capterra","https://www.capterra.com/p/233144/Exotel/reviews/?page=3","2019-2023","","no more option for voice hindi pronunciation","VOICE_TTS;LANGUAGE","y"),
 ("Exotel","Capterra","https://www.capterra.com/p/233144/Exotel/reviews/?page=2","2019-2023","","Call Connectivity and Some times agents can not hear the voice clearly.","TELEPHONY","y"),
 ("Yellow.ai","Trustpilot","https://www.trustpilot.com/review/yellow.ai","2025-10-19","1","I repeatedly encountered scripted or indifferent responses when trying to resolve issues.","SUPPORT","y"),
 ("Yellow.ai","Trustpilot","https://www.trustpilot.com/review/yellow.ai","2026-02-19","1","Absolutely useless.","OTHER_QUESTION","y"),
 ("Sarvam","Practitioner blog (maximem.ai)","https://www.maximem.ai/blog/voice-ai-production-india-maximem-synap","2026","","known hallucination artifact affecting its STT during silence stretches (builder-survey claim, secondary)","ASR","y"),
]

def main(topics_path, cats_path, outdir):
    rows = []
    for v, s, u, d, st, q, c, ind in HAND:
        rows.append(dict(vendor=v, source=s, url=u, date=d, stars=st, text=q, codes=c, india_relevant=ind,
                         method="read-primary (hand-coded)" if s not in ("Practitioner blog (maximem.ai)",) else "read-secondary"))
    cats = {c["id"]: c["name"] for c in json.load(open(cats_path))["category_list"]["categories"]}
    topics = json.load(open(topics_path))
    for tid, (d, cid, title, posts, views) in topics.items():
        if cats.get(cid) != "Support Help":
            continue
        ind = "y" if any(k in title.lower() for k in ("india", "+91", "hindi", "indian", "exotel", "plivo", "vobiz", "tamil", "telugu", "airtel", "upi", "telecmi")) else "n"
        rows.append(dict(vendor="Retell", source="Retell community Support Help (title)", url=f"https://community.retellai.com/t/{tid}",
                         date=d, stars="", text=title, codes=";".join(codes(title)), india_relevant=ind, method="read-primary (auto-coded title)"))
    issues = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "bolna-github-issues.tsv")
    for r in csv.DictReader(open(issues), delimiter="\t"):
        rows.append(dict(vendor="Bolna (OSS)", source="GitHub issue (title)", url=f"https://github.com/bolna-ai/bolna/issues/{r['number']}",
                         date=r["date"] + (" (closed date)" if r["date_type"] == "closed" else ""), stars="", text=r["title"],
                         codes=";".join(codes(r["title"])), india_relevant="y" if any(k in r["title"].lower() for k in ("india", "exotel", "vobiz", "multilingual", "language")) else "n",
                         method="read-primary (auto-coded title)"))
    with open(os.path.join(outdir, "complaints.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["vendor", "source", "url", "date", "stars", "text", "codes", "india_relevant", "method"])
        w.writeheader(); w.writerows(rows)
    # taxonomy counts by source block
    blocks = collections.defaultdict(collections.Counter)
    for r in rows:
        b = "hand_coded_reviews" if "hand" in r["method"] or r["method"] == "read-secondary" else ("retell_forum" if r["vendor"] == "Retell" else "bolna_github")
        for c in r["codes"].split(";"):
            blocks[b][c] += 1
    allc = sorted({c for b in blocks.values() for c in b})
    n = {b: sum(1 for r in rows if ("hand" in r["method"] or r["method"] == "read-secondary") == (b == "hand_coded_reviews") and (b == "hand_coded_reviews" or (r["vendor"] == "Retell") == (b == "retell_forum"))) for b in blocks}
    with open(os.path.join(outdir, "complaint-taxonomy.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "hand_coded_reviews(n=%d)" % n.get("hand_coded_reviews", 0), "retell_forum_support_titles(n=%d)" % n.get("retell_forum", 0),
                    "bolna_github_issue_titles(n=%d)" % n.get("bolna_github", 0), "total_mentions"])
        for c in sorted(allc, key=lambda c: -sum(b[c] for b in blocks.values())):
            w.writerow([c, blocks["hand_coded_reviews"][c], blocks["retell_forum"][c], blocks["bolna_github"][c], sum(b[c] for b in blocks.values())])
    print("rows", len(rows), "blocks", {k: sum(v.values()) for k, v in blocks.items()}, n)

if __name__ == "__main__":
    main(*sys.argv[1:4])
