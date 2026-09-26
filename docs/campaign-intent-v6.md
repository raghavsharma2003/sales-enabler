# Reviewed campaign intent

The existing Campaigns → Plan with AI journey now requires an approved product or service, a plain-English campaign description, a desired outcome, evidence needed to judge it, and an audience rationale. Reviewed signals and planned collection columns are optional. Company brain can open this planner with `navigate('campaigns', 'offering:<id>')`; this is a preselection, not a campaign ID. Missing or ambiguous offering context leads back to Company brain for correction and approval.

`CampaignPlan.explicitIntentV1` holds the canonical `CampaignIntent` from `lib/business/contracts.ts`. The same value is embedded in the applied campaign and immutable run snapshot; there is no additional intent entity. Historical `offeringName` and `offeringSummary` accompany the binding. Canonical review metadata is server-issued. Selected signal/customer associations must already be reviewed and every linked customer must be explicitly selected. Signal observations never grant consent, merge records, or establish achievement.

The server accepts old input without `intent` for compatibility. Such plans remain readable/applicable and are labeled legacy/unscoped. The new guided UI always submits `intent.schemaVersion: 1`. Manual drafts remain available and explicitly unscoped. Their execution cannot be presented as product-level outcome evidence. Campaign edits preserve canonical intent; changing the reviewed audience requires a new plan. An operator can still edit messages, choose a release and configure the working channel under existing checks.

## Evidence selection

For scoped plans, the prompt includes every exact approved offering/signal quote without trimming, deduplicated per source, with a total 12,000-character evidence budget. A required pack that exceeds that budget is rejected with a request to select fewer signals or review a focused offering. Up to three additional approved sources can be selected. Additional sources are included in full only when each is at most 1,800 characters and the total pack fits. Otherwise they are omitted with an explicit persisted reason shown in the plan. No arbitrary source prefix is used for scoped plans. `allowedQuotes` on the saved source anchors restricts model citation validation to supplied text while retaining true offsets in the full source. Existing unscoped plans keep their historical excerpt behavior.

The prompt names the selected offering, desired outcome, audience rationale, uncertainty and collection columns and requests specific questions in the call brief. The review labels these as proposed questions and planned columns; it displays “Not collected” and “not yet achieved.” No AI text launches a campaign or records success.

## Validation and authority

Generation and apply check live operator membership and retain its exact database fence across inference/commit. Offering, signal and source revisions/status/digests are revalidated before save/apply. Their exact raw rows join the mutation transaction as compare-and-set statements. Apply and launch preserve consent, release, customer and source checks.

`verifyAppliedPlanSources(user, planId, campaignId)` now returns database batch statements covering the exact plan, scoped campaign, all plan sources and the business-intent evidence rows. Callers must include returned statements in the transaction that authorizes action. It verifies that current scoped campaign intent and audience match the applied plan. Delivery also compares the launched snapshot with the canonical plan. The delivery/automation owner integrated these returned fences into the shared send boundary; voice integration is handled by the root task. Changed evidence blocks later action rather than rewriting historical intent.

## Focused verification

`npx tsx --test tests/campaign-intent-v6.test.ts tests/campaign-planning.test.ts tests/platform-campaigns.test.ts` covers specific offering prompt/evidence, a quote after the historical prefix limit, immutable plan/campaign/run binding, legacy compatibility, tenant isolation, unreviewed binding, missing linked audience, stale offering/signal/source, apply and launch transaction races, evidence omission/budget handling, and membership removal during inference. No live AI, email, browser call, full build or installation is required by this suite.

The Impeccable detector returned no findings for the planner component/CSS. A full browser review belongs to the root integration pass; these notes do not claim one was performed here.
