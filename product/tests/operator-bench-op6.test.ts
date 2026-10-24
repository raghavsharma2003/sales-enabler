// Fixes from the op6 Operator bench (research/2026-10-24/benches-op6/), on the REAL modules with a scripted model.
// Each failed on the code before its fix. Synthetic data only; fresh workspace per test. Skipped without DATABASE_URL.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm, type LlmReply, type LlmRequest } from '../server/llm.ts';
import { modules } from '../server/modules/index.ts';
import { checkReply, claimsChange } from '../server/modules/operator/check.ts';
import { asksFor, memberRupees, spendMismatch } from '../server/modules/operator/loop.ts';

const URL_ = process.env.DATABASE_URL;
const skip = !URL_ ? 'DATABASE_URL not set' : false;
let pool: pg.Pool;
let base = '';
let close: () => Promise<void>;

before(async () => {
  if (skip) return;
  process.env.VP_DEV_AUTH = '1';
  pool = createPool(URL_);
  const app = buildApp(pool, modules);
  await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = async () => { app.server.close(); app.server.closeAllConnections?.(); };
});
afterEach(() => setFakeLlm(null));
after(async () => { setFakeLlm(null); await close?.(); await pool?.end(); });

async function owner() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Synthetic Lending') RETURNING id"))!.id;
  await pool.query('INSERT INTO wallet (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [ws]);
  const member = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1,$2,'owner') RETURNING id", [ws, `o${Math.random()}@example.test`]))!.id;
  return { ws, member };
}
async function turn(m: string, body: Record<string, unknown>) {
  const h = { 'content-type': 'application/json', 'x-vp-dev-member': m };
  const id = (await (await fetch(base + '/v1/operator/threads', { method: 'POST', headers: h, body: '{}' })).json()).thread.id;
  const text = await (await fetch(base + `/v1/operator/threads/${id}/messages`, { method: 'POST', headers: h, body: JSON.stringify(body) })).text();
  return text.split('\n\n').filter(Boolean).map(f => ({ event: /^event: (.+)$/m.exec(f)?.[1] ?? '', data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? 'null') }));
}
function script(steps: ((req: LlmRequest) => Partial<LlmReply>)[]) {
  const seen: LlmRequest[] = [];
  let i = 0;
  setFakeLlm(req => {
    seen.push(structuredClone(req));
    return { text: '', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, model: 'scripted', provider: 'fake', ...steps[Math.min(i++, steps.length - 1)]!(req) };
  });
  return seen;
}
const call = (name: string, args: unknown) => ({ id: 'c' + Math.random().toString(36).slice(2), name, args: JSON.stringify(args) });
const lastTool = (req: LlmRequest, tool: string) => req.messages.filter(m => m.role === 'tool' && m.content.includes(`source="tool:${tool}"`)).pop()?.content ?? '';

test('money: the member\'s amounts parse (₹2,000, ₹2 lakh, 2,00,000, ₹1.5 crore, 5k)', () => {
  assert.deepEqual(memberRupees('Raise the daily cap to ₹2,000.'), [2000]);
  assert.deepEqual(memberRupees('Top up the wallet with ₹2 lakh'), [200_000]);
  assert.deepEqual(memberRupees('top up 2,00,000'), [200_000]);
  assert.deepEqual(memberRupees('add ₹1.5 crore'), [15_000_000]);
  assert.deepEqual(memberRupees('cap it at 5k'), [5000]);
  assert.deepEqual(memberRupees('launch it for 50 people', false), [], 'bare numbers are not rupees outside the money tools');
});

