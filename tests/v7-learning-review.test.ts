import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, type Database } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment, changeDeploymentStatus, issuePublicSession, resolvePublicSession } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { appendPublicTranscript, finishPublicConversation, digest } from '../lib/public-agent/service';
import { processLearningJob, listLearningJobs, enqueueLearningForServerSession } from '../lib/learning-jobs/engine';
import { listConversationAnalyses, applyConversationAnalysis } from '../lib/learning/engine';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional.openai.azure.com'; process.env.AZURE_OPENAI_API_KEY = 'unused-fictional';
process.env.AZURE_OPENAI_FAST_DEPLOYMENT = 'fictional-feedback'; process.env.LEARNING_WORKER_ENABLED = '1';
process.env.PUBLIC_SESSION_HASH_SECRET = 'fictional-v7-learning-review-secret-only';
delete process.env.AI_DAILY_ORG_TOKEN_BUDGET; delete process.env.AZURE_OPENAI_DEPLOYMENT_PRICES_JSON;
const origin = 'https://example.test', quote = 'Please have someone call me about your service.';
const proposal = { text: JSON.stringify({ candidates: [{ type: 'commitment_request', title: 'Review caller feedback', content: quote, why: 'Explicit caller statement', quote, turnIndex: 0 }] }) };
type Statements = Parameters<Database['batch']>[0];

async function fixture(autoLearning = true) {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, now = new Date().toISOString();
  const database = await db();
  await database.batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional learning', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  const source = await createRecord(user, 'brain_source', { title: 'Public source', content: 'Our office opens at 9.', approvedAt: now }, 'approved');
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Fictional', role: 'Company assistant', objective: 'Explain company facts.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'none', escalation: 'Contact the company.', knowledgeIds: [source.id], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Fictional', channel: 'web_chat', agentId: agent.id, versionId: version.id, releaseId: release.id, publicKnowledgeIds: [source.id], brand: { name: 'Fictional', welcomeMessage: 'Hello' }, allowedOrigins: [origin], limits: { enabled: true }, autoLearning });
  const published = await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  const session = await issuePublicSession(published.data.publicId, { origin, purpose: 'chat' });
  const authority = await resolvePublicSession(session.token, { origin, purpose: 'chat' });
  await appendPublicTranscript(authority, 'public_web_chat', { role: 'user', text: quote, eventId: randomUUID() });
  const finish = () => finishPublicConversation(authority, 'public_web_chat', 'visitor_stopped');
  const sessionId = `public-session:${digest(session.sessionId)}`, receiptId = `public:conversation:${digest(session.sessionId)}`;
  return { user, published, source, session, sessionId, receiptId, finish };
}
async function mutate(id: string, fn: (value: any) => any, status?: string) {
  const database = await db(), [row] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
  assert.ok(row);
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(fn(JSON.parse(String(row.data)))), id]);
  if (status) await database.run('UPDATE entities SET status=? WHERE id=?', [status, id]);
}
async function readyFixture() {
  const f = await fixture(); await f.finish();
  const [job] = (await listLearningJobs(f.user, { sessionId: f.sessionId })).jobs;
  assert.ok(job, 'real canonical public writer must enqueue exactly its completed opted-in conversation');
  return { ...f, job };
}
function dispatchReservation(statements: Statements) {
  return statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?') && s.params?.[1] === 'inference' && s.params.includes('learning:job'));
}
function analysisCommit(statements: Statements) {
  return statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?') && s.params?.[1] === 'ready' && s.params.includes('platform:conversation_analysis'));
}

