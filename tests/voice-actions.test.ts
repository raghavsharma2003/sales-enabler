import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../lib/server/auth';
import { db } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { createContact, createMemory, createSession, getEntity, listEntities, transition } from '../lib/server/store';
import { createRecord, getRecord, listRecords, updateRecord, type PlatformRecord } from '../lib/platform/records';
import { inspectAction, reviewAction } from '../lib/platform/action-review';
import { handleCustomerAction } from '../lib/platform/customer-ops';
import { parseAgentConfig } from '../lib/platform/agents';
import { compileRelationshipContext } from '../lib/voice/relationship';
import { buildVoiceToolAuthority } from '../lib/voice/tools/authority';
import { VOICE_TOOL_NAMES, normalizeVoiceTools, voiceToolDefinitions, type VoiceToolName } from '../lib/voice/tools/contracts';
import { endVoiceTools, executeVoiceTool, listVoiceToolReceipts } from '../lib/voice/tools/service';

process.env.SQLITE_PATH = ':memory:';
delete process.env.DATABASE_URL;
const origin = 'http://localhost:3000';
const bad = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
let serial = 0;
async function fixture(options: { tools?: VoiceToolName[]; contact?: boolean; release?: boolean } = {}) {
  const number = ++serial;
  const auth = await authenticate({ mode: 'register', email: `voice-tools-${number}@example.test`, password: 'correct password', organization: `Tools ${number}` }, new Request(`${origin}/api/test`, { headers: { origin } }));
  const user = auth.user;
  const contact = options.contact === false ? undefined : await createContact(user, { name: 'Sample customer' });
  if (contact) await handleCustomerAction(user, 'customer.consent', { contactId: contact.id, channel: 'browser_voice', granted: true, evidence: 'Operator recorded test consent' });
  const source = await createRecord(user, 'brain_source', { title: 'Consultation hours', content: 'Consultations are available on weekdays. Bookings require confirmation by a staff member.', sourceLabel: 'Reviewed company handbook' }, 'approved');
  let memory;
  if (contact) {
    memory = await createMemory(user, { contactId: contact.id, content: 'Prefers Hinglish.', source: 'Approved sample preference' });
    await transition(user, 'memory', memory.id, 'approved');
  }
  const agent = { ...parseAgentConfig({ name: 'Assistant', role: 'Company assistant', objective: 'Answer questions about approved company services.', disclosure: 'I am an AI assistant.', primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi', 'Hinglish'], responseStyle: 'Warm and concise', escalation: 'Offer a human when needed or requested.', memoryScope: 'approved_contact', knowledgeIds: [source.id] }), enabledTools: options.tools ?? [...VOICE_TOOL_NAMES] };
  const relationship = compileRelationshipContext({ contactId: contact?.id, allowedLanguages: agent.allowedLanguages,
    memories: memory ? [{ id: memory.id, contactId: contact!.id, status: 'approved', content: 'Prefers Hinglish.', createdAt: memory.createdAt }] : [], commitments: [] });
  const context = { agent, contextDigest: `validated-fixture-context-${number}`, knowledgeSources: [{ id: source.id }], relationship };
  const toolAuthority = await buildVoiceToolAuthority(user, context, contact?.id);
  const release = options.release ? await createRecord(user, 'release', { agentId: 'agent-test', versionId: 'version-test', channel: 'browser' }, 'active') : undefined;
  const issued = await createRecord(user, release ? 'voice_connection' : 'voice_preview', { agentId: 'agent-test', ...(release ? { releaseId: release.id, versionId: 'version-test' } : {}), contactId: contact?.id, requestedBy: user.id, config: agent, contextDigest: context.contextDigest, relationship: context.relationship, toolAuthority }, 'connection_issued');
  const scope = release ? { connectionId: issued.id } : { previewId: issued.id };
  return { user, auth, contact, source, memory, issued, scope, release, agent, context };
}
const request = (scope: { connectionId?: string; previewId?: string }, requestId = 'call-1', name = 'search_company_knowledge', args: Record<string, unknown> = { query: 'consultations' }) => ({ ...scope, requestId, name, arguments: args });

test('provider tool contracts default off and expose only the three bounded schemas', () => {
  assert.deepEqual(normalizeVoiceTools(undefined), []);
  assert.deepEqual(voiceToolDefinitions([]), []);
  assert.deepEqual(normalizeVoiceTools(['untrusted', 'recall_customer_context', 'recall_customer_context']), ['recall_customer_context']);
  assert.equal(voiceToolDefinitions(VOICE_TOOL_NAMES).length, 3);
  assert.ok(voiceToolDefinitions(VOICE_TOOL_NAMES).every(tool => tool.parameters.additionalProperties === false));
});

test('knowledge searches only frozen approved source IDs and returns exact quote offsets', async () => {
  const f = await fixture();
  await createRecord(f.user, 'brain_source', { title: 'Confidential other source', content: 'Consultations give secret discounts.' }, 'approved');
  const result = await executeVoiceTool(f.user, request(f.scope));
  assert.equal(result.status, 'available');
  assert.equal(result.identityVerified, false);
  assert.equal(result.contextMode, 'internal_operator_browser');
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].sourceId, f.source.id);
  const citation = result.citations[0];
  assert.equal(f.source.data.content.slice(citation.start, citation.end), citation.quote);
  assert.deepEqual(await executeVoiceTool(f.user, request(f.scope)), result);
});

test('tenant and operator boundaries cannot be widened by model arguments or forged scope', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(executeVoiceTool(other.user, request(f.scope)), bad(404));
  await assert.rejects(executeVoiceTool({ ...f.user, id: other.user.id }, request(f.scope)), bad(403));
  await assert.rejects(executeVoiceTool(f.user, request(f.scope, 'arg-contact', 'recall_customer_context', { contactId: other.contact!.id })), bad(400));
  await assert.rejects(executeVoiceTool(f.user, request(f.scope, 'arg-url', 'request_follow_up', { kind: 'follow_up', summary: 'Call later', url: 'https://example.test' })), bad(400));
  await assert.rejects(executeVoiceTool(f.user, { ...request(f.scope), connectionId: f.issued.id }), bad(400));
  await assert.rejects(executeVoiceTool(f.user, { ...request(f.scope), toolAuthority: f.issued.data.toolAuthority }), bad(400));
});

