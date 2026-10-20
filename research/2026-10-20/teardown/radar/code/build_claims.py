"""Write claims.json for the radar lane. Usage: python3 -I build_claims.py <out_json>"""
import json, sys
D = 'data/teardown/radar/'
X = D + '_extra/'
C = []

def c(dim, claim, grade, ev):
    C.append(dict(id=f'RAD-{len(C)+1:02d}', dimension=dim, claim=claim, grade=grade,
                  evidence=ev if isinstance(ev, list) else [ev], date='2026-10-20'))

# --- Gupshup / Knowlarity
c('surface', 'Gupshup launched a self-serve Voice AI Platform on 2026-09-04 (console at voiceai.gupshup.io), with 100 free minutes and pricing "from USD 0.035 (INR 3.50) per minute".', 'vendor-claimed',
  [X + 'newentrant-gupshup__press-macau__macaubusiness.com_gupshup_launches_self_serve_voice_ai_platform_extending_conversational_engagement_into_phone_calls'])
c('india-telephony', 'The Gupshup console page offers bring-your-own carrier (Twilio, Plivo) or managed numbers "via Knowlarity (A Gupshup Company)", plus SIP and web calling; the voice page adds WhatsApp voice and on-prem or cloud telephony.', 'observed',
  [D + 'gupshup/web/voiceai.gupshup.io.txt', D + 'gupshup/web/www.gupshup.ai_voice_ai_agents.txt'])
c('language', 'Gupshup claims 90+ languages and dialects with dedicated support for 11 Indian languages, and claims its agent tells a "mhm" backchannel apart from a real cut-in. Neither is measured.', 'vendor-claimed',
  [D + 'gupshup/web/voiceai.gupshup.io.txt'])
c('stack', 'Gupshup Voice AI console is a static SPA on S3 behind CloudFront calling voiceai-api.gupshup.io, with Google sign-in; the marketing site is Next.js on nginx.', 'observed',
  [D + 'gupshup/web/voiceai.gupshup.io.json', D + 'gupshup/web/www.gupshup.ai_voice_ai_agents.json'])
c('access', 'www.knowlarity.com failed TLS validation from the sandbox in Chromium (ERR_CERT_AUTHORITY_INVALID) and curl ("unable to get local issuer certificate"); WebFetch returned 503. Not bypassed; Knowlarity was assessed only through Gupshup.', 'observed',
  [D + 'knowlarity/web/www.knowlarity.com.json', X + 'probe-extra-2026-10-20.csv'])
# --- Ringg
c('pricing', 'Ringg still lists INR 6 per connected minute including Parrot STT, TTS, a "fine-tuned LLM at 4.1-class intelligence", telephony and basic analytics; number INR 499/mo; advanced analytics INR 2/call; chat/WhatsApp INR 2 per 5-minute session; browser agents INR 15/min; STT API INR 30/hour. Confirms pricing-history.json Ringg 2026-10-17.', 'observed',
  [D + 'ringg/web/www.ringg.ai_pricing.txt'])
c('pricing', 'The "monthly minimum (amount not stated)" recorded for Ringg on 2026-10-17 does not appear in the rendered pricing text today; the FAQ answers are collapsed, so whether it still applies is unresolved.', 'unknown',
  [D + 'ringg/web/www.ringg.ai_pricing.txt', 'research/2026-10-17/lanes/l4a-competitors/pricing-history.json'])
c('india-telephony', 'Ringg documents bring-your-own telephony for Exotel, Plivo, Twilio, Ozonetel, Vobiz and Tata Tele, plus SIP trunks with REFER transfers and context headers: the widest Indian carrier list seen on the radar.', 'observed',
  [X + 'ringg__docs-index__docs.ringg.ai_llms.txt'])
# --- Gnani
c('surface', 'inya.ai now redirects to gnani.ai, and gnani.ai/pricing redirects to /book-demo: Gnani publishes no price.', 'observed',
  [D + 'gnani/web/www.inya.ai.json', X + 'gnani__inya-pricing__www.gnani.ai_pricing'])
