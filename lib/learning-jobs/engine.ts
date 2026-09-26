import { createHash, randomUUID } from 'node:crypto';
import { db, type Database, WriteConflictError } from '../server/db';
import type { AuthUser } from '../server/auth';
import { HttpError } from '../server/http';
import { getActiveMembership } from '../team/service';
import { resolveDeployment } from '../deployments/engine';
import { analyzeConversation, type FeedbackRunner } from '../learning/engine';
import { LEARNING_JOB_KIND, LEARNING_CLAIM_TIMEOUT_MS, LEARNING_MAX_JOBS_PER_DEPLOYMENT_DAY, LEARNING_MAX_JOBS_PER_WORKSPACE_DAY,
  type IssuedLearningDeployment, type LearningJob, type LearningJobView } from './contracts';

type Row = { id: string; organization_id: string; kind: string; data: string; status: string | null; created_at: string };
type Statement = Parameters<Database['batch']>[0][number];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
export const learningWorkerEnabled = () => process.env.LEARNING_WORKER_ENABLED === '1';
async function row(org: string, kind: string, id: string) { return (await (await db()).all<Row>('SELECT * FROM entities WHERE organization_id=? AND kind=? AND id=?', [org, kind, id]))[0]; }
const fence = (r: Row): Statement => ({ sql: `UPDATE entities SET data=data WHERE id=? AND organization_id=? AND kind=? AND data=? AND ${r.status === null ? 'status IS NULL' : 'status=?'}`,
  params: [r.id, r.organization_id, r.kind, r.data, ...(r.status === null ? [] : [r.status])], expectedChanges: 1 });
const replace = (r: Row, job: LearningJob): Statement => ({ sql: 'UPDATE entities SET data=?,status=? WHERE id=? AND organization_id=? AND kind=? AND data=? AND status=?',
  params: [JSON.stringify(job), job.status, r.id, r.organization_id, LEARNING_JOB_KIND, r.data, r.status], expectedChanges: 1 });
function view(job: LearningJob): LearningJobView {
  const { claimToken: _claim, ownerUserId: _owner, requestId: _request, sourceDigest: _digest, ...safe } = job; return safe;
}

/** Verify the private writer receipt, never just user-editable session metadata. */
async function canonicalSession(org: string, sessionId: string, issued: IssuedLearningDeployment) {
  const session = await row(org, 'session', sessionId);
  if (!session || session.status !== null) throw new HttpError(409, 'Canonical conversation is unavailable.');
  const data = JSON.parse(session.data);
  if (data.deploymentId !== issued.id || data.contactId || !Array.isArray(data.transcript) || !data.transcript.length || data.transcript.length > 100 ||
      data.transcript.some((turn: { role?: unknown; text?: unknown }) => !turn || !['user', 'assistant'].includes(String(turn.role)) || typeof turn.text !== 'string' || turn.text.length > 12000) ||
      !data.transcript.some((turn: { role: string; text: string }) => turn.role === 'user' && turn.text.trim()) || session.data.length > 300000)
    throw new HttpError(409, 'A bounded server-captured conversation is required.');
  let receipt: Row | undefined, transcript: { role: string; text: string }[] = [];
  if (['public_chat', 'public_voice'].includes(data.source) && typeof data.publicSessionId === 'string' && sessionId === `public-session:${hash(data.publicSessionId)}`) {
    receipt = await row(org, 'public:conversation', `public:conversation:${hash(data.publicSessionId)}`);
    if (receipt) {
      const saved = JSON.parse(receipt.data);
      if (receipt.status === 'active' || saved.deploymentId !== issued.id || saved.snapshot?.deploymentRevision !== issued.revision || saved.snapshot?.autoLearning !== true ||
          saved.source !== 'server_captured_public_channel' || saved.identity !== 'anonymous_unverified' || !Array.isArray(saved.entries)) receipt = undefined;
      else transcript = saved.entries;
    }
  } else if (data.source === 'channel_chat' && typeof data.channelJobId === 'string' && sessionId === `channel-session:${hash(JSON.stringify([org, data.channelJobId]))}`) {
    receipt = await row(org, 'channel:job', data.channelJobId);
    if (receipt) {
      const saved = JSON.parse(receipt.data);
      if (!['accepted', 'rejected', 'uncertain', 'cancelled'].includes(String(receipt.status)) || saved.author === 'operator' || saved.deploymentId !== issued.id ||
          saved.deploymentRevision !== issued.revision || saved.autoLearning !== true) receipt = undefined;
      else transcript = [{ role: 'user', text: saved.text }, ...(saved.state === 'accepted' && saved.answer ? [{ role: 'assistant', text: saved.answer }] : [])];
    }
  }
  if (!receipt || JSON.stringify(transcript.map(({ role, text }) => ({ role, text }))) !== JSON.stringify(data.transcript.map(({ role, text }: { role: string; text: string }) => ({ role, text }))))
    throw new HttpError(409, 'Conversation does not match its immutable server receipt.');
  return { session, receipt, digest: hash(session.data) };
}

