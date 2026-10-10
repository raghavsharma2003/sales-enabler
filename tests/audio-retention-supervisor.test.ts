import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createEvaluationAudioArtifact, readEvaluationAudioArtifact } from '../lib/evaluations/audio-artifacts';
import { pcm24ToWave } from '../lib/evaluations/audio-runner';
import { db, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { ownerRegistrationStatements } from '../lib/team/service';
import { beginVoiceAttempt, getUsageSnapshot } from '../lib/usage/service';
import { PRIVATE_VOICE_SUPERVISOR_SERVICE, runPrivateVoiceSupervisor } from '../lib/voice/supervisor';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
delete process.env.EVALUATION_AUDIO_RETENTION_DAYS;

async function fixture() {
  const database = await db(), id = randomUUID(), time = Date.now();
  const user = { id, organizationId: randomUUID(), email: `${id}@example.test` };
  const createdAt = new Date(time).toISOString();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Retention supervisor fixture', createdAt] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [id, user.email, 'unused', user.organizationId, createdAt] },
    ...ownerRegistrationStatements(user),
  ]);
  const bytes = pcm24ToWave(Buffer.alloc(12_000, 7));
  const input = { bytes, mimeType: 'audio/wav' as const, durationMs: 250, sampleRate: 24_000, channels: 1 };
  const expired = await createEvaluationAudioArtifact(user, input, database);
  const live = await createEvaluationAudioArtifact(user, input, database);
  await database.run('UPDATE evaluation_audio_artifacts SET expires_at = ? WHERE id = ? AND organization_id = ?',
    [new Date(time - 1000).toISOString(), expired.id, user.organizationId]);
  return { database, user, bytes, expired, live, time };
}

function observeWorker(database: Database, failPurge = false) {
  const voiceHeartbeats: string[] = [];
  let purgeCalls = 0;
  const observed: Database = {
    ...database,
    async run(sql, params) {
      if (sql.startsWith('DELETE FROM evaluation_audio_artifacts')) {
        purgeCalls++;
        if (failPurge) throw new Error('Injected artifact DELETE failure');
      }
      const changed = await database.run(sql, params);
      if (sql.startsWith('INSERT INTO service_heartbeats') && params?.[0] === PRIVATE_VOICE_SUPERVISOR_SERVICE) {
        voiceHeartbeats.push(String(params[2]));
      }
      return changed;
    },
  };
  return { database: observed, voiceHeartbeats, purgeCalls: () => purgeCalls };
}

test('the supervisor first successful tick purges expired audio and preserves live artifact bytes', async () => {
  const f = await fixture(), observed = observeWorker(f.database);
  await assert.rejects(readEvaluationAudioArtifact(f.user, f.expired.id, f.database),
    (error: unknown) => error instanceof HttpError && error.status === 410);

  await runPrivateVoiceSupervisor({
    database: observed.database, env: { NODE_ENV: 'test' }, now: () => new Date(f.time),
    signal: new AbortController().signal, once: true,
    transport: async () => { assert.fail('Retention maintenance must not call a provider.'); },
  });

  assert.equal(observed.purgeCalls(), 1);
  assert.deepEqual(await f.database.all('SELECT id FROM evaluation_audio_artifacts WHERE id = ?', [f.expired.id]), []);
  await assert.rejects(readEvaluationAudioArtifact(f.user, f.expired.id, f.database),
    (error: unknown) => error instanceof HttpError && error.status === 404);
  const remaining = await readEvaluationAudioArtifact(f.user, f.live.id, f.database);
  assert.deepEqual(remaining.bytes, f.bytes);
  assert.deepEqual(remaining.metadata, f.live);
  const [retention] = await f.database.all('SELECT status,updated_at FROM service_heartbeats WHERE id = ?', ['audio-artifact-retention']);
  assert.equal(retention.status, 'healthy');
  assert.equal(retention.updated_at, new Date(f.time).toISOString());
  assert.deepEqual(observed.voiceHeartbeats, ['healthy', 'stopped']);
});

test('artifact DELETE failure records separate unhealthy retention while core supervision closes due reservations and stays healthy', async () => {
  const f = await fixture(), observed = observeWorker(f.database, true);
  const deps = { database: f.database, env: { NODE_ENV: 'test' }, now: () => new Date(f.time) };
  const reserved = await beginVoiceAttempt(f.user, { requestId: randomUUID(), provider: 'azure', purpose: 'private_webrtc', maxSeconds: 1 }, deps);

  await runPrivateVoiceSupervisor({
    ...deps, database: observed.database, now: () => new Date(f.time + 2000),
    signal: new AbortController().signal, once: true,
    transport: async () => { assert.fail('An unprovisioned reservation has no provider resource to stop.'); },
  });

  assert.equal(observed.purgeCalls(), 1);
  const [attempt] = await f.database.all('SELECT status FROM entities WHERE id = ? AND organization_id = ?', [reserved.id, f.user.organizationId]);
  assert.equal(attempt.status, 'closed');
  assert.equal((await getUsageSnapshot(f.user, deps)).voice.live, 0);
  const [retention] = await f.database.all('SELECT status,updated_at FROM service_heartbeats WHERE id = ?', ['audio-artifact-retention']);
  assert.equal(retention.status, 'unhealthy');
  assert.equal(retention.updated_at, new Date(f.time + 2000).toISOString());
  assert.deepEqual(observed.voiceHeartbeats, ['healthy', 'stopped'], 'a retention failure must not publish an unhealthy voice heartbeat');
  const [voice] = await f.database.all('SELECT status FROM service_heartbeats WHERE id = ?', [PRIVATE_VOICE_SUPERVISOR_SERVICE]);
  assert.equal(voice.status, 'stopped', 'the once worker finishes its normal graceful shutdown');
  const [expired] = await f.database.all('SELECT bytes FROM evaluation_audio_artifacts WHERE id = ?', [f.expired.id]);
  assert.deepEqual(Buffer.from(expired.bytes as Uint8Array), f.bytes);
  assert.deepEqual((await readEvaluationAudioArtifact(f.user, f.live.id, f.database)).bytes, f.bytes);
});
