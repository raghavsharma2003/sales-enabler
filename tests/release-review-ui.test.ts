import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformRecord } from '../lib/platform/contracts';
import type { ReleaseReviewPacket } from '../lib/regression/contracts';
import {
  configurationEvidenceStatus,
  isReleaseReviewPacket,
  latestConfigurationRun,
  releaseMutationBody,
  releaseReviewContextKey,
  releaseReviewRequest,
} from '../lib/platform/release-review';

const record = (kind: string, id: string, data: Record<string, unknown>, extra: Partial<PlatformRecord> = {}): PlatformRecord => ({
  kind, id, data, status: 'draft', revision: 1, createdAt: '2026-10-09T09:00:00.000Z', updatedAt: '2026-10-09T09:00:00.000Z', ...extra,
});
const agent = record('agent_definition', 'agent', { name: 'Advisor', objective: 'Arrange an accountable follow-up.' });
const version = record('agent_version', 'version-2', { agentId: agent.id, number: 2, config: { knowledgeIds: ['source'] } });
const passed = record('test_run', 'passed-first', { agentId: agent.id, versionId: version.id, mode: 'configuration', passed: true }, { status: 'passed' });
const failed = record('test_run', 'failed-latest', { agentId: agent.id, versionId: version.id, mode: 'configuration', passed: false }, { status: 'failed', createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z' });
const packet: ReleaseReviewPacket = {
  schemaVersion: 1,
  operation: 'publish',
  agentId: agent.id,
  agentVersionId: version.id,
  agentVersionNumber: 2,
  latestVersionId: version.id,
  currentReleaseId: 'release-1',
  testRunId: passed.id,
  configurationPassed: true,
  mode: 'configuration_only',
  suite: { executionMode: 'text_rehearsal', evidenceScope: 'transcript_relationship', agentId: agent.id, agentVersionId: version.id, caseSetDigest: 'cases', requiredCases: 0, passing: true, cases: [], disclaimer: 'Text only.' },
  blockers: [],
  publishable: true,
  reviewPacketDigest: 'review-digest',
  disclaimer: 'Configuration only.',
};

test('release UI chooses the newest exact-version configuration result, even when it is a failure', () => {
  const wrongVersion = record('test_run', 'other', { agentId: agent.id, versionId: 'version-1', mode: 'configuration', passed: true }, { createdAt: '2026-10-09T11:00:00.000Z' });
  assert.equal(latestConfigurationRun([passed, wrongVersion, failed], agent.id, version.id)?.id, failed.id);
  assert.equal(configurationEvidenceStatus(null, failed), 'failed');
  assert.equal(configurationEvidenceStatus(null, undefined), 'missing');
});

test('a nonpassing check wins a same-timestamp tie over a passing check', () => {
  const tiedFailure = { ...failed, createdAt: passed.createdAt, updatedAt: passed.updatedAt, id: 'a-failed-at-same-time' };
  assert.equal(latestConfigurationRun([passed, tiedFailure], agent.id, version.id)?.id, tiedFailure.id);
  assert.equal(latestConfigurationRun([tiedFailure, passed], agent.id, version.id)?.id, tiedFailure.id);
});

test('a passing local result remains unreviewed until the authoritative packet accepts it', () => {
  assert.equal(configurationEvidenceStatus(null, passed), 'unreviewed');
  assert.equal(configurationEvidenceStatus(packet, passed), 'passed');
  assert.equal(configurationEvidenceStatus({ ...packet, configurationPassed: false }, passed), 'stale');
});

test('review and publish bodies preserve the exact operation, run, release binding and packet digest', () => {
  assert.deepEqual(releaseReviewRequest(version, passed, 'rollback'), { versionId: version.id, testRunId: passed.id, operation: 'rollback' });
  assert.deepEqual(releaseReviewRequest(version, undefined, 'publish'), { versionId: version.id, operation: 'publish' });
  assert.deepEqual(releaseMutationBody(packet), {
    versionId: version.id,
    testRunId: passed.id,
    currentReleaseId: 'release-1',
    reviewPacketDigest: 'review-digest',
  });
  assert.throws(() => releaseMutationBody({ ...packet, publishable: false }), /resolve every blocker/);
  assert.equal(isReleaseReviewPacket(packet), true);
  assert.equal(isReleaseReviewPacket({ ...packet, suite: undefined }), false);
});

test('review context invalidates on draft, version, source, active release and record changes', () => {
  const source = record('brain_source', 'source', {}, { status: 'approved' });
  const active = record('release', 'release-1', { agentId: agent.id, versionId: 'version-1' }, { status: 'active' });
  const base = { records: [agent, version, passed, source, active], agent, version, run: passed, activeRelease: active, dirty: false, operation: 'publish' as const };
  const key = releaseReviewContextKey(base);
  assert.equal(key, releaseReviewContextKey({ ...base, records: [...base.records].reverse() }));
  assert.notEqual(key, releaseReviewContextKey({ ...base, dirty: true }));
  assert.notEqual(key, releaseReviewContextKey({ ...base, operation: 'rollback' }));
  assert.notEqual(key, releaseReviewContextKey({ ...base, version: { ...version, revision: 2 } }));
  assert.notEqual(key, releaseReviewContextKey({ ...base, records: base.records.map(item => item.id === source.id ? { ...item, revision: 2 } : item) }));
  assert.notEqual(key, releaseReviewContextKey({ ...base, activeRelease: { ...active, revision: 2 } }));
});
