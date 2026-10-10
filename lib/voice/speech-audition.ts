import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { getActiveMembership, operatorMembershipFence } from '../team/service';
import { beginVoiceAttempt, markAttemptProvisioning, closeOwnedVoiceAttempt } from '../usage/service';
import { createEvaluationAudioArtifact } from '../evaluations/audio-artifacts';
import type { AudioArtifactRef } from '../evaluations/audio-schema';
import { configureAzureSpeechNodeTransport } from './continuous-speech-provider';
import { compileTaxilaSpeech, taxilaSpeechPreset, TAXILA_COMPILER_REVISION, TAXILA_SOURCE_REVISION, TAXILA_SPEECH_PRESETS, TAXILA_MAX_TEXT_CHARACTERS, type TaxilaSpeechPresetId } from './taxila-speech';

const KIND = 'eval:speech_audition';
const MAX_WAVE_BYTES = 1_500_000;
const sha = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export type SpeechAuditionFailureCode = 'configuration_unavailable' | 'admission_denied' | 'unsupported_voice' | 'provider_rejected' | 'deadline_exceeded' | 'transport_uncertain' | 'invalid_audio' | 'storage_failed';
export type SpeechAuditionData = {
  schemaVersion: 1; requestHash: string; preset: TaxilaSpeechPresetId; voice: string;
  sourceRevision: string; compilerRevision: string; textDigest: string; characterCount: number;
  captureConsent: { actorId: string; confirmedAt: string; scope: 'store_generated_speech_and_text_fingerprint' };
  artifact?: AudioArtifactRef; failureCode?: SpeechAuditionFailureCode;
};
export type SpeechAudition = { id: string; status: 'pending' | 'complete' | 'failed' | 'uncertain'; createdAt: string; data: SpeechAuditionData };
type StoredData = SpeechAuditionData;
type Row = { id: string; status: string; data: string; created_at: string };
type Admission = { begin: typeof beginVoiceAttempt; mark: typeof markAttemptProvisioning; close: typeof closeOwnedVoiceAttempt };
export type SpeechAuditionSynthesisInput = { preset: TaxilaSpeechPresetId; text: string; key: string; region: string };
export type SpeechAuditionSynthesisResult = { wave: Buffer; durationMs: number };
export type SpeechAuditionDependencies = {
  database?: Database; env?: Record<string, string | undefined>; now?: () => Date;
  admission?: Admission; synthesize?: (input: SpeechAuditionSynthesisInput) => Promise<SpeechAuditionSynthesisResult>;
};
export const SPEECH_AUDITION_BOUNDARY = 'Generated Azure Speech audition using a narrow Taxila source port. This does not change the live Realtime voice, establish a comparison result, or pass an evaluation gate.';
export class SpeechAuditionFailure extends Error {
  constructor(readonly code: SpeechAuditionFailureCode, readonly closureConfirmed: boolean) {
    super(`Speech audition ${code.replaceAll('_', ' ')}.`); this.name = 'SpeechAuditionFailure';
  }
}

