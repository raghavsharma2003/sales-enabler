// "Why this call was allowed" (must-be decision 5): the dial gate's record for the attempt that placed the call, in plain
// words, on call.get and call.explain. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { allowedByWords } from '../server/modules/calls/gate-trace.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(process.env.DATABASE_URL); registry = buildApp(pool, [calls]).registry; });
after(async () => { await pool?.end(); });

const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
// The shape campaigns' worker stores on attempt.precheck when the gate lets a call through.
const passed = { gateVersion: 'gate-2026-10-22', at: '2026-10-24T05:00:00.000Z', allowed: true, trace: GATES.map(gate => ({ gate, ok: true })),
  warnings: ['line 3f1c0e5a-0000-4000-8000-000000000001 is not A2P-declared; from 2026-11-01 the gate refuses it'] };

test('every gate that passed reads as a plain sentence; no rule id, number id or jargon reaches a person', () => {
  const w = allowedByWords(passed, false);
  assert.equal(w.allowed, true);
  assert.equal(w.summary, 'Every one of the 12 checks before dialling passed.');
  assert.equal(w.checks.length, 12);
  assert.equal(w.checks[0].text, 'The business is verified for real calls (its DLT registration is on file).');
  assert.equal(w.checks[3].text, 'The person has not asked not to be called.');
  assert.ok(new Set(w.checks.map(c => c.text)).size === 12, 'one sentence per check');
  const all = JSON.stringify({ c: w.checks.map(c => c.text), w: w.warnings, s: w.summary });
  assert.doesNotMatch(all, /\bG\d+\b|A2P|3f1c0e5a|_/, all);
  assert.match(w.warnings[0], /not yet declared for automated calls with the telecom operator; from 1 November 2026 such calls will be refused\./);
  assert.match(allowedByWords(passed, true).checks[0].text, /test call: it could only ring a phone a team member verified/);
  assert.match(allowedByWords(null, true).summary, /practice call from the agent builder: it rang no one/);
  assert.equal(allowedByWords(null, false).allowed, null);
  assert.match(allowedByWords({ allowed: true, trace: [{ gate: 'G1', ok: true }], warnings: ['something internal: G7 x'] }, false).warnings[0], /^A note for the team/);
});

test('call.get and call.explain carry why the call was allowed; a browser test call says it passed no gate', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('allowed by') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const ctx = { workspaceId: ws, actor: { type: 'member', id: owner, role: 'owner' } as Actor };
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919800000123') RETURNING id", [ws]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, contact_id, kind, status, precheck) VALUES ($1,$2,'single','connected',$3) RETURNING id", [ws, contact, JSON.stringify(passed)]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel, status) VALUES ($1,$2,$3,'phone','done') RETURNING id", [ws, attempt, contact]))!.id;
  const g = await registry.execute<any>(pool, 'call.get', { conversationId: conv }, ctx);
  if (g.status !== 'confirmed') return assert.fail(JSON.stringify(g));
  assert.equal(g.result.allowedBy.allowed, true);
  assert.equal(g.result.allowedBy.checks.length, 12);
  assert.equal(g.result.allowedBy.at, '2026-10-24T05:00:00.000Z');
  const e = await registry.execute<any>(pool, 'call.explain', { conversationId: conv }, ctx);
  if (e.status !== 'confirmed') return assert.fail(JSON.stringify(e));
  assert.equal(e.result.because[0].point, 'Why this call was allowed: Every one of the 12 checks before dialling passed.');
  assert.equal(e.result.because[0].evidence.event, 'dial_gate');

  const test_ = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, channel, status) VALUES ($1,'test','done') RETURNING id", [ws]))!.id;
  const t = await registry.execute<any>(pool, 'call.get', { conversationId: test_ }, ctx);
  assert.equal(t.status === 'confirmed' && t.result.allowedBy.allowed, null);
  assert.match(t.status === 'confirmed' ? t.result.allowedBy.summary : '', /did not pass the dial gate/);
  // Another workspace's attempt is never read, even if a row pointed at it.
  const other = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('other') RETURNING id"))!.id;
  const theirContact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919800000999') RETURNING id", [other]))!.id;
  const theirs = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, contact_id, kind, status, precheck) VALUES ($1,$2,'single','connected',$3) RETURNING id", [other, theirContact, JSON.stringify(passed)]))!.id;
  const odd = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, channel, status) VALUES ($1,$2,'phone','done') RETURNING id", [ws, theirs]))!.id;
  const o = await registry.execute<any>(pool, 'call.get', { conversationId: odd }, ctx);
  assert.equal(o.status === 'confirmed' && o.result.allowedBy.allowed, null);
});
