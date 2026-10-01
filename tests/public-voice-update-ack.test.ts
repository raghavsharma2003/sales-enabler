import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { attachVoiceBridge, type GatewayDependencies } from '../lib/public-agent/gateway';
import type { PublicAuthority } from '../lib/public-agent/service';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) {
  for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw new Error('Expected gateway state did not arrive.');
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: Record<string, any>[] = [];
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
  receive(event: unknown) { this.emit('message', Buffer.from(JSON.stringify(event)), false); }
}
function harness(options: { timeout?: number; beforeConsume?: (ordinal: number) => Promise<void> } = {}) {
  const client = new Socket(), provider = new Socket();
  const consumedNonces: unknown[] = [], saved: unknown[] = [], evidence: unknown[] = [];
  let connects = 0, finishes = 0, closes = 0, currentNonce = 'nonce-0', ackId = 0;
  const authority = { user: { id: 'owner', organizationId: 'org' }, deployment: { id: 'deployment', data: { channel: 'web_voice', brand: { name: 'Fictional', welcomeMessage: 'Hello.' }, limits: { maxSessionSeconds: 30, maxTurnsPerConversation: 10 } } }, config: { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Brief', objective: 'Explain public information' }, context: '{"companyKnowledge":[]}', fences: [], sessionId: 'session', expiresAt: new Date(Date.now() + 30000).toISOString(), purpose: 'voice' } as unknown as PublicAuthority;
  const dependencies: GatewayDependencies = {
    authorize: async (_token, input) => {
      if (input.consume) {
        assert.equal(input.nonce, currentNonce, 'nonce consumption remains serialized');
        consumedNonces.push(input.nonce);
        await options.beforeConsume?.(consumedNonces.length);
        currentNonce = `nonce-${consumedNonces.length}`;
      }
      return { ...authority, nextNonce: currentNonce };
    },
    claim: async () => undefined, close: async () => { closes++; },
    finish: async () => { finishes++; }, transcript: async (_authority, _channel, entry) => { saved.push(entry); },
    evidence: async (_authority, turn) => { evidence.push(turn); },
    connect: () => { connects++; queueMicrotask(() => provider.emit('open')); return { socket: provider as unknown as WebSocket, model: 'fictional', voice: 'marin' }; },
    sessionUpdateTimeoutMs: options.timeout ?? 2000,
  };
  const bridge = attachVoiceBridge(client as unknown as WebSocket, { headers: { origin: 'https://public.example.test' } }, dependencies);
  const updates = () => provider.sent.filter(event => event.type === 'session.update');
  const replies = () => provider.sent.filter(event => event.type === 'response.create');
  const acknowledge = (index = updates().length - 1, eventId = `ack-${++ackId}`) => provider.receive({ type: 'session.updated', event_id: eventId, session: { ...updates()[index].session } });
  async function authenticate(ack = true) {
    client.receive({ type: 'authenticate', token: 'fictional', nonce: currentNonce });
    await until(() => updates().length === 1);
    if (ack) { acknowledge(); await until(() => replies().length === 1); }
  }
  function complete(id = `response-${replies().length}`) {
    provider.receive({ type: 'response.created', response: { id } });
    provider.receive({ type: 'response.done', response: { id, status: 'completed' } });
  }
  const text = (value: string, id: string) => client.receive({ type: 'text', text: value, requestId: id });
  return { client, provider, updates, replies, acknowledge, authenticate, complete, text, consumedNonces, saved, evidence, connects: () => connects, finishes: () => finishes, closes: () => closes, cleanup: () => bridge.stop('test_cleanup', 'Test cleanup.') };
}

test('initial greeting requires matching Realtime resulting instructions, not a bare or unrelated update', async () => {
  const h = harness();
  try {
    await h.authenticate(false);
    for (const event of [{ type: 'session.updated' }, { type: 'session.updated', session: { type: 'realtime', instructions: 'Unrelated' } }, { type: 'session.updated', session: { type: 'transcription', instructions: h.updates()[0].session.instructions } }]) h.provider.receive(event);
    await tick(); assert.equal(h.replies().length, 0); assert.equal(h.client.sent.some(event => event.type === 'ready'), false);
    h.acknowledge(); await until(() => h.replies().length === 1);
    assert.equal(h.updates().length, 1); assert.match(h.replies()[0].response.instructions, /OPENING TURN/);
  } finally { h.cleanup(); }
});

test('typed continuation waits for its changed instructions and rejects stale, mismatched and replayed acknowledgements', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete();
    h.text('Please speak in Hindi.', 'request-hindi'); await until(() => h.updates().length === 2);
    assert.equal(h.replies().length, 1);
    h.acknowledge(0); h.provider.receive({ type: 'session.updated', session: { type: 'realtime', instructions: `${h.updates()[1].session.instructions} different` } });
    h.acknowledge(1, 'ack-1'); await tick(); assert.equal(h.replies().length, 1);
    h.acknowledge(1); await until(() => h.replies().length === 2);
    assert.equal(h.replies()[1].response, undefined); assert.equal(h.consumedNonces.length, 2);
    assert.match(h.updates()[1].session.instructions, /Hindi/);
  } finally { h.cleanup(); }
});