/** Validate the entire RIFF envelope, including exact PCM byte rate and alignment. */
export function parseSpeechAuditionWave(wave: Buffer): { durationMs: number; sampleRate: 24000; channels: 1 } {
  const invalid = () => new SpeechAuditionFailure('invalid_audio', true);
  if (!Buffer.isBuffer(wave) || wave.length < 44 || wave.length > MAX_WAVE_BYTES || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE' || wave.readUInt32LE(4) !== wave.length - 8) throw invalid();
  let offset = 12, format: Buffer | undefined, pcm: Buffer | undefined;
  while (offset + 8 <= wave.length) {
    const kind = wave.toString('ascii', offset, offset + 4), size = wave.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    if (end > wave.length) throw invalid();
    if (kind === 'fmt ') { if (format) throw invalid(); format = wave.subarray(start, end); }
    if (kind === 'data') { if (pcm) throw invalid(); pcm = wave.subarray(start, end); }
    offset = end + size % 2;
  }
  if (offset !== wave.length || !format || format.length < 16 || !pcm?.length || pcm.length % 2 || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 || format.readUInt32LE(4) !== 24000 || format.readUInt32LE(8) !== 48000 || format.readUInt16LE(12) !== 2 || format.readUInt16LE(14) !== 16 || pcm.length > 30 * 48000) throw invalid();
  return { durationMs: Math.max(1, Math.round(pcm.length / 48)), sampleRate: 24000, channels: 1 };
}

function providerFailure(details: unknown): SpeechAuditionFailureCode {
  // Inspect only to classify; never persist, log, or return provider payloads.
  return typeof details === 'string' && /(?:voice.*(?:not (?:found|supported|available)|unsupported|invalid)|(?:unsupported|invalid).*voice)/i.test(details) ? 'unsupported_voice' : 'provider_rejected';
}

/** One actual SDK speakSsmlAsync call; no fallback, retry, or text transformation. */
export async function synthesizeSpeechAudition(input: SpeechAuditionSynthesisInput): Promise<SpeechAuditionSynthesisResult> {
  const ssml = compileTaxilaSpeech(input.preset, input.text);
  if (!input.key || !/^[a-z][a-z0-9-]{1,40}$/.test(input.region)) throw new SpeechAuditionFailure('configuration_unavailable', true);
  const sdk = await import('microsoft-cognitiveservices-speech-sdk');
  await configureAzureSpeechNodeTransport();
  const config = sdk.SpeechConfig.fromSubscription(input.key, input.region);
  config.speechSynthesisVoiceName = taxilaSpeechPreset(input.preset)!.voice;
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const synthesizer = new sdk.SpeechSynthesizer(config);
  const close = () => new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (confirmed: boolean) => { if (settled) return; settled = true; clearTimeout(timer); resolve(confirmed); };
    const timer = setTimeout(() => finish(false), 4500);
    try { synthesizer.close(() => finish(true), () => finish(false)); } catch { finish(false); }
  });
  let result: import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesisResult;
  try {
    result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new SpeechAuditionFailure('deadline_exceeded', false)), 20_000);
      try { synthesizer.speakSsmlAsync(ssml, value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(new SpeechAuditionFailure(providerFailure(error), false)); }); }
      catch (error) { clearTimeout(timer); reject(new SpeechAuditionFailure(providerFailure(error), false)); }
    });
  } catch (error) {
    const confirmed = await close();
    throw new SpeechAuditionFailure(error instanceof SpeechAuditionFailure ? error.code : 'provider_rejected', confirmed);
  }
  if (!await close()) throw new SpeechAuditionFailure('transport_uncertain', false);
  if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted || !result.audioData?.byteLength) throw new SpeechAuditionFailure(providerFailure(result.errorDetails), true);
  const wave = Buffer.from(result.audioData), parsed = parseSpeechAuditionWave(wave);
  return { wave, durationMs: parsed.durationMs };
}

function dto(row: Row): SpeechAudition {
  // Never expose raw text retained by an older local implementation.
  const { inputText: _privateText, ...data } = JSON.parse(row.data) as StoredData & { inputText?: string };
  return { id: row.id, status: row.status as SpeechAudition['status'], createdAt: row.created_at, data };
}
export async function listSpeechAuditions(user: AuthUser, dependencies: SpeechAuditionDependencies = {}) {
  const membership = await getActiveMembership(user), database = dependencies.database || await db();
  const rows = await database.all<Row>('SELECT id,status,data,created_at FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 100', [user.organizationId, KIND]);
  return { presets: TAXILA_SPEECH_PRESETS, attempts: rows.map(dto), canWrite: membership.role !== 'viewer', maxTextCharacters: TAXILA_MAX_TEXT_CHARACTERS, evidenceBoundary: SPEECH_AUDITION_BOUNDARY };
}

