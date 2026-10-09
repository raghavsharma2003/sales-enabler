import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySettingsSnapshot } from '../lib/company/contracts';
import type { PlatformRecord, WorkspaceData, WorkspaceEntity } from '../lib/platform/contracts';
import { deriveWorkspaceJourney } from '../lib/platform/workspace-journey';

const time = '2026-10-01T10:00:00.000Z';

function record(id: string, kind: string, data: Record<string, unknown> = {}, status = 'active', revision = 1, updatedAt = time): PlatformRecord {
  return { id, kind, data, status, revision, createdAt: time, updatedAt };
}

function workspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    user: { id: 'user-1', email: 'owner@example.test', role: 'owner' },
    organization: { id: 'org-1', name: 'Acme' },
    contacts: [], knowledge: [], memories: [], actions: [], sessions: [], agents: [],
    ...overrides,
  };
}

function company(identityReady = true): CompanySettingsSnapshot {
  return {
    profile: {
      id: 'company-1', revision: identityReady ? 1 : 0, status: 'active', name: 'Acme', publicDisplayName: 'Acme',
      website: '', description: identityReady ? 'A saved company description.' : '', industry: identityReady ? 'Services' : '',
      country: 'India', timezone: 'Asia/Kolkata', languages: ['English'], brandAccent: '#5148ce',
    },
    role: 'owner', editable: true,
    publicBrand: { name: 'Acme', accent: '#5148ce', onAccent: '#ffffff', fallbackAccent: '#5148ce', verification: 'workspace_profile_unverified' },
    readiness: [
      { id: 'identity', label: 'Company identity', state: identityReady ? 'ready' : 'missing', count: identityReady ? 1 : 0, detail: identityReady ? 'A public name, description, and industry are recorded.' : 'Add a public name, description, and industry.', target: 'Company', actionLabel: 'Review identity' },
      { id: 'connections', label: 'Connected systems', state: 'missing', count: 0, detail: 'No checked connection.', target: 'Integrations', actionLabel: 'Open integrations' },
      { id: 'offering', label: 'Approved offering', state: 'missing', count: 0, detail: 'No approved offering.', target: 'Company brain', actionLabel: 'Review offerings' },
      { id: 'release', label: 'Active browser release', state: 'missing', count: 0, detail: 'No active browser release.', target: 'Releases', actionLabel: 'Open releases' },
      { id: 'deployment', label: 'Published deployment', state: 'missing', count: 0, detail: 'No published deployment.', target: 'Deployments', actionLabel: 'Open deployments' },
    ],
  };
}

function setupCampaign(id: string, phase: 'intent' | 'audience' | 'agent_content' | 'review', fields: Record<string, unknown>, updatedAt = time) {
  return record(id, 'campaign', { schemaVersion: 1, phase, fields, ownerId: 'user-1', requestDigest: `request-${id}` }, 'setup', 1, updatedAt);
}

test('a new workspace uses company readiness before empty record counts', () => {
  const result = deriveWorkspaceJourney({ records: [], workspace: workspace(), company: { status: 'ready', snapshot: company(false) } });
  assert.equal(result.recommended.title, 'Describe your company');
  assert.equal(result.recommended.section, 'Company');
  assert.equal(result.company.state, 'attention');
  assert.equal(result.returningWorkspace, false);
});

test('a revoked source is not treated as approved knowledge and voice-first creation remains available', () => {
  const result = deriveWorkspaceJourney({
    records: [record('source-1', 'brain_source', { title: 'Old handbook' }, 'revoked')],
    workspace: workspace(), company: { status: 'ready', snapshot: company() },
  });
  assert.equal(result.recommended.section, 'brain/intake');
  assert.match(result.recommended.evidence, /No approved/);
  assert.equal(result.steps.find(step => step.id === 'knowledge')?.state, 'optional');
  assert.ok(result.alternatives.some(item => item.section === 'agents' && item.focusId === 'new' && item.label === 'Create agent'));
});

