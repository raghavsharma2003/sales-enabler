import type { AuthUser } from '../server/auth';
import { randomUUID } from 'node:crypto';
import { db, WriteConflictError } from '../server/db';
import { field, HttpError } from '../server/http';
import { getEntity, listEntities } from '../server/store';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from './records';
import { verifyAppliedPlanSources, type SourceAnchor } from '../campaign-planning/engine';
import { getConnection, listConnections } from '../integrations/vault';
import type { CampaignIntent } from '../business/contracts';
import { handleCampaignSetupAction, verifyManualCampaignAuthority } from './campaign-setup';
import { operatorMembershipFence } from '../team/service';
import type { CampaignSetupData } from './campaign-workflow';

export type Campaign = { name: string; kind: 'sales' | 'feedback'; objective: string; channel: 'browser' | 'manual_email' | 'email'; emailConnectionId?: string; agentReleaseId: string; subject: string; message: string; contactIds: string[]; ownerId: string; planId?: string; explicitIntentV1?: CampaignIntent; offeringName?: string; offeringSummary?: string; sourceAnchors?: Omit<SourceAnchor, 'content'>[]; callBrief?: string; successCriteria?: string; journeySteps?: string[]; citations?: unknown[]; setupOrigin?: 'manual_reviewed' | 'ai_reviewed'; setupRequestDigest?: string; setupDraft?: CampaignSetupData };
export type Recipient = { contactId: string; name: string; email: string; status: 'queued' | 'completed' | 'skipped'; evidence?: string; sessionId?: string; completedAt?: string };
export type Run = { campaignId: string; campaignRevision: number; snapshot: Campaign; emailAuthorizationVersion?: string; recipients: Recipient[]; launchedAt: string; launchedBy: string; pausedAt?: string; cancelledAt?: string };
const str = (value: unknown) => typeof value === 'string' ? value : '';
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500 || value.some((item) => typeof item !== 'string' || item.length > 100)) throw new HttpError(400, 'Choose up to 500 valid contacts.');
  return [...new Set(value as string[])];
}
function draft(body: Record<string, unknown>, ownerId: string): Campaign {
  const kind = body.kind;
  const channel = body.channel;
  if (kind !== 'sales' && kind !== 'feedback') throw new HttpError(400, 'Choose sales or feedback.');
  if (channel !== 'browser' && channel !== 'manual_email' && channel !== 'email') throw new HttpError(400, 'Choose a supported channel.');
  const emailConnectionId = channel === 'email' ? field(body, 'emailConnectionId', 100) : undefined;
  return { name: field(body, 'name', 160), kind, objective: field(body, 'objective', 1000), channel,
    ...(emailConnectionId ? { emailConnectionId } : {}), agentReleaseId: field(body, 'agentReleaseId', 100, false), subject: field(body, 'subject', 240, false),
    message: field(body, 'message', 5000), contactIds: ids(body.contactIds), ownerId };
}
const contactName = (contact: Record<string, unknown>) => str(contact.name) || 'Customer';
export function personalize(message: string, contact: Record<string, unknown>): string {
  const name = contactName(contact);
  return message.replace(/{{\s*(firstName|name|email)\s*}}/g, (_full, key: string) => key === 'firstName' ? name.split(/\s+/)[0] : key === 'name' ? name : str(contact.email));
}
export async function emailConnectionFor(user: AuthUser, id: string) {
  const listed = (await listConnections(user)).find((item) => item.id === id && (item.integrationId === 'gmail' || item.integrationId === 'microsoft_mail'));
  if (!listed) throw new HttpError(409, 'Choose a Gmail or Microsoft Mail connection in this workspace.');
  const connection = await getConnection(user, listed.integrationId);
  const required = listed.integrationId === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : 'Mail.Send';
  if (connection.status !== 'connected' || connection.settings.sendPermission !== required) throw new HttpError(409, `Check the connected mailbox and grant ${required} before sending.`);
  if (!connection.authorizationVersion || !/^[0-9a-f-]{36}$/i.test(connection.authorizationVersion)) throw new HttpError(409, 'Reconnect this mailbox before using it for a new email campaign.');
  return connection;
}
export async function campaignPreflight(user: AuthUser, campaign: PlatformRecord<Campaign>) {
  if (campaign.status !== 'draft') throw new HttpError(409, 'Complete campaign setup before review and launch.');
  const contacts = await listEntities(user.organizationId, 'contact');
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const profiles = await listRecords<{ contactId: string; name?: string; email?: string; consent: Record<string, { granted: boolean }> }>(user.organizationId, 'customer_profile');
  const profileById = new Map(profiles.map((profile) => [profile.data.contactId, profile.data]));
  const consentById = new Map(profiles.map((profile) => [profile.data.contactId, profile.data.consent]));
  const audience = campaign.data.contactIds.map((id) => {
    const original = byId.get(id);
    const profile = profileById.get(id);
    const contact: Record<string, unknown> | undefined = original ? { ...original, name: profile?.name ?? original.name, email: profile?.email ?? original.email } : undefined;
    const reasons: string[] = [];
    if (!contact) reasons.push('Contact no longer exists');
    if (contact) {
      if (contact.optOut === true || contact.doNotContact === true || contact.consent === 'denied') reasons.push('Contact opted out or denied consent');
      if (['manual_email', 'email'].includes(campaign.data.channel) && !str(contact.email)) reasons.push('Email address missing');
      if (['manual_email', 'email'].includes(campaign.data.channel) && consentById.get(id)?.email?.granted !== true) reasons.push('Email consent has not been recorded as granted');
      if (campaign.data.channel === 'browser' && consentById.get(id)?.browser_voice?.granted !== true) reasons.push('Browser voice consent has not been recorded as granted');
    }
    return { contactId: id, name: contact ? contactName(contact) : 'Missing contact', email: contact ? str(contact.email) : '', eligible: reasons.length === 0, reasons };
  });
  const blockers: string[] = [];
  if (campaign.data.planId) {
    try { await verifyAppliedPlanSources(user, campaign.data.planId, campaign.id); }
    catch { blockers.push('Approved company knowledge or its plan changed. Generate a new plan before launch.'); }
  } else if (campaign.data.explicitIntentV1 || campaign.data.setupOrigin || campaign.data.sourceAnchors?.length) {
    try { await verifyManualCampaignAuthority(user,campaign.id,campaign.data); }
    catch { blockers.push('Reviewed product, outcome or source evidence changed. Review a new campaign.'); }
  }
  if (!audience.length) blockers.push('Select at least one contact.');
  if (audience.some((item) => !item.eligible)) blockers.push('Resolve or remove ineligible contacts.');
  if (/{{[^}]+}}/.test(campaign.data.message.replace(/{{\s*(firstName|name|email)\s*}}/g, ''))) blockers.push('Message contains unresolved variables.');
  if (['manual_email', 'email'].includes(campaign.data.channel) && !campaign.data.subject) blockers.push('Add an email subject.');
  let emailAuthorizationVersion: string | undefined;
  if (campaign.data.channel === 'email') {
    try { emailAuthorizationVersion = (await emailConnectionFor(user, campaign.data.emailConnectionId || '')).authorizationVersion; }
    catch { blockers.push('Connect a Gmail or Microsoft mailbox with send permission.'); }
  }
  if (campaign.data.channel === 'browser') {
    if (!campaign.data.agentReleaseId) blockers.push('Select an exact agent release.');
    else {
      try { const release = await getRecord(user.organizationId, 'release', campaign.data.agentReleaseId); if (release.status !== 'active') blockers.push('Selected agent release is not active.'); }
      catch { blockers.push('Selected agent release was not found.'); }
    }
  }
  return { ready: blockers.length === 0, blockers, audience, emailAuthorizationVersion, reachable: audience.filter((item) => item.eligible).length,
    previews: audience.filter((item) => item.eligible).slice(0, 3).map((item) => ({ contactId: item.contactId, name: item.name,
      subject: personalize(campaign.data.subject, { name: item.name, email: item.email }), message: personalize(campaign.data.message, { name: item.name, email: item.email }) })) };
}
// Adapted from the CommandCentre campaign launch trace (research/command-centre-product-second-pass.md): explicit audience review and per-person preview. This implementation queues operator work; it has no mail dispatcher.
export async function handleCampaignAction(user: AuthUser, action: string, body: Record<string, unknown>): Promise<unknown> {
  if (action.startsWith('campaign.setup.')) return handleCampaignSetupAction(user,action,body);
  if (action === 'campaign.create') return createRecord(user, 'campaign', draft(body, user.id));
  if (action === 'campaign.update') {
    const current = await getRecord<Campaign>(user.organizationId, 'campaign', field(body, 'id', 100));
    if (current.status !== 'draft') throw new HttpError(409, 'Only draft campaigns can be edited.');
    const edited = draft(body, current.data.ownerId);
    if (current.data.planId || current.data.setupOrigin) {
      for (const key of ['name','kind','objective','channel','subject','message','contactIds'] as const) if (JSON.stringify(edited[key]) !== JSON.stringify(current.data[key])) throw new HttpError(409,'Reviewed campaign content and audience are fixed. Create a new campaign to revise them.');
      for (const key of ['callBrief','successCriteria','journeySteps'] as const) if (body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(current.data[key])) throw new HttpError(409,'Reviewed campaign content is fixed.');
      return updateRecord(user,current,{...current.data,agentReleaseId:edited.agentReleaseId,emailConnectionId:edited.emailConnectionId},'draft');
    }
    if (current.data.explicitIntentV1 && JSON.stringify([...edited.contactIds].sort()) !== JSON.stringify([...current.data.contactIds].sort())) throw new HttpError(409, 'The audience is part of this reviewed product campaign. Generate a new plan to change it.');
    return updateRecord(user, current, { ...edited, ...(current.data.planId ? { planId: current.data.planId, sourceAnchors: current.data.sourceAnchors, callBrief: current.data.callBrief, successCriteria: current.data.successCriteria, journeySteps: current.data.journeySteps, citations: current.data.citations } : {}), ...(current.data.explicitIntentV1 ? { explicitIntentV1: current.data.explicitIntentV1, offeringName: current.data.offeringName, offeringSummary: current.data.offeringSummary, contactIds: current.data.contactIds } : {}) }, 'draft');
  }
  if (action === 'campaign.preflight' || action === 'campaign.launch') {
    const campaign = await getRecord<Campaign>(user.organizationId, 'campaign', field(body, 'id', 100));
    if (campaign.status !== 'draft') throw new HttpError(409, 'Only draft campaigns can launch.');
    const database = await db();
    // Capture authority rows before preflight and lock their exact state in the launch transaction.
    const authority = action === 'campaign.launch' ? await database.all('SELECT id, kind, status, data FROM entities WHERE organization_id = ? AND kind IN (?, ?, ?, ?, ?, ?)', [user.organizationId, 'contact', 'platform:customer_profile', 'platform:release', 'platform:brain_source', 'platform:campaign_plan', 'integration:vault']) : [];
    const check = await campaignPreflight(user, campaign);
    if (action === 'campaign.preflight') return check;
    if (!check.ready) throw new HttpError(409, `Launch blocked: ${check.blockers.join(' ')}`);
    const businessFences = campaign.data.planId ? await verifyAppliedPlanSources(user, campaign.data.planId, campaign.id) : campaign.data.explicitIntentV1 || campaign.data.setupOrigin ? await verifyManualCampaignAuthority(user,campaign.id,campaign.data) : [];
    const membership = await operatorMembershipFence(user);
    if (campaign.data.channel === 'email') {
      const mailboxRow = authority.find(item => item.kind === 'integration:vault' && item.id === campaign.data.emailConnectionId);
      if (!mailboxRow || JSON.parse(String(mailboxRow.data)).authorizationVersion !== check.emailAuthorizationVersion) throw new HttpError(409, 'Mailbox authorization changed before launch. Review the campaign again.');
    }
    const run: Run = { campaignId: campaign.id, campaignRevision: campaign.revision, snapshot: structuredClone(campaign.data),
      ...(check.emailAuthorizationVersion ? { emailAuthorizationVersion: check.emailAuthorizationVersion } : {}),
      recipients: check.audience.map((item) => ({ contactId: item.contactId, name: item.name, email: item.email, status: 'queued' })),
      launchedAt: new Date().toISOString(), launchedBy: user.id };
    const existing = (await listRecords(user.organizationId, 'campaign_run')).find((item) => (item.data as unknown as Run).campaignId === campaign.id);
    if (existing) throw new HttpError(409, 'This draft already has a run.');
    const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND organization_id = ? AND kind = ? AND status = ?', [campaign.id, user.organizationId, 'platform:campaign', 'draft']);
    if (!row || JSON.parse(String(row.data)).revision !== campaign.revision) throw new HttpError(409, 'Campaign changed. Review it again.');
    const id = randomUUID(), now = new Date().toISOString();
    try { await database.batch([
      membership,
      ...businessFences,
      ...authority.filter((item) => item.kind === 'platform:release' ? item.id === campaign.data.agentReleaseId : item.kind === 'platform:campaign_plan' ? item.id === campaign.data.planId : item.kind === 'platform:brain_source' ? campaign.data.sourceAnchors?.some(anchor => anchor.id === item.id) : item.kind === 'integration:vault' ? item.id === campaign.data.emailConnectionId : campaign.data.contactIds.includes(item.kind === 'contact' ? String(item.id) : String(JSON.parse(String(item.data)).data.contactId))).map((item) => ({ sql: 'UPDATE entities SET data = data WHERE id = ? AND organization_id = ? AND kind = ? AND data = ? AND (status = ? OR (status IS NULL AND ? IS NULL))', params: [String(item.id), user.organizationId, String(item.kind), String(item.data), item.status === null ? null : String(item.status), item.status === null ? null : String(item.status)], expectedChanges: 1 })),
      { sql: 'UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND status = ? AND data = ?', params: [JSON.stringify({ revision: campaign.revision + 1, updatedAt: now, data: campaign.data }), 'launched', campaign.id, user.organizationId, 'platform:campaign', 'draft', String(row.data)], expectedChanges: 1 },
      { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, user.organizationId, 'platform:campaign_run', 'active', JSON.stringify({ revision: 1, updatedAt: now, data: run }), now] },
      ...[[campaign.id, 'campaign.updated:launched'], [id, 'campaign_run.created']].map(([entityId, event]) => ({ sql: 'INSERT INTO audit_events (id, organization_id, user_id, entity_id, event, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [randomUUID(), user.organizationId, user.id, entityId, event, now] })),
    ]); } catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409, 'Campaign changed. Review it again.'); throw error; }
    return getRecord(user.organizationId, 'campaign_run', id);
  }
  if (['campaign.pause', 'campaign.resume', 'campaign.cancel', 'campaign.result'].includes(action)) {
    const run = await getRecord<Run>(user.organizationId, 'campaign_run', field(body, 'runId', 100));
    if (action === 'campaign.pause') {
      if (run.status !== 'active') throw new HttpError(409, 'Only an active run can be paused.');
      return updateRecord(user, run, { ...run.data, pausedAt: new Date().toISOString() }, 'paused');
    }
    if (action === 'campaign.resume') {
      if (run.status !== 'paused') throw new HttpError(409, 'Only a paused run can resume.');
      return updateRecord(user, run, { ...run.data, pausedAt: undefined }, 'active');
    }
    if (action === 'campaign.cancel') {
      if (run.status !== 'active' && run.status !== 'paused') throw new HttpError(409, 'This run cannot be cancelled.');
      return updateRecord(user, run, { ...run.data, cancelledAt: new Date().toISOString() }, 'cancelled');
    }
    if (run.status !== 'active') throw new HttpError(409, 'Only active runs accept results.');
    const contactId = field(body, 'contactId', 100);
    const recipient = run.data.recipients.find((item) => item.contactId === contactId);
    if (!recipient || recipient.status !== 'queued') throw new HttpError(409, 'Recipient is not queued.');
    const outcome = body.outcome;
    if (outcome !== 'completed' && outcome !== 'skipped') throw new HttpError(400, 'Choose completed or skipped.');
    if (run.data.snapshot.channel === 'email') throw new HttpError(409, 'Email delivery is recorded from the provider send action.');
    const evidence = field(body, 'evidence', 1000);
    let sessionId: string | undefined;
    if (run.data.snapshot.channel === 'browser' && outcome === 'completed') {
      sessionId = field(body, 'sessionId', 100);
      const session = await getEntity(user.organizationId, 'session', sessionId);
      if (session.contactId !== contactId) throw new HttpError(409, 'Session belongs to a different contact.');
      const release = await getRecord(user.organizationId, 'release', run.data.snapshot.agentReleaseId);
      if (session.source !== 'browser_voice' || session.releaseId !== release.id || session.agentVersionId !== release.data.versionId || session.campaignRunId !== run.id) throw new HttpError(409, 'Attach a browser conversation issued for this exact campaign run and release.');
    }
    const recipients = run.data.recipients.map((item) => item.contactId === contactId ? { ...item, status: outcome, evidence, sessionId, completedAt: new Date().toISOString() } : item);
    return updateRecord(user, run, { ...run.data, recipients }, recipients.every((item) => item.status !== 'queued') ? 'completed' : 'active');
  }
  throw new HttpError(400, 'Unknown campaign action.');
}
