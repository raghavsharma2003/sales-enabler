# Recruiting 30-60 listeners per region, cheaply and ethically

This is for the owner and the regional coordinators. It goes with `protocol.md`: section 2 there sets eligibility and
quotas, and section 8 sets pay. Nothing here has been done. Every vendor and organisation type below is a suggestion,
and no one has been contacted. Prices are estimates, not quotes.

## 1. The short version

| panel | target analysed | recruit (complete sessions) | where people come from | coordinator |
|---|---|---|---|---|
| Bihar / East UP (Bhojpuri) | 48 | 56 | Siwan, Gopalganj, Saran, Bhojpur, Buxar, Rohtas; Ballia, Deoria, Gorakhpur, Ghazipur, Varanasi; at least 20% Bhojpuri migrants (Delhi NCR, Mumbai, Surat, Ludhiana) | one person based in Chhapra/Siwan or Patna, with village networks |
| Tamil Nadu | 48 | 56 | Madurai, Coimbatore, Tiruchirappalli, Salem, Chennai; migrants in Bengaluru | one person in Madurai or Tiruchirappalli |
| Maharashtra | 48 | 56 | Pune, Nashik, Chhatrapati Sambhajinagar, Kolhapur; migrants in Bengaluru, Hyderabad, Gujarat | one person in Pune or Nashik |
| Out-group Hindi | 36 | 42 | Delhi NCR, Haryana, west UP, Madhya Pradesh; must not speak or understand Bhojpuri | one person in Delhi NCR |

The cheapest workable model is **one paid local coordinator per panel** who recruits through their own and their
community's networks, issues single-use links one person at a time, tracks quotas daily, and pays by UPI. A coordinator
with good networks recruits a panel in 10-14 days. Expect about 15% of completed sessions to fail the exclusion rules,
which is why each panel recruits 56 to analyse 48.

**Cost at target size:** about ₹1.04-1.23 lakh for the four panels, including the pilot and retest (section 8). The
minimum viable panel (36 recruited, 30 analysed per region) costs about ₹80-90k.

## 2. Channels, ranked by cost and control

1. **A local coordinator plus personal and community networks.** These are WhatsApp community groups, neighbourhood
   and village contacts, and alumni or parents' groups.
   - **Who.** A college lecturer, an NGO or self-help-group field worker, or a retired teacher: someone people trust,
     who is not your employee or sales prospect.
   - **Strengths.** The cheapest channel, and the best reach into village/small-town, women and 45+ cells.
   - **Risk.** Everyone ends up from one social circle. Control it by using at least 3 different seed networks per
     panel and capping any single group at 25% of the panel.
   - **Lecturers.** They recruit **outside their own classes**: students may feel unable to refuse.
2. **Community organisations,** for older listeners and women. These include self-help-group federations, senior
   citizens' associations, residents' welfare associations and community halls. Run **kiosk sessions** (section 6)
   where the coordinator brings phones and earphones. Ask the organisation's permission and offer nothing beyond the
   listener's own payment, so the organisation has no reason to pressure members.
3. **An ethical digital-work platform with an Indian-language rural workforce,** for example Karya, which pays workers
   for Indian-language data tasks.
   - **Before relying on it, check:** its terms for third-party studies; that it can target by district and mother
     tongue; and that the worker's pay is at least the ₹250 in this protocol, not the platform's lower default.
   - **What fits.** Platform workers have often done many tasks, so screen out anyone who has done voice-rating or
     telecalling work (the page asks about it). Use the platform as a top-up, not the whole panel.
4. **A small field market-research agency** in Patna, Madurai and Pune, as the fallback when a quota cell will not fill
   (for example, 45+ women in villages). Ask for a per-complete quote that passes the full ₹250 to the listener. Check
   that the agency will use your single-use links and will not coach respondents.
5. **Online consumer panels,** only to top up urban, younger cells. They skew urban and English-speaking, and must not
   fill the 45+, village or below-graduation quotas.

**Do not:**

- buy phone lists, or cold-call or SMS-blast for recruits. Commercial calls to people who did not opt in run into
  TCCCPR and DPDP, and it would contradict the product's own consent principles;
- recruit your sales prospects, customers or their staff;
- recruit through anyone with power over the listener: employers, their own teachers, landlords;
- post one link in a group. Each person gets their own pid link by direct message.

## 3. Step by step

**Owner, before recruiting** (about 1 week, overlapping):

1. Finish the stimulus and text actions in `protocol.md` section 3.5:
   - **M1** listen-checks;
   - **M7** UI review;
   - **M8**: fill `CONFIG` in `app.js` with the legal name, contact and amount. The page will not start without it.