export async function createSpeechAudition(user: AuthUser, body: Record<string, unknown>, dependencies: SpeechAuditionDependencies = {}): Promise<SpeechAudition> {
  if (body.consent !== true) throw new HttpError(400, 'Confirm private storage of generated speech and its text fingerprint.');
  const preset = taxilaSpeechPreset(body.preset);
  if (!preset) throw new HttpError(400, 'Choose a supported Taxila speech preset.');
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9:_.-]{8,100}$/.test(body.requestId)) throw new HttpError(400, 'Use a bounded audition request ID.');
  if (typeof body.text !== 'string') throw new HttpError(400, 'Speech text is required.');
  try { compileTaxilaSpeech(preset.id, body.text); } catch { throw new HttpError(400, `Use 1–${TAXILA_MAX_TEXT_CHARACTERS} valid text characters.`); }
  const database = dependencies.database || await db(), env = dependencies.env || process.env;
  const now = () => (dependencies.now?.() || new Date()).toISOString();
  const requestHash = sha([preset.id, body.text, true, TAXILA_COMPILER_REVISION]), id = `speech-audition:${sha([user.organizationId, body.requestId])}`;
  const data: StoredData = { schemaVersion: 1, requestHash, preset: preset.id, voice: preset.voice, sourceRevision: TAXILA_SOURCE_REVISION, compilerRevision: TAXILA_COMPILER_REVISION, textDigest: sha(body.text), characterCount: body.text.length,
    captureConsent: { actorId: user.id, confirmedAt: now(), scope: 'store_generated_speech_and_text_fingerprint' } };
  const createdAt = now();
  const read = async () => (await database.all<Row>('SELECT id,status,data,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, KIND]))[0];
  // Actual membership is checked even for a replay; caller-supplied roles are ignored.
  const fence = await operatorMembershipFence(user, database);
  const prior = await read();
  if (prior) { if ((JSON.parse(prior.data) as StoredData).requestHash !== requestHash) throw new HttpError(409, 'This audition request ID was already used for different input.'); return dto(prior); }
  try {
    await database.batch([fence,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, KIND, 'pending', JSON.stringify(data), createdAt], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'speech_audition.pending', createdAt] },
    ]);
  } catch (error) {
    const raced = await read();
    if (!raced) throw error;
    if ((JSON.parse(raced.data) as StoredData).requestHash !== requestHash) throw new HttpError(409, 'This audition request ID was already used for different input.');
    return dto(raced);
  }
  const finish = async (status: SpeechAudition['status'], extra: Partial<StoredData>) => {
    const updated = { ...data, ...extra };
    // Terminal accounting belongs to the admitted operation, even if its actor is revoked during synthesis.
    await database.batch([
      { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND status=?', params: [JSON.stringify(updated), status, id, user.organizationId, KIND, 'pending'], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, `speech_audition.${status}`, now()] },
    ]);
    return dto({ id, status, created_at: createdAt, data: JSON.stringify(updated) });
  };
  const admission = dependencies.admission || { begin: beginVoiceAttempt, mark: markAttemptProvisioning, close: closeOwnedVoiceAttempt };
  const usage = { database, env, now: dependencies.now };
  let attemptId: string | undefined, started = false, closed = false;
  try {
    const key = env.AZURE_SPEECH_KEY || env.SPEECH_KEY, region = env.AZURE_SPEECH_REGION || env.SPEECH_REGION;
    if (!key || !region || !/^[a-z][a-z0-9-]{1,40}$/.test(region)) throw new SpeechAuditionFailure('configuration_unavailable', true);
    const reservation = await admission.begin(user, { requestId: `speech-audition:${body.requestId}`, provider: 'azure', purpose: 'audio_proof', maxSeconds: 30 }, usage);
    attemptId = reservation.id;
    if (reservation.replayed || !await admission.mark(user, reservation.id, usage)) {
      // We do not own any prior provisioning; preserve occupied capacity.
      attemptId = undefined;
      return await finish('uncertain', { failureCode: 'transport_uncertain' });
    }
    started = true;
    const result = await (dependencies.synthesize || synthesizeSpeechAudition)({ preset: preset.id, text: body.text, key, region });
    closed = true;
    const parsed = parseSpeechAuditionWave(result.wave);
    const artifact = await createEvaluationAudioArtifact(user, { bytes: result.wave, mimeType: 'audio/wav', ...parsed }, database);
    await admission.close(user, attemptId, { outcome: 'complete' }, usage);
    return await finish('complete', { artifact: { id: artifact.id, sha256: artifact.sha256, mimeType: artifact.mimeType, bytes: artifact.byteLength, durationMs: artifact.durationMs, sampleRate: artifact.sampleRate, channels: artifact.channels, expiresAt: artifact.expiresAt, playbackUrl: `/api/evaluations/audio/${encodeURIComponent(artifact.id)}` } });
  } catch (error) {
    const closureConfirmed = !started || closed || (error instanceof SpeechAuditionFailure && error.closureConfirmed);
    const status = closureConfirmed ? 'failed' : 'uncertain';
    if (attemptId) await admission.close(user, attemptId, { outcome: status }, usage).catch(() => undefined);
    const failureCode = error instanceof SpeechAuditionFailure ? error.code : !attemptId ? 'admission_denied' : closed ? 'storage_failed' : 'transport_uncertain';
    return finish(status, { failureCode });
  }
}
