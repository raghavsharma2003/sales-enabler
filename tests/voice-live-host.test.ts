import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createVoiceLiveHost, VOICE_LIVE_HOST_MAX_PAYLOAD, type VoiceLiveHostDependencies, type VoiceLiveHostDiagnostic } from '../lib/voice/voice-live-host';
import type { VoiceLiveAuthority } from '../lib/voice/voice-live-authority';
import { VOICE_LIVE_MODEL } from '../lib/voice/voice-live-session';

const origin = 'https://private.example.test', ticket = 'a'.repeat(64);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown) { for (let i = 0; i < 300; i++) { if (check()) return; await delay(5); } throw new Error('Expected bounded event did not arrive.'); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function harness(options: { ack?: boolean; completeResponses?: boolean; mode?: 'text' | 'microphone'; deps?: Partial<VoiceLiveHostDependencies>; origin?: string } = {}) {
  const fake = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(fake, 'listening');
  let peer: WebSocket | undefined, allocated: WebSocket | undefined, confirmed = false, claimed = false, revoked = false;
  let claims = 0, connects = 0, activated = 0, engineFinished = 0;
  const upstreamEvents: any[] = [], events: any[] = [], outcomes: string[] = [], trace: string[] = [];
  const diagnostics: VoiceLiveHostDiagnostic[] = [];
  const relationship = { preferences: [], openCommitments: [], sourceIds: [], guidance: '', omittedCount: 0 };
  const settings = { allowedLanguages: ['English'], primaryLanguage: 'English', responseStyle: 'Brief' };
  const authority: VoiceLiveAuthority = {
    id: 'ticket', organizationId: 'org', userId: 'user', previewId: 'preview', voiceAttemptId: 'attempt', sessionEpoch: 'epoch', origin,
    deadlineAt: new Date(Date.now() + 20_000).toISOString(), instructions: 'Disclose AI identity. Explain fictional office hours.', openingMessage: 'I am your AI assistant.',
    inputMode: options.mode || 'text', model: VOICE_LIVE_MODEL, liveVoiceProfile: { version: 1, engine: 'azure-voice-live', preset: 'taxila-diya' },
    enabledTools: [], settings, relationship, behaviorContext: { settings, relationship },
  };
  fake.on('connection', socket => {
    peer = socket; socket.send(JSON.stringify({ type: 'session.created', session: { id: 'synthetic' } }));
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString()); upstreamEvents.push(event);
      if (event.type === 'session.update' && options.ack !== false) socket.send(JSON.stringify({ type: 'session.updated', session: event.session }));
      if (event.type === 'response.create') { const id = `response_${upstreamEvents.filter(item => item.type === 'response.create').length}`; socket.send(JSON.stringify({ type: 'response.created', response: { id } })); if (options.completeResponses !== false) socket.send(JSON.stringify({ type: 'response.done', response: { id, status: 'completed' } })); }
    });
  });
  const providerUrl = `ws://127.0.0.1:${(fake.address() as { port: number }).port}`;
  function socket() { connects++; allocated = new WebSocket(providerUrl); allocated.on('close', () => { confirmed = true; trace.push('closed'); }); return allocated; }
  const deps: VoiceLiveHostDependencies = {
    claim: async (value, requestOrigin) => { claims++; if (value !== ticket || requestOrigin !== origin || claimed) throw new Error('Private auth detail'); claimed = true; return authority; },
    recheck: async () => { if (revoked) throw new Error('Private revocation detail'); },
    activate: async () => { activated++; trace.push('activated'); },
    finish: async (_authority, result) => { engineFinished++; outcomes.push(result.outcome); trace.push(result.outcome); if (connects && result.outcome !== 'uncertain') { assert.equal(allocated?.readyState, WebSocket.CLOSED); assert.equal(confirmed, true); } },
    connect: socket,
    executeTool: async () => { throw new Error('No tools enabled in this synthetic preview.'); },
    diagnostic: summary => diagnostics.push(summary),
    ...options.deps,
  };
  const host = createVoiceLiveHost(deps), server = createServer();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: VOICE_LIVE_HOST_MAX_PAYLOAD });
  server.on('upgrade', (request, stream, head) => sockets.handleUpgrade(request, stream, head, client => host.attach(client, request)));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/private-voice-live`;
  const client = new WebSocket(url, { origin: options.origin || origin }); client.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(client, 'open');
  const sendStart = (mode = authority.inputMode, value = ticket) => client.send(JSON.stringify({ type: 'start', ticket: value, inputMode: mode }));
  async function start() { sendStart(); await until(() => events.some(event => event.type === 'ready')); }
  async function cleanup() {
    client.terminate(); await host.shutdown();
    for (const socket of sockets.clients) socket.terminate(); sockets.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const socket of fake.clients) socket.terminate(); await new Promise<void>(resolve => fake.close(() => resolve()));
  }
  return { host, client, server, sockets, url, authority, events, upstreamEvents, outcomes, trace, diagnostics, sendStart, start, cleanup, socket,
    emit: (event: unknown) => peer!.send(JSON.stringify(event)), peer: () => peer!, allocated: () => allocated!, revoke: () => { revoked = true; },
    counts: () => ({ claims, connects, activated, finished: engineFinished }),
  };
}

test('real Node transports and real engine wait for the exact ACK and settle only after owned upstream close', async () => {
  const h = await harness({ ack: false }); try {
    assert.equal(h.counts().connects, 0); h.sendStart(); await until(() => h.upstreamEvents.some(event => event.type === 'session.update'));
    const update = h.upstreamEvents.find(event => event.type === 'session.update');
    assert.equal(h.counts().activated, 1); assert.equal(h.upstreamEvents.filter(event => event.type === 'response.create').length, 0);
    h.emit({ type: 'session.updated', session: { ...update.session, instructions: 'unrelated' } }); await delay(20);
    assert.equal(h.events.some(event => event.type === 'ready'), false);
    h.emit({ type: 'session.updated', session: update.session }); await until(() => h.events.some(event => event.type === 'ready'));
    await until(() => h.upstreamEvents.some(event => event.type === 'response.create'));
    h.client.send(JSON.stringify({ type: 'end' })); await until(() => h.outcomes.includes('complete'));
    assert.ok(h.trace.indexOf('closed') < h.trace.indexOf('complete')); assert.equal(h.counts().connects, 1);
    assert.equal(h.host.activeCounts.sessions, 0);
  } finally { await h.cleanup(); }
});

test('forged tickets, wrong Origin, preauth PCM, malformed controls and input-mode mismatch fail before connection', async () => {
  for (const mode of ['forged', 'origin', 'pcm', 'json', 'mode']) {
    const h = await harness({ origin: mode === 'origin' ? 'https://foreign.example.test' : origin }); try {
      if (mode === 'forged') h.sendStart('text', 'b'.repeat(64));
      if (mode === 'origin') h.sendStart();
      if (mode === 'pcm') h.client.send(Buffer.alloc(640));
      if (mode === 'json') h.client.send('{');
      if (mode === 'mode') h.sendStart('microphone');
      await until(() => h.events.some(event => event.type === 'ended')); assert.equal(h.counts().connects, 0);
      if (mode === 'mode') await until(() => h.outcomes.includes('failed'));
    } finally { await h.cleanup(); }
  }
});

test('duplicate starts, browser provider commands and malformed provider frames close exactly one owned transport', async () => {
  for (const mode of ['duplicate', 'browser', 'provider']) {
    const h = await harness(); try {
      await h.start();
      if (mode === 'duplicate') h.sendStart();
      if (mode === 'browser') h.client.send(JSON.stringify({ type: 'response.create' }));
      if (mode === 'provider') h.peer().send(Buffer.alloc(640));
      await until(() => h.outcomes.includes('failed')); assert.equal(h.counts().connects, 1); assert.equal(h.counts().finished, 1);
    } finally { await h.cleanup(); }
  }
});

test('microphone mode forwards fixed PCM only after readiness and rejects a malformed frame', async () => {
  const h = await harness({ mode: 'microphone' }); try {
    await h.start(); h.client.send(Buffer.alloc(640)); await until(() => h.upstreamEvents.some(event => event.type === 'input_audio_buffer.append'));
    assert.equal(Buffer.from(h.upstreamEvents.find(event => event.type === 'input_audio_buffer.append').audio, 'base64').length, 640);
    h.client.send(Buffer.alloc(641)); await until(() => h.outcomes.includes('failed'));
  } finally { await h.cleanup(); }
});

test('end during pending claim closes late authority without any upstream allocation', async () => {
  const claim = deferred<VoiceLiveAuthority>();
  const h = await harness({ deps: { claim: () => claim.promise } }); try {
    h.sendStart(); h.client.send(JSON.stringify({ type: 'end' })); await until(() => h.events.some(event => event.type === 'ended'));
    claim.resolve(h.authority); await until(() => h.outcomes.includes('complete')); assert.equal(h.counts().connects, 0);
  } finally { await h.cleanup(); }
});

test('late allocation retains uncertainty until its actual socket closure is observed', async () => {
  const allocation = deferred<WebSocket>(); let requested = false;
  const h = await harness({ deps: { connect: () => { requested = true; return allocation.promise; }, closeTimeoutMs: 30, terminateAfterMs: 10 } }); try {
    h.sendStart(); await until(() => requested); h.client.send(JSON.stringify({ type: 'end' }));
    await until(() => h.outcomes.includes('uncertain')); assert.equal(h.outcomes.includes('complete'), false);
    allocation.resolve(h.socket()); await until(() => h.outcomes.includes('complete'));
    assert.ok(h.trace.indexOf('closed') < h.trace.indexOf('complete')); assert.equal(h.counts().activated, 0);
  } finally { await h.cleanup(); }
});

test('calling close and terminate without an actual close event cannot release admission', async () => {
  const h = await harness({ deps: { closeTimeoutMs: 40, terminateAfterMs: 10 } });
  let terminate: (() => void) | undefined;
  try {
    await h.start(); const owned = h.allocated(); terminate = owned.terminate.bind(owned);
    owned.close = () => undefined; owned.terminate = () => undefined;
    h.client.send(JSON.stringify({ type: 'end' })); await until(() => h.outcomes.includes('uncertain'));
    assert.equal(owned.readyState, WebSocket.OPEN); assert.equal(h.outcomes.includes('complete'), false);
    terminate(); await until(() => h.outcomes.includes('complete'));
    assert.deepEqual(h.outcomes, ['uncertain', 'complete']);
  } finally { terminate?.(); await h.cleanup(); }
});

test('end while activation awaits never starts the engine when activation later resolves', async () => {
  const activation = deferred<void>(); let requested = false;
  const h = await harness({ deps: { activate: () => { requested = true; return activation.promise; } } }); try {
    h.sendStart(); await until(() => requested); h.client.send(JSON.stringify({ type: 'end' }));
    await until(() => h.outcomes.includes('complete')); activation.resolve(); await delay(20);
    assert.equal(h.upstreamEvents.some(event => event.type === 'session.update'), false); assert.equal(h.counts().finished, 1);
  } finally { activation.resolve(); await h.cleanup(); }
});

test('setup timeout closes a connected but unacknowledged provider and records failed after closure', async () => {
  const h = await harness({ ack: false, deps: { setupTimeoutMs: 80 } }); try {
    h.sendStart(); await until(() => h.outcomes.includes('failed')); assert.equal(h.events.some(event => event.type === 'ready'), false);
    assert.equal(h.upstreamEvents.some(event => event.type === 'response.create'), false);
  } finally { await h.cleanup(); }
});

test('client disconnect and provider disconnect settle with observed closure, without reconnect', async () => {
  for (const provider of [false, true]) {
    const h = await harness(); try {
      await h.start(); if (provider) h.peer().terminate(); else h.client.terminate();
      await until(() => h.outcomes.includes(provider ? 'failed' : 'complete')); assert.equal(h.counts().connects, 1);
    } finally { await h.cleanup(); }
  }
});

test('slow browser and upstream buffers stop transport instead of accumulating output', async () => {
  for (const destination of ['browser', 'provider']) {
    const h = await harness({ ack: false }); try {
      h.sendStart(); await until(() => h.upstreamEvents.some(event => event.type === 'session.update'));
      const socket = destination === 'browser' ? [...h.sockets.clients][0] : h.allocated();
      Object.defineProperty(socket, 'bufferedAmount', { value: 300_000 });
      h.emit({ type: 'session.updated', session: h.upstreamEvents.find(event => event.type === 'session.update').session });
      await until(() => h.outcomes.includes('failed')); assert.equal(h.counts().connects, 1);
    } finally { await h.cleanup(); }
  }
});

test('host capacity rejects a second transport before ticket claim and shutdown closes the first', async () => {
  const h = await harness({ deps: { maxSessions: 1 } }); let second: WebSocket | undefined;
  try {
    await h.start(); const events: any[] = []; second = new WebSocket(h.url, { origin }); second.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(second, 'open');
    await until(() => events.some(event => event.type === 'ended')); assert.equal(h.counts().claims, 1);
    await h.host.shutdown(); assert.equal(h.outcomes.at(-1), 'complete'); assert.equal(h.host.activeCounts.sessions, 0);
  } finally { second?.terminate(); await h.cleanup(); }
});

test('a revoked or stalled authority cannot start the engine after provider open', async () => {
  for (const stall of [false, true]) {
    let checks = 0;
    const h = await harness({ deps: { recheckTimeoutMs: 30, recheck: async () => { if (++checks < 2) return; if (stall) await new Promise(() => undefined); else throw new Error('Private revocation'); } } }); try {
      h.sendStart(); await until(() => h.outcomes.includes('failed')); assert.equal(h.upstreamEvents.some(event => event.type === 'session.update'), false);
    } finally { await h.cleanup(); }
  }
});

test('active preview revocation closes its owned provider at the bounded periodic recheck', async () => {
  const h = await harness(); try {
    await h.start(); const revokedAt = Date.now(); h.revoke();
    await until(() => h.outcomes.includes('failed'));
    assert.ok(Date.now() - revokedAt < 2000); assert.equal(h.counts().connects, 1);
    assert.ok(h.events.some(event => event.type === 'ended' && event.reason === 'authentication'));
  } finally { await h.cleanup(); }
});

test('provider tool calls use the claimed preview authority and never accept browser tool execution', async () => {
  const calls: any[] = [];
  const h = await harness({ completeResponses: false, deps: { executeTool: async (authority, call, signal) => {
    calls.push({ authority, call, aborted: signal.aborted });
    return { requestId: call.id, name: 'search_company_knowledge', status: 'available', message: 'Fictional office hours are available.', citations: [], identityVerified: false, contextMode: 'internal_operator_browser' };
  } } }); try {
    h.authority.enabledTools = ['search_company_knowledge']; await h.start();
    await until(() => h.upstreamEvents.some(event => event.type === 'response.create')); await delay(20);
    h.emit({ type: 'response.function_call_arguments.done', response_id: 'response_1', call_id: 'call_1', name: 'search_company_knowledge', arguments: JSON.stringify({ query: 'office hours' }) });
    h.emit({ type: 'response.done', response: { id: 'response_1', status: 'completed' } });
    await until(() => calls.length === 1);
    assert.equal(calls[0].authority.previewId, h.authority.previewId); assert.equal(calls[0].authority.userId, h.authority.userId);
    assert.deepEqual(calls[0].call.arguments, { query: 'office hours' }); assert.equal(calls[0].aborted, false);
    h.client.send(JSON.stringify({ type: 'tool', name: 'search_company_knowledge', arguments: { query: 'untrusted' } }));
    await until(() => h.outcomes.includes('failed')); assert.equal(calls.length, 1);
  } finally { await h.cleanup(); }
});

test('pre-ready terminal diagnostics expose only finite phase, ACK and closure metadata', async () => {
  const h = await harness({ ack: false, deps: { setupTimeoutMs: 200 } }); try {
    h.sendStart(); await until(() => h.upstreamEvents.some(event => event.type === 'session.update'));
    const update = h.upstreamEvents.find(event => event.type === 'session.update');
    h.emit({ type: 'session.updated', session: { ...update.session, instructions: 'PRIVATE_TRANSCRIPT_SENTINEL' } });
    await until(() => h.diagnostics.length === 1);
    assert.deepEqual({ ...h.diagnostics[0], elapsedMs: 0 }, {
      version: 1, stage: 'terminal', phase: 'awaiting_ack', reason: 'provider', outcome: 'failed',
      claimed: true, providerAllocated: true, providerOpened: true, authorityActivated: true, ready: false,
      closureConfirmed: true, settlementRecorded: true, providerErrorReceived: false,
      sessionUpdates: 1, sessionAcks: 1, matchingAcks: 0, providerMessages: 2, elapsedMs: 0,
    });
    assert.doesNotMatch(JSON.stringify(h.diagnostics), /PRIVATE_TRANSCRIPT|Fictional|instructions|preview|sessionEpoch|api.key|call_1/);
  } finally { await h.cleanup(); }
});

test('provider errors are counted without retaining raw error messages, codes or provider identifiers', async () => {
  const h = await harness({ ack: false }); try {
    h.sendStart(); await until(() => h.upstreamEvents.some(event => event.type === 'session.update'));
    h.emit({ type: 'error', event_id: 'PRIVATE_PROVIDER_ID', error: { message: 'PRIVATE_PROVIDER_ERROR', code: 'PRIVATE_PROVIDER_CODE' } });
    await until(() => h.diagnostics.length === 1);
    assert.equal(h.diagnostics[0].providerErrorReceived, true); assert.equal(h.diagnostics[0].phase, 'awaiting_ack');
    assert.equal(h.diagnostics[0].ready, false); assert.equal(h.diagnostics[0].matchingAcks, 0);
    assert.doesNotMatch(JSON.stringify(h.diagnostics), /PRIVATE_PROVIDER|event_id|message|code/);
  } finally { await h.cleanup(); }
});

test('diagnostic observer failures never change cleanup and persistence failure remains explicit', async () => {
  const failedLog = await harness({ deps: { diagnostic: () => { throw new Error('Private logger failure'); } } });
  try { await failedLog.start(); failedLog.client.send(JSON.stringify({ type: 'end' })); await until(() => failedLog.outcomes.includes('complete')); assert.equal(failedLog.counts().finished, 1); }
  finally { await failedLog.cleanup(); }
  const failedStore = await harness({ deps: { finish: async () => { throw new Error('Private persistence failure'); } } });
  try {
    await failedStore.start(); failedStore.client.send(JSON.stringify({ type: 'end' })); await until(() => failedStore.diagnostics.length === 1);
    assert.equal(failedStore.diagnostics[0].closureConfirmed, true); assert.equal(failedStore.diagnostics[0].settlementRecorded, false);
  } finally { await failedStore.cleanup(); }
});
