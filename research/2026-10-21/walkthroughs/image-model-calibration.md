# Which model reads the walk-through screenshots: pre-registration

_Written 2026-10-21, before any arm ran. The owner asked for cheaper Haiku agents for the image pass "if Haiku would be
able to do it in the best quality". This file fixes how that gets decided, so the result can't be argued backwards._

## What the image pass is for

Instinct left two captures per dashboard screen in Drive (folder "Voice-AI Product Evaluation 2026-10-21"):

| Capture | What it holds | What it misses |
|---|---|---|
| `NN-name.txt` | the page's text (innerText): labels, headings, option names | input values, toggle and slider states, which tab or option is selected, layout, visual design |
| `NN-name.png` | the pixels, 1280×720 | nothing on screen; off-screen content |

So the screenshot pass extracts **what the text capture cannot**: control states and values, selection, layout and
hierarchy, density, empty and error states, and visual design. Judging a vendor's UX happens one level up, in the
vendor analysis, which reads the text captures plus these notes and can open any screenshot itself.

**Found while setting up:** the Drive connector's `read_file_content` returns Google's OCR text plus image labels for a
PNG, not the pixels. Any model reading screenshots that way sees the same OCR string, so model choice would not matter
and nothing visual could be judged. The pass therefore uses real pixels: `download_file_content` → saved result →
`scripts/walkthrough-drive.mjs decode` → PNG on disk → the agent opens the image.

## Arms

| Arm | Model and effort |
|---|---|
| A | Haiku 5.5, medium |
| B | Sonnet 5.5, high |

Same prompt, same output schema, same 8 screenshots, one agent per arm reading all 8 (the way the real pass batches).

**Sample (stratified by what is hard to read):** a dense config form; an open dropdown with many options; a long
language/voice list; a pricing page with numbers; a flow-builder canvas; a settings page with sliders/toggles and
numeric values; a metrics/analytics page; an empty state.

**Reference:** the main loop (Opus 5.5, extra-high) opens the same 8 PNGs and writes the fact list for each: every
numeric value, every visible option, every control's state, every banner. Written before reading either arm's output.

## Scoring

Per arm, over the 8 images:
- **Recall:** reference facts the arm reports correctly ÷ reference facts.
- **Material errors:** a wrong number, a wrong or invented option or control, a wrong state (on/off, selected). A
  "could not read" is not an error.
- **Design notes:** each note is checked against the pixels; an unsupported claim counts as an error.

## Decision rule (fixed now)

Haiku does the full image pass if **all** hold:
1. Haiku's recall ≥ 0.90 × Sonnet's recall;
2. Haiku's material errors ≤ 1 across the 8, and ≤ Sonnet's + 1;
3. Haiku marks unreadable text as unreadable rather than guessing.

If Haiku fails only on one stratum (say open dropdowns or dense lists), Haiku takes the rest and Sonnet takes that
stratum. Otherwise Sonnet does the whole pass. The vendor analyses and the cross-vendor synthesis are not part of this
test; they stay on the tiers the ladder sets.

## Result (2026-10-21)

**Sonnet does the screenshot pass. Haiku fails rule 2.**

The reference was 78 facts across the 8 screenshots, written by the main loop before either arm's output was opened.

| Screenshot (stratum) | Facts | Haiku recall | Sonnet recall | Haiku errors | Sonnet errors |
|---|---|---|---|---|---|
| bolna 16-builder-Engine (sliders, values) | 16 | 16 | 16 | 1 borderline | 0 |
| bolna 21-calling-toggles (toggle states) | 9 | 9 | 9 | 1 borderline | 0 |
| bolna 23-workflow-builder (canvas) | 8 | 8 | 8 | 0 | 0 |
| bolna 29-billing (trap: not billing) | 10 | 9.5 | 10 | **1** | 0 |
| bolna 07-analytics (trap: loading) | 4 | 4 | 4 | 0 | 0 |
| vapi 50-edit-Model (dense form) | 12 | 11.5 | 12 | 0 | 0 |
| vapi 52-model-dropdown (open dropdown) | 10 | 10 | 10 | 0 | 0 |
| vapi 80-transcriber-languages (long list, hidden states) | 9 | 8.5 | 9 | **1** | 0 |
| **Total** | **78** | **76.5 (98%)** | **78 (100%)** | **2 clear + 2 borderline** | **0** |

**Haiku's errors:**
- **Clear:** on `29-billing` it reported "No trial banner and no promo banner; the top 88 px of the window is empty". Both banners are on screen. That is an invented absence, on the trap screen.
- **Clear:** on `80-transcriber-languages` it listed the Model card's latency, cost and intelligence. Those numbers are cut off in that screenshot; it carried them over from the previous image instead of marking them unreadable. This also breaks rule 3.
- **Borderline:** "a + top-up button on each" header chip (there is one); "each a toggle with a slider and value box" for Keypad Input and Auto Reschedule (toggle only).

**Against the rule:**
1. Recall ratio 0.98 ≥ 0.90: pass.
2. 2 clear material errors > 1: **fail**.
3. One value imported from another screenshot instead of "unreadable": **fail**.

The errors are spread across strata (a state trap and a long-list screen, plus borderline ones on slider and toggle screens). So no stratum can be split off to Haiku, and Sonnet takes the whole pass.

**Cost and speed:** Haiku was not cheaper per run here. Haiku used 107k tokens in 148 s; Sonnet used 88k tokens in 111 s. Haiku's per-token price is lower, but it wrote longer output for worse accuracy.

**Where Haiku was better:** it measured two thumb positions more precisely than Sonnet did. Vapi's temperature thumb is at 27% of the track, and Bolna's cost-bar split is roughly 53/8/39 (pixels: 58/8/33; Sonnet said 65/3/30). Both models flagged these as estimates. Neither is a material fact.

**Not tested:** Sonnet at medium effort, and Haiku on simpler screens only. A re-test would be worth it if the screenshot volume grows by about 10×.
