import json
D='2026-10-20'
P='research/2026-10-20/account-phase/sarvam/'
A='data/account-phase/sarvam/'
n=[]
def node(**k):
    k.setdefault('date',D); n.append(k)
node(id='evidence.2026-10-20.acct-sarvam-claims',type='evidence',status='proposed',source='verified',
 title='Sarvam authorized-surface phase: 55 graded claims (39 observed, 7 inferred, 7 vendor-claimed, 2 unknown) from 29 authorized requests with our own Model API keys (plus 6 unauthenticated GETs of public MCP OAuth metadata), the live Voice Agents and Model API OpenAPI files, 52 re-fetched docs pages, four published SDK packages (Python and npm, conv-ai and model SDKs) and one REA run on the npm conv-ai SDK. No call, number, agent or other billable action; the Voice Agents control plane refused both keys, so no Voice Agents object was read or created.',
 path=P+'claims.json')
node(id='rejected.2026-10-20.acct-sarvam-model-key-for-voice-agents',type='rejection',status='confirmed',source='verified',
 title='Using the stored Sarvam keys (Model API class) against the Voice Agents control plane to create and read back an agent, list deployments or read analytics.',
 tried='One read-only GET per route on apps.sarvam.ai (analytics query-schema, app-authoring deployments, app-runtime signed-URL) with all-zero UUID scope, with X-API-Key, Bearer and the Model API header, using both the SARVAM2 and the SARVAM team key. The same keys returned 200 on api.sarvam.ai/v2/models.',
 broke='Every Voice Agents route answered 401 "Invalid API key format" (X-API-Key) or "Malformed token" / "Invalid Bearer token" (Bearer). Voice Agents needs a separate workspace key made in the dashboard (Settings > API Key); the Model API key is a different class. So no agent config JSON, deployment, campaign, cohort or call log could be read, and the lane relied on the OpenAPI, SDKs and docs for the Voice Agents data model.',
 path=A+'api-reads/va-schema-xapikey.body')
node(id='measure.2026-10-20.acct-sarvam-api-surface',type='measurement',status='measured',source='verified',
 title='Sarvam publishes a 68-operation Voice Agents REST API (analytics 24, scheduling 19, evals 15, app-authoring 6, outbounds 1, BYOK 3) and a 53-operation Model API; the Voice Agents spec has no agent create/edit/commit, telephony, knowledge-base, voice, secrets, API-key or DND operations (the docs name a DND API the spec lacks), so agent authoring lives only in the dashboard, Genie and the MCP server.',
 n='68 Voice Agents operations, 175 schemas; 53 Model API operations',
 method='script over the live OpenAPI files (docs.sarvam.ai/openapi/voice-agents.json and apis.json, fetched 2026-10-20, voice-agents spec identical to the public-phase copy) grouped by service base URL; absence checked by path and keyword search (0 matches for dnd, dlt, ncpr)',
 path=A+'derived/endpoints.csv')
node(id='evidence.2026-10-20.acct-sarvam-webhook-model',type='evidence',status='proposed',source='verified',
 title='Sarvam webhooks are post-call only (campaign attempt, inbound call, instant outbound), with {url, metadata} as the whole config: no signature or secret field, no mid-call hook, English-only transcripts (en_text), delivery records running/completed/failed and re-delivery of up to 200 attempts. Mid-call integration is the opposite direction: the agent calls the customer HTTPS tool, on-start/on-end hooks or Python code tools.',
 path=A+'derived/voice-agents-schemas-readable.txt')
node(id='measure.2026-10-20.acct-sarvam-sdk-spec-drift',type='measurement',status='measured',source='verified',
 title='Sarvam artefacts disagree with each other: three language lists (OpenAPI 13 with Sanskrit, Python SDK 13 with Konkani, npm SDK 11), different audio rates (Python in 16/48 kHz, npm in 8/16 kHz), the npm SDK is 7 months behind Python (0.0.42 vs 1.1.1), 12 documented doc-vs-spec mismatches in all (e.g. a DND API and ConnectionConfig fields that the spec lacks).',
 n='3 SDK/spec artefacts compared; 12 mismatches recorded',
 method='scripted diff of enums in the OpenAPI, sarvam-conv-ai-sdk 1.1.1 (PyPI wheel) and 0.0.42 (npm tarball), plus manual reading of 52 docs pages, 2026-10-20',
 path=A+'derived/doc-vs-spec-mismatches.json')
