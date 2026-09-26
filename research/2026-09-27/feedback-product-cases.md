# Customer-feedback interview products and an Indian service-company case

**Research date:** 2026-09-27  
**Scope:** first-party public pages only; static desk research; no accounts, provider calls, participant outreach, or app trials.  
**Status:** product implications are recommendations for the local v6 workspace, not claims that the products or this workflow were run.

## Identity check for the dictated name

The spoken “Dall-E/Dalio” cannot be identified confidently from the sound alone. The table keeps all plausible matches visible until the user supplies the website or logo.

| Candidate | What its own site says | Fit with customer-feedback interviews | Current conclusion |
|---|---|---|---|
| [Dialogue](https://www.dialogueai.com/) | AI-moderated interviews and surveys, participant recruitment, adaptive probing, 30+ languages, and synthesis. | **High.** This is the closest direct match to a customer-feedback research platform. | Plausible; **unconfirmed** as the dictated name. |
| [Dilog](https://dilog.ai/) | A customer-simulation panel built from 2–3 hour interviews with a company’s real customers; the site says answers are traceable to what customers said. | **Medium/high.** It is customer insight, but the core object is a reusable digital customer panel rather than a conventional respondent campaign. | Plausible; **unconfirmed**. Its “86% match” is a vendor claim, not independently verified. |
| [Dailo.ai](https://dailo.ai/en) | Georgian/English/Russian AI agents for WhatsApp, Messenger, Instagram, TikTok, Telegram, web and support; conversation analytics and human handoff. | **Low/adjacent.** It can analyze customer conversations, but its public workflow is support/lead automation rather than research interviews. | Plausible spelling; **probably not the intended research product**. |
| [Dailo.co](https://dailo.co/eng) | Speech simulations for employee education, SCORM/LMS integration, and role-play templates. | **Low.** Training simulations, not customer-feedback research. | Phonetic match only; **unconfirmed and likely different**. |
| [Daialog](https://www.daialog.io/) | Candidate applications, async introductions, screening, scheduling and hiring feedback. | **Low.** Recruiting is for employees; it is not customer research. | Phonetic match only; **unconfirmed and likely different**. |
| [Dialog demo](https://demo.dialoghq.ai/) | Public demo entry points include problem discovery and customer satisfaction/feedback interview types. | **Possible.** The demo is suggestive, but the reviewed page does not establish the full product workflow or company identity. | **Unconfirmed; request the user’s website.** |

Do not collapse these into one competitor. The only candidate I would currently describe as a direct research-platform match is Dialogue; even that is a working hypothesis until the user confirms the URL.

## What the primary workflows document

Labels used below: **D** = directly documented on the linked first-party page; **C** = vendor claim presented by the source; **I** = product implication inferred from the documented behavior; **U** = not established by the reviewed pages.

### Listen Labs

[Listen’s product page](https://listenlabs.ai/) describes a five-part path: design a study from a goal or upload a guide; reach participants from a large network or the researcher’s own contacts; run AI-moderated conversations with follow-ups; deliver highlight reels and slides whose claims link to interviews; then search and build on studies, themes and reports. **D.** The exact panel size, language count and speed figures on the page are vendor claims (**C**), not an independent benchmark.

[Listen’s AI moderation guide](https://listenlabs.com/articles/how-ai-moderates-research-interviews/) describes study design with objectives, questions, probes, branching/skip logic, randomization and an auto-QA pass; participant matching; dynamic interviews; and automated analysis. It also describes Quality Guard checks for fraudulent/low-effort responses and profile mismatch, plus deliverables such as slides, memos, clips, charts and segmentation. **D/C.** The page does not establish an operator approval step for every extracted theme, an auditable consent ledger for a customer’s own list, or a provider-neutral retry state machine. **U.** Those controls remain local product requirements (**I**).

[Research Agent](https://listenlabs.ai/blog/research-agent) documents question-driven analysis over a study, segment comparison, statistical charts, highlight reels, slide/memo generation, CSV export with thematic coding, document uploads, web search and verbatim retrieval. Every generated insight is described as linked to response data. **D.** It is a useful evidence-coded-answer pattern; whether every generated interpretation is human-reviewed before a business decision is **U**.

[Study privacy](https://listenlabs.ai/study-privacy) says a study can collect audio/video, the sponsor may be a Listen customer, and responses may be shared with that research organization. **D.** The page is a participant privacy notice, not proof of a particular customer’s consent configuration, retention, or legal basis. **U.**

### Outset

[Outset’s official company information](https://outset.ai/official-outset-company-information) documents video, voice and text AI-moderated research; smart contextual follow-ups; structured outputs including themes, important moments, standout quotes and highlight reels; integrated recruitment through UserInterviews, Prolific and Rally; cross-tabulation; visual/screen stimuli; and an AI guide companion. **D.** It also states that the moderator can react to visual signals; the validity of emotion or facial-signal interpretation for an Indian service call is **U**, so the local design should keep those signals optional and auditable.

[Outset platform](https://outset.ai/platform) documents recruiting through 25+ panel integrations or a researcher’s own panel, synthetic-user guide testing, AI-moderated interviews, AI synthesis and “chat with your data.” **D.** Synthetic participants are useful for guide QA, but cannot be treated as customer evidence (**I**).

[Outset participant guidance](https://help.outset.ai/articles/4204194772-how-should-i-describe-outset-to-participants) recommends telling participants plainly that the interview is AI-led, explaining the format, and inviting detailed honest responses. **D.** This supports an explicit AI disclosure at the beginning of every local browser/voice interview. The page does not by itself establish recording consent language for every jurisdiction. **U.**

[HubSpot’s Outset case](https://demo.outset.ai/resources/stories/how-hubspot-ran-100-interviews-in-days-with-outset-and-shaped-their-ai-roadmap) is a customer story describing more than 100 interviews, recurring listening, themes, quotes and language used to influence roadmap and campaign messaging. **C/D.** It is a customer report, not an independently audited outcome; the decision trace from each theme to the roadmap is not fully exposed. **U.**

### Likely dictated candidate: Dialogue

[Dialogue’s official page](https://www.dialogueai.com/) documents: describe goals/materials; let the platform generate a study method, audience and discussion guide; invite a customer list or recruit from a global panel; run conversational interviews in 30+ languages with contextual probes; and synthesize patterns in real time. It lists discovery, concept testing, usability testing and voice-of-customer use cases. **D.** The page does not document field-level provenance, denominator rules, identity reconciliation from CRM, explicit consent records, or a reviewed release gate. **U.** Those are the gaps the local workspace must cover.

### Related leaders and adjacent patterns

[Great Question’s AI-moderated interview help page](https://greatquestion.co/support/studies/ai-moderated-interviews) gives the clearest participant lifecycle: create a study; enable AI moderation; set research goal and refine the guide in a studio; preview without recording/saving; use the existing recruitment, screener, consent and incentive flow; let the participant enter through an invite; run the AI interview; return recording/transcript to the participant record; then browse answers question-by-question. It states that participants are told they are talking to AI and that only completed sessions are kept. **D.** The answer browser, speaker labels, preview boundary and completed-only rule are strong local UI patterns.

[Maze Interview Studies](https://maze.co/features/interview-studies/) documents recruiting from a community or panel with screening filters, calendar availability, built-in or integrated conferencing, connected recordings/transcripts, AI summaries/themes/reports and final researcher control before sharing. **D.** It does not establish adaptive AI moderation in the reviewed page; do not infer that its moderated-interview workflow is equivalent to Dialogue, Listen or Outset. **U.**

[Dovetail](https://dovetail.com/) documents a customer-intelligence layer over calls, interviews, research, tickets and surveys: transcription, highlights/clips/patterns, dashboards across sources/segments/products, searchable evidence, and digital twins/agents. **D.** Its “digital twin” and outcome/action claims are product positioning; the reviewed page does not establish that a twin is valid for a specific Indian cohort or that a proposed action was completed. **C/U.**

## Cross-product design findings

The shared workflow is more useful than any vendor’s marketing number:

1. **Study brief and guide:** goal → target audience → questions → adaptive probes → stimuli → QA/preview. Listen, Outset and Dialogue document guide generation; Great Question documents a preview that does not create results. **D.** Add a local “decision this study must inform” field and block launch when the goal, offering or audience is unresolved. **I.**
2. **Recruitment and consent:** own customer list or an external panel; screen, schedule/incentivize where supported; disclose AI; capture consent before recording; preserve sponsor and participant identity. Listen supports own contacts and a panel; Outset supports own panel and recruitment partners; Great Question explicitly keeps recruitment, screening, consent and incentives in the study. **D.** Consent preflight, expiry and suppression are not established across all vendors. **U → I:** make them first-class local records.
3. **Adaptive interview:** start broad, ask context-sensitive follow-ups, and keep the primary question set stable enough to compare cohorts. Listen/Outset/Dialogue document dynamic probes. **D.** Never let an adaptive follow-up silently change the product being evaluated; write the question path and reason to the transcript ledger. **I.**
4. **Structured evidence:** return transcript/recording, answer-by-question views, themes, quotes/highlights, cohort comparisons and reports. Great Question, Listen and Outset document these patterns. **D.** “Theme exists” is not the same as “product decision is approved”; keep raw answer, model extraction, reviewer decision and action as separate records. **I.**
5. **Close the loop:** Dovetail and Outset customer stories describe organizational use of insights; vendor pages do not establish completed operational changes. **C/U.** The local product should link a reviewed theme to an owner, decision, release/change, and later outcome measurement.

## Concrete case study: Pune service company with three offerings

This is a deliberately small, fictional fixture for the product design. It is not customer research and must not be presented as a market result.

**Company:** “Northstar Pathways,” an Indian study-abroad consultancy serving students and parents in Pune, Bengaluru and smaller Maharashtra cities.  
**Offerings:**

- `UG-APP`: undergraduate university selection and application support;
- `PG-APP`: postgraduate application, SOP review and application support;
- `VISA-FIN`: visa, education-loan and financial-document advisory.

### 1. Raw source intake

The owner exports a CSV from the CRM and uploads an agent note dump. Rows contain `crm_contact_id`, name, phone, email, city, preferred language, last service code, journey stage, last contact date, consent status, last outcome and free-text notes. The dump is intentionally imperfect:

| Raw row | What is wrong or incomplete | Required handling |
|---|---|---|
| `NS-1042`, `+91…4421`, `service=PG-APP`, stage=`offer_sent`, note “asked about visa papers” | The note may be a cross-sell question, not the purchased product. | Keep `PG-APP` as the CRM claim, attach the note as evidence, and ask a product-confirmation question before routing. |
| `NS-1043`, email only, `service=UG-APP`, stage blank, consent=`unknown` | No reliable phone and no contact permission. | Do not invite or call. Create `missing_identity` and `missing_consent`; permit manual enrichment only with an audit entry. |
| `NS-1044`, phone matches two CRM contacts, `service=VISA-FIN`, note “application delayed” | Ambiguous identity and possibly wrong offering. | Hold in identity review; show both candidates and the exact source rows. |
| `NS-1045`, `service=PG-APP`, last outcome=`completed`, note “still waiting for loan” | Contradictory completion/outstanding-need signals. | Preserve both observations with timestamps; do not coerce to satisfied/unsatisfied. |
| `NS-1046`, valid phone, consent current, `service=VISA-FIN`, three prior no-answers | Eligible but contact history indicates a retry budget issue. | Show attempt history; schedule only an approved final attempt or alternate channel. |

The import review UI should show original row, normalized fields, source system/record, observed time, authority, confidence, and proposed action (`accept`, `merge`, `conflict`, `needs-founder-answer`, `reject`). No model output can create a canonical customer or consent record by itself.

### 2. Respondent mapping

The operator first resolves identity with a deterministic order: CRM contact ID; exact normalized phone plus tenant; exact normalized email; then a human-reviewed multi-match queue. Fuzzy name/city matching may suggest candidates but cannot auto-bind a respondent. The mapping record stores the source row, candidate IDs, selected ID (or unresolved), reason, reviewer and revision.

Then the operator maps the interview to an offering revision. `PG-APP`, `UG-APP` and `VISA-FIN` are explicit offering IDs, with source-backed descriptions and unknown fields. A row mentioning “visa papers” under `PG-APP` gets a clarifying question rather than being silently reassigned. Product cohorts are therefore based on a reviewed product binding, not one ambiguous CRM column.

### 3. Interview design

The owner’s decision is: **which service change should Northstar ship in the next 30 days to reduce avoidable drop-off, and for which offering?** The study brief states the three offerings, target journey stages, language options (English, Hindi and Marathi where supported), and the outcome fields to collect.

The shared guide begins with AI identity disclosure, recording/consent confirmation, and “tell us what you were trying to accomplish.” It then branches by reviewed offering:

- **UG-APP:** decision criteria, university shortlist confidence, parent/student coordination, application status visibility;
- **PG-APP:** SOP/document support, response time, application uncertainty, communication preferences;
- **VISA-FIN:** document checklist, loan/financial explanation, appointment readiness, confidence before submission.

Each branch has 5–8 primary questions and explicit probes. A short/vague response triggers “what happened next?” and “what made that difficult?” A mention of another offering triggers “which service are you referring to?” A contradiction is restated neutrally and retained as two answers with a review flag. The moderator does not invent a resolution. A no-answer outcome ends with a retry-eligible state, never a synthetic answer.

The operator previews every branch. Each preview is marked test-only and cannot enter cohort counts. Participants see the AI disclosure and consent copy before the session; if consent is absent, expired or withdrawn, the interview is suppressed.

### 4. Structured answer record

Each completed turn produces a record like:

```text
respondent_id: NS-1042
offering_id: PG-APP
journey_stage: application_in_progress
question_id: PG-COMMS-03
answer_status: answered | no_answer | not_applicable | contradictory | needs_review
answer_value: structured enum/number/text where applicable
verbatim_quote: exact contiguous transcript span
evidence_ref: recording/transcript/source revision and timestamps
language: hi-en
follow_up_path: price -> document-delay -> communication-preference
extraction_confidence: model score plus reviewer status
consent_revision: consent ledger revision used for this session
review: pending | accepted | corrected | rejected
```

The analysis view shows raw quotes beside the normalized answer, participant/product/stage filters, answered denominator, missingness and contradiction counts. A theme card cannot hide which respondents answered, skipped, dropped, or were excluded for identity/consent reasons.

### 5. Illustrative product decision

Suppose the fictional reviewed cohort shows a repeated `VISA-FIN` theme: customers can complete the initial consultation but lose confidence when the document/loan checklist changes. The exact quoted answers and denominator are visible, while `NS-1043` and unresolved `NS-1044` remain excluded. The owner approves a **VISA-FIN document-readiness pack**: one versioned checklist, a Hindi/English explanation, status reminders, and a human escalation when a bank document is missing. The decision links to the reviewed theme IDs, affected offering, owner and success metric (fewer document-related follow-ups and improved “ready to submit” answers). It does not claim that a voice campaign caused improvement until a later cohort measures it.

If the PG-APP cohort instead has better evidence, the same system may prioritize an application-status timeline. If cohorts conflict, the product should show the conflict and request a founder choice; it should not average incompatible services into one “customer sentiment” score.

## Failures the local workflow must make visible

| Failure | UI state | Engine behavior |
|---|---|---|
| Missing respondent identity | `Needs identity review` with candidate matches and source rows | No interview invite; no customer merge; append-only resolution receipt. |
| Missing/expired consent | `Suppressed: consent required` | Preflight blocks execution; preserve reason and expiry; allow explicit re-consent path. |
| Wrong product in CRM | `Offering conflict` with CRM claim vs interview answer | Ask a clarifying question; keep both claims and timestamps; require reviewer to choose offering revision. |
| Contradictory answers | `Contradiction needs review` | Store both evidence spans and question path; no automatic truth overwrite. |
| No answer/drop-off | `No answer` or `Abandoned` | Record attempt, elapsed time and retry eligibility; do not count as an answer or infer sentiment. |
| Duplicate respondent | `Duplicate candidate` | Cohort fingerprint and idempotency key prevent a second active interview unless an operator explicitly reopens it. |
| Partial transcript/provider failure | `Incomplete: provider failure` | Keep raw receipt and last event; make retry/repair explicit; never mark completed or synthesize missing turns. |
| Sparse or biased cohort | `Insufficient denominator` | Show counts by product, city, language and stage; block strong product claims below a configured evidence threshold. |

## Specific UI and engine changes for this repository

These recommendations extend the existing v6 boundary described in [`research/2026-09-22/product-signal-reuse-v6.md`](../2026-09-22/product-signal-reuse-v6.md); they are not implementation claims.

1. **Import review:** add a source-row drawer with raw/normalized values, source system, external record ID, authority, observed time, freshness, consent and identity candidates. Reuse the existing immutable ingestion/source revisions and contact-review compare-and-set pattern.
2. **Offering and journey binding:** make `offering_id`, offering revision and journey stage required campaign fields. Keep `platform:signal`, `platform:offering` and `platform:journey_stage` separate from model interpretations.
3. **Respondent ledger:** add a tenant-scoped mapping record with candidate matches, reviewer decision, reason and revision. Expose `unresolved`, `matched`, `conflict`, `suppressed`, `eligible`, `invited`, `completed` and `abandoned` states.
4. **Guide studio:** add primary-question rows, adaptive-probe instructions, product branch, expected answer type, redaction/consent copy, preview-only badge and launch QA. A guide edit should create a new immutable study revision.
5. **Interview execution:** save AI disclosure, consent revision, guide revision, offering, language, provider call ID and append-only attempt events. Add explicit wrong-product, contradiction, no-answer and provider-failure events.
6. **Evidence-coded answer browser:** extend `lib/learning/validation.ts`-style exact quote checks to question answers. Show quote, timestamp, normalized answer, reviewer status and source revision together; keep model extraction separate from approved interpretation.
7. **Cohort/theme analytics:** add `feedback_signal` and `feedback_theme` records with offering, journey stage, cohort definition, denominator, counter-evidence, missingness, confidence, time window and review. Every chart must expose numerator and denominator.
8. **Decision/evolution gate:** link a reviewed theme to an owner decision and proposed agent/knowledge/tool change. Run the existing evaluation service against affected scenarios, show before/after, and require review before creating a new immutable agent version.
9. **Failure and reconciliation surface:** add attempt receipts, retry budgets, provider event reconciliation and pause/stop acknowledgement. “Failed” must be replaced by actionable states such as invalid data, suppressed, no answer, duplicate, provider failure and needs review.

## Primary pages consulted (15)

1. https://listenlabs.ai/
2. https://listenlabs.com/articles/how-ai-moderates-research-interviews/
3. https://listenlabs.ai/blog/research-agent
4. https://listenlabs.ai/study-privacy
5. https://outset.ai/official-outset-company-information
6. https://outset.ai/platform
7. https://help.outset.ai/articles/4204194772-how-should-i-describe-outset-to-participants
8. https://demo.outset.ai/resources/stories/how-hubspot-ran-100-interviews-in-days-with-outset-and-shaped-their-ai-roadmap
9. https://www.dialogueai.com/
10. https://dailo.ai/en
11. https://dailo.ai/en/privacy-policy
12. https://dilog.ai/
13. https://dovetail.com/
14. https://greatquestion.co/support/studies/ai-moderated-interviews
15. https://maze.co/features/interview-studies/

All vendor feature, scale, speed, accuracy and customer-outcome figures remain vendor-stated claims unless explicitly marked as documented workflow behavior. No reviewed page proves suitability for Indian languages, consent law, CRM identity quality, or a completed product change in this repository.
