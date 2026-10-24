// The carrier's side of a call, on the control plane:
//  - number.attach_carrier (Vyakti staff only, audited): attach a number already bought on the carrier account to a
//    workspace and point it at our inbound path through the carrier's API (one application, VP_INBOUND_APP_NAME, whose
//    answer URL is the runtime's signed inbound path and whose hang-up URL is the hook below). inbound.route.set then
//    picks the agent that answers.
//  - POST /hooks/telephony/plivo/hangup: the carrier's hang-up callback for that application (inbound calls), signed
//    X-Plivo-Signature-V3. It stores what the carrier says (duration, billed duration, hang-up cause and source) on the
//    conversation and marks when the line dropped. The runtime normally ends the call itself (call.ended); a call still
//    live 90 s after the carrier hung up is asked to end, and one still live after 10 minutes (the runtime lost it) is
//    settled here from what is known, so a hold never stays held for a call that is over.
//  - campaigns.carrier_cdr: after a phone call ends, the carrier's CDR (billed seconds and the INR amount) is fetched once
//    by its call id and kept beside the call, so the call log shows the carrier's own numbers.
import { createHmac } from 'node:crypto';
import type pg from 'pg';
import type { Deps } from '../../app.ts';
import { appendAudit } from '../../audit.ts';
import { SetupError } from '../../setup-error.ts';
import { many, one, tx } from '../../db.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { release, settle } from '../../ledger.ts';
import { runtime } from '../../runtime-client.ts';
import { tool, type Registry } from '../../tools.ts';
import { carrierOutcome, type CarrierFacts } from '../../../shared/carrier.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { bool, obj, opt, str, ValidationError } from '../../../shared/validate.ts';
import { requirePlivo, publicBase } from './plivo-signature.ts';
import { SERIES, telephony, TelephonyDisabled, type Series } from './telephony.ts';

export const HANGUP_PATH = '/hooks/telephony/plivo/hangup';
const SYSTEM = { type: 'system' as const, id: 'telephony.carrier' };
export const CARRIER_GRACE_S = 90, CARRIER_ORPHAN_S = 600;

/** The runtime's signed inbound answer URL (voice/vpvoice/server.py Runtime.inbound_answer_url: HMAC(secret, 'inbound:<trunk>')). */
export function inboundAnswerUrl(env: NodeJS.ProcessEnv = process.env, trunk = 'plivo'): string | null {
  const base = (env.VP_RUNTIME_PUBLIC_URL ?? '').trim().replace(/\/+$/, ''), secret = env.VP_RUNTIME_SECRET ?? '';
  if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(base + '/')) return null;
  if (secret.length < 32) return null;
  return `${base}/v1/media/sip/inbound/${trunk}/${createHmac('sha256', secret).update(`inbound:${trunk}`).digest('hex').slice(0, 32)}`;
}

/** Plivo's hang-up callback form (docs.plivo.com/docs/account/api/application, read 2026-10-24) as carrier facts. */
export function hangupFacts(f: Map<string, string[]>): CarrierFacts & { direction?: string } {
  const g = (k: string) => f.get(k)?.[0] || undefined;
  const n = (k: string) => { const v = g(k); return v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v); };
  return { provider: 'plivo', callUuid: g('CallUUID'), requestUuid: g('RequestUUID') ?? g('ALegRequestUUID'), hangupCauseName: g('HangupCauseName'),
    hangupCauseCode: n('HangupCauseCode'), hangupSource: g('HangupSource'), durationS: n('Duration'), billDurationS: n('BillDuration'),
    ...(g('Machine') ? { answeredBy: /true|machine/i.test(g('Machine')!) ? 'machine' as const : 'human' as const } : {}), direction: g('Direction') };
}

const trialAccount = () => process.env.VP_CARRIER_TRIAL === '1';

export function hangupHook(deps: Deps) {
  return async (req: Req): Promise<Res> => {
    const form = await requirePlivo(deps.pool, req);
    const facts = hangupFacts(form);
    if (!facts.callUuid) return { raw: '', headers: { 'content-type': 'text/plain' } };
    const out = carrierOutcome(facts, { trialAccount: trialAccount() });
    // The carrier's call id is unique to the call; an inbound conversation keeps it from the ring (inbound.ts).
    const conv = await one<{ id: string; workspace_id: string }>(deps.pool, 'SELECT id, workspace_id FROM conversation WHERE carrier_call_id = $1 ORDER BY started_at DESC LIMIT 1', [facts.callUuid]);
    if (conv) {
      await deps.pool.query(`UPDATE conversation SET carrier = coalesce(carrier, '{}'::jsonb) || $2::jsonb, carrier_hangup_at = coalesce(carrier_hangup_at, now()) WHERE id = $1`,
        [conv.id, JSON.stringify({ facts, outcome: out, source: 'hangup_callback' })]);
    }
    return { raw: '', headers: { 'content-type': 'text/plain' } };
  };
}

