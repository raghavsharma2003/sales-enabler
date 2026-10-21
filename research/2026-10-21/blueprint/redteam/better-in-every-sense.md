# Red team: is VP better than the best competitor in every sense?

**Lens:** better-in-every-sense (`directive.2026-10-21.blueprint-end-to-end`, req-38). **Inputs:** the spine, the 9 module designs, the vendor dossiers, the owner catalogue (`data/blueprint/owner-requirements.json`, 68 items), `context/DIRECTION.md`, the graph's `rejected.*` nodes, and the module defaults JSONs. **Matrix as data:** `data/blueprint/redteam-better-in-every-sense.json`. Grades: [M] measured, [O] observed, [V] vendor-claimed, [I] inferred, [U] unknown.

## 0. Verdict in six lines

1. **The blueprint does not deliver "better in every sense". To its credit, it mostly says so.** It beats every incumbent *on paper* in three of the owner's ten senses. It matches or is unproven in four. It **loses today** in three: speed (talk-over), vibe (raw voice) and the user flow to a first production call.
2. **The wedge it can defend is real:** the India operator layer (category, suppression, A2P, series, why-allowed trace), honest numbers, failure explainability and approval safety. Nobody ships these (0 of 8 [O]).
3. **The things the owner ranks highest are the least proven or are conceded:**
   - voice (req-01): concedes ElevenLabs and does not even put its TTS in the catalogue;
   - speed (req-11): the preferred Natural preset misses VP's own 1.5 s budget;
   - INR 2 (req-41): Base is INR 3.49;
   - self-learning (req-34): human-gated, and the phrase is banned in copy below L4;
   - results (req-45): cannot be verified for SMB buyers who have no payment webhook.
4. **The "just talk" promise breaks hardest at telephony.** v1 is bring-your-own-carrier only. The client opens and KYCs its own Plivo, Vobiz or Exotel account, files DLT/A2P and requests CNAP. Sarvam and Bolna rent Indian numbers inside their product [O]. On user flow and convenience VP loses to them for the first production call.
5. **The beachhead and the default stack conflict.** The first presets are BFSI (1600, IRDAI 10-year records, LIC-style residency demands). The owner's default voice (Gemini) has no India residency. The India-resident stack is sold only in Premium at INR 6.49. KC5 (AI streaming on 1600) is still unknown, so the beachhead could be blocked outright.
6. **Cross-module contradictions are numerous.** They include disclosure placement, the Operator's name, tier boundaries, BYO billing, windows, caps and auto-revert autonomy. Each one is fixable, but together they show the modules were not reconciled.

## 1. The owner's ten senses x eight competitors

Cells give each vendor's state. The VP column gives the verdict against the best of them.

| Sense | Vapi | Retell | Bolna | ElevenLabs | Sarvam | Exotel | Synthflow | SquadStack | Best today | VP |
|---|---|---|---|---|---|---|---|---|---|---|
| UI | dense rows, clipped chrome | clean; tour covers canvas | cost header; banners eat 90/720 px | most polished, Cmd-K | India glyphs; blank pages, "0 ms" | 3 shells | U | U | ElevenLabs / Sarvam | **UNPROVEN** (no VP screen rendered; 4th taste attempt) |
| UX | Composer; click publishes | Conductor diffs | Ask Bolna beta | Architect alpha | **Genie runs campaigns** | none | Aurora (Ent only) | human CSM does it | Sarvam Genie; SquadStack | **MATCH**, beats on approval safety; W10 vs Genie unrun |
| Product design | QA depth, no contact | **flows, versions, live control** | 2 outbound systems | 313 settings | **attempt split, retry ladder** | 3 products | Flow Designer | bot+human+SMS canvas | Retell / Sarvam | **BEAT** on India objects; **LOSE** on flows and multi-agent |
| Cost (INR/min) | 12.5-17 | 8.3-13.6 | 5.7-6.1 (1.75-2 ent [V]) | 8.2-8.9 | **3.4-3.9** whole-min | quote | 15-26 | **2-5 [V]** | Sarvam / SquadStack | **BEAT** on 30-90 s calls only; **LOSE** at whole minutes and to claimed floors |
| Speed | 2.32 s, 35% collisions [M] | U | ~1.4 s floor [I] | 3.75 s, **3% collisions [M]** | 3.1 s demo [M] | U | U | 0.8 s [V] | ElevenLabs on talk-over | **LOSE** today: 15-42% cut-ins [M]; Natural ~2.2 s handset [C] |
| User flow to production | no Indian CLI | Persona wall, US numbers | **in-product India numbers** | import-only | **rent Vobiz in product** | KYC 1-3 days | gated | ~2 weeks | Sarvam / Bolna | **LOSE** (BYO only; 1600 7-14 business days) |
| Convenience | BYO everything | USD, IST-night support | USD wallet | AI-only support | **Genie + numbers + UPI** | sales-gated | sales-gated | **managed** | Sarvam / SquadStack | **MATCH** |
| Usability | silent disabled | silent disabled | reasons on fields | **explains every setting** | **inline fix** | toasts | raw exceptions | U | ElevenLabs / Sarvam | **BEAT** on rules; overload risk |
| Vibe | US voices | 0 Indian voices | romance voices in list | **best voice** | **199 Indic voices** | none | English-biased | passes as human | ElevenLabs / Sarvam | **LOSE** on raw voice; **BEAT** on honesty |
| Results | codes only | codes; AI QA meter | hidden judges | evals | disposition model | mislabelled outcomes | judges | **outcome-priced, human hand-off [V]** | SquadStack | **UNPROVEN** |

