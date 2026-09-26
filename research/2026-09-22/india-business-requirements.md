# India business voice requirements — 22 September 2026

## Product conclusion

The first accessible buyer is an Indian study-abroad consultancy, but the product should be a **general, consent-aware company voice workspace**. Its defensible job is to turn an authorised conversation into a correct next step: an updated relationship record, a booked counsellor conversation, a requested document, or a verified payment state. It must never represent a qualification decision, immigration/legal advice, a payment, or a family member's permission as settled when it is not.

This is requirements research, not a claim that telephone recording, marketing, data protection, or payment rules have been exhaustively interpreted. Before production outbound calling or recording, the consultancy, telecom provider and Indian counsel must validate the actual campaign, number type, geography and retention practice. TRAI's current consolidated TCCCPR is dated 21 May 2026; its sender guidance says businesses using telecom resources for bulk messages must register required entity/content/consent material, and describes consent as purpose/product/service-specific [1][2]. WhatsApp likewise requires a person to have supplied the number and opted in to receive messages from the named business; business-initiated conversations use approved templates, while the customer-service window is 24 hours [5].

## Core product requirements (every vertical)

1. **Relationship, identity and permission graph.** Model a person, organisation, contact point, role, relationship and authority separately. A student, parent/guardian, spouse, counsellor and owner can share a case without inheriting access to one another's phone, documents, messages or payment status. Record who supplied a number, channel-specific consent, purpose, source, timestamp, withdrawal/stop request and evidence reference. Enforce “do not contact” immediately across adapters. The DPDP Act establishes notice/consent and withdrawal concepts, including the ability to prove notice and consent when consent is relied upon [3]; implementation and applicability need legal review.

2. **India-ready representation, canonical data.** Store money as integer minor units plus ISO currency (`INR`, not a formatted string); render `₹1,25,000` only in the selected locale. Preserve the customer's spelling, preferred name, pronunciation/alias, script, and title; do not “correct” names in a CRM. Parse dates only after confirmation when ambiguous (say “5 June 2027” and retain ISO `2027-06-05`), store an IANA time zone, and repeat the local time for overseas institutions. Support Indian phone presentation but retain E.164 canonical numbers. Require confirmation for spellings, passport/application IDs, email addresses, rupee amounts and appointments.

3. **Voice that handles real Indian conversation.** Per contact and campaign, select preferred language(s), voice/style, disclosure text and fallback. Evaluate English, Hindi and the buyer's chosen languages plus natural code-switching (for example Hindi-English), regional accents, speech overlap, phone noise, low bandwidth, names and place names. The agent should say it is an AI at the opening and on handoff, ask permission before any recording, and offer a person. It must ask to repeat or switch to text when confidence is low; it must not silently invent a transcript or action.

4. **Controlled business actions.** Each proposed CRM write, message, calendar event, document request and payment-link request needs: authority, idempotency key, clear preconditions, result/uncertain-result state, immutable audit event and a human-review route. Calendar writing uses least-privilege OAuth and the named counsellor calendar; Google requires authorisation to create events [6]. A retry after a timeout must find or reconcile the original booking before creating another.

5. **Channel and security boundary.** Keep telephony, WhatsApp, CRM, calendar, storage and payment providers behind adapters; preserve provider event IDs and delivery status. Put recordings/transcripts behind role-based access, retention/deletion configuration, export controls and an incident playbook. CERT-In directions are a relevant security baseline to review, not a substitute for a product-specific compliance assessment [4]. Recording must be optional, announced before capture, linked to the consent/disclosure version, and separately deletable from derived summaries where feasible. A provider can technically record and expose media; that capability is not permission to do so [8].

6. **Human escalation.** Stop automation and offer warm transfer/callback when the caller requests a person, disputes identity or data, revokes consent, is distressed, the audio/language is not understood, or asks for regulated/legal/medical/immigration advice. For material commitments—refunds, scholarships, visa outcome claims, payment changes, document assessment or an external submission—the agent gathers context and routes it; an authorised human makes the decision.

## Study-abroad configuration (not core schema)

Configure intake/countries/intakes, institution and course catalogue, service packages and published claims, counsellor roster/capacity, document checklist, approved follow-up templates, escalation matrix and campaign hours. The case can track declared destination, education background, budget range, intended intake, test status, meeting and document-request state. It should label information as applicant-provided, counsellor-confirmed or source-linked—not “eligible”.

