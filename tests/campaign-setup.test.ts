import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createContact } from '../lib/server/store';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { handleBusinessContextAction } from '../lib/business/engine';
import { handleCampaignAction, campaignPreflight, type Campaign, type Run } from '../lib/platform/campaigns';
import { verifyManualCampaignAuthority } from '../lib/platform/campaign-setup';
import { applyCampaignPlan, generateCampaignPlan } from '../lib/campaign-planning/engine';
import type { CampaignSetupData, CampaignSetupFields } from '../lib/platform/campaign-workflow';
import type { runAiTask } from '../lib/ai/task-router';
import { parseAgentConfig } from '../lib/platform/agents';
import { compileAgentContext, compileCampaignVoiceContext } from '../lib/voice/context';
process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
const quote = 'The setup service includes a guided review, subject to staff availability.';
async function fixture() {
  const suffix = randomUUID(), now = new Date().toISOString();
  const user: AuthUser = {id:`user-${suffix}`,organizationId:`org-${suffix}`,email:`${suffix}@example.test`};
  const database = await db();
  await database.run('INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)',[user.organizationId,'Fictional company',now]);
  await database.run('INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)',[user.id,user.email,'x',user.organizationId,now]);
  const contact = await createContact(user,{name:'Fictional customer',email:'fictional@example.test'});
  await createRecord(user,'customer_profile',{contactId:contact.id,consent:{email:{granted:true},browser_voice:{granted:true}}},'active');
  const source = await createRecord(user,'brain_source',{title:'Setup service',content:quote,sourceLabel:'Reviewed note',approvedAt:now,approvedBy:user.id},'approved');
  const offeringDraft = (await handleBusinessContextAction(user,{action:'offering.create',name:'Setup review',kind:'service',summary:quote,audienceDescription:'Customers reviewing setup',sourceRefs:[{sourceId:source.id,quote}],openQuestions:[]}) as {record:PlatformRecord}).record;
  const offering = (await handleBusinessContextAction(user,{action:'offering.approve',id:offeringDraft.id,revision:offeringDraft.revision}) as {record:PlatformRecord}).record;
  const fields: CampaignSetupFields = {name:'Setup feedback',kind:'feedback',goal:'Understand setup obstacles',offeringId:offering.id,outcome:{label:'Learn a specific obstacle',evidenceRequired:['A customer example']},signalIds:[],audienceRationale:'Customers reviewing the setup service',reviewColumns:[{key:'obstacle',label:'Setup obstacle',type:'text'}],contactIds:[contact.id],channel:'manual_email',subject:'Your setup experience',message:'What was difficult in your setup?',objective:'Understand setup obstacles',callBrief:'Ask for a specific example.',successCriteria:'A reviewed customer example',journeySteps:['Ask about setup']};
  const action = (name: string, body: Record<string,unknown>) => handleCampaignAction(user,`campaign.${name}`,body);
  const create = (initial: CampaignSetupFields = fields,requestId = randomUUID()) => action('setup.create',{requestId,fields:initial}) as Promise<PlatformRecord<CampaignSetupData>>;
  const fake = (async (_user,task) => ({text:JSON.stringify({name:'Setup feedback',objective:fields.objective,subject:fields.subject,message:JSON.parse(task.input).channel === 'browser' ? 'Hi {{firstName}}, I am an AI assistant asking about setup support. What would you like help with?' : fields.message,callBrief:fields.callBrief,successCriteria:fields.successCriteria,journeySteps:fields.journeySteps,missingInputs:[],citations:[{field:'callBrief',sourceId:source.id,quote}]}),runId:`fake-${suffix}`,model:'fixture',usage:{inputTokens:50,outputTokens:80},cached:false})) as typeof runAiTask;
  return {user,database,contact,source,offering,fields,action,create,fake};
}
test('setup saves partial fields durably, replays creation, fences revisions and rejects untrusted authority',async () => {
  const f = await fixture(), requestId = randomUUID();
  const setup = await f.create({name:'First idea'},requestId);
  assert.equal(setup.status,'setup'); assert.equal(setup.data.phase,'intent');
  assert.equal((await f.create({name:'First idea'},requestId)).id,setup.id);
  await assert.rejects(f.create({name:'Different idea'},requestId),bad(409));
  await assert.rejects(f.action('launch',{id:setup.id}),bad(409));
  await assert.rejects(f.action('preflight',{id:setup.id}),bad(409));
  await assert.rejects(f.action('setup.finalize',{id:setup.id,revision:setup.revision}),bad(409));
  await assert.rejects(f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{acceptedPlan:{planId:'forged'}}}),bad(400));
  const updated = await f.action('setup.update',{id:setup.id,revision:setup.revision,phase:'audience',patch:{goal:'A saved goal'}}) as PlatformRecord<CampaignSetupData>;
  assert.equal(updated.data.fields.name,'First idea'); assert.equal(updated.data.fields.goal,'A saved goal');
  await assert.rejects(f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{name:'Stale'}}),bad(409));
  assert.equal((await getRecord<CampaignSetupData>(f.user.organizationId,'campaign',setup.id)).data.fields.goal,'A saved goal');
});
test('setup rejects foreign references and viewer writes and fences removal during mutation',async () => {
  const f = await fixture(), foreign = await fixture(), setup = await f.create({});
  await assert.rejects(f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{contactIds:[foreign.contact.id]}}),bad(404));
  await assert.rejects(f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{offeringId:foreign.offering.id}}),bad(404));
  await assert.rejects(handleCampaignAction(foreign.user,'campaign.setup.update',{id:setup.id,revision:1,patch:{name:'Other tenant'}}),bad(404));
  const [member] = await f.database.all('SELECT id,data FROM entities WHERE organization_id=? AND kind=?',[f.user.organizationId,'team:member']);
  const original = String(member.data), data = {...JSON.parse(original),role:'viewer'};
  await f.database.run('UPDATE entities SET data=? WHERE id=?',[JSON.stringify(data),String(member.id)]);
  await assert.rejects(f.create({}),bad(403));
  await assert.rejects(f.action('setup.update',{id:setup.id,revision:1,patch:{name:'Viewer'}}),bad(403));
  await f.database.run('UPDATE entities SET data=? WHERE id=?',[original,String(member.id)]);
  const batch = f.database.batch.bind(f.database);
  f.database.batch = async statements => { if (statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?'))) await f.database.run('UPDATE entities SET status=? WHERE id=?',['removed',String(member.id)]); return batch(statements); };
  try { await assert.rejects(f.action('setup.update',{id:setup.id,revision:1,patch:{name:'Race'}}),bad(409)); } finally { f.database.batch = batch; }
  assert.equal((await getRecord(f.user.organizationId,'campaign',setup.id)).revision,1);
});
test('setup phase requires a supported string and invalid values leave the saved revision unchanged',async () => {
  const f = await fixture(), setup = await f.create({});
  for (const phase of [['review'],null,1,true,{},'run','results']) {
    await assert.rejects(f.action('setup.update',{id:setup.id,revision:setup.revision,phase,patch:{name:'Must not persist'}}),bad(400));
  }
  const saved = await getRecord<CampaignSetupData>(f.user.organizationId,'campaign',setup.id);
  assert.equal(saved.revision,setup.revision);
  assert.equal(saved.data.phase,'intent');
  assert.equal(saved.data.fields.name,undefined);
});
test('manual finalize keeps one campaign ID, stamps review authority and blocks stale source at launch',async () => {
  const f = await fixture(), setup = await f.create();
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  assert.equal(draft.id,setup.id); assert.equal(draft.status,'draft'); assert.equal(draft.data.setupOrigin,'manual_reviewed');
  assert.equal(draft.data.explicitIntentV1?.reviewedBy,f.user.id); assert.equal(draft.data.planId,undefined);
  assert.equal((await listRecords(f.user.organizationId,'campaign_plan')).length,0);
  assert.equal((await listRecords(f.user.organizationId,'campaign')).length,1);
  assert.equal((await campaignPreflight(f.user,draft)).ready,true);
  await assert.rejects(f.action('update',{...draft.data,id:draft.id,message:'Changed after review'}),bad(409));
  const run = await f.action('launch',{id:draft.id}) as PlatformRecord<Run>;
  assert.equal(run.data.campaignId,setup.id);
  assert.ok((await verifyManualCampaignAuthority(f.user,draft.id,run.data.snapshot)).length > 1);
  await updateRecord(f.user,f.source,f.source.data,'revoked');
  await assert.rejects(verifyManualCampaignAuthority(f.user,draft.id,run.data.snapshot),bad(409));
});
test('manual finalization rejects source revocation and transaction races without creating a draft',async () => {
  const f = await fixture(), setup = await f.create(), batch = f.database.batch.bind(f.database);
  f.database.batch = async statements => { if (statements.some(s => s.sql.startsWith('UPDATE entities SET data=?,status=?'))) await f.database.run('UPDATE entities SET status=? WHERE id=?',['revoked',f.source.id]); return batch(statements); };
  try { await assert.rejects(f.action('setup.finalize',{id:setup.id,revision:setup.revision}),bad(409)); } finally { f.database.batch = batch; }
  assert.equal((await getRecord(f.user.organizationId,'campaign',setup.id)).status,'setup');
});
test('blocked consent can be repaired by reopening the same reviewed campaign and removing the contact',async () => {
  const f = await fixture(), unconsented = await createContact(f.user,{name:'No permission recorded'});
  const setup = await f.create({...f.fields,contactIds:[f.contact.id,unconsented.id]});
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  assert.equal((await campaignPreflight(f.user,draft)).ready,false);
  const reopened = await f.action('setup.reopen',{id:draft.id,revision:draft.revision}) as PlatformRecord<CampaignSetupData>;
  assert.equal(reopened.id,setup.id); assert.equal(reopened.status,'setup'); assert.equal(reopened.data.phase,'intent');
  assert.equal(reopened.data.ownerId,setup.data.ownerId);
  await assert.rejects(f.action('launch',{id:reopened.id}),bad(409));
  const corrected = await f.action('setup.update',{id:reopened.id,revision:reopened.revision,patch:{contactIds:[f.contact.id]}}) as PlatformRecord<CampaignSetupData>;
  const ready = await f.action('setup.finalize',{id:corrected.id,revision:corrected.revision}) as PlatformRecord<Campaign>;
  assert.equal(ready.id,setup.id); assert.equal((await campaignPreflight(f.user,ready)).ready,true);
  assert.equal((await listRecords(f.user.organizationId,'campaign')).length,1);
});
test('reopen preserves AI receipt, permits stale evidence repair, and enforces tenant, revision and payload boundaries',async () => {
  const f = await fixture(), foreign = await fixture(), setup = await f.create();
  const plan = await generateCampaignPlan(f.user,{campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()},f.fake);
  const applied = await applyCampaignPlan(f.user,plan.id,{action:'apply',revision:plan.revision,campaignId:setup.id,campaignRevision:setup.revision});
  const draft = await f.action('setup.finalize',{id:setup.id,revision:applied.campaign.revision}) as PlatformRecord<Campaign>;
  await assert.rejects(handleCampaignAction(foreign.user,'campaign.setup.reopen',{id:draft.id,revision:draft.revision}),bad(404));
  await assert.rejects(f.action('setup.reopen',{id:draft.id,revision:draft.revision-1}),bad(409));
  await assert.rejects(f.action('setup.reopen',{id:draft.id,revision:draft.revision,fields:{name:'Injected'}}),bad(400));
  await updateRecord(f.user,f.source,f.source.data,'revoked');
  const reopened = await f.action('setup.reopen',{id:draft.id,revision:draft.revision}) as PlatformRecord<CampaignSetupData>;
  assert.deepEqual(reopened.data.acceptedPlan,draft.data.setupDraft?.acceptedPlan);
  await assert.rejects(f.action('setup.finalize',{id:reopened.id,revision:reopened.revision}),bad(409));
  const edited = await f.action('setup.update',{id:reopened.id,revision:reopened.revision,patch:{message:'A revised question'}}) as PlatformRecord<CampaignSetupData>;
  assert.equal(edited.data.acceptedPlan,undefined);
});
test('reopen refuses any prior run and races atomically with launch',async () => {
  for (const status of ['completed','cancelled']) {
    const f = await fixture(), setup = await f.create();
    const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
    await createRecord(f.user,'campaign_run',{campaignId:draft.id},status);
    await assert.rejects(f.action('setup.reopen',{id:draft.id,revision:draft.revision}),bad(409));
  }
  const f = await fixture(), setup = await f.create();
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  const results = await Promise.allSettled([f.action('launch',{id:draft.id}),f.action('setup.reopen',{id:draft.id,revision:draft.revision})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length,1);
  const current = await getRecord(f.user.organizationId,'campaign',draft.id), runs = await listRecords(f.user.organizationId,'campaign_run');
  assert.equal(runs.length,current.status === 'launched' ? 1 : 0);
  assert.ok(['setup','launched'].includes(current.status));
});
test('targeted AI derives saved inputs, applies into same campaign and replays without another inference',async () => {
  const f = await fixture(), setup = await f.create(), request = {campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()};
  await assert.rejects(generateCampaignPlan(f.user,{...request,goal:'Forged'},f.fake),bad(400));
  const plan = await generateCampaignPlan(f.user,request,f.fake);
  assert.equal(plan.data.goal,f.fields.goal); assert.equal(plan.data.targetCampaignId,setup.id);
  const apply = {action:'apply',revision:plan.revision,campaignId:setup.id,campaignRevision:setup.revision};
  const applied = await applyCampaignPlan(f.user,plan.id,apply);
  assert.equal(applied.campaign.id,setup.id); assert.equal(applied.campaign.status,'setup');
  assert.equal((await applyCampaignPlan(f.user,plan.id,apply)).campaign.id,setup.id);
  assert.equal((await generateCampaignPlan(f.user,request,async () => {throw Error('must not infer');})).id,plan.id);
  const advanced = await f.action('setup.update',{id:setup.id,revision:applied.campaign.revision,phase:'review'}) as PlatformRecord<CampaignSetupData>;
  assert.equal(advanced.data.acceptedPlan?.planId,plan.id);
  const draft = await f.action('setup.finalize',{id:setup.id,revision:advanced.revision}) as PlatformRecord<Campaign>;
  assert.equal(draft.data.planId,plan.id); assert.equal(draft.data.setupOrigin,'ai_reviewed');
  assert.equal((await campaignPreflight(f.user,draft)).ready,true);
  assert.equal((await listRecords(f.user.organizationId,'campaign')).length,1);
});
test('targeted proposal rejects stale setup, and material edits clear acceptance',async () => {
  const f = await fixture(), setup = await f.create(), request = {campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()};
  const plan = await generateCampaignPlan(f.user,request,f.fake);
  const changed = await f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{goal:'Changed goal'}}) as PlatformRecord<CampaignSetupData>;
  await assert.rejects(applyCampaignPlan(f.user,plan.id,{action:'apply',revision:plan.revision,campaignId:setup.id,campaignRevision:setup.revision}),bad(409));
  const fresh = await generateCampaignPlan(f.user,{...request,campaignRevision:changed.revision,requestId:randomUUID()},f.fake);
  const applied = await applyCampaignPlan(f.user,fresh.id,{action:'apply',revision:fresh.revision,campaignId:setup.id,campaignRevision:changed.revision});
  const edited = await f.action('setup.update',{id:setup.id,revision:applied.campaign.revision,patch:{message:'A manual replacement'}}) as PlatformRecord<CampaignSetupData>;
  assert.equal(edited.data.acceptedPlan,undefined);
  await assert.rejects(applyCampaignPlan(f.user,fresh.id,{action:'apply',revision:fresh.revision,campaignId:setup.id,campaignRevision:changed.revision}),bad(409));
  const draft = await f.action('setup.finalize',{id:setup.id,revision:edited.revision}) as PlatformRecord<Campaign>;
  assert.equal(draft.data.setupOrigin,'manual_reviewed'); assert.equal(draft.data.planId,undefined);
});
test('setup changed during inference cannot persist an apparently current proposal',async () => {
  const f = await fixture(), setup = await f.create();
  const race = (async (user,task) => {
    await f.action('setup.update',{id:setup.id,revision:setup.revision,patch:{goal:'A newer goal'}});
    return f.fake(user,task);
  }) as typeof runAiTask;
  await assert.rejects(generateCampaignPlan(f.user,{campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()},race),bad(409));
  assert.equal((await listRecords(f.user.organizationId,'campaign_plan')).length,0);
  assert.equal((await getRecord<CampaignSetupData>(f.user.organizationId,'campaign',setup.id)).data.fields.goal,'A newer goal');
});
test('targeted browser rejects email letters and padded missing inputs, and accepts a spoken AI opening',async () => {
  const f = await fixture(), setup = await f.create({...f.fields,channel:'browser',agentReleaseId:''});
  const request = {campaignId:setup.id,campaignRevision:setup.revision};
  for (const override of [
    {message:'Dear {{firstName}}, I am an AI assistant. What was difficult in setup? Best regards, The Campaign QA Team'},
    {message:'Hello {{firstName}}, I am an AI assistant. What would help with setup?\nSincerely, The team'},
    {message:'What would help with setup?'},
    {message:'I am an AI assistant. What was difficult? What would help?'},
    {missingInputs:['What demographics?','What compensation?','What timeframe?','What research method?']},
  ]) {
    const incompatible = (async (user,task) => {const result = await f.fake(user,task); return {...result,text:JSON.stringify({...JSON.parse(result.text),...override})};}) as typeof runAiTask;
    await assert.rejects(generateCampaignPlan(f.user,{...request,requestId:randomUUID()},incompatible),bad(502));
  }
  assert.equal((await listRecords(f.user.organizationId,'campaign_plan')).length,0);
  assert.equal((await getRecord(f.user.organizationId,'campaign',setup.id)).revision,setup.revision);
  const spoken = await generateCampaignPlan(f.user,{...request,requestId:randomUUID()},f.fake);
  assert.match(spoken.data.draft.message,/AI assistant/);
  assert.deepEqual(spoken.data.draft.missingInputs,[]);
  const applied = await applyCampaignPlan(f.user,spoken.id,{action:'apply',revision:spoken.revision,campaignId:setup.id,campaignRevision:setup.revision});
  assert.equal(applied.campaign.id,setup.id);
});
test('targeted apply also rejects an older saved browser proposal containing an email sign-off',async () => {
  const f = await fixture(), setup = await f.create({...f.fields,channel:'browser',agentReleaseId:''});
  const plan = await generateCampaignPlan(f.user,{campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()},f.fake);
  const prior = await updateRecord(f.user,plan,{...plan.data,draft:{...plan.data.draft,message:'Dear {{firstName}}, I am an AI assistant. What would help? Best regards, The team'}},'proposed');
  await assert.rejects(applyCampaignPlan(f.user,prior.id,{action:'apply',revision:prior.revision,campaignId:setup.id,campaignRevision:setup.revision}),bad(502));
  assert.equal((await getRecord(f.user.organizationId,'campaign',setup.id)).revision,setup.revision);
  assert.equal((await getRecord(f.user.organizationId,'campaign_plan',plan.id)).status,'proposed');
});
test('choosing a release after AI apply retains exact provenance, while editing message invalidates it',async () => {
  const f = await fixture(), setup = await f.create({...f.fields,channel:'browser',agentReleaseId:''});
  const plan = await generateCampaignPlan(f.user,{campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()},f.fake);
  const applied = await applyCampaignPlan(f.user,plan.id,{action:'apply',revision:plan.revision,campaignId:setup.id,campaignRevision:setup.revision});
  const accepted = (applied.campaign.data as unknown as CampaignSetupData).acceptedPlan;
  const release = await createRecord(f.user,'release',{agentId:'fixture-agent',versionId:'fixture-version',channel:'browser'},'active');
  const selected = await f.action('setup.update',{id:setup.id,revision:applied.campaign.revision,phase:'review',patch:{agentReleaseId:release.id}}) as PlatformRecord<CampaignSetupData>;
  assert.deepEqual(selected.data.acceptedPlan,accepted);
  const edited = await f.action('setup.update',{id:setup.id,revision:selected.revision,patch:{message:'A manually revised opening'}}) as PlatformRecord<CampaignSetupData>;
  assert.equal(edited.data.acceptedPlan,undefined);
  const second = await f.create({...f.fields,channel:'browser',agentReleaseId:''});
  const secondPlan = await generateCampaignPlan(f.user,{campaignId:second.id,campaignRevision:second.revision,requestId:randomUUID()},f.fake);
  const secondApplied = await applyCampaignPlan(f.user,secondPlan.id,{action:'apply',revision:secondPlan.revision,campaignId:second.id,campaignRevision:second.revision});
  const bound = await f.action('setup.update',{id:second.id,revision:secondApplied.campaign.revision,patch:{agentReleaseId:release.id}}) as PlatformRecord<CampaignSetupData>;
  const finalized = await f.action('setup.finalize',{id:second.id,revision:bound.revision}) as PlatformRecord<Campaign>;
  assert.equal(finalized.data.setupOrigin,'ai_reviewed');
  assert.equal(finalized.data.planId,secondPlan.id);
  assert.deepEqual(finalized.data.sourceAnchors,secondPlan.data.sourceAnchors);
});
test('manual browser context includes current offering and exact source quotes and rejects revoked evidence',async () => {
  const f = await fixture();
  const config = parseAgentConfig({name:'Helper',role:'Feedback assistant',objective:'Learn about customer setup obstacles.',disclosure:'I am an AI assistant.',primaryLanguage:'English',allowedLanguages:['English'],responseStyle:'Concise',memoryScope:'none',escalation:'Offer a human colleague when requested.',knowledgeIds:[]});
  const version = await createRecord(f.user,'agent_version',{agentId:'fixture-agent',config,knowledgeDigests:{}},'published');
  const release = await createRecord(f.user,'release',{agentId:'fixture-agent',versionId:version.id,channel:'browser'},'active');
  const setup = await f.create({...f.fields,channel:'browser',agentReleaseId:release.id});
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  const run = await f.action('launch',{id:draft.id}) as PlatformRecord<Run>;
  const base = await compileAgentContext(f.user,config,[],f.contact.id), ids = {campaignRunId:run.id,contactId:f.contact.id,releaseId:release.id};
  const context = await compileCampaignVoiceContext(f.user,ids,base), reference = JSON.parse(context.instructions).campaignReference;
  assert.equal(reference.productContext.offeringName,'Setup review');
  assert.deepEqual(reference.citedSources[0].excerpts,[quote]);
  await updateRecord(f.user,f.offering,f.offering.data,'revoked');
  await assert.rejects(compileCampaignVoiceContext(f.user,ids,base),bad(409));
});
