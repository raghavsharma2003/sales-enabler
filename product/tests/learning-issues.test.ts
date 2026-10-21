// Issue-triggered learning on the REAL modules: the calls module's monitors (evaluateMonitors) open the issues from
// calls-shaped conversations, and learning's job body (proposeFromIssues, scoped to the test's workspace) drafts one
// proposal per content issue, skips engineering issues, honours the daily cap, and never launches anything.
// Synthetic data only; fresh workspaces. Skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Registry } from '../server/tools.ts';
import type { Job } from '../server/jobs.ts';
import { modules } from '../server/modules/index.ts';
import { evaluateMonitors } from '../server/modules/calls/analysis.ts';
import { DAILY_ISSUE_PROPOSALS, proposeFromIssues } from '../server/modules/learning/index.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let registry: Registry;
let jobs: Job[];

before(async () => {
  if (skip) return;
  pool = createPool(URL_);
  const app = buildApp(pool, modules);
  registry = app.registry; jobs = app.jobs;
});
after(async () => { setFakeLlm(null); await pool?.end(); });

function agentConfig(agentId: string) {
  return {
    schema: 1, agentId, version: 1, versionHash: 'h1',
    brand: { name: 'Sahayak Home Services', spokenName: 'Sahayak', verifiedDomains: ['sahayak.example'] },
    job: 'reminder', category: 'service', sectorPacks: ['base'],
    languages: { primary: 'hinglish', allowed: ['hinglish', 'hi-IN', 'en-IN'], mirrorCaller: true },
    persona: { name: 'Riya', gender: 'female', register: 'warm_peer', energy: 3, humour: 1, honorific: 'aap', notes: ['explain plainly'] },
    goals: [{ id: 'confirm_visit', description: 'the customer confirms or reschedules the service visit', outcome: 'visit', required: true }],
    facts: [{ key: 'visit_date', value: '24 October', purpose: 'service', source: 'agent.form' }],
    neverSay: [], opening: { disclosureClause: 'Main Sahayak ki AI assistant Riya bol rahi hoon', usefulFirst: 'your AC service visit is due' },
    objections: [{ trigger: 'busy', approach: 'offer a callback time' }], tools: [],
    handOff: { when: ['asks_for_human'], target: { kind: 'queue' }, warmSummary: true },
    memory: { read: true, write: true, briefMaxBytes: 1200 }, limits: { maxDurationS: 240, maxSilenceS: 8, maxTurns: 40 },
    voice: { stackId: 'v2-flashlite' }, recording: { enabled: true, announce: true },
  };
}

/** A workspace with one live agent version and `n` ended live calls: `hangups` early hang-ups, `engineErrors` engine errors. */
async function setup(n: number, hangups: number, engineErrors: number) {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('learning issues test') RETURNING id"))!.id;
  const agentId = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name, status) VALUES ($1,'Riya','live') RETURNING id", [ws]))!.id;
  const versionId = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h1',$2) RETURNING id",
    [agentId, JSON.stringify({ agent: agentConfig(agentId), brief: { text: 'brief v1', hash: 'b1', bytes: 8 } })]))!.id;
  for (let i = 0; i < n; i++) {
    await pool.query(`INSERT INTO conversation (workspace_id, agent_version_id, channel, status, reason_code, end_reason, started_at, ended_at)
      VALUES ($1,$2,'phone','done',$3,$4, now() - interval '5 minutes', now() - make_interval(secs => $5))`,
      [ws, versionId, i < hangups ? 'END_EARLY_HANGUP' : 'CONV_GOAL_DONE', i >= n - engineErrors ? 'error' : 'caller_hangup', n - i]);
  }
  return { ws, agentId, versionId };
}

