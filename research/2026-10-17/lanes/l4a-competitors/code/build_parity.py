#!/usr/bin/env python3
"""Feature parity matrix (owner idea 6) for lane l4a-competitors, built 2026-10-17.

Values: yes = documented in the vendor's own docs/API (dedicated page) or stated on its pricing page;
partial = limited, beta, add-on, via a third-party glue tool, customer-maintained only, or a homepage/marketing
claim without docs; no = vendor states it is not supported; unknown = not found in the sources read.
'unknown' is NOT 'no'. Evidence: docs indexes (llms.txt / sitemap.xml) fetched 2026-10-17 and scanned with
parity_scan.py, pages read today, and the 2026-09-22 first-party product reviews in research/2026-09-22/.
Outputs parity.csv (long: feature,vendor,value,evidence,source) and parity-wide.csv.
"""
import csv, os, sys

FEATURES = ["outbound_campaigns", "inbound", "warm_transfer", "voicemail_amd", "dtmf", "knowledge_base",
            "function_calling_tools", "crm_integrations", "whatsapp", "email", "post_call_extraction", "analytics",
            "ab_testing", "auto_optimisation_learning", "multilingual_indic", "code_switching", "dialects",
            "custom_cloned_voices", "emotion", "memory_across_calls", "compliance_dnd_dlt_consent",
            "testing_simulation", "white_label", "on_prem_india_residency"]

D = {}  # (vendor, feature) -> (value, evidence, source)
def put(v, f, val, ev, src):
    assert f in FEATURES, f
    D[(v, f)] = (val, ev, src)

# ---------------- Bolna (docs sitemap 486 URLs + llms.txt + 2026-09-22 review + OSS code)
B = "https://www.bolna.ai/docs/"
for f, val, ev, p in [
 ("outbound_campaigns", "yes", "Batch calling (CSV, schedule, up to 3 retries) + workflow campaigns API", "outbound/batch-calling"),
 ("inbound", "yes", "Inbound tab, receiving calls, caller matching from API/CSV/Sheet", "inbound/receiving-calls"),
 ("warm_transfer", "yes", "Live transfer tool; SIP trunk call transfer; pre-transfer webhook (2026-09-22 review)", "sip-trunking/call-transfer"),
 ("voicemail_amd", "partial", "Voicemail detection exists, implemented as LLM classification of transcript every 7 s up to 30 s (OSS voicemail_handler.py), not acoustic AMD", "agent-setup/call-tab"),
 ("dtmf", "yes", "inbound/dtmf, inbound/ivr pages; dtmf_enabled flag in OSS ConversationConfig", "inbound/dtmf"),
 ("knowledge_base", "yes", "RAG over PDF/URL; multilingual KB mode", "knowledge-base"),
 ("function_calling_tools", "yes", "Custom function calls, Cal.com booking, MCP server", "tool-calling/custom-function-calls"),
 ("crm_integrations", "partial", "No native CRM connector page found; CRM pushes via webhooks, workflows, Zapier/make/n8n", "agent-setup/analytics-tab"),
 ("whatsapp", "partial", "Via AiSensy node in beta Workflows and make.com tutorial; open OSS issue #1077 requests native WhatsApp", "tutorials/make-com/send-whatsapp-after-bolna-call"),
 ("email", "partial", "Via n8n/make.com tutorials", "tutorials"),
 ("post_call_extraction", "yes", "Extractions, dispositions API, call summary, custom analytics", "api-reference/dispositions/overview"),
 ("analytics", "yes", "Call analytics, call history with per-component cost/traces", "agent-setup/call-analytics"),
 ("ab_testing", "unknown", "No experiment/traffic-split page found in 486-URL sitemap", "sitemap.xml"),
 ("auto_optimisation_learning", "unknown", "None found", "sitemap.xml"),
 ("multilingual_indic", "yes", "10+ Indian languages; per-language STT/TTS/voice pipeline", "customizations/supported-languages"),
 ("code_switching", "yes", "Mid-call language switching via LLM matrix-language prompt (OSS prompts.py); Soniox/Gladia code-switching STT; Kalpa/Maya Hinglish TTS", "customizations/language-switching-behavior"),
 ("dialects", "unknown", "No dialect page; accents handled only via provider choice", "sitemap.xml"),
 ("custom_cloned_voices", "yes", "clone-voices page; ElevenLabs/Soniox voices", "clone-voices"),
 ("emotion", "partial", "Expressive controls only through TTS providers (ElevenLabs style, Cartesia); sentiment as an extraction field", "agent-setup/analytics-tab"),
 ("memory_across_calls", "partial", "Per-call context injection from caller lookup (API/CSV/Sheet); no persistent cross-call memory store in docs or OSS (memory/ has only an in-memory scalar cache); OSS issue #1078 'MemCode recall' open", "prompting/using-context"),
 ("compliance_dnd_dlt_consent", "partial", "Calling-hour guardrails (off by default, recipient timezone), compliance application (CIN+GST) before numbers, documented 140/160-series + DLT process the customer performs; no NCPR scrubbing or consent ledger found; 0 DND/DLT/TRAI terms in llms.txt", "outbound/calling-guardrails"),
 ("testing_simulation", "partial", "Graph-agent testing, 'test before calling customers', extraction tests; no synthetic-caller simulation suite found", "production/test-before-calling-customers"),
 ("white_label", "partial", "Enterprise sub-accounts with usage APIs (agency-style), no rebrand page found", "enterprise/sub-accounts"),
 ("on_prem_india_residency", "yes", "India data residency for Enterprise; routing calls through Indian servers; on-prem guide", "enterprise/data-residency"),
]:
    put("Bolna", f, val, ev, B + p)

