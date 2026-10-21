// Wallet top-ups as payment intents (review MA-08). The gateway is charged in prepare(), outside the approval
// transaction, under ONE idempotency key per approval ('topup:<action id>'). The intent row is committed before the
// charge, so a lost response, a crash or a later DB error can never lead to a second charge:
//   prepare: intent exists? -> reuse its outcome, never charge again; else write it, charge, record the result.
//            a thrown charge -> intent and action become 'unknown' (never re-approvable), resolved by resolveTopups().
//   run:     credit a captured intent once (credited_at), inside the approval transaction.
import type pg from 'pg';
import { argsHash } from '../../../shared/approval.ts';
import { formatInr } from '../../../shared/money.ts';
import { many, one, tx, type Queryable } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { UnknownOutcome, type PrepareCtx, type ToolCtx } from '../../tools.ts';
import { gateway } from './gateway.ts';
import { credit } from './money.ts';

export interface TopupInput { inrMilli: number; requestId?: string }
export interface Prepared { topupId: string; status: 'captured' | 'failed'; reason?: string }

/** The approval this prepare() belongs to. The kernel does not pass the action id yet, so it is found by its args hash;
 *  two identical pending top-ups are refused rather than guessed between (a requestId makes each one distinct). */
async function actionFor(ctx: PrepareCtx, i: TopupInput): Promise<string> {
  const given = (ctx as PrepareCtx & { actionId?: string }).actionId;
  if (given) return given;
  const rows = await many<{ id: string }>(ctx.pool,
    "SELECT id FROM action WHERE workspace_id = $1 AND tool = 'wallet.topup' AND status = 'proposed' AND args_hash = $2",
    [ctx.workspaceId, argsHash('wallet.topup', i)]);
  if (rows.length === 0) throw new Error('a top-up runs only from an approved request');
  if (rows.length > 1) throw new Error('two identical top-up requests are waiting; decline one, or ask again with a request id');
  return rows[0].id;
}

