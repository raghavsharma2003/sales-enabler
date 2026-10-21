// Cross-call insight (server/modules/calls/insights.ts) against a real Postgres with the fake LLM. Synthetic data only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, many, one, tx } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import type { Actor, Registry } from '../server/tools.ts';
import { module as calls } from '../server/modules/calls/index.ts';
import { computeInsight, groundThemes, runNightlyInsights, storeInsight, type Theme } from '../server/modules/calls/insights.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;

before(() => { if (skip) return; pool = createPool(URL_); registry = buildApp(pool, [calls]).registry; });
after(async () => { setFakeLlm(null); await pool?.end(); });

async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('insight test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  const agent = (await one<{ id: string }>(pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Asha') RETURNING id", [ws]))!.id;
  const version = (await one<{ id: string }>(pool, "INSERT INTO agent_version (agent_id, number, hash, config) VALUES ($1,1,'h1','{}') RETURNING id", [agent]))!.id;
  const def = (await one<{ id: string }>(pool, `INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'Renewal','Did they renew?','{renewed,later,no}','{renewed}') RETURNING id`, [ws]))!.id;
  const campaign = (await one<{ id: string }>(pool, "INSERT INTO campaign (workspace_id, name, call_category, outcome_definition_id) VALUES ($1,'Renewals','service',$2) RETURNING id", [ws, def]))!.id;
  const member: Actor = { type: 'member', id: owner, role: 'owner' };
  return { ws, agent, version, campaign, def, member };
}

let phone = 9100000000, minutesAgo = 1000;
/** An analysed call, ended `minutesAgo` (decreasing, so later inserts are newer: the newest is C1 to the model). */
async function analysedCall(w: Awaited<ReturnType<typeof workspace>>, lines: { speaker: 'agent' | 'caller'; text: string }[], o: { outcome?: string; test?: boolean } = {}) {
  const contact = (await one<{ id: string }>(pool, "INSERT INTO contact (workspace_id, e164) VALUES ($1,$2) RETURNING id", [w.ws, `+91${phone++}`]))!.id;
  const attempt = (await one<{ id: string }>(pool, "INSERT INTO attempt (workspace_id, campaign_id, contact_id, status) VALUES ($1,$2,$3,'connected') RETURNING id", [w.ws, w.campaign, contact]))!.id;
  const transcript = lines.map((l, i) => ({ ...l, startMs: i * 3000 }));
  const id = (await one<{ id: string }>(pool, `INSERT INTO conversation (workspace_id, attempt_id, contact_id, agent_version_id, channel, status, ended_at, transcript, analysis, reason_code, run_manifest)
    VALUES ($1,$2,$3,$4,$5,'done', now() - make_interval(mins => $6), $7, '{"status":"done"}', 'CONV_INCOMPLETE', $8) RETURNING id`,
    [w.ws, attempt, contact, w.version, o.test ? 'test' : 'phone', minutesAgo--, JSON.stringify(transcript), { test: !!o.test }]))!.id;
  if (o.outcome) await pool.query(`INSERT INTO outcome (workspace_id, conversation_id, definition_id, value, grade) VALUES ($1,$2,$3,$4,'verified')`, [w.ws, id, w.def, o.outcome]);
  return id;
}
const reply = (json: unknown, seen?: LlmRequest[]) => (req: LlmRequest) => { seen?.push(req); return { text: JSON.stringify(json), toolCalls: [], usage: { inputTokens: 900, outputTokens: 150 }, model: 'fake-analyst', provider: 'fake' }; };

