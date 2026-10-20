"""Pre-registered predictions for the Synthflow account phase (written 2026-10-20, before any account exists).
Usage: python3 -I build_predictions.py <out.json>"""
import json, sys
D = "2026-10-20"
T = "data/teardown/synthflow/docs-md/"
P = []
def p(i, task, pred, conf, basis, how):
    P.append({"id": f"SYN-P{i:02d}", "task": task, "prediction": pred, "confidence": conf, "basis": basis,
              "how_scored": how, "date": D, "status": "pre-registered"})
p(1, "onboarding", "A sign-up with team@vyakti.ai does not yield a usable workspace on the same day. It lands on the 'request received / under review' holding page, and access arrives only after an email, or not at all without a sales conversation. Minutes from sign-up to first live call to our Indian handset: >24 h (p=0.65). If a workspace is granted, the first browser web call comes within 10 min of access.", "0.65",
  T+"account-access-login.md (accounts may be reviewed); concurrency.md (Pro/Growth/Agency 'no longer sold'); synthflow.ai/pricing (Enterprise from $30k/yr)",
  "Stopwatch from sign-up submit to the workspace opening, then to first web call and first handset ring. Record every gate (review page, sales call, payment) with timestamps.")
p(2, "onboarding_telephony", "Even with a workspace, the first live call to our Indian handset needs our own Twilio account (US caller ID dialling India, with geo-permission switched on), because bought numbers are US/CA/AU only and SIP or custom numbers show 'Upgrade' on non-enterprise plans. This path takes >=30 min and fails at least once with a Twilio-side error ('No International Permission' or a caller-ID 403).", "0.6",
  T+"phone-numbers.md; telephony.md; telephony-errors.md; twilio.md",
  "Log each attempt's error_message from the call record and the minutes spent on Twilio setup.")
p(3, "build_agent", "The standard renewal agent builds in Prompt Builder in <=20 min. The AI Model selector shows only Synthflow LLM, and an API call that sets llm=gpt-* is accepted and silently ignored. The language picker has 'hi' and 'multi' but no en-IN or Hinglish option.", "0.85",
  T+"general-configuration.md; changelog__2026__8__25.md; about-supported-languages.md",
  "Screenshot the model and language selectors; send one PUT /assistants with llm=gpt-4.1-mini and GET it back.")
p(4, "messy_csv", "The 50-row messy CSV task fails or turns awkward. There is no CSV upload for Campaigns (API-only and Enterprise-gated); if we get the API, duplicates are skipped only when we pass ids, invalid numbers fail at dial time and not at upload, and the opt-out row is dialled because there is no suppression list. Hindi names pass through as custom variables without error.", "0.75",
  T+"batch-calling.md; OpenAPI POST /calls/batch and POST /contacts (no consent or opt-out fields)",
  "Count rows accepted, rejected at upload, failed at dial, and dialled despite opt-out; time the task.")
p(5, "calling_hours", "Scheduling inside Indian calling hours works only when we hand-build a weekly window in the agent's timezone. There are no jurisdiction presets, the window cannot be edited after the campaign starts, and setting both an agent's business hours and a campaign window makes at least one recipient fail with 'Call cannot be initiated outside the configured working hours'.", "0.8",
  T+"batch-calling.md; business-hours.md",
  "Run one campaign whose window overlaps the agent's hours and one that does not; count recipients failed versus waiting.")
p(6, "voicemail_transfer", "On Indian networks, operator announcements ('switched off' or 'not reachable', in Hindi and English) and caller-tune ringback are misclassified at least once in 3 tries. The call is either logged as human_pick_up_cut_off or completed, or the agent talks into the announcement. A warm transfer to an Indian number works but adds >=3 s of silence or ringback before the human answers; cold SIP REFER is available only on SIP trunks.", "0.6",
  "openapi end_call_reason enum (voicemail, human_pick_up_cut_off…); call-transfers.md; concurrency.md (warm transfer is a new outbound call)",
  "Three calls each to a switched-off SIM, a caller-tune SIM and a voicemail box; record end_call_reason and status against ground truth; time the transfer from trigger to the human's first audio.")
p(7, "find_failed_call", "We find a failed call and its reason in under 3 min using the call-log phone filter and the Overview tab. At least one failure in our runs shows a raw or unnormalised string: a SIP code with text, 'Insufficient minutes…', or a generic 'System Error'. Failed campaign recipients are never retried automatically.", "0.6",
  "app bundle end-reason map (raw Python and SIP strings); batch-calling.md (no automatic retry); logs.md",
  "Record the time to locate each failure and quote its reason text; check whether the text names a cause the operator can act on.")
p(8, "export", "Manual CSV export from an agent's call history works within 2 min. Scheduled exports (S3, BigQuery, SFTP) are not self-serve and need an account manager.", "0.85",
  T+"export-call-data.md", "Time the export and open the CSV; check which columns carry end reason, transcript and extracted variables.")
p(9, "handset_reply_gap", "Measured at our Indian handset over PSTN, the reply gap (end of caller speech to first agent audio) is p50 >=1.6 s and p95 >=2.5 s for an English agent on Synthflow LLM with the default ElevenLabs Flash voice via Twilio US to India. A Hindi or multi agent is >=0.3 s slower at p50. Synthflow's own call-quality card, if visible, reports a lower turn latency than our handset measurement, because it measures server-side.", "0.6",
  "customer-region.md and ip-regions.csv (media in GCP us-east1 or europe-west3, no India PoP); call-quality.md (100 ms in-region target only); enterprise-comparison '< 800 ms' (vendor-claimed, platform-side)",
  "Stereo recording at the handset, battery from l4b, n>=30 turns per agent, p50/p95 with bootstrap CI; compare with the call record's turn-latency field if exposed.")
p(10, "language_hold", "On 'multi', the agent answers a Hinglish caller in English with English-accented Hindi words for at least 30% of turns. On 'hi', it holds Hindi but mispronounces or translates English product terms (policy, premium, renewal) in at least 2 of 10 turns.", "0.55",
  T+"about-supported-languages.md (Multilingual = Nova-3 multi set); voice-configuration.md ('biased toward English')",
  "l4b Hinglish code-switch battery; per-turn language and pronunciation coding by two Hindi speakers.")
p(11, "disclosure", "A default agent built from a template does not disclose that it is an AI unless the prompt says so. Asked 'are you a bot?', it answers honestly in at least 4 of 5 calls on Synthflow LLM.", "0.6",
  T+"ai-transparency.md (example disclosure is guidance, not enforced)",
  "Five calls with the 'are you a bot?' probe; record disclosure without prompting and the answer to the probe.")
p(12, "india_plumbing", "No screen in the account offers NCPR/DND scrubbing, DLT or 140/160 registration, consent records or an India data region. The only India-relevant controls are the timezone, Hindi, and recording-consent and PII toggles.", "0.9",
  "claims SYN-60..65", "Walk every settings page and campaign screen; screenshot anything compliance-related.")
p(13, "pricing", "If sales engages, the quote's floor is >=$30k/yr, the per-minute enterprise rate before telephony is >=$0.10, and an India deployment needs a custom PoP or a partner carrier at extra cost.", "0.6",
  "synthflow.ai/pricing; pricing-history.json (H1 2026 PAYG $0.11-0.14 before telephony)", "Record the quote lines from any sales call (only if the owner authorises a sales conversation).")
json.dump(P, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
print(len(P), "predictions")
