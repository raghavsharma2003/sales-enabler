import type { PlatformRecord } from './contracts';
import type { RegressionListResponse } from '../regression/contracts';

export type TestLabFocus =
  | { kind: 'none' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'case-version'; caseId: string; versionId: string }
  | { kind: 'invalid'; error: string }
  | { kind: 'legacy'; id: string };

const EXACT_PREFIX = 'case-version:';
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

/** Creates one browser-safe focus token binding a rehearsal case to an exact candidate version. */
export function testCaseVersionFocus(caseId: string, versionId: string) {
  return `${EXACT_PREFIX}${encodeURIComponent(caseId)}~${encodeURIComponent(versionId)}`;
}

/** Preserves the existing session, raw case, raw run and raw version focus forms. */
export function parseTestLabFocus(focusId?: string): TestLabFocus {
  if (!focusId) return { kind: 'none' };
  if (focusId.startsWith('session:')) return { kind: 'session', sessionId: focusId.slice('session:'.length) };
  if (!focusId.startsWith(EXACT_PREFIX)) return { kind: 'legacy', id: focusId };
  const payload = focusId.slice(EXACT_PREFIX.length);
  const separator = payload.indexOf('~');
  if (separator <= 0 || separator === payload.length - 1) return { kind: 'invalid', error: 'This case-and-version Test Lab link is incomplete. Return to the release review and open the required case again.' };
  return { kind: 'case-version', caseId: decode(payload.slice(0, separator)), versionId: decode(payload.slice(separator + 1)) };
}

export function configurationTarget(focus: TestLabFocus, versions: PlatformRecord[], runs: PlatformRecord[]) {
  if (focus.kind === 'invalid') return { error: focus.error };
  if (focus.kind === 'case-version') {
    return versions.some(version => version.id === focus.versionId)
      ? { versionId: focus.versionId }
      : { error: `Agent version ${focus.versionId} is unavailable. Return to the release review and refresh its evidence.` };
  }
  if (focus.kind !== 'legacy') return {};
  const version = versions.find(item => item.id === focus.id);
  if (version) return { versionId: version.id };
  const run = runs.find(item => item.id === focus.id);
  return typeof run?.data.versionId === 'string' ? { versionId: run.data.versionId } : {};
}

export function regressionTarget(
  focus: TestLabFocus,
  data: RegressionListResponse,
  versions: PlatformRecord[],
): { caseId?: string; versionId?: string; runId?: string; error?: string } {
  if (focus.kind === 'invalid') return { error: focus.error };
  if (focus.kind === 'case-version') {
    const rehearsalCase = data.cases.find(item => item.id === focus.caseId);
    if (!rehearsalCase) return { error: `Required case ${focus.caseId} is unavailable. Return to the release review and refresh its evidence.` };
    const version = versions.find(item => item.id === focus.versionId);
    if (!version) return { error: `Agent version ${focus.versionId} is unavailable. Return to the release review and refresh its evidence.` };
    if (version.data.agentId !== rehearsalCase.data.agentId) return { error: `Required case ${focus.caseId} does not belong to agent version ${focus.versionId}. Return to the release review and refresh its evidence.` };
    return { caseId: rehearsalCase.id, versionId: version.id };
  }
  if (focus.kind !== 'legacy') return {};
  const run = data.runs.find(item => item.id === focus.id);
  const rehearsalCase = data.cases.find(item => item.id === focus.id)
    || data.cases.find(item => item.id === run?.data.caseId);
  return rehearsalCase ? {
    caseId: rehearsalCase.id,
    ...(run ? { runId: run.id, versionId: run.data.agentVersionId } : {}),
  } : {};
}

export type RegressionSelection = { caseId: string; versionId: string; runId: string; locked: boolean; error?: string };

/** One selection policy for initial load, refresh, exact release links and explicit picker recovery. */
export function regressionSelection(input: {
  focus: TestLabFocus;
  data: RegressionListResponse;
  versions: PlatformRecord[];
  current?: { caseId?: string; versionId?: string; runId?: string };
  preferred?: { caseId?: string; versionId?: string; runId?: string };
  override?: boolean;
}): RegressionSelection {
  const { focus, data, versions, current = {}, preferred, override = false } = input;
  const explicit = !!preferred || override;
  const locked = !explicit && (focus.kind === 'case-version' || focus.kind === 'invalid');
  if (!explicit) {
    const target = regressionTarget(focus, data, versions);
    if (target.error) return { caseId: '', versionId: '', runId: '', locked, error: target.error };
    if (target.caseId) return { caseId: target.caseId, versionId: target.versionId || '', runId: target.runId || '', locked };
  }

  const requestedCaseId = preferred?.caseId || (data.cases.some(item => item.id === current.caseId) ? current.caseId : '') || data.cases.find(item => item.status === 'approved')?.id || '';
  const rehearsalCase = data.cases.find(item => item.id === requestedCaseId);
  if (!rehearsalCase) return { caseId: '', versionId: '', runId: '', locked: false };
  const eligibleVersions = versions.filter(item => item.data.agentId === rehearsalCase.data.agentId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const requestedVersionId = preferred?.versionId || current.versionId || '';
  const versionId = eligibleVersions.some(item => item.id === requestedVersionId) ? requestedVersionId : eligibleVersions[0]?.id || '';
  const requestedRunId = preferred?.runId || current.runId || '';
  const runId = data.runs.some(item => item.id === requestedRunId && item.data.caseId === rehearsalCase.id && (!versionId || item.data.agentVersionId === versionId)) ? requestedRunId : '';
  return { caseId: rehearsalCase.id, versionId, runId, locked: false };
}
