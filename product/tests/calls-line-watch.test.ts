// Blueprint decision 9, the per-line half (decision.2026-10-24.catastrophic-line-detector): one line of hers that people
// keep reacting badly to trips by call 15 and slows the script to 25%; a benign set never trips. Synthetic, fictional calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { catastrophicLine, reactions, tail, withoutName, type WatchedCall } from '../server/modules/calls/line-watch.ts';
import { message } from '../server/modules/workspace/notifications.ts';
import type { Case } from '../scripts/analysis-bench/cases.ts';
import { CASES, writeAnalysed, type Written } from './fixtures/analysed-calls.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

type L = { speaker: 'agent' | 'caller'; text: string };
const OPEN = (name: string) => `Namaste ${name} ji, main Riya bol rahi hoon Kirana Kart se, ek AI assistant. Aapke kal wale order ke baare mein call kiya hai.`;
const BAD = 'Agar aaj payment nahi kiya toh hum aapke ghar recovery agent bhej denge, samjhe aap.';
const FINE = 'Aapka order kal shaam tak deliver ho jayega, kya aap ghar par rahenge?';
const NAMES = ['Sunita', 'Imran', 'Lakshmi', 'Arjun', 'Meera', 'Farhan', 'Kavya', 'Rohit', 'Neha', 'Vikram', 'Anjali', 'Sameer', 'Pooja', 'Rahul', 'Divya'];

/** One synthetic call: who, what she said, and how it ended. */
function call(i: number, lines: L[], reason: string, moments: WatchedCall['moments'] = []): WatchedCall {
  return { id: `c${i + 1}`, reason_code: reason, contact_name: `${NAMES[i % NAMES.length]} Sharma`, moments, transcript: lines };
}
const hello = (i: number): L[] => [{ speaker: 'agent', text: OPEN(NAMES[i % NAMES.length]!) }, { speaker: 'caller', text: 'Haan boliye.' }];

/** Planted: every other call she says BAD; 4 in 5 of those end badly right after it (hang-up, opt-out, complaint). */
function planted(n: number): WatchedCall[] {
  return Array.from({ length: n }, (_, i) => {
    if (i % 2 === 1) return call(i, [...hello(i), { speaker: 'agent', text: FINE }, { speaker: 'caller', text: 'Haan, main rahunga.' }], 'CONV_GOAL_DONE');
    const k = i / 2;
    const said = [...hello(i), { speaker: 'agent' as const, text: BAD }];
    if (k % 5 === 4) return call(i, [...said, { speaker: 'caller', text: 'Theek hai, kal kar dunga.' }], 'CONV_GOAL_DONE');
    if (k % 3 === 0) return call(i, said, 'END_HUNG_UP_MID');
    if (k % 3 === 1) return call(i, [...said, { speaker: 'caller', text: 'Mujhe dobara call mat karna.' }], 'END_OPTED_OUT');
    return call(i, [...said, { speaker: 'caller', text: 'Yeh kya tareeka hai baat karne ka? Main complaint karunga.' }], 'CONV_COMPLAINT',
      [{ kind: 'objection', quote: 'Yeh kya tareeka hai baat karne ka? Main complaint karunga.', at_ms: 12000 }]);
  });
}

/** Benign: the same opener every call with an ordinary early hang-up rate (4 in 15), a normal mid-call line, one opt-out
 *  and one complaint after different lines. */
function benign(n: number): WatchedCall[] {
  return Array.from({ length: n }, (_, i) => {
    if (i % 4 === 2) return call(i, [{ speaker: 'agent', text: OPEN(NAMES[i % NAMES.length]!) }], 'END_EARLY_HANGUP');
    if (i === 7) return call(i, [...hello(i), { speaker: 'agent', text: FINE }, { speaker: 'caller', text: 'Please mujhe call mat karo, list se hata do.' }], 'END_OPTED_OUT');
    if (i === 9) return call(i, [...hello(i), { speaker: 'agent', text: 'Kya main aapko naye offers ke baare mein bata sakti hoon?' }, { speaker: 'caller', text: 'Aap log har hafte call karte ho, bahut pareshan kar diya hai.' }],
      'CONV_COMPLAINT', [{ kind: 'objection', quote: 'Aap log har hafte call karte ho, bahut pareshan kar diya hai.', at_ms: 12000 }]);
    return call(i, [...hello(i), { speaker: 'agent', text: FINE }, { speaker: 'caller', text: 'Haan, main rahunga.' }], 'CONV_GOAL_DONE');
  });
}

