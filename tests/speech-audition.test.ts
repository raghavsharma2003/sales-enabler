import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { createSpeechAudition, listSpeechAuditions, parseSpeechAuditionWave, SpeechAuditionFailure, synthesizeSpeechAudition, type SpeechAuditionDependencies } from '../lib/voice/speech-audition';
import { compileTaxilaSpeech } from '../lib/voice/taxila-speech';
import { readEvaluationAudioArtifact } from '../lib/evaluations/audio-artifacts';
import { pcm24ToWave } from '../lib/evaluations/audio-runner';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'speech-audition-')), 'test.sqlite');
delete process.env.DATABASE_URL;
const env = { NODE_ENV: 'test', SPEECH_KEY: 'fake', SPEECH_REGION: 'eastus2' };
const request = (requestId = randomUUID()) => ({ requestId, preset: 'taxila-diya', text: '  Hello, हिंदी। [pause] 12.5%  ', consent: true });
async function fixture() {
  const database = await db(), id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  const user: AuthUser = { id, organizationId, email: `${id}@example.test` };
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [organizationId, 'Speech audition test', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'x', organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  return { database, user };
}
function mocks() {
  let calls = 0, begins = 0; const outcomes: string[] = [];
  const dependencies: SpeechAuditionDependencies = { env,
    synthesize: async input => { calls++; assert.equal(input.text, request().text); assert.equal(input.preset, 'taxila-diya'); return { wave: pcm24ToWave(Buffer.alloc(12000)), durationMs: 250 }; },
    admission: {
      begin: async (_user, input) => { begins++; assert.equal(input.purpose, 'audio_proof'); assert.equal(input.maxSeconds, 30); return { id: randomUUID(), deadlineAt: new Date().toISOString(), state: 'reserved', replayed: false }; },
      mark: async () => true,
      close: async (_user, _id, input) => { outcomes.push(input.outcome); return null; },
    },
  };
  return { dependencies, counts: () => ({ calls, begins, outcomes }) };
}

test('one exact audition is durable, idempotent, private and playable with seven-day maximum retention', async () => {
  const f = await fixture(), m = mocks(), body = request();
  const first = await createSpeechAudition(f.user, body, m.dependencies), replay = await createSpeechAudition(f.user, body, m.dependencies);
  assert.equal(first.status, 'complete'); assert.deepEqual(replay, first); assert.equal(m.counts().calls, 1); assert.equal(m.counts().begins, 1);
  assert.equal(first.data.voice, 'en-IN-Diya:DragonHDLatestNeural'); assert.equal(first.data.compilerRevision, 'taxila-safe-ssml-v1'); assert.equal('inputText' in first.data, false);
  const [stored] = await f.database.all<{ data: string }>('SELECT data FROM entities WHERE id=?', [first.id]);
  assert.equal('inputText' in JSON.parse(stored.data), false);
  assert.equal(stored.data.includes(body.text), false);
  assert.equal(first.data.captureConsent.scope, 'store_generated_speech_and_text_fingerprint');
  const artifact = first.data.artifact!;
  assert.ok(Date.parse(artifact.expiresAt) <= Date.now() + 7 * 86400000);
  assert.equal(artifact.playbackUrl, `/api/evaluations/audio/${artifact.id}`);
  assert.equal((await readEvaluationAudioArtifact(f.user, artifact.id)).bytes.length, artifact.bytes);
  const listed = await listSpeechAuditions(f.user); assert.equal(listed.attempts.length, 1); assert.equal(listed.canWrite, true); assert.equal(listed.maxTextCharacters, 280);
  assert.match(listed.evidenceBoundary, /does not change.*Realtime/);
  await assert.rejects(createSpeechAudition(f.user, { ...body, text: 'changed' }, m.dependencies), /different input/);
  assert.equal(m.counts().calls, 1);
});

test('concurrent duplicate admission generates once and pending replay never automatically retries', async () => {
  const f = await fixture(), m = mocks(), body = request();
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const deps = { ...m.dependencies, synthesize: async (input: Parameters<NonNullable<SpeechAuditionDependencies['synthesize']>>[0]) => { entered(); await wait; return m.dependencies.synthesize!(input); } };
  const firstPromise = createSpeechAudition(f.user, body, deps);
  await enteredPromise;
  const pending = await createSpeechAudition(f.user, body, deps); assert.equal(pending.status, 'pending');
  release(); await firstPromise; assert.equal(m.counts().calls, 1); assert.equal(m.counts().begins, 1);
});

test('invalid consent, preset, XML and actual viewer membership reject before provider admission', async () => {
  const f = await fixture(), m = mocks();
  for (const overrides of [{ consent: false }, { preset: 'swara' }, { text: '\0' }, { text: 'a'.repeat(281) }]) await assert.rejects(createSpeechAudition(f.user, { ...request(), ...overrides }, m.dependencies));
  const [member] = await f.database.all<{ data: string }>('SELECT data FROM entities WHERE id=?', [`team:member:${f.user.id}`]);
  await f.database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...JSON.parse(member.data), role: 'viewer' }), `team:member:${f.user.id}`]);
  assert.equal((await listSpeechAuditions(f.user)).canWrite, false);
  await assert.rejects(createSpeechAudition(f.user, request(), m.dependencies), /role/);
  assert.equal(m.counts().begins, 0); assert.equal(m.counts().calls, 0);
});

