# Adversarial verification: lane l5-human-dialect

Verifier: independent subagent, 2026-10-17. Scope: the seven load-bearing claims handed over by the coordinator (the lane's report.md was not written; its content was in the lane agent's final message). Primary sources were re-opened (NBER PDF, Marketing Science PDF, Crossref record, MS Learn page, TRAI PDF, Hugging Face card). The lane's own data and code were re-run against the raw Apna crawl in the session scratchpad. No lane file except this one was edited. Nothing was committed.

Limits: the session's shared WebSearch budget ran out after the first search call. Every check below therefore uses direct fetches of primary URLs, DOI metadata (Crossref and OpenAlex) and local recomputation, not new searches. I could not re-run the live Azure `voices/list` or locales API calls, because that needs the vp key and I did not read secrets.

## Verdict table

| # | Claim (short) | Verdict | One-line reason |
|---|---|---|---|
| 1 | NBER w33669: AI collectors' gap comes from fewer and weaker commitments, not early hang-ups (9 pp / 12 pp / 31 s / 21 pp) | **weakened** | Every number matches the paper exactly. The causal framing goes further than the paper, which says the promise channel "may contribute"; humans also called about one more time per day. |
| 2 | Luo et al. 2019: disclosure cut purchases from 0.237 to 0.048, 56.3% hung up within 5 s, undisclosed bot about equal to proficient humans (0.251) | **confirmed** | Table 3 matches exactly (n=6,255; arms of 1,036 to 1,053). "2017-era" is the lane's inference: the paper was received 2019-03-01 and gives no experiment year. |
| 3 | Habel, Zawadzki, Freise (SSRN 7013259): disclosure no longer lowers conversion (n=1,337); AI trails humans (n=366); AI recognised regardless of disclosure (n=238) | **confirmed** (abstract level) | The Crossref record carries the full abstract and confirms all three statements and all three n. The DOI was registered 2026-07-20. Setting, country and effect sizes are still unverified. |
| 4 | Apna postings: Tamil required in 82.8% of Chennai and 91.0% of Coimbatore postings; 1 of about 460 Hindi-belt postings asks for a dialect; none asks for Bhojpuri | **weakened** (the Tamil figures are **refuted**) | The regex `\btamil\b` matches "Tamil Nadu" in Apna's "Work location" address. Without the state name the figures are 33.6% (121/360) and 24.4% (19/78). The "about 460" denominator cannot be reproduced. |
| 5 | Azure has bho-IN speech-to-text (fast transcription, custom speech) but no text-to-speech locale for any Hindi-belt dialect; 72 Indian-locale voices include only 2 ta-IN voices | **confirmed** (scope: Azure Speech locales) | The MS Learn page (ms.date 2026-09-09) shows bho-IN only under speech-to-text, custom speech and language ID, not under text-to-speech. There is no Maithili at all. ta-IN has only PallaviNeural and ValluvarNeural. The CSV contains 72 IN-locale voices. |
| 6 | Round-trip: bho-IN ASR recovers 11–12/13 Bhojpuri markers (recall 0.90–0.95 vs 1.00 for neutral); hi-IN ASR gives 7–11/13 | **weakened** | 11–12/13 depends on lenient equivalences, including counting Hindi "और" as Bhojpuri "अउर". Strict matching gives 8–10/13. The 0.90–0.95 is whole-turn token recall, not marker recall. One neutral clip scores 0.973. The stimulus is LLM-written and unreviewed, n=1 script. |
| 7 | Number series cannot infer dialect; MNP Bihar 1.47 M per month (about 1.35%); LID 20/20 on languages but only 2/6 Bhojpuri clips labelled bho-IN | **weakened** | The TRAI numbers are exact: 1,469,902 / 109,274,677 = 1.345%, and Bihar includes Jharkhand. But the 1.35% is mostly intra-circle porting, which does not change the series-to-circle mapping. The "20/20" test only presented two languages (Hindi and Tamil). "Cannot work" overstates: the series gives a coarse prior. |

## Reasoning per claim

### 1. NBER w33669 (Choi, Huang, Yang, Zhang, April 2025)

I re-downloaded the PDF from nber.org. In the introduction (pp. 2–3):
- "around one month past due ... AI callers is 9 percentage points less" (regression discontinuity).
- "NPV gap monotonically increasing to 12 percentage points by day 5" (randomised arm).
- "AI callers are not more likely to be hung up on within 10 seconds, but they have conversations that are 31 seconds shorter".
- "21 percentage points fewer borrowers promise to repay".

