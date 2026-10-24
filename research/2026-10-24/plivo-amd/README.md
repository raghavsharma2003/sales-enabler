# Plivo: machine detection, hang-up causes, DTMF, transfer and confirmSound, checked against the public docs

Fetched 2026-10-24 between 07:00 and 07:10 UTC, public pages only, no account or keys. Asked by the integrator after
d6ab70e ("Plivo's parameter and verdict names follow its docs as remembered; not verified on a live call").
Verbatim excerpts of the Calls API page are in `calls-api-excerpts.md`. Still not verified: any of this on a live call.

## Pages

| Page | URL | What it settles |
|---|---|---|
| Calls API reference | https://www.plivo.com/docs/voice/api/calls | `machine_detection` (`true`, `hangup`), `machine_detection_time` (default 5000, range 2000–10000), `machine_detection_url` (asynchronous), `machine_detection_method` (default POST), advanced AMD parameters; the `hangup_url` parameter table; Transfer (`legs`, `aleg_url`, `aleg_method`); Send DTMF (`POST .../Call/{call_uuid}/DTMF/`, `digits`, `leg` = `aleg`/`bleg`, default `aleg`; response `{"message": "digits sent", ...}`) |
| Answering machine detection (concept) | https://www.plivo.com/docs/voice/concepts/machine-detection | The async callback to `machine_detection_url`: `From`, `To`, `Machine` ("true if a machine has been detected"), `CallUUID`, `Event` (always `MachineDetection`), `CallStatus` (`in-progress`). Sent when a machine is found |
| Sync vs async machine detection (support) | https://support.plivo.com/hc/en-us/articles/360042027191 | With `machine_detection_url` set, detection is asynchronous and the call flow continues |
| Hang-up causes | https://www.plivo.com/docs/voice/troubleshooting/hangup-causes | `hangup_cause_name` / code pairs: 3000 No Answer ("Destination unavailable/unreachable"), 3010 Busy Line, 3020 Rejected, 3050 Unallocated number, 3100 Busy everywhere, 3110 Declined, 3120 User does not exist anywhere, 2000 Invalid Destination Address, 2010 Destination Out Of Service, 6010 Ring Timeout Reached, 1000 Canceled, 9100 Machine Detected, 5000 Network Error. No "switched off" or "subscriber absent" entry |
| XML request parameters | https://www.plivo.com/docs/voice/xml/overview | Completed-call parameter `HangupCause`, "Standard telephony hangup cause": `NORMAL_CLEARING`, `USER_BUSY`, `NO_ANSWER`, `CALL_REJECTED`, `UNALLOCATED_NUMBER`, `NETWORK_OUT_OF_ORDER` |
| Dial element | https://www.plivo.com/docs/voice/xml/dial | `confirmSound`: "URL returning XML to play when B-leg answers"; `confirmKey` is a separate attribute and not marked required; the page's example returns `<Speak>` |
| Audio streaming reference | https://plivo.com/docs/voice-agents/audio-streaming/concepts/audio-streaming-reference | Inbound `dtmf` event: `event`, `sequenceNumber`, `streamId`, `dtmf: {track, digit (0-9, *, #, A-D), timestamp}`, `extra_headers`; `clearAudio` is `{"event": "clearAudio", "streamId": ...}` |

## What the code had, and what changed

| Item | Before | Docs | Now |
|---|---|---|---|
| Dial with AMD | `machine_detection: 'true'`, `machine_detection_time: 5000`, `machine_detection_url`, `machine_detection_method: 'POST'` | same names and values | unchanged |
| AMD verdict | `Machine` in ('true', '1', 'yes') ends as voicemail | `Machine` is "true" when a machine is found; `Event` is `MachineDetection` | also requires `Event` to be `MachineDetection` when present |
| Send DTMF | body `{'digits': keys, 'legs': 'aleg'}`, success on 200/202 | the argument is `leg` (`aleg`/`bleg`), not `legs`; the response is a message body | **fixed**: `{'digits': keys, 'leg': 'aleg'}`, success on any 2xx |
| Hang-up cause | substring match on `HangupCauseName` or `HangupCause` | three vocabularies: `HangupCause` (Q.850-style `USER_BUSY`), `hangup_cause_name` ("Busy Line"), `hangup_cause_code` (3010). The documented `hangup_url` table lists none of them; the XML request page lists `HangupCause` | **fixed**: `hangup_reason` reads all three (name, Q.850 cause, numeric code). Rejected / Declined / CALL_REJECTED map to busy; Destination Out Of Service (2010) and SUBSCRIBER_ABSENT to switched_off; User does not exist anywhere (3120), Invalid Destination Address (2000), Unallocated number (3050) to invalid_number; Machine Detected (9100) to voicemail; Ring Timeout Reached (6010), Canceled (1000), No Answer (3000) to no_answer |
| Transfer | `legs: 'aleg'`, `aleg_url`, `aleg_method: 'POST'` | same | unchanged |
| Warm summary | `<Dial confirmSound=...>`, no `confirmKey` | `confirmKey` not marked required; example sets both | unchanged; not verified that it plays without a key |
| Stream DTMF in | `d['dtmf']['digit']` | same; digits may also be A–D | unchanged (A–D are ignored) |

Test fixtures built from these payload shapes: `product/voice/tests/plivo_fixtures.json`, used by `tests/test_plivo_docs.py`.
