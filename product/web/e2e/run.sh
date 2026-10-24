#!/bin/sh
# Browser tests for the flows a unit test cannot see: they drive the real UI against the real server (all modules, a fresh
# throwaway Postgres, a scripted Operator model) and assert both what the screen shows and what the server holds.
#   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers sh product/web/e2e/run.sh
# Exit 0 on pass or skip. A skip prints why (no browser or no Postgres on this machine).
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT" || exit 1
node product/web/e2e/precheck.mjs; rc=$?
[ "$rc" = 3 ] && exit 0
[ "$rc" != 0 ] && exit "$rc"
PGB=${PGB:-/usr/lib/postgresql/16/bin}; D=/tmp/vp-pgtest; DB=vp_web_e2e
sh product/scripts/pg-test.sh "$DB" > /dev/null
"$PGB/dropdb" -h "$D" -p 55432 -U vp --if-exists "$DB" && sh product/scripts/pg-test.sh "$DB" > /tmp/vp-e2e-env.sh || exit 1
. /tmp/vp-e2e-env.sh
# Generated dev values only: never a real secret. VP_SECRET_KEY is required for API keys and integrations.
VP_SECRET_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
VP_RUNTIME_SECRET=rt-$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
PORT=${PORT:-8799}
# The curated analysis models, as a deployment sets them (the judge editor offers these; analysis itself runs on the dev server's sample).
VP_ANALYSIS_MODELS=gpt-4.1-mini,gpt-4.1
export VP_SECRET_KEY VP_RUNTIME_SECRET PORT DATABASE_URL VP_ANALYSIS_MODELS
# The CRM import flow starts a fake HubSpot and Zoho CRM on this port (product/web/dev/fake-crm.mjs); the server reads it.
VP_CRM_FAKE_URL="http://127.0.0.1:$((PORT + 3))"; export VP_CRM_FAKE_URL
# The same fake serves a published Google Sheet (CSV link) for the Sheets flow.
VP_SHEETS_FAKE_URL="$VP_CRM_FAKE_URL"; export VP_SHEETS_FAKE_URL
# The company-data flow serves a fixture website on 127.0.0.1; the server may read private addresses in this test run only.
VP_FETCH_ALLOW_PRIVATE=1; export VP_FETCH_ALLOW_PRIVATE
node product/web/build.mjs > /dev/null || exit 1
# A server already answering on this port (a previous run still shutting down) would be tested instead of ours, against a database we just dropped.
curl -sf "http://localhost:$PORT/v1/health" > /dev/null && { echo "port $PORT is already serving: a previous run is still shutting down; wait a few seconds and run again"; exit 1; }
# The real voice runtime on fake providers (python -m vpvoice.devsim) takes the browser test calls, so "Call me in the
# browser" runs end to end against a fake microphone. Skipped (and that flow with it) when no Python has its packages.
PY=${VP_VOICE_PYTHON:-python3}; DEVSIM=""
DEVSIM_PORT=$((PORT + 2))
if "$PY" -c "import aiohttp, numpy" 2>/dev/null; then
  REC_DIR=$(mktemp -d /tmp/vp-e2e-rec.XXXXXX)
  (cd product/voice && VP_DEVSIM=1 VP_RUNTIME_SECRET="$VP_RUNTIME_SECRET" VP_CONTROL_URL="http://localhost:$PORT" PORT=$DEVSIM_PORT \
    VP_PUBLIC_URL="http://127.0.0.1:$DEVSIM_PORT" VP_RECORDINGS_DIR="$REC_DIR" VP_LOG_LEVEL=WARNING exec "$PY" -m vpvoice.devsim) > /tmp/vp-e2e-devsim.log 2>&1 &
  DEVSIM=$!
  # The call page plays recordings from links the server signs on the runtime's public address (here, devsim itself).
  export VP_DEVSIM_URL="http://127.0.0.1:$DEVSIM_PORT" VP_RUNTIME_PUBLIC_URL="http://127.0.0.1:$DEVSIM_PORT"
else echo "no Python with aiohttp + numpy: the browser call flow is skipped"; fi
node --import tsx product/web/dev/serve.ts > /tmp/vp-e2e-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER $DEVSIM 2>/dev/null; [ -n "$REC_DIR" ] && rm -rf "$REC_DIR"' EXIT INT TERM
[ -n "$DEVSIM" ] && { i=0; until curl -sf "$VP_DEVSIM_URL/v1/health" > /dev/null; do i=$((i+1)); [ $i -gt 60 ] && { echo "devsim did not start"; cat /tmp/vp-e2e-devsim.log; exit 1; }; sleep 0.5; done; }
i=0; until curl -sf "http://localhost:$PORT/v1/health" > /dev/null; do i=$((i+1)); [ $i -gt 60 ] && { echo "server did not start"; cat /tmp/vp-e2e-server.log; exit 1; }; sleep 0.5; done
node --import tsx product/web/dev/seed.ts "http://localhost:$PORT" || exit 1
BASE="http://localhost:$PORT" node --test --test-concurrency=1 product/web/e2e/flows.test.mjs
