#!/usr/bin/env python3
"""Scan vendor docs indexes (llms.txt, fetched 2026-10-17) for documented features.
Output: for each vendor x feature, the doc pages whose title/description match. A match is evidence the
feature is DOCUMENTED; absence is 'not found in docs index', not proof of absence. Hand review follows."""
import re, sys, json, glob, os
FEATURES = {
 "outbound_campaigns": r"campaign|batch call|bulk call|outbound call|dialing rate|dialer",
 "inbound": r"inbound",
 "warm_transfer": r"warm transfer|call transfer|transfer call|transfer the call|handoff to (a )?human|human handoff|live transfer|transfer",
 "voicemail_amd": r"voicemail|answering machine|\bamd\b|machine detection",
 "dtmf": r"dtmf|keypad|ivr navigation|digit input",
 "knowledge_base": r"knowledge base|knowledge-base|\brag\b|retrieval",
 "function_calling_tools": r"\btools?\b|function call|custom function|api tool|webhook tool|mcp",
 "crm_integrations": r"salesforce|hubspot|zoho|leadsquared|\bcrm\b|gohighlevel|highlevel|pipedrive|freshdesk|zendesk",
 "whatsapp": r"whatsapp",
 "email": r"\bemail\b|gmail|outlook|sendgrid",
 "post_call_extraction": r"post[- ]call|extraction|data collection|structured (output|data)|disposition|analysis",
 "analytics": r"analytics|dashboard|metrics|insights|reporting|boards?\b",
 "ab_testing": r"a/b|ab test|experiment|traffic split|split (call )?traffic",
 "auto_optimisation_learning": r"auto[- ]?optimi|self[- ]improv|learn(s|ing)? from (calls|conversations)|optimi[sz]e (the )?prompt|prompt optimi|auto[- ]?tun|suggestion|improv(e|ing) (your )?agent",
 "multilingual": r"language|multilingual|hindi|tamil|indic",
 "code_switching": r"code[- ]?switch|language switch|switching language|hinglish|mixed language|auto(matic)? language detection|language detection",
 "dialects": r"dialect|accent",
 "custom_cloned_voices": r"clone|cloning|custom voice|voice design|professional voice|pvc",
 "emotion": r"emotion|sentiment|expressive|empath|tone",
 "memory_across_calls": r"memory|previous call|returning caller|caller history|context from past|remember",
 "compliance_dnd_dlt_consent": r"\bdnd\b|\bdlt\b|do not (call|disturb)|\bdnc\b|tcpa|consent|calling hours|calling window|time window|compliance|opt[- ]out",
 "testing_simulation": r"\btest(s|ing)?\b|simulat|evals?\b|scenario",
 "white_label": r"white[- ]?label|reseller|agency|sub[- ]?account|rebrand",
 "on_prem_data_residency": r"on[- ]?prem|self[- ]host|data residency|residency|region|private cloud|vpc|air[- ]?gap|zero data retention",
}
LINE = re.compile(r"^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$")
def scan(path):
    out = {f: [] for f in FEATURES}
    for ln in open(path, errors="ignore"):
        m = LINE.match(ln.strip())
        if not m: continue
        title, url, desc = m.group(1), m.group(2), (m.group(3) or "")
        text = title + " :: " + desc
        for f, p in FEATURES.items():
            if re.search(p, title, re.I) or re.search(p, desc[:200], re.I):
                out[f].append((title, url))
    return out
if __name__ == "__main__":
    res = {}
    for p in sorted(glob.glob(sys.argv[1] + "/*.txt")):
        v = os.path.basename(p)[:-4]
        res[v] = scan(p)
    json.dump(res, open(sys.argv[2], "w"), indent=1)
    for v, r in res.items():
        print(v.ljust(28), " ".join(f"{f[:10]}={len(r[f])}" for f in FEATURES))
