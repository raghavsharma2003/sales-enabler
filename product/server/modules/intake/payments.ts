// Payment status from the business's own gateway: Razorpay, Cashfree and PayU post signed webhooks to
// /hooks/payments/:integrationId. Each delivery is verified with that gateway's own scheme before anything is read, kept once
// per gateway payment id, and matched to exactly one contact by a record key the workspace names (a policy, loan or order id
// kept as a contact detail; never the payer's phone, which is often someone else). The dial gate asks paidSinceImport()
// whether the person paid after their record was last imported (campaigns' G4, 'already_paid'). A recent call of the person
// who paid can take a verified outcome (calls' recordVerified). Pages and shapes: research/2026-10-24/payment-webhooks/.
// This is the business's money, read only: Vyakti's own wallet is money's gateway.ts and never touches this.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { arr, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, tx, type Queryable } from '../../db.ts';
import { HttpError, type Req, type Router } from '../../http.ts';
import type { Job } from '../../jobs.ts';
import { tool, type Registry } from '../../tools.ts';
import type { Deps } from '../../app.ts';
// Sanctioned data functions: the stored gateway secrets (workspace's vault), and calls' one way to record a verified outcome.
import { integrationSecretsById } from '../workspace/integrations.ts';
import { recordVerified } from '../calls/verified.ts';
import { attrKey } from './mapping.ts';

export const PAYMENT_PROVIDERS = ['razorpay', 'cashfree', 'payu'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
const LABEL: Record<PaymentProvider, string> = { razorpay: 'Razorpay', cashfree: 'Cashfree', payu: 'PayU' };
const CASHFREE_SKEW_S = 300;                 // "reject requests where the timestamp is older than five minutes"
const OUTCOME_WINDOW_DAYS = 14;              // the same window as outcome.import
const MAX_BODY = 256 * 1024;

/** One verified, successful payment, the same shape whichever gateway sent it. */
export interface Paid { ref: string; references: string[]; amountInrMilli: number | null; paidAt: Date; event: string }
export class BadSignature extends Error {}

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const text = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
// Razorpay and Cashfree tags may be an object, [] or null; only an object's values are references.
const values = (o: unknown) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.values(o as Record<string, unknown>).map(text).filter(Boolean) : []);
const rupees = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 1000) : null; };

// ---- Razorpay: X-Razorpay-Signature = hex HMAC-SHA256(webhook secret, raw body) ----------------------------------------

export function razorpay(raw: Buffer, headers: Record<string, string | string[] | undefined>, secrets: Record<string, string>): Paid | null {
  const sig = String(headers['x-razorpay-signature'] ?? '');
  if (!secrets.webhook_secret || !eq(createHmac('sha256', secrets.webhook_secret).update(raw).digest('hex'), sig)) throw new BadSignature('the Razorpay signature does not match');
  const b = JSON.parse(raw.toString('utf8'));
  if (!['payment.captured', 'order.paid', 'payment_link.paid'].includes(b?.event)) return null;
  const pay = b.payload?.payment?.entity, order = b.payload?.order?.entity, link = b.payload?.payment_link?.entity;
  if (!pay?.id || pay.status !== 'captured') return null;
  const references = [text(link?.reference_id), text(order?.receipt), ...values(pay.notes), ...values(order?.notes), ...values(link?.notes)].filter(Boolean);
  const paise = Number(pay.amount);
  return { ref: String(pay.id), references, amountInrMilli: Number.isFinite(paise) ? paise * 10 : null,
    paidAt: new Date(Number(pay.created_at ?? b.created_at) * 1000), event: b.event };
}

// ---- Cashfree: x-webhook-signature = Base64 HMAC-SHA256(client secret, x-webhook-timestamp + raw body) ---------------------

