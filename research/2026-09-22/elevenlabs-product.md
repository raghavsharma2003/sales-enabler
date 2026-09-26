# ElevenLabs Agents: design reference for an India-ready voice operation

*Research date: 22 September 2026. Scope: public ElevenLabs first-party product and documentation pages; this is a product-operating model, not a claim that a particular deployment will meet a quality target.*

## What the product is

ElevenLabs Agents is an orchestration layer around real-time speech, an LLM, knowledge, tools, telephony/web delivery and post-call analysis. Its strongest design lesson is the **closed operating loop**: configure a conversational policy, test it as a reproducible artifact, deploy deliberately, inspect real transcripts against declared criteria, then ship a versioned revision. The UI has named places for each stage rather than treating “natural voice” as an isolated model choice.

### Screen → object → action map

| Product surface | Primary object | Concrete operator action | Design signal worth reusing |
|---|---|---|---|
| **Agents list / create** | Agent | Create from a blank/template configuration; name and tag it. | Make the operational unit explicit and findable, rather than burying it inside a channel integration. |
| **Agent tab** | Conversation configuration | Write system prompt; select LLM and backup/cascade; choose voice/TTS model, speed, pronunciation, languages, first messages, turn-taking and guardrails. | Put content/policy, model choice and spoken delivery beside one another, but label what each controls. |
| **Knowledge Base** | Reusable document/folder | Add text, URL or file; choose full-context vs RAG; attach to several agents. | Show grounding mode, index state and size/latency trade-off per source. |
| **Add Tool / integrations** | Tool | Declare client, webhook, code, MCP or system tool and its arguments; define when it is allowed. | An action needs an input contract, consent/risk note, failure path and test—not merely a connector tile. |
| **Workflow tab** | Versioned node/edge graph | Add subagents, dispatch, AI-agent transfer, phone transfer or end nodes; constrain tools/knowledge per phase. | Use a visual path only for deterministic routing; let a focused conversational node own a phase. |
| **Tests tab** | Test suite / scenario | Run simulation, next-reply or tool-call tests; mock tools; repeat runs and inspect pass rate/transcript. | Preserve a production failure as a regression test from its call history. |
| **Integrate / phone number** | Channel binding | Embed a web widget/SDK, connect SIP/Twilio, or attach an Exotel number for inbound/outbound calls. | Channel configuration should expose its own security, credentials, regional routing and transfer constraints. |
| **Analysis, conversations, Spotlight** | Completed conversation + evaluation | Define success/data criteria, review rationale, sentiment/topics and search calls; send results by post-call webhook. | The unit of quality is a scored, reviewable conversation, with drill-down to evidence. |
| **Versioning** | Draft → immutable version → branch deployment | Branch a configuration, test, merge/rebase and assign traffic percentages. | Ship a complete configuration bundle, not a lone prompt; show the active version on every call. |

## Build the agent as an auditable conversation

**Prompt and policy.** The system prompt is explicitly the personality/policy blueprint: role, goal, allowed tools, procedures and guardrails. ElevenLabs recommends clean headed sections and calls out `# Guardrails`; it also cautions that long prompts (over roughly 2,000 tokens) add latency and cost. The prompt controls behaviour and style, while language and turn mechanics live in platform settings. Product implication: expose a structured “policy sheet” beside free text—goal, disclosures, hard stops, escalation and tool-specific recovery—instead of implying a prompt alone guarantees compliance.

**LLM.** The Models screen offers native ElevenLabs, Google, OpenAI and Anthropic choices, automatic provider cascading, spend monitoring and a custom-LLM route. This is real provider flexibility; it is not evidence that all models behave equivalently. Make the selected model, temperature/reasoning setting, fallback and estimated token cost visible on the agent/version. For important tool calls, test the exact model/version in use.

**Knowledge.** Documents may be file, URL or text; small documents can be inserted as full prompt context, while RAG retrieves relevant chunks for larger material. RAG makes scaling practical but its own guide gives an approximate 250 ms added response latency. Show the operator which documents are attached, their mode, refresh/index status and retrieval evidence in the call review. Do not present “knowledge base on” as proof of correct answers.

**Tools and handoffs.** Available tool types span browser/device client tools, webhook APIs, sandboxed JavaScript code, MCP and built-in system tools. System tools include language detection, agent transfer, external number transfer, end call, DTMF, voicemail detection and state update. Workflows are graphs; a subagent node can layer or fully override base configuration, tools and knowledge for one phase. This supports a clear pattern for Indian service operations: greeting/triage → language-specialist node → authenticated service node → human/number transfer for exception. Require the agent to explain the reason for a transfer and keep a visible conversation state, rather than silently changing persona.

## Voice quality: claims, controls and what has not been established

ElevenLabs positions Expressive Mode (on by default with Eleven v3 Conversational) as context-aware tone, timing and emotional delivery, with expressive tags such as `[laughs]` or `[sighs]`; its documented delivery metric is **about 280 ms TTS latency** for the model, not a human-likeness score. The general TTS guide describes Flash v2.5 as **about 75 ms** and says the voice selection is likely the largest determinant of output quality. Agent controls include speed **0.7×–1.2×**, pronunciation dictionaries, language-specific voices, multi-voice, audio environment and expressive prompting. Use an “audio QA” panel with test utterances for names, amounts, abbreviations, emotion, interruptions and escalation, plus a side-by-side recording—not a generic “natural” badge.

