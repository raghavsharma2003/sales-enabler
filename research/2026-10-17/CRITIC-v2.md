# VP research: round-2 red-team (CRITIC-v2)

Date: 2026-10-17. Role: red-team of `SYNTHESIS-v2.md`. Not committed. No spend.

**Inputs.** v2, `ledger.json`, `CRITIC.md`, the round-2 verifiers, the founder kit, the listener panel, and the round-2 data and code.

**Checked myself:**
- REN-24, RAW-03 and REG-31 against primary text;
- the concept card;
- a KC1 Monte Carlo (`/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/redteam/kc1_power.py`).

## 0. Bottom line

Round 2 closed most research gaps, honestly. The weak point is now the fit between v2's decision and Monday's instrument:
- the concept card tests a different operating model;
- KC1 is a coin flip that leans toward the most contested buyers;
- the economics rest on assumed commission rates and on a live IRDAI consultation whose structural half v2 never read.

## 1. Round-1 critic items

| status | items |
|---|---|
| Closed | A1, A2 (desk; residuals to counsel), A4, A6, A7, A9, A11 (blob plus sha256 manifest), A16, A17, A18, A19 except the visual report |
| Closed, unverified | A5 (Sarvam plus 3 demos), A14, A15 |
| Mostly closed | A10: `renewal_model.py` still uses stale scale COGS, and life has not been re-run at observed commission. A13: research done, but no human has heard the 210 clips, and the human and competitor arms are not recorded |
| Open | A3: pain is one self-reported intermediary plus a motor stock measure, and commission by line is assumed. A8: round 2 is not logged to `context/` (placeholder `open.2026-10-17.round2` only). A12: see N1 and N2. Deliverable 11. The H4 kill test. Owner items B1-B5 and B8-B12 |
| Moot | B6 (ACS), B7 (per-minute launch margin) |

**Two provenance gaps:**
- No round-2 `findings.md` is on disk, which repeats round 1's failure.
- 51 of 112 round-2 ledger rows are unverified. That includes all 16 RAW rows, 12 of 13 CMP rows and 4 of 5 FK rows.

## 2. Newly opened

**N1. The concept card contradicts the operating model.**
- `interview-guide.md` §13.1 says: "A service, **run by us**, phones the customers…".
- v2 §0 says VP is software the intermediary operates on its own 1600 number, "not a managed telemarketer".
- The only uncontested gap v2 found is a **managed** per-renewal service for small and mid intermediaries [CMP-13]. The regulatory design and the competitive gap point in opposite directions, and v2 does not say so.

**N2. KC1 cannot decide much.**
- IMFs (stratum C) carry 0.524 of the firm weight. v2 excludes them from pilots, and desk evidence predicts they fail [REN-17].
- If every IMF fails, the maximum p̂_firm is 0.475.
- Simulated with A/B at 60-70% and C at 0-10%: P(fire) is 0.45-0.55 at 3-5 interviews per stratum. With every stratum truly at 40%, it still fires 0.30-0.41 of the time.
- The plan's own prior is 0.60 that it fires. The likeliest outcome is therefore "move to larger strata" (D). That is where Policybazaar uses Ringg, TurtlemintPro sells renewal reminders, and PB earns about 80% contribution in-house [CMP-13, CMP-17, REN-22].

**N3. The structural half of the IRDAI consultation is unread.**
- The paper behind KC9 also proposes one IDE licence subsuming 8 licence forms, Bima Sugam and a Public Insurance Registry, clawback, a persistency-linked renewal escalator and "verified customer contact".
- v2 mentions none of these.
- A single licence would rewrite the rules the strata and operating model rest on: IMF reg 3(d), broker outsourcing and CA telemarketing.

**N4. No ceiling against self-serve AI.**
- ₹50 per car renewal is about ₹23.5 per AI minute [REN-07]. Self-serve renewal calling lists at ₹4-10 per minute [CMP-16].
- The model's buyer ceilings compare only against no calling and the buyer's own desk, and KC2 tests only "too low".

**N5. Car's "robust" lift ignores the call rule.**
- The model's 4W baseline is labelled a "re-quote market" (b0 0.45-0.75).
- Yet the AI gets the same persH (0.10-0.40) and parity (0.50-1.05) as every other line.
- Under "inform, confirm, hand off", the call cannot re-quote.

**N6. The venture stages are sized at loss-making prices.**
- S2 and S3 use ₹3-8 per minute (`expansion_sizing.py`).
- That is below the ₹5.88 launch COGS, and v2's own scale margin at ₹6-8 is −1% to +35%.
- The margin of the stage the investor case rests on is not shown.