export function cashfree(raw: Buffer, headers: Record<string, string | string[] | undefined>, secrets: Record<string, string>, now = Date.now()): Paid | null {
  const ts = String(headers['x-webhook-timestamp'] ?? ''), sig = String(headers['x-webhook-signature'] ?? '');
  if (!/^\d{9,13}$/.test(ts)) throw new BadSignature('missing x-webhook-timestamp');
  const seconds = Number(ts) > 1e12 ? Number(ts) / 1000 : Number(ts);       // the page does not say seconds or milliseconds
  if (Math.abs(now / 1000 - seconds) > CASHFREE_SKEW_S) throw new BadSignature('the Cashfree timestamp is older than five minutes');
  if (!secrets.client_secret || !eq(createHmac('sha256', secrets.client_secret).update(ts + raw.toString('utf8')).digest('base64'), sig)) throw new BadSignature('the Cashfree signature does not match');
  const b = JSON.parse(raw.toString('utf8'));
  if (!['PAYMENT_SUCCESS', 'PAYMENT_SUCCESS_WEBHOOK'].includes(b?.type)) return null;
  const pay = b.data?.payment, order = b.data?.order;
  if (!pay?.cf_payment_id || pay.payment_status !== 'SUCCESS') return null;
  const references = [text(order?.order_id), ...values(order?.order_tags), text(b.data?.customer_details?.customer_id)].filter(Boolean);
  return { ref: String(pay.cf_payment_id), references, amountInrMilli: rupees(pay.payment_amount), paidAt: new Date(pay.payment_time ?? b.event_time), event: b.type };
}

// ---- PayU: form POST; hash = sha512([additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)

export function payuHash(f: Record<string, string>, salt: string): string {
  const body = [salt, f.status ?? '', '', '', '', '', '', f.udf5 ?? '', f.udf4 ?? '', f.udf3 ?? '', f.udf2 ?? '', f.udf1 ?? '', f.email ?? '', f.firstname ?? '', f.productinfo ?? '', f.amount ?? '', f.txnid ?? '', f.key ?? ''].join('|');
  const extra = f.additional_charges ?? f.additionalCharges;
  return createHash('sha512').update(extra ? `${extra}|${body}` : body).digest('hex');
}

export function payu(raw: Buffer, _headers: Record<string, string | string[] | undefined>, secrets: Record<string, string>): Paid | null {
  const f = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
  if (!secrets.salt || !secrets.merchant_key || f.key !== secrets.merchant_key) throw new BadSignature('the PayU merchant key does not match');
  if (!eq(payuHash(f, secrets.salt), String(f.hash ?? '').toLowerCase())) throw new BadSignature('the PayU hash does not match');
  if (f.status !== 'success' || !f.mihpayid) return null;
  // addedon is "YYYY-MM-DD HH:MM:SS" in India time.
  const at = f.addedon && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(f.addedon) ? new Date(f.addedon.replace(' ', 'T') + '+05:30') : new Date();
  return { ref: f.mihpayid, references: [f.txnid, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5].filter((x): x is string => !!x), amountInrMilli: rupees(f.amount), paidAt: at, event: 'payment.success' };
}

const VERIFY: Record<PaymentProvider, typeof razorpay> = { razorpay, cashfree, payu };

// ---- matching and storing -------------------------------------------------------------------------------------------------

const norm = (v: string) => v.normalize('NFKC').trim().toLowerCase();

interface SourceRow { integration_id: string; workspace_id: string; provider: PaymentProvider; match_keys: string[]; outcome_definition_id: string | null; outcome_value: string | null }

/** Exactly one live contact whose named detail equals one of the payment's references; none or several is not a match. */
async function matchContact(q: Queryable, ws: string, keys: string[], refs: string[]) {
  if (!refs.length) return { status: 'unmatched' as const };
  const hits = await many<{ contact_id: string; key: string; value: string }>(q, `SELECT DISTINCT a.contact_id, a.key, a.value #>> '{}' AS value FROM attribute a JOIN contact c ON c.id = a.contact_id
    WHERE c.workspace_id = $1 AND c.erased_at IS NULL AND a.key = ANY($2::text[]) AND lower(btrim(a.value #>> '{}')) = ANY($3::text[])`, [ws, keys, [...new Set(refs.map(norm))]]);
  const people = new Set(hits.map(h => h.contact_id));
  if (people.size === 1) return { status: 'matched' as const, contactId: hits[0].contact_id, key: hits[0].key, value: hits[0].value };
  return { status: people.size ? 'ambiguous' as const : 'unmatched' as const };
}

