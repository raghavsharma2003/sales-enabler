import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { HttpError } from '../lib/server/http';
import { handleAgentAction } from '../lib/platform/agents';
import { listRecords, type PlatformRecord } from '../lib/platform/records';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const request = () => new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } });
const config = (knowledgeIds: string[] = []) => ({ name: 'Guide', role: 'Customer advisor', objective: 'Help customers understand their options and arrange a confirmed next step.', disclosure: 'I am an AI assistant for this company.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Use clear language and acknowledge uncertainty.', memoryScope: 'approved_contact', escalation: 'Offer a human colleague whenever requested or uncertain.', knowledgeIds });
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const action = (user: AuthUser, name: string, body: Record<string, unknown>) => handleAgentAction(user, name, body) as Promise<PlatformRecord>;

test('agent versions, authority checks and releases stay scoped and gated', async () => {
  const alpha = (await authenticate({ mode: 'register', email: 'agent-alpha@example.test', password: 'correct password', organization: 'Alpha' }, request())).user;
  const beta = (await authenticate({ mode: 'register', email: 'agent-beta@example.test', password: 'correct password', organization: 'Beta' }, request())).user;
  const draftSource = await handleCustomerAction(alpha, 'brain.create', { title: 'Hours', content: 'We open on weekdays.', sourceLabel: 'Staff policy' }) as PlatformRecord;
  const source = await handleCustomerAction(alpha, 'brain.approve', { sourceId: draftSource.id, revision: draftSource.revision }) as PlatformRecord;
  await assert.rejects(action(beta, 'agent.create', config([source.id])), status(404));
  const agent = await action(alpha, 'agent.create', config([source.id]));
  await assert.rejects(action(beta, 'agent.version', { agentId: agent.id, revision: agent.revision }), status(404));
  const v1 = await action(alpha, 'agent.version', { agentId: agent.id, revision: agent.revision });
  await assert.rejects(action(alpha, 'agent.version', { agentId: agent.id, revision: agent.revision }), status(409));
  const run1 = await action(alpha, 'test.run', { versionId: v1.id });
  assert.equal(run1.data.passed, true);
  await assert.rejects(action(alpha, 'release.publish', { versionId: v1.id, testRunId: 'wrong', currentReleaseId: null }), status(404));
  const release1 = await action(alpha, 'release.publish', { versionId: v1.id, testRunId: run1.id, currentReleaseId: null });
  assert.equal(release1.status, 'active');
  await assert.rejects(action(alpha, 'release.publish', { versionId: v1.id, testRunId: run1.id, currentReleaseId: null }), status(409));
  await assert.rejects(action(beta, 'release.stop', { releaseId: release1.id, revision: release1.revision }), status(404));
  const edited = await action(alpha, 'agent.update', { ...config([source.id]), name: 'Guide revised', agentId: agent.id, revision: agent.revision });
  await assert.rejects(action(alpha, 'agent.update', { ...config(), agentId: agent.id, revision: agent.revision }), status(409));
  const v2 = await action(alpha, 'agent.version', { agentId: agent.id, revision: edited.revision });
  await assert.rejects(action(alpha, 'release.publish', { versionId: v2.id, testRunId: run1.id, currentReleaseId: release1.id }), status(409));
  const run2 = await action(alpha, 'test.run', { versionId: v2.id });
  const release2 = await action(alpha, 'release.publish', { versionId: v2.id, testRunId: run2.id, currentReleaseId: release1.id });
  assert.equal(release2.status, 'active');
  assert.equal((await listRecords(alpha.organizationId, 'release')).filter((r) => r.status === 'active').length, 1);
  const rollback = await action(alpha, 'release.rollback', { versionId: v1.id, testRunId: run1.id, currentReleaseId: release2.id });
  assert.equal(rollback.data.versionId, v1.id);
  assert.equal((await listRecords(alpha.organizationId, 'release')).filter((r) => r.status === 'active').length, 1);
  assert.equal((await listRecords(beta.organizationId, 'release')).length, 0);
  await handleCustomerAction(alpha, 'brain.revoke', { sourceId: source.id, revision: source.revision, reason: 'Superseded' });
  const stale = await action(alpha, 'test.run', { versionId: v1.id }).catch((error) => error);
  assert.ok(stale instanceof HttpError && stale.status === 409);
  await assert.rejects(action(alpha, 'release.rollback', { versionId: v1.id, testRunId: run1.id, currentReleaseId: rollback.id }), status(409));
});

test('AI identity is a release gate', async () => {
  const user = (await authenticate({ mode: 'register', email: 'agent-gate@example.test', password: 'correct password', organization: 'Gate' }, request())).user;
  const agent = await action(user, 'agent.create', { ...config(), disclosure: 'Hello, I work for this company.' });
  const version = await action(user, 'agent.version', { agentId: agent.id, revision: agent.revision });
  const run = await action(user, 'test.run', { versionId: version.id });
  assert.equal(run.data.passed, false);
  await assert.rejects(action(user, 'release.publish', { versionId: version.id, testRunId: run.id, currentReleaseId: null }), status(409));
});

test('simultaneous publishes cannot create two active browser bindings', async () => {
  const user = (await authenticate({ mode: 'register', email: 'agent-race@example.test', password: 'correct password', organization: 'Race' }, request())).user;
  const agent = await action(user, 'agent.create', config());
  const version = await action(user, 'agent.version', { agentId: agent.id, revision: agent.revision });
  const run = await action(user, 'test.run', { versionId: version.id });
  const attempts = await Promise.allSettled([
    action(user, 'release.publish', { versionId: version.id, testRunId: run.id, currentReleaseId: null }),
    action(user, 'release.publish', { versionId: version.id, testRunId: run.id, currentReleaseId: null }),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await listRecords(user.organizationId, 'release')).filter((r) => r.status === 'active').length, 1);
});

test('simultaneous version captures produce one immutable snapshot', async () => {
  const user = (await authenticate({ mode: 'register', email: 'agent-version-race@example.test', password: 'correct password', organization: 'Version Race' }, request())).user;
  const agent = await action(user, 'agent.create', config());
  const attempts = await Promise.allSettled([
    action(user, 'agent.version', { agentId: agent.id, revision: agent.revision }),
    action(user, 'agent.version', { agentId: agent.id, revision: agent.revision }),
  ]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  const versions = (await listRecords(user.organizationId, 'agent_version')).filter((v) => v.data.agentId === agent.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].data.number, 1);
});