test('unchanged acknowledged continuation skips resending and preserves one response per normal turn', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete(); h.text('Office hours?', 'request-hours'); await until(() => h.updates().length === 2);
    h.acknowledge(); await until(() => h.replies().length === 2); h.complete();
    h.text('Office address?', 'request-address'); await until(() => h.replies().length === 3);
    assert.equal(h.updates().length, 2); assert.equal(h.saved.length, 2); assert.deepEqual(h.consumedNonces, ['nonce-0', 'nonce-1', 'nonce-2']);
  } finally { h.cleanup(); }
});

test('missing configuration acknowledgement times out without reply, retry or blocked finalization', async () => {
  for (const initial of [true, false]) {
    const h = harness({ timeout: 35 });
    try {
      await h.authenticate(!initial);
      if (!initial) { h.complete(); h.text('Please speak in Hindi.', 'request-timeout'); await until(() => h.updates().length === 2); }
      await until(() => h.finishes() === 1);
      assert.equal(h.client.sent.find(event => event.type === 'ended')?.outcome, 'session_update_timeout');
      assert.equal(h.replies().length, initial ? 0 : 1); assert.equal(h.connects(), 1); assert.equal(h.closes(), 1);
      h.acknowledge(); await tick(); assert.equal(h.replies().length, initial ? 0 : 1);
    } finally { h.cleanup(); }
  }
});

test('disconnect, provider error and visitor stop release a pending update without generating a paid reply', async () => {
  for (const end of ['client', 'provider', 'error', 'stop']) {
    const h = harness();
    try {
      await h.authenticate(); h.complete(); h.text('Please speak in Hindi.', 'request-close'); await until(() => h.updates().length === 2);
      if (end === 'client') h.client.close();
      else if (end === 'provider') h.provider.close();
      else if (end === 'error') h.provider.receive({ type: 'error', error: { code: 'invalid_request_error' } });
      else h.client.receive({ type: 'stop' });
      await until(() => h.finishes() === 1); h.acknowledge(); await tick();
      assert.equal(h.replies().length, 1); assert.equal(h.connects(), 1); assert.equal(h.closes(), 1);
      assert.equal(h.evidence.length, 1, 'unsent replies cannot manufacture response evidence');
    } finally { h.cleanup(); }
  }
});

test('fast caller turns serialize updates, suppress an obsolete reply and ignore old response.done', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.provider.receive({ type: 'response.created', response: { id: 'old-greeting' } });
    h.text('Please speak in Hindi.', 'request-first'); await until(() => h.updates().length === 2);
    h.text('Please speak in English.', 'request-second'); await tick();
    assert.equal(h.updates().length, 2); assert.equal(h.consumedNonces.length, 2);
    h.provider.receive({ type: 'response.done', response: { id: 'old-greeting', status: 'cancelled' } });
    await tick(); assert.equal(h.replies().length, 1);
    h.acknowledge(1); await until(() => h.updates().length === 3);
    assert.equal(h.replies().length, 1); assert.deepEqual(h.consumedNonces, ['nonce-0', 'nonce-1', 'nonce-2']);
    h.acknowledge(1); await tick(); assert.equal(h.replies().length, 1);
    h.acknowledge(2); await until(() => h.replies().length === 2);
    h.provider.receive({ type: 'response.created', response: { id: 'new-answer' } });
    h.provider.receive({ type: 'response.done', response: { id: 'old-greeting', status: 'cancelled' } });
    h.client.receive({ type: 'interrupt', playedMs: 0 });
    assert.equal(h.provider.sent.filter(event => event.type === 'response.cancel').at(-1)?.response_id, 'new-answer');
  } finally { h.cleanup(); }
});

test('interrupt while waiting invalidates generation without abandoning the pending configuration state', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete(); h.text('Office hours?', 'request-first'); await until(() => h.updates().length === 2);
    h.client.receive({ type: 'interrupt', playedMs: 0 }); h.acknowledge(); await tick();
    assert.equal(h.replies().length, 1); assert.equal(h.provider.sent.some(event => event.type === 'response.cancel'), false);
    h.text('Office address?', 'request-second'); await until(() => h.replies().length === 2);
    assert.equal(h.updates().length, 2, 'the acknowledged state remains reusable after the reply is cancelled');
  } finally { h.cleanup(); }
});

