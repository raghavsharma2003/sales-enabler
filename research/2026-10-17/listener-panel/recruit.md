# Recruiting the v2 panels (renewal calls; 60+ first), cheaply and ethically

For the owner and the regional coordinators. It goes with `protocol.md` v2.0: section 2 there sets eligibility and
quotas, section 8 sets pay. v1 is kept as `recruit.round1.md`.

Nothing here has been done. Every organisation type below is a suggestion, and no one has been contacted. Prices are
estimates, not quotes.

## 1. The short version

| panel | analysed | recruit | where people come from | coordinator |
|---|---|---|---|---|
| `hindi_60plus` (E links) | 48 | 56 | Hindi belt. At least 2 districts in UP or Bihar, plus Delhi NCR and one of MP or Rajasthan. At least 25% aged 70+. At least 60% from policy-holding households. Mostly kiosk sessions | one person with senior-citizen and community networks (Lucknow, Patna or Delhi NCR) |
| `hindi_18to59` (H links) | 36 | 42 | same districts. At least 12 aged 45-59 | the same coordinator, or a second one |
| `tamilnadu` (T) | 36 | 42 | Madurai, Coimbatore, Tiruchirappalli, Salem, Chennai. At least 30% aged 60+ | one person in Madurai or Tiruchirappalli |
| `maharashtra` (M) | 36 | 42 | Pune, Nashik, Chhatrapati Sambhajinagar, Kolhapur. At least 30% aged 60+ | one person in Pune or Nashik |
| optional `bihar` (B) / `outgroup` (O) | 30 / 24 | 36 / 28 | as v1 | as v1; run only after the four above |

- **The two Hindi strata are separate links.** E links are for people aged 60 or older; H links for people aged 18-59.
  The page screens out anyone whose age does not fit the link. Give the person the other link instead; it costs them
  about 2 minutes.
- **The cheapest workable model** is still one paid local coordinator per panel who:
  - recruits through their own and their community's networks;
  - issues single-use links one person at a time;
  - runs kiosk sessions for older listeners;
  - tracks quotas daily and pays by UPI.
- **Cost:** about ₹1.21-1.54 lakh for the main four panels, including the pilot, retest, reviewers and voice talent
  (`protocol.md` §8).

## 2. Channels, ranked by cost and control

1. **Local coordinator plus personal and community networks.**
   - Use the same rules as v1: at least 3 seed networks per panel, at most 25% of a panel from one group, and lecturers
     recruit outside their own classes.
2. **Community organisations, now the main route for 60+.**
   - Which: senior citizens' associations and day-care centres, pensioners' associations, residents' welfare
     associations, temple, gurdwara or community halls, and self-help-group federations (often the mothers and
     grandmothers of members).
   - How: run **kiosk sessions** (section 6). Ask the organisation's permission, and offer nothing beyond each
     listener's own payment, so the organisation has no reason to pressure members.
3. **An ethical digital-work platform** with an Indian-language rural workforce (for example Karya). Use it as a
   top-up for 18-59 only: platform workers are rarely 60+. Check its terms and that it pays at least ₹250.
4. **A small field market-research agency**, as the fallback when a quota cell will not fill (for example 70+ women in
   villages). Get a per-complete quote that passes the full ₹250 to the listener; no coaching.
5. **Online consumer panels:** only to top up urban 18-44 cells. Never for 60+ or village cells.

**Do not:**
- buy phone lists, cold-call or SMS-blast;
- recruit sales prospects, customers or their staff;
- recruit through anyone with power over the listener;
- post a link in a group.

**New in v2:** do not recruit through an insurance agent, broker or bank, even though they know many policy-holders.
Their customers may feel obliged, and the study must not look like a sales or renewal contact.

## 3. Step by step

**Owner, before recruiting** (about 1 week, overlapping):
1. Finish the protocol §3.5 actions: M1 (listen-checks), M7 (UI review) and M8 (`CONFIG` in `app.js`). The page will
   not start without M8. If possible, also M3, M4 (human references) and M6 (competitor captures).
2. Build, bundle and host the page (`protocol.md` §10).
3. Sign a one-page agreement with each coordinator (section 5).
4. Make the link sheets per stratum, for example
   `python3 build_plan.py --links hindi_60plus 1 70 --base https://HOST/listener-panel/ > E-links.csv`. Make a
   separate H sheet. Each coordinator gets only their own sheets.
