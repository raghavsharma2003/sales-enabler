import { createHash } from 'node:crypto';
import { db, WriteConflictError } from '../server/db';
import { HttpError } from '../server/http';
import { resolvePublicSession } from '../deployments/engine';
import type { DeploymentAuthority } from '../deployments/contracts';
import { runAiTask } from '../ai/task-router';
import { assertInferenceAccess } from '../usage/service';
import { firstReplyWithDisclosure, publicChatInstructions, publicInstructions } from './protocol';
import { compileRelationalRuntime } from '../voice/relational-runtime';
import { enqueueLearningForServerSession } from '../learning-jobs/engine';
import { isPublicVoiceEvidence, isPublicVoiceResponseEvidence, MAX_PUBLIC_VOICE_EVIDENCE_TURNS, type PublicVoiceEvidence, type PublicVoiceResponseEvidence } from './evidence';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type PublicAuthority = Awaited<ReturnType<typeof resolvePublicSession>>;
export type PublicTranscript = { role: 'user' | 'assistant'; text: string; eventId: string; at: string };
type Conversation = { sessionId: string; deploymentId: string; publicId: string; channel: 'public_web_voice' | 'public_web_chat'; identity: 'anonymous_unverified'; source: 'server_captured_public_channel'; entries: PublicTranscript[]; pending?: string; outcome: string; snapshot: { agentId: string; agentVersionId: string; releaseId: string; publicKnowledgeIds: string[]; config: DeploymentAuthority['config']; brand: string; issuedAt: string; deploymentRevision: number; autoLearning: boolean }; inputMode?: 'text' | 'microphone'; voiceEvidence?: PublicVoiceEvidence };
type Row = { id: string; data: string; status: string } & Record<string, unknown>;

/** Only explicit publication-selected facts and tested published task fields enter public inference. */
export function instructionsFor(authority: DeploymentAuthority): string {
  const parsed = JSON.parse(authority.context) as { companyKnowledge?: unknown };
  const facts = JSON.stringify(parsed.companyKnowledge || []);
  if (facts.length > 6500) throw new HttpError(409, 'The public knowledge selection exceeds this assistant’s context limit. Ask the company to publish fewer sources.');
  const instructions = publicInstructions({ brand: authority.deployment.data.brand.name, welcome: authority.deployment.data.brand.welcomeMessage,
    context: facts, language: authority.config.primaryLanguage, style: authority.config.responseStyle, objective: authority.config.objective,
    systemPrompt: authority.config.systemPrompt, role: authority.config.role, escalation: authority.config.escalation });
  if (instructions.length > 12000) throw new HttpError(409, 'The published prompt and selected sources exceed this assistant’s context limit. Ask the company to shorten its configuration.');
  return instructions;
}

const conversationId = (sessionId: string) => `public:conversation:${digest(sessionId)}`;
async function readConversation(authority: PublicAuthority, channel: Conversation['channel']) {
  const database = await db(), id = conversationId(authority.sessionId);
  const deployment = authority.deployment.data;
  const initial: Conversation = { sessionId: authority.sessionId, deploymentId: authority.deployment.id, publicId: deployment.publicId, channel, identity: 'anonymous_unverified', source: 'server_captured_public_channel', entries: [], outcome: 'active', snapshot: { agentId: deployment.agentId, agentVersionId: deployment.versionId, releaseId: deployment.releaseId, publicKnowledgeIds: deployment.publicKnowledgeIds, config: authority.config, brand: deployment.brand.name, issuedAt: new Date().toISOString(), deploymentRevision: authority.deployment.revision, autoLearning: deployment.autoLearning === true }, inputMode: channel === 'public_web_chat' ? 'text' : undefined };
  await database.run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [id, authority.user.organizationId, 'public:conversation', 'active', JSON.stringify(initial), new Date().toISOString()]);
  const [row] = await database.all<Row>('SELECT id, data, status FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [id, authority.user.organizationId, 'public:conversation']);
  if (!row) throw new HttpError(503, 'Conversation storage is unavailable.');
  return { row, value: JSON.parse(row.data) as Conversation };
}

async function replaceConversation(authority: PublicAuthority, row: Row, value: Conversation) {
  const changed = await (await db()).run('UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND kind = ? AND data = ?', [JSON.stringify(value), value.outcome, row.id, authority.user.organizationId, 'public:conversation', row.data]);
  if (changed !== 1) throw new HttpError(409, 'Conversation changed concurrently. No automatic retry was made.');
}