/** The call count at which a stream of calls first trips, or null. */
const tripsAt = (calls: WatchedCall[]) => { for (let n = 1; n <= calls.length; n++) if (catastrophicLine(calls.slice(Math.max(0, n - 15), n))) return n; return null; };

test('a reaction goes to her line before it: a hang-up to her last line, an opt-out and a complaint to the line just before', () => {
  const [hang, opt, comp] = [planted(1)[0]!, planted(3)[2]!, planted(5)[4]!];
  assert.deepEqual([...reactions(hang).bad], [[2, 'hang_up']]);
  assert.deepEqual([...reactions(opt).bad], [[2, 'opt_out']]);
  assert.deepEqual([...reactions(comp).bad], [[2, 'complaint']]);
  assert.equal(reactions(benign(3)[2]!).bad.get(0), 'hang_up', 'an early hang-up goes to the opener');
});

test('the test: an opener needs far more than a mid-call line (p0 0.35 against 0.15), never fewer than 3 reactions', () => {
  assert.ok(tail(3, 3, 0.15) < 0.01 && tail(2, 2, 0.15) < 0.05, '3 of 3 after a mid-call line is enough; 2 of 2 is held by the minimum of 3');
  assert.ok(tail(4, 15, 0.35) > 0.5, 'an opener with 4 early hang-ups in 15 is ordinary');
  assert.ok(tail(11, 15, 0.35) < 0.01 && tail(10, 15, 0.35) >= 0.01);
});

test('a planted bad line trips by call 15, quoting her line without the person\'s name; the benign set never trips', () => {
  const at = tripsAt(planted(30));
  assert.ok(at !== null && at <= 15, `tripped at call ${at}`);
  const trip = catastrophicLine(planted(at!))!;
  assert.equal(trip.line, BAD);
  assert.equal(trip.opener, false);
  assert.ok(trip.bad >= 3 && trip.p < 0.01);
  assert.equal(tripsAt(benign(45)), null, 'the benign set, 45 calls in windows of 15: no trip');
  assert.equal(withoutName(OPEN('Sunita'), 'Sunita Sharma'), OPEN('[name]'));
});

test('the analysis bench\'s 84 hand-written calls, in windows of 15 in bench order: no trip', () => {
  const asCalls = CASES.map((c, i) => ({ id: `b${i}`, reason_code: c.key.reasonCode, contact_name: null, transcript: c.lines.map(l => ({ speaker: l.speaker, text: l.text })),
    moments: c.key.moments.map(m => ({ kind: m.kind, quote: c.lines[m.line]!.text, at_ms: null })) }) as WatchedCall);
  assert.equal(CASES.length, 84);
  assert.equal(tripsAt(asCalls), null);
});

// ---- on the real modules -------------------------------------------------------------------------------------------
const asCase = (c: WatchedCall, i: number): Case => ({ id: `line-${i}`, split: 'dev', template: 'line', industry: 'd2c', language: 'hinglish',
  lines: c.transcript!.map(l => ({ speaker: l.speaker, text: l.text.replace(/Namaste \w+ ji/, 'Namaste ji') })),
  endReason: c.reason_code === 'END_HUNG_UP_MID' ? 'caller_hung_up' : c.reason_code === 'END_OPTED_OUT' ? 'opt_out' : 'completed', durationS: 40,
  key: { reasonCode: c.reason_code!, moments: c.moments.map(m => ({ kind: m.kind, line: c.transcript!.findIndex(l => l.text === m.quote) })) } } as unknown as Case);

