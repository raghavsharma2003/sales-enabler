import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createRecord, type PlatformRecord } from '../lib/platform/records';
import { insertEntity } from '../lib/server/store';
import { assembleOfferingInsights, getOfferingInsights } from '../lib/business/insights';
import type { Offering } from '../lib/business/contracts';
import type { Campaign, Run } from '../lib/platform/campaigns';
import type { CampaignPlan } from '../lib/campaign-planning/engine';
import type { ConversationAnalysisData } from '../lib/learning/contracts';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const at = '2026-09-22T10:00:00.000Z';
const record = <T>(id: string, data: T, status = 'active'): PlatformRecord<T> => ({ id, kind: '', data, status, revision: 1, createdAt: at, updatedAt: at });
const offering = (id: string) => record<Offering>(id, { schemaVersion: 1, name: id, kind: 'service', summary: 'Reviewed service', audienceDescription: 'Reviewed audience', sourceRefs: [], openQuestions: [], createdBy: 'operator' }, 'approved');
const intent = (id: string) => ({ schemaVersion: 1 as const, offering: { id, revision: 1, digest: 'reviewed' }, outcome: { label: 'Ask for feedback', evidenceRequired: ['Caller statement'] }, signalAnchors: [], audienceRationale: 'Reviewed', reviewColumns: [], reviewedBy: 'operator', reviewedAt: at });
const campaign = (id: string, offeringId: string): PlatformRecord<Campaign> => record(id, { name: id, kind: 'feedback', objective: 'Feedback', channel: 'browser', agentReleaseId: 'release-1', subject: '', message: 'Hello', contactIds: ['a', 'b', 'c'], ownerId: 'operator', explicitIntentV1: intent(offeringId) }, 'launched');
const run = (id: string, campaignData: PlatformRecord<Campaign>): PlatformRecord<Run> => record(id, { campaignId: campaignData.id, campaignRevision: 1, snapshot: campaignData.data, recipients: [
  { contactId: 'a', name: 'A', email: '', status: 'completed', sessionId: 's1', evidence: 'Operator marked complete' },
  { contactId: 'b', name: 'B', email: '', status: 'completed', sessionId: 'other-run-session', evidence: 'Operator marked complete' },
  { contactId: 'c', name: 'C', email: '', status: 'queued' },
], launchedAt: at, launchedBy: 'operator' });
const session = (id: string, campaignRunId: string, contactId: string, inputMode = 'text') => ({ id, raw: JSON.stringify({ id, campaignRunId }), createdAt: at, source: 'browser_voice', campaignRunId, contactId, releaseId: 'release-1', inputMode, transcript: [{ role: 'user', text: 'Please send the details.' }] });
const analysis = (id: string, sessionId: string, sessionRaw: string, quote = 'Please send the details.'): PlatformRecord<ConversationAnalysisData> => record(id, { sessionId, sessionDigest: createHash('sha256').update(JSON.stringify(sessionRaw)).digest('hex'), requestId: id, contactId: 'a', contextCitations: [], notes: [], createdBy: 'operator', candidates: [{ id: 'c1', type: 'commitment_request', title: 'Send details', content: 'Customer requested details', why: 'Explicit request', quote, sourceRef: { turnIndex: 0, start: 0, end: quote.length }, destination: 'manual_action_review', status: 'applied' }] }, 'applied');

