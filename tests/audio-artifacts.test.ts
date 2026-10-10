import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createEvaluationAudioArtifact,
  getEvaluationAudioArtifactMetadata,
  listEvaluationAudioArtifacts,
  purgeExpiredEvaluationAudioArtifacts,
  readEvaluationAudioArtifact,
} from '../lib/evaluations/audio-artifacts';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';

process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), 'evaluation-audio-')), 'test.sqlite');

async function user(): Promise<AuthUser> {
  const store = await db();
  const id = randomUUID(), organizationId = randomUUID(), now = new Date().toISOString();
  await store.batch([
    { sql: 'INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', params: [organizationId, 'Audio test', now] },
    { sql: 'INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, `${id}@example.test`, 'none', organizationId, now] },
  ]);
  return { id, organizationId, email: `${id}@example.test` };
}

const audio = Buffer.from('RIFF-bounded-synthetic-WAVE-fixture');
const input = (bytes: Uint8Array = audio) => ({ mimeType: 'audio/wav' as const, bytes, durationMs: 725, sampleRate: 24_000, channels: 1 });
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;

test('audio artifacts retain verified bytes while metadata and list views remain byte-free and tenant scoped', async () => {
  delete process.env.EVALUATION_AUDIO_RETENTION_DAYS;
  const owner = await user(), outsider = await user();
  const saved = await createEvaluationAudioArtifact(owner, input(new Uint8Array(audio)));

  assert.equal(saved.sha256, createHash('sha256').update(audio).digest('hex'));
  assert.equal(saved.byteLength, audio.byteLength);
  assert.equal(saved.durationMs, 725);
  assert.equal(saved.sampleRate, 24_000);
  assert.equal(saved.channels, 1);
  assert.equal('bytes' in saved, false);
  assert.ok(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt) <= 7 * 24 * 60 * 60 * 1000);
  assert.ok(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt) > 6.99 * 24 * 60 * 60 * 1000);

  const details = await getEvaluationAudioArtifactMetadata(owner, saved.id);
  const listed = await listEvaluationAudioArtifacts(owner);
  assert.deepEqual(details, saved);
  assert.deepEqual(listed, [saved]);
  assert.equal('bytes' in details, false);
  assert.equal('bytes' in listed[0], false);

  const result = await readEvaluationAudioArtifact(owner, saved.id);
  assert.deepEqual(result.metadata, saved);
  assert.deepEqual(result.bytes, audio);
  await assert.rejects(getEvaluationAudioArtifactMetadata(outsider, saved.id), status(404));
  await assert.rejects(readEvaluationAudioArtifact(outsider, saved.id), status(404));
  assert.deepEqual(await listEvaluationAudioArtifacts(outsider), []);
});

test('storage enforces WAV, byte, metadata, and configurable retention bounds before persistence', async () => {
  const owner = await user();
  process.env.EVALUATION_AUDIO_RETENTION_DAYS = '1';
  try {
    await assert.rejects(createEvaluationAudioArtifact(owner, { ...input(), mimeType: 'audio/mpeg' as 'audio/wav' }), status(415));
    await assert.rejects(createEvaluationAudioArtifact(owner, input(Buffer.alloc(3 * 1024 * 1024 + 1))), status(413));
    await assert.rejects(createEvaluationAudioArtifact(owner, { ...input(), sampleRate: 0 }), status(400));
    await assert.rejects(createEvaluationAudioArtifact(owner, { ...input(), expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() }), status(400));
    const saved = await createEvaluationAudioArtifact(owner, input(Buffer.from(audio)));
    const retainedFor = Date.parse(saved.expiresAt) - Date.parse(saved.createdAt);
    assert.ok(retainedFor <= 24 * 60 * 60 * 1000 && retainedFor > 23.99 * 60 * 60 * 1000);
  } finally {
    delete process.env.EVALUATION_AUDIO_RETENTION_DAYS;
  }
});

test('reads fail closed for expired content and for same-length byte tampering', async () => {
  const owner = await user(), store = await db();
  const expired = await createEvaluationAudioArtifact(owner, input());
  await store.run('UPDATE evaluation_audio_artifacts SET expires_at = ? WHERE id = ? AND organization_id = ?', ['2000-01-01T00:00:00.000Z', expired.id, owner.organizationId]);
  await assert.rejects(readEvaluationAudioArtifact(owner, expired.id), status(410));

  const changed = await createEvaluationAudioArtifact(owner, input());
  const tampered = new Uint8Array(audio.byteLength).fill(7);
  await store.run('UPDATE evaluation_audio_artifacts SET bytes = ? WHERE id = ? AND organization_id = ?', [tampered, changed.id, owner.organizationId]);
  await assert.rejects(readEvaluationAudioArtifact(owner, changed.id), status(409));
});

test('expiry purge is bounded and deterministic across tenants without touching metadata entities', async () => {
  const firstOwner = await user(), secondOwner = await user(), store = await db();
  const first = await createEvaluationAudioArtifact(firstOwner, input());
  const second = await createEvaluationAudioArtifact(secondOwner, input());
  const third = await createEvaluationAudioArtifact(firstOwner, input());
  const live = await createEvaluationAudioArtifact(secondOwner, input());
  const manifestId = randomUUID(), createdAt = new Date().toISOString();
  await store.batch([
    { sql: 'UPDATE evaluation_audio_artifacts SET expires_at = ? WHERE id = ?', params: ['1990-01-01T00:00:00.000Z', first.id] },
    { sql: 'UPDATE evaluation_audio_artifacts SET expires_at = ? WHERE id = ?', params: ['1990-01-02T00:00:00.000Z', second.id] },
    { sql: 'UPDATE evaluation_audio_artifacts SET expires_at = ? WHERE id = ?', params: ['1990-01-03T00:00:00.000Z', third.id] },
    { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [manifestId, firstOwner.organizationId, 'eval:audio_manifest', 'complete', JSON.stringify({ artifactIds: [first.id, second.id, third.id] }), createdAt] },
  ]);

  assert.equal(await purgeExpiredEvaluationAudioArtifacts(store, new Date('1991-01-01T00:00:00.000Z'), 2), 2);
  const remainingIds = (await store.all<{ id: string }>('SELECT id FROM evaluation_audio_artifacts WHERE id IN (?, ?, ?, ?) ORDER BY id', [first.id, second.id, third.id, live.id])).map(row => String(row.id));
  assert.deepEqual(remainingIds, [third.id, live.id].sort());
  assert.equal(await readEvaluationAudioArtifact(secondOwner, live.id).then(result => result.metadata.id), live.id);
  await assert.rejects(readEvaluationAudioArtifact(firstOwner, live.id), status(404));
  const [manifest] = await store.all<{ id: string; data: string }>('SELECT id, data FROM entities WHERE id = ?', [manifestId]);
  assert.equal(manifest.id, manifestId);
  assert.equal(manifest.data, JSON.stringify({ artifactIds: [first.id, second.id, third.id] }));

  assert.equal(await purgeExpiredEvaluationAudioArtifacts(store, new Date('1991-01-01T00:00:00.000Z')), 1);
  assert.equal(await purgeExpiredEvaluationAudioArtifacts(store, new Date('1991-01-01T00:00:00.000Z')), 0);
  await assert.rejects(purgeExpiredEvaluationAudioArtifacts(store, new Date(), 101), status(400));
  assert.equal((await getEvaluationAudioArtifactMetadata(secondOwner, live.id)).id, live.id);
});
