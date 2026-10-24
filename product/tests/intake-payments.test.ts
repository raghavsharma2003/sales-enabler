// Payment webhooks (Razorpay, Cashfree, PayU): each verified with the gateway's own scheme, against fixtures shaped like the
// documented sample payloads (research/2026-10-24/payment-webhooks/README.md). No real gateway, account or key: secrets are
// generated here and the fixtures are signed with them. Synthetic people only (numbers 90000…).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createPool, one, many } from '../server/db.ts';
import { buildApp } from '../server/app.ts';
import type { Registry, Actor } from '../server/tools.ts';
import { module as intake, paidSinceImport } from '../server/modules/intake/index.ts';
import { module as workspace } from '../server/modules/workspace/index.ts';
import { seal } from '../server/modules/workspace/crypto.ts';
import { payuHash } from '../server/modules/intake/payments.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, reg: Registry, base = '', server: { close(): void } | undefined;

before(async () => {
  if (skip) return;
  process.env.VP_SECRET_KEY ??= randomBytes(32).toString('hex');   // a generated test value; integrations are sealed with it
  pool = createPool(URL_);
  const app = buildApp(pool, [intake, workspace]);
  reg = app.registry;
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  server = app.server;
});
after(async () => { server?.close(); await pool?.end(); });

const SECRETS = { razorpay: { webhook_secret: randomBytes(16).toString('hex') }, cashfree: { client_secret: randomBytes(16).toString('hex') },
  payu: { merchant_key: 'synthKey', salt: randomBytes(16).toString('hex') } };

async function world() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('payments test') RETURNING id"))!.id;
  const owner = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role, status) VALUES ($1,$2,'owner','active') RETURNING id", [ws, `p${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: owner, role: 'owner' };
  const call = (name: string, args: unknown) => reg.execute<any>(pool, name, args, { workspaceId: ws, actor });
  const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.equal(r.status, 'confirmed', `${name}: ${JSON.stringify(r)}`); return (r as any).result; };
  // A connected gateway as workspace's vault stores it (sealed), however the kind reached the list of integrations.
  const gateway = async (kind: keyof typeof SECRETS) => (await one<{ id: string }>(pool, `INSERT INTO integration (workspace_id, kind, name, status, secret_ciphertext, secret_keys)
    VALUES ($1,$2,$3,'connected',$4,$5) RETURNING id`, [ws, kind, `${kind} (synthetic)`, seal(ws, 'integration', JSON.stringify(SECRETS[kind])), Object.keys(SECRETS[kind])]))!.id;
  const importCsv = async (csv: string) => { const u = await ok('source.upload', { kind: 'csv', name: 'Renewals', text: csv }); return ok('source.commit', { uploadId: u.uploadId }); };
  const contact = async (e164: string) => (await one<{ id: string }>(pool, 'SELECT id FROM contact WHERE workspace_id = $1 AND e164 = $2', [ws, e164]))!.id;
  return { ws, owner, call, ok, gateway, importCsv, contact };
}
const post = (path: string, body: string, headers: Record<string, string>) => fetch(base + path, { method: 'POST', headers, body });
const rows = async (ws: string) => many<{ provider: string; status: string; contact_id: string | null; reference: string | null; amount_inr_milli: string; ref: string }>(pool,
  'SELECT provider, status, contact_id, reference, amount_inr_milli, ref FROM contact_payment WHERE workspace_id = $1 ORDER BY received_at', [ws]);