Section 1.3 says the AI speaks "with a synthetic voice which is easily recognized as not human" and that it was introduced in 2018. All of the claim's numbers are correct.

Overstatements:
- The abstract says "AI's lesser ability to extract promises that feel binding **may contribute**". The claim's "gaps come from fewer and weaker commitments" turns a suggested channel into an established one.
- The same paragraph reports that "humans call borrowers nearly one more time per day than AI callers". Call intensity is a further channel, which the call-level analysis removes by design.

Context the claim should carry:
- The AI was a scripted bot with seven response categories (Table 1), not an LLM.
- The data run from April 2021 to December 2023.
- The regression discontinuity covers debts of 300 yuan or less (about USD 42).
- Collections is a moral-obligation task. The authors themselves contrast it with the Luo et al. sales setting.

### 2. Luo, Tong, Fang, Qu 2019 (Marketing Science 38(6))

Re-read from the fox.temple.edu PDF. Table 3 ("Model-Free Results"):

| arm | n | purchase rate | hang-up rate |
|---|---|---|---|
| Underdogs | 1,053 | 0.049 | |
| Proficient | 1,042 | 0.251 | |
| Without disclosure | 1,044 | 0.237 | |
| Before conversation | 1,036 | 0.048 | 56.30% |
| After conversation | 1,044 | 0.110 | 4.50% |

The footnote defines a hang-up as an answered call terminated "within five seconds". The total is 6,255 attempted calls. The text calls the drop "79.7% (from 0.237 to 0.048)". All of this is confirmed.

The only quibble is "2017-era". The paper was received 2019-03-01 and accepted 2019-06-10, and it gives no experiment date: it says only "a Tuesday afternoon". Write "pre-2019 (experiment year not stated)" instead.

A retraction or replication check could not be searched because the budget was exhausted. I know of no retraction.

### 3. Habel, Zawadzki, Freise, SSRN 7013259

SSRN still returns 403 and OpenAlex has no abstract. However, **Crossref** (`api.crossref.org/works/10.2139/ssrn.7013259`) carries the full abstract. Created 2026-07-20; authors Habel (ORCID-authenticated), Zawadzki and Freise. It states:
- "A randomized field experiment (N = 1,337 customers reached) shows that disclosing an AI voice agent no longer reduces conversion rates relative to nondisclosure."
- "A second randomized field experiment (N = 366 customers reached) demonstrates, however, that AI voice agents still substantially underperform human sales agents ... sales process discipline".
- "an online experiment (N = 238) reveals that customers largely recognize AI voice agents regardless of disclosure".

This is confirmed at the abstract level. This verifier upgrades the source from a search snippet to the publisher-registered abstract.

Caveats:
- It is a working paper.
- The country and industry are unknown.
- "No longer reduces" is a null result from a single field experiment of modest size, with no confidence interval visible.
- The same abstract says customers are "less willing to continue a conversation" with AI. That is relevant to H5 and the claim omits it.
- The "revised 2026-08" date could not be verified.

### 4. Apna job-language analysis (re-run on the raw crawl)

I re-ran the logic of `code/job_lang.py` on `research-raw/l3-segments/apna/apna_jobs.jsonl` (6,454 rows) in the session scratchpad.

**The Tamil numbers are a regex artefact.** Apna detail pages carry a "Work location" line such as "…, Chennai, Tamil Nadu 600083". The pattern `\btamil\b` matches "Tamil" in "Tamil Nadu", so nearly every posting located in Tamil Nadu counts as requiring Tamil.

| city | n | lane (raw regex) | "Tamil Nadu" removed | Apna structured "Regional language" field lists Tamil |
|---|---|---|---|---|
| Chennai | 360 | 298 (82.8%) | 121 (33.6%) | 74 (20.6%) |
| Coimbatore | 78 | 71 (91.0%) | 19 (24.4%) | 12 (15.4%) |
| Trichy | 27 | 25 (92.6%) | 7 (25.9%) | |
| Madurai | 17 | 15 (88.2%) | 7 (41.2%) | |

The other states' names do not collide with their language names (Telangana/Telugu, Karnataka/Kannada, West Bengal/Bengali, Maharashtra/Marathi, Gujarat/Gujarati). So Hyderabad 39.8%, Bengaluru 34.3%, Kolkata 19.3%, Mumbai 12.1% and Pune 22.1% are unaffected. The lane's evidence row E15 figure "21.4% require a regional non-Hindi language" falls to **17.2% (1,112/6,454)** once "Tamil Nadu" is removed.

