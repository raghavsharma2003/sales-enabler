#!/usr/bin/env python3 -I
import json, os
ROOT = '/home/user/sales-enabler/'
D = '2026-10-20'
A = 'data/account-phase/elevenlabs/'
R = 'research/2026-10-20/account-phase/elevenlabs/'
g = json.load(open(ROOT + 'context/graph.json'))
gids = {n['id'] for n in (g['nodes'] if isinstance(g, dict) else g)}
def nid(kind, slug): return f'{kind}.{D}.acct-elevenlabs-{slug}'
N = []
def node(kind, slug, typ, status, source, title, **kw):
    n = {'id': nid(kind, slug), 'type': typ, 'status': status, 'source': source, 'date': D, 'title': title}
    n.update(kw); N.append(n); return n['id']

claims = node('evidence', 'claims', 'evidence', 'proposed', 'verified',
  'ElevenLabs Agents authorized-surface phase: 54 graded claims (50 observed, 3 inferred, 1 unknown) from about 110 authorized requests with our free-tier key at about 1 per second, the live OpenAPI (420 operations, 64 exercised), five published packages read without installing (JS SDK, Python SDK, client, types, CLI; plus react) and one REA run on the client SDK dist. No call, number, batch, simulation, test run or webhook. Synthetic probe objects were created, read back and deleted (one environment variable cannot be deleted).',
  path=R + 'claims.json')

defaults = node('evidence', 'defaults-diverge-from-schema', 'evidence', 'proposed', 'verified',
  'ElevenLabs new-agent defaults differ from its own OpenAPI defaults, and the API ignores typos. A freshly created agent comes back with LLM deepseek-v41-flash (schema: gemini-2.5-flash), speculative_turn true (schema: false), bursting on (excess calls at double price), a 180 s call queue, sentiment and topic analysis on, retention -1 and a US-English default voice (Eric, not verified for Hindi) that the API accepts on a language=hi agent. Unknown properties are dropped with a 200 and still commit a new version. Defaults, not the spec, decide what a buyer gets.',
  path=A + 'api-writes/agent-minimal-readback.json')

llmcost = node('measure', 'default-llm-cost', 'measurement', 'measured', 'verified',
  'ElevenLabs prices LLM pass-through at USD 0.0054 per minute for gemini-2.5-flash and USD 0.0130 for its server-default deepseek-v41-flash (4,000-character prompt, 5.27 agent messages per minute implied), so the default costs 2.4x the cheaper model: about INR 1.23 against INR 0.51 per minute at FX 95. gpt-5.4-mini is USD 0.0129, claude-sonnet-5 USD 0.0372, gpt-4 USD 0.48; a 12,000-character prompt with 20 pages and RAG multiplies cost about 7.5x.',
  n='111 LLM rows returned per calculator call; 2 calls (4k-character prompt no RAG; 12k-character prompt, 20 pages, RAG)',
  method='POST /v1/convai/llm-usage/calculate with our key on 2026-10-20 (free calculator, no call placed); INR conversion at FX 95 is our assumption from the 2026-10-18 cost model',
  path=A + 'derived/llm-cost-4k.csv')

surface = node('measure', 'config-surface-size', 'measurement', 'measured', 'verified',
  'Size of ElevenLabs\' agent configuration surface as read back from one new agent: 313 non-widget leaf settings (179 with schema descriptions), 65 per-agent permission strings, 111 selectable LLMs (54 with reasoning-effort levels, 43 deprecated or in warning), 11 TTS models (94 languages on the v4 family), 72 call-start override languages, 26 WebSocket error types, 27 conversation-initiation sources, 40 conversation-list filters, 420 API operations of which 200 are agents/speech-engine. Use as the size to beat for a simpler surface, not a target to copy.',
  n='1 agent read-back (313 leaves) plus counts from the live OpenAPI and GET /llm/list, 2026-10-20',
  method='flatten the GET /v1/convai/agents/{id} JSON and join with the OpenAPI schema (research/.../code/derive_knobs.py, derive_surface.py); counts of enum members and operations from the spec',
  path=A + 'derived/agent-config-knobs.csv')

hinglish = node('evidence', 'hinglish-mode-undocumented', 'evidence', 'proposed', 'verified',
  'ElevenLabs has an agent-level hinglish_mode flag (mixes English into Hindi, Malayalam, Telugu or Kannada replies; default false) that appears in the OpenAPI and the agent read-back but in none of its 258 saved docs pages. The server persists it even on a language=en agent, so it is not cross-checked, and nothing says what it changes in prompt, ASR or TTS. This is the nearest thing a competitor ships to VP\'s core idea, and it is a boolean. Its audible effect is untested.',
  path=A + 'api-writes/agent-rich-readback.json')

