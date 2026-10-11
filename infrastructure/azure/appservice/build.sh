#!/usr/bin/env bash
set -euo pipefail

npm run build

./node_modules/.bin/esbuild scripts/bootstrap-db.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/bootstrap-db.cjs
./node_modules/.bin/esbuild scripts/readiness.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/readiness.cjs
./node_modules/.bin/esbuild scripts/voice-gateway.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/voice-gateway.cjs
./node_modules/.bin/esbuild scripts/voice-live-gateway.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/voice-live-gateway.cjs
./node_modules/.bin/esbuild scripts/private-voice-supervisor.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/private-voice-supervisor.cjs

mkdir -p .next/standalone/.next app_data/jobs/continuous/private-voice-supervisor
rm -rf .next/standalone/.next/static .next/standalone/public
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
cp infrastructure/azure/appservice/private-voice-supervisor-run.sh app_data/jobs/continuous/private-voice-supervisor/run.sh
cp infrastructure/azure/appservice/private-voice-supervisor-settings.json app_data/jobs/continuous/private-voice-supervisor/settings.job
chmod 700 app_data/jobs/continuous/private-voice-supervisor/run.sh

test -f .next/standalone/server.js
test -f dist/bootstrap-db.cjs
test -f dist/voice-gateway.cjs
test -f dist/voice-live-gateway.cjs
test -f dist/private-voice-supervisor.cjs