test('request ID cannot be replayed with different arguments or another tool', async () => {
  const f = await fixture();
  await executeVoiceTool(f.user, request(f.scope));
  await assert.rejects(executeVoiceTool(f.user, request(f.scope, 'call-1', 'search_company_knowledge', { query: 'different' })), bad(409));
  await assert.rejects(executeVoiceTool(f.user, request(f.scope, 'call-1', 'recall_customer_context', {})), bad(409));
});

test('revoked sources block fresh invocation and cached disclosure', async () => {
  const f = await fixture();
  await executeVoiceTool(f.user, request(f.scope));
  await updateRecord(f.user, f.source, f.source.data, 'revoked');
  assert.equal((await executeVoiceTool(f.user, request(f.scope))).status, 'not_available');
  assert.equal((await executeVoiceTool(f.user, request(f.scope, 'follow-up', 'request_follow_up', { kind: 'follow_up', summary: 'Talk to me later.' }))).status, 'not_available');
  assert.equal((await listEntities(f.user.organizationId, 'action')).length, 0);
});

test('approved relationship recall stays with bound customer and respects memory revocation', async () => {
  const f = await fixture();
  const other = await createContact(f.user, { name: 'Other sample customer' });
  const otherMemory = await createMemory(f.user, { contactId: other.id, content: 'Prefers English.', source: 'Other approved preference' });
  await transition(f.user, 'memory', otherMemory.id, 'approved');
  const body = request(f.scope, 'recall', 'recall_customer_context', {});
  const result = await executeVoiceTool(f.user, body);
  assert.equal(result.status, 'available');
  assert.deepEqual(result.citations.map(item => item.sourceId), [f.memory!.id]);
  await transition(f.user, 'memory', f.memory!.id, 'revoked');
  assert.equal((await executeVoiceTool(f.user, body)).status, 'not_available');
});

test('fresh consent revocation blocks replay and follow-up proposals', async () => {
  const f = await fixture();
  await executeVoiceTool(f.user, request(f.scope));
  const [profile] = await listRecords(f.user.organizationId, 'customer_profile');
  await handleCustomerAction(f.user, 'customer.consent', { contactId: f.contact!.id, revision: profile.revision, channel: 'browser_voice', granted: false, evidence: 'Consent withdrawn in test' });
  assert.equal((await executeVoiceTool(f.user, request(f.scope))).status, 'not_available');
  assert.equal((await executeVoiceTool(f.user, request(f.scope, 'mutation', 'request_follow_up', { kind: 'human_handoff', summary: 'Ask the team to review.' }))).status, 'not_available');
});

