import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformRecord } from '../lib/platform/contracts';
import { campaignEditorFields, campaignEditorPatch, campaignFocus, campaignNavigationNeedsSave, campaignPhases, initialCampaignPhase, legacyCampaignPatch, newCampaignFields, parseCampaignRoute } from '../lib/platform/campaign-workspace-view';

const record = (data: Record<string, unknown>, status = 'setup'): PlatformRecord => ({ id: 'campaign-1', kind: 'campaign', status, revision: 4, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', data });
test('phase routes round-trip while original campaign IDs still resolve', () => {
  for (const { id } of campaignPhases) assert.deepEqual(parseCampaignRoute(campaignFocus('campaign-1', id)), { campaignId: 'campaign-1', phase: id });
  assert.deepEqual(parseCampaignRoute('campaign-1'), { campaignId: 'campaign-1' });
  assert.deepEqual(parseCampaignRoute('campaign-1~unknown'), { campaignId: 'campaign-1~unknown' });
});
test('offering and saved proposal deep links retain their distinct intent', () => {
  assert.deepEqual(parseCampaignRoute('offering:service-1'), { newDraft: true, offeringId: 'service-1' });
  assert.deepEqual(parseCampaignRoute('plan:campaign-plan:abc'), { planId: 'campaign-plan:abc' });
  assert.deepEqual(parseCampaignRoute('campaign-plan:abc'), { planId: 'campaign-plan:abc' });
  assert.deepEqual(parseCampaignRoute('new'), { newDraft: true });
});
test('URL phase wins, saved setup resumes, and legacy runs open in the relevant stage', () => {
  const partial = record({ schemaVersion: 1, fields: {}, phase: 'audience' });
  assert.equal(initialCampaignPhase(partial), 'audience');
  assert.equal(initialCampaignPhase(partial, 'agent_content'), 'agent_content');
  assert.equal(initialCampaignPhase(record({}, 'draft')), 'review');
  assert.equal(initialCampaignPhase(record({}, 'active')), 'run');
  assert.equal(initialCampaignPhase(record({}, 'completed')), 'results');
  assert.equal(initialCampaignPhase(), 'intent');
});
test('clean phase navigation never revises a saved setup or invalidates an exact-revision AI proposal', () => {
  const partial = record({ schemaVersion: 1, fields: {}, phase: 'intent', acceptedPlan: { planId: 'p' } });
  assert.equal(campaignNavigationNeedsSave(partial, false), false);
  assert.equal(campaignNavigationNeedsSave(partial, true), true);
  assert.equal(campaignNavigationNeedsSave(undefined, false), true);
});
test('offering-prefilled setup contains no fabricated audience, outcome evidence, message or release', () => {
  const fields = newCampaignFields('offering-1');
  assert.equal(fields.offeringId, 'offering-1');
  assert.deepEqual(fields.contactIds, []);
  assert.deepEqual(fields.outcome?.evidenceRequired, []);
  assert.equal(fields.message, '');
  assert.equal(fields.agentReleaseId, undefined);
});
test('saved setup editor projection is isolated from nested source record data', () => {
  const original = record({ schemaVersion: 1, phase: 'audience', fields: { name: 'Saved', outcome: { label: 'Learn', evidenceRequired: ['A quote'] }, contactIds: ['c1'] } });
  const fields = campaignEditorFields(original);
  fields.contactIds!.push('c2'); fields.outcome!.evidenceRequired.push('Other');
  assert.deepEqual((original.data.fields as typeof fields).contactIds, ['c1']);
  assert.deepEqual((original.data.fields as typeof fields).outcome?.evidenceRequired, ['A quote']);
});
test('legacy campaign projection retains reviewed intent and update payload excludes authority fields', () => {
  const legacy = record({ name: 'Feedback', kind: 'feedback', objective: 'Learn needs', channel: 'manual_email', subject: 'Hello', message: 'Hi {{firstName}}', contactIds: ['c1'], planId: 'p1', explicitIntentV1: { offering: { id: 'o1' }, outcome: { label: 'Learn', evidenceRequired: ['Quote'] }, audienceRationale: 'Used the service', reviewColumns: [{ key: 'rating', label: 'Rating', type: 'number' }], signalAnchors: [{ id: 's1' }] } }, 'draft');
  const fields = campaignEditorFields(legacy);
  assert.equal(fields.goal, 'Learn needs'); assert.equal(fields.offeringId, 'o1');
  assert.deepEqual(fields.signalIds, ['s1']); assert.equal(fields.reviewColumns?.[0].type, 'number');
  const patch = legacyCampaignPatch(fields);
  assert.equal(patch.subject, 'Hello'); assert.deepEqual(patch.contactIds, ['c1']);
  assert.equal('explicitIntentV1' in patch, false); assert.equal('planId' in patch, false);
});
test('textarea cleanup removes empty rows without coercing typed review-column authority', () => {
  const fields = { outcome: { label: 'Learn', evidenceRequired: [' Quote ', ''] }, reviewColumns: [{ key: 'decision', label: ' Decision ', type: 'enum' as const, options: ['Yes', 'No'] }, { key: 'empty', label: '', type: 'text' as const }] };
  const patch = campaignEditorPatch(fields);
  assert.deepEqual(patch.outcome?.evidenceRequired, ['Quote']);
  assert.deepEqual(patch.reviewColumns, [{ key: 'decision', label: 'Decision', type: 'enum', options: ['Yes', 'No'] }]);
  assert.equal(fields.reviewColumns.length, 2);
});
test('finalized campaign retains original business goal and optional sources from setup archive', () => {
  const finalized = record({
    name: 'Reviewed feedback', kind: 'feedback', objective: 'Ask which onboarding step caused difficulty', channel: 'browser',
    contactIds: ['current-contact'], agentReleaseId: 'current-release',
    setupDraft: { schemaVersion: 1, phase: 'review', fields: {
      goal: 'Understand why customers do not finish onboarding', sourceIds: ['supporting-source'],
      objective: 'An earlier proposed question', contactIds: ['old-contact'], agentReleaseId: 'old-release',
      outcome: { label: 'Archived outcome', evidenceRequired: ['Archived evidence'] },
    } },
    explicitIntentV1: { offering: { id: 'reviewed-offering' }, outcome: { label: 'Reviewed outcome', evidenceRequired: ['Reviewed quote'] }, audienceRationale: 'Reviewed rationale', reviewColumns: [], signalAnchors: [] },
  }, 'draft');
  const fields = campaignEditorFields(finalized);
  assert.equal(fields.goal, 'Understand why customers do not finish onboarding');
  assert.equal(fields.objective, 'Ask which onboarding step caused difficulty');
  assert.deepEqual(fields.sourceIds, ['supporting-source']);
  assert.deepEqual(fields.outcome, { label: 'Reviewed outcome', evidenceRequired: ['Reviewed quote'] });
  assert.equal(fields.offeringId, 'reviewed-offering');
  assert.deepEqual(fields.contactIds, ['current-contact']);
  assert.equal(fields.agentReleaseId, 'current-release');
});
