# Relay evidence audit — Assessment B

Assessment B only: deterministic detector and browser evidence. This audit was performed in isolation and does not use or summarize Assessment A, any combined critique, or comparative marketing notes.

## Scope

The inspected markup surface is the platform shell plus four requested views:

- `app/page.tsx`
- `components/platform/agents-view.tsx`
- `components/platform/command-view.tsx`
- `components/platform/brain-view.tsx`
- `components/platform/campaigns-view.tsx`

Live inspection used `http://localhost:3000/` in a new in-app Browser tab. The app loaded the existing fictional workspace `Voice engineering QA (fictional)` as a workspace owner. No account was created, no external-action link was followed, and no external action was triggered.

## Deterministic CLI detector

The bundled Impeccable detector was run once across the five exact target files in one invocation.

- Exit code: `0`
- Primary findings: `0`
- Advisory findings: `0`
- Rule names: none
- Finding file locations: none
- Raw output: `[]`
- Private raw artifact: `data/ux-baseline-detector.json`

The clean result means the detector found no registered source anti-patterns in these files. It does not establish that the rendered experience is free of semantic, density, target-size, or task-flow issues; those require browser evidence.

### False positives

There are no CLI findings to classify, so there are no detector false positives. The off-screen skip link observed at `y = -60` is the expected hidden-until-focus pattern and is not counted as a browser defect.

## Browser evidence

The Browser used its normal `1280 × 720` viewport. No viewport override was applied. Every inspected state had `scrollWidth === clientWidth`, so no horizontal page overflow was present at this viewport. The console remained empty through the inspection (`0` entries across all levels).

| View | Rendered content | Visible interactive controls | Unlabelled controls | Document height | Layout proof |
| --- | ---: | ---: | ---: | ---: | --- |
| Command centre | 6 headings, 3 panels, 10 rows | 41 total; 17 inside work area | 0 | 1,227 px | Two 471 px activity panels below a five-stage operating flow; workspace width 1,031 px beside a 234 px sidebar |
| Agents | 7 headings, 3 panels | 68 total; 44 inside work area | 0 | 1,622 px | Three simultaneous columns measuring 190 / 431 / 340 px; editor and call panel extend well below the first viewport |
| Company brain | 3 headings, empty-state workbench | 29 total; 5 inside work area | 0 | 720 px | Single-screen empty state; workspace width 1,046 px, no page scroll |
| Campaigns | 2 headings, campaign-planning region | 42 total; 18 inside work area | 0 | 1,653 px | One 850 px form column; initial plan extends over two viewport heights |

The accessible DOM exposed named navigation, search, refresh, grouped modes, labelled form controls, explicit headings, and all visible interactive elements with a text label, associated label, placeholder, or `aria-label` under the inspection heuristic. Heading order in the inspected states was coherent (`h1` followed by `h2`/`h3`) without a visible level skip.

### B1 — Campaigns loses the main landmark

Campaigns is the only inspected view with `0` rendered `<main>` landmarks. Its component starts with a generic `<div class="pc-page cc-page">` at `components/platform/campaigns-view.tsx:68`, while the shell's focus target is also a generic `<div id="workspace-main">` at `app/page.tsx:132`. The browser accessibility snapshot consequently presents the Campaigns header, mode group, and planning region directly after the app banner, without a `main` landmark.

The three comparison views each render their own `<main>`:

- `components/platform/command-view.tsx:27`
- `components/platform/agents-view.tsx:73`
- `components/platform/brain-view.tsx:46`

This is a concrete semantic inconsistency for landmark navigation. Suggested severity for synthesis: **P2**.

### B2 — The Agents first viewport carries unusually high simultaneous density

The Agents state exposes 44 controls inside the work area and three parallel work surfaces: a 190 px agent library, a 431 px editor, and a 340 px test-call panel. The rendered document is 1,622 px high, while the viewport is 720 px high. The first viewport therefore asks the operator to parse agent selection, templates, draft status, voice profile, prompt editing, test readiness, conversation context, and response mode at once.

This is measurable density evidence rather than a detector violation. The browser screenshot and DOM both confirm the controls are present and named; task priority and progressive disclosure should be decided during synthesis.

### B3 — Several work-area controls render below a 44 px touch target

At the unmodified desktop viewport, controls below either 44 px in width or height were observed inside each work area:

- Command centre: `2 / 17`
- Agents: `37 / 44`
- Company brain: `5 / 5`
- Campaigns: `14 / 18`

Most are 31–40 px-high tabs, selects, or standard buttons. The smallest observed target was the inline `Company brain` button in the campaign prerequisite message at `88 × 18` px. Examples in Agents include 34 px Save/Capture buttons and 38 px section tabs. These measurements establish target-size pressure but do not prove mobile behavior or a WCAG failure because no mobile viewport was requested or applied, and spacing exceptions were not evaluated.

### B4 — The shell presents 17 destination choices in persistent navigation

The shell exposes 17 named destinations across Operate, Build, Improve, and Workspace. Each visible navigation row measured 195 × 36 px. Group labels and current-page state are present, and all destinations are text-labelled. The evidence establishes a large persistent choice set and sub-44 px row height; whether to collapse, reorder, or preserve it is a synthesis decision.

## Screen-specific proof

### Command centre

The loaded empty state clearly separates the five-stage company flow from a zero-item decision queue and zero-count activity panel. The copy explicitly says the counts do not imply live provider activity. There is no horizontal overflow, and the work area contains only 17 interactive controls despite the shell-wide total of 41.

### Agents

The saved `Vocabulary QA` draft is visible with revision status, version count, voice profile, system prompt, six editor sections, save/version actions, and a ready test-call panel. The screenshot confirms the narrow library/editor/call composition and that the call configuration competes with editing controls in the initial viewport.

### Company brain

The empty business-model state fits within one viewport. It communicates the sequence `Approved sources → Offerings → Business signals → Campaign` and provides one primary next action, `Open source intake`. The tab implementation appears in the accessibility tree with a labelled tablist and tabpanel contract.

### Campaigns

The planning state exposes a clear mode group (`Manage`, `Plan with AI`, `Write manually`) and a labelled `AI campaign planning` region. The missing approved offering is presented as a blocking prerequisite, and both AI actions are disabled. The form is legible and has no horizontal overflow, but its 1,653 px document height and 18 work-area controls make the initial plan a long single-column task.

## Run notes and fallbacks

- Target slug: `components-platform`
- Ignore list: `.impeccable/critique/ignore.md` was absent
- Assessment independence: Assessment B remained isolated; Assessment A and combined/comparative reports were not read
- CLI detector: completed once, exit `0`, raw result saved without rerun
- Browser visibility: background inspection in a new tab; no user tab was reused
- Browser presentation: normal browser viewport, no viewport override
- Overlay injection: unavailable on the Browser's read-only evaluation surface; no title mutation or script injection was attempted
- Overlay result: none; no user-visible detector overlay is claimed
- Fallback signal: semantic DOM snapshots, read-only DOM/layout measurements, native screenshots, and console logs
- Live-server cleanup: no detector live server was started, so no server process required cleanup
- Browser cleanup: the agent-created audit tab was closed
- Temporary-file cleanup: no temporary files were created; the requested private raw detector artifact remains at `data/ux-baseline-detector.json`

Questions skipped: this is an evidence-only Assessment B handoff for parent synthesis.
