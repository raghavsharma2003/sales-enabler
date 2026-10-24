// The web resolves an agent's or a call's voice stack from stack.list instead of bundling the server's catalog
// (web/src/voice-stack.ts). It must name the same stack, label and status as the server's own resolver for every curated
// stack and every complete combination of parts, and refuse what the server refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from '../shared/components.ts';
import { STACKS, stackOf } from '../shared/stacks.ts';
import { resolveVoiceStack, type StackCatalog } from '../web/src/voice-stack.ts';

// What stack.list sends, reduced to the fields the web reads (agents/index.ts stackCard and the components list).
const catalog: StackCatalog = {
  stacks: STACKS.map(s => ({ id: s.id, label: s.label, kind: s.kind, status: s.status })),
  components: COMPONENTS.map(c => ({ id: c.id, part: c.part, label: c.label })),
};
const lite = (s: ReturnType<typeof stackOf>) => s && { id: s.id, label: s.label, kind: s.kind, status: s.status };

test('voice stack: the web names every curated stack as the server does', () => {
  for (const s of STACKS) assert.deepEqual(resolveVoiceStack(catalog, { stackId: s.id }), lite(stackOf({ stackId: s.id })), s.id);
  assert.equal(resolveVoiceStack(catalog, { stackId: 'no-such-stack' }), undefined);
  assert.equal(resolveVoiceStack(catalog, { stackId: null }), undefined);
});

test('voice stack: a stack built part by part matches the server for every complete combination, and is always beta', () => {
  const of = (part: string) => COMPONENTS.filter(c => c.part === part).map(c => c.id);
  let n = 0;
  for (const ears of of('ears')) for (const brain of of('brain')) for (const voice of of('voice')) {
    const v = { stackId: 'custom', components: { ears, brain, voice } };
    assert.deepEqual(resolveVoiceStack(catalog, v), lite(stackOf(v)), `${ears}+${brain}+${voice}`); n++;
  }
  for (const s2s of of('s2s')) { const v = { stackId: 'custom', components: { s2s } }; assert.deepEqual(resolveVoiceStack(catalog, v), lite(stackOf(v)), s2s); n++; }
  assert.ok(n > 10, `combinations checked: ${n}`);
  assert.equal(resolveVoiceStack(catalog, { stackId: 'custom', components: { ears: of('ears')[0], brain: of('brain')[0] } })?.label, undefined, 'no voice: incomplete');
  assert.equal(resolveVoiceStack(catalog, { stackId: 'custom', components: { s2s: of('s2s')[0], voice: of('voice')[0] } }), undefined, 'speech-to-speech is chosen alone');
  assert.equal(resolveVoiceStack(catalog, { stackId: 'custom', components: { ears: 'nope', brain: of('brain')[0], voice: of('voice')[0] } }), undefined, 'a part we do not offer');
});
