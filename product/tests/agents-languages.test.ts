// The product's language model (2026-10-24): each part and stack declares its languages (measured or stated, never
// upgraded), an agent may only speak what its stack hears and speaks, language variants reuse the brief's facts and
// agenda, and campaigns route each contact to a version that speaks their language, else fall back with a reason.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { LANGUAGES } from '../shared/agent-config.ts';
import { COMPONENTS } from '../shared/components.ts';
import { DISCLOSURE } from '../shared/safety/disclosure.ts';
import { getStack, stackLanguage, stackLanguages, STACKS } from '../shared/stacks.ts';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { languageProblems, routeContact, serves, toLanguage } from '../server/modules/agents/languages.ts';
import { compile } from '../server/modules/agents/compile.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';
import { routeAttempt } from '../server/modules/campaigns/languages.ts';

const emi = TEMPLATES.find(t => t.id === 'lending-emi-reminder')!.config;
const HEX = /[0-9a-f]{8,}/i;

test('every part declares its languages; only what our tests ran is measured', () => {
  for (const c of COMPONENTS) {
    assert.ok(c.languages.measured.length + c.languages.stated.length > 0, `${c.part}/${c.id} declares languages`);
    for (const l of c.languages.measured) assert.ok(['hi-IN', 'hinglish', 'en-IN'].includes(l), `${c.part}/${c.id}: ${l} was never run in our tests, so it cannot be measured`);
    assert.ok(!c.languages.measured.some(l => c.languages.stated.includes(l)), `${c.id}: a language is measured or stated, not both`);
    for (const l of [...c.languages.measured, ...c.languages.stated]) assert.ok((LANGUAGES as readonly string[]).includes(l));
    assert.ok(c.languages.source.length > 20 && !HEX.test(c.languages.source));
  }
});

test('a stack serves a language only if every part does, graded by its weakest part', () => {
  const flash = getStack('v2-flashlite')!;
  assert.deepEqual([stackLanguage(flash, 'hinglish').ok, stackLanguage(flash, 'hinglish').grade], [true, 'measured']);
  assert.deepEqual([stackLanguage(flash, 'ta-IN').ok, stackLanguage(flash, 'ta-IN').grade], [true, 'stated']);
  const kn = stackLanguage(flash, 'kn-IN');
  assert.equal(kn.ok, false);
  assert.deepEqual(kn.missing.map(m => m.part), ['voice'], 'Kannada: the voice is the part that cannot speak it');
  assert.deepEqual(stackLanguage(getStack('v2-mai')!, 'ta-IN').missing.map(m => m.part), ['voice']);
  for (const s of STACKS) for (const l of stackLanguages(s)) {
    if (l.grade === 'measured') assert.ok(l.parts.every(p => p.grade === 'measured'), `${s.id}/${l.language}`);
  }
});

test('contact languages normalise; Hindi and Hinglish serve each other; routing falls back with a reason', () => {
  assert.deepEqual(['kn', 'kn-IN', 'Kannada', 'Bangla', 'hinglish', 'xx', '', null].map(toLanguage), ['kn-IN', 'kn-IN', 'kn-IN', 'bn-IN', 'hinglish', null, null, null]);
  assert.ok(serves(emi, 'hi-IN') && serves(emi, 'en-IN') && !serves(emi, 'ta-IN'));
  const main = { id: 'main', agent: emi };
  const tamil = { id: 'ta', agent: { ...emi, languages: { primary: 'ta-IN' as const, allowed: ['ta-IN' as const, 'en-IN' as const], mirrorCaller: true } } };
  assert.deepEqual(routeContact('ta', main, [tamil]), { version: tamil, servedBy: 'variant', language: 'ta-IN' });
  assert.equal(routeContact('Hindi', main, [tamil]).servedBy, 'main');
  assert.equal(routeContact(null, main, [tamil]).servedBy, 'unknown_language');
  const kn = routeContact('kn-IN', main, [tamil]);
  assert.deepEqual([kn.version.id, kn.servedBy], ['main', 'fallback']);
  assert.match(kn.reason!, /no version of this agent speaks Kannada; called in Hinglish/);
});

