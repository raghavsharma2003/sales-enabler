"""Cross-vendor tables for the teardown synthesis (2026-10-20): Kano parity floor, architecture, economics.

Every cell is copied from a lane claim (ids in the evidence column) or the authorized-surface account phase
(research/2026-10-20/account-phase/synthesis/api-surface-matrix.csv). Cell code: Y yes, P partial, N no, ? unknown;
grade after the colon: o observed, i inferred, v vendor-claimed, u unknown.
Run: python3 -I research/2026-10-20/teardown/synthesis/code/build_tables.py
"""
import csv, os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = ['Bolna', 'Sarvam', 'Vapi', 'Retell', 'ElevenLabs', 'Synthflow', 'SquadStack', 'Exotel']

# feature, kano, cells (8, in V order), account_only, evidence
KANO = [
 ('Test call from the builder (browser or phone)', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o Y:o P:o', 'time only', 'BOL-03 SAR-03 VAP-18 RET-23 EL-01 SYN-23 SQS-72 EXO-03'),
 ('List/CSV campaign with per-row variables', 'must-be', 'Y:o Y:o Y:o Y:o Y:o P:o P:o Y:o', 'behaviour', 'BOL-03 SAR-14 VAP-03 RET-05 EL-05 SYN-05 SQS-13 EXO-05'),
 ('Recurring calling window with days of week', 'must-be', 'P:o Y:o N:o Y:o N:o P:o P:i P:o', 'enforcement', 'BOL-48 SAR-49 VAP-46 RET-44 EL-05 SYN-63 SQS-49/71 EXO-45/V03'),
 ('Retries by outcome', 'must-be', 'Y:o Y:o N:o N:o P:o N:o Y:i Y:o', 'behaviour', 'BOL-03 SAR-16 VAP-47 RET-05 EL-05 SYN-05 SQS-15 EXO-15'),
 ('Inbound: number to agent, caller lookup', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o P:o Y:o', '', 'BOL-03 SAR-02 VAP-14 RET-14 EL-01 SYN-02 SQS-72 EXO-parity-delta'),
 ('Transfer to a human (cold/warm)', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o P:o P:o', 'warm context', 'BOL-03 SAR-16 VAP-01 RET-02 EL-01 SYN-02 SQS-10 EXO-parity-delta'),
 ('Voicemail / IVR detection', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o P:o P:o', 'accuracy on Indian operator announcements', 'BC-09 SAR-02 VAP-01 RET-15 EL-01 SYN-parity-delta SQS-11 EXO-V01'),
 ('DTMF', 'must-be', 'Y:o N:o Y:o Y:o Y:o P:o ?:u Y:o', '', 'BOL-03 SAR-12 VAP-01 RET-02 EL-01 SYN-parity-delta - EXO-parity-delta'),
 ('Knowledge base', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o Y:o Y:o', '', 'BC-11 SAR-02 VAP-01 RET-14 EL-01 SYN-02 SQS-04 EXO-parity-delta'),
 ('HTTP tools during the call', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o Y:i Y:o', '', 'api-surface-matrix SQS-10 EXO-parity-delta'),
 ('Post-call judge with typed extraction', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o Y:o Y:o', 'quality', 'api-surface-matrix SYN-07 SQS-16 EXO-parity-delta'),
 ('Post-call webhook (full record)', 'must-be', 'Y:o Y:o Y:o Y:o Y:o Y:o Y:o Y:o', 'delivery/retries', 'api-surface-matrix SYN-02 SQS-14 EXO-parity-delta'),
 ('Call log: recording, transcript, cost, reason', 'must-be', 'Y:o P:o Y:o Y:o Y:o Y:o P:o P:o', 'reason quality', 'BOL-06 SAR-16 VAP-13 RET-15 EL-09 SYN-08 SQS-18 EXO-58'),
 ('Export with extracted fields', 'must-be', 'Y:o P:o Y:o P:o P:o Y:o Y:o P:o', 'contents and time', 'BOL-06 SAR-P08 VAP-10 RET-P08 EL-P07 SYN-02 SQS-P09 EXO-P08'),
 ('Agent versions and publish', 'must-be', 'P:o Y:o Y:o Y:o Y:o Y:o Y:o Y:o', '', 'BOL-01 (API: none, ACB) SAR-16 VAP-11 RET-14 EL-01 SYN-02 SQS-04 EXO-04'),
 ('Indian CLI path (own numbers or native Indian carrier)', 'must-be', 'Y:o Y:o N:o P:o P:o N:i Y:i Y:o', 'CLI series shown to callee', 'BOL-07 SAR-27/45 VAP-42/43 RET-45 EL-38 SYN-61 SQS-23 EXO-42'),
 ('Hindi/Hinglish plus major Indic languages', 'must-be', 'Y:o Y:o P:o P:o Y:o P:o Y:v P:v', 'language hold', 'BOL-01 SAR-02 VAP-31 RET-16 EL-40 SYN-65 SQS-16 EXO-parity-delta'),
 ('Suppression/DNC honoured on every outbound path', 'must-be', 'N:o Y:o N:o P:o N:o N:o Y:o P:o', 'cross-campaign behaviour', 'BOL-46 SAR-44 VAP-47 RET-43 EL-38 SYN-06/62 SQS-47/72 EXO-45'),
 ('INR billing with GST (UPI)', 'must-be', 'P:o Y:o N:o N:o P:v N:o Y:o Y:o', 'checkout', 'BOL-33 SAR-09 VAP-33 RET-49 EL-29 SYN-40 SQS-06 EXO-32'),
 ('Team roles', 'must-be', 'P:o Y:o P:o P:o Y:o P:o Y:o ?:u', '', 'BOL-05 SAR-10 VAP-07 RET-09 AP-EL SYN-12 SQS-03 -'),
 ('India data residency option', 'must-be (BFSI)', 'P:o Y:v N:o N:o P:o N:o P:o Y:o', 'contract', 'BOL-49 SAR-50/63 VAP-48 RET-25 EL-39 SYN-21 SQS-52 EXO-48'),
 ('AI disclosure as a platform default', 'VP rule (buyer class unknown)', 'N:i N:o N:i P:o N:o P:o P:v N:i', 'default behaviour', 'BOL-52 SAR-54 VAP-45 RET-63/RAP-19 EL-41 SYN-62 SQS-46 EXO-P12'),
 ('PSTN reply gap and turn-taking', 'performance', '?:u ?:u ?:u ?:u ?:u ?:u ?:u ?:u', 'yes (battery)', 'predictions TP; BC-06; SAR-35; EL-45; VAP-52'),
 ('Language hold on code-switched turns', 'performance', '?:u ?:u ?:u ?:u ?:u ?:u ?:u ?:u', 'yes (battery)', 'RET-52 SYN-65 EL-54(withdrawn) l4b'),
 ('All-in price per connected minute (and pulse length)', 'performance', 'see economics.csv', '', 'economics.csv'),
 ('Simulated-caller tests / evals', 'performance', 'P:o Y:o Y:o Y:o Y:o Y:o P:o P:o', '', 'api-surface-matrix SYN-82 SQS-65 EXO-03'),
 ('Chat/copilot builder (LLM-native setup)', 'performance (parity, not a wedge)', 'Y:o Y:o Y:o Y:o Y:o P:o ?:u P:o', 'what it writes', 'BOL-02 SAR-03 VAP-05 RET-03 EL-03 SYN-16 - EXO-01'),
 ('MCP server / API breadth', 'performance', 'Y:o Y:o Y:o Y:o Y:v Y:o N:o Y:o', '', 'BOL-02 SAR-15 VAP(AP-10) RET-19 EL-01 SYN-15 SQS-13 EXO-01'),
 ('Live listen / take over', 'performance', 'P:o ?:u P:o Y:o P:o Y:o ?:u Y:v', '', 'BOL-03 - VAP-06/20 RET-07 EL-01 SYN-02 - EXO-01'),
 ('A/B traffic split', 'performance', 'N:o N:o Y:o Y:o Y:o N:o P:v Y:o', '', 'BOL-61 SAR-59 VAP-61 RET-08 EL-51 SYN-parity-delta SQS-65 EXO-60'),
 ('Analytics / dashboards', 'performance', 'P:o Y:o Y:o Y:o Y:o Y:o Y:o Y:o', '', 'api-surface-matrix SAR-20 SYN-13 SQS-28 EXO-31'),
 ('WhatsApp follow-up in the same agent', 'performance (radar says must-be)', 'P:o P:o ?:u N:o Y:o Y:o P:i Y:o', '', 'BOL-03 SAR-11 - RET-10 EL-01 SYN-parity-delta SQS-54 EXO-parity-delta; RAD-53'),
 ('CRM integrations', 'performance', 'P:o ?:u P:o Y:o Y:o Y:o Y:o Y:o', '', 'BOL-04 - VAP-01 RET-04 l4a SYN-parity-delta l4a EXO-parity-delta'),
 ('Typed per-call cost on the record', 'performance', 'Y:o N:o Y:o Y:o Y:o ?:u ?:u ?:u', 'invoice match', 'api-surface-matrix'),
 ('Failure reasons a person can act on', 'performance', 'P:o Y:o P:o P:o P:o P:o N:o P:o', 'yes (task T5)', 'BOL-P07 SAR-17 VAP-13 RET-15 EL-09 SYN-71 SQS-18 EXO-58'),
 ('Cross-format dedupe + India-default normalisation + per-row reasons', 'performance (full form = delighter)', 'P:o P:o N:o N:o N:i N:o P:i P:o', 'yes (task T2)', 'ACB-19/20 SAR-16 VAP-49 RAP-54 EL-P03 SYN-05 SQS-P04 EXO-16'),
 ('Category-aware windows (service / promo / RBI collections)', 'delighter', 'N:o N:o N:o N:o N:o N:o N:i N:o', 'confirm no hidden setting', 'RS-16 RS-20 SAR-49 VAP-46 RET-44 EL-05 SYN-63 SQS-49 EXO-45'),
 ('In-call promotion/solicitation fence', 'delighter', 'N:i N:i N:i N:i N:i N:i N:i N:i', 'yes (REG-P4)', 'RS-21..RS-24 (no vendor ships one)'),
 ('A2P CLI-range declaration export', 'delighter (must-be after 2026-11-18)', 'N:o N:o N:o N:o N:o N:o N:o N:o', 'REG-P3', 'RS-26 SAR-44 RET-42 EL-38 SYN-60'),
 ('140/1600/1601 provisioning done for the buyer', 'delighter', 'P:o N:o N:o N:o P:i N:o N:o P:v', 'time to a working CLI', 'BOL-44 SAR-45 VAP-44 RET-64 EL-38 SYN-61 SQS-48 EXO-42/50'),
 ('Consent / inquiry ledger with expiry', 'delighter (pre-sale must-be)', 'N:o N:o N:o N:o N:o N:o N:o N:o', '', 'measure.2026-10-20.acct-synthesis-india-operator-layer; SYN-62 SQS-50 EXO-46'),
 ('Cross-call memory (v2)', 'delighter', 'N:o N:o N:i Y:o P:o Y:o P:v N:o', 'recall quality', 'BC-12 SAR-58 VAP-60 RET-57 EL-51/EL-P12 SYN-80 SQS-62/74 EXO-60'),
 ('Automatic improvement loop without a human gate (v2)', 'delighter', 'N:o N:o N:o N:o N:o N:o N:v N:o', '', 'BOL-61 SAR-59 VAP-61 RET-58 EL-52 SYN-81 SQS-64 EXO-61'),
 ('Carrier failover on upstream telephony failure', 'delighter', 'N:i ?:u ?:u ?:u ?:u ?:u ?:u ?:u', 'induced failure', 'BOL-40 evidence.2026-10-20.acct-bolna-llm-overflow'),
 ('Business-language outcome owned by the customer', 'delighter', 'N:o P:o N:o N:o N:o N:o P:o P:o', '', 'XS-20 SAR-59 SQS-15 EXO-10'),
 ('Every dashboard action on API/MCP (chat-driven setup)', 'delighter', 'N:o N:o N:o N:o N:o ?:u N:o ?:u', '', 'XS-16 SAR-15'),
]

ARCH = [
 # vendor, orchestration, media/browser, telephony, STT, TTS, LLM, region
 ('Bolna', 'Own Python asyncio pipeline [o: OSS code, BI-01]', 'Web: SIP.js 0.21 over WSS to FreeSWITCH, mod_audio_stream fork [o: bundle + code, BC-16]', 'Vobiz default; Plivo, Twilio, Exotel, SIP (Asterisk legacy, FreeSWITCH new edge) [o, BOL-07, BC-16]', 'Deepgram nova-3 hi default [o bundle]; own nemotron-asr-hi option [o code, BC-08]', 'ElevenLabs Turbo v2.5 "Tripti" default [o bundle]', 'Azure gpt-4.1-mini default, direct client; LiteLLM long tail [o code, BC-15]', 'AWS ap-south-1 control plane + us-east-1 ws [o DNS]; docs say US default [contradiction]'),
 ('Sarvam', 'Server framework unknown; no LiveKit/Daily room on web path [i, SAR-26]', 'One JSON WebSocket, headerless 16 kHz PCM chunks, no WebRTC [o, SAR-25]', '7 BYO providers + rented 10-digit Vobiz numbers [o, SAR-27/45]', 'Saaras v4, self-hosted [v, SAR-28]', 'Bulbul v3/v4 selectable [o]; self-hosted [v]', 'sarvam-105b + open-weight constellation, routed, no picker [v]; members unknown [u, SAR-29]', 'Runtime Azure Central India + API AWS Mumbai [o, SAR-21/22]; dashboard replay to PostHog US [o, SAR-63]'),
 ('Vapi', 'Own streaming pipeline [v blog, VAP-24]; no Pipecat/LiveKit in client [i, VAP-25]', 'Daily WebRTC, mediasoup SFU on OCI Ashburn [o capture, VAP-18/19]', 'Own SBCs on AWS us-west-2/eu-central-1; Twilio/Telnyx/Vonage/DIDWW/BYO SIP; no Indian termination [o, VAP-22/42]', '11-provider catalogue [o, VAP-30]', '15-provider catalogue [o]', '18 providers; latency-routed Azure OpenAI [v, VAP-24]', 'US us-west-2 default, EU (Premier), AUS; no India [o, VAP-20/48]'),
 ('Retell', 'Own queues/workers [v postmortems, RET-24]; framework unknown [u, RET-22b]', 'Web SDK 3.0: own WHIP-style gateway [o, RET-23]; legacy LiveKit Cloud [o]; SIP media partly on LiveKit Inc. blocks [o allowlist, RET-21]', 'US/CA numbers via Twilio/Telnyx; BYO SIP [o, RET-45]', 'Azure, Deepgram (default in Hindi threads), Soniox, AssemblyAI, Muse [o enum, RET-16/29]', 'ElevenLabs, Cartesia, MiniMax, Fish, OpenAI, Inworld, Platform [o enum]', '32 LLMs + gpt-realtime [o]', 'US-West only [o staff quote + DNS, RET-25]'),
 ('ElevenLabs', 'First-party; not separable from LiveKit Agents from outside [u, EL-18 verify]', 'Self-hosted LiveKit on GCP (livekit-server 401 behind Google LB) [o, verify]; WebSocket alt [o]', 'Import Twilio, Exotel (since 2026-06-01), SIP trunk; sells no numbers [o, EL-09/38]', 'Scribe Realtime default [o]', 'Eleven v4 Turbo default [o]; turn_v3 turn model [o]', 'gemini-2.5-flash default [o]; via Vertex [i]; self-hosted open models [o enum]', 'Global anycast front door [o]; default SIP us-central1, India residency SIP asia-south1 (Enterprise) [o DNS]; media anchoring unknown [u, EL-21]'),
 ('Synthflow', 'Probably Python; framework unknown [i, SYN-26]', 'Janus WebRTC gateway, TURN relay forced [o bundle, SYN-23]; WebSocket media for custom [o, SYN-24]', 'Own SBCs probably Kamailio/RTPEngine/FreeSWITCH [i, SYN-22]; numbers US/CA/AU [o, SYN-43]', 'Deepgram (+ Soniox, Synthflow STT) [o enum, SYN-27]', 'ElevenLabs Flash default; Aura-2; Synthflow TTS [o, SYN-29]', 'OpenAI + Synthflow LLM (base unknown) [o/u, SYN-30]', 'GCP us-east1 / europe-west3 / LATAM; no India [o IP map, SYN-20]'),
 ('SquadStack', 'Pipecat [i from client SDK, SQS-23]', 'Daily WebRTC via @pipecat-ai/daily-transport [o SDK, SQS-23]', 'Exotel, Ozonetel, Plivo subprocessors [o trust centre, SQS-24]', 'Arth V2 claimed in-house [v, SQS-31]; arc_stt router [o]', 'ElevenLabs Flash v2.5 default constant; Cartesia, Sarvam [o corrected, SQS-21]', 'OpenAI, SimpliSmart, Bedrock, OpenRouter in-call [o editor, SQS-73]', 'AWS ap-south-1 [o DNS]; US subprocessors [o, SQS-52]'),
 ('Exotel', 'Unknown (front-end bundle cannot show it) [u, EXO-22]', 'AgentStream WebSocket, 8 kHz PCM (16/24 upsampled) [o docs, EXO-13]; console SIP.js 0.20.0 [o source map]', 'Own carrier interconnects (Airtel, Tata, Jio, Vodafone) [o status notices]; 140 + DIDs [o]; 1600 via VNO [v, EXO-50]', 'Deepgram or ElevenLabs certified [v, EXO-19]', 'Smallest or ElevenLabs, voice Avni [v]', 'Gemma certified [v]', 'AWS ap-south-1 for CPaaS/voicebot [o DNS]; ECC images on Oracle Mumbai registry [o, EXO-V04]'),
]

ECON = [
 # vendor, list price, all-in INR per connected Indian minute, reconstructed COGS, implied margin, grades, evidence
 ('Bolna', 'USD 0.06/min PAYG; top-ups to 0.0451; Pilot ~0.042-0.046; AWS annual ~0.04-0.05; 30 s pulses', '6.1 (fee included) to 8.0 (fee added) PAYG; 4.2-6.6 on volume plans', 'INR 2.0-3.8/min default stack (upper bound: own ASR/LLM options exist, BC-08)', '46-72% PAYG; 18-58% AWS annual', 'list o; all-in i; COGS i', 'BOL-33..38, BC-08'),
 ('Sarvam', 'INR 3.50 PAYG to 3.00 Business; 60 s agent pulses + INR 0.20/30 s telephony', '3.4-3.9 on whole-minute calls; 4.40-7.40 on 30-90 s non-whole-minute calls', 'INR 1.16-1.33 at its own API list (lab 1.39-1.51); self-host cost unknown', 'list = 2.3-3.0x own API list cost; compute margin unknown', 'list o; all-in i; COGS i/u', 'SAR-36..40, SAR-39b'),
 ('Vapi', 'USD 0.05/min hosting + pass-through models + BYO telephony', '12.5-17.0 via Twilio (INR 9.46 = hosting + Twilio India before AI)', 'Hosting own cost not observable', 'unknown (VAP-36 downgraded)', 'list o; all-in i; margin u', 'VAP-33..37'),
 ('Retell', 'USD 0.055 infra + TTS 0.015-0.10 + LLM; 4k-token multiplier; burst +0.10', '8.3-13.6 BYO Indian trunk; 16.7-20.0 with a 6k prompt scaling the whole call; 22-37 on Retell US numbers', 'Infra 0.055 vs ASR 0.006-0.009 + assumed compute', 'infra 72-86% (i); calculator default unknown', 'list o; all-in i; margin i/u', 'RET-32..37, RET-36b'),
 ('ElevenLabs', 'USD 0.08/min all plans; burst 0.16; LLM separate; BYO telephony', '8.17-8.92 via Exotel/Plivo; 15.8-16.5 burst; 12.5-15.0 via Twilio', 'Platform fee is 3.3-3.9x its own ASR+TTS API list; analogue COGS INR 0.20-1.38', 'unknown (EL-33 downgraded; 82-97% was an analogue estimate)', 'list o; all-in i; margin u', 'EL-29..34, verify.md'),
 ('Synthflow', 'Enterprise only, from USD 30k/yr; no per-minute list', '15.2-25.6 estimate + floor (INR 47.5/min at 5k min/month if the floor is a usage commitment)', 'INR 3.2-8.1 on a third-party list-price stack (infra line is a placeholder)', '39-69% (i)', 'list o; all-in i; COGS i', 'SYN-40..42'),
 ('SquadStack', 'No public rate; FAQ "typically INR 2-5/min" incl. telephony; setup fee per use case; BFSI success fees', 'INR 2-5 per live minute (vendor statement)', 'INR 1.95-3.58 on ElevenLabs Flash v2.5 (mid 2.30-2.71); 1.6 with Sarvam TTS; 1.1 self-hosted TTS', '-15 to -36% at INR 2; 23-34% at INR 3.5 (Flash)', 'list v; COGS i', 'SQS-34..41 (corrected)'),
 ('Exotel', 'Plans published (Dabbler INR 9,999 / 5 months); VoiceBot and AgentStream per-minute unpublished; PSTN INR 0.80-1.00 typical, 60 s pulses', 'unknown (quote-gated)', 'VoiceBot INR 1.42 / 1.95 / 3.60 (lo/mid/hi)', '44-72% mid case at the INR 3.5-7 market', 'list o/v; COGS i', 'EXO-32..37'),
 ('Caller.digital (radar)', 'Published stack INR 10.15/min (PAYG BYOK 9.42)', 'INR 10.15', 'AI layers INR 3.02 (carrier 1.04, STT 0.73, LLM 0.62, TTS 1.68)', 'support 2.10 + platform 3.00 = about half the price', 'o (published itemisation)', 'RAD-18/19'),
 ('VP target', 'about INR 2/min (directive.2026-10-17.price-target)', '-', 'Lab cascade COGS to be re-priced after the default stack is chosen (open.2026-10-20.reprice-tiers)', '-', '-', 'DIRECTION.md'),
]


def w(name, header, rows):
    with open(os.path.join(OUT, name), 'w', newline='', encoding='utf-8') as f:
        cw = csv.writer(f)
        cw.writerow(header)
        cw.writerows(rows)


def main():
    rows = []
    for feat, kano, cells, acct, ev in KANO:
        parts = cells.split() if cells != 'see economics.csv' else ['see economics.csv'] * 8
        assert len(parts) == 8, feat
        yes = sum(p.startswith('Y') for p in parts)
        part = sum(p.startswith('P') for p in parts)
        rows.append([feat, kano] + parts + [f'{yes}Y/{part}P of 8' if parts[0] != 'see economics.csv' else '', acct, ev])
    w('kano.csv', ['feature', 'kano_class'] + V + ['coverage', 'account_only', 'evidence'], rows)
    w('architecture.csv', ['vendor', 'orchestration', 'media_browser', 'telephony', 'stt', 'tts', 'llm', 'region'], ARCH)
    w('economics.csv', ['vendor', 'list_price', 'all_in_inr_per_connected_min', 'reconstructed_cogs', 'implied_margin', 'grades', 'evidence'], ECON)
    print('wrote kano.csv', len(rows), 'rows; architecture.csv', len(ARCH), '; economics.csv', len(ECON))


if __name__ == '__main__':
    main()