# ---------------- Sarvam Samvaad (docs.sarvam.ai/voice-agents/llms.txt + sitemap + pricing page)
S = "https://docs.sarvam.ai/voice-agents/"
for f, val, ev, p in [
 ("outbound_campaigns", "yes", "Campaigns: cohorts, dialing rate, lifecycle", "deploy/campaigns"),
 ("inbound", "yes", "deploy/inbounds", "deploy/inbounds"),
 ("warm_transfer", "yes", "Call transfer tool; forwarding billed INR 0.40/30 s (pricing)", "build/tools/call-transfer"),
 ("voicemail_amd", "partial", "Voicemail referenced in run-time/conversation settings; pricing: voicemail counts as connected and is billed", "build/conversation-settings"),
 ("dtmf", "unknown", "No DTMF page found", "llms.txt"),
 ("knowledge_base", "yes", "build/knowledge-base", "build/knowledge-base"),
 ("function_calling_tools", "yes", "HTTPS tool, code tools, data validation, tool mocking, MCP", "build/tools"),
 ("crm_integrations", "unknown", "No CRM connector page found", "llms.txt"),
 ("whatsapp", "partial", "Samvaad WhatsApp agents (press, 2025); 'WhatsApp campaigns' listed only in Enterprise (pricing page)", "https://www.sarvam.ai/products/voice-agents/pricing"),
 ("email", "unknown", "None found", "llms.txt"),
 ("post_call_extraction", "partial", "Goals and call-log analytics; on-end hooks", "build/on-start-on-end-hooks"),
 ("analytics", "yes", "Agent analytics (connectivity, engagement, goals), boards with SQL widgets, log analyser", "monitor/agent-analytics"),
 ("ab_testing", "unknown", "Versioning exists; no traffic-split page", "build/agent/versioning"),
 ("auto_optimisation_learning", "partial", "'Building & improving agents' guide; Genie assistant builds agents; no automatic learning loop documented", "build/genie"),
 ("multilingual_indic", "yes", "11 Indian languages + English for agents (22 for APIs)", "overview"),
 ("code_switching", "yes", "Language switching in core tools / conversation settings", "build/tools/core-tools"),
 ("dialects", "partial", "Marketing: 'trained on Indian languages and dialects'; no dialect selection documented", "https://www.sarvam.ai/products/voice-agents"),
 ("custom_cloned_voices", "partial", "Speakers & voice selection; cloning not documented for agents", "build/voice-language"),
 ("emotion", "unknown", "None found", "llms.txt"),
 ("memory_across_calls", "partial", "Variables & personalization per call; no cross-call memory documented", "build/variables-personalization"),
 ("compliance_dnd_dlt_consent", "partial", "Org-wide DND suppression list (manual/bulk/API); docs warn 'Calling compliance is your responsibility' (consent, DND, telemarketing rules); no NCPR/DLT handling", "deploy/campaigns/dnd"),
 ("testing_simulation", "yes", "Test cases + run tests; simulated test run INR 2 per run (pricing)", "build/tests"),
 ("white_label", "unknown", "None found", "llms.txt"),
 ("on_prem_india_residency", "partial", "Sovereign/India-trained positioning; residency terms not documented for agents", "https://www.sarvam.ai/products/voice-agents"),
]:
    put("Sarvam Samvaad", f, val, ev, p if p.startswith("http") else S + p)