**Feature areas (short).**

| Area | Verdict |
|---|---|
| Compliance; campaign engine; call page; live ops | Beat on paper. Nobody else has them. |
| Memory | Loses on timing: Retell ships today, VP's is late v1 or v2. Wins on design. |
| Learning | Wins on statistics, but the owner's wish is weakened (see §3). |
| Languages | Loses in v1: Sarvam has 11 Indic languages, SquadStack 9 [V], VP 3 modes. |
| Builder flows, multi-agent hand-off, text-channel agents | Missing. |
| Developer depth: custom LLM endpoint, generic SIP, provider breadth | Loses to Vapi. |
| Omni-channel | Loses in v1 to Synthflow's voice+SMS+WhatsApp memory. |
| API/MCP | Match on plan, but the registry already misses tools (§4). |
| Human support in IST | A promise, and uncosted. |

## 2. Dimension by dimension: where the claim breaks

**UI.**
- No VP screen exists yet. The proof plan compares a VP prototype with *static 1280 px screenshots* of incumbents. Motion, phone width and real call pages were never observed for them (design-language §1 says so). That is not a fair test.
- The owner asked for "amazing ... animation design" (req-37). The design-language module bans decorative motion and confetti and limits motion to a 7-item catalogue. That is defensible, but it may read as austere to an owner who rejected three earlier looks.
- The Operator is "VP" in the spine and workspace, but "Saarthi" in design-language. Shell widths also differ: rail 224 vs 216, panel 400 vs 360, Today thread 440.

**UX.**
- The card/approval model is the best design in the set. But chat setup is parity: 5 of 6 dashboards ship a copilot (WT finding 8).
- W10's kill condition (Sarvam Genie completes T2-T6) has not been tested.
- The real competitor for "just talk" is **SquadStack's human CSM**. A buyer who wants the work done for them talks to a person who does everything, telephony included. VP's Operator stops at every carrier, KYC and webhook step.

**Product design.**
- The India objects are a genuine lead: contact, identifier, consent ledger, suppression, category-first campaign, run manifest.
- **There is no conversation-flow or graph layer and no agent-to-agent hand-off.** Retell has 15 node types, Bolna has graph agents, ElevenLabs has workflows and Synthflow has Flow Designer.
- The brief + ledger model works for one-goal service calls. It is untested for branching jobs: booking with slot search, multi-step identity checks, IVR-like menus.
- The owner set "parity is the floor" (req-51), so this needs either a minimal stage/condition layer or a measured task proving the brief handles branching.

**Cost.**
- On the rate cards, INR 3.49 per second wins on 30-90 s calls (economics §2.3 [C]). It does not win everywhere:
  - Sarvam Business at 3.00 + 0.40 is INR 0.09 cheaper on whole-minute calls;
  - SquadStack claims INR 2-5 and Bolna enterprise INR 1.75-2 [V];
  - req-41 (INR 2) is missed at launch.
