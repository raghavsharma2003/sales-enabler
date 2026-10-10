import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformRecord } from '../lib/platform/contracts';
import { campaignAgentBinding, campaignAgentContext, campaignAgentFocus, campaignAgentTemplate, parseCampaignAgentFocus, returnCampaignAgent } from '../lib/platform/campaign-agent-handoff';
import { readCampaignSetup } from '../lib/platform/campaign-workflow';

const now = '2026-10-10T10:00:00.000Z';
const record = (kind: string, id: string, data: Record<string, unknown>, status = 'draft'): PlatformRecord => ({ kind, id, data, status, revision: 1, createdAt: now, updatedAt: now });
function fixture() {
  const campaign = record('campaign', 'campaign:abc123', { schemaVersion: 1, phase: 'agent_content', ownerId: 'owner', requestDigest: 'digest', fields: { name: 'Service follow-up', kind: 'feedback', offeringId: 'offering-1', goal: 'Understand the onboarding experience', channel: 'browser', contactIds: ['private-contact'], message: 'Keep this campaign content', sourceIds: ['source-1', 'unapproved-source'], outcome: { label: 'Document feedback', evidenceRequired: ['Customer account'] } } }, 'setup');
  const agent = record('agent_definition', 'agent-1', { name: 'Service agent' });
  const version = record('agent_version', 'version-1', { agentId: agent.id, number: 1, sourceRevision: 1, config: { knowledgeIds: ['source-1'] } });
  const release = record('release', 'release-1', { agentId: agent.id, versionId: version.id, channel: 'browser', testRunId: 'check-1' }, 'active');
  const run = record('test_run', 'check-1', { agentId: agent.id, versionId: version.id, mode: 'configuration', passed: true }, 'passed');
  const records = [campaign, agent, version, release, run, record('offering', 'offering-1', { name: 'Onboarding support', raw: 'Not copied' }, 'approved'), record('brain_source', 'source-1', { content: 'Not copied' }, 'approved'), record('brain_source', 'unapproved-source', { content: 'Not copied' })];
  const reference = { campaignId: campaign.id, revision: campaign.revision, agentId: agent.id };
  const input = { reference, agentId: agent.id, releaseId: release.id, dirty: false, viewer: false };
  const review = { schemaVersion: 1, operation: 'publish', agentId: agent.id, agentVersionId: version.id, agentVersionNumber: 1, currentReleaseId: release.id, testRunId: run.id, configurationPassed: true, blockers: [], publishable: true, reviewPacketDigest: 'review', suite: { requiredCases: 0, cases: [] } };
  return { campaign, agent, version, release, run, records, reference, input, review };
}

test('handoff routes carry bounded references only and preserve ordinary Agent Studio routes', () => {
  const { reference } = fixture();
  assert.deepEqual(parseCampaignAgentFocus(campaignAgentFocus(reference)), reference);
  const newReference = { campaignId: reference.campaignId, revision: 4 };
  assert.deepEqual(parseCampaignAgentFocus(campaignAgentFocus(newReference)), newReference);
  for (const route of [undefined, 'new', 'agent-1']) assert.equal(parseCampaignAgentFocus(route), null);
  for (const route of ['campaign-agent', 'campaign-agent~campaign:abc~1~new~release-1', 'campaign-agent~../elsewhere~1~new', 'campaign-agent~id~0~new', 'campaign-agent~id~01~new', 'campaign-agent~id~1~https://evil', 'campaign-agent~id~1~new?release=x', `campaign-agent~${'x'.repeat(101)}~1~new`]) assert.equal(parseCampaignAgentFocus(route), 'invalid', route);
  assert.throws(() => campaignAgentFocus({ campaignId: '#campaigns', revision: 1 }), /Invalid/);
});

test('starting drafts use approved offering, saved goal and source references without copying customer or raw source data', () => {
  const { records, reference } = fixture();
  const template = campaignAgentTemplate(records, reference);
  assert.match(template.objective!, /Onboarding support.*Understand the onboarding experience/);
  assert.match(template.disclosure!, /AI/);
  assert.deepEqual(template.knowledgeIds, ['source-1']);
  assert.deepEqual(template.enabledTools, ['search_company_knowledge']);
  assert.doesNotMatch(JSON.stringify(template), /private-contact|Not copied|Keep this campaign content/);
  assert.equal(records.find(record => record.kind === 'agent_definition')!.data.objective, undefined);
});

