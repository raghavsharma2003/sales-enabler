import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { HttpError, field } from '../server/http';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from './records';
import { isVoiceToolName, normalizeVoiceTools, type VoiceToolName } from '../voice/tools/contracts';
import { normalizeSpeechVocabulary, SpeechVocabularyValidationError } from '../voice/speech-vocabulary';
import { parseSpeechDeliveryProfile, SpeechDeliveryValidationError, type SpeechDeliveryProfile } from '../voice/speech-delivery';
import { parseLiveVoiceProfile, LiveVoiceValidationError, LIVE_VOICE_PUBLICATION_BLOCKER, type LiveVoiceProfile } from '../voice/live-voice';
import { prepareRegressionReleaseGate } from '../regression/service';
import { TEXT_REHEARSAL_DISCLAIMER, type RegressionReleaseEvidence, type ReleaseReviewPacket } from '../regression/contracts';
import { operatorMembershipFence } from '../team/service';

export type AgentConfig = {
  name: string; role: string; objective: string; disclosure: string;
  primaryLanguage: string; allowedLanguages: string[];
  responseStyle: string; memoryScope: 'none' | 'approved_contact';
  escalation: string; knowledgeIds: string[];
  systemPrompt?: string;
  openingMessage?: string;
  voiceProfile?: 'provider-default' | 'maya-despina';
  enabledTools?: VoiceToolName[];
  speechVocabulary?: string[];
  speechDelivery?: SpeechDeliveryProfile;
  liveVoice?: LiveVoiceProfile;
};
type AgentVersion = { agentId: string; number: number; config: AgentConfig; knowledgeDigests: Record<string, string>; sourceRevision: number };
type TestRun = { agentId: string; versionId: string; checks: { label: string; passed: boolean; detail: string }[]; passed: boolean; mode: 'configuration'; disclaimer: string };
type Release = { agentId: string; versionId: string; testRunId: string; channel: 'browser'; supersedesId?: string; reason?: string; reviewPacketDigest?: string; regressionEvidence?: RegressionReleaseEvidence };
type Statement = Parameters<Database['batch']>[0][number];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const textArray = (value: unknown, label: string, max = 20): string[] => {
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== 'string' || !v.trim() || v.length > 120)) throw new HttpError(400, `${label} must be a list of short text values.`);
  return [...new Set(value.map((v: string) => v.trim()))];
};
export function parseAgentConfig(body: Record<string, unknown>): AgentConfig {
  const memoryScope = body.memoryScope;
  if (memoryScope !== 'none' && memoryScope !== 'approved_contact') throw new HttpError(400, 'Choose a supported relationship memory scope.');
  const primaryLanguage = field(body, 'primaryLanguage', 80);
  if (body.voiceProfile !== undefined && body.voiceProfile !== 'provider-default' && body.voiceProfile !== 'maya-despina') throw new HttpError(400, 'Choose an installed voice profile.');
  const allowedLanguages = textArray(body.allowedLanguages, 'allowedLanguages');
  let liveVoice: LiveVoiceProfile | undefined;
  try { liveVoice = parseLiveVoiceProfile(body.liveVoice); }
  catch (error) {
    if (error instanceof LiveVoiceValidationError) throw new HttpError(400, error.message);
    throw error;
  }
  if (liveVoice && body.voiceProfile === 'maya-despina') throw new HttpError(400, 'Live voice selection cannot be combined with the Maya voice profile.');
  let speechDelivery: SpeechDeliveryProfile | undefined;
  try { speechDelivery = parseSpeechDeliveryProfile(body.speechDelivery); }
  catch (error) {
    if (error instanceof SpeechDeliveryValidationError) throw new HttpError(400, error.message);
    throw error;
  }
  if (speechDelivery && body.voiceProfile === 'maya-despina') throw new HttpError(400, 'Speech delivery settings require the Azure provider-default voice profile.');
  let speechVocabulary: string[];
  try { speechVocabulary = normalizeSpeechVocabulary(body.speechVocabulary); }
  catch (error) {
    if (error instanceof SpeechVocabularyValidationError) throw new HttpError(400, error.message);
    throw error;
  }
  if (body.enabledTools !== undefined && (!Array.isArray(body.enabledTools) || body.enabledTools.length > 3 || body.enabledTools.some(value => !isVoiceToolName(value)))) throw new HttpError(400, 'Choose only installed agent actions.');
  if (!allowedLanguages.includes(primaryLanguage)) throw new HttpError(400, 'Allowed languages must include the primary language.');
  return {
    name: field(body, 'name', 120), role: field(body, 'role', 160), objective: field(body, 'objective', 3000),
    disclosure: field(body, 'disclosure', 500), primaryLanguage, allowedLanguages,
    responseStyle: field(body, 'responseStyle', 1000), memoryScope,
    escalation: field(body, 'escalation', 1000), knowledgeIds: textArray(body.knowledgeIds, 'knowledgeIds', 100),
    systemPrompt: field(body, 'systemPrompt', 12000, false),
    openingMessage: field(body, 'openingMessage', 1000, false),
    voiceProfile: body.voiceProfile === 'maya-despina' ? 'maya-despina' : 'provider-default',
    enabledTools: normalizeVoiceTools(body.enabledTools),
    ...(speechVocabulary.length ? { speechVocabulary } : {}),
    ...(speechDelivery ? { speechDelivery } : {}),
    ...(liveVoice ? { liveVoice } : {}),
  };
}
const config = parseAgentConfig;
async function knowledgeDigests(user: AuthUser, ids: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(ids.map(async (id) => {
    const source = await getRecord(user.organizationId, 'brain_source', id);
    if (source.status !== 'approved') throw new HttpError(409, 'Agent knowledge must be approved before use.');
    const { title, content, sourceLabel, approvedAt } = source.data;
    return [id, hash(JSON.stringify({ title, content, sourceLabel, revision: source.revision, approvedAt, status: source.status }))] as const;
  }));
  return Object.fromEntries(entries);
}
function revision(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400, 'A current record revision is required.');
  return Number(body.revision);
}
function requireCurrent(record: PlatformRecord, body: Record<string, unknown>): void {
  if (record.revision !== revision(body)) throw new HttpError(409, 'This record changed. Refresh and try again.');
}
async function versionFor(user: AuthUser, versionId: string): Promise<PlatformRecord<AgentVersion>> {
  return await getRecord(user.organizationId, 'agent_version', versionId) as PlatformRecord<AgentVersion>;
}
async function evaluate(user: AuthUser, version: PlatformRecord<AgentVersion>): Promise<TestRun> {
  const { config: c, knowledgeDigests: expected } = version.data;
  const current = await knowledgeDigests(user, c.knowledgeIds);
  const checks = [
    { label: 'AI identity disclosure', passed: /\b(ai|artificial intelligence|virtual assistant)\b/i.test(c.disclosure), detail: 'The introduction must explicitly identify the representative as AI.' },
    { label: 'Goal and escalation', passed: c.objective.length >= 20 && c.escalation.length >= 15, detail: 'A meaningful objective and human escalation instruction are required.' },
    { label: 'Language configuration', passed: c.allowedLanguages.includes(c.primaryLanguage), detail: 'The primary language must remain available.' },
    { label: 'Knowledge authority', passed: JSON.stringify(current) === JSON.stringify(expected), detail: 'Referenced tenant knowledge must match the published version snapshot.' },
  ];
  return { agentId: version.data.agentId, versionId: version.id, checks, passed: checks.every((check) => check.passed), mode: 'configuration', disclaimer: 'Configuration and authority checks only. Speech, model behaviour, audio quality and live customer outcomes were not evaluated.' };
}
async function latestVersion(user: AuthUser, agentId: string): Promise<PlatformRecord<AgentVersion> | undefined> {
  const versions = await listRecords(user.organizationId, 'agent_version') as PlatformRecord<AgentVersion>[];
  return versions.filter((v) => v.data.agentId === agentId).sort((a, b) => b.data.number - a.data.number)[0];
}
async function passingRun(user: AuthUser, versionId: string, runId: string): Promise<PlatformRecord<TestRun>> {
  const run = await getRecord(user.organizationId, 'test_run', runId) as PlatformRecord<TestRun>;
  if (run.data.versionId !== versionId || !run.data.passed || run.data.mode !== 'configuration') throw new HttpError(409, 'A passing check for this exact version is required.');
  return run;
}

