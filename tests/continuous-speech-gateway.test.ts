import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createVoiceGateway } from '../lib/public-agent/gateway';
import type { ContinuousSpeechAuthority } from '../lib/voice/continuous-speech-authority';
import type { ContinuousSpeechGatewayDependencies } from '../lib/voice/continuous-speech-gateway';
import type { ContinuousSpeechProviderOptions } from '../lib/voice/continuous-speech-provider';

const origin = 'https://private.example.test', ticket = 'a'.repeat(64);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown) { for (let i = 0; i < 200; i++) { if (check()) return; await delay(5); } throw new Error('Expected bounded event did not arrive.'); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function harness(overrides: Partial<ContinuousSpeechGatewayDependencies> = {}) {
  let claims = 0, allocations = 0, starts = 0, closes = 0, writes = 0, finalized = 0, revoked = false;
  let options!: ContinuousSpeechProviderOptions;
  const summaries: unknown[] = [];
  const authority: ContinuousSpeechAuthority = { id: 'ticket', organizationId: 'org', userId: 'user', callId: 'call', callKind: 'platform:voice_preview', origin, language: 'en-IN', sessionEpoch: 'epoch', expiresAt: new Date(Date.now() + 5000).toISOString(), concurrencyKey: 'user' };
  const dependencies: ContinuousSpeechGatewayDependencies = {
    claim: async (value, incoming) => { claims++; if (value !== ticket || incoming !== origin) throw new Error('Private auth error'); return authority; },
    recheck: async () => { if (revoked) throw new Error('Private revocation error'); },
    close: async (_authority, summary) => { finalized++; summaries.push(summary); },
    createProvider: async callbacks => { allocations++; options = callbacks; return { start() { starts++; options.onStarted(); }, write(frame) { assert.equal(frame.byteLength, 640); writes++; }, close() { closes++; } }; },
    recheckMs: 20, ...overrides,
  };
  const gateway = createVoiceGateway(undefined, dependencies); gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  const url = `ws://127.0.0.1:${(gateway.server.address() as { port: number }).port}/private-speech`;
  const client = new WebSocket(url, { origin }), events: any[] = [];
  client.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(client, 'open');
  const start = async () => { client.send(JSON.stringify({ type: 'start', ticket })); await until(() => events.some(event => event.state === 'ready')); };
  return { gateway, client, events, start, url, authority, summaries, counts: () => ({ claims, allocations, starts, closes, writes, finalized }), callbacks: () => options, revoke: () => { revoked = true; }, cleanup: () => { client.terminate(); gateway.shutdown(); } };
}

test('real local private speech transport authorizes before provider, forwards PCM/hypotheses and saves metadata only', async () => {
  const h = await harness(); try {
    assert.equal(h.counts().allocations, 0); await h.start(); h.client.send(Buffer.alloc(640)); await until(() => h.counts().writes === 1);
    h.callbacks().onHypothesis({ type: 'hypothesis', sessionEpoch: 'epoch', segmentId: 1, revision: 1, audioStartSample: 0, audioEndSample: 320, text: 'transient fictional phrase', state: 'interim' });
    await until(() => h.events.some(event => event.type === 'hypothesis'));
    h.client.send(JSON.stringify({ type: 'stop' })); await until(() => h.counts().finalized === 1);
    assert.equal(h.counts().closes, 1); assert.equal(h.counts().starts, 1); assert.doesNotMatch(JSON.stringify(h.summaries), /transient|phrase|ticket/);
    assert.equal((h.summaries[0] as any).audioBytes, 640);
  } finally { h.cleanup(); }
});

test('preauth PCM, malformed messages, duplicate start and unsupported provider commands fail closed', async () => {
  for (const mode of ['pcm', 'json', 'forged', 'duplicate', 'provider', 'size']) {
    const h = await harness(); try {
      if (['duplicate', 'provider', 'size'].includes(mode)) await h.start();
      if (mode === 'pcm') h.client.send(Buffer.alloc(640));
      if (mode === 'json') h.client.send('{');
      if (mode === 'forged') h.client.send(JSON.stringify({ type: 'start', ticket: 'b'.repeat(64) }));
      if (mode === 'duplicate') h.client.send(JSON.stringify({ type: 'start', ticket }));
      if (mode === 'provider') h.client.send(JSON.stringify({ type: 'response.create' }));
      if (mode === 'size') h.client.send(Buffer.alloc(641));
      await until(() => h.events.some(event => event.state === 'unavailable'));
      assert.equal(h.counts().allocations, ['duplicate', 'provider', 'size'].includes(mode) ? 1 : 0);
    } finally { h.cleanup(); }
  }
});

test('end during pending claim releases late authority without allocating provider', async () => {
  const pending = deferred<ContinuousSpeechAuthority>();
  const h = await harness({ claim: () => pending.promise }); try {
    h.client.send(JSON.stringify({ type: 'start', ticket })); h.client.send(JSON.stringify({ type: 'stop' }));
    await until(() => h.events.some(event => event.state === 'ended')); pending.resolve(h.authority);
    await until(() => h.counts().finalized === 1); assert.equal(h.counts().allocations, 0);
  } finally { h.cleanup(); }
});

test('disconnect while SDK allocation awaits disposes late resource without start', async () => {
  const pending = deferred<any>(); let called = false, starts = 0, closes = 0;
  const h = await harness({ createProvider: () => { called = true; return pending.promise; } }); try {
    h.client.send(JSON.stringify({ type: 'start', ticket })); await until(() => called); h.client.terminate(); await until(() => h.counts().finalized === 1);
    pending.resolve({ start() { starts++; }, write() {}, close() { closes++; } }); await until(() => closes === 1); assert.equal(starts, 0);
  } finally { h.cleanup(); }
});

test('readiness does not await SDK callback; missing callback still hits startup deadline', async () => {
  let starts = 0, closes = 0;
  const h = await harness({ startTimeoutMs: 50, createProvider: async () => ({ start() { starts++; }, write() {}, close() { closes++; } }) }); try {
    await h.start(); assert.equal(starts, 1); h.client.send(Buffer.alloc(640));
    await until(() => h.events.some(event => event.reason === 'provider')); assert.equal(closes, 1);
  } finally { h.cleanup(); }
});

test('revocation and SDK error close recognition once without reconnect', async () => {
  for (const mode of ['revoke', 'sdk']) {
    const h = await harness(); try { await h.start(); if (mode === 'revoke') h.revoke(); else h.callbacks().onFailure('provider'); await until(() => h.counts().finalized === 1); assert.equal(h.counts().closes, 1); assert.equal(h.counts().starts, 1); }
    finally { h.cleanup(); }
  }
});

test('per-user and global capacity fail before a second provider starts', async () => {
  for (const maximum of [1, 20]) {
    const h = await harness({ maxSessions: maximum }); let second: WebSocket | undefined;
    try {
      await h.start(); second = new WebSocket(h.url, { origin }); const events: any[] = [];
      second.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(second, 'open');
      if (maximum !== 1) second.send(JSON.stringify({ type: 'start', ticket }));
      await until(() => events.some(event => event.reason === 'capacity')); assert.equal(h.counts().starts, 1);
    } finally { second?.terminate(); h.cleanup(); }
  }
});

test('wall-rate burst, idle input and slow client stop with no queued output growth', async () => {
  for (const mode of ['rate', 'idle', 'slow']) {
    const h = await harness({ idleTimeoutMs: 60 }); try {
      await h.start();
      if (mode === 'rate') for (let i = 0; i < 27; i++) h.client.send(Buffer.alloc(640));
      if (mode === 'slow') { const socket = [...h.gateway.speechSockets.clients][0]; Object.defineProperty(socket, 'bufferedAmount', { value: 40_000 }); h.callbacks().onHypothesis({ type: 'hypothesis', sessionEpoch: 'epoch', segmentId: 1, revision: 1, audioStartSample: 0, audioEndSample: 320, text: 'x', state: 'interim' }); }
      await until(() => h.counts().finalized === 1); assert.equal(h.counts().closes, 1); assert.ok(h.counts().writes <= 26);
      if (mode !== 'slow') await until(() => h.events.some(event => event.reason === 'input_limit'));
    } finally { h.cleanup(); }
  }
});

test('a bounded 500 ms network burst is accepted, then input still obeys the 50 fps refill rate', async () => {
  let at = 0;
  const h = await harness({ now: () => at }); try {
    await h.start(); for (let i = 0; i < 25; i++) h.client.send(Buffer.alloc(640));
    await until(() => h.counts().writes === 25); assert.equal(h.counts().finalized, 0);
    at = 20; h.client.send(Buffer.alloc(640)); await until(() => h.counts().writes === 26);
    h.client.send(Buffer.alloc(640)); await until(() => h.events.some(event => event.reason === 'input_limit'));
    assert.equal(h.counts().writes, 26);
  } finally { h.cleanup(); }
});

test('exact path rejects query tickets and missing Origin before authorization', async () => {
  const h = await harness(); try {
    for (const [url, options] of [[h.url + '?ticket=' + ticket, { origin }], [h.url, {}]] as const) { const client = new WebSocket(url, options); await once(client, 'error'); client.terminate(); }
    assert.equal(h.counts().claims, 0); assert.equal(h.counts().starts, 0);
  } finally { h.cleanup(); }
});

test('silent authorization timeout and oversized frames never allocate a provider', async () => {
  for (const oversized of [false, true]) {
    const h = await harness({ authTimeoutMs: 40 }); try {
      if (oversized) h.client.send(Buffer.alloc(8193));
      await until(() => h.client.readyState === WebSocket.CLOSED);
      assert.equal(h.counts().starts, 0); assert.equal(h.counts().allocations, 0);
    } finally { h.cleanup(); }
  }
});

test('authority expiry and gateway shutdown close the allocated provider', async () => {
  for (const expiry of [false, true]) {
    const h = await harness(); try {
      if (expiry) h.authority.expiresAt = new Date(Date.now() + 300).toISOString();
      await h.start();
      if (!expiry) h.gateway.shutdown();
      await until(() => h.counts().finalized === 1); assert.equal(h.counts().closes, 1);
      if (expiry) await until(() => h.events.some(event => event.reason === 'expired'));
    } finally { h.cleanup(); }
  }
});

test('stop during final pre-start recheck prevents SDK startup and late callback output', async () => {
  const pending = deferred<void>();
  const h = await harness({ recheck: () => pending.promise }); try {
    h.client.send(JSON.stringify({ type: 'start', ticket })); await until(() => h.counts().allocations === 1);
    h.client.send(JSON.stringify({ type: 'stop' })); await until(() => h.counts().finalized === 1);
    pending.resolve(); await delay(20);
    h.callbacks().onStarted(); h.callbacks().onFailure('provider');
    assert.equal(h.counts().starts, 0); assert.equal(h.counts().closes, 1); assert.equal(h.counts().finalized, 1);
    assert.ok(!h.events.some(event => event.state === 'ready'));
  } finally { h.cleanup(); }
});
