# Vyakti web app

React 19 + esbuild, no UI library. `node product/web/build.mjs` writes `dist/`; `server/main.ts` serves it. Every page action is one tool call (`POST /v1/tools/:name`).

## Run it against the real server

```sh
eval $(sh product/scripts/pg-test.sh vp_web_real)        # throwaway Postgres, migrated
export VP_SECRET_KEY=$(openssl rand -hex 32)             # REQUIRED: API keys and integrations are sealed with it. A generated dev value, never a real one.
export VP_RUNTIME_SECRET=rt-$(openssl rand -hex 24)      # signs the voice runtime's reports to /hooks/runtime
node product/web/build.mjs
PORT=8788 node --import tsx product/web/dev/serve.ts     # the real control plane; only the Operator's model is scripted
node --import tsx product/web/dev/seed.ts                # sign up and make sample data through the real tools
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node product/web/dev/shots.mjs   # screenshots at 390x844 and 1440x900 into web/shots/
```

Sign in as `asha@saanjh.example` / `sample-password-1234` (synthetic). Use `server/main.ts` with `VP_LLM_FAKE=1` instead of `serve.ts` for no scripted model at all.
`seed.ts` also posts four sample calls through the signed runtime hook, because a sandbox has no telephony; it needs the same `VP_RUNTIME_SECRET` as the server.

## Gates

- `npx tsc -p product/tsconfig.json` and `npx tsc -p product/web/tsconfig.json`
- `node --import tsx product/scripts/ui-contract.ts --strict` (every tool the UI calls is registered; also run by `tests/web.test.ts`)
- `node --import tsx --test product/tests/web.test.ts` (build size, contrast, no colour literals, approver map, tool list, contract)
- `sh product/web/e2e/run.sh`: browser tests against the real server and a fresh database, eleven flows (API key reveal-once, learning propose/simulate/accept, DPDP erase, A3 pause/resume/stop, an A2 card from the Operator chat). It skips with a message when there is no Chromium or no Postgres 16.
