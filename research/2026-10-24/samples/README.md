# Stack voice samples, rendered on staging (2026-10-24, walkthrough R13)

**What was asked.** Every stack card said "No sample recorded yet" (`open.2026-10-24.stack-voice-samples`). Render one
real sample per curated stack through the product's own voice adapters, check each file, and ship the passing ones in
`product/web/public/samples/`.

**Result.**
- **6 of 7 curated stacks now have a sample, from 3 clips.** All 3 clips pass QA.
  - The four stacks with the Gemini Flash-Lite voice share one clip. The renderer makes stacks that share a voice
    share one request.
- **sarvam-india was not rendered.** The renderer refused it: "Sarvam isn't set up on this server". Staging carries no
  Sarvam key, by design (`../../2026-10-23/staging/README.md`). Its card still says "No sample recorded yet".
- **The renderer's manifest matches what the web reads.** No product code was changed.
  - Web's own `parseSamples` accepts 6 of 6 entries after `node product/web/build.mjs`.
  - Every clip URL resolves to a file in `dist/samples/`.
- **One renderer defect:** v2-live's `spokenText` is an empty string (below). The audio is complete and correct.
- **Spend:** about ₹1.0, estimated from list prices.

## Per stack

All clips were rendered at 2026-10-24 04:04:26 UTC on staging at **69597eb** (69597eb5bbfc5a4c72b22bf8ffdffb923ca5407c).
They are Ogg/Opus, mono, 48 kHz, about 46–49 kb/s.

- **Duration:** the manifest's figure (the trimmed PCM) / ffprobe's figure (the container).
- **Loudness:** EBU R128 integrated loudness / true peak / RMS (`ffmpeg ebur128`, `volumedetect`, on the VM). The
  target is -16 LUFS and -1.5 dBTP.

| Stack | File | Duration | Size | Loudness | combinationId |
|---|---|---|---|---|---|
| v2-live | `gemini-3.8-live-Despina.ogg` | 5.53 / 5.61 s | 33,524 B | -15.9 LUFS / -4.0 dBTP / -15.6 dB | `v2\|gemini-3.8-live~Despina` |
| v2-flashlite | `gemini-lite-Despina.ogg` | 5.90 / 5.91 s | 36,005 B | -16.8 LUFS / -3.3 dBTP / -17.3 dB | `v2\|azure+gemini-3.5-flash-lite+gemini-lite~Despina` |
| v2-54mini | `gemini-lite-Despina.ogg` (shared) | 5.90 / 5.91 s | 36,005 B | as above | `v2\|azure+gpt-5.4-mini+gemini-lite~Despina` |
| v2-38flash | `gemini-lite-Despina.ogg` (shared) | 5.90 / 5.91 s | 36,005 B | as above | `v2\|azure+gemini-3.8-flash+gemini-lite~Despina` |
| v2-luna | `gemini-lite-Despina.ogg` (shared) | 5.90 / 5.91 s | 36,005 B | as above | `v2\|azure+gpt-6-luna@or+gemini-lite~Despina` |
| v2-mai | `azure-mai-hi-IN-Kavya_MAI-Voice-2.1-Flash.ogg` | 8.45 / 8.51 s | 49,170 B | -16.5 LUFS / -1.2 dBTP / -17.6 dB | `v2\|azure+gemini-3.5-flash-lite+azure-mai~hi-IN-Kavya:MAI-Voice-2.1-Flash` |
| sarvam-india | not rendered | | | | refused: "Sarvam isn't set up on this server" |

The brain in a cascade's combinationId does not speak in the sample. The clip is the stack's voice saying a fixed
line, so the four Flash-Lite-voice stacks sound the same.

## What was checked, per clip

**The line** (`vpvoice.samples.TEXT`, 17 words): नमस्ते आशा जी। मैं एक AI असिस्टेंट हूँ। क्या अभी आपसे दो मिनट बात हो सकती है?

