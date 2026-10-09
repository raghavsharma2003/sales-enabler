import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAgentReadiness } from '../lib/platform/agent-readiness';
import type { PlatformRecord } from '../lib/platform/contracts';

const createdAt = '2026-10-09T12:00:00.000Z';
const record = (kind: string, id: string, data: Record<string, unknown>, status = 'draft'): PlatformRecord => ({
  kind, id, data, status, revision: 1, createdAt, updatedAt: createdAt,
});

test('a nonpassing configuration result wins a same-timestamp tie in agent readiness', () => {
  const agent = { ...record('agent_definition', 'agent-1', { name: 'Advisor' }), revision: 2 };
  const version = record('agent_version', 'version-2', { agentId: agent.id, number: 2, sourceRevision: agent.revision, config: { knowledgeIds: [] } });
  const passed = record('test_run', 'z-passed', { agentId: agent.id, versionId: version.id, mode: 'configuration', passed: true, checks: [] }, 'passed');
  const failed = record('test_run', 'a-failed', { agentId: agent.id, versionId: version.id, mode: 'configuration', passed: false, checks: [] }, 'failed');
  const input = { agent, records: [version, passed, failed], dirty: false, busy: false, viewer: false };

  for (const records of [input.records, [...input.records].reverse()]) {
    const readiness = deriveAgentReadiness({ ...input, records });
    assert.equal(readiness.run?.id, failed.id);
    assert.equal(readiness.passing, false);
    assert.equal(readiness.status, 'failed');
    assert.equal(readiness.canPublish, false);
  }
});