async function configurationEpoch(user: AuthUser, versionId: string, database: Database) {
  const id = `agent-test-epoch:${versionId}`;
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [id, user.organizationId, 'platform:test_epoch', 'current', JSON.stringify(randomUUID()), new Date().toISOString()]);
  const [row] = await database.all<{ data: string }>('SELECT data FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, 'platform:test_epoch']);
  if (!row) throw new HttpError(409, 'Configuration check authority changed. Refresh release review.');
  return { id, data: row.data, fence: { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=?', params: [id, user.organizationId, 'platform:test_epoch', row.data], expectedChanges: 1 } satisfies Statement };
}

async function recordConfigurationCheck(user: AuthUser, version: PlatformRecord<AgentVersion>, result: TestRun): Promise<PlatformRecord<TestRun>> {
  const database = await db(), epoch = await configurationEpoch(user, version.id, database);
  const id = randomUUID(), now = new Date().toISOString(), status = result.passed ? 'passed' : 'failed';
  try { await database.batch([
    await operatorMembershipFence(user, database),
    // Serialize every new check with release publication, including insertion phantoms.
    { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=?', params: [JSON.stringify(randomUUID()), epoch.id, user.organizationId, 'platform:test_epoch'], expectedChanges: 1 },
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, 'platform:test_run', status, JSON.stringify({ revision: 1, updatedAt: now, data: result }), now] },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'test_run.created', now] },
  ]); } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Configuration check authority changed. Refresh and run the check again.'); throw error; }
  return { id, kind: 'test_run', status, revision: 1, createdAt: now, updatedAt: now, data: result };
}
async function publish(user: AuthUser, data: Release, version: PlatformRecord<AgentVersion>, active: PlatformRecord<Release> | undefined, fences: Statement[]): Promise<PlatformRecord<Release>> {
  const database = await db();
  const id = randomUUID(), now = new Date().toISOString();
  const lockId = `agent-release:${data.agentId}`;
  const [lock] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [lockId, user.organizationId, 'platform:release_binding']);
  const expected = active?.id || null;
  const currentBinding = lock ? JSON.parse(String(lock.data)) as { activeReleaseId: string | null } : undefined;
  if ((currentBinding?.activeReleaseId || null) !== expected) throw new HttpError(409, 'Active release changed. Refresh before publishing.');
  const statements = [...fences];
  for (const sourceId of version.data.config.knowledgeIds) {
    const [sourceRow] = await database.all('SELECT data, status FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [sourceId, user.organizationId, 'platform:brain_source']);
    if (!sourceRow || sourceRow.status !== 'approved') throw new HttpError(409, 'Agent knowledge changed. Capture and test a new version.');
    const stored = JSON.parse(String(sourceRow.data));
    const sourceData = stored.data;
    const digest = hash(JSON.stringify({ title: sourceData.title, content: sourceData.content, sourceLabel: sourceData.sourceLabel, revision: stored.revision, approvedAt: sourceData.approvedAt, status: sourceRow.status }));
    if (digest !== version.data.knowledgeDigests[sourceId]) throw new HttpError(409, 'Agent knowledge changed. Capture and test a new version.');
    statements.push({ sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [sourceId, user.organizationId, 'platform:brain_source', 'approved', String(sourceRow.data)], expectedChanges: 1 });
  }
  if (lock) statements.push({ sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify({ activeReleaseId: id }), lockId, user.organizationId, 'platform:release_binding', String(lock.data)], expectedChanges: 1 });
  else statements.push({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [lockId, user.organizationId, 'platform:release_binding', 'current', JSON.stringify({ activeReleaseId: id }), now] });
  if (active) {
    const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [active.id, user.organizationId, 'platform:release', 'active']);
    if (!row) throw new HttpError(409, 'Active release changed. Refresh before publishing.');
    const previous = JSON.parse(String(row.data));
    statements.push({ sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: ['superseded', JSON.stringify({ ...previous, revision: active.revision + 1, updatedAt: now }), active.id, user.organizationId, 'platform:release', 'active', String(row.data)], expectedChanges: 1 });
    statements.push({ sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, active.id, 'release.updated:superseded', now] });
  }
  statements.push({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'platform:release', 'active', JSON.stringify({ revision: 1, updatedAt: now, data }), now] });
  statements.push({ sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, 'release.created', now] });
  try { await database.batch(statements); }
  catch (error) { if (error instanceof WriteConflictError || String(error).includes('UNIQUE constraint') || String(error).includes('duplicate key')) throw new HttpError(409, 'Release authority or reviewed evidence changed. Refresh release review before publishing.'); throw error; }
  return { id, kind: 'release', status: 'active', revision: 1, createdAt: now, updatedAt: now, data };
}

