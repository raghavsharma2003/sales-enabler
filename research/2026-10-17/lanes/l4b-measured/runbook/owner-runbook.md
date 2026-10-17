# Owner runbook: measuring competitors that need a sign-up, a form or a phone call

Prepared 2026-10-17 by lane l4b-measured. Everything here needs a human: a sign-up (often with a phone OTP), an identity
form, a payment card, or a real phone call. The research agent did not do any of these, by rule.

The goal is one number set per platform, collected the same way as the browser demos the agent measured itself:
the same caller audio, the same turn logic, the same scorer. Do not improvise lines on the call. The battery is the test.

## 0. One-time setup on your laptop (about 15 minutes)

1. Install Node 20 or newer, Python 3.10 or newer, ffmpeg and Google Chrome.
2. Get this lane folder: `research/2026-10-17/lanes/l4b-measured/` (after the coordinator commits it).
3. In `harness/`, run `npm init -y && npm i playwright@1.56.1 && npx playwright install chromium`.
4. Install Python packages: `pip install numpy scipy`.
5. Transcription (optional but needed for word counts and the content checks): create a file `vp-azure.env` with
   `VP_AI_ENDPOINT=...` and `VP_AI_KEY=...` for the vp-research Azure account (the same values the research used), then
   `export VP_AZURE_ENV=/path/to/vp-azure.env`. Without it, run `score.py` with `--no-stt` (latency, barge-in and
   silence metrics still work).
6. Check the harness works on a public demo before you spend anything:
   `cd harness && node vp_harness.mjs run vapi P1 owner-check` then
   `python3 score.py run recordings/owner/vapi__P1__owner-check.json --vendor Vapi`.
   You should see about 11 rows with latencies in the 1 to 4 s range.

Never speak near the laptop during a harness run. The harness replaces the page's microphone with the battery audio,
so room noise does not leak in, but you should not talk over the call either.

## 1. Mode A: public browser demos that were blocked only by our sandbox network

These need no account. They failed in the research container because their WebRTC media needs direct UDP or a
non-443 TCP port, which that container does not have. On a normal home or office connection they should work.

| demo id | vendor | why it failed in the sandbox | command |
|---|---|---|---|
| `ravan_hi` | Ravan.ai (Agni), Hindi live demo | LiveKit server offers only STUN, no TURN; ICE never connects without UDP | `node vp_harness.mjs run ravan_hi P1 r1` (then P2, P3, P4) |

Run each persona once (P1 to P4), then a second round if you have time, and score each JSON with
`python3 score.py run <json> --vendor "Ravan.ai"`.

## 2. Mode B: platforms with a sign-up and an in-browser test call (the main bench)

For each platform: sign up, build the agent in `agent-spec.md` exactly, fill a row of `settings-log.csv`, then run
the harness in manual mode, which opens a visible browser with a saved profile so you can log in once:

```
cd harness
VP_HEADED=1 VP_PROFILE_DIR=$HOME/.vp-profile VP_VENDOR=<platform> VP_URL='<the agent page URL in the dashboard>' \
  node vp_harness.mjs run manual P1 <platform>-r1
```

When the browser opens: log in if asked, open the agent, and click the platform's own test-call button (names below).
The harness waits up to 15 minutes for the page to open the microphone, then plays the battery and records both sides
internally. Repeat for P2, P3 and P4. Score with
`python3 score.py run recordings/owner/manual__P1__<platform>-r1.json --vendor <platform>`.

