import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { authenticate } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { createAzureClient, enrollmentReadiness, providerStatus } from '../lib/voice/cloning/azure';
import { validateWav } from '../lib/voice/cloning/audio';
import { enrollClone, getClone, listClones, previewClone, refreshClone, revokeClone, validateEnrollmentFields } from '../lib/voice/cloning/service';
import { GET as statusRoute, POST as refreshRoute } from '../app/api/voice/clones/[id]/route';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.AZURE_PERSONAL_VOICE_LIMITED_ACCESS_APPROVED = 'true';
process.env.AZURE_SPEECH_KEY = 'fake-test-key'; process.env.AZURE_SPEECH_REGION = 'eastus';
process.env.AZURE_PERSONAL_VOICE_PROJECT_ID = 'ApprovedProject'; process.env.AZURE_PERSONAL_VOICE_COMPANY_NAME = 'Example Co';
process.env.AZURE_PERSONAL_VOICE_BASE_VOICE = 'PhoenixV2Neural';
const request = () => new Request('http://localhost/api/test', { headers: { origin: 'http://localhost' } });
const owner = async (name: string) => (await authenticate({ mode: 'register', email: `${name}@example.test`, password: 'correct password' }, request())).user;
const denied = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
function wav(seconds: number) {
  const data = Buffer.alloc(seconds * 48000); for (let i = 0; i < data.length; i += 2) data.writeInt16LE(i % 4000 ? 1000 : -1000, i);
  const bytes = Buffer.alloc(44 + data.length);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(data.length, 40); data.copy(bytes, 44);
  return bytes;
}
function file(bytes: Buffer) { return new File([new Uint8Array(bytes)], 'speaker.wav', { type: 'audio/wav' }); }
function form() {
  const data = new FormData(); data.set('label', 'Speaker Name'); data.set('companyName', 'Speaker Business'); data.set('locale', 'en-US');
  data.set('speakerAuthorized', 'true'); data.set('azureConsent', 'true'); data.set('trainingCostAcknowledged', 'true');
  data.set('consent', file(wav(5))); data.set('sample', file(wav(30))); return data;
}

test('consent and audio checks reject missing authority, size, silence and disguised files', () => {
  const valid = form(); assert.equal(validateEnrollmentFields(valid).label, 'Speaker Name');
  assert.equal(validateEnrollmentFields(valid).companyName, 'Speaker Business');
  valid.delete('companyName'); assert.throws(() => validateEnrollmentFields(valid), denied(400));
  assert.equal(validateEnrollmentFields(valid, 'Configured Business').companyName, 'Configured Business');
  valid.set('companyName', 'Speaker Business');
  valid.set('speakerAuthorized', 'false'); assert.throws(() => validateEnrollmentFields(valid), denied(400));
  valid.set('speakerAuthorized', 'true'); valid.set('trainingCostAcknowledged', 'false'); assert.throws(() => validateEnrollmentFields(valid), denied(400));
  valid.set('trainingCostAcknowledged', 'true');
  assert.throws(() => validateWav(file(Buffer.from('not wav')), Buffer.from('not wav'), 'sample'), denied(400));
  const silent = wav(5); silent.fill(0, 44); assert.throws(() => validateWav(file(silent), silent, 'consent'), denied(400));
  assert.throws(() => validateWav(file(wav(5)), wav(5), 'sample'), denied(400));
  valid.set('sample', file(Buffer.alloc(11 * 1024 * 1024))); assert.throws(() => validateEnrollmentFields(valid), denied(413));
});

test('only explicit approval and fixed region permit enrollment; Azure states are strict', () => {
  assert.equal(enrollmentReadiness({ NODE_ENV: 'test' }).configured, false);
  assert.equal(enrollmentReadiness({ ...process.env, AZURE_PERSONAL_VOICE_COMPANY_NAME: '' }).configured, true);
  assert.equal(enrollmentReadiness({ ...process.env, AZURE_SPEECH_REGION: '127.0.0.1' }).configured, false);
  assert.equal(providerStatus('Succeeded'), 'ready');
  assert.throws(() => providerStatus('Unknown'), denied(502));
});

test('provider uses Azure resource and validates project/consent response', async () => {
  const client = createAzureClient({ endpoint: 'https://eastus.api.cognitive.microsoft.com', key: 'test', projectId: 'ApprovedProject', companyName: 'Example Co' }, async (url, init) => {
    assert.match(String(url), /^https:\/\/eastus\.api\.cognitive\.microsoft\.com\/customvoice\/consents\/cos-id\?api-version=2026-01-01$/);
    assert.equal(init?.method, 'POST'); assert.equal((init?.headers as Record<string, string>)['Ocp-Apim-Subscription-Key'], 'test');
    assert.equal((init?.body as FormData).get('projectId'), 'ApprovedProject');
    assert.equal((init?.body as FormData).get('companyName'), 'Speaker Business');
    return Response.json({ id: 'cos-id', projectId: 'ApprovedProject', status: 'NotStarted' });
  });
  assert.equal((await client.createConsent('cos-id', 'Speaker Name', 'Speaker Business', 'en-US', wav(5))).status, 'NotStarted');
  const mismatched = createAzureClient({ endpoint: 'https://eastus.api.cognitive.microsoft.com', key: 'test', projectId: 'ApprovedProject', companyName: 'Example Co' }, async () => Response.json({ id: 'wrong', projectId: 'ApprovedProject', status: 'Succeeded' }));
  await assert.rejects(mismatched.getConsent('cos-id'), denied(502));
});