/** A verified outcome on the person's latest real call within the window, when the source asks for one. */
async function outcomeFor(q: Queryable, src: SourceRow, contactId: string, p: Paid) {
  if (!src.outcome_definition_id || !src.outcome_value) return null;
  const call = await one<{ id: string }>(q, `SELECT id FROM conversation WHERE workspace_id = $1 AND contact_id = $2 AND channel <> 'test'
    AND started_at >= $3 AND started_at <= $4 ORDER BY started_at DESC LIMIT 1`, [src.workspace_id, contactId, new Date(p.paidAt.getTime() - OUTCOME_WINDOW_DAYS * 86_400_000), p.paidAt]);
  if (!call) return { recorded: false, why: `no call in the ${OUTCOME_WINDOW_DAYS} days before the payment` };
  try {
    const r = await recordVerified(q, src.workspace_id, { conversationId: call.id, definitionId: src.outcome_definition_id, value: src.outcome_value,
      key: { source: src.provider, ref: p.ref }, evidence: { gateway: LABEL[src.provider], amountInrMilli: p.amountInrMilli, paidAt: p.paidAt.toISOString() } });
    return { recorded: !r.duplicate, conversationId: call.id, ...(r.duplicate ? { why: 'already recorded' } : {}) };
  } catch (e) { return { recorded: false, conversationId: call.id, why: e instanceof Error ? e.message : String(e) }; }
}

/** For campaigns' dial gate (G4, 'already_paid'): the latest payment not older than the last import of the record it
 *  matched, or null. A list exported before someone paid may be imported after (its observed_at is then the import time,
 *  which says nothing of the export), so a payment up to a day before the import still counts: calling someone who paid is
 *  the harm this prevents, skipping a fresh due for a day is the lesser one. A list a day newer opens the next cycle. */
export const PAID_MARGIN_HOURS = 24;
export async function paidSinceImport(q: Queryable, workspaceId: string, contactId: string): Promise<{ provider: PaymentProvider; reference: string; paidAt: Date; amount: number | null } | null> {
  const r = await one<{ provider: PaymentProvider; reference: string; paid_at: Date; amount_inr_milli: string | null }>(q, `SELECT p.provider, p.reference, p.paid_at, p.amount_inr_milli
    FROM contact_payment p WHERE p.workspace_id = $1 AND p.contact_id = $2 AND p.status = 'matched'
      AND p.paid_at > coalesce((SELECT max(a.observed_at) FROM attribute a JOIN contact c ON c.id = a.contact_id
        WHERE c.workspace_id = $1 AND a.contact_id = p.contact_id AND a.key = p.reference_key), '-infinity'::timestamptz) - make_interval(hours => ${PAID_MARGIN_HOURS})
    ORDER BY p.paid_at DESC LIMIT 1`, [workspaceId, contactId]);
  return r ? { provider: r.provider, reference: r.reference, paidAt: r.paid_at, amount: r.amount_inr_milli === null ? null : Number(r.amount_inr_milli) } : null;
}

// ---- the route ----------------------------------------------------------------------------------------------------------