test('workspace isolation and artifact expiry apply to saved auditions and playback', async () => {
  const a = await fixture(), b = await fixture(), m = mocks(), body = request();
  const first = await createSpeechAudition(a.user, body, m.dependencies);
  assert.equal((await listSpeechAuditions(b.user)).attempts.length, 0);
  await assert.rejects(readEvaluationAudioArtifact(b.user, first.data.artifact!.id), /not found/);
  const second = await createSpeechAudition(b.user, body, m.dependencies); assert.notEqual(first.id, second.id);
  await a.database.run('UPDATE evaluation_audio_artifacts SET expires_at=? WHERE id=?', [new Date(Date.now() - 1000).toISOString(), first.data.artifact!.id]);
  await assert.rejects(readEvaluationAudioArtifact(a.user, first.data.artifact!.id), /expired/);
});

test('confirmed unsupported voice fails explicitly and uncertain closure retains occupancy without retries or payload leakage', async () => {
  const f = await fixture();
  for (const confirmed of [true, false]) {
    const m = mocks(), body = request();
    const deps = { ...m.dependencies, synthesize: async () => { throw new SpeechAuditionFailure('unsupported_voice', confirmed); } };
    const result = await createSpeechAudition(f.user, body, deps);
    assert.equal(result.status, confirmed ? 'failed' : 'uncertain'); assert.equal(result.data.failureCode, 'unsupported_voice');
    assert.deepEqual(m.counts().outcomes, [confirmed ? 'failed' : 'uncertain']);
    await createSpeechAudition(f.user, body, deps); assert.equal(m.counts().begins, 1);
  }
  const m = mocks(), result = await createSpeechAudition(f.user, request(), { ...m.dependencies, synthesize: async () => { throw new Error('secret provider payload fake-key'); } });
  assert.equal(result.status, 'uncertain'); assert.equal(JSON.stringify(result).includes('fake-key'), false); assert.equal(JSON.stringify(result).includes('secret provider'), false);
});

test('configuration and admission rejection produce durable failure before synthesis', async () => {
  const f = await fixture(), m = mocks();
  const config = await createSpeechAudition(f.user, request(), { ...m.dependencies, env: {} });
  assert.equal(config.data.failureCode, 'configuration_unavailable'); assert.equal(config.status, 'failed'); assert.equal(m.counts().begins, 0);
  const denied = await createSpeechAudition(f.user, request(), { ...m.dependencies, admission: { ...m.dependencies.admission!, begin: async () => { throw new Error('daily allowance exhausted'); } } });
  assert.equal(denied.data.failureCode, 'admission_denied'); assert.equal(denied.status, 'failed'); assert.equal(m.counts().calls, 0);
});

