# Results out: webhooks, the call record and the calls export

Vyakti sends what happens on calls to your own systems: a CRM, a data warehouse, or a service you run. There are three
ways out, and they all carry the same records:

- **Webhooks** (Settings > Webhooks, or `webhook.create`): a signed `POST` to your address for each event.
- **`call.record`** (API): the full record of one call, the same record `call.ended` sends.
- **`call.export`** (Calls > Export as CSV): the calls list for a filter, as a CSV file.

Code: `server/modules/workspace/webhooks.ts`, `server/modules/workspace/results.ts`, `db/migrations/1020_workspace_results_out.sql`.
Tests: `tests/results-out.test.ts`.

## Events

| Event | When | Record (`data`) |
|---|---|---|
| `call.ended` | A call ended and its analysis settled (outcome, reason, follow-ups). Once per call. | `vyakti.call.v1` |
| `campaign.state_changed` | A campaign moved between `draft`, `scheduled`, `running`, `paused`, `completed`, `cancelled`. | `vyakti.campaign_state.v1` |
| `contact.opted_out` | A person was suppressed: they asked on a call, were marked in an imported file, or staff added them. | `vyakti.contact_opt_out.v1` |
| `hand_off.created` | The agent handed the call to a person or queued a callback. | `vyakti.hand_off.v1` |

A webhook listens for a list of events. `campaign.*` matches every campaign event, and `*` matches all of them.
`webhook.events` lists them.

What is never sent:
- **Test calls never emit anything.** That covers the browser test call, practice calls, and a hand-off made on one.
- **An erasure's own suppression is not announced.** The person asked for their data to go, not to travel further.

## The request

```
POST <your address>
content-type: application/json
user-agent: vyakti-webhooks/1
x-vp-event: call.ended
x-vp-delivery: <delivery id>
x-vp-signature: t=<unix ms>,v1=<hex HMAC-SHA256(signing secret, t + "." + raw body)>
x-vp-test: 1                         (only on a test event)
authorization: Bearer <token>        (only when the webhook signs in with a custom HTTP integration)

{ "id": "<delivery id>", "event": "call.ended", "createdAt": "2026-10-24T09:30:00.000Z",
  "test": true,                       (only on a test event)
  "replayOf": "<delivery id>",        (only on a replay)
  "data": { ...the record... } }
```

How to check a request:
1. Compute the HMAC over the **exact bytes** of the body.
2. Refuse a `t` more than five minutes old.
3. Use `x-vp-delivery` (the envelope `id`) to drop a repeat.

Delivery rules:
- Answer with a 2xx status. Anything else, or no answer within 8 seconds, is a failure.
- A failure is retried up to 5 tries in all, waiting 30 s, 2 min, 8 min and 32 min between them.
- After that the delivery is marked failed. It can be sent again from the deliveries list (`webhook.replay`, which needs
  approval).
- A test event is tried once.

The signing secret (`whsec_…`) is shown once, to the person who approves the webhook. A webhook is a policy change, so an
owner or compliance lead approves it.

### Records are built when they are sent

A delivery stores only ids. The record is built from what Vyakti holds at the moment it is sent. That applies to the first
try, every retry and a replay. So:
- **An erasure that lands before a send is respected.** The record carries no number, no name and no words, and
  `transcriptRemoved` is set.
- **Transcripts retention is respected.** A replay after the words were removed sends none.
- **The recording link is signed fresh for each send.** It lives one hour, the most the voice runtime accepts.
- **The deliveries list (`webhook.deliveries`) never holds a phone number or a transcript.**

### Phone numbers: full or masked

Each webhook chooses one of two settings:
- **`masked`** (the default) sends `+91•••••1234` and the name as initials (`RK.`), with `contact.masked: true`.
- **`full`** sends the whole E.164 number and name. The approval card says personal data leaves Vyakti, and only an
  owner or compliance member can approve it.

`call.record` follows the reader's role: a viewer always gets numbers masked. `call.export` is owner or compliance only,
so its file has full numbers.

### Signing in with a custom HTTP integration

