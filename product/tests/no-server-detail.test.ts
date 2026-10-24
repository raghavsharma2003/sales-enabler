// What a member, an API caller or an MCP client reads never names an environment variable, a server file path or a stack
// frame (rejected.2026-10-24.telephony-disabled-env-var-in-refusal). Setup problems are plain words plus a code; the
// operator's hint goes to the server log. Every module's tools are run here with the server's setup missing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { publicReason, SERVER_DETAIL } from '../server/setup-error.ts';
import { PlivoTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server');
const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
const STRIP = ['VP_SECRET_KEY', 'VP_TELEPHONY_LIVE', 'VP_LLM_FAKE', ...Object.keys(process.env).filter(k => k.startsWith('VP_LLM_'))];
const saved: Record<string, string | undefined> = {};
let pool: pg.Pool, registry: Registry;
before(() => {
  for (const k of STRIP) { saved[k] = process.env[k]; delete process.env[k]; }
  setFakeLlm(null);
  if (skip) return;
  pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, modules).registry;
  setTelephony(new PlivoTelephony());      // the real adapter, switched off: what a server without a carrier runs
});
after(async () => { setTelephony(null); for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; await pool?.end(); });

const files = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });

test('no thrown error in the server names an environment variable, except a SetupError\'s logged hint', () => {
  const bad: string[] = [];
  for (const f of files(SERVER)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const thrown = /throw new (\w+)\((.*)/.exec(line);
      if (!thrown) return;
      // A SetupError's first argument is what a member reads; its hint (third) may name the variable.
      const said = thrown[1] === 'SetupError' ? (/^\s*(['`"])((?:\\.|(?!\1).)*)\1/.exec(thrown[2])?.[2] ?? '') : thrown[2];
      if (/\bVP_[A-Z][A-Z0-9_]+/.test(said)) bad.push(`${relative(SERVER, f)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('number search with no carrier: plain words and code telephony_disabled, never the variable to set', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('no detail test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const r = await registry.execute<any>(pool, 'number.search', {}, { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } });
  assert.equal(r.status, 'not_executed', JSON.stringify(r));
  if (r.status !== 'not_executed') return;
  assert.equal(r.code, 'telephony_disabled');
  assert.match(r.reason, /Phone lines are not switched on/);
  assert.doesNotMatch(r.reason, /VP_|credentials|server/i);
});

test('every tool, run by an owner with the server\'s setup missing: no refusal or result carries server detail', { skip, timeout: 120_000 }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('every tool') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  // The registry's backstop replaces a leaking reason and logs it: a leak shows up in the log, so watch the log too.
  const warned: string[] = [], warn = console.warn;
  console.warn = (...a: unknown[]) => { const s = a.map(String).join(' '); if (s.includes('carried server detail')) warned.push(s); };
  const leaks: string[] = [], slow: string[] = [];
  try {
    for (const t of registry.list()) {
      for (const input of [{}, { id: '00000000-0000-4000-8000-000000000000' }]) {
        const r = await Promise.race([registry.execute(pool, t.name, input, ctx), new Promise<null>(res => setTimeout(() => res(null), 5000))]);
        if (!r) { slow.push(t.name); continue; }
        const text = r.status === 'confirmed' ? JSON.stringify(r.result) : r.status === 'needs_approval' ? r.summary : r.reason;
        if (text && SERVER_DETAIL.test(text)) leaks.push(`${t.name}: ${text.slice(0, 200)}`);
        if (r.status === 'needs_approval') await registry.approve(pool, r.actionId, { workspaceId: ws, memberId: owner }).then(a => {
          const at = a.status === 'confirmed' ? JSON.stringify(a.result) : a.status === 'needs_approval' ? '' : a.reason;
          if (at && SERVER_DETAIL.test(at)) leaks.push(`${t.name} (approved): ${at.slice(0, 200)}`);
        }).catch(() => {});
      }
    }
  } finally { console.warn = warn; }
  assert.deepEqual(slow, [], "every tool answers within 5 s (a hung one would hold its transaction open)");
  assert.deepEqual(leaks, [], "a member read server detail");
  assert.deepEqual(warned, [], 'a tool produced server detail (the backstop caught it; fix the source)');
});

test('the backstop: a reason with an env var, a path or a stack frame is replaced with plain words', () => {
  for (const r of ['set VP_TELEPHONY_LIVE=1', "ENOENT: no such file '/var/lib/vp/x.wav'", 'Error: boom\n    at run (/app/server/x.ts:1:2)', 'opened file:///tmp/a'])
    assert.match(publicReason(r), /because of how the server is set up/, r);
  for (const r of ['no such call in this workspace', 'a tiered setting needs a second model to escalate to', 'Valid outcome values: agreed, not_now.'])
    assert.equal(publicReason(r), r);
});
