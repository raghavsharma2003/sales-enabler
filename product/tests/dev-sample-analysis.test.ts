// The dev server's canned analysis (web/dev/sample-analysis.ts): marked as sample, grounded by the real checks, and never
// loadable in production.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { RuntimeEvent, RunManifest } from '../shared/runtime-protocol.ts';
import { ingest } from '../server/modules/calls/ingest.ts';
import { analysesSettled, analysisPrompt } from '../server/modules/calls/analysis.ts';
import { SAMPLE_MARK, sampleAnalysis } from '../web/dev/sample-analysis.ts';
import { tallyText } from '../web/src/dnd-text.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool | undefined;
after(async () => { setFakeLlm(null); await analysesSettled(); await pool?.end(); });

const runFile = (rel: string) => spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL(rel, import.meta.url))],
  { env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://unused@/unused' }, encoding: 'utf8', timeout: 60_000 });

test('the sample analysis and the dev server both refuse to load with NODE_ENV=production', () => {
  const a = runFile('../web/dev/sample-analysis.ts');
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /must never load with NODE_ENV=production/);
  const s = runFile('../web/dev/serve.ts');
  assert.notEqual(s.status, 0, 'the dev server never starts in production');
  assert.match(s.stderr, /NODE_ENV=production/);
});

test('it reads the real prompt and quotes only the person, and every claim says it is a sample', () => {
  const system = analysisPrompt({ question: 'Did they renew?', values: ['renewed', 'not_interested'] });
  const user = 'AGENT: Namaste, renewal ka time aa gaya hai.\nPERSON: Kya premium badha hai?\nAGENT: Nahi, same hai.\nPERSON: Theek hai, kar do renewal.';
  const r = JSON.parse(sampleAnalysis({ purpose: 'analysis', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }).text);
  assert.ok(r.points.every((p: any) => p.claim.startsWith(SAMPLE_MARK)));
  assert.deepEqual(r.outcome, { value: 'renewed', quote: 'Theek hai, kar do renewal.', confidence: 0.9 });
  assert.deepEqual(r.moments.map((m: any) => m.quote), ['Kya premium badha hai?']);
});

test('through the real analysis: a seeded call gets a finished, labelled sample summary and outcome', { skip }, async () => {
  pool = createPool(process.env.DATABASE_URL);
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('dev sample test') RETURNING id"))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'R','Did they renew?','{renewed,not_interested}','{renewed}') RETURNING id`, [ws]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'C','service',$2) RETURNING id", [ws, def]))!.id;
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,'+919600000001') RETURNING id", [ws]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'dialing') RETURNING id", [ws, campaign, contact]))!.id;
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, attempt_id, contact_id, channel) VALUES ($1,$2,$3,'phone') RETURNING id", [ws, attempt, contact]))!.id;
  const m: RunManifest = { combinationId: 'd', stackId: 'd', agentVersionHash: 'd', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 'd' };
  const lines = [{ speaker: 'agent' as const, text: 'Renewal ka time aa gaya hai.', startMs: 0 }, { speaker: 'caller' as const, text: 'Nahi, abhi zaroorat nahi hai.', startMs: 3000 }];
  const at = new Date().toISOString();
  setFakeLlm(sampleAnalysis);
  await ingest(pool, { conversationId: conv, events: [{ seq: 1, type: 'call.started', at, manifest: m },
    { seq: 2, type: 'call.ended', at, endReason: 'completed', durationS: 20, transcript: lines, manifest: m }] as RuntimeEvent[] });
  await analysesSettled();
  const a = (await one<{ analysis: any; reason_code: string }>(pool, 'SELECT analysis, reason_code FROM conversation WHERE id = $1', [conv]))!;
  assert.equal(a.analysis.status, 'done');
  assert.ok(a.analysis.summary.startsWith(SAMPLE_MARK), 'the summary on the call page says it is a sample');
  assert.equal(a.analysis.outcomeGuess.value, 'not_interested');
  assert.equal(a.analysis.quotesDropped, 0, 'its quotes pass the real grounding checks');
  assert.equal(a.analysis.model, 'sample-analysis (dev)');
});

test('a DND check says who answered, and that a stand-in is not the national register', () => {
  const t = tallyText({ checked: 2, registered: 0, not_registered: 0, unknown: 2, source: { label: 'none: the national Do Not Disturb register is not connected yet', standIn: true, registerConnected: false } });
  assert.match(t, /Answered by none: the national Do Not Disturb register is not connected yet\./);
  assert.match(t, /do not come from the national register, so promotional calls stay held back/);
  assert.doesNotMatch(tallyText({ checked: 1, registered: 0, not_registered: 1, unknown: 0, source: { label: 'the national register', standIn: false, registerConnected: true } }), /do not come from/);
});