node(id='evidence.2026-10-20.acct-sarvam-stt-vad-knobs',type='evidence',status='proposed',source='verified',
 title='Turn-taking lives in Sarvam\'s STT service: the realtime STT WebSocket exposes ten frame-level VAD parameters (thresholds, min speech frames, negative-frame window, interrupt frames, pre-speech pad, volume gate) while the agent builder offers only three coarse settings (interrupt on/off, sound sensitivity, eagerness) plus nudges. Mapping builder sliders to those parameters is inferred, not documented.',
 path=A+'sdk/pypi-sarvamai/x/sarvamai/speech_to_text_streaming/client.py')
node(id='evidence.2026-10-20.acct-sarvam-voice-persona-catalog',type='evidence',status='proposed',source='verified',
 title='Sarvam sells voices as job-tagged personas: 222 v4-flash slugs named name_language_style across 50 style tokens (customer 15, recovery 10, companion 11, sales 5, banking 5, insurance 3; hi 116, en 62, enhi 13); the docs say 176 voices while the API enum has 266 slugs.',
 path=A+'derived/tts-voice-catalog-summary.json')
node(id='decision.2026-10-20.acct-sarvam-parity-floor-items',type='decision',status='proposed',source='model',
 title='Proposed: add to the v1 parity floor what Sarvam\'s API already gives buyers: attempt and interaction records with failure reason and ended-by, cohort validation with a downloadable rejected-records file, retry ladder by outcome class, per-user number rotation, first-class transfer records, stereo recordings, post-call webhooks with re-delivery, an eval API with a judge, a SQL analytics API and typed SDKs plus an MCP server.',
 rationale='Each exists in Sarvam\'s live spec at INR 3-3.5/min (claims SAC-14 to SAC-23, SAC-29, SAC-33, SAC-34), so an Indian enterprise buyer comparing against it will expect them. They are a floor, not a wedge, in line with the 2026-10-17 rejection of parity-undercut.',
 reverse_if='Buyer interviews show Indian operations leads never use failure-reason filters, rejected-record downloads, evals or SQL boards (a no-code-only buyer), or usability sessions show a simpler model wins the same tasks.')
node(id='decision.2026-10-20.acct-sarvam-beat-where-thin',type='decision',status='proposed',source='model',
 title='Proposed: aim VP\'s differentiation at the places Sarvam\'s API is thin: user-visible model and voice choice, signed webhooks, mid-call function hooks, a usage and cost API, cross-call memory, consent/DND/window objects with category-aware calling hours, and an agent-authoring REST API that is as complete as the dashboard.',
 rationale='Sarvam\'s spec has no model picker or BYO (temperature only), WebhookConfig is url plus metadata with no signing, no mid-call callback, no usage/balance endpoint, memory is per call with caller context pulled from the customer, and compliance is "your responsibility" with free-form calling windows. These are measurable gaps on tasks we can run in the call-battery phase.',
 reverse_if='Interviews show buyers do not value these (they take a closed bundle at INR 3-3.5 without wanting hooks or signing), or Sarvam ships them (watch changelog/OpenAPI hash).')
node(id='open.2026-10-20.acct-sarvam-workspace-key',type='open-question',status='open',source='model',
 title='Needed: a Voice Agents workspace API key (dashboard Settings > API Key) or a dashboard session on the SARVAM2 account. Without it we still lack: an agent\'s full config JSON, version history, telephony connection and number objects, KB ingestion, query-schema table list, a messy-CSV cohort validation, schedule-window enforcement, voicemail/transfer behaviour, call logs and ledger lines.',
 closes_when='The owner or Instinct creates a workspace key (kept in the scratchpad env file) or lets a dashboard phase run; then create and read back one synthetic agent, a paused future campaign with a 50-row messy cohort, a test suite run (INR 2) and the query-schema list, and score pre-registered predictions SAR-P01 to P08.')
node(id='open.2026-10-20.acct-sarvam-hook-signing-and-retries',type='open-question',status='open',source='model',
 title='Does Sarvam sign webhooks (the settings page mentions secrets for webhook auth headers), how does it retry a failed delivery, and do tool-call or transfer events exist beyond the 8 typed SDK messages?',
 closes_when='A call-battery campaign or instant outbound run delivers to a public endpoint of ours and we record headers, retries on forced 500s, and the WebSocket frames for variable_update, state_transition, kb_query and tool_call.')
