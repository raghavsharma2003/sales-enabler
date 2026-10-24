// Learning on the owner's own test calls, end to end, through the HTTP API as the owner drives it (directive
// 2026-10-24, calling first, build all): the owner flags a moment on a test call -> a lesson and one drafted change that
// quotes the turn from the call's own record -> learning.power says there are not enough calls to know (test calls never
// count) -> the owner adopts it on their own judgement (A2) -> a new version carries it, word for word in the brief ->
// "how she changed" shows before and after, why, the evidence and who approved it -> one-step revert publishes the
// version before it again. A change to the disclosure is blocked and never offered.
//
// Faked: the model (a coach that answers a flag with one persona note, or with a disclosure edit when the note asks for
// one). Test calls are written as rows (the runtime is not run). Synthetic people and lines only. Skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');

import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { Client } from './workspace-helpers.ts';

const DATABASE = process.env.DATABASE_URL;
const skip = !DATABASE ? 'DATABASE_URL not set' : false;
const NOTE = 'When someone says the premium feels high, acknowledge it first and ask what would make it workable before explaining anything.';
const PUSHY = 'Lekin sir, yeh offer sirf aaj tak hai, abhi le lijiye.';
let pool: pg.Pool, base = '', close = async () => {};
const asked: LlmRequest[] = [];

