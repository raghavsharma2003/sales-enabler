import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { attachVoiceBridge, type GatewayDependencies } from '../lib/public-agent/gateway';
import { realtimeSession } from '../lib/public-agent/protocol';
import type { PublicAuthority } from '../lib/public-agent/service';
import type { SpeechDeliveryProfile } from '../lib/voice/speech-delivery';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { handleAgentAction } from '../lib/platform/agents';
import type { PlatformRecord } from '../lib/platform/records';
import { changeDeploymentStatus, closePublicSession, createDeployment, issuePublicSession, resolvePublicSession } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { claimVoiceSession } from '../lib/public-agent/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.PUBLIC_SESSION_HASH_SECRET = 'fictional-public-delivery-test-secret-only';
process.env.VOICE_PROVIDER = 'azure';
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'unused-fictional-delivery';
process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = 'fictional-realtime';

const adaptive: SpeechDeliveryProfile = { version: 1, pace: 'standard', adaptToRequests: true };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw new Error('Expected speech delivery state did not arrive.');
}
class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: Record<string, any>[] = [];
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
  receive(event: unknown) { this.emit('message', Buffer.from(JSON.stringify(event)), false); }
}
function harness(profile?: SpeechDeliveryProfile, options: { timeout?: number; recheckMs?: number } = {}) {
  const client = new Socket(), provider = new Socket();
  const saved: unknown[] = [];
  let ackId = 0, consumes = 0, revoked = false, finishes = 0, connects = 0;
  const authority = { user: { id: 'owner', organizationId: 'org' }, deployment: { id: 'deployment', data: { channel: 'web_voice', brand: { name: 'Fictional', welcomeMessage: 'Hello.' }, limits: { maxSessionSeconds: 30, maxTurnsPerConversation: 10 } } }, config: { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Brief', objective: 'Explain public information', ...(profile === undefined ? {} : { speechDelivery: profile }) }, context: '{"companyKnowledge":[]}', fences: [], sessionId: 'session', expiresAt: new Date(Date.now() + 30000).toISOString(), purpose: 'voice' } as unknown as PublicAuthority;
  const dependencies: GatewayDependencies = {
    authorize: async (_token, input) => { if (revoked) throw new Error('Release changed.'); if (input.consume) consumes++; return { ...authority, nextNonce: `nonce-${consumes}` }; },
    claim: async () => undefined, close: async () => undefined,
    finish: async () => { finishes++; }, transcript: async (_authority, _channel, entry) => { saved.push(entry); },
    connect: () => { connects++; queueMicrotask(() => provider.emit('open')); return { socket: provider as unknown as WebSocket, model: 'fictional', voice: 'marin' }; },
    sessionUpdateTimeoutMs: options.timeout ?? 2000, recheckMs: options.recheckMs,
  };
  const bridge = attachVoiceBridge(client as unknown as WebSocket, { headers: { origin: 'https://public.example.test' } }, dependencies);
  const updates = () => provider.sent.filter(event => event.type === 'session.update');
  const replies = () => provider.sent.filter(event => event.type === 'response.create');
  const acknowledge = (index = updates().length - 1, eventId = `ack-${++ackId}`) => provider.receive({ type: 'session.updated', event_id: eventId, session: structuredClone(updates()[index].session) });
  async function authenticate(ack = true) {
    client.receive({ type: 'authenticate', token: 'fictional', nonce: 'nonce-0', speechDelivery: { speed: 3 }, speed: 3 });
    await until(() => updates().length === 1);
    if (ack) { acknowledge(); await until(() => replies().length === 1); }
  }
  function complete(id = `response-${replies().length}`) {
    provider.receive({ type: 'response.created', response: { id } });
    provider.receive({ type: 'response.done', response: { id, status: 'completed' } });
  }
  const text = (value: string, id: string) => client.receive({ type: 'text', text: value, requestId: id });
  const final = (value: string, id: string) => provider.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: value });
  return { client, provider, updates, replies, acknowledge, authenticate, complete, text, final, saved, consumes: () => consumes, finishes: () => finishes, connects: () => connects, revoke: () => { revoked = true; }, cleanup: () => bridge.stop('test_cleanup', 'Test cleanup.') };
}