# ---------------- Gnani Inya (docs.gnani.ai llms.txt + gnani.ai homepage)
G = "https://docs.gnani.ai/"
for f, val, ev in [
 ("outbound_campaigns", "partial", "Agent builder + aggregated stats; campaign object not clearly documented"),
 ("inbound", "partial", "Enterprise contact-centre deployments (homepage); no inbound page in docs index"),
 ("warm_transfer", "partial", "Transfer referenced in stats only"),
 ("voicemail_amd", "yes", "Voicemail Detection page"),
 ("dtmf", "yes", "DTMF Collection page"),
 ("knowledge_base", "yes", "Creating a Knowledge Base; FAQ entries"),
 ("function_calling_tools", "partial", "Action logs / integrations and actions"),
 ("crm_integrations", "yes", "CRM Integration and Action page"),
 ("whatsapp", "unknown", "None found"),
 ("email", "yes", "Email Integration and Action page"),
 ("post_call_extraction", "yes", "Disposition prompt; conversation statistics"),
 ("analytics", "yes", "Call analytics pipeline; agent analytics; 100% call QA (Analytics product)"),
 ("ab_testing", "unknown", "None found"),
 ("auto_optimisation_learning", "unknown", "None found"),
 ("multilingual_indic", "yes", "'40+ languages and dialects' incl. 9 Indian languages named (homepage); own STT/TTS/S2S models"),
 ("code_switching", "yes", "Language Switch Prompt page"),
 ("dialects", "partial", "Homepage claims dialect coverage; no dialect controls in docs"),
 ("custom_cloned_voices", "yes", "Voice clone embeddings; voice-cloned TTS (REST)"),
 ("emotion", "partial", "Audio tags (TTS) and analytics; no emotion-adaptive agent behaviour documented"),
 ("memory_across_calls", "unknown", "None found"),
 ("compliance_dnd_dlt_consent", "partial", "Real-time quality & compliance monitoring (QA); SOC2/ISO27001; RBI/IRDAI residency claims; no DND/DLT dialling controls found"),
 ("testing_simulation", "yes", "Testing your agent; trigger test call"),
 ("white_label", "unknown", "None found"),
 ("on_prem_india_residency", "yes", "Cloud, private cloud, on-prem, air-gapped (homepage)"),
]:
    put("Gnani Inya", f, val, ev, G + "llms.txt ; https://gnani.ai/")

# ---------------- Smallest Atoms (docs.smallest.ai llms.txt + pricing)
M = "https://docs.smallest.ai/"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Campaigns, audiences, calls-per-second"),
 ("inbound", "yes", "SIP trunking; Alohaa (Indian telephony) integration"),
 ("warm_transfer", "yes", "Call transfer / call control pages"),
 ("voicemail_amd", "unknown", "None found"),
 ("dtmf", "unknown", "None found"),
 ("knowledge_base", "yes", "Knowledge Base page; KB $3/GB, queries $2/1K (pricing)"),
 ("function_calling_tools", "yes", "Tools library; API tool; coding-agent build"),
 ("crm_integrations", "unknown", "None found"),
 ("whatsapp", "unknown", "None found"),
 ("email", "unknown", "None found"),
 ("post_call_extraction", "yes", "Post-call metrics / analytics; logs analysis"),
 ("analytics", "yes", "Analytics, metrics overview"),
 ("ab_testing", "unknown", "None found"),
 ("auto_optimisation_learning", "unknown", "None found"),
 ("multilingual_indic", "yes", "Pulse STT 38+ languages; Lightning TTS 15+/70+ languages"),
 ("code_switching", "yes", "Language detection; Lightning v3.1 Pro"),
 ("dialects", "partial", "Voices & languages; WildASR robustness (accent/noise) page"),
 ("custom_cloned_voices", "yes", "Instant clone UI/API/SDK"),
 ("emotion", "yes", "Emotion detection in Pulse STT; listener ratings"),
 ("memory_across_calls", "unknown", "None found"),
 ("compliance_dnd_dlt_consent", "partial", "HIPAA ZDR add-on $1,000/mo, PII removal; no DND/DLT/consent controls found"),
 ("testing_simulation", "partial", "Quickstart / crew CLI testing; no simulation suite page"),
 ("white_label", "unknown", "None found"),
 ("on_prem_india_residency", "yes", "On-prem / zero-data-retention / dedicated infrastructure (docs + Enterprise pricing)"),
]:
    put("Smallest Atoms", f, val, ev, M + "llms.txt ; https://smallest.ai/pricing")

