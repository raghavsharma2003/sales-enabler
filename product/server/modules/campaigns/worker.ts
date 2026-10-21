// The dial worker. One loop for every attempt kind: claim a due attempt with SELECT ... FOR UPDATE SKIP LOCKED, run
// the dial gate in that same transaction, stamp the result, commit; then (outside the transaction) fetch the memory
// brief, build the CallTicket and hand it to the runtime. An attempt moves created -> dialing exactly once, under its
// row lock, so two workers can never dial it twice. A ticket whose dispatch was never confirmed becomes 'unknown'
// and is never retried automatically (HV law 17).
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Fact } from '../../../shared/agent-config.ts';
import type { CallTicket } from '../../../shared/runtime-protocol.ts';
import { combinationId, getStack } from '../../../shared/stacks.ts';
import { appendAudit } from '../../audit.ts';
import { one, tx } from '../../db.ts';
import { release } from '../../ledger.ts';
import { runtime as defaultRuntime, type Runtime } from '../../runtime-client.ts';
import type { Registry } from '../../tools.ts';
import { DISPATCH_STALE_MS, MEMORY_BRIEF_TIMEOUT_MS } from './defaults.ts';
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

export type ClaimOutcome =
  | { kind: 'none' }
  | { kind: 'review_stop'; campaignId: string; workspaceId: string }
  | { kind: 'claimed'; attempt: AttemptRow; verdict: GateVerdict; conversationId?: string };

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

    const v = await runGate(c, a, { now, predial: d.predial });
    const precheck = { gateVersion: v.gateVersion, at: now.toISOString(), allowed: v.allowed, trace: v.trace, warnings: v.warnings,
      ...(v.allowed ? {} : { outcome: v.outcome, code: v.code, gate: v.gate, detail: v.detail, nextEligibleAt: v.nextEligibleAt?.toISOString() ?? null }) };
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
    if (r.status !== 'confirmed' || !r.result?.text) return { memoryBrief: '', memoryStatus: 'none' };
    return { memoryBrief: truncBytes(r.result.text, 1200), memoryStatus: 'loaded' };
  } catch { return { memoryBrief: '', memoryStatus: 'none' }; }
  finally { clearTimeout(timer); }
}

export async function buildTicket(d: WorkerDeps, a: AttemptRow, v: GatePass, conversationId: string): Promise<CallTicket> {
  const agent = v.version.config.agent!;
  const stack = getStack(agent.voice.stackId)!;
  const mem = await memoryBrief(d, a.workspace_id, v.contact?.id ?? null, v.version.agent_id, agent.memory?.read !== false);
  return {
    protocol: 1, conversationId, attemptId: a.id, workspaceId: a.workspace_id, direction: 'outbound',
    transport: { kind: 'sip', to: v.target, from: v.number.e164, trunk: v.number.carrier },
    agent, brief: v.version.config.brief!,
    stack: { id: stack.id, combinationId: combinationId(stack, agent.voice.voiceId) },
    contact: {
      displayName: v.contact?.name ?? '', ...(v.contact?.language ? { language: v.contact.language as CallTicket['contact']['language'] } : {}),
      timezone: v.contact?.timezone ?? 'Asia/Kolkata',
      facts: ticketFacts(agent.facts ?? [], v.category, a.facts ?? {}, v.contact?.custom ?? {}),
      ...mem,
    },
    consent: v.consent,
    limits: { maxDurationS: v.maxDurationS, maxCostInrMilli: v.reservedInrMilli },
    test: a.kind === 'test',
  };
}

export type DispatchResult = 'dispatched' | 'rejected' | 'unknown';

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
  if (!reply.accepted) { await failBeforeRing(d, a, v, reply.reason ?? 'runtime refused'); return 'rejected'; }
  await d.pool.query('UPDATE attempt SET dispatched_at = now() WHERE id = $1 AND dispatched_at IS NULL', [a.id]);
  return 'dispatched';
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

export interface TickReport { claimed: number; dispatched: number; blocked: number; deferred: number; unknown: number; rejected: number; stale: number }

/** One pass: reconcile, advance campaigns, then claim and dispatch up to `max` attempts. */
export async function tick(d: WorkerDeps, max = 50): Promise<TickReport> {
  const rep: TickReport = { claimed: 0, dispatched: 0, blocked: 0, deferred: 0, unknown: 0, rejected: 0, stale: await reconcileStale(d) };
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