A mention is also not a requirement. Among the 121 genuine Chennai mentions are "Tamil and English communication is preferred", "should know tamil" (in a "Telugu mandatory" posting), and multi-language lists.

**Dialect side.** There are two "marwari" hits, not one:
- Delhi-NCR is a false positive: an address reading "behind old marwari katra, … chandni chowk".
- Jaipur is genuine: Setia Auto Finance, collections, "hindi, marwari and english are required".

The only Bhojpuri, Awadhi, Haryanvi and Rajasthani hits come from one Bengaluru "Hindi Data Annotation Specialist" posting (FRND App), which asks for "familiarity with regional variation". That is not a telecaller requirement. So "no telecaller posting asks for Bhojpuri" holds.

**The denominator.** "About 460 Hindi-belt postings" cannot be reproduced. The 29 Hindi-belt cities in the crawl, excluding Delhi-NCR, hold **828** postings; with Delhi-NCR, 2,095. The conclusion of 1 dialect ask is therefore even sparser than stated. Separately, about 14 Hindi-belt postings ask for "local language" or "local vernacular". Many are pan-India templates, but some (Bikaner, Jaipur, Patna) may implicitly mean a dialect. The regex cannot see this.

Corrected statement: "In 6,454 Apna telecalling-type postings, Tamil is named as a language (excluding the 'Tamil Nadu' address) in 33.6% of Chennai (121/360) and 24.4% of Coimbatore (19/78) postings. Apna's structured regional-language field names Tamil in 20.6% and 15.4%. By name, a sub-Hindi dialect is required in 1 of 828 Hindi-belt postings (Marwari, Jaipur NBFC collections), and Bhojpuri appears in no telecaller posting. About 14 Hindi-belt postings ask for an unnamed 'local language'." The qualitative point, that employers screen for language and not dialect, survives. The magnitude for Tamil was overstated 2.5–3.7×.

### 5. Azure voice and locale coverage

MS Learn speech language-support (ms.date 2026-09-09; the page was downloaded and grepped):
- **bho-IN** appears exactly three times: in the speech-to-text table (fast transcription ✅; no post-stream refinement), in the custom speech table (audio + human-labelled transcript, plain text, structured text) and in the language-identification table.
- It does not appear in the text-to-speech or Custom/Personal voice tables.
- "Maithili" and "mai-IN" do not appear anywhere on the page.
- The ta-IN text-to-speech rows are exactly `ta-IN-PallaviNeural` and `ta-IN-ValluvarNeural` (Standard).

The lane's CSV has 72 IN-locale voices (hi-IN 30, en-IN 20, 11 locales × 2; 51 GA and 21 preview), which matches the claim. This is confirmed.

