// Exit 0 if the browser tests can run here; otherwise print why and exit 3 (the runner and CI treat 3 as "skipped, with this message").
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const need = [];
let pw = null;
for (const base of [import.meta.url, 'file:///opt/node-tools/node_modules/']) { try { pw = createRequire(base)('playwright'); break; } catch { /* try the next place */ } }
if (!pw) need.push('the playwright package is not installed');
else { const exe = process.env.CHROME ?? pw.chromium.executablePath(); if (!existsSync(exe)) need.push(`no Chromium at ${exe} (set PLAYWRIGHT_BROWSERS_PATH or CHROME; do not run playwright install in CI)`); }
if (!existsSync((process.env.PGB ?? '/usr/lib/postgresql/16/bin') + '/initdb')) need.push('Postgres 16 binaries not found (set PGB)');
if (need.length) { console.log('SKIP web e2e: ' + need.join('; ')); process.exit(3); }
