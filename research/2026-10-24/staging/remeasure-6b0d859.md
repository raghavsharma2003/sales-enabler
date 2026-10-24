# Staging redeployed to 6b0d859 and the VM's upgrades tamed; the remeasure waits for the test budget (2026-10-24)

**What was asked.** Redeploy the private staging on `vl-vm-cin` to the branch head, then re-measure the voice runtime
on real models, the way `reply-gap.md` did at e9fdde3:
- the reply gap per stack, with its stage breakdown;
- barge-in: stop time and false stops on nods;
- the openings;
- the speculation keep rate.

First, stop Ubuntu's unattended upgrades from restarting services mid-run, as they did at 06:25 UTC today.

**Short answer.**
1. **Staging runs 6b0d859** (6b0d859826ef201033c5cb1b71b0ff58719afd48), deployed 07:02 UTC.
   - 10 new migrations, 50 in the tree.
   - Smoke and lab health passed.
   - The runtime runs on the code defaults: no env override, no drop-in, no judge model.
2. **The VM no longer restarts services after an upgrade, and never reboots on its own.** Security updates still
   install. Verified from the config files, from apt-config, and with `needrestart -b`.
3. **Not measured: every number that needs a call.** That is the reply gap, barge-in, the openings and the keep rate.
   - The product's daily test budget refuses any test call until **18:30 UTC** (midnight IST). The IST day of 24 Oct
     has ₹150.18 spent over 59 test calls, all from the e9fdde3 job (last one started 01:49 UTC).
   - The rule (`server/modules/calls/tools.ts`) needs spent + ₹50 ≤ ₹200. ₹150.18 + ₹50 is ₹200.18. So no call can
     start, not even one.
   - Getting around it would take a new workspace, a DB edit, or calling the runtime without the control plane. Any
     of them undoes a spend guard that works as designed, so none was done.
4. **The measurement is ready to run in one command after 18:30 UTC** (`ops/drive7.sh`, below).
   - Its barge-in driver was dry-run against a local devsim.
   - Its analysis reproduces e9fdde3's published reply-gap tables exactly from e9fdde3's own files.
5. **Spend so far: ₹0.** No model was called.

## Deploy

- **Bundle.** The e9fdde3 / 680c5e6 recipe, unchanged. It is a `git archive` at 6b0d859 of:
  - `product/`;
  - the root `package.json` and `package-lock.json`;
  - `voicelab/server/models/silero_vad.onnx`;
  - the 49 caller clips (`research/2026-10-18/lanes/g5-gemini-paid/harness/audio_phone16k`);
  - `BUNDLE_SHA`.

  Its file list adds 120 files (and 4 directories) to the 680c5e6 bundle's, all under `product/`, and removes none (sha256_16
  `39d6319bce477423`, 27.5 MB). The tools archive in blob was not re-uploaded. It is byte-identical to e9fdde3's (sha256
  `f52a0fdc…`), and its six files match `ops/tools/` in this tree (`cmp`).
- **Run Command `vps7-deploy-6b0d859`, 07:02:01–07:02:23 UTC.** It ran these four parts:
  - `ops/deploy_pre.sh`;
  - `../../2026-10-23/staging/ops/stage_setup.sh`, verbatim (unchanged since 6d8ea61; it is the same text 680c5e6's
    deploy sent);
  - `ops/deploy_post.sh`;
  - the new `ops/deploy_post7.sh`, which prints the turn-taking defaults this tree adds.
- **Pre-checks.** No active calls, no judge env lines, no runtime drop-ins, 680c5e6 deployed before.
- **What it did.**
  - The lockfile was unchanged, so `node_modules` was kept.
  - The web app was rebuilt.
  - pip found nothing to change.
  - Migrations: "done (10 new)" (0106, 0205, 0607, 0608, 0702, 0703, 0805, 0907, 1010, 1020); `schema_migrations`
    holds 50.
  - Both units restarted at 07:02:07.
  - The Caddy site was rewritten and gracefully reloaded; the lab's site was untouched.
  - The seed said "already seeded".