export async function appendPublicTranscript(authority: PublicAuthority, channel: Conversation['channel'], entry: Omit<PublicTranscript, 'at'>) {
  const { row, value } = await readConversation(authority, channel);
  if (value.entries.some(item => item.eventId === entry.eventId)) return;
  if (entry.text.length > 12000 || value.entries.length >= 100 || value.entries.reduce((n, item) => n + item.text.length, 0) + entry.text.length > 100000) throw new HttpError(429, 'Conversation transcript limit reached.');
  await replaceConversation(authority, row, { ...value, entries: [...value.entries, { ...entry, at: new Date().toISOString() }] });
}

function mergeVoiceTurn(existing: PublicVoiceResponseEvidence | undefined, incoming: PublicVoiceResponseEvidence): PublicVoiceResponseEvidence {
  if (!existing) return incoming;
  return {
    turn: existing.turn,
    ...(existing.requestedAtMs !== undefined || incoming.requestedAtMs !== undefined ? { requestedAtMs: existing.requestedAtMs ?? incoming.requestedAtMs } : {}),
    ...(existing.providerCreatedAtMs !== undefined || incoming.providerCreatedAtMs !== undefined ? { providerCreatedAtMs: existing.providerCreatedAtMs ?? incoming.providerCreatedAtMs } : {}),
    ...(existing.firstServerAudioAtMs !== undefined || incoming.firstServerAudioAtMs !== undefined ? { firstServerAudioAtMs: existing.firstServerAudioAtMs ?? incoming.firstServerAudioAtMs } : {}),
    ...(existing.terminalAtMs !== undefined || incoming.terminalAtMs !== undefined ? { terminalAtMs: existing.terminalAtMs ?? incoming.terminalAtMs } : {}),
    ...(existing.requestedToFirstServerAudioMs !== undefined || incoming.requestedToFirstServerAudioMs !== undefined ? { requestedToFirstServerAudioMs: existing.requestedToFirstServerAudioMs ?? incoming.requestedToFirstServerAudioMs } : {}),
    ...(incoming.status !== undefined || existing.status !== undefined ? { status: existing.status ?? incoming.status } : {}),
    cancelRequested: existing.cancelRequested || incoming.cancelRequested,
    ...(existing.cancelRequestedAtMs !== undefined || incoming.cancelRequestedAtMs !== undefined ? { cancelRequestedAtMs: existing.cancelRequestedAtMs ?? incoming.cancelRequestedAtMs } : {}),
    cancelled: existing.status !== undefined ? existing.cancelled : incoming.cancelled,
    audioBytes: Math.max(existing.audioBytes, incoming.audioBytes),
    ...(incoming.tokenUsage || existing.tokenUsage ? { tokenUsage: existing.tokenUsage || incoming.tokenUsage } : {}),
  };
}

/** Accepts only the gateway's bounded DTO and updates the claimed voice conversation with a CAS write. */
export async function persistPublicVoiceEvidence(authority: PublicAuthority, turn: PublicVoiceResponseEvidence) {
  if (!isPublicVoiceResponseEvidence(turn)) throw new HttpError(400, 'Invalid server voice evidence.');
  const { row, value } = await readConversation(authority, 'public_web_voice');
  if (value.channel !== 'public_web_voice' || value.source !== 'server_captured_public_channel' || value.pending !== 'voice' || value.outcome !== 'active') throw new HttpError(409, 'Voice evidence requires the active claimed server conversation.');
  const current: PublicVoiceEvidence = isPublicVoiceEvidence(value.voiceEvidence) ? value.voiceEvidence : { version: 1, serverCaptured: true, capture: 'best_effort', basis: 'server_transport', metric: 'requested_to_first_server_audio_ms', turns: [] };
  const prior = current.turns.find(item => item.turn === turn.turn);
  if (prior && prior.requestedAtMs !== turn.requestedAtMs) throw new HttpError(409, 'Voice evidence turn changed.');
  const merged = mergeVoiceTurn(prior, turn);
  const turns = [...current.turns.filter(item => item.turn !== turn.turn), merged]
    .sort((a, b) => Number(a.turn.slice(4)) - Number(b.turn.slice(4))).slice(0, MAX_PUBLIC_VOICE_EVIDENCE_TURNS);
  const evidence = { ...current, turns };
  if (!isPublicVoiceEvidence(evidence)) throw new HttpError(409, 'Voice evidence sequence is invalid.');
  if (JSON.stringify(evidence) === JSON.stringify(value.voiceEvidence)) return;
  await replaceConversation(authority, row, { ...value, voiceEvidence: evidence });
}

export async function finishPublicConversation(authority: PublicAuthority, channel: Conversation['channel'], outcome: string) {
  const { row, value } = await readConversation(authority, channel);
  const finished = { ...value, outcome };
  await replaceConversation(authority, row, finished);
  await publishHistoricalSession(authority.user.organizationId, finished);
}

