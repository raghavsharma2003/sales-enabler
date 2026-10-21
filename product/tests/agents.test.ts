// Agents module, pure parts: compile() determinism, budgets, lints, templates. No database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, type AgentConfig } from '../shared/agent-config.ts';
import { BUDGET, BriefBudgetError, BriefLintError, compile, compileReport, TAIL } from '../server/modules/agents/compile.ts';
import { draftHash, validateConfig, versionHashOf } from '../server/modules/agents/config.ts';
import { shapeFields, shapeLint } from '../server/modules/agents/lint.ts';
import { TEMPLATES } from '../server/modules/agents/templates.ts';

const base = () => structuredClone(TEMPLATES.find(t => t.id === 'insurance-renewal')!.config);
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

/** Same config with every object's keys in reverse order: canonical content, different JSON layout. */
function shuffled(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shuffled);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).reverse().map(k => [k, shuffled((v as Record<string, unknown>)[k])]));
  return v;
}

test('compile is deterministic: same config, same bytes and hash, regardless of key order or a JSON round trip', () => {
  for (const t of TEMPLATES) {
    const a = compile(t.config);
    const b = compile(JSON.parse(JSON.stringify(t.config)));
    const c = compile(shuffled(t.config) as AgentConfig);
    assert.equal(a.text, b.text, t.id);
    assert.equal(a.hash, c.hash, t.id);
    assert.equal(a.bytes, bytes(a.text));
    assert.match(a.hash, /^[0-9a-f]{64}$/);
  }
  assert.equal(draftHash(shuffled(base()) as AgentConfig), draftHash(base()));
});

test('compile reflects the config: a changed persona changes the brief; version bookkeeping does not', () => {
  const c = base();
  const h = compile(c).hash;
  assert.notEqual(compile({ ...c, persona: { ...c.persona, name: 'Tanvi' } }).hash, h);
  assert.equal(compile({ ...c, version: 7, versionHash: 'x' }).hash, h);
  assert.equal(draftHash({ ...c, version: 7, versionHash: 'x' }), draftHash(c));
  assert.notEqual(versionHashOf({ ...c, version: 7 }), versionHashOf(c));
});

test('section order keeps the laws: script and identity first, facts after safety; the tail is separate and last', () => {
  const r = compileReport({ ...base(), voice: { stackId: 'v2-mai' } });
  const names = r.sections.map(s => s.name);
  assert.deepEqual(names.slice(0, 2), ['SCRIPT', 'IDENTITY']);
  assert.ok(names.indexOf('SAFETY') < names.indexOf('FACTS_ROWS'));
  assert.equal(names[names.length - 1], 'DELIVERY', 'a style-capable voice gets the delivery marker');
  assert.ok(!r.text.includes(TAIL), 'the counts and goal check are appended by the runtime after the ledger, every turn');
  assert.ok(bytes(TAIL) <= BUDGET.TAIL);
  assert.ok(!compileReport(base()).sections.some(s => s.name === 'SOUNDS' || s.name === 'DELIVERY'), 'no stack chosen: no voice-specific sections');
  assert.ok(compileReport({ ...base(), voice: { stackId: 'v2-flashlite' } }).sections.some(s => s.name === 'SOUNDS'));
});

test('generalises across languages, registers and jobs', () => {
  const tamil = compile(TEMPLATES.find(t => t.id === 'diagnostics-reminder-tamil')!.config).text;
  assert.match(tamil, /Tamil script/);
  assert.doesNotMatch(tamil, /आप with the plural/);
  const english = compile(TEMPLATES.find(t => t.id === 'investing-onboarding')!.config).text;
  assert.match(english, /Indian English/);
  assert.match(english, /You are a man/);
  assert.match(english, /investment advice/, 'the securities pack adds its rule');
  const inbound = compile(TEMPLATES.find(t => t.id === 'd2c-inbound-support')!.config).text;
  assert.match(inbound, /they phoned you/);
  assert.doesNotMatch(inbound, /first turn only checks/);
  const custom = { ...base(), job: 'custom' as const, jobDescription: 'a member of a gym whose plan lapsed: learn whether they plan to return' };
  assert.match(compile(custom).text, /gym whose plan lapsed/);
  assert.throws(() => validateConfig({ ...base(), job: 'custom' }), /jobDescription/);
  const tool = compile({ ...base(), tools: [{ name: 'end_call', risk: 'read' }] }).text;
  assert.match(tool, /end_call tool/);
  assert.doesNotMatch(tool, /<end_call>/);
});

