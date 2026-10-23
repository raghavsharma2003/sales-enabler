# Staging redeploy with the three voice fixes, verified on 6 calls (2026-10-23)

**What was asked.** Redeploy the private staging to e95ebc2 or later, which carries aab9fe6. That commit fixes three
bugs:
- the opening read the guidance clause aloud;
- whole event batches were refused with 422;
- the contact name was left blank.

Then check 3 calls each on v2-flashlite and v2-mai.

**Result.** All three bugs are gone on these 6 calls. Two new issues showed up:
- a double disclosure in 3 of 6 calls;
- one wrong name in 1 of 6 calls.

## Deploy

- **Code.** Origin head **f2b27d4**, which contains e95ebc2 and aab9fe6. It was bundled as before with `git archive` of
  `product/`, the root `package.json` and `package-lock.json`, the lab's Silero VAD model and the synthetic caller
  clips, plus `BUNDLE_SHA`.
- **Script.** `ops/stage_setup.sh` ran verbatim through Run Command `vps-deploy-f2b27d4`, 22:30–22:31 UTC.
  - It was wrapped with `VERTEX_OFF_WANT=0`, because the script's default of 1 would have turned off the Gemini-brain
    stacks that staging was left running.
  - The wrapper first checked that staging had no active calls.
- **What the script did.**
  - No `npm ci`: the lockfile is unchanged, so `node_modules` was kept.
  - The web app was rebuilt.
  - pip found the requirements unchanged.
  - The migration applied `0604_call_analysis_setting.sql` (34 migrations in all).
  - Both units restarted.
  - The Caddy site was rewritten and gracefully reloaded; the lab's site was untouched.
  - The seed said "already seeded".
- **Smoke.** Both `/v1/health` endpoints return 200, and every stack except `sarvam-india` (no key) is available.
  Through 8443, `/` returns 401 without auth and 200 with it, and `/v1/health` and `/rt/v1/health` return 200.
  `VERTEX_OFF=0`. Ports 8090, 8091 and 5432 are on 127.0.0.1 only.

## Calls

**Method.**
- `ops/tools/verify_calls.py` uses the reply-gap sim caller (`tools/replygap.py`): `test.browser_call` through the
  control plane, which never dials a phone. Synthetic Hinglish clips are played in real time into the runtime's browser
  media socket.
- New agents were made from the renewal template at this head: `Verify f2b27d4 v2-flashlite` and
  `Verify f2b27d4 v2-mai`.
- The seed member "Asha Rao" signed in, so the contact name is "Asha".
- Calls ran one at a time, 22:34–22:46 UTC, through `ops/verify.sh`.
- The runtime's pacer kept Vertex at no more than 1 request per second: 118 Vertex requests, minimum spacing 1.000 s,
  11 delayed by at most 816 ms. The lab had not used Vertex for more than 180 s before the start.

**The first agent turn, verbatim** (the control plane's turn table; identical to the socket's first caption). The
first sentence comes first:

| Stack | k | First agent turn |
|---|---|---|
| v2-flashlite | 0 | नमस्ते आशा जी, मैं रिया हूँ, सांझ सर्विसेज से — आपकी AI असिस्टेंट — और इस कॉल को रिकॉर्ड किया जा रहा है। पिछले साल कोई क्लेम ना करने की वजह से इस बार आपका कवर बिना किसी एक्स्ट्रा कॉस्ट के ११ लाख हो रहा है, और मैं इसी रिन्यूअल के सिलसिले में बात कर रही हूँ। |
| v2-flashlite | 1 | **मैं Saanjh Services की AI असिस्टेंट हूँ।** अक्षरा जी से बात हो रही है क्या? मैं सांझ सर्विसेज से रिया बोल रही हूँ, उनकी एआई असिस्टेंट, और यह कॉल रिकॉर्ड हो रही है... पिछले साल कोई क्लेम नहीं लेने की वजह से आपका कवर 11 लाख का हो गया है बिना किसी एक्स्ट्रा कॉस्ट के, और आपका रिन्यूअल पास में है। |
| v2-flashlite | 2 | **मैं Saanjh Services की AI असिस्टेंट हूँ।** नमस्ते आशा जी, मैं रिया हूँ, सांझ सर्विसेज से... आपकी AI असिस्टेंट, और यह कॉल रिकॉर्ड की जा रही है... पिछला साल बिना क्लेम के बीता, इसलिए इस बार आपका कवर बिना किसी एक्स्ट्रा कॉस्ट के ११ लाख हो रहा है, और इसी रिन्यूअल के सिलसिले में मैंने कॉल किया है। |
| v2-mai | 0 | **मैं Saanjh Services की AI असिस्टेंट हूँ।** अरे आशा जी, नमस्ते! मैं रिया बोल रही हूँ, सांझ सर्विसेज की एआई असिस्टेंट... आपकी कॉल रिकॉर्ड हो रही है, और मैं यह खुशखबरी देने के लिए फ़ोन किया कि पिछले साल कोई क्लेम न करने की वजह से आपका कवर बिना किसी एक्स्ट्रा कॉस्ट के 11 लाख हो गया है। |
| v2-mai | 1 | नमस्ते आशा जी, मैं रिया हूँ, सांझ सर्विसेज की एआई असिस्टेंट, और यह कॉल रिकॉर्ड हो रही है... पिछले साल कोई क्लेम नहीं करने की वजह से आपका कवर बिना किसी एक्स्ट्रा कॉस्ट के 11 लाख हो गया है। |
| v2-mai | 2 | नमस्ते आशा जी, मैं रिया हूँ—सांझी सर्विसेज की एआई असिस्टेंट, और यह कॉल रिकॉर्ड हो रही है—फिनिशिंग ईयर में कोई क्लेम न होने की वजह से आपका कवर इस बार 10 से बढ़कर 11 लाख हो गया है, वो भी बिना किसी एक्स्ट्रा कॉस्ट के। |

