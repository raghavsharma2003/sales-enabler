import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { AuthUser } from '../../server/auth';
import { HttpError } from '../../server/http';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from '../../platform/records';
import { azureConfig, createAzureClient, enrollmentReadiness, previewReadiness, previewVoiceConfig, providerStatus, synthesizePreview } from './azure';
import { MAX_REQUEST, validateWav } from './audio';
import { assertInferenceAccess } from '../../usage/service';

type CloneData = {
  ownerId: string; label: string; companyName: string; locale: string; consentId: string; voiceId: string;
  consentDuration: number; sampleDuration: number; providerStatus?: string; speakerProfileId?: string;
};
type Clone = PlatformRecord<CloneData>;
type Client = ReturnType<typeof createAzureClient>;
const audioRoot = () => resolve(process.cwd(), 'data', 'voice-clones');
const audioPath = (user: AuthUser, id: string, file: 'consent' | 'sample') => resolve(audioRoot(), user.organizationId, id, `${file}.wav`);
const safe = (record: Clone) => ({ id: record.id, label: record.data.label, locale: record.data.locale, status: record.status, providerStatus: record.data.providerStatus || null, consentDuration: record.data.consentDuration, sampleDuration: record.data.sampleDuration, createdAt: record.createdAt, updatedAt: record.updatedAt });
export type PublicClone = ReturnType<typeof safe>;

function scoped(user: AuthUser, record: Clone) {
  if (record.data.ownerId !== user.id) throw new HttpError(404, 'Voice enrollment not found.');
  return record;
}
async function find(user: AuthUser, id: string) { return scoped(user, await getRecord<CloneData>(user.organizationId, 'voice_clone', id)); }
async function save(user: AuthUser, record: Clone, status: string, extra: Partial<CloneData> = {}) {
  return updateRecord(user, record, { ...record.data, ...extra }, status);
}
async function removeAudio(user: AuthUser, id: string) {
  const target = resolve(audioRoot(), user.organizationId, id);
  const within = relative(audioRoot(), target);
  if (!within || within.startsWith('..') || within.startsWith('/') || within.startsWith('\\') || !/^[0-9a-f-]{36}[\\/][0-9a-f-]{36}$/i.test(within))
    throw new HttpError(500, 'Private audio location is invalid.');
  await rm(target, { recursive: true, force: true });
}

export async function listClones(user: AuthUser) {
  const records = await listRecords<CloneData>(user.organizationId, 'voice_clone');
  return { setup: enrollmentReadiness(), previewSetup: previewReadiness(), clones: records.filter(record => record.data.ownerId === user.id).map(safe) };
}
export async function getClone(user: AuthUser, id: string) { return safe(await find(user, id)); }

export function validateEnrollmentFields(form: FormData, configuredCompanyName = '') {
  const label = form.get('label'), locale = form.get('locale');
  if (typeof label !== 'string' || !label.trim() || label.length > 64) throw new HttpError(400, 'Enter the speaker’s name (up to 64 characters).');
  const providedCompanyName = form.get('companyName');
  const companyName = typeof providedCompanyName === 'string' && providedCompanyName.trim() ? providedCompanyName.trim() : configuredCompanyName.trim();
  if (!companyName || Array.from(companyName).length > 80 || /[\r\n\x00-\x1f]/.test(companyName)) throw new HttpError(400, 'Enter the exact company name spoken in the Azure consent (up to 80 characters).');
  if (typeof locale !== 'string' || !/^[a-z]{2,3}-[A-Z0-9]{2,8}$/.test(locale)) throw new HttpError(400, 'Enter a valid speech locale, such as en-US.');
  if (form.get('speakerAuthorized') !== 'true' || form.get('azureConsent') !== 'true') throw new HttpError(400, 'The speaker must explicitly authorize biometric voice training and provide their own Azure consent recording.');
  if (form.get('trainingCostAcknowledged') !== 'true') throw new HttpError(400, 'Acknowledge that Azure profile creation may incur training and hosting charges.');
  const consent = form.get('consent'), sample = form.get('sample');
  if (!(consent instanceof File) || !(sample instanceof File)) throw new HttpError(400, 'Upload separate consent and speech sample WAV files.');
  if (consent.size + sample.size > MAX_REQUEST || consent.size > 10 * 1024 * 1024 || sample.size > 10 * 1024 * 1024) throw new HttpError(413, 'The audio upload exceeds the size limit.');
  return { label: label.trim(), companyName, locale, consent, sample };
}