// Five calls: C1 is the newest. C1, C2 and C3 object on price; C4 asks something she cannot answer; C5 renewed.
async function fiveCalls(w: Awaited<ReturnType<typeof workspace>>) {
  const c5 = await analysedCall(w, [{ speaker: 'agent', text: 'Aapki policy ka renewal hai.' }, { speaker: 'caller', text: 'Haan, abhi kar deta hoon, link bhej do.' }], { outcome: 'renewed' });
  const c4 = await analysedCall(w, [{ speaker: 'agent', text: 'Renewal ki baat karni thi.' }, { speaker: 'caller', text: 'Kya isme dental cover hai?' }, { speaker: 'agent', text: 'Iski jaankari mere paas nahi hai.' }]);
  const c3 = await analysedCall(w, [{ speaker: 'agent', text: 'Renewal premium 12,400 hai.' }, { speaker: 'caller', text: 'Yeh bahut mehenga hai, pichhli baar kam tha.' }]);
  const c2 = await analysedCall(w, [{ speaker: 'agent', text: 'Renewal ka time aa gaya hai.' }, { speaker: 'caller', text: 'Premium itna zyada kyun hai?' }]);
  const c1 = await analysedCall(w, [{ speaker: 'agent', text: 'Aapka renewal due hai.' }, { speaker: 'caller', text: 'Dusri company sasti de rahi hai.' }], { outcome: 'no' });
  return { c1, c2, c3, c4, c5 };
}
const modelSays = {
  themes: [
    { kind: 'objection', title: 'Price feels too high', calls: ['C1', 'C2', 'C3', 'C9'],
      quotes: [{ call: 'C3', text: 'Yeh bahut mehenga hai' }, { call: 'C2', text: 'Premium itna zyada kyun hai?' }, { call: 'C1', text: 'Mujhe yeh plan pasand nahi' }] },
    { kind: 'unanswered_question', title: 'Asked about dental cover', calls: ['C4'],
      quotes: [{ call: 'C4', text: 'Kya isme dental cover hai?' }, { call: 'C4', text: 'Iski jaankari mere paas nahi hai.' }] },
    { kind: 'objection', title: 'Invented theme', calls: ['C1', 'C2'], quotes: [{ call: 'C1', text: 'main kabhi renew nahi karunga' }, { call: 'C2', text: 'aap log chor ho' }] },
    { kind: 'success_driver', title: 'Sending the link at once', calls: ['C5', 'C1'],
      quotes: [{ call: 'C5', text: 'abhi kar deta hoon, link bhej do' }, { call: 'C1', text: 'Dusri company sasti de rahi hai.' }] },
  ],
};

test('grounding: only verbatim quotes from that call survive; agent lines never evidence an objection; a theme needs two real quotes', { skip }, async () => {
  const w = await workspace();
  const ids = await fiveCalls(w);
  setFakeLlm(reply(modelSays));
  const c = await computeInsight(pool, w.ws, { type: 'agent', id: w.agent });
  assert.equal(c.ran, true);
  if (!c.ran) return;
  const r = c.result;
  assert.equal(r.status, 'done');
  const byTitle = Object.fromEntries(r.themes.map(t => [t.title, t]));
  assert.deepEqual(Object.keys(byTitle).sort(), ['Price feels too high'],
    'the invented theme, the unanswered question that leans on her own line, and a success driver from a call that did not renew all fall');
  const price = byTitle['Price feels too high'];
  assert.deepEqual(price.quotes.map(q => [q.conversationId, q.text, q.speaker]), [[ids.c3, 'Yeh bahut mehenga hai', 'caller'], [ids.c2, 'Premium itna zyada kyun hai?', 'caller']]);
  assert.equal(price.count, 3, 'counted from the cited calls that exist (C9 does not), not from a number the model wrote');
  assert.equal(price.of, 5);
  for (const t of r.themes) for (const q of t.quotes) {
    const row = await one<{ transcript: { text: string }[] }>(pool, 'SELECT transcript FROM conversation WHERE id = $1', [q.conversationId]);
    assert.ok(row!.transcript.some(l => l.text.includes(q.text)), `quote is in that call's own transcript: ${q.text}`);
  }
  assert.equal(r.quotesProposed, 9);
  assert.equal(r.quotesDropped, 7, 'proposed = kept + dropped (9 = 2 + 7)');
  assert.equal(r.themesDropped, 3);
});