c('language', 'Gnani claims Prisma v2.5 STT is #1 in 8 of 9 Indian languages on Kathbath Noisy 8 kHz, trained on 14M+ hours of telephony audio, with <200 ms P95 latency and a Warp v2.0 speech-to-speech model.', 'vendor-claimed',
  [D + 'gnani/web/www.gnani.ai.txt'])
# --- Smallest
c('pricing', 'Smallest Atoms pricing is unchanged from 2026-10-17: PAYG USD 0.09-0.21/min all-in (hosting USD 0.01 + STT ~USD 0.009 + LLM at cost + TTS), enterprise "as low as USD 0.05", USD 10 free credits, HIPAA zero-retention add-on USD 1,000/mo.', 'observed',
  [D + 'smallest/web/smallest.ai_pricing.txt'])
c('language', 'Smallest docs list Lightning v3.1 Pro TTS with English-Hindi code-switching and Indian accents, Pulse STT benchmarks on Hindi and on English/Hindi contact-centre calls, and telephony integrations for Plivo, Vonage and Alohaa (an Indian provider). Benchmark numbers themselves are vendor claims.', 'observed',
  [X + 'smallest__docs-index-alt__docs.smallest.ai_llms.txt'])
c('momentum', 'Smallest.ai closed a USD 13M Series A on 2026-07-30 (Seligman Ventures; Sierra, 3one4) and claims 5,000+ businesses with RingCentral and Truecaller as customers.', 'vendor-claimed',
  [X + 'newentrant-smallest-seriesA__press__www.techpillow.co_blog_smallest_ai_series_a_13_million_voice_india_2026'])
c('stack', 'Smallest marketing runs on Framer; atoms.smallest.ai redirects to app.smallest.ai (CloudFront) which calls api.smallest.ai; a Supabase project host is loaded on the marketing site. Its demo agent ran on LiveKit Cloud (l4b round 2).', 'observed',
  [D + 'smallest/web/smallest.ai.json', D + 'smallest/web/atoms.smallest.ai.json', 'research/2026-10-17/lanes/l4b-measured/round2/findings.md'])
# --- MyOperator
c('pricing', 'MyOperator withdrew the per-minute AI plan seen in the 2026-06-17 capture (AI Agent-Voice INR 10,000/mo for 2,000 min). The page now shows CPaaS plans at INR 5,000 and INR 15,000 per month (10 users, yearly + GST) and a custom-priced "Business AI Operator" plan: CPaaS + AI agents + a dedicated human "AI Agent Manager" who builds, monitors and tunes the agents, with usage in credits. Contradicts the pricing-history.json MyOperator row.', 'observed',
  [D + 'myoperator/web/www.myoperator.com_pricing.txt'])
# --- Ozonetel / Haptik
c('surface', 'Ozonetel /ai-agents/ redirects to /ai-agents-in-cx/; the homepage carries a click-to-talk WebRTC widget (onecxi script) and claims 24 vernacular languages; no price is published.', 'observed',
  [D + 'ozonetel/web/ozonetel.com.json', D + 'ozonetel/web/ozonetel.com_ai_agents.txt'])
c('surface', 'Haptik /voice-ai returns 404; its voice-agents page claims 100+ languages but gives no voice pricing, telephony or Indic specifics.', 'observed',
  [D + 'haptik/web/www.haptik.ai_voice_ai.json', X + 'haptik__voice-agents__www.haptik.ai_voice_ai_agents'])
# --- Caller.digital
c('pricing', 'Caller.digital publishes a per-minute INR cost stack: PAYG (BYOK) total 9.42; Growth (min 10K min/month) total 10.15 = carrier 1.036 + STT 0.728 + LLM 0.616 + TTS 1.68 + server 0.84 + LiveKit 0.14 + support 2.10 + platform fee 3.00; number rental INR 250; extra concurrent call INR 352/month. This contradicts ledger CMP-16 ("INR 3-8/min plus INR 1-3 lakh/month platform fee").', 'observed',
  [D + 'caller-digital/web/caller.digital_pricing.txt'])