- **The BFSI beachhead needs residency.** The India-resident stack is a *Premium* option at INR 6.49 (economics tiers), so for the first segment VP is about 1.9x Sarvam.
- **BYO billing contradicts the headline.** The rate card says "telephony included, per-second, VP absorbs carrier pulse" (`economics-platform-defaults.json` rate_card). Trust-telephony §3.1 says that under BYO "the carrier bills the tenant directly". In v1 every tenant is BYO, so VP cannot absorb a pulse it never pays, and the client gets two bills.
- The margin table (38% now, 28% in 2027) leaves out several costs:
  - the Operator's brain (fair use 200 turns a day, at about INR 0.6 per turn);
  - the free INR 200/day test budget for 14 days, plus INR 300 trial credit, per sign-up;
  - human support with a reply under 2 h in IST;
  - synthetic monitoring at INR 12-36k a month;
  - dispute handling;
  - preference memory, which sits in Base.
- **Pricing per connected minute at launch contradicts a confirmed rejection** (`rejected.2026-10-17.per-minute-launch`). The economics module lists that node as "avoided". It was not re-run under self-serve scope, and no supersedes edge exists.

**Speed.**
- The voice module is honest: every VP stack cuts in on 15-42% of turns [M]. ElevenLabs collides on 3% [M]. Natural is predicted at about 1.86 s server and about 2.2 s at the handset [C], against VP's own 1.5 s budget and W3's "0.3 s below the best incumbent".
- Bolna's code floor is about 1.4 s [I]. So on the owner's preferred voice VP is slower than at least one India-hosted incumbent by design.
- The design ships the slow preset as the default ("owner leans to Gemini TTS") and treats speed as a display problem: the panel says plainly that it costs 0.5 s.
- req-11 says "faster than competitors". That is not honoured.

**User flow.**
- Browser call under 3 minutes: plausible, and good.
- **W7 has been redefined into a vanity metric.** It now means ringing the client's own verified phone from VP's trial line. Bolna and Exotel also ring verified numbers in trial. "None reached a ring" (WT finding 4) is an artefact of a research pass that placed no calls and spent nothing. It is not evidence that competitors cannot do it.
- The step that matters is the first call to a real customer from the tenant's CLI. That needs a tenant carrier account plus KYC. For 1600 it takes about 7-14 business days via a telemarketer registered in Mumbai or Karnataka (REG-22/23). req-39 (onboard in 30-60 minutes) fails for the very segment chosen first.

**Convenience and usability.**
- The client is shown, and asked to act on, a long list of internals:
  - evidence grades, n and as-of on every number;
  - judge calibration ("Trusted at 0.90, Wilson lower bound 0.80, 50 paired calls", rated by the manager in a keyboard flow);
  - "What she tracks" precision badges;
  - ms sliders and Hindi lexicons;
  - L0-L4 badges, shadow A/A, MDE, "under-powered: ~640 more calls";
  - A0-A3 autonomy; 10 card types in 9 states;
  - run manifests and data passports.
- That is right for the developer and compliance personas. It is wrong as the *default* for the spine's first persona: an owner on a phone, in Hinglish, running a 10-500 person firm.
- There is no Owner/Expert split, so the design is two products in one shell.

**Vibe.**
- "Voices chosen by ear" is the right method, but the catalogue lists only Gemini, MAI and Sarvam voices. ElevenLabs Flash/v3 and Cartesia are not rows, although `directive.2026-10-18.provider-open` allows any provider chosen by measurement. So "better voice than ElevenLabs" is impossible by construction.
- The dedicated brand voice is Premium/v2, and Custom Neural Voice approval is unverified.
- **Honesty is a real vibe advantage** over SquadStack (passes as human) and Sarvam's demo (claimed human 6/6 [M]).