test('unknown current customer cannot recall context; follow-up creates internal test proposal only', async () => {
  const f = await fixture({ contact: false });
  assert.equal((await executeVoiceTool(f.user, request(f.scope, 'recall', 'recall_customer_context', {}))).status, 'not_available');
  const result = await executeVoiceTool(f.user, request(f.scope, 'handoff', 'request_follow_up', { kind: 'human_handoff', summary: 'Please review the test question.' }));
  assert.equal(result.status, 'awaiting_review');
  const action = await getEntity(f.user.organizationId, 'action', result.actionId!);
  assert.equal(action.contactId, undefined);
  assert.equal(action.status, 'proposed');
  assert.equal(action.mode, 'internal_draft_test');
  assert.match(String(action.title), /Draft test/);
  assert.match(String(action.evidence), /Not verified caller speech/);
});

test('parallel duplicate mutations return one durable action and one receipt', async () => {
  const f = await fixture();
  const body = request(f.scope, 'duplicate', 'request_follow_up', { kind: 'follow_up', summary: 'Review consultation availability.' });
  const [first, second] = await Promise.all([executeVoiceTool(f.user, body), executeVoiceTool(f.user, body)]);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'awaiting_review');
  assert.equal((await listEntities(f.user.organizationId, 'action')).length, 1);
  assert.equal((await listRecords(f.user.organizationId, 'voice_tool_invocation')).length, 1);
  const issued = await getRecord(f.user.organizationId, 'voice_preview', f.issued.id);
  assert.equal((issued.data.toolUsage as Record<string, number>).request_follow_up, 1);
});

test('disabled, legacy, expired and ended connections cannot execute new tools', async () => {
  const disabled = await fixture({ tools: [] });
  assert.equal((await executeVoiceTool(disabled.user, request(disabled.scope))).status, 'not_available');
  const f = await fixture();
  const legacy = await createRecord(f.user, 'voice_preview', { requestedBy: f.user.id }, 'connection_issued');
  assert.equal((await executeVoiceTool(f.user, request({ previewId: legacy.id }))).status, 'not_available');
  const expired = await updateRecord(f.user, f.issued, { ...f.issued.data, toolAuthority: { ...f.issued.data.toolAuthority, expiresAt: new Date(Date.now() - 1).toISOString() } });
  assert.equal((await executeVoiceTool(f.user, request(f.scope))).status, 'not_available');
  await updateRecord(f.user, expired, f.issued.data);
  await endVoiceTools(f.user, { ...f.scope, action: 'end' });
  assert.deepEqual(await endVoiceTools(f.user, { ...f.scope, action: 'end' }), { status: 'ended' });
  assert.equal((await executeVoiceTool(f.user, request(f.scope))).status, 'not_available');
  const saved = await createSession(f.user, { source: 'browser_preview', previewId: f.issued.id, transcript: [{ role: 'user', text: 'Test complete.' }] });
  assert.equal(saved.previewId, f.issued.id);
});

test('stopped release blocks issued tools and per-type proposal limits are durable', async () => {
  const f = await fixture({ release: true });
  await executeVoiceTool(f.user, request(f.scope));
  await updateRecord(f.user, f.release!, f.release!.data, 'stopped');
  assert.equal((await executeVoiceTool(f.user, request(f.scope, 'after-stop'))).status, 'not_available');
  const limited = await fixture();
  for (let index = 0; index < 8; index++) assert.equal((await executeVoiceTool(limited.user, request(limited.scope, `follow-${index}`, 'request_follow_up', { kind: 'follow_up', summary: 'Review this test.' }))).status, 'awaiting_review');
  assert.equal((await executeVoiceTool(limited.user, request(limited.scope, 'follow-9', 'request_follow_up', { kind: 'follow_up', summary: 'Review this test.' }))).status, 'not_available');
  assert.equal((await listEntities(limited.user.organizationId, 'action')).length, 8);
});

