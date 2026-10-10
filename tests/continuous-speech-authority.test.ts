import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { db, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createRecord } from '../lib/platform/records';
import { createContact } from '../lib/server/store';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { issueContinuousSpeechGrant, claimContinuousSpeechTicket, recheckContinuousSpeechAuthority, closeContinuousSpeechAuthority, endContinuousSpeechGrant, continuousSpeechConfiguration, type ContinuousSpeechDependencies, type ContinuousSpeechAuthority } from '../lib/voice/continuous-speech-authority';
import { POST, DELETE } from '../app/api/voice/perception/route';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
const origin = 'http://localhost:3000';
const env = { NODE_ENV: 'test', CONTINUOUS_SPEECH_GATEWAY_URL: 'wss://speech.example.test/private-speech', AZURE_SPEECH_KEY: 'synthetic-key', AZURE_SPEECH_REGION: 'eastus2' };
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
async function fixture(options: { user?: AuthUser; release?: boolean; contact?: boolean; data?: Record<string, unknown> } = {}) {
  const auth = options.user ? undefined : await authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password: 'synthetic strong password' }, new Request(`${origin}/api/auth`));
  const user = options.user ?? auth!.user;
  const contact = options.contact ? await createContact(user, { name: 'Synthetic customer' }) : undefined;
  if (contact) await handleCustomerAction(user, 'customer.consent', { contactId: contact.id, channel: 'browser_voice', granted: true, evidence: 'Synthetic authorized fixture' });
  const release = options.release ? await createRecord(user, 'release', { agentId: 'agent', versionId: 'version', channel: 'browser' }, 'active') : undefined;
  const call = await createRecord(user, release ? 'voice_connection' : 'voice_preview', {
    requestedBy: user.id, provider: 'azure', inputMode: 'microphone', mode: release ? 'released_browser_call' : 'internal_draft_test',
    config: { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'] }, contextDigest: 'synthetic-context',
    ...(release ? { agentId: 'agent', versionId: 'version', releaseId: release.id } : {}), ...(contact ? { contactId: contact.id } : {}),
    toolAuthority: { version: 1, contextMode: 'internal_operator_browser', contextDigest: 'synthetic-context', enabledTools: [], contactId: contact?.id, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }, ...options.data,
  }, 'connection_issued');
  return { user, auth, call, release, contact, body: { ...(release ? { connectionId: call.id } : { previewId: call.id }), consent: true }, deps: { env } satisfies ContinuousSpeechDependencies };
}
async function alter(id: string, update: (data: Record<string, any>) => Record<string, any>, status?: string) {
  const database = await db(), [record] = await database.all('SELECT data,status FROM entities WHERE id = ?', [id]);
  await database.run('UPDATE entities SET data = ?, status = ? WHERE id = ?', [JSON.stringify(update(JSON.parse(String(record.data)))), status ?? String(record.status), id]);
}
test('configuration accepts only fixed secure gateway or explicit local gateway', () => {
  assert.equal(continuousSpeechConfiguration(env).configured, true);
  for (const url of ['http://speech.example.test/private-speech', 'wss://speech.example.test/public', 'wss://speech.example.test/private-speech?token=x', 'wss://u:p@speech.example.test/private-speech', 'ws://localhost:9000/private-speech']) assert.equal(continuousSpeechConfiguration({ ...env, CONTINUOUS_SPEECH_GATEWAY_URL: url }).configured, false);
  assert.equal(continuousSpeechConfiguration({ ...env, AZURE_SPEECH_KEY: '' }).configured, false);
  assert.equal(continuousSpeechConfiguration({ ...env, AZURE_SPEECH_REGION: 'http://host' }).configured, false);
  assert.equal(continuousSpeechConfiguration({ ...env, NODE_ENV: 'production', CONTINUOUS_SPEECH_ALLOW_LOCAL_WS: 'true', CONTINUOUS_SPEECH_GATEWAY_URL: 'ws://localhost:9000/private-speech' }).configured, true);
});
test('grant binds issued microphone snapshot; caller provider/language/URL cannot widen it', async () => {
  const f = await fixture();
  const grant = await issueContinuousSpeechGrant(f.user, { ...f.body, provider: 'gemini', language: 'fr-FR', url: 'wss://attacker.test' }, origin, f.deps);
  assert.equal(grant.language, 'en-IN'); assert.deepEqual(grant.recognitionLanguages, ['en-IN', 'hi-IN']); assert.equal(grant.url, env.CONTINUOUS_SPEECH_GATEWAY_URL);
  assert.equal(grant.pcm.sampleRate, 16000); assert.ok(grant.maxDurationSeconds <= 600);
  const database = await db(), records = await database.all('SELECT data FROM entities WHERE organization_id = ?', [f.user.organizationId]);
  assert.ok(!JSON.stringify(records).includes(grant.ticket)); assert.ok(!JSON.stringify(records).includes(env.AZURE_SPEECH_KEY));
  const authority = await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
  assert.equal(authority.userId, f.user.id); assert.equal(authority.callId, f.call.id);
  await recheckContinuousSpeechAuthority(authority, f.deps); // No enabled tool required.
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, origin, f.deps), bad(410));
  await assert.rejects(issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), bad(409));
  await closeContinuousSpeechAuthority(authority, { reason: 'provider payload secret', audioBytes: 640, durationMs: 20, hypotheses: 1, transcript: 'never persist' } as any, f.deps);
  const [stored] = await database.all('SELECT data FROM entities WHERE id = ?', [authority.id]);
  assert.ok(!String(stored.data).includes('never persist')); assert.ok(!String(stored.data).includes('provider payload secret'));
  await assert.rejects(recheckContinuousSpeechAuthority(authority, f.deps), bad(403));
  await assert.rejects(issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), bad(409));
});
test('foreign tenant, foreign requester, missing consent and ambiguous reference are rejected', async () => {
  const f = await fixture(), foreign = await fixture();
  await assert.rejects(issueContinuousSpeechGrant(foreign.user, f.body, origin, f.deps), bad(404));
  const wrong = await fixture({ user: f.user, data: { requestedBy: 'someone-else' } });
  await assert.rejects(issueContinuousSpeechGrant(f.user, wrong.body, origin, f.deps), bad(403));
  await assert.rejects(issueContinuousSpeechGrant(f.user, { ...f.body, consent: false }, origin, f.deps), bad(400));
  await assert.rejects(issueContinuousSpeechGrant(f.user, { ...f.body, connectionId: f.call.id }, origin, f.deps), bad(400));
});
test('typed, non-Azure, public-mode and unsupported-language calls cannot mint', async () => {
  for (const data of [{ inputMode: 'text' }, { provider: 'gemini' }, { mode: 'public_browser' }, { toolEndedAt: new Date().toISOString() }]) {
    const f = await fixture({ data }); await assert.rejects(issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), bad(403));
  }
  const unsupported = await fixture({ data: { config: { primaryLanguage: 'French', allowedLanguages: ['English'] } } });
  await assert.rejects(issueContinuousSpeechGrant(unsupported.user, unsupported.body, origin, unsupported.deps), bad(422));
  const mixed = await fixture({ data: { config: { primaryLanguage: 'Hinglish', allowedLanguages: ['Hinglish'] } } });
  assert.deepEqual((await issueContinuousSpeechGrant(mixed.user, mixed.body, origin, mixed.deps)).recognitionLanguages, ['en-IN', 'hi-IN']);
});
test('exact origin and explicit-local browser transport are enforced', async () => {
  const f = await fixture(), grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps);
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, 'http://localhost:3001', f.deps), bad(403));
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, 'null', f.deps), bad(403));
  await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
  const local = await fixture();
  const deps = { env: { ...env, NODE_ENV: 'production', APP_URL: origin, INFERENCE_ALLOW_LOCAL: 'true', CONTINUOUS_SPEECH_ALLOW_LOCAL_WS: 'true', CONTINUOUS_SPEECH_GATEWAY_URL: 'ws://localhost:9000/private-speech' } };
  await assert.rejects(issueContinuousSpeechGrant(local.user, local.body, 'https://remote.example.test', deps), bad(403));
  assert.ok((await issueContinuousSpeechGrant(local.user, local.body, origin, deps)).ticket);
});
test('claim expires within 60 seconds and lifetime never extends call-created limit or tool expiry', async () => {
  const f = await fixture(), created = Date.parse(f.call.createdAt);
  const grant = await issueContinuousSpeechGrant(f.user, f.body, origin, { ...f.deps, now: () => created + 599_000 });
  assert.equal(grant.maxDurationSeconds, 1); assert.equal(Date.parse(grant.expiresAt), created + 600_000);
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, origin, { ...f.deps, now: () => created + 600_000 }), bad(410));
  const g = await fixture(), issuedAt = Date.parse(g.call.createdAt);
  const short = await issueContinuousSpeechGrant(g.user, g.body, origin, { ...g.deps, now: () => issuedAt });
  await assert.rejects(claimContinuousSpeechTicket(short.ticket, origin, { ...g.deps, now: () => issuedAt + 60_001 }), bad(410));
  const h = await fixture(); await alter(h.call.id, stored => ({ ...stored, data: { ...stored.data, toolAuthority: { ...stored.data.toolAuthority, expiresAt: new Date(Date.parse(h.call.createdAt) + 5000).toISOString() } } }));
  assert.equal((await issueContinuousSpeechGrant(h.user, h.body, origin, { ...h.deps, now: () => Date.parse(h.call.createdAt) })).maxDurationSeconds, 5);
});
test('concurrent issues and claims have exactly one winner', async () => {
  const f = await fixture();
  const issued = await Promise.allSettled([issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), issueContinuousSpeechGrant(f.user, f.body, origin, f.deps)]);
  assert.equal(issued.filter(r => r.status === 'fulfilled').length, 1);
  const grant = (issued.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof issueContinuousSpeechGrant>>>).value;
  const claimed = await Promise.allSettled([claimContinuousSpeechTicket(grant.ticket, origin, f.deps), claimContinuousSpeechTicket(grant.ticket, origin, f.deps)]);
  assert.equal(claimed.filter(r => r.status === 'fulfilled').length, 1);
});
test('durable per-user lease rejects simultaneous different calls, then permits another after close', async () => {
  const f = await fixture(), g = await fixture({ user: f.user });
  const a = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), b = await issueContinuousSpeechGrant(g.user, g.body, origin, g.deps);
  const results = await Promise.allSettled([claimContinuousSpeechTicket(a.ticket, origin, f.deps), claimContinuousSpeechTicket(b.ticket, origin, g.deps)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const index = results.findIndex(r => r.status === 'fulfilled'), authority = (results[index] as PromiseFulfilledResult<Awaited<ReturnType<typeof claimContinuousSpeechTicket>>>).value;
  await closeContinuousSpeechAuthority(authority, {}, f.deps);
  await claimContinuousSpeechTicket(index === 0 ? b.ticket : a.ticket, origin, f.deps);
});
test('call stop, release revocation, role demotion and consent revoke invalidate active authority', async () => {
  for (const scenario of ['call', 'release', 'role', 'consent', 'account']) {
    const f = await fixture({ release: scenario === 'release', contact: scenario === 'consent' });
    const grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), authority = await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
    if (scenario === 'call') await alter(f.call.id, value => ({ ...value, data: { ...value.data, toolEndedAt: new Date().toISOString() } }));
    if (scenario === 'release') await alter(f.release!.id, value => value, 'stopped');
    if (scenario === 'role') await alter(`team:member:${f.user.id}`, value => ({ ...value, role: 'viewer' }));
    if (scenario === 'account') await alter(`auth:account:${f.user.id}`, value => ({ ...value, required: true, verifiedAt: null }));
    if (scenario === 'consent') await handleCustomerAction(f.user, 'customer.consent', { contactId: f.contact!.id, revision: 1, channel: 'browser_voice', granted: false, evidence: 'Synthetic revocation' });
    await assert.rejects(recheckContinuousSpeechAuthority(authority, f.deps), bad(403));
    await closeContinuousSpeechAuthority(authority, { reason: 'authentication' }, f.deps);
  }
});
test('membership CAS rejects a role revocation racing issue or claim transaction', async () => {
  for (const phase of ['issue', 'claim']) {
    const f = await fixture(), database = await db();
    const grant = phase === 'claim' ? await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps) : undefined;
    let fired = false;
    const racing: Database = { all: database.all.bind(database), run: database.run.bind(database), async batch(statements) {
      if (!fired) { fired = true; await alter(`team:member:${f.user.id}`, value => ({ ...value, role: 'viewer' })); }
      await database.batch(statements);
    } };
    const deps = { ...f.deps, database: racing };
    await assert.rejects(phase === 'issue' ? issueContinuousSpeechGrant(f.user, f.body, origin, deps) : claimContinuousSpeechTicket(grant!.ticket, origin, deps), bad(409));
  }
});
test('browser abort revokes unclaimed ticket without remint or replay', async () => {
  const f = await fixture(), grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps);
  await endContinuousSpeechGrant(f.user, f.body, origin, f.deps);
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, origin, f.deps), bad(410));
  await assert.rejects(issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), bad(409));
});
test('simultaneous browser abort and gateway close are idempotent and release the lease', async () => {
  const f = await fixture(), grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps);
  const authority = await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
  await Promise.all([endContinuousSpeechGrant(f.user, f.body, origin, f.deps), closeContinuousSpeechAuthority(authority, {}, f.deps)]);
  const next = await fixture({ user: f.user }), nextGrant = await issueContinuousSpeechGrant(next.user, next.body, origin, next.deps);
  await claimContinuousSpeechTicket(nextGrant.ticket, origin, next.deps);
});
test('browser abort retries when claim wins its close CAS and closes the new lease', async () => {
  const f = await fixture(), grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), database = await db();
  let claimed: ContinuousSpeechAuthority | undefined, closeAttempts = 0;
  const racing: Database = { all: database.all.bind(database), run: database.run.bind(database), async batch(statements) {
    if (statements.some(statement => statement.params?.[0] === 'closed')) {
      closeAttempts++;
      if (!claimed) claimed = await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
    }
    await database.batch(statements);
  } };
  await endContinuousSpeechGrant(f.user, f.body, origin, { ...f.deps, database: racing });
  assert.equal(closeAttempts, 2);
  assert.ok(claimed);
  await assert.rejects(recheckContinuousSpeechAuthority(claimed, f.deps), bad(403));
  await assert.rejects(claimContinuousSpeechTicket(grant.ticket, origin, f.deps), bad(410));
  const [lease] = await database.all('SELECT status FROM entities WHERE id = ?', [claimed.concurrencyKey]);
  assert.equal(lease.status, 'closed');
  const next = await fixture({ user: f.user }), nextGrant = await issueContinuousSpeechGrant(next.user, next.body, origin, next.deps);
  await claimContinuousSpeechTicket(nextGrant.ticket, origin, next.deps);
});
test('close CAS retry never closes a replacement session epoch', async () => {
  const f = await fixture(), grant = await issueContinuousSpeechGrant(f.user, f.body, origin, f.deps), database = await db();
  const authority = await claimContinuousSpeechTicket(grant.ticket, origin, f.deps);
  let fired = false;
  const replacementEpoch = randomUUID();
  const racing: Database = { all: database.all.bind(database), run: database.run.bind(database), async batch(statements) {
    if (!fired && statements.some(statement => statement.params?.[0] === 'closed')) {
      fired = true;
      await alter(authority.id, value => ({ ...value, sessionEpoch: replacementEpoch }));
    }
    await database.batch(statements);
  } };
  await assert.rejects(closeContinuousSpeechAuthority(authority, {}, { ...f.deps, database: racing }), bad(403));
  const [record] = await database.all('SELECT status,data FROM entities WHERE id = ?', [authority.id]);
  assert.equal(record.status, 'claimed'); assert.equal(JSON.parse(String(record.data)).sessionEpoch, replacementEpoch);
});
test('HTTP issue and abort require authenticated same-origin requests', async () => {
  const f = await fixture(); Object.assign(process.env, env, { APP_URL: origin, INFERENCE_ALLOW_LOCAL: 'true' });
  const request = (method: string, cookie = '', requestOrigin = origin) => new Request(`${origin}/api/voice/perception`, { method, headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(f.body) });
  assert.equal((await POST(request('POST'))).status, 401);
  assert.equal((await POST(request('POST', f.auth!.cookie, 'https://foreign.test'))).status, 403);
  assert.equal((await POST(request('POST', f.auth!.cookie))).status, 200);
  assert.equal((await DELETE(request('DELETE', f.auth!.cookie))).status, 200);
});
