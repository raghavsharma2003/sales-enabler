// The workspace notifier and timers never keep a process alive (rejected.2026-10-24.notifier-listen-client-hangs-bench):
// a process that builds the app with them running, then shuts down, exits by itself within seconds, whether it closes the
// server (graceful shutdown, which runs the modules' stop()) or only ends the pool (a bench or script). Real Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
const child = fileURLToPath(new URL('./fixtures/notifier-shutdown.ts', import.meta.url));

function runChild(mode: string): Promise<{ code: number | null; ms: number; out: string; timedOut: boolean }> {
  return new Promise(resolve => {
    const t0 = Date.now();
    const p = spawn(process.execPath, ['--import', 'tsx', child, mode], { env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const kill = setTimeout(() => { p.kill('SIGKILL'); resolve({ code: null, ms: Date.now() - t0, out, timedOut: true }); }, 20_000);
    p.on('exit', code => { clearTimeout(kill); resolve({ code, ms: Date.now() - t0, out, timedOut: false }); });
  });
}

for (const mode of ['close', 'pool-only']) {
  test(`a process with the notifier listening exits by itself after shutdown (${mode})`, { skip }, async () => {
    const r = await runChild(mode);
    assert.match(r.out, /listening=1/, 'the LISTEN connection was up before shutdown: ' + r.out);
    assert.equal(r.timedOut, false, `the process was still alive 20 s later:\n${r.out}`);
    assert.equal(r.code, 0, r.out);
    console.log(`[measure] ${mode}: exited ${r.ms} ms after start`);
  });
}