test('budget THROWS and names the section to cut; nothing is truncated', () => {
  const big = base();
  big.facts = Array.from({ length: 30 }, (_, i) => ({ key: `row_${i}`, value: 'x'.repeat(120), purpose: 'service' as const, source: 'test' }));
  assert.throws(() => compile(big), (e: unknown) => e instanceof BriefBudgetError && e.section === 'FACTS_ROWS' && e.bytes > e.cap && /cut FACTS_ROWS/.test(e.message));

  // Every section under its own cap, but the whole over 12,000 bytes: the error names the largest section.
  const wide = base();
  wide.persona.notes = Array.from({ length: 6 }, () => 'n'.repeat(180));
  wide.objections = Array.from({ length: 7 }, (_, i) => ({ trigger: 'trigger ' + 'abcdefghij'[i], approach: 'a'.repeat(260) }));
  wide.facts = Array.from({ length: 12 }, (_, i) => ({ key: `row_${i}`, value: 'v'.repeat(170), purpose: 'service' as const, source: 'test' }));
  wide.neverSay = Array.from({ length: 6 }, (_, i) => 'competitor ' + 'abcdef'[i] + 'z'.repeat(100));
  const r = (() => { try { compile(wide); return null; } catch (e) { return e; } })();
  assert.ok(r instanceof BriefBudgetError, 'over the core cap throws');
  assert.equal(r.cap, BUDGET.CORE_TOTAL);
  assert.ok(r.bytes > BUDGET.CORE_TOTAL);
  assert.match(r.message, /largest section is \w+: cut/);
});

test('the safety lint is enforced: refuse blocks the compile, drop removes the fact', () => {
  const c = base();
  const refuse = () => [{ rule: 'T-L1' as const, path: 'opening.disclosureClause', message: 'weakens disclosure', effect: 'refuse' as const }];
  assert.throws(() => compile(c, { lint: refuse }), (e: unknown) => e instanceof BriefLintError && /disclosure/.test(e.message));
  const i = c.facts.findIndex(f => f.key === 'grace_period');
  const drop = () => [{ rule: 'T-L3' as const, path: `facts[${i}]`, message: 'not for this purpose', effect: 'drop' as const }];
  const r = compileReport(c, { lint: drop });
  assert.deepEqual(r.dropped, ['grace_period']);
  assert.doesNotMatch(r.text, /grace period:/);
  assert.match(compile(c).text, /grace period:/);
  const badDrop = () => [{ rule: 'T-L2' as const, path: 'persona.notes[0]', message: 'x', effect: 'drop' as const }];
  assert.throws(() => compile(c, { lint: badDrop }), BriefLintError, 'only facts can be dropped; anything else refuses');
});

test('an offer never reaches a service or transactional brief (T-L3 by construction)', () => {
  const solar = TEMPLATES.find(t => t.id === 'solar-lead-qualification')!.config;
  assert.match(compile(solar).text, /subsidy:/, 'promotional keeps offers');
  const r = compileReport({ ...solar, category: 'service' });
  assert.ok(r.dropped.includes('subsidy') && r.dropped.includes('survey'));
  assert.doesNotMatch(r.text, /subsidy:/);
});

