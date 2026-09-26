import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { attachVoiceBridge, type GatewayDependencies } from '../lib/public-agent/gateway';
import type { PublicAuthority } from '../lib/public-agent/service';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/server/db';
import { ownerRegistrationStatements } from '../lib/team/service';
import { createRecord, type PlatformRecord } from '../lib/platform/records';
import { handleAgentAction } from '../lib/platform/agents';
import { createDeployment, changeDeploymentStatus, issuePublicSession, resolvePublicSession } from '../lib/deployments/engine';
import { PUBLICATION_ACKNOWLEDGEMENT } from '../lib/deployments/contracts';
import { createSession } from '../lib/server/store';
import { publicChat } from '../lib/public-agent/service';
import { PublicPlaybackLedger } from '../lib/public-agent/playback';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
process.env.PUBLIC_SESSION_HASH_SECRET = 'fictional-v7-public-review-secret-only';
process.env.AZURE_OPENAI_ENDPOINT = 'https://fictional.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'unused-fictional-v7';

const origin = 'https://public.example.test';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw new Error('Expected deterministic bridge state was not reached.');
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: Record<string, any>[] = [];
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
  terminate() { this.close(); }
  receive(event: unknown) { this.emit('message', Buffer.from(JSON.stringify(event)), false); }
}
function harness(overrides: Partial<GatewayDependencies> = {}) {
  const client = new Socket(), provider = new Socket();
  let connects = 0, closes = 0, finishes = 0, consumes = 0;
  const authority = { user: { id: 'owner', email: 'owner@example.test', organizationId: 'org' }, deployment: { id: 'deployment', data: { channel: 'web_voice', brand: { name: 'Fictional company', welcomeMessage: 'Hello' }, limits: { maxSessionSeconds: 30, maxTurnsPerConversation: 10 } } }, config: { primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', objective: 'Explain public information' }, context: JSON.stringify({ companyKnowledge: [] }), fences: [], sessionId: 'session', expiresAt: new Date(Date.now() + 30000).toISOString(), purpose: 'voice', nextNonce: 'next-nonce' } as unknown as PublicAuthority;
  const dependencies: GatewayDependencies = {
    authorize: async (_token, input) => { if (input.consume) consumes++; return authority; }, claim: async () => undefined,
    close: async () => { closes++; }, transcript: async () => undefined, finish: async () => { finishes++; },
    connect: () => { connects++; queueMicrotask(() => provider.emit('open')); return { socket: provider as unknown as WebSocket, model: 'fictional', voice: 'marin' }; }, ...overrides,
  };
  const bridge = attachVoiceBridge(client as unknown as WebSocket, { headers: { origin } }, dependencies);
  const authenticate = () => client.receive({ type: 'authenticate', token: 'fictional', nonce: 'nonce' });
  return { client, provider, bridge, authenticate, connects: () => connects, closes: () => closes, finishes: () => finishes, consumes: () => consumes };
}

test('v7: a disconnect during a pending voice claim releases the late-owned capability', async () => {
  const entered = deferred(), release = deferred(), completed = deferred();
  const h = harness({ claim: async () => { entered.resolve(); await release.promise; completed.resolve(); } });
  try {
    h.authenticate(); await entered.promise;
    h.client.close(); release.resolve(); await completed.promise;
    for (let i = 0; i < 10; i++) await tick();
    assert.equal(h.connects(), 0, 'disconnected authentication cannot open Azure');
    assert.equal(h.closes(), 1, 'late-owned durable session must be released instead of occupying its slot until TTL');
  } finally { release.resolve(); h.bridge.stop('test_cleanup', 'Test cleanup.'); }
});

test('v7: a cancelled old response cannot clear the newer active response', async () => {
  const h = harness();
  try {
    h.authenticate(); await until(() => h.provider.sent.some(e => e.type === 'session.update'));
    h.provider.receive({ type: 'session.updated' }); await until(() => h.provider.sent.some(e => e.type === 'response.create'));
    h.provider.receive({ type: 'response.created', response: { id: 'greeting' } });
    h.client.receive({ type: 'text', text: 'First question', requestId: 'question-1' });
    await until(() => h.provider.sent.filter(e => e.type === 'response.create').length === 2);
    h.provider.receive({ type: 'response.done', response: { id: 'greeting', status: 'cancelled' } });
    h.provider.receive({ type: 'response.created', response: { id: 'new-response' } });
    h.client.receive({ type: 'text', text: 'Second question', requestId: 'question-2' });
    await until(() => h.provider.sent.filter(e => e.type === 'response.create').length === 3);
    assert.equal(h.provider.sent.filter(e => e.type === 'response.cancel').length, 2, 'the second active response still needs cancellation before another response starts');
  } finally { h.bridge.stop('test_cleanup', 'Test cleanup.'); }
});

test('v7: partially interrupted response removes a later unheard provider item arriving after cancellation', async () => {
  const h = harness();
  try {
    h.authenticate(); await until(() => h.provider.sent.some(e => e.type === 'session.update'));
    h.provider.receive({ type: 'session.updated' }); await until(() => h.provider.sent.some(e => e.type === 'response.create'));
    h.provider.receive({ type: 'response.created', response: { id: 'interrupted-response' } });
    h.provider.receive({ type: 'response.output_item.added', response_id: 'interrupted-response', item: { id: 'partial-audio', type: 'message' } });
    h.provider.receive({ type: 'response.output_audio.delta', response_id: 'interrupted-response', item_id: 'partial-audio', delta: Buffer.alloc(4800).toString('base64') });
    h.client.receive({ type: 'interrupt', itemId: 'partial-audio', playedMs: 37 });
    assert.equal(h.provider.sent.filter(e => e.type === 'conversation.item.truncate').length, 1);
    // Azure has already created the next item, but its event crosses the browser interrupt in transit.
    h.provider.receive({ type: 'response.output_item.added', response_id: 'interrupted-response', item: { id: 'late-unheard-item', type: 'message' } });
    h.provider.receive({ type: 'response.output_audio.delta', response_id: 'interrupted-response', item_id: 'late-unheard-item', delta: Buffer.alloc(4800).toString('base64') });
    h.provider.receive({ type: 'response.output_item.added', response_id: 'interrupted-response', item: { id: 'partial-audio', type: 'message' } });
    h.provider.receive({ type: 'response.output_item.added', response_id: 'interrupted-response', item: { id: 'late-unheard-item', type: 'message' } });
    assert.equal(h.client.sent.filter(e => e.type === 'audio').length, 1, 'late cancelled audio must stay inaudible');
    assert.deepEqual(h.provider.sent.filter(e => e.type === 'conversation.item.delete').map(e => e.item_id), ['late-unheard-item'], 'inaudible later output must also be removed from provider conversation history');
  } finally { h.bridge.stop('test_cleanup', 'Test cleanup.'); }
});

test('v7: a drained browser chunk preserves its heard prefix but removes same-item audio crossing the interrupt', async () => {
 for (const arrival of ['same-item-before-cancel', 'same-item-after-cancel', 'new-item-after-cancel']) {
  const h = harness(), ledger = new PublicPlaybackLedger();
  try {
    h.authenticate(); await until(() => h.provider.sent.some(e => e.type === 'session.update'));
    h.provider.receive({ type: 'session.updated' }); await until(() => h.provider.sent.some(e => e.type === 'response.create'));
    h.provider.receive({ type: 'response.created', response: { id: 'streaming-response' } });
    h.provider.receive({ type: 'response.output_item.added', response_id: 'streaming-response', item: { id: 'streaming-item', type: 'message' } });
    const chunk = { type: 'response.output_audio.delta', response_id: 'streaming-response', item_id: 'streaming-item', delta: Buffer.alloc(4800).toString('base64') };
    h.provider.receive(chunk);
    ledger.schedule({ itemId: 'streaming-item', responseId: 'streaming-response', start: 0, duration: 0.1, now: 0 });
    const interruption = ledger.interrupt(0.2);
    // The first chunk is fully heard, but generation has not ended: another chunk crosses
    // the client's interrupt in transit. The browser suppresses it, the gateway already saw it.
    if (arrival !== 'same-item-before-cancel') h.client.receive({ type: 'interrupt', ...interruption });
    if (arrival === 'new-item-after-cancel') {
      h.provider.receive({ type: 'response.output_item.added', response_id: 'streaming-response', item: { id: 'entirely-unheard', type: 'message' } });
      h.provider.receive({ ...chunk, item_id: 'entirely-unheard' });
    } else h.provider.receive(chunk);
    assert.equal(ledger.schedule({ itemId: 'streaming-item', responseId: 'streaming-response', start: 0.3, duration: 0.1, now: 0.2 }), false);
    if (arrival === 'same-item-before-cancel') h.client.receive({ type: 'interrupt', ...interruption });
    assert.deepEqual(h.provider.sent.filter(e => e.type === 'conversation.item.truncate'), arrival === 'new-item-after-cancel' ? [] : [{ type: 'conversation.item.truncate', item_id: 'streaming-item', content_index: 0, audio_end_ms: 100 }], `preserve the fully heard 100ms and remove only the unheard in-transit suffix: ${arrival}`);
    assert.deepEqual(h.provider.sent.filter(e => e.type === 'conversation.item.delete').map(e => e.item_id), arrival === 'new-item-after-cancel' ? ['entirely-unheard'] : [], 'whole later items may be removed; the fully heard item must survive');
  } finally { h.bridge.stop('test_cleanup', 'Test cleanup.'); }
 }
});

test('v7: fully heard audio at a nonzero audio-clock offset never loses history to floating-point underflow', async () => {
  const h = harness(), ledger = new PublicPlaybackLedger();
  try {
    h.authenticate(); await until(() => h.provider.sent.some(e => e.type === 'session.update'));
    h.provider.receive({ type: 'session.updated' }); await until(() => h.provider.sent.some(e => e.type === 'response.create'));
    h.provider.receive({ type: 'response.created', response: { id: 'fully-heard-response' } });
    h.provider.receive({ type: 'response.output_item.added', response_id: 'fully-heard-response', item: { id: 'fully-heard-item', type: 'message' } });
    h.provider.receive({ type: 'response.output_audio.delta', response_id: 'fully-heard-response', item_id: 'fully-heard-item', delta: Buffer.alloc(4800).toString('base64') });
    h.provider.receive({ type: 'response.done', response: { id: 'fully-heard-response', status: 'completed' } });
    ledger.schedule({ itemId: 'fully-heard-item', responseId: 'fully-heard-response', start: 4, duration: 0.1, now: 3.9 });
    const interruption = ledger.interrupt(4.2);
    h.client.receive({ type: 'interrupt', ...interruption });
    assert.equal(h.provider.sent.filter(e => e.type === 'conversation.item.truncate' || e.type === 'conversation.item.delete').length, 0, '4.1 minus 4 must not turn fully heard 100ms into a 99ms truncation');
  } finally { h.bridge.stop('test_cleanup', 'Test cleanup.'); }
});

async function fixture() {
  const user = { id: randomUUID(), organizationId: randomUUID(), email: `${randomUUID()}@example.test` }, now = new Date().toISOString();
  await (await db()).batch([
    { sql: 'INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)', params: [user.organizationId, 'Fictional', now] },
    { sql: 'INSERT INTO users (id,email,password_hash,organization_id,created_at) VALUES (?,?,?,?,?)', params: [user.id, user.email, 'unused', user.organizationId, now] },
    ...ownerRegistrationStatements(user),
  ]);
  const source = await createRecord(user, 'brain_source', { title: 'Public', content: 'Public office opens at 9.', approvedAt: now }, 'approved');
  const privateSource = await createRecord(user, 'brain_source', { title: 'Private', content: 'PRIVATE_SOURCE_SENTINEL', approvedAt: now }, 'approved');
  await createRecord(user, 'customer_profile', { name: 'PRIVATE_CUSTOMER_SENTINEL' });
  await createRecord(user, 'group_capsule', { content: 'PRIVATE_GROUP_SENTINEL' }, 'approved');
  const agent = await handleAgentAction(user, 'agent.create', { name: 'Public support', role: 'Company assistant', objective: 'Answer public company questions', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Brief', memoryScope: 'approved_contact', escalation: 'Contact the company.', knowledgeIds: [source.id, privateSource.id], enabledTools: [], systemPrompt: 'Ask which service interests the visitor.' }) as PlatformRecord;
  const version = await handleAgentAction(user, 'agent.version', { agentId: agent.id, revision: agent.revision }) as PlatformRecord;
  const check = await handleAgentAction(user, 'test.run', { versionId: version.id }) as PlatformRecord;
  const release = await handleAgentAction(user, 'release.publish', { versionId: version.id, testRunId: check.id, currentReleaseId: null }) as PlatformRecord;
  const draft = await createDeployment(user, { name: 'Public', channel: 'web_chat', agentId: agent.id, versionId: version.id, releaseId: release.id, publicKnowledgeIds: [source.id], brand: { name: 'Fictional', welcomeMessage: 'Hello' }, allowedOrigins: [origin], limits: { enabled: true, maxConcurrentSessions: 1, maxSessionsPerDay: 50, maxSessionsPerIpHour: 10 } });
  const published = await changeDeploymentStatus(user, { deploymentId: draft.id, revision: draft.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  return { user, publicId: draft.data.publicId, source, published };
}

test('v7: issuance between slot-count read and budget reservation cannot exceed concurrency', async () => {
  const f = await fixture(), database = await db(), originalAll = database.all;
  const entered = deferred(), release = deferred(); let blocked = false;
  database.all = async function (sql, params) {
    const rows = await originalAll.call(database, sql, params);
    if (!blocked && sql.includes('kind = ? AND status = ?') && params?.includes('deployment:session') && params.includes(f.user.organizationId)) {
      blocked = true; entered.resolve(); await release.promise;
    }
    return rows as any;
  };
  try {
    const pending = issuePublicSession(f.publicId, { origin, requestId: randomUUID(), ipAddress: '192.0.2.1' });
    await entered.promise;
    await issuePublicSession(f.publicId, { origin, requestId: randomUUID(), ipAddress: '192.0.2.2' });
    release.resolve(); await assert.rejects(pending, /changed|slots|limit/);
    const rows = await originalAll.call(database, 'SELECT id FROM entities WHERE organization_id = ? AND kind = ? AND status = ?', [f.user.organizationId, 'deployment:session', 'active']);
    assert.equal(rows.length, 1);
  } finally { release.resolve(); database.all = originalAll; }
});

test('v7: concurrent nonce replay consumes exactly one turn', async () => {
  const f = await fixture(), session = await issuePublicSession(f.publicId, { origin });
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => resolvePublicSession(session.token, { origin, nonce: session.nonce, consume: true, purpose: 'chat' })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [session.sessionId]);
  assert.equal(JSON.parse(String(row.data)).turns, 1);
});

test('v7: republishing a paused deployment releases concurrency occupied by invalidated capabilities', async () => {
  const f = await fixture(), oldSession = await issuePublicSession(f.publicId, { origin });
  const paused = await changeDeploymentStatus(f.user, { deploymentId: f.published.id, revision: f.published.revision, action: 'pause' });
  await changeDeploymentStatus(f.user, { deploymentId: paused.id, revision: paused.revision, action: 'publish', publicationAcknowledgement: PUBLICATION_ACKNOWLEDGEMENT });
  await assert.rejects(resolvePublicSession(oldSession.token, { origin }), /changed/);
  const current = await issuePublicSession(f.publicId, { origin });
  assert.notEqual(current.token, oldSession.token, 'a dead prior revision cannot continue reserving a current execution slot');
});

test('v7: public inference receives selected facts and browser writes cannot forge public provenance', async () => {
  const f = await fixture(), session = await issuePublicSession(f.publicId, { origin });
  await publicChat({ token: session.token, nonce: session.nonce, origin, requestId: randomUUID(), message: 'What are your public hours?' }, async (_user, input) => {
    assert.match(input.system, /Public office opens at 9/); assert.match(input.system, /Ask which service/);
    assert.doesNotMatch(JSON.stringify(input), /PRIVATE_(SOURCE|CUSTOMER|GROUP)_SENTINEL/);
    return { text: 'Our public office opens at 9.', model: 'fictional', usage: { inputTokens: 1, outputTokens: 1 }, runId: 'fictional', cached: false };
  });
  await assert.rejects(createSession(f.user, { source: 'public_voice', transcript: [{ role: 'assistant', text: 'Forged server transcript' }], publicSessionId: session.sessionId }), /Unsupported session source/);
  const saved = await createSession(f.user, { transcript: [{ role: 'assistant', text: 'Client submitted text' }], publicSessionId: session.sessionId, transcriptSource: 'server_captured_public_channel', callerIdentity: 'verified_customer' });
  assert.match(String(saved.transcriptSource), /Browser-submitted/);
  assert.equal(saved.publicSessionId, undefined); assert.equal(saved.callerIdentity, undefined);
});