test('script.line_check on analysed calls: trips by call 15, slows the script to 25%, opens a critical issue quoting her line, and alerts', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('line watch') RETURNING id"))!.id;
  const agentId = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1,'Riya','live') RETURNING id", [ws]))!.id;
  const versionId = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, 'h1', '{}') RETURNING id", [agentId]))!.id;
  await pool.query("INSERT INTO notification_destination (workspace_id, kind, name, events, recipients) VALUES ($1,'email','Ops',$2,'{ops@example.test}')", [ws, ['script.slowed']]);
  const ctx = { workspaceId: ws, actor: { type: 'system' as const, id: 'calls.followups' } };
  let written: Written[] = [], at: number | null = null, r: any = null;
  for (const [i, c] of planted(15).entries()) {
    // One call at a time, each ending after the last, as live traffic does.
    written = [...written, ...(await writeAnalysed(pool, ws, versionId, [asCase(c, i)], { endedAgoMin: 60 - i }))];
    r = await registry.execute<any>(pool, 'script.line_check', { conversationId: written[written.length - 1]!.conversationId }, ctx);
    assert.equal(r.status, 'confirmed', JSON.stringify(r));
    if (r.result.state === 'throttled_now') { at = i + 1; break; }
  }
  assert.ok(at !== null && at <= 15, `tripped at call ${at}`);
  const th = (await one<{ factor: string; issue_id: string; detail: any }>(pool, 'SELECT factor::text, issue_id, detail FROM script_throttle WHERE agent_version_id = $1 AND restored_at IS NULL', [versionId]))!;
  assert.equal(Number(th.factor), 0.25);
  assert.equal(th.detail.signal, 'catastrophic_line');
  assert.equal(th.detail.line, BAD, 'her line, word for word');
  const issue = (await one<{ severity: string; category: string; detail: any }>(pool, 'SELECT severity, category, detail FROM issue WHERE id = $1', [th.issue_id]))!;
  assert.deepEqual([issue.severity, issue.category], ['critical', 'Safety']);
  assert.match(issue.detail.summary, /people reacted badly on \d+ of the \d+ calls where she said it/);
  assert.doesNotMatch(JSON.stringify(issue.detail), /Fixture person|mat karna|complaint karunga/, 'no name and no caller words');
  // The alert: one delivery to the destination that listens, in words with no ids.
  const d = (await one<{ event: string; data: any }>(pool, "SELECT event, data FROM notification_delivery WHERE workspace_id = $1", [ws]))!;
  assert.equal(d.event, 'script.slowed');
  const m = await message(pool, ws, d.event, d.data);
  assert.match(m.text, /Riya, version 1 was slowed to 25% of her campaigns' lines because one of her lines kept drawing hang-ups, opt-outs or complaints\./);
  assert.doesNotMatch(m.text, /[0-9a-f]{8}-[0-9a-f]{4}/, 'no ids');
  // While slowed, checking again changes nothing; the gate (campaigns.test G12) reads the same row.
  const again = await registry.execute<any>(pool, 'script.line_check', { conversationId: written[written.length - 1]!.conversationId }, ctx);
  assert.equal(again.status === 'confirmed' && again.result.state, 'throttled');
});

test('script.line_check on 15 benign analysed calls: no throttle, no issue', { skip }, async () => {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('line watch benign') RETURNING id"))!.id;
  const agentId = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1,'Riya','live') RETURNING id", [ws]))!.id;
  const versionId = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1, 1, 'h1', '{}') RETURNING id", [agentId]))!.id;
  const w = await writeAnalysed(pool, ws, versionId, benign(15).map(asCase).reverse(), { endedAgoMin: 1 });
  const r = await registry.execute<any>(pool, 'script.line_check', { conversationId: w[0]!.conversationId }, { workspaceId: ws, actor: { type: 'system', id: 'calls.followups' } });
  assert.deepEqual(r.status === 'confirmed' && [r.result.state, r.result.calls], ['ok', 15]);
  assert.equal((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM issue WHERE workspace_id = $1', [ws]))!.n, 0);
});
