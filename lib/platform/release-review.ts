import type { PlatformRecord } from './contracts';
import type { ReleaseReviewPacket } from '../regression/contracts';

export type ReleaseOperation = ReleaseReviewPacket['operation'];
export type ConfigurationEvidenceStatus = 'missing' | 'failed' | 'unreviewed' | 'stale' | 'passed';

const nonpassing = (record: PlatformRecord) => record.data.passed !== true || record.status !== 'passed';
const newest = (left: PlatformRecord, right: PlatformRecord) => {
  const timestamp = right.createdAt.localeCompare(left.createdAt);
  if (timestamp) return timestamp;
  if (nonpassing(left) !== nonpassing(right)) return nonpassing(left) ? -1 : 1;
  return right.id.localeCompare(left.id);
};

/** The newest exact-version configuration result is authoritative, including a newer failure. */
export function latestConfigurationRun(records: PlatformRecord[], agentId: string | undefined, versionId: string | undefined) {
  if (!agentId || !versionId) return undefined;
  return records
    .filter(record => record.kind === 'test_run'
      && record.data.mode === 'configuration'
      && record.data.agentId === agentId
      && record.data.versionId === versionId)
    .sort(newest)[0];
}

export function configurationEvidenceStatus(packet: ReleaseReviewPacket | null, run?: PlatformRecord): ConfigurationEvidenceStatus {
  if (!run) return 'missing';
  if (run.data.passed !== true || run.status === 'failed') return 'failed';
  if (!packet) return 'unreviewed';
  return packet.configurationPassed ? 'passed' : 'stale';
}

export function releaseReviewRequest(version: PlatformRecord, run: PlatformRecord | undefined, operation: ReleaseOperation) {
  return {
    versionId: version.id,
    ...(run ? { testRunId: run.id } : {}),
    operation,
  };
}

export function releaseMutationBody(packet: ReleaseReviewPacket) {
  if (!packet.publishable || !packet.testRunId) throw new Error('Refresh the release review and resolve every blocker before publishing.');
  return {
    versionId: packet.agentVersionId,
    testRunId: packet.testRunId,
    currentReleaseId: packet.currentReleaseId,
    reviewPacketDigest: packet.reviewPacketDigest,
  };
}

export function isReleaseReviewPacket(value: unknown): value is ReleaseReviewPacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const packet = value as Partial<ReleaseReviewPacket>;
  return packet.schemaVersion === 1
    && (packet.operation === 'publish' || packet.operation === 'rollback')
    && typeof packet.agentId === 'string'
    && typeof packet.agentVersionId === 'string'
    && typeof packet.agentVersionNumber === 'number'
    && typeof packet.configurationPassed === 'boolean'
    && Array.isArray(packet.blockers)
    && typeof packet.publishable === 'boolean'
    && typeof packet.reviewPacketDigest === 'string'
    && !!packet.suite
    && typeof packet.suite.requiredCases === 'number'
    && Array.isArray(packet.suite.cases);
}

/** Invalidates a reviewed packet when any local release authority or source record changes. */
export function releaseReviewContextKey(input: {
  records: PlatformRecord[];
  agent?: PlatformRecord;
  version?: PlatformRecord;
  run?: PlatformRecord;
  activeRelease?: PlatformRecord;
  dirty?: boolean;
  operation: ReleaseOperation;
}) {
  const authorityKinds = new Set(['agent_definition', 'agent_version', 'test_run', 'release', 'brain_source']);
  const records = input.records
    .filter(record => authorityKinds.has(record.kind))
    .map(record => [record.kind, record.id, record.revision, record.status, record.updatedAt].join(':'))
    .sort();
  return JSON.stringify({
    operation: input.operation,
    dirty: !!input.dirty,
    agent: input.agent ? [input.agent.id, input.agent.revision, input.agent.updatedAt] : null,
    version: input.version ? [input.version.id, input.version.revision, input.version.updatedAt] : null,
    run: input.run ? [input.run.id, input.run.revision, input.run.status, input.run.updatedAt] : null,
    active: input.activeRelease ? [input.activeRelease.id, input.activeRelease.revision, input.activeRelease.status, input.activeRelease.updatedAt] : null,
    records,
  });
}