/** The model proposes one opening change citing the triggering issue (the first issue in the evidence it was given). */
function fakeCoach() {
  const asked: LlmRequest[] = [];
  setFakeLlm(req => {
    asked.push(req);
    assert.equal(req.purpose, 'learning');
    const evidence = JSON.parse(req.messages[1]!.content).evidence;
    return { text: JSON.stringify({ proposals: [{ kind: 'opening', rationale: 'callers leave before hearing why we called',
      change: [{ op: 'set', path: 'opening.usefulFirst', value: 'your AC visit on 24 October is ready to confirm' }], evidenceIds: [evidence.issues[0].id] }] }),
      toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'fake', provider: 'fake' };
  });
  return asked;
}

test('a monitor issue drafts one proposal, once; an engineering issue drafts none; nothing launches', { skip }, async () => {
  assert.ok(jobs.find(j => j.name === 'learning.propose_from_issues'), 'the trigger is a registered job');
  const s = await setup(30, 15, 2);                         // 50% early hang-ups (> 35%), 6.7% engine errors (> 3%)
  const { opened } = await evaluateMonitors(pool, s.ws);
  const issues = await many<{ id: string; detail: any }>(pool, 'SELECT id, detail FROM issue WHERE id = ANY($1::uuid[])', [opened]);
  const hang = issues.find(i => i.detail.signal === 'early_hangup_rate')!, eng = issues.find(i => i.detail.signal === 'engine_error_rate')!;
  assert.ok(hang && eng, `the real monitors opened both issues: ${JSON.stringify(issues.map(i => i.detail.signal))}`);

  const asked = fakeCoach();
  const first = await proposeFromIssues({ pool, registry }, { workspaceId: s.ws });
  const byIssue = Object.fromEntries(first.ran.map(r => [r.issueId, r]));
  assert.equal(byIssue[hang.id]!.status, 'proposed');
  assert.equal(byIssue[eng.id]!.status, 'skipped_engineering');
  assert.equal(asked.length, 1, 'one model call, for the content issue only');
  const p = await one<{ agent_id: string; status: string; evidence: any }>(pool, 'SELECT agent_id, status, evidence FROM proposal WHERE id = $1', [byIssue[hang.id]!.proposalId]);
  assert.deepEqual([p!.agent_id, p!.status, p!.evidence.issueId], [s.agentId, 'drafted', hang.id]);
  assert.deepEqual(p!.evidence.cited, [hang.id], 'the proposal cites the issue that triggered it');

  // Again (the job runs every minute): no second proposal and no second model call for the same issue.
  const again = await proposeFromIssues({ pool, registry }, { workspaceId: s.ws });
  assert.deepEqual(again.ran, []);
  assert.equal(asked.length, 1);
  assert.equal((await many(pool, 'SELECT 1 FROM proposal WHERE workspace_id = $1', [s.ws])).length, 1);
  // Nothing launched: no experiment, and no treatment version.
  assert.equal((await many(pool, 'SELECT 1 FROM experiment WHERE workspace_id = $1', [s.ws])).length, 0);
  assert.equal((await many(pool, 'SELECT 1 FROM agent_version WHERE agent_id = $1', [s.agentId])).length, 1);
});

test('the daily cap stops automatic runs for the rest of the day without marking the issue', { skip }, async () => {
  const s = await setup(30, 15, 0);
  for (let i = 0; i < DAILY_ISSUE_PROPOSALS; i++) {
    const dummy = (await one<{ id: string }>(pool, "INSERT INTO issue (workspace_id, category, severity) VALUES ($1,'Conversation','info') RETURNING id", [s.ws]))!.id;
    await pool.query("INSERT INTO learning_issue_run (issue_id, workspace_id, status) VALUES ($1,$2,'proposed')", [dummy, s.ws]);
  }
  const { opened } = await evaluateMonitors(pool, s.ws);
  assert.equal(opened.length, 1);
  const asked = fakeCoach();
  const r = await proposeFromIssues({ pool, registry }, { workspaceId: s.ws });
  assert.deepEqual(r.ran.map(x => x.status), ['skipped_daily_cap']);
  assert.equal(asked.length, 0, 'no model call over the cap');
  assert.equal(await one(pool, 'SELECT 1 FROM learning_issue_run WHERE issue_id = $1', [opened[0]]), null, 'the issue is retried on a later day');
});