test('agent readiness opens the unified Publish panel for draft changes and current checks', () => {
  const agent = record('agent-1', 'agent_definition', { name: 'Maya', role: 'Guide' }, 'active', 2, '2026-10-01T12:00:00.000Z');
  const oldVersion = record('version-1', 'agent_version', { agentId: agent.id, number: 1, sourceRevision: 1, config: { knowledgeIds: [] } });
  const base = [record('source-1', 'brain_source', {}, 'approved'), agent, oldVersion];
  const stale = deriveWorkspaceJourney({ records: base, workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(stale.recommended.section, 'agents');
  assert.equal(stale.recommended.focusId, agent.id);
  assert.equal(stale.recommended.title, 'Review and publish Maya');
  assert.match(stale.recommended.reason, /draft has changes; run checks in Publish/i);
  const oldActive = record('release-old', 'release', { agentId: agent.id, versionId: oldVersion.id }, 'active');
  const pendingDraft = deriveWorkspaceJourney({ records: [...base, oldActive], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.match(pendingDraft.recommended.reason, /earlier version remains active/i);
  assert.match(pendingDraft.recentAgents[0].status, /Draft changes pending · version 1 active/);

  const latest = record('version-2', 'agent_version', { agentId: agent.id, number: 2, sourceRevision: 2, config: { knowledgeIds: [] } }, 'active', 1, '2026-10-01T13:00:00.000Z');
  const current = deriveWorkspaceJourney({ records: [...base, latest], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(current.recommended.section, 'agents');
  assert.equal(current.recommended.focusId, agent.id);
  assert.match(current.recommended.reason, /readiness checks in Publish/i);
  assert.equal(current.recentAgents[0].status, 'Publish checks not run');

  const passing = record('test-2', 'test_run', { agentId: agent.id, versionId: latest.id, passed: true, mode: 'configuration', checks: [] }, 'passed', 1, '2026-10-01T13:01:00.000Z');
  const ready = deriveWorkspaceJourney({ records: [...base, latest, passing], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(ready.recommended.section, 'agents');
  assert.match(ready.recommended.reason, /checks passed/i);
  assert.equal(ready.steps.find(step => step.id === 'test_release')?.stateLabel, 'Ready to publish');
});

test('an active browser release does not count as a published deployment', () => {
  const records = [
    record('source-1', 'brain_source', {}, 'approved'),
    record('agent-1', 'agent_definition', { name: 'Maya' }),
    record('version-1', 'agent_version', { agentId: 'agent-1', number: 1, sourceRevision: 1, config: { knowledgeIds: [] } }),
    record('test-1', 'test_run', { agentId: 'agent-1', versionId: 'version-1', passed: true, mode: 'configuration', checks: [] }, 'passed'),
    record('release-1', 'release', { agentId: 'agent-1', versionId: 'version-1', channel: 'browser' }),
    record('deployment-1', 'agent_deployment', { agentId: 'agent-1', versionId: 'version-1', releaseId: 'release-1' }, 'draft'),
  ];
  const released = deriveWorkspaceJourney({ records, workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(released.recommended.section, 'deployments');
  assert.equal(released.recommended.focusId, 'release:release-1');
  assert.match(released.recommended.evidence, /not a public deployment/i);
  assert.equal(released.steps.find(step => step.id === 'channel')?.state, 'available');
  const viewerWorkspace = workspace({ user: { id: 'viewer-1', email: 'viewer@example.test', role: 'viewer' } });
  const viewer = deriveWorkspaceJourney({ records, workspace: viewerWorkspace, company: { status: 'ready', snapshot: { ...company(), role: 'viewer', editable: false } } });
  assert.equal(viewer.recommended.section, 'deployments');
  assert.equal(viewer.recommended.focusId, undefined);

  const published = deriveWorkspaceJourney({ records: [...records, record('deployment-2', 'agent_deployment', { agentId: 'agent-1', versionId: 'version-1', releaseId: 'release-1' }, 'published')], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(published.steps.find(step => step.id === 'channel')?.state, 'complete');
  assert.equal(published.recommended.section, 'conversations');
});

test('active campaign work outranks optional public channel setup', () => {
  const records = [
    record('agent-1', 'agent_definition', { name: 'Maya' }),
    record('version-1', 'agent_version', { agentId: 'agent-1', number: 1, sourceRevision: 1, config: { knowledgeIds: [] } }),
    record('test-1', 'test_run', { agentId: 'agent-1', versionId: 'version-1', passed: true, mode: 'configuration', checks: [] }, 'passed'),
    record('release-1', 'release', { agentId: 'agent-1', versionId: 'version-1', channel: 'browser' }),
    record('campaign-1', 'campaign', { name: 'Private browser feedback', objective: 'Learn the next customer decision', offeringName: 'Advisory review', contactIds: [], channel: 'browser' }, 'draft'),
    record('run-1', 'campaign_run', { campaignId: 'campaign-1', name: 'Private browser feedback' }, 'running'),
  ];
  const result = deriveWorkspaceJourney({ records, workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(result.recommended.section, 'campaigns');
  assert.equal(result.recommended.focusId, 'campaign-1~run');
  assert.match(result.recommended.title, /work already in progress/i);
  assert.equal(result.campaignsInProgress[0].goal, 'Learn the next customer decision');
  assert.equal(result.campaignsInProgress[0].offering, 'Advisory review');
  assert.equal(result.campaignsInProgress[0].phaseLabel, 'Run');
  assert.equal(result.steps.find(step => step.id === 'channel')?.state, 'available');
  assert.equal(result.steps.find(step => step.id === 'channel')?.focusId, 'release:release-1');
});

test('saved campaign setup resumes the earliest missing prerequisite with the same campaign ID', () => {
  const campaign = setupCampaign('campaign-1', 'audience', {
    name: 'Counselling follow-up', kind: 'feedback', goal: 'Understand each student’s next decision', offeringId: 'offering-1',
    outcome: { label: 'Record the next decision', evidenceRequired: [] }, audienceRationale: '', contactIds: [], channel: 'browser', objective: '', message: '',
  });
  const result = deriveWorkspaceJourney({
    records: [record('source-1', 'brain_source', {}, 'approved'), record('offering-1', 'offering', { name: 'Study-abroad counselling' }, 'approved'), campaign],
    workspace: workspace(), company: { status: 'ready', snapshot: company() },
  });
  assert.equal(result.recommended.section, 'campaigns');
  assert.equal(result.recommended.focusId, 'campaign-1~intent');
  assert.equal(result.recommended.actionLabel, 'Specify evidence required for the outcome.');
  assert.equal(result.campaignsInProgress[0].name, 'Counselling follow-up');
  assert.equal(result.campaignsInProgress[0].goal, 'Understand each student’s next decision');
  assert.equal(result.campaignsInProgress[0].offering, 'Study-abroad counselling');
  assert.equal(result.campaignsInProgress[0].phaseLabel, 'Intent');
});

test('a complete earlier phase resumes the saved campaign phase and an unlaunched draft opens review', () => {
  const fields = {
    name: 'Counselling follow-up', kind: 'feedback', goal: 'Understand the next decision', offeringId: 'offering-1',
    outcome: { label: 'Record the next decision', evidenceRequired: ['A stated next step'] }, audienceRationale: '', contactIds: [], channel: 'browser', objective: '', message: '',
  };
  const setup = deriveWorkspaceJourney({
    records: [record('source-1', 'brain_source', {}, 'approved'), setupCampaign('campaign-1', 'audience', fields)],
    workspace: workspace(), company: { status: 'ready', snapshot: company() },
  });
  assert.equal(setup.recommended.focusId, 'campaign-1~audience');
  assert.equal(setup.recommended.actionLabel, 'Select at least one contact.');

  const draft = deriveWorkspaceJourney({
    records: [record('source-1', 'brain_source', {}, 'approved'), record('campaign-2', 'campaign', { name: 'Reviewed follow-up', objective: 'Confirm who needs a counsellor', offeringName: 'Counselling' }, 'draft')],
    workspace: workspace(), company: { status: 'ready', snapshot: company() },
  });
  assert.equal(draft.recommended.focusId, 'campaign-2~review');
  assert.equal(draft.recommended.actionLabel, 'Check launch readiness');
  assert.equal(draft.campaignsInProgress[0].phaseLabel, 'Review');
});

test('current agent failures still outrank saved campaign continuation', () => {
  const agent = record('agent-1', 'agent_definition', { name: 'Maya' });
  const version = record('version-1', 'agent_version', { agentId: agent.id, number: 1, sourceRevision: 1, config: { knowledgeIds: [] } });
  const failure = record('test-1', 'test_run', { agentId: agent.id, versionId: version.id, passed: false, mode: 'configuration', checks: [], disclaimer: 'Disclosure missing.' }, 'failed');
  const result = deriveWorkspaceJourney({
    records: [record('source-1', 'brain_source', {}, 'approved'), setupCampaign('campaign-1', 'intent', { name: 'Saved outcome' }), agent, version, failure],
    workspace: workspace(), company: { status: 'ready', snapshot: company() },
  });
  assert.equal(result.recommended.section, 'agents');
  assert.equal(result.recommended.focusId, agent.id);
  assert.match(result.recommended.reason, /readiness checks need changes/i);
});

test('completed campaign runs are not reported as work in progress and viewers are not offered creation', () => {
  const campaignRecord = record('campaign-1', 'campaign', { name: 'Finished follow-up', objective: 'Collect feedback' }, 'draft');
  const result = deriveWorkspaceJourney({
    records: [campaignRecord, record('run-1', 'campaign_run', { campaignId: campaignRecord.id }, 'completed')],
    workspace: workspace({ user: { id: 'viewer-1', email: 'viewer@example.test', role: 'viewer' } }), company: { status: 'ready', snapshot: { ...company(), role: 'viewer', editable: false } },
  });
  assert.equal(result.campaignsInProgress.length, 0);
  assert.equal(result.alternatives.some(item => item.section === 'campaigns' && item.focusId === 'new'), false);
});

test('the newest exact-version check wins and changed knowledge invalidates earlier passing evidence', () => {
  const agent = record('agent-1', 'agent_definition', { name: 'Maya' });
  const source = record('source-1', 'brain_source', {}, 'approved', 1, '2026-10-01T09:00:00.000Z');
  const version = record('version-1', 'agent_version', { agentId: agent.id, number: 1, sourceRevision: 1, config: { knowledgeIds: [source.id] } });
  const pass = record('pass', 'test_run', { agentId: agent.id, versionId: version.id, passed: true, mode: 'configuration', checks: [] }, 'passed');
  const fail = { ...record('fail', 'test_run', { agentId: agent.id, versionId: version.id, passed: false, mode: 'configuration', checks: [], disclaimer: 'Disclosure missing.' }, 'failed'), createdAt: '2026-10-01T10:01:00.000Z', updatedAt: '2026-10-01T10:01:00.000Z' };
  const failed = deriveWorkspaceJourney({ records: [agent, source, version, pass, fail], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(failed.recommended.section, 'agents');
  assert.match(failed.recommended.reason, /latest readiness checks need changes/i);
  assert.equal(failed.attention.find(item => item.id === fail.id)?.section, 'agents');
  assert.equal(failed.attention.find(item => item.id === fail.id)?.focusId, agent.id);

  const changedSource = { ...source, updatedAt: '2026-10-01T10:02:00.000Z' };
  const changed = deriveWorkspaceJourney({ records: [agent, changedSource, version, pass], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(changed.recommended.section, 'agents');
  assert.match(changed.recommended.reason, /Knowledge changed/i);
});

test('a later passing version and active replacement remove historical failed checks from attention', () => {
  const agent = record('agent-1', 'agent_definition', { name: 'Maya' }, 'active', 2);
  const oldVersion = { ...record('version-1', 'agent_version', { agentId: agent.id, number: 1, sourceRevision: 1, config: { knowledgeIds: [] } }), createdAt: '2026-10-01T09:00:00.000Z' };
  const oldFailure = { ...record('failure-1', 'test_run', { agentId: agent.id, versionId: oldVersion.id, passed: false, mode: 'configuration', checks: [], disclaimer: 'Old failure.' }, 'failed'), createdAt: '2026-10-01T09:01:00.000Z' };
  const currentVersion = { ...record('version-2', 'agent_version', { agentId: agent.id, number: 2, sourceRevision: 2, config: { knowledgeIds: [] } }), createdAt: '2026-10-01T10:00:00.000Z' };
  const currentPass = { ...record('pass-2', 'test_run', { agentId: agent.id, versionId: currentVersion.id, passed: true, mode: 'configuration', checks: [] }, 'passed'), createdAt: '2026-10-01T10:01:00.000Z' };
  const oldRelease = record('release-1', 'release', { agentId: agent.id, versionId: oldVersion.id }, 'superseded');
  const replacement = { ...record('release-2', 'release', { agentId: agent.id, versionId: currentVersion.id }, 'active'), createdAt: '2026-10-01T10:02:00.000Z' };
  const result = deriveWorkspaceJourney({ records: [agent, oldVersion, oldFailure, currentVersion, currentPass, oldRelease, replacement], workspace: workspace(), company: { status: 'ready', snapshot: company() } });
  assert.equal(result.attention.some(item => item.kind === 'test_failure'), false);
  assert.equal(result.recentAgents[0].status, 'Browser release active');
});

test('anonymous public conversations remain explicitly identity-unverified', () => {
  const session: WorkspaceEntity = {
    id: 'session-1', createdAt: time, status: 'completed', title: 'Website assistant',
    source: 'server_captured_public_channel', callerIdentity: 'anonymous_unverified', summary: 'Asked about office hours.',
  };
  const result = deriveWorkspaceJourney({ records: [], workspace: workspace({ sessions: [session] }), company: { status: 'ready', snapshot: company() } });
  assert.equal(result.recentConversations[0].identityVerified, false);
  assert.match(result.recentConversations[0].context, /identity unverified/i);
  assert.match(result.steps.find(step => step.id === 'conversations')?.detail || '', /never verifies participant identity/i);
});

test('the current unresolved check and the other four attention types retain valid owning links', () => {
  const contact: WorkspaceEntity = { id: 'contact-1', createdAt: time, name: 'Asha' };
  const memory: WorkspaceEntity = { id: 'memory-1', createdAt: time, status: 'proposed', contactId: contact.id, content: 'Prefers a morning call.' };
  const action: WorkspaceEntity = { id: 'action-1', createdAt: time, status: 'proposed', title: 'Send the requested summary' };
  const result = deriveWorkspaceJourney({
    records: [
      record('agent-1', 'agent_definition', { name: 'Maya' }),
      record('version-1', 'agent_version', { agentId: 'agent-1', number: 1, sourceRevision: 1, config: { knowledgeIds: [] } }),
      record('test-1', 'test_run', { agentId: 'agent-1', versionId: 'version-1', passed: false, mode: 'configuration', checks: [], disclaimer: 'Disclosure missing.' }, 'failed'),
      record('commitment-1', 'commitment', { title: 'Prepare summary', dueDate: '2026-10-02', contactId: contact.id }, 'open'),
      record('run-1', 'campaign_run', { name: 'Feedback follow-up' }, 'paused'),
    ],
    workspace: workspace({ contacts: [contact], memories: [memory], actions: [action] }),
    company: { status: 'ready', snapshot: company() },
  });
  assert.deepEqual(new Set(result.attention.map(item => item.kind)), new Set(['follow_up', 'test_failure', 'commitment', 'campaign_pause', 'memory']));
  assert.equal(result.attention.find(item => item.kind === 'commitment')?.focusId, 'commitment-1');
  assert.equal(result.attention.find(item => item.kind === 'test_failure')?.focusId, 'agent-1');
  assert.equal(result.attention.find(item => item.kind === 'memory')?.focusId, contact.id);
  assert.notEqual(result.attention.find(item => item.kind === 'memory')?.focusId, memory.id);
});

test('company loading and failure stay distinct from an empty workspace and expose retry', () => {
  const loading = deriveWorkspaceJourney({ records: [], workspace: workspace(), company: { status: 'loading' } });
  assert.equal(loading.recommended.kind, 'waiting');
  const failed = deriveWorkspaceJourney({ records: [], workspace: workspace(), company: { status: 'unavailable', error: 'Request timed out.' } });
  assert.equal(failed.recommended.kind, 'retry');
  assert.match(failed.recommended.reason, /timed out/);
});
