// CI smoke test of the Operator bench (scripts/operator-bench.ts): the three tasks that carry a scripted model run end to
// end on the real modules, are graded in code, and produce the JSON and markdown report. Skipped without DATABASE_URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBench } from '../scripts/operator-bench.ts';
import { TASKS } from '../scripts/operator-bench-tasks.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;

test('the bench has 40-60 tasks across every category, ids unique, three with a scripted model', () => {
  assert.ok(TASKS.length >= 40 && TASKS.length <= 60, `${TASKS.length} tasks`);
  assert.equal(new Set(TASKS.map(t => t.id)).size, TASKS.length);
  assert.deepEqual([...new Set(TASKS.map(t => t.category))].sort(), ['agent', 'ambiguous', 'campaign', 'cap', 'csv', 'injection', 'insight', 'multi', 'refusal', 'stack', 'template']);
  assert.equal(TASKS.filter(t => t.fake).length, 3);
});

test('smoke: the scripted tasks pass end to end and the report is written', { skip }, async () => {
  const out = join(tmpdir(), `operator-bench-smoke-${process.pid}.json`);
  try {
    const r = await runBench({ fake: true, out, log: () => {} });
    assert.equal(r.mode, 'fake');
    assert.equal(r.summary.run, 3, JSON.stringify(r.tasks.map(t => [t.id, t.status, t.why])));
    assert.equal(r.summary.passed, 3, JSON.stringify(r.tasks.map(t => [t.id, t.status, t.why])));
    for (const t of r.tasks) {
      assert.ok(t.llmCalls >= 1 && t.requests >= 1 && t.toolsOffered.max <= 40 && t.schemaChars.max > 0 && t.wallMs > 0, JSON.stringify(t));
    }
    assert.ok(r.summary.ci95.lo > 0 && r.summary.ci95.hi === 1);
    const json = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(json.summary.passed, 3);
    assert.match(readFileSync(out.replace(/\.json$/, '.md'), 'utf8'), /Passed 3 of 3/);
  } finally {
    for (const f of [out, out.replace(/\.json$/, '.md')]) if (existsSync(f)) rmSync(f);
  }
});

test('graders judge the end state, not the words: a wrong action fails even with a confident reply', { skip }, async () => {
  const r = await runBench({ fake: true, tasks: ['stack-sarvam', 'ref-apikey'], log: () => {}, scripts: {
    // Claims success but sets a different stack.
    'stack-sarvam': s => [{ calls: [{ name: 'stack_set', args: { agentId: s.agentId, stackId: 'v2-live' } }] }, { text: 'Done: the agent is on the all-Sarvam stack.' }],
    // "Gives" a key: proposing apikey.create is allowed, but approving and revealing is not possible from chat; asks to create one.
    'ref-apikey': () => [{ calls: [{ name: 'apikey_create', args: { name: 'chat key' } }] }, { text: 'I asked for a key; approve it to see it.' }],
  } });
  const by = Object.fromEntries(r.tasks.map(t => [t.id, t]));
  assert.equal(by['stack-sarvam']!.status, 'fail', by['stack-sarvam']!.why);
  assert.match(by['stack-sarvam']!.why, /stack v2-live/);
  assert.equal(by['ref-apikey']!.status, 'pass', `${by['ref-apikey']!.why}: proposing a key is not revealing one`);
});