test('published default uses structured speed; initial greeting requires both instructions and exact output speed', async () => {
  const h = harness({ ...adaptive, pace: 'unhurried' });
  try {
    await h.authenticate(false);
    const session = h.updates()[0].session;
    assert.equal(session.audio.output.speed, 0.9);
    assert.deepEqual(session.audio.input.turn_detection, { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650, create_response: false, interrupt_response: false });
    assert.deepEqual(session.tools, []); assert.equal(session.tool_choice, 'none');
    for (const audio of [undefined, { output: {} }, { output: { speed: 1 } }, { output: { speed: '0.9' } }, { input: { speed: 0.9 } }]) {
      h.provider.receive({ type: 'session.updated', session: { ...session, audio } });
    }
    h.provider.receive({ type: 'session.updated', session: { ...session, instructions: 'Wrong instructions' } });
    for (const type of [undefined, 'transcription']) {
      h.provider.receive({ type: 'session.updated', session: { ...session, type } });
      await tick(); assert.equal(h.replies().length, 0, 'matching instructions and speed still require a realtime session');
    }
    await tick(); assert.equal(h.replies().length, 0); assert.equal(h.client.sent.some(event => event.type === 'ready'), false);
    h.acknowledge(); await until(() => h.replies().length === 1);
    assert.match(h.replies()[0].response.instructions, /OPENING TURN/);
  } finally { h.cleanup(); }
});

test('final typed requests slow and reset speed with one combined ACK gate and stale ACK rejection', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.complete();
    h.text('Please speak slower.', 'request-slow'); await until(() => h.updates().length === 2);
    const slow = h.updates()[1].session;
    assert.equal(slow.audio.output.speed, 0.9); assert.match(slow.instructions, /CONTINUATION STATE/);
    for (const type of [undefined, 'transcription']) {
      h.provider.receive({ type: 'session.updated', session: { ...slow, type } });
      await tick(); assert.equal(h.replies().length, 1, 'continuation ACK must retain the realtime session type');
    }
    h.provider.receive({ type: 'session.updated', session: { ...slow, audio: { output: { speed: 1 } } } });
    h.acknowledge(0); h.acknowledge(1, 'ack-1'); await tick(); assert.equal(h.replies().length, 1);
    h.acknowledge(1); await until(() => h.replies().length === 2); h.complete();
    h.text('Please speak normally.', 'request-reset'); await until(() => h.updates().length === 3);
    assert.equal(h.updates()[2].session.audio.output.speed, 1);
    h.acknowledge(1); await tick(); assert.equal(h.replies().length, 2);
    h.acknowledge(2); await until(() => h.replies().length === 3);
    assert.equal(h.consumes(), 3); assert.equal(h.connects(), 1);
  } finally { h.cleanup(); }
});

test('partials and assistant history never select speed; duplicate final microphone events yield one reply', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.complete();
    h.provider.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'mic-1', delta: 'Please speak slower.' });
    h.provider.receive({ type: 'response.output_audio_transcript.done', item_id: 'assistant-1', transcript: 'Please speak slower.' });
    await until(() => h.saved.length === 1); await tick(); assert.equal(h.updates().length, 1);
    h.final('Office hours?', 'mic-1'); await until(() => h.updates().length === 2);
    assert.equal(h.updates()[1].session.audio.output.speed, 1);
    h.final('Please speak slower.', 'mic-1'); h.acknowledge(); await until(() => h.replies().length === 2); h.complete();
    h.final('Please speak slower.', 'mic-2'); await until(() => h.updates().length === 3);
    assert.equal(h.updates()[2].session.audio.output.speed, 0.9);
    h.final('Please speak slower.', 'mic-2'); h.acknowledge(); h.acknowledge(); await until(() => h.replies().length === 3); await tick();
    assert.equal(h.saved.length, 3); assert.equal(h.consumes(), 3); assert.equal(h.replies().length, 3);
  } finally { h.cleanup(); }
});