test('context rejects unavailable, stale, finalized, running, unapproved and wrong-channel campaigns', () => {
  for (const change of ['missing', 'revision', 'status', 'run', 'offering', 'channel']) {
    const f = fixture();
    if (change === 'missing') f.records.shift();
    if (change === 'revision') f.campaign.revision++;
    if (change === 'status') f.campaign.status = 'draft';
    if (change === 'run') f.records.push(record('campaign_run', 'run-1', { campaignId: f.campaign.id }));
    if (change === 'offering') f.records.find(record => record.kind === 'offering')!.status = 'draft';
    if (change === 'channel') readCampaignSetup(f.campaign)!.fields.channel = 'email';
    assert.throws(() => campaignAgentContext(f.records, f.reference), Error, change);
  }
});

test('binding rejects read-only access and unsaved agent edits', () => {
  const f = fixture();
  assert.throws(() => campaignAgentBinding({ ...f.input, records: f.records, viewer: true }), /Operator/);
  assert.throws(() => campaignAgentBinding({ ...f.input, records: f.records, dirty: true }), /Save or discard/);
});

test('binding requires exact matching active release, version, current saved agent and knowledge', () => {
  for (const change of ['agent', 'releaseAgent', 'versionAgent', 'inactive', 'channel', 'revision', 'knowledge', 'failed']) {
    const f = fixture();
    if (change === 'agent') f.input.agentId = 'another-agent';
    if (change === 'releaseAgent') f.release.data.agentId = 'another-agent';
    if (change === 'versionAgent') f.version.data.agentId = 'another-agent';
    if (change === 'inactive') f.release.status = 'superseded';
    if (change === 'channel') f.release.data.channel = 'email';
    if (change === 'revision') f.agent.revision++;
    if (change === 'knowledge') f.records.find(record => record.kind === 'brain_source')!.status = 'draft';
    if (change === 'failed') f.records.push({ ...f.run, id: 'later-failure', status: 'failed', createdAt: '2026-10-10T10:01:00.000Z', data: { ...f.run.data, passed: false } });
    assert.throws(() => campaignAgentBinding({ ...f.input, records: f.records }), Error, change);
  }
});

test('explicit return reviews current evidence and binds only the release to the same campaign revision, resuming Review', async () => {
  const f = fixture(), calls: { action: string; body?: Record<string, unknown> }[] = [];
  let loads = 0;
  const saved = await returnCampaignAgent(f.input, async () => { loads++; return f.records; }, async (action, body) => {
    calls.push({ action, body });
    if (action === 'release.review') return f.review;
    const data = structuredClone(readCampaignSetup(f.campaign)!);
    data.phase = 'review'; data.fields.agentReleaseId = f.release.id;
    return { ...f.campaign, revision: 2, data };
  }, () => true);
  assert.equal(loads, 2);
  assert.equal(saved.id, f.campaign.id);
  assert.equal(readCampaignSetup(saved)!.fields.message, 'Keep this campaign content');
  assert.deepEqual(calls.map(call => call.action), ['release.review', 'campaign.setup.update']);
  assert.deepEqual(calls[1].body, { id: f.campaign.id, revision: 1, phase: 'review', patch: { agentReleaseId: f.release.id } });
});

test('return makes no campaign mutation when current evidence, role, selection or campaign changes', async () => {
  for (const change of ['reviewMismatch', 'reviewBlocked', 'releaseChanged', 'campaignChanged', 'selection', 'viewer']) {
    const f = fixture(); let reviewed = false, writes = 0;
    if (change === 'viewer') f.input.viewer = true;
    await assert.rejects(returnCampaignAgent(f.input, async () => {
      if (reviewed && change === 'releaseChanged') f.release.status = 'superseded';
      if (reviewed && change === 'campaignChanged') f.campaign.revision++;
      return f.records;
    }, async action => {
      if (action !== 'release.review') { writes++; throw new Error('Unexpected write'); }
      reviewed = true;
      return { ...f.review, ...(change === 'reviewMismatch' ? { currentReleaseId: 'other-release' } : {}), ...(change === 'reviewBlocked' ? { publishable: false } : {}) };
    }, () => !(reviewed && change === 'selection')), Error, change);
    assert.equal(writes, 0, change);
  }
});

test('unconfirmed save response is surfaced without a duplicate create, publish, launch or retry', async () => {
  const f = fixture(), actions: string[] = [];
  await assert.rejects(returnCampaignAgent(f.input, async () => f.records, async action => {
    actions.push(action);
    return action === 'release.review' ? f.review : { ...f.campaign, id: 'different-campaign' };
  }, () => true), /save could not be confirmed/);
  assert.deepEqual(actions, ['release.review', 'campaign.setup.update']);
});
