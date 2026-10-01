import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { PublicVoiceEvidenceRecorder, isPublicVoiceEvidence, type PublicVoiceResponseEvidence } from '../lib/public-agent/evidence';
import { createVoiceGateway, type GatewayDependencies } from '../lib/public-agent/gateway';
import { safeResponseDiagnostic } from '../lib/public-agent/protocol';
import { appendPublicTranscript, claimVoiceSession, finishPublicConversation, persistPublicVoiceEvidence, type PublicAuthority } from '../lib/public-agent/service';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

const origin = 'https://public.example.test';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown) { for (let i = 0; i < 200; i++) { if (check()) return; await delay(10); } throw new Error('Expected event did not arrive.'); }

test('recorder stores exact server-transport lags, nonempty audio bytes and sanitized terminal usage', () => {
  let now = 1_000;
  const recorder = new PublicVoiceEvidenceRecorder(now, () => now);
  now = 1_010; recorder.requested(1);
  now = 1_015; recorder.providerCreated(1);
  now = 1_020; assert.equal(recorder.audio(1, 0).first, false);
  now = 1_025; assert.equal(recorder.audio(1, 80).first, true);
  now = 1_030; recorder.audio(1, 20);
  now = 1_040; recorder.terminal(1, safeResponseDiagnostic('response.done', {
    id: 'provider-response-secret', status: 'completed', usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18, input_token_details: { audio_tokens: 3 }, output_token_details: { audio_tokens: 4 } },
    output: [{ content: [{ transcript: 'raw words must not persist' }], url: 'https://credential.example.test/key' }],
  }, 1));
  const snapshot = recorder.snapshot();
  assert.deepEqual(snapshot, {
    version: 1, serverCaptured: true, capture: 'best_effort', basis: 'server_transport', metric: 'requested_to_first_server_audio_ms',
    turns: [{ turn: 'turn1', requestedAtMs: 10, providerCreatedAtMs: 15, firstServerAudioAtMs: 25, terminalAtMs: 40, requestedToFirstServerAudioMs: 15, status: 'completed', cancelled: false, audioBytes: 100,
      tokenUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, inputAudioTokens: 3, outputAudioTokens: 4 } }],
  });
  assert.equal(isPublicVoiceEvidence(snapshot), true);
  assert.doesNotMatch(JSON.stringify(snapshot), /provider-response|raw words|credential\.example|url|transcript|responseId|itemId/i);

  now = 1_041; recorder.requested(41);
  assert.equal(recorder.snapshot().turns.length, 1, 'evidence is fixed to turn1..turn40');
});