2. Build, bundle and host the page: `protocol.md` section 10.1.
3. Sign a one-page agreement with each coordinator (section 5).
4. Make a link sheet per panel: `python3 build_plan.py --links bihar 1 60 --base https://HOST/listener-panel/ > bihar-links.csv`.
   The coordinator gets only their own panel's sheet.
5. Run the pilot (3 listeners per panel, links with `&mode=pilot`), hold the feedback calls, fix, then freeze the
   protocol.

**Coordinator, during fielding** (2 weeks):

1. Send the invitation (section 4) through your networks. People who are interested reply to you directly.
2. Ask the short eligibility questions in your own words: mother tongue, home district, age 18+, no telecalling, BPO or
   AI work. The page screens again, so this step only saves people from wasted time.
3. Send the **next unused link** from the sheet, in order (B001, B002, ...). Order matters for counterbalancing. Mark it
   in the quota sheet.
4. When the answers arrive (a file or a pasted code on WhatsApp):
   - check that the completion code the listener tells you matches the one in the file;
   - save the file into the shared answers folder, named by pid;
   - pay within 72 hours;
   - mark the quota sheet.
5. Each evening, update the quota sheet and tell the owner which cells are short (for example "45+ women: 3 of 8").
   Steer the next day's recruiting to the short cells.
6. Stop issuing links when the owner says the panel has 48 listeners passing the exclusion rules
   (`analysis.py --quality-only`), or when 60 have completed.

**Owner, after fielding.** Run the analysis (`protocol.md` section 10.4). Make sure the coordinators delete payment
details and WhatsApp chats (section 7).

## 4. Invitation message (adapt; do not mention dialect, accent or the hypothesis)

English:

> Hello! We are running a short listening study for a company that makes phone systems. You listen to short recorded
> phone calls from businesses on your own phone, with earphones, and answer simple questions about them. It takes about
> 25 minutes and pays ₹250 by UPI when you finish. You must be 18 or older. It is not for people who work in
> telecalling, call centres or AI companies. Your name and number are not stored with your answers. Interested? Reply
> to me and I will send you your own link.

Hindi:

> नमस्ते! हम फ़ोन सिस्टम बनाने वाली एक कंपनी के लिए सुनने का एक छोटा अध्ययन कर रहे हैं। आपको अपने फ़ोन पर, ईयरफ़ोन
> लगाकर, कंपनियों की कुछ छोटी रिकॉर्ड की हुई फ़ोन कॉल सुननी हैं और उनके बारे में आसान सवालों के जवाब देने हैं। इसमें
> लगभग 25 मिनट लगते हैं और पूरा करने पर UPI से ₹250 मिलते हैं। उम्र 18 साल या उससे ज़्यादा होनी चाहिए। टेलीकॉलिंग,
> कॉल सेंटर या AI कंपनियों में काम करने वाले लोग इसमें भाग नहीं ले सकते। आपका नाम और नंबर आपके जवाबों के साथ नहीं
> रखा जाता। रुचि है? मुझे जवाब दें, मैं आपको आपका अपना लिंक भेजूँगा/भेजूँगी।

Tamil and Marathi coordinators write their own version from the English. A native speaker writing their own message
does better than a translation.

Why the message hides the purpose: if people know the study is about dialect, they answer what they think the study
wants. The consent tells them that some voices are computer-generated, and the debrief explains the dialect question.
That is the only blinding.

## 5. Coordinator agreement: what it must say (one page)

1. **Scope.** Recruit eligible adults for one panel, issue single-use links in order, track quotas, collect answer
   files, pay listeners, and run kiosk sessions if asked.
2. **Pay.** A fixed fee per panel (suggest ₹10-15k), plus listener payments advanced or reimbursed against a payment
   log. Do not pay coordinators per listener above the fee: per-head pay invites padding.
3. **No coaching.** Do not explain what the study is testing. Do not comment on the voices. In assisted kiosk sessions,
   read the on-screen text aloud word for word and nothing more.
4. **Conflicts.** No family members of the coordinator, and no more than 25% of a panel from one group or village.
5. **Data handling.** Keep two separate sheets:
   - the quota sheet (pid and demographic bands, no names), shared with the owner;
   - the payment sheet (pid, name, phone, UPI), kept by the coordinator only.

   Never put names or phone numbers in the answers folder. Delete the payment sheet and the WhatsApp chats with
   listeners 30 days after the last payment. Confirm the deletion in writing.
6. **Reporting.** Send quota counts daily. Report any complaint or withdrawal request to the owner the same day.
7. **Withdrawal.** If a listener asks to withdraw, send the owner their pid, and the owner deletes their file.

Under DPDP the owner is the data fiduciary and the coordinator processes data on the owner's behalf. This agreement is
the minimum written basis for that.

## 6. Reaching older, rural and low-literacy listeners

These cells (45+, village, below graduation) matter most for the wedge, because renewal-call customers skew older, and
they are the cells that self-serve online recruitment misses.