memory = node('evidence', 'memory-gated', 'evidence', 'proposed', 'verified',
  'ElevenLabs user memory exists but is gated by a workspace flag. Enabling platform_settings.privacy.user_memory returned 403 "User memories are not available for this workspace"; the knob has scale minimal|balanced|maximum, the workspace has user_memory.retention_days, permissions include agent_view_memories and agent_edit_memories, and the agent reserves a memory_entry_search tool slot that cannot be set through the public schema. Recall by user_id across calls is coming from the leader; how memory is written (facts, summaries, preferences) is unknown.',
  path=A + 'api-writes/patch-rich-response.json')

wire = node('asset', 'wire-protocol-taxonomy', 'asset', 'proposed', 'verified',
  'Reusable reading: ElevenLabs\' typed call-event taxonomy (about 40 event types over one socket) from the published @elevenlabs/types 0.25.0, including contextual_update (push text into context without forcing a reply), user_activity, tentative_user_transcript, conversation_history with a persistent_session_token for resume, context_usage, ping with ping_ms, vad_score, guardrail_triggered and 26 error types. A checklist for VP\'s own event schema, to be re-expressed in our own words, not copied.',
  paths=[A + 'sdk/npm-types/unpacked/package/dist/generated/types/asyncapi-types.d.ts', A + 'sdk/npm-client/unpacked/package/dist/types.d.ts'],
  value='Shortcut to a complete list of events a web or phone client of a voice agent must handle, including resume, mid-call context injection and error taxonomy.',
  effort='1 day to turn into a VP event-schema spec')

floor = node('decision', 'parity-floor-items', 'decision', 'proposed', 'model',
  'Proposed additions to the v1 parity floor from ElevenLabs\' live API (on top of the Vapi list in decision.2026-10-20.acct-vapi-parity-floor-items): an agent version on every write with branch, merge proposal and percentage traffic deployments; three kinds of agent test (response, tool call, simulated persona with up to 30 success conditions and up to 50 turns); post-call evaluation criteria and typed data-collection fields stored on the call; per-turn named latency timers, tool calls and interruption flags in the transcript; a call-result enum and termination reason with a provider error object; fine-grained per-agent permissions; a CLI that pulls and pushes agents as files; pre-call personalisation hook and post-call signed webhooks.',
  rationale='All exist in the live API of the funded leader (claims AP-EL-09 to AP-EL-14, AP-EL-26 to AP-EL-28, AP-EL-37, AP-EL-38) and are the baseline a developer or ops buyer compares us with. They are cheap next to the Indian-operator layer and do not differentiate by themselves.',
  reverse_if='Buyer interviews (10-15 operations leads) show Indian enterprise users never use branching, simulated tests or webhooks, or a competitor with fewer objects wins the same configure-and-fix tasks in usability sessions.')

beat = node('decision', 'beat-list-api-visible', 'decision', 'proposed', 'model',
  'Proposed places to beat ElevenLabs that its API makes visible: (1) the Indian operator layer is absent from the batch and call objects (no calling window, DND/NCPR scrub, consent or suppression field, no India-specific failure reason); (2) safe defaults: reject unknown fields, cross-check voice against language, show the model actually in effect per call and never reroute silently, retention and redaction chosen at onboarding, bursting off until the buyer opts in; (3) a first-class contact/lead object (ElevenLabs has only a user_id string); (4) dependency-clean deletion; (5) a Hinglish switch that is measured and documented, not a boolean.',
  rationale='Each gap is observed in the live API and docs (claims AP-EL-12, AP-EL-13, AP-EL-18 to AP-EL-20, AP-EL-26, AP-EL-27, AP-EL-33, AP-EL-47). They fit the measured pain areas (usability, support, billing) in the 459 coded Indian complaints, and the owner wants better design, usability and case handling.',
  reverse_if='A later ElevenLabs release ships the campaigns product with windows, retries and suppression (its dashboard bundle already carries those routes), or buyer interviews rank any of these below price and voice quality.')

risk = node('risk', 'silent-model-fallback', 'risk', 'open', 'model',
  'ElevenLabs LLM deprecation can reroute traffic to a replacement model without the buyer editing the agent (warning 90 days, fallback from 60 days at 25% of traffic, complete at 20 days). A competitor or a supplier doing this to VP would change voice behaviour under a fixed agent version, and a VP test filed under one model may not have run on it (inference from the fields, no live fallback seen).',
  mitigation='VP pins every model by dated id, records the model actually used on each call, gates any replacement behind the owner and keeps the no-mid-test-swap rule (directive.2026-10-20.no-midcall-swap).')

