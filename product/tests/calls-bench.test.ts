// The analysis-quality bench (scripts/analysis-bench.ts) in CI: a smoke run with the scripted oracle on 3 calls plus a
// small cross-call slice, and proof that the scoring is done by code and catches a wrong model.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { createPool } from '../server/db.ts';
import { runBench, wilson } from '../scripts/analysis-bench.ts';
import { crossCallCases, perCallCases } from '../scripts/analysis-bench/cases.ts';
import { REASON_CODES } from '../server/modules/calls/taxonomy.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool | undefined;
after(async () => { await pool?.end(); });

test('the bench set: 84 keyed calls across 12 templates, 6 industries and 4 languages; every key uses the catalogue', () => {
  const cases = perCallCases();
  assert.equal(cases.length, 84);
  assert.equal(new Set(cases.map(c => c.id)).size, 84);
  assert.equal(new Set(cases.map(c => c.template)).size, 12);
  assert.equal(new Set(cases.map(c => c.industry)).size, 6);
  assert.deepEqual([...new Set(cases.map(c => c.language))].sort(), ['bengali-english', 'hinglish', 'marathi-english', 'tamil-english']);
  const codes = new Set(REASON_CODES.map(r => r.code));
  for (const c of cases) {
    for (const code of [c.key.reasonCode, ...(c.key.reasonAlt ?? [])]) assert.ok(codes.has(code), `${c.id}: ${code}`);
    for (const m of c.key.moments) assert.ok(c.lines[m.line], `${c.id}: moment line ${m.line}`);
    if (c.key.outcome) assert.ok(c.lines[c.key.outcomeLine!]?.speaker === 'caller', `${c.id}: the outcome is evidenced by the person`);
  }
  assert.equal(crossCallCases().length, 36);
  const [lo, hi] = wilson(46, 50);
  assert.ok(Math.abs(lo - 0.8124) < 0.002 && hi > 0.96 && hi < 0.98);
});

test('smoke: the oracle run scores every field, counts the invented quotes it plants, and writes JSON and markdown', { skip, timeout: 120_000 }, async () => {
  pool = createPool(process.env.DATABASE_URL);
  const out = mkdtempSync(join(tmpdir(), 'vp-bench-'));
  const r = await runBench({ smoke: true, pool, out });
  assert.equal(r.mode, 'fake');
  assert.equal(r.cases.run, 3);
  for (const f of ['outcome', 'reasonCode', 'momentRecall', 'crisis', 'optOutByAnalysis', 'followUps']) assert.equal(r.fields[f].rate, 1, f);
  assert.equal(r.cost.modelCalls, 3);
  assert.equal(r.grounding.n - r.grounding.k, 3, 'one invented quote per call, each dropped by the grounding check');
  const cross = r.cross as any;
  assert.equal(cross.themeRecall.k, 3);
  assert.equal(cross.quotesVerbatim.n - cross.quotesVerbatim.k, 3, 'invented theme quotes are dropped');
  assert.ok(existsSync(join(out, 'analysis-bench.json')));
  const md = readFileSync(join(out, 'analysis-bench.md'), 'utf8');
  assert.match(md, /\| Outcome \| 100\.0% \(3\/3; 95% CI/);
  assert.match(md, /model never grades/);
});

test('the scoring catches a wrong model: a model that always says "agreed" and quotes nothing real scores low', { skip, timeout: 120_000 }, async () => {
  pool ??= createPool(process.env.DATABASE_URL);
  const wrong = () => ({ text: JSON.stringify({ points: [], moments: [{ kind: 'laughter', quote: 'made up words here', note: '' }], reasonCode: 'CONV_GOAL_DONE',
    outcome: { value: 'agreed', quote: 'made up words here' }, forget: null, themes: [] }), toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, model: 'wrong', provider: 'fake' });
  const r = await runBench({ smoke: true, pool, llm: wrong, cross: false });
  assert.ok(r.fields.outcome.rate! < 1, 'an invented outcome quote is dropped, so the outcome is not recorded; and "agreed" is wrong for most keys');
  assert.ok(r.fields.momentRecall.rate! < 1);
  assert.equal(r.grounding.k, 0, 'none of its quotes is real');
});