test('atomic source fence prevents a concurrent revocation from creating a follow-up', async () => {
  const f = await fixture();
  const database = await db(), batch = database.batch;
  let revoked = false;
  database.batch = async statements => {
    if (!revoked && statements.some(item => item.params?.includes('platform:voice_tool_invocation'))) {
      revoked = true;
      await database.run('UPDATE entities SET status = ? WHERE id = ? AND organization_id = ?', ['revoked', f.source.id, f.user.organizationId]);
    }
    return batch(statements);
  };
  try {
    const result = await executeVoiceTool(f.user, request(f.scope, 'raced', 'request_follow_up', { kind: 'follow_up', summary: 'Review test.' }));
    assert.equal(result.status, 'not_available');
    assert.equal((await listEntities(f.user.organizationId, 'action')).length, 0);
  } finally { database.batch = batch; }
});

test('tools route requires same-origin authenticated operator and preserves result statuses', async () => {
  const f = await fixture();
  const { POST } = await import('../app/api/voice/tools/route');
  const invoke = (headers: Record<string, string>) => POST(new Request(`${origin}/api/voice/tools`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(request(f.scope)) }));
  assert.equal((await invoke({ origin, cookie: '' })).status, 401);
  assert.equal((await invoke({ origin: 'https://evil.example', cookie: f.auth.cookie.split(';')[0] })).status, 403);
  const response = await invoke({ origin, cookie: f.auth.cookie.split(';')[0] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'available');
});

test('server receipts are scoped summaries and a model proposal converts only through explicit review', async () => {
  const f = await fixture();
  const output = await executeVoiceTool(f.user, request(f.scope, 'review', 'request_follow_up', { kind: 'follow_up', summary: 'Review the consultation request.' }));
  const receipts = await listVoiceToolReceipts(f.user, f.scope);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].actionId, output.actionId);
  assert.ok(!JSON.stringify(receipts).includes('Review the consultation request.'));
  const current = await inspectAction(f.user, output.actionId!);
  assert.equal(current.evidence.kind, 'voice_tool_proposal');
  assert.equal(current.evidence.current, true);
  assert.match(current.evidence.explanation, /Internal draft test/);
  assert.match(current.evidence.explanation, /not verified caller speech/);
  assert.equal(current.evidence.quote, undefined);
  const accepted = await reviewAction(f.user, { actionId: current.id, reviewToken: current.reviewToken, decision: 'accept', title: 'Review sample request', description: 'Operator-owned review task.', dueDate: '2026-10-01' });
  assert.equal(accepted.status, 'converted');
  const commitment = await getRecord(f.user.organizationId, 'commitment', accepted.commitmentId!);
  assert.equal(commitment.status, 'open');
  assert.equal(commitment.data.sourceActionId, current.id);
  assert.equal(commitment.data.sourceQuote, undefined);
});

test('review refuses proposals whose text or server receipt linkage was tampered with', async () => {
  const f = await fixture();
  const output = await executeVoiceTool(f.user, request(f.scope, 'review-tamper', 'request_follow_up', { kind: 'follow_up', summary: 'Review this sample request.' }));
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id = ?', [output.actionId!]);
  const action = JSON.parse(String(row.data));
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...action, description: 'Book and charge the customer instead.' }), output.actionId!]);
  const altered = await inspectAction(f.user, output.actionId!);
  assert.equal(altered.evidence.current, false);
  await assert.rejects(reviewAction(f.user, { actionId: altered.id, reviewToken: altered.reviewToken, decision: 'accept', title: 'Review', dueDate: '2026-10-01' }), bad(409));
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [String(row.data), output.actionId!]);
  const receipt = (await listRecords(f.user.organizationId, 'voice_tool_invocation'))[0];
  await updateRecord(f.user, receipt, { ...receipt.data, result: { ...(receipt.data.result as Record<string, unknown>), actionId: 'another-action' } });
  assert.equal((await inspectAction(f.user, output.actionId!)).evidence.current, false);
});

test('review fences the durable voice receipt against changes during commitment creation', async () => {
  const f = await fixture();
  const output = await executeVoiceTool(f.user, request(f.scope, 'review-race', 'request_follow_up', { kind: 'human_handoff', summary: 'Review the question with a colleague.' }));
  const current = await inspectAction(f.user, output.actionId!);
  const receipt = (await listRecords(f.user.organizationId, 'voice_tool_invocation'))[0];
  const database = await db(), batch = database.batch;
  let changed = false;
  database.batch = async statements => {
    if (!changed && statements.some(item => item.params?.includes('platform:commitment'))) {
      changed = true;
      await database.run('UPDATE entities SET status = ? WHERE id = ?', ['invalidated', receipt.id]);
    }
    return batch(statements);
  };
  try {
    await assert.rejects(reviewAction(f.user, { actionId: current.id, reviewToken: current.reviewToken, decision: 'accept', title: 'Human review', dueDate: '2026-10-01' }), bad(409));
    assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, 0);
  } finally { database.batch = batch; }
});

