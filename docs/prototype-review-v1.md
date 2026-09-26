# Interactive prototype review

Open `http://127.0.0.1:3000/prototype` with `npm run dev` running. Start with **Explore the journey**.

The six screens are Overview, Voice studio, People, Company brain, Follow-through and Setup. The guide connects company setup → agent preferences → Aanya's context → a scripted conversation → memory/action review → simulated delivery and an updated customer record. Try the interruption and human-handoff branches separately.

All people, policies, messages and states are fictional. No account, API key, microphone or cloud service is needed. State is held in the page and resets on refresh or Reset demo. Settings are editable; the conversation is scripted text, not a generated voice benchmark. There are no calls to application APIs from the prototype.

## Verified on 2026-09-21

- TypeScript and production build pass, including `/prototype`.
- Browser journey: company setup, agent configuration, customer context, all nine conversation turns, memory edit/approval, action approval, simulated delivery, and updated contact state.
- Alternative human-handoff path stops the sample and creates an internal handoff without proposing an unsupported memory.
- Knowledge evidence opens in a native dialog; Escape dismisses it.
- Mobile viewport checked at 390 × 844; document width did not exceed viewport width. Horizontal navigation remains independently scrollable.
- No browser console warnings/errors observed in the checked flow.
- Static design detector passes with an explicit documented typography choice. This is not a full accessibility audit.

Generated artwork is stored in `public/images/relay-ribbon.png` and `public/images/maya-sculpture.png`; prompts and generation method are in [generated-assets.md](generated-assets.md).

## Review decisions

Does the voice-centred product solve the intended daily job? Does the handoff from conversation to memory/actions feel clear? Which steps should eventually be automatic under company policy, and which should require review? Which two workflows should a first pilot prove?

Production expansion remains paused until that product alignment. The prototype is disposable design evidence; it is not a substitute for porting and validating Maya/RelationalOS or for measuring real speech quality.