node(id='asset.2026-10-20.acct-sarvam-spec-analysis-kit',type='asset',status='proposed',source='verified',
 title='Sarvam teardown tables: endpoints.csv (121 operations with service, base URL, schemas), data-model.json (object graph), config-knobs.json (35 knobs graded), conv-ai-sdk-protocol.json (message types, SDK diffs), doc-vs-spec-mismatches.json, tts-voice-catalog-summary.json and the scripts that build them.',
 paths=[A+'derived/endpoints.csv',A+'derived/data-model.json',A+'derived/config-knobs.json',A+'derived/conv-ai-sdk-protocol.json',A+'derived/doc-vs-spec-mismatches.json',P+'code/derive.py',P+'code/derive2.py'],
 value='Feeds the product blueprint dimensions (data model, lifecycle, config, billing) and the parity-floor Kano list; the scripts re-run against a changed spec to give a diff in minutes.',
 effort='Low: re-run derive.py after refetching the OpenAPI; about 15 minutes.')
E=[]
def e(f,t,r): E.append(dict(**{'from':f,'to':t,'relation':r}))
e('evidence.2026-10-20.acct-sarvam-claims','evidence.2026-10-20.teardown-brief','derived-from')
e('evidence.2026-10-20.acct-sarvam-claims','decision.2026-10-20.teardown-lines','implements')
for x in ['rejected.2026-10-20.acct-sarvam-model-key-for-voice-agents','measure.2026-10-20.acct-sarvam-api-surface','evidence.2026-10-20.acct-sarvam-webhook-model','measure.2026-10-20.acct-sarvam-sdk-spec-drift','evidence.2026-10-20.acct-sarvam-stt-vad-knobs','evidence.2026-10-20.acct-sarvam-voice-persona-catalog']:
    e(x,'evidence.2026-10-20.acct-sarvam-claims','part-of')
e('rejected.2026-10-20.acct-sarvam-model-key-for-voice-agents','open.2026-10-20.trial-accounts','informs')
e('evidence.2026-10-20.acct-sarvam-stt-vad-knobs','open.2026-10-19.turn-taking','informs')
e('decision.2026-10-20.acct-sarvam-parity-floor-items','open.2026-10-20.parity-floor-vs-wedge','informs')
e('decision.2026-10-20.acct-sarvam-parity-floor-items','measure.2026-10-20.acct-sarvam-api-surface','derived-from')
e('decision.2026-10-20.acct-sarvam-beat-where-thin','decision.2026-10-20.blueprint-frame','informs')
e('decision.2026-10-20.acct-sarvam-beat-where-thin','evidence.2026-10-20.acct-sarvam-webhook-model','derived-from')
e('decision.2026-10-20.acct-sarvam-beat-where-thin','ledger.CMP-27','informed-by')
e('open.2026-10-20.acct-sarvam-workspace-key','open.2026-10-20.trial-accounts','leaves-open')
e('open.2026-10-20.acct-sarvam-hook-signing-and-retries','evidence.2026-10-20.acct-sarvam-webhook-model','leaves-open')
e('asset.2026-10-20.acct-sarvam-spec-analysis-kit','decision.2026-10-20.teardown-launch','reusable-for')
ev=[dict(date=D,event='account_sarvam_done',source=P+'claims.json',details="Sarvam authorized-surface lane finished.\n- 29 authorized requests with our own Model API keys (about 1 per second) and 6 unauthenticated GETs of public MCP OAuth metadata: model list, voices, dictionaries, nine empty-body validation probes (no spend), Voice Agents routes with zero-UUID scope (refused), public MCP OAuth metadata.\n- Both stored keys are Model API keys; the Voice Agents control plane answered 401 Invalid API key format, so no agent, deployment or campaign was created or read and nothing needs cleanup.\n- Analysed the live OpenAPI (68 Voice Agents operations, 175 schemas; 53 Model API operations), 52 docs pages, four SDK packages and one REA run on the npm conv-ai SDK.\n- Outputs: claims.json (55), manifest.csv, derived tables under data/account-phase/sarvam/derived. report.md was not written (subagent rule); the report text went back in the lane structured output.")]
json.dump(dict(nodes=n,edges=E,events=ev),open('/home/user/sales-enabler/context/inbox/account-sarvam.json','w'),indent=1,ensure_ascii=False)
print(len(n),len(E))