/** Historical projection grants no access to inference. It survives publisher/source revocation. */
async function publishHistoricalSession(organizationId: string, conversation: Conversation) {
  if (!conversation.entries.length) return;
  const s = conversation.snapshot;
  const runtimeEvidence = compileRelationalRuntime({ entries: conversation.entries.map(entry => ({ id: entry.eventId, role: entry.role, text: entry.text })), settings: s.config, callId: conversation.sessionId });
  const data = { transcript: conversation.entries.map(entry => ({ role: entry.role, text: entry.text, receivedAt: entry.at })), runtimeEvidence, runtimeContextBasis: 'server_captured_public_channel_no_private_relationship', source: conversation.channel === 'public_web_voice' ? 'public_voice' : 'public_chat', provider: 'azure',
    agentId: s.agentId, agentVersionId: s.agentVersionId, releaseId: s.releaseId, deploymentId: conversation.deploymentId,
    publicId: conversation.publicId, publicSessionId: conversation.sessionId, callerIdentity: 'anonymous_unverified', inputMode: conversation.inputMode || 'microphone',
    transcriptSource: 'Server-captured public channel; anonymous visitor identity is unverified', configSnapshot: s.config, publicKnowledgeIds: s.publicKnowledgeIds,
    outcome: conversation.outcome, startedAt: s.issuedAt, durationSeconds: Math.max(0, Math.round((Date.parse(conversation.entries.at(-1)!.at) - Date.parse(s.issuedAt)) / 1000)), title: `${s.brand} · public ${conversation.channel === 'public_web_voice' ? 'voice' : 'chat'}`,
    ...(conversation.channel === 'public_web_voice' && isPublicVoiceEvidence(conversation.voiceEvidence) ? { voiceEvidence: conversation.voiceEvidence } : {}) };
  const canonicalId = `public-session:${digest(conversation.sessionId)}`;
  const inserted = await (await db()).run('INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [canonicalId, organizationId, 'session', null, JSON.stringify(data), s.issuedAt]);
  if (inserted === 1) {
    // Only this newly completed server receipt can enqueue. Existing sessions are never backfilled.
    // The hook is best effort: a learning outage must not discard retained transcripts or delay capability cleanup.
    await enqueueLearningForServerSession({ organizationId, sessionId: canonicalId, issuedDeployment: { id: conversation.deploymentId, revision: s.deploymentRevision, autoLearning: s.autoLearning === true } }).catch(() => undefined);
  }
}

export async function setPublicInputMode(authority: PublicAuthority, mode: 'text' | 'microphone') {
  const { row, value } = await readConversation(authority, 'public_web_voice');
  await replaceConversation(authority, row, { ...value, inputMode: mode });
}

export async function closePublicChatHistory(token: string, origin: string, publicId: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'Invalid session.');
  const database = await db(), sessionId = `deployment:session:${digest(token)}`;
  const [sessionRow] = await database.all('SELECT organization_id, data FROM entities WHERE id = ? AND kind = ?', [sessionId, 'deployment:session']);
  if (!sessionRow || JSON.parse(String(sessionRow.data)).origin !== origin) throw new HttpError(401, 'Session does not match this origin.');
  const org = String(sessionRow.organization_id);
  const [row] = await database.all<Row>('SELECT id, data, status FROM entities WHERE id = ? AND organization_id = ? AND kind = ?', [conversationId(sessionId), org, 'public:conversation']);
  if (!row) return;
  const value = JSON.parse(row.data) as Conversation;
  if (value.publicId !== publicId) throw new HttpError(403, 'Session does not belong to this assistant.');
  if (value.channel !== 'public_web_chat') return; // The voice gateway finalizes after its pending transcript writes.
  const finished = { ...value, outcome: value.outcome === 'active' ? (value.pending ? 'uncertain' : 'visitor_stopped') : value.outcome };
  await database.run('UPDATE entities SET data = ?, status = ? WHERE id = ? AND organization_id = ? AND data = ?', [JSON.stringify(finished), finished.outcome, row.id, org, row.data]);
  await publishHistoricalSession(org, finished);
}

/** One voice activation per capability, durable across replicas/reconnects. */
export async function claimVoiceSession(authority: PublicAuthority) {
  await assertInferenceAccess(authority.user);
  if (authority.deployment.data.channel !== 'web_voice') throw new HttpError(403, 'This assistant is available in text chat only.');
  const database = await db();
  const { row, value } = await readConversation(authority, 'public_web_voice');
  if (value.entries.length || value.pending) throw new HttpError(409, 'Start a new conversation before switching to voice.');
  try {
    await database.batch([...authority.fences, {
      sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [`public:voice:${digest(authority.sessionId)}`, authority.user.organizationId, 'public:voice', 'claimed', JSON.stringify({ sessionId: authority.sessionId }), new Date().toISOString()],
    }, { sql: 'UPDATE entities SET data = ? WHERE id = ? AND organization_id = ? AND data = ?', params: [JSON.stringify({ ...value, channel: 'public_web_voice', pending: 'voice' }), row.id, authority.user.organizationId, row.data], expectedChanges: 1 }]);
  } catch { throw new HttpError(409, 'This voice session was already started or changed. Reconnect does not start another paid session.'); }
}

