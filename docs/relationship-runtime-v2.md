# Conversation behavior and grounded continuity

Implemented 2026-09-22. This is a deterministic, provider-neutral business adaptation of statically inspected source mechanisms, not a copy of the companion persona and not a live voice quality result.

## Exact source evidence

Read-only source: `research-sources/html-portfolio`, `origin/claude/ai-companion-app-rkt1lv`, commit `f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21`.

| Source | Mechanism retained | Business adaptation |
| --- | --- | --- |
| `src/engine/moment.ts`, `detectMomentShape`, `hasDeixis` | Pure authored lexical gates; current user turn supplies the moment; shared callbacks require an explicit reference. | `analyzeConversation` observes narrow direct caller statements. It does not score emotion, infer from silence, or infer stress from language switching. Quoted, attributed and hypothetical examples are excluded conservatively. |
| `src/engine/compiler.ts`, `compile` | Empty-turn guard prevents a cue at call pickup; compiler stays pure. | Empty input and assistant-only input have no caller cues. Duplicate transcript IDs use the latest revision. No provider, storage or clock dependency. |
| `src/engine/relstate.ts`, `ruptureRepairShift`, `ruptureStance` | Repair needs the other person's signal; recorded rupture and active stance are separate. | Explicit caller statements that the assistant missed their point keep a bounded repair concern pending. The assistant's apology cannot clear it. Caller clarification can clear it. Generic frustration with another vendor is not a rupture with this assistant. This transient window is not a durable relationship score. |
| `src/engine/compiler.ts`, `renderHerCommitments`; `src/engine/relstate.ts`, `renderWeCallbacks` | Complete entry budgeting and relevance-gated continuity. | Approved contact preferences and contact-scoped open team work carry source IDs. Whole titles are retained or omitted, never cut mid-condition. The context has a 3,600-character cap; a commitment is not evidence that this AI personally promised or completed it. |
| `src/engine/agents/characters/maya.ts`, speech fields and correction examples | Language register, speech spelling and correction behavior are separable from identity. | Explicit Hindi/Hinglish concern/request phrases are recognized. AI disclosure, allowed languages and truthful correction remain mandatory. No copied biography, fake human identity, compulsory laughter, affective intimacy, trust thresholds or code-switch emotional inference. |

## Runtime boundary

`CONVERSATION_BEHAVIOR_INSTRUCTIONS` supplies baseline provider instructions: one question, pacing, brief acknowledgment, clear explanation, permission to continue, caller-led repair, and truthful corrections. `analyzeConversation(entries)` supplies operator-visible evidence and bounded guidance from the same business rules. It returns exact transcript offsets, current-turn cues, behavioral choices, a recent unresolved repair flag and up to four review-only correction candidates. The most recent 12 nonempty caller turns are considered, with a 6,000-character limit per turn. Assistant turns do not create evidence. Phrase coverage is deliberately limited and can miss paraphrases.

Cue-specific instruction text is authored and never embeds raw transcript snippets. Evidence remains reference data; it is not a higher-priority prompt. Correction candidates do not write memory, update customer data or grant permissions. The caller must supply only the current call's entries, and any later persistence needs the existing consent and review workflow. These helpers do not identify the person speaking.

`compileRelationshipContext` retains its existing scoped input boundary. The caller must already enforce tenant access. It accepts approved memories, excludes revoked/unapproved/wrong-contact records, chooses the newest explicit supported preferences and bounds complete context entries. Exact preference text and creation time accompany each source ID. A newer unsupported language does not silently revive a contradicted older language choice.

## Verification

`tests/emotional-relationship.test.ts` covers direct statement evidence, negative controls, empty inputs, assistant self-confirmation, caller repair signals, Hindi/Hinglish wording, pause priority, review-only corrections, transient bounds, contact scope, revocation, exact preference provenance and whole-entry budgets. Existing `tests/voice.test.ts` also exercises relationship integration. These are offline behavioral contract tests; audio quality, provider compliance and subjective naturalness remain unmeasured.
