# Google access for the voice lab: Vertex restriction, appeal, paid project (2026-10-20)

This is the record of how the lab lost Vertex AI and what has to happen to get a fast, high-limit Gemini path
back. Nothing secret is in this file. Keys live only in the scratchpad env files and in `/opt/voicelab/.env` (mode 600)
on the VM.

## What happened

| When (2026-10-20) | What |
|---|---|
| 08:00–09:00 UTC | The brain bake-off (`voicelab/evals/convo_bench.py`) sent about 600 Vertex requests from the coding agent's US cloud sandbox. Gemini was a candidate brain, the simulated caller and one of the judges. The India lab VM was using the same service-account key at the same time. |
| 14:19 IST | Google Cloud Trust & Safety emailed team@vyakti.ai: project `vp-voice` had Agent Platform (Vertex AI) restricted for a suspected Service Specific Terms violation. The email did not name any activity. |
| right after | The VM got `VERTEX_OFF=1`, and `providers.py` gained a 6-hour 401/403 breaker. We confirmed the Gemini API keys still work: models list returned 200. |

**Usage before the notice:**
- about 730 requests in total, under USD 1;
- about 128 from the India VM over 19–20 Oct;
- about 600 from the sandbox in one hour.

**Likely triggers.** This is our inference; Google has not confirmed it.
1. One SA key was used from two countries within an hour.
2. An automated burst followed project and key creation on a free-trial credit.
3. The SA key had been pasted in chat.

**Rule since then:** any workload using Google credentials runs only from the India VM, rate-limited, and never from the
coding agent's sandbox. The graph has this as `decision.2026-10-20.google-from-india-only`.

## Appeal (prepared for Instinct; the owner reviews it before sending)

The SA key pasted in chat must be deleted first: IAM → Service Accounts → vp-voicelab → Keys. Only then submit the
appeal through the REQUEST AN APPEAL link in the email. The appeal body we drafted is below. Every statement in it was
true on 2026-10-20.

> Vyakti (vyakti.ai) is an early-stage Indian startup building a voice assistant for Indian businesses: an AI agent
> that talks in Hindi and English on phone calls, for customer service, insurance renewal reminders and enquiry
> follow-ups. It always tells people it is an AI.
>
> How we used Agent Platform (19 and 20 October 2026 only):
> - Text generation with Gemini 3.5 Flash-Lite, Gemini 3.6 Flash and Gemini 3.8 Flash (streamGenerateContent, global
>   endpoint) for the assistant's replies in our internal test lab.
> - The same models in one automated quality evaluation, in which Gemini played a simulated test caller and compared
>   conversation transcripts.
> - Speech generation with Gemini 3.8 Flash TTS and Gemini 3.8 Flash-Lite TTS, to voice those replies.
> - We did not fine-tune or train any model, did not use Gemini outputs to train other models, and do not resell access.
>
> Who and how often: the lab is internal and passcode-protected. It is used by 4 people on our team, all in India, who
> consented to recorded test calls. Every scenario uses fictional companies and made-up data, and phone calls go only to
> team members' own verified numbers. In total: about 730 requests over two days, under USD 1 of usage. About 128 came
> from our lab server, and about 600 from a single automated evaluation run on 20 October between 08:00 and 09:00 UTC.
>
> Countries: India (our team, and our lab server on Microsoft Azure Central India, Pune) and the United States (the
> cloud environment our AI coding assistant runs in, which ran the one evaluation batch).
>
> What may have triggered the review: the same service-account key was used from two countries within an hour, and an
> automated batch sent about 600 requests shortly after the project and key were created. Both were our own legitimate
> testing. The key had also been shared in a private chat with our coding assistant.
>
> What we have done: we stopped all Agent Platform calls from our lab in code until this review is finished. We deleted
> that service-account key. Going forward we will call Agent Platform only from our India server, with a new key limited
> to the Vertex AI User role, rate-limited evaluation runs, and our existing spend cap (INR 20,000).

**Status on 2026-10-20:** we don't know whether the owner submitted it. Nothing has come back from Google.

## Ways to get fast Gemini voices back (owner's choice)

| Option | What it takes | Trade-off |
|---|---|---|
| 1. Gemini API key → Tier 2 | The key's billing account reaches **$100 cumulative paid**, with 3 days since the first payment (ai.google.dev rate-limits page, read 2026-10-20). | No new project. Lifts the Tier-1 per-model daily caps, measured on 2026-10-19 at 100 requests/day for 3.8 Flash TTS, which each reply uses about twice. |
| 2. New paid Vertex project | **Owner chose this.** Account compliance@carbonsettle.com, project `voicelab-india`. | Highest limits and the fastest voices (0.45–0.8 s first audio). A new project doing the same work while vp-voice is under review could look like dodging the restriction. CarbonSettle's main Google account carries that risk. The owner was told. |
| 3. vp-voice appeal approved | Google restores access. | Brings back the ₹28,694 free-trial credit, which expires 2026-11-15. |

