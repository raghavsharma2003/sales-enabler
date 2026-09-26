# Voice, emotional responsiveness and future product bets

Research date: 2026-09-21. Product recommendations below are hypotheses, not established customer results.

## What to mean by emotional intelligence

For this business product, define it through behavior: listen without interrupting, notice expressed confusion, shorten explanations when asked, remember a stated concern, respect a requested pause, and bring in the right human. Evaluate whether the student or customer felt heard and got the right next step. A hidden score purporting to know someone's inner emotional state is not necessary for any of these outcomes.

Natural voice can improve the experience, but voice quality alone is not an exclusive advantage. [Hume's EVI documentation](https://dev.hume.ai/docs/speech-to-speech-evi/overview) already describes prosody-aware voice interaction. [Sarvam's voice-agent documentation](https://docs.sarvam.ai/conversations/overview) offers a multilingual agent platform. These are vendor capabilities, not proof they will meet our pilot's quality bar.

The [EmoNet-Voice paper](https://arxiv.org/abs/2506.09827), revised January 2026, distinguishes clear high-arousal expressions from harder-to-separate categories. Its benchmark includes synthetic speech; success on that benchmark would not prove accurate inference on noisy student calls. [Sympatheia](https://arxiv.org/abs/2606.00851), submitted May 2026, investigates continuous affect conditioning and notes that ordinary speech can contain ambiguous emotional cues. Its reported response-alignment improvements are research results, not evidence of increased admissions or sales.

## Voice behaviors worth building

| Behavior | Business value | Evidence required in our product |
| --- | --- | --- |
| Accurate Hindi-English code switching and names | Less repetition and fewer wrong records | Realistic mixed-language calls, including proper names, dates and amounts |
| Fast, interruptible turns | People can correct the agent naturally | End-of-speech to first audible response, at median and tail; interrupted-turn recovery |
| Explicit concern memory | Follow-up responds to the real blocker | Human checks that stored concerns came from a source and remain current |
| Restraint during frustration | Avoid repeated selling when someone needs help | Conversation review, complaints and handoff quality |
| Continuity across calls and WhatsApp | Student does not restart the story | Identity resolution, scope controls and repeated-contact evaluation |
| Warm human handoff | Counsellor receives usable context | Acceptance by the counsellor and no need to repeat already supplied details |
| Truthful acknowledgement of uncertainty | Protect trust on course facts and deadlines | Unsupported-claim rate; stale/conflicting-source cases |

AI identity should be clear. A licensed or consented brand voice is optional; cloning the founder or every counsellor adds little to the first business outcome. Do not optimize for making students mistake an agent for a human.

An example of useful adaptation: the student says, "My parents are worried about the total cost." The agent records that stated concern, offers an approved cost breakdown and an optional family counselling appointment, and checks what information may be shared. It does not infer financial capacity from tone, pressure a deposit, or disclose the student's private comments to a parent automatically.

## Evaluation design

Use the same underlying workflow, approved information and action permissions while comparing a conventional voice configuration with the adaptive one. Otherwise, improved results may come from better scripts or faster responses rather than adaptation.

Test quiet calls, traffic noise, weak connectivity, corrections, silence, interruptions, regional accents, mixed language, shared phone numbers, names and financial figures. Track task correctness and human-rated experience alongside conversion. A call that books an appointment using a false scholarship promise is a failure.

Use human reviewers and counterbalanced comparisons for voice quality. Automated judges can help locate failures but cannot by themselves establish accent authenticity, trust or business impact. Record model/provider version, configuration, dates and sample size so upgrades can be compared honestly.

Existing repository evaluation artifacts are useful starting points. Their claims need reproduction on the new business workflow; companion charm and speaker likeness are different objectives from accurate counselling support.

## Why human assistance belongs in the product

[Generative AI at Work](https://arxiv.org/abs/2304.11771), revised November 2024, studied 5,172 support agents and reported an average 15% increase in issues resolved per hour, with substantial variation by experience. This supports evaluating assistance to staff, not assuming autonomous replacement will produce the same result in admissions. Counsellor briefings, accurate record updates and document coordination may deliver value before fully autonomous conversations do.

## Future scenarios, not forecasts

| Possible development | Evidence today | Product response |
| --- | --- | --- |
| Natural multilingual voice becomes easy to buy | Hume and Sarvam expose voice capabilities as products/APIs | Keep providers replaceable; invest in the customer workflow, testing and service quality |
| CRMs bundle more autonomous work | [Microsoft's Sales Qualification Agent](https://learn.microsoft.com/en-us/dynamics365/sales/sales-qualification-agent) already automates qualification; [Meritto](https://www.meritto.com/) offers Guide, Voice and Coach | Benchmark the customer's existing stack; compete on measured execution and fit, not the word agent |
| Company knowledge becomes widely accessible to agents | [Glean enterprise context](https://www.glean.com/platform/enterprise-context) connects organizational data and relationships | Maintain structured customer state, current policy and authorized actions rather than a document chatbot alone |
| Buyers demand evidence for AI charges | Outcome-based competitor pricing already exists; see market-evidence.md | Preserve an auditable trail from intervention through observed outcome, including failures and reopens |
| Destination and institutional requirements keep changing | Study-abroad work depends on externally controlled information | Use source ownership, effective dates, refresh schedules and review for changes; avoid training volatile facts into weights |
| Customer-managed agents become more common | A plausible extension of present agent products, not a demonstrated dominant channel | Expose permissioned structured status and actions through stable APIs, so value does not depend on a chat UI |

No scenario establishes a moat. The defensible asset would have to be earned through repeatable deployment, trustworthy operation, workflow evaluations and customer results. Keeping providers interchangeable reduces technical exposure; it does not guarantee commercial differentiation.

## Decisions

Build natural, respectful conversations connected to real work. Preserve uncertainty and consent in the data model. Buy speech infrastructure initially unless a measured requirement cannot be met. Test adaptation as an incremental improvement. Keep companion entertainment, general personality cloning and emotion-based customer scoring outside the first business product.
