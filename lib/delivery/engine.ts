/**
 * Business adaptation of Vyakti-GroupAI delivery-runtime's one-intent-per-lane,
 * pre-egress authority check and ambiguous-result rule. One explicit operator
 * request creates one durable send intent; this module never retries egress.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { field, HttpError } from '../server/http';
import { getRecord, listRecords, type PlatformRecord } from '../platform/records';
import { emailConnectionFor, personalize, type Run } from '../platform/campaigns';
import { verifyAppliedPlanSources } from '../campaign-planning/engine';
import { verifyManualCampaignAuthority } from '../platform/campaign-setup';
import { getUsableCredentials } from '../integrations/oauth';
import { sendEmailViaProvider, validRecipient, type EmailDispatch, type EmailProvider, type ProviderResult } from './providers';
import { stableDeliveryIdempotencyKey } from './key';
import { operatorMembershipFence } from '../team/service';

export type DeliveryState = 'sending' | 'accepted' | 'rejected' | 'uncertain';
export type DeliveryIntent = {
  runId: string; contactId: string; requestId: string; connectionId: string; connectionRevision: number; authorizationVersion: string;
  provider: EmailProvider; destination: string; payloadDigest: string; idempotencyKey: string; state: DeliveryState;
  providerReference?: string; reason?: string; requestedBy: string; createdAt: string; updatedAt: string;
  transitions: { state: DeliveryState; at: string }[]; dispatchAuthorizedAt?: string;
};
export type DeliveryReceipt = { id: string; runId: string; contactId: string; state: DeliveryState; provider: EmailProvider; providerReference?: string; reason?: string; createdAt: string; updatedAt: string };
type Stored = { revision: number; updatedAt: string; data: DeliveryIntent };
type Anchor = { id: string; kind: string; status: string | null; data: string };
type Statements = Parameters<Database['batch']>[0];
export type EmailDispatchGate = (context: { run: Run }) => Promise<Statements>;
const kind = 'delivery:email_intent';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (tenantId: string, runId: string, contactId: string) => `delivery:${digest([tenantId, runId, contactId])}`;
const receipt = (row: PlatformRecord<DeliveryIntent>): DeliveryReceipt => ({ id: row.id, runId: row.data.runId, contactId: row.data.contactId, state: row.data.state, provider: row.data.provider,
  ...(row.data.providerReference ? { providerReference: row.data.providerReference } : {}), ...(row.data.reason ? { reason: row.data.reason } : {}), createdAt: row.data.createdAt, updatedAt: row.data.updatedAt });
function decoded(row: Record<string, unknown>): PlatformRecord<DeliveryIntent> {
  const saved = JSON.parse(String(row.data)) as Stored;
  return { id: String(row.id), kind: 'email_intent', status: String(row.status), createdAt: String(row.created_at), updatedAt: saved.updatedAt, revision: saved.revision, data: saved.data };
}
async function anchor(id: string, tenantId: string, recordKind: string): Promise<Anchor> {
  const [row] = await (await db()).all('SELECT id,kind,status,data FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, tenantId, recordKind]);
  if (!row) throw new HttpError(409, 'Campaign authority changed. Refresh the run before sending.');
  return { id: String(row.id), kind: String(row.kind), status: row.status === null ? null : String(row.status), data: String(row.data) };
}
function fence(row: Anchor, tenantId: string) {
  return row.status === null
    ? { sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND status IS NULL AND data = ?', params: [row.id, tenantId, row.kind, row.data], expectedChanges: 1 }
    : { sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [row.id, tenantId, row.kind, row.status, row.data], expectedChanges: 1 };
}
async function existingIntent(user: AuthUser, id: string): Promise<PlatformRecord<DeliveryIntent> | undefined> {
  const [row] = await (await db()).all('SELECT id,status,data,created_at FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, user.organizationId, kind]);
  return row ? decoded(row) : undefined;
}
async function finish(user: AuthUser, row: PlatformRecord<DeliveryIntent>, outcome: ProviderResult): Promise<DeliveryReceipt> {
  const now = new Date().toISOString();
  const next: DeliveryIntent = { ...row.data, state: outcome.state, updatedAt: now, transitions: [...row.data.transitions, { state: outcome.state, at: now }],
    ...(outcome.state === 'accepted' && outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
    ...(outcome.state !== 'accepted' ? { reason: outcome.reason } : {}) };
  try {
    await (await db()).batch([
      { sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [JSON.stringify({ revision: row.revision + 1, updatedAt: now, data: next }), outcome.state, row.id, user.organizationId, kind, 'sending', JSON.stringify({ revision: row.revision, updatedAt: row.updatedAt, data: row.data })], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, row.id, `email_delivery.${outcome.state}`, now] },
    ]);
  } catch {
    // A provider may have accepted the message. The prior 'sending' record stays
    // durable and is surfaced as uncertain after the lease window; never resend.
    throw new HttpError(503, 'Provider outcome could not be saved. Delivery is uncertain; inspect the mailbox before any new campaign.');
  }
  return receipt({ ...row, status: outcome.state, revision: row.revision + 1, updatedAt: now, data: next });
}
async function staleAsUncertain(user: AuthUser, row: PlatformRecord<DeliveryIntent>): Promise<PlatformRecord<DeliveryIntent>> {
  if (row.status !== 'sending' || Date.now() - Date.parse(row.data.createdAt) < 60_000) return row;
  const now = new Date().toISOString();
  const next: DeliveryIntent = { ...row.data, state: 'uncertain', reason: 'The send worker stopped before its result was recorded.', updatedAt: now,
    transitions: [...row.data.transitions, { state: 'uncertain', at: now }] };
  try { await (await db()).batch([
    { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',
      params: [JSON.stringify({ revision: row.revision + 1, updatedAt: now, data: next }), 'uncertain', row.id, user.organizationId, kind, 'sending', JSON.stringify({ revision: row.revision, updatedAt: row.updatedAt, data: row.data })], expectedChanges: 1 },
    { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)',
      params: [randomUUID(), user.organizationId, row.data.requestedBy, row.id, 'email_delivery.uncertain', now] },
  ]); }
  catch { return (await existingIntent(user, row.id)) || row; }
  return { ...row, status: 'uncertain', revision: row.revision + 1, updatedAt: now, data: next };
}

export async function listCampaignDelivery(user: AuthUser, runId: string) {
  const run = await getRecord<Run>(user.organizationId, 'campaign_run', runId);
  if (run.data.snapshot.channel !== 'email') throw new HttpError(409, 'This run does not use connected email delivery.');
  const rows = await (await db()).all('SELECT id,status,data,created_at FROM entities WHERE organization_id=? AND kind=?', [user.organizationId, kind]);
  const intents = await Promise.all(rows.map(decoded).filter(row => row.data.runId === runId).map(row => staleAsUncertain(user, row)));
  const byContact = new Map(intents.map(row => [row.data.contactId, receipt(row)]));
  return { runId, runStatus: run.status, connectionId: run.data.snapshot.emailConnectionId,
    recipients: run.data.recipients.map(item => ({ contactId: item.contactId, name: item.name, email: item.email, status: byContact.get(item.contactId)?.state || 'ready', receipt: byContact.get(item.contactId) })) };
}

type SendInput = { runId: string; contactId: string; connectionId: string; requestId: string };

/** Validate the exact captured rows that the caller subsequently fences. */
async function captureEmailAuthority(user: AuthUser, input: SendInput) {
  const membership = await operatorMembershipFence(user);
  const { runId, contactId, connectionId } = input;
  const runRow = await anchor(runId, user.organizationId, 'platform:campaign_run');
  const run = (JSON.parse(runRow.data) as { data: Run }).data;
  if (runRow.status !== 'active' || run.pausedAt || run.cancelledAt) throw new HttpError(409, 'Only an active campaign run can send.');
  if (run.launchedBy !== user.id) throw new HttpError(403, 'Only the operator who launched this run can send its email.');
  if (run.snapshot.channel !== 'email' || run.snapshot.emailConnectionId !== connectionId) throw new HttpError(409, 'The selected mailbox does not match the campaign snapshot.');
  const recipient = run.recipients.find(item => item.contactId === contactId);
  if (!run.snapshot.contactIds.includes(contactId) || !recipient || recipient.status !== 'queued') throw new HttpError(409, 'Recipient does not match the queued campaign snapshot.');
  // Refresh first, then capture and validate the exact credential-bearing row.
  const connection = await emailConnectionFor(user, connectionId);
  const provider = connection.integrationId as EmailProvider;
  const usable = await getUsableCredentials(user, provider);
  const connectionRow = await anchor(connectionId, user.organizationId, 'integration:vault');
  const mailbox = JSON.parse(connectionRow.data) as typeof connection;
  const requiredScope = provider === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : 'Mail.Send';
  if (mailbox.id !== connectionId || mailbox.integrationId !== provider || mailbox.status !== 'connected' || connectionRow.status !== 'connected' || mailbox.settings.sendPermission !== requiredScope || !mailbox.authorizationVersion || mailbox.authorizationVersion !== run.emailAuthorizationVersion || mailbox.revision !== usable.revision) throw new HttpError(409, 'Mailbox authorization changed before dispatch. Review a new run.');
  if (usable.credentials.oauthProvider && !usable.credentials.scopes?.includes(requiredScope)) throw new HttpError(409, 'OAuth mailbox does not have the required send permission.');
  const contactRow = await anchor(contactId, user.organizationId, 'contact');
  const contact = JSON.parse(contactRow.data) as Record<string, unknown>;
  const profileId = (await listRecords<{ contactId: string }>(user.organizationId, 'customer_profile')).find(item => item.data.contactId === contactId)?.id;
  if (!profileId) throw new HttpError(409, 'Current customer email consent is missing.');
  const profileRow = await anchor(profileId, user.organizationId, 'platform:customer_profile');
  const profile = (JSON.parse(profileRow.data) as { data: { contactId: string; email?: string; consent?: Record<string, { granted: boolean }> } }).data;
  if (profile.contactId !== contactId || profileRow.status !== 'active' || profile.consent?.email?.granted !== true || contact.optOut === true || contact.doNotContact === true || contact.consent === 'denied') throw new HttpError(409, 'Current customer email consent or contact permission blocks delivery.');
  const destination = String(profile.email ?? contact.email ?? '').trim();
  if (!validRecipient(destination) || destination.toLowerCase() !== recipient.email.toLowerCase()) throw new HttpError(409, 'Customer email changed after launch. Create a new reviewed run.');
  const anchors = [runRow, contactRow, profileRow, connectionRow];
  let businessFences: Statements = [];
  if (run.snapshot.planId) {
    const planRow = await anchor(run.snapshot.planId, user.organizationId, 'platform:campaign_plan');
    const plan = JSON.parse(planRow.data).data as { campaignId?: string; sourceAnchors?: Run['snapshot']['sourceAnchors']; explicitIntentV1?: Run['snapshot']['explicitIntentV1']; contactIds?: string[] };
    if (planRow.status !== 'applied' || plan.campaignId !== run.campaignId || JSON.stringify(plan.sourceAnchors || []) !== JSON.stringify(run.snapshot.sourceAnchors || [])) throw new HttpError(409, 'Campaign source snapshot changed. Review a new run.');
    if (JSON.stringify(plan.explicitIntentV1) !== JSON.stringify(run.snapshot.explicitIntentV1)) throw new HttpError(409, 'Reviewed product or outcome differs from the launched run.');
    anchors.push(planRow);
    if (plan.explicitIntentV1) {
      const campaignRow = await anchor(run.campaignId, user.organizationId, 'platform:campaign');
      const campaign = JSON.parse(campaignRow.data).data as Run['snapshot'];
      if (JSON.stringify(campaign.explicitIntentV1) !== JSON.stringify(plan.explicitIntentV1) || JSON.stringify(campaign.contactIds) !== JSON.stringify(plan.contactIds) || JSON.stringify(campaign.contactIds) !== JSON.stringify(run.snapshot.contactIds)) throw new HttpError(409, 'Product, outcome or audience authority changed after launch.');
      anchors.push(campaignRow);
    }
    // Capture first: a source change during semantic validation then loses CAS.
    for (const source of run.snapshot.sourceAnchors || []) anchors.push(await anchor(source.id, user.organizationId, 'platform:brain_source'));
    businessFences = await verifyAppliedPlanSources(user, run.snapshot.planId, run.campaignId);
  } else if (run.snapshot.setupOrigin === 'manual_reviewed') businessFences = await verifyManualCampaignAuthority(user,run.campaignId,run.snapshot);
  else if (run.snapshot.sourceAnchors?.length || run.snapshot.explicitIntentV1) throw new HttpError(409, 'Campaign sources or business intent have no reviewed authority.');
  const subject = personalize(run.snapshot.subject, recipient), body = personalize(run.snapshot.message, recipient);
  if (!subject || /[\r\n\0]/.test(subject) || /{{[^}]+}}/.test(subject + body)) throw new HttpError(409, 'Email content contains invalid or unresolved fields.');
  const payloadDigest = digest([user.organizationId, runId, contactId, mailbox.authorizationVersion, destination, subject, body]);
  return { run, provider, mailbox, destination, subject, body, token: usable.credentials.token, payloadDigest,
    runDigest: digest([run.snapshot, run.launchedBy, run.launchedAt, run.emailAuthorizationVersion]),
    fences: [membership, ...anchors.map(row => fence(row, user.organizationId)), ...businessFences] };
}

