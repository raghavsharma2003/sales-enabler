import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { handleAgentAction } from '../lib/platform/agents';
import { getRecord, listRecords, type PlatformRecord } from '../lib/platform/records';
import { proposeAgentRevision, applyAgentRevision, recheckAgentRevision } from '../lib/agent-revision/service';
import { HttpError } from '../lib/server/http';
import type { runAiTask } from '../lib/ai/task-router';
import { db } from '../lib/server/db';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = () => new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } });
const config = () => ({ name: 'Maya', role: 'Customer advisor', objective: 'Help customers understand their choices and next steps.', disclosure: 'I am an AI assistant for this company.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'], responseStyle: 'Be clear and respectful.', memoryScope: 'approved_contact', escalation: 'Offer a human colleague whenever needed or requested.', knowledgeIds: [], systemPrompt: 'Ask about the customer goal.', openingMessage: 'Hello, I am an AI assistant for this company.' });
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const fake = (changes: Record<string, unknown>) => (async () => ({ text: JSON.stringify({ changes, explanation: 'Pacing and correction handling updated.' }), model: 'mock-azure', runId: 'mock-run', usage: { inputTokens: 50, outputTokens: 30 }, cached: false })) as typeof runAiTask;
let sequence = 0;
async function setup() {
  const user = (await authenticate({ mode: 'register', email: `revision-${++sequence}@example.test`, password: 'correct password', organization: 'Revision test' }, origin())).user;
  const agent = await handleAgentAction(user, 'agent.create', config()) as PlatformRecord;
  return { user, agent };
}
const body = (agent: PlatformRecord, requestId: string, instruction = 'Speak slower and confirm corrections.') => ({ agentId: agent.id, revision: agent.revision, requestId, instruction });

test('saved proposal preserves protected settings and applies once to draft without publishing', async () => {
  const { user, agent } = await setup();
  const ai = fake({ responseStyle: 'Speak slowly. Ask one question. Confirm corrections.', systemPrompt: 'Ask about the customer goal. Pause for the answer. Confirm any correction.' });
  const proposal = await proposeAgentRevision(user, body(agent, 'revision-main-1'), { ai });
  assert.equal(proposal.status, 'ready');
  assert.match(proposal.data.baseDigest, /^[a-f0-9]{64}$/);
  assert.match(proposal.data.afterDigest || '', /^[a-f0-9]{64}$/);
  assert.deepEqual(proposal.data.changedFields, ['systemPrompt', 'responseStyle']);
  assert.equal(proposal.data.before.responseStyle, config().responseStyle);
  assert.equal(proposal.data.after?.responseStyle, 'Speak slowly. Ask one question. Confirm corrections.');
  const beforeApply = await getRecord(user.organizationId, 'agent_definition', agent.id);
  assert.equal(beforeApply.revision, 1);
  assert.equal(beforeApply.data.responseStyle, config().responseStyle);
  const applied = await applyAgentRevision(user, { proposalId: proposal.id });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.data.appliedRevision, 2);
  assert.deepEqual(await applyAgentRevision(user, { proposalId: proposal.id }), applied);
  const saved = await getRecord(user.organizationId, 'agent_definition', agent.id);
  assert.equal(saved.revision, 2);
  assert.equal(saved.data.name, 'Maya');
  assert.equal(saved.data.disclosure, config().disclosure);
  assert.deepEqual(saved.data.knowledgeIds, []);
  assert.equal((await listRecords(user.organizationId, 'agent_version')).length, 0);
  assert.equal((await listRecords(user.organizationId, 'release')).length, 0);
  assert.equal((await listRecords(user.organizationId, 'agent_change_proposal')).length, 1);
});

test('replay is idempotent; changed input and stale agent cannot silently overwrite', async () => {
  const { user, agent } = await setup();
  let calls = 0;
  const ai = (async (...args: Parameters<typeof runAiTask>) => { calls++; return fake({ objective: 'Help customers understand their choices and make a careful next-step decision.' })(...args); }) as typeof runAiTask;
  const proposal = await proposeAgentRevision(user, body(agent, 'revision-replay-1'), { ai });
  assert.deepEqual(await proposeAgentRevision(user, body(agent, 'revision-replay-1'), { ai }), proposal);
  assert.equal(calls, 1);
  await assert.rejects(proposeAgentRevision(user, body(agent, 'revision-replay-1', 'Change the greeting.'), { ai }), status(409));
  await handleAgentAction(user, 'agent.update', { ...config(), responseStyle: 'Edited manually.', agentId: agent.id, revision: agent.revision });
  assert.deepEqual(await proposeAgentRevision(user, body(agent, 'revision-replay-1'), { ai }), proposal);
  assert.equal(calls, 1);
  await assert.rejects(applyAgentRevision(user, { proposalId: proposal.id }), status(409));
  await assert.rejects(proposeAgentRevision(user, body(agent, 'revision-stale-1'), { ai }), status(409));
});