async function gatewayHarness(evidenceFails = false) {
  const fake = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(fake, 'listening');
  const upstreamEvents: Record<string, any>[] = [], clientEvents: Record<string, any>[] = [], saved: PublicVoiceResponseEvidence[] = [];
  let provider: WebSocket | undefined, now = 10_000, finishes = 0;
  const authority = { user: { id: 'owner', email: 'owner@example.test', organizationId: 'org' }, deployment: { id: 'deployment', revision: 1, data: { channel: 'web_voice', publicId: 'public', agentId: 'agent', versionId: 'version', releaseId: 'release', publicKnowledgeIds: [], autoLearning: false, brand: { name: 'Example', welcomeMessage: 'Welcome.' }, limits: { maxSessionSeconds: 5, maxTurnsPerConversation: 4 } } }, config: { primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', objective: 'Help.' }, context: '{"companyKnowledge":[]}', fences: [], sessionId: 'session-1', expiresAt: new Date(Date.now() + 5000).toISOString(), purpose: 'voice' } as unknown as PublicAuthority;
  fake.on('connection', socket => { provider = socket; socket.on('message', raw => upstreamEvents.push(JSON.parse(raw.toString()))); });
  const dependencies: GatewayDependencies = {
    authorize: async (_token, input) => { if (input.origin !== origin || input.purpose !== 'voice') throw new HttpError(403, 'Unauthorized.'); return { ...authority, nextNonce: 'next' }; },
    claim: async () => undefined, close: async () => undefined, transcript: async () => undefined, finish: async () => { finishes++; },
    evidence: async (_authority, turn) => { if (evidenceFails) throw new Error('telemetry unavailable'); saved.push(turn); },
    clock: () => now,
    connect: () => ({ socket: new WebSocket(`ws://127.0.0.1:${(fake.address() as { port: number }).port}`), model: 'fictional', voice: 'marin' }),
    recheckMs: 10_000,
  };
  const gateway = createVoiceGateway(dependencies); gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
  const client = new WebSocket(`ws://127.0.0.1:${(gateway.server.address() as { port: number }).port}/voice`, { origin });
  client.on('message', raw => clientEvents.push(JSON.parse(raw.toString()))); await once(client, 'open');
  client.send(JSON.stringify({ type: 'authenticate', token: 'valid', nonce: 'nonce' }));
  await until(() => upstreamEvents.some(event => event.type === 'session.update'));
  const emit = (event: unknown) => provider!.send(JSON.stringify(event));
  return { client, clientEvents, upstreamEvents, saved, emit, setNow: (value: number) => { now = value; }, finishes: () => finishes,
    cleanup: async () => { client.terminate(); gateway.shutdown(); for (const socket of fake.clients) socket.terminate(); await new Promise<void>(resolve => fake.close(() => resolve())); } };
}

test('gateway persists cancellation without accepting late cancelled events and binds audio to the current ordinal', async () => {
  const h = await gatewayHarness();
  try {
    h.setNow(10_010); h.emit({ type: 'session.updated' });
    await until(() => h.upstreamEvents.filter(event => event.type === 'response.create').length === 1);
    h.setNow(10_012); h.client.send(JSON.stringify({ type: 'text', text: 'Please continue', requestId: 'request-next' }));
    await until(() => h.upstreamEvents.filter(event => event.type === 'response.create').length === 2);
    h.setNow(10_015); h.emit({ type: 'response.created', response: { id: 'cancelled-provider-id' } });
    h.emit({ type: 'response.output_audio.delta', response_id: 'cancelled-provider-id', item_id: 'cancelled-item-id', delta: Buffer.alloc(40).toString('base64') });
    h.emit({ type: 'response.done', response: { id: 'cancelled-provider-id', status: 'cancelled', usage: { total_tokens: 999 } } });
    await delay(20);
    h.setNow(10_020); h.emit({ type: 'response.created', response: { id: 'current-provider-id' } });
    await until(() => h.saved.some(turn => turn.turn === 'turn2' && turn.providerCreatedAtMs === 20));
    h.emit({ type: 'response.output_item.added', response_id: 'current-provider-id', item: { id: 'current-item-id', type: 'message' } });
    h.setNow(10_021); h.emit({ type: 'response.output_audio.delta', response_id: 'current-provider-id', item_id: 'current-item-id', delta: '' });
    await delay(20);
    h.setNow(10_030); h.emit({ type: 'response.output_audio.delta', response_id: 'current-provider-id', item_id: 'current-item-id', delta: Buffer.alloc(80).toString('base64') });
    await until(() => h.saved.some(turn => turn.turn === 'turn2' && turn.firstServerAudioAtMs === 30));
    h.setNow(10_035); h.emit({ type: 'response.output_audio.delta', response_id: 'current-provider-id', item_id: 'current-item-id', delta: Buffer.alloc(20).toString('base64') });
    await until(() => h.clientEvents.filter(event => event.type === 'audio').length >= 3);
    h.setNow(10_050); h.emit({ type: 'response.done', response: { id: 'current-provider-id', status: 'completed', usage: { input_tokens: 5, output_tokens: 6, total_tokens: 11 }, output: [{ secret: 'raw provider payload' }] } });
    await until(() => h.clientEvents.some(event => event.type === 'turn_done'));
    await until(() => h.saved.some(turn => turn.turn === 'turn2' && turn.terminalAtMs === 50));
    const latest = new Map(h.saved.map(turn => [turn.turn, turn]));
    assert.deepEqual(latest.get('turn1'), { turn: 'turn1', requestedAtMs: 10, status: 'cancelled', cancelled: true, audioBytes: 0 });
    assert.deepEqual(latest.get('turn2'), { turn: 'turn2', requestedAtMs: 12, providerCreatedAtMs: 20, firstServerAudioAtMs: 30, terminalAtMs: 50, requestedToFirstServerAudioMs: 18, status: 'completed', cancelled: false, audioBytes: 100, tokenUsage: { inputTokens: 5, outputTokens: 6, totalTokens: 11, inputAudioTokens: undefined, outputAudioTokens: undefined } });
    assert.doesNotMatch(JSON.stringify([...latest.values()]), /provider-id|item-id|raw provider payload/i);
  } finally { await h.cleanup(); }
});

test('best-effort evidence failure does not suppress the response or canonical finish', async () => {
  const h = await gatewayHarness(true);
  try {
    h.setNow(10_010); h.emit({ type: 'session.updated' });
    await until(() => h.upstreamEvents.some(event => event.type === 'response.create'));
    h.emit({ type: 'response.created', response: { id: 'response-1' } });
    h.emit({ type: 'response.done', response: { id: 'response-1', status: 'completed' } });
    await until(() => h.clientEvents.some(event => event.type === 'turn_done'));
    h.client.send(JSON.stringify({ type: 'stop' }));
    await until(() => h.finishes() === 1);
    assert.equal(h.clientEvents.some(event => event.outcome === 'uncertain'), false);
  } finally { await h.cleanup(); }
});

function authorityFixture(organizationId: string, sessionId: string): PublicAuthority {
  return { user: { id: `user-${sessionId}`, email: `${sessionId}@example.test`, organizationId }, deployment: { id: `deployment-${sessionId}`, revision: 1, data: { channel: 'web_voice', publicId: `public-${sessionId}`, agentId: 'agent', versionId: 'version', releaseId: 'release', publicKnowledgeIds: [], autoLearning: false, brand: { name: 'Example', welcomeMessage: 'Welcome.' }, limits: { maxSessionSeconds: 60, maxTurnsPerConversation: 4 } } }, config: { primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', objective: 'Help.' }, context: '{"companyKnowledge":[]}', fences: [], sessionId, expiresAt: new Date(Date.now() + 60_000).toISOString(), purpose: 'voice' } as unknown as PublicAuthority;
}

test('server persistence is CAS-backed and idempotent per turn; canonical voice sessions include only captured evidence', async () => {
  const database = await db(), organizationId = randomUUID(), now = new Date().toISOString();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [organizationId, 'Example', now]);
  const authority = authorityFixture(organizationId, randomUUID());
  await claimVoiceSession(authority);
  const turn: PublicVoiceResponseEvidence = { turn: 'turn1', requestedAtMs: 8, firstServerAudioAtMs: 21, requestedToFirstServerAudioMs: 13, terminalAtMs: 35, status: 'completed', cancelled: false, audioBytes: 160, tokenUsage: { totalTokens: 12 } };
  await persistPublicVoiceEvidence(authority, turn);
  await persistPublicVoiceEvidence(authority, turn);
  await assert.rejects(persistPublicVoiceEvidence(authority, { ...turn, rawText: 'untrusted visitor value' } as PublicVoiceResponseEvidence), /Invalid server voice evidence/);
  await appendPublicTranscript(authority, 'public_web_voice', { role: 'assistant', text: 'Server transcript.', eventId: 'output-1' });
  await finishPublicConversation(authority, 'public_web_voice', 'visitor_stopped');
  const [conversation] = await database.all<{ data: string }>('SELECT data FROM entities WHERE organization_id=? AND kind=? AND id LIKE ?', [organizationId, 'public:conversation', 'public:conversation:%']);
  assert.equal(JSON.parse(conversation.data).voiceEvidence.turns.length, 1);
  const sessions = await database.all<{ data: string }>('SELECT data FROM entities WHERE organization_id=? AND kind=?', [organizationId, 'session']);
  assert.deepEqual(JSON.parse(sessions[0].data).voiceEvidence.turns, [turn]);

  const withoutEvidence = authorityFixture(organizationId, randomUUID());
  await claimVoiceSession(withoutEvidence);
  await appendPublicTranscript(withoutEvidence, 'public_web_voice', { role: 'assistant', text: 'Another transcript.', eventId: 'output-2' });
  await finishPublicConversation(withoutEvidence, 'public_web_voice', 'visitor_stopped');
  const allSessions = await database.all<{ data: string }>('SELECT data FROM entities WHERE organization_id=? AND kind=?', [organizationId, 'session']);
  const second = allSessions.map(row => JSON.parse(row.data)).find(value => value.publicSessionId === withoutEvidence.sessionId);
  assert.equal(Object.hasOwn(second, 'voiceEvidence'), false, 'missing best-effort evidence stays explicitly absent');
});
