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
import { generateCampaignPlan } from '../lib/campaign-planning/engine';
import type { CampaignSetupData, CampaignSetupFields } from '../lib/platform/campaign-workflow';
import type { runAiTask } from '../lib/ai/task-router';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { sendCampaignEmail } from '../lib/delivery/engine';
process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '11'.repeat(32);
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
  const fake = (async () => ({text:JSON.stringify({name:'Setup feedback',objective:fields.objective,subject:fields.subject,message:fields.message,callBrief:fields.callBrief,successCriteria:fields.successCriteria,journeySteps:fields.journeySteps,missingInputs:[],citations:[{field:'callBrief',sourceId:source.id,quote}]}),runId:`fake-${suffix}`,model:'fixture',usage:{inputTokens:50,outputTokens:80},cached:false})) as typeof runAiTask;
  return {user,database,contact,source,offering,fields,action,create,fake};
}

test('setup rejects coercible enum arrays before they can bypass channel readiness',async () => {
  const f = await fixture();
  await assert.rejects(f.create({...f.fields,channel:['browser'] as unknown as 'browser',subject:'',agentReleaseId:''}),bad(400));
  await assert.rejects(f.create({...f.fields,kind:['feedback'] as unknown as 'feedback'}),bad(400));
  await assert.rejects(f.create({...f.fields,reviewColumns:[{key:'answer',label:'Answer',type:['text'] as unknown as 'text'}]}),bad(400));
});

test('setup rejects outcome evidence beyond the downstream intent limit at save time',async () => {
  const f = await fixture();
  await assert.rejects(f.create({...f.fields,outcome:{label:'Outcome',evidenceRequired:['x'.repeat(401)]}}),bad(400));
  const setup = await f.create({...f.fields,outcome:{label:'Outcome',evidenceRequired:['x'.repeat(400)]}});
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  assert.equal(draft.status,'draft');
});

test('targeted receipt reconciliation still rejects a currently demoted operator without inference',async () => {
  const f = await fixture(), setup = await f.create(), request = {campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()};
  await generateCampaignPlan(f.user,request,f.fake);
  const [member] = await f.database.all('SELECT id,data FROM entities WHERE organization_id=? AND kind=?',[f.user.organizationId,'team:member']);
  await f.database.run('UPDATE entities SET data=? WHERE id=?',[JSON.stringify({...JSON.parse(String(member.data)),role:'viewer'}),String(member.id)]);
  let calls = 0;
  await assert.rejects(generateCampaignPlan(f.user,request,async () => {calls++; throw Error('must not infer');}),bad(403));
  assert.equal(calls,0);
});

test('source mutation during targeted inference leaves no plan and does not mutate setup',async () => {
  const f = await fixture(), setup = await f.create();
  const duringModel = (async (user,task) => {
    await updateRecord(f.user,f.source,f.source.data,'revoked');
    return f.fake(user,task);
  }) as typeof runAiTask;
  await assert.rejects(generateCampaignPlan(f.user,{campaignId:setup.id,campaignRevision:setup.revision,requestId:randomUUID()},duringModel),bad(409));
  assert.equal((await listRecords(f.user.organizationId,'campaign_plan')).length,0);
  assert.equal((await getRecord(f.user.organizationId,'campaign',setup.id)).revision,setup.revision);
});

async function manualEmailFixture() {
  const f = await fixture();
  const connection = await configureConnection(f.user,'gmail',{token:'offline-fixture-token',sendPermission:'https://www.googleapis.com/auth/gmail.send'});
  await updateConnection(f.user,'gmail',{status:'connected'});
  const setup = await f.create({...f.fields,channel:'email',emailConnectionId:connection.id});
  const draft = await f.action('setup.finalize',{id:setup.id,revision:setup.revision}) as PlatformRecord<Campaign>;
  const run = await f.action('launch',{id:draft.id}) as PlatformRecord<Run>;
  const input = {runId:run.id,contactId:f.contact.id,connectionId:connection.id,requestId:randomUUID()};
  return {...f,run,input};
}

test('manual reviewed email rechecks source authority at dispatch and makes no provider request on revocation',async () => {
  const f = await manualEmailFixture();
  let calls = 0;
  const receipt = await sendCampaignEmail(f.user,f.input,async () => {calls++; return {state:'accepted'};},async () => {
    await updateRecord(f.user,f.source,f.source.data,'revoked');
    return [];
  });
  assert.equal(receipt.state,'rejected');
  assert.equal(calls,0);
});

test('manual reviewed email keeps an uncertain provider outcome durable and never resends on replay',async () => {
  const f = await manualEmailFixture();
  let calls = 0;
  const provider = async () => {calls++; throw new Error('Simulated provider timeout');};
  assert.equal((await sendCampaignEmail(f.user,f.input,provider)).state,'uncertain');
  assert.equal((await sendCampaignEmail(f.user,f.input,provider)).state,'uncertain');
  assert.equal(calls,1);
});