test('absent profile preserves old wire behavior and adaptation disabled preserves operator default', async () => {
  assert.equal(Object.hasOwn(realtimeSession('fictional', 'marin', 'Instructions').session.audio.output, 'speed'), false);
  for (const profile of [undefined, { ...adaptive, adaptToRequests: false }, { ...adaptive, pace: 'unhurried' as const, adaptToRequests: false }]) {
    const h = harness(profile);
    try {
      await h.authenticate(); h.complete(); h.text('Please speak slower.', 'request-slow'); await until(() => h.updates().length === 2);
      const expected = profile === undefined ? undefined : profile.pace === 'unhurried' ? 0.9 : 1;
      assert.equal(h.updates()[0].session.audio.output.speed, expected);
      assert.equal(h.updates()[1].session.audio?.output?.speed, expected);
      if (!profile) assert.equal(Object.hasOwn(h.updates()[1].session, 'audio'), false);
      h.acknowledge(); await until(() => h.replies().length === 2);
    } finally { h.cleanup(); }
  }
});

test('newer speech and interrupts suppress obsolete response while preserving serialized speed state', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.complete(); h.text('Please speak slower.', 'request-slow'); await until(() => h.updates().length === 2);
    h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id: 'newer-mic' });
    h.final('Please speak normally.', 'newer-mic'); h.acknowledge(1);
    await until(() => h.updates().length === 3); assert.equal(h.replies().length, 1);
    assert.equal(h.updates()[2].session.audio.output.speed, 1);
    h.client.receive({ type: 'interrupt', playedMs: 0 }); h.acknowledge(2); await tick(); assert.equal(h.replies().length, 1);
    h.text('Office hours?', 'request-next'); await until(() => h.replies().length === 2);
    assert.equal(h.updates().length, 3, 'already acknowledged combined state is reused');
  } finally { h.cleanup(); }
});

test('out-of-order final microphone request cannot override newer captured pace', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.complete();
    for (const item_id of ['old-mic', 'new-mic']) h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id });
    h.final('Please speak normally.', 'new-mic'); await until(() => h.updates().length === 2); h.acknowledge(); await until(() => h.replies().length === 2); h.complete();
    h.final('Please speak slower.', 'old-mic'); await until(() => h.saved.length === 2); await tick();
    assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 2);
    h.text('Office hours?', 'request-next'); await until(() => h.replies().length === 3);
    assert.equal(h.updates().length, 2); assert.equal(h.updates()[1].session.audio.output.speed, 1);
  } finally { h.cleanup(); }
});

test('missing speed acknowledgement times out without response, reconnect or retry', async () => {
  const h = harness(adaptive, { timeout: 40 });
  try {
    await h.authenticate(false);
    const session = structuredClone(h.updates()[0].session); delete session.audio.output.speed;
    h.provider.receive({ type: 'session.updated', session }); await until(() => h.finishes() === 1);
    h.acknowledge(); await tick();
    assert.equal(h.client.sent.find(event => event.type === 'ended')?.outcome, 'session_update_timeout');
    assert.equal(h.replies().length, 0); assert.equal(h.updates().length, 1); assert.equal(h.connects(), 1);
  } finally { h.cleanup(); }
});

test('release revocation while speed ACK is pending closes authority before any response', async () => {
  const h = harness(adaptive, { recheckMs: 10 });
  try {
    await h.authenticate(); h.complete(); h.text('Please speak slower.', 'request-revoke'); await until(() => h.updates().length === 2);
    h.revoke(); await until(() => h.finishes() === 1); h.acknowledge(); await tick();
    assert.equal(h.client.sent.find(event => event.type === 'ended')?.outcome, 'authority_changed'); assert.equal(h.replies().length, 1);
  } finally { h.cleanup(); }
});