// Shaped like Razorpay's documented payment_link.paid sample (payment-links.md); amounts in paise.
function rzpLinkPaid(o: { payId: string; referenceId: string; paise: number; payerContact: string; notes?: unknown }) {
  const at = Math.floor(Date.now() / 1000);
  return JSON.stringify({ entity: 'event', account_id: 'acc_SYNTH', event: 'payment_link.paid', contains: ['payment_link', 'order', 'payment'], created_at: at,
    payload: {
      payment_link: { entity: { id: 'plink_SYNTH1', reference_id: o.referenceId, amount: o.paise, amount_paid: o.paise, currency: 'INR', status: 'paid', notes: o.notes ?? null, customer: { contact: '9000090000' } } },
      order: { entity: { id: 'order_SYNTH1', amount: o.paise, amount_paid: o.paise, receipt: o.referenceId, status: 'paid', notes: [] } },
      payment: { entity: { id: o.payId, entity: 'payment', amount: o.paise, currency: 'INR', status: 'captured', order_id: 'order_SYNTH1', method: 'upi', notes: [], contact: o.payerContact, created_at: at } },
    } });
}
const rzpSign = (body: string, secret = SECRETS.razorpay.webhook_secret) => ({ 'content-type': 'application/json', 'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex'), 'x-razorpay-event-id': 'evt_' + Math.random() });