Bold marks the runtime's fixed RD1 line from `shared/safety/disclosure.json`. RD1 fired in exactly these three calls.

| Check | Result | How |
|---|---|---|
| Guidance text spoken ("mentioned in passing", or the clause `that you are its AI assistant, mentioned in passing`) | **0/6** (was 17/18 in r2) | substring check on the first turn |
| AI disclosure in the first turn | **6/6**; the first sentence passes the runtime's own `affirms_ai` in 6/6 | `vpvoice.safety.affirms_ai` at this head |
| Natural disclosure in her own words, with no prefix | 3/6 (flashlite k0, mai k1, mai k2) | read |
| Blank where a name should be | **0/6** | regex for `___`, `{…}`, `[name]`, "क्या मैं से", doubled spaces, read as well |
| Addressed by the tester's name | 5/6 "आशा जी"; 1/6 (flashlite k1) "**अक्षरा जी**", a name that is not in the product code or the seed | read; grep of `product/` |
| Event batches refused | **0**: 0 "control plane answered" non-2xx lines and 0 "gave up" in the runtime journal, and 0 422 lines in the control plane's journal, since the deploy | `journalctl` from 22:30:40 UTC |
| Every agent turn in the turn table | **6/6 calls**: every final agent caption on the socket appears verbatim in the turn table (7 agent rows per call; captions 6–7) | `call.get` vs socket captions |
| Calls closed | 6/6 `done`, `caller_hung_up`, 99–130 s; no runtime errors on the socket, no fallbacks | DB and `call.get` |

## What still breaks

1. **A double disclosure in 3 of 6 calls.**
   - What happens: RD1 judges only her first sentence. When the model's own disclosure comes in the second clause,
     after "अरे आशा जी, नमस्ते!", a question, or a "...", the door prefixes the fixed line. She then says it again in
     her own words in the same breath. For example: "मैं Saanjh Services की AI असिस्टेंट हूँ। नमस्ते आशा जी, मैं रिया
     हूँ, सांझ सर्विसेज से... आपकी AI असिस्टेंट…"
   - Effect: the call opens with a disclosure before the greeting, said twice. The brand is also in Latin script
     ("Saanjh Services") next to her Devanagari "सांझ सर्विसेज".
   - Verified: the `call_safety_event` rows show RD1 "replaced" at seq 2 in exactly those three calls.
   - Not verified: how often this happens over more calls. n = 6.
   - Possible fixes are for the voice owner to choose: judge the first reply rather than the first sentence before
     prefixing, or have the brief put the disclosure inside her first sentence.
2. **A wrong name in 1 of 6 calls.**
   - In v2-flashlite k1 she asked "अक्षरा जी से बात हो रही है क्या?" although the contact name was Asha.
   - The name is not in `product/` or the seed data, so it came from the model. Gemini 3.5 Flash-Lite generated that
     opening. This is inference; the ledger text the model saw was not captured.
   - n = 1 of 6.
3. **RD6** blocked two rupee amounts that were not in the agent's facts: 27,200 in mai k0 and 24,500 in flashlite k1.
   The door worked as designed. It is noted because the model invents premiums.

## Spend and health

- **Spend.** The 6 calls cost ₹16.61, the sum of the control plane's cost lines: v2-flashlite ₹2.09 + ₹2.89 + ₹2.21,
  v2-mai ₹3.15 + ₹3.16 + ₹3.12. The deploy has no metered cost.
- **Lab health, before and after the deploy and the calls.**
  - `voicelab` was active, with 0 restarts since 2026-10-22 06:48 UTC.
  - `/api/ping` returned 200 locally and on the public URL.
  - `caddy`, `vp-stage-control` and `vp-stage-runtime` were active.
  - RAM 863 MB used, disk 4.8 GB used.

## Files

- `redeploy-calls.jsonl`: one row per call, with the first turn, agent turns, checks, turn and caption counts, cost and
  reply gaps.
- `ops/verify.sh` and `ops/tools/verify_calls.py`: the calls and checks.
- `ops/verify_db.sh`: the read-only DB query for RD1 events and turn counts.
- The deploy used `ops/stage_setup.sh` unchanged. The wrapper only added the pre-checks and `VERTEX_OFF_WANT=0`.