**Instinct prompt given for option 2:**
- Sign-in, billing and project:
  - signed in as compliance@carbonsettle.com;
  - reuse the existing Tier-1 Prepay billing account only if the owner agrees, otherwise create a new "Voice lab" billing account;
  - prepay only an amount the owner approves, between $5 and $100;
  - no auto top-up;
  - project `voicelab-india`.
- API and budget:
  - enable only `aiplatform.googleapis.com`;
  - set a budget equal to the approved amount, with alerts at 50/90/100%.
- Service account and key:
  - service account `voicelab-india` with exactly one role, Vertex AI User;
  - JSON key to the owner's vault, never pasted in chat;
  - if org policy `iam.disableServiceAccountKeyCreation` blocks key creation, stop and report it.
- Report back:
  - project ID;
  - billing account and amount;
  - budget;
  - SA email;
  - confirmation the key is in the vault;
  - any warnings.

## When the key arrives (runbook)

1. Save the JSON as `vertex-sa.json` in the session scratchpad, mode 600. It is never committed and never sent to Google
   from the sandbox. `ops/lab_ops.py` passes the file to the VM as `VERTEX_SA_B64`. `ops/vm_setup.sh` writes it to
   `/opt/voicelab/vertex-sa.json`, mode 600, and points `VERTEX_SA_FILE` at it.
2. In `ops/vm_setup.sh`:
   - add `VERTEX_PROJECT=voicelab-india` to the env block. `providers.py` reads `VERTEX_PROJECT` and falls back to
     `vp-voice` when it is unset;
   - deploy with `VERTEX_OFF=0`. The script defaults it to 1.
3. Redeploy (`ops/deploy.sh`), then check `/api/catalog` from the VM to confirm Vertex is usable.
4. Ramp up slowly:
   - one India smoke call per Gemini stack (`ops/smoke.sh` via `lab_ops.py run`, 3 replies each);
   - then human testing;
   - no bake-off batches for the first 48 hours;
   - after that, bake-offs run on the VM only, at ≤1 request/s.
5. Confirm from the VM:
   - Gemini TTS first audio is back to 0.6–0.8 s;
   - the v2-flashlite reply gap is about 1.6–2.2 s (the 2026-10-20 India smoke).
6. Then collect round-2 human ratings. That is `open.2026-10-20.round2-human-ratings`.

## 2026-10-21: vp-voice reinstated (option 3)

Google Cloud Trust & Safety emailed that vp-voice is reinstated "based on information that you have provided". The
email asks us to fix any outstanding issues so the project complies with the Terms of Service and the AUP. The appeal's
statements now bind every use (`decision.2026-10-21.appeal-commitments-binding`):
- Agent Platform is called only from India;
- one key, holding Vertex AI User only;
- spend is capped at INR 20,000;
- no batches for 48 h after the key lands, then at most 1 request/s, from the VM only.

Changes to the runbook above:
- **Project:** `VERTEX_PROJECT` stays unset. `providers.py` falls back to `vp-voice`.
- **Old key:** the scratchpad copy of the pasted key (id ending a6d78b) was deleted, so redeploys can no longer push it
  back.
- **Key hand-off, replacing step 1:**
  - Instinct creates one new JSON key and PUTs it to a write-only, one-blob SAS link
    (`vl-transfer/inbox/vp-voice-sa.json`, 12 h expiry). It is never pasted in chat or put in Drive.
  - A VM Run Command pulls the blob to `/opt/voicelab/vertex-sa.json` (mode 600), and the blob is then deleted.
  - The agent checks only `client_email` and `project_id`, never the key.
- **Region guard:** the lab and the product take the Vertex route only when `VP_REGION` names an Indian region (voice
  c5be193). The switch-back must set `VP_REGION=centralindia` in `/opt/voicelab/.env` along with `VERTEX_OFF=0`. Without
  it, Gemini stacks stay off, and the only sign is one line in the log.
- **Instinct checklist, before the key is made:**
  - read the Cloud Logging notice;
  - delete every old key;
  - vp-voicelab holds Vertex AI User only;
  - an INR 20,000 budget with alerts at 50/90/100%;
  - Vertex request metrics after 20 Oct 09:00 UTC (expected zero).
