import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment, changeDeploymentStatus } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { enqueueLearningForServerSession, processLearningJob, runLearningWorkerTick, listLearningJobs } from '../lib/learning-jobs/engine';
import { analyzeConversation, applyConversationAnalysis, listConversationAnalyses, type FeedbackRunner } from '../lib/learning/engine';
import { LEARNING_JOB_KIND } from '../lib/learning-jobs/contracts';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional.openai.azure.com'; process.env.AZURE_OPENAI_API_KEY = 'unused-fictional';
process.env.LEARNING_WORKER_ENABLED = '1';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const quote = 'I do not need a follow-up call. Please use Hindi.';
const proposal = { text: JSON.stringify({ candidates: [{ type: 'commitment_request', title: 'Follow-up', content: quote, why: 'Caller statement', quote, turnIndex: 0 },
  { type: 'explicit_preference', title: 'Language', content: 'Use Hindi.', why: 'Caller request', quote: 'Please use Hindi.', turnIndex: 0 },
  { type: 'feedback_theme', title: 'Hallucination', content: 'Made up', why: 'Unsupported', quote: 'Invented caller text', turnIndex: 0 }] }) };
async function fixture(autoLearning = true) {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, time = new Date().toISOString();
  const database = await db();
  await database.batch([{ sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Learning example', time] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, time] }, ...ownerRegistrationStatements(user)]);
  const source = await createRecord(user, 'brain_source', { title: 'Public facts', content: 'Office opens at 9.', sourceLabel: 'Company page', approvedAt: time }, 'approved');
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Assistant', role: 'Support', objective: 'Explain public facts.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'none', escalation: 'Suggest company contact.', knowledgeIds: [source.id], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Learning assistant', channel: 'web_chat', agentId: agent.id, versionId: version.id, releaseId: release.id, publicKnowledgeIds: [source.id],
    brand: { name: 'Example', welcomeMessage: 'Ask a question.' }, allowedOrigins: ['https://example.test'], limits: { enabled: true }, autoLearning });
  const published = await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  const issuedDeployment = { id: published.id, revision: published.revision, autoLearning };
  async function session(frozenOptIn = autoLearning) {
    const publicSessionId = `deployment:session:${randomUUID()}`, sessionId = `public-session:${hash(publicSessionId)}`, receiptId = `public:conversation:${hash(publicSessionId)}`;
    const transcript = [{ role: 'user', text: quote }];
    await database.batch([
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [receiptId, user.organizationId, 'public:conversation', 'visitor_stopped', JSON.stringify({ deploymentId: published.id,
        source: 'server_captured_public_channel', identity: 'anonymous_unverified', entries: transcript, snapshot: { deploymentRevision: published.revision, autoLearning: frozenOptIn } }), time] },
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,NULL,?,?)', params: [sessionId, user.organizationId, 'session', JSON.stringify({ source: 'public_chat', deploymentId: published.id, publicSessionId, transcript }), time] },
    ]);
    return { organizationId: user.organizationId, sessionId, issuedDeployment, receiptId };
  }
  return { user, published, source, session, issuedDeployment };
}
async function mutate(id: string, change: (value: any) => any) {
  const database = await db(), [selected] = await database.all('SELECT data FROM entities WHERE id=?', [id]);
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify(change(JSON.parse(String(selected.data)))), id]);
}

test('global off and frozen owner opt-out make no queue or budget writes', async () => {
  const f = await fixture(), source = await f.session();
  const before = await (await db()).all('SELECT id,data,status FROM entities ORDER BY id');
  process.env.LEARNING_WORKER_ENABLED = '0';
  try {
    assert.equal(await enqueueLearningForServerSession(source), undefined);
    assert.deepEqual(await runLearningWorkerTick({ enabled: true }), { enabled: false, examined: 0, ready: 0, cancelled: 0, uncertain: 0 });
  } finally { process.env.LEARNING_WORKER_ENABLED = '1'; }
  assert.equal(await enqueueLearningForServerSession({ ...source, issuedDeployment: { ...source.issuedDeployment, autoLearning: false } }), undefined);
  assert.deepEqual(await (await db()).all('SELECT id,data,status FROM entities ORDER BY id'), before);
  const optedOut = await fixture(false); assert.equal(await enqueueLearningForServerSession(await optedOut.session()), undefined);
  assert.equal(await enqueueLearningForServerSession(await f.session(false)), undefined, 'old opted-out receipt cannot be retroactively learned');
});