export async function publicChat(input: { token: string; nonce: string; origin: string; requestId: string; message: string; signal?: AbortSignal }, runner: typeof runAiTask = runAiTask) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.requestId) || !input.message.trim() || input.message.length > 2000) throw new HttpError(400, 'Send a message of up to 2,000 characters with a unique request ID.');
  // Non-consuming validation obtains the organization without trusting visitor identity.
  const checked = await resolvePublicSession(input.token, { origin: input.origin, purpose: 'chat' });
  const { row, value } = await readConversation(checked, 'public_web_chat');
  if (value.pending || value.outcome !== 'active') throw new HttpError(409, 'This conversation is busy or ended. An interrupted reply is not retried automatically.');
  if (value.entries.some(entry => entry.eventId === input.requestId)) throw new HttpError(409, 'This message was already submitted. No extra AI request was made.');
  await replaceConversation(checked, row, { ...value, pending: input.requestId });
  let authority: PublicAuthority;
  try {
    authority = await resolvePublicSession(input.token, { origin: input.origin, nonce: input.nonce, consume: true, purpose: 'chat' });
    const runtime = compileRelationalRuntime({ entries: [...value.entries.map(entry => ({ id: entry.eventId, role: entry.role, text: entry.text })), { id: input.requestId, role: 'user', text: input.message.trim() }], settings: authority.config, callId: authority.sessionId });
    const hasAssistantReply = value.entries.some(entry => entry.role === 'assistant');
    const coreInstructions = `${instructionsFor(authority)}\n${runtime.instructions}`;
    let system: string;
    try { system = publicChatInstructions(coreInstructions, hasAssistantReply); }
    catch { throw new HttpError(409, 'The published configuration leaves insufficient space for conversation context. Ask the company to shorten it.'); }
    await appendPublicTranscript(authority, 'public_web_chat', { role: 'user', text: input.message.trim(), eventId: input.requestId });
    const history = value.entries.slice(-12).map(({ role, text }) => ({ role, text }));
    const context = JSON.stringify({ conversation: history, visitorMessage: input.message.trim() });
    if (context.length > 12000) throw new HttpError(429, 'Conversation context is full. Start a new conversation.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(30000, Date.parse(authority.expiresAt) - Date.now())));
    let checking = false;
    const recheck = setInterval(() => { if (checking) return; checking = true; void resolvePublicSession(input.token, { origin: input.origin, purpose: 'chat' }).catch(() => controller.abort()).finally(() => { checking = false; }); }, 2000);
    const task = { task: 'answer' as const, requestId: `public:${digest(`${authority.sessionId}:${input.requestId}`)}`, system, input: context, maxOutputTokens: 700 };
    let result: Awaited<ReturnType<typeof runAiTask>>;
    try {
      // The production Azure request is cancelled at TTL/revocation/disconnect; fake runners stay offline.
      result = runner === runAiTask ? await runAiTask(authority.user, task, { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.any([controller.signal, ...(options?.signal ? [options.signal] : []), ...(input.signal ? [input.signal] : [])]) }) }) : await runner(authority.user, task);
    } finally { clearTimeout(timeout); clearInterval(recheck); }
    // Suppress delivery when the publishing authority or source approval changed during inference.
    await resolvePublicSession(input.token, { origin: input.origin, purpose: 'chat' });
    const text = hasAssistantReply ? result.text : firstReplyWithDisclosure(result.text, authority.deployment.data.brand.name);
    await appendPublicTranscript(authority, 'public_web_chat', { role: 'assistant', text, eventId: `${input.requestId}:answer` });
    const latest = await readConversation(authority, 'public_web_chat');
    await replaceConversation(authority, latest.row, { ...latest.value, pending: undefined });
    return { text, nonce: authority.nextNonce, expiresAt: authority.expiresAt };
  } catch (error) {
    await finishPublicConversation(checked, 'public_web_chat', 'uncertain').catch(() => undefined);
    if (error instanceof HttpError) throw error;
    if (error instanceof WriteConflictError) throw new HttpError(409, 'Conversation changed. No automatic retry was made.');
    throw new HttpError(502, 'The reply was interrupted. No automatic retry was made.');
  }
}