export async function enrollClone(user: AuthUser, form: FormData, fetcher: typeof fetch = fetch) {
  await assertInferenceAccess(user);
  const { label, companyName, locale, consent, sample } = validateEnrollmentFields(form, process.env.AZURE_PERSONAL_VOICE_COMPANY_NAME || '');
  const config = azureConfig();
  const [consentBytes, sampleBytes] = await Promise.all([consent.arrayBuffer(), sample.arrayBuffer()]);
  const consentAudio = Buffer.from(consentBytes), sampleAudio = Buffer.from(sampleBytes);
  const consentProbe = validateWav(consent, consentAudio, 'consent');
  const sampleProbe = validateWav(sample, sampleAudio, 'sample');
  const token = randomUUID().replaceAll('-', '');
  const record = await createRecord<CloneData>(user, 'voice_clone', {
    ownerId: user.id, label, companyName, locale, consentId: `cos-consent-${token}`, voiceId: `cos-voice-${token}`,
    consentDuration: consentProbe.durationSeconds, sampleDuration: sampleProbe.durationSeconds,
  }, 'staging');
  try {
    const dir = resolve(audioRoot(), user.organizationId, record.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await Promise.all([
      writeFile(audioPath(user, record.id, 'consent'), consentAudio, { flag: 'wx', mode: 0o600 }),
      writeFile(audioPath(user, record.id, 'sample'), sampleAudio, { flag: 'wx', mode: 0o600 }),
    ]);
  } catch {
    await save(user, record, 'reconcile_required');
    throw new HttpError(500, 'Could not store the private audio. Revoke this enrollment from the list.');
  }
  const submitting = await save(user, record, 'consent_submitting');
  try {
    const response = await createAzureClient(config, fetcher).createConsent(record.data.consentId, label, companyName, locale, consentAudio);
    const next = await save(user, submitting, providerStatus(response.status) === 'failed' ? 'failed' : 'consent_pending', { providerStatus: response.status });
    return safe(next);
  } catch (error) {
    await save(user, submitting, 'reconcile_required');
    throw error;
  }
}

export async function refreshClone(user: AuthUser, id: string, fetcher: typeof fetch = fetch) {
  let record = await find(user, id);
  if (['revoking', 'revocation_pending', 'revoked', 'reconcile_required', 'failed', 'staging', 'consent_submitting', 'profile_submitting'].includes(record.status)) return safe(record);
  const client = createAzureClient(azureConfig(), fetcher);
  if (record.status === 'consent_pending') {
    const consent = await client.getConsent(record.data.consentId);
    if (!consent) return safe(await save(user, record, 'reconcile_required'));
    const state = providerStatus(consent.status);
    if (state === 'failed') return safe(await save(user, record, 'failed', { providerStatus: consent.status }));
    if (state === 'pending') return safe(await save(user, record, 'consent_pending', { providerStatus: consent.status }));
    record = await save(user, record, 'profile_submitting', { providerStatus: consent.status });
    try {
      const audio = await readFile(audioPath(user, record.id, 'sample'));
      const voice = await client.createVoice(record.data.voiceId, record.data.consentId, audio);
      const voiceState = providerStatus(voice.status);
      record = await save(user, record, voiceState === 'failed' ? 'failed' : voiceState === 'ready' ? 'ready' : 'profile_pending', { providerStatus: voice.status, speakerProfileId: voice.speakerProfileId });
      await removeAudio(user, record.id);
      return safe(record);
    } catch (error) {
      await save(user, record, 'reconcile_required');
      throw error;
    }
  }
  if (record.status === 'profile_pending' || record.status === 'ready') {
    const voice = await client.getVoice(record.data.voiceId, record.data.consentId);
    if (!voice) return safe(await save(user, record, 'reconcile_required'));
    const state = providerStatus(voice.status);
    const status = state === 'pending' ? 'profile_pending' : state;
    record = await save(user, record, status, { providerStatus: voice.status, speakerProfileId: voice.speakerProfileId });
  }
  return safe(record);
}

export async function revokeClone(user: AuthUser, id: string, fetcher: typeof fetch = fetch) {
  let record = await find(user, id);
  if (record.status === 'revoked') return safe(record);
  if (record.status !== 'revoking' && record.status !== 'revocation_pending') record = await save(user, record, 'revoking', { speakerProfileId: undefined });
  try {
    // Local biometric bytes are removed before any fallible provider I/O.
    await removeAudio(user, id);
    const client: Client = createAzureClient(azureConfig(process.env, true), fetcher);
    await client.delete(record.data.voiceId, 'personalvoices');
    await client.delete(record.data.consentId, 'consents');
    return safe(await save(user, record, 'revoked', { speakerProfileId: undefined }));
  } catch (error) {
    await save(user, record, 'revocation_pending', { speakerProfileId: undefined });
    throw error;
  }
}

export async function previewClone(user: AuthUser, id: string, text: unknown, fetcher: typeof fetch = fetch) {
  await assertInferenceAccess(user);
  if (typeof text !== 'string' || !text.trim() || text.length > 240) throw new HttpError(400, 'Preview text must contain 1–240 characters.');
  const record = await find(user, id);
  if (record.status !== 'ready' || !record.data.speakerProfileId) throw new HttpError(409, 'This profile is not ready for Speech preview.');
  const { config, model, ttsEndpoint } = previewVoiceConfig();
  const client = createAzureClient(config, fetcher);
  const voice = await client.getVoice(record.data.voiceId, record.data.consentId);
  if (!voice || providerStatus(voice.status) !== 'ready' || voice.speakerProfileId !== record.data.speakerProfileId) throw new HttpError(409, 'The Azure speaker profile no longer matches this enrollment.');
  return synthesizePreview(record.data.speakerProfileId, model, text.trim(), config, ttsEndpoint, fetcher);
}
