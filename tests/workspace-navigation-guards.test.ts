import assert from 'node:assert/strict';
import test from 'node:test';
import { readWorkspaceHash, sameWorkspaceRoute, searchWorkspace, workspaceHref } from '../lib/platform/navigation';
import type { PlatformRecord, WorkspaceData } from '../lib/platform/contracts';
import { WorkspaceHistoryGuard } from '../lib/platform/history-guard';
import type { WorkspaceRoute } from '../lib/platform/navigation';

const workspace: WorkspaceData = {
  user: { id: 'reviewer', email: 'reviewer@example.test', role: 'viewer' },
  organization: { id: 'company', name: 'Company' },
  contacts: [], knowledge: [], memories: [], actions: [], sessions: [], agents: [],
};

test('search finds persisted agent_deployment records and preserves their exact channel target', () => {
  // This is the kind returned by createDeployment/listDeployments and /api/platform.
  const channel: PlatformRecord = {
    id: 'channel:private/one', kind: 'agent_deployment', status: 'paused', revision: 2,
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T11:00:00Z',
    data: { name: 'Admissions website', channel: 'web_chat' },
  };
  const result = searchWorkspace('Admissions website', workspace, [channel]);
  assert.deepEqual(result, [{ id: `record:${channel.id}`, label: 'Admissions website', detail: 'Channel · paused', section: 'Deployments', focusId: channel.id }]);
  assert.deepEqual(readWorkspaceHash(workspaceHref(result[0].section, result[0].focusId)), { section: 'Deployments', focusId: channel.id });
});

test('legacy hashes and canonical rewrites compare as the same route without decoding record IDs twice', () => {
  const aliases = { command: 'Command centre', brain: 'Company brain', groups: 'GroupAI', tests: 'Test lab', representatives: 'Agents', activity: 'Conversations' };
  const focusId = 'literal%2Fpart/हिन्दी?#fragment';
  for (const [alias, section] of Object.entries(aliases)) {
    const legacy = readWorkspaceHash(`#${alias}/${encodeURIComponent(focusId)}`);
    const canonical = readWorkspaceHash(workspaceHref(section, focusId));
    assert.deepEqual(legacy, { section, focusId });
    assert.equal(sameWorkspaceRoute(legacy, canonical), true);
  }
});

function historyHarness() {
  type Entry = { route: WorkspaceRoute; state: unknown };
  const entries: Entry[] = [{ route: { section: 'Company' }, state: { __NA: true, tree: { next: 'preserved' } } }];
  let cursor = 0, pendingGo = 0, prompts = 0, allow = true, scope = 0;
  let rendered = entries[0].route;
  const guard = new WorkspaceHistoryGuard({
    read: () => entries[cursor],
    write: (mode, state, route) => {
      const next = { route: route || entries[cursor].route, state };
      if (mode === 'push') { entries.splice(cursor + 1, entries.length, next); cursor++; }
      else entries[cursor] = next;
    },
    go: delta => { pendingGo = delta; },
    allowLeave: () => { prompts++; return allow; },
    accept: route => { rendered = route; },
    newScope: () => `history-${++scope}`,
  });
  guard.sync();
  return {
    guard, entries,
    get rendered() { return rendered; },
    get prompts() { return prompts; },
    get pendingGo() { return pendingGo; },
    get cursor() { return cursor; },
    setAllow(value: boolean) { allow = value; },
    traverse(delta: number) { cursor += delta; guard.sync(); guard.sync(); },
    restore() { cursor += pendingGo; pendingGo = 0; guard.sync(); guard.sync(); },
    nativeHash(section: string, inheritState = false) {
      entries.splice(cursor + 1, entries.length, { route: { section }, state: inheritState ? entries[cursor].state : null }); cursor++;
      guard.sync(); guard.sync();
    },
  };
}

test('cancelled Back and Forward restore the accepted indexed entry without deleting history or confirming twice', () => {
  const h = historyHarness();
  h.guard.navigate({ section: 'Agents', focusId: 'one' });
  h.guard.navigate({ section: 'Campaigns' });
  const before = structuredClone(h.entries);
  h.setAllow(false);
  const prompts = h.prompts;
  h.traverse(-1);
  assert.equal(h.pendingGo, 1);
  assert.equal(h.prompts, prompts + 1);
  assert.equal(h.rendered.section, 'Campaigns');
  assert.equal(h.guard.navigate({ section: 'Customers' }), false, 'another navigation cannot race history restoration');
  h.restore();
  assert.equal(h.cursor, 2);
  assert.equal(h.prompts, prompts + 1);
  assert.deepEqual(h.entries, before);

  h.setAllow(true); h.traverse(-1);
  assert.equal(h.rendered.section, 'Agents');
  h.setAllow(false);
  const forwardPrompts = h.prompts;
  h.traverse(1);
  assert.equal(h.pendingGo, -1);
  h.restore();
  assert.equal(h.rendered.section, 'Agents');
  assert.equal(h.cursor, 1);
  assert.equal(h.prompts, forwardPrompts + 1);
  assert.deepEqual(h.entries, before);
});

test('new navigation after Back branches the indexed history and preserves Next state fields', () => {
  const h = historyHarness();
  h.guard.navigate({ section: 'Agents' });
  h.guard.navigate({ section: 'Campaigns' });
  h.traverse(-1);
  h.guard.navigate({ section: 'Customers' });
  assert.deepEqual(h.entries.map(entry => entry.route.section), ['Company', 'Agents', 'Customers']);
  for (const entry of h.entries) {
    assert.equal((entry.state as Record<string, unknown>).__NA, true);
    assert.deepEqual((entry.state as Record<string, unknown>).tree, { next: 'preserved' });
  }
  h.setAllow(false); h.traverse(-2);
  assert.equal(h.pendingGo, 2);
  h.restore();
  assert.equal(h.cursor, 2);
});

test('same-route navigation does not prompt or create history entries', () => {
  const h = historyHarness();
  h.setAllow(false);
  assert.equal(h.guard.navigate({ section: 'Company' }), true);
  h.guard.sync();
  assert.equal(h.prompts, 0);
  assert.equal(h.entries.length, 1);
});

test('unindexed native hash cancellation preserves the destination URL and appends the accepted route', () => {
  const h = historyHarness();
  h.guard.navigate({ section: 'Agents' });
  h.setAllow(false);
  const prompts = h.prompts;
  h.nativeHash('Customers');
  assert.equal(h.rendered.section, 'Agents');
  assert.equal(h.prompts, prompts + 1);
  assert.deepEqual(h.entries.map(entry => entry.route.section), ['Company', 'Agents', 'Customers', 'Agents']);
  assert.equal(h.pendingGo, 0, 'unknown entry positions must not guess a traversal direction');
});

test('accepted native hash entries with inherited state receive distinct positions', () => {
  const h = historyHarness();
  h.guard.navigate({ section: 'Agents' });
  h.nativeHash('Customers', true);
  assert.equal(h.rendered.section, 'Customers');
  h.setAllow(false); h.traverse(-1);
  assert.equal(h.pendingGo, 1);
  h.restore();
  assert.equal(h.cursor, 2);
});