c('economics', 'In Caller.digital\'s own stack, the AI layers (STT + LLM + TTS) cost INR 3.02/min and the carrier INR 1.04/min, about 40% of its INR 10.15 price; support and platform fees are 50%. Inference: Indian list prices are mostly margin and service, not model cost.', 'inferred',
  [D + 'caller-digital/web/caller.digital_pricing.txt'])
c('stack', 'Caller.digital lists "LiveKit Infra Cost" as a line item, so its agents run on LiveKit (inferred from the vendor\'s own table); its site is Next.js on nginx/Ubuntu with a Strapi CMS on applore.in and an S3 bucket "applore-dev-projects-5" in ap-south-1, which suggests an agency build.', 'inferred',
  [D + 'caller-digital/web/caller.digital_pricing.txt', D + 'caller-digital/web/caller.digital.json'])
c('pricing', 'Caller.digital\'s homepage markets "Pay per outcome, not per minute" for collections.', 'vendor-claimed',
  [D + 'caller-digital/web/caller.digital.txt'])
# --- Cartesia / Deepgram / Ultravox / Bland / Millis
c('pricing', 'Cartesia Managed Agents: USD 0.06/min call duration on every plan plus USD 0.014/min telephony with Cartesia-provisioned numbers; concurrency 8/12/20/60 by plan; evaluations free for a limited time; SIP trunking and on-prem/on-device options.', 'observed',
  [D + 'cartesia/web/cartesia.ai_pricing.txt', D + 'cartesia/web/cartesia.ai_agents.txt'])
c('pricing', 'Deepgram Voice Agent API: Standard USD 0.075/min PAYG (0.068 Growth), BYO TTS 0.065/0.051, BYO LLM + TTS 0.050/0.041, Advanced 0.163/0.146; docs carry Plivo inbound/outbound agent guides.', 'observed',
  [D + 'deepgram/web/deepgram.com_pricing.txt', X + 'deepgram__docs-index__developers.deepgram.com_llms.txt'])
c('pricing', 'Ultravox: USD 0.05/min including TTS, first 30 minutes free, Pro USD 100/mo (yearly) removes concurrency caps; SIP 0.5 cents/min (Pro 0.48); its API has Plivo, Telnyx and Twilio configuration endpoints.', 'observed',
  [D + 'ultravox/web/www.ultravox.ai_pricing.txt', X + 'ultravox__docs-index__docs.ultravox.ai_llms.txt'])
c('pricing', 'Bland is unchanged: Start USD 0.14/min, Build USD 0.12/min + USD 299/mo, transfer USD 0.05/0.04/min; LLM, STT and TTS are included ("No token charges"); telephony via built-in Twilio at pass-through, BYO Twilio or SIP. Confirms pricing-history.json Bland 2026-10-17.', 'observed',
  [D + 'bland/web/www.bland.ai_pricing.txt'])
c('language', 'Bland claims 40+ languages but names no Indic language on its site, and docs.bland.ai/llms.txt has 0 matches for "india" or "hindi". Confirms the l4a note "no Indic claim".', 'observed',
  [D + 'bland/web/www.bland.ai.txt', X + 'bland__docs-index__docs.bland.ai_llms.txt'])
c('stack', 'Bland\'s marketing site (Next.js on Vercel, Cloudflare challenge, PostHog, HubSpot) calls a Google Cloud Run service (mpc2-prod-21-...-uc.a.run.app).', 'observed',
  [D + 'bland/web/www.bland.ai.json'])
c('surface', 'Millis states both "500ms latency" and "600ms latency" on its homepage, prices "starting at USD 0.02/min", and its /pricing page is a 404 whose title is "SaaFlow - Webflow E-Commerce Website Template".', 'observed',
  [D + 'millis/web/www.millis.ai.txt', D + 'millis/web/www.millis.ai_pricing.json'])
