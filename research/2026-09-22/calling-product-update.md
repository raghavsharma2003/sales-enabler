# Calling product update: prompt editor → browser call → inspect and test

**Research date:** 22 September 2026 (Asia/Kolkata)

**Scope:** A bounded review of current first-party product pages and documentation for Vapi, ElevenLabs Agents, Bolna, Dialflo, Alchemic, Fish Audio, and LiveKit. The earlier files in this folder contain fuller Vapi, ElevenLabs, Bolna, Retell, LiveKit, and India-language research. This note extracts the UX patterns that matter for a company-operations product with Indian business Hinglish and a deeply relational, emotionally careful calling experience.

**Evidence boundary:** “Documented” means a vendor’s current public page describes the mechanism or named screen. “Vendor claim” means positioning, a benchmark, or a customer result supplied by the vendor. No authenticated dashboard, provider key, phone number, or customer call was used here. A feature described by a vendor is therefore a design reference, not proof of quality, availability on every plan, or India-market fit.

## The repeatable product loop

The products converge on a useful operating loop, even though their scopes differ:

1. **Brief/configure:** Turn an objective or uploaded brief into an agent policy with identity, greeting, flow, guardrails, closing and tools.
2. **Call in the browser:** Start a microphone-controlled web session against the current draft/version. A browser call exercises audio, interruption and turn-taking in a way text tests cannot.
3. **Inspect the call:** Review transcript, recording, tool/retrieval events, outcome data and timing. Keep vendor/provider/model/version visible on the record.
4. **Create a test from failure:** Save a real conversation or scenario as a regression case, mock side effects, set observable criteria, rerun and release only when required cases pass.

This sequence is the right spine for the next calling UX. The agent page should become the front door to a testable operating object, rather than a prompt editor with a generic “simulate” button.

## Product evidence and the concrete interaction to borrow

### Vapi — explicit draft/publish/web call and separate test layers