# ---------------- Ringg (docs.ringg.ai llms.txt + pricing)
RG = "https://docs.ringg.ai/"
for f, val, ev, p in [
 ("outbound_campaigns", "yes", "Campaigns, calling lists, workflows", "documentation/deploy/campaigns"),
 ("inbound", "yes", "Agent types: inbound / outbound-inbound", "documentation/build-agents/agents/agent-types.md"),
 ("warm_transfer", "yes", "System tools: call transfer", "documentation/build-agents/customize-agent-behaviour/tools/system-tools.md"),
 ("voicemail_amd", "yes", "Call settings: voicemail handling", "documentation/build-agents/customize-agent-behaviour/call-settings.md"),
 ("dtmf", "yes", "System tools: wait for keypad input", "documentation/build-agents/customize-agent-behaviour/tools/system-tools.md"),
 ("knowledge_base", "yes", "Knowledge base from files/URLs", "documentation/inventory/knowledge-base.md"),
 ("function_calling_tools", "yes", "Pre/on/post-call API tools, jq function tools, workspace tools", "documentation/build-agents/customize-agent-behaviour/tools/overview.md"),
 ("crm_integrations", "partial", "Integration tools (Google Sheets, Slack, calendars, other apps); no named CRM connector page", "documentation/inventory/tools-integrations/connect-an-app.md"),
 ("whatsapp", "yes", "WhatsApp agents + WhatsApp tools during calls; INR 2 per 5-min chat session", "documentation/build-agents/agents/whatsapp-agents/overview.md"),
 ("email", "partial", "Workflow blocks / alerts", "documentation/build-agents/workflows/block-reference.md"),
 ("post_call_extraction", "yes", "Advanced Analysis typed variables; post-call tools", "documentation/build-agents/customize-agent-behaviour/advanced-analysis.md"),
 ("analytics", "yes", "Dashboard, cohorts, advanced analytics INR 2/call", "get-started/dashboard-tour.md"),
 ("ab_testing", "yes", "Drafts and versions: split call traffic for A/B", "documentation/build-agents/test-and-improve/drafts-and-versions.md"),
 ("auto_optimisation_learning", "unknown", "None found ('context graph' only in funding PR)", "llms.txt"),
 ("multilingual_indic", "yes", "20+ languages (10 Indian) ; proprietary Parrot STT", "documentation/build-agents/customize-agent-behaviour/voice-and-language.md"),
 ("code_switching", "unknown", "Not documented as such", "llms.txt"),
 ("dialects", "unknown", "None found", "llms.txt"),
 ("custom_cloned_voices", "yes", "Voice and language: pick or clone a voice", "documentation/build-agents/customize-agent-behaviour/voice-and-language.md"),
 ("emotion", "unknown", "None found", "llms.txt"),
 ("memory_across_calls", "unknown", "None found", "llms.txt"),
 ("compliance_dnd_dlt_consent", "partial", "Calling window (default IST), per-person call caps (max 50), timezone; 0 DND/DLT/TRAI terms in docs index; homepage FAQ tells buyer consent+disclosure required", "documentation/build-agents/customize-agent-behaviour/call-settings.md"),
 ("testing_simulation", "yes", "Test an agent (phone/web call), test multi-prompt agents, Evals product (custom pricing)", "documentation/build-agents/test-and-improve/test-an-agent.md"),
 ("white_label", "unknown", "None found", "llms.txt"),
 ("on_prem_india_residency", "yes", "On-prem deployment included in Enterprise (pricing page)", "https://www.ringg.ai/pricing"),
]:
    put("Ringg", f, val, ev, p if p.startswith("http") else RG + p)

# ---------------- Ravan.ai / Agni (docs.ravan.ai llms.txt + homepage + pricing)
RV = "https://docs.ravan.ai/llms.txt ; https://www.ravan.ai"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Outbound, contacts, campaigns API"), ("inbound", "yes", "Inbound calls page"),
 ("warm_transfer", "partial", "Tools & functions (transfer not separately documented)"), ("voicemail_amd", "unknown", "None found"),
 ("dtmf", "unknown", "None found"), ("knowledge_base", "yes", "Knowledge base API"), ("function_calling_tools", "yes", "Tools & functions"),
 ("crm_integrations", "partial", "Integrations / appointments; Cal.com"), ("whatsapp", "unknown", "None found"), ("email", "unknown", "None found"),
 ("post_call_extraction", "yes", "After-call webhook, call history"), ("analytics", "yes", "Platform analytics"),
 ("ab_testing", "unknown", "None found"), ("auto_optimisation_learning", "unknown", "None found"),
 ("multilingual_indic", "yes", "Hindi, Hinglish + 28 more (homepage); Growth plan 40+ languages"),
 ("code_switching", "partial", "Hinglish claimed; not documented"), ("dialects", "partial", "'100+ languages & dialects' marketing claim (inconsistent with 40+ on pricing)"),
 ("custom_cloned_voices", "partial", "Agent voice settings"), ("emotion", "partial", "'Emotion-aware' speech-to-speech claim; analytics emotion fields"),
 ("memory_across_calls", "partial", "'Agent memory' listed in Scale plan ($497/mo) only; not documented"),
 ("compliance_dnd_dlt_consent", "partial", "Homepage claims DND/NCPR scrubbing before dialing + compliance-aligned call windows + audit trail; not in docs index"),
 ("testing_simulation", "partial", "Quickstart test flows only"), ("white_label", "unknown", "None found"),
 ("on_prem_india_residency", "partial", "Enterprise on-prem/private cloud claimed on pricing page"),
]:
    put("Ravan.ai (Agni)", f, val, ev, RV)