test('Razorpay: a payment_link.paid signed with the webhook secret matches the one person whose policy number it carries; the gate sees it until a newer list; re-delivery is a no-op; a bad signature or an unset source changes nothing', { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Policy number,Renewal due\nAarti Sharma,9000000301,SH-2026-40110,01/11/2026\nRohan Das,9000000302,SH-2026-40117,02/11/2026\n');
  const aarti = await w.contact('+919000000301'), rohan = await w.contact('+919000000302');
  const id = await w.gateway('razorpay');
  const body = rzpLinkPaid({ payId: 'pay_SYNTH0001', referenceId: 'SH-2026-40110', paise: 1_425_000, payerContact: '+919000000302' });
  // Before it is set up: refused, so the gateway keeps retrying until it is.
  let r = await post(`/hooks/payments/${id}`, body, rzpSign(body));
  assert.equal(r.status, 409);
  const setup = await w.ok('source.payments.setup', { integrationId: id, matchKeys: ['Policy number'] });
  assert.deepEqual(setup.matchKeys, ['policy_number']);
  assert.equal(setup.hookPath, `/hooks/payments/${id}`);
  // A forged or altered body: refused, nothing stored.
  r = await post(`/hooks/payments/${id}`, body, rzpSign(body, 'not-the-secret'));
  assert.equal(r.status, 401);
  r = await post(`/hooks/payments/${id}`, body.replace('1425000', '1'), rzpSign(body));
  assert.equal(r.status, 401);
  assert.equal((await rows(w.ws)).length, 0);
  // The real one.
  r = await post(`/hooks/payments/${id}`, body, rzpSign(body));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'matched');
  const [p] = await rows(w.ws);
  assert.deepEqual([p.provider, p.status, p.contact_id, p.reference, Number(p.amount_inr_milli)], ['razorpay', 'matched', aarti, 'SH-2026-40110', 14_250_000], 'paise to inr_milli');
  assert.notEqual(p.contact_id, rohan, "matched on the policy number, never on the payer's phone (which is Rohan's here)");
  // The gate's question.
  const paid = await paidSinceImport(pool, w.ws, aarti);
  assert.ok(paid && paid.provider === 'razorpay' && paid.reference === 'SH-2026-40110' && paid.amount === 14_250_000 && paid.paidAt instanceof Date);
  assert.equal(await paidSinceImport(pool, w.ws, rohan), null);
  const other = await world();
  assert.equal(await paidSinceImport(pool, other.ws, aarti), null, 'scoped to the workspace');
  // The same delivery again: nothing new.
  r = await post(`/hooks/payments/${id}`, body, rzpSign(body));
  assert.equal((await r.json()).duplicate, true);
  assert.equal((await rows(w.ws)).length, 1);
  // A list exported before she paid but imported after still does not call her (the record is not a day newer).
  const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
  await w.importCsv(`Name,Mobile,Policy number,Updated at\nAarti Sharma,9000000301,SH-2026-40110,${soon}\n`);
  assert.ok(await paidSinceImport(pool, w.ws, aarti), 'a record only hours newer than the payment does not reopen her');
  // Next cycle: three days on, a new list of the policy (more than a day newer than the payment) opens Aarti to calls again.
  await pool.query("UPDATE contact_payment SET paid_at = paid_at - interval '3 days' WHERE workspace_id = $1", [w.ws]);
  await w.importCsv('Name,Mobile,Policy number\nAarti Sharma,9000000301,SH-2026-40110\n');
  assert.equal(await paidSinceImport(pool, w.ws, aarti), null, 'a record more than a day newer means a new cycle');
  // Not a payment: acknowledged and ignored.
  const authorized = JSON.stringify({ entity: 'event', event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_SYNTH9', status: 'authorized', amount: 100 } } } });
  r = await post(`/hooks/payments/${id}`, authorized, rzpSign(authorized));
  assert.equal((await r.json()).ignored, true);
  const audit = await one<{ n: string }>(pool, "SELECT count(*) AS n FROM audit_event WHERE workspace_id = $1 AND action = 'contact.payment'", [w.ws]);
  assert.equal(audit!.n, '1');
});

test('a matched payment becomes a verified outcome on the person\'s recent call, once; no recent call, no outcome, and the gate still stops the call', { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Loan\nNeha Chauhan,9000000311,L-3301\nGurdeep Singh,9000000312,L-3314\n');
  const neha = await w.contact('+919000000311'), gurdeep = await w.contact('+919000000312');
  const def = (await one<{ id: string }>(pool, "INSERT INTO outcome_definition (workspace_id, name, question, allowed_values, goal_values) VALUES ($1,'EMI','Did they pay the EMI?','{paid,promised,refused}','{paid}') RETURNING id", [w.ws]))!.id;
  const call = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, contact_id, channel, started_at) VALUES ($1,$2,'phone', now() - interval '2 days') RETURNING id", [w.ws, neha]))!.id;
  await pool.query("INSERT INTO conversation (workspace_id, contact_id, channel, started_at) VALUES ($1,$2,'phone', now() - interval '20 days')", [w.ws, gurdeep]);
  const id = await w.gateway('razorpay');
  assert.equal((await w.call('source.payments.setup', { integrationId: id, matchKeys: ['loan'], outcome: { definitionId: def, value: 'settled' } })).status, 'not_executed', 'only a value the outcome allows');
  await w.ok('source.payments.setup', { integrationId: id, matchKeys: ['loan'], outcome: { definitionId: def, value: 'paid' } });
  for (const [payId, ref] of [['pay_SYNTH0101', 'L-3301'], ['pay_SYNTH0102', 'L-3314']]) {
    const b = rzpLinkPaid({ payId, referenceId: 'x', paise: 348_000, payerContact: '+919000000999', notes: { loan: ref } });
    const r = await post(`/hooks/payments/${id}`, b, rzpSign(b));
    assert.equal((await r.json()).status, 'matched', `${ref}: matched through the payment link's notes`);
  }
  const outcomes = await many<{ conversation_id: string; value: string; grade: string; source: string }>(pool, 'SELECT conversation_id, value, grade, source FROM outcome WHERE workspace_id = $1', [w.ws]);
  assert.deepEqual(outcomes.map(o => [o.conversation_id, o.value, o.grade, o.source]), [[call, 'paid', 'verified', 'razorpay']]);
  const g = await one<{ outcome: { recorded: boolean; why?: string } }>(pool, "SELECT outcome FROM contact_payment WHERE workspace_id = $1 AND reference = 'L-3314'", [w.ws]);
  assert.deepEqual(g!.outcome, { recorded: false, why: 'no call in the 14 days before the payment' });
  assert.ok(await paidSinceImport(pool, w.ws, gurdeep), 'no outcome, but the gate still knows he paid');
});