async function platformFence(user: AuthUser, record: PlatformRecord, database: Database): Promise<Statement> {
  const [row] = await database.all<{ data: string; status: string }>('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [record.id, user.organizationId, `platform:${record.kind}`]);
  const expected = JSON.stringify({ revision: record.revision, updatedAt: record.updatedAt, data: record.data });
  if (!row || row.data !== expected || row.status !== record.status) throw new HttpError(409, 'Release authority changed. Refresh release review.');
  return { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [record.id, user.organizationId, `platform:${record.kind}`, row.data, row.status], expectedChanges: 1 };
}

async function prepareReleaseReview(user: AuthUser, version: PlatformRecord<AgentVersion>, testRunId?: string, rollback = false) {
  const database = await db();
  const membership = await operatorMembershipFence(user, database);
  const agent = await getRecord(user.organizationId, 'agent_definition', version.data.agentId);
  const agentFence = await platformFence(user, agent, database);
  const latest = await latestVersion(user, agent.id);
  const [binding] = await database.all<{ data: string; status: string }>('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?', [`agent-version:${agent.id}`, user.organizationId, 'platform:version_binding']);
  if (!binding || JSON.parse(binding.data).versionId !== latest?.id) throw new HttpError(409, 'Agent version authority changed. Refresh release review.');
  const versionFence: Statement = { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [`agent-version:${agent.id}`, user.organizationId, 'platform:version_binding', binding.data, binding.status], expectedChanges: 1 };
  const gate = await prepareRegressionReleaseGate(user, version.id, database);
  const active = (await listRecords(user.organizationId, 'release') as PlatformRecord<Release>[]).filter(item => item.data.agentId === agent.id && item.status === 'active');
  const blockers: string[] = [];
  if (version.data.config.liveVoice?.engine === 'azure-voice-live') blockers.push(LIVE_VOICE_PUBLICATION_BLOCKER);
  if (!rollback && latest?.id !== version.id) blockers.push('Only the latest agent version can be published.');
  const fresh = await evaluate(user, version);
  const testEpoch = await configurationEpoch(user, version.id, database);
  const checks = (await listRecords<TestRun>(user.organizationId, 'test_run')).filter(item => item.data.versionId === version.id);
  const latestTimestamp = checks.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, '');
  const latestChecks = checks.filter(item => item.createdAt === latestTimestamp);
  const latestChecksPassed = latestChecks.length > 0 && latestChecks.every(item => item.status === 'passed' && item.data.agentId === agent.id && item.data.passed === true && item.data.mode === 'configuration');
  let configurationPassed = false;
  const fences = [membership, ...gate.fences, agentFence, versionFence, testEpoch.fence];
  for (const latestCheck of latestChecks) fences.push(await platformFence(user, latestCheck, database));
  if (testRunId) {
    const run = await getRecord(user.organizationId, 'test_run', testRunId) as PlatformRecord<TestRun>;
    configurationPassed = latestChecksPassed && latestChecks.some(item => item.id === run.id) && run.status === 'passed' && run.data.agentId === agent.id && run.data.versionId === version.id && run.data.passed === true && run.data.mode === 'configuration' && fresh.passed;
    fences.push(await platformFence(user, run, database));
  }
  if (!configurationPassed) blockers.push('The latest configuration check for this exact version must pass. A failed or nonpassing check at the same latest timestamp also blocks release.');
  if (active.length > 1) blockers.push('Multiple active releases need reconciliation.');
  if (gate.suite.requiredCases && !gate.suite.passing) blockers.push('Every required text case needs a current latest attempt with Met human reviews for all blocking criteria.');
  const facts = {
    schemaVersion: 1 as const, operation: rollback ? 'rollback' as const : 'publish' as const, agentId: agent.id, agentVersionId: version.id, agentVersionNumber: version.data.number,
    latestVersionId: latest?.id || null, currentReleaseId: active[0]?.id || null, testRunId: testRunId || null,
    configurationPassed, mode: gate.evidence.mode, suite: gate.suite, blockers, publishable: blockers.length === 0,
    disclaimer: gate.suite.requiredCases ? TEXT_REHEARSAL_DISCLAIMER : `Configuration checks only; no reviewed conversation regression evidence. ${TEXT_REHEARSAL_DISCLAIMER}`,
  };
  const reviewPacketDigest = hash(JSON.stringify({ facts, authority: gate.authorityDigest, agentRevision: agent.revision, operatorId: user.id, membership, versionBinding: binding.data, configurationEpoch: testEpoch.data, latestChecks }));
  const packet: ReleaseReviewPacket = { ...facts, reviewPacketDigest };
  return { packet, evidence: gate.evidence, fences, active: active[0] };
}