reject = node('rejected', 'api-key-for-key-management', 'rejection', 'confirmed', 'verified',
  'Rejected: using the ElevenLabs API key to read or manage workspace API keys, billing and seats.',
  tried='GET /v1/workspace/api-keys with our xi-api-key; also tried DELETE on an environment variable and DELETE of a tool after its agent was deleted.',
  broke='Key listing answered 401 "Neither authorization header nor xi-api-key received" although the key was sent, environment variables have no DELETE route (405), and the tool and KB document stayed "in use by Unknown / Main" (409) until force=true. Key management, billing and seats need a dashboard login; cleanup of probes is partly impossible.')

opn = node('open', 'live-behaviour-unmeasured', 'open-question', 'open', 'model',
  'ElevenLabs behaviours the API names but only a call can settle: what hinglish_mode changes, whether a Hindi agent on the default English voice is audibly wrong, what speculative_turn costs in initiated-versus-irreversible LLM generations, whether a live model fallback is visible in the call record, how the bring-your-own-brain speech engine behaves, whether the hidden outbound-campaigns product is enabled on a new workspace, the real handset reply gap with default turn settings, and API rate limits.',
  closes_when='The call-battery phase places at least 30 clean turns per configuration (default Hindi agent, voice-swapped Hindi agent, hinglish_mode on and off) on our own verified numbers with a billable plan, and a dashboard-login pass confirms which of the unpublished product areas are visible.')

speech = node('open', 'speech-engine-bring-your-own-brain', 'open-question', 'open', 'model',
  'Should VP offer a speech-engine style interface (we run speech, turn-taking and telephony; the customer or we run the brain over a WebSocket)? ElevenLabs ships exactly this (POST /v1/speech-engine with a ws_url and a cascade timeout). It would let VP\'s Hinglish brain and later memory ride other voice stacks, and it would let competitors put a brain on ElevenLabs\' voices.',
  closes_when='Buyer interviews show whether Indian enterprises already own a brain (CRM or LLM layer) they want to keep, and the architecture review shows the turn-taking floor holds with a remote brain over India-region links.')

edges = []
def edge(a, b, rel):
    edges.append({'from': a, 'to': b, 'relation': rel})
mine = {n['id'] for n in N}
for n in N:
    if n['id'] != claims: edge(n['id'], claims, 'part-of')
edge(claims, 'evidence.2026-10-20.teardown-brief', 'derived-from')
edge(claims, 'decision.2026-10-20.teardown-lines', 'implements')
edge(floor, 'open.2026-10-20.parity-floor-vs-wedge', 'informs')
edge(floor, 'decision.2026-10-20.blueprint-frame', 'informs')
edge(beat, 'decision.2026-10-20.blueprint-frame', 'informs')
edge(beat, 'rejected.2026-10-17.parity-undercut', 'extends')
edge(beat, 'open.2026-10-20.presale-vs-postsale', 'informs')
edge(memory, 'module.memory-learning', 'informs')
edge(memory, 'decision.2026-10-20.preference-only-memory', 'informs')
edge(hinglish, 'design.voice-platform-blueprint', 'informs')
edge(wire, 'design.voice-platform-blueprint', 'reusable-for')
edge(risk, 'directive.2026-10-20.no-midcall-swap', 'constrains')
edge(opn, claims, 'leaves-open')
edge(speech, 'design.voice-platform-blueprint', 'informs')
edge(llmcost, defaults, 'supports')
bad = [(e['from'], e['to']) for e in edges if e['to'] not in gids and e['to'] not in mine or (e['from'] not in gids and e['from'] not in mine)]
if bad: print('BAD EDGES', bad); raise SystemExit(1)
for n in N:
    for p in ([n['path']] if 'path' in n else n.get('paths', [])):
        assert os.path.exists(ROOT + p), p
    assert n['id'].count('.') >= 2
events = [{'date': D, 'event': 'account_elevenlabs_done', 'source': R + 'claims.json',
  'details': 'ElevenLabs authorized-surface lane finished.\n- about 110 authorized requests with our free-tier key at about 1/s; no call, number, batch, simulation, test run, webhook or WebSocket session, no spend;\n- created, read back and deleted synthetic probe objects (2 agents, 2 tools, KB document, simulation test, tag, branch, merge proposal); one environment variable stays because no DELETE route exists;\n- read six published packages without installing; REA ran on the client SDK dist;\n- found that new-agent defaults differ from the schema, unknown fields are ignored, hinglish_mode exists in the API but not the docs, user memory is built and gated by a workspace flag, and key management needs a dashboard login.\nreport.md was not written because the subagent contract forbids report files; the report text went back in the lane structured output.'}]
out = {'nodes': N, 'edges': edges, 'events': events}
json.dump(out, open(ROOT + 'context/inbox/account-elevenlabs.json', 'w'), indent=1, ensure_ascii=False)
print(len(N), 'nodes', len(edges), 'edges')
