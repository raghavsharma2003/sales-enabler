// The dial worker. One loop for every attempt kind: claim a due attempt with SELECT ... FOR UPDATE SKIP LOCKED, run
// the dial gate in that same transaction, stamp the result, commit; then (outside the transaction) fetch the memory
// brief, build the CallTicket and hand it to the runtime. An attempt moves created -> dialing exactly once, under its
// row lock, so two workers can never dial it twice. A ticket whose dispatch was never confirmed becomes 'unknown'
// and is never retried automatically (HV law 17).
import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Fact } from '../../../shared/agent-config.ts';
import type { CallTicket } from '../../../shared/runtime-protocol.ts';
import { combinationId, resolveStack, type StackComponents } from '../../../shared/stacks.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, tx } from '../../db.ts';
import { release } from '../../ledger.ts';
import { runtime as defaultRuntime, type Runtime } from '../../runtime-client.ts';
import type { Registry } from '../../tools.ts';
import { explainRefusal, type Explained } from './explain.ts';
import type { Series } from './telephony.ts';
import { DISPATCH_STALE_MS, MEMORY_BRIEF_TIMEOUT_MS } from './defaults.ts';
import { routeAttempt } from './languages.ts';
import { LIVE_ATTEMPT, runGate, type AttemptRow, type GatePass, type GateVerdict, type PredialFn } from './gate.ts';

export interface WorkerDeps {
  pool: pg.Pool;
  registry: Registry;
  runtime?: Runtime;
  now?: () => Date;
  predial?: PredialFn;
  workspaceId?: string;          // restrict to one workspace (tests, per-tenant workers)
}

const SYSTEM = { type: 'system' as const, id: 'campaigns.worker' };
const ATTEMPT_COLS = 'a.id, a.workspace_id, a.campaign_id, a.contact_id, a.to_e164, a.kind, a.agent_version_id, a.call_category, a.facts, a.api_key_id, a.scheduled_for';

/** Call another module's read tool inside the caller's transaction (by registry name, as a system actor). A missing
 *  tool, a validation error or a throw returns null; a savepoint keeps a failure from aborting the claim. */
export async function readTool<T>(registry: Registry, c: pg.PoolClient, ws: string, name: string, input: unknown): Promise<T | null> {
  const t = registry.get(name);
  if (!t || t.risk !== 'read') return null;
  await c.query('SAVEPOINT vp_read_tool');
  try {
    const out = await t.run({ q: c, workspaceId: ws, actor: SYSTEM }, t.input(input)) as T;
    await c.query('RELEASE SAVEPOINT vp_read_tool');
    return out ?? null;
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT vp_read_tool');
    return null;
  }
}

/** Which agent version a campaign attempt meets: a running experiment's sticky arm (learning's experiment.assign), else
 *  the campaign deployment's split (deterministic per contact), else the campaign's pinned version. Single, API and test
 *  attempts keep the version they were created with. */
export async function resolveVersion(registry: Registry, c: pg.PoolClient, a: AttemptRow): Promise<string | null> {
  if (!a.campaign_id || !a.contact_id || !['campaign', 'retry', 'callback'].includes(a.kind)) return a.agent_version_id;
  const k = await one<{ agent_version_id: string | null; agent_id: string | null; deployment_id: string | null; split: { version_id: string; percent: number }[] | null }>(c,
    `SELECT k.agent_version_id, coalesce(v.agent_id, d.agent_id) AS agent_id, k.deployment_id, d.split FROM campaign k
     LEFT JOIN agent_version v ON v.id = k.agent_version_id LEFT JOIN deployment d ON d.id = k.deployment_id AND d.workspace_id = k.workspace_id
     WHERE k.id = $1 AND k.workspace_id = $2`, [a.campaign_id, a.workspace_id]);
  if (!k) return a.agent_version_id;
  if (k.agent_id) {
    const arm = await readTool<{ versionId?: string }>(registry, c, a.workspace_id, 'experiment.assign', { agentId: k.agent_id, contactId: a.contact_id });
    if (arm?.versionId) return arm.versionId;
  }
  // A later deployment.split for this agent's 'campaign' binding takes effect on the next claim.
  const latest = k.agent_id ? await one<{ id: string; split: { version_id: string; percent: number }[] }>(c,
    `SELECT id, split FROM deployment WHERE agent_id = $1 AND workspace_id = $2 AND binding = 'campaign' ORDER BY created_at DESC, id DESC LIMIT 1`,
    [k.agent_id, a.workspace_id]) : null;
  if (latest && latest.id !== k.deployment_id) {
    await c.query('UPDATE campaign SET deployment_id = $2, updated_at = now() WHERE id = $1 AND workspace_id = $3', [a.campaign_id, latest.id, a.workspace_id]);
    k.split = latest.split;
  }
  if (k.split?.length) {
    const h = createHash('sha256').update(a.campaign_id + ':' + a.contact_id).digest().readUInt32BE(0) % 10_000;
    let acc = 0;
    for (const s of k.split) { acc += s.percent * 100; if (h < acc) return s.version_id; }
    return k.split[k.split.length - 1].version_id;
  }
  return k.agent_version_id ?? a.agent_version_id;
}