# ---------------- SquadStack (marketing + FAQ pages; no public docs)
SQ = "https://www.squadstack.ai/fully-managed-telecalling-for-sales-operations-teams ; https://www.squadstack.ai"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Core use: sales, collections, onboarding outbound"), ("inbound", "partial", "Support use case named"),
 ("warm_transfer", "yes", "Human advisors pod for hand-offs (managed service)"), ("crm_integrations", "yes", "'two-way CRM integrations' (claim)"),
 ("whatsapp", "partial", "Lead management & omnichannel outreach product"), ("post_call_extraction", "partial", "AI lead manager / quality audits"),
 ("analytics", "yes", "Analytics & reporting; ROI engine"), ("multilingual_indic", "yes", "9 Indian languages"),
 ("code_switching", "yes", "Claims mid-sentence switching incl. Hinglish/Taminglish; Arth ASR trained on 600M+ min Indian telephony (claim)"),
 ("memory_across_calls", "partial", "Homepage copy implies remembering context (truncated claim)"),
 ("compliance_dnd_dlt_consent", "yes", "Claims TRAI DND registry scrub + client DND lists, hard 9:30-20:30 window, consent gating, opt-out, configurable AI disclosure (vendor claim, not verified)"),
 ("on_prem_india_residency", "yes", "Models run in India; on-prem/private cloud options (claim)"),
 ("auto_optimisation_learning", "partial", "'AI + human quality audits' managed by vendor; no self-serve learning loop"),
]:
    put("SquadStack", f, val, ev, SQ)

# ---------------- Global platforms
VP = "https://docs.vapi.ai/llms.txt"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Campaigns: up to 10,000 contacts, maxConcurrency 1-500, predial webhook (2026-09-22 review)"),
 ("inbound", "yes", "Inbound support example"), ("warm_transfer", "yes", "Warm transfer modes; transfer call tool"),
 ("voicemail_amd", "yes", "Voicemail detection; voicemail tool"), ("dtmf", "yes", "Keypad input; IVR navigation"),
 ("knowledge_base", "yes", "Knowledge bases"), ("function_calling_tools", "yes", "Tools, versioned; MCP"),
 ("crm_integrations", "partial", "GoHighLevel and partner connectors; most CRMs via tools"), ("whatsapp", "unknown", "None found in docs index"),
 ("email", "partial", "Email address reading; alerts"), ("post_call_extraction", "yes", "Structured outputs; scorecards"),
 ("analytics", "yes", "Monitoring, scorecards, insights"), ("ab_testing", "yes", "Traffic splitting"),
 ("auto_optimisation_learning", "unknown", "None found"), ("multilingual_indic", "partial", "Multilingual via provider choice; no Indian-language quality claim"),
 ("code_switching", "partial", "Multilingual support page (provider-dependent)"), ("dialects", "unknown", "None found"),
 ("custom_cloned_voices", "yes", "Custom voices via ElevenLabs etc."), ("emotion", "partial", "Hume integration"),
 ("memory_across_calls", "unknown", "None found"), ("compliance_dnd_dlt_consent", "partial", "Recording consent plan, GDPR, HIPAA ($2K/mo add-on); predial webhook can re-check consent; no DND/DLT/NCPR"),
 ("testing_simulation", "yes", "Evals (text), simulations (synthetic voice), scorecards"), ("white_label", "partial", "Third-party white-label wrappers (Vapify, Voicerr) in integration list"),
 ("on_prem_india_residency", "partial", "EU region and data residency, ZDR; no India region found"),
]:
    put("Vapi", f, val, ev, VP)