test('tenant and owner scope, async profile lifecycle, and revocation fence', async () => {
  const person = await owner('clone-one'), stranger = await owner('clone-two');
  const calls: string[] = []; let consentStatus = 'NotStarted'; let profileStatus = 'Running';
  const mock = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, method = init?.method || 'GET'; calls.push(`${method} ${path}`);
    if (path === '/cognitiveservices/v1') {
      assert.match(String(init?.body), /&lt;test&gt; &amp; verify/);
      assert.match(String(init?.body), /speakerProfileId="3059912f-a3dc-49e3-bdd0-02e449df1fe3"/);
      assert.equal((init?.headers as Record<string, string>)['X-Microsoft-OutputFormat'], 'riff-24khz-16bit-mono-pcm');
      return new Response(new Uint8Array(wav(5)));
    }
    const id = path.split('/').at(-1)!;
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (path.includes('/consents/')) return Response.json({ id, projectId: 'ApprovedProject', status: consentStatus });
    return Response.json({ id, projectId: 'ApprovedProject', consentId: id.replace('cos-voice-', 'cos-consent-'), status: profileStatus, speakerProfileId: '3059912f-a3dc-49e3-bdd0-02e449df1fe3' });
  };
  const submitted = await enrollClone(person, form(), mock as typeof fetch);
  assert.equal(submitted.status, 'consent_pending');
  assert.equal((await listClones(stranger)).clones.length, 0);
  await assert.rejects(refreshClone(stranger, submitted.id, mock as typeof fetch), denied(404));
  await assert.rejects(revokeClone(stranger, submitted.id, mock as typeof fetch), denied(404));
  assert.equal((await refreshClone(person, submitted.id, mock as typeof fetch)).status, 'consent_pending');
  consentStatus = 'Succeeded'; assert.equal((await refreshClone(person, submitted.id, mock as typeof fetch)).status, 'profile_pending');
  profileStatus = 'Succeeded'; assert.equal((await refreshClone(person, submitted.id, mock as typeof fetch)).status, 'ready');
  await assert.rejects(previewClone(stranger, submitted.id, 'Hello', mock as typeof fetch), denied(404));
  assert.equal((await previewClone(person, submitted.id, '<test> & verify', mock as typeof fetch)).length, wav(5).length);
  assert.equal((await revokeClone(person, submitted.id, mock as typeof fetch)).status, 'revoked');
  assert.equal((await refreshClone(person, submitted.id, mock as typeof fetch)).status, 'revoked');
  await assert.rejects(previewClone(person, submitted.id, 'Hello', mock as typeof fetch), denied(409));
  assert.ok(calls.some(call => call.startsWith('DELETE /customvoice/personalvoices/')));
  assert.ok(calls.some(call => call.startsWith('DELETE /customvoice/consents/')));
});

test('ambiguous consent response never automatically starts another paid enrollment', async () => {
  const person = await owner('clone-uncertain'); let count = 0;
  const mock = async () => { count++; throw new Error('network dropped after submission'); };
  await assert.rejects(enrollClone(person, form(), mock as typeof fetch), denied(503));
  const [record] = (await listClones(person)).clones;
  assert.equal(record.status, 'reconcile_required');
  await refreshClone(person, record.id, mock as typeof fetch);
  assert.equal(count, 1);
  assert.equal((await revokeClone(person, record.id, async () => new Response(null, { status: 204 }))).status, 'revoked');
});

test('refresh route is a same-origin POST; GET is read-only and provider failure still erases local WAVs', async () => {
  const credentials = await authenticate({ mode: 'register', email: 'clone-route@example.test', password: 'correct password' }, request());
  const person = credentials.user;
  const mock = async (url: string | URL | Request, init?: RequestInit) => {
    const id = new URL(String(url)).pathname.split('/').at(-1)!;
    if (init?.method === 'DELETE') return new Response(null, { status: 503 });
    return Response.json({ id, projectId: 'ApprovedProject', status: 'NotStarted' });
  };
  const enrollment = await enrollClone(person, form(), mock as typeof fetch);
  const context = { params: Promise.resolve({ id: enrollment.id }) };
  const local = new Request('http://localhost/api/voice/clones/' + enrollment.id, { headers: { cookie: credentials.cookie, origin: 'http://localhost' } });
  assert.equal((await statusRoute(local, context)).status, 200);
  assert.equal((await getClone(person, enrollment.id)).status, 'consent_pending');
  const foreign = new Request(local.url, { method: 'POST', headers: { cookie: credentials.cookie, origin: 'https://elsewhere.example' } });
  assert.equal((await refreshRoute(foreign, context)).status, 403);
  const noSession = new Request(local.url, { method: 'POST', headers: { origin: 'http://localhost' } });
  assert.equal((await refreshRoute(noSession, context)).status, 401);
  await assert.rejects(revokeClone(person, enrollment.id, mock as typeof fetch), denied(503));
  assert.equal((await getClone(person, enrollment.id)).status, 'revocation_pending');
  const path = resolve(process.cwd(), 'data', 'voice-clones', person.organizationId, enrollment.id, 'consent.wav');
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  assert.equal((await revokeClone(person, enrollment.id, async () => new Response(null, { status: 204 }))).status, 'revoked');
});