export type ClaimOutcome =
  | { kind: 'none' }
  | { kind: 'review_stop'; campaignId: string; workspaceId: string }
  | { kind: 'claimed'; attempt: AttemptRow; verdict: GateVerdict; conversationId?: string };

/** A refusal in plain words, with the contact's zone for the next time and the series a wrong-line refusal needs. */
async function explainFor(c: pg.PoolClient, a: AttemptRow, v: Exclude<GateVerdict, { allowed: true }>): Promise<Explained> {
  const tz = a.contact_id ? (await one<{ timezone: string }>(c, 'SELECT timezone FROM contact WHERE id = $1', [a.contact_id]))?.timezone : undefined;
  const series = /use (ten_digit|140|1600|1601|trial)\b/.exec(v.detail ?? '')?.[1] as Series | undefined;
  return explainRefusal(v.code, v.detail, { next: v.nextEligibleAt, tz: tz ?? 'Asia/Kolkata', category: v.campaign?.call_category ?? a.call_category ?? undefined, series });
}

/** Claim one due attempt and run the gate on it, in one transaction. */
export async function claimNext(d: WorkerDeps): Promise<ClaimOutcome> {
  const now = d.now?.() ?? new Date();
  return tx(d.pool, async c => {
    const a = await one<AttemptRow>(c, `SELECT ${ATTEMPT_COLS} FROM attempt a LEFT JOIN campaign k ON k.id = a.campaign_id
      WHERE a.status = 'created' AND a.scheduled_for <= $1 AND (a.campaign_id IS NULL OR k.state = 'running')
        AND ($2::uuid IS NULL OR a.workspace_id = $2::uuid)
      ORDER BY a.scheduled_for, a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`, [now, d.workspaceId ?? null]);
    if (!a) return { kind: 'none' };

    // A workspace's first campaign stops after N dials for a person's review (campaigns.md §7). Counted under a
    // per-campaign lock so concurrent workers cannot overshoot it.
    if (a.campaign_id) {
      const k = await one<{ stop: number | null }>(c, "SELECT (policy->>'reviewStopAfter')::int AS stop FROM campaign WHERE id = $1", [a.campaign_id]);
      if (k?.stop) {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['review:' + a.campaign_id]);
        const n = await one<{ n: number }>(c, 'SELECT count(*)::int AS n FROM attempt WHERE campaign_id = $1 AND dialed_at IS NOT NULL', [a.campaign_id]);
        if (n!.n >= k.stop) return { kind: 'review_stop', campaignId: a.campaign_id, workspaceId: a.workspace_id };
      }
    }

    a.agent_version_id = await resolveVersion(d.registry, c, a);
    // Then the contact's language: a version that speaks it, else the main one with the reason recorded (precheck.language).
    const language = await routeAttempt(c, a.workspace_id, a);
    if (language) a.agent_version_id = language.versionId;
    const rate = async (q: unknown, ws: string, stackId: string, minutes: number, components?: StackComponents) =>
      (await readTool<{ perMinuteInrMilli?: number }>(d.registry, c, ws, 'money.estimate', { stackId, minutes, calls: 1, ...(components ? { components } : {}) }))?.perMinuteInrMilli ?? null;
    const v = await runGate(c, a, { now, predial: d.predial, rate });
    const precheck = { gateVersion: v.gateVersion, at: now.toISOString(), allowed: v.allowed, trace: v.trace, warnings: v.warnings, ...(language ? { language } : {}),
      ...(v.allowed ? {} : { outcome: v.outcome, code: v.code, gate: v.gate, detail: v.detail, nextEligibleAt: v.nextEligibleAt?.toISOString() ?? null,
        // What a person sees: plain words, no rule ids. detail above stays for developers.
        explain: await explainFor(c, a, v) }) };
    if (v.allowed) {
      const conversationId = randomUUID();
      await c.query(`UPDATE attempt SET status = 'dialing', claimed_at = $2, dialed_at = $2, number_id = $3, cli_e164 = $4, carrier = $5,
          reservation_id = $6, agent_version_id = $7, conversation_id = $8, precheck = $9, blocked_by = NULL, next_eligible_at = NULL
        WHERE id = $1 AND status = 'created'`,
        [a.id, now, v.number.id, v.number.e164, v.number.carrier, v.reservationId, v.version.id, conversationId, JSON.stringify(precheck)]);
      // The calls module's runtime hook trusts only a conversation row the control plane created, and settles the hold
      // tagged with its attempt_id. A test call is channel 'test' so it never counts toward outcomes or learning.
      await c.query(`INSERT INTO conversation (id, workspace_id, attempt_id, contact_id, agent_version_id, channel, direction, status)
        VALUES ($1,$2,$3,$4,$5,$6,'outbound','live')`,
        [conversationId, a.workspace_id, a.id, a.contact_id, v.version.id, a.kind === 'test' ? 'test' : 'phone']);
      return { kind: 'claimed', attempt: a, verdict: v, conversationId };
    }
    if (v.outcome === 'deferred') {
      await c.query(`UPDATE attempt SET precheck = $2, blocked_by = $3, next_eligible_at = $4, scheduled_for = coalesce($4, scheduled_for) WHERE id = $1`,
        [a.id, JSON.stringify(precheck), v.code, v.nextEligibleAt]);
    } else {
      await c.query(`UPDATE attempt SET status = 'blocked', precheck = $2, blocked_by = $3, next_eligible_at = $4 WHERE id = $1`,
        [a.id, JSON.stringify(precheck), v.code, v.nextEligibleAt]);
    }
    if (v.code === 'check_unavailable') {
      await appendAudit(c, { workspaceId: a.workspace_id, actorType: 'system', actorId: SYSTEM.id, action: 'gate.check_unavailable',
        objectType: 'attempt', objectId: a.id, payload: { gate: v.gate, detail: v.detail ?? '' } });
    }
    return { kind: 'claimed', attempt: a, verdict: v };
  });
}