**Results.**
- The north star is cost per *earned* outcome, verified by a webhook or CRM field. Small and mid insurance intermediaries usually have neither: the insurer collects the premium and the broker sees it later in insurer MIS. The Outcomes screen offers only "Wire payment webhook" or "Map CRM field".
- So for most v1 tenants the headline will read "AI guess" or "not measured" for months.
- Holdouts for health and life are never powered below about 25k due a month (SY2 §4). AI-vs-human persuasion parity is assumed at 0.5-1.05. Third-party data shows AI collectors win 21 pp fewer promises (L5).
- **Zero buyer interviews exist** (`data/discovery/` absent). The persona, presets and tiers are inferred from vendor teardowns, not from buyers.
- SquadStack sells the result itself (success fees, human hand-off). VP sells instruments for measuring it.

## 3. Owner requirements, item by item (failures only; the rest are honoured)

| req | Status | Why |
|---|---|---|
| req-01 voice is THE core | weakened | voices are rented; ElevenLabs is conceded; no round-2 human ratings; brand voice only in v2/Premium |
| req-08 brain better than industry | weakened | the judged-best brain (3.8 Flash, 2.0 s first token) is too slow live; the "second brain" is a v2 experiment |
| req-10 regional language and accent | contradicted for v1 | Tamil, Telugu, Kannada, Marathi, Bengali and Gujarati come in v2; dialect is opt-in, v2/v3 |
| req-11 faster than competitors | contradicted | Natural misses the budget; 15-42% cut-ins |
| req-12 relational continuity | weakened | v2; the 1,200-byte brief is smaller than Retell's 2,000-character brief (Devanagari is 3 bytes per char) |
| req-13/14/17 just talk, agents do it | weakened | breaks at carrier account, KYC, DLT/A2P, CNAP, webhook wiring, staffing the hand-off desk and GST/TDS |
| req-19 pre-sale and "predictions" | weakened / missing | pre-sale waits for wave 2; surveys wait for counsel; "predictions" is designed nowhere |
| req-22 every recording | weakened | Base keeps 90 days; the 10-year IRDAI retention is unpriced |
| req-23 feedback loop | weakened | v2, after counsel |
| req-28/29/31 any data, omni-channel | weakened | v1 takes CSV, XLSX, Sheets, API, payments and one CRM; WhatsApp, SMS, email and app events come in v2; scanned or PDF lists are unsupported |
| req-34 self-learning call 101 | weakened / copy contradicted | every change needs a tap; slow fixes need ~600-1,200 calls; "self-learning" copy is banned below L4, a level most tenants never reach |
| req-37 animation design | at risk | motion is minimal by policy |
| req-38 better in every sense | contradicted | §1 tally: 3 beat, 4 match or unproven, 3 lose |
| req-39 onboard in 30-60 min | contradicted for BFSI | 1600 takes ~7-14 business days; Plivo 10-digit KYC time is unknown |
| req-41 about INR 2 | contradicted at launch | Base is INR 3.49; INR 2 is a scale-stage ladder |
| req-43 cheaper and better | weakened | cheaper only on short calls, and only on rate cards |
| req-45/46 real results | unproven | outcome verification is unavailable to SMB buyers; no buyer research |
| req-51 parity floor | weakened | missing flows, multi-agent hand-off, text-channel agents, generic SIP, BYO/custom LLM; Base has 10 concurrent calls vs Retell's 20 free |
| req-57 CRM layer | contradicted | spine: "VP is not a CRM" |
| req-67 web, Telegram and WhatsApp deployment | missing | WhatsApp appears only as a follow-up template channel; there is no Telegram channel |

## 4. Where the design is generic, copies without improving, or inflates

- **"Beyond everyone" is inflated.** There are about 125 "beyond" items across 9 modules, unranked. Many are table stakes in SaaS: Cmd-K (ElevenLabs has it), HMAC webhooks (ElevenLabs), scoped keys, audit logs, dry_run, a refund policy, "no per-line fee" (Retell gives 20 lines free), a sound-cue timbre. This dilutes the 3-5 wedges that matter: the India layer, the why-allowed and failure trace, the predicted gap, approval binding and the fast lane.
- **Copied without real improvement:**
  - Exotel's version pill;
  - Sarvam's attempt/interaction split;
  - Vapi's predial hook;
  - Retell's transfer modes. The Hinglish spoken brief is the only addition.