**ASR round-trip.**
- Each shipped file was decoded to 16 kHz WAV and sent once to Azure Speech, REST short audio, hi-IN, Central India
  (the lab's speech account), from the VM, one request at a time.
- Word error is counted on the lexical form ("दो", not "2"), with punctuation removed:
  - **raw:** compared as is;
  - **AI = एआई:** hi-IN ASR writes the English letters in Devanagari;
  - **CER:** character error with word spacing ignored as well, so "आप से" and "आपसे" count the same.
- The product's own checks were run on what ASR heard: `safety.affirms_ai` (the disclosure) and
  `names.repair(text, "Asha")` (no wrong name).

| Clip | ASR transcript (display) | Confidence | Word errors: raw / AI = एआई | CER | Disclosure heard | "आशा" heard, name repairs |
|---|---|---|---|---|---|---|
| `gemini-3.8-live-Despina.ogg` | नमस्ते आशा जी, मैं एक एआई असिस्टेंट हूँ। क्या अभी आपसे 2 मिनट बात हो सकती है? | 0.86 | 1/17 / **0/17** | 0.000 | yes | yes, 0 |
| `gemini-lite-Despina.ogg` | नमस्ते आशा जी, मैं एक एआई असिस्टेंट हूँ। क्या अभी आपसे 2 मिनट बात हो सकती है? | 0.81 | 1/17 / **0/17** | 0.000 | yes | yes, 0 |
| `azure-mai-hi-IN-Kavya_MAI-Voice-2.1-Flash.ogg` | नमस्ते आशा जी।मैं एक एआई असिस्टेंट हूँ।क्या अभी आप से 2 मिनट बात हो सकती है? | 0.80 | 3/17 / **2/17** | 0.000 | yes | yes, 0 |

The MAI clip's 2 remaining word errors are one spacing difference: ASR wrote "आप से" for "आपसे". The words heard are
the same.

**The QA gates. Every clip passes every gate, so all 3 ship.**

| Gate | Result |
|---|---|
| Duration ≤ 12 s | 5.53, 5.90 and 8.45 s |
| Loudness normalised | -16.8 to -15.9 LUFS, within 1 LU of -16; LRA 1.2–1.9 LU |
| Format | Ogg/Opus, mono, 48 kHz (ffprobe) |
| Size ≤ 150 KB | 33.5, 36.0 and 49.2 KB |
| The spoken text matches the manifest's text | word error 0, 0 and 2 of 17 (spacing only), CER 0 |
| AI disclosure and "Asha" heard | 3 of 3 |

**One loudness note.** The MAI clip's true peak is -1.2 dBTP, 0.3 dB above loudnorm's -1.5 target. That is typical of
Opus encoding after limiting. It is still 1.2 dB below full scale (sample peak -1.2 dBFS), so it does not clip. This is
not counted as a failure.

## How it was rendered

**1. Staging updated to 69597eb.** Staging was at e9fdde3, and the renderer (f1a735f) was not in it.
- One Run Command, `vps5-deploy-69597eb`, 02:31:39–02:32:11 UTC. It sent `../staging/ops/deploy_pre.sh`,
  `../../2026-10-23/staging/ops/stage_setup.sh` verbatim, `../staging/ops/deploy_post.sh`, then
  `ops/samples_precheck.sh`.
  - The bundle used the same recipe as e9fdde3: a `git archive` of `product/`, the root `package.json` and
    `package-lock.json`, the Silero VAD model, the 49 caller clips, and `BUNDLE_SHA`.
  - The tools archive in blob was unchanged, byte-identical to the e9fdde3 one (sha256 checked).
- What it did:
  - pre-check: no active calls;
  - npm ci, because the lockfile changed;
  - rebuilt the web app;
  - migrations: **3 new** (0204, 0606, 0906), 39 in the tree;
  - restarted both units;
  - the seed said "already seeded".
- Smoke:
  - both health checks returned 200;
  - every stack is available except sarvam-india (missing `SARVAM`);
  - through 8443, 401 without auth and 200 with it;
  - ports 8090, 8091 and 5432 are on 127.0.0.1 only;
  - the lab was active, with 0 restarts.

**2. The pre-check found no ffmpeg on the VM.** The renderer encodes with ffmpeg, and QA measures with it.
- `ops/render.sh` installed it: `apt-get install --no-install-recommends ffmpeg`, Ubuntu's 6.1.1-3ubuntu5 with
  libopus.
- Nothing that serves calls uses ffmpeg. In `product/` and `voicelab/`, only `vpvoice/samples.py`, its tests and two
  bench scripts call it.
- Then the renderer's offline suite (`tests.test_samples`, devsim fake voice, no network) ran with ffmpeg present: 10
  tests, OK, 0 skipped. Rendering waited for it to pass.

**3. The render.** One Run Command, `vps5-samples-render`, 04:03:48–04:04:50 UTC.
- `python -m vpvoice.samples --out …` ran from `/opt/vp-stage/app/product/voice` as the `vpstage` user, through
  `render.py` in `ops/render.sh`:
  - it loaded staging's `/opt/vp-stage/.env`;
  - it removed **`NODE_ENV` only, for this one process.** Staging's control plane runs with `NODE_ENV=production`, and
    the renderer refuses production by design, because a sample is a lab job;
  - it loaded staging's Vertex pacer, `tools/pace.py`, before vpvoice imports anything. Every request to
    `*aiplatform.googleapis.com` from this process therefore starts at least 1.0 s after the previous one. The renderer
    also keeps its own 1 s gap.
- The stacks rendered one at a time.
- **Vertex traffic.** 2 request starts in the render window: one Live websocket at 04:04:26.99 and one TTS stream at
  04:04:35.68, **8.69 s apart.**
  - The staging runtime made 0 Vertex requests in that window (both pace logs merged), and staging had 0 active calls.
  - The TTS stream's first byte came at 1,260 ms.
- **Azure.** One MAI TTS request and 3 ASR requests. ASR ran 1 s apart.

**4. A logged warning, checked and harmless.** The launcher read `.env` line by line, so the renderer logged
"VERTEX_MODEL_MAP ignored". The VM's line is single-quoted; systemd strips the quotes for the runtime, and the launcher
did not.
- `ops/mapcheck.sh` is one offline Run Command, `vps5-samples-mapcheck`. It compared the map the running runtime
  actually got, from `/proc/<pid>/environ`, with the one the launcher read.
- The resolved model maps are **identical**: `gemini-3.8-flash-lite-tts` and `gemini-3.8-live` map to themselves.
  The map's only entry removes `gemini-3.5-transcribe-live`, which is not among the defaults.
- `VERTEX_LOCATION` (global), `VERTEX_LIVE_LOCATION` (us-central1), `VERTEX_LIVE_AUDIO`, `VP_REGION` (centralindia)
  and `VERTEX_OFF` (0) are the same as the runtime's.
- **So the samples came from exactly the models staging calls use.** A future launcher should strip quotes the way
  systemd does.

## Findings for the voice owner

- **v2-live's `spokenText` is `""`. Not diagnosed (inference below).**
  - The renderer keeps Gemini Live's own output transcription as `spokenText`, because Live does not promise to read
    verbatim. Here it got none, although `setup_msg` asks for `outputAudioTranscription` and the audio is the whole
    line: ASR word error 0.
  - `speak_live` stops reading at `turnComplete`, and it `break`s on any frame that is not text. The runtime's s2s read
    loop `continue`s on such frames.
  - Inference: the transcription arrives after the point where the renderer stops reading.
  - An empty `spokenText` reads as "said nothing", and `decision.2026-10-24.voice-stack-sample-renderer`'s `reverse_if`
    keys on `spokenText` differing from the text.
  - The web ignores `spokenText`, so the card is right. The manifest ships exactly as the renderer wrote it.
- **v2-live's sample is 5.53 s, against 5.90 s for the Flash-Lite TTS saying the same line.** n = 1 each; no
  comparison is drawn.

## Spend

About **₹1.0** (USD 0.0105 at the catalog's FX of 95). This is estimated from list prices in `vpvoice/catalog.py`;
no meter was read.
- Each generated clip is bounded at 7 s of audio (25 audio tokens per second):
  - Flash-Lite TTS: about $0.0011 ($6 per 1M audio tokens);
  - Live: about $0.0022 ($12 per 1M audio tokens out, plus a little text in);
  - MAI: about $0.0017 (77 characters at $22 per 1M characters, the catalog's unverified HD-like price);
  - Azure Speech ASR: about $0.0055 (19.9 s at $1 per audio hour).
- Run Commands, blob transfers and the deploy have no metered cost.
- The cap was ₹40.

## Not verified

- Playback in browsers. Ogg/Opus support varies (older Safari), and the static server answers without Range. No
  browser played these files in this job.
- A human listening. This QA is machine-only.
- Any sarvam-india sample.
- The cause of the empty `spokenText`.

## Files

- `../../../product/web/public/samples/`: the 3 clips plus `manifest.json`, exactly as the renderer wrote them
  (sha256 in `asr-wer.json`).
- `qa.json`: the VM's QA, per clip: ffprobe, size, R128 loudness, RMS and the raw Azure Speech result. It also holds
  the manifest.
- `asr-wer.json`: word and character error, plus the product's disclosure and name checks on each transcript
  (`ops/asr_wer.py`).
- `ops/`:
  - `samples_precheck.sh`: appended to the deploy;
  - `render.sh`: install ffmpeg, run the offline tests, render, pacing check, QA, upload;
  - `mapcheck.sh`: the model-map comparison;
  - `asr_wer.py`;
  - `web_parse_check.mts`: web's `parseSamples` against `dist/`.
- The Run Command logs are in blob `vl-transfer/runlogs/vps5-*`, and the render's outputs in `vl-transfer/samples-r13/`.
