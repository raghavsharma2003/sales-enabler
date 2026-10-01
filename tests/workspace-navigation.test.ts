import assert from 'node:assert/strict';
import test from 'node:test';
import { readWorkspaceHash, resolveSection, sameWorkspaceRoute, searchWorkspace, sectionLabels, workspaceAreas, workspaceHref } from '../lib/platform/navigation';
import type { PlatformRecord, WorkspaceData } from '../lib/platform/contracts';

test('all old section links survive regrouping and new display labels resolve to their original views', () => {
  for (const [section, label] of Object.entries(sectionLabels)) {
    assert.deepEqual(readWorkspaceHash(workspaceHref(section, 'record:one/two')), { section, focusId: 'record:one/two' });
    assert.equal(resolveSection(label), section);
    assert.equal(workspaceAreas.filter(area => (area.sections as readonly string[]).includes(section)).length, 1);
  }
  assert.deepEqual(readWorkspaceHash('#brain/intake'), { section: 'Company brain', focusId: 'intake' });
  assert.equal(readWorkspaceHash('#%E0%A4%A').section, 'Command centre');
  assert.equal(sameWorkspaceRoute({ section: 'Agents', focusId: 'a' }, { section: 'Agents', focusId: 'b' }), false);
});

const workspace = { user: { id: 'u', email: 'qa@example.test' }, organization: { id: 'o', name: 'QA' }, contacts: [{ id: 'customer', name: 'Customer One', createdAt: '' }], knowledge: [], memories: [], actions: [], agents: [], sessions: [{ id: 'call', title: 'Feedback call', createdAt: '2026-10-01' }] } satisfies WorkspaceData;
const record = (id: string, kind: string, data: Record<string, unknown>): PlatformRecord => ({ id, kind, data, revision: 1, status: 'active', createdAt: '', updatedAt: '' });
test('search resolves versions, checks, releases and saved calls to their owning context', () => {
  const records = [record('agent', 'agent_definition', { name: 'Maya' }), record('v', 'agent_version', { agentId: 'agent', number: 2 }), record('t', 'test_run', { versionId: 'v' }), record('r', 'release', { agentId: 'agent' })];
  const results = searchWorkspace('Maya', workspace, records);
  assert.equal(results.find(result => result.id === 'record:v')?.focusId, 'agent');
  assert.deepEqual(results.find(result => result.id === 'record:t'), { id: 'record:t', label: 'Maya · release check', detail: 'Configuration check · active', section: 'Test lab', focusId: 't' });
  assert.equal(results.find(result => result.id === 'record:r')?.focusId, 'r');
  assert.equal(searchWorkspace('feedback', workspace, records)[0].focusId, 'call');
  assert.equal(searchWorkspace('customer one', workspace, records)[0].focusId, 'customer');
});