RT = "https://docs.retellai.com/llms.txt"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Batch calls (+$0.005/dial), saved/draft batch runs (2026-09-22 review)"), ("inbound", "yes", "Inbound, reserved inbound concurrency"),
 ("warm_transfer", "yes", "Transfer call tool, agent transfer, warm transfer (+latency complaints in forum)"), ("voicemail_amd", "yes", "Handle voicemail and IVR"),
 ("dtmf", "yes", "Press digit / capture DTMF"), ("knowledge_base", "yes", "KB +$0.005/min"), ("function_calling_tools", "yes", "Function calling, integration tools"),
 ("crm_integrations", "yes", "Connect CRMs, calendars; GoHighLevel/HubSpot contact sync"), ("whatsapp", "unknown", "None found (forum feature request #2665)"),
 ("email", "partial", "Alerts only"), ("post_call_extraction", "yes", "Post-call analysis data"), ("analytics", "yes", "Custom dashboards, AI QA ($0.10/min)"),
 ("ab_testing", "yes", "A/B testing page"), ("auto_optimisation_learning", "partial", "AI QA metrics + 'test and improve' workflow (human in loop)"),
 ("multilingual_indic", "partial", "Multilingual mode; Hindi digit failures and no Sarvam provider (forum 2026-05)"), ("code_switching", "partial", "Forum: 'Agent is not Switching Language even on consumer's request' (2026-04)"),
 ("dialects", "unknown", "None found"), ("custom_cloned_voices", "yes", "Clone voice; custom voice"), ("emotion", "yes", "Expressive mode (emotion and emphasis)"),
 ("memory_across_calls", "yes", "Contact memory"), ("compliance_dnd_dlt_consent", "partial", "Security & compliance, data retention; TCPA guidance on site; no DND/DLT"),
 ("testing_simulation", "yes", "Test and improve agents; simulation testing"), ("white_label", "partial", "GoHighLevel agency integration; partner programme"),
 ("on_prem_india_residency", "unknown", "No residency page; Retell-managed numbers US/Canada only (2026-09-22 review)"),
]:
    put("Retell", f, val, ev, RT)

EL = "https://elevenlabs.io/docs/llms.txt"
for f, val, ev in [
 ("outbound_campaigns", "partial", "Outbound calls and batch calling exist; no campaign control plane comparable to Vapi/Bolna (2026-09-22 review)"),
 ("inbound", "yes", "Twilio/SIP inbound"), ("warm_transfer", "yes", "Transfer to number / agent transfer"), ("voicemail_amd", "yes", "Voicemail detection"),
 ("dtmf", "yes", "Play keypad touch tone; multimodal input"), ("knowledge_base", "yes", "KB / RAG (~250 ms added)"), ("function_calling_tools", "yes", "Client, webhook, MCP, system tools"),
 ("crm_integrations", "yes", "HubSpot, Salesforce, Zendesk, Freshdesk"), ("whatsapp", "yes", "WhatsApp channel, templates, tools"), ("email", "unknown", "None found"),
 ("post_call_extraction", "yes", "Data collection, success evaluation, post-call webhooks"), ("analytics", "yes", "Analytics, Spotlight"),
 ("ab_testing", "yes", "Experiments: deterministic traffic split"), ("auto_optimisation_learning", "partial", "ElevenAgents Architect (assisted building); tests from real calls"),
 ("multilingual_indic", "yes", "70+ languages incl. Hindi, Tamil etc. (provider-native)"), ("code_switching", "partial", "Language detection tool"),
 ("dialects", "partial", "Accent selection in voice library; accent drift FAQs"), ("custom_cloned_voices", "yes", "Instant and professional voice cloning, voice design"),
 ("emotion", "yes", "Expressive mode; v3 audio tags"), ("memory_across_calls", "unknown", "None found"),
 ("compliance_dnd_dlt_consent", "partial", "TCPA compliance page, HIPAA; no DND/DLT"), ("testing_simulation", "yes", "Agent testing, simulate conversations"),
 ("white_label", "unknown", "None found"), ("on_prem_india_residency", "partial", "Data residency page (EU/US); no India region found"),
]:
    put("ElevenLabs Agents", f, val, ev, EL)