test('visitor cannot send rate settings in text payloads or provider-shaped updates', async () => {
  for (const event of [{ type: 'text', requestId: 'request-forged', text: 'Hello', speed: 0.9 }, { type: 'session.update', session: { audio: { output: { speed: 0.9 } } } }]) {
    const h = harness(adaptive);
    try {
      await h.authenticate(); h.client.receive(event); await until(() => h.finishes() === 1);
      assert.equal(h.client.sent.find(item => item.type === 'ended')?.outcome, 'invalid_input'); assert.equal(h.updates().length, 1);
    } finally { h.cleanup(); }
  }
});

test('gateway reads released speech delivery snapshot despite later draft edits and browser hints', async () => {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, now = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  const speechDelivery: SpeechDeliveryProfile = { version: 1, pace: 'unhurried', adaptToRequests: false };
  const config = { name: 'Public assistant', role: 'Company assistant', objective: 'Answer public company questions', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Brief', memoryScope: 'none', escalation: 'Contact the company.', knowledgeIds: [], enabledTools: [], speechDelivery };
  const agent = await handleAgentAction(user, 'agent.create', config) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const run = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: run.id, currentReleaseId: null }) as PlatformRecord;
  const origin = 'https://public.example.test';
  const draft = await createDeployment(user, { name: 'Public', channel: 'web_voice', agentId: agent.id, versionId: version.id, releaseId: release.id, publicKnowledgeIds: [], brand: { name: 'Fictional', welcomeMessage: 'Hello.' }, allowedOrigins: [origin], limits: { enabled: true } });
  await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await handleAgentAction(user, 'agent.update', { ...config, speechDelivery: adaptive, agentId: agent.id, revision: agent.revision });
  const issued = await issuePublicSession(draft.data.publicId, { origin, purpose: 'voice', requestId: randomUUID() });
  const client = new Socket(), provider = new Socket(); let finished = false;
  const bridge = attachVoiceBridge(client as unknown as WebSocket, { headers: { origin } }, {
    authorize: resolvePublicSession, claim: claimVoiceSession, close: closePublicSession,
    transcript: async () => undefined, finish: async () => { finished = true; },
    connect: () => { queueMicrotask(() => provider.emit('open')); return { socket: provider as unknown as WebSocket, model: 'fictional', voice: 'marin' }; },
  });
  try {
    client.receive({ type: 'authenticate', token: issued.token, nonce: issued.nonce, speechDelivery: adaptive, speed: 1 });
    await until(() => provider.sent.some(event => event.type === 'session.update'));
    const session = provider.sent.find(event => event.type === 'session.update')!.session;
    assert.deepEqual((version.data.config as { speechDelivery: SpeechDeliveryProfile }).speechDelivery, speechDelivery);
    assert.equal(session.audio.output.speed, 0.9);
    provider.receive({ type: 'session.updated', session }); await until(() => provider.sent.some(event => event.type === 'response.create'));
  } finally { bridge.stop('test_cleanup', 'Test cleanup.'); await until(() => finished); }
});

test('typed and microphone barge-in wait for matching cancelled response terminal before changing speed', async () => {
  for (const mode of ['text', 'microphone']) for (const lateCreated of [false, true]) {
    const h = harness(adaptive);
    try {
      await h.authenticate();
      if (!lateCreated) h.provider.receive({ type: 'response.created', response: { id: 'opening' } });
      if (mode === 'text') h.text('Please speak slower.', 'request-bargein');
      else {
        h.provider.receive({ type: 'input_audio_buffer.speech_started', item_id: 'mic-bargein' });
        h.final('Please speak slower.', 'mic-bargein');
      }
      await until(() => h.saved.length === 1); await tick();
      assert.equal(h.provider.sent.filter(event => event.type === 'response.cancel').length, 1);
      assert.equal(h.updates().length, 1, 'cancel request alone does not permit changing Azure output speed');
      h.provider.receive({ type: 'response.done', response: { id: 'stale-other-response', status: 'cancelled' } });
      h.provider.receive({ type: 'response.done', response: { status: 'cancelled' } });
      await tick(); assert.equal(h.updates().length, 1);
      if (lateCreated) {
        h.provider.receive({ type: 'response.created', response: { id: 'opening' } });
        await tick(); assert.equal(h.updates().length, 1, 'late created binds cancellation but does not finish it');
      }
      h.provider.receive({ type: 'response.done', ...(mode === 'microphone' ? { response_id: 'opening' } : {}), response: { id: 'opening', status: 'cancelled' } });
      await until(() => h.updates().length === 2); assert.equal(h.replies().length, 1);
      assert.equal(h.updates()[1].session.audio.output.speed, 0.9);
      h.acknowledge(); await until(() => h.replies().length === 2);
      h.provider.receive({ type: 'response.done', response: { id: 'opening', status: 'cancelled' } });
      await tick(); assert.equal(h.replies().length, 2); assert.equal(h.updates().length, 2);
    } finally { h.cleanup(); }
  }
});

