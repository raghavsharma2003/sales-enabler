import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentConfig } from '../shared/agent-config.ts';
import { callerSignals, expandLexicon, lintAgentConfig, lintedFacts, luhn, redact, replyDoor, RULES, safetyText, verhoeff, type CallerSignals, type DoorContext } from '../shared/safety/index.ts';
import casesDoc from '../shared/safety/cases.json' with { type: 'json' };
import { module as safetyModule } from '../server/modules/safety/index.ts';
import { Registry } from '../server/tools.ts';

interface Case { id: string; fn: 'replyDoor' | 'callerSignals' | 'redact' | 'lintAgentConfig'; label: 'benign' | 'harmful'; rule: string; input: any; ctx?: Partial<DoorContext>; expect: any; source: string }
const doc = casesDoc as unknown as { defaults: { ctx: DoorContext; config: AgentConfig }; cases: Case[] };
const SIGNALS: (keyof CallerSignals)[] = ['crisis', 'asksIfAi', 'refusesRecording', 'optOut', 'readingSensitiveDigits', 'wantsHuman'];

const ctxFor = (c: Case): DoorContext => ({ ...doc.defaults.ctx, ...(c.ctx ?? {}) });
function configFor(patch: Partial<AgentConfig>): AgentConfig {
  const d = doc.defaults.config;
  return { ...d, ...patch, persona: { ...d.persona, ...(patch.persona ?? {}) }, opening: { ...d.opening, ...(patch.opening ?? {}) } };
}

