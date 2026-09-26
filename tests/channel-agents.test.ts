import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import type { AuthUser } from '../lib/server/auth';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment, changeDeploymentStatus } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { configureConnection, updateConnection } from '../lib/integrations/vault';
import { channelOverview, channelWorkerTick, enqueueChannelIncoming, inboundMode, processChannelJob, sendChannelOperatorReply, setChannelHandoff } from '../lib/channel-agents/service';
import { installTelegramWebhook, parseTelegramIncoming, sendTelegramText } from '../lib/channel-agents/telegram';
import { POST as webhook } from '../app/api/integrations/telegram/webhook/[connectionId]/route';
import { inboxOverview, linkInboxCustomer, saveInbound, sendInboxReply } from '../lib/messaging/service';
import { createContact } from '../lib/server/store';
import type { ChannelJob } from '../lib/channel-agents/contracts';
process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.CONNECTOR_ENCRYPTION_KEY = '71'.repeat(32);
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional-resource.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'fictional-never-sent';
process.env.APP_URL = 'https://company.example.test';
const secret = 'fictional-private-webhook-secret-123456';
const generated = { text: 'Office hours are 9 to 5.', model: 'fake', runId: 'fictional-receipt', cached: false, usage: { inputTokens: 10, outputTokens: 10 } };
async function fixture(channel: 'telegram' | 'whatsapp' = 'telegram', allowUnknownInbound = false, autoLearning = false) {
  const user: AuthUser = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, at = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional', at] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, at] }, ...ownerRegistrationStatements(user),
  ]);
  const integration = channel === 'telegram' ? 'telegram' : 'whatsapp_cloud';
  const connection = await configureConnection(user, integration, channel === 'telegram' ? { token: '123456789:fictional-token-never-sent', webhookSecret: secret } : { token: 'fictional-token', phoneNumberId: '123456789012345', appSecret: 'abc'.repeat(20), verifyToken: secret });
  await updateConnection(user, integration, { status: 'connected', ...(channel === 'telegram' ? { settings: { botId: '123456789', username: 'fictional_bot' } } : {}) });
  const source = await createRecord(user, 'brain_source', { title: 'Hours', content: 'Office hours are 9 to 5.', sourceLabel: 'Public site', approvedAt: at }, 'approved');
  const privateSource = await createRecord(user, 'brain_source', { title: 'Private', content: 'SECRET_COMPANY_KNOWLEDGE', sourceLabel: 'Private notes', approvedAt: at }, 'approved');
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Support', role: 'Company support', objective: 'Answer company questions.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'approved_contact', escalation: 'Offer a human handoff if unsure.', knowledgeIds: [source.id, privateSource.id], enabledTools: [] }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Support channel', agentId: agent.id, versionId: version.id, releaseId: release.id, channel, publicKnowledgeIds: [source.id], brand: { name: 'Company', welcomeMessage: 'Ask us.' }, limits: { enabled: true }, allowUnknownInbound, autoLearning });
  const published = await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  return { user, connection, source, published };
}
async function enqueue(f: Awaited<ReturnType<typeof fixture>>, text = 'What are your hours?', event = '1', participant = '1234567') {
  const input = { org: f.user.organizationId, channel: 'telegram' as const, connectionId: f.connection.id, participant, providerEventId: event, text, providerAt: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString() };
  await enqueueChannelIncoming(input); return input;
}
async function jobs(f: Awaited<ReturnType<typeof fixture>>) {
  return (await (await db()).all('SELECT data FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at', [f.user.organizationId, 'channel:job'])).map(r => JSON.parse(String(r.data)) as ChannelJob);
}
test('Telegram validates secret, size and private human chat; replay and conflicting callback are bounded', async () => {
  const f = await fixture(), params = { params: Promise.resolve({ connectionId: f.connection.id }) };
  const update = { update_id: 5, message: { message_id: 3, date: Math.floor(Date.now() / 1000), text: 'Hours?', chat: { id: 1234567, type: 'private' }, from: { id: 1234567, is_bot: false } } };
  const post = (value: unknown, token = secret) => webhook(new Request(`https://company.example.test/api/integrations/telegram/webhook/${f.connection.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': token }, body: JSON.stringify(value) }), params);
  assert.equal((await post(update, 'wrong')).status, 401);
  assert.equal((await post({ ...update, message: { ...update.message, chat: { id: 1234567, type: 'group' } } })).status, 200);
  assert.equal((await jobs(f)).length, 0);
  assert.deepEqual(await (await post(update)).json(), { accepted: true });
  assert.deepEqual(await (await post(update)).json(), { accepted: false });
  assert.equal((await post({ ...update, message: { ...update.message, text: 'Conflicting replacement' } })).status, 409);
  assert.equal((await post({ oversized: 'x'.repeat(524289) })).status, 413);
  assert.equal(parseTelegramIncoming({ ...update, message: { ...update.message, from: { id: 999, is_bot: false } } }), undefined);
});
test('one claim, public-only grounding, AI disclosure and tenant-isolated transcript', async () => {
  const f = await fixture(), other = await fixture(); await enqueue(f);
  const job = (await jobs(f))[0]; let calls = 0, generations = 0;
  const deps = { generate: async (_user: unknown, input: { system: string; input: string }) => { generations++; assert.doesNotMatch(input.system, /SECRET_COMPANY_KNOWLEDGE/); assert.match(input.system, /Office hours/); return generated; }, dispatch: async (j: ChannelJob) => { calls++; assert.match(j.answer!, /^AI assistant:/); return { state: 'accepted' as const, providerId: '99' }; } };
  await Promise.all([processChannelJob(f.user.organizationId, job.id, deps), processChannelJob(f.user.organizationId, job.id, deps)]);
  await processChannelJob(f.user.organizationId, job.id, deps);
  assert.equal(calls, 1); assert.equal(generations, 1); assert.equal((await jobs(f))[0].state, 'accepted');
  await assert.rejects(channelOverview(other.user, job.threadId), /not found/);
});
test('handoff during Azure generation prevents provider egress', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0;
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { await setChannelHandoff(f.user, job.threadId, 'human'); return generated; }, dispatch: async () => { sends++; return { state: 'accepted', providerId: '1' }; } });
  assert.equal(sends, 0); assert.equal((await jobs(f))[0].state, 'cancelled');
});
test('deployment pause and source revocation during generation prevent egress', async () => {
  for (const change of ['pause', 'source'] as const) {
    const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0;
    await processChannelJob(f.user.organizationId, job.id, { generate: async () => {
      if (change === 'pause') await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
      else await updateRecord(f.user, f.source, { ...f.source.data, content: 'Changed hours.' }, 'approved');
      return generated;
    }, dispatch: async () => { sends++; return { state: 'accepted', providerId: '1' }; } });
    assert.equal(sends, 0); assert.equal((await jobs(f))[0].state, 'cancelled');
  }
});
test('uncertain provider outcome keeps durable lock and is never retried', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0;
  const deps = { generate: async () => generated, dispatch: async () => { sends++; return { state: 'uncertain' as const, reason: 'Timeout' }; } };
  await processChannelJob(f.user.organizationId, job.id, deps); await processChannelJob(f.user.organizationId, job.id, deps);
  await enqueue(f, 'One more question', '2'); await processChannelJob(f.user.organizationId, (await jobs(f))[1].id, deps);
  assert.equal(sends, 1); assert.equal((await jobs(f))[0].state, 'uncertain');
  await assert.rejects(sendChannelOperatorReply(f.user, { threadId: job.threadId, requestId: randomUUID(), text: 'Hello' }, async () => ({ state: 'accepted', providerId: '2' })), /uncertain/);
});
test('participant stop wins during generation and cannot be overridden by operator resume', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0;
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { await enqueue(f, '/stop', '2'); return generated; }, dispatch: async () => { sends++; return { state: 'accepted', providerId: '1' }; } });
  assert.equal(sends, 0); await assert.rejects(setChannelHandoff(f.user, job.threadId, 'ai'), /declined/);
  await enqueue(f, 'Question', '3'); assert.equal((await jobs(f))[2].state, 'cancelled');
});
test('manual Telegram reply takes over pending AI and has one durable provider attempt', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let aiSends = 0, humanSends = 0;
  const input = { threadId: job.threadId, requestId: randomUUID(), text: 'A human is here.' };
  const manual = async () => { humanSends++; return { state: 'accepted' as const, providerId: '2' }; };
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { await sendChannelOperatorReply(f.user, input, manual); return generated; }, dispatch: async () => { aiSends++; return { state: 'accepted', providerId: '1' }; } });
  await sendChannelOperatorReply(f.user, input, manual); assert.equal(aiSends, 0); assert.equal(humanSends, 1);
});
test('WhatsApp public inbound reply requires owner opt-in and creates no customer or marketing consent', async () => {
  for (const allowed of [false, true]) {
    const f = await fixture('whatsapp', allowed); let sends = 0;
    await saveInbound(f.user.organizationId, f.connection.id, '123456789012345', { id: `wamid.${randomUUID()}`, from: '919999000001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hours?' } });
    const job = (await jobs(f))[0]; assert.ok(job);
    await processChannelJob(f.user.organizationId, job.id, { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted', providerId: 'wamid.fake' }; } });
    assert.equal(sends, allowed ? 1 : 0);
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind IN (?,?)', [f.user.organizationId, 'contact', 'platform:customer_profile'])).length, 0);
  }
});
test('existing WhatsApp operator reply cancels a concurrent AI generation', async () => {
  const f = await fixture('whatsapp', true); let aiSends = 0;
  await saveInbound(f.user.organizationId, f.connection.id, '123456789012345', { id: `wamid.${randomUUID()}`, from: '919999000001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hours?' } });
  const threadId = (await inboxOverview(f.user)).threads[0].id, job = (await jobs(f))[0];
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { await sendInboxReply(f.user, { threadId, requestId: randomUUID(), text: 'Human reply' }, async () => ({ state: 'accepted', providerId: 'wamid.human' })); return generated; }, dispatch: async () => { aiSends++; return { state: 'accepted', providerId: 'wamid.ai' }; } });
  assert.equal(aiSends, 0); assert.equal((await jobs(f))[0].state, 'cancelled');
});
test('webhook installation verifies identity and never replaces an unrelated webhook implicitly', async () => {
  const f = await fixture(); const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => { const method = String(url).split('/').at(-1)!; calls.push(method); return Response.json({ ok: true, result: method === 'getMe' ? { id: 123456789, is_bot: true, username: 'fictional_bot' } : method === 'getWebhookInfo' ? { url: 'https://other.example.test/hook' } : true }); }) as typeof fetch;
  await assert.rejects(installTelegramWebhook(f.user, {}, fetcher), /already has another webhook/); assert.ok(!calls.includes('setWebhook'));
  await installTelegramWebhook(f.user, { acknowledgeReplace: true }, fetcher); assert.equal(calls.filter(c => c === 'setWebhook').length, 1);
  assert.equal((await sendTelegramText({ token: 'fake', participant: '123', text: 'Hi' }, (async () => Response.json({ ok: true, result: { message_id: 1, chat: { id: 999 } } })) as typeof fetch)).state, 'uncertain');
});
test('connection reauthorization and revoked owner block work before inference', async () => {
  for (const revoke of ['connection', 'owner'] as const) {
    const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let generatedCount = 0, sends = 0;
    if (revoke === 'connection') {
      await configureConnection(f.user, 'telegram', { token: '123456789:replacement-fictional-token', webhookSecret: secret });
      await updateConnection(f.user, 'telegram', { status: 'connected', settings: { botId: '123456789', username: 'fictional_bot' } });
    } else await (await db()).run('UPDATE entities SET status=? WHERE id=? AND organization_id=? AND kind=?', ['revoked', `team:member:${f.user.id}`, f.user.organizationId, 'team:member']);
    await processChannelJob(f.user.organizationId, job.id, { generate: async () => { generatedCount++; return generated; }, dispatch: async () => { sends++; return { state: 'accepted', providerId: '1' }; } });
    assert.equal(generatedCount, 0); assert.equal(sends, 0); assert.equal((await jobs(f))[0].state, 'cancelled');
  }
});
test('expired authorization and stale worker reservations never get a second attempt', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0;
  const database = await db();
  await database.run('UPDATE entities SET data=? WHERE id=?', [JSON.stringify({ ...job, expiresAt: '2020-01-01T00:00:00.000Z' }), job.id]);
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted', providerId: '1' }; } });
  assert.equal(sends, 0); assert.equal((await jobs(f))[0].state, 'cancelled');
  await enqueue(f, 'Question', '2'); const stale = (await jobs(f))[1];
  await database.run('UPDATE entities SET status=?,data=? WHERE id=?', ['sending', JSON.stringify({ ...stale, state: 'sending', dispatchAt: '2020-01-01T00:00:00.000Z' }), stale.id]);
  const sent: string[] = [];
  await channelWorkerTick({ generate: async () => generated, dispatch: async j => { sent.push(j.id); return { state: 'accepted', providerId: '1' }; } });
  assert.equal((await jobs(f))[1].state, 'uncertain'); assert.ok(!sent.includes(stale.id));
});
test('private conversation history never crosses participants on the same bot', async () => {
  const f = await fixture(); await enqueue(f, 'MY_PRIVATE_CHAT_SENTINEL', '1', '1234567');
  await processChannelJob(f.user.organizationId, (await jobs(f))[0].id, { generate: async () => generated, dispatch: async () => ({ state: 'accepted', providerId: '1' }) });
  await enqueue(f, 'Hours?', '2', '7654321');
  let inspected = false;
  await processChannelJob(f.user.organizationId, (await jobs(f))[1].id, { generate: async (_actor, input) => { assert.doesNotMatch(input.input, /MY_PRIVATE_CHAT_SENTINEL/); inspected = true; return generated; }, dispatch: async () => ({ state: 'accepted', providerId: '2' }) });
  assert.equal(inspected, true);
});
test('server canonical exchanges are immutable, linked for learning and never label uncertain text delivered', async () => {
  const f = await fixture(); await enqueue(f); const first = (await jobs(f))[0];
  const deps = { generate: async () => generated, dispatch: async () => ({ state: 'accepted' as const, providerId: '1' }) };
  await processChannelJob(f.user.organizationId, first.id, deps); await processChannelJob(f.user.organizationId, first.id, deps);
  const rows = await (await db()).all('SELECT * FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'session']);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, null);
  const session = JSON.parse(String(rows[0].data));
  assert.equal(session.source, 'channel_chat'); assert.equal(session.serverCaptured, true); assert.equal(session.deploymentId, f.published.id);
  assert.equal(session.contactId, undefined); assert.equal(session.transcript.length, 2); assert.equal(session.runtimeEvidence.version, 'relational-runtime-v1');
  await enqueue(f, 'Second question', '2'); await processChannelJob(f.user.organizationId, (await jobs(f))[1].id, { generate: async () => generated, dispatch: async () => ({ state: 'uncertain', reason: 'No receipt' }) });
  const uncertain = (await (await db()).all('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'session'])).map(r => JSON.parse(String(r.data))).find(s => s.responseState === 'uncertain');
  assert.equal(uncertain.transcript.length, 1); assert.match(uncertain.unconfirmedAttemptedReply, /Office hours/);
});
test('relational behavior uses explicit private chat cues and handoff detection rejects quoted or negated requests', async () => {
  assert.equal(inboundMode('Are you human?'), 'ai'); assert.equal(inboundMode('I do not want a human.'), 'ai');
  assert.equal(inboundMode('The command is "stop".'), 'ai'); assert.equal(inboundMode('Please stop.'), 'stopped');
  assert.equal(inboundMode('Can I speak to a human?'), 'human'); assert.equal(inboundMode('No thanks, do not message again.'), 'stopped');
  const f = await fixture(); await enqueue(f, 'Please call me Sam. I am in a hurry.'); let inspected = false;
  await processChannelJob(f.user.organizationId, (await jobs(f))[0].id, { generate: async (_actor, input) => { assert.match(input.system, /Sam/); assert.match(input.system, /brief/i); inspected = true; return generated; }, dispatch: async () => ({ state: 'accepted', providerId: '1' }) });
  assert.equal(inspected, true);
});
test('stop received during deployment pause remains binding after republish', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0];
  const paused = await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
  await enqueue(f, '/stop', '2');
  await changeDeploymentStatus(f.user, { deploymentId: paused.id, revision: paused.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await assert.rejects(setChannelHandoff(f.user, job.threadId, 'ai'), /declined/);
  await enqueue(f, 'Hours?', '3'); assert.equal((await jobs(f))[1].state, 'cancelled');
});
test('human request while paused survives republish and ordinary inbound until explicit operator resume', async () => {
  const f = await fixture(); await enqueue(f); const original = (await jobs(f))[0];
  const paused = await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
  const handoff = await enqueue(f, '/human', '2');
  assert.equal((await channelOverview(f.user)).threads[0].mode, 'human');
  await changeDeploymentStatus(f.user, { deploymentId: paused.id, revision: paused.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await enqueue(f, 'Are you there?', '3'); const held = (await jobs(f)).find(j => j.providerEventId === '3')!;
  let generations = 0, sends = 0;
  const deps = { generate: async () => { generations++; return generated; }, dispatch: async () => { sends++; return { state: 'accepted' as const, providerId: '1' }; } };
  await processChannelJob(f.user.organizationId, held.id, deps);
  assert.equal(held.state, 'cancelled'); assert.equal(generations, 0); assert.equal(sends, 0);
  await setChannelHandoff(f.user, original.threadId, 'ai');
  assert.equal(await enqueueChannelIncoming(handoff), false, 'Provider replay must not undo an explicit operator resume.');
  await enqueue(f, 'What are your hours now?', '4'); const resumed = (await jobs(f)).find(j => j.providerEventId === '4')!;
  await processChannelJob(f.user.organizationId, resumed.id, deps);
  assert.equal(generations, 1); assert.equal(sends, 1);
});
test('daily participant cap prevents paid generation and queue cap does not suppress stops', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0], database = await db(); let generatedCount = 0;
  const budgetId = `channel-daily:${createHash('sha256').update(JSON.stringify([f.user.organizationId, f.connection.id, job.participant, new Date().toISOString().slice(0, 10)])).digest('hex')}`;
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', [budgetId, f.user.organizationId, 'channel:daily', 'active', '30', new Date().toISOString()]);
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { generatedCount++; return generated; }, dispatch: async () => ({ state: 'accepted', providerId: '1' }) });
  assert.equal(generatedCount, 0);
  const g = await fixture();
  await database.batch(Array.from({ length: 200 }, (_, index) => ({ sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [`fictional-cap-${g.user.id}-${index}`, g.user.organizationId, 'channel:job', 'queued', '{}', new Date().toISOString()] })));
  await assert.rejects(enqueue(g), /queue is full/);
  const stop = await enqueue(g, '/stop', '2');
  assert.equal(await enqueueChannelIncoming(stop), false);
  const stopped = (await jobs(g)).find(j => j.providerEventId === '2'); assert.equal(stopped?.state, 'cancelled');
});
test('linked WhatsApp contact restrictions stay live without exposing private customer context', async () => {
  const f = await fixture('whatsapp');
  const incoming = (id: string) => saveInbound(f.user.organizationId, f.connection.id, '123456789012345', { id, from: '919999000001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hours?' } });
  await incoming('wamid.linked-first');
  const thread = (await inboxOverview(f.user)).threads[0];
  const contact = await createContact(f.user, { name: 'PRIVATE_CUSTOMER_SENTINEL', email: 'linked@example.test' });
  const profile = await createRecord(f.user, 'customer_profile', { contactId: contact.id, name: 'PRIVATE_CUSTOMER_SENTINEL', phone: '+919999000001', consent: { whatsapp: { granted: true } } }, 'active');
  await linkInboxCustomer(f.user, thread.id, contact.id); let sends = 0;
  const deps = { generate: async (_actor: unknown, input: { system: string; input: string }) => { assert.doesNotMatch(input.system + input.input, /PRIVATE_CUSTOMER_SENTINEL/); return generated; }, dispatch: async () => { sends++; return { state: 'accepted' as const, providerId: 'wamid.linked-reply' }; } };
  await processChannelJob(f.user.organizationId, (await jobs(f))[0].id, deps); assert.equal(sends, 1);
  await incoming('wamid.linked-second');
  await updateRecord(f.user, profile, { ...profile.data, consent: { whatsapp: { granted: false } } }, 'active');
  await processChannelJob(f.user.organizationId, (await jobs(f))[1].id, deps); assert.equal(sends, 1);
});
test('learning opt-in is frozen on inbound and queues only after the canonical exchange commits', async () => {
  const prior = process.env.LEARNING_WORKER_ENABLED; process.env.LEARNING_WORKER_ENABLED = '1';
  try {
    for (const autoLearning of [false, true]) {
      const f = await fixture('telegram', false, autoLearning); await enqueue(f); const job = (await jobs(f))[0];
      assert.equal(job.autoLearning, autoLearning); assert.equal(job.deploymentRevision, f.published.revision);
      assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'learning:job'])).length, 0);
      const deps = { generate: async () => generated, dispatch: async () => ({ state: 'accepted' as const, providerId: 'learning-test-receipt' }) };
      await processChannelJob(f.user.organizationId, job.id, deps); await processChannelJob(f.user.organizationId, job.id, deps);
      const queued = await (await db()).all('SELECT data FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'learning:job']);
      assert.equal(queued.length, autoLearning ? 1 : 0);
      if (autoLearning) {
        const learning = JSON.parse(String(queued[0].data)); assert.equal(learning.deploymentRevision, job.deploymentRevision);
        const canonical = await (await db()).all('SELECT data FROM entities WHERE organization_id=? AND kind=? AND id=?', [f.user.organizationId, 'session', learning.sessionId]);
        assert.equal(canonical.length, 1); assert.equal(JSON.parse(String(canonical[0].data)).responseState, 'accepted');
      }
    }
  } finally { if (prior === undefined) delete process.env.LEARNING_WORKER_ENABLED; else process.env.LEARNING_WORKER_ENABLED = prior; }
});
test('learning queue storage failure cannot change accepted delivery, discard history or resend', async () => {
  const f = await fixture('telegram', false, true); await enqueue(f); const job = (await jobs(f))[0]; let sends = 0, enqueues = 0;
  const deps = { generate: async () => generated, dispatch: async () => { sends++; return { state: 'accepted' as const, providerId: 'confirmed' }; }, enqueueLearning: async (input: { organizationId: string; sessionId: string; issuedDeployment: { id: string; revision: number; autoLearning: boolean } }) => {
    enqueues++; assert.equal(input.issuedDeployment.autoLearning, true); assert.equal(input.issuedDeployment.revision, job.deploymentRevision);
    assert.equal((await jobs(f))[0].state, 'accepted');
    assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=? AND id=?', [f.user.organizationId, 'session', input.sessionId])).length, 1);
    throw new Error('Fictional learning queue storage outage');
  } };
  await processChannelJob(f.user.organizationId, job.id, deps); await processChannelJob(f.user.organizationId, job.id, deps);
  assert.equal(sends, 1); assert.equal(enqueues, 1); assert.equal((await jobs(f))[0].state, 'accepted');
  assert.equal((await (await db()).all('SELECT id FROM entities WHERE organization_id=? AND kind=?', [f.user.organizationId, 'session'])).length, 1);
});
test('enabling learning later cannot reinterpret an earlier disabled inbound issuance', async () => {
  const f = await fixture(); await enqueue(f); const job = (await jobs(f))[0];
  await updateRecord(f.user, f.published, { ...f.published.data, autoLearning: true }, 'published');
  let enqueues = 0, inference = 0;
  await processChannelJob(f.user.organizationId, job.id, { generate: async () => { inference++; return generated; }, enqueueLearning: async input => {
    enqueues++; assert.equal(input.issuedDeployment.autoLearning, false); assert.equal(input.issuedDeployment.revision, job.deploymentRevision); return undefined;
  } });
  assert.equal(inference, 0); assert.equal(enqueues, 1); assert.equal((await jobs(f))[0].autoLearning, false);
});
