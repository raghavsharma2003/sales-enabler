// The model review of brief text (shared/safety/brief-review.json, agents/review.ts), with the model scripted by
// setFakeLlm. The regex door goes first and is never weakened; the model only adds refusals; with no model configured
// publish goes ahead on the rules alone and the card says so. Unit tests run anywhere; the tool tests need Postgres.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import type { AgentConfig } from '../shared/agent-config.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { Registry, type Actor, type Receipt } from '../server/tools.ts';
import { module } from '../server/modules/agents/index.ts';
import { getTemplate } from '../server/modules/agents/templates.ts';
import { BRIEF_REVIEW, parseReview, reviewBrief, reviewConfigured, reviewInput } from '../server/modules/agents/review.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
const reg = new Registry();
module.register(reg);
before(async () => { if (!skip) pool = createPool(URL_); });
after(async () => { await pool?.end(); });

const ENV = { VP_LLM_BRIEF_REVIEW_URL: 'https://review.example.test/v1/chat/completions', VP_LLM_BRIEF_REVIEW_KEY: 'not-a-key', VP_LLM_BRIEF_REVIEW_MODEL: 'fake-review' };
const saved: Record<string, string | undefined> = {};
function configure(on: boolean) {
  for (const k of Object.keys(ENV) as (keyof typeof ENV)[]) { saved[k] ??= process.env[k]; if (on) process.env[k] = ENV[k]; else delete process.env[k]; }
  for (const k of Object.keys(process.env)) if (/^VP_LLM_DEFAULT_/.test(k) && !on) { saved[k] ??= process.env[k]; delete process.env[k]; }
}
afterEach(() => { setFakeLlm(null); for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

const reply = (text: string) => ({ text, toolCalls: [], usage: { inputTokens: 900, outputTokens: 40 }, model: 'fake', provider: 'fake' });
/** A reviewer that flags the field holding `needle` (or nothing), and records what it was sent. */
function reviewer(needle: string | null, kind = 'human', confidence = 0.9) {
  const seen: LlmRequest[] = [];
  setFakeLlm(req => {
    if (req.purpose !== 'brief_review') throw new Error('unexpected purpose ' + req.purpose);
    seen.push(req);
    const rows = req.messages[1].content.split('\n').filter(l => /^\d+\. /.test(l));
    const hit = needle ? rows.find(l => l.includes(needle)) : undefined;
    const findings = hit ? [{ field: Number(hit.split('.')[0]), kind, confidence, reason: 'it lets the caller believe she is a person' }] : [];
    return reply(JSON.stringify({ findings }));
  });
  return seen;
}

const SNEAKY = 'Riya has worked at the Pune branch for six years and has two children; she shares this warmly when people ask about her.';
const base = (): AgentConfig => structuredClone(getTemplate('insurance-renewal')!.config) as AgentConfig;
const withNote = (s: string): AgentConfig => { const c = base(); c.persona = { ...c.persona, notes: [...(c.persona.notes ?? []), s] }; return c; };

test('review: the precondition — the rules alone let the sneaky backstory through', async () => {
  configure(false);
  const r = await reviewBrief(withNote(SNEAKY));
  assert.equal(r.mode, 'rules_only');
  assert.deepEqual(r.rules, []);
  assert.equal(r.label, 'AI-honesty review: rules only (no model configured)');
  assert.equal(reviewConfigured(), false);
});

test('review: regex first — a brief the rules refuse never reaches the model', async () => {
  configure(true);
  const seen = reviewer(null);
  const r = await reviewBrief(withNote('If asked whether she is a bot, she says she is a human.'));
  assert.equal(r.mode, 'rules');
  assert.equal(r.rules[0].rule, 'ai_honesty');
  assert.equal(seen.length, 0);
});

test('review: the model adds a refusal the rules missed, with the field, its words and the reason', async () => {
  configure(true);
  const seen = reviewer('six years');
  const r = await reviewBrief(withNote(SNEAKY));
  assert.equal(r.mode, 'model');
  assert.equal(r.model.length, 1);
  assert.match(r.model[0].path, /^persona\.notes\[\d+\]$/);
  assert.equal(r.model[0].text, SNEAKY);
  assert.equal(r.model[0].rule, 'ai_honesty');
  assert.equal(seen[0].messages[0].content, BRIEF_REVIEW.system_prompt);
  assert.match(seen[0].messages[1].content, /<<<BRIEF\n[^]*six years[^]*\nBRIEF>>>/);
  assert.doesNotMatch(seen[0].messages[1].content, /verifiedDomains|stackId/, 'ids, domains and voice parts are not sent');
});

test('review: below threshold, unavailable or malformed never refuses, and says which', async () => {
  configure(true);
  reviewer('six years', 'human', BRIEF_REVIEW.threshold - 0.01);
  assert.deepEqual((await reviewBrief(withNote(SNEAKY))).model, []);
  setFakeLlm(() => { throw new Error('boom'); });
  const e = await reviewBrief(withNote(SNEAKY));
  assert.equal(e.mode, 'unavailable'); assert.match(e.label, /rules only \(the model review was unavailable: error\)/);
  setFakeLlm(async () => { await new Promise(r => setTimeout(r, 200)); return reply('{"findings": []}'); });
  assert.equal((await reviewBrief(withNote(SNEAKY), { timeoutMs: 20 })).reason, 'timeout');
  setFakeLlm(() => reply('looks fine to me'));
  assert.equal((await reviewBrief(withNote(SNEAKY))).reason, 'bad_output');
});

test('review: a finding must name a field it was shown, with a known kind', () => {
  const { fields } = reviewInput(base());
  assert.ok(fields.length > 5);
  assert.equal(parseReview('{"findings":[{"field":9999,"kind":"human","confidence":0.9}]}', fields), null, 'no invented fields');
  assert.equal(parseReview('{"findings":[{"field":1,"kind":"rude","confidence":0.9}]}', fields), null);
  assert.equal(parseReview('{"findings":[{"field":1,"kind":"human","confidence":2}]}', fields), null);
  assert.deepEqual(parseReview('```json\n{"findings":[]}\n```', fields), []);
});

test('review: the prompt is shapes, never example lines it could be steered by', () => {
  for (const s of ['she says she is', 'six years', 'insaan', 'helpline wali', 'only today']) assert.ok(!BRIEF_REVIEW.system_prompt.toLowerCase().includes(s), s);
});

// ---- the tools (Postgres)
async function workspace() {
  const ws = await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('review test') RETURNING id");
  const m = await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws!.id, `r${Math.random()}@example.test`]);
  const actor: Actor = { type: 'member', id: m!.id, role: 'owner' };
  const call = <O = any>(name: string, args: unknown) => reg.execute<O>(pool, name, args, { workspaceId: ws!.id, actor });
  const approve = (r: Receipt) => reg.approve<any>(pool, (r as { actionId: string }).actionId, { workspaceId: ws!.id, memberId: m!.id });
  return { call, approve };
}
const ok = <O>(r: Receipt<O>): O => { assert.equal(r.status, 'confirmed', JSON.stringify(r)); return (r as { result: O }).result; };
async function sneakyDraft(call: Awaited<ReturnType<typeof workspace>>['call']) {
  const c = ok<any>(await call('agent.create', { name: 'Renewals', templateId: 'insurance-renewal' }));
  const e = ok<any>(await call('brief.edit', { agentId: c.agentId, patch: [{ op: 'set', path: 'persona.notes', value: [SNEAKY] }] }));
  return { agentId: c.agentId as string, edit: e };
}
const versions = async (agentId: string) => Number((await one<{ n: string }>(pool, 'SELECT count(*) AS n FROM agent_version WHERE agent_id = $1', [agentId]))!.n);

