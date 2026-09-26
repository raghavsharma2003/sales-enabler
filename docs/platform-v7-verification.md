# Platform v7 verification — bounded local record

**Date:** 27 September 2026 (Asia/Kolkata)  
**Status:** bounded local verification complete for the tested gates; scoped visual disposition is ship and the refreshed browser execution gate is closed. Real microphone/barge-in/device behavior, perceptual voice benchmarks, hosted deployment and external delivery remain open.

This record supersedes the earlier v7 472-test checkpoint for local test/build evidence. It is still not a production-release approval. No cloud apply, public host, external channel delivery, mailbox delivery, physical Android microphone test, or competitor trial was performed.

## Automated and runtime gates

Root reports the full integrated suite at **526/526 tests passing**. The final packaged Next production build passed with its postbuild package check clean and without copying the private local database. A separate typecheck passed. All six runtime bundles compiled. The packaged server was started for verification rather than the development server; the readiness health endpoint returned HTTP 200. Automation and learning heartbeat checks passed.

The previous build issue was a local standalone tracing configuration that copied a private database. Auth guard/exclude and package-check corrections are now reflected in the clean packaged-build result. This closes the local build gate, while hosted deployment and provider operations remain separate gates.

The local SQLite online backup and restore flow was exercised to new private directories. The restored store was kept separate from the source; this is local recovery evidence only and does not establish managed PostgreSQL backup, restore, retention or RPO/RTO.

## Browser and product-flow evidence

The browser verification used fictional data and recorded bounded evidence:

- Company settings saved a language list using ordinary typed comma input.
- Azure-backed CSV mapping created four mapped fields and two fictional rows without creating consent.
- Reopening the mapping matched the exact same customers and skipped rows already applied, preserving idempotent intake behavior.
- Azure public chat completed two replies and saved an anonymous canonical conversation record. The record is not linked to a customer identity.
- The three-step wizard preserved its state across the checked navigation path.
- Public branding was copied explicitly into the local deployment configuration; this does not prove a final brand or custom domain.
- A prior local demo pause returned the expected conflict response; the current local demo remains published locally. This does not establish public hosting.
- 1280px and 390px captures showed no horizontal overflow; the checked mobile document width was 375px within the 390px viewport.
- Final public metadata checks returned the expected available and paused responses (HTTP 200 and HTTP 409 respectively); this is local route evidence, not a public host claim.

Typed campaign results captured three text answers, recovered them from the same saved AI receipt without a new provider request, and were accepted after review. This proves receipt reuse and review state only; it does not claim campaign success, customer improvement or causal business impact.

AutoLearning generated source-backed proposals from new local calls, and the UI showed ready jobs. Anonymous public/unverified channel calls are restricted to feedback-only proposals; linked private customer calls retain reviewed memory/action paths. The learning worker and hooks remain governed by the explicit opt-in flag; there is no historic backfill and no automatic memory, prompt or agent-version approval.

The last browser pass also followed a reviewed proposal into the Conversations focus target and reopened the answer editor with the current reviewed clause prefilled. Three of three campaign answers were accepted after review. The independent reviewer marked the scoped disposition **ship**: the material mobile opt-in badge issue was CSS-fixed, all 18 recaptures were valid, proper gutters were restored, the exporter scrollbar crop was resolved, and no fix-batch regressions were observed. Final captures at 1265px and 375px reported `clientWidth` equal to `scrollWidth` with no overflow. This disposition covers the scored fixes and captures only, not whole-platform readiness.

## Azure voice evidence and boundary

Multiple Azure Listen & type calls produced spoken responses in English and Hinglish. One early call ended with a provider error and two older replies were clipped. A later instrumented call completed its opening and two turns; diagnostics exposed codes and statuses only and did not expose secrets. This establishes bounded provider/browser behavior and diagnostic redaction, not a blanket voice-quality, latency, microphone, interruption or naturalness claim.

The independent interruption review closed **9/9 own tests and 35/35 focused checks**, covering fully heard audio preservation, integer sample-based offsets, partial and multiple-item history reconciliation, and late-frame races. Native voice output is now capped at 2,048 tokens because a prior 700-token ceiling exhausted 703 output tokens with zero audio; text remains capped at 700. One corrected synthetic speech smoke passed with 52 input frames, 245,468 input bytes, one caller transcript, one assistant transcript, 39 output-audio frames, 789,600 output bytes, two completed turns and the expected keyword. It synthesized a 4.114-second English question and is not microphone/device evidence.

The implementation/browser-execution gate for the truncate fix is now closed by the offline adversarial proof and a refreshed browser call on the rebuilt artifact: opening plus one user reply completed, the session was explicitly ended, and no frontend console warnings or errors were observed. Public Azure responses can still repeat AI introductions or add preambles; naturalness, latency and Hinglish listening benchmarks remain open. Real microphone capture, barge-in behavior, device behavior and perceptual voice quality remain unverified. Do not describe current voice behavior as production-ready or superior.

## Explicitly unverified

- Azure management sign-in to the Founders grant account remains pending through the user's separate sign-in request. The Azure portal check opened an unrelated work-account MFA flow and was cancelled.
- No cloud resource apply, registry push, host deployment, public DNS/TLS, public WSS gateway, real Telegram bot, Meta number, external recipient, outbound email or mailbox delivery was used.
- Microphone capture, physical Android behavior, background/reconnect behavior and human-rated speech quality remain unverified.
- PostgreSQL hosted concurrency, managed backup/restore, retention, billing/grant applicability and production observability remain open.
- No competitor superiority, “human-like” quality or causal campaign-success claim is supported.

The authoritative next step is any separately authorized Azure management or hosted integration work. This document must remain separate from any future cloud deployment evidence.