test('malformed or forbidden model edits save invalid review and never change agent', async () => {
  const { user, agent } = await setup();
  const forbidden = await proposeAgentRevision(user, body(agent, 'revision-forbid-1'), { ai: fake({ enabledTools: ['request_follow_up'], responseStyle: 'Warmer.' }) });
  assert.equal(forbidden.status, 'invalid');
  await assert.rejects(applyAgentRevision(user, { proposalId: forbidden.id }), status(409));
  const hiddenAi = await proposeAgentRevision(user, body(agent, 'revision-identity-1'), { ai: fake({ openingMessage: 'Hello from the company.' }) });
  assert.equal(hiddenAi.status, 'invalid');
  const rewrittenPrompt = await proposeAgentRevision(user, body(agent, 'revision-rewrite-1'), { ai: fake({ systemPrompt: 'Stay calm and ask one focused question at a time. Acknowledge the person’s explicit concern, and confirm your understanding when they correct you. Use only attached company knowledge, keep the configured language limits, and offer the existing human handoff when needed.' }) });
  assert.equal(rewrittenPrompt.status, 'ready');
  assert.equal(rewrittenPrompt.data.after?.name, config().name);
  assert.equal(rewrittenPrompt.data.after?.disclosure, config().disclosure);
  assert.deepEqual(rewrittenPrompt.data.after?.allowedLanguages, config().allowedLanguages);
  assert.deepEqual(rewrittenPrompt.data.after?.knowledgeIds, config().knowledgeIds);
  assert.deepEqual(rewrittenPrompt.data.after?.enabledTools, []);
  assert.equal(rewrittenPrompt.data.after?.memoryScope, config().memoryScope);
  assert.equal(rewrittenPrompt.data.after?.voiceProfile, 'provider-default');
  const droppedHuman = await proposeAgentRevision(user, body(agent, 'revision-handoff-1'), { ai: fake({ escalation: 'Keep the conversation going forever.' }) });
  assert.equal(droppedHuman.status, 'invalid');
  assert.equal((await getRecord(user.organizationId, 'agent_definition', agent.id)).revision, 1);
});

test('invalid proposal can recheck its saved Azure receipt without another inference', async () => {
  const { user, agent } = await setup();
  const runId = `airun:revision-recheck-${sequence}`;
  let calls = 0;
  const initial = (async () => { calls++; return { text: JSON.stringify({ changes: { enabledTools: ['request_follow_up'] }, explanation: 'Old rejected shape.' }), model: 'mock-azure', runId, usage: { inputTokens: 40, outputTokens: 20 }, cached: false }; }) as typeof runAiTask;
  const proposal = await proposeAgentRevision(user, body(agent, 'revision-recheck-1'), { ai: initial });
  assert.equal(proposal.status, 'invalid');
  const recoveredText = JSON.stringify({ changes: { systemPrompt: 'Stay calm, ask one question at a time, acknowledge an explicit concern, and confirm corrections while using approved sources and the configured handoff.' }, explanation: 'Calmer pacing and explicit repair behavior.' });
  await (await db()).run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [runId, user.organizationId, 'ai:run', 'complete', JSON.stringify({ text: recoveredText }), new Date().toISOString()]);
  const rechecked = await recheckAgentRevision(user, { proposalId: proposal.id });
  assert.equal(rechecked.status, 'ready');
  assert.equal(calls, 1);
  assert.deepEqual(rechecked.data.priorInvalidReasons, [proposal.data.invalidReason]);
  assert.equal(rechecked.data.invalidReason, undefined);
  assert.equal(rechecked.data.after?.disclosure, config().disclosure);
  assert.deepEqual(rechecked.data.after?.knowledgeIds, []);
  assert.equal((await getRecord(user.organizationId, 'agent_definition', agent.id)).revision, 1);
});

test('tenant and viewer boundaries protect proposal and apply', async () => {
  const { user, agent } = await setup();
  const other = (await setup()).user;
  await assert.rejects(proposeAgentRevision(other, body(agent, 'revision-cross-1'), { ai: fake({ responseStyle: 'Slower.' }) }), status(404));
  const proposal = await proposeAgentRevision(user, body(agent, 'revision-tenant-1'), { ai: fake({ responseStyle: 'Speak slowly and clearly.' }) });
  await assert.rejects(applyAgentRevision(other, { proposalId: proposal.id }), status(404));
  await assert.rejects(proposeAgentRevision({ ...user, role: 'viewer' } as AuthUser, body(agent, 'revision-viewer-1'), { ai: fake({ responseStyle: 'Slower.' }) }), status(403));
});