test('the recitable-line lint catches lines and refuses the compile', () => {
  const bad: [string, (c: AgentConfig) => void][] = [
    ['quoted', c => { c.persona.notes = ['say "your policy is due" warmly']; }],
    ['first person', c => { c.opening.usefulFirst = 'we have great news about your cover'; }],
    ['hindi first person', c => { c.objections = [{ trigger: 'price', approach: 'main samjha deti hoon ki premium kyon badha' }]; }],
    ['greeting', c => { c.goals[0].description = 'Hello, confirm the renewal'; }],
    ['question', c => { c.opening.usefulFirst = 'would they like the link?'; }],
    ['devanagari', c => { c.persona.notes = ['बात प्यार से करें']; }],
    ['digits in a shape', c => { c.goals[0].description = 'confirm within 2 minutes'; }],
    ['direction', c => { c.persona.notes = ['[pause] then continue']; }],
    ['scripted fact', c => { c.facts[1].value = 'We are happy to renew your plan today'; }],
  ];
  for (const [label, mut] of bad) {
    const c = base(); mut(c);
    assert.ok(shapeLint(c).length > 0, label);
    assert.throws(() => compile(c), BriefLintError, label);
  }
  // Ordinary notes and data pass: apostrophes, Hindi names in facts, numbers in facts.
  const ok = base();
  ok.persona.notes = ["mirrors the caller's pace", 'explains plainly'];
  ok.facts.push({ key: 'branch', value: 'हमीरपुर branch, 2nd floor, open 10-6', purpose: 'logistics', source: 'test' });
  assert.deepEqual(shapeLint(ok), []);
});

test('templates: at least 14 across industries and jobs, each valid, under budget, with no sentence-shaped lines', () => {
  assert.ok(TEMPLATES.length >= 14);
  assert.equal(new Set(TEMPLATES.map(t => t.id)).size, TEMPLATES.length);
  assert.ok(new Set(TEMPLATES.map(t => t.industry)).size >= 8, 'many industries');
  assert.ok(new Set(TEMPLATES.map(t => t.config.job)).size >= 12, 'many jobs');
  for (const job of ['renewal_reminder', 'payment_reminder', 'appointment_confirmation', 'order_verification', 'lead_qualification', 'appointment_booking',
    'feedback_survey', 'win_back', 'onboarding_welcome', 'document_collection', 'delivery_coordination', 'event_invitation', 'inbound_support'] as const) {
    assert.ok(JOBS.includes(job) && TEMPLATES.some(t => t.config.job === job), job);
  }
  for (const t of TEMPLATES) {
    assert.deepEqual(validateConfig(t.config), t.config, `${t.id} validates unchanged`);
    assert.deepEqual(shapeLint(t.config), [], `${t.id} has no sentence-shaped lines`);
    assert.equal(t.config.voice.stackId, '', `${t.id} picks no stack: there is no default`);
    assert.match(t.config.opening.disclosureClause, /AI assistant/, `${t.id} discloses`);
    for (const [path, text] of shapeFields(t.config)) assert.ok(!/["“”]/.test(text), `${t.id} ${path}`);
    const r = compileReport(t.config);
    assert.ok(r.bytes <= BUDGET.CORE_TOTAL, `${t.id} ${r.bytes} bytes`);
    for (const s of r.sections) assert.ok(s.bytes <= BUDGET[s.name], `${t.id} ${s.name}`);
    assert.match(r.text, /Tele-MANAS 14416/, `${t.id} keeps the crisis line`);
    assert.match(r.text, /Never claim or imply you are human/);
    for (const ph of JSON.stringify(t.config).match(/\+?\d{10,}/g) ?? []) assert.match(ph, /^\+?(91)?90000000\d\d$/, `${t.id} uses only synthetic numbers`);
  }
});

test('config validation rejects unknown fields, duplicate keys and unannounced recording', () => {
  assert.throws(() => validateConfig({ ...base(), extra: 1 }), /extra/);
  const dup = base(); dup.facts.push({ ...dup.facts[0] });
  assert.throws(() => validateConfig(dup), /appears twice/);
  assert.throws(() => validateConfig({ ...base(), recording: { enabled: true, announce: false } }), /announce/);
  assert.throws(() => validateConfig({ ...base(), goals: base().goals.map(g => ({ ...g, required: false })) }), /required/);
});