# --- Ravan / Air / PolyAI / Hume
c('pricing', 'Ravan.ai now advertises Agni "from 2 cents/min" (new models); /pricing redirects to /agni, which shows USD 0.04/min all-in on the USD 497 plan, enterprise USD 0.02-0.04, plans from USD 97/mo. The USD 29 Lite tier in pricing-history.json is not visible.', 'observed',
  [D + 'ravan/web/www.ravan.ai.txt', D + 'ravan/web/www.ravan.ai_pricing.txt'])
c('surface', 'Ravan.ai claims "100+ languages & dialects", "30+ languages" and "all 40+ languages" on the same site, plus 2,000+ businesses and 100k+ daily calls; its "no mic?" demo number is a US +1 number; the site widget loads from app.snowie.ai and a "snowie-ravan" S3 bucket.', 'observed',
  [D + 'ravan/web/www.ravan.ai.txt', D + 'ravan/web/www.ravan.ai_pricing.txt', D + 'ravan/web/www.ravan.ai.json'])
c('surface', 'air.ai now serves "Air | Enterprise Readiness", a defence readiness product (US Navy, DCMA case studies); there is no voice-agent product on the domain.', 'observed',
  [D + 'air-ai/web/www.air.ai.txt'])
c('compliance', 'The FTC sued Air AI and its owners in August 2025 over claims that its AI could replace sales staff, earnings claims and refund guarantees (law-firm summary of the complaint; a March 2026 settlement is reported only by a competitor\'s blog).', 'inferred',
  [X + 'airai__ftc-dlapiper__www.dlapiper.com_en_de_insights_publications_2025_08_ftcs_latest_ai_washing_case'])
c('pricing', 'PolyAI launched a self-serve Dialog-RSN-1 model API: 2 cents per connected minute billed per second plus text tokens (USD 2.00 input / 0.20 cached / 5.00 output per 1M); voice output free until 19 Nov; USD 100 credit for sign-ups before 19 Nov; telephony and orchestration not included. The platform stays quote-only.', 'observed',
  [X + 'polyai__pricing-html__poly.ai_pricing'])
c('stack', 'PolyAI claims Dialog-RSN-1 is audio-native with ~280 ms p50 first token and "speaks the Realtime standard"; homepage claims <300 ms in production, 89.8 turn-taking accuracy and data residency in US, UK, EU and APAC.', 'vendor-claimed',
  [X + 'polyai__pricing-html__poly.ai_pricing', D + 'polyai/web/poly.ai.txt'])
c('surface', 'Hume\'s homepage now sells voice-AI evaluation ("Measure and improve real-world voice AI performance", VoiceEQ) and /pricing redirects to the homepage. Confirms the l7 radar note.', 'observed',
  [D + 'hume/web/www.hume.ai.txt', D + 'hume/web/www.hume.ai_pricing.json'])
# --- Substrates
c('pricing', 'OpenAI lists GPT-Live-1 at a flat USD 0.05 per minute (USD 0.00083/s), gpt-realtime-2.1 audio at USD 32/64 per 1M input/output tokens (mini 10/20), GPT-Live-Transcribe at USD 0.017/min and a +10% data-residency surcharge.', 'observed',
  [D + 'openai-realtime/web/openai.com_api_pricing.txt'])
c('velocity', 'pipecat-ai released 1.13.0 on 2026-10-19 (15 PyPI releases 2026-04-20..10-20), superseding the l7 radar\'s v1.12.0; livekit-agents released 1.8.8 on 2026-10-15 plus 2.0.0b1 (41 releases in the window).', 'observed',
  [D + '_watchlist-baseline/radar-pipecat__releases-pypi__pypi.org_pypi_pipecat_ai_json', D + '_watchlist-baseline/radar-livekit__releases-pypi__pypi.org_pypi_livekit_agents_json'])
c('pricing', 'LiveKit Cloud: agent session USD 0.01/min, US local number USD 0.01/min, a WhatsApp Business calls connector, and agent simulations at USD 0.02 per text turn and USD 0.05 per voice turn (free through Oct 31). India is listed among its 19+ regions. Pipecat Cloud agent-1x is USD 0.01/min active.', 'observed',
  [D + 'livekit/web/livekit.io_pricing.txt', D + 'livekit/web/livekit.io.txt', D + 'pipecat/web/www.daily.co_pricing_pipecat_cloud.txt'])