export async function sendCampaignEmail(user: AuthUser, input: SendInput, dispatch: EmailDispatch = sendEmailViaProvider, gate?: EmailDispatchGate): Promise<DeliveryReceipt> {
  const { runId, contactId, connectionId, requestId } = input;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new HttpError(400, 'A unique send request ID is required.');
  const intentId = key(user.organizationId, runId, contactId);
  const prior = await existingIntent(user, intentId);
  if (prior) {
    if (prior.data.requestId !== requestId || prior.data.connectionId !== connectionId) throw new HttpError(409, 'This recipient already has a send intent. Inspect its result before taking another action.');
    return receipt(await staleAsUncertain(user, prior));
  }
  // Preserve tenant-scoped not-found semantics before membership migration or
  // credential access. The returned object is not used as dispatch authority.
  await getRecord<Run>(user.organizationId, 'campaign_run', runId);
  const authority = await captureEmailAuthority(user, input), now = new Date().toISOString();
  const data: DeliveryIntent = { runId, contactId, requestId, connectionId, connectionRevision: authority.mailbox.revision, authorizationVersion: authority.mailbox.authorizationVersion!, provider: authority.provider, destination: authority.destination,
    idempotencyKey: stableDeliveryIdempotencyKey({ tenantId: user.organizationId, intentId, provider: authority.provider, destinationId: authority.destination, runId, connectionId }),
    payloadDigest: authority.payloadDigest, state: 'sending', requestedBy: user.id, createdAt: now, updatedAt: now, transitions: [{ state: 'sending', at: now }] };
  let record: PlatformRecord<DeliveryIntent> = { id: intentId, kind: 'email_intent', status: 'sending', createdAt: now, updatedAt: now, revision: 1, data };
  try {
    await (await db()).batch([
      ...authority.fences,
      { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [intentId, user.organizationId, kind, 'sending', JSON.stringify({ revision: 1, updatedAt: now, data }), now] },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, intentId, 'email_delivery.sending', now] },
    ]);
  } catch (error) {
    const duplicate = await existingIntent(user, intentId);
    if (duplicate) {
      if (duplicate.data.requestId !== requestId || duplicate.data.connectionId !== connectionId) throw new HttpError(409, 'This recipient already has a send intent.');
      return receipt(await staleAsUncertain(user, duplicate));
    }
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Campaign authority changed before dispatch. Refresh and review.');
    throw error;
  }
  let finalAuthority: Awaited<ReturnType<typeof captureEmailAuthority>>;
  try {
    // Intent creation is not dispatch authority: revalidate after its await.
    finalAuthority = await captureEmailAuthority(user, input);
    if (finalAuthority.payloadDigest !== data.payloadDigest || finalAuthority.runDigest !== authority.runDigest) throw new HttpError(409, 'Reviewed campaign content changed before dispatch.');
    const gateStatements = gate ? await gate({ run: finalAuthority.run }) : [];
    const at = new Date().toISOString();
    const next = { ...record, revision: record.revision + 1, updatedAt: at, data: { ...record.data, connectionRevision: finalAuthority.mailbox.revision, updatedAt: at, dispatchAuthorizedAt: at } };
    await (await db()).batch([
      ...finalAuthority.fences, ...gateStatements,
      { sql: 'UPDATE entities SET data=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?', params: [JSON.stringify({ revision: next.revision, updatedAt: at, data: next.data }), intentId, user.organizationId, kind, 'sending', JSON.stringify({ revision: record.revision, updatedAt: record.updatedAt, data: record.data })], expectedChanges: 1 },
      { sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, intentId, 'email_delivery.dispatch_authorized', at] },
    ]);
    record = next;
  } catch {
    // No provider callback has been invoked, so this is a known local rejection.
    return finish(user, record, { state: 'rejected', reason: 'Current run, recipient, source, mailbox or operator authority changed before provider dispatch. No provider request was made.' });
  }
  // No additional asynchronous work between the atomic dispatch reservation and
  // the provider callback. Changes after that boundary cannot recall a request.
  let outcome: ProviderResult;
  try { outcome = await dispatch({ provider: finalAuthority.provider, token: finalAuthority.token, to: finalAuthority.destination, subject: finalAuthority.subject, body: finalAuthority.body }); }
  catch { outcome = { state: 'uncertain', reason: 'Provider call stopped without a definitive response.' }; }
  return finish(user, record, outcome);
}

export function parseSendInput(body: Record<string, unknown>) {
  return { runId: field(body, 'runId', 100), contactId: field(body, 'contactId', 100), connectionId: field(body, 'connectionId', 100), requestId: field(body, 'requestId', 100) };
}