/** Per-contact facts for the ticket: declared perContact facts only, filled from the attempt's variables or the
 *  contact's attributes, with offer facts dropped from service and transactional calls (M1 fence). */
export function ticketFacts(facts: Fact[], category: string, vars: Record<string, unknown>, custom: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of facts) {
    if (!f.perContact) continue;
    if (f.purpose === 'offer' && category !== 'promotional') continue;
    const v = vars[f.key] ?? custom[f.key];
    if (v !== undefined && v !== null && String(v).trim()) out[f.key] = String(v).slice(0, 500);
  }
  return out;
}

const truncBytes = (s: string, max: number) => { const b = Buffer.from(s, 'utf8'); return b.length <= max ? s : b.subarray(0, max).toString('utf8').replace(/�+$/, ''); };

/** memory.brief through the registry (the memory module owns it). Missing tool -> 'none'; slower than 800 ms -> 'not_loaded_timeout'. */
export async function memoryBrief(d: WorkerDeps, ws: string, contactId: string | null, agentId: string, enabled: boolean): Promise<Pick<CallTicket['contact'], 'memoryBrief' | 'memoryStatus'>> {
  if (!enabled) return { memoryBrief: '', memoryStatus: 'disabled' };
  if (!contactId || !d.registry.get('memory.brief')) return { memoryBrief: '', memoryStatus: 'none' };
  let timer: NodeJS.Timeout | undefined;
  try {
    const r = await Promise.race([
      d.registry.execute<{ text?: string; status?: string }>(d.pool, 'memory.brief', { contactId, agentId }, { workspaceId: ws, actor: SYSTEM }),
      new Promise<'timeout'>(res => { timer = setTimeout(() => res('timeout'), MEMORY_BRIEF_TIMEOUT_MS); }),
    ]);
    if (r === 'timeout') return { memoryBrief: '', memoryStatus: 'not_loaded_timeout' };
    // memory.brief answers { text, status }: 'ok' is usable; 'off' / 'off_for_agent' mean memory is switched off; anything
    // else (empty, unknown_contact, not_executed) dials without memory.
    if (r.status !== 'confirmed') return { memoryBrief: '', memoryStatus: 'none' };
    if (r.result?.status === 'off' || r.result?.status === 'off_for_agent') return { memoryBrief: '', memoryStatus: 'disabled' };
    if (r.result?.status !== 'ok' || !r.result.text) return { memoryBrief: '', memoryStatus: 'none' };
    return { memoryBrief: truncBytes(r.result.text, 1200), memoryStatus: 'loaded' };
  } catch { return { memoryBrief: '', memoryStatus: 'none' }; }
  finally { clearTimeout(timer); }
}