5. Run the pilot: 4 per main panel, with at least 2 of the 60+ pilots in assisted kiosk mode. Hold the feedback calls,
   fix, amend and freeze (`panel-predictions.md` §6-8).

**Coordinator, during fielding** (2 weeks):
1. Send the invitation (section 4). People who are interested reply to you directly.
2. Ask the short eligibility questions in your own words:
   - age (to pick the E or H link);
   - mother tongue and home district;
   - no telecalling, BPO or AI work in the last 12 months.
3. Send the **next unused link of the right stratum**, in order (E001, E002, ...). Order matters for counterbalancing.
4. When the answers arrive:
   - check the completion code;
   - save the file named by pid;
   - pay within 72 hours;
   - mark the quota sheet.
5. Each evening, update the quota sheet and steer the next day toward short cells. Typical short cells: "70+ women",
   "village 60+", "no household policy".
6. Stop when the owner says the stratum has its analysed target (`analysis.py --quality-only`), or when 1.25× the
   target has completed.

## 4. Invitation message (adapt; do not mention voices, pace, AI or the hypothesis)

English:

> Hello! We are running a short listening study for a company that makes phone systems. You listen to short recorded
> phone calls about insurance renewals from made-up companies, on a phone with earphones, and answer simple questions.
> It takes about 25 minutes and pays ₹250 by UPI when you finish. Nobody will ask you for money, an OTP, bank details
> or policy numbers, and no payment link will be sent to you. You must be 18 or older. It is not for people who work in
> telecalling, call centres or AI companies. Interested? Reply to me and I will send you your own link, or I can bring a
> phone to you.

Hindi:

> नमस्ते! हम फ़ोन सिस्टम बनाने वाली एक कंपनी के लिए सुनने का एक छोटा अध्ययन कर रहे हैं। आपको फ़ोन पर, ईयरफ़ोन लगाकर,
> काल्पनिक कंपनियों की बीमा रिन्यूअल से जुड़ी कुछ छोटी रिकॉर्ड की हुई कॉल सुननी हैं और आसान सवालों के जवाब देने हैं।
> इसमें लगभग 25 मिनट लगते हैं और पूरा करने पर UPI से ₹250 मिलते हैं। कोई आपसे पैसे, OTP, बैंक की जानकारी या पॉलिसी
> नंबर नहीं माँगेगा, और आपको कोई पेमेंट लिंक नहीं भेजा जाएगा। उम्र 18 साल या उससे ज़्यादा होनी चाहिए। टेलीकॉलिंग,
> कॉल सेंटर या AI कंपनियों में काम करने वाले लोग इसमें भाग नहीं ले सकते। रुचि है? मुझे जवाब दें, मैं आपका अपना लिंक भेजूँगा/भेजूँगी,
> या फ़ोन लेकर आपके पास आ सकता/सकती हूँ।

Tamil and Marathi coordinators write their own version from the English. The message names insurance renewals but not
what is compared (voice type, speed, the safety sentence, languages). The debrief explains those.

## 5. Coordinator agreement: what it must say (one page)

As in v1 §5: scope, a fixed fee, no coaching, conflicts, two separate sheets (quota and payment), deletion of payment
data and chats 30 days after the last payment, daily reporting, withdrawal by pid. v2 adds three things:

- **Strata.** Issue E links only to people aged 60+ and H links only to people aged 18-59. Record the stratum in the
  quota sheet.
- **Scam questions.** If a listener asks whether this is a scam, say plainly:
  - it is a research study;
  - it will never ask for money, an OTP or bank details;
  - they can stop at any time.
  Never ask for policy details. Never send any link other than the study link.
- **Kiosk hygiene.** Wipe phones and earphones between listeners. Use one phone per listener. No coordinator comments on
  the voices.

## 6. Reaching older (60+, 70+), rural and low-literacy listeners

These are the cells the wedge depends on. Self-serve online recruitment misses them.

- **Kiosk sessions are the default for 60+.**
  - Bring 2-3 Android phones with **wired** earphones (₹300-500 each), or over-ear headphones for anyone who finds
    earbuds uncomfortable.
  - Use links with `&mode=kiosk&assisted=1`. Add `&big=1` for larger text, or let the listener tap "A+" on the first
    screen.
  - Seat listeners apart, in a quiet room. Hold daytime sessions.
- **Assisted mode.**
  - The coordinator may read on-screen text aloud word for word, and may operate the buttons on the listener's
    instruction.
  - The coordinator never paraphrases, explains, or reacts to a voice, and never repeats what a caller said.
  - The session records `assisted`.
