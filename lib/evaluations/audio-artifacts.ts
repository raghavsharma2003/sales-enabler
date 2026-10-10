import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, type Database } from '../server/db';
import { HttpError } from '../server/http';

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const metadataColumns = 'id, mime_type, byte_count, sha256, duration_ms, sample_rate_hz, channels, created_at, expires_at';

type ArtifactRow = {
  id: string;
  mime_type: string;
  byte_count: number;
  sha256: string;
  duration_ms: number;
  sample_rate_hz: number;
  channels: number;
  created_at: string;
  expires_at: string;
};

type ArtifactBytesRow = ArtifactRow & { bytes: unknown };

export type EvaluationAudioArtifactMetadata = {
  id: string;
  mimeType: 'audio/wav';
  byteLength: number;
  sha256: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  createdAt: string;
  expiresAt: string;
};

export type CreateEvaluationAudioArtifactInput = {
  bytes: Uint8Array;
  mimeType: 'audio/wav';
  durationMs: number;
  sampleRate: number;
  channels: number;
  expiresAt?: string;
};

function retentionMs(): number {
  const configured = process.env.EVALUATION_AUDIO_RETENTION_DAYS;
  if (configured === undefined || configured === '') return MAX_RETENTION_DAYS * DAY_MS;
  const days = Number(configured);
  if (!Number.isFinite(days) || days <= 0 || days > MAX_RETENTION_DAYS) {
    throw new Error(`EVALUATION_AUDIO_RETENTION_DAYS must be greater than 0 and at most ${MAX_RETENTION_DAYS}.`);
  }
  return days * DAY_MS;
}

function positiveInteger(value: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new HttpError(400, `${label} is outside the supported range.`);
  }
  return value;
}

function metadata(row: ArtifactRow): EvaluationAudioArtifactMetadata {
  return {
    id: String(row.id),
    mimeType: 'audio/wav',
    byteLength: Number(row.byte_count),
    sha256: String(row.sha256),
    durationMs: Number(row.duration_ms),
    sampleRate: Number(row.sample_rate_hz),
    channels: Number(row.channels),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  };
}

export async function createEvaluationAudioArtifact(
  user: Pick<AuthUser, 'organizationId'>,
  input: CreateEvaluationAudioArtifactInput,
  database?: Database,
): Promise<EvaluationAudioArtifactMetadata> {
  if (input.mimeType !== 'audio/wav') throw new HttpError(415, 'Only audio/wav evaluation artifacts are supported.');
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new HttpError(413, 'Evaluation audio must contain 1 byte to 3 MiB.');
  }
  const durationMs = positiveInteger(input.durationMs, 24 * 60 * 60 * 1000, 'Audio duration');
  const sampleRate = positiveInteger(input.sampleRate, 384_000, 'Audio sample rate');
  const channels = positiveInteger(input.channels, 32, 'Audio channel count');
  const nowMs = Date.now();
  const maximumExpiry = nowMs + retentionMs();
  const expiresMs = input.expiresAt === undefined ? maximumExpiry : Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs || expiresMs > maximumExpiry) {
    throw new HttpError(400, 'Artifact expiry must be in the future and within the configured retention period.');
  }

  const bytes = Buffer.from(input.bytes);
  const artifact: EvaluationAudioArtifactMetadata = {
    id: randomUUID(),
    mimeType: 'audio/wav',
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    durationMs,
    sampleRate,
    channels,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
  };
  const store = database || await db();
  await store.run(
    'INSERT INTO evaluation_audio_artifacts (id, organization_id, mime_type, byte_count, sha256, duration_ms, sample_rate_hz, channels, bytes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [artifact.id, user.organizationId, artifact.mimeType, artifact.byteLength, artifact.sha256, artifact.durationMs, artifact.sampleRate, artifact.channels, bytes, artifact.createdAt, artifact.expiresAt],
  );
  return artifact;
}

export async function getEvaluationAudioArtifactMetadata(
  user: Pick<AuthUser, 'organizationId'>,
  id: string,
  database?: Database,
): Promise<EvaluationAudioArtifactMetadata> {
  const store = database || await db();
  const [row] = await store.all<ArtifactRow>(
    `SELECT ${metadataColumns} FROM evaluation_audio_artifacts WHERE id = ? AND organization_id = ?`,
    [id, user.organizationId],
  );
  if (!row) throw new HttpError(404, 'Evaluation audio artifact was not found in this workspace.');
  return metadata(row);
}

export async function listEvaluationAudioArtifacts(
  user: Pick<AuthUser, 'organizationId'>,
  database?: Database,
): Promise<EvaluationAudioArtifactMetadata[]> {
  const store = database || await db();
  const rows = await store.all<ArtifactRow>(
    `SELECT ${metadataColumns} FROM evaluation_audio_artifacts WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
    [user.organizationId],
  );
  return rows.map(metadata);
}

export async function readEvaluationAudioArtifact(
  user: Pick<AuthUser, 'organizationId'>,
  id: string,
  database?: Database,
): Promise<{ metadata: EvaluationAudioArtifactMetadata; bytes: Buffer }> {
  const store = database || await db();
  const [row] = await store.all<ArtifactBytesRow>(
    `SELECT ${metadataColumns}, bytes FROM evaluation_audio_artifacts WHERE id = ? AND organization_id = ?`,
    [id, user.organizationId],
  );
  if (!row) throw new HttpError(404, 'Evaluation audio artifact was not found in this workspace.');
  const details = metadata(row);
  if (!Number.isFinite(Date.parse(details.expiresAt)) || Date.parse(details.expiresAt) <= Date.now()) {
    throw new HttpError(410, 'Evaluation audio artifact has expired.');
  }
  if (!(row.bytes instanceof Uint8Array)) throw new HttpError(409, 'Evaluation audio artifact integrity check failed.');
  const bytes = Buffer.from(row.bytes);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== details.byteLength || actual !== details.sha256) {
    throw new HttpError(409, 'Evaluation audio artifact integrity check failed.');
  }
  return { metadata: details, bytes };
}

export async function purgeExpiredEvaluationAudioArtifacts(
  database?: Database,
  now: Date = new Date(),
  maxRows = 100,
): Promise<number> {
  const limit = positiveInteger(maxRows, 100, 'Audio artifact purge limit');
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new HttpError(400, 'Audio artifact purge time is invalid.');
  const store = database || await db();
  return store.run(
    'DELETE FROM evaluation_audio_artifacts WHERE id IN (SELECT id FROM evaluation_audio_artifacts WHERE expires_at <= ? ORDER BY expires_at ASC, id ASC LIMIT ?)',
    [new Date(nowMs).toISOString(), limit],
  );
}