/** The contact's current attribute values for these keys (intake keeps one current row per key, already decided by
 *  authority), skipping any older than its max_age_s: a stale value is never spoken. Scalars only. */
export async function freshAttributes(d: WorkerDeps, contactId: string, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const now = (d.now?.() ?? new Date()).getTime();
  const rows = await many<{ key: string; value: unknown; observed_at: Date; max_age_s: number | null }>(d.pool,
    'SELECT key, value, observed_at, max_age_s FROM attribute WHERE contact_id = $1 AND key = ANY($2)', [contactId, keys]);
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.max_age_s !== null && r.observed_at.getTime() + r.max_age_s * 1000 < now) continue;
    if (['string', 'number', 'boolean'].includes(typeof r.value)) out[r.key] = String(r.value);
  }
  return out;
}

export async function buildTicket(d: WorkerDeps, a: AttemptRow, v: GatePass, conversationId: string): Promise<CallTicket> {
  const agent = v.version.config.agent!;
  const stack = resolveStack(agent.voice);   // G10 already refused a voice setting that names no stack
  const mem = await memoryBrief(d, a.workspace_id, v.contact?.id ?? null, v.version.agent_id, agent.memory?.read !== false);
  const stored = { ...(v.contact?.custom ?? {}), ...(v.contact ? await freshAttributes(d, v.contact.id, (agent.facts ?? []).filter(f => f.perContact).map(f => f.key)) : {}) };
  return {
    protocol: 1, conversationId, attemptId: a.id, workspaceId: a.workspace_id, direction: 'outbound',
    transport: { kind: 'sip', to: v.target, from: v.number.e164, trunk: v.number.carrier },
    agent, brief: v.version.config.brief!,
    stack: { id: stack.id, combinationId: combinationId(stack, agent.voice.voiceId), components: stack.components },
    contact: {
      displayName: v.contact?.name ?? '', ...(v.contact?.language ? { language: v.contact.language as CallTicket['contact']['language'] } : {}),
      timezone: v.contact?.timezone ?? 'Asia/Kolkata',
      facts: ticketFacts(agent.facts ?? [], v.category, a.facts ?? {}, stored),
      ...mem,
    },
    consent: v.consent,
    limits: { maxDurationS: v.maxDurationS, maxCostInrMilli: v.reservedInrMilli },
    test: a.kind === 'test',
  };
}

export type DispatchResult = 'dispatched' | 'rejected' | 'unknown' | 'at_capacity';