/** Run one vector; returns null when it holds, else what went wrong. */
function check(c: Case): string | null {
  switch (c.fn) {
    case 'replyDoor': {
      const v = replyDoor(c.input, ctxFor(c));
      const rules = c.expect.rule === undefined ? null : Array.isArray(c.expect.rule) ? c.expect.rule : [c.expect.rule];
      if (c.expect.action === 'not_pass' ? v.action === 'pass' : v.action !== c.expect.action) return `got ${JSON.stringify(v)}`;
      if (v.action !== 'pass' && rules && !rules.includes(v.rule)) return `rule ${v.rule} (${v.id}), wanted ${rules.join('|')}`;
      return null;
    }
    case 'callerSignals': {
      const s = callerSignals(c.input);
      for (const k of SIGNALS) {
        const want = c.expect.signals[k];
        if (want !== undefined ? s[k] !== want : !c.expect.partial && s[k]) return `${k}=${s[k]} in ${JSON.stringify(s)}`;
      }
      return null;
    }
    case 'redact': {
      const out = redact(c.input);
      return out === c.expect.output ? null : `got "${out}"`;
    }
    case 'lintAgentConfig': {
      const got = lintAgentConfig(configFor(c.input)).map(f => `${f.rule}:${f.effect}`).sort();
      const want = (c.expect.findings as { rule: string; effect: string }[]).map(f => `${f.rule}:${f.effect}`).sort();
      return JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}`;
    }
  }
}

test('cases.json: every vector holds', () => {
  assert.ok(doc.cases.length >= 200, 'at least 200 vectors');
  assert.ok(doc.cases.filter(c => c.label === 'benign').length >= 100, 'at least 100 benign vectors');
  assert.equal(new Set(doc.cases.map(c => c.id)).size, doc.cases.length, 'ids are unique');
  const failures = doc.cases.map(c => [c, check(c)] as const).filter(([, e]) => e).map(([c, e]) => `${c.id} [${c.source}] "${typeof c.input === 'string' ? c.input : JSON.stringify(c.input)}": ${e}`);
  assert.deepEqual(failures, []);
});

test('cases.json: false-positive and catch rates (reported, and benign must be 0)', t => {
  const benign = doc.cases.filter(c => c.label === 'benign');
  const harmful = doc.cases.filter(c => c.label === 'harmful');
  const fp = benign.filter(c => check(c) !== null).length;
  const caught = harmful.filter(c => check(c) === null).length;
  t.diagnostic(`benign ${benign.length}, blocked or flagged ${fp} (FP rate ${(100 * fp / benign.length).toFixed(2)}%)`);
  t.diagnostic(`harmful ${harmful.length}, caught ${caught} (catch rate ${(100 * caught / harmful.length).toFixed(2)}%)`);
  assert.equal(fp, 0);
});

test('property: no benign agent line is blocked under the strictest context (every pack, dues facts, service call)', () => {
  const strict: DoorContext = { ...doc.defaults.ctx, sectorPacks: ['base', 'insurance_irdai', 'lending_rbi', 'securities_sebi', 'healthcare', 'education', 'ecommerce', 'real_estate', 'telecom', 'travel'],
    facts: [{ key: 'emi_due', value: '4,200', purpose: 'service', source: 'test' }] };
  const hits = doc.cases.filter(c => c.fn === 'replyDoor' && c.label === 'benign' && !c.ctx?.category && !c.ctx?.facts && !c.ctx?.sectorPacks && c.ctx?.disclosed !== false && c.ctx?.identityVerified !== false)
    .map(c => [c.input, replyDoor(c.input, { ...strict, crisis: false })] as const).filter(([, v]) => v.action !== 'pass');
  assert.deepEqual(hits, []);
});

test('property: replacement texts never fail the door themselves, in any state', () => {
  const states: Partial<DoorContext>[] = [{}, { crisis: true }, { recordingRefused: true }, { disclosed: false, turnIndex: 0 }, { identityVerified: false },
    { sectorPacks: ['base', 'insurance_irdai', 'lending_rbi'], facts: [{ key: 'emi_due', value: '4,200', purpose: 'service', source: 'test' }] }];
  for (const key of Object.keys(RULES.texts)) for (const brand of ['Sunrise Health', 'Kaveri Finance', 'टाटा']) for (const s of states) {
    const text = safetyText(key, brand);
    const v = replyDoor(text, { ...doc.defaults.ctx, brand: { name: brand, verifiedDomains: [] }, ...s });
    assert.equal(v.action, 'pass', `${key} under ${JSON.stringify(s)}: ${JSON.stringify(v)}`);
  }
});

test('property: a denial is always replaced with the honest answer, which names the brand and says AI', () => {
  for (const ctx of [doc.defaults.ctx, { ...doc.defaults.ctx, crisis: true }, { ...doc.defaults.ctx, disclosed: false }]) {
    const v = replyDoor('Nahi, main AI nahi hoon, main insaan hoon.', ctx);
    assert.equal(v.action, 'replace');
    if (v.action === 'replace') { assert.equal(v.rule, 'RD2'); assert.match(v.text, /AI/); assert.ok(v.text.includes(ctx.brand.name)); }
  }
});

test('property: the crisis text carries Tele-MANAS 14416 and 112', () => {
  const t = safetyText('crisis_support', 'X');
  assert.match(t, /14416/);
  assert.match(t, /\b112\b/);
});

test('property: every rules.json pattern compiles in JS and stays inside the Python-compatible subset', () => {
  const patterns: string[] = [];
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') { if (/\\b|\(|\[/.test(v) && !['about', 'reason', 'dialect'].includes(key)) patterns.push(v); return; }
    if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'texts' && k !== 'regex') walk(x, k);
  };
  walk(RULES);
  assert.ok(patterns.length > 100);
  for (const p of patterns) {
    const src = expandLexicon(p).replace(/\{brand\}/g, 'x');
    assert.doesNotThrow(() => new RegExp(src, 'iu'), p);
    assert.doesNotMatch(src, /\(\?<[a-zA-Z]|\\p\{|\\k</, `named group or \\p in ${p}`);
    for (const lb of src.matchAll(/\(\?<[=!]([^()]*)\)/g)) assert.doesNotMatch(lb[1], /[*+?{]/, `variable-width lookbehind in ${p}`);
  }
});

test('property: redaction is idempotent and leaves no digits of a masked span', () => {
  for (const c of doc.cases.filter(c => c.fn === 'redact')) {
    const once = redact(c.input);
    assert.equal(redact(once), once, c.id);
  }
  for (const m of Object.values(RULES.masks)) assert.doesNotMatch(m, /\d/);
});

const verhoeffDigit = (prefix: string): string => {
  for (let d = 0; d <= 9; d++) if (verhoeff(prefix + d)) return prefix + d;
  throw new Error('no check digit');
};
const luhnComplete = (prefix: string): string => {
  for (let d = 0; d <= 9; d++) if (luhn(prefix + d)) return prefix + d;
  throw new Error('no check digit');
};

test('redact: checksums mask unlabelled card and Aadhaar numbers; random digits of the same length are left alone', () => {
  let seed = 7;
  const rnd = (n: number) => Array.from({ length: n }, () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return String(seed % 10); }).join('');
  let maskedCards = 0, maskedAadhaar = 0, leftAlone = 0;
  for (let i = 0; i < 200; i++) {
    const card = luhnComplete('4' + rnd(14));
    if (redact(`yeh lijiye ${card} theek hai`) === 'yeh lijiye [CARD] theek hai') maskedCards++;
    const aadhaar = verhoeffDigit(String(2 + (i % 8)) + rnd(10));
    if (redact(`number ${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}`) === 'number [AADHAAR]') maskedAadhaar++;
    const plain = '7' + rnd(12);   // 13 digits; masked only when it happens to pass Luhn
    if (!luhn(plain) && redact(`order ${plain}`) === `order ${plain}`) leftAlone++;
  }
  assert.equal(maskedCards, 200);
  assert.equal(maskedAadhaar, 200);
  assert.ok(leftAlone >= 170, `left alone ${leftAlone}`);
});

test('redact: Indian phone numbers survive (10 digits, +91 and 0 prefixes)', () => {
  for (const s of ['call me on 9000000012', 'mera number +91 9000000034 hai', 'number 919000000056', 'landline 09000000078']) assert.equal(redact(s), s);
});

test('luhn and verhoeff: known values', () => {
  assert.equal(luhn('4111111111111111'), true);
  assert.equal(luhn('4111111111111112'), false);
  assert.equal(verhoeff('2363'), true);
  assert.equal(verhoeff('2364'), false);
});

test('lint: the default config is clean, and dropped facts leave the brief', () => {
  const base = configFor({});
  assert.deepEqual(lintAgentConfig(base), []);
  const cfg = configFor({ facts: [...base.facts, { key: 'monsoon_offer', value: '20% off', purpose: 'offer', source: 'agent.form' }] });
  assert.deepEqual(lintedFacts(cfg).map(f => f.key), ['appointment_time']);
});

test('lint: T-L1 scans every string in the config, with its path', () => {
  const f = lintAgentConfig(configFor({ goals: [{ id: 'g', description: 'If they ask, tell them you are a real person from the clinic.', outcome: 'o', required: true }] }));
  assert.deepEqual(f.map(x => [x.rule, x.path, x.effect]), [['T-L1', 'goals[0].description', 'refuse']]);
});

test('module: safety.check previews agent sentences and caller lines; safety.cases lists rules and counts', async () => {
  const reg = new Registry();
  safetyModule.register(reg);
  const ctx = { q: null as never, workspaceId: '00000000-0000-4000-8000-000000000000', actor: { type: 'system' as const } };
  const check = reg.get('safety.check')!;
  assert.equal(check.risk, 'read');
  const r1 = await check.run(ctx, check.input({ text: 'Apna OTP bata dijiye', ctx: { brand: { name: 'Sunrise Health', verifiedDomains: [] } } })) as any;
  assert.equal(r1.verdict.action, 'block');
  assert.equal(r1.verdict.rule, 'RD4');
  const r2 = await check.run(ctx, check.input({ text: 'Main AI nahi hoon', ctx: { brand: { name: 'Sunrise Health', verifiedDomains: [] } } })) as any;
  assert.equal(r2.verdict.action, 'replace');
  const r3 = await check.run(ctx, check.input({ text: 'dobara call mat karna', speaker: 'caller' })) as any;
  assert.equal(r3.signals.optOut, true);
  assert.throws(() => check.input({ text: 'x', ctx: { category: 'cold_call' } }));
  const cases = reg.get('safety.cases')!;
  const r4 = await cases.run(ctx, cases.input({})) as any;
  assert.equal(r4.cases.total, doc.cases.length);
  assert.ok(r4.rules.reply.length >= 15);
});