before(async () => {
  if (skip) return;
  pool = createPool(DATABASE);
  const app = buildApp(pool, modules);
  const server = app.server ?? createServer();
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  close = async () => { server.close(); server.closeAllConnections?.(); };
  const reply = (text: string): LlmReply => ({ text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' });
  setFakeLlm((req: LlmRequest) => {
    if (req.purpose !== 'learning') return reply('{}');
    asked.push(req);
    const body = JSON.parse(req.messages[req.messages.length - 1]!.content);
    const flag = body.focus?.flag;
    if (!flag) return reply(JSON.stringify({ proposals: [] }));
    // A note asking to change what she says about being an AI is answered with a disclosure edit: the gates must block it.
    if (/AI/.test(flag.note)) return reply(JSON.stringify({ proposals: [{ kind: 'opening', rationale: flag.note, evidenceIds: [flag.id],
      change: [{ op: 'set', path: 'opening.disclosureClause', value: 'main Riya bol rahi hoon' }] }] }));
    return reply(JSON.stringify({ proposals: [{ kind: 'brief_section', rationale: `The owner flagged pressure on price: ${flag.note}`, evidenceIds: [flag.id],
      change: [{ op: 'set', path: 'persona.notes', value: [...(body.agent.persona.notes ?? []), NOTE] }] }] }));
  });
});
after(async () => { await analysesSettled(); setFakeLlm(null); await close(); await pool?.end(); });

async function signup(): Promise<Client> {
  const res = await fetch(base + '/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
    body: JSON.stringify({ workspace: 'Review Test ' + randomUUID().slice(0, 4), name: 'Asha Owner', email: `review-${randomUUID().slice(0, 8)}@example.test`, password: 'correct horse battery' }) });
  const body = await res.json() as { workspaceId: string; memberId: string };
  const cookie = /vp_session=[^;]+/.exec(res.headers.get('set-cookie') ?? '')![0];
  return new Client(base, { cookie }, body.memberId, body.workspaceId);
}
const ok = (r: { status: string }, what: string) => { assert.equal(r.status, 'confirmed', `${what}: ${JSON.stringify(r).slice(0, 600)}`); return (r as any).result; };

/** One finished test call on the version, as the runtime would leave it: its turns and its transcript. */
async function testCall(ws: string, versionId: string, lines: { speaker: 'agent' | 'caller'; text: string }[]): Promise<string> {
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, agent_version_id, channel, direction, status, run_manifest, transcript, started_at, ended_at, end_reason)
    VALUES ($1,$2,'test','outbound','done','{"test":true}',$3, now() - interval '5 minutes', now() - interval '4 minutes', 'completed') RETURNING id`,
    [ws, versionId, JSON.stringify(lines.map((l, i) => ({ ...l, startMs: i * 3000 })))]))!.id;
  for (const [i, l] of lines.entries()) await pool.query('INSERT INTO turn (conversation_id, idx, speaker, text, started_ms) VALUES ($1,$2,$3,$4,$5)', [id, i, l.speaker, l.text, i * 3000]);
  return id;
}

test("the owner's review of test calls becomes a change, adopted as a new version, shown in how she changed, and taken back", { skip, timeout: 120_000 }, async () => {
  const owner = await signup();
  const ws = owner.workspaceId!;
  const agentId = ok(await owner.tool('agent.create', { name: 'Renewals, Nagpur', templateId: 'insurance-renewal' }), 'agent.create').agentId as string;
  ok(await owner.run('stack.set', { agentId, stackId: 'v2-flashlite' }), 'stack.set');
  const g0 = ok(await owner.tool('agent.get', { agentId }), 'agent.get');
  ok(await owner.run('version.publish', { agentId, draftHash: g0.draftHash, note: 'First published version' }), 'version.publish');
  const v1 = ok(await owner.tool('agent.get', { agentId }), 'agent.get').liveVersion as { id: string; number: number };
  const v1Notes = (await one<{ n: string[] }>(pool, "SELECT config->'agent'->'persona'->'notes' AS n FROM agent_version WHERE id = $1", [v1.id]))!.n;

  // ---- the owner's test calls (fictional caller, fictional brand)
  const calls: string[] = [];
  for (let k = 0; k < 4; k++) calls.push(await testCall(ws, v1.id, [
    { speaker: 'agent', text: 'Namaste, main Riya bol rahi hoon, ek AI assistant, aapki policy renewal ke baare mein.' },
    { speaker: 'caller', text: 'Premium bahut zyada lag raha hai is baar.' },
    { speaker: 'agent', text: PUSHY },
  ]));

  // ---- 1. the owner flags her line: a lesson and one drafted change, the turn quoted from the call itself
  const f = ok(await owner.tool('review.flag_turn', { conversationId: calls[0], turn: 2, note: 'She pushed a deadline right after they said the price was high.' }), 'review.flag_turn');
  assert.equal(f.quote, PUSHY, 'the quote is the turn as the call recorded it');
  assert.equal(f.speaker, 'agent');
  assert.equal(f.proposalStatus, 'drafted', JSON.stringify(f));
  const lesson = (await one<{ status: string; text: string }>(pool, 'SELECT status, text FROM lesson WHERE id = $1', [f.lessonId]))!;
  assert.equal(lesson.status, 'owner_flag');
  assert.ok(lesson.text.includes(PUSHY) && lesson.text.includes('test call'), lesson.text);
  const conv = (await one<{ flags: string[]; flagged: boolean }>(pool, 'SELECT flags, flagged FROM conversation WHERE id = $1', [calls[0]]))!;
  assert.ok(conv.flagged && conv.flags.includes('owner_review'));
  // What the model was given: the flag, from test calls (the agent has no live calls), and it says so.
  const sent = JSON.parse(asked[asked.length - 1]!.messages[1]!.content);
  assert.equal(sent.evidence.source, 'test');
  assert.equal(sent.focus.flag.quote, PUSHY);
  const p = (await one<{ evidence: any; status: string }>(pool, 'SELECT evidence, status FROM proposal WHERE id = $1', [f.proposalId]))!;
  assert.equal(p.evidence.source, 'test');
  assert.match(p.evidence.sourceLabel, /not a measured result/);
  assert.ok(p.evidence.cited.includes(`flag:${f.flagId}`), 'the change cites the flagged moment');
  // Flagging the same moment again changes nothing.
  assert.equal(ok(await owner.tool('review.flag_turn', { conversationId: calls[0], turn: 2, note: 'again' }), 'again').status, 'already_flagged');

  // ---- 2. power: test calls never count; not enough calls to know, said plainly
  const pw = ok(await owner.tool('learning.power', { agentId }), 'learning.power');
  assert.equal(pw.enough, false);
  assert.equal(pw.testCalls, 4);
  assert.match(pw.reason, /^Not enough/);
  assert.match(pw.reason, /4 test calls are not counted/);
  assert.equal(pw.callsNeeded, undefined, 'no plan is invented');
  const ready = ok(await owner.tool('proposal.readiness', { proposalId: f.proposalId }), 'proposal.readiness');
  assert.equal(ready.ready, false, 'it cannot be tested on live calls yet');

  // ---- 3. the owner adopts it on their own judgement: an approval card first, then a new version
  const card = await owner.tool('proposal.adopt', { proposalId: f.proposalId });
  assert.equal(card.status, 'needs_approval', JSON.stringify(card));
  assert.match(card.summary, /not been proved on live calls/);
  assert.ok(card.summary.includes(NOTE), 'the card shows the words it adds');
  const adopted = ok(await owner.fetch('POST', `/v1/actions/${card.actionId}/decide`, { approve: true }).then(r => r.body), 'adopt approve');
  assert.equal(adopted.number, v1.number + 1);
  assert.equal(adopted.tested, false);
  const g1 = ok(await owner.tool('agent.get', { agentId }), 'agent.get');
  assert.equal(g1.liveVersion.number, v1.number + 1, 'the new version is the live one');
  const v2 = (await one<{ config: any; parent_id: string }>(pool, 'SELECT config, parent_id FROM agent_version WHERE id = $1', [adopted.versionId]))!;
  assert.equal(v2.parent_id, v1.id);
  assert.ok(v2.config.brief.text.includes(NOTE), 'the brief carries the change word for word');
  assert.deepEqual(v2.config.agent.persona.notes, [...v1Notes, NOTE]);
  assert.deepEqual(v2.config.agent.opening, (await one<{ o: unknown }>(pool, "SELECT config->'agent'->'opening' AS o FROM agent_version WHERE id = $1", [v1.id]))!.o, 'the opening and its disclosure untouched');
  assert.ok(g1.draft.persona.notes.includes(NOTE), 'the draft keeps it, so the next publish does too');

  // ---- 4. how she changed
  const h = ok(await owner.tool('learning.history', { agentId }), 'learning.history');
  const c = h.changes.find((x: any) => x.id === f.proposalId);
  assert.equal(c.state, 'In use');
  assert.equal(c.version, v1.number + 1);
  assert.equal(c.tested, false);
  assert.equal(c.source, 'test');
  assert.equal(c.from, 'flag');
  assert.equal(c.evidence.flag.quote, PUSHY);
  assert.ok(c.why.includes('pushed a deadline'));
  assert.ok(c.brief.lines.some((l: any) => l.kind === 'added' && l.text.includes(NOTE)), 'the brief, line by line');
  assert.ok(!c.brief.lines.some((l: any) => l.kind === 'removed'), 'nothing else in the brief changed');
  assert.deepEqual(c.approvals.map((a: any) => [a.what, a.status, a.by]), [['Adopt without a live test', 'executed', 'Asha Owner']]);
  assert.equal(c.canRevert.ok, true);

  // ---- 5. a change to the disclosure is blocked and never offered
  const f2 = ok(await owner.tool('review.flag_turn', { conversationId: calls[1], turn: 0, note: 'Do not say AI so early.' }), 'flag 2');
  assert.equal(f2.proposalStatus, 'gated_out', JSON.stringify(f2));
  const h2 = ok(await owner.tool('learning.history', { agentId }), 'history 2');
  const blocked = h2.changes.find((x: any) => x.id === f2.proposalId);
  assert.equal(blocked.state, 'Blocked by its checks; never offered');
  assert.ok(blocked.blocked.length > 0);
  assert.equal(blocked.canAdopt.ok, false);
  assert.notEqual((await owner.tool('proposal.adopt', { proposalId: f2.proposalId })).status, 'confirmed');

  // ---- 6. one step back: a new version with the note as it was
  const back = ok(await owner.run('proposal.revert', { proposalId: f.proposalId }), 'proposal.revert');
  assert.equal(back.number, v1.number + 2);
  const v3 = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [back.versionId]))!;
  assert.deepEqual(v3.config.agent.persona.notes, v1Notes, 'the note is gone again');
  assert.ok(!v3.config.brief.text.includes(NOTE));
  const g2 = ok(await owner.tool('agent.get', { agentId }), 'agent.get');
  assert.equal(g2.liveVersion.number, v1.number + 2);
  assert.ok(!g2.draft.persona.notes.includes(NOTE), 'the draft follows');
  const h3 = ok(await owner.tool('learning.history', { agentId }), 'history 3');
  const r = h3.changes.find((x: any) => x.id === f.proposalId);
  assert.equal(r.state, 'Taken back');
  assert.equal(r.reverted.number, v1.number + 2);
  assert.equal(r.canRevert.ok, false);
  assert.deepEqual(r.approvals.map((a: any) => a.what), ['Adopt without a live test', 'Take back']);
  const lessons = (await many<{ status: string }>(pool, 'SELECT status FROM lesson WHERE workspace_id = $1 ORDER BY created_at', [ws])).map(l => l.status);
  assert.deepEqual(lessons, ['owner_flag', 'adopted', 'owner_flag', 'reverted']);
});