/** Hand a claimed attempt to the runtime, once. */
export async function dispatch(d: WorkerDeps, a: AttemptRow, v: GatePass, conversationId: string): Promise<DispatchResult> {
  const rt = d.runtime ?? defaultRuntime();
  let ticket: CallTicket;
  try { ticket = await buildTicket(d, a, v, conversationId); } catch (e) {
    await failBeforeRing(d, a, v, 'ticket: ' + (e instanceof Error ? e.message : String(e)));
    return 'rejected';
  }
  let reply;
  try { reply = await rt.start(ticket); } catch (e) {
    // The request may have left: the outcome is unknown. Keep the hold (the calls module settles or releases it).
    await tx(d.pool, async c => {
      await c.query("UPDATE attempt SET status = 'unknown', outcome_class = 'unknown', carrier_code = $2 WHERE id = $1 AND status = 'dialing'",
        [a.id, String(e instanceof Error ? e.message : e).slice(0, 200)]);
      await appendAudit(c, { workspaceId: a.workspace_id, actorType: 'system', actorId: SYSTEM.id, action: 'attempt.unknown', objectType: 'attempt', objectId: a.id,
        payload: { reason: 'runtime start did not answer' } });
    });
    return 'unknown';
  }
  if (!reply.accepted && reply.retryable) { await requeueAtCapacity(d, a, v, reply.retryAfterS ?? 5); return 'at_capacity'; }
  if (!reply.accepted) { await failBeforeRing(d, a, v, reply.reason ?? 'runtime refused'); return 'rejected'; }
  await d.pool.query('UPDATE attempt SET dispatched_at = now() WHERE id = $1 AND dispatched_at IS NULL', [a.id]);
  return 'dispatched';
}

/** The runtime is full (503 at_capacity) and placed nothing. This is not a failure: the same attempt goes back to the
 *  queue as if it was never claimed (no outcome, no ladder step, no dial on the number's budget), the hold is released,
 *  and it becomes due after retryAfterS plus 0-50% jitter. The next claim runs the full gate again, so a time outside the
 *  window simply defers it to the next window. */
async function requeueAtCapacity(d: WorkerDeps, a: AttemptRow, v: GatePass, retryAfterS: number) {
  const now = d.now?.() ?? new Date();
  const delayMs = Math.round(retryAfterS * 1000 * (1 + Math.random() * 0.5));
  const due = new Date(now.getTime() + delayMs);
  await tx(d.pool, async c => {
    await c.query(`UPDATE attempt SET status = 'created', scheduled_for = $2, next_eligible_at = $2, blocked_by = 'runtime_at_capacity',
        claimed_at = NULL, dialed_at = NULL, dispatched_at = NULL, number_id = NULL, cli_e164 = NULL, carrier = NULL,
        reservation_id = NULL, conversation_id = NULL
      WHERE id = $1 AND status = 'dialing'`, [a.id, due]);
    await release(c, v.reservationId);
    // Nothing happened on this conversation; the next claim opens a fresh one.
    await c.query("DELETE FROM conversation WHERE attempt_id = $1 AND status = 'live' AND workspace_id = $2", [a.id, a.workspace_id]);
    await appendAudit(c, { workspaceId: a.workspace_id, actorType: 'system', actorId: SYSTEM.id, action: 'attempt.deferred', objectType: 'attempt', objectId: a.id,
      payload: { reason: 'runtime at capacity', retryAfterS, dueAt: due.toISOString() } });
  });
}

/** The runtime refused before any ring: release the hold, mark a provider error that never spends the person's budget,
 *  and let the ladder schedule the retry (A3). */
async function failBeforeRing(d: WorkerDeps, a: AttemptRow, v: GatePass, reason: string) {
  await tx(d.pool, async c => {
    await c.query(`UPDATE attempt SET status = 'failed', outcome_class = 'provider_error', counts_to_budget = false, carrier_code = $2 WHERE id = $1`,
      [a.id, reason.slice(0, 200)]);
    await release(c, v.reservationId);
    await c.query("UPDATE conversation SET status = 'failed', end_reason = 'failed', ended_at = now() WHERE attempt_id = $1 AND status = 'live'", [a.id]);
  });
  if (d.registry.get('attempt.retry_per_ladder')) {
    await d.registry.execute(d.pool, 'attempt.retry_per_ladder', { attemptId: a.id, outcome: 'provider_error' }, { workspaceId: a.workspace_id, actor: SYSTEM });
  }
}