test('immutable receipt required; forged metadata, foreign workspace and changed transcripts are not enqueued', async () => {
  const f = await fixture(), source = await f.session();
  await mutate(source.sessionId, value => ({ ...value, transcript: [{ role: 'user', text: 'Forged text.' }] }));
  assert.equal(await enqueueLearningForServerSession(source), undefined);
  assert.equal(await enqueueLearningForServerSession({ ...source, organizationId: randomUUID() }), undefined);
  const intact = await f.session();
  await (await db()).run('DELETE FROM entities WHERE id=?', [intact.receiptId]);
  assert.equal(await enqueueLearningForServerSession(intact), undefined);
  const privateIdentity = await f.session(); await mutate(privateIdentity.sessionId, value => ({ ...value, contactId: 'forged-contact' }));
  assert.equal(await enqueueLearningForServerSession(privateIdentity), undefined);
});

test('replayed enqueue and concurrent workers produce one feedback-only analysis and no released records', async () => {
  const f = await fixture(), source = await f.session();
  const jobs = await Promise.all(Array.from({ length: 5 }, () => enqueueLearningForServerSession(source)));
  assert.ok(jobs[0]); assert.equal(new Set(jobs.map(job => job!.id)).size, 1);
  let calls = 0; const runner: FeedbackRunner = async (_user, input) => { calls++; assert.equal(input.task, 'feedback'); assert.equal(input.maxOutputTokens, 1600); return proposal; };
  await Promise.all(Array.from({ length: 5 }, () => processLearningJob(f.user.organizationId, jobs[0]!.id, { runner })));
  assert.equal(calls, 1);
  const [analysis] = await listConversationAnalyses(f.user, source.sessionId);
  assert.equal(analysis.status, 'ready'); assert.equal(analysis.data.feedbackOnly, true); assert.equal(analysis.data.candidates.length, 2);
  assert.ok(analysis.data.candidates.every(card => card.destination === 'feedback_evidence' && card.routingPolicy === 'anonymous_feedback_only'));
  assert.equal(analysis.data.candidates[0].originalDestination, 'manual_action_review');
  assert.equal(analysis.data.candidates[0].quote, quote);
  await assert.rejects(applyConversationAnalysis(f.user, analysis.id, analysis.revision, [analysis.data.candidates[0].id], [{ candidateId: analysis.data.candidates[0].id, destination: 'manual_action_review' }]), /feedback review only/);
  const before = await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind IN (?,?,?)', [f.user.organizationId, 'memory', 'knowledge', 'action']); assert.equal(before.length, 0);
  const status = await listLearningJobs(f.user, { deploymentId: f.published.id }); assert.equal(status.jobs[0].status, 'ready'); assert.equal('claimToken' in status.jobs[0], false);
  await processLearningJob(f.user.organizationId, jobs[0]!.id, { runner }); assert.equal(calls, 1);
});

test('pause and changed source cancel queued work before model use', async () => {
  for (const mode of ['pause', 'source', 'owner'] as const) {
    const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
    if (mode === 'pause') await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
    if (mode === 'source') await mutate(f.source.id, value => ({ ...value, revision: value.revision + 1 }));
    if (mode === 'owner') await (await db()).run('UPDATE entities SET status=? WHERE id=?', ['revoked', `team:member:${f.user.id}`]);
    let calls = 0;
    const result = await processLearningJob(f.user.organizationId, job.id, { runner: async () => { calls++; return proposal; } });
    assert.equal(result?.status, 'cancelled'); assert.equal(calls, 0);
  }
});