test('real allowance retains daily consumption after success and blocks a second paid attempt', async () => {
  const f = await fixture(), m = mocks();
  const deps = { env: { ...env, VOICE_DAILY_ORG_ATTEMPT_BUDGET: '1' }, synthesize: m.dependencies.synthesize };
  const first = await createSpeechAudition(f.user, request(), deps);
  assert.equal(first.status, 'complete');
  const second = await createSpeechAudition(f.user, request(), deps);
  assert.equal(second.status, 'failed'); assert.equal(second.data.failureCode, 'admission_denied'); assert.equal(m.counts().calls, 1);
  const attempts = await f.database.all<{ status: string; data: string }>('SELECT status,data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'voice:attempt']);
  assert.equal(attempts.length, 1); assert.equal(attempts[0].status, 'closed'); assert.equal(JSON.parse(attempts[0].data).maxSeconds, 30);
  const budgets = await f.database.all<{ data: string }>('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'voice:budget']);
  assert.deepEqual(JSON.parse(budgets[0].data), { attempts: 1, reservedSeconds: 30 });
});

test('unclaimed replay or failed provisioning fence cannot mutate another provider reservation', async () => {
  const f = await fixture();
  for (const replayed of [true, false]) {
    const m = mocks(), originalBegin = m.dependencies.admission!.begin;
    const result = await createSpeechAudition(f.user, request(), { ...m.dependencies, admission: { ...m.dependencies.admission!,
      begin: async (...args) => ({ ...await originalBegin(...args), replayed }), mark: async () => false,
    } });
    assert.equal(result.status, 'uncertain'); assert.equal(result.data.failureCode, 'transport_uncertain');
    assert.equal(m.counts().calls, 0); assert.deepEqual(m.counts().outcomes, []);
  }
});

test('real allowance keeps unconfirmed provider closure occupied and prevents a second provider execution', async () => {
  const f = await fixture(); let calls = 0;
  const deps = { env, synthesize: async () => { calls++; throw new SpeechAuditionFailure('deadline_exceeded', false); } };
  assert.equal((await createSpeechAudition(f.user, request(), deps)).status, 'uncertain');
  const next = await createSpeechAudition(f.user, request(), deps); assert.equal(next.data.failureCode, 'admission_denied'); assert.equal(calls, 1);
  const [attempt] = await f.database.all<{ status: string }>('SELECT status FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'voice:attempt']);
  assert.equal(attempt.status, 'uncertain');
});

test('WAV envelope rejects malformed chunk sizes, alignment, PCM fields, oversize and overduration', () => {
  const valid = pcm24ToWave(Buffer.alloc(48000)); assert.equal(parseSpeechAuditionWave(valid).durationMs, 1000);
  assert.equal(parseSpeechAuditionWave(pcm24ToWave(Buffer.alloc(30 * 48000))).durationMs, 30000);
  for (const offset of [4, 20, 22, 24, 28, 32, 34, 40]) { const bad = Buffer.from(valid); bad[offset] ^= 1; assert.throws(() => parseSpeechAuditionWave(bad), /invalid audio/); }
  assert.throws(() => parseSpeechAuditionWave(pcm24ToWave(Buffer.alloc(30 * 48000 + 2))), /invalid audio/);
  assert.throws(() => parseSpeechAuditionWave(Buffer.alloc(1500001)), /invalid audio/);
});

test('actual pinned SDK sends one exact SSML frame over terminable localhost transport and confirms cleanup', { timeout: 15000 }, async context => {
  const [{ SpeechSynthesisConnectionFactory }, { WebsocketConnection }, { WebsocketMessageFormatter }] = await Promise.all([
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/SpeechSynthesisConnectionFactory.js'),
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.browser/WebsocketConnection.js'),
    import('microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/WebsocketMessageFormatter.js'),
  ]);
  const nativeSocket = globalThis.WebSocket;
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
  const received: string[] = []; let connections = 0, socketClosed = false, nodeTransport = false;
  server.on('connection', peer => {
    peer.on('close', () => { socketClosed = true; });
    peer.on('message', raw => {
      const text = raw.toString(); if (!/^Path:\s*ssml\r?$/im.test(text)) return;
      received.push(text.slice(text.indexOf('\r\n\r\n') + 4));
      const requestId = /^X-RequestId:\s*([^\r\n]+)/im.exec(text)?.[1]; assert.ok(requestId);
      const frame = (path: string, body: string) => `Path: ${path}\r\nX-RequestId: ${requestId}\r\nContent-Type: application/json\r\n\r\n${body}`;
      peer.send(frame('turn.start', '{}'));
      peer.send(frame('response', JSON.stringify({ audio: { streamId: 'fixture-stream' } })));
      const headers = Buffer.from(`Path: audio\r\nX-RequestId: ${requestId}\r\nX-StreamId: fixture-stream\r\nContent-Type: audio/x-wav\r\n`);
      const prefix = Buffer.alloc(2); prefix.writeUInt16BE(headers.length);
      peer.send(Buffer.concat([prefix, headers, Buffer.alloc(12000)]));
      peer.send(frame('turn.end', '{}'));
    });
  });
  context.mock.method(SpeechSynthesisConnectionFactory.prototype, 'create', async () => {
    connections++;
    const connection = new WebsocketConnection(`ws://127.0.0.1:${(server.address() as { port: number }).port}`, {}, {}, new WebsocketMessageFormatter(), undefined as never);
    const originalOpen = connection.open.bind(connection);
    context.mock.method(connection, 'open', async () => {
      const result = await originalOpen();
      const socket = (connection as unknown as { privConnectionMessageAdapter: { privWebsocketClient: { terminate?: unknown } } }).privConnectionMessageAdapter.privWebsocketClient;
      nodeTransport = typeof socket.terminate === 'function'; return result;
    });
    return connection;
  });
  try {
    const result = await synthesizeSpeechAudition({ preset: 'taxila-diya', text: request().text, key: 'fixture-only', region: 'eastus2' });
    assert.equal(result.durationMs, 250); assert.equal(parseSpeechAuditionWave(result.wave).durationMs, 250);
    assert.deepEqual(received, [compileTaxilaSpeech('taxila-diya', request().text)]); assert.equal(connections, 1);
    assert.equal(nodeTransport, true); assert.equal(globalThis.WebSocket, nativeSocket);
    // Allow the local peer's close event to finish after the SDK dispose callback.
    if (!socketClosed) await Promise.race([Promise.all([...server.clients].map(peer => once(peer, 'close'))), new Promise(resolve => setTimeout(resolve, 500))]);
    assert.equal(socketClosed, true);
  } finally {
    for (const peer of server.clients) peer.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    context.mock.restoreAll();
  }
});
