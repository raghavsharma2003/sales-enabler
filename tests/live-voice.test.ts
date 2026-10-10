import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { authenticate } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { getReleaseReviewPacket, handleAgentAction, parseAgentConfig, type AgentConfig } from '../lib/platform/agents';
import type { PlatformRecord } from '../lib/platform/records';
import { getRecord } from '../lib/platform/records';
import { proposeAgentRevision, applyAgentRevision } from '../lib/agent-revision/service';
import type { runAiTask } from '../lib/ai/task-router';
import { compileAgentContext, previewVoiceContext } from '../lib/voice/context';
import { releasedVoiceContext } from '../lib/voice/release';
import { db } from '../lib/server/db';
import {
  parseLiveVoiceProfile, resolveLiveVoiceProfile, resolveAzureVoiceLiveVoice,
  LiveVoiceValidationError, LIVE_VOICE_PUBLICATION_BLOCKER, type LiveVoiceProfile,
} from '../lib/voice/live-voice';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;

const control: LiveVoiceProfile = { version: 1, engine: 'azure-openai-realtime', preset: 'provider-default' };
const diya: LiveVoiceProfile = { version: 1, engine: 'azure-voice-live', preset: 'taxila-diya' };
const arjun: LiveVoiceProfile = { version: 1, engine: 'azure-voice-live', preset: 'taxila-arjun' };
const draft = () => ({
  name: 'Guide', role: 'Customer advisor', objective: 'Help callers understand their options.',
  disclosure: 'I am an AI assistant.', primaryLanguage: 'Hindi', allowedLanguages: ['Hindi', 'English'],
  responseStyle: 'Use clear language.', memoryScope: 'none', escalation: 'Offer a human colleague when asked.', knowledgeIds: [],
});

test('live voice accepts only the three exact versioned engine/preset pairs and freezes a copy', () => {
  for (const profile of [control, diya, arjun]) {
    const parsed = parseLiveVoiceProfile(profile);
    assert.deepEqual(parsed, profile);
    assert.notEqual(parsed, profile);
    assert.equal(Object.isFrozen(parsed), true);
  }
});

test('live voice rejects arbitrary voices, mismatched engines, unknown keys and coercion with a fixed error', () => {
  for (const value of [null, [], '', false, {}, { ...diya, version: '1' }, { ...diya, version: 2 },
    { ...diya, engine: 'azure-openai-realtime' }, { ...control, engine: 'azure-voice-live' },
    { ...diya, engine: 'gemini' }, { ...diya, engine: 'azure-voice-live ' },
    { ...diya, preset: 'diya' }, { ...diya, preset: 'en-IN-Diya:DragonHDLatestNeural' },
    { ...diya, preset: 'taxila-other' }, { ...diya, voice: 'secret-arbitrary-voice' },
    { ...diya, model: 'gpt-realtime-2.1-mini' }, { ...diya, [Symbol('hidden')]: true },
    { version: 1, engine: 'azure-voice-live' }]) {
    assert.throws(() => parseLiveVoiceProfile(value), (error: unknown) => error instanceof LiveVoiceValidationError && error.message === 'Invalid live voice configuration.');
  }
});

test('absent live voice leaves legacy JSON/hash unchanged while resolving to the existing control', () => {
  assert.equal(parseLiveVoiceProfile(undefined), undefined);
  assert.deepEqual(resolveLiveVoiceProfile(), control);
  assert.equal(resolveAzureVoiceLiveVoice(), undefined);
  assert.equal(resolveAzureVoiceLiveVoice(control), undefined);
  const parsed = parseAgentConfig(draft());
  const legacy = { ...draft(), systemPrompt: '', openingMessage: '', voiceProfile: 'provider-default', enabledTools: [] };
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.deepEqual(parsed, legacy);
  assert.equal(Object.hasOwn(parsed, 'liveVoice'), false);
  assert.equal(digest(parsed), digest(legacy));
  assert.notEqual(digest(parseAgentConfig({ ...draft(), liveVoice: control })), digest(legacy));
});

test('Taxila selections map to exact Azure standard HD voices without native substitution or SSML options', () => {
  assert.deepEqual(resolveAzureVoiceLiveVoice(diya), { type: 'azure-standard', name: 'en-IN-Diya:DragonHDLatestNeural' });
  assert.deepEqual(resolveAzureVoiceLiveVoice(arjun), { type: 'azure-standard', name: 'en-IN-Arjun:DragonHDLatestNeural' });
  assert.equal(Object.isFrozen(resolveAzureVoiceLiveVoice(diya)), true);
});