Vapi’s documented quickstart has a clear sequence: create an Assistant from a blank or template, edit **First Message** and **System Prompt**, publish a new version, then select **Talk** to start a web call and grant microphone access. It later maps the Assistant to a number and exposes an outbound Test panel. [Assistants quickstart](https://docs.vapi.ai/assistants/quickstart) (documented).

Vapi’s web SDK also exposes call-start/end and per-turn text/timing events, making a browser call an inspectable session rather than only an audio button. [Web calls](https://docs.vapi.ai/quickstart/web) (documented).

The test boundary is unusually explicit: Evals test text/model decisions and tool arguments, while Simulations run reusable chat or synthetic-voice journeys; the latter can show a transcript and recording but does not grade pronunciation, pauses or interruptions. Vapi warns that simulations run unmocked tools for real unless the operator mocks or sandboxes them. [Evals](https://docs.vapi.ai/observability/evals-quickstart) and [Simulations](https://docs.vapi.ai/observability/simulations-quickstart) (documented).

Vapi’s call detail model is a useful inspection contract: artifacts can include recording, transcript, messages, node history, variables and detailed logs, with per-assistant or per-call artifact controls. [Call recording, logging and transcribing](https://docs.vapi.ai/assistants/call-recording) (documented).

**UX consequence:** expose `Draft → Publish version → Talk in browser → Inspect call → Save as test`. Keep **text decision**, **synthetic voice**, and **real browser** checks visually distinct. Any tool that can book, send, update or transfer must show `mocked`, `sandbox`, or `live` before a test starts.

### ElevenLabs Agents — agent builder plus scenario, tool and regression testing

ElevenLabs’ current quickstart creates a blank assistant in the dashboard, configures it from an Agent tab, then tests it in the dashboard or by embedding an agent widget. [Quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart) (documented).

Its testing surface separates **Simulation** (full multi-turn outcome), **Next Reply/Scenario** (one response against tone/policy criteria) and **Tool Call** (specific tool and parameter checks). Tests can be created from an underperforming conversation, support dynamic variables, and mock none/all/selected tools. Multi-run reports a pass rate and failure buckets instead of pretending one pass proves reliability. [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing) (documented).

Its conversation analysis surface defines success criteria, data collection, sentiment and search; the result can be returned through post-call webhooks. [Conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis) (documented). The Analytics page supports filtering by agent, branch, language, call type, model, tool and evaluation result, but metrics and analysis should still be treated as vendor-generated evidence. [Analytics](https://elevenlabs.io/docs/eleven-agents/dashboard) (documented).

**UX consequence:** add a “Create test from this call” action that pre-fills the relevant context and lets the operator choose a test type. Make “empathetic acknowledgment,” “Hinglish correction,” “no pressure,” “handoff,” and “tool parameter” criteria first-class examples, with `pass / fail / unknown` and rationale rather than a single opaque score.

### Bolna — brief-to-agent blocks, Indian language controls and web-call security

Bolna’s Agent Studio presents three configuration blocks: **Identity**, **Conversation**, and **Closing**. The public studio lets an operator upload a PDF/DOCX/TXT brief, set the agent’s name/industry/role/tone, define the welcome message, guardrails and flow, then set hangup logic, fallback and goodbye behavior. It says its builder assesses structural dimensions and applies guardrails, but those assessment claims are vendor positioning. [Agent Studio](https://www.bolna.ai/agent-studio) (documented surface plus vendor claims).

Bolna also publishes a web-call SDK: a browser click obtains a short-lived, single-use session from the customer’s backend, with explicit error states for microphone denial, autoplay blocked, capacity, connection failure and rejection. The call exposes state-change, call-start/end, error and volume-level events. The API key is kept server-side. [Bolna Web-Call SDK](https://github.com/bolna-ai/web-call) (first-party repository; documented).

The earlier Bolna research in this folder covers the stronger India-specific details: conservative language switching, Hinglish and multilingual retrieval, endpointing/interruption controls, local-time windows, telephony, extraction and call history. Treat those as configurations to benchmark with actual regional speech, names, IDs, noise and code-switching rather than proof of accuracy.

**UX consequence:** use Bolna’s three-block editor as the compact first view, but add a persistent **Language and speech test** panel. Error copy should preserve operator recovery: `mic denied → permission help`, `autoplay blocked → Start audio`, `at capacity → retry or queue`, and `session expired → mint a fresh test session`.

### Dialflo — India hiring workflow and an unusually candid boundary on empathy

Dialflo’s first-party blog describes agents for Indian recruitment and customer/logistics work. Its public positioning claims structured screening, multilingual outreach, follow-ups, scheduling, ATS/calendar integrations, no-code configuration and a dashboard with pickup, response and conversion metrics. These are vendor claims; the public site did not expose an inspectable dashboard in this review. [The Future of Recruitment Is Voice AI](https://blog.dialflo.ai/2025/11/the-future-of-recruitment-is-voice-ai.html).

The more useful design evidence is Dialflo’s own January 2026 article on failure boundaries. It says frontline candidates explain gaps emotionally, switch languages mid-sentence and answer indirectly; it warns that trust can fall when an automated interaction feels efficient but distant, and says roughly 18% of calls in one cited screening analysis required manual intervention. It recommends measuring cleanup rate, first-contact drop-off and repeat calls, then preserving human judgment and designing explicit handoff. These figures and observations are Dialflo’s own claims, not independent measurements. [What Voice AI Can’t Replace in Recruitment](https://blog.dialflo.ai/2026/01/what-voice-ai-cant-replace-in.html).

**UX consequence:** for Indian business calls, add explicit exception states rather than a generic “empathetic” toggle: `uncertain answer`, `contradiction`, `trust-sensitive`, `language mismatch`, `candidate/customer asks for a person`, and `agent cannot safely commit`. Each state should offer a clarifying question, pause/callback, or warm handoff with the exact context passed to the human. Track cleanup and drop-off as operational outcomes; do not turn sentiment into a canonical customer fact.

### Alchemic — probing, mixed-language evidence and live insight drill-down

Alchemic is a market-research product rather than a general contact-center platform, but its phone-research page is a strong reference for relational inspection. It shows an example live Hindi/English mixed call, claims that the moderator probes hesitation and contradictions, and describes live theme extraction as calls complete. The page’s stated flow is **brief → calls → live themes**, with a drill path from theme to respondent to quote to the exact audio moment. [AI Phone Research](https://thealchemic.com/ai-phone-research/) (documented product presentation and vendor claims).

Its MCP page extends the same operating idea: a plain-language objective can create a study, set screener/quotas, launch fielding, and return cited themes, quotes, segments and respondent counts into the calling tool. It says the system can run against a customer list or panel and retains prior research context between waves. [Alchemic MCP](https://thealchemic.com/alchemic-mcp/) (vendor-described product workflow).

**UX consequence:** on a conversation detail, let the reviewer move `theme/pattern → exact turn → audio timestamp → source/context`. Mark “AI noticed” as an interpretation, keep the caller’s words as evidence, and allow a reviewer to accept, reject or defer the interpretation. For a relational agent, this is more trustworthy than showing an unqualified mood or “customer intent” badge.

### Fish Audio — expressive realtime speech layer, not a complete calling workspace

Fish Audio’s developer page documents REST, WebSocket streaming and Python/TypeScript SDKs, and positions voice agents as streaming TTS plus ASR with interruption awareness. It also documents inline direction tags such as `[warm]`, `[near-whisper]` and `[reassuring]`, voice cloning, multilingual models, self-hosting options and a browser-like “pick a voice, type a line, hear it back” demo. [Developers](https://fish.audio/developers/) (documented API/product surface plus vendor claims).

Its TTS API page gives provider-reported values such as roughly 100ms time-to-first-audio for S2.1 Pro, 80+ languages and instant code-switching. Those numbers are provider claims for stated conditions, not an end-to-end business-call benchmark. [Text to Speech API](https://fish.audio/text-to-speech-api/) (vendor claims and API documentation).

**UX consequence:** represent TTS/ASR as a replaceable provider adapter with a voice audition control and a small set of approved delivery directions. Do not present Fish Audio as evidence that the product has prompt editing, telephony, human handoff, memory, evaluations or an operator console; the public pages reviewed establish an expressive realtime speech layer, not those controls.

### LiveKit — browser Agent Builder and realtime Agent Console

LiveKit’s current Agent Builder lets operators prototype and deploy simple agents directly in a browser without code. Its documented fields include instructions, welcome greeting, models, actions/tools, variables and metadata, secrets, data collection and call ending. A preview can generate a summary during a live test, while call ending can POST structured results and a summary to an endpoint. [Agent Builder](https://docs.livekit.io/agents/start/builder/) (documented).

The Agent Console is a web tool for realtime debugging: it monitors events and tool execution, analyzes timing/performance, and can observe live sessions as a hidden participant. [Agent Console](https://docs.livekit.io/agents/start/console/) (documented). This is a strong provider-neutral reference, while LiveKit remains an SDK/runtime layer; the business-grade relationship, permission and QA workspace still has to be built.

**UX consequence:** combine an easy preview panel with a separate inspector that exposes event timing, tool calls, metadata and end-of-call extracted fields. Let a test call carry a concrete context fixture—name, company, language preference, case/order ID—so Hinglish and relational behavior are tested with realistic inputs.

## Implementation shortlist for the next calling UX

These are concrete, bounded interactions to implement in the product mock or product plan:

| Priority | Operator interaction | Minimum evidence shown | Safety / relational rule |
|---|---|---|---|
| P0 | **Draft a call agent** from a structured brief | Identity, objective, first line, language set, guardrails, flow, tools, closing/handoff; draft ID and version | Keep role/policy separate from provider voice settings. Show source and owner for injected company/customer context. |
| P0 | **Run a browser call** against the current draft | Mic/audio permission state, start/end, mute, elapsed time, live transcript, detected language, scenario/context fixture, agent/version | This is a test call. No real outbound contact or side effect without explicit channel and action state. |
| P0 | **Inspect a completed call** | Audio, transcript with timestamps, interruptions, turn latency, retrieval/context used, tool request/result, proposed memory, handoff reason, consent/disclosure events | Caller words are evidence. Sentiment, intent and memory are labelled inference/proposal until reviewed. |
| P0 | **Choose a scenario before calling** | Normal, Hindi/English code-mix, correction, cost concern, upset/trust-sensitive, reschedule, tool error, human handoff | Include names, order IDs, OTP-like numbers and regional accent/noise fixtures. Do not infer Hinglish quality from a language dropdown. |
| P1 | **Create a regression case from a call** | Copied transcript/context, expected behavior, evaluator rubric, mocked tool result, test status | Mock booking/payment/CRM writes by default. Display `mocked`, `sandbox`, or `live` prominently. |
| P1 | **Run a test suite** | Text decision vs synthetic voice vs browser call; pass/fail/unknown, rationale, run count, pass rate, failure clusters | A single pass is insufficient for probabilistic calls. A required failed case blocks simulated release. |
| P1 | **Release and compare versions** | Draft/published version, diff, provider/model/voice/turn settings, branch or experiment label | Every call and test result retains the exact agent bundle used. |
| P1 | **Review relational signals** | Exact quote/audio moment, caller-stated concern, agent interpretation, uncertainty, repair attempt, reviewer decision | “AI noticed” is a prompt for review, not a customer truth or permanent memory. |
| P2 | **Open a handoff package** | Why escalation happened, summary, unresolved question, consent/recording state, human destination, result | Give the human enough context to continue naturally; preserve caller control to pause, decline or end. |

## What competitors still leave open

The public sources establish useful pieces, but they do not establish a single product that combines all of the following for an Indian business: a company-owned relational memory model with provenance and scope; browser call testing; explicit Hinglish fixtures; emotional repair and trust-sensitive handoff; provider/version trace; and action-safe test mocks. That is a product opportunity statement based on the reviewed public surfaces, not a claim that no private or account-only competitor has these capabilities.

Specific gaps to verify before making a competitive claim:

* **Vapi, ElevenLabs and Bolna** document strong editor/test/call/inspection primitives. Their public pages do not prove end-to-end Hinglish quality, emotional understanding, or correctness of extracted memory in our target businesses.
* **Dialflo** speaks directly to Indian frontline hiring, trust and manual intervention, but the reviewed public materials do not expose a test lab or inspectable prompt/version workflow.
* **Alchemic** demonstrates the strongest public evidence pattern for deep probing, code-mixed research and evidence drill-down, but it is a research workflow; its public pages do not establish CRM action authority, agent release controls or general-purpose inbound support behavior.
* **Fish Audio** supplies speech and expressive direction controls. Its public developer surface does not establish an operator workspace, calling campaign controls, consent lifecycle or relational record model.
* **LiveKit** exposes a powerful browser builder and realtime console. It is a runtime/developer platform; policy, relational memory, test governance and business-operator workflows remain application responsibilities.

Therefore the defensible product position is: make the call itself inspectable and the relationship state reviewable, while keeping provider voice quality as a measured adapter. Avoid claiming “human-like,” “emotionally intelligent,” or “Hinglish-ready” from configuration alone. Demonstrate those qualities with replayable scenario results, caller evidence, handoff outcomes and region-specific QA.

## Source register (first-party pages reviewed)

1. Vapi — [Assistants quickstart](https://docs.vapi.ai/assistants/quickstart), [Web calls](https://docs.vapi.ai/quickstart/web), [Evals](https://docs.vapi.ai/observability/evals-quickstart), [Simulations](https://docs.vapi.ai/observability/simulations-quickstart), [Call artifacts](https://docs.vapi.ai/assistants/call-recording)
2. ElevenLabs — [Quickstart](https://elevenlabs.io/docs/eleven-agents/quickstart), [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing), [Conversation analysis](https://elevenlabs.io/docs/eleven-agents/customization/agent-analysis), [Analytics](https://elevenlabs.io/docs/eleven-agents/dashboard)
3. Bolna — [Agent Studio](https://www.bolna.ai/agent-studio), [Web-Call SDK](https://github.com/bolna-ai/web-call)
4. Dialflo — [Recruitment voice AI](https://blog.dialflo.ai/2025/11/the-future-of-recruitment-is-voice-ai.html), [What Voice AI Can’t Replace](https://blog.dialflo.ai/2026/01/what-voice-ai-cant-replace-in.html)
5. Alchemic — [AI Phone Research](https://thealchemic.com/ai-phone-research/), [Alchemic MCP](https://thealchemic.com/alchemic-mcp/)
6. Fish Audio — [Developers](https://fish.audio/developers/), [Text to Speech API](https://fish.audio/text-to-speech-api/)
7. LiveKit — [Agent Builder](https://docs.livekit.io/agents/start/builder/), [Agent Console](https://docs.livekit.io/agents/start/console/)