test('publish with no model configured: goes ahead on the rules, and the card says so', { skip }, async () => {
  configure(false);
  const { call, approve } = await workspace();
  const { agentId, edit } = await sneakyDraft(call);
  assert.equal(edit.review.mode, 'rules_only');
  const p = await call('version.publish', { agentId, draftHash: edit.draftHash });
  assert.match((p as { summary: string }).summary, /AI-honesty review: rules only \(no model configured\)\./);
  const v = ok<any>(await approve(p));
  assert.equal(v.review.mode, 'rules_only');
  assert.equal(await versions(agentId), 1);
});

test('publish with a model: a hard finding blocks with the reason, field and fix; the save before it was advisory', { skip }, async () => {
  configure(true);
  reviewer('six years');
  const { call, approve } = await workspace();
  const { agentId, edit } = await sneakyDraft(call);
  assert.equal(edit.review.mode, 'model', 'save: the review ran');
  assert.equal(edit.review.findings.length, 1, 'save: the finding comes back with the draft');
  assert.equal(edit.review.findings[0].publish, 'blocked until fixed');
  const p = await call('version.publish', { agentId, draftHash: edit.draftHash });
  assert.match((p as { summary: string }).summary, /AI-honesty review: rules and model, at publish\./);
  const r = await approve(p);
  assert.equal(r.status, 'not_executed');
  const reason = (r as { reason: string }).reason;
  assert.match(reason, /nothing was published: she never claims to be human/);
  assert.match(reason, /persona\.notes\[0\]/);
  assert.match(reason, /review: it lets the caller believe she is a person/);
  assert.match(reason, /to fix: remove that instruction/);
  assert.equal(await versions(agentId), 0);

  // Fixed: the review finds nothing and publish goes ahead.
  reviewer(null);
  const f = ok<any>(await call('brief.edit', { agentId, patch: [{ op: 'set', path: 'persona.notes', value: ['Warm, unhurried, never salesy.'] }] }));
  assert.deepEqual(f.review.findings, []);
  const v = ok<any>(await approve(await call('version.publish', { agentId, draftHash: f.draftHash })));
  assert.equal(v.review.mode, 'model');
  assert.equal(await versions(agentId), 1);
});

