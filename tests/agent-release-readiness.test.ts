import test from 'node:test';
import assert from 'node:assert/strict';
import { agentPublishBody, deriveAgentReadiness, prepareAgentReadiness, type ReadinessInput } from '../lib/platform/agent-readiness';
import type { PlatformRecord } from '../lib/platform/contracts';

const record = (kind: string, id: string, data: Record<string, unknown>, extra: Partial<PlatformRecord> = {}): PlatformRecord => ({ kind, id, data, status: 'draft', revision: 1, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', ...extra });
const agent = record('agent_definition', 'agent', { name: 'Advisor', knowledgeIds: [] }, { revision: 2 });
const version = record('agent_version', 'v2', { agentId: agent.id, number: 2, sourceRevision: 2, config: { knowledgeIds: [] } });
const run = record('test_run', 'run2', { agentId: agent.id, versionId: version.id, passed: true, mode: 'configuration', checks: [{ label: 'Disclosure', passed: true, detail: 'AI identity present.' }] });
const input = (records: PlatformRecord[] = [version, run], extra: Partial<ReadinessInput> = {}): ReadinessInput => ({ agent, records, dirty: false, viewer: false, busy: false, ...extra });

test('readiness reuses the latest immutable version of this exact saved revision', async () => {
  const calls: unknown[] = [];
  const result = await prepareAgentReadiness(input(), async (action, body) => { calls.push([action, body]); return run; });
  assert.equal(result.version.id, version.id);
  assert.deepEqual(calls, [['test.run', { versionId: version.id }]]);
});

test('an obsolete or absent version is captured and the returned version is checked exactly', async () => {
  for (const records of [[], [record('agent_version', 'old', { agentId: agent.id, number: 1, sourceRevision: 1 })]]) {
    const calls: unknown[] = [];
    await prepareAgentReadiness(input(records), async (action, body) => { calls.push([action, body]); return action === 'agent.version' ? version : run; });
    assert.deepEqual(calls, [['agent.version', { agentId: agent.id, revision: agent.revision }], ['test.run', { versionId: version.id }]]);
  }
});

test('failed preparation and changed drafts never proceed to testing or publishing', async () => {
  let calls = 0;
  await assert.rejects(prepareAgentReadiness(input([]), async () => { calls++; throw new Error('Capture conflict'); }), /Capture conflict/);
  assert.equal(calls, 1);
  await assert.rejects(prepareAgentReadiness(input([]), async () => version, () => false), /saved agent changed/);
  await assert.rejects(prepareAgentReadiness(input([]), async () => ({ ...version, data: { ...version.data, sourceRevision: 3 } })), /saved agent changed/);
});

test('dirty, viewer, unsaved and busy inputs gate both operations', async () => {
  for (const extra of [{ dirty: true }, { viewer: true }, { agent: undefined }, { busy: true }]) {
    const value = input(undefined, extra);
    const state = deriveAgentReadiness(value);
    assert.equal(state.canCheck, false);
    assert.equal(state.canPublish, false);
    await assert.rejects(prepareAgentReadiness(value, async () => { assert.fail('Mutation must not run'); }));
    assert.throws(() => agentPublishBody(value));
  }
});

test('publish uses only the latest current version, exact passing check and active release binding', () => {
  const active = record('release', 'active', { agentId: agent.id, versionId: 'v1' }, { status: 'active' });
  assert.deepEqual(agentPublishBody(input([version, run, active])), { versionId: version.id, testRunId: run.id, currentReleaseId: active.id });
  assert.equal(deriveAgentReadiness(input()).status, 'ready');
  for (const wrong of [{ versionId: 'other' }, { agentId: 'other' }, { mode: 'voice' }, { passed: false }]) {
    assert.equal(deriveAgentReadiness(input([version, { ...run, data: { ...run.data, ...wrong } }])).canPublish, false);
  }
  const newer = record('agent_version', 'v3', { ...version.data, number: 3, sourceRevision: 3 });
  assert.equal(deriveAgentReadiness(input([version, run, newer])).canPublish, false);
  const newerFailure = record('test_run', 'failed', { ...run.data, passed: false }, { createdAt: '2026-10-01T12:01:00Z' });
  assert.equal(deriveAgentReadiness(input([version, run, newerFailure])).canPublish, false);
});

test('active versions are identified and cannot be published twice', () => {
  const active = record('release', 'active', { agentId: agent.id, versionId: version.id }, { status: 'active' });
  const state = deriveAgentReadiness(input([version, run, active]));
  assert.equal(state.status, 'released');
  assert.equal(state.canPublish, false);
  assert.equal(state.active?.id, active.id);
  assert.equal(deriveAgentReadiness(input([version, run, active], { dirty: true })).status, 'dirty');
});

test('changed, revoked, missing or untraceable sources invalidate old passing checks', () => {
  const sourcedVersion = { ...version, data: { ...version.data, config: { knowledgeIds: ['source'] } } };
  const source = record('brain_source', 'source', {}, { status: 'approved', updatedAt: '2026-10-01T11:00:00Z' });
  assert.equal(deriveAgentReadiness(input([sourcedVersion, run, source])).canPublish, true);
  for (const sources of [[], [{ ...source, status: 'revoked' }], [{ ...source, updatedAt: '2026-10-01T12:01:00Z' }], [{ ...source, updatedAt: 'unknown' }]]) {
    const state = deriveAgentReadiness(input([sourcedVersion, run, ...sources]));
    assert.equal(state.canPublish, false);
    assert.equal(state.status, 'outdated');
  }
});

test('mismatched check responses fail verification', async () => {
  await assert.rejects(prepareAgentReadiness(input(), async () => ({ ...run, data: { ...run.data, versionId: 'different' } })), /does not match/);
});
