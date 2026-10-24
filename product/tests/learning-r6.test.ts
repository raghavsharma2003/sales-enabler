// Learning's evidence, read from what the SHIPPED analysis contract stores (r5-outcome-first, the default since 6245d4e;
// tiered's first pass uses it too). The 42 TEST records of the round-6 bench (gpt-4.1-mini single, outcome-first, pass 1)
// are replayed through calls' real ingest and analyse() the way the bench feeds them (tests/fixtures/r6-records.ts), on a
// real published agent, and learning.propose is asked to read them. Synthetic calls only. Skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SAFETY_JUDGE_MODE = 'off';           // as the bench ran (its default); the crisis floor still runs

import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { GOAL_VALUES, OUTCOME_VALUES } from '../scripts/analysis-bench/cases.ts';
import type { RunManifest, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { R6, R6_FILE, R6_META, r6Oracle } from './fixtures/r6-records.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(async () => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, modules).registry; });
after(async () => { await analysesSettled(); setFakeLlm(null); await pool?.end(); });

const manifest: RunManifest = { combinationId: 'r6', stackId: 'r6', agentVersionHash: 'r6', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'r6' };
const count = <T>(xs: T[], key: (x: T) => string | null) => xs.reduce<Record<string, number>>((m, x) => { const k = key(x) ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m; }, {});

test('learning reads the shipped analysis contract as r6 recorded it: moments, reasons and quotes match, AI guesses never count, crisis words never reach it', { skip }, async () => {
  assert.deepEqual([R6_META.promptVariant, R6_META.split, R6.length], ['r5-outcome-first', 'test', 42], `fixture: ${R6_FILE}`);
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('learning r6') RETURNING id"))!.id;
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `r6${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: member, role: 'owner' };
  const call = (name: string, args: unknown): Promise<any> => registry.execute(pool, name, args, { workspaceId: ws, actor });
  const agentId = (await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' })).result.agentId as string;
  const s = await call('stack.set', { agentId, stackId: 'v2-flashlite' });
  const card = await call('version.publish', { agentId, draftHash: s.result.draftHash });
  const versionId = ((await registry.approve<any>(pool, card.actionId, { workspaceId: ws, memberId: member })) as any).result.versionId as string;
  // The bench's own outcome question and values, on the campaign these calls belong to (as the bench sets it up).
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values)
    VALUES ($1,'Call result','What did the person decide on this call?',$2,$3) RETURNING id`, [ws, [...OUTCOME_VALUES], GOAL_VALUES]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id, agent_version_id) VALUES ($1,'R6','service',$2,$3) RETURNING id", [ws, def, versionId]))!.id;

  // Each record's call, fed the way the bench feeds it; analysis answers with the record.
  const oracle = r6Oracle();
  setFakeLlm(oracle.fn);
  const conv = new Map<string, string>();
  for (const [k, r] of R6.entries()) {
    const contact = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id', [ws, `+9193${String(k).padStart(8, '0')}`, `R6 person ${k + 1}`]))!.id;
    const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, campaign, contact]))!.id;
    const id = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [ws, attempt, contact, versionId]))!.id;
    const c = r.case, at = new Date().toISOString();
    const events: RuntimeEvent[] = [{ seq: 1, type: 'call.started', at, manifest },
      ...c.lines.map((l, i) => ({ seq: 2 + i, type: 'turn' as const, at, speaker: l.speaker, text: l.text, startMs: i * 3000, endMs: i * 3000 + 2500 })),
      { seq: 2 + c.lines.length, type: 'call.ended', at, endReason: c.endReason, durationS: c.durationS, transcript: c.lines.map((l, i) => ({ ...l, startMs: i * 3000 })), manifest }];
    await ingest(pool, { conversationId: id, events });
    await analysesSettled();
    conv.set(r.id, id);
  }
  assert.equal(oracle.seen.other, 0, 'every analysis prompt was the shipped contract: OUTCOME before KIND');
  assert.equal(oracle.seen.unmatched, 0);
  assert.ok(oracle.seen.outcomeFirst >= R6.filter(r => r.case.lines.some(l => l.speaker === 'caller')).length);

  // What calls stored equals what r6 recorded: reason codes and moment kinds, call by call.
  const stored = await many<{ id: string; reason_code: string | null; guess: string | null; outcome: string | null }>(pool,
    "SELECT id, reason_code, analysis->'outcomeGuess'->>'value' AS guess, outcome FROM conversation WHERE workspace_id = $1", [ws]);
  const byId = new Map(stored.map(r => [r.id, r]));
  for (const r of R6) {
    const row = byId.get(conv.get(r.id)!)!;
    assert.equal(row.reason_code, r.predicted.reasonCode, `${r.id}: reason code`);
    assert.equal(row.guess, r.predicted.outcome, `${r.id}: the AI's outcome read`);
    const kinds = (await many<{ kind: string }>(pool, "SELECT DISTINCT kind FROM call_moment WHERE conversation_id = $1 AND source = 'analysis'", [conv.get(r.id)])).map(m => m.kind).sort();
    assert.deepEqual(kinds, [...r.predicted.moments].sort(), `${r.id}: moment kinds`);
  }

  // What learning reads from it.
  const asked: LlmRequest[] = [];
  setFakeLlm(req => { if (req.purpose === 'learning') asked.push(req); return { text: JSON.stringify({ proposals: [] }), toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'fake', provider: 'fake' }; });
  const res = await call('learning.propose', { agentId, max: 1 });
  assert.equal(res.status, 'confirmed', JSON.stringify(res));
  const prompt = asked[0]!.messages[asked[0]!.messages.length - 1]!.content;
  const ev = JSON.parse(prompt).evidence;
  const recordedKinds = count(R6.flatMap(r => r.predicted.moments), k => k);
  assert.deepEqual(ev.moments.counts, recordedKinds, 'moment counts by kind are the recorded ones');
  assert.deepEqual(ev.reasons, count(R6, r => r.predicted.reasonCode), 'reason codes are the recorded ones');
  // AI guesses are recorded on the call but are not outcomes until their judge is calibrated (F4): learning sees none.
  assert.ok(R6.filter(r => r.predicted.outcome).length > 20, 'the records do carry AI outcome reads');
  assert.deepEqual(ev.outcomes, { none: R6.length }, 'no AI guess counts as an outcome');
  // Quotes are the PERSON's own lines, from calls whose words may be shown.
  const callerLines = new Set(R6.flatMap(r => r.case.lines.filter(l => l.speaker === 'caller').map(l => l.text)));
  for (const q of ev.moments.quotes) assert.ok(callerLines.has(q.quote), `a quoted moment is a caller line: ${q.quote}`);
  assert.ok(ev.moments.quotes.some((q: any) => q.kind === 'objection'), 'objections reach learning with their lines');
  for (const r of R6.filter(x => x.template === 'crisis')) for (const l of r.case.lines.filter(x => x.speaker === 'caller')) assert.ok(!prompt.includes(l.text), 'a crisis caller\'s words never reach learning');
  for (const r of R6.filter(x => x.template === 'opt_out')) for (const l of r.case.lines.filter(x => x.speaker === 'caller')) {
    const at = prompt.indexOf(l.text);
    assert.ok(at < 0, `an opt-out is counted, never quoted: "${l.text}" (${r.id}) appears in: ${prompt.slice(Math.max(0, at - 300), at + 80)}`);
  }
});