c('pricing', 'Coval: Starter USD 100/mo (100 simulation minutes, 1,000 monitored calls), overage USD 0.40 per simulation minute (Growth 0.25) and USD 0.10 per monitoring minute (0.05); the domain moved from coval.dev to coval.ai and the site banner claims a USD 28M Series A. Hamming pricing is contact-only and lists Hindi among 65+ languages.', 'observed',
  [D + 'coval/web/www.coval.dev_pricing.txt', D + 'hamming/web/hamming.ai_pricing.txt', D + 'hamming/web/hamming.ai.txt'])
# --- New entrants
c('momentum', 'Tata Communications and TTBS launched SMB voice-AI agents that come with their own phone numbers, on Commotion and Vayu AI Cloud ("sachet model"); reported pricing is outcome-based rather than per minute.', 'vendor-claimed',
  [X + 'newentrant-tatacomms__press-digit__www.digit.in_features_general_deploying_voice_ai_agents_tata_comms_ttbs_target_india_smb.html', X + 'newentrant-tatacomms__press-inc42__inc42.com_buzz_tata_communications_expands_voice_ai_push_eyes_smb_adoption'])
c('stack', 'tatacommunications.com loads analytics.tcl-uat.gocommotion.com: Tata\'s Commotion platform lives on gocommotion.com (commotion.ai is an unrelated personal site).', 'observed',
  [D + 'tatacomms/web/www.tatacommunications.com_solutions_customer_interaction_voice_ai.json', D + 'tatacomms/web/www.commotion.ai.json'])
c('momentum', 'Navana.ai raised INR 40 Cr Series A on 2026-09-07 (Ronnie Screwvala) and claims 100M+ voice-AI minutes for BFSI clients (Bajaj Finserv, Protean, Ujjivan SFB, Jana SFB, Grihum) on proprietary speech models in 12 Indian languages; its site shows a sign-up button and "Bodhi TTS APIs" launching.', 'vendor-claimed',
  [X + 'newentrant-navana__press__inc42.com_buzz_navana_ai_raises_E2_82_B940_cr_to_scale_voice_ai_platform', D + 'navana/web/navana.ai.txt'])
c('segment', 'Desible.ai (INR 32 Cr seed-plus, 2026-10-07, Prime Venture Partners) lists a "Policy Renewal Agent" and an "Insurance Post-Sales & Onboarding AI Agent" on its homepage, claims 10+ enterprise clients live and 3,00,000+ calls/day, and says disclosures and consent are rule-based in the workflow.', 'vendor-claimed',
  [X + 'newentrant-desible__press__inc42.com_buzz_desible_ai_raises_E2_82_B932_cr_to_build_ai_operating_layer_for_bfsi', D + 'desible/web/www.desible.ai.txt'])
c('momentum', 'RevRag.ai raised a USD 2.5M seed (Accion Ventures) on 2026-10-14 for in-app AI relationship managers for lenders and insurers; 45+ customers incl. PhonePe, Razorpay, Bajaj Finance, Motilal Oswal and IIFL; built on third-party models.', 'vendor-claimed',
  [X + 'newentrant-revrag__press__inc42.com_buzz_fintech_saas_startup_revrag_ai_nets_2_5_mn_to_build_ai_relationship_managers_for_lenders_and_insurers'])
c('momentum', 'Samora AI (YC W26, founded 2025, team of 8) runs multilingual voice agents with compliance guardrails and "managed human escalation using trained Samora human operators"; paying customers in financial services.', 'vendor-claimed',
  [X + 'newentrant-samora__yc__www.ycombinator.com_companies_samora_ai'])
c('momentum', 'Vobiz.ai raised a USD 1M seed led by Piper Serica (reported 2026-05-06) for AI-native SIP trunking.', 'vendor-claimed',
  [X + 'newentrant-vobiz__press__theaiworld.org_news_vobizai_raises_1m_seed_round_for_ai_voice_infrastructure'])