Workflow sequence: qualified lead → consented follow-up → counselling slot → document request/reminder → counsellor review → authorised payment-link request → provider-confirmed payment → subsequent human-owned application process. Send a payment link from the consultancy's chosen authorised provider; record provider link/payment IDs and webhook-confirmed status, never card/UPI credentials. RBI directly regulates payment aggregators, including cross-border payment aggregation [7]; the platform should avoid becoming a funds handler. Provider APIs also require INR amounts in paise, reinforcing the integer-money rule [9].

## Configurable versus invariant

| Invariant core | Per-company configuration |
| --- | --- |
| consent evidence/revocation, AI disclosure, role-scoped records, audit trail, human authorisation, idempotent external actions, provider adapters | language and tone, operating hours, CRM field mapping, calendars, WhatsApp templates, call script, retention period, escalation owners |
| generic people/cases/tasks/documents/payments as external states | study-abroad stages, counsellor availability, document checklist, fee packages, countries/institutions, parent-contact policy |

## Prioritised acceptance tests

**P0 — must pass before a pilot.** (a) A lead without the required channel consent cannot be contacted; STOP/revocation blocks all queued work and is auditable. (b) A parent calling from a separate number cannot view a student's documents or fee state until a permitted relationship and scope are recorded. (c) Mixed Hindi-English, a noisy call, an unfamiliar name and “₹1.25 lakh” result in confirmation, not a fabricated CRM value. (d) “05/06”, a US/UK meeting and a DST change produce an unambiguous local appointment; a retry creates no duplicate calendar event. (e) A payment link is never called “paid” until the configured provider event confirms it. (f) The opening disclosure, recording choice, human request and handoff all appear in the audit trail.

**P1 — required during pilot.** WhatsApp outbound messaging is blocked without usable opt-in/template state; attempts outside the service window take the configured approved route. CRM conflict/offline writes reconcile visibly. A caller can correct a memory, choose a different language, decline recording and receive a text/callback alternative. Permission tests prove a junior counsellor cannot export recordings or sensitive documents.

**P2 — scale evidence.** Benchmark each deployed language/accent/noise cohort with human-scored task accuracy, interruption recovery and safe escalation. Test concurrent family conversations, reassignments, document deletion/retention jobs, provider webhooks arriving late or twice, and carrier/WhatsApp failure states.

## Outcomes and economic evidence

Do not invent a price, TAM or savings claim. Establish a baseline by campaign and compare only like-for-like cohorts. Define: contactable lead = consent and valid channel at attempt; completed qualification = requested fields confirmed; booked counselling = calendar event accepted/not cancelled; show = attended slot; counsellor-ready case = required evidence present; payment outcome = provider-confirmed event; and human minutes per completed outcome. Report conversion between each denominator, time-to-first-response, show rate, duplicate-action rate, correction rate, opt-out/complaint rate, escalation rate and recovered counsellor minutes. Revenue evidence should be actual consultancy booking/fee records joined to the case under an agreed attribution rule—not an agent's spoken estimate.

## Three evidence-led expansion segments

1. **Domestic admissions and test-prep operators:** same student/parent permissions, counselling calendar, reminders, documents and fees; replace institution/visa configuration.
2. **Residential real-estate sales teams:** consented lead follow-up, multilingual qualification, multiple decision-makers, site-visit calendars and CRM handoff; keep loan/legal advice and booking money human-owned.
3. **Multi-location clinics for non-clinical administration:** appointment, reminder, reschedule and caregiver permissions; restrict the agent to administrative routing and use a stricter health-data review before deployment.

These are credible because they reuse the invariant relationship, consent, scheduling and audited-action system, while their regulated claims and configuration remain separate. Validate one paid workflow and its baseline outcomes before expanding.

## Primary sources (accessed 2026-09-22)

1. TRAI, “Advice to Senders” — https://www.trai.gov.in/advice-to-senders
2. TRAI, “Telecom Commercial Communications Customer Preference Regulations, 2018” (consolidated regulation listing, 21 May 2026) — https://www.trai.gov.in/release-publication/consolidated-regulations/telecom
3. India Code, *Digital Personal Data Protection Act, 2023* — https://www.indiacode.nic.in/bitstream/123456789/22037/2/a2023-22.pdf
4. CERT-In, “Directions under section 70B” — https://cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
5. WhatsApp Business, “Business Messaging Policy” — https://whatsappbusiness.com/policy/
6. Google for Developers, “Calendar API: Events.insert” — https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
7. Reserve Bank of India, “Regulation of Payment Aggregator – Cross Border” — https://rbi.org.in/Scripts/NotificationUser.aspx/upload/Scripts/NotificationUser.aspx?Id=12561
8. Twilio, “Recordings resource” — https://www.twilio.com/docs/voice/api/recording
9. Razorpay, “Payment Links API reference” — https://razorpay.com/docs/api/payments/payment-links/
