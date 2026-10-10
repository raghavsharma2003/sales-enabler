# Speech delivery UI finish review — 10 October 2026

**Disposition: SHIP for the scoped UI increment.**

This independent finish review covers the speech-delivery controls in Agent Studio, the bounded Taxila teacher-voice audition, and masked listening comparisons. It preserves the incumbent Relay Operate world in `DESIGN.md`: DM Sans, cool white and lilac-gray surfaces, restrained indigo emphasis, native audio controls, and explicit evidence boundaries.

## Evidence reviewed

The authoritative viewport captures are:

- `delivery-controls-desktop.png` and `delivery-controls-mobile.png`;
- `delivery-audition-desktop.png`, `delivery-audition-result-desktop.png`, and `delivery-audition-mobile.png`;
- `delivery-compare-setup-desktop.png` and `delivery-compare-setup-mobile.png`;
- `delivery-compare-listen-desktop.png` and `delivery-compare-listen-mobile.png`;
- `delivery-compare-rating-mobile.png`; and
- the final mobile recapture `delivery-compare-final-mobile.png`.

The desktop captures are 1280 × 900 and the mobile captures are 390 × 844. Intentionally scrolled captures were assessed as viewport states rather than document-top screenshots. `delivery-audition-fullpage.png` was exploratory and is not review evidence.

The final recapture shows the four Quality destinations in a stable 2 × 2 mobile grid. Each tab is 177 × 44 CSS pixels, labels remain readable at 12px, the selected state remains clear, and the client width equals the scroll width at 390px. No regression is visible in the comparison setup below it.

## Corrected findings record

An initial review incorrectly reported that saving one comparison criterion reset playback, attestation, and other unsaved drafts. Reinspection of `VoiceAudioComparison.review()` confirmed that it updates only the returned packet and notice. The full `receive()` reset runs when a comparison is opened, not after each criterion save. That finding is retracted.

The fourth perceptual comparison criterion remains **Professional warmth** by product decision. Critical-content correctness requires a separate correctness regression rather than an A/B preference question. The verification narrative is being reconciled to this decision; no UI or comparison-schema defect remains on that point.

The one valid finish defect was the mobile Quality navigation wrapping three tabs on the first row and one on the second. The scoped `quality-view.module.css` rule now produces the verified 2 × 2 grid below 580px while preserving the existing keyboard-operated tab semantics.

## Scoped verdict

- Speech-delivery controls clearly separate workspace default, standard 1×, unhurried 0.9×, and explicit caller-request adaptation. Copy states that these are experimental requested settings rather than proof of perceived warmth or naturalness.
- Taxila auditions preserve explicit Azure text-processing consent, private seven-day audio retention, fingerprint-only history, failed and uncertain outcomes, and the separation from the agent's live Realtime voice.
- Listening comparisons preserve stable masked A/B assignment, the fictional caller context, native playback, a separate complete-listening attestation, append-only assessments, and source reveal only after all four ratings.
- The UI does not claim a preferred speed, winner, acoustic improvement, pronunciation quality, human listening result, publication approval, or provider superiority.

The final production build, TypeScript validation, 1,207-entry package check, and packaged readiness HTTP 200 passed after the mobile fix. This SHIP disposition applies only to the reviewed interface increment and its bounded evidence states.