BL = "https://docs.bland.ai/llms.txt ; https://www.bland.ai"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Batch/outbound at volume; daily caps by plan"), ("inbound", "yes", "Inbound numbers"), ("warm_transfer", "yes", "Warm transfer page; transfer billed $0.03-0.05/min"),
 ("voicemail_amd", "partial", "Call recipes mention voicemail"), ("dtmf", "unknown", "None found"), ("knowledge_base", "yes", "Knowledge"), ("function_calling_tools", "yes", "Tools, integration tools"),
 ("crm_integrations", "partial", "HubSpot setup guide; post-call webhooks"), ("whatsapp", "unknown", "None found"), ("email", "unknown", "None found"),
 ("post_call_extraction", "yes", "Post-call webhooks, analysis"), ("analytics", "yes", "Analytics"), ("ab_testing", "yes", "Experiments API"),
 ("auto_optimisation_learning", "partial", "Analyze failed run"), ("multilingual_indic", "partial", "40+ languages claim; no Indic quality claim"),
 ("code_switching", "partial", "'Agents can switch languages mid-call' (FAQ claim)"), ("dialects", "unknown", "None found"), ("custom_cloned_voices", "yes", "Clone voice API"),
 ("emotion", "partial", "Voice settings"), ("memory_across_calls", "yes", "Contact memory API"), ("compliance_dnd_dlt_consent", "partial", "Guard rails, audit logs, BAAs/DPAs; no DND/DLT"),
 ("testing_simulation", "yes", "Evaluations, test analytics"), ("white_label", "unknown", "None found"), ("on_prem_india_residency", "partial", "Self-hosted models; enterprise dedicated infra; no India region"),
]:
    put("Bland", f, val, ev, BL)

SF = "https://docs.synthflow.ai/llms.txt ; https://synthflow.ai/pricing"
for f, val, ev in [
 ("outbound_campaigns", "yes", "Campaigns"), ("inbound", "yes", "Inbound"), ("warm_transfer", "yes", "Call transfers, SIP transfers"), ("voicemail_amd", "partial", "Call configuration"),
 ("dtmf", "partial", "SIP"), ("knowledge_base", "yes", "Knowledge base"), ("function_calling_tools", "yes", "Actions, webhooks"), ("crm_integrations", "yes", "Salesforce, HubSpot, GoHighLevel"),
 ("whatsapp", "yes", "WhatsApp Business Calling, chat"), ("email", "partial", "Notifications"), ("post_call_extraction", "yes", "Post-call analysis"), ("analytics", "yes", "Analytics"),
 ("ab_testing", "unknown", "None found"), ("auto_optimisation_learning", "partial", "'Data fine-tuning: use past calls to train smarter agents' (announced, not GA)"),
 ("multilingual_indic", "partial", "Multilingual; no Indic claim"), ("code_switching", "unknown", "None found"), ("dialects", "unknown", "None found"), ("custom_cloned_voices", "unknown", "None found"),
 ("emotion", "unknown", "None found"), ("memory_across_calls", "yes", "Memory of past calls, memory stores API"), ("compliance_dnd_dlt_consent", "partial", "SOC2/GDPR/ISO 27001; AI transparency statement; no DND/DLT"),
 ("testing_simulation", "yes", "Test Center, custom evaluations"), ("white_label", "yes", "Sub-accounts; white-label + reseller toolkit $2,000/mo (2026-03 pricing) / Enterprise"),
 ("on_prem_india_residency", "partial", "LATAM/DACH regionalization; no India"),
]:
    put("Synthflow", f, val, ev, SF)

# Substrates and enterprise suites: only what was read
put("PolyAI", "inbound", "yes", "Enterprise inbound customer-service voice assistants (positioning); docs host unreachable (502) from sandbox", "https://www.polyai.com (blocked)")
put("Hume EVI", "emotion", "yes", "Empathic Voice Interface: emotion-aware S2S is the product; pricing not shown on page 2026-10-17", "https://www.hume.ai/pricing")
put("Hume EVI", "custom_cloned_voices", "partial", "Octave voice design (docs index 1 hit)", "https://dev.hume.ai/llms.txt")
for f, val, ev in [("inbound", "yes", "SIP inbound"), ("outbound_campaigns", "partial", "Outbound SIP calls; no campaign manager (build your own)"),
                   ("warm_transfer", "yes", "SIP transfer"), ("dtmf", "yes", "DTMF"), ("whatsapp", "yes", "WhatsApp connector (pricing page)"),
                   ("testing_simulation", "partial", "Agent testing helpers"), ("on_prem_india_residency", "yes", "Open-source self-host; LiveKit Cloud regions")]:
    put("LiveKit (substrate)", f, val, ev, "https://docs.livekit.io/llms.txt ; https://livekit.com/pricing")
