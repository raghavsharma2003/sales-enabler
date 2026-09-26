import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment, changeDeploymentStatus, issuePublicSession } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { publicChat, closePublicChatHistory } from '../lib/public-agent/service';
import type { runAiTask } from '../lib/ai/task-router';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.PUBLIC_SESSION_HASH_SECRET = 'fictional-public-session-test-secret-only';
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional.openai.azure.com'; process.env.AZURE_OPENAI_API_KEY = 'unused-fictional';
const origin = 'https://public.example.test';
async function fixture(autoLearning = false) {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, now = new Date().toISOString();
  await (await db()).batch([{ sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Example', now] }, { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] }, ...ownerRegistrationStatements(user)]);
  const source = await createRecord(user, 'brain_source', { title: 'Public facts', content: 'Our office opens at 9.', sourceLabel: 'Company page', approvedAt: now }, 'approved');
  const privateSource = await createRecord(user, 'brain_source', { title: 'Private source', content: 'PRIVATE_SOURCE_SENTINEL', sourceLabel: 'Internal', approvedAt: now }, 'approved');
  await createRecord(user, 'customer_profile', { name: 'PRIVATE_CUSTOMER_SENTINEL' });
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Assistant', role: 'Company support', objective: 'Explain public company facts.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Brief', memoryScope: 'approved_contact', escalation: 'Suggest company contact.', knowledgeIds: [source.id, privateSource.id], systemPrompt: 'Ask which service interests the visitor.', enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Public', channel: 'web_chat', agentId: agent.id, versionId: version.id, releaseId: release.id, publicKnowledgeIds: [source.id], brand: { name: 'Example', welcomeMessage: 'Ask a question.' }, allowedOrigins: [origin], limits: { enabled: true }, autoLearning });
  const published = await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  const issued = await issuePublicSession(draft.data.publicId, { origin, purpose: 'chat', requestId: randomUUID() });
  return { user, published, issued, publicId: draft.data.publicId };
}
const result = { text: 'Our office opens at 9.', model: 'fictional', usage: { inputTokens: 20, outputTokens: 10 }, runId: 'fictional', cached: false };

test('public chat uses immutable selected facts, server history and relational behavior; historical session survives pause', async () => {
  const f = await fixture(); let calls = 0;
  const runner: typeof runAiTask = async (_user, input) => { calls++; assert.equal(input.task, 'answer'); assert.match(input.system, /Our office opens at 9/); assert.match(input.system, /Ask which service interests/); assert.doesNotMatch(JSON.stringify(input), /PRIVATE_/); assert.match(input.system, /CURRENT-CALL RELATIONAL/); return result; };
  const first = await publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Please speak in Hindi.' }, runner);
  assert.match(first.text, /AI assistant/);
  await publicChat({ token: f.issued.token, nonce: first.nonce!, origin, requestId: randomUUID(), message: 'What time do you open?' }, async (_user, input) => { assert.match(input.input, /Please speak in Hindi/); return result; });
  await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
  await closePublicChatHistory(f.issued.token, origin, f.publicId);
  const [row] = await (await db()).all('SELECT data,status FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'session']);
  const saved = JSON.parse(String(row.data)); assert.equal(row.status, null); assert.equal(saved.source, 'public_chat'); assert.equal(saved.provider, 'azure'); assert.equal(saved.callerIdentity, 'anonymous_unverified'); assert.equal(saved.contactId, undefined); assert.equal(saved.transcript.length, 4); assert.equal(saved.runtimeEvidence.state.language, 'Hindi'); assert.deepEqual(saved.runtimeEvidence.sourceIds, []); assert.equal(calls, 1);
  await closePublicChatHistory(f.issued.token, origin, f.publicId);
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'session'])).length, 1);
});

test('uncertain chat is persisted and never silently replayed with a new request ID', async () => {
  const f = await fixture(); let calls = 0;
  const runner: typeof runAiTask = async () => { calls++; throw new Error('simulated interrupted provider transport'); };
  await assert.rejects(publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Hello' }, runner), /interrupted/);
  await assert.rejects(publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Hello again' }, runner), /busy or ended/); assert.equal(calls, 1);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'session']); assert.equal(JSON.parse(String(row.data)).outcome, 'uncertain');
});

test('authority withdrawal during text inference suppresses reply delivery but saves caller history', async () => {
  const f = await fixture();
  await assert.rejects(publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Hello' }, async () => { await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' }); return result; }), /paused/);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'session']); const saved = JSON.parse(String(row.data)); assert.equal(saved.transcript.length, 1); assert.equal(saved.transcript[0].role, 'user');
});

