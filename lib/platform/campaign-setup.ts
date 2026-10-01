import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { field, HttpError } from '../server/http';
import { getRecord, listRecords, type PlatformRecord } from './records';
import { operatorMembershipFence } from '../team/service';
import { createCampaignIntent, assertBusinessIntentCurrent, getBusinessIntentEvidence } from '../business/engine';
import type { CampaignIntentInput } from '../business/contracts';
import type { Campaign } from './campaigns';
import type { CampaignPlan } from '../campaign-planning/engine';
import { campaignSetupReadiness, mergeCampaignSetup, parseCampaignSetupPatch, toCampaignDraftInput, type CampaignSetupData, type CampaignSetupFields, type CampaignSetupPhase } from './campaign-workflow';
type Statements = Parameters<Database['batch']>[0];
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const setupIntentInput = (f: CampaignSetupFields): CampaignIntentInput => ({ schemaVersion:1,offeringId:f.offeringId || '',outcome:f.outcome!,signalIds:f.signalIds || [],audienceRationale:f.audienceRationale || '',reviewColumns:f.reviewColumns || [] });
export async function setupSnapshot(user: AuthUser, id: string, revision: unknown) {
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new HttpError(400,'Current campaign revision required.');
  const database = await db();
  const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?',[id,user.organizationId,'platform:campaign']);
  if (!row) throw new HttpError(404,'Campaign was not found in this workspace.');
  const stored = JSON.parse(String(row.data));
  if (row.status !== 'setup' || stored.revision !== revision || stored.data.schemaVersion !== 1) throw new HttpError(409,'Campaign changed. Reload the saved setup.');
  return { id,revision:Number(revision),data:stored.data as CampaignSetupData,serialized:String(row.data),fence:{sql:'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',params:[id,user.organizationId,'platform:campaign','setup',String(row.data)],expectedChanges:1} };
}
export async function setupReferenceFences(user: AuthUser, fields: CampaignSetupFields, complete = false): Promise<Statements> {
  const database = await db(), fences: Statements = [];
  const refs: [string,string][] = [...(fields.contactIds || []).map(id => ['contact',id] as [string,string]),...(fields.signalIds || []).map(id => ['platform:business_signal',id] as [string,string]),...(fields.sourceIds || []).map(id => ['platform:brain_source',id] as [string,string])];
  if (fields.offeringId) refs.push(['platform:offering',fields.offeringId]);
  if (fields.agentReleaseId) refs.push(['platform:release',fields.agentReleaseId]);
  if (fields.emailConnectionId) refs.push(['integration:vault',fields.emailConnectionId]);
  for (const [kind,id] of refs) {
    const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?',[id,user.organizationId,kind]);
    if (!row) throw new HttpError(404,'A selected campaign reference was not found in this workspace.');
    if (complete && kind === 'platform:release' && fields.channel === 'browser' && row.status !== 'active') throw new HttpError(409,'Choose an active agent release.');
    if (complete && kind === 'platform:brain_source' && row.status !== 'approved') throw new HttpError(409,'Choose approved sources.');
    fences.push({sql:'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND (status=? OR (status IS NULL AND ? IS NULL))',params:[id,user.organizationId,kind,String(row.data),row.status == null ? null : String(row.status),row.status == null ? null : String(row.status)],expectedChanges:1});
  }
  if (complete && fields.channel === 'email') await (await import('./campaigns')).emailConnectionFor(user,fields.emailConnectionId || '');
  return fences;
}
function patch(value: unknown) { try { return parseCampaignSetupPatch(value); } catch (error) { throw new HttpError(400,(error as Error).message); } }
function audit(user: AuthUser,id: string,event: string,now: string) { return {sql:'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)',params:[randomUUID(),user.organizationId,user.id,id,event,now]}; }
export async function handleCampaignSetupAction(user: AuthUser, action: string, body: Record<string,unknown>) {
  const membership = await operatorMembershipFence(user), database = await db(), now = new Date().toISOString();
  if (action === 'campaign.setup.reopen') {
    if (Object.keys(body).some(key => !['action','id','revision'].includes(key))) throw new HttpError(400,'Reopening accepts only the campaign ID and current revision.');
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new HttpError(400,'Current campaign revision required.');
    const id = field(body,'id',100);
    const [row] = await database.all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?',[id,user.organizationId,'platform:campaign']);
    if (!row) throw new HttpError(404,'Campaign was not found in this workspace.');
    const stored = JSON.parse(String(row.data)), campaign = stored.data as Campaign;
    if (row.status !== 'draft' || stored.revision !== body.revision || !['manual_reviewed','ai_reviewed'].includes(campaign.setupOrigin || '') || campaign.setupDraft?.schemaVersion !== 1) throw new HttpError(409,'Only an unlaunched reviewed draft with its saved setup can be reopened.');
    const runs = await listRecords<{campaignId:string}>(user.organizationId,'campaign_run');
    if (runs.some(run => run.data.campaignId === id)) throw new HttpError(409,'A campaign with an execution run cannot return to setup.');
    const data: CampaignSetupData = {...campaign.setupDraft,phase:'intent',fields:{...campaign.setupDraft.fields,agentReleaseId:campaign.agentReleaseId,emailConnectionId:campaign.emailConnectionId}};
    // Reopening deliberately allows stale references to be repaired. The exact
    // draft preimage serializes this transition against launch's same-row CAS.
    try { await database.batch([membership,{sql:'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',params:[JSON.stringify({revision:stored.revision+1,updatedAt:now,data}),'setup',id,user.organizationId,'platform:campaign','draft',String(row.data)],expectedChanges:1},audit(user,id,'campaign.setup.reopened',now)]); }
    catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409,'Campaign or membership changed. Reload before editing setup.'); throw error; }
    return getRecord<CampaignSetupData>(user.organizationId,'campaign',id);
  }
  if (action === 'campaign.setup.create') {
    const fields = patch(body.fields ?? {}), requestId = field(body,'requestId',160);
    const id = `campaign:${sha([user.organizationId,requestId])}`, requestDigest = sha(Object.entries(fields).sort(([a],[b]) => a.localeCompare(b)));
    const existing = async () => {
      const rows = await database.all('SELECT id FROM entities WHERE id=? AND organization_id=? AND kind=?',[id,user.organizationId,'platform:campaign']);
      if (!rows.length) return undefined;
      const saved = await getRecord<CampaignSetupData & { setupRequestDigest?: string }>(user.organizationId,'campaign',id);
      if ((saved.data.requestDigest || saved.data.setupRequestDigest) !== requestDigest) throw new HttpError(409,'This request ID was already used for different campaign fields.');
      return saved;
    };
    const saved = await existing(); if (saved) return saved;
    const references = await setupReferenceFences(user,fields);
    const data: CampaignSetupData = {schemaVersion:1,phase:'intent',fields,name:fields.name,ownerId:user.id,requestDigest};
    try { await database.batch([membership,...references,{sql:'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)',params:[id,user.organizationId,'platform:campaign','setup',JSON.stringify({revision:1,updatedAt:now,data}),now]},audit(user,id,'campaign.setup.created',now)]); }
    catch (error) { const saved = await existing(); if (saved) return saved; if (error instanceof WriteConflictError) throw new HttpError(409,'Campaign references or membership changed.'); throw error; }
    return getRecord<CampaignSetupData>(user.organizationId,'campaign',id);
  }
  const current = await setupSnapshot(user,field(body,'id',100),body.revision);
  let data: CampaignSetupData | Campaign, status = 'setup', fences: Statements = [];
  if (action === 'campaign.setup.update') {
    const phase = body.phase === undefined ? current.data.phase : body.phase;
    if (typeof phase !== 'string' || !['intent','audience','agent_content','review'].includes(phase)) throw new HttpError(400,'Choose an editable campaign phase.');
    const fields = patch(body.patch ?? {});
    fences = await setupReferenceFences(user,fields);
    data = mergeCampaignSetup(current.data,fields,phase as CampaignSetupPhase);
  } else if (action === 'campaign.setup.finalize') {
    const fields = current.data.fields, readiness = campaignSetupReadiness(fields);
    if (!readiness.ready) throw new HttpError(409,readiness.review.join(' '));
    fences = await setupReferenceFences(user,fields,true);
    const accepted = current.data.acceptedPlan;
    const intent = accepted ? accepted.explicitIntentV1 : await createCampaignIntent(user,setupIntentInput(fields),fields.contactIds!);
    const evidence = await getBusinessIntentEvidence(user,intent);
    fences.push(...await assertBusinessIntentCurrent(user,intent));
    const draft = toCampaignDraftInput(fields);
    data = {...draft,ownerId:current.data.ownerId,setupRequestDigest:current.data.requestDigest,setupDraft:structuredClone(current.data),explicitIntentV1:intent,offeringName:evidence.offering.data.name,offeringSummary:evidence.offering.data.summary,setupOrigin:accepted ? 'ai_reviewed' : 'manual_reviewed'};
    if (accepted) {
      const plan = await getRecord<CampaignPlan>(user.organizationId,'campaign_plan',accepted.planId);
      if (plan.status !== 'applied' || plan.revision !== accepted.planRevision || plan.data.campaignId !== current.id || plan.data.requestDigest !== accepted.requestDigest || JSON.stringify(plan.data.explicitIntentV1) !== JSON.stringify(intent)) throw new HttpError(409,'Accepted plan authority changed. Review a new proposal.');
      const { verifyAppliedPlanSources } = await import('../campaign-planning/engine');
      fences.push(...await verifyAppliedPlanSources(user,plan.id,current.id));
      data = {...data,planId:plan.id,sourceAnchors:plan.data.sourceAnchors,citations:plan.data.draft.citations};
    }
    status = 'draft';
  } else throw new HttpError(400,'Unknown campaign setup action.');
  try { await database.batch([membership,...fences,{sql:'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',params:[JSON.stringify({revision:current.revision+1,updatedAt:now,data}),status,current.id,user.organizationId,'platform:campaign','setup',current.serialized],expectedChanges:1},audit(user,current.id,`campaign.setup.${status === 'draft' ? 'finalized' : 'updated'}`,now)]); }
  catch (error) { if (error instanceof WriteConflictError) throw new HttpError(409,'Campaign or its authority changed. Reload and review.'); throw error; }
  return getRecord(user.organizationId,'campaign',current.id);
}
/** Direct manual intent is server-stamped and tied to the canonical immutable campaign. */
export async function verifyManualCampaignAuthority(user: AuthUser, campaignId: string, snapshot: Campaign): Promise<Statements> {
  if (snapshot.planId || snapshot.setupOrigin !== 'manual_reviewed' || !snapshot.explicitIntentV1 || snapshot.sourceAnchors?.length) throw new HttpError(409,'Campaign has no reviewed manual authority.');
  const [row] = await (await db()).all('SELECT data,status FROM entities WHERE id=? AND organization_id=? AND kind=?',[campaignId,user.organizationId,'platform:campaign']);
  if (!row || !['draft','launched'].includes(String(row.status))) throw new HttpError(409,'Reviewed campaign authority is unavailable.');
  const current = JSON.parse(String(row.data)).data as Campaign;
  if (current.setupOrigin !== 'manual_reviewed' || JSON.stringify(current) !== JSON.stringify(snapshot)) throw new HttpError(409,'Reviewed manual campaign changed after acceptance.');
  return [{sql:'UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND status=? AND data=?',params:[campaignId,user.organizationId,'platform:campaign',String(row.status),String(row.data)],expectedChanges:1},...await assertBusinessIntentCurrent(user,snapshot.explicitIntentV1)];
}