test('offering evidence excludes overlapping, legacy and unbound records and keeps stages separate', () => {
  const main = campaign('main', 'offer-a'), other = campaign('other', 'offer-b');
  const mainRun = run('run-main', main), otherRun = run('run-other', other);
  const saved = session('s1', mainRun.id, 'a');
  const reviewed = analysis('analysis-one', 's1', saved.raw);
  reviewed.data.candidates[0].appliedEntityId = 'action-1';
  const preview = { ...session('preview', mainRun.id, 'a'), source: 'browser_preview' };
  const result = assembleOfferingInsights({ offering: offering('offer-a'), plans: [record('plan-a', { explicitIntentV1: intent('offer-a') } as unknown as CampaignPlan), record('plan-b', { explicitIntentV1: intent('offer-b') } as unknown as CampaignPlan)], campaigns: [main, other], runs: [mainRun, otherRun], sessions: [saved, session('other-run-session', otherRun.id, 'b'), preview], analyses: [reviewed, analysis('analysis-duplicate', 's1', saved.raw), analysis('analysis-stale', 's1', 'old raw')], deliveries: [], actions: [{ id: 'action-1', createdAt: at, sourceAnalysisId: reviewed.id, sourceCandidateId: 'c1', sourceSessionId: 's1', reviewReceipt: { commitmentId: 'commitment-1' } }], commitments: [record('commitment-1', { sourceActionId: 'action-1' }, 'open')] });
  assert.equal(result.linkedPlans, 1);
  assert.equal(result.linkedCampaigns, 1);
  assert.equal(result.launchedRuns, 1);
  assert.equal(result.audience, 3);
  assert.equal(result.completedWithSession, 1);
  assert.equal(result.completedWithoutSession, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.savedCalls, 1);
  assert.equal(result.textCalls, 1);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].type, 'commitment_request');
  assert.equal(result.evidence[0].commitmentId, 'commitment-1');
  assert.equal(result.evidence[0].commitmentStatus, 'open');
});

test('exact quote and date boundaries reject stale feedback without inventing email delivery', () => {
  const email = campaign('email-campaign', 'offer-a');
  email.data.channel = 'email';
  const emailRun = run('email-run', email);
  const browser = campaign('browser-campaign', 'offer-a');
  const browserRun = run('browser-run', browser);
  const saved = session('s1', browserRun.id, 'a', 'microphone');
  const result = assembleOfferingInsights({ offering: offering('offer-a'), plans: [], campaigns: [email, browser], runs: [emailRun, browserRun], sessions: [saved], analyses: [analysis('wrong-quote', 's1', saved.raw, 'Please send a price.')], deliveries: [
    { id: 'accepted', runId: emailRun.id, contactId: 'a', state: 'accepted' },
    { id: 'duplicate', runId: emailRun.id, contactId: 'a', state: 'accepted' },
    { id: 'foreign-run', runId: 'other-run', contactId: 'b', state: 'accepted' },
    { id: 'uncertain', runId: emailRun.id, contactId: 'b', state: 'uncertain' },
  ], from: '2026-09-22', to: '2026-09-22' });
  assert.equal(result.emailAccepted, 1);
  assert.equal(result.emailUncertain, 1);
  assert.equal(result.microphoneCalls, 1);
  assert.equal(result.evidence.length, 0);
  assert.equal(assembleOfferingInsights({ offering: offering('offer-a'), plans: [], campaigns: [email], runs: [emailRun], sessions: [], analyses: [], deliveries: [], from: '2026-09-23' }).launchedRuns, 0);
});

test('insight reader is tenant scoped and available to viewers', async () => {
  const database = await db();
  const owner: AuthUser = { id: randomUUID(), email: 'insight-owner@example.test', organizationId: randomUUID(), role: 'owner' };
  const foreign: AuthUser = { id: randomUUID(), email: 'insight-foreign@example.test', organizationId: randomUUID(), role: 'owner' };
  for (const user of [owner, foreign]) {
    await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', [user.organizationId, user.id, at]);
    await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', [user.id, user.email, 'unused', user.organizationId, at]);
  }
  const current = await createRecord(owner, 'offering', offering('a').data, 'approved');
  const other = await createRecord(foreign, 'offering', offering('b').data, 'approved');
  const active = await createRecord(owner, 'campaign', campaign('tenant-campaign', current.id).data, 'launched');
  await createRecord(foreign, 'campaign', campaign('foreign-campaign', other.id).data, 'launched');
  const bound = await createRecord(owner, 'campaign_run', { ...run('temporary', active).data, campaignId: active.id }, 'active');
  await insertEntity(foreign, 'session', { source: 'browser_voice', campaignRunId: bound.id, contactId: 'a', releaseId: 'release-1', transcript: [] });
  const view = await getOfferingInsights({ ...owner, role: 'viewer' }, current.id);
  assert.equal(view.linkedCampaigns, 1);
  assert.equal(view.launchedRuns, 1);
  assert.equal(view.savedCalls, 0);
  await assert.rejects(getOfferingInsights(owner, other.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(getOfferingInsights(owner, current.id, { from: '2026-02-30' }), (error: unknown) => error instanceof HttpError && error.status === 400);
});