Nuances the claim should carry:
- 11 Indian voices (six en-IN DragonHD, four en-IN *IndicNeural*, and hi-IN Diya DragonLatest) declare ta-IN as a secondary locale. Tamil-capable Indian voices therefore number 13, not 2, and the lane itself used Meera DragonHD and AartiIndic for Tamil.
- The claim covers Azure Speech locales only. Azure Foundry also sells **gpt-realtime-2 / 2.1** audio models (they appear in lane l8's retail-price CSV). These are speech-to-speech LLMs that can be prompted to attempt Bhojpuri. The lane did not test them, so "Azure cannot produce Bhojpuri speech" would be an untested over-reading of this claim.
- The 958-voice total could not be re-checked, because the CSV is a filtered export of 369 rows.

### 6. TTS to ASR round-trip

I recomputed from `samples/asr-bho-IN.json` and `samples/asr-roundtrip.json` with the 13-marker list in `code/score_roundtrip.py`.

The CSV values are reproduced exactly under the script's equivalence rules:
- bho-IN: 11–12/13.
- hi-IN: 7, 8, 8, 9, 9, 11 out of 13.

The script docstring flags these equivalences as "researcher judgement". Weaknesses:
- **Strict matching** (exact Bhojpuri form only) gives **8–10/13** under bho-IN: Swara 9, Madhur 9, Kavya 9, Diya 10, Aarti DragonHD 8, AartiIndic 9.
- Among the equivalences, `अउर~और` counts the Hindi form as Bhojpuri survival. The ASR returned "और" in 5 of the 6 bho-IN transcripts. That is exactly the Hindi-isation the claim attributes only to hi-IN ASR. Counting it as lost gives **10–11/13**.
- "Recall 0.90–0.95" is whole-turn Devanagari token recall, not marker recall. Marker recall under the lenient rules is 0.85–0.92.
- The neutral Hinglish clips score 1.00 under hi-IN ASR, but one scores **0.973** under bho-IN ASR (AartiIndic).
- The "Bhojpuri-dominant" stimulus was written by gpt-5.4 (`stimuli-text.json`) and has not been reviewed by a native speaker. The panel protocol admits this.
- n = 1 script and 1 render per voice, with no repeats. A bho-IN ASR's language model may restore Bhojpuri word forms from context, so high recall partly reflects the ASR's prior, not the TTS's pronunciation.

The "accent authenticity unmeasured" caveat is correct and should stay.

### 7. Region inference

**TRAI PR 125/2026** (dated 2026-09-28; PDF re-downloaded):
- Total porting requests in August 2026: 15,829,976. Bihar: 1,469,902. UP (East): 2,227,586.
- Inter-LSA MNP has been nationwide since 03.07.2015.
- Note 5: "Bihar includes Jharkhand".
- Annexure-II gives Bihar wireless (mobile) at 109,274,677 for August 2026, so 1.47 M is 1.345% per month.

All numbers are confirmed. The Vaani card hours also match (Bhojpuri 489.9 h audio / 26.6 h transcribed; Maithili 465.5 / 20.8; Magahi 110.9 / 6.5; Angika 99.8 / 4.5). Bihar's multi-language makeup is not in doubt.

Problems:
1. **The MNP figure is mostly irrelevant to series-to-circle inference.** Most porting is an operator switch within the same circle, which leaves the number's circle, and the subscriber's likely origin, unchanged. Only inter-LSA porting moves a series out of its circle, and TRAI does not split it out. The real confounds are migration and roaming (a Bihar-series number used in Delhi or Mumbai) and the mix of languages within a circle. The lane does name both. Citing "1.35% per month" as evidence that the series breaks overstates it.
2. **"LID separated languages 20/20"** used the candidate set {hi-IN, en-IN, ta-IN, bn-IN}, but only Hindi-script and Tamil clips were played. No English or Bengali clip was tested, so this is a Hindi-vs-Tamil check on synthetic audio. It ran per phrase on the whole 22–36 s clip through fast transcription, not a true first-turn at-start LID.
3. The "2/6 labelled bho-IN" result is confirmed: the first phrase was bho-IN for Swara and Diya, and every second phrase was hi-IN. Neutral Hinglish was 0/6, as stated. With n=6 synthetic clips this indicates; it does not measure.
4. "Cannot work" is too strong. A series cannot identify a dialect, but it does give a coarse regional prior. The correct statement is "cannot identify dialect; at best a circle-level prior, confounded by migration and within-circle linguistic diversity".

## Lane quality notes

These are repeated in the structured output.

- **A material error in the lane's own computation (E15 and claim 4).** The "Tamil Nadu" address artefact inflates the headline Tamil figures 2.5–3.7× and the overall regional-language share from 17.2% to 21.4%. The "about 460" denominator is unsourced and does not match the crawl (828 Hindi-belt postings excluding Delhi-NCR). Fix `job_lang.py` by stripping state names and the "Work location" block, or by using Apna's structured "Regional language" field.
- **The brief's H6 core test was not run.** The brief asks to *run* a blind preference panel in three or more regions. The lane drafted a protocol and power analysis, which are arithmetically correct (194/276 binomial, 686 to 3,841 per arm, d_z table rechecked). Fielding is blocked on owner budget (₹77.5k plus coordinators). So H6 "preferred" has no evidence yet in either direction.
- **Producibility is under-tested.** The lane tested no in-house TTS (IndicF5 or Indic Parler on Azure GPU) and no Azure gpt-realtime-2.x prompted for Bhojpuri. The brief explicitly asks for the in-house option.
- **The Bhojpuri stimulus is LLM-written and unreviewed by a native speaker.** Every Bhojpuri measurement rests on text whose authenticity is unknown.
- **The literature for H5 rests on Chinese fintech (Luo 2019, Choi 2025) and one working paper of unknown setting (Habel 2026).** There is no Indian outcome evidence on human-likeness or dialect matching. Searching for Indian vernacular-calling outcome studies or vendor case studies, with controls, was skipped or returned nothing. The report should say plainly that none was found.
- **E12 (Lev-Ari & Keysar) is stated "from prior knowledge"** with only metadata verified, which is honestly flagged. E09 (Rime/Miravoice) is vendor-funded, which is also flagged.
- **No fabricated numbers were found.** Every numeric claim I traced (TRAI, NBER, Luo, Vaani, Azure CSV counts, ASR CSV) reproduced from its source, apart from the Tamil artefact and the "about 460" denominator.