- **Generic analysis:** summary, sentiment and objections are what every vendor does. The improvement is verified spans, which is real but invisible to buyers.
- **Spine accuracy slips:**
  - Bolna's "hidden 500 + 900 ms hold" is shown as two sliders (WT bolna 16), and the dashboard creation path is unproven.
  - "None reached a ring" is used as competitor weakness when it is a research limit.
- **W10 parity is already broken in the spec.** Campaigns §13 lists `campaign.preview_schedule`, `campaign.test_row`, `followup.rule.set`, `inbound.route.set`, `attempt.explain` and `attempt.retry_unknown`. None is among the 80 tools in `data/blueprint/workspace-tool-registry.json`. Also without tools:
  - ledger-pack approval;
  - turn-policy and lexicon edits;
  - monitor and alert routing;
  - refund, dispute and invoice-mode switch.

## 5. Contradictions to resolve before anyone builds

1. **Disclosure placement** has four versions:
   - voice: turn 1 checks the name; in turn 2 the AI line comes *before* the useful fact (`voice-module-defaults.json` OPENING);
   - trust RD1: "first breath carries brand name plus one AI clause";
   - campaigns launch card: "once, after the useful opening";
   - workspace voice-card sample: opens with the AI line.

   RD1 also re-offers the disclosure if the caller talks over it, while voice R4 drops unprompted repeats. This is the owner's most sensitive rule (req-47), so it needs one spec.
2. **Tiers.** Economics puts preference memory in Base. The memory-omni screens say "Memory is in Plus".
3. **Auto-revert.** Learning makes the fast-lane revert A3. The spine says publish always needs A2, and the registry has no revert verb.
4. **Windows.**
   - Campaigns' T3 accepts a cross-midnight service window, but its own outer band is 08:00-21:00 and trust sets quiet hours 22:00-07:00.
   - A person's requested time may reach 07:00-08:00 or 21:00-22:00 in trust, but must stay "inside the outer band" in campaigns.
5. **Caps.**
   - API key default: INR 2,000/day (economics) vs INR 5,000/day (trust).
   - Trial calls: "5 rings/day" (workspace) vs "20 calls per number per day, 5 numbers" (trust) vs "up to 10 calls" (economics).
6. **BYO billing** (see §2 Cost).

## 6. What would make the claim true, in order

1. **Fix the first production call.** Before locking v1 scope, get carrier answers in Phase 0 (the KC5 quote round): sub-account or ISV provisioning so VP fills KYC from the Brand step and rents in the tenant's name inside the product. Recruit at least one non-BFSI design partner on a declared 10-digit or 1601 number, in case 1600 streaming fails.
2. **Default to a stack that wins on speed and residency** (Fast or Indic) until Natural passes the handset battery. Price the India-resident path in Base for BFSI presets.
3. **Make results verifiable without developers:**
   - a paid-list re-upload or Sheet column as a verified source;
   - an insurer-MIS parser;
   - manager confirmation at a lower grade;
   - interim result metrics that need no integration: promise rate, callbacks booked, agenda done.
4. **Put the best voices in the race.** Add ElevenLabs and Cartesia TTS as measured catalogue rows in round 2, so "by ear" can actually select the best voice.
5. **Reconcile the modules.** Use one defaults source of truth (trust owns windows and disclosure; economics owns caps and tiers), a CI check across the defaults JSONs, and a registry rebuilt from every screen.
6. **Add Owner and Expert modes.** Owner mode hides statistics and internals by default.
7. **Close the parity holes or justify each with a measured task:** a minimal stage/condition flow layer, agent hand-off, generic SIP, a custom LLM endpoint, and five more Indian languages in v1.
8. **Ask the owner** about req-34 copy and a bounded "standing approval envelope" for learned changes, so "self-learning" can be said truthfully. Re-run the per-minute rejection under self-serve scope and log a supersedes edge.
9. **Cut v1 to one thin journey** (`rejected.harvest.19`): one preset, one carrier, hear → list → launch → results. Ship it before ElevenLabs' hidden campaigns product goes GA (forecast by 2027-01-31).
10. **Run 10-15 buyer interviews** before the persona and the tiers are frozen.
