---
version: 1
slug: "components-platform-agents-view-tsx"
primary_target: "components/platform/agents-view.tsx"
related_targets: ["components/voice-studio.tsx", "components/platform/agents-workspace.module.css", "app/voice-workbench.css", "components/taxila-voice-audition.tsx"]
---

## Scope and mode

Agents is an Operate surface for creating, testing, versioning, reviewing, and explicitly publishing a company representative. This brief covers the Voice & language editor and the continuously mounted private test dock. It extends the existing Quiet Operations Desk; it does not introduce a new visual world.

## Audience and job

An owner or operator chooses the exact conversation engine, voice, primary and allowed languages, initial delivery rate, and bounded tools for an agent draft, then verifies those choices in a private test call before any release decision. The surface must distinguish editable draft settings, frozen call settings, provider state, and saved-version authority at a glance.

## Current task and proof

`Live conversation voice` offers workspace-default Azure OpenAI Realtime, explicitly pinned Realtime, Maya/Despina, and private Azure Voice Live Diya or Arjun. Voice Live choices are labelled `internal preview`; saving them starts no provider call and never changes the active release. Provider availability is checked only on an explicit private test start, and a failed attempt stops without engine fallback.

Speech delivery remains adjacent. Voice Live accepts the selected initial Standard `1×` or Unhurried `0.9×` request and disables caller-request adaptation. The rate is fixed from call start to end. Before start, the test dock labels the editable value `Selected voice`; after start, it labels the captured value `Call voice` and keeps the frozen primary language and initial rate visible. Later editor changes apply to the next call and receive a direct inline explanation.

Current implementation evidence includes one later Diya private preview that connected, delivered a Hindi opening, requested `search_company_knowledge` for a typed Roman-Hinglish question, and returned an available grounded answer. The same call exposed repeated introductions, overlong output, and a timed-out in-call rate change. Treat this as bounded private connectivity and company-tool evidence while root verification continues, not a finish-reviewed UI state or an audio-quality result.

## Direction and memorable moment

Keep the existing wide editor and narrow persistent test dock. The distinctive moment is the call header changing from editable selection to frozen operational identity: Call voice, Language, and Initial speech rate remain visible together while the call runs. Use existing flat provider tiles, restrained indigo state emphasis, normal field hierarchy, and direct boundary copy. No new raster, illustration, waveform, or motion is required.

## Separate evaluation surface

Teacher voice audition remains a lazy standalone Azure Speech synthesis workbench. Its text consent, expiring audio, fingerprint-only history, and playback do not choose the live conversation voice, establish Voice Live availability, or migrate an agent. Diya and Arjun naming is shared provenance, not shared authority.

## Constraints and unresolved decisions

- Private/internal testing only; public deployment and channel activation remain blocked.
- Engine, voice, language, context, and initial rate are frozen for one call attempt.
- No silent engine fallback, automatic retry, or in-call `1×` ↔ `0.9×` claim.
- Provider acknowledgement proves configuration acceptance only.
- No human listening, pronunciation, naturalness, concision, perceptual preference, hosted readiness, or whole-product claim.
- Repeated introduction and response length remain product-quality follow-up; root verification and final UI review are still pending.
