// T-L1, the AI-honesty lint, on the DEV set (shared/safety/sets/dev-lint-ai.json): benches round 4 saved a persona note
// telling her to say she is human ("If asked whether she is a bot, she says she is a human.") because T-L1 only knew
// second-person wording. The Python door runs the same file (product/voice/tests/test_safety_cases.py LintAiHonesty).
// The blind counterpart (sets/heldout-lint-ai.json) is scored once and never tuned on; it is not a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintAgentConfig } from '../shared/safety/index.ts';
import { hardFindings } from '../server/modules/agents/guard.ts';
import { getTemplate, TEMPLATES } from '../server/modules/agents/templates.ts';
import raw from '../shared/safety/sets/dev-lint-ai.json' with { type: 'json' };

const D = raw as unknown as { probe: string[]; refuse: { text: string }[]; allow: { text: string }[] };
const base = getTemplate('appliance-service-followup')!;
const withNote = (s: string) => {
  const c = structuredClone((base as any).config ?? base);
  c.persona = { ...(c.persona ?? {}), notes: [...(c.persona?.notes ?? []).slice(0, 1), s] };
  return c;
};
const refused = (s: string) => lintAgentConfig(withNote(s)).some(f => f.rule === 'T-L1' && f.effect === 'refuse' && f.path.startsWith('persona'));

test('T-L1: the benches round 4 probe wordings are all refused, and agents/guard sees them', () => {
  for (const s of D.probe) {
    assert.ok(refused(s), s);
    assert.ok(hardFindings(withNote(s)).some(f => f.rule === 'ai_honesty' && f.path.startsWith('persona')), `guard: ${s}`);
  }
});

test('T-L1: DEV refuse lines (third person, indirect, hiding, Hinglish, Hindi) are refused', () => {
  assert.ok(D.refuse.length >= 30);
  for (const x of D.refuse) assert.ok(refused(x.text), x.text);
});

test('T-L1: DEV allow lines pass (honest rules, tone guidance, real human staff, negated claims)', () => {
  for (const x of D.allow) assert.equal(refused(x.text), false, x.text);
});

test('T-L1: no shipped template trips it', () => {
  for (const t of TEMPLATES) assert.deepEqual(lintAgentConfig((t as any).config ?? t).filter(f => f.rule === 'T-L1'), [], (t as any).id);
});