/** Attempts claimed but never confirmed dispatched (a worker died between claim and start): unknown, never auto-retried. */
export async function reconcileStale(d: WorkerDeps): Promise<number> {
  const now = d.now?.() ?? new Date();
  const r = await d.pool.query(`UPDATE attempt SET status = 'unknown', outcome_class = 'unknown', carrier_code = 'dispatch_unconfirmed'
    WHERE status = 'dialing' AND dispatched_at IS NULL AND claimed_at < $1 AND ($2::uuid IS NULL OR workspace_id = $2::uuid)`,
    [new Date(now.getTime() - DISPATCH_STALE_MS), d.workspaceId ?? null]);
  return r.rowCount ?? 0;
}

/** Scheduled campaigns whose start time has come begin running; running campaigns with nothing left complete. */
export async function advanceCampaigns(d: WorkerDeps): Promise<void> {
  const now = d.now?.() ?? new Date();
  await d.pool.query(`UPDATE campaign SET state = 'running', updated_at = now()
    WHERE state = 'scheduled' AND coalesce((policy->>'startAt')::timestamptz, now()) <= $1 AND ($2::uuid IS NULL OR workspace_id = $2::uuid)`,
    [now, d.workspaceId ?? null]);
  await d.pool.query(`UPDATE campaign k SET state = 'completed', updated_at = now()
    WHERE k.state = 'running' AND ($1::uuid IS NULL OR k.workspace_id = $1::uuid)
      AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.campaign_id = k.id AND (a.status IN ('created','queued') OR (${LIVE_ATTEMPT})))`,
    [d.workspaceId ?? null]);
}

export interface TickReport { claimed: number; dispatched: number; blocked: number; deferred: number; unknown: number; rejected: number; stale: number; atCapacity: number }

/** One pass: reconcile, advance campaigns, then claim and dispatch up to `max` attempts. */
export async function tick(d: WorkerDeps, max = 50): Promise<TickReport> {
  const rep: TickReport = { claimed: 0, dispatched: 0, blocked: 0, deferred: 0, unknown: 0, rejected: 0, atCapacity: 0, stale: await reconcileStale(d) };
  await advanceCampaigns(d);
  for (let i = 0; i < max; i++) {
    const o = await claimNext(d);
    if (o.kind === 'none') break;
    if (o.kind === 'review_stop') {
      await d.registry.execute(d.pool, 'campaign.pause', { id: o.campaignId, cause: 'first_campaign_review' }, { workspaceId: o.workspaceId, actor: SYSTEM });
      continue;
    }
    rep.claimed++;
    const v = o.verdict;
    if (!v.allowed) {
      if (v.outcome === 'blocked') rep.blocked++; else rep.deferred++;
      if (v.campaign && (v.code === 'cap_reached' || v.code === 'wallet_low')) {
        const args = v.code === 'cap_reached' ? ['campaign.stop_at_cap', { id: v.campaign.id, scope: v.capScope ?? 'campaign' }] as const
          : ['campaign.pause', { id: v.campaign.id, cause: 'wallet_low' }] as const;
        await d.registry.execute(d.pool, args[0], args[1], { workspaceId: o.attempt.workspace_id, actor: SYSTEM });
      }
      continue;
    }
    const r = await dispatch(d, o.attempt, v, o.conversationId!);
    if (r === 'at_capacity') { rep.atCapacity++; break; }   // back-pressure: a full runtime gets no more starts this tick
    if (r === 'dispatched') rep.dispatched++; else if (r === 'unknown') rep.unknown++; else rep.rejected++;
  }
  return rep;
}

/** A long-running loop for the server process. */
export function startWorker(d: WorkerDeps, intervalMs = 2_000): { stop: () => void } {
  let stopped = false, running = false;
  const timer = setInterval(async () => {
    if (stopped || running) return;
    running = true;
    try { await tick(d); } catch (e) { console.error('campaigns worker tick failed', e instanceof Error ? e.message : e); } finally { running = false; }
  }, intervalMs);
  return { stop: () => { stopped = true; clearInterval(timer); } };
}