- **Kiosk sessions.** The coordinator brings 2-3 Android phones with wired earphones (about ₹300-500 each; wipe them
  between listeners) to a community hall or an SHG meeting. Use links with `&mode=kiosk&assisted=1`. One listener per
  phone at a time, seated apart.
- **Assisted mode.** The coordinator may read the on-screen text aloud, word for word, for a listener who cannot read
  comfortably. They never paraphrase, explain or react to a voice. The session records `assisted` and the analysis
  reports how many there were.
- **After each kiosk day.** Open `index.html?coordinator=1` on each phone, tap "Export all (JSON)", save the file to the
  answers folder, then delete the sessions from the phone.
- **Women listeners.** Where it is culturally expected, a woman coordinator or co-coordinator runs women's sessions.
  Hold daytime sessions in familiar places.
- **Pay on the spot by UPI** after the completion code shows. Some older listeners may not have UPI; then pay a family
  member's UPI at the listener's request, or give a mobile recharge of equal value. Record which.

## 7. Ethics checklist (all must be true before the first main-panel invitation)

- [ ] `CONFIG` holds a real legal name and a working contact. The contact is monitored for the 12-month retention period.
- [ ] Consent and questions reviewed by a native speaker in each language, and back-translated (M7).
- [ ] The pilot is done, and nothing in it confused 2 or more listeners.
- [ ] The coordinator agreements are signed, and each coordinator has read sections 4-6.
- [ ] Payment within 72 hours is funded. Every completed session is paid, including those excluded later.
- [ ] Only adults: the page ends under-18 sessions and stores nothing, and coordinators do not invite minors.
- [ ] Nobody is recruited through someone with power over them.
- [ ] The scripts contain no debt, health or collections stress (the six turns are sales, delivery and renewal reminders).
- [ ] There is a date for deleting the payment sheets and chats (30 days after the last payment) and the answers
      (12 months after the study ends).

## 8. Budget (estimates, not quotes)

| item | Bihar | Tamil Nadu | Maharashtra | Out-group | total |
|---|---|---|---|---|---|
| listener payments (₹250 × recruits) | ₹14,000 | ₹14,000 | ₹14,000 | ₹10,500 | ₹52,500 |
| coordinator fee | ₹10-15k | ₹10-15k | ₹10-15k | ₹8-12k | ₹38-57k |
| kiosk earphones, recharge tokens for sound-check failures, data | ₹2,000 | ₹2,000 | ₹2,000 | ₹1,000 | ₹7,000 |
| pilot (3 × ₹350) and retest (about 6 × ₹100) | ₹1,650 | ₹1,650 | ₹1,650 | ₹1,650 | ₹6,600 |
| **total** | **₹28-33k** | **₹28-33k** | **₹28-33k** | **₹21-25k** | **₹1.04-1.23 lakh** |

Add about ₹20-35k for native reviewers and voice talent if M3, M4 and M7 are bought in (`protocol.md` section 8).
**Minimum viable** (36 recruited per region panel, 30 out-group): listener payments ₹34,500, coordinators about
₹35-45k, other costs about ₹10k, so about ₹80-90k.

**Pay level.** ₹250 for about 25 minutes is ₹10/min. That is generous next to local daily wages: check the current
state MGNREGA rate as a floor reference. Generous pay keeps attention up and is fair for a task that needs earphones and
quiet. It also makes faking eligibility worth trying, which is why links are single-use, the page screens and checks,
and pids are issued one at a time.

## 9. Fraud and quality controls (and what is not done)

- **Built into the page and the analysis:**
  - single-use pid links;
  - a re-check of the screening rules;
  - three hidden catch trials;
  - a speeding rule;
  - a duplicate-pid rule (the first completion counts);
  - device-sharing flags (reviewed, not auto-excluded, because shared phones are normal);
  - a completion-code checksum, verified by the coordinator before paying and again by `analysis.py`.
- **Not done:**
  - identity verification;
  - location checks;
  - voice recording.

  These would cost listeners' privacy for little gain at this scale. The residual risk is that someone lies about their
  mother tongue. The coordinator's knowledge of their own network, and the open-text check, are the defence.
- **Do not withhold pay for failed catch trials.** Excluding a session from analysis is not evidence of bad faith, and
  disputes over pay would cost more than the ₹250.

## 10. Timeline

| days | step |
|---|---|
| 1-5 | Owner: M1, M7 and M8, hosting, coordinator agreements. Coordinators: line up seed networks and kiosk venues |
| 6-8 | Pilot (12 listeners), feedback calls, fixes, freeze |
| 9-22 | Fielding: about 4-6 completes per panel per day, quota steering from day 3, `--quality-only` check at about 20% |
| 23-30 | Retest (10%), final payments, analysis; coordinators delete payment data by day 60 |