/** Calls the carrier closed but the runtime never reported: ask the runtime to end them, then settle them here. */
export async function settleCarrierEnded(pool: pg.Pool, now = new Date(), workspaceId?: string): Promise<{ asked: number; settled: number }> {
  const due = await many<{ id: string; workspace_id: string; attempt_id: string | null; carrier: Record<string, any>; hung: Date }>(pool,
    `SELECT id, workspace_id, attempt_id, carrier, carrier_hangup_at AS hung FROM conversation
     WHERE status = 'live' AND carrier_hangup_at IS NOT NULL AND carrier_hangup_at < $1 AND ($2::uuid IS NULL OR workspace_id = $2::uuid) LIMIT 50`,
    [new Date(now.getTime() - CARRIER_GRACE_S * 1000), workspaceId ?? null]);
  let asked = 0, settled = 0;
  for (const c of due) {
    if (c.hung.getTime() > now.getTime() - CARRIER_ORPHAN_S * 1000) {
      if (c.carrier?.endAsked) continue;
      await runtime().control(c.id, 'end', { endReason: 'completed' }).catch(() => null);
      await pool.query(`UPDATE conversation SET carrier = carrier || '{"endAsked": true}'::jsonb WHERE id = $1`, [c.id]);
      asked++;
      continue;
    }
    await tx(pool, async q => {
      const live = await one<{ id: string }>(q, "SELECT id FROM conversation WHERE id = $1 AND status = 'live' FOR UPDATE", [c.id]);
      if (!live) return;
      const facts = (c.carrier?.facts ?? {}) as CarrierFacts;
      const out = carrierOutcome(facts, { trialAccount: trialAccount() });
      const total = Number((await one<{ s: string }>(q, 'SELECT coalesce(sum(inr_milli), 0)::text AS s FROM cost_line WHERE conversation_id = $1 AND workspace_id = $2', [c.id, c.workspace_id]))!.s);
      const holds = await many<{ id: string }>(q, c.attempt_id
        ? "SELECT id FROM reservation WHERE workspace_id = $1 AND attempt_id = $2 AND status = 'held' ORDER BY created_at"
        : "SELECT id FROM reservation WHERE workspace_id = $1 AND conversation_id = $2 AND status = 'held' ORDER BY created_at", [c.workspace_id, c.attempt_id ?? c.id]);
      for (const [i, h] of holds.entries()) { if (i === 0 && total > 0) await settle(q, h.id, total); else await release(q, h.id); }
      const endReason = out.rang ? 'error' : 'failed';
      await q.query(`UPDATE conversation SET status = 'ended', end_reason = $2, reason_code = $3, ended_at = $4, duration_s = $5,
          settlement = $6 WHERE id = $1`, [c.id, endReason, out.rang ? 'CONN_ENGINE_ERROR' : out.reasonCode, now, Math.round(facts.durationS ?? 0),
        JSON.stringify({ action: holds.length ? (total > 0 ? 'settled' : 'released') : 'none', inrMilli: total, by: 'carrier_hangup' })]);
      if (c.attempt_id) await q.query("UPDATE attempt SET status = $2, counts_to_budget = counts_to_budget AND $3 WHERE id = $1", [c.attempt_id, out.rang ? 'connected' : 'failed', out.rang]);
      await appendAudit(q, { workspaceId: c.workspace_id, actorType: 'system', actorId: SYSTEM.id, action: 'call.settled_from_carrier', objectType: 'conversation', objectId: c.id,
        payload: { reason: out.reason, heldReleased: holds.length, settledInrMilli: total } });
    });
    settled++;
  }
  return { asked, settled };
}