test('Cashfree: Base64 HMAC of timestamp + body with the client secret; a timestamp older than five minutes is refused; order_id or order_tags match', { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Order\nHetal Shah,9000000321,A1043\nKavya Gowda,9000000322,A1044\n');
  const id = await w.gateway('cashfree');
  await w.ok('source.payments.setup', { integrationId: id, matchKeys: ['order'] });
  // Shaped like Cashfree's documented PAYMENT_SUCCESS sample (payloads-and-signatures.md).
  const body = (orderId: string, cf: number, tags: unknown = null) => JSON.stringify({ data: { order: { order_id: orderId, order_amount: 1890.0, order_currency: 'INR', order_tags: tags },
    payment: { cf_payment_id: cf, payment_status: 'SUCCESS', payment_amount: 1890.0, payment_currency: 'INR', payment_message: 'Transaction successful', payment_time: new Date().toISOString(), bank_reference: 'SYNTH123', auth_id: null, payment_method: { upi: { channel: 'collect', upi_id: 'synthetic@upi' } } },
    customer_details: { customer_name: 'Synthetic', customer_id: 'CUST-SYNTH', customer_email: 'synthetic@example.test', customer_phone: '9000000322' } }, event_time: new Date().toISOString(), type: 'PAYMENT_SUCCESS' });
  const sign = (b: string, ts: string, secret = SECRETS.cashfree.client_secret) => ({ 'content-type': 'application/json', 'x-webhook-timestamp': ts, 'x-webhook-signature': createHmac('sha256', secret).update(ts + b).digest('base64') });
  const now = String(Math.floor(Date.now() / 1000));
  let b = body('A1043', 9_000_001);
  let r = await post(`/hooks/payments/${id}`, b, sign(b, String(Math.floor(Date.now() / 1000) - 600)));
  assert.equal(r.status, 401, 'ten minutes old: a replay');
  r = await post(`/hooks/payments/${id}`, b, sign(b, now, 'wrong'));
  assert.equal(r.status, 401);
  r = await post(`/hooks/payments/${id}`, b, sign(b, now));
  assert.equal((await r.json()).status, 'matched');
  b = body('CF-ORDER-77', 9_000_002, { order: 'A1044' });
  r = await post(`/hooks/payments/${id}`, b, sign(b, String(Date.now())));          // a millisecond timestamp
  assert.equal((await r.json()).status, 'matched', 'order_tags carry the reference; a millisecond timestamp is read');
  const got = await rows(w.ws);
  assert.deepEqual(got.map(p => [p.reference, Number(p.amount_inr_milli), p.ref]), [['A1043', 1_890_000, '9000001'], ['A1044', 1_890_000, '9000002']]);
});