test('concurrent visitor messages reserve one provider attempt and never accept client history', async () => {
  const f = await fixture(); let calls = 0;
  const runner: typeof runAiTask = async () => { calls++; return result; };
  const outcomes = await Promise.allSettled([publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'First request' }, runner), publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Racing request' }, runner)]);
  assert.equal(calls, 1); assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
});

test('a direct first-turn AI disclosure is not duplicated and completed consultation feedback keeps its journey context', async () => {
  const f = await fixture();
  const reply = 'Hi, I’m an AI assistant for Example. Which part of the next-step guidance was unclear?';
  const actual = await publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'My consultation was useful but next steps were unclear; please explain one at a time in Hinglish.' }, async (_user, input) => {
    assert.match(input.system, /do not restart discovery/); assert.match(input.system, /without claiming it is verified/); assert.match(input.system, /"language":"Hinglish"/); assert.match(input.input, /consultation was useful/); return { ...result, text: reply };
  });
  assert.equal(actual.text, reply);
});

test('public completion freezes learning opt-in and queues one receipt-backed job without running inference', async () => {
  const previousFlag = process.env.LEARNING_WORKER_ENABLED; process.env.LEARNING_WORKER_ENABLED = '1';
  try {
    const f = await fixture(true);
    await publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Please explain the opening hours.' }, async () => result);
    const [receipt] = await (await db()).all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'public:conversation']);
    const frozen = JSON.parse(String(receipt.data)).snapshot; assert.equal(frozen.autoLearning, true); assert.equal(frozen.deploymentRevision, f.published.revision);
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'learning:job'])).length, 0);
    await closePublicChatHistory(f.issued.token, origin, f.publicId);
    await closePublicChatHistory(f.issued.token, origin, f.publicId);
    const jobs = await (await db()).all('SELECT data,status FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'learning:job']);
    assert.equal(jobs.length, 1); assert.equal(jobs[0].status, 'queued'); assert.equal(JSON.parse(String(jobs[0].data)).deploymentRevision, f.published.revision);
  } finally { if (previousFlag === undefined) delete process.env.LEARNING_WORKER_ENABLED; else process.env.LEARNING_WORKER_ENABLED = previousFlag; }
});

test('changing current opt-in cannot backfill an existing public conversation or historical session', async () => {
  const previousFlag = process.env.LEARNING_WORKER_ENABLED; process.env.LEARNING_WORKER_ENABLED = '1';
  try {
    const f = await fixture(false);
    await publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Hello' }, async () => result);
    await updateRecord(f.user, f.published, { ...f.published.data, autoLearning: true });
    await closePublicChatHistory(f.issued.token, origin, f.publicId);
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'learning:job'])).length, 0);
    const g = await fixture(true); process.env.LEARNING_WORKER_ENABLED = '0';
    await publicChat({ token: g.issued.token, nonce: g.issued.nonce, origin, requestId: randomUUID(), message: 'Hello' }, async () => result);
    await closePublicChatHistory(g.issued.token, origin, g.publicId);
    process.env.LEARNING_WORKER_ENABLED = '1';
    await closePublicChatHistory(g.issued.token, origin, g.publicId);
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id = ? AND kind = ?', [g.user.organizationId, 'learning:job'])).length, 0);
  } finally { if (previousFlag === undefined) delete process.env.LEARNING_WORKER_ENABLED; else process.env.LEARNING_WORKER_ENABLED = previousFlag; }
});

test('learning storage failure cannot discard a completed public transcript or canonical session', async () => {
  const previousFlag = process.env.LEARNING_WORKER_ENABLED; process.env.LEARNING_WORKER_ENABLED = '1';
  const database = await db(), originalRun = database.run;
  try {
    const f = await fixture(true);
    await publicChat({ token: f.issued.token, nonce: f.issued.nonce, origin, requestId: randomUUID(), message: 'Hello' }, async () => result);
    database.run = async (sql, params) => { if (params?.includes('learning:budget')) throw new Error('Simulated learning storage outage'); return originalRun(sql, params); };
    await closePublicChatHistory(f.issued.token, origin, f.publicId);
    const [saved] = await database.all('SELECT data FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'session']);
    assert.equal(JSON.parse(String(saved.data)).transcript.length, 2);
    const [receipt] = await database.all('SELECT status FROM entities WHERE organization_id = ? AND kind = ?', [f.user.organizationId, 'public:conversation']); assert.equal(receipt.status, 'visitor_stopped');
  } finally { database.run = originalRun; if (previousFlag === undefined) delete process.env.LEARNING_WORKER_ENABLED; else process.env.LEARNING_WORKER_ENABLED = previousFlag; }
});