for v, src, items in [
 ("Yellow.ai", "https://yellow.ai", [("multilingual_indic", "yes", "VOX voice agents '500+ languages' (claim)"), ("auto_optimisation_learning", "partial", "'self-heal' agents, automated testing (claim)"), ("whatsapp", "yes", "Omnichannel platform"), ("testing_simulation", "partial", "automated test (claim)")]),
 ("Haptik", "https://www.haptik.ai", [("multilingual_indic", "yes", "100+ languages (claim)"), ("whatsapp", "yes", "Web, chat, voice, WhatsApp channels"), ("warm_transfer", "yes", "'AI + Human' hand-off positioning"), ("knowledge_base", "yes", "Retrieval from documents and websites")]),
 ("Exotel", "https://exotel.com", [("inbound", "yes", "Cloud telephony + AI voice agents"), ("outbound_campaigns", "yes", "Dialer/campaigns"), ("whatsapp", "yes", "WhatsApp from INR 0.80/marketing conversation (2024 price page)"), ("memory_across_calls", "partial", "'Memory Layer' product claim"), ("auto_optimisation_learning", "partial", "'Every intervention trains the AI for next time' (claim)"), ("crm_integrations", "yes", "CTI integrations Zoho, Zendesk, Salesforce, Freshdesk, HubSpot, LeadSquared")]),
 ("Ozonetel", "https://ozonetel.com", [("inbound", "yes", "Contact-centre suite"), ("outbound_campaigns", "yes", "Predictive dialers"), ("crm_integrations", "yes", "Zoho, Zendesk, Salesforce, Freshdesk, HubSpot, LeadSquared"), ("multilingual_indic", "yes", "24 vernacular languages (claim)"), ("whatsapp", "yes", "WhatsApp bots (case study)"), ("analytics", "yes", "Voice of customer, QA")]),
 ("Skit.ai", "https://skit.ai", [("compliance_dnd_dlt_consent", "partial", "US collections compliance (TCPA, FDCPA, state DNC, quiet hours, Mini-Miranda); India: no DND/DLT stated"), ("multilingual_indic", "partial", "Hindi + English + regional expansion (India case study)")]),
 ("Convin", "https://convin.ai", [("whatsapp", "yes", "WA chat and WA call channels"), ("email", "yes", "Email channel"), ("analytics", "yes", "Conversation intelligence QA (core product)"), ("compliance_dnd_dlt_consent", "unknown", "Homepage copy 'customers won't know it's AI' conflicts with disclosure practice")]),
 ("Subverse AI", "https://docs.subverseai.com/llms.txt", [("whatsapp", "yes", "WhatsApp trigger/channel"), ("email", "yes", "Email agent"), ("crm_integrations", "partial", "Freshdesk"), ("knowledge_base", "yes", "Knowledge base"), ("function_calling_tools", "yes", "Custom functions")]),
 ("VoiceGenie (Oriserve)", "https://voicegenie.ai/pricing", [("multilingual_indic", "partial", "50+ languages; Hindi/Hinglish marketing"), ("warm_transfer", "partial", "'human associates' seats in plans")]),
]:
    for f, val, ev in items:
        put(v, f, val, ev, src)

VENDORS = ["Bolna", "Sarvam Samvaad", "Gnani Inya", "Smallest Atoms", "Ringg", "Ravan.ai (Agni)", "SquadStack", "Subverse AI",
           "VoiceGenie (Oriserve)", "Haptik", "Yellow.ai", "Skit.ai", "Exotel", "Ozonetel", "Convin",
           "Vapi", "Retell", "Bland", "Synthflow", "ElevenLabs Agents", "PolyAI", "Hume EVI", "LiveKit (substrate)"]

def main(outdir):
    with open(os.path.join(outdir, "parity.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["feature", "vendor", "value", "evidence", "source", "accessed", "method"])
        for feat in FEATURES:
            for v in VENDORS:
                val, ev, src = D.get((v, feat), ("unknown", "not found in sources read", ""))
                w.writerow([feat, v, val, ev, src, "2026-10-17", "read-primary (docs index/pricing/homepage)" if val != "unknown" else ""])
    with open(os.path.join(outdir, "parity-wide.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["feature"] + VENDORS)
        for feat in FEATURES:
            w.writerow([feat] + [D.get((v, feat), ("unknown",))[0] for v in VENDORS])
    # summary: count yes per vendor and per feature among the 12 deeply-read platforms
    deep = ["Bolna", "Sarvam Samvaad", "Gnani Inya", "Smallest Atoms", "Ringg", "Ravan.ai (Agni)", "SquadStack", "Vapi", "Retell", "Bland", "Synthflow", "ElevenLabs Agents"]
    print("vendor yes/partial/unknown (24 features):")
    for v in deep:
        vals = [D.get((v, f), ("unknown",))[0] for f in FEATURES]
        print(f"  {v:20s} yes={vals.count('yes'):2d} partial={vals.count('partial'):2d} unknown={vals.count('unknown'):2d}")
    print("feature: #deep vendors with yes (of 12):")
    for feat in FEATURES:
        vals = [D.get((v, feat), ("unknown",))[0] for v in deep]
        print(f"  {feat:28s} yes={vals.count('yes'):2d} partial={vals.count('partial'):2d}")

if __name__ == "__main__":
    main(sys.argv[1])