test('validation names the language, the stack and the part', () => {
  const p = languageProblems({ ...emi, voice: { stackId: 'v2-flashlite' }, languages: { primary: 'hinglish', allowed: ['hinglish', 'kn-IN'], mirrorCaller: true } });
  assert.equal(p.length, 1);
  assert.match(p[0].message, /^Kannada is not supported by the voice stack .+: its voice \(Gemini 3\.8 Flash-Lite voice\) does not support Kannada\. Choose a stack that supports Kannada, or remove Kannada from the agent's languages\.$/);
  assert.ok(!/[ऀ-ॿ]|\b(hai|nahi|aap)\b/i.test(p[0].message), 'professional English, no Hindi or Hinglish');
});

// ------------------------------------------------------------------------------------------------ database

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry;
before(() => { if (skip) return; pool = createPool(); registry = buildApp(pool, modules).registry; });
after(async () => { await pool?.end(); });

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('languages test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `lg${Math.random()}@example.test`]))!.id;
  const as = { workspaceId: ws, actor: { type: 'member' as const, id: owner, role: 'owner' as const } };
  const exec = (name: string, args: unknown) => registry.execute<any>(pool, name, args, as);
  const approve = (r: any) => registry.approve<any>(pool, r.actionId, { workspaceId: ws, memberId: owner });
  const ok = async (name: string, args: unknown) => {
    let r: any = await exec(name, args);
    if (r.status === 'needs_approval') r = await approve(r);
    assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`);
    return r.result;
  };
  return { ws, owner, exec, approve, ok };
}

test('draft writes refuse a language the stack cannot serve; stack cards list languages with grades', { skip }, async () => {
  const w = await world();
  const a = await w.ok('agent.create', { name: 'EMI reminders', templateId: 'lending-emi-reminder' });
  await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const r = await w.exec('brief.edit', { agentId: a.agentId, patch: [{ op: 'append', path: 'languages.allowed', value: 'kn-IN' }] });
  assert.equal(r.status, 'not_executed');
  assert.match(r.reason, /Kannada is not supported by the voice stack .+its voice \(Gemini 3\.8 Flash-Lite voice\)/);
  const ok = await w.exec('brief.edit', { agentId: a.agentId, patch: [{ op: 'append', path: 'languages.allowed', value: 'ta-IN' }] });
  assert.equal(ok.status, 'confirmed', 'Tamil is stated for every part of this stack');

  const t = await w.ok('agent.create', { name: 'Lab tests', templateId: 'diagnostics-reminder-tamil' });
  const s = await w.exec('stack.set', { agentId: t.agentId, stackId: 'v2-mai' });
  assert.equal(s.status, 'not_executed');
  assert.match(s.reason, /Tamil is not supported .+its voice \(Azure MAI voice, with emotion styles\)/);

  const list = await w.ok('stack.list', {});
  const flash = list.stacks.find((x: { id: string }) => x.id === 'v2-flashlite');
  assert.deepEqual(flash.languages.find((l: { language: string }) => l.language === 'hinglish'), { language: 'hinglish', name: 'Hinglish', grade: 'measured' });
  assert.equal(flash.languages.find((l: { language: string }) => l.language === 'ta-IN').grade, 'stated');
  assert.ok(!flash.languages.some((l: { language: string }) => l.language === 'kn-IN'));
});

async function publishedEmi(w: Awaited<ReturnType<typeof world>>) {
  const a = await w.ok('agent.create', { name: 'EMI reminders', templateId: 'lending-emi-reminder' });
  const s = await w.ok('stack.set', { agentId: a.agentId, stackId: 'v2-flashlite' });
  const v = await w.ok('version.publish', { agentId: a.agentId, draftHash: s.draftHash });
  return { agentId: a.agentId as string, v };
}

test('a language variant reuses the facts and agenda, needs approval, and is never the live version', { skip }, async () => {
  const w = await world();
  const { agentId, v } = await publishedEmi(w);
  const card = await w.exec('version.language_variant', { agentId, language: 'ta-IN' });
  assert.equal(card.status, 'needs_approval');
  assert.match(card.summary, /^Publish EMI reminders in Tamil, from version 1, with the same facts and agenda\. Voice: .+ Campaign contacts who prefer Tamil are called by this version\.$/);
  assert.ok(!HEX.test(card.summary));
  const done = ((await w.approve(card)) as any).result;
  assert.equal(done.kind, 'variant');
  const row = (await one<{ config: any; kind: string }>(pool, 'SELECT config, kind FROM agent_version WHERE id = $1', [done.versionId]))!;
  const base = (await one<{ config: any }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [v.versionId]))!.config;
  assert.deepEqual(row.config.agent.languages, { primary: 'ta-IN', allowed: ['ta-IN', 'en-IN'], mirrorCaller: true });
  assert.deepEqual([row.config.agent.facts, row.config.agent.goals, row.config.agent.objections], [base.agent.facts, base.agent.goals, base.agent.objections]);
  assert.match(row.config.brief.text, /every Tamil word in Tamil script/);
  assert.equal(row.config.brief.hash, compile(row.config.agent).hash);
  assert.ok(DISCLOSURE.lines['ta-IN'], 'her spoken disclosure in Tamil comes from shared/safety');
  const list = await w.ok('agent.list', {});
  assert.equal(list.agents[0].live_version_id, v.versionId, 'the variant is not the live version');

  const kn = await w.approve(await w.exec('version.language_variant', { agentId, language: 'kn-IN', stackId: 'sarvam-india' }));
  assert.ok(kn.status === 'not_executed' && /no checked AI disclosure line in Kannada yet/.test(kn.reason), JSON.stringify(kn));
  const bn = await w.approve(await w.exec('version.language_variant', { agentId, language: 'bn-IN', stackId: 'v2-mai' }));
  assert.ok(bn.status === 'not_executed' && /Bengali is not supported by the voice stack .+its voice/.test(bn.reason), JSON.stringify(bn));
});

test('routing at claim sends each contact to a version that speaks their language, else the main one with the reason; the warning counts only those', { skip }, async () => {
  const w = await world();
  const { agentId, v } = await publishedEmi(w);
  const ta = await w.ok('version.language_variant', { agentId, language: 'ta-IN' });
  // Bengali is served end to end only by the beta Sarvam stack (Vertex lists Bengali for Bangladesh only), and a beta
  // stack cannot call real people, so Bengali contacts fall back with a reason.
  const bn = await w.ok('version.language_variant', { agentId, language: 'bn-IN', stackId: 'sarvam-india' });
  const audience = (await one<{ id: string }>(pool, "INSERT INTO audience (workspace_id, name) VALUES ($1, 'Deccan list') RETURNING id", [w.ws]))!.id;
  const contacts: Record<string, string> = {};
  for (const [i, lang] of ['kn-IN', 'Bengali', 'ta', 'te-IN', 'hi-IN', null].entries()) {
    const c = (await one<{ id: string }>(pool, 'INSERT INTO contact (workspace_id, e164, name, language) VALUES ($1,$2,$3,$4) RETURNING id', [w.ws, `+9190000000${30 + i}`, `Person ${i}`, lang]))!.id;
    contacts[String(lang)] = c;
    await pool.query('INSERT INTO audience_member (audience_id, contact_id) VALUES ($1,$2)', [audience, c]);
  }
  const d = await w.ok('campaign.draft', { name: 'EMI November', category: 'transactional', agentVersionId: v.versionId, capInrMilli: 5_000_000 });
  await pool.query('UPDATE campaign SET audience_id = $2 WHERE id = $1', [d.id, audience]);

  const at = (lang: string) => routeAttempt(pool, w.ws, { campaign_id: d.id, contact_id: contacts[lang], agent_version_id: v.versionId, kind: 'campaign' });
  assert.deepEqual(await at('ta'), { preferred: 'ta-IN', servedBy: 'variant', versionId: ta.versionId });
  const bnRoute = await at('Bengali');
  assert.deepEqual([bnRoute!.servedBy, bnRoute!.versionId], ['fallback', v.versionId], 'a beta-stack variant cannot dial, so it serves no one');
  assert.notEqual(bnRoute!.versionId, bn.versionId);
  assert.deepEqual(await at('hi-IN'), { preferred: 'hi-IN', servedBy: 'main', versionId: v.versionId });
  assert.deepEqual(await at('null'), { preferred: null, servedBy: 'unknown_language', versionId: v.versionId });
  const kn = await at('kn-IN');
  assert.deepEqual([kn!.servedBy, kn!.versionId], ['fallback', v.versionId]);
  assert.match(kn!.reason!, /no version of this agent speaks Kannada/);
  assert.equal(await routeAttempt(pool, w.ws, { campaign_id: null, contact_id: contacts['ta'], agent_version_id: v.versionId, kind: 'single' }), null, 'single calls keep their version');

  const g = await w.ok('campaign.get', { id: d.id });
  const warn = g.warnings.find((x: { code: string }) => x.code === 'language_mismatch');
  assert.equal(warn.message, '3 of 6 people prefer a language this agent does not speak (Bengali, Kannada, Telugu).', 'Tamil is served by its version');
  assert.match(warn.why, /They will be called in Hinglish\. This agent and its language versions speak /);
  assert.equal(warn.fix.tool, 'version.language_variant');
  assert.ok(!g.blockers.some((b: { code: string }) => b.code === 'language_mismatch'));
});

test('explicit language routes are checked: the version must speak the language and match the call category', { skip }, async () => {
  const w = await world();
  const { v } = await publishedEmi(w);
  const other = await w.ok('agent.create', { name: 'Tamil lab', templateId: 'diagnostics-reminder-tamil' });
  const s = await w.ok('stack.set', { agentId: other.agentId, stackId: 'v2-flashlite' });
  const ov = await w.ok('version.publish', { agentId: other.agentId, draftHash: s.draftHash });
  const wrongCategory = await w.exec('campaign.draft', { name: 'x', category: 'transactional', agentVersionId: v.versionId, languageRoutes: [{ language: 'ta-IN', agentVersionId: ov.versionId }] });
  assert.ok(wrongCategory.status === 'not_executed' && /service calls, but the campaign is for transaction calls/.test(wrongCategory.reason), JSON.stringify(wrongCategory));
  const wrongLanguage = await w.exec('campaign.draft', { name: 'x', category: 'service', agentVersionId: ov.versionId, languageRoutes: [{ language: 'bn-IN', agentVersionId: ov.versionId }] });
  assert.ok(wrongLanguage.status === 'not_executed' && /does not speak Bengali/.test(wrongLanguage.reason), JSON.stringify(wrongLanguage));
  const fine = await w.exec('campaign.draft', { name: 'x', category: 'service', agentVersionId: ov.versionId, languageRoutes: [{ language: 'ta-IN', agentVersionId: ov.versionId }] });
  assert.equal(fine.status, 'confirmed', JSON.stringify(fine));
});