test('money: a card amount 10x, 100x or 1000x off (or a tenth) is caught; the matching amount passes', () => {
  const asked = 'Raise the daily cap to ₹2,000.';
  for (const wrong of [20_000_000, 200_000_000, 2_000_000_000, 200_000]) {
    const r = spendMismatch('cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: wrong }, asked);
    assert.ok(r, `${wrong} should be caught`);
    assert.match(r!, /the client asked for ₹2,000\. Send capInrMilli: 2000000\. No card was made\./);
  }
  assert.equal(spendMismatch('cap.raise', { capInrMilli: 2_000_000 }, asked), null);
  assert.equal(spendMismatch('wallet.topup', { inrMilli: 200_000_000 }, 'Top up the wallet with ₹2 lakh'), null);
  assert.ok(spendMismatch('wallet.topup', { inrMilli: 5_000_000 }, 'Top up the wallet with ₹50,000'), 'op6 mini r2 ref-topup');
  assert.ok(spendMismatch('cap.raise', { capInrMilli: 2_000_000 }, 'Raise the cap a bit'), 'no amount named: the model must ask, not choose');
});

test('money: a wrong-amount spend card is never made; the model is told both figures; the retry makes the right card', { skip }, async () => {
  const { ws, member } = await owner();
  const seen = script([
    () => ({ toolCalls: [call('cap_raise', { scope: 'workspace', period: 'daily', capInrMilli: 200_000 })] }),
    () => ({ toolCalls: [call('cap_raise', { scope: 'workspace', period: 'daily', capInrMilli: 2_000_000 })] }),
    () => ({ text: 'A ₹2,000 daily cap is waiting for your approval on the card.' }),
  ]);
  const f = await turn(member, { text: 'Raise the daily cap to ₹2,000.', page: '/settings' });
  const refused = lastTool(seen[1]!, 'cap.raise');
  assert.match(refused, /NOT DONE/);
  assert.match(refused, /the card would be for ₹200 .* but the client asked for ₹2,000\. Send capInrMilli: 2000000/);
  const actions = await pool.query("SELECT args->>'capInrMilli' AS cap FROM action WHERE workspace_id = $1 AND tool = 'cap.raise'", [ws]);
  assert.deepEqual(actions.rows.map(r => r.cap), ['2000000'], 'only the right card exists');
  assert.ok(!f.some(x => x.event === 'notice'), 'the correct reply is not corrected');
});

test('money: the member\'s own figure is kept when only a read result (not a card) carries an amount', () => {
  // op6 mini r2 multi-cap-balance: the wallet result carried money, so the member's ₹200 cap was flagged.
  assert.equal(checkReply({ text: 'Your daily cap is now ₹200 and your balance is ₹120.', wrote: true, proposed: false, pendingInThread: false,
    facts: [{ balanceInrMilli: 120_000, state: 'low' }], userText: 'Set a ₹200 daily cap and tell me my balance.', toolCalls: 2 }), null);
  // A card still holds the reply: "₹2,000" next to a ₹200 card is corrected.
  assert.equal(checkReply({ text: 'I asked to raise the daily cap to ₹2,000.', wrote: false, proposed: true, pendingInThread: false,
    facts: [{ card: true, summary: 'Raise the daily workspace cap to ₹200', args: { capInrMilli: 200_000 } }], userText: 'Raise the daily cap to ₹2,000.', toolCalls: 1 })?.kind, 'number');
});

test('window: "move", "shift" and "change" ask for whichever of narrow or widen the new window needs', () => {
  for (const text of ['Move the calling window for this campaign to 11 am to 7 pm.', 'Shift the window to 9 to 5', 'Change the calling hours to 10-6']) {
    assert.ok(asksFor('campaign.window.widen', text) && asksFor('campaign.window.narrow', text), text);
  }
  assert.ok(!asksFor('campaign.window.widen', 'How is the campaign doing?'));
});

test('claims: read answers are not changes ("20 calls have been made"), real claims still are', () => {
  for (const t of ['You have made 20 calls so far.', '20 calls have been made.', '20 calls have been made so far.', 'Suggested cap set at ₹100.',
    'Estimated cost ₹9.61 to ₹24.02 (incl. GST), with a suggested cap set at ₹100.']) assert.ok(!claimsChange(t, false), t);
  for (const t of ["Draft agent created for EMI due reminders… it's not live yet.", "I've made the change.", 'The agent is now set to speak Hindi.', "I've updated the window."])
    assert.ok(claimsChange(t, false), t);
});

test('money: no amount named means no money card (the model must ask); "step 1" and other counts are not rupees', () => {
  assert.match(spendMismatch('cap.raise', { scope: 'workspace', period: 'daily', capInrMilli: 2_000_000 }, 'Raise the cap a bit')!,
    /capInrMilli: the client has not said how much\. Ask them for the amount in rupees; never choose one yourself\. No card was made\./);
  assert.ok(spendMismatch('wallet.topup', { inrMilli: 500_000 }, 'Please top up my wallet'));
  assert.equal(spendMismatch('wallet.topup', { inrMilli: 500_000 }, 'Please top up my wallet with ₹500'), null);
  // The web's "Ask the assistant to fix it" sentence (e2e flow): "step 1" is not ₹1; the ₹ figure in the label counts.
  assert.equal(spendMismatch('cap.raise', { capInrMilli: 20_000_000 }, 'Fix step 1 of the plan: Raise a spending limit: daily spending limit of ₹20,000'), null);
  assert.deepEqual(memberRupees('Fix step 1 of the plan'), []);
  assert.deepEqual(memberRupees('Launch it for 50 people at 11 am for 3 days'), []);
  assert.deepEqual(memberRupees('raise the cap to 2000'), [2000]);
  // A campaign's own cap is not one of the money tools: with no ₹ figure, nothing is compared.
  assert.equal(spendMismatch('campaign.launch', { id: 'x', capInrMilli: 100_000 }, 'Launch the campaign'), null);
});