test('revocation during inference retains uncertain work and prevents ready feedback without paid retry', async () => {
  const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
  let calls = 0;
  const runner: FeedbackRunner = async () => { calls++; await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' }); return proposal; };
  assert.equal((await processLearningJob(f.user.organizationId, job.id, { runner }))?.status, 'uncertain');
  assert.equal((await listConversationAnalyses(f.user, source.sessionId))[0].status, 'failed');
  await processLearningJob(f.user.organizationId, job.id, { runner }); assert.equal(calls, 1);
});

test('provider uncertainty and abandoned inference never auto retry', async () => {
  const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
  let calls = 0;
  const runner: FeedbackRunner = async () => { calls++; throw new Error('Fictional connection reset'); };
  assert.equal((await processLearningJob(f.user.organizationId, job.id, { runner }))?.status, 'uncertain');
  await processLearningJob(f.user.organizationId, job.id, { runner }); assert.equal(calls, 1);
  const abandoned = (await enqueueLearningForServerSession(await f.session()))!;
  await mutate(abandoned.id, value => ({ ...value, status: 'inference', claimedAt: '2000-01-01T00:00:00.000Z', claimToken: 'expired-test' }));
  await (await db()).run('UPDATE entities SET status=? WHERE id=?', ['inference', abandoned.id]);
  await runLearningWorkerTick({ limit: 1 }, { runner });
  const status = await listLearningJobs(f.user, { sessionId: abandoned.sessionId }); assert.equal(status.jobs[0].status, 'uncertain'); assert.equal(calls, 1);
});

test('pause after durable worker claim but before inference sends no model request', async () => {
  const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
  const database = await db(), originalBatch = database.batch.bind(database);
  let paused = false, calls = 0;
  database.batch = async statements => {
    await originalBatch(statements);
    if (!paused && statements.some(statement => statement.sql.startsWith('INSERT INTO entities') && statement.params?.includes('platform:conversation_analysis'))) {
      paused = true;
      await database.run('UPDATE entities SET status=? WHERE id=?', ['paused', f.published.id]);
    }
  };
  try {
    const result = await processLearningJob(f.user.organizationId, job.id, { runner: async () => { calls++; return proposal; } });
    assert.equal(paused, true); assert.equal(calls, 0); assert.equal(result?.status, 'cancelled');
  } finally { database.batch = originalBatch; }
});

test('expired claim cannot publish a late analysis or replace its retained uncertainty', async () => {
  const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
  const result = await processLearningJob(f.user.organizationId, job.id, { runner: async () => {
    await mutate(job.id, value => ({ ...value, status: 'uncertain', reason: 'Expired claim retained' }));
    await (await db()).run('UPDATE entities SET status=? WHERE id=?', ['uncertain', job.id]);
    return proposal;
  } });
  assert.equal(result?.status, 'uncertain'); assert.equal(result?.reason, 'Expired claim retained');
  assert.equal((await listConversationAnalyses(f.user, source.sessionId))[0].status, 'stale');
});

test('manual analysis also derives anonymous feedback-only scope from saved session', async () => {
  const f = await fixture(), source = await f.session();
  const analysis = await analyzeConversation(f.user, source.sessionId, 'manual-canonical', async () => proposal);
  assert.equal(analysis.data.feedbackOnly, true);
  assert.ok(analysis.data.candidates.every(card => card.destination === 'feedback_evidence'));
  const result = await applyConversationAnalysis(f.user, analysis.id, analysis.revision, analysis.data.candidates.map(card => card.id));
  assert.equal(result.applied.length, 0);
});

test('daily enqueue budget is bounded and read status is tenant scoped', async () => {
  const f = await fixture();
  let count = 0;
  for (let index = 0; index < 27; index++) if (await enqueueLearningForServerSession(await f.session())) count++;
  assert.equal(count, 25);
  const foreign = await fixture();
  await assert.rejects(listLearningJobs(foreign.user, { deploymentId: f.published.id }), /not found/);
  assert.equal((await listLearningJobs(foreign.user)).jobs.length, 0);
  const rows = await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, LEARNING_JOB_KIND]); assert.equal(rows.length, 25);
});

test('daily inference cap is reserved transactionally before the model runner', async () => {
  const f = await fixture(), source = await f.session(), job = (await enqueueLearningForServerSession(source))!;
  const time = new Date().toISOString(), budgetId = `learning-budget:${hash(`${f.user.organizationId}:inference:workspace:${time.slice(0, 10)}`)}`;
  await (await db()).run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [budgetId, f.user.organizationId, 'learning:budget', 'active', '100', time]);
  let calls = 0;
  const result = await processLearningJob(f.user.organizationId, job.id, { runner: async () => { calls++; return proposal; } });
  assert.equal(calls, 0); assert.equal(result?.status, 'cancelled');
  assert.equal((await (await db()).all('SELECT data FROM entities WHERE id=?', [budgetId]))[0].data, '100');
});