Connect "Your own HTTP service" (`custom_http`) under Integrations, with a bearer token and a base address. A webhook can
then sign in with it (`authIntegrationId`), and every delivery sends `Authorization: Bearer <token>` as well as the
signature. The rules:
- The webhook's address must be on the integration's base address, so the token is never sent anywhere else.
- If the integration is disconnected, deliveries fail and say so; nothing is sent without the token.

Other integration kinds (HubSpot, Zoho, Salesforce, Google, WhatsApp, Exotel, Slack) can be connected and their
credentials are stored encrypted, but **nothing uses them yet**. The Integrations page labels them "Stored, not used yet".

## `vyakti.call.v1` (event `call.ended`, and `call.record`)

```json
{
  "schema": "vyakti.call.v1",
  "id": "3c652f9d-…", "workspaceId": "…", "channel": "phone", "direction": "outbound", "status": "done",
  "startedAt": "2026-10-24T09:29:20.000Z", "endedAt": "2026-10-24T09:29:50.000Z", "durationS": 30, "endReason": "completed",
  "contact": { "id": "…", "e164": "+919000010000", "masked": false, "name": "Ravi Kumar", "erased": false },
  "campaign": { "id": "…", "name": "Renewals" },
  "attemptId": "…",
  "agent": { "id": "…", "name": "Asha", "version": 1, "versionId": "…" },
  "outcome": { "value": "agreed", "grade": "ai_guess", "counts": false },
  "reason": { "code": "CONV_GOAL_DONE", "label": "The agenda was completed" },
  "flagged": false, "flags": [],
  "transcriptRemoved": null,
  "transcript": [ { "speaker": "agent", "text": "…", "startMs": 0, "endMs": 2000 }, { "speaker": "caller", "text": "…", "startMs": 3000, "endMs": 5000 } ],
  "summary": "They will pay tomorrow.",
  "extracted": {
    "facts":   [ { "kind": "commitment", "key": "pay_by", "value": "tomorrow", "quote": "I will pay tomorrow" } ],
    "points":  [ { "claim": "They will pay tomorrow.", "quote": "I will pay tomorrow", "startMs": 9000 } ],
    "moments": [ { "kind": "objection", "atMs": 4000, "quote": "…" } ],
    "followUpRequested": false
  },
  "handOffs": [ { "id": "…", "mode": "warm", "destination": "team:support", "status": "queued", "reason": "asked_for_person", "summary": "…", "createdAt": "…" } ],
  "analysis": { "status": "done", "model": "…", "quotesDropped": 0 },
  "cost": { "currency": "INR", "totalInrMilli": 4200, "lateInrMilli": 0,
            "lines": [ { "component": "telephony", "provider": "…", "quantity": 30, "unit": "second", "inrMilli": 4200, "priced": true } ] },
  "recording": { "url": "https://…/v1/recordings/…?ws=…&exp=…&sig=…", "expiresAt": "…" },
  "recordingUnavailable": null,
  "runManifest": { "stackId": "v2-flashlite", "combinationId": "…", "components": { "stt": "…", "llm": "…", "tts": "…" }, "fallbacksUsed": [], "…": "…" }
}
```

Field notes:

| Field | Meaning |
|---|---|
| `outcome` | The best-graded outcome: `verified` (your system), then `manager` (a person), then `ai_guess`. `counts` is true when this is the outcome Vyakti's reports and learning count; an AI guess counts only when its judge is calibrated. `null` when there is none. |
| `reason` | Why the call ended the way it did: one of the reason codes, with its plain label. |
| `extracted.facts` | What the person said that memory kept from this call (`kind` is `preference`, `commitment`, `context` or `objection`), each with the caller's exact words. |
| `extracted.points`, `extracted.moments` | The analysis's claims and moments. Each quote is verified against the transcript; unverifiable ones are dropped before they are stored. |
| `cost.lines[].inrMilli` | Thousandths of a rupee. A line with `priced: false` (analysis tokens) has no price yet and reads 0. |
| `recording` | `null` when there is none, it was deleted, it is past retention, or the person asked to be erased. `recordingUnavailable` then says which. |
| `runManifest` | The stack and components that actually ran. |