test('PayU: form POST verified by the reverse SHA-512 hash (with and without additional charges); a tampered amount, another merchant key or a failure changes nothing', { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Policy number\nSrinivas Reddy,9000000331,SH-2026-40124\n');
  const id = await w.gateway('payu');
  await w.ok('source.payments.setup', { integrationId: id, matchKeys: ['policy_number'] });
  // Shaped like PayU's documented "Payment Successful" form payload (webhook-events-and-sample-payloads.md).
  const form = (o: Record<string, string>) => {
    const f: Record<string, string> = { mihpayid: '27550000001', mode: 'UPI', status: 'success', key: SECRETS.payu.merchant_key, txnid: 'T-SYNTH-1', amount: '15625.00', addedon: '2026-10-24 14:46:09',
      productinfo: 'Renewal', firstname: 'Srinivas', email: 'synthetic@example.test', phone: '9000000331', udf1: 'SH-2026-40124', udf2: '', udf3: '', udf4: '', udf5: '', ...o };
    f.hash = payuHash(f, SECRETS.payu.salt);
    return f;
  };
  const enc = (f: Record<string, string>) => new URLSearchParams(f).toString();
  const H = { 'content-type': 'application/x-www-form-urlencoded' };
  const tampered = form({}); tampered.amount = '1.00';
  let r = await post(`/hooks/payments/${id}`, enc(tampered), H);
  assert.equal(r.status, 401, 'an altered amount fails the hash');
  r = await post(`/hooks/payments/${id}`, enc(form({ key: 'otherKey' })), H);
  assert.equal(r.status, 401, 'another merchant');
  r = await post(`/hooks/payments/${id}`, enc(form({ status: 'failure', mihpayid: '27550000002' })), H);
  assert.equal((await r.json()).ignored, true, 'a failed payment is acknowledged, not recorded');
  r = await post(`/hooks/payments/${id}`, enc(form({})), H);
  assert.equal((await r.json()).status, 'matched', 'udf1 carries the policy number');
  r = await post(`/hooks/payments/${id}`, enc(form({ mihpayid: '27550000003', additional_charges: '25.00' })), H);
  assert.equal(r.status, 200, 'the additional-charges form of the hash');
  const got = await rows(w.ws);
  assert.deepEqual(got.map(p => [p.ref, p.status, Number(p.amount_inr_milli)]), [['27550000001', 'matched', 15_625_000], ['27550000003', 'matched', 15_625_000]]);
  // The documented formula, spelled out once, against the helper.
  const f = form({});
  const manual = createHash('sha512').update([SECRETS.payu.salt, 'success', '', '', '', '', '', '', '', '', '', 'SH-2026-40124', f.email, f.firstname, f.productinfo, f.amount, f.txnid, f.key].join('|')).digest('hex');
  assert.equal(payuHash(f, SECRETS.payu.salt), manual);
});

test("matching is by the named record key only: two people sharing a reference is ambiguous, no reference is unmatched, and neither touches anyone's calls; tools refuse what is not a payment gateway", { skip }, async () => {
  const w = await world();
  await w.importCsv('Name,Mobile,Order\nAyesha Khan,9000000341,DUP-1\nImran Sheikh,9000000342,DUP-1\nJoseph Thomas,9000000343,SOLO-9\n');
  const id = await w.gateway('razorpay');
  await w.ok('source.payments.setup', { integrationId: id, matchKeys: ['order'] });
  const send = async (payId: string, ref: string, payer: string) => { const b = rzpLinkPaid({ payId, referenceId: ref, paise: 100_00, payerContact: payer }); return (await post(`/hooks/payments/${id}`, b, rzpSign(b))).json(); };
  assert.equal((await send('pay_SYNTH0201', 'DUP-1', '+919000000341')).status, 'ambiguous');
  assert.equal((await send('pay_SYNTH0202', 'NOPE-0', '+919000000343')).status, 'unmatched', "Joseph's phone paid, but the reference is not his record");
  for (const e of ['+919000000341', '+919000000342', '+919000000343']) assert.equal(await paidSinceImport(pool, w.ws, await w.contact(e)), null);
  const list = await w.ok('source.payments.list', {});
  assert.deepEqual(list.sources.map((s: any) => [s.provider, s.matchKeys]), [['razorpay', ['order']]]);
  assert.deepEqual(list.payments.map((p: any) => p.status).sort(), ['ambiguous', 'unmatched']);
  const slack = (await one<{ id: string }>(pool, "INSERT INTO integration (workspace_id, kind, name, status) VALUES ($1,'slack','Team chat','connected') RETURNING id", [w.ws]))!.id;
  assert.match((await w.call('source.payments.setup', { integrationId: slack, matchKeys: ['order'] }) as any).reason, /connect Razorpay, Cashfree or PayU/);
  const theirs = await world();
  assert.equal((await theirs.call('source.payments.setup', { integrationId: id, matchKeys: ['order'] })).status, 'not_executed', "another workspace's gateway");
  assert.equal((await post(`/hooks/payments/${randomBytes(16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}`, '{}', {})).status, 404);
});