test('microphone acknowledgement gate deduplicates transcripts and a nonce/cancel race cannot create a response', async () => {
  const entered = deferred(), release = deferred();
  const h = harness({ beforeConsume: async ordinal => { if (ordinal === 2) { entered.resolve(); await release.promise; } } });
  try {
    await h.authenticate(); h.complete();
    const transcript = { type: 'conversation.item.input_audio_transcription.completed', item_id: 'mic-1', transcript: 'Please speak in Hindi.' };
    h.provider.receive(transcript); await until(() => h.updates().length === 2);
    h.provider.receive(transcript); h.acknowledge(); await entered.promise;
    h.client.receive({ type: 'interrupt', playedMs: 0 }); release.resolve(); await tick();
    assert.equal(h.replies().length, 1); assert.equal(h.saved.length, 1);
    h.text('Office hours?', 'request-after-cancel'); await until(() => h.replies().length === 2);
    assert.deepEqual(h.consumedNonces, ['nonce-0', 'nonce-1', 'nonce-2']); assert.equal(h.updates().length, 2);
  } finally { release.resolve(); h.cleanup(); }
});

test('typed authorization cancellation preserves the rotated nonce but does not revive the cancelled reply', async () => {
  const entered = deferred(), release = deferred();
  const h = harness({ beforeConsume: async ordinal => { if (ordinal === 2) { entered.resolve(); await release.promise; } } });
  try {
    await h.authenticate(); h.complete(); h.text('Office hours?', 'request-pending'); await entered.promise;
    h.client.receive({ type: 'interrupt', playedMs: 0 }); release.resolve(); await until(() => h.updates().length === 2);
    h.acknowledge(); await tick(); assert.equal(h.replies().length, 1);
    h.text('Office address?', 'request-current'); await until(() => h.replies().length === 2);
    assert.deepEqual(h.consumedNonces, ['nonce-0', 'nonce-1', 'nonce-2']);
  } finally { release.resolve(); h.cleanup(); }
});

test('late microphone transcription cannot supersede a newer speech start or cancel its eventual reply', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete();
    h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id: 'older-mic' });
    h.provider.receive({ type: 'input_audio_buffer.committed', item_id: 'older-mic' });
    h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id: 'newer-mic' });
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'older-mic', transcript: 'Please speak in Hindi.' });
    await until(() => h.saved.length === 1); await tick();
    assert.equal(h.updates().length, 1, 'older ASR completion must not replace the active caller turn');
    assert.equal(h.replies().length, 1);
    h.provider.receive({ type: 'input_audio_buffer.committed', item_id: 'newer-mic' });
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'newer-mic', transcript: 'Please speak in English.' });
    await until(() => h.updates().length === 2); h.acknowledge(); await until(() => h.replies().length === 2);
    assert.deepEqual(h.consumedNonces, ['nonce-0', 'nonce-1']);
    assert.match(h.updates()[1].session.instructions, /"language":"English"/);
    assert.equal(h.saved.length, 2, 'both captured transcripts still persist');
  } finally { h.cleanup(); }
});

test('microphone cancellation after commit invalidates delayed transcription before nonce consumption', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete();
    h.provider.receive({ type: 'input_audio_buffer.committed', item_id: 'cancelled-mic' });
    h.client.receive({ type: 'interrupt', playedMs: 0 });
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'cancelled-mic', transcript: 'Please speak in Hindi.' });
    await until(() => h.saved.length === 1); await tick();
    assert.equal(h.updates().length, 1); assert.equal(h.replies().length, 1); assert.equal(h.consumedNonces.length, 1);
  } finally { h.cleanup(); }
});

test('out-of-order older ASR result preserves the newer active response and its acknowledged instructions', async () => {
  const h = harness();
  try {
    await h.authenticate(); h.complete();
    for (const item_id of ['older-mic', 'newer-mic']) {
      h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id });
      h.provider.receive({ type: 'input_audio_buffer.committed', item_id });
    }
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'newer-mic', transcript: 'Please speak in English.' });
    await until(() => h.updates().length === 2); h.acknowledge(); await until(() => h.replies().length === 2);
    h.provider.receive({ type: 'response.created', response: { id: 'newer-answer' } });
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'older-mic', transcript: 'Please speak in Hindi.' });
    await until(() => h.saved.length === 2); await tick();
    assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 2);
    assert.equal(h.provider.sent.some(event => event.type === 'response.cancel'), false);
    h.client.receive({ type: 'interrupt', playedMs: 0 });
    assert.equal(h.provider.sent.find(event => event.type === 'response.cancel')?.response_id, 'newer-answer');
  } finally { h.cleanup(); }
});
