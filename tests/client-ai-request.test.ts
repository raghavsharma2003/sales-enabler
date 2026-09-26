import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { aiRequestId, newAiRequestAttempt, type RequestStorage } from '../lib/client/ai-request';

function fixture() {
  const values = new Map<string, string>(); let next = 0;
  const storage: RequestStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  const crypto = { subtle: webcrypto.subtle, randomUUID: () => `nonce-${++next}` };
  return { values, storage, crypto };
}

test('the same logical request survives retry and reload without storing input text', async () => {
  const env = fixture();
  const input = { question: 'private company deadline?', source: { id: 's1', revision: 2 } };
  const first = await aiRequestId('brain-answer', input, env);
  const afterFailure = await aiRequestId('brain-answer', { source: { revision: 2, id: 's1' }, question: 'private company deadline?' }, env);
  const afterReload = await aiRequestId('brain-answer', input, { storage: env.storage, crypto: env.crypto });
  assert.equal(first, afterFailure); assert.equal(first, afterReload);
  assert.match(first, /^ar_[a-f0-9]{64}$/);
  assert.equal([...env.values.keys(), ...env.values.values()].join(' ').includes('private company deadline'), false);
});

test('scope, changed content and changed revision produce different request IDs', async () => {
  const env = fixture();
  const base = await aiRequestId('tenant-a:planning', { prompt: 'x', revision: 1 }, env);
  assert.notEqual(base, await aiRequestId('tenant-b:planning', { prompt: 'x', revision: 1 }, env));
  assert.notEqual(base, await aiRequestId('tenant-a:planning', { prompt: 'y', revision: 1 }, env));
  assert.notEqual(base, await aiRequestId('tenant-a:planning', { prompt: 'x', revision: 2 }, env));
});

test('an explicit new attempt persists its nonce and never changes the old failure implicitly', async () => {
  const env = fixture(); const input = { sessionId: 'saved-1' };
  const initial = await aiRequestId('conversation-analysis', input, env);
  // A network failure changes no local state; retrying reuses the paid request.
  assert.equal(await aiRequestId('conversation-analysis', input, env), initial);
  const second = await newAiRequestAttempt('conversation-analysis', input, env);
  assert.notEqual(second, initial);
  assert.equal(await aiRequestId('conversation-analysis', input, env), second);
  const third = await newAiRequestAttempt('conversation-analysis', input, env);
  assert.notEqual(third, second);
});

test('storage denial keeps deterministic retry but prevents an unpersisted fresh attempt', async () => {
  const env = fixture();
  const denied: RequestStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const input = { sourceId: 's1' };
  const first = await aiRequestId('ingestion-extraction', input, { crypto: env.crypto, storage: denied });
  assert.equal(await aiRequestId('ingestion-extraction', input, { crypto: env.crypto, storage: denied }), first);
  await assert.rejects(newAiRequestAttempt('ingestion-extraction', input, { crypto: env.crypto, storage: denied }), /persist/);
});