test('the grounding guard is what stops invented evidence: without it the fabricated quote is kept', { skip }, async () => {
  const w = await workspace();
  await fiveCalls(w);
  setFakeLlm(reply(modelSays));
  // A grounder that trusts the model (what the code would do with the check removed).
  const trusting: typeof groundThemes = (raw, sampled) => {
    const themes = ((raw as { themes: any[] }).themes).map((t): Theme => ({ kind: t.kind, title: t.title, count: t.calls.length, of: sampled.length,
      quotes: t.quotes.map((q: any) => ({ conversationId: sampled.find(s => s.label === q.call)?.id ?? 'unknown', text: q.text, speaker: 'caller', startMs: 0 })) }));
    return { themes, quotesProposed: 0, quotesDropped: 0, themesDropped: 0 };
  };
  const without = await computeInsight(pool, w.ws, { type: 'agent', id: w.agent }, { ground: trusting });
  const withCheck = await computeInsight(pool, w.ws, { type: 'agent', id: w.agent });
  const texts = (c: typeof without) => c.ran ? c.result.themes.flatMap(t => t.quotes.map(q => q.text)) : [];
  assert.ok(texts(without).includes('aap log chor ho'), 'without the check the invented quote reaches the insight');
  assert.ok(!texts(withCheck).includes('aap log chor ho'), 'with the check it never does');
  assert.ok(!texts(withCheck).includes('Mujhe yeh plan pasand nahi'));
});

test('test calls never reach the model or the counts', { skip }, async () => {
  const w = await workspace();
  await fiveCalls(w);
  await analysedCall(w, [{ speaker: 'caller', text: 'SECRET-TEST-CALL-LINE yeh sirf test hai' }], { test: true });
  const seen: LlmRequest[] = [];
  setFakeLlm(reply({ themes: [] }, seen));
  const c = await computeInsight(pool, w.ws, { type: 'workspace', id: null });
  assert.equal(c.ran && c.result.callsInScope, 5);
  assert.equal(c.ran && c.result.callsSampled, 5);
  assert.ok(!seen[0].messages[1].content.includes('SECRET-TEST-CALL-LINE'), 'the test call is not in the prompt');
});

