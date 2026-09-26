# Expanded product concept review

Open `http://127.0.0.1:3000/prototype` while `npm run dev` is running. The intended product is described in [product-flow-v2.md](product-flow-v2.md). Prior version verification is preserved in [prototype-review-v1.md](prototype-review-v1.md); it does not establish version 2 results.

All contacts, sources, messages, interviews, tasks and outcomes are fictional. No account, API key, microphone or provider is needed. Refresh resets local state. The concept demonstrates product decisions, not live extraction, live calls or campaign delivery. Generated artwork is documented in [generated-assets.md](generated-assets.md).

## Review these connected paths

1. **Company to knowledge:** edit the sample company context, inspect sources, preview imported records and review proposed knowledge.
2. **Sales campaign:** create a draft, review audience and exclusions, preview the journey and message, pass the launch review, simulate events and inspect the affected customer's history.
3. **Feedback campaign:** choose served customers, review the interview guide and schedule, simulate an interview, inspect evidence and a theme, create an owned improvement and close the customer loop.
4. **Voice behaviour:** step through a scripted conversation, see a correction and memory permission, and try human handoff. This is text simulation, not a voice-quality demonstration.
5. **Team and automation:** inspect task ownership and simulate an automation/API request creating a reviewable campaign draft.

Review whether the flow matches your intended product, whether the dashboard shows the right decisions, and whether company knowledge, customer context and team follow-through feel connected. The provisional name is not a branding decision.

## Verification

Verified on 21 September 2026:

- TypeScript passed after the final state and draft-preservation changes.
- Final production build passed, including the `/prototype` route. The context graph validator passed with 26 nodes, 23 edges and 11 events.
- Company name/context edits, sample source mapping, knowledge review and published state were exercised in the browser.
- Feedback campaign: audience exclusions, schedule, interview guide, disabled launch until review, simulated launch, pause blocking event progression, resume, interview, evidence view, task assignment, internal completion, separate customer update and Kabir's updated timeline.
- Sales campaign: save draft, reopen with the edited brief preserved, Rohan's personalized preview, launch, delivered/reply/owner events and Aanya's timeline. A reply stops the illustrative sequence; the appointment remains unconfirmed.
- Voice: six scripted turns, correction and permission, approved preference, human handoff and subsequent memory revocation.
- API entry point: displayed sample request, same campaign builder, saved draft visible in the list. No API call made.
- Desktop layout and mobile 390 × 844 checked. Document width 375px did not exceed the 390px viewport; the mobile dialog was 341px wide. Navigation and builder steps scroll within their own containers.
- No browser warnings/errors observed in the checked flows. This is not a complete accessibility or performance audit.

The simulation advances one representative recipient per campaign. Other eligible recipients are not simulated. Company imports, agent conversations, personalization and insight synthesis use authored fixtures, not live AI. The selectable channel combination in this revision is email plus browser voice; other channel previews are marked future. External integration setup, real registration and general automation authoring remain product-design scope rather than functional services in this mock.

Production expansion remains paused until product alignment.
