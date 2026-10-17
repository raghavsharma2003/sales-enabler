"""Rule-based multi-label complaint taxonomy for voice-agent platform issues (titles or short quotes).
Codes are deliberately coarse; precision was spot-checked by hand on a 40-item sample (see report)."""
import re
RULES = [
 ("LATENCY",   r"latenc|slow|delay|lag\b|jitter|stall|takes? (too )?long|long time|seconds? (pause|before)|\d+\s?ms\b|response time|faster"),
 ("TURN_TAKING", r"interrupt|barge|turn[- ]?taking|endpoint|cut(s|ting)? off|cuts? me|talk(s|ing)? over|speak(s|ing)? over|echo|silen|not speak|stops? speak|doesn'?t speak|first message|greeting|backchannel|fragment"),
 ("ASR",       r"transcri|\bstt\b|\basr\b|recogni|mishear|misheard|accent|digit|spell|email capture|number(s)? (not|are not)|keyword|boosted|noise|denois"),
 ("LANGUAGE",  r"language|multilingual|hindi|tamil|telugu|indian lang|switch(ing)? lang|translat|arabic|spanish|portuguese|german|french|mandarin|malay|albanian|\bmulti\b"),
 ("VOICE_TTS", r"\btts\b|voice (quality|clon|sound|not match)|agent voice|pronounc|robotic|eleven ?labs|cartesia|audio quality|sounds? (weird|bad)|speed of speech|voice selection"),
 ("TELEPHONY", r"\bsip\b|one[- ]way audio|no audio|twilio|telnyx|plivo|exotel|vonage|phone number|caller id|outbound call|inbound call|dial|transfer|trunk|pstn|carrier|spam|branded call|verified|\+\d{1,3}\b|international call|call(s)? (fail|drop|not connect)|ringing|connect(ion)? (fail|issue)"),
 ("TOOLS_INTEGRATION", r"function|tool|webhook|\bapi\b|integration|custom llm|knowledge base|\bkb\b|cal\.com|hubspot|zapier|n8n|make\.com|crm|salesforce|gohighlevel|ghl|mcp|websocket"),
 ("AGENT_BEHAVIOUR", r"hallucin|not follow|ignores? (the )?prompt|prompt|conversation flow|node|transition|repeat|loop|wrong (answer|info)|end_call|hang(s)? up|ends? the call|state"),
 ("VOICEMAIL_IVR_DTMF", r"voicemail|\bivr\b|\bamd\b|answering machine|dtmf|keypad|press(ing)? (a )?digit"),
 ("BILLING",   r"bill|charg|credit|refund|payment|invoice|pric|cost|subscription|\bupi\b|cancel"),
 ("ACCOUNT_UI",r"account|kyc|verification|login|log in|dashboard|workspace|\bui\b|page|tab\b|can'?t (see|find|access)|not visible|access|org\b|permission"),
 ("RELIABILITY", r"down\b|outage|error|crash|not working|doesn'?t work|isn'?t working|fail|broken|bug|issue|problem|unexpected|unstable|500|timeout|timing out"),
 ("COMPLIANCE_DATA", r"hipaa|gdpr|soc ?2|pii|data residen|region|server(s)? in|europe|india server|compliance|consent|dnd|dlt|recording consent|privacy"),
 ("SUPPORT",   r"support team|contact support|no response from|no reply|not respond(ing)? to (my )?(email|ticket)|help ?desk|ticket|urgent|escalat|refund request"),
]
COMP = [(c, re.compile(p, re.I)) for c, p in RULES]
def codes(text):
    out = [c for c, rx in COMP if rx.search(text or "")]
    # RELIABILITY is a catch-all; drop it when a more specific technical code is present
    spec = {"LATENCY","TURN_TAKING","ASR","LANGUAGE","VOICE_TTS","TELEPHONY","TOOLS_INTEGRATION","VOICEMAIL_IVR_DTMF"}
    if "RELIABILITY" in out and any(c in spec for c in out):
        out.remove("RELIABILITY")
    return out or ["OTHER_QUESTION"]
