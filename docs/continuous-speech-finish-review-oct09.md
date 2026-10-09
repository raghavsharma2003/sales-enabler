# Continuous speech finish review — 9 October 2026

## Disposition

**SHIP the scoped Live understanding UI.** No material defect in the reviewed surface warrants a fix, recapture, or rebuild. The implementation fits the incumbent Quiet Operations Desk: it is compact, restrained, task-led, and unusually clear about consent, temporary recognition, and final-turn authority. This is a finish verdict for the named UI increment, not a whole-platform readiness or voice-quality verdict.

## Capture validity

All four supplied files were inspected: `continuous-user.png`, `continuous-controls-desktop.png`, `continuous-controls-mobile.png`, and `continuous-panel-mobile.png`. They cover the default ready inspector, enabled controls, and the same consent/inspector path at desktop and narrow mobile widths. The raster files are 1265×712 and 375×812 rather than the named 1280×720 and 390×844 window sizes; the narrower client areas still exercise the intended breakpoints and show no scoped clipping, overlap, or horizontal overflow, so recapture is not needed. Contentful recognition, unavailable recognition, mute, and ended states are established by source and focused tests rather than these images.

## Material findings

No material P0–P2 finding remains in scope. Live understanding defaults off; is available only for configured Azure microphone calls; prevents switching to Listen & type until deselected; remains available after returning to microphone mode; and adds the Azure Speech recognition path to the explicit consent text. The same call microphone is reused. Tentative words and cues remain visually and structurally separate from the transcript, are labelled as revisable and unsaved, and cannot enter the session save payload. Mute, end, unavailability, and native-final transitions clear the partial view. Response creation remains gated by the authoritative native final, including when a sidecar final disagrees. The inspector tabs implement roving keyboard focus, Home/End and arrow navigation, an owned tabpanel, and polite status announcements. Copy describes recognition state and evidence boundaries without implying audio quality, human identity, emotion certainty, or full duplex.

## Quality bar

The surface clears the scoped world-class bar through judgment rather than ornament. One opt-in sits directly beside input mode and consent; the disabled alternative explains its recovery; status, tentative text, cues, counts, and persistence boundary read in descending operational priority; and mobile turns the five inspector tabs into a stable two-column control set while preserving touch size and reading order. Color, type, spacing, radii, Lucide iconography, focus treatment, selection styling, and tabular numerals stay inside the established system. No imagery or added motion is needed for this Operate surface. The focused current-source regression run passed **39/39** across continuous understanding, browser integration, final-response preparation, and metadata-only diagnostics. The supplied terminal record separately reports **900/900**, standalone typecheck, and the Next 16.4 production build plus 1,113-entry package check passing.

## Limits

This review did not invoke a browser microphone, provider call, or new Azure probe. The four captures do not visually prove live content replacement, recognition failure recovery, mute/unmute clearing, or end cleanup; those conclusions are bounded to source and focused tests. The single actual Azure gateway probe remains an isolated synthetic-audio lifecycle result: four interims, one sidecar final, and end revocation. It does not establish native ASR accuracy, physical-device behavior, Hindi/Hinglish quality, perceptual voice quality, acoustic or end-to-end latency, simultaneous listening during output, full duplex, hosted operation, competitor superiority, or whole-product readiness.