export async function prepareTopup(ctx: PrepareCtx, i: TopupInput): Promise<Prepared> {
  const gw = gateway();
  if (!gw.enabled) throw new Error('online top-up is not switched on yet; ask VP success for a manual credit');
  const actionId = await actionFor(ctx, i);
  const key = 'topup:' + actionId;
  const prior = await one<{ id: string; status: string; reason: string | null }>(ctx.pool,
    'SELECT id, status, reason FROM wallet_topup WHERE idempotency_key = $1 AND workspace_id = $2', [key, ctx.workspaceId]);
  if (prior) {
    if (prior.status === 'captured' || prior.status === 'failed') return { topupId: prior.id, status: prior.status, reason: prior.reason ?? undefined };
    throw new Error(prior.status === 'unknown'
      ? 'this payment\'s outcome is not confirmed yet; it is being checked with the gateway and will not be charged again'
      : 'this top-up is already being processed');
  }
  const row = await one<{ id: string }>(ctx.pool,
    `INSERT INTO wallet_topup (workspace_id, kind, inr_milli, gateway, status, actor, idempotency_key, action_id)
     VALUES ($1,'payment',$2,$3,'created',$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [ctx.workspaceId, i.inrMilli, gw.name, ctx.actor.id ?? ctx.actor.type, key, actionId]);
  if (!row) throw new Error('this top-up is already being processed');
  let res;
  try { res = await gw.charge({ inrMilli: i.inrMilli, workspaceId: ctx.workspaceId, idempotencyKey: key }); }
  catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await tx(ctx.pool, async c => {
      await c.query("UPDATE wallet_topup SET status = 'unknown', reason = $2, updated_at = now() WHERE id = $1", [row.id, why.slice(0, 300)]);
      // The kernel maps a prepare() error to not_executed and leaves the action proposed; mark it unknown so no
      // second tap can reach the gateway (the intent would refuse anyway).
      await c.query("UPDATE action SET status = 'unknown' WHERE id = $1 AND workspace_id = $2 AND status = 'proposed'", [actionId, ctx.workspaceId]);
      await appendAudit(c, { workspaceId: ctx.workspaceId, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'wallet.topup',
        objectType: 'wallet_topup', objectId: row.id, payload: { outcome: 'unknown', reason: why.slice(0, 300) } });
    });
    throw new UnknownOutcome(`the payment gateway did not confirm the charge (${why}); it will be checked, never charged again`);
  }
  await ctx.pool.query('UPDATE wallet_topup SET status = $2, gateway_ref = $3, reason = $4, updated_at = now() WHERE id = $1',
    [row.id, res.status, res.gatewayRef, res.status === 'failed' ? res.reason : null]);
  return { topupId: row.id, status: res.status, reason: res.status === 'failed' ? res.reason : undefined };
}

/** Credit a captured intent once. Safe to call from the approval, the resolver job, or both. */
export async function creditTopup(q: Queryable, ws: string, topupId: string): Promise<{ credited: boolean; balanceInrMilli?: number; state?: string }> {
  const t = await one<{ inr: string }>(q,
    "UPDATE wallet_topup SET credited_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'captured' AND credited_at IS NULL RETURNING inr_milli::text AS inr",
    [topupId, ws]);
  if (!t) return { credited: false };
  const w = await credit(q, ws, Number(t.inr));
  return { credited: true, balanceInrMilli: Number(w!.balance), state: w!.state };
}

export async function runTopup(ctx: ToolCtx, p: Prepared | undefined) {
  if (!p) throw new Error('a top-up runs only from an approved request');
  if (p.status === 'failed') return { status: 'failed', topupId: p.topupId, reason: p.reason };
  const c = await creditTopup(ctx.q, ctx.workspaceId, p.topupId);
  if (!c.credited) return { status: 'already_credited', topupId: p.topupId };
  return { status: 'credited', topupId: p.topupId, balanceInrMilli: c.balanceInrMilli, state: c.state, display: formatInr(c.balanceInrMilli!, { paise: true }) };
}

/** The resolver job: unknown intents are looked up at the gateway (never re-charged); captured-but-uncredited ones
 *  older than `creditAfterMs` (the approval's transaction failed after capture) are credited. Unresolvable ones open
 *  one issue each. */
export async function resolveTopups(pool: pg.Pool, now: Date = new Date(), creditAfterMs = 10 * 60_000) {
  const gw = gateway();
  let resolved = 0, credited = 0, flagged = 0;
  const unknown = await many<{ id: string; workspace_id: string; idempotency_key: string; gateway: string }>(pool,
    "SELECT id, workspace_id, idempotency_key, gateway FROM wallet_topup WHERE status = 'unknown' AND kind = 'payment'");
  for (const t of unknown) {
    const found = gw.name === t.gateway && gw.lookup ? await gw.lookup(t.idempotency_key).catch(() => undefined) : undefined;
    if (found === undefined) {
      const r = await pool.query(`INSERT INTO issue (workspace_id, category, severity, subject_type, subject_id, detail)
        SELECT $1, 'payment_unknown', 'warning', 'wallet_topup', $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM issue WHERE workspace_id = $1 AND category = 'payment_unknown' AND subject_id = $2 AND status <> 'resolved')`,
        [t.workspace_id, t.id, { fix: 'the gateway did not confirm this top-up and cannot be asked automatically; check it in the gateway dashboard before crediting by hand' }]);
      flagged += r.rowCount ?? 0;
      continue;
    }
    const status = found === null ? 'failed' : found.status;
    await pool.query("UPDATE wallet_topup SET status = $2, gateway_ref = $3, reason = $4, updated_at = now() WHERE id = $1 AND status = 'unknown'",
      [t.id, status, found?.gatewayRef ?? null, found === null ? 'the gateway has no record of this charge' : found.status === 'failed' ? found.reason : null]);
    resolved++;
  }
  const due = await many<{ id: string; workspace_id: string }>(pool,
    "SELECT id, workspace_id FROM wallet_topup WHERE status = 'captured' AND credited_at IS NULL AND updated_at < $1", [new Date(now.getTime() - creditAfterMs)]);
  for (const t of due) {
    const ok = await tx(pool, async c => {
      const r = await creditTopup(c, t.workspace_id, t.id);
      if (r.credited) await appendAudit(c, { workspaceId: t.workspace_id, actorType: 'system', actorId: 'money.resolver', action: 'wallet.topup.credit',
        objectType: 'wallet_topup', objectId: t.id, payload: { reason: 'captured at the gateway, confirmed by the resolver' } });
      return r.credited;
    });
    if (ok) credited++;
  }
  return { resolved, credited, flagged };
}
