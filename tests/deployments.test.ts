import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRecord, updateRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import type { AuthUser } from '../lib/server/auth';
import { db, WriteConflictError } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { PUBLICATION_ACKNOWLEDGEMENT, type Deployment } from '../lib/deployments/contracts';
import { createDeployment, changeDeploymentStatus, issuePublicSession, resolvePublicSession, getPublicDeployment, getPublicFrameOrigins, closePublicSession, normalizePublicOrigin, resolveDeployment, resolveDeploymentForConnection, deploymentTurnStatements } from '../lib/deployments/engine';
process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.PUBLIC_SESSION_HASH_SECRET = 'fictional-public-session-test-secret-only';
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional-resource.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'fictional-key-never-used';
const origin = 'https://public.example.test';
async function fixture(overrides: Record<string, unknown> = {}) {
  const user: AuthUser = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, time = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional company', time] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, time] },
    ...ownerRegistrationStatements(user),
  ]);
  const source = await createRecord(user, 'brain_source', { title: 'Public facts', content: 'Public office hours are 9 to 5.', sourceLabel: 'Approved company page', approvedAt: time }, 'approved');
  const privateSource = await createRecord(user, 'brain_source', { title: 'Private manual source', content: 'PRIVATE_KNOWLEDGE_SENTINEL', sourceLabel: 'Private', approvedAt: time }, 'approved');
  await createRecord(user, 'customer_profile', { name: 'PRIVATE_CUSTOMER_SENTINEL' }, 'active');
  await createRecord(user, 'group_capsule', { content: 'PRIVATE_GROUP_SENTINEL' }, 'approved');
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Helpful agent', role: 'Company support', objective: 'Explain approved company information clearly.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'approved_contact', escalation: 'Offer a human handoff if unsure.', knowledgeIds: [source.id, privateSource.id], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Public support', agentId: agent.id, versionId: version.id, releaseId: release.id, channel: 'web_chat', publicKnowledgeIds: [source.id], brand: { name: 'Public brand', welcomeMessage: 'Ask about our company.' }, allowedOrigins: [origin], limits: { enabled: true }, ...overrides });
  const publish = () => changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  return { user, source, privateSource, agent, version, release, draft, publish };
}
test('explicit publication acknowledgement, approved subset and anonymous company-only context', async () => {
  const f = await fixture();
  await assert.rejects(changeDeploymentStatus(f.user, { deploymentId: f.draft.id, revision: 1, action: 'publish' }), /Acknowledge/);
  await f.publish();
  const issued = await issuePublicSession(f.draft.data.publicId, { origin, ipAddress: '192.0.2.1' });
  const resolved = await resolvePublicSession(issued.token, { origin });
  assert.deepEqual(resolved.config.knowledgeIds, [f.source.id]);
  assert.equal(resolved.config.memoryScope, 'none'); assert.deepEqual(resolved.config.enabledTools, []);
  assert.match(resolved.context, /Public office hours/);
  assert.doesNotMatch(resolved.context, /PRIVATE_|Private manual source/);
  const publicView = await getPublicDeployment(f.draft.data.publicId, origin);
  assert.equal('config' in publicView, false); assert.equal('ownerUserId' in publicView, false);
  const stored = await (await db()).all('SELECT kind,data FROM entities WHERE organization_id = ?', [f.user.organizationId]);
  assert.ok(!JSON.stringify(stored).includes(issued.token)); assert.ok(!JSON.stringify(stored).includes(issued.nonce)); assert.ok(!JSON.stringify(stored).includes('192.0.2.1'));
  assert.ok(!(await listRecords(f.user.organizationId)).some(row => row.kind.includes('session')));
});
test('forged capabilities, origins, purpose confusion, used nonces and used request IDs fail closed', async () => {
  const f = await fixture(); await f.publish();
  await assert.rejects(issuePublicSession(f.draft.data.publicId, { origin: 'https://evil.example.test' }), /origin/);
  await assert.rejects(issuePublicSession(f.draft.data.publicId, { origin, purpose: 'voice' }), /purpose/);
  const input = { origin, requestId: randomUUID(), purpose: 'chat' as const };
  const issued = await issuePublicSession(f.draft.data.publicId, input);
  await assert.rejects(issuePublicSession(f.draft.data.publicId, input), /already issued/);
  await assert.rejects(resolvePublicSession('x'.repeat(43), { origin }), /invalid/);
  await assert.rejects(resolvePublicSession(issued.token, { origin: 'https://evil.example.test' }), /origin/);
  await assert.rejects(resolvePublicSession(issued.token, { origin, purpose: 'voice' }), /purpose/);
  const first = await resolvePublicSession(issued.token, { origin, consume: true, nonce: issued.nonce });
  assert.ok(first.nextNonce);
  await assert.rejects(resolvePublicSession(issued.token, { origin, consume: true, nonce: issued.nonce }), /nonce/);
});
test('daily, conversation, concurrency and per-network issuance caps are durable', async () => {
  const f = await fixture({ limits: { enabled: true, maxSessionsPerDay: 1, maxTurnsPerConversation: 1, maxConcurrentSessions: 1 } }); await f.publish();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => issuePublicSession(f.draft.data.publicId, { origin })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const issued = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof issuePublicSession>>>).value;
  const turn = await resolvePublicSession(issued.token, { origin, consume: true, nonce: issued.nonce });
  await assert.rejects(resolvePublicSession(issued.token, { origin, consume: true, nonce: turn.nextNonce }), /turn limit/);
  await closePublicSession(issued.token, origin);
  await assert.rejects(resolvePublicSession(issued.token, { origin }), /expired/);
  await assert.rejects(issuePublicSession(f.draft.data.publicId, { origin }), /limit/);
  const g = await fixture({ limits: { enabled: true, maxSessionsPerIpHour: 1 } }); await g.publish();
  const a = await issuePublicSession(g.draft.data.publicId, { origin, ipAddress: '192.0.2.3' }); await closePublicSession(a.token, origin);
  await assert.rejects(issuePublicSession(g.draft.data.publicId, { origin, ipAddress: '192.0.2.3' }), /limit/);
});
test('expired, paused and stopped sessions lose authority immediately', async () => {
  const f = await fixture(); const published = await f.publish();
  const issued = await issuePublicSession(f.draft.data.publicId, { origin });
  await changeDeploymentStatus(f.user, { deploymentId: published.id, revision: published.revision, action: 'pause' });
  await assert.rejects(resolvePublicSession(issued.token, { origin }), /paused/);
  const g = await fixture(); const gp = await g.publish(); const gi = await issuePublicSession(g.draft.data.publicId, { origin });
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [gi.sessionId]);
  await (await db()).run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(row.data)), expiresAt: '2000-01-01T00:00:00.000Z' }), gi.sessionId]);
  await assert.rejects(resolvePublicSession(gi.token, { origin }), /expired/);
  const stopped = await changeDeploymentStatus(g.user, { deploymentId: gp.id, revision: gp.revision, action: 'stop' });
  await assert.rejects(changeDeploymentStatus(g.user, { deploymentId: stopped.id, revision: stopped.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT }), /permanently stopped/);
});
test('fresh source and release fences reject superseded context, including racing changes', async () => {
  const f = await fixture(); await f.publish();
  const issued = await issuePublicSession(f.draft.data.publicId, { origin });
  const auth = await resolveDeployment(f.user, f.draft.id);
  await updateRecord(f.user, f.source, { ...f.source.data, content: 'Changed office hours.' });
  await assert.rejects((await db()).batch(auth.fences), WriteConflictError);
  await assert.rejects(resolvePublicSession(issued.token, { origin }), /source changed/);
  const g = await fixture(); await g.publish(); const gi = await issuePublicSession(g.draft.data.publicId, { origin });
  await handleAgentAction(g.user, 'release.stop', { releaseId: g.release.id, revision: g.release.revision });
  await assert.rejects(resolvePublicSession(gi.token, { origin }), /no longer active/);
});
test('publisher membership withdrawal fences dispatch and cannot revive old authority after restoration', async () => {
  const f = await fixture(); await f.publish(); const issued = await issuePublicSession(f.draft.data.publicId, { origin });
  const auth = await resolveDeployment(f.user, f.draft.id);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [`team:member:${f.user.id}`]);
  const member = JSON.parse(String(row.data));
  await (await db()).run('UPDATE entities SET status = ?,data = ? WHERE id = ?', ['revoked', JSON.stringify({ ...member, status: 'revoked', authorizationVersion: randomUUID() }), `team:member:${f.user.id}`]);
  await assert.rejects((await db()).batch(auth.fences), WriteConflictError);
  await assert.rejects(resolvePublicSession(issued.token, { origin }), /removed/);
  await (await db()).run('UPDATE entities SET status = ?,data = ? WHERE id = ?', ['active', JSON.stringify({ ...member, authorizationVersion: randomUUID() }), `team:member:${f.user.id}`]);
  await assert.rejects(resolvePublicSession(issued.token, { origin }), /publisher authority changed/);
});
test('cross-tenant source references and deployment resolution are rejected', async () => {
  const f = await fixture(), g = await fixture();
  const forged = await createDeployment(f.user, { ...f.draft.data, name: 'Bad subset', publicKnowledgeIds: [g.source.id] });
  await assert.rejects(changeDeploymentStatus(f.user, { deploymentId: forged.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT }), /selected from/);
  await assert.rejects(resolveDeployment(g.user, f.draft.id), /not found/);
});
test('channel generation budget uses event replay guard and transactional conversation cap', async () => {
  const f = await fixture({ limits: { enabled: true, maxTurnsPerConversation: 1 } }); await f.publish();
  const auth = await resolveDeployment(f.user, f.draft.id), input = { conversationKey: 'fictional-conversation', eventId: 'event-1' };
  const budget = await deploymentTurnStatements(auth, input);
  await (await db()).batch([...auth.fences, ...budget]);
  await assert.rejects(deploymentTurnStatements(auth, input), /already reserved/);
  await assert.rejects(deploymentTurnStatements(auth, { ...input, eventId: 'event-2' }), /limit/);
});
test('origins reject wildcard, paths, nonlocal plaintext and credentials', () => {
  for (const value of ['*', 'https://*', 'https://*.example.test', 'https://example.test;frame-ancestors', 'https://example.test\n', 'https://exa mple.test', 'https://-invalid.test', 'https://invalid_.test', 'https://example.test/', 'https://example.test/path', 'http://example.test', 'https://user@example.test']) assert.throws(() => normalizePublicOrigin(value));
  assert.equal(normalizePublicOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(normalizePublicOrigin('http://[::1]:3000'), 'http://[::1]:3000');
  assert.equal(normalizePublicOrigin('https://xn--bcher-kva.example'), 'https://xn--bcher-kva.example');
  assert.equal(normalizePublicOrigin('https://192.0.2.1'), 'https://192.0.2.1');
});
test('channel deployments pin verified identity and authorization, including credential replacement races', async () => {
  for (const channel of ['telegram', 'whatsapp'] as const) {
    const f = await fixture(), connectionId = randomUUID(), authorizationVersion = randomUUID(), identity = '123456789';
    const connection = { id: connectionId, integrationId: channel === 'telegram' ? 'telegram' : 'whatsapp_cloud', authorizationVersion, settings: channel === 'telegram' ? { botId: identity } : { phoneNumberId: identity }, status: 'connected' };
    await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [connectionId, f.user.organizationId, 'integration:vault', 'connected', JSON.stringify(connection), new Date().toISOString()]);
    const draft = await createDeployment(f.user, { ...f.draft.data, channel, allowedOrigins: [], allowUnknownInbound: false });
    await changeDeploymentStatus(f.user, { deploymentId: draft.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
    const input = { channel, connectionId, authorizationVersion, identity };
    const resolved = await resolveDeploymentForConnection(f.user, input);
    assert.equal(resolved.deployment.data.allowUnknownInbound, false);
    await assert.rejects(resolveDeploymentForConnection(f.user, { ...input, identity: '999999999' }), /identity/);
    await (await db()).run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...connection, authorizationVersion: randomUUID() }), connectionId]);
    await assert.rejects((await db()).batch(resolved.fences), WriteConflictError);
    await assert.rejects(resolveDeploymentForConnection(f.user, input), /authorization changed/);
  }
});
test('operator and viewer cannot create or publish public deployments; disabled defaults cannot issue', async () => {
  const f = await fixture();
  const disabled = await createDeployment(f.user, { ...f.draft.data, limits: undefined });
  await changeDeploymentStatus(f.user, { deploymentId: disabled.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await assert.rejects(issuePublicSession(disabled.data.publicId, { origin }), /unavailable/);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [`team:member:${f.user.id}`]);
  for (const role of ['operator', 'viewer']) {
    await (await db()).run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(row.data)), role }), `team:member:${f.user.id}`]);
    await assert.rejects(createDeployment(f.user, { ...f.draft.data }), /role/);
    await assert.rejects(changeDeploymentStatus(f.user, { deploymentId: f.draft.id, revision: 1, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT }), /role/);
  }
});
test('application origin supports standalone and embedded sessions without expanding allowed frame parents', async () => {
  const oldAppUrl = process.env.APP_URL;
  process.env.APP_URL = 'https://app.example.test/workspace';
  try {
    const f = await fixture(); const published = await f.publish();
    assert.deepEqual(await getPublicFrameOrigins(f.draft.data.publicId), [origin]);
    const appOrigin = 'https://app.example.test';
    assert.equal((await getPublicDeployment(f.draft.data.publicId, appOrigin)).publicId, f.draft.data.publicId);
    const appSession = await issuePublicSession(f.draft.data.publicId, { origin: appOrigin });
    assert.equal((await resolvePublicSession(appSession.token, { origin: appOrigin })).deployment.id, f.draft.id);
    const embeddedSession = await issuePublicSession(f.draft.data.publicId, { origin });
    assert.equal((await resolvePublicSession(embeddedSession.token, { origin })).deployment.id, f.draft.id);
    // Both origins are authorized callers, but an issued capability remains bound to one exact origin.
    await assert.rejects(resolvePublicSession(appSession.token, { origin }), /origin/);
    await assert.rejects(getPublicDeployment(f.draft.data.publicId, 'https://foreign.example.test'), /origin/);
    await assert.rejects(issuePublicSession(f.draft.data.publicId, { origin: 'https://foreign.example.test' }), /origin/);
    await changeDeploymentStatus(f.user, { deploymentId: published.id, revision: published.revision, action: 'pause' });
    await assert.rejects(getPublicFrameOrigins(f.draft.data.publicId), /paused/);
  } finally { if (oldAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = oldAppUrl; }
});
test('republishing releases invalid revision slots without resetting daily budget; revoked capabilities can only clean up', async () => {
  const f = await fixture({ limits: { enabled: true, maxConcurrentSessions: 1, maxSessionsPerDay: 2 } });
  const published = await f.publish(), first = await issuePublicSession(f.draft.data.publicId, { origin });
  const paused = await changeDeploymentStatus(f.user, { deploymentId: published.id, revision: published.revision, action: 'pause' });
  await changeDeploymentStatus(f.user, { deploymentId: paused.id, revision: paused.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await assert.rejects(resolvePublicSession(first.token, { origin }), /Deployment changed/);
  const second = await issuePublicSession(f.draft.data.publicId, { origin });
  await assert.rejects(closePublicSession(first.token, 'https://foreign.example.test'), /origin/);
  await closePublicSession(first.token, origin);
  await closePublicSession(first.token, origin); // Cleanup is idempotent.
  assert.equal((await resolvePublicSession(second.token, { origin })).deployment.id, f.draft.id);
  await closePublicSession(second.token, origin);
  await assert.rejects(issuePublicSession(f.draft.data.publicId, { origin }), /limit/);
  const g = await fixture(); const gp = await g.publish(), stale = await issuePublicSession(g.draft.data.publicId, { origin });
  await changeDeploymentStatus(g.user, { deploymentId: gp.id, revision: gp.revision, action: 'stop' });
  await closePublicSession(stale.token, origin);
  await assert.rejects(resolvePublicSession(stale.token, { origin }), /expired/);
});
test('automatic learning is a strict owner opt-in frozen in the deployment snapshot', async () => {
  const f = await fixture();
  assert.equal(f.draft.data.autoLearning, false);
  for (const value of ['true', 'false', 1, 0, null, {}, []]) {
    await assert.rejects(createDeployment(f.user, { ...f.draft.data, autoLearning: value }), /explicitly enabled or disabled/);
  }
  const optedIn = await createDeployment(f.user, { ...f.draft.data, autoLearning: true });
  assert.equal(optedIn.data.autoLearning, true);
  const published = await changeDeploymentStatus(f.user, { deploymentId: optedIn.id, revision: optedIn.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  assert.equal(published.data.autoLearning, true);
  assert.equal((await resolveDeployment(f.user, published.id)).deployment.data.autoLearning, true);
  assert.equal('autoLearning' in await getPublicDeployment(published.data.publicId, origin), false);
  const paused = await changeDeploymentStatus(f.user, { deploymentId: published.id, revision: published.revision, action: 'pause' });
  assert.equal(paused.data.autoLearning, true);
  assert.equal((await listRecords<Deployment>(f.user.organizationId, 'agent_deployment')).find(d => d.id === f.draft.id)?.data.autoLearning, false);
});
