# memory-omni: how VP knows the person and the company, and what it may remember

**Status.** Module design for owner review, 2026-10-21 (`directive.2026-10-21.blueprint-end-to-end`). Buildable defaults are in `data/blueprint/memory-omni-defaults.json`. Grades: [M] measured by us, [C] computed, [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown. Paths are under `/home/user/sales-enabler/`.

## 0. The design in ten lines

1. **Three stores, never mixed.** The company brain holds what the company says. The contact record holds what the systems of record say. Contact memory holds what the person said. Relay leaked customer CSV rows into company knowledge (`docs/harvest/se-live.md`), and our "store whatever the call said" memory re-injected brief facts and contradictions (`rejected.2026-10-20.raw-fact-memory`).
2. **Memory is a ledger of quoted facts, not a rewritten summary.** Each fact carries the caller's exact words, the episode, the span and the audio offset, so the client can press play and hear the person say it.
3. **The person is the authority on themselves; systems are the authority on money.** Language, pace, time, channel and opt-out come from the person. Due dates, amounts and record numbers come from the policy, loan or payment system. A caller's "premium 9 hazaar" never overwrites the system's INR 12,400.
4. **Preferences are configuration, not prompt text.** A remembered language sets the medium, the STT hint, the voice and the language-hold check before any prompt is written. This targets the inherited live trial that stored "Hindi" and replied in English [M] (`docs/harvest/hp-handoffs.md` l.36).
5. **Risk sets the write tier.** Opt-out applies at once. Language, script, address (aap/tum), pace, time, channel and heard objections apply automatically, with undo. Commitments, corrections, amounts and custom facts wait for one-tap review. A tenant earns auto-apply per key with measured accuracy.
6. **The pre-call brief is small, purpose-matched and throws.** It holds approved, unexpired facts for this call's purpose, written as key=value shapes. The cap is 1,200 bytes with a fixed drop order. It sits in the delimited data slot of the voice `compile()` and is prefetched during the ring.
7. **Identity is a contact id.** Matching is exact on normalised identifiers. Shared family numbers are detected. Unverified channel senders produce feedback, never memory.
8. **Omni-channel: take the least that makes the next call better, from the most authoritative source, with provenance.** Freshness is checked at dial time, so someone who paid this morning is not reminded this afternoon.
9. **DPDP by construction.** The tenant is the fiduciary and VP the processor. Each fact carries a purpose and a basis. Retention is set per class. Forget follows the person and leaves a tombstone. Storage is in the India region. Nothing is pooled across tenants.
10. **Phasing.**
    - v1: the contact record, sources, company brain, opt-out and forget.
    - Late v1 (Plus, proposed): preference memory, behind a multi-call simulation gate and a live adherence test.
    - v2: the full ledger, commitments and channels.
    - v3: consented cross-tenant aggregates.

## 1. Benchmark: the best per sub-area and where each falls short

| Sub-area | Best competitor, their best version | Where it falls short | Evidence |
|---|---|---|---|
| Cross-call memory | **Retell.** One rewritten brief of 2,000 characters or less per phone number. Read ON and save OFF by default, priced at the toggle (USD 0.005 per run). Its update prompt keeps only what changes what the agent says or does, drops resolved items, guesses no sentiment and treats the transcript as data. | A model rewrites it, with no quote, span or source per item, so drift is invisible. Keyed by phone; web calls don't save. No purpose, consent or forget per item. Marketing outruns the docs. | [O] `research/2026-10-20/account-phase/retell/report.md` l.84; `research/2026-10-21/walkthroughs/retell/report.md` defaults table; `evidence.2026-10-20.retell-v2-memory-learning` |
| Cross-channel memory | **Synthflow.** Memory Groups summarise each interaction and inject it at call start, shared across voice, SMS and WhatsApp. | Matched by phone only, so a family phone merges people. Summaries without provenance. No India region or consent field; enterprise-only from USD 30k a year. | [O] `data/teardown/synthflow/docs-md/memory.md`; `evidence.2026-10-20.synthflow-v2-memory-learning` |
| What to extract | **SquadStack** (claimed). Up to 20 plain-language extraction points; Refresh or Rolling History; pass-through or AI briefing with "a suggested opening line". | Code shows intra-call memory only, and no screen was found. A suggested opening line is sentence-shaped, so it gets recited. It extracts "sentiment signals", which VP's rule bars. | [V] `data/teardown/squadstack/blog/txt/www.squadstack.ai_blog_introducing-persistent-memory.txt` l.104-125; [O] `evidence.2026-10-20.squadstack-v2-learning-memory` |
| Memory controls and injection | **ElevenLabs.** user_memory {minimal, balanced, maximum}; retention_days; a memory search tool slot; a pre-call initiation webhook; mid-call `contextual_update`. | Gated (API 403; a Memory Alpha tab). The widget user_id is a browser fingerprint, so memory keys to a device. No contact object. | [O] `evidence.2026-10-20.acct-elevenlabs-memory-gated`; `evidence.2026-10-20.elevenlabs-v2-memory-loop` |
| Contact hygiene | **Retell.** A contact object with a DNC flag and post-call fields written back with backfill. | "9000000001" became +19000000001. "+91..." and "0..." variants of one number became two contacts [M, n=6]. | `measure.2026-10-20.acct-retell-contact-number-handling` |
| Company knowledge | **Retell** knowledge base (pages, files, Drive, Notion); **ElevenLabs** RAG. | No span-level human approval, no fence for personal rows, prices left in prose. | [O] walkthrough retell report; EL-23 |
| Data intake | **ElevenLabs** shows the CSV contract before upload; **SquadStack** offers a lead API and a failed-rows file. | Per-row prompt overrides bypass the compiler. No authority or freshness per field at any vendor. | [O] EL-05; SQS-13/15 |
| None | Bolna, Sarvam (per-call variables), Vapi (24 h chat sessions), Exotel (memory is marketing only). | n/a | [O] `evidence.2026-10-20.bolna-check-no-memory-no-loop`, `evidence.2026-10-20.exotel-memory-marketing-gap` |

**What the column shows.**
- Nobody keys memory to an authenticated identity: Retell and Synthflow key it to a phone number, ElevenLabs to a fingerprint, SquadStack to a "masked fingerprint" [V].
- Nobody stores provenance, purpose or consent per item, and nobody separates what the person said from what the system says.
- Memory is a Kano delighter today (2Y/2P of 8, `research/2026-10-20/teardown/SYNTHESIS.md` l.300). Retell already ships it, and ElevenLabs may ship within 1-2 quarters (`risk.2026-10-20.elevenlabs-campaigns-and-price`). By VP's launch basic memory is parity, so VP must win on trust, adherence and speed.

## 2. Objects beyond the spine

| Object | Key fields | Rule |
|---|---|---|
| **Source** | kind (csv, sheet, api_push, crm:*, payments, policy_admin, whatsapp, sms, email, app_events, website, docs); vault auth; read or write-back; mapping; authority and max age per field; health | Health is honest: a failing connector never reports success (`rejected.harvest.16`) |
| **Receipt** | immutable digest, mapping version, per-row code and reason | Every Contact, Attribute and Fact points back to one |
| **Identifier** | phone_e164, email, crm_id, wa_id, record_key, external_id; normalised value; verification level | Exact match only |
| **Attribute** | typed value plus DataAuthorityClaim {source, rank, observed_at, max_age, version} | System-of-record data that feeds FACTS_ROWS. Never "remembered" from speech |
| **Episode** | channel, contact (nullable), participant handle, transcript and recording, agent version, purpose, retention class, digest | Immutable; the citation ground truth |
| **Fact** | type (opt_out, preference, objection, commitment, correction, stated_fact, courtesy); closed-vocabulary key; typed value; exact caller quote; episode; span; audio ms; source class; authority; expiry; purpose; basis; status; supersedes; tier; undo_until | Contradictions are new rows; nothing is overwritten |
| **Commitment** | customer or company; what; by when; amount_ref (a pointer to an Attribute, never a spoken number); status open, kept, missed or unknown; links to FollowUp and Outcome | "Kept" is earned only by an outcome event. A commitment is not evidence that the AI did anything (`docs/relationship-runtime-v2.md`) |
| **PreferenceView** | language, script, address, name to use, pace, window, channel, avoid topics, dialect style (opt-in) | Derived. Address defaults to aap; tum only on explicit invitation (`docs/relational-source-port.md` l.66-69) |
| **MemoryPolicy** | per agent purpose: remembered keys (typed defaults plus up to 20 custom), tier, retention, cap | Publishing is gated by the memory simulation suite |
| **MemoryBrief** | compiled per call; its hash and fact ids go to the run manifest | Never stored as truth |
| **ForgetRequest** | requester; verified-intent evidence; scope (forget_memory or erase_me); per-surface receipts | Triggered by verified human intent in code only (`rejected.harvest.04`: 44 rows lost to a model marker) |
| **Tombstone** | HMAC of identifiers with a tenant salt | Checked on every import, sync and inbound event |
| **Aggregate** | cohort counts, k of 20 or more | No personal data |

**Authority by subject.**

| Subject | Who wins, highest first |
|---|---|
| Self subjects (preference, opt_out, objection, courtesy) | caller said 100 > operator 60 > CRM or upload column 50 > observed by system 30 |
| Record subjects (due date, amount, record key, status, EMI schedule, paid) | policy, loan or payment system 100 > CRM 80 > operator 75 > upload 70 > caller said 40 |

- Opt-out from any source wins and is never cleared by import (spine invariant 5).
- Conflicts follow Relay's `decideConflict` (`docs/integration-contracts.md` l.21): a fresh higher authority wins, equal authorities with different values go to review, and nothing is silently combined.
- A caller's value on a record subject becomes a stated_fact plus a Conflict card. She speaks only the system value. This matters because fake renewal scams already use real policy data (R2 §4.1).

## 3. Write path: from a call or message to a remembered fact

The Call analyst's one post-call pass already emits memory proposals with code-verified spans (`data/blueprint/intelligence-module.json` steps 5-6). The Memory keeper then applies seven gates:

1. **Provenance.** The quote must be an exact substring of a *caller* turn of the transcript of record. Assistant-origin quotes are rejected. The commit transaction re-reads the transcript digest; if the transcript changed, nothing commits (`docs/learning-source-port.md` l.5-13, offline-tested [O]). The transcript of record never comes from a fluent-fabricating ASR (`rejected.harvest.10`).
2. **Vocabulary.** The key must be on the purpose's list. Never-stored classes have no schema field, so no prompt can create them:
   - the agent's own claims, and brief or Offering facts;
   - mood, sentiment, personality and trust scores;
   - inferred age, gender, religion, caste, income or health, and dialect guessed from the number;
   - OTP, card, bank, Aadhaar and PAN numbers;
   - third-party names beyond a role.

   Sources: `decision.2026-10-20.preference-only-memory`; Retell's update prompt agrees [O].
3. **Value lint.** Values are typed and free text is capped at 60 characters. Instruction-shaped text is rejected. This is the memory-poisoning fence.
4. **Refusal guard (deterministic).**
   - Refusals can never create a follow-up or commitment: "follow-up ki zaroorat nahi", "dobara call mat karna", "no follow up please", "मुझे कॉल मत करो". They become opt-out candidates or stay feedback.
   - Controls must not match: "call karne mein hichkichaana mat", "mujhe follow-up nahi mila".
   - "Abhi mat karo, shaam ko karna" is a reschedule, so it becomes `preference.window`.
   - Relay's guard was English-only (`docs/learning-source-port.md` l.11). VP ships a 60+ item Hindi, Hinglish and English set in Latin and Devanagari.
5. **Consent and purpose.** A basis must exist: s.7(a) for service, or a ConsentRecord. `opt_out.memory` closes the write gate (`asset.hp-maya-latest.append-only-consent-ledger`).
6. **Conflict.** A new value for a key becomes a new row that supersedes the old one. A record subject becomes a stated_fact plus a card.
7. **Tier:**

| Tier | Keys | What happens |
|---|---|---|
| Instant (A3) | opt_out.*, forget requests | Suppression is written in the call-end transaction, or in-call by the dnd tool. No path can dial again (spine invariant 1) |
| Auto with undo (A3) | language, script, address, name to use, pace, window, channel, heard objections | Applies to the next contact; undo for 7 days; shown as a timeline chip and in a weekly digest |
| Review | commitments, corrections, stated facts, avoid-topic, dialect style, courtesy, custom keys | Unused until approved in a batched one-tap queue; expires after 14 days unreviewed |

**Explicit beats observed.** "Hindi mein baat kijiye" applies at once. Language that is only observed (the caller simply spoke Hindi) is stored at authority 30 and applies after two calls agree.

**Earned autonomy.** A review key can move to auto-with-undo for one tenant when two conditions hold:
- 100 or more operator reviews show 95% or more approved unedited (Wilson lower bound 90% or more);
- the Owner approves.

It is revoked automatically if the nightly 5% second-family entailment audit refutes more than 2% (Meera's design, `asset.hp-main.episodic-memory-and-consolidation`), or if operator undo passes 5%. The operator's review is the verified key, so a model never grades its own extraction.

**Nightly consolidation is code, not a rewrite.** It expires facts, recomputes views, runs the audit sample and recounts aggregates. There is no prose summary to drift.

## 4. Read path: recall, the brief and speed

**When.**
- **Outbound:** prefetch at attempt claim inside the one dial path, cached for the call. The opener renders during the ring (spine §1 Speed), so the first words carry no memory latency.
- **Inbound:** exact CLI match at the pre-answer hook (Retell's call_inbound pattern [O]), with an 800 ms timeout. Memory loads only if exactly one non-shared contact matches.
- **Shared or unknown numbers:** nothing personal loads until the caller confirms identity in the call. In v2 it is then injected mid-call as a context update (ElevenLabs `contextual_update`, Retell update-live-call [O]).

**How.**
- A structured fetch by key covers nearly every outbound call.
- Semantic and keyword legs run in parallel with RRF (k=60). They serve long relationships that exceed the budget, the operator's questions and the v2 mid-call lookup.
- Evidence [M in hp-main and hp-multimodal-groupai] (`docs/harvest/SYNTHESIS.md` l.109; `docs/harvest/hp-main.md` l.216-217):
  - lexical alone recovered 0 of 27 adversarial cases;
  - adding the semantic leg took recall@8 from 73.9% to 95.7%;
  - the DB scan took 40 ms p50 and the embedding 305 ms p50.
- VP's brain port is keyword-only (`docs/brain-recall-source-port.md`). The semantic leg is new build, on an India-region embedding model.

**Fail open, never unsafe.** On a hook timeout the call proceeds without memory, and the manifest records `memory=not_loaded(timeout)`. Opt-outs live in suppression at the dial gate, never in memory.

**Compile policy.**
- **Include** approved or auto-applied facts whose purpose family matches the campaign, and that are not expired or forgotten. Service memory never feeds a promotional call.
- **Order and whole-entry drop:** avoid (max 3), prefs, open commitments (max 3, newest), last interaction (one structured line, no prose), heard objections (max 4), stated facts, courtesy (max 1).
- **Within a key** the newest supported value wins, so contradictions never both appear.
- **Format:** key=value shapes, no quotes, no sentences. Quoted lines were recited 4 of 5 times and 0 after removal [M] (HV law 1).
- **Cap:** 1,200 bytes, matching the voice MEMORY_BRIEF slot (`data/blueprint/voice-module-defaults.json`). A typical renewal brief is 300-600 bytes. If the must-include entries exceed the cap, compile throws and publish is blocked; the brief is never sliced (HV law 4). A 2,400-byte Premium cap is a candidate only after the latency A/B.
- **Position:** a delimited data block after SAFETY and before FACTS_ROWS. Must-fire rules stay in the tail (a rule fired 0/8 mid-brief and 8/8 last [M]).

Synthetic example: `prefs: lang=hi; address=aap; name=Sunita ji; pace=unhurried; window=18:00-20:00; channel=whatsapp | last: 2026-10-14 call 2m41s outcome=promise_to_pay by=2026-11-05 | open: customer.pay_by=2026-11-05 amount=from_data; company.callback=2026-10-23 after 18:00 | heard: objection.price; objection.trust_scam`

**Preferences as configuration.** The PreferenceView sets these before `compile()`:
- MEDIUM and SCRIPT (first in the brief);
- the STT language hint;
- the voice and locale;
- the turn preset ("unhurried" waits through a 2.4 s pause);
- the register slider.

The brief line only reinforces them. Evidence: Hindi went romanised when the script rule moved mid-brief (`rejected.2026-10-20.brief-v1`), and the inherited trial failed because a conflicting default outranked the stored preference [M].

**Speed.** Kill criterion: memory must not push the reply gap p50 above 1.2 s (`decision.2026-10-19.tier-plus`).
- Prefetch (about 350 ms) hides in the ring [I].
- The brief adds 120-400 tokens to a core of about 2,000 that is cached after the first turn. Azure read-back shows 1,280-1,550 of about 1,650 tokens cached [M, n=33 per model, `research/2026-10-17/lanes/l8-azure-bench/round2/results/llm_india.csv`].
- The effect of prompt size on first-token time is **not measured**: every bench row has the same prompt size.
- Gate: an India A/B with memory on and off, 30 or more clean turns per arm. Pass if the p50 delta is 50 ms or less and the absolute p50 is 1.2 s or less.

**Cost [C].**

| Line | INR per connected 3-minute call |
|---|---|
| Extraction (rides the existing analysis pass, about 150 output tokens) | 0.036 |
| Brief, cached | 0.022 |
| Brief, uncached at the cap | 0.114 |
| Entailment audit | about 0.001 |
| **Total** | **0.06-0.15** |

- Prices are gemini-3.5-flash-lite list.
- Retell's save alone is USD 0.005 per run, INR 0.475 [O].
- The proposed Plus tier assumed 2-8k memory tokens, about INR 0.18-0.72 per minute uncached (`decision.2026-10-19.tier-plus`). This design is 4-20x leaner, an input to `open.2026-10-20.reprice-tiers`.
- The cost is shown at the toggle and re-measured on meters.

## 5. Omni-channel intake: what to take

Context lifts outcomes when it is specific:
- goal-specific reminders +16%, while generic reminders showed no significant effect;
- a two-way bank call +34.4 pp timely repayment (n=3,448).

None of this is voice-AI evidence (`research/2026-10-17/lanes/l4c-incumbents-distribution/report.md` l.44-47; `rejected.2026-10-17.lsq-invorto-renewal-claim`).

| Source | Take | Authority, freshness | Phase |
|---|---|---|---|
| CSV, XLSX, Sheets | name, phone, record key, product, amount, due date, language, last interaction, deny flags. Aadhaar, PAN and bank columns are "ignored by design" | 70; 30 days; Sheets sync hourly or daily with receipts | v1 |
| API push | contacts and events by external_id; the new-lead webhook for speed-to-lead (wave 2, consent ledger M5) | declared, max 80 | v1 |
| Payment webhooks | paid, failed, link opened (a leading indicator), amount due | 100; 1 h | v1, design partners |
| Policy or loan admin | record key, expiry, premium, NCB, EMI schedule, status | 100; 24 h; India records | v1, design partners |
| CRM (LeadSquared, Zoho, Kylas, Salesforce, Sell.Do) | fields, stage, owner, last activity; write-back is owned by intelligence | 80; 24 h; built when two paying customers need it. Integration failures are 17% of incumbent complaints [M, n=111] | first partner's CRM in v1 |
| Website, documents | offers, FAQs, procedures, into the **company brain only**, with spans and approval; customer tables are detected and excluded | brain | v1 (req-30) |
| WhatsApp (24 h window) | questions, stated preferences, clicks, as Episodes; never cross-tenant (Meta s.4.7); no cold templates (`rejected.harvest.08`) | same gates as calls | v2 |
| SMS (DLT), email | clicks and replies; written commitments from exactly-matched verified senders | | v2 |
| App events (req-31) | the one most recent purpose-relevant event in the last 7 days ("kyc_step=3_of_4"); no pixels or trails | 80; kept 30 days; event types registered with purpose and basis | v2 |
| Dialler exports | attempt and hang-up times for best-time and hazard priors, counts only | | v3 |

**Freshness at dial time.** The precheck asks memory-omni about the record subjects the call will speak. Campaigns gains two reason codes:
- `OUTCOME_ALREADY_MET`: paid or renewed since the list was loaded;
- `ATTRIBUTE_STALE`: a spoken value is past its max age.

The launch card reads "212 already paid since upload: won't be called". No vendor has this. It is memory-omni's sharpest way to never waste the person's time (req-04).

**Fire an agent on any data (req-28).** The client drops a file, a Sheet link, a CRM connect or a URL into Talk to VP and says "isko fire karo". The Data steward:
1. classifies it as people, company knowledge or events;
2. writes a receipt;
3. maps columns, using deterministic Hindi/English header synonyms first and an LLM only on headers and value shapes, never personal values;
4. asks at most three questions that change the call;
5. shows reasons per row, suppressed and tombstoned rows, and already-paid rows;
6. hands the Strategist an audience, with the category first.

One launch card follows. The copilot never decides identity merges or consent.

## 6. Identity

- **Exact match on normalised identifiers, no fuzzy merge** (`docs/data-intake-v7.md` l.20).
  - Phone: India-default E.164 via the shared normaliser, which never guesses a foreign country.
  - Email: lower-cased.
  - Record key: hyphens, spaces and case removed.
  - Near matches go to an A2 "possible same person" card. A merge is a link that can be reversed for 30 days.
- **Shared numbers** (one E.164, different record keys) stay separate people. Personal memory waits for identity confirmation in the call: a family-phone disclosure is the likeliest memory harm in India [I].
- **Verification levels:** tenant_asserted, channel_verified, knowledge_confirmed, operator_confirmed.
- **Unverified senders are `feedback_only`** (`docs/learning-automation-v7.md` l.26). A WhatsApp sender is linked only if exactly one non-shared contact holds that number. Otherwise VP asks in the thread for the last four digits of the record key, checked in code. Synthflow merges on the phone number alone.

## 7. DPDP, retention and forget

- **Roles.** The tenant is the fiduciary; VP is the processor (s.8(2)). The DPA and audit trail are product artefacts (Rule 6; `research/2026-10-20/teardown/regulation-segment/report.md` RS-27..32 [O]).
- **Purpose per fact.** The next service call from the same relationship plausibly sits within s.7(a) [I, counsel]. Cross-sell is a new purpose, so compile refuses it by default.
- **Notice.** The post-call Rule 3 link adds "what we remember and how to erase it". In v2 it leads to a tenant-branded My Data page behind an OTP.
- **Retention defaults:**

| Class | Default |
|---|---|
| Recordings | 90 days (RBI recovery: 6 months) |
| Transcripts | 180 days |
| Preferences | 12 months after the last statement |
| Commitments | 30 days after due |
| Objections | 90 days |
| Stated facts | 180 days |
| Courtesy | 21 days |
| Logs | 1 year |
| Aggregates and tombstones | kept (no personal data; hashed) |

  IRDAI's 10-year records rule against DPDP storage limitation is a counsel question (`research/2026-10-17/lanes/l1-regulation/round2/findings.md` Q7).
- **Forget follows the person.**
  - **Triggers:** a delete-class word plus an object word in a caller turn (Hindi, Hinglish or English; Latin or Devanagari; within 90 s), a verified My Data request, or the Compliance role. Never a model marker (`asset.hp-maya-latest.verified-human-intent-for-destructive-llm-actions`).
  - **Scopes:** forget_memory (24 h SLO) and erase_me (72 h).
  - **Reach:** facts, episodes, recordings, channel episodes, attributes and cached briefs, plus a CRM delete through the outbox. An unknown result is never auto-retried; it becomes a task (`rejected.harvest.05`).
  - **Ends with:** a tombstone, suppression if asked, and an SMS receipt.
  - Inherited: 39/39 live in its source product [M] (`asset.hp-gurukul-early.forget-follows-the-person-erasure`, `docs/harvest/hp-gurukul-early.md` l.48). Aggregates and lessons hold no personal data, so nothing is retrained.
- **Residency.** Memory, recordings, embeddings and the vault are India-region by default.
- **Minors.** Memory is off for contacts flagged as minors.
- **Groups (req-33).**
  - v2: tenant cohort counts with k of 20 or more ("of 1,820 who stated a time, 64% chose after 18:00"), feeding best-time priors inside legal windows.
  - v3: cross-tenant priors only through learning, as counts, with 10 or more opted-in tenants, a contract clause and no WhatsApp data. Pooling gave the wrong winner to 48-55% of dissimilar tenants [C] (`rejected.2026-10-17.cross-tenant-pooling`).

## 8. Agents do the work; the client sees and approves

| Agent | Does | Client sees | Client approves |
|---|---|---|---|
| Data steward | classifies, maps, normalises, dedupes, flags shared numbers and ignored PII, connects sources | the receipt card | the mapping once per source; merges (A2); connector auth |
| Memory keeper | gates, tiers, compiles, consolidates, forgets | chips with play-from-here; a weekly "what she learned" digest | review facts (one tap); earned autonomy (Owner); policy (Compliance or Owner) |
| Call analyst | proposals with spans in the one analysis pass | the "Memory from this call" panel | - |
| Compliance guard | purpose, basis and retention checks; the DPDP queue | per-surface receipts | policy; erase_me outside a verified call |
| Test pilot | runs MEM-SIM before a memory-enabled publish | pass rates on the publish card | publish (A2) |
| Operator (chat) | "Sunita ke baare mein kya pata hai?", "Ravi ka data delete karo" | answers with fact chips and quotes | every write card |

## 9. Emotional voice, memory, personalisation and self-learning here

**Emotional voice.** Memory makes warmth specific, not performed. She:
- uses the caller's language and form of address, and keeps their pace;
- never asks what she already knows;
- acknowledges last time's concern without re-pitching it;
- for someone who feared a scam, leads with a verifiable callback.

Competence is the warmth (P4). A v2 **courtesy thread** may keep one non-sensitive, caller-raised life event ("bete ki shaadi thi") for 21 days:
- at most one acknowledgement, in the opening turns;
- never in the same turn as an ask;
- never on collections or complaint calls;
- off by default and gated by a listener panel.

Health, death and money distress are excluded. Grief must never become leverage (no manipulation), and anthropomorphism hurts angry callers (L5).

**Personalisation.**
- Attributes fill FACTS_ROWS.
- The PreferenceView sets the configuration.
- One recent app event makes the opener useful (req-04).
- **Accent or dialect (req-10) is opt-in only:** from the caller's explicit words, or from a tenant column with a stated basis. It is never inferred:
  - a number series maps to a licensed service area, and about 1.35% of Bihar numbers port each month [O];
  - language ID labelled 2 of 6 Bhojpuri clips [M] (`research/2026-10-17/lanes/l5-human-dialect/report.md` l.128-137; `rejected.2026-10-17.dialect-tts-wedge`).

  It changes word choice, and the voice where one exists. Otherwise she stays in Hinglish and the page says why.

**Relational continuity (req-12).** One contact id across voice, WhatsApp, SMS and email carries open promises, the last interaction, heard objections and preferences. "How she knows your customers" reports:
- the share of calls with memory loaded;
- adherence;
- repeat-call outcomes, labelled observed-not-causal until a memory holdout is powered.

**Self-learning.** Learning may tune the compile policy (which keys, the order, the budget), never the facts (harness2 mapping, `data/blueprint/learning-memory-omnichannel.json`). Objection clusters can suggest new keys. Identity, consent, opt-out and the never-stored list are locked.

## 10. Beyond everyone

The ideas are listed in `beyond`. In short:
1. Play-from-here memory.
2. Authority by subject.
3. Preferences enforced as configuration and measured per turn.
4. Earned autonomy per key.
5. Freshness at dial time.
6. A next-call preview with bytes and rupees.
7. Shared-number safety.
8. Memory tested before publish.
9. A person-facing My Data page.
10. A data diet.
11. A memory-poisoning fence.

## 11. Metrics (full list in `metrics`)

The kill criteria, measured in code:
- **Storage recall** across repeat calls of 95% or more (MEM-SIM hidden keys).
- **Preferences ignored** in 1 call in 20 or fewer. Per turn on live calls: language ID, address lexicon, words per turn against the pace preset, dial time inside the stated window, follow-up channel. Reported with Wilson intervals.
- **Reply gap p50** of 1.2 s or less, with a memory delta of 50 ms or less.

Also measured:
- quote provenance at 100%;
- 0 never-stored leaks;
- 0 refusal-guard breaches;
- 0 dials after an opt-out;
- forget inside SLO with 0 resurrections;
- 0 dials to already-paid contacts;
- cost of INR 0.15 or less per call;
- 10 or fewer review items per 100 calls.

Memory's effect on outcomes is reported only from a powered holdout. For example, early hang-up on call 2 falling from 15% to 10% needs 686 per arm [C, L6].

## 12. Phasing and its evidence

- **v1 (launch):**
  - contact, identifier and attribute with authority and freshness;
  - sources and receipts;
  - CSV, Sheets and API push;
  - the first partner's CRM, payment and policy feeds;
  - the company brain;
  - opt-out facts;
  - forget and tombstones;
  - a timeline of calls and follow-ups;
  - language from a CSV column;
  - `{{memory.*}}` slots visible but disabled.

  *Evidence:* W2 and the Retell misparse [M]; cross-campaign suppression (`rejected.harvest.07`); DPDP from the first recording; req-28/29/30.
- **Late v1, Plus (proposed; spine owner decision 6):**
  - preference memory from calls, with auto-apply and undo;
  - prefs and last-interaction brief;
  - the MEM-SIM gate;
  - a live adherence test before sale: 4 testers x 3 call pairs x 4 preference kinds = 48 pairs on Indian handsets. It passes with 0 language misses and 2 or fewer misses in total.
  - cost shown at the toggle.

  *Evidence:* Retell already ships memory (parity); ElevenLabs may ship within 1-2 quarters; memory needs one call (L6 s.1 [C]); the inherited adherence failure [M]. It slips to v2 if the default stack or the latency A/B is not ready.
- **v2:**
  - the full ledger with the review inbox and earned autonomy;
  - WhatsApp, SMS and email;
  - app events;
  - the semantic leg;
  - inbound memory;
  - identity-confirmed injection;
  - My Data;
  - cohort counts;
  - dialect opt-in;
  - the courtesy thread after a panel.

  *Evidence:* memory comes before self-learning (req-32 before req-34); spine v2 exit bars.
- **v3:**
  - consented cross-tenant aggregates;
  - compile-policy learning;
  - dialler priors;
  - more CRMs under the two-customer rule;
  - regional lexicons for the guards;
  - a mid-call lookup tool only if its latency is measured and acceptable.

## 13. Owner requirements

| Req | Honoured by | Honest limit |
|---|---|---|
| req-10 | opt-in dialect preference | never inferred; no Hindi-belt dialect TTS |
| req-12 | cross-channel continuity; courtesy thread | sensitive life events are excluded |
| req-28 | fire on any data | the copilot never decides consent or merges |
| req-29 | sources with authority and freshness | CRMs by the two-customer rule |
| req-30 | company brain with spans, apart from contacts | human approval per fact |
| req-31 | app events with a registered purpose | one event per call, 30 days |
| req-32 | ledger, PreferenceView, brief | "so much data" is honoured in sources, not in what is stored (`rejected.2026-10-20.raw-fact-memory`; DPDP minimisation) |
| req-33 | cohort counts (v2), cross-tenant priors (v3) | consented aggregates only |

## 14. Risks, rejected ideas avoided, open questions

**Risks.** These are in `risks`. The sharpest:
- a wrong commitment becomes harassment on a collections call;
- relational recall feels creepy;
- memory poisoning;
- a family-phone disclosure;
- review fatigue;
- the latency effect is unmeasured;
- ElevenLabs memory reaches GA first.

**Rejected ideas avoided:**
- `rejected.2026-10-20.raw-fact-memory`
- `rejected.2026-10-17.cross-tenant-pooling`
- `rejected.harvest.03`
- `rejected.harvest.04`
- `rejected.harvest.05`
- `rejected.harvest.07`
- `rejected.harvest.08`
- `rejected.harvest.10`
- `rejected.harvest.12`
- `rejected.harvest.16`
- `rejected.harvest.17`
- `rejected.2026-10-17.dialect-tts-wedge`
- `rejected.2026-10-17.k2-dashboards` (memory lift is claimed only from a powered holdout)
- `rejected.2026-10-20.brief-v1`
- `rejected.2026-10-17.lsq-invorto-renewal-claim`
- `rejected.2026-10-20.acct-retell-csv-import-by-api-key` (every import is on the API and MCP)

**Open questions** are in `open_questions`. The two that set the phase: does preference memory ship in late v1 or in v2, and does the latency A/B pass?

## 15. Seams

| Module | What it exchanges with memory-omni |
|---|---|
| campaigns | consumes audiences, the normaliser, attributes and the two reason codes |
| voice | consumes MEMORY_BRIEF (1,200 bytes), the PreferenceView as configuration and the shared-number rule |
| intelligence | produces proposals with verified spans; owns CRM write-back fields (memory-omni owns auth and mapping) |
| trust-telephony | enforces suppression, owns the dnd tool and notices; memory-omni writes opt-out facts and executes forget |
| learning | tunes the compile policy only |
| workspace | hosts the cards and the tools `source.*`, `contact.merge`, `fact.approve`, `fact.forget`, `memory.policy.set`, `dpdp.request.execute` |
| economics-platform | meters memory cost lines |