- **Hearing.**
  - Do not exclude people who say they have difficulty hearing on calls. They are real renewal customers, and the page
    records it as a covariate.
  - If someone uses a hearing aid, let them listen through their usual setup (earpiece or speaker). They pick that in
    the "How are you listening?" question.
  - The sound check still has to pass.
- **Breaks.** A 60+ listener may take a short break between parts (after the sound check, or after part 2). The page
  resumes where they left off. Comprehension cards shown again after a reload are flagged and their answers dropped.
- **After each kiosk day:**
  1. open `index.html?coordinator=1` on each phone;
  2. tap "Export all (JSON)";
  3. save to the answers folder;
  4. delete the sessions from the phone.
- **Pay on the spot by UPI** after the completion code. Where the listener has no UPI, pay a family member's UPI at the
  listener's request, or give a recharge of equal value. Record which.
- **Women listeners:** a woman coordinator or co-coordinator where expected.

## 7. Ethics checklist (all must be true before the first main-panel invitation)

- [ ] `CONFIG` holds a real legal name and a working contact. The contact is monitored for the 12-month retention period.
- [ ] Consent c3, the questions and the debrief have been reviewed and back-translated in every language (M7).
- [ ] The pilot is done. Nothing confused 2 or more listeners. The 60+ median session is 30 minutes or less, or the
      §9 cut has been applied.
- [ ] Coordinator agreements are signed, including the v2 strata and scam-question clauses.
- [ ] Payment within 72 hours is funded. Every completed session is paid.
- [ ] Adults only. Nobody is recruited through someone with power over them, or through an insurance seller.
- [ ] The scripts carry no threat, deadline pressure or collections content. The lapse-revival turns state facts only.
- [ ] Human-talent consent forms (no use for training or cloning a voice) are signed before any human clip is
      ingested.
- [ ] Each competitor platform's terms were checked before its clips were captured.
- [ ] Deletion dates are set: payment sheets and chats 30 days after the last payment; answers 12 months after the
      study ends; talent recordings 12 months after the study ends.

## 8. Budget (estimates, not quotes)

| item | hindi_60plus | hindi_18to59 | Tamil Nadu | Maharashtra | total (main four) |
|---|---|---|---|---|---|
| listener payments (₹250 × recruits) | ₹14,000 | ₹10,500 | ₹10,500 | ₹10,500 | ₹45,500 |
| coordinator fee | ₹15-20k (kiosk-heavy) | ₹8-12k | ₹10-15k | ₹10-15k | ₹43-62k |
| kiosk phones and earphones, recharge tokens, data | ₹4,000 | ₹1,000 | ₹2,000 | ₹2,000 | ₹9,000 |
| pilot (4 × ₹350) and retest (about 5 × ₹100) | ₹1,900 | ₹1,900 | ₹1,900 | ₹1,900 | ₹7,600 |
| **subtotal** | **₹35-40k** | **₹21-25k** | **₹24-29k** | **₹24-29k** | **₹1.05-1.24 lakh** |

- Add ₹10-20k for native reviewers (M1, M3, M7) and ₹6-10k for two Hindi voice talents (M4). The total is about
  ₹1.21-1.54 lakh, as in `protocol.md` §8.
- The optional Bihar and out-group panels add about ₹30-40k.
- **Pay level:** ₹250 for about 25 minutes (₹10/min), as in v1. The reasoning is the same: generous next to local daily
  wages, it keeps attention up, and single-use links and screening guard against fake eligibility.

## 9. Fraud and quality controls

As in v1 §9:
- single-use pid links;
- a screening re-check, now including the age stratum;
- three hidden catch trials;
- a speeding rule;
- a duplicate-pid rule;
- device-sharing flags (not exclusions);
- checksum-verified completion codes.

No identity checks, location checks or voice recording. Never withhold pay for failed catch trials.

## 10. Timeline

| days | step |
|---|---|
| 1-5 | Owner: M1, M7, M8, hosting, coordinator agreements; human recordings and competitor captures in parallel. Coordinators: line up seed networks and kiosk venues (senior-citizen groups for 60+) |
| 6-8 | Pilot (16), feedback calls, fixes, amendments, freeze |
| 9-22 | Fielding: about 3-5 completes per panel per day (60+ kiosk days run 6-10 listeners per venue); quota steering from day 3; `--quality-only` check at about 20% |
| 23-30 | Retest (10%), final payments, analysis. Coordinators delete payment data by day 60 |