/** The carrier's CDR for phone calls that ended in the last day and carry a carrier call id, fetched once each. */
export async function fetchCdrs(pool: pg.Pool, now = new Date(), workspaceId?: string): Promise<number> {
  const rows = await many<{ id: string; uuid: string }>(pool, `SELECT id, coalesce(carrier->'facts'->>'callUuid', carrier_call_id) AS uuid FROM conversation
    WHERE channel IN ('phone','test') AND status <> 'live' AND ended_at BETWEEN $1 AND $2 AND (carrier->'cdr') IS NULL AND (carrier->'cdrMiss') IS NULL
      AND coalesce(carrier->'facts'->>'callUuid', carrier_call_id) IS NOT NULL AND ($3::uuid IS NULL OR workspace_id = $3::uuid) ORDER BY ended_at LIMIT 20`,
    [new Date(now.getTime() - 864e5), new Date(now.getTime() - 30_000), workspaceId ?? null]);
  let n = 0;
  for (const r of rows) {
    let cdr;
    try { cdr = await telephony().cdr(r.uuid); } catch (e) {
      if (e instanceof TelephonyDisabled) return n;          // no carrier on this server: nothing to fetch, nothing to mark
      continue;                                            // a carrier hiccup: try again on the next pass
    }
    await pool.query(`UPDATE conversation SET carrier = coalesce(carrier, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [r.id, JSON.stringify(cdr ? { cdr, costInrMilli: cdr.totalInrMilli } : { cdrMiss: now.toISOString() })]);
    n++;
  }
  return n;
}

export function registerCarrierTools(reg: Registry): void {
  const attachV = obj({ phone: str({ min: 6, max: 20 }), series: opt(str({ oneOf: SERIES as unknown as string[] })), displayName: opt(str({ max: 80 })),
    kycVerified: opt(bool()), evidence: str({ min: 10, max: 300 }) });
  reg.register(tool(attachV, {
    name: 'number.attach_carrier', risk: 'draft', roles: [],          // Vyakti staff only (actor vp_success), never a workspace role
    summary: 'Vyakti staff: attach a number already on the carrier account to this workspace and point its calls at Vyakti (audited)',
    prepare: async (ctx, i) => {
      if (ctx.actor.type !== 'vp_success' || !ctx.actor.id) throw new Error('only Vyakti staff can attach a carrier number');
      const n = normaliseIndianPhone(i.phone);
      if (!n.ok) throw new ValidationError('phone', `not an Indian number (${n.reason})`);
      const elsewhere = await one(ctx.pool, "SELECT 1 FROM phone_number WHERE e164 = $1 AND workspace_id <> $2 AND status <> 'released'", [n.e164, ctx.workspaceId]);
      if (elsewhere) throw new Error('this number is attached to another workspace; release it there first');
      const answerUrl = inboundAnswerUrl(), base = publicBase();
      if (!answerUrl) throw new SetupError('The voice engine has no public address for the phone carrier yet, so the number cannot be pointed at it.',
        'runtime_public_url_missing', 'set VP_RUNTIME_PUBLIC_URL (https) and VP_RUNTIME_SECRET on the control plane');
      if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(base + '/'))
        throw new SetupError('This server has no public address for the phone carrier to report hang-ups to.', 'public_url_missing', 'set VP_PUBLIC_URL (https) on the control plane');
      const app = await telephony().attachInbound({ e164: n.e164, appName: process.env.VP_INBOUND_APP_NAME || 'vyakti-inbound', answerUrl, hangupUrl: base + HANGUP_PATH });
      return { e164: n.e164, appId: app.appId };
    },
    run: async (ctx, i, p) => {
      if (ctx.actor.type !== 'vp_success' || !ctx.actor.id || !p) throw new Error('only Vyakti staff can attach a carrier number');
      const { e164, appId } = p as { e164: string; appId: string };
      const series = (i.series ?? 'trial') as Series;
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO phone_number (workspace_id, e164, series, carrier, provider, provider_ref, display_name, kyc_status, status, inbound_app_ref)
        VALUES ($1,$2,$3,'plivo','plivo',$4,$5,$6,'active',$7)
        ON CONFLICT (workspace_id, e164) DO UPDATE SET status = 'active', series = EXCLUDED.series, carrier = 'plivo', provider = 'plivo', provider_ref = EXCLUDED.provider_ref,
          display_name = coalesce(EXCLUDED.display_name, phone_number.display_name), kyc_status = CASE WHEN $8 THEN 'verified' ELSE phone_number.kyc_status END,
          inbound_app_ref = EXCLUDED.inbound_app_ref
        RETURNING id`, [ctx.workspaceId, e164, series, e164.replace(/\D/g, ''), i.displayName ?? null, i.kycVerified ? 'verified' : 'none', appId, !!i.kycVerified]);
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: 'vp_success', actorId: ctx.actor.id!, action: 'number.attached_from_carrier',
        objectType: 'phone_number', objectId: row!.id, payload: { series, evidence: i.evidence, kycVerified: !!i.kycVerified, phoneEnds: e164.slice(-3) } });
      return { numberId: row!.id, series, inbound: 'pointed at Vyakti; bind an agent with inbound.route.set', next: 'inbound.route.set' };
    },
  }));
}
