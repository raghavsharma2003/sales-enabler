# VP private staging on the India lab VM (2026-10-23)

The product (`product/`: control plane, web app, voice runtime) runs privately on the existing voice-lab VM, next to the
lab and separate from it. Synthetic data only. No phone line: Plivo is not configured, so nothing can dial.

## Where it runs

| | |
|---|---|
| Host | `vl-vm-cin` (Standard_D2as_v5: 2 vCPU, 7.9 GB RAM, 29 GB disk), Central India, resource group `vp-research-rg`. No new paid resource. |
| Headroom before install (19:08 UTC) | CPU busy 0% over 10 s, load 0.06; RAM 654 MB used, 7,277 MB available; disk 3.2 GB used, 25 GB free. Lab `voicelab` + `caddy` active, `/api/ping` 200 locally and on the public URL. Go. |
| After install (19:18 UTC) | RAM 901 MB used, 7,031 MB available; disk 4.8 GB used, 24 GB free. |
| End of job (21:35 UTC) | Lab `voicelab` active since 2026-10-22 06:48 UTC with 0 restarts (unchanged), `/api/ping` 200 locally and on the public URL, 0 error lines in its journal since 19:00; `caddy`, both staging units and Postgres active; load 0.16; RAM 891 MB used, 7,041 MB available; disk 4.8 GB used. |
| Code | `git archive` of the branch at `46dbbe7` (`product/`, the root `package.json`/`package-lock.json`, the lab's Silero VAD model, the synthetic caller clips) in `/opt/vp-stage/app`; Node 22 in `/opt/vp-stage/node`; Python venv `/opt/vp-stage/venv` (`product/voice/requirements.txt`). Owner `vpstage` (system user). |
| Control plane | systemd `vp-stage-control`: `node --import tsx product/server/main.ts`, bound to `127.0.0.1:8091` (a preload, `tools/bind-local.mjs`, pins `listen()` to loopback). Serves the built web app. Jobs on. |
| Voice runtime | systemd `vp-stage-runtime`: `python -m vpvoice` through `tools/run_runtime.py`, bound to `127.0.0.1:8090`, `VP_MAX_CALLS_PER_PROCESS=4`. |
| Database | Postgres 16 (Ubuntu package, listens on `localhost` only), database `vp_stage`, role `vpstage` (peer auth over the unix socket). All 33 migrations applied. |
| Proxy | The lab's Caddy. A second site, `/etc/caddy/vp-stage.caddy`, is imported at the end of `/etc/caddy/Caddyfile`: port **8443** on the lab's hostname, HTTP basic auth (user `vp`), `/rt/*` to the runtime, everything else to the control plane. NSG rule `allow-8443` (priority 102) on `vl-nsg`. The lab's own site on 443 is unchanged. `voicelab/ops/vm_setup.sh` now re-adds the import line when the staging file exists, so a lab redeploy keeps staging reachable. |
| Secrets | `/opt/vp-stage/.env` (mode 600, owner `vpstage`): fresh `VP_SECRET_KEY` and `VP_RUNTIME_SECRET` generated on the VM; the provider keys are copied on the VM from `/opt/voicelab/.env` (nothing re-sent); the Vertex service account is copied on the VM from the lab's file to `/opt/vp-stage/vertex-sa.json` (mode 600). The basic-auth passcode (`VP_STAGE_PASS`) is in that file and in the scratchpad's `vp-stage.env` (mode 600). It is not in the repo. |

Runtime settings that matter: `VP_REGION=centralindia`, `VERTEX_LOCATION=global`, `VERTEX_LIVE_LOCATION=us-central1`,
`VERTEX_LIVE_AUDIO=mediaChunks`, the lab's `VERTEX_MODEL_MAP`. `VERTEX_OFF=1` until 20:00 UTC on 2026-10-23, then `0`
(left at `0`, with the pacer on, so the owner can try the Gemini stacks; set it back to `1` and restart
`vp-stage-runtime` to stop all Vertex traffic from staging).
No Plivo, no Sarvam key, no crisis-judge model (`VP_LLM_SAFETY_JUDGE_*` unset, so the runtime judge makes no calls), and no
control-plane model (`VP_LLM_*` unset), so the Operator chat answers that no model is configured. Choosing the Operator's
model and its spend is left to the owner.

**Vertex pacing.** `tools/pace.py` wraps the runtime's HTTP client: every request or websocket to
`*aiplatform.googleapis.com` starts at least 1.0 s after the previous one (`VP_STAGE_PACE_S`), process-wide, and each start
is logged with the wait it imposed (`/opt/vp-stage/data/vertex-pace.jsonl`: time, wait, brain/voice/live; no content). A
cap of 2,500 Vertex requests per process lifetime fails further ones closed (`VP_STAGE_VERTEX_MAX`). This holds the
appeal's 1 request/s on staging even when a human tests it. It also adds delay inside a reply when two Vertex requests
fall within a second, which the reply-gap measurement reports separately.

## How to reach it

- `https://vp-voicelab-1019.centralindia.cloudapp.azure.com:8443/`: basic auth `vp` + the passcode, then the app's own
  sign-in with the synthetic seed account from `product/web/README.md`.
- The runtime's media sockets are under `/rt/` on the same origin (`VP_PUBLIC_URL=https://…:8443/rt`), so a browser
  test call from the app goes through the same basic auth.
- The seed (`product/web/dev/seed.ts`) made the "Saanjh Services" workspace: three agents from templates, a synthetic
  8-row CSV, audiences, two campaign drafts, knowledge, a top-up left for approval, and four sample calls posted through
  the signed runtime hook. The reply-gap runs added agents named `Reply gap <stack>` and their test calls.

Verified from the VM (19:18 and 19:36 UTC): the voice runtime's unit suite passes on this host (200/200, Python 3.12.3,
2 CPU; door p50 1.86 ms with the cross-sentence join, `bench/door_bench.py`); the page, its JS and CSS, sign-in (a
`Secure; HttpOnly` session cookie), `/v1/me` and `agent.list` all work through the public hostname on 8443;
`/v1/health` 200 on both services; through the public hostname on 8443, `/` 401
without auth and 200 with it (the page title is the app's), `/v1/health` 200, `/rt/v1/health` 200; ports 8090, 8091
and 5432 listen on 127.0.0.1 only. **Not verified from the sandbox:** its egress proxy does not carry HTTPS on ports
other than 443 (the connection is reset at the proxy), so an outside client reaching 8443 was not shown from here.

## Operate

```
# from the sandbox (research/2026-10-23/staging/ops; the wrapper passes only the SAS and vp-stage.env to Run Command,
# and refuses to start while another Run Command is active on the VM)
python3 ops.py put vp-stage-bundle.tgz vp-stage-bundle.tgz     # git archive HEAD product package.json package-lock.json
python3 ops.py put vp-stage-tools.tgz vp-stage-tools.tgz       #   voicelab/server/models/silero_vad.onnx + caller clips; tools/
python3 ops.py run vps-deploy-N stage_setup.sh 1800            # idempotent redeploy; keeps the DB and the generated secrets
# on the VM
systemctl restart vp-stage-control vp-stage-runtime
journalctl -u vp-stage-runtime -n 50
```

Teardown: `ops/teardown.sh` through Run Command (stops and removes both units, the Caddy site and its import line with a
graceful reload, the database and role, `/opt/vp-stage` and the user; the lab is untouched), then delete the NSG rule
`vl-nsg/securityRules/allow-8443`. Postgres 16 was installed for staging only; purging it is optional.

## Files here

- `ops/`: the scripts that did this. Deploy and operate: `stage_setup.sh`, `health.sh`, `final_health.sh`,
  `websmoke.sh`, `vtests.sh`, `teardown.sh`, `ops.py` (the Run Command wrapper). Measure: `dryrun.sh` (one call on a
  built stack of Azure-only parts, before 20:00 UTC, to prove the path with no Google traffic), `run_stack.tmpl.sh`
  (per stack), `judge.tmpl.sh` (judge eval per model), `analyze.py`. Diagnose: `timeline.sh`, `tonecheck.sh`,
  `vprobe.sh`, `flashprobe.sh`. VM-side tools: `tools/bind-local.mjs`, `tools/pace.py`, `tools/run_runtime.py`,
  `tools/replygap.py`. No keys: the SAS and the passcode arrive as Run Command protected parameters, and the probe
  scripts look their model up from the runtime's own stack table. Run Command keeps at most 25 per VM; `ops.py` prunes
  before a PUT would fail (a failed PUT cost one 12-minute stall during this job).
- `reply-gap.md`, `reply-gap.csv`: the product runtime's reply gap per stack.
- `../judge-eval/<label>/`: the crisis-judge eval reports.
