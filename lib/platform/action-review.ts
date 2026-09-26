import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, WriteConflictError, type Database } from '../server/db';
import { field, HttpError } from '../server/http';
import { operatorMembershipFence } from '../team/service';

type Row = { id: string; data: string; status: string | null; created_at: string };
type Statement = Parameters<Database['batch']>[0][number];
type Receipt = { decision: 'accept' | 'reject'; reviewToken: string; reviewedBy: string; reviewedAt: string; inputHash: string; commitmentId?: string; reason?: string };
export type ActionReview = {
  id: string; status: string; title: string; description: string; contactId?: string; sourceSessionId?: string;
  reviewToken: string; evidence: { kind: 'caller_quote' | 'manual' | 'voice_tool_proposal'; current: boolean; quote?: string; turnIndex?: number; explanation: string };
  commitmentId?: string;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receiptOf = (data: Record<string, unknown>) => data.reviewReceipt as Receipt | undefined;
const tokenFor = (row: Row) => hash([row.id, row.data, row.status, row.created_at]);

async function rowFor(user: AuthUser, kind: string, id: string, store: Database): Promise<Row> {
  const [row] = await store.all<Row>('SELECT id,data,status,created_at FROM entities WHERE id=? AND organization_id=? AND kind=?', [id, user.organizationId, kind]);
  if (!row) throw new HttpError(404, 'Review record was not found in this workspace.');
  return row;
}
function fence(user: AuthUser, kind: string, row: Row): Statement {
  return { sql: `UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND created_at=? AND ${row.status === null ? 'status IS NULL' : 'status=?'}`,
    params: [row.id, user.organizationId, kind, row.data, row.created_at, ...(row.status === null ? [] : [row.status])], expectedChanges: 1 };
}
async function evidenceFor(user: AuthUser, data: Record<string, unknown>, store: Database, actionId: string): Promise<{ evidence: ActionReview['evidence']; fences: Statement[] }> {
  const fences: Statement[] = [];
  if (data.contactId) {
    if (typeof data.contactId !== 'string') throw new HttpError(409, 'The proposed customer link is invalid.');
    fences.push(fence(user, 'contact', await rowFor(user, 'contact', data.contactId, store)));
  }
  if (data.source === 'voice_tool_proposal') {
    if (typeof data.sourceConnectionId !== 'string' || typeof data.sourceToolInvocationId !== 'string' || typeof data.sourceToolRequestId !== 'string' ||
      !['voice_preview', 'voice_connection'].includes(String(data.sourceConnectionKind)) || !['follow_up', 'human_handoff'].includes(String(data.requestKind)) ||
      data.identityVerified !== false || data.execution !== 'manual') throw new HttpError(409, 'The voice proposal has incomplete server provenance.');
    const connectionKind = `platform:${data.sourceConnectionKind}`;
    const source = await rowFor(user, connectionKind, data.sourceConnectionId, store);
    const invocation = await rowFor(user, 'platform:voice_tool_invocation', data.sourceToolInvocationId, store);
    const call = JSON.parse(source.data).data, receipt = JSON.parse(invocation.data).data;
    const expectedMode = data.sourceConnectionKind === 'voice_preview' ? 'internal_draft_test' : 'internal_operator_browser';
    if (receipt.connectionId !== source.id || receipt.requestId !== data.sourceToolRequestId || receipt.name !== 'request_follow_up' ||
      receipt.requestedBy !== call.requestedBy || receipt.requestedBy !== data.proposedBy || receipt.result?.actionId !== actionId ||
      receipt.result?.status !== 'awaiting_review' || invocation.status !== 'awaiting_review' || receipt.contextDigest !== call.contextDigest ||
      data.contextDigest !== call.contextDigest || (data.contactId || '') !== (call.contactId || '') || data.mode !== expectedMode ||
      receipt.requestDigest !== hash(['request_follow_up', { kind: data.requestKind, summary: data.description }]))
      throw new HttpError(409, 'The voice proposal no longer matches its server tool receipt and issued call.');
    fences.push(fence(user, connectionKind, source), fence(user, 'platform:voice_tool_invocation', invocation));
    return { evidence: { kind: 'voice_tool_proposal', current: true, explanation: `${expectedMode === 'internal_draft_test' ? 'Internal draft test' : 'Operator-authenticated browser call'}: a model-generated proposal matches its server receipt. This is not verified caller speech, identity, or authorization. Review before accepting ownership; no booking, notification, or live transfer has occurred.` }, fences };
  }
  const learning = ['sourceDigest', 'sourceRef', 'sourceQuote', 'sourceAnalysisId', 'sourceCandidateId'].some(key => data[key] !== undefined);
  if (!learning && !data.sourceSessionId) return { evidence: { kind: 'manual', current: true, explanation: 'Staff-authored proposal. No linked caller quote is available; review the description before taking ownership.' }, fences };
  if (typeof data.sourceSessionId !== 'string' || !data.sourceSessionId) throw new HttpError(409, 'The learning proposal has no source conversation.');
  const source = await rowFor(user, 'session', data.sourceSessionId, store);
  const session = JSON.parse(source.data) as { contactId?: string; transcript?: { role?: string; text?: string }[] };
  if ((session.contactId || '') !== (data.contactId || '')) throw new HttpError(409, 'The source conversation and proposed customer no longer match.');
  fences.push(fence(user, 'session', source));
  if (!learning) return { evidence: { kind: 'manual', current: true, explanation: 'Staff-authored proposal with a linked conversation. No exact caller quote was recorded.' }, fences };
  const ref = data.sourceRef as Record<string, unknown> | undefined;
  if (typeof data.sourceDigest !== 'string' || data.sourceDigest !== hash(source.data) || typeof data.sourceQuote !== 'string' || data.sourceQuote.length < 3 || data.sourceQuote.length > 400 || !ref || typeof ref !== 'object' || Array.isArray(ref) ||
    !Number.isSafeInteger(ref.turnIndex) || !Number.isSafeInteger(ref.start) || !Number.isSafeInteger(ref.end) || Number(ref.turnIndex) < 0 || Number(ref.start) < 0 || Number(ref.end) <= Number(ref.start))
    throw new HttpError(409, 'The source conversation changed or its evidence is incomplete. Review a new proposal.');
  const turn = session.transcript?.[Number(ref.turnIndex)];
  if (!turn || turn.role !== 'user' || typeof turn.text !== 'string' || Number(ref.end) > turn.text.length || turn.text.slice(Number(ref.start), Number(ref.end)) !== data.sourceQuote)
    throw new HttpError(409, 'The quoted caller statement no longer matches the source conversation.');
  return { evidence: { kind: 'caller_quote', current: true, quote: data.sourceQuote, turnIndex: Number(ref.turnIndex), explanation: 'The exact caller quote matches the current saved conversation. It establishes the request, not a promise or completed work.' }, fences };
}

export async function inspectAction(user: AuthUser, actionId: string, database?: Database): Promise<ActionReview> {
  const memberFence = await operatorMembershipFence(user, database);
  const store = database || await db(), row = await rowFor(user, 'action', actionId, store);
  const data = JSON.parse(row.data) as Record<string, unknown>;
  let evidence: ActionReview['evidence'];
  try { evidence = (await evidenceFor(user, data, store, row.id)).evidence; }
  catch (error) {
    if (!(error instanceof HttpError)) throw error;
    evidence = { kind: data.source === 'voice_tool_proposal' ? 'voice_tool_proposal' : data.sourceQuote ? 'caller_quote' : 'manual', current: false, ...(typeof data.sourceQuote === 'string' ? { quote: data.sourceQuote } : {}), explanation: error.message };
  }
  try { await store.batch([memberFence]); }
  catch (error) {
    if (error instanceof WriteConflictError) {
      await operatorMembershipFence(user, store);
      throw new HttpError(409, 'Workspace access changed. Refresh before reviewing.');
    }
    throw error;
  }
  return { id: row.id, status: row.status || '', title: String(data.title || ''), description: String(data.description || ''),
    ...(typeof data.contactId === 'string' ? { contactId: data.contactId } : {}), ...(typeof data.sourceSessionId === 'string' ? { sourceSessionId: data.sourceSessionId } : {}),
    reviewToken: tokenFor(row), evidence, ...(receiptOf(data)?.commitmentId ? { commitmentId: receiptOf(data)!.commitmentId } : {}) };
}

/** Converts a reviewed internal proposal only; no external action or provider is invoked. */
export async function reviewAction(user: AuthUser, body: Record<string, unknown>, database?: Database): Promise<{ actionId: string; status: string; commitmentId?: string }> {
  const memberFence = await operatorMembershipFence(user, database);
  const store = database || await db();
  const actionId = field(body, 'actionId', 160), reviewToken = field(body, 'reviewToken', 64);
  if (!/^[a-f0-9]{64}$/.test(reviewToken)) throw new HttpError(400, 'Review the current proposal first.');
  const decision = body.decision;
  if (decision !== 'accept' && decision !== 'reject') throw new HttpError(400, 'Choose accept or reject.');
  // Match commitment.create field bounds and owner authority. Validate the calendar date as well.
  const title = decision === 'accept' ? field(body, 'title', 200) : '';
  const description = decision === 'accept' ? field(body, 'description', 10000, false) : '';
  const dueDate = decision === 'accept' ? field(body, 'dueDate', 10) : '';
  const reason = decision === 'reject' ? field(body, 'reason', 1000) : '';
  if (decision === 'accept' && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw new HttpError(400, 'Enter a valid due date.');
  if (body.ownerId !== undefined && body.ownerId !== user.id) throw new HttpError(403, 'Take ownership yourself before creating this commitment.');
  const inputHash = hash([decision, user.id, title, description, dueDate, reason]);
  const row = await rowFor(user, 'action', actionId, store), data = JSON.parse(row.data) as Record<string, unknown>;
  const previous = receiptOf(data);
  if (previous) {
    if (previous.decision !== decision || previous.inputHash !== inputHash || previous.reviewToken !== reviewToken) throw new HttpError(409, 'This proposal was already reviewed with different details. Refresh the work queue.');
    if (previous.commitmentId) await rowFor(user, 'platform:commitment', previous.commitmentId, store);
    try { await store.batch([memberFence]); }
    catch (error) {
      if (error instanceof WriteConflictError) {
        await operatorMembershipFence(user, store);
        throw new HttpError(409, 'Workspace access changed. Refresh before reviewing.');
      }
      throw error;
    }
    return { actionId, status: row.status!, ...(previous.commitmentId ? { commitmentId: previous.commitmentId } : {}) };
  }
  if (!['proposed', 'approved'].includes(row.status || '') || reviewToken !== tokenFor(row)) throw new HttpError(409, 'The proposal changed. Open it again before reviewing.');
  const checked = decision === 'accept' ? await evidenceFor(user, data, store, row.id) : { fences: [] };
  const now = new Date().toISOString();
  const commitmentId = decision === 'accept' ? `action-commitment:${hash([user.organizationId, actionId])}` : undefined;
  const receipt: Receipt = { decision, reviewToken, reviewedBy: user.id, reviewedAt: now, inputHash, ...(commitmentId ? { commitmentId } : {}), ...(reason ? { reason } : {}) };
  const status = decision === 'accept' ? 'converted' : 'dismissed';
  const statements: Statement[] = [memberFence, ...checked.fences,
    { sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?', params: [JSON.stringify({ ...data, reviewReceipt: receipt }), status, actionId, user.organizationId, 'action', row.data, row.status], expectedChanges: 1 },
  ];
  if (commitmentId) {
    const commitment = { title, description, ownerId: user.id, dueDate, sourceActionId: actionId,
      ...(data.contactId ? { contactId: data.contactId } : {}), ...(data.sourceSessionId ? { sourceSessionId: data.sourceSessionId } : {}),
      ...(data.sourceQuote ? { sourceQuote: data.sourceQuote, sourceRef: data.sourceRef, sourceDigest: data.sourceDigest } : {}) };
    statements.push({ sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [commitmentId, user.organizationId, 'platform:commitment', 'open', JSON.stringify({ revision: 1, updatedAt: now, data: commitment }), now] });
    statements.push({ sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, commitmentId, 'commitment.created_from_reviewed_action', now] });
  }
  statements.push({ sql: 'INSERT INTO audit_events (id,organization_id,user_id,entity_id,event,created_at) VALUES (?,?,?,?,?,?)', params: [randomUUID(), user.organizationId, user.id, actionId, `action.reviewed:${decision}`, now] });
  try { await store.batch(statements); }
  catch (error) {
    // A request-start role is not authority after an owner demotes or removes this operator.
    const currentMemberFence = await operatorMembershipFence(user, store);
    const raced = JSON.parse((await rowFor(user, 'action', actionId, store)).data) as Record<string, unknown>;
    const saved = receiptOf(raced);
    if (saved?.decision === decision && saved.inputHash === inputHash && saved.reviewToken === reviewToken) {
      await store.batch([currentMemberFence]);
      return { actionId, status, ...(saved.commitmentId ? { commitmentId: saved.commitmentId } : {}) };
    }
    if (error instanceof WriteConflictError) throw new HttpError(409, 'The proposal or its source changed during review. Refresh before trying again.');
    throw error;
  }
  return { actionId, status, ...(commitmentId ? { commitmentId } : {}) };
}