/** Shared read contract for both release UI and final publish enforcement. */
export async function getReleaseReviewPacket(user: AuthUser, versionId: string, testRunId?: string, operation: 'publish' | 'rollback' = 'publish'): Promise<ReleaseReviewPacket> {
  return (await prepareReleaseReview(user, await versionFor(user, versionId), testRunId, operation === 'rollback')).packet;
}

export async function handleAgentAction(user: AuthUser, action: string, body: Record<string, unknown>): Promise<unknown> {
  if (action === 'release.review') {
    if (body.operation !== undefined && body.operation !== 'publish' && body.operation !== 'rollback') throw new HttpError(400, 'Choose publish or rollback for release review.');
    return getReleaseReviewPacket(user, field(body, 'versionId', 100), field(body, 'testRunId', 100, false) || undefined, body.operation === 'rollback' ? 'rollback' : 'publish');
  }
  if (action === 'agent.create') {
    const c = config(body); await knowledgeDigests(user, c.knowledgeIds);
    return createRecord(user, 'agent_definition', c, 'draft');
  }
  if (action === 'agent.update') {
    const current = await getRecord(user.organizationId, 'agent_definition', field(body, 'agentId', 100));
    requireCurrent(current, body);
    const c = config(body); await knowledgeDigests(user, c.knowledgeIds);
    return updateRecord(user, current, c, 'draft');
  }
  if (action === 'agent.version') {
    const agent = await getRecord(user.organizationId, 'agent_definition', field(body, 'agentId', 100)) as PlatformRecord<AgentConfig>;
    requireCurrent(agent, body);
    const last = await latestVersion(user, agent.id);
    if (last?.data.sourceRevision === agent.revision) throw new HttpError(409, 'This saved draft already has a version. Edit it before creating another.');
    const data: AgentVersion = { agentId: agent.id, number: (last?.data.number || 0) + 1, config: agent.data, knowledgeDigests: await knowledgeDigests(user, agent.data.knowledgeIds), sourceRevision: agent.revision };
    const database = await db();
    const lockId = `agent-version:${agent.id}`;
    const [lock] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [lockId, user.organizationId, 'platform:version_binding']);
    const id = randomUUID(), now = new Date().toISOString();
    const statements = [];
    if (lock) {
      const previous = JSON.parse(String(lock.data));
      if (previous.versionId !== last?.id) throw new HttpError(409, 'A new version was captured. Refresh before continuing.');
      statements.push({ sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify({ versionId: id }), lockId, user.organizationId, 'platform:version_binding', String(lock.data)], expectedChanges: 1 });
    } else {
      if (last) throw new HttpError(409, 'Version state changed. Refresh before continuing.');
      statements.push({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [lockId, user.organizationId, 'platform:version_binding', 'current', JSON.stringify({ versionId: id }), now] });
    }
    const [agentRow] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [agent.id, user.organizationId, 'platform:agent_definition']);
    if (!agentRow) throw new HttpError(409, 'Agent changed. Refresh before continuing.');
    if (JSON.parse(String(agentRow.data)).revision !== agent.revision) throw new HttpError(409, 'Agent changed. Refresh before continuing.');
    statements.push({ sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [agent.id, user.organizationId, 'platform:agent_definition', String(agentRow.data)], expectedChanges: 1 });
    statements.push({ sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'platform:agent_version', 'versioned', JSON.stringify({ revision: 1, updatedAt: now, data }), now] });
    statements.push({ sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, id, 'agent_version.created', now] });
    try { await database.batch(statements); } catch (error) { if (error instanceof WriteConflictError || String(error).includes('UNIQUE constraint') || String(error).includes('duplicate key')) throw new HttpError(409, 'A new version was captured. Refresh before continuing.'); throw error; }
    return { id, kind: 'agent_version', status: 'versioned', revision: 1, createdAt: now, updatedAt: now, data };
  }
  if (action === 'test.run') {
    const version = await versionFor(user, field(body, 'versionId', 100));
    const result = await evaluate(user, version);
    return recordConfigurationCheck(user, version, result);
  }
  if (action === 'release.publish' || action === 'release.rollback') {
    const version = await versionFor(user, field(body, 'versionId', 100));
    const agent = await getRecord(user.organizationId, 'agent_definition', version.data.agentId);
    if (action === 'release.publish' && (await latestVersion(user, agent.id))?.id !== version.id) throw new HttpError(409, 'Only the latest agent version can be published.');
    await passingRun(user, version.id, field(body, 'testRunId', 100));
    const fresh = await evaluate(user, version);
    if (!fresh.passed) throw new HttpError(409, 'Version dependencies changed. Run a new check after updating the agent.');
    const review = await prepareReleaseReview(user, version, String(body.testRunId), action === 'release.rollback');
    if (body.currentReleaseId !== review.packet.currentReleaseId) throw new HttpError(409, 'Active release changed. Refresh before publishing.');
    if (!review.packet.publishable) throw new HttpError(409, review.packet.blockers.join(' '));
    if ((review.packet.suite.requiredCases > 0 || body.reviewPacketDigest !== undefined) && body.reviewPacketDigest !== review.packet.reviewPacketDigest) throw new HttpError(409, 'Review the current release packet before publishing; its evidence or authority changed.');
    return publish(user, { agentId: agent.id, versionId: version.id, testRunId: String(body.testRunId), channel: 'browser', supersedesId: review.active?.id, reason: action === 'release.rollback' ? 'Rollback to a tested version' : 'Publish tested version', reviewPacketDigest: review.packet.reviewPacketDigest, regressionEvidence: review.evidence }, version, review.active, review.fences);
  }
  if (action === 'release.stop') {
    const release = await getRecord(user.organizationId, 'release', field(body, 'releaseId', 100));
    requireCurrent(release, body);
    if (release.status !== 'active') throw new HttpError(409, 'Only an active release can be stopped.');
    const database = await db();
    const lockId = `agent-release:${String(release.data.agentId)}`;
    const [lock] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [lockId, user.organizationId, 'platform:release_binding']);
    if (!lock || JSON.parse(String(lock.data)).activeReleaseId !== release.id) throw new HttpError(409, 'Active release changed. Refresh before stopping.');
    const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [release.id, user.organizationId, 'platform:release', 'active']);
    if (!row) throw new HttpError(409, 'Active release changed. Refresh before stopping.');
    const now = new Date().toISOString();
    try { await database.batch([
      { sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', params: [JSON.stringify({ activeReleaseId: null }), lockId, user.organizationId, 'platform:release_binding', String(lock.data)], expectedChanges: 1 },
      { sql: 'UPDATE entities SET status = ?, data = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: ['stopped', JSON.stringify({ revision: release.revision + 1, updatedAt: now, data: release.data }), release.id, user.organizationId, 'platform:release', 'active', String(row.data)], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, release.id, 'release.updated:stopped', now] },
    ]); } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Active release changed. Refresh before stopping.'); throw error; }
    return { ...release, status: 'stopped', revision: release.revision + 1, updatedAt: now };
  }
  throw new HttpError(400, 'Unknown agent action.');
}
