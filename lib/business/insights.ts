import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db } from '../server/db';
import { HttpError } from '../server/http';
import { getRecord, listRecords, type PlatformRecord } from '../platform/records';
import { listEntities, type Entity } from '../server/store';
import type { Campaign, Run } from '../platform/campaigns';
import type { CampaignPlan } from '../campaign-planning/engine';
import type { ConversationAnalysisData, LearningType } from '../learning/contracts';
import type { Offering } from './contracts';
import { listReviewedCampaignAnswers } from '../campaign-results/service';
import type { CampaignAnswerRow } from '../campaign-results/contracts';

type SavedSession = { id: string; createdAt: string; contactId?: string; source?: string; campaignRunId?: string; releaseId?: string; agentVersionId?: string; inputMode?: string; transcript?: { role: string; text: string }[]; raw: string };
type Delivery = { id: string; runId: string; contactId: string; state: string };
export type InsightRow = { id: string; name: string; status: string; createdAt: string; channel: string; outcome: string; audience: number; runId?: string; queued: number; completedWithSession: number; completedWithoutSession: number; skipped: number; savedCalls: number; textCalls: number; microphoneCalls: number; unrecordedModeCalls: number; emailAccepted: number; emailRejected: number; emailUncertain: number; emailSending: number };
export type InsightEvidence = { id: string; sessionId: string; campaignId: string; contactId?: string; type: LearningType; title: string; quote: string; reviewedAt?: string; sourceRef: { turnIndex: number; start: number; end: number }; commitmentId?: string; commitmentStatus?: string };
export type OfferingInsightsData = { typedAnswers?: CampaignAnswerRow[]; offering: { id: string; name: string; status: string }; from?: string; to?: string; linkedPlans: number; linkedCampaigns: number; launchedRuns: number; audience: number; queued: number; completedWithSession: number; completedWithoutSession: number; skipped: number; savedCalls: number; textCalls: number; microphoneCalls: number; unrecordedModeCalls: number; emailAccepted: number; emailRejected: number; emailUncertain: number; emailSending: number; rows: InsightRow[]; evidence: InsightEvidence[]; measurement: 'Recipient slots across launched runs; a person can appear in more than one run. Completed with session means an operator completion is linked to a saved browser conversation for that exact run, recipient and release. It does not prove the desired business outcome.' };
const measurement: OfferingInsightsData['measurement'] = 'Recipient slots across launched runs; a person can appear in more than one run. Completed with session means an operator completion is linked to a saved browser conversation for that exact run, recipient and release. It does not prove the desired business outcome.';
const digest = (raw: string) => createHash('sha256').update(JSON.stringify(raw)).digest('hex');
const inWindow = (date: string, from?: string, to?: string) => Number.isFinite(Date.parse(date)) && (!from || date >= `${from}T00:00:00.000Z`) && (!to || date < new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString());
function dateParam(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Use a valid YYYY-MM-DD date.');
  return value;
}
const linked = (value: { explicitIntentV1?: { offering?: { id?: string } } } | undefined, offeringId: string) => value?.explicitIntentV1?.offering?.id === offeringId;
function validSession(session: SavedSession | undefined, run: PlatformRecord<Run>, recipient: Run['recipients'][number]): session is SavedSession {
  return !!session && session.source === 'browser_voice' && session.campaignRunId === run.id && session.contactId === recipient.contactId &&
    session.releaseId === run.data.snapshot.agentReleaseId && Array.isArray(session.transcript);
}
function emptyRow(campaign: PlatformRecord<Campaign>, run?: PlatformRecord<Run>): InsightRow {
  return { id: campaign.id, name: campaign.data.name, status: run?.status || campaign.status, createdAt: run?.data.launchedAt || campaign.createdAt,
    channel: run?.data.snapshot.channel || campaign.data.channel, outcome: run?.data.snapshot.explicitIntentV1?.outcome.label || campaign.data.explicitIntentV1?.outcome.label || 'Outcome not recorded',
    audience: 0, runId: run?.id, queued: 0, completedWithSession: 0, completedWithoutSession: 0, skipped: 0, savedCalls: 0, textCalls: 0,
    microphoneCalls: 0, unrecordedModeCalls: 0, emailAccepted: 0, emailRejected: 0, emailUncertain: 0, emailSending: 0 };
}
export function assembleOfferingInsights(input: { offering: PlatformRecord<Offering>; plans: PlatformRecord<CampaignPlan>[]; campaigns: PlatformRecord<Campaign>[]; runs: PlatformRecord<Run>[]; sessions: SavedSession[]; analyses: PlatformRecord<ConversationAnalysisData>[]; deliveries: Delivery[]; actions?: Entity[]; commitments?: PlatformRecord<{ sourceActionId?: string }>[]; from?: string; to?: string }): OfferingInsightsData {
  const { offering, from, to } = input;
  const plans = input.plans.filter(plan => linked(plan.data, offering.id) && inWindow(plan.createdAt, from, to));
  const campaigns = input.campaigns.filter(campaign => linked(campaign.data, offering.id) && inWindow(campaign.createdAt, from, to));
  const runs = input.runs.filter(run => linked(run.data.snapshot, offering.id) && inWindow(run.data.launchedAt, from, to));
  const campaignsById = new Map(input.campaigns.map(campaign => [campaign.id, campaign]));
  const sessionsById = new Map(input.sessions.map(session => [session.id, session]));
  const rows: InsightRow[] = [];
  const runSessions = new Map<string, { session: SavedSession; campaignId: string }>();
  for (const run of runs) {
    const campaign = campaignsById.get(run.data.campaignId);
    if (!campaign || !linked(campaign.data, offering.id)) continue;
    const row = emptyRow(campaign, run);
    const recipientIds = new Set(run.data.recipients.map(item => item.contactId));
    row.audience = run.data.recipients.length;
    for (const recipient of run.data.recipients) {
      if (recipient.status === 'queued') row.queued++;
      else if (recipient.status === 'skipped') row.skipped++;
      else if (recipient.status === 'completed') {
        if (validSession(sessionsById.get(recipient.sessionId || ''), run, recipient)) row.completedWithSession++;
        else row.completedWithoutSession++;
      }
    }
    if (row.channel === 'browser') {
      for (const session of input.sessions) {
        const recipient = run.data.recipients.find(item => item.contactId === session.contactId);
        if (!recipient || !validSession(session, run, recipient) || runSessions.has(session.id)) continue;
        runSessions.set(session.id, { session, campaignId: campaign.id });
        row.savedCalls++;
        if (session.inputMode === 'text') row.textCalls++;
        else if (session.inputMode === 'microphone') row.microphoneCalls++;
        else row.unrecordedModeCalls++;
      }
    }
    if (row.channel === 'email') {
      const seen = new Set<string>();
      for (const delivery of input.deliveries) {
        if (delivery.runId !== run.id || !recipientIds.has(delivery.contactId) || seen.has(delivery.contactId)) continue;
        seen.add(delivery.contactId);
        if (delivery.state === 'accepted') row.emailAccepted++;
        else if (delivery.state === 'rejected') row.emailRejected++;
        else if (delivery.state === 'uncertain') row.emailUncertain++;
        else if (delivery.state === 'sending') row.emailSending++;
      }
    }
    rows.push(row);
  }
  for (const campaign of campaigns) if (!rows.some(row => row.id === campaign.id)) rows.push(emptyRow(campaign));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const evidence: InsightEvidence[] = [], seenEvidence = new Set<string>();
  const actions = new Map((input.actions || []).map(action => [action.id, action]));
  const commitments = new Map((input.commitments || []).map(commitment => [commitment.id, commitment]));
  for (const analysis of input.analyses) {
    if (!['ready', 'partially_applied', 'applied'].includes(analysis.status)) continue;
    const bound = runSessions.get(analysis.data.sessionId);
    if (!bound || analysis.data.sessionDigest !== digest(bound.session.raw) || analysis.data.contactId !== bound.session.contactId) continue;
    for (const candidate of analysis.data.candidates || []) {
      if (candidate.status !== 'applied') continue;
      const ref = candidate.sourceRef, turn = bound.session.transcript?.[ref.turnIndex];
      if (!turn || turn.role !== 'user' || typeof turn.text !== 'string' || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || ref.start < 0 || ref.end > turn.text.length || turn.text.slice(ref.start, ref.end) !== candidate.quote) continue;
      const type = candidate.reviewedType || candidate.type;
      const key = JSON.stringify([bound.session.id, ref.turnIndex, ref.start, ref.end, type, candidate.quote]);
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      const action = candidate.appliedEntityId ? actions.get(candidate.appliedEntityId) : undefined;
      const receipt = action?.reviewReceipt && typeof action.reviewReceipt === 'object' ? action.reviewReceipt as { commitmentId?: string } : undefined;
      const commitment = receipt?.commitmentId ? commitments.get(receipt.commitmentId) : undefined;
      const linkedCommitment = action?.sourceAnalysisId === analysis.id && action.sourceCandidateId === candidate.id && action.sourceSessionId === bound.session.id &&
        commitment?.data.sourceActionId === action.id ? commitment : undefined;
      evidence.push({ id: `${analysis.id}:${candidate.id}`, sessionId: bound.session.id, campaignId: bound.campaignId, contactId: bound.session.contactId, type,
        title: candidate.title, quote: candidate.quote, reviewedAt: candidate.reviewedAt || analysis.updatedAt, sourceRef: ref,
        ...(linkedCommitment ? { commitmentId: linkedCommitment.id, commitmentStatus: linkedCommitment.status } : {}) });
    }
  }
  evidence.sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
  const sums = ['audience', 'queued', 'completedWithSession', 'completedWithoutSession', 'skipped', 'savedCalls', 'textCalls', 'microphoneCalls', 'unrecordedModeCalls', 'emailAccepted', 'emailRejected', 'emailUncertain', 'emailSending'] as const;
  const totals = Object.fromEntries(sums.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)])) as Pick<OfferingInsightsData, typeof sums[number]>;
  return { offering: { id: offering.id, name: offering.data.name, status: offering.status }, from, to, linkedPlans: plans.length, linkedCampaigns: new Set(rows.map(row => row.id)).size,
    launchedRuns: rows.filter(row => row.runId).length, ...totals, rows, evidence, measurement };
}
export async function getOfferingInsights(user: AuthUser, offeringId: string, options: { from?: string; to?: string } = {}): Promise<OfferingInsightsData> {
  if (!offeringId || offeringId.length > 100 || /[\x00-\x1f]/.test(offeringId)) throw new HttpError(400, 'Choose an offering.');
  const from = dateParam(options.from), to = dateParam(options.to);
  if (from && to && from > to) throw new HttpError(400, 'Start date must be on or before end date.');
  const offering = await getRecord<Offering>(user.organizationId, 'offering', offeringId);
  const [plans, campaigns, runs, analyses, actions, commitments, sessionRows, deliveryRows] = await Promise.all([
    listRecords<CampaignPlan>(user.organizationId, 'campaign_plan'), listRecords<Campaign>(user.organizationId, 'campaign'),
    listRecords<Run>(user.organizationId, 'campaign_run'), listRecords<ConversationAnalysisData>(user.organizationId, 'conversation_analysis'),
    listEntities(user.organizationId, 'action'), listRecords<{ sourceActionId?: string }>(user.organizationId, 'commitment'),
    (await db()).all('SELECT id,data,created_at FROM entities WHERE organization_id=? AND kind=?', [user.organizationId, 'session']),
    (await db()).all('SELECT id,data FROM entities WHERE organization_id=? AND kind=?', [user.organizationId, 'delivery:email_intent']),
  ]);
  const sessions: SavedSession[] = sessionRows.map(row => ({ ...JSON.parse(String(row.data)), id: String(row.id), createdAt: String(row.created_at), raw: String(row.data) }));
  const deliveries: Delivery[] = deliveryRows.map(row => ({ ...JSON.parse(String(row.data)).data, id: String(row.id) }));
  const insights = assembleOfferingInsights({ offering, plans, campaigns, runs, sessions, analyses, deliveries, actions, commitments, from, to });
  const runIds = new Set(insights.rows.map(row => row.runId).filter(Boolean));
  return { ...insights, typedAnswers: (await listReviewedCampaignAnswers(user, offeringId)).filter(row => runIds.has(row.runId)) };
}
