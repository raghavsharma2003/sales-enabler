import type { PlatformRecord, PlatformViewProps } from './contracts';

export type ReadinessInput = {
  agent?: PlatformRecord;
  records: PlatformRecord[];
  dirty: boolean;
  busy: boolean;
  viewer: boolean;
};
export type ReadinessCheck = { label: string; passed: boolean; detail: string };

const newest = (a: PlatformRecord, b: PlatformRecord) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
const knowledgeIds = (version: PlatformRecord): string[] => {
  const config = version.data.config as Record<string, unknown> | undefined;
  return Array.isArray(config?.knowledgeIds) ? config.knowledgeIds.filter((id): id is string => typeof id === 'string') : [];
};

/** Local evidence only: the server verifies source digests again when publishing. */
export function versionKnowledgeState(version: PlatformRecord, records: PlatformRecord[]): 'current' | 'changed' | 'unknown' {
  const capturedAt = Date.parse(version.createdAt);
  let unknown = false;
  for (const id of knowledgeIds(version)) {
    const source = records.find(record => record.kind === 'brain_source' && record.id === id);
    if (!source || source.status !== 'approved') return 'changed';
    const updatedAt = Date.parse(source.updatedAt);
    if (!Number.isFinite(capturedAt) || !Number.isFinite(updatedAt)) unknown = true;
    else if (updatedAt > capturedAt) return 'changed';
  }
  return unknown ? 'unknown' : 'current';
}

export function deriveAgentReadiness({ agent, records, dirty, busy, viewer }: ReadinessInput) {
  const version = agent ? records.filter(record => record.kind === 'agent_version' && record.data.agentId === agent.id)
    .sort((a, b) => Number(b.data.number) - Number(a.data.number) || newest(a, b))[0] : undefined;
  const currentVersion = !!agent && !!version && version.data.sourceRevision === agent.revision;
  const run = version ? records.filter(record => record.kind === 'test_run' && record.data.agentId === agent?.id && record.data.versionId === version.id && record.data.mode === 'configuration').sort(newest)[0] : undefined;
  const active = agent ? records.filter(record => record.kind === 'release' && record.status === 'active' && record.data.agentId === agent.id).sort(newest)[0] : undefined;
  const knowledge = version ? versionKnowledgeState(version, records) : 'unknown';
  const passing = currentVersion && knowledge === 'current' && run?.data.passed === true;
  const alreadyActive = !!version && active?.data.versionId === version.id;
  const checks: ReadinessCheck[] = Array.isArray(run?.data.checks) ? run.data.checks.filter((check): check is ReadinessCheck => !!check && typeof check === 'object' && typeof check.label === 'string' && typeof check.passed === 'boolean' && typeof check.detail === 'string') : [];
  const status = !agent ? 'unsaved' : dirty ? 'dirty' : !currentVersion ? 'uncaptured' : knowledge !== 'current' ? 'outdated' : alreadyActive ? 'released' : !run ? 'unchecked' : passing ? 'ready' : 'failed';
  return { version, currentVersion, run, active, knowledge, passing, alreadyActive, checks, status,
    canCheck: !!agent && !dirty && !busy && !viewer,
    canPublish: !!passing && !alreadyActive && !dirty && !busy && !viewer,
  };
}

function recordResult(value: unknown, kind: string): PlatformRecord {
  const record = value as PlatformRecord | undefined;
  if (!record || record.kind !== kind || typeof record.id !== 'string' || !record.data) throw new Error('The server result could not be verified. Refresh the workspace before trying again.');
  return record;
}

/** Capture only if needed, then check that exact immutable version. Never publishes. */
export async function prepareAgentReadiness(input: ReadinessInput, act: PlatformViewProps['act'], stillCurrent: () => boolean = () => true) {
  const state = deriveAgentReadiness(input);
  if (!state.canCheck || !input.agent) throw new Error(input.viewer ? 'Operator access is required to run checks.' : input.dirty ? 'Save your changes before running readiness checks.' : 'Save the agent and wait for the current action to finish.');
  const version = state.currentVersion && state.version ? state.version : recordResult(await act('agent.version', { agentId: input.agent.id, revision: input.agent.revision }), 'agent_version');
  if (version.data.agentId !== input.agent.id || version.data.sourceRevision !== input.agent.revision || !stillCurrent()) throw new Error('The saved agent changed. Review the current draft, then run readiness checks again.');
  const run = recordResult(await act('test.run', { versionId: version.id }), 'test_run');
  if (run.data.agentId !== input.agent.id || run.data.versionId !== version.id || run.data.mode !== 'configuration') throw new Error('The check result does not match this version. Refresh the workspace and run checks again.');
  if (!stillCurrent()) throw new Error('The agent changed while checks ran. Save the current draft and run readiness checks again.');
  return { version, run };
}

export function agentPublishBody(input: ReadinessInput) {
  const state = deriveAgentReadiness(input);
  if (!state.canPublish || !state.version || !state.run) throw new Error('Run passing readiness checks for the current saved agent before publishing.');
  return { versionId: state.version.id, testRunId: state.run.id, currentReleaseId: state.active?.id || null };
}