- **Smoke.**
  - Both `/v1/health` returned 200. Every stack is available except `sarvam-india` (no key).
  - Through 8443: 401 without auth, 200 with it (the page title is the app's), and `/v1/health` and `/rt/v1/health`
    return 200.
  - 8090, 8091 and 5432 are on 127.0.0.1 only.
  - The lab stayed active, and its `/api/ping` returned 200 locally and on the public URL.
- **Defaults the runtime runs with** (`deploy_post7.sh`, read from the deployed code): 0 overrides in `.env` and 0 in
  the runtime process.

  | Setting | Value |
  |---|---|
  | `BARGE_AUDIO` | on |
  | `BARGE_AUDIO_MS` | 200 |
  | `RESUME_MS` | 400 |
  | `BARGE_PAUSED_MS` | 900 |
  | `BARGE_NOD_LONG_MS` | 1,500 |
  | `BARGE_LONG_MS` | 700 |
  | `SPECULATE_PARTIAL` | off (every provider) |
  | `SPECULATE_STABLE_MS` | 400 |
  | `PREWARM` | on, except to a paced provider |
  | `FIRST_CLAUSE` | off |
  | `LISTEN_FIRST` | on (outbound SIP only, so not for browser test calls) |
  | Paced providers | `vertex` |
  | Judge | `timeout_ms` 1,500, threshold 0.5, `mode_default` shadow, no judge model configured |

  What each measured stack resolves to (the code's own `route_of`):

  | Stack | Brain | Voice | Speculation | Pre-warm brain | Pre-warm voice |
  |---|---|---|---|---|---|
  | v2-flashlite | Vertex | Vertex | off | off | off |
  | v2-mai | Vertex | Azure | off | off | on |
  | v2-54mini | Azure | Vertex | off | on | off |

  - So at this head, v2-flashlite's defaults equal e9fdde3's arm B (both flags off), with one difference: the
    call-start Vertex HEAD now obeys `VP_PREWARM`, so it is not sent.
  - The runtime reports these per call in `timing.prewarm` and `timing.speculation`. The kit records both, as a check.

## The VM change (unattended upgrades)

**What happened at 06:25 UTC.**
- `apt-daily-upgrade` ran unattended-upgrades, which installed one package, zlib1g.
- needrestart's apt hook was in its package default (`$nrconf{restart}` unset, so `i`). Without a terminal, that
  restarted the services linked to the old library:
  - PostgreSQL;
  - `voicelab`;
  - `vp-stage-runtime`;
  - rsyslog, polkit, walinuxagent and others.
- `vp-stage-control` exited on the dropped DB connection. systemd restarted it 3 s later. See
  `../judge-blind10/README.md` and "For the integrator" below.

**Run Command `vps7-hygiene`, 06:57:47 UTC.** Package versions: needrestart 3.6-7ubuntu4.5, unattended-upgrades
2.9.1+nmu4ubuntu1, Ubuntu 24.04.5 LTS. The change is two new files; nothing else was edited.

| File | Content | sha256_16 |
|---|---|---|
| `/etc/needrestart/conf.d/90-vp-list-only.conf` | `$nrconf{restart} = 'l';` (list only, never restart), with a comment saying why | `0c922063e5de7452` |
| `/etc/apt/apt.conf.d/52vp-no-auto-reboot` | `Unattended-Upgrade::Automatic-Reboot "false";`, with a comment | `243d9b4619800548` |

**Before and after:**

| Check | Before | After |
|---|---|---|
| needrestart effective restart mode (the config files evaluated in needrestart's order: `needrestart.conf`, then `conf.d/*.conf`) | `i` (package default) | **`l`** |
| `apt-config dump`: `Unattended-Upgrade::Automatic-Reboot` | not set (only a commented line in `50unattended-upgrades`) | **`"false"`** |
| `APT::Periodic::Unattended-Upgrade` / `Update-Package-Lists` | `"1"` / `"1"` | `"1"` / `"1"` (unchanged) |
| Allowed origins | `noble`, `noble-security`, ESM apps-security, ESM infra-security | unchanged |
| `unattended-upgrades` service, `apt-daily-upgrade.timer` | enabled, enabled (next run Sun 06:00:14 UTC + random delay) | enabled, enabled |

- **`needrestart -b -r l`** (batch, list only) exited 0. It restarted nothing and listed 4 services as running an old
  library:
  - `dbus`;
  - `networkd-dispatcher`;
  - `systemd-logind`;
  - `unattended-upgrades`.

  They were left alone; the 06:25 run had skipped them too.
- **Re-checked** at 07:02 (`deploy_post7.sh`) and at 07:27 (`final_health7.sh`): mode `l`, Automatic-Reboot `"false"`.
- **Residual risk, not removed.** A package's own maintainer script still restarts its own service when that package is
  upgraded: a `postgresql-16` security update restarts PostgreSQL. needrestart's setting does not govern that.
  - The kit's runs print every unit's start time and restart count before and after, so such a restart cannot pass
    unseen.
  - The next `apt-daily-upgrade` is due Sun 25 Oct from 06:00 UTC, outside the planned 18:30–20:30 UTC window.

## Health

| When | Lab (`voicelab`) | Staging |
|---|---|---|
| 06:57 (before) | active since 06:25:49 (the OS restart), 0 restarts; `/api/ping` 200 locally and publicly | 680c5e6; control active since 06:25:52 with 1 restart (the 06:25 crash), runtime since 06:25:49; PostgreSQL since 06:25:51; 0 active calls |
| 07:02 (deploy) | active, ping 200 both ways, not restarted by the deploy | 6b0d859; both units since 07:02:07, 0 restarts |
| 07:27 (`vps7-health-after-deploy`) | active, 0 restarts; ping 200 (public 37 ms); 0 lab error lines since the deploy | 6b0d859, `VERTEX_OFF=0`; 0 restarts. 0 runtime tracebacks, 0 control error lines, 0 non-2xx / gave-up / 422 since the deploy. 401 without auth, 200 with it. 0 drop-ins, 0 judge env vars, 0 turn-taking overrides. 0 test calls since the deploy |

At 07:27, load was 0.18, 837 MB of RAM was used and the disk held 5.4 of 29 GB. 80, 443 and 8443 are Caddy, public;
5432, 8080, 8090 and 8091 are on 127.0.0.1 only.

## The remeasure, ready to run after 18:30 UTC

```
bash research/2026-10-24/staging/ops/drive7.sh /dev/shm/wt-stage4 <scratchpad>/stage5
```

**What it does.**
- It renews the SAS if fewer than 4 h are left. Today's expires at 19:07 UTC.
- It uploads `tools7/bargein.py` as `vps7-kit.tgz`.
- It sends one Run Command per run (`ops/run7.tmpl.sh`), one at a time, stopping at the first run that fails. Then it
  runs `ops/final_health7.sh`, fetches the outputs from blob and runs `ops/analyze7.py`.

**Guards in each run, all before the first call:**
- staging is at 6b0d859, with no drop-in and no judge model;
- no active call;
- the lab has not used Vertex in the last 180 s;
- this job's test spend since its start, plus the run's estimate (₹4.50 a call), stays within ₹120;
- today's IST spend leaves the product's ₹50 reservation.

Each run restarts the runtime first (the reply-gap.md method), then prints the unit start times and restart counts
before and after.

| Run | Calls | What | Expected ₹ (e9fdde3 rates) |
|---|---|---|---|
| gap v2-flashlite | 4 | reply gap + openings | ~10 |
| gap v2-mai | 4 | reply gap + openings | ~14 |
| gap v2-54mini | 4 | reply gap + openings | ~13 |
| barge v2-flashlite | 4 + 2 | barge-in and nods | ~15 |
| barge v2-mai | 3 | barge-in and nods | ~11 |
| barge v2-54mini | 3 | barge-in and nods | ~10 |
| **Total** | 24 | | **~73** (job cap ₹120; IST-day cap ₹200) |

**Method, mirroring `reply-gap.md`.**
- **Reply gap.** The deployed `ops/tools/verify_calls.py` wraps `replygap.py`'s caller without changing it: the same
  clips, waits, personas P1/P4 and six caller turns. That gives the gap rows and the opening checks in one pass, on new
  agents `Remeasure 6b0d859 <stack>` from the renewal template.
  - It uses the shipped defaults only. An A/B is not needed: e9fdde3's arms A (defaults then) and B (both flags off)
    are the comparison, both in `reply-gap-summary.json`.
  - The gap is `reply.latencyMs` on the socket. The median CI is a bootstrap (10,000 resamples, seed 20261024).
  - Stages come from the runtime's own `timing`.
  - Pacer waits are split by request kind.
  - The opening's time to first audio is recorded, with the Vertex requests before it. That checks the call-start HEAD
    is gone.
- **Openings** (on the 12 gap calls), using the deployed code's own predicates:
  - exactly one AI disclosure;
  - the contact's name, "आशा जी", with no wrong name;
  - no guidance read aloud, no blank name;
  - **the brand:** the seed workspace's spoken name, "Saanjh Services", written in Latin letters ("Saanjh") or
    Devanagari ("सांझ"). Residual misspellings are checked with `names.repair_brand`. The runtime's own repairs
    ("brand respelled" journal lines) are counted per call.
- **Barge-in** (`tools7/bargein.py`). The same caller and agents, with some clips played over her:
  - **Nods:** हम्म, हाँ, हम्म…, ok, Ok, हँ, ம்ம்ம், 160–460 ms of speech each.
  - **Barge-ins:** 9 real caller turns, among them "Sorry sorry, एक second…", "बेटा रुको…", "रुकीं रुकीं…".
  - Each clip starts 2.0 s into her opening, or 1.2 s into a reply, while at least 1.5 s (barge) or 1.2 s (nod) of her
    audio is still queued. Each call has 5–6 such events: over the 12 barge calls, 30 barge-ins and 36 nods are
    planned, fewer after skips.
  - **Stop time** = the clip's speech onset (first 20 ms frame above -38 dBFS, the turn bench's rule) sent on the socket
    → her `flush` received. Both run on the VM, so these are the runtime's times within a few ms.
  - **Missed** = no flush within 1.5 s while she was still playing. A reply that ran out first is "ended_unstopped" and
    leaves the n.
  - **False stop on a nod** = she gives way: that reply never plays again and never completes. A pause and resume is
    not a false stop. Its pause length is reported, as the bench reports its ~0.64 s cost.
  - "Resumed over a real interruption" is counted too: the bench's 5/55.
  - The runtime's own counts (`timing.barge`: pauses, resumes, stops) are kept per call, to check against what the
    socket saw.
- **Keep rate.** Speculation is off by default on every stack at this head. So the runtime's `timing.speculation` is
  expected to say enabled false and started 0, and there is no keep rate to measure. The kit records it anyway.

**Comparisons the results will be read against:**
- e9fdde3 on staging (`reply-gap.md`). Arm A medians: flashlite 3,201, mai 2,658, 54mini 2,128 ms. Arm B: flashlite
  2,301, mai 2,054 ms.
- The turn bench TEST for barge-in from audio (4995b8b, n = 55 barges, 165 nods): stop 256 ms, 0/165 false stops on
  nods, 5/55 missed.
- The **~730 ms** figure (`open.2026-10-23.voice-barge-long-ms-on-staging`) was not measured on staging. It is the
  bench's word rule, TEST n = 55: 725 ms, CI 708–739. Staging has never had a barge-in measured. The kit's run would be
  the first.

**What was tested without spend.**
- **The analysis on e9fdde3's own files.** `GAPF='vps4-gap-{s}-r1-{s}-r1.jsonl'` on that job's data gives back the
  published arm A rows exactly:
  - p50, CI, p90 and n;
  - every stage median;
  - pacer waits by kind (flashlite 3,201 (2,977–3,260), 3,277, 22; brain 1,588).
- **The barge driver against a local devsim.** `tools7/dry_devsim.sh`: fake providers, the real cascade and Silero VAD,
  devsim's voice lengthened to 70 ms per character. 3 runs of 2 calls.
  - Overlay timing, stop timing, resume and give-way detection all worked.
  - In 13 of the 14 pauses, the flush came 222–475 ms after onset; one came at 1,247 ms.
  - Devsim's fake ears hear every stretch of speech as "Haan ji, boliye.", so these outcomes say nothing about the real
    recogniser. Only the mechanics were tested.
- **The run template**, filled and syntax-checked. It has not run on the VM, because its first step is a test call.

## For the integrator

- **The control plane exits when PostgreSQL restarts.** This is product code, not changed here.
  - `product/server/db.ts` makes `new pg.Pool(...)` with no `pool.on('error', …)`.
  - At 06:25 the server's idle clients got "terminating connection due to administrator command". node-pg then emitted
    an unhandled `error` event on the pool, and the process exited 1.
  - systemd's `Restart=always` brought it back in 3 s. In production, every DB failover would drop in-flight requests
    the same way.
  - A pool error handler (log and let the pool reconnect) is the usual fix.
- **Run the kit after 18:30 UTC from this container.** The keys it needs (SAS signing, `vp-stage.env`, the Azure SP)
  exist only in this session's scratchpad. A fresh session cannot run it. The SAS expires at 19:07 UTC, and the kit
  renews it.

## Spend

- This job so far: **₹0**. No model calls and no test calls. The deploy and the health checks have no metered cost.
- The kit's plan: ~₹73. It stops before a run that would take the job past ₹120.

## Not measured

Everything that needs a call, blocked by the daily test budget until 18:30 UTC:
- the reply gap per stack (p50, p90, n) and its stage breakdown;
- barge-in stop time, missed barge-ins and false stops on nods;
- the openings: disclosure, name, guidance, brand;
- the keep rate;
- `partialLagMs` at this head;
- whether the call-start HEAD is gone in practice.

Not measured by design: real phone lines (the sim caller streams 16 kHz clips over the browser socket on the same VM).

## Files

- `remeasure-6b0d859.md`: this file.
- `ops/vm_hygiene.sh`: the VM change, with before and after.
- `ops/deploy_post7.sh`: part 4 of the deploy. Parts 1–3 are unchanged (`ops/deploy_pre.sh`,
  `../../2026-10-23/staging/ops/stage_setup.sh`, `ops/deploy_post.sh`).
- The kit:
  - `ops/drive7.sh`;
  - `ops/run7.tmpl.sh`;
  - `ops/final_health7.sh`;
  - `ops/analyze7.py`;
  - `ops/tools7/bargein.py`;
  - `ops/tools7/dry_devsim.sh`.
- The Run Command wrapper is `../judge-blind9/ops/ops9.py`: SAS and `vp-stage.env` as protected parameters only. It
  prunes by each record's own start time. 20 records exist now, all Succeeded, none active; none was pruned.