async function ownerFor(org: string, id: string): Promise<AuthUser> {
  const [owner] = await (await db()).all('SELECT id,email FROM users WHERE id=? AND organization_id=?', [id, org]);
  if (!owner) throw new HttpError(403, 'Deployment owner is unavailable.');
  return { id, email: String(owner.email), organizationId: org };
}
async function currentAuthority(org: string, issued: IssuedLearningDeployment, ownerId?: string) {
  const deployment = await row(org, 'platform:agent_deployment', issued.id);
  if (!deployment) throw new HttpError(409, 'Deployment is unavailable.');
  const saved = JSON.parse(deployment.data);
  if (saved.data.autoLearning !== true || saved.revision !== issued.revision || (ownerId && saved.data.ownerUserId !== ownerId)) throw new HttpError(409, 'Learning authorization changed.');
  const authority = await resolveDeployment(await ownerFor(org, saved.data.ownerUserId), issued.id);
  if (authority.deployment.revision !== issued.revision || authority.deployment.data.autoLearning !== true || (ownerId && authority.user.id !== ownerId))
    throw new HttpError(409, 'Learning authorization changed.');
  return authority;
}
async function budget(org: string, key: string, limit: number): Promise<Statement> {
  const database = await db(), id = `learning-budget:${hash(`${org}:${key}:${now().slice(0, 10)}`)}`;
  await database.run('INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [id, org, 'learning:budget', 'active', '0', now()]);
  return { sql: 'UPDATE entities SET data=CAST(CAST(data AS BIGINT)+1 AS TEXT) WHERE id=? AND organization_id=? AND kind=? AND CAST(data AS BIGINT)<?', params: [id, org, 'learning:budget', limit], expectedChanges: 1 };
}

/** Called only by canonical server writers after completion, using their frozen issuance context.
 * No historical scan and no HTTP enqueue endpoint. Disabled means zero database access/writes. */
export async function enqueueLearningForServerSession(input: { organizationId: string; sessionId: string; issuedDeployment: IssuedLearningDeployment }): Promise<LearningJobView | undefined> {
  if (!learningWorkerEnabled() || input.issuedDeployment.autoLearning !== true) return undefined;
  const { organizationId: org, sessionId, issuedDeployment: issued } = input;
  try {
    const canonical = await canonicalSession(org, sessionId, issued);
    const id = `learning-job:${hash(JSON.stringify([org, sessionId, canonical.digest]))}`;
    const previous = await row(org, LEARNING_JOB_KIND, id);
    if (previous) return view(JSON.parse(previous.data));
    const authority = await currentAuthority(org, issued), time = now();
    const job: LearningJob = { id, sessionId, deploymentId: issued.id, deploymentRevision: issued.revision, sourceDigest: canonical.digest,
      ownerUserId: authority.user.id, requestId: `auto-learning:${hash(id)}`, status: 'queued', createdAt: time, updatedAt: time };
    try {
      await (await db()).batch([...authority.fences, fence(canonical.session), fence(canonical.receipt),
        await budget(org, issued.id, LEARNING_MAX_JOBS_PER_DEPLOYMENT_DAY), await budget(org, 'workspace', LEARNING_MAX_JOBS_PER_WORKSPACE_DAY),
        { sql: 'INSERT INTO entities (id,organization_id,kind,status,data,created_at) VALUES (?,?,?,?,?,?)', params: [id, org, LEARNING_JOB_KIND, 'queued', JSON.stringify(job), time] }]);
    } catch (error) {
      const raced = await row(org, LEARNING_JOB_KIND, id); if (raced) return view(JSON.parse(raced.data));
      throw error;
    }
    return view(job);
  } catch (error) {
    // Learning must never break canonical conversation retention after pause, revocation or a cap.
    if (error instanceof HttpError || error instanceof WriteConflictError) return undefined;
    throw error;
  }
}

export async function listLearningJobs(user: AuthUser, filter: { deploymentId?: string; sessionId?: string } = {}) {
  await getActiveMembership(user);
  for (const [kind, id] of [['platform:agent_deployment', filter.deploymentId], ['session', filter.sessionId]]) {
    if (id && !await row(user.organizationId, kind!, id)) throw new HttpError(404, 'Learning source not found in this workspace.');
  }
  const rows = await (await db()).all<Row>('SELECT * FROM entities WHERE organization_id=? AND kind=? ORDER BY created_at DESC,id DESC LIMIT 500', [user.organizationId, LEARNING_JOB_KIND]);
  return { enabled: learningWorkerEnabled(), jobs: rows.map(r => JSON.parse(r.data) as LearningJob).filter(job => (!filter.deploymentId || job.deploymentId === filter.deploymentId) && (!filter.sessionId || job.sessionId === filter.sessionId)).slice(0, 100).map(view) };
}

async function jobFences(org: string, selected: Row, job: LearningJob) {
  const issued = { id: job.deploymentId, revision: job.deploymentRevision, autoLearning: true };
  const canonical = await canonicalSession(org, job.sessionId, issued);
  if (canonical.digest !== job.sourceDigest) throw new HttpError(409, 'Conversation changed after learning was queued.');
  const authority = await currentAuthority(org, issued, job.ownerUserId);
  return { authority, fences: [...authority.fences, fence(canonical.session), fence(canonical.receipt), fence(selected)] };
}

/** One durable claim. Crashed/uncertain work is retained, never automatically re-attempted. */
export async function processLearningJob(org: string, id: string, dependencies: { runner?: FeedbackRunner } = {}): Promise<LearningJobView | undefined> {
  if (!learningWorkerEnabled()) return undefined;
  let selected = await row(org, LEARNING_JOB_KIND, id); if (!selected || selected.status !== 'queued') return selected ? view(JSON.parse(selected.data)) : undefined;
  let job = JSON.parse(selected.data) as LearningJob;
  try {
    const checked = await jobFences(org, selected, job);
    const claimed: LearningJob = { ...job, status: 'claimed', claimToken: randomUUID(), claimedAt: now(), updatedAt: now() };
    await (await db()).batch([...checked.fences, replace(selected, claimed)]);
    job = claimed; selected = { ...selected, data: JSON.stringify(claimed), status: claimed.status };
    const commitFences = async () => (await jobFences(org, selected!, job)).fences;
    const guardedRunner: FeedbackRunner = async (user, input) => {
      const runner = dependencies.runner || (await import('../ai/task-router')).runAiTask;
      if (!learningWorkerEnabled()) throw new HttpError(409, 'Learning worker disabled before inference.');
      const fences = await commitFences();
      const started: LearningJob = { ...job, status: 'inference', updatedAt: now() };
      await (await db()).batch([...fences, await budget(org, `inference:${job.deploymentId}`, LEARNING_MAX_JOBS_PER_DEPLOYMENT_DAY),
        await budget(org, 'inference:workspace', LEARNING_MAX_JOBS_PER_WORKSPACE_DAY), replace(selected!, started)]);
      job = started; selected = { ...selected!, data: JSON.stringify(started), status: started.status };
      return runner(user, input);
    };
    const analysis = await analyzeConversation(checked.authority.user, job.sessionId, job.requestId, guardedRunner, { feedbackOnly: true, commitFences });
    if (analysis.status !== 'ready') throw new HttpError(409, 'Analysis needs operator review before further processing.');
    const finished: LearningJob = { ...job, status: 'ready', analysisId: analysis.id, updatedAt: now() };
    await (await db()).batch([...await commitFences(), replace(selected, finished)]);
    return view(finished);
  } catch {
    const latest = await row(org, LEARNING_JOB_KIND, id); if (!latest) return undefined;
    const saved = JSON.parse(latest.data) as LearningJob;
    // Another worker's claim never belongs to this worker, even during cancellation.
    if (saved.claimToken !== job.claimToken || !['queued', 'claimed', 'inference'].includes(saved.status)) return view(saved);
    const uncertain = saved.status === 'inference';
    const stopped: LearningJob = { ...saved, status: uncertain ? 'uncertain' : 'cancelled', updatedAt: now(),
      reason: uncertain ? 'Analysis may have started. Receipt retained; no automatic paid retry.' : 'Authorization, source, or bounded budget changed before inference.' };
    try { await (await db()).batch([replace(latest, stopped)]); } catch { /* A competing worker/expiry owns the final state. */ }
    return view(JSON.parse((await row(org, LEARNING_JOB_KIND, id))!.data));
  }
}

export async function runLearningWorkerTick(input: { enabled?: boolean; limit?: number } = {}, dependencies: { runner?: FeedbackRunner } = {}) {
  const counts = { enabled: learningWorkerEnabled() && input.enabled !== false, examined: 0, ready: 0, cancelled: 0, uncertain: 0 };
  if (!counts.enabled) return counts;
  const limit = Math.max(1, Math.min(10, Math.floor(input.limit || 5))), database = await db();
  const abandoned = await database.all<Row>('SELECT * FROM entities WHERE kind=? AND status IN (?,?) ORDER BY created_at ASC LIMIT 100', [LEARNING_JOB_KIND, 'claimed', 'inference']);
  for (const selected of abandoned) {
    const job = JSON.parse(selected.data) as LearningJob;
    if (!job.claimedAt || Date.parse(job.claimedAt) > Date.now() - LEARNING_CLAIM_TIMEOUT_MS) continue;
    const ended: LearningJob = { ...job, status: job.status === 'inference' ? 'uncertain' : 'cancelled', reason: 'Worker claim expired; no automatic retry.', updatedAt: now() };
    try { await database.batch([replace(selected, ended)]); counts[ended.status as 'cancelled' | 'uncertain']++; } catch { /* raced a live worker */ }
  }
  const queued = await database.all<Row>('SELECT * FROM entities WHERE kind=? AND status=? ORDER BY created_at ASC,id ASC LIMIT ?', [LEARNING_JOB_KIND, 'queued', limit]);
  for (const selected of queued) {
    const result = await processLearningJob(selected.organization_id, selected.id, dependencies); counts.examined++;
    if (result && ['ready', 'cancelled', 'uncertain'].includes(result.status)) counts[result.status as 'ready' | 'cancelled' | 'uncertain']++;
  }
  return counts;
}