test('caps: the sample cap, the input budget and the output cap hold; nothing new means no run; each run is one cost line', { skip }, async () => {
  const w = await workspace();
  await fiveCalls(w);
  const seen: LlmRequest[] = [];
  setFakeLlm(reply({ themes: [] }, seen));
  const capped = await computeInsight(pool, w.ws, { type: 'agent', id: w.agent }, { caps: { sampleCalls: 3, outputTokens: 400 } });
  assert.equal(capped.ran && capped.result.callsSampled, 3);
  assert.equal(capped.ran && capped.result.callsInScope, 5);
  assert.match(seen[0].messages[1].content, /### C3 /); assert.doesNotMatch(seen[0].messages[1].content, /### C4 /);
  assert.equal(seen[0].maxTokens, 400);
  const tight = await computeInsight(pool, w.ws, { type: 'agent', id: w.agent }, { caps: { inputTokens: 40 } });   // 160 characters: one call fits
  assert.equal(tight.ran && tight.result.callsSampled, 1);
  assert.ok(seen[1].messages[1].content.length <= 160, 'the input stays inside its budget');

  // Through the tool: the first refresh runs and costs one line; the second has nothing new and does not call the model.
  const ctx = { workspaceId: w.ws, actor: w.member };
  const first = await registry.execute<any>(pool, 'insight.refresh', { agentId: w.agent }, ctx);
  assert.equal(first.status === 'confirmed' && first.result.ran, true, JSON.stringify(first));
  const calls0 = seen.length;
  const second = await registry.execute<any>(pool, 'insight.refresh', { agentId: w.agent }, ctx);
  assert.equal(second.status === 'confirmed' && second.result.ran, false);
  assert.equal(second.status === 'confirmed' && second.result.skipped, 'skipped');
  assert.equal(seen.length, calls0, 'no model call when nothing is new');
  const forced = await registry.execute<any>(pool, 'insight.refresh', { agentId: w.agent, force: true }, ctx);
  assert.equal(forced.status === 'confirmed' && forced.result.ran, true);
  await analysedCall(w, [{ speaker: 'caller', text: 'Naya call.' }]);
  const fresh = await registry.execute<any>(pool, 'insight.refresh', { agentId: w.agent }, ctx);
  assert.equal(fresh.status === 'confirmed' && fresh.result.ran, true, 'a newer call makes the next run happen');
  const cost = await many<any>(pool, "SELECT quantity::int AS q, detail FROM cost_line WHERE workspace_id = $1 AND detail->>'purpose' = 'insight'", [w.ws]);
  assert.equal(cost.length, 3, 'one cost line per run that called the model');
  assert.ok(cost.every(x => x.q === 1050 && x.detail.priced === false && x.detail.scopeType === 'agent'));
});

test('insight.get is the read the Insights page and the Operator use; another workspace sees none of it', { skip }, async () => {
  const w = await workspace(), other = await workspace();
  await fiveCalls(w);
  setFakeLlm(reply(modelSays));
  const ctx = { workspaceId: w.ws, actor: w.member };
  const none = await registry.execute<any>(pool, 'insight.get', { campaignId: w.campaign }, ctx);
  assert.equal(none.status === 'confirmed' && none.result.status, 'none');
  await registry.execute(pool, 'insight.refresh', { campaignId: w.campaign }, ctx);
  const got = await registry.execute<any>(pool, 'insight.get', { campaignId: w.campaign }, ctx);
  assert.equal(got.status, 'confirmed');
  if (got.status !== 'confirmed') return;
  const g = got.result;
  assert.deepEqual(Object.keys(g).sort(), ['callsInScope', 'callsSampled', 'generatedAt', 'newestCallAt', 'note', 'quotesDropped', 'reason', 'scope', 'status', 'themesDropped', 'themes'].sort());
  assert.deepEqual(g.scope, { type: 'campaign', id: w.campaign });
  assert.equal(g.themes[0].title, 'Price feels too high');
  assert.deepEqual(Object.keys(g.themes[0]).sort(), ['count', 'kind', 'of', 'quotes', 'title']);
  assert.match(g.note, /Observed, not causal/);

  const theirs = await registry.execute(pool, 'insight.get', { campaignId: w.campaign }, { workspaceId: other.ws, actor: other.member });
  assert.equal(theirs.status, 'not_executed', "another workspace cannot read this campaign's insight");
  const theirWs = await registry.execute<any>(pool, 'insight.get', {}, { workspaceId: other.ws, actor: other.member });
  assert.equal(theirWs.status === 'confirmed' && theirWs.result.status, 'none');
  const both = await registry.execute(pool, 'insight.get', { agentId: w.agent, campaignId: w.campaign }, ctx);
  assert.equal(both.status, 'not_executed');
});

test('the nightly job builds each scope once and then skips until a call is newer (bound to this workspace)', { skip }, async () => {
  const w = await workspace();
  await fiveCalls(w);
  setFakeLlm(reply(modelSays));
  const first = await runNightlyInsights(pool, { workspaceId: w.ws });
  assert.equal(first.built, 3, 'workspace, agent and campaign');
  const again = await runNightlyInsights(pool, { workspaceId: w.ws });
  assert.deepEqual(again, { built: 0, skipped: 3 });
  const rows = await many<any>(pool, 'SELECT scope_type FROM call_insight WHERE workspace_id = $1 ORDER BY scope_type', [w.ws]);
  assert.deepEqual(rows.map(r => r.scope_type), ['agent', 'campaign', 'workspace']);
  // A failed model run is stored as failed and never as an empty "all good".
  setFakeLlm(() => { throw new Error('model down'); });
  await analysedCall(w, [{ speaker: 'caller', text: 'Ek aur call.' }]);
  const c = await computeInsight(pool, w.ws, { type: 'workspace', id: null });
  assert.equal(c.ran && c.result.status, 'failed');
  if (c.ran) await tx(pool, q => storeInsight(q, w.ws, { type: 'workspace', id: null }, c.result));
  const got = await registry.execute<any>(pool, 'insight.get', {}, { workspaceId: w.ws, actor: w.member });
  assert.equal(got.status === 'confirmed' && got.result.status, 'failed');
});