test('newer caller turn while cancellation is pending suppresses obsolete reply and serializes configuration', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.provider.receive({ type: 'response.created', response: { id: 'opening' } });
    h.text('Please speak slower.', 'request-older'); await until(() => h.saved.length === 1);
    h.text('Please speak normally.', 'request-newer'); await tick(); assert.equal(h.updates().length, 1);
    h.provider.receive({ type: 'response.done', response: { id: 'opening', status: 'cancelled' } });
    await until(() => h.updates().length === 2); h.acknowledge(); await until(() => h.updates().length === 3);
    assert.equal(h.replies().length, 1); assert.equal(h.updates()[2].session.audio.output.speed, 1);
    h.acknowledge(); await until(() => h.replies().length === 2);
    assert.equal(h.provider.sent.filter(event => event.type === 'response.cancel').length, 1);
  } finally { h.cleanup(); }
});

test('cancelled configured response must terminate even when its acknowledged configuration is unchanged', async () => {
  const h = harness(adaptive);
  try {
    await h.authenticate(); h.complete(); h.text('Office hours?', 'request-first'); await until(() => h.updates().length === 2);
    h.acknowledge(); await until(() => h.replies().length === 2);
    h.provider.receive({ type: 'response.created', response: { id: 'answer-first' } });
    h.text('Office address?', 'request-second'); await until(() => h.saved.length === 2); await tick();
    assert.equal(h.replies().length, 2); assert.equal(h.updates().length, 2);
    h.provider.receive({ type: 'response.done', response: { id: 'response-1', status: 'completed' } });
    await tick(); assert.equal(h.replies().length, 2, 'duplicate older terminal cannot settle current cancellation');
    h.provider.receive({ type: 'response.done', response: { id: 'answer-first', status: 'cancelled' } });
    await until(() => h.replies().length === 3); assert.equal(h.updates().length, 2);
  } finally { h.cleanup(); }
});

test('cancellation timeout, disconnect, provider close and visitor stop release wait without speed update or reply', async () => {
  for (const end of ['timeout', 'client', 'provider', 'stop']) {
    const h = harness(adaptive, { timeout: end === 'timeout' ? 100 : 2000 });
    try {
      await h.authenticate(); h.provider.receive({ type: 'response.created', response: { id: 'opening' } });
      h.text('Please speak slower.', 'request-cancel'); await until(() => h.saved.length === 1); await tick();
      if (end === 'client') h.client.close();
      else if (end === 'provider') h.provider.close();
      else if (end === 'stop') h.client.receive({ type: 'stop' });
      await until(() => h.finishes() === 1);
      if (end === 'timeout') assert.equal(h.client.sent.find(event => event.type === 'ended')?.outcome, 'response_cancel_timeout');
      h.provider.receive({ type: 'response.done', response: { id: 'opening', status: 'cancelled' } }); await tick();
      assert.equal(h.updates().length, 1); assert.equal(h.replies().length, 1); assert.equal(h.connects(), 1);
    } finally { h.cleanup(); }
  }
});
