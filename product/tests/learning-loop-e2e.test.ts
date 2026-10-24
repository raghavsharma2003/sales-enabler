// The self-learning loop end to end, as a workspace admin drives it, on the REAL control plane (every module in
// server/modules/index.ts) through its HTTP API: finished calls -> analysis -> monitor issue -> drafted proposal ->
// simulation -> readiness -> approved test -> start -> split on new calls -> verdict with its interval -> approved
// rollout -> adoption into the agent draft -> lesson -> the next published version carries the change.
//
// What is faked: the model (setFakeLlm: the dev sample analysis, a coach that proposes one opening change, and a plain
// reply for simulated calls), as on the dev server. Two BRIDGES stand in for the dialler, which this test does not run:
// the attempt and conversation rows of each call are inserted before the runtime reports the call through the signed
// hook. Everything else is a tool call or an approval. Synthetic people and numbers only. Skipped without DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');
process.env.VP_RUNTIME_SECRET = 'loop-runtime-secret-' + randomBytes(24).toString('hex');   // test-only, never printed

import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { sign } from '../server/runtime-client.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { analysesSettled } from '../server/modules/calls/analysis.ts';
import { proposeFromIssues } from '../server/modules/learning/index.ts';
import { sampleAnalysis } from '../web/dev/sample-analysis.ts';
import { Client } from './workspace-helpers.ts';

const DATABASE = process.env.DATABASE_URL;
const skip = !DATABASE ? 'DATABASE_URL not set' : false;
const NEW_OPENING = 'Ask if it is a good time for two minutes before anything else';
let pool: pg.Pool, registry: Registry, base = '', close = async () => {};

before(async () => {
  if (skip) return;
  pool = createPool(DATABASE);
  const app = buildApp(pool, modules);
  registry = app.registry;
  const server = app.server ?? createServer();
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  close = async () => { server.close(); server.closeAllConnections?.(); };
  const reply = (text: string): LlmReply => ({ text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' });
  setFakeLlm((req: LlmRequest) => {
    if (req.purpose === 'analysis') return sampleAnalysis(req);
    if (req.purpose === 'learning') {
      const ev = JSON.parse(req.messages[req.messages.length - 1]!.content).evidence ?? {};
      const cite = ev.issues?.[0]?.id ?? ev.calls?.[0]?.id;
      return reply(JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'Callers leave before hearing why we called. Ask if it is a good time first.',
        change: [{ op: 'set', path: 'opening.usefulFirst', value: NEW_OPENING }], evidenceIds: cite ? [cite] : [] }] }));
    }
    return reply('Haan ji, boliye.');
  });
});
after(async () => { await analysesSettled(); setFakeLlm(null); await close(); await pool?.end(); });

async function signup(): Promise<Client> {
  const res = await fetch(base + '/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': randomUUID() },
    body: JSON.stringify({ workspace: 'Loop Test ' + randomUUID().slice(0, 4), name: 'Asha Owner', email: `loop-${randomUUID().slice(0, 8)}@example.test`, password: 'correct horse battery' }) });
  const body = await res.json() as { workspaceId: string; memberId: string };
  const cookie = /vp_session=[^;]+/.exec(res.headers.get('set-cookie') ?? '')![0];
  return new Client(base, { cookie }, body.memberId, body.workspaceId);
}
const ok = (r: { status: string }, what: string) => { assert.equal(r.status, 'confirmed', `${what}: ${JSON.stringify(r).slice(0, 600)}`); return (r as any).result; };