c('pricing', 'ThunderPhone 2.0 (US, Show HN 2026-08-27) is self-serve "from 2 cents/min" with campaigns, A/B experiments and AI-graded test calls; its homepage opens a websocket to an OpenReplay session-replay host on Azure centralus.', 'observed',
  [D + 'thunderphone/web/thunderphone.com.txt', D + 'thunderphone/web/thunderphone.com.json'])
c('india-telephony', 'Two Plivo AI-agent marketing pages surfaced by search (plivo.com/campaigns/vapi-vs-plivo and devplivo.plivo.com/human-like-ai-agents) return 404 today; Plivo\'s own agent product is therefore unverified.', 'observed',
  [X + 'probe-extra-2026-10-20.csv'])
c('market-structure', 'Between 2026-04-20 and 2026-10-20 at least seven Indian voice-AI rounds were reported (Vobiz USD 1M May, Smallest USD 13M Jul, Ringg USD 10M Aug, Navana INR 40 Cr Sep, Dialflo USD 180K Sep, Desible INR 32 Cr Oct, RevRag USD 2.5M Oct). Of the five agent companies among them, three are BFSI-workflow specialists (Navana, Desible, RevRag) rather than horizontal platforms.', 'inferred',
  [X + 'newentrant-navana__press__inc42.com_buzz_navana_ai_raises_E2_82_B940_cr_to_scale_voice_ai_platform', X + 'newentrant-desible__press__inc42.com_buzz_desible_ai_raises_E2_82_B932_cr_to_build_ai_operating_layer_for_bfsi', X + 'newentrant-revrag__press__inc42.com_buzz_fintech_saas_startup_revrag_ai_nets_2_5_mn_to_build_ai_relationship_managers_for_lenders_and_insurers', X + 'newentrant-smallest-seriesA__press__www.techpillow.co_blog_smallest_ai_series_a_13_million_voice_india_2026', X + 'newentrant-vobiz__press__theaiworld.org_news_vobizai_raises_1m_seed_round_for_ai_voice_infrastructure'])
c('market-structure', 'Four Indian sellers now package the operation, not the tool: MyOperator (a human AI Agent Manager per plan), Samora (trained human operators for escalation), Tata/TTBS (outcome pricing) and Caller.digital (pay per outcome). Inference: buyers are paying for someone to run and tune the agent, which a self-serve tool must replace with product.', 'inferred',
  [D + 'myoperator/web/www.myoperator.com_pricing.txt', X + 'newentrant-samora__yc__www.ycombinator.com_companies_samora_ai', X + 'newentrant-tatacomms__press-digit__www.digit.in_features_general_deploying_voice_ai_agents_tata_comms_ttbs_target_india_smb.html', D + 'caller-digital/web/caller.digital.txt'])
c('market-structure', 'The published Indian self-serve headline floor is now INR 3.50/min from two vendors (Sarvam PAYG INR 3.50 plus its INR 0.40/min telephony, per pricing-history.json; Gupshup "from INR 3.50" with telephony inclusion not stated), against Ringg INR 6 all-in and Caller.digital INR 9.4-10.2. Global per-minute floors on the radar are 2 cents (PolyAI API, ThunderPhone, Ravan; brain-only or SMB).', 'inferred',
  ['research/2026-10-17/lanes/l4a-competitors/pricing-history.json', X + 'newentrant-gupshup__press-macau__macaubusiness.com_gupshup_launches_self_serve_voice_ai_platform_extending_conversational_engagement_into_phone_calls', D + 'ringg/web/www.ringg.ai_pricing.txt', D + 'caller-digital/web/caller.digital_pricing.txt'])
