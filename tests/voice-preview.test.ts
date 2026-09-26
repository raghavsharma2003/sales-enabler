import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, type AuthUser } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { createContact, createSession, createMemory, transition } from '../lib/server/store';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { createRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction, parseAgentConfig } from '../lib/platform/agents';
import { compileAgentContext, previewVoiceContext } from '../lib/voice/context';
import { buildVoiceInstructions } from '../lib/voice/prompt';
import { readAudioOffer } from '../lib/voice/offer';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const request = () => new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } });
const user = async (name: string) => (await authenticate({ mode: 'register', email: `${name}@example.test`, password: 'correct password', organization: name }, request())).user;
const draft = (extra = {}) => ({ name: 'Maya', role: 'Feedback interviewer', objective: 'Understand what worked and what the customer would like improved.', disclosure: 'I am the company AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi', 'Hinglish'], responseStyle: 'Warm and specific, one question at a time.', memoryScope: 'approved_contact', escalation: 'Offer a human colleague when requested or uncertain.', knowledgeIds: [], systemPrompt: 'Ask about the service before suggesting another purchase.', openingMessage: 'Hi, I am Maya, your AI assistant. Is now a good time?', ...extra });
const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

test('the browser SDP offer keeps its wire-format line endings', () => {
  const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n';
  assert.equal(readAudioOffer(offer), offer);
  assert.ok(readAudioOffer(offer).endsWith('\r\n'));
  assert.throws(() => readAudioOffer('v=0\r\nm=video\r\n'), status(400));
  assert.throws(() => readAudioOffer(null), status(400));
});

test('prompt and greeting survive saved versions; unsaved preview does not publish or require an agent', async () => {
  const owner = await user('preview-config');
  const agent = await handleAgentAction(owner, 'agent.create', draft()) as PlatformRecord;
  const version = await handleAgentAction(owner, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  assert.equal((version.data.config as Record<string, unknown>).systemPrompt, draft().systemPrompt);
  const preview = await previewVoiceContext(owner, { draft: draft({ systemPrompt: 'An edited prompt not saved yet.' }) });
  assert.equal(preview.contextMode, 'preview');
  assert.match(preview.instructions, /An edited prompt not saved yet/);
  assert.equal((version.data.config as Record<string, unknown>).systemPrompt, draft().systemPrompt);
  assert.match(buildVoiceInstructions(preview.instructions), /Follow agent.systemPrompt/);
  assert.match(buildVoiceInstructions(preview.instructions), /Your own apology never proves repair/);
  assert.throws(() => parseAgentConfig(draft({ systemPrompt: 'x'.repeat(12001) })), status(400));
  await assert.rejects(previewVoiceContext(owner, { draft: draft({ disclosure: 'I am a person.' }) }), status(400));
});

test('draft context enforces workspace, approval and memory opt-out', async () => {
  const owner = await user('preview-scope');
  const other = await user('preview-other');
  const pending = await handleCustomerAction(owner, 'brain.create', { title: 'Service', content: 'A verified service description.', sourceLabel: 'Staff handbook' }) as PlatformRecord;
  await assert.rejects(previewVoiceContext(owner, { draft: draft({ knowledgeIds: [pending.id] }) }), status(409));
  const approved = await handleCustomerAction(owner, 'brain.approve', { sourceId: pending.id, revision: pending.revision }) as PlatformRecord;
  await assert.rejects(previewVoiceContext(other, { draft: draft({ knowledgeIds: [approved.id] }) }), status(404));
  const contact = await createContact(owner, { name: 'Sample caller' });
  const memory = await createMemory(owner, { contactId: contact.id, content: 'Prefers Hinglish.', source: 'Explicit sample preference' });
  await transition(owner, 'memory', memory.id, 'approved');
  await createRecord(owner, 'commitment', { contactId: contact.id, title: 'Arrange the callback', dueDate: '2026-09-25' }, 'open');
  const contextual = await previewVoiceContext(owner, { draft: draft({ knowledgeIds: [approved.id] }), contactId: contact.id });
  assert.equal(contextual.relationship.preferences[0].value, 'Hinglish');
  assert.equal(contextual.relationship.openCommitments.length, 1);
  const none = await previewVoiceContext(owner, { draft: draft({ memoryScope: 'none' }), contactId: contact.id });
  assert.deepEqual(none.relationship.sourceIds, []);
  await assert.rejects(previewVoiceContext(other, { draft: draft(), contactId: contact.id }), status(404));
  await handleCustomerAction(owner, 'brain.revoke', { sourceId: approved.id, revision: approved.revision, reason: 'Incorrect service details' });
  await assert.rejects(previewVoiceContext(owner, { draft: draft({ knowledgeIds: [approved.id] }) }), status(409));
});

test('saved draft calls bind the issued snapshot and cannot become released call evidence', async () => {
  const owner = await user('preview-session');
  const other = await user('preview-session-other');
  const contact = await createContact(owner, { name: 'Preview caller' });
  const second = await createContact(owner, { name: 'Another caller' });
  const preview = await createRecord(owner, 'voice_preview', { config: draft(), contactId: contact.id, requestedBy: owner.id, contextDigest: 'issued-context-digest', inputMode: 'text', provider: 'gemini' }, 'connection_issued');
  const body = { source: 'browser_preview', previewId: preview.id, provider: 'untrusted-claimed-provider', transcript: [{ role: 'user', text: 'Please explain one thing at a time.' }] };
  const saved = await createSession(owner, body);
  assert.equal(saved.source, 'browser_preview');
  assert.equal(saved.contactId, contact.id);
  assert.equal(saved.provider, 'gemini');
  assert.equal(saved.inputMode, 'text');
  assert.equal(saved.releaseId, undefined);
  assert.equal((saved.previewConfig as Record<string, unknown>).systemPrompt, draft().systemPrompt);
  await assert.rejects(createSession(other, body), status(404));
  await assert.rejects(createSession(owner, { ...body, contactId: second.id }), status(400));
  await assert.rejects(createSession(owner, { ...body, releaseId: 'pretend-published' }), status(400));
  await assert.rejects(createSession(owner, { ...body, source: 'browser_voice' }), status(400));
  const sameOrgDifferentUser: AuthUser = { ...owner, id: 'another-workspace-user' };
  await assert.rejects(createSession(sameOrgDifferentUser, body), status(403));
});

test('context never silently cuts a condition from an approved source', async () => {
  const owner = await user('preview-source-budget');
  const source = (id: string, content: string): PlatformRecord => ({ id, kind: 'brain_source', status: 'approved', revision: 1, createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z', data: { title: id, content, sourceLabel: 'Reviewed source' } });
  const qualified = 'Context. '.repeat(300) + 'No admission or visa outcome is guaranteed.';
  const context = await compileAgentContext(owner, parseAgentConfig(draft()), [source('qualified', qualified)]);
  assert.match(context.instructions, /No admission or visa outcome is guaranteed/);
  assert.equal(context.omittedKnowledgeCount, 0);
  const oversized = await compileAgentContext(owner, parseAgentConfig(draft()), [source('too-long', 'A'.repeat(40000) + ' CONDITIONAL END')]);
  assert.equal(oversized.omittedKnowledgeCount, 1);
  assert.deepEqual(oversized.knowledgeSources, []);
  assert.equal(JSON.parse(oversized.instructions).companyKnowledge.length, 0);
});