When the words were removed, the record looks like this:

```json
"contact": { "id": "…", "e164": null, "masked": false, "name": null, "erased": true },
"transcriptRemoved": { "reason": "erased", "message": "Transcript removed on the person's erasure request. Timing, outcome and cost are kept." },
"transcript": [], "summary": null,
"extracted": { "facts": [], "points": [], "moments": [ { "kind": "objection", "atMs": 4000 } ], "followUpRequested": false },
"recording": null
```

The rules:
- `reason` is `erased` or `retention`.
- `contact` is blanked only for an erasure.
- Timing, outcome, reason, cost and the run manifest are kept.
- The record is redacted as soon as an erasure request is on file, even before the purge job has reached that call.

## `vyakti.campaign_state.v1` (event `campaign.state_changed`)

```json
{ "campaignId": "…", "name": "Renewals", "from": "running", "to": "paused", "cause": "person", "at": "2026-10-24T09:31:02.114Z" }
```

`cause` is the campaign's pause cause when there is one (`person`, `guard`, `cap_reached:campaign`, …), else `null`.

## `vyakti.contact_opt_out.v1` (event `contact.opted_out`)

```json
{ "schema": "vyakti.contact_opt_out.v1", "suppressionId": "…", "workspaceId": "…",
  "contact": { "id": "…", "e164": "+919000010000", "masked": false, "name": "Ravi Kumar", "erased": false },
  "scope": "workspace", "campaign": null, "via": "call", "conversationId": "…", "at": "…" }
```

| Field | Meaning |
|---|---|
| `via` | `call` (the person said so on a call), `staff` (added by your team) or `import` (marked in an imported file). |
| `scope` | `campaign` for a single-campaign suppression; `campaign` then names that campaign. |
| `conversationId` | The call it was said on, when there is one. |

The caller's words stay in Vyakti.

## `vyakti.hand_off.v1` (event `hand_off.created`)

```json
{ "schema": "vyakti.hand_off.v1", "id": "…", "workspaceId": "…", "conversationId": "…", "mode": "warm", "destination": "team:support",
  "status": "queued", "reason": "asked_for_person", "summary": "…",
  "contact": { "…": "…" }, "campaign": { "id": "…", "name": "…" }, "agent": { "id": "…", "name": "Asha", "version": 1 }, "at": "…" }
```

`summary` is left out when the call's words were removed.

## Test events

`webhook.test` (Settings > Webhooks > Send test event) sends a made-up record of an event's shape at once, to one webhook,
whatever that webhook listens for:
- the default event is `call.ended`;
- the request carries `"test": true` and `x-vp-test: 1`;
- every value is synthetic: ids are all zeros and the number is `+919000000000`;
- it is tried once, and the result is shown on the page and in the deliveries list.

## `call.export` (CSV)

Approval:
- `call.export` takes the calls-list filter: `campaignId`, `agentVersionId`, `outcome`, `reasonCode`, `from`, `to`,
  `flagged`.
- It is a policy action: an owner or compliance member asks for it, and an owner or compliance member approves it.
- The approval gives a download address, `/v1/exports/calls/<id>`, valid for 24 hours.

Download:
- Only a signed-in owner or compliance member can download it, not an API key.
- Each download is audited (`call.export.download`).
- The file is **made when it is downloaded**, streamed page by page from the calls as they are then. So someone
  suppressed or erased after the approval is not in it.

What is never in the file:
- test calls;
- live calls;
- anyone with a workspace-wide suppression;
- anyone erased or with an erasure request on file.

Columns:

```
call_id, started_at, ended_at, duration_s, direction, campaign, agent, agent_version, phone, contact_name, outcome, outcome_grade,
reason_code, reason, end_reason, cost_inr, flagged, flags, transcript_removed, summary
```

Formatting:
- `phone` is the validated E.164 number, written as it is.
- Every cell a person or a model wrote (names, campaign and agent names, outcome, summary) is formula-escaped: a cell
  that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe. Opening the file in a
  spreadsheet never runs anything.
- `transcript_removed` is `erased`, `retention` or empty. When it is set, `summary` is empty.
