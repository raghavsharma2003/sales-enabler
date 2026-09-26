# Local v5/v6 verification

22 September 2026. This record concerns the local implementation and a fictional test workspace. It is not evidence of real customer outcomes, production deployment, acoustic quality or competitor superiority.

## Engineering checks

- The integrated suite passed **313 tests, zero failures** after the functional corrections; the command log is retained at `.impeccable/review/platform-v6-tests.log`. The latest production build passed with TypeScript included (root build record `40124`), and standalone `npm run typecheck` also passed after the final UI changes. A later frontend-only ordering change is covered by the final build and visual confirmation.
- Independent execution review reproduced eight authorization, concurrency and recovery defects across voice tools, follow-up review, email and WhatsApp. All **nine adversarial regression tests** pass after correction. See [the review](v5-execution-review.md).
- Per-operation membership and data fences protect the actual write/dispatch reservation. Provider acceptance, uncertain outcomes and completed internal work remain distinct.
- SQLite is the exercised database. PostgreSQL behavior and hosted operation remain unverified.

## Live local workflow

| Step | Observed result | Important limit |
| --- | --- | --- |
| Company discovery | One Azure request produced two draft offerings, one signal and eight questions from three approved sources. A model list in an optional suggested-action field was normalized without changing its content; the saved response was reused. | Discovery is bounded. It does not perform universal ERP/LMS reconciliation or infer customer identity. |
| Founder clarification | An answer became an attributed draft source, was explicitly approved, and supported an updated offering. Open offering questions were cleared only after that review. | The company and answer were fictional QA material. An approved answer is visibly distinguished from seven remaining questions. |
| Offering and signal | One service and one linked company-level signal were approved. The service opened a prefilled campaign planner. | No customer was automatically linked or granted contact permission. |
| Product-specific plan | Azure generated a plan carrying the exact offering revision, desired outcome, audience rationale, one reviewed signal, three planned fields and quoted evidence. | Planned fields are a collection schema, not automatically populated result cells. |
| Plain-English agent revision | Azure proposed a before/after revision. An overly strict verbatim-preservation check was corrected, and the saved output was rechecked without new inference. Explicit apply changed the draft. | Protected identity, source selection, voice, memory, language and enabled actions were retained. Publication was separate. This does not train model weights. |
| Live Maya actions | A real Gemini Despina Listen & type call used all three installed actions: source lookup, scoped customer-context recall and an internal follow-up proposal. Seven transcript entries and three server receipts were saved. | Two results were available; one awaited review. No booking, notification, message or live transfer occurred. |
| Versioned campaign | The reviewed draft was captured as a new immutable version, checked and published locally. A one-recipient product campaign passed preflight, paused, resumed and completed a real browser conversation. | The browser operator started the call. No telephone call was placed. |
| Service feedback | A second live Maya session lasted about 140 seconds and saved five entries with exact campaign binding. The sample caller described a useful element, confusion, an improvement and no need for follow-up. | Listen & type, not a microphone/device or actual customer trial. No follow-up tool ran in that session. |
| Learning and product evidence | Azure produced three learning cards. Operator review kept them as conversation feedback and corrected a negated follow-up misclassification. The offering view showed one linked plan, campaign, run, recipient slot, completed saved conversation and three reviewed quotes. | Exact explicit refusals are now blocked from becoming follow-up actions. Neither a language preference for this call nor refusal was automatically turned into permanent memory or a consent update. |
| AI campaign brief | One Azure request drafted outcome, evidence requirements, audience hypothesis and collection questions. A false-positive claim check was corrected; explicit recheck reused the completed receipt and populated editable fields. | No plan, campaign or external action was created by the brief step. The audience rationale is a hypothesis requiring review. |
| Team access | A local viewer invitation was created without email, the join screen rejected the currently signed-in mismatched identity, and the test invitation was revoked. | Successful join, role-change and concurrency cases were exercised in automated tests, not with an external teammate. |
| Worker | The local worker runs with no enabled schedules. A real global heartbeat now reports readiness even for an empty scheduling workspace. | No real email was dispatched. A public hosted worker was not deployed. |

The two live Maya sessions were possible after fixing Gemini tool declarations to use its supported JSON Schema field. The first tool-enabled provisioning attempt failed before a call connected; that failure is not counted as a successful call. Browser event measurements are retained as client observations and are not acoustic or end-to-end latency benchmarks.

## Costs and external services

The text ledger remained at **12 completed requests: 6,996 input and 5,489 output tokens**, including completed provider responses that initially failed application validation. Recovery used retained receipts. Live voice is outside this text ledger; rates and grant billing were not verified. Paid inference stayed on the existing Azure resource; the explicit Maya profile used the configured existing free Gemini path.

No real Google/Microsoft OAuth account, content sync, email dispatch or Meta conversation was activated. WhatsApp inbound/signature/reply/status behavior is covered by offline tests; the live inbox correctly shows setup required. Telephone dispatch, live cloned voices, public caller identity, native Android, live A/B traffic assignment, broad acoustic trials and production hosting remain outside this verified slice.

## Visual scope

Desktop and 390px mobile captures cover company model and evidence, campaign plan/run, agent actions/revision, conversation receipts/learning, team/join, inbox/setup and automations. The independent review required and then passed four bounded corrections: answered clarification state, company-page hierarchy, plan-field labeling and automation page gutters. Final captures and its closing verdict are local ignored artifacts under `.impeccable/review/`; document width remained 375px within the 390px viewport, with no horizontal overflow and no browser console errors. No raw transcripts, invitation tokens or credentials belong in the context graph. This is responsive browser evidence, not physical Android evaluation or whole-product production proof.

See [product operating model](product-operating-model-v6.md), [use-case coverage](use-case-coverage-v6.md), and [project handoff](project-handoff-v6.md) for the long-term product contract and remaining work.