The India page claims voices tuned for Indian accents and code-switched speech, support for 12 Indian languages/accents, low-latency TTS/STT in noisy call settings, and India data residency. Those are vendor product claims. The reviewed pages do **not** publish Indian-language MOS, word-error rate, code-switch accuracy, accent-fidelity score, noise-condition methodology, language-pair coverage, or a comparative benchmark. Treat them as pilot hypotheses. A productive pilot dashboard segments human review and success score by language, script, state/accent, channel/noise, language-switch, task and model/voice version.

There is a concrete limitation behind that caution: ElevenLabs says a voice can technically speak another language but retains its original accent, and recommends a native/library voice or clone with the target language/accent for natural output. The language configuration lets operators add languages, customize translated first messages and assign a language-specific voice; automatic language switching is configurable. For India, write each opening and key compliance phrase natively, choose regional voices per language, seed pronunciation dictionaries with product names and Indian English abbreviations, and test real Hinglish/Tanglish and intra-sentence switches. “All languages” is a broad enablement switch, not localization completion.

**Voice source and consent.** Voice Library, Voice Design, instant cloning and professional cloning are distinct choices. Instant cloning uses short samples (under two minutes can be usable) and is faster but less consistent across very different styles; professional cloning is fine-tuned, recommends roughly 30 minutes of high-quality varied audio and is more consistent/emotion-capable. Voice-captcha verifies active participation for Professional Voice Clones, but ElevenLabs itself says that cannot guarantee the recording truly belongs to the requester; service terms still put authorization responsibility on the creator. Build a voice-provenance record: owner, documented authorization, sample quality/language, clone type, allowed channels/markets, approver and expiry/revocation state. Do not equate captcha with a complete employer/customer consent workflow.

## Test, launch, measure, improve

Before launch, use three test types: multi-turn **Simulation** (scenario + success condition, 1–50 turns), **Next Reply** (quality/tone/policy of one response), and **Tool Call** (expected tool/arguments by exact match, regex or LLM evaluation). Simulations can inject variables and mock none/all/selected mockable tools; system/workflow tools are never mocked. Because outputs vary, split-runs report pass rate. Include code-switch, bad audio/transcript, verbal numbers/addresses, interruption, failed lookup, consent refusal, unsafe request and human-transfer cases. Turn an underperforming real call into a test directly from call history.

Deploy over web widget/SDKs, mobile SDKs, SIP trunk, native Twilio, custom WebSocket, batch calls and (where relevant) WhatsApp. Exotel is the India-relevant telephone example: its Voicebot applet streams inbound/outbound call audio through a WebSocket to ElevenLabs; outbound dialing uses Exotel’s Connect API, and its setup accepts an Exotel Mumbai dashboard. This is an integration pattern, not a blanket claim that every Indian carrier or existing number is supported. Twilio’s documented tool integration supports SMS/MMS and history lookup, but not Zero Retention Mode.

After each completed call, success evaluation applies operator-written criteria and returns `success`, `failure` or `unknown` plus rationale; data collection extracts structured fields, with sentiment, semantic/keyword search, Spotlight topics and post-call webhooks completing the feedback loop. Review `unknown` as a design signal (incomplete call, vague rule or transcript gap), not as success. Conversation analysis can be re-run on a completed conversation using current criteria; retain the call’s originating agent version alongside the re-analysis result so historical comparisons remain intelligible.

Use Versioning to make this safe: a saved change produces an immutable configuration snapshot covering prompt, LLM, voice, tools, knowledge, workflow plus selected platform settings (tests, evaluation, widget, data collection and safety). Branch, run the suite, then deploy a deterministic percentage split by conversation ID; percentages must total 100%. This is a strong pattern for a sales-enabler UI: show **draft → tested branch → traffic % → outcome delta → merge/rollback decision** as one visible journey.

Cost should be modeled as a bill of materials: channel/carrier minutes, real-time speech, selected LLM input/output tokens, RAG’s latency/usage, tool/API calls, evaluation/data collection and any custom guardrail. ElevenLabs says model prices are generally USD per million tokens; custom guardrails are usage-based per agent reply, and retries add a generation plus evaluation. Do not promise a per-call INR cost from these sources—use the platform estimator and measured pilot conversations by route.

## Source set (16 primary ElevenLabs pages)

1. [India enterprise page](https://elevenlabs.io/india)
2. [Voice overview](https://elevenlabs.io/docs/overview/capabilities/voices)
3. [Voice-cloning concepts](https://elevenlabs.io/docs/eleven-api/concepts/voice-cloning)
4. [Prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
5. [Models](https://elevenlabs.io/docs/eleven-agents/customization/llm)
6. [Voice customization](https://elevenlabs.io/docs/eleven-agents/customization/voice)
7. [Expressive Mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode)
8. [Language configuration](https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language)
9. [Knowledge base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base)
10. [Tools](https://elevenlabs.io/docs/eleven-agents/customization/tools)
11. [Workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows)
12. [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing)
13. [Conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis)
14. [Agent versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning)
15. [Integration overview](https://elevenlabs.io/docs/eleven-agents/integrate/overview)
16. [Exotel telephony integration](https://elevenlabs.io/docs/eleven-agents/phone-numbers/telephony/exotel)