| platform | sign-up needs (check at sign-up) | where the test call is (per vendor docs; confirm in the UI) | notes |
|---|---|---|---|
| Vapi | email or Google | assistant page, "Talk to Assistant" | public homepage demo already measured by the agent; this run measures OUR spec on Vapi |
| Retell AI | email or Google | agent page, "Test" (web call) | public demo is phone-only with name, phone and reCAPTCHA: not run |
| Bland | email; phone often asked | agent or pathway page, web test | public homepage agents sit behind a Cloudflare Turnstile check: not run |
| Synthflow | email | agent page, "Test agent" (web call) | homepage has recorded samples only |
| ElevenLabs Agents | email or Google | agent page, "Test AI agent" | public demo already measured (English product assistant) |
| Bolna | email or Google | platform.bolna.ai playground, "Test Agent" (simulator; vendor docs do not name a web-call button) | if no browser call exists, use Mode C with a Bolna phone number |
| Smallest.ai Atoms | email | agent editor, top right "Test Agent" then "Web Call" (docs.smallest.ai) | the homepage widget did not start in the sandbox |
| Ringg AI | email; phone likely | assistant page, test call; web-call assistants need a whitelisted domain | if only a phone test exists, use Mode C |
| Sarvam Samvaad (Voice Agents) | login at platform.sarvam.ai (docs also mention indus.sarvam.ai/samvaad) | "test agent" in the agent builder (docs.sarvam.ai/voice-agents/quickstart) | list price from INR 3.50/min PAYG (l4a lane, 2026-10-17) |
| Gnani Inya | sign-up at inya.ai | agent builder test | the gnani.ai "Try it now" link opens a TTS page, not an agent |
| HuskyVoice.AI | name, email and phone on the demo page | "Talk to Deepika" opens studio.huskyvoice.ai/voice/<id> behind that form | decide whether to give a real number; use Mode B on the opened page |
| VoiceGenie, SubVerse, Haptik, Yellow.ai, Skit.ai, Exotel, Ozonetel, Caller.digital, Nurix (NuPlay) | sales demo form | none public | book a demo and ask them to run the battery on a live call (Mode C) |

Budget: most of these give free credits or a free tier; the agent did not verify the current amounts. Expect about 25
minutes of agent talk per platform for P1 to P4, so a few dollars at USD 0.07 to 0.15 per minute if credits run out.
Record the per-call charge from each platform's usage page into `invoice-log.csv` (template below). That is the "cost on
the actual invoice" the brief asks for.

## 3. Mode C: phone-only demos and live sales demos

Use `harness/player.html`. It plays the battery through your laptop speaker into a speakerphone call and records the
room.

1. From the lane folder run `python3 -m http.server 8765` and open `http://localhost:8765/harness/player.html` in
   Chrome on the laptop.
2. Quiet room. Phone on speaker, about 30 cm from the laptop, volume at about 70%. Laptop volume so the clips sound like
   a normal speaking voice at the phone.
3. Dial the demo number (or join the sales call), choose the persona and type the vendor id, and press Start once the
   call connects. Do not speak. The page waits for each agent turn to finish and plays the next clip.
4. At the end it downloads `<vendor>__<persona>__<time>.webm` and `.events.json`. Score with
   `python3 score.py owner <file>.webm --persona P1 --vendor <id> --layout mono --events <file>.events.json`.

Mode C limits: a mono room recording cannot separate overlapping voices, so barge-in stop time is not measured
(the scorer says so); latency includes the phone network; the P2 market-noise bed cannot be reproduced. Compare Mode C
numbers only with other Mode C numbers.

Known phone demos (from vendor pages, 2026-10-17): Ravan.ai "No mic? Dial +1 812 648 9729"; Retell, Nurix and
HuskyVoice offer "call me" forms that need your phone number.

## 4. What to send back

- `recordings/owner/*.wav` and `*.json` from the harness (or `.webm` and `.events.json` from the player)
- `data/measurements-owner.csv` (score.py appends to it), and `settings-log.csv`, `invoice-log.csv`
- screenshots of each platform's usage page

Then run `python3 harness/score.py summary data/measurements-owner.csv` for the per-vendor table.

## invoice-log.csv template

```
platform,date,call_id,persona,duration_s_reported,charged_amount,currency,charge_breakdown,source(usage page|invoice),screenshot
```

## Interview-style demos (Mode C with a person on the line)

If a vendor insists on a sales-led demo, ask them to put their agent on a call while you play the battery. Tell them it
is a fixed caller script for a comparative evaluation. Do not misrepresent who you are or why you are asking.
