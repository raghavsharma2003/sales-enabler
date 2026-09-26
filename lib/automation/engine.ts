/** Local, opt-in, one-shot email scheduling. No timers run in the web process. */
import { createHash, randomUUID } from 'node:crypto';
import { db, WriteConflictError, type Database } from '../server/db';
import type { AuthUser } from '../server/auth';
import { getActiveMembership, operatorMembershipFence, requireWorkspaceOperator } from '../team/service';
import { HttpError } from '../server/http';
import { getRecord, listRecords, updateRecord, type PlatformRecord } from '../platform/records';
import { emailConnectionFor, personalize, type Run } from '../platform/campaigns';
import { verifyAppliedPlanSources } from '../campaign-planning/engine';
import { listCampaignDelivery, sendCampaignEmail } from '../delivery/engine';
import { sendEmailViaProvider, validRecipient, type EmailDispatch } from '../delivery/providers';
import type { AutomationDashboard, AutomationPreview, AutomationSchedule, ScheduleState, TaskState } from './contracts';

const KIND = 'automation_schedule';
const LEASE_MS = 120_000;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nowISO = () => new Date().toISOString();
type Schedule = PlatformRecord<AutomationSchedule>;
type Statements = Parameters<Database['batch']>[0];
type Authority = { id: string; kind: string; status: string | null; data: string };
function history(data: AutomationSchedule, event: string) { return [...data.history, { at: nowISO(), event }].slice(-200); }
function fence(row: Authority, tenant: string) {
  return { sql: 'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND (status=? OR (status IS NULL AND ? IS NULL))', params: [row.id, tenant, row.kind, row.data, row.status, row.status], expectedChanges: 1 };
}
async function authority(user: AuthUser, run: PlatformRecord<Run>): Promise<Authority[]> {
  const rows = await (await db()).all('SELECT id,kind,status,data FROM entities WHERE organization_id=? AND kind IN (?,?,?,?,?,?,?,?)',
    [user.organizationId, 'platform:campaign_run', 'contact', 'platform:customer_profile', 'integration:vault', 'platform:campaign_plan', 'platform:brain_source', 'team:member', 'platform:campaign']);
  return rows.filter(row => {
    const id = String(row.id), kind = String(row.kind);
    if (kind === 'team:member') return JSON.parse(String(row.data)).userId === user.id;
    if (kind === 'platform:campaign') return id === run.data.campaignId;
    if (kind === 'platform:campaign_run') return id === run.id;
    if (kind === 'integration:vault') return id === run.data.snapshot.emailConnectionId;
    if (kind === 'platform:campaign_plan') return id === run.data.snapshot.planId;
    if (kind === 'platform:brain_source') return run.data.snapshot.sourceAnchors?.some(source => source.id === id);
    const contactId = kind === 'contact' ? id : JSON.parse(String(row.data)).data.contactId;
    return run.data.snapshot.contactIds.includes(contactId);
  }).map(row => ({ id: String(row.id), kind: String(row.kind), status: row.status === null ? null : String(row.status), data: String(row.data) }));
}
const snapshotDigest = (run: Run) => hash([run.snapshot, run.emailAuthorizationVersion, run.launchedBy, run.launchedAt]);
async function inspect(user: AuthUser, runId: string): Promise<{ preview: AutomationPreview; run: PlatformRecord<Run>; anchors: Authority[]; businessFences: Statements }> {
  await requireWorkspaceOperator(user);
  const run = await getRecord<Run>(user.organizationId, 'campaign_run', runId);
  if (run.data.launchedBy !== user.id) throw new HttpError(403, 'Only the operator who launched this run can schedule it.');
  if (run.data.snapshot.channel !== 'email') throw new HttpError(409, 'Choose a launched connected-email run. Browser and telephone calls cannot be scheduled.');
  const anchors = await authority(user, run);
  const blockers: string[] = [];
  let businessFences: Statements = [];
  if (run.status !== 'active' || run.data.pausedAt || run.data.cancelledAt) blockers.push('The campaign run must be active.');
  if (run.data.recipients.length > 100) blockers.push('Schedules support at most 100 recipients. Review a smaller campaign.');
  try {
    const mailbox = await emailConnectionFor(user, run.data.snapshot.emailConnectionId || '');
    if (mailbox.authorizationVersion !== run.data.emailAuthorizationVersion) blockers.push('Mailbox authorization changed. Review and launch a new campaign.');
  } catch { blockers.push('A checked, connected mailbox with send permission is required.'); }
  if (run.data.snapshot.planId) {
    try {
      const plan = await getRecord<{ sourceAnchors: Run['snapshot']['sourceAnchors']; explicitIntentV1?: Run['snapshot']['explicitIntentV1'] }>(user.organizationId, 'campaign_plan', run.data.snapshot.planId);
      if (JSON.stringify(plan.data.sourceAnchors || []) !== JSON.stringify(run.data.snapshot.sourceAnchors || [])) throw new Error();
      if (JSON.stringify(plan.data.explicitIntentV1) !== JSON.stringify(run.data.snapshot.explicitIntentV1)) throw new Error();
      businessFences = await verifyAppliedPlanSources(user, run.data.snapshot.planId, run.data.campaignId);
    } catch { blockers.push('Approved source or plan authority changed. Review a new campaign.'); }
  } else if (run.data.snapshot.sourceAnchors?.length || run.data.snapshot.explicitIntentV1) blockers.push('Source references or business intent are missing their approved plan.');
  const deliveries = await listCampaignDelivery(user, runId);
  const recipients = run.data.recipients.map(recipient => {
    const reasons: string[] = [];
    const contactRow = anchors.find(row => row.kind === 'contact' && row.id === recipient.contactId);
    const contact = contactRow ? JSON.parse(contactRow.data) as Record<string, unknown> : undefined;
    const profileRow = anchors.find(row => row.kind === 'platform:customer_profile' && JSON.parse(row.data).data.contactId === recipient.contactId);
    const profile = profileRow ? JSON.parse(profileRow.data).data : undefined;
    if (recipient.status !== 'queued') reasons.push('Recipient is no longer queued');
    if (!run.data.snapshot.contactIds.includes(recipient.contactId)) reasons.push('Recipient is outside the reviewed audience');
    if (!contact || !profile || profileRow?.status !== 'active' || profile.consent?.email?.granted !== true || contact.optOut === true || contact.doNotContact === true || contact.consent === 'denied') reasons.push('Current contact permission or email consent blocks sending');
    const destination = String(profile?.email ?? contact?.email ?? '').trim();
    if (!validRecipient(destination) || destination.toLowerCase() !== recipient.email.toLowerCase()) reasons.push('Email address changed or is invalid');
    const delivery = deliveries.recipients.find(item => item.contactId === recipient.contactId);
    if (delivery?.status !== 'ready') reasons.push(`Existing delivery: ${delivery?.status || 'unavailable'}. It will not be sent again`);
    const subject = personalize(run.data.snapshot.subject, recipient), body = personalize(run.data.snapshot.message, recipient);
    if (!subject || /[\r\n\0]/.test(subject) || /{{[^}]+}}/.test(subject + body)) reasons.push('Message contains invalid or unresolved fields');
    return { contactId: recipient.contactId, name: recipient.name, email: recipient.email, eligible: reasons.length === 0, ...(reasons.length ? { reason: reasons.join('. ') } : {}) };
  });
  const eligible = recipients.filter(item => item.eligible);
  if (!eligible.length) blockers.push('No unsent eligible recipients remain.');
  // A partial selection must never silently expand or send to newly eligible people.
  const reviewToken = hash([user.organizationId, user.id, run.id, anchors, businessFences, recipients, blockers]);
  return { run, anchors, businessFences, preview: { runId, name: run.data.snapshot.name, ready: !blockers.length, blockers, reviewToken, recipients, subject: run.data.snapshot.subject, message: run.data.snapshot.message } };
}
export async function previewAutomation(user: AuthUser, runId: string) { return (await inspect(user, runId)).preview; }
function futureTime(scheduledAt: string, timezone: string) {
  const stamp = Date.parse(scheduledAt);
  if (!Number.isFinite(stamp) || stamp <= Date.now() + 5000 || stamp > Date.now() + 366 * 86400_000) throw new HttpError(400, 'Choose a time at least a few seconds ahead and within one year.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new HttpError(400, 'Choose a valid timezone.'); }
  return new Date(stamp).toISOString();
}
export async function enableAutomation(user: AuthUser, input: { runId: string; reviewToken: string; scheduledAt: string; timezone: string }) {
  const scheduledAt = futureTime(input.scheduledAt, input.timezone);
  const { preview, run, anchors, businessFences } = await inspect(user, input.runId);
  if (!preview.ready || preview.reviewToken !== input.reviewToken) throw new HttpError(409, 'Eligibility changed or review is missing. Preview the run again before enabling.');
  const id = `automation:${hash([user.organizationId, run.id])}`, now = nowISO();
  const data: AutomationSchedule = { runId: run.id, name: preview.name, connectionId: run.data.snapshot.emailConnectionId!, authorizedBy: user.id, authorizedAt: now,
    scheduledAt, timezone: input.timezone, runDigest: snapshotDigest(run.data), tasks: preview.recipients.filter(item => item.eligible).map(item => ({ contactId: item.contactId, requestId: randomUUID(), state: 'pending' })), history: [{ at: now, event: 'Schedule explicitly enabled after review' }] };
  const membership = await operatorMembershipFence(user);
  try { await (await db()).batch([
    membership, ...businessFences, ...anchors.map(row => fence(row, user.organizationId)),
    { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, user.organizationId, `platform:${KIND}`, 'enabled', JSON.stringify({ revision: 1, updatedAt: now, data }), now] },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, id, 'automation.enabled', now] },
  ]); } catch (error) {
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Authority changed during review. Preview the run again.');
    const exists = await (await db()).all('SELECT id FROM entities WHERE id=?', [id]);
    if (exists.length) throw new HttpError(409, 'This run already has a schedule. Use its existing controls.');
    throw error;
  }
  return getRecord<AutomationSchedule>(user.organizationId, KIND, id);
}
async function authorizedUpdate(user: AuthUser, current: Schedule, data: AutomationSchedule, status = current.status, extra: Statements = []): Promise<Schedule> {
  const membership = await operatorMembershipFence(user), at = nowISO();
  const next = { ...current, status, revision: current.revision + 1, updatedAt: at, data };
  try { await (await db()).batch([
    membership, ...extra,
    { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?', params: [JSON.stringify({ revision: next.revision, updatedAt: at, data }), status, current.id, user.organizationId, `platform:${KIND}`, current.status, JSON.stringify({ revision: current.revision, updatedAt: current.updatedAt, data: current.data })], expectedChanges: 1 },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, current.id, `automation.authorized_update:${status}`, at] },
  ]); } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Schedule or operator permission changed. Refresh and review.'); throw error; }
  return next;
}
export async function controlAutomation(user: AuthUser, id: string, action: 'pause' | 'cancel' | 'resume', input?: { scheduledAt: string; timezone: string; reviewToken: string }) {
  await requireWorkspaceOperator(user);
  const current = await getRecord<AutomationSchedule>(user.organizationId, KIND, id);
  if (current.data.authorizedBy !== user.id) throw new HttpError(403, 'Only the authorizing operator can change this schedule.');
  if (current.status === 'cancelled' || current.status === 'completed') throw new HttpError(409, 'This schedule has ended.');
  if (action === 'resume') {
    if (!input || current.status !== 'paused' || current.data.claim) throw new HttpError(409, 'Only a paused schedule with no dispatch in progress can resume.');
    const scheduledAt = futureTime(input.scheduledAt, input.timezone);
    const { preview, businessFences, anchors } = await inspect(user, current.data.runId);
    if (!preview.ready || input.reviewToken !== preview.reviewToken || current.data.tasks.filter(task => task.state === 'pending').some(task => !preview.recipients.find(item => item.contactId === task.contactId)?.eligible)) throw new HttpError(409, 'Preview current eligibility before resuming.');
    if (!current.data.tasks.some(task => task.state === 'pending')) throw new HttpError(409, 'No pending recipients remain. Interrupted or uncertain attempts need manual review.');
    return authorizedUpdate(user, current, { ...current.data, scheduledAt, timezone: input.timezone, history: history(current.data, 'Remaining pending recipients explicitly rescheduled after review') }, 'enabled', [...businessFences, ...anchors.map(item => fence(item, user.organizationId))]);
  }
  return authorizedUpdate(user, current, { ...current.data, history: history(current.data, action === 'pause' ? 'Paused; a provider request already started may finish' : 'Cancelled; a provider request already started may finish') }, action === 'pause' ? 'paused' : 'cancelled');
}

async function heartbeat(workerId: string, state: 'running' | 'stopped') {
  // Infrastructure availability belongs to the worker, not its current queue.
  // No tenant, operator, customer, destination or credential data is stored.
  await (await db()).run('INSERT INTO service_heartbeats (id,service,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at', [workerId, 'automation-worker', state, nowISO()]);
}
export async function automationDashboard(user: AuthUser): Promise<AutomationDashboard> {
  const canManage = (await getActiveMembership(user)).role !== 'viewer';
  const schedules = await listRecords<AutomationSchedule>(user.organizationId, KIND);
  const runs = await listRecords<Run>(user.organizationId, 'campaign_run');
  const workers = await (await db()).all('SELECT status,updated_at FROM service_heartbeats WHERE service=?', ['automation-worker']);
  const seen = workers.map(row => ({ state: row.status, at: String(row.updated_at) })).sort((a, b) => b.at.localeCompare(a.at));
  const running = seen.some(item => { const age = Date.now() - Date.parse(item.at); return item.state === 'running' && age >= 0 && age < 90_000; });
  return { canManage, schedules: schedules.map(row => ({ id: row.id, status: row.status as ScheduleState, revision: row.revision, data: row.data, canManage: canManage && row.data.authorizedBy === user.id, overdue: row.status === 'enabled' && Date.parse(row.data.scheduledAt) < Date.now() && !row.data.claim })),
    runs: runs.filter(row => row.data.snapshot.channel === 'email' && row.data.launchedBy === user.id && row.status === 'active').map(row => ({ id: row.id, name: row.data.snapshot.name, status: row.status })),
    worker: { running, ...(seen[0] ? { lastSeenAt: seen[0].at } : {}), explanation: running ? 'Local worker reported recently. It checks due schedules and current permissions.' : 'No recent running worker. Enabled schedules wait until a local worker runs.' } };
}
async function authorizedUser(tenantId: string, userId: string): Promise<AuthUser | undefined> {
  const [row] = await (await db()).all('SELECT id,email,organization_id FROM users WHERE id=? AND organization_id=?', [userId, tenantId]);
  return row ? { id: String(row.id), email: String(row.email), organizationId: String(row.organization_id) } : undefined;
}
async function settle(user: AuthUser, id: string, token: string, state: TaskState, reason?: string, receiptId?: string) {
  for (let retry = 0; retry < 4; retry++) {
    const row = await getRecord<AutomationSchedule>(user.organizationId, KIND, id);
    if (row.data.claim?.token !== token) return;
    const tasks = row.data.tasks.map(task => task.contactId === row.data.claim!.contactId ? { ...task, state, ...(reason ? { reason } : {}), ...(receiptId ? { receiptId } : {}) } : task);
    const { claim: _claim, ...rest } = row.data;
    const status = row.status === 'cancelled' || row.status === 'paused' ? row.status : tasks.some(task => ['uncertain', 'interrupted', 'blocked', 'rejected'].includes(task.state)) ? 'attention' : tasks.every(task => task.state === 'accepted') ? 'completed' : 'enabled';
    try { await updateRecord(user, row, { ...rest, tasks, history: history(row.data, `Recipient ${state}${reason ? `: ${reason}` : ''}`) }, status); return; }
    catch (error) { if (!(error instanceof HttpError && error.status === 409)) throw error; }
  }
  throw new HttpError(409, 'Schedule changed while saving the result. Recovery will inspect the durable delivery intent.');
}
async function recover(user: AuthUser, row: Schedule) {
  const claim = row.data.claim;
  if (!claim || Date.parse(claim.expiresAt) > Date.now()) return false;
  const delivery = (await listCampaignDelivery(user, row.data.runId)).recipients.find(item => item.contactId === claim.contactId);
  if (delivery?.status === 'accepted' || delivery?.status === 'rejected') await settle(user, row.id, claim.token, delivery.status, delivery.receipt?.reason, delivery.receipt?.id);
  else await settle(user, row.id, claim.token, claim.phase === 'egress' ? 'uncertain' : 'interrupted', claim.phase === 'egress' ? 'Worker stopped after dispatch was authorized. Check the mailbox; this attempt will not be retried.' : 'Worker stopped before provider dispatch. Review this attempt; it will not be retried automatically.');
  return true;
}

/** A bounded pass, at most five recipients, one at a time. Tests inject dispatch. */
export async function runAutomationTick(options: { enabled: boolean; workerId?: string; limit?: number; keepAlive?: boolean; dispatch?: EmailDispatch } = { enabled: false }) {
  const counts = { claimed: 0, accepted: 0, attention: 0, recovered: 0 };
  if (!options.enabled) return counts;
  const workerId = options.workerId || randomUUID();
  const limit = Math.min(5, Math.max(1, Math.floor(options.limit || 5)));
  await heartbeat(workerId, 'running');
  const rows = await (await db()).all('SELECT id,organization_id,data FROM entities WHERE kind=? ORDER BY created_at,id', [`platform:${KIND}`]);
  try {
    for (const raw of rows) {
      let row = await getRecord<AutomationSchedule>(String(raw.organization_id), KIND, String(raw.id));
      const user = await authorizedUser(String(raw.organization_id), row.data.authorizedBy);
      if (!user) continue;
      if (await recover(user, row)) { counts.recovered++; continue; }
      if (counts.claimed >= limit || row.status !== 'enabled' || row.data.claim || Date.parse(row.data.scheduledAt) > Date.now()) continue;
      try { await requireWorkspaceOperator(user); }
      catch {
        try { await updateRecord(user, row, { ...row.data, history: history(row.data, 'Authorizing operator no longer has active execution permission. Schedule stopped.') }, 'attention'); counts.attention++; }
        catch (error) { if (!(error instanceof HttpError && error.status === 409)) throw error; }
        continue;
      }
      const task = row.data.tasks.find(item => item.state === 'pending');
      if (!task) continue;
      const claim: NonNullable<AutomationSchedule['claim']> = { token: randomUUID(), contactId: task.contactId, phase: 'preparing', expiresAt: new Date(Date.now() + LEASE_MS).toISOString() };
      try { row = await authorizedUpdate(user, row, { ...row.data, claim, history: history(row.data, 'Worker claimed one due recipient') }); }
      catch (error) { if (error instanceof HttpError && error.status === 409) continue; throw error; }
      counts.claimed++;
      try {
        await requireWorkspaceOperator(user);
        const run = await getRecord<Run>(user.organizationId, 'campaign_run', row.data.runId);
        if (snapshotDigest(run.data) !== row.data.runDigest) throw new HttpError(409, 'Reviewed campaign snapshot changed.');
        const preview = await previewAutomation(user, row.data.runId);
        if (!preview.ready || !preview.recipients.find(item => item.contactId === task.contactId)?.eligible) throw new HttpError(409, 'Current run, mailbox, sources, contact permission or delivery state blocks this recipient.');
        const result = await sendCampaignEmail(user, { runId: row.data.runId, connectionId: row.data.connectionId, contactId: task.contactId, requestId: task.requestId }, options.dispatch || sendEmailViaProvider, async ({ run: authorizedRun }) => {
          // Canonical delivery validates every shared authority row. This gate
          // contributes only the schedule's exact claim to the SAME transaction.
          const current = await getRecord<AutomationSchedule>(user.organizationId, KIND, row.id);
          if (current.status !== 'enabled' || current.data.claim?.token !== claim.token || Date.parse(current.data.claim.expiresAt) <= Date.now()) throw new HttpError(409, 'Schedule stopped before provider dispatch.');
          if (snapshotDigest(authorizedRun) !== current.data.runDigest) throw new HttpError(409, 'Reviewed campaign snapshot changed.');
          const at = nowISO(), next = { ...current.data, claim: { ...claim, phase: 'egress' as const }, history: history(current.data, 'Provider dispatch authorized; cancellation cannot recall this request') };
          return [{ sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?', params: [JSON.stringify({ revision: current.revision + 1, updatedAt: at, data: next }), current.id, user.organizationId, `platform:${KIND}`, 'enabled', JSON.stringify({ revision: current.revision, updatedAt: current.updatedAt, data: current.data })], expectedChanges: 1 }];
        });
        const state = result.state === 'sending' ? 'uncertain' : result.state;
        await settle(user, row.id, claim.token, state, result.reason, result.id);
        if (state === 'accepted') counts.accepted++; else counts.attention++;
      } catch {
        // The persisted delivery state, not a thrown error, determines whether
        // an external outcome is known. Recovery never invents a retry.
        const current = await getRecord<AutomationSchedule>(user.organizationId, KIND, row.id);
        const delivery = (await listCampaignDelivery(user, row.data.runId)).recipients.find(item => item.contactId === task.contactId);
        const state = delivery?.status === 'accepted' ? 'accepted' : delivery?.status === 'uncertain' || delivery?.status === 'sending' || current.data.claim?.phase === 'egress' ? 'uncertain' : delivery?.status === 'rejected' ? 'rejected' : 'blocked';
        await settle(user, row.id, claim.token, state, state === 'accepted' ? undefined : state === 'uncertain' ? 'Provider outcome needs review. This attempt will never be resent automatically.' : 'Current authority blocked execution. Review the campaign, mailbox, sources and consent.', delivery?.receipt?.id);
        counts.attention++;
      }
    }
  } finally { if (!options.keepAlive) await heartbeat(workerId, 'stopped'); }
  return counts;
}

export async function stopAutomationWorker(workerId: string) {
  await heartbeat(workerId, 'stopped');
}
