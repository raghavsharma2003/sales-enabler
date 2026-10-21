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
export VP_SECRET_KEY VP_RUNTIME_SECRET PORT DATABASE_URL
node product/web/build.mjs > /dev/null || exit 1
node --import tsx product/web/dev/serve.ts > /tmp/vp-e2e-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
i=0; until curl -sf "http://localhost:$PORT/v1/health" > /dev/null; do i=$((i+1)); [ $i -gt 60 ] && { echo "server did not start"; cat /tmp/vp-e2e-server.log; exit 1; }; sleep 0.5; done
node --import tsx product/web/dev/seed.ts "http://localhost:$PORT" || exit 1
BASE="http://localhost:$PORT" node --test --test-concurrency=1 product/web/e2e/flows.test.mjs
