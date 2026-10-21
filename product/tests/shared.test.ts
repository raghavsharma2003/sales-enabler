import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseIndianPhone } from '../shared/phone.ts';
import { authorise, argsHash, canonicalJson, isA3, needsHumanApproval, canApprove } from '../shared/approval.ts';
import { STACKS, requireStack, getStack, combinationId, StackError } from '../shared/stacks.ts';
import { formatInr, inrToMilli, perMinute } from '../shared/money.ts';

test('phone: Indian mobiles normalise from every common shape', () => {
  for (const raw of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '+91-98765-43210', '(+91) 9876543210']) {
    const r = normaliseIndianPhone(raw);
    assert.equal(r.ok, true, raw);
    if (r.ok) { assert.equal(r.e164, '+919876543210', raw); assert.equal(r.kind, 'mobile'); }
  }
});

test('phone: Devanagari digits are read', () => {
  const r = normaliseIndianPhone('९८७६५४३२१०');
  assert.equal(r.ok && r.e164, '+919876543210');
});

test('phone: landline is kept as landline', () => {
  const r = normaliseIndianPhone('022 2345 6789');
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.e164, '+912223456789'); assert.equal(r.kind, 'landline'); }
});

test('phone: each unsafe row gets a reason, never a guess', () => {
  const cases: Record<string, string> = {
    '': 'EMPTY',
    '9.1E+11': 'SCI_NOTATION',
    '+1 415 555 0100': 'NON_INDIAN',
    '22 1234567': 'LANDLINE_TRUNCATED',
    '98765': 'TOO_SHORT',
    '98765432101': 'TOO_LONG',
    'abc': 'NOT_A_NUMBER',
    '1234567890': 'INVALID_PREFIX',
  };
  for (const [raw, reason] of Object.entries(cases)) {
    const r = normaliseIndianPhone(raw);
    assert.equal(r.ok, false, raw);
    if (!r.ok) assert.equal(r.reason, reason, raw);
  }
});

test('approval: drafts and tests run at A1; reaching people needs a human', () => {
  assert.equal(needsHumanApproval('draft'), false);
  assert.equal(needsHumanApproval('test'), false);
  for (const r of ['external', 'spend', 'destructive', 'policy'] as const) assert.equal(needsHumanApproval(r), true);
  assert.deepEqual(authorise({ tool: 'agent.draft', args: {}, risk: 'draft' }), { allowed: true, mode: 'A1' });
  const launch = authorise({ tool: 'campaign.launch', args: { id: 'c1' }, risk: 'external' });
  assert.equal(launch.allowed, false);
});

test('approval: a token is bound to the exact args', () => {
  const args = { id: 'c1', cap: 25000 };
  const token = argsHash('campaign.launch', args);
  const ok = authorise({ tool: 'campaign.launch', args, risk: 'external', approver: { role: 'operator' }, tokenArgsHash: token });
  assert.deepEqual(ok, { allowed: true, mode: 'A2' });
  const changed = authorise({ tool: 'campaign.launch', args: { id: 'c1', cap: 99000 }, risk: 'external', approver: { role: 'operator' }, tokenArgsHash: token });
  assert.equal(changed.allowed, false);
});

test('approval: roles are enforced in code', () => {
  assert.equal(canApprove('viewer', 'external'), false);
  assert.equal(canApprove('operator', 'spend'), false);
  assert.equal(canApprove('owner', 'spend'), true);
  assert.equal(canApprove('compliance', 'policy'), true);
  const viewer = authorise({ tool: 'campaign.launch', args: {}, risk: 'external', approver: { role: 'viewer' }, tokenArgsHash: argsHash('campaign.launch', {}) });
  assert.equal(viewer.allowed, false);
});

test('approval: canonical JSON ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(argsHash('t', { x: 1, y: 2 }), argsHash('t', { y: 2, x: 1 }));
});

test('approval: only risk-lowering verbs are A3', () => {
  assert.equal(isA3('campaign.pause'), true);
  assert.equal(isA3('deployment.revert_to_last_good'), true);
  assert.equal(isA3('campaign.launch'), false);
  assert.equal(isA3('budget.raise_cap'), false);
});

test('stacks: the finalised set is present and there is no default', () => {
  const ids = STACKS.map(s => s.id);
  for (const id of ['v2-live', 'v2-flashlite', 'v2-54mini', 'v2-38flash', 'v2-mai', 'v2-luna', 'sarvam-india']) assert.ok(ids.includes(id), id);
  assert.throws(() => requireStack(undefined), StackError);
  assert.throws(() => requireStack('made-up'), StackError);
  for (const s of STACKS) assert.ok(s.replyGap.grade && s.replyGap.source, s.id + ' figure must carry a grade and source');
  assert.equal(getStack('v2-flashlite-or'), undefined, 'Gemini through OpenRouter is retired (decision.2026-10-21.gemini-vertex-only)');
});

test('stacks: combination identity names what actually ran', () => {
  assert.equal(combinationId(requireStack('v2-flashlite'), 'Despina'), 'v2|azure+gemini-3.5-flash-lite+gemini-lite~Despina');
  assert.equal(combinationId(requireStack('v2-live')), 'v2|gemini-3.8-live');
});

test('money: Indian grouping and per-minute', () => {
  assert.equal(formatInr(inrToMilli(123456.78)), '₹1,23,456.78');
  assert.equal(formatInr(inrToMilli(1000)), '₹1,000');
  assert.equal(formatInr(inrToMilli(5)), '₹5');
  assert.equal(perMinute(inrToMilli(10.59), 182), inrToMilli(3.491));
});

test('validate: every validator carries a JSON Schema for the LLM tool list', async () => {
  const { obj, str, num, opt, arr } = await import('../shared/validate.ts');
  const v = obj({ name: str({ max: 10 }), n: opt(num({ int: true })), tags: arr(str()) });
  assert.deepEqual(v.schema, {
    type: 'object', additionalProperties: false,
    properties: { name: { type: 'string', maxLength: 10 }, n: { type: 'integer' }, tags: { type: 'array', items: { type: 'string' } } },
    required: ['name', 'tags'],
  });
});

test('resolveStack: curated ids resolve to their own parts; custom needs parts from the catalog; nothing is substituted', async () => {
  const { resolveStack, stackOf, requireStack, DEFAULT_STACK_ID, STACKS } = await import('../shared/stacks.ts');
  const { COMPONENTS, getComponent } = await import('../shared/components.ts');
  assert.ok(STACKS.some(s => s.id === DEFAULT_STACK_ID), 'the default is a curated stack');
  assert.deepEqual(resolveStack({ stackId: 'v2-mai' }).components, requireStack('v2-mai').components);
  for (const s of STACKS) {
    const c = s.components;
    for (const [part, id] of Object.entries({ ears: c.ears, brain: c.brain, voice: c.voice, s2s: c.s2s })) {
      if (id) assert.ok(getComponent(part as 'ears', id), `curated stack ${s.id} uses ${part} "${id}", which must be in the parts catalog`);
    }
  }
  assert.equal(new Set(COMPONENTS.map(c => `${c.part}:${c.id}`)).size, COMPONENTS.length, 'part ids are unique within a part');
  assert.equal(stackOf({ stackId: 'custom', components: { ears: 'azure', brain: 'nope', voice: 'azure' } }), undefined);
  assert.equal(stackOf({ stackId: '' }), undefined);
  assert.throws(() => resolveStack({ stackId: 'custom', components: { ears: 'azure', brain: 'gemini-3.5-flash-lite' } }), /choose the voice/);
});