async function revokeOperator(userId: string, remove = false) {
  const database = await db();
  const [row] = await database.all('SELECT data FROM entities WHERE id = ? AND kind = ?', [`team:member:${userId}`, 'team:member']);
  const previous = JSON.parse(String(row.data));
  await database.run('UPDATE entities SET status = ?, data = ? WHERE id = ?', [remove ? 'removed' : 'active', JSON.stringify({ ...previous, role: 'viewer', status: remove ? 'removed' : 'active' }), `team:member:${userId}`]);
}

test('persisted operator demotion blocks direct cached tool and review calls despite stale AuthUser', async () => {
  const f = await fixture();
  const read = request(f.scope, 'before-demotion');
  await executeVoiceTool(f.user, read);
  const output = await executeVoiceTool(f.user, request(f.scope, 'proposal', 'request_follow_up', { kind: 'follow_up', summary: 'Review sample.' }));
  const review = await inspectAction(f.user, output.actionId!);
  await revokeOperator(f.user.id);
  await assert.rejects(executeVoiceTool(f.user, read), bad(403));
  await assert.rejects(executeVoiceTool(f.user, request(f.scope, 'new-proposal', 'request_follow_up', { kind: 'follow_up', summary: 'Unauthorized sample.' })), bad(403));
  await assert.rejects(listVoiceToolReceipts(f.user, f.scope), bad(403));
  await assert.rejects(inspectAction(f.user, review.id), bad(403));
  await assert.rejects(reviewAction(f.user, { actionId: review.id, reviewToken: review.reviewToken, decision: 'reject', reason: 'No longer authorized.' }), bad(403));
  assert.equal((await getEntity(f.user.organizationId, 'action', review.id)).status, 'proposed');
});

test('in-flight membership changes fence fresh retrieval, cached retrieval and follow-up mutation', async () => {
  for (const mode of ['search', 'recall', 'cached', 'proposal'] as const) {
    const f = await fixture();
    const body = mode === 'proposal' ? request(f.scope, 'role-race', 'request_follow_up', { kind: 'follow_up', summary: 'Review sample.' })
      : mode === 'recall' ? request(f.scope, 'role-race', 'recall_customer_context', {}) : request(f.scope, 'role-race');
    if (mode === 'cached') await executeVoiceTool(f.user, body);
    const database = await db(), batch = database.batch;
    let changed = false;
    database.batch = async statements => {
      if (!changed && statements.some(item => item.params?.includes('team:member'))) {
        changed = true;
        await revokeOperator(f.user.id, mode === 'recall' || mode === 'proposal');
      }
      return batch(statements);
    };
    try {
      await assert.rejects(executeVoiceTool(f.user, body), bad(403), mode);
      assert.equal((await listEntities(f.user.organizationId, 'action')).length, 0);
      assert.equal((await listRecords(f.user.organizationId, 'voice_tool_invocation')).length, mode === 'cached' ? 1 : 0);
    } finally { database.batch = batch; }
  }
});

test('review read, conversion and already-reviewed replay fence in-flight operator removal', async () => {
  for (const mode of ['inspect', 'convert', 'replay'] as const) {
    const f = await fixture();
    const output = await executeVoiceTool(f.user, request(f.scope, 'review-removal', 'request_follow_up', { kind: 'follow_up', summary: 'Review this sample.' }));
    const review = await inspectAction(f.user, output.actionId!);
    const body = { actionId: review.id, reviewToken: review.reviewToken, decision: 'accept', title: 'Sample review', dueDate: '2026-10-01' };
    if (mode === 'replay') await reviewAction(f.user, body);
    const database = await db(), batch = database.batch;
    let changed = false;
    database.batch = async statements => {
      if (!changed && statements.some(item => item.params?.includes('team:member'))) {
        changed = true;
        await revokeOperator(f.user.id, true);
      }
      return batch(statements);
    };
    try {
      await assert.rejects(mode === 'inspect' ? inspectAction(f.user, review.id) : reviewAction(f.user, body), bad(403), mode);
      assert.equal((await listRecords(f.user.organizationId, 'commitment')).length, mode === 'replay' ? 1 : 0);
      assert.equal((await getEntity(f.user.organizationId, 'action', review.id)).status, mode === 'replay' ? 'converted' : 'proposed');
    } finally { database.batch = batch; }
  }
});

