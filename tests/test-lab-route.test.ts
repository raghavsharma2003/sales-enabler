import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformRecord } from '../lib/platform/contracts';
import type { RegressionListResponse } from '../lib/regression/contracts';
import { configurationTarget, parseTestLabFocus, regressionSelection, regressionTarget, testCaseVersionFocus } from '../lib/platform/test-lab-route';

const platform = (id: string, agentId = 'agent-1'): PlatformRecord => ({
  id, kind: 'agent_version', status: 'versioned', revision: 1, createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:00Z', data: { agentId, number: 2 },
});
const cases = [{ id: 'case:/one', status: 'approved', createdAt: '2026-10-09T10:00:00Z', data: { agentId: 'agent-1' } }] as unknown as RegressionListResponse['cases'];
const runs = [{ id: 'run-1', status: 'complete', createdAt: '2026-10-09T10:00:00Z', data: { caseId: 'case:/one', agentVersionId: 'version:?two' } }] as unknown as RegressionListResponse['runs'];
const data: RegressionListResponse = { cases, runs, reviews: [] };

test('exact case/version focus is browser-safe and round trips reserved characters', () => {
  const value = testCaseVersionFocus('case:/one', 'version:?two');
  assert.equal(value, 'case-version:case%3A%2Fone~version%3A%3Ftwo');
  assert.deepEqual(parseTestLabFocus(value), { kind: 'case-version', caseId: 'case:/one', versionId: 'version:?two' });
});

test('legacy session, raw case, raw run and raw version focus forms remain intact', () => {
  assert.deepEqual(parseTestLabFocus('session:call-1'), { kind: 'session', sessionId: 'call-1' });
  assert.deepEqual(parseTestLabFocus('case:/one'), { kind: 'legacy', id: 'case:/one' });
  assert.deepEqual(parseTestLabFocus('run-1'), { kind: 'legacy', id: 'run-1' });
  assert.deepEqual(configurationTarget(parseTestLabFocus('version:?two'), [platform('version:?two')], []), { versionId: 'version:?two' });
  assert.deepEqual(regressionTarget(parseTestLabFocus('run-1'), data, [platform('version:?two')]), { caseId: 'case:/one', runId: 'run-1', versionId: 'version:?two' });
});

test('exact target resolves both records and never substitutes an unavailable or wrong-agent version', () => {
  const focus = parseTestLabFocus(testCaseVersionFocus('case:/one', 'version:?two'));
  assert.deepEqual(configurationTarget(focus, [platform('version:?two')], []), { versionId: 'version:?two' });
  assert.deepEqual(regressionTarget(focus, data, [platform('version:?two')]), { caseId: 'case:/one', versionId: 'version:?two' });
  assert.match(configurationTarget(focus, [], []).error || '', /unavailable/);
  assert.match(regressionTarget(focus, data, []).error || '', /unavailable/);
  assert.match(regressionTarget(focus, data, [platform('version:?two', 'agent-2')]).error || '', /does not belong/);
  assert.match(regressionTarget(parseTestLabFocus(testCaseVersionFocus('missing-case', 'version:?two')), data, [platform('version:?two')]).error || '', /Required case missing-case is unavailable/);
});

test('selection stays fail-closed across refresh until a person explicitly overrides the target', () => {
  const focus = parseTestLabFocus(testCaseVersionFocus('case:/one', 'missing-version'));
  const missing = regressionSelection({ focus, data, versions: [platform('version:?two')] });
  assert.equal(missing.locked, true);
  assert.equal(missing.caseId, '');
  assert.equal(missing.versionId, '');
  assert.match(missing.error || '', /missing-version is unavailable/);

  const refreshed = regressionSelection({ focus, data, versions: [platform('version:?two')], current: { caseId: 'case:/one', versionId: 'version:?two' } });
  assert.equal(refreshed.caseId, '');
  assert.equal(refreshed.versionId, '');

  const recovered = regressionSelection({ focus, data, versions: [platform('version:?two')], current: { caseId: 'case:/one', versionId: 'version:?two' }, override: true });
  assert.deepEqual(recovered, { caseId: 'case:/one', versionId: 'version:?two', runId: '', locked: false });
});

test('malformed exact routes are errors rather than legacy IDs and can recover only by explicit selection', () => {
  const focus = parseTestLabFocus('case-version:case-only');
  assert.equal(focus.kind, 'invalid');
  const blocked = regressionSelection({ focus, data, versions: [platform('version:?two')] });
  assert.equal(blocked.locked, true);
  assert.equal(blocked.caseId, '');
  assert.match(blocked.error || '', /incomplete/);
  assert.deepEqual(regressionSelection({ focus, data, versions: [platform('version:?two')], current: { caseId: 'case:/one', versionId: 'version:?two' }, override: true }), { caseId: 'case:/one', versionId: 'version:?two', runId: '', locked: false });
});