test('AgentConfig preserves live selection, rejects any explicit Maya combination and retains speech delivery', () => {
  const speechDelivery = { version: 1, pace: 'unhurried', adaptToRequests: true };
  for (const liveVoice of [control, diya, arjun]) {
    const parsed = parseAgentConfig({ ...draft(), liveVoice, speechDelivery });
    assert.deepEqual(parsed.liveVoice, liveVoice);
    assert.deepEqual(parsed.speechDelivery, speechDelivery);
    assert.throws(() => parseAgentConfig({ ...draft(), voiceProfile: 'maya-despina', liveVoice }),
      (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.equal(parseAgentConfig({ ...draft(), voiceProfile: 'maya-despina' }).liveVoice, undefined);
  assert.throws(() => parseAgentConfig({ ...draft(), liveVoice: { ...diya, rate: '0.9' } }),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.message === 'Invalid live voice configuration.');
});

test('agent versions preserve exact live selection and Voice Live cannot publish or rollback before qualification', async () => {
  const user = (await authenticate({ mode: 'register', email: 'live-voice-contract@example.test', password: 'correct password', organization: 'Live Voice Contract' },
    new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } }))).user;
  const agent = await handleAgentAction(user, 'agent.create', { ...draft(), liveVoice: diya }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  assert.deepEqual((version.data.config as AgentConfig).liveVoice, diya);
  const run = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const packet = await getReleaseReviewPacket(user, version.id, run.id);
  assert.equal(packet.publishable, false);
  assert.ok(packet.blockers.includes(LIVE_VOICE_PUBLICATION_BLOCKER));
  for (const action of ['release.publish', 'release.rollback']) await assert.rejects(() => handleAgentAction(user, action,
    { versionId: version.id, testRunId: run.id, currentReleaseId: null }),
  (error: unknown) => error instanceof HttpError && error.status === 409 && error.message.includes(LIVE_VOICE_PUBLICATION_BLOCKER));
  await handleAgentAction(user, 'agent.update', { ...draft(), liveVoice: arjun, agentId: agent.id, revision: agent.revision });
  assert.deepEqual((version.data.config as AgentConfig).liveVoice, diya);
});

test('AI prose proposals preserve live voice, reject engine edits and become stale after a preset change', async () => {
  const user = (await authenticate({ mode: 'register', email: 'live-voice-proposal@example.test', password: 'correct password', organization: 'Live Voice Proposals' },
    new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } }))).user;
  const agent = await handleAgentAction(user, 'agent.create', { ...draft(), liveVoice: diya }) as PlatformRecord;
  const fake = (changes: Record<string, unknown>) => (async () => ({ text: JSON.stringify({ changes, explanation: 'Use concise language.' }), model: 'mock-azure', runId: 'mock-live-voice-run', usage: { inputTokens: 30, outputTokens: 20 }, cached: false })) as typeof runAiTask;
  const body = (requestId: string) => ({ agentId: agent.id, revision: agent.revision, requestId, instruction: 'Make the responses more concise.' });
  const forbidden = await proposeAgentRevision(user, body('live-voice-forbidden'), { ai: fake({ liveVoice: arjun }) });
  assert.equal(forbidden.status, 'invalid');
  const proposal = await proposeAgentRevision(user, body('live-voice-prose'), { ai: fake({ responseStyle: 'Use concise language and one question at a time.' }) });
  assert.equal(proposal.status, 'ready');
  assert.deepEqual(proposal.data.before.liveVoice, diya);
  assert.deepEqual(proposal.data.after?.liveVoice, diya);
  await handleAgentAction(user, 'agent.update', { ...draft(), liveVoice: arjun, agentId: agent.id, revision: agent.revision });
  await assert.rejects(() => applyAgentRevision(user, { proposalId: proposal.id }), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.deepEqual((await getRecord(user.organizationId, 'agent_definition', agent.id)).data.liveVoice, arjun);
});

test('private preview binds exact live selection without changing legacy vocabulary or plain context digests', async () => {
  const user = (await authenticate({ mode: 'register', email: 'live-voice-context@example.test', password: 'correct password', organization: 'Live Voice Context' },
    new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } }))).user;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const context = await compileAgentContext(user, parseAgentConfig(draft()), []);
  assert.equal(context.contextDigest, hash(context.instructions));
  const vocabulary = ['Acme'];
  const withVocabulary = await compileAgentContext(user, parseAgentConfig({ ...draft(), speechVocabulary: vocabulary }), []);
  assert.equal(withVocabulary.contextDigest, hash(JSON.stringify({ instructions: withVocabulary.instructions, speechVocabulary: vocabulary })));
  const digests = new Set([context.contextDigest]);
  for (const liveVoice of [control, diya, arjun]) {
    const preview = await previewVoiceContext(user, { draft: { ...draft(), liveVoice } });
    assert.equal(preview.contextMode, 'preview');
    assert.deepEqual(preview.agent.liveVoice, liveVoice);
    assert.equal(preview.instructions, context.instructions);
    assert.equal(preview.contextDigest, hash(JSON.stringify({ instructions: preview.instructions, liveVoice })));
    digests.add(preview.contextDigest);
  }
  assert.equal(digests.size, 4);
});

test('a historically bound release cannot silently call Realtime after its selected engine is Voice Live', async () => {
  const user = (await authenticate({ mode: 'register', email: 'live-voice-historical@example.test', password: 'correct password', organization: 'Live Voice Historical' },
    new Request('http://localhost:3000/api/test', { headers: { origin: 'http://localhost:3000' } }))).user;
  const agent = await handleAgentAction(user, 'agent.create', draft()) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const ids = { agentId: agent.id, versionId: version.id, releaseId: release.id };
  assert.equal((await releasedVoiceContext(user, ids)).agent.liveVoice, undefined);
  const database = await db();
  const [row] = await database.all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=?', [version.id, user.organizationId]);
  const stored = JSON.parse(row.data);
  stored.data.config.liveVoice = diya;
  await database.run('UPDATE entities SET data=? WHERE id=? AND organization_id=?', [JSON.stringify(stored), version.id, user.organizationId]);
  await assert.rejects(() => releasedVoiceContext(user, ids), (error: unknown) => error instanceof HttpError && error.status === 409 && error.message === LIVE_VOICE_PUBLICATION_BLOCKER);
});
