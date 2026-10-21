// Scale: a 50,000-row CSV (about 3.5 MB, synthetic numbers +91 90000 00000..49999) is uploaded in parts over
// HTTP and imported in one transaction, then imported again (the update path). Correctness (every row lands once,
// verdicts and counts right) is always checked. Speed is a measurement, not a gate: wall-clock under a shared
// runner measures the runner (a loaded 2-core CI box took 155 s). Set VP_PERF=1 to assert the 60 s bound, which holds
// alone on the 4-vCPU sandbox (about 20 s fresh, 8-13 s re-import; measure.2026-10-21.intake-50k-import).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry } from '../server/tools.ts';
import { module as intake } from '../server/modules/intake/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
const N = 50_000;
const PERF = process.env.VP_PERF === '1';
const BUDGET_MS = 60_000;
let pool: pg.Pool, reg: Registry, base = '', close = () => {};

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const app = buildApp(pool, [intake]);
  reg = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.server.close();
});
after(async () => { close(); await pool?.end(); });

function file(round: number): string {
  const langs = ['Hindi', 'English', 'Hinglish', 'Tamil'];
  const lines = ['Customer Name,Mobile No,Language,Amount Due,Due Date,Plan,Consent'];
  for (let i = 0; i < N; i++) {
    const n = String(i).padStart(5, '0');
    // Mixed formats on purpose; every 1000th row is Excel-mangled.
    const phone = i % 1000 === 999 ? '9.00000E+09' : i % 3 === 0 ? `+91 90000 ${n}` : i % 3 === 1 ? `090000${n}` : `90000${n}`;
    lines.push(`Person ${i},${phone},${langs[i % 4]},${(i % 97) * 100 + round},${String(1 + (i % 28)).padStart(2, '0')}/11/2026,${i % 2 ? 'gold' : 'silver'},${i % 5 ? 'yes' : 'no'}`);
  }
  return lines.join('\n') + '\n';
}

async function upload(text: string, member: string): Promise<string> {
  let uploadId: string | undefined, part = 0, at = 0;
  while (at < text.length) {
    let end = Math.min(text.length, at + 900_000);
    if (end < text.length) end = text.lastIndexOf('\n', end) + 1;
    part++;
    const r = await fetch(base + '/v1/uploads/contacts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-dev-member': member },
      body: JSON.stringify({ text: text.slice(at, end), uploadId, part, final: end >= text.length, filename: 'big.csv' }) });
    assert.ok(r.status === 201 || r.status === 202, `part ${part}: ${r.status}`);
    uploadId = ((await r.json()) as { uploadId: string }).uploadId;
    at = end;
  }
  return uploadId!;
}

test(`a ${N}-row import lands every row once, and so does re-importing it${PERF ? ` (each commit within ${BUDGET_MS / 1000} s)` : ''}`, { skip, timeout: 900_000 }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('scale') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `s${Math.random()}@example.test`]))!.id;
  const actor = { type: 'member' as const, id: owner, role: 'owner' as const };
  const times: Record<string, number> = {};
  for (const round of [1, 2]) {
    const text = file(round);
    let t = Date.now();
    const uploadId = await upload(text, owner);
    times[`upload_${round}_ms`] = Date.now() - t;
    t = Date.now();
    const map = await reg.execute<any>(pool, 'source.map', { uploadId }, { workspaceId: ws, actor });
    times[`map_${round}_ms`] = Date.now() - t;
    assert.equal(map.status, 'confirmed');
    t = Date.now();
    const r = await reg.execute<any>(pool, 'source.commit', { uploadId, consentPurpose: 'payment_reminder' }, { workspaceId: ws, actor });
    times[`commit_${round}_ms`] = Date.now() - t;
    assert.equal(r.status, 'confirmed', JSON.stringify(r));
    const c = (r as any).result.counts;
    assert.equal(c.rows, N);
    assert.equal(c.reason_SCI_NOTATION, N / 1000);
    if (round === 1) assert.equal(c.new, N - N / 1000);
    else { assert.equal(c.new, 0); assert.equal(c.updated, N - N / 1000); }
    if (PERF) assert.ok(times[`commit_${round}_ms`] < BUDGET_MS, `commit took ${times[`commit_${round}_ms`]} ms`);
    times.bytes = text.length;
  }
  const n = await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM contact WHERE workspace_id = $1', [ws]);
  assert.equal(Number(n!.n), N - N / 1000);
  console.log('[intake-scale]', JSON.stringify(times));
});