test('the learning loop runs from finished calls to an adopted change carried by the next version', { skip, timeout: 300_000 }, async t => {
  const admin = await signup();
  const ws = admin.workspaceId!;

  // ---- setup: an agent, its first version, 500 synthetic people, a campaign running version 1
  const agentId = ok(await admin.tool('agent.create', { name: 'Renewals, Pune', templateId: 'insurance-renewal' }), 'agent.create').agentId as string;
  ok(await admin.run('stack.set', { agentId, stackId: 'v2-flashlite' }), 'stack.set');
  const g0 = ok(await admin.tool('agent.get', { agentId }), 'agent.get');
  ok(await admin.run('version.publish', { agentId, draftHash: g0.draftHash, note: 'First published version' }), 'version.publish');
  const v1 = ok(await admin.tool('agent.get', { agentId }), 'agent.get').liveVersion.id as string;
  const csv = ['Name,Mobile,City', ...Array.from({ length: 500 }, (_, i) => `Loop Person ${i + 1},9000${String(i).padStart(6, '0')},Pune`)].join('\n');
  const up = ok(await admin.tool('source.upload', { kind: 'csv', name: 'loop.csv', text: csv, filename: 'loop.csv' }), 'source.upload');
  const audienceId = ok(await admin.run('source.commit', { uploadId: up.uploadId, consentPurpose: 'service', audienceName: 'Loop people' }), 'source.commit').audienceId;
  const window = { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] };
  const campaignId = ok(await admin.run('campaign.draft', { name: 'Renewals Oct', category: 'service', agentVersionId: v1, audienceId, preset: 'renewal', window, concurrency: 4 }), 'campaign.draft').id as string;
  assert.ok(campaignId);
  const people = (await many<{ id: string }>(pool, "SELECT id FROM contact WHERE workspace_id = $1 AND name LIKE 'Loop Person %' ORDER BY e164", [ws])).map(r => r.id);
  assert.equal(people.length, 500);
  let next = 0;

  /** One finished call: BRIDGE for the dialler (attempt and conversation rows), then the runtime's signed report. */
  async function call(contact: string, versionId: string, early: boolean): Promise<string> {
    const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, campaignId, contact]))!.id;
    const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel) VALUES ($1,$2,$3,$4,'phone') RETURNING id", [ws, attempt, contact, versionId]))!.id;
    const turns = early
      ? [{ speaker: 'agent', text: 'Namaste, main Riya, ek AI assistant. Aapki policy renewal...', startMs: 0, endMs: 4000 }, { speaker: 'caller', text: 'Abhi nahi.', startMs: 4500, endMs: 5200 }]
      : [{ speaker: 'agent', text: 'Namaste, main Riya, ek AI assistant. Do minute hain?', startMs: 0, endMs: 5000 }, { speaker: 'caller', text: 'Haan boliye.', startMs: 6000, endMs: 7000 }];
    const manifest = { combinationId: 'v2|loop', stackId: 'v2-flashlite', agentVersionHash: 'loop', components: { stt: 'fake', llm: 'fake', tts: 'fake' }, fallbacksUsed: [], memory: 'none', runtimeVersion: 'loop' };
    const at = new Date().toISOString(); let s = 1;
    const events = [{ seq: s++, type: 'call.started', at, manifest }, ...turns.map(x => ({ seq: s++, type: 'turn', at, ...x })),
      { seq: s++, type: 'call.ended', at, endReason: early ? 'caller_hung_up' : 'agent_ended', durationS: early ? 6 : 40, transcript: turns.map(x => ({ speaker: x.speaker, text: x.text, startMs: x.startMs })), manifest }];
    const body = JSON.stringify({ protocol: 1, conversationId: conv, events });
    const res = await fetch(base + '/hooks/runtime', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vp-signature': sign(process.env.VP_RUNTIME_SECRET!, body) }, body });
    assert.ok(res.ok, 'runtime hook ' + res.status);
    return conv;
  }
  const inBatches = async <T>(items: T[], f: (x: T, k: number) => Promise<void>) => {
    for (let k = 0; k < items.length; k += 10) await Promise.all(items.slice(k, k + 10).map((x, j) => f(x, k + j)));
  };

  // ---- 1-3. calls finish, are analysed, and the early hang-up monitor opens an issue (40% > 35%)
  const first: { conv: string; early: boolean }[] = [];
  await inBatches(people.slice(0, 30), async (c, k) => { const early = k % 5 < 2; first.push({ conv: await call(c, v1, early), early }); });
  next = 30;
  await analysesSettled();
  const issue = await one<{ id: string }>(pool, "SELECT id FROM issue WHERE workspace_id = $1 AND status = 'open' AND detail->>'signal' = 'early_hangup_rate'", [ws]);
  assert.ok(issue, 'the early hang-up monitor opened an issue from the analysed calls');

  // ---- 4. the learning job drafts a proposal from the issue; nothing launches
  const ran = await proposeFromIssues({ pool, registry }, { workspaceId: ws });
  assert.deepEqual(ran.ran.map(r => r.status), ['proposed'], JSON.stringify(ran));
  let [p] = ok(await admin.tool('proposal.list'), 'proposal.list') as any[];
  assert.equal(p.status, 'drafted');
  assert.equal(p.from_issue != null, true, 'the proposal names the issue it came from');

  // ---- 5. simulate on practice callers (library defaults; the workspace has none of its own)
  ok(await admin.tool('proposal.probe', { proposalId: p.id }), 'proposal.probe');
  [p] = ok(await admin.tool('proposal.list'), 'proposal.list') as any[];
  assert.equal(p.status, 'awaiting_approval', 'the simulation passed: ' + JSON.stringify(p).slice(0, 600));

  // ---- 6. readiness says what is missing, in order: an outcome, then 100 outcomes for the A/A check
  let ready = ok(await admin.tool('proposal.readiness', { proposalId: p.id }), 'readiness');
  assert.equal(ready.ready, false); assert.equal(ready.fix, 'outcome');
  const def = ok(await admin.run('outcome.define', { name: 'Renewal', question: 'Did the person renew?', allowedValues: ['renewed', 'not_renewed'], goalValues: ['renewed'], verifiedBy: 'crm_field', campaignId }), 'outcome.define');
  const definitionId = def.outcomeDefinitionId ?? def.id;
  const label = async (conversationId: string, win: boolean) => ok(await admin.tool('outcome.label', { conversationId, definitionId, value: win ? 'renewed' : 'not_renewed' }), 'outcome.label');
  await inBatches(first, async (f, k) => { await label(f.conv, !f.early && k % 3 !== 0); });
  ready = ok(await admin.tool('proposal.readiness', { proposalId: p.id }), 'readiness');
  assert.equal(ready.ready, true, JSON.stringify(ready));
  assert.match(ready.note, /100 calls have a recorded outcome/, 'it says the start waits for the A/A check');

  // ---- 7. accept (A2): the card states what the test needs; the admin approves
  const accept = await admin.tool('proposal.accept', { proposalId: p.id, minDays: 0, mdeAbs: 0.25 });
  assert.equal(accept.status, 'needs_approval');
  assert.match(accept.summary, /calls with a recorded outcome/);
  const accepted = ok((await admin.fetch('POST', `/v1/actions/${accept.actionId}/decide`, { approve: true })).body, 'approve accept');
  const experimentId = accepted.experimentId as string;
  const early = await admin.run('experiment.start', { experimentId });
  t.diagnostic('start before the A/A check has its 100: ' + JSON.stringify(early).slice(0, 300));
  assert.notEqual((await one<{ state: string }>(pool, 'SELECT state FROM experiment WHERE id = $1', [experimentId]))!.state, 'running', 'no start before the A/A check');

  // ---- 8. 80 more labelled calls on version 1; then the shadow A/A passes and the test starts (A2)
  await inBatches(people.slice(30, 110), async (c, k) => { await label(await call(c, v1, k % 3 === 0), k % 5 < 2); });
  next = 110;
  const started = ok(await admin.run('experiment.start', { experimentId }), 'experiment.start');
  t.diagnostic('started: ' + JSON.stringify(started).slice(0, 300));
  const [e0] = ok(await admin.tool('experiment.list'), 'experiment.list') as any[];
  assert.equal(e0.state, 'running', 'started: ' + JSON.stringify(started).slice(0, 800));
  const perArm = e0.design.horizonPerArm as number;
  assert.equal(ok(await admin.tool('agent.get', { agentId }), 'agent.get').liveVersion.id, v1, 'while the test runs, version 1 stays the live version; the candidate is not');
  t.diagnostic(`horizon: ${perArm} outcomes per version`);

  // ---- 9. new calls are split per contact; a contact asked twice stays in its arm. Calls run experiment.check after
  // every connected call, so the verdict lands by itself at the horizon; after that, assign returns nothing.
  const arms: Record<string, number> = { control: 0, treatment: 0 };
  let after = 0;
  await inBatches(people.slice(next, next + perArm * 2 + 80), async c => {
    const a = ok(await admin.tool('experiment.assign', { agentId, contactId: c }), 'experiment.assign');
    if (!a) { after++; return; }
    const again = ok(await admin.tool('experiment.assign', { agentId, contactId: c }), 'experiment.assign');
    assert.equal(again?.arm ?? a.arm, a.arm, 'sticky arm');
    const nth = arms[a.arm]!++;
    const win = a.arm === 'treatment' ? nth % 20 < 13 : nth % 20 < 7;   // the change converts better: 65% against 35%
    await label(await call(c, a.versionId, false), win);
  });
  await analysesSettled();
  t.diagnostic(`arms: ${JSON.stringify(arms)}; contacts not assigned after the verdict: ${after}`);
  assert.ok(arms.control! >= perArm && arms.treatment! >= perArm, `each arm reached its horizon: ${JSON.stringify(arms)}`);
  assert.ok(after > 0, 'the test stopped taking contacts once it was decided');
  assert.equal((await many(pool, 'SELECT contact_id FROM experiment_assignment WHERE experiment_id = $1 GROUP BY contact_id HAVING count(*) > 1', [experimentId])).length, 0);

  // ---- 10. the verdict is a win with its interval, and a 100% rollout card waits for the admin (A2)
  const [e1] = ok(await admin.tool('experiment.list'), 'experiment.list') as any[];
  assert.equal(e1.state, 'decided', JSON.stringify({ state: e1.state, result: e1.result, progress: e1.progress, arms }).slice(0, 800));
  const d = e1.result.decision;
  assert.equal(d.verdict, 'win', d.label);
  assert.ok(d.ci.lo > 0, 'the whole 95% interval is above zero: ' + d.label);
  const pending = (await admin.fetch('GET', '/v1/actions?status=proposed')).body.actions as any[];
  const rollout = pending.find(a => a.tool === 'deployment.split');
  assert.ok(rollout, 'a rollout card waits for the admin');
  assert.doesNotMatch(rollout.summary, /[0-9a-f]{8}/i, 'the card names things, not ids');

  // ---- 11. not adopted before the rollout is approved; adopted after it
  // A check that finds another check running says so and skips; a person would look again, and so does this test.
  const checkNow = async () => { for (let k = 0; ; k++) { const r = ok(await admin.tool('experiment.check', { experimentId }), 'check'); if (!r.note || k > 20) return r; await new Promise(res => setTimeout(res, 100)); } };
  assert.equal((await checkNow()).adoption.status, 'waiting');
  ok((await admin.fetch('POST', `/v1/actions/${rollout.id}/decide`, { approve: true })).body, 'approve rollout');
  const adopted = await checkNow();
  assert.equal(adopted.adoption.status, 'adopted', JSON.stringify(adopted));
  assert.equal(adopted.adoption.draft, 'updated');
  [p] = ok(await admin.tool('proposal.list'), 'proposal.list') as any[];
  assert.equal(p.status, 'promoted');
  const lessons = ok(await admin.tool('lesson.list'), 'lesson.list') as any[];
  assert.ok(lessons.some((l: any) => /^Adopted/.test(l.text)), 'a lesson records the adoption');

  // ---- 11b. the issue that started the loop records the adopted change; its monitor closes it once calls recover
  const src = (await one<{ status: string; detail: any; resolution: string | null }>(pool, 'SELECT status, detail, resolution FROM issue WHERE id = $1', [issue!.id]))!;
  assert.equal(src.detail.adoptedChange?.experimentId, experimentId, JSON.stringify(src.detail));
  t.diagnostic('source issue after adoption: ' + src.status + ' ' + (src.resolution ?? ''));

  // ---- 12. the draft carries the change, and the next published version's brief says it
  const g1 = ok(await admin.tool('agent.get', { agentId }), 'agent.get');
  assert.equal(g1.draft.opening.usefulFirst, NEW_OPENING);
  const pub = ok(await admin.run('version.publish', { agentId, draftHash: g1.draftHash, note: 'After the opening test' }), 'publish');
  const brief = await one<{ text: string; locked: any }>(pool, "SELECT config->'brief'->>'text' AS text, config->'agent'->'opening' AS locked FROM agent_version WHERE id = $1", [pub.versionId]);
  assert.ok(brief!.text.includes(NEW_OPENING), 'the new version brief carries the adopted change');
  assert.equal(brief!.locked.disclosureClause, g0.draft.opening.disclosureClause, 'the disclosure is unchanged');
});