for (const boundary of ['dispatch', 'ready'] as const) for (const mutation of ['owner', 'deployment', 'source', 'session', 'receipt', 'claim'] as const) {
  test(`v7 learning: ${mutation} revocation immediately before ${boundary} reservation is fenced`, async () => {
    const f = await readyFixture(), database = await db(), originalBatch = database.batch;
    let changed = false, calls = 0;
    database.batch = async statements => {
      if (!changed && (boundary === 'dispatch' ? dispatchReservation(statements) : analysisCommit(statements))) {
        changed = true;
        if (mutation === 'owner') await mutate(`team:member:${f.user.id}`, value => ({ ...value, role: 'viewer', authorizationVersion: randomUUID() }));
        if (mutation === 'deployment') await mutate(f.published.id, value => ({ ...value, data: { ...value.data, autoLearning: false } }));
        if (mutation === 'source') await mutate(f.source.id, value => ({ ...value, revision: value.revision + 1 }));
        if (mutation === 'session') await mutate(f.sessionId, value => ({ ...value, transcript: [{ role: 'user', text: 'Changed canonical transcript.' }] }));
        if (mutation === 'receipt') await mutate(f.receiptId, value => ({ ...value, snapshot: { ...value.snapshot, autoLearning: false } }));
        if (mutation === 'claim') await mutate(f.job.id, value => ({ ...value, status: 'uncertain', reason: 'Claim invalidated by test before reservation' }), 'uncertain');
      }
      await originalBatch.call(database, statements);
    };
    try {
      const job = await processLearningJob(f.user.organizationId, f.job.id, { runner: async () => { calls++; return proposal; } });
      assert.equal(changed, true); assert.equal(calls, boundary === 'dispatch' ? 0 : 1);
      assert.equal(job?.status, boundary === 'ready' || mutation === 'claim' ? 'uncertain' : 'cancelled');
      assert.ok((await listConversationAnalyses(f.user, f.sessionId)).every(analysis => analysis.status !== 'ready'));
      await processLearningJob(f.user.organizationId, f.job.id, { runner: async () => { calls++; return proposal; } });
      assert.equal(calls, boundary === 'dispatch' ? 0 : 1, 'failed authority must never re-attempt inference');
    } finally { database.batch = originalBatch; }
  });
}

test('v7 learning: canonical opt-out never backfills after metadata opt-in', async () => {
  const f = await fixture(false); await f.finish();
  await mutate(f.published.id, value => ({ ...value, data: { ...value.data, autoLearning: true } }));
  const result = await enqueueLearningForServerSession({ organizationId: f.user.organizationId, sessionId: f.sessionId, issuedDeployment: { id: f.published.id, revision: f.published.revision, autoLearning: true } });
  assert.equal(result, undefined);
  assert.equal((await listLearningJobs(f.user, { sessionId: f.sessionId })).jobs.length, 0);
});

test('v7 learning: real Azure router makes one offline HTTP attempt and only feedback proposals', async () => {
  const f = await readyFixture(), originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++; assert.equal(String(input), 'https://fictional.openai.azure.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init?.body)); assert.equal(body.model, 'fictional-feedback'); assert.equal(body.max_completion_tokens, 1600);
    return Response.json({ choices: [{ message: { content: proposal.text }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 20 } });
  };
  try {
    await Promise.all(Array.from({ length: 5 }, () => processLearningJob(f.user.organizationId, f.job.id)));
    await processLearningJob(f.user.organizationId, f.job.id);
    assert.equal(calls, 1);
    const [analysis] = await listConversationAnalyses(f.user, f.sessionId);
    assert.equal(analysis.status, 'ready'); assert.equal(analysis.data.feedbackOnly, true);
    assert.equal(analysis.data.contactId, undefined); assert.equal(analysis.data.candidates[0].destination, 'feedback_evidence');
    await assert.rejects(applyConversationAnalysis(f.user, analysis.id, analysis.revision, [analysis.data.candidates[0].id], [{ candidateId: analysis.data.candidates[0].id, destination: 'manual_action_review' }]), /feedback review only/);
    await applyConversationAnalysis(f.user, analysis.id, analysis.revision, analysis.data.candidates.map(candidate => candidate.id));
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind IN (?,?,?)', [f.user.organizationId, 'memory', 'action', 'knowledge'])).length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