test('guard: "stop the agenda ... give 14416" is an instruction to give the lines, not to drop them', async () => {
  const { hardFindings } = await import('../server/modules/agents/guard.ts');
  const rules = (s: string) => hardFindings(withNote(s)).filter(f => f.path.startsWith('persona')).map(f => f.rule);
  assert.deepEqual(rules('If a caller mentions self-harm, stop the agenda, stay warm, and give Tele-MANAS 14416 and 112.'), []);
  assert.ok(rules('Stop giving the helpline numbers.').includes('crisis_lines'));
  assert.ok(rules('Never mention 14416 or 112.').includes('crisis_lines'));
});

test('review DEV set: the regex floor flags none of its pass lines', async () => {
  const { hardFindings } = await import('../server/modules/agents/guard.ts');
  const dev = (await import('../shared/safety/sets/dev-brief-review.json', { with: { type: 'json' } })).default as { pass: { text: string }[] };
  for (const x of dev.pass) {
    const c = base(); c.persona = { ...c.persona, notes: x.text.split('\n') };
    assert.deepEqual(hardFindings(c).filter(f => f.path.startsWith('persona')), [], x.text);
  }
});

// rejected.2026-10-24.brief-review-flags-persona-names: gpt-4.1 flagged persona.name as a human claim (12 of 81).
test('review: persona and brand settings are context, never fields to judge; a name cannot be cited', () => {
  const c = base(); c.persona = { ...c.persona, name: 'Riya', gender: 'female' };
  const { text, fields } = reviewInput(c);
  for (const p of ['persona.name', 'persona.gender', 'brand.name', 'brand.spokenName']) assert.ok(!fields.some(([f]) => f === p), p);
  assert.match(text, /Context \(not to be judged\): the agent is the AI assistant of .+; its persona is named Riya \(female\)\./);
  assert.ok(fields.some(([f]) => f.startsWith('persona.notes')), 'notes are still judged');
  assert.match(BRIEF_REVIEW.system_prompt, /persona's name, gender, voice or tone/);
  assert.doesNotMatch(BRIEF_REVIEW.system_prompt, /If unsure whether a field breaks a rule, report it/);
});