**N7. The gap map is wrong on 140.**
- The Third Amendment's reg 21A proviso bars flagging CLIs "from 140xx series, 1600xx series, 1601xx series".
- Reg 34A(1) bars call-management apps from "tag, block or filter" on designated series. Users may still block on their own devices.
- So 1600 has no flagging advantage over alternate 1's 140, contrary to v2 §6.

**N8. The switch rule probably cannot fire in time.**
- It needs 10 *qualified* real-estate interviews by about 11-13.
- The plan has 9-11 real-estate *calls*, spread across Diwali.
- The default when the rule cannot be read ("hold insurance") is unwritten.

## 3. The three weakest links

1. **The buyer.** Remove the strata that cannot or should not buy, and little remains.
   - C cannot use telemarketers.
   - B is sized by a name heuristic, and NBFC CAs "mostly sell credit-linked cover to their own borrowers" (`strata.csv`).
   - A is 130-260 firms by assumption.
   - D already runs renewals in-house or buys them from incumbents.

   KC1 most likely routes VP to D, where v2's competitor map is densest. "Enough A/B firms have ≥ 1,000 due a month" carries the decision, and it is unmeasured.
2. **The offer is not one product.** The operating model (tenant software), the card being tested (a managed service), the differentiation (the managed gap) and the price (2-6× self-serve, on the line where the call rule removes the main way to win a save) do not line up. A Monday "yes" will not show that the v2 product sells.
3. **The economics rest on assumed commission and a live proposal.**
   - Commission rates are assumptions in every line [REN-01].
   - Desk productivity is unmeasured: P(AI cheaper) ranges from 0.00 to 0.94 depending on the costing method [REN-15].
   - Under the proposed caps (checked: IDE old-vehicle OD 10%, TP 2.5%, health renewal 5%), the car desk ceiling falls to about ₹27-32, against a ₹50 card and a ₹28 floor [REN-25].
   - N3 and N6 add further 2× swings.

**Still open, though v2 states it candidly: KC6 conflicts with KC10.**
- The passing 1.0 s is mostly the time to a 1-2-word acknowledgement (48/58 turns).
- gpt-4.1-mini gave content replies into the elderly 2.4 s pause 12/12, where gpt-6-sol gave "go on" prompts 12/12. But gpt-6-sol has no India SKU and was measured only from the EU.
- gpt-4.1-mini is listed Deprecated and may not deploy on the grant subscription.
- No configuration yet satisfies speed, turn-taking, India residency and model lifecycle together.

## 4. What the owner must know before Monday

1. **Settle N1 before the first call, as a logged deviation.** Either record that Monday tests the managed variant, or add a follow-up: "If the 1600 number and DLT were in your name and your team took the hand-offs, would your answer change?"
2. **Fix `interview-guide.md` §13.2 caveat 4.** It still says the car fee sits below the desk ceiling (about ₹27-32). ₹50 is above it.
3. **Make the caps question mandatory** (log it as a deviation). Comments close Sun 10-25. Also ask whether they are planning for a single IDE licence.
4. **Pre-register two things before any data:**
   - what "moving to larger strata" means, given D's competition;
   - the default if the real-estate switch test cannot be read by 11-13.
5. **Ask what AI-calling vendors have quoted them** (per minute or per renewal) (N4).
6. **For motor, ask how the last ten saves were won:** a reminder, or a re-quote (N5).
7. **Do not cite "Sarvam's agent claims to be human".**
   - CMP-07 is unverified, the automatic coder mis-scored it, and nobody has heard the recordings.
   - It is a demo persona, not a product claim.
   - Make no superiority claims.
8. **Keep the existing guardrails.**
   - Never tell anyone they are non-compliant on 1600.
   - Accept no due lists or recordings containing customer data.
   - Ask IMFs about reg 3(d) only to learn.
   - Life and two-wheeler are probes only (at observed commission, life's rule fee is ₹10, not ₹15).

## 5. Spot checks

| claim | method | result |
|---|---|---|
| REN-24 caps | read-primary (pdftotext excerpt) | **Confirmed.** Agents' caps are higher (health renewal 10%, old OD 15%), so the caps fall hardest on our buyers |
| RAW-03 (1600 cannot be flagged or tagged) | read-primary (Third Amendment) | **Confirmed**, but 140xx is protected too, and users can still block on their own devices |
| REG-31 (records in India) | read-primary (excerpt) | **Confirmed** as a rule on where records are kept ("data centres located and maintained in India"), not on where data is processed |
| KC1 power | computed (200k simulations per cell, seed 20261017) | See N2 |