async function campaignFixture(explicit = true) {
  const f = await fixture({ release: true });
  const { createCampaignIntent, handleBusinessContextAction } = await import('../lib/business/engine');
  const source = await createRecord(f.user, 'brain_source', { title: 'Consultation offering', content: 'A consultation helps teams review their service needs.', sourceLabel: 'Reviewed offering notes', approvedAt: new Date().toISOString() }, 'approved');
  const draft = (await handleBusinessContextAction(f.user, { action: 'offering.create', name: 'Service consultation', kind: 'service', summary: 'Review team service needs.', audienceDescription: 'Customer teams', sourceRefs: [{ sourceId: source.id, quote: source.data.content }], openQuestions: [] }) as { record: PlatformRecord }).record;
  const offering = (await handleBusinessContextAction(f.user, { action: 'offering.approve', id: draft.id, revision: draft.revision }) as { record: PlatformRecord }).record;
  const intent = explicit ? await createCampaignIntent(f.user, { schemaVersion: 1, offeringId: offering.id, signalIds: [], outcome: { label: 'Understand consultation interest', evidenceRequired: ['Explicit customer response'] }, audienceRationale: 'Operator-selected customer.', reviewColumns: [] }, [f.contact!.id]) : undefined;
  const campaign = await createRecord(f.user, 'campaign', { contactIds: [f.contact!.id], ...(intent ? { explicitIntentV1: intent } : {}) }, 'launched');
  const plan = await createRecord(f.user, 'campaign_plan', { campaignId: campaign.id, contactIds: [f.contact!.id], sourceAnchors: [], ...(intent ? { explicitIntentV1: intent } : {}) }, 'applied');
  const run = await createRecord(f.user, 'campaign_run', { campaignId: campaign.id, snapshot: { planId: plan.id, agentReleaseId: f.release!.id, ...(intent ? { explicitIntentV1: intent } : {}) }, recipients: [{ contactId: f.contact!.id, status: 'queued' }] }, 'active');
  await updateRecord<Record<string, unknown>>(f.user, f.issued, { ...f.issued.data, campaignRunId: run.id });
  return { ...f, offering, businessSource: source, plan, run, intent };
}

test('campaign tools recheck offering, cited business sources and run intent before cached or new calls', async () => {
  for (const change of ['offering', 'source', 'intent'] as const) {
    const f = await campaignFixture();
    const read = request(f.scope, 'campaign-read');
    assert.equal((await executeVoiceTool(f.user, read)).status, 'available');
    if (change === 'offering') await updateRecord(f.user, f.offering, { ...f.offering.data, summary: 'Revised offering.' }, 'approved');
    if (change === 'source') await updateRecord(f.user, f.businessSource, f.businessSource.data, 'revoked');
    if (change === 'intent') await updateRecord(f.user, f.run, { ...f.run.data, snapshot: { ...f.run.data.snapshot, explicitIntentV1: { ...f.intent!, audienceRationale: 'Changed after launch.' } } });
    assert.equal((await executeVoiceTool(f.user, read)).status, 'not_available', change);
    assert.equal((await executeVoiceTool(f.user, request(f.scope, 'campaign-proposal', 'request_follow_up', { kind: 'follow_up', summary: 'Review interest.' }))).status, 'not_available', change);
    assert.equal((await listEntities(f.user.organizationId, 'action')).length, 0);
  }
});

test('campaign tool transaction fences offering revocation in flight and preserves legacy plans', async () => {
  const legacy = await campaignFixture(false);
  assert.equal((await executeVoiceTool(legacy.user, request(legacy.scope))).status, 'available');
  const f = await campaignFixture();
  const database = await db(), batch = database.batch;
  let changed = false;
  database.batch = async statements => {
    if (!changed && statements.some(item => item.params?.includes('platform:voice_tool_invocation'))) {
      changed = true;
      await database.run('UPDATE entities SET status = ? WHERE id = ?', ['revoked', f.offering.id]);
    }
    return batch(statements);
  };
  try {
    assert.equal((await executeVoiceTool(f.user, request(f.scope, 'campaign-race', 'request_follow_up', { kind: 'follow_up', summary: 'Review sample.' }))).status, 'not_available');
    assert.equal((await listEntities(f.user.organizationId, 'action')).length, 0);
  } finally { database.batch = batch; }
});