c('parity', 'Pre-deployment simulation or evals are now shipped (often free) by Gupshup, Cartesia, LiveKit, PolyAI, ThunderPhone and Ringg, and sold standalone by Coval and Hamming. Inference: testing has become table stakes in the parity floor, not a differentiator.', 'inferred',
  [D + 'gupshup/web/www.gupshup.ai_voice_ai_agents.txt', D + 'cartesia/web/cartesia.ai_pricing.txt', D + 'livekit/web/livekit.io_pricing.txt', X + 'polyai__pricing-html__poly.ai_pricing', D + 'thunderphone/web/thunderphone.com.txt', D + 'ringg/web/www.ringg.ai_pricing.txt'])
c('parity', 'Voice plus WhatsApp in the same agent is offered by at least six radar vendors (Gupshup, Ringg, Caller.digital, Desible, Samora, MyOperator) and LiveKit now bridges WhatsApp Business calls. This extends the l4a finding that only Ringg and ElevenLabs had it natively.', 'inferred',
  [D + 'gupshup/web/www.gupshup.ai_voice_ai_agents.txt', D + 'ringg/web/www.ringg.ai_pricing.txt', D + 'caller-digital/web/caller.digital.txt', D + 'desible/web/www.desible.ai.txt', D + 'samora/web/www.samora.ai.txt', D + 'myoperator/web/www.myoperator.com.txt', D + 'livekit/web/livekit.io_pricing.txt'])
c('deep-set', 'Synthflow is enterprise-only from USD 30,000/yr (pricing-history.json, Sep-Oct 2026), so the account-phase time-and-motion cannot be run on it without a sales contract; its no-code UX can only be studied from public material.', 'inferred',
  ['research/2026-10-17/lanes/l4a-competitors/pricing-history.json'])
c('stack', 'Every radar platform whose voice stack could be identified from public material runs on LiveKit (Smallest and Cartesia demos observed in l4b; Caller.digital names it as a cost line); no radar vendor showed Daily, Agora or Twilio Video signalling on a passive page load.', 'inferred',
  ['research/2026-10-17/lanes/l4b-measured/round2/findings.md', D + 'caller-digital/web/caller.digital_pricing.txt'])
c('market-structure', 'An HN item dated 2026-08-31 titled "Race to bottom in Indias voice AI market (0.15 cents/min)" links a post on X by Rajan Anandan; the post was not read (X not fetched), so its content and the figure are unknown.', 'unknown',
  [D + '_sweep/sweep__hn-story__hn.algolia.com_api_v1_search_by_date_query_voice_20AI_20India_tags_story_hitsPerPage_50'])
# --- Method / tool
c('method', 'REA 6.7.0 inspect-web-network-capture rejected a real Playwright 1.56 HAR (Ozonetel homepage) because one Facebook-pixel URL contained unescaped "[" characters (strict "uri" format). After percent-encoding 4 URLs in a copy, it returned a 1.3 MB lossless evidence record (sha256, redaction, limitations) but no stack or provider classification. The stack signals in this lane come from our own host classification.', 'observed',
  [D + '_rea/ozonetel-home-har-inspect.json', D + '_rea/sanitized-har/ozonetel.com.har'])
c('method', 'For the weekly sweep, HN Algolia, the Inc42 feed, the YourStory feed, YC company pages and the TechCrunch voice-ai tag feed were reachable; Product Hunt, Tracxn, Dealroom and the technode PR mirror returned 403, and the Entrackr and Inc42 funding feeds returned 404.', 'observed',
  [D + '_sweep/probe-sweep-2026-10-20.csv', X + 'probe-extra-2026-10-20.csv'])
c('method', 'A passive page load (no clicks, no sign-up) reveals marketing-site hosting and analytics but not the call stack: none of the 52 radar pages loaded opened a WebRTC or voice websocket (the only websockets were a Zendesk chat widget on MyOperator and an OpenReplay session-replay socket on ThunderPhone). Call-stack identification needs a public demo call or a trial account.', 'observed',
  [D + 'bland/web/www.bland.ai.json', D + 'ringg/web/www.ringg.ai.json', D + 'gupshup/web/voiceai.gupshup.io.json', D + 'myoperator/web/www.myoperator.com.json', D + 'thunderphone/web/thunderphone.com.json'])

json.dump(C, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(C), Counter(x['grade'] for x in C))