export function registerPaymentRoutes(router: Router, deps: Deps): void {
  router.add('POST', '/hooks/payments/:integrationId', async (req: Req) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.integrationId)) throw new HttpError(404, 'not_found', 'no such payment source');
    const integ = await one<{ workspace_id: string; kind: string }>(deps.pool, "SELECT workspace_id, kind FROM integration WHERE id = $1 AND status = 'connected'", [req.params.integrationId]);
    if (!integ || !(PAYMENT_PROVIDERS as readonly string[]).includes(integ.kind)) throw new HttpError(404, 'not_found', 'no such payment source');
    const provider = integ.kind as PaymentProvider, ws = integ.workspace_id;
    const secrets = await integrationSecretsById(deps.pool, ws, req.params.integrationId);
    if (!secrets) throw new HttpError(404, 'not_found', 'no such payment source');
    const raw = (req.body as Buffer | undefined) ?? Buffer.alloc(0);
    let paid: Paid | null;
    try { paid = VERIFY[provider](raw, req.headers as Record<string, string>, secrets); }
    catch (e) {
      if (e instanceof BadSignature) throw new HttpError(401, 'bad_signature', e.message);
      throw new HttpError(400, 'bad_body', `the ${LABEL[provider]} body could not be read`);
    }
    if (!paid) return { status: 200, body: { ignored: true, reason: 'not a successful payment' } };
    const src = await one<SourceRow>(deps.pool, 'SELECT * FROM intake_payment_source WHERE integration_id = $1 AND workspace_id = $2', [req.params.integrationId, ws]);
    // Not set up yet: refuse, so the gateway shows failing deliveries and retries them once it is.
    if (!src) throw new HttpError(409, 'not_set_up', `choose which contact detail ${LABEL[provider]} payments match on first (Contacts > Import > Payments)`);
    return tx(deps.pool, async q => {
      const m = await matchContact(q, ws, src.match_keys, paid!.references);
      const row = await one<{ id: string }>(q, `INSERT INTO contact_payment (workspace_id, integration_id, provider, ref, status, contact_id, reference_key, reference, amount_inr_milli, paid_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (workspace_id, provider, ref) DO NOTHING RETURNING id`,
        [ws, src.integration_id, provider, paid!.ref, m.status, m.status === 'matched' ? m.contactId : null, m.status === 'matched' ? m.key : null,
          m.status === 'matched' ? m.value : null, paid!.amountInrMilli, paid!.paidAt]);
      if (!row) return { status: 200, body: { duplicate: true, ref: paid!.ref } };
      const outcome = m.status === 'matched' ? await outcomeFor(q, src, m.contactId, paid!) : null;
      if (outcome) await q.query('UPDATE contact_payment SET outcome = $2 WHERE id = $1', [row.id, JSON.stringify(outcome)]);
      await appendAudit(q, { workspaceId: ws, actorType: 'system', actorId: `payments:${provider}`, action: 'contact.payment', objectType: 'contact_payment', objectId: row.id,
        payload: { provider, event: paid!.event, status: m.status, outcomeRecorded: outcome?.recorded ?? false } });
      return { status: 200, body: { status: m.status, ref: paid!.ref, ...(outcome ? { outcome: { recorded: outcome.recorded } } : {}) } };
    });
  }, { rawBody: true, limit: MAX_BODY });
}

// ---- tools --------------------------------------------------------------------------------------------------------------

const KEY = str({ pattern: /^[\p{L}\p{N}_ ]{1,60}$/u, desc: "a contact detail's name, e.g. policy_number, loan or order" });

export function registerPaymentTools(reg: Registry): void {
  reg.register(tool(obj({ integrationId: uuid(), matchKeys: arr(KEY, { min: 1, max: 5 }), outcome: opt(obj({ definitionId: uuid(), value: str({ min: 1, max: 60 }) })) },
    'matchKeys: the contact details a payment reference is matched against (e.g. policy_number). outcome: optionally, a verified outcome for a recent call of the person who paid.'), {
    name: 'source.payments.setup', risk: 'draft',
    summary: 'Turn on payment status from a connected Razorpay, Cashfree or PayU: which contact detail payments match on, and an optional verified outcome',
    run: async (ctx, i) => {
      const integ = await one<{ kind: string; name: string }>(ctx.q, "SELECT kind, name FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [i.integrationId, ctx.workspaceId]);
      if (!integ || !(PAYMENT_PROVIDERS as readonly string[]).includes(integ.kind)) throw new Error('connect Razorpay, Cashfree or PayU in Settings > Integrations first');
      if (i.outcome) {
        const d = await one<{ allowed_values: string[] }>(ctx.q, 'SELECT allowed_values FROM outcome_definition WHERE id = $1 AND workspace_id = $2', [i.outcome.definitionId, ctx.workspaceId]);
        if (!d) throw new Error('no such outcome in this workspace');
        if (!d.allowed_values.includes(i.outcome.value)) throw new Error(`"${i.outcome.value}" is not one of that outcome's values (${d.allowed_values.join(', ')})`);
      }
      const keys = [...new Set(i.matchKeys.map(attrKey))];
      await ctx.q.query(`INSERT INTO intake_payment_source (integration_id, workspace_id, provider, match_keys, outcome_definition_id, outcome_value) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (integration_id) DO UPDATE SET match_keys = EXCLUDED.match_keys, outcome_definition_id = EXCLUDED.outcome_definition_id, outcome_value = EXCLUDED.outcome_value, updated_at = now()
        WHERE intake_payment_source.workspace_id = EXCLUDED.workspace_id`,
        [i.integrationId, ctx.workspaceId, integ.kind, keys, i.outcome?.definitionId ?? null, i.outcome?.value ?? null]);
      return { integrationId: i.integrationId, provider: integ.kind, matchKeys: keys, hookPath: `/hooks/payments/${i.integrationId}`,
        note: `Add this address as the webhook in ${LABEL[integ.kind as PaymentProvider]}, for successful payments.` };
    },
  }));

  reg.register(tool(obj({}), {
    name: 'source.payments.list', risk: 'read',
    summary: 'Payment status sources (Razorpay, Cashfree, PayU), what they match on, and the payments of the last 30 days: matched to a person, or why not',
    run: async ctx => {
      const sources = await many<{ integration_id: string; provider: PaymentProvider; match_keys: string[]; outcome_value: string | null; name: string | null }>(ctx.q,
        `SELECT s.integration_id, s.provider, s.match_keys, s.outcome_value, i.name FROM intake_payment_source s LEFT JOIN integration i ON i.id = s.integration_id WHERE s.workspace_id = $1 ORDER BY s.created_at`, [ctx.workspaceId]);
      const recent = await many<{ provider: PaymentProvider; status: string; reference: string | null; amount_inr_milli: string | null; paid_at: Date; contact_id: string | null; name: string | null; outcome: unknown }>(ctx.q,
        `SELECT p.provider, p.status, p.reference, p.amount_inr_milli, p.paid_at, p.contact_id, c.name, p.outcome FROM contact_payment p LEFT JOIN contact c ON c.id = p.contact_id
         WHERE p.workspace_id = $1 AND p.received_at > now() - interval '30 days' ORDER BY p.received_at DESC LIMIT 50`, [ctx.workspaceId]);
      return {
        sources: sources.map(s => ({ integrationId: s.integration_id, provider: s.provider, label: LABEL[s.provider], name: s.name, matchKeys: s.match_keys, outcomeValue: s.outcome_value, hookPath: `/hooks/payments/${s.integration_id}` })),
        payments: recent.map(p => ({ provider: p.provider, status: p.status, reference: p.reference, amountInrMilli: p.amount_inr_milli === null ? null : Number(p.amount_inr_milli),
          paidAt: p.paid_at, contactId: p.contact_id, name: p.name, outcome: p.outcome })),
      };
    },
  }));
}

/** Unmatched and ambiguous payments are kept 30 days for a person to see why, then deleted; matched ones go with the contact. */
export const paymentRetentionJob: Job = {
  name: 'intake.payment_retention',
  dailyAtIst: '03:20',
  async run(deps) { await deps.pool.query("DELETE FROM contact_payment WHERE status <> 'matched' AND received_at < now() - interval '30 days'"); },
};
