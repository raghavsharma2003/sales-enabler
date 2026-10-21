// End-to-end integration test: one synthetic home-services business goes from sign-up to an analysed call, through the
// real HTTP API of the whole control plane (every module in server/modules/index.ts). Skipped when DATABASE_URL is unset.
//
// What is real: buildApp(pool, modules), POST /v1/signup, the session cookie, POST /v1/tools/:name, POST
// /v1/actions/:id/decide, POST /hooks/runtime with signed bytes, the campaigns dispatcher tick(), the calls analysis
// queue, memory.extract, the kernel jobs. What is faked: the voice runtime (FakeRuntime via setRuntime), the model
// (setFakeLlm), the carrier (FakeTelephony) and the payment gateway (FakeGateway). Every person, number and brand here is
// synthetic; phones are in the 90000000xx test range.
//
// Honesty rule: where the product cannot do a step through its API, the step is a `todo` subtest that asserts what SHOULD
// happen, with the reason. Where the flow must cross such a gap to reach later steps, the test does it with one labelled
// BRIDGE (a direct write that stands in for an event VP has no way to receive), never by loosening an assertion.
import { test, before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';

process.env.NODE_ENV = 'test';
process.env.VP_RUNTIME_SECRET = 'e2e-runtime-secret-' + randomBytes(24).toString('hex');   // test-only, never printed

import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import type { Job } from '../server/jobs.ts';
import { setFakeLlm, type LlmRequest } from '../server/llm.ts';
import { FakeRuntime, setRuntime, sign } from '../server/runtime-client.ts';
import type { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { analysesSettled, sweep } from '../server/modules/calls/analysis.ts';
import { tick } from '../server/modules/campaigns/worker.ts';
import { A2P_DUE } from '../server/modules/campaigns/defaults.ts';
import { FakeTelephony, setTelephony } from '../server/modules/campaigns/telephony.ts';
import { FakeGateway, RazorpayGateway, setGateway } from '../server/modules/money/gateway.ts';
import type { CallTicket, RuntimeEvent } from '../shared/runtime-protocol.ts';
import { getStack } from '../shared/stacks.ts';
import { Client, signup, type Receipt } from './workspace-helpers.ts';

const DATABASE = process.env.DATABASE_URL;
const skip = !DATABASE ? 'DATABASE_URL not set' : false;
const SECRET = process.env.VP_RUNTIME_SECRET!;

// ---- clock: a Monday-Saturday 11:00 IST that is not a national holiday and not before real time -----------------------
const IST = 330 * 60_000;
const HOLIDAYS_FIXED = ['01-26', '08-15', '10-02'], HOLIDAYS_DATED = ['2026-11-08', '2027-10-29', '2028-10-17'];
function serviceSlotAfter(after: number, hh = 11): Date {
  for (let k = 0; k < 30; k++) {
    const d = new Date(after + IST + k * 864e5);
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const at = day + hh * 3600_000 - IST;
    const ymd = new Date(day).toISOString().slice(0, 10);
    if (at <= after || new Date(day).getUTCDay() === 0 || HOLIDAYS_FIXED.includes(ymd.slice(5)) || HOLIDAYS_DATED.includes(ymd)) continue;
    return new Date(at);
  }
  throw new Error('no service slot in 30 days');
}
const CLOCK = serviceSlotAfter(Date.now() + 2 * 60_000);          // first dispatch: 11:00 IST
const LATER = new Date(CLOCK.getTime() + 3 * 3600_000);          // 14:00 IST the same day: past the 120-minute per-number gap
const A2P_CLOCK = serviceSlotAfter(Math.max(Date.now() + 2 * 60_000, new Date(A2P_DUE).getTime()));

// ---- synthetic people and transcripts ------------------------------------------------------------------------------
const PEOPLE = [
  { name: 'Ravi Testkumar', phone: '9000000021', job: 'AC gas refill on 14 Oct' },
  { name: 'Sunita Testwala', phone: '9000000022', job: 'AC PCB repair on 15 Oct' },
  { name: 'Imran Testkhan', phone: '9000000023', job: 'AC fan motor on 16 Oct' },
];
const CSV = ['name,mobile,consent,job', ...PEOPLE.map(p => `${p.name},${p.phone},yes,${p.job}`)].join('\n');
const e164 = (p: string) => '+91' + p;

const CALL_A: { speaker: 'agent' | 'caller'; text: string; startMs: number; endMs: number }[] = [
  { speaker: 'agent', text: 'Namaste, main Meher bol rahi hoon Thanda Cool se, main ek AI assistant hoon. Aapke AC repair ke baare mein do minute baat karni thi.', startMs: 0, endMs: 5200 },
  { speaker: 'caller', text: 'Haan ji, boliye.', startMs: 5600, endMs: 6800 },
  { speaker: 'agent', text: 'Repair ke baad AC theek se cooling kar raha hai? Yeh repair 30 din ki free service warranty mein hai.', startMs: 7200, endMs: 12000 },
  { speaker: 'caller', text: 'Haan, ab cooling bilkul theek hai, thank you.', startMs: 12500, endMs: 15200 },
  { speaker: 'agent', text: 'Badhiya. Garmi mein har do hafte filter saaf kar dijiye, cooling steady rahegi.', startMs: 15800, endMs: 20500 },
  { speaker: 'caller', text: 'Theek hai. Aur agli baar call karna ho toh shaam 7 baje ke baad karna, din mein office hota hai.', startMs: 21000, endMs: 26500 },
  { speaker: 'agent', text: 'Bilkul, shaam 7 ke baad hi call karenge. Dhanyavaad, aapka din achha ho!', startMs: 27000, endMs: 31000 },
];
const CALL_B: typeof CALL_A = [
  { speaker: 'agent', text: 'Namaste, main Meher, Thanda Cool ki AI assistant. Aapke AC repair ke baare mein call kiya tha.', startMs: 0, endMs: 4800 },
  { speaker: 'caller', text: 'Dekhiye, mujhe ab is baare mein koi call nahi chahiye.', startMs: 5300, endMs: 8200 },
  { speaker: 'agent', text: 'Samajh gayi, disturb karne ke liye maafi.', startMs: 8600, endMs: 10400 },
  { speaker: 'caller', text: 'Please dobara call mat karna.', startMs: 10800, endMs: 12600 },
  { speaker: 'agent', text: 'Theek hai, aapko ab call nahi karenge. Dhanyavaad.', startMs: 13000, endMs: 15500 },
];
const FABRICATED_QUOTE = 'AC ab ekdum thanda kar raha hai';          // not in the transcript: analysis must drop it
const MEMORY_QUOTE = 'shaam 7 baje ke baad karna';

// ---- the scripted model --------------------------------------------------------------------------------------------
const llmLog: { purpose: string; json: boolean }[] = [];
function fakeModel(req: LlmRequest) {
  llmLog.push({ purpose: req.purpose, json: !!req.json });
  const user = req.messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  let out: unknown = {};
  if (req.purpose === 'analysis') {
    if (user.includes('ab cooling bilkul theek hai')) out = {
      points: [
        { claim: 'The AC is cooling properly since the repair.', quote: 'ab cooling bilkul theek hai' },
        { claim: 'The caller prefers calls after 7 pm.', quote: MEMORY_QUOTE },
        { claim: 'The caller praised the cooling.', quote: FABRICATED_QUOTE },
      ],
      moments: [{ kind: 'commitment', quote: 'shaam 7 ke baad hi call karenge', note: 'agreed to call after 7 pm' }],
      reasonCode: 'CONV_GOAL_DONE', outcome: { value: 'working', quote: 'ab cooling bilkul theek hai' }, forget: null,
    };
    else if (user.includes('dobara call mat karna')) out = {
      points: [{ claim: 'The caller asked not to be called again.', quote: 'dobara call mat karna' }],
      moments: [{ kind: 'opt_out', quote: 'dobara call mat karna', note: 'asked not to be called again' }],
      reasonCode: 'CONV_NOT_INTERESTED', outcome: null, forget: null,
    };
  } else if (req.purpose === 'memory') {
    if (user.includes(MEMORY_QUOTE)) out = { facts: [
      { kind: 'preference', key: 'best_time', value: 'after 7 pm', quote: MEMORY_QUOTE, basis: 'consent', retention: 'call_to_call' },
    ] };
    else out = { facts: [] };
  }
  return { text: JSON.stringify(out), toolCalls: [], usage: { inputTokens: 120, outputTokens: 60 }, model: 'fake-e2e', provider: 'fake' };
}

// ---- harness -------------------------------------------------------------------------------------------------------
let pool: pg.Pool;
let base = '';
let registry: Registry;
let jobs: Job[];
let closeServer: () => Promise<void>;
const rt = new FakeRuntime();

before(async () => {
  if (skip) return;
  pool = createPool(DATABASE);
  const app = buildApp(pool, modules);
  registry = app.registry; jobs = app.jobs;
  await new Promise<void>(res => app.server.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  closeServer = async () => { app.server.close(); app.server.closeAllConnections?.(); };
  setRuntime(rt);
  setFakeLlm(fakeModel);
  setTelephony(new FakeTelephony());
  setGateway(new FakeGateway());
});
after(async () => {
  setFakeLlm(null); setRuntime(null); setTelephony(null); setGateway(new RazorpayGateway());
  await closeServer?.();
  await pool?.end();
});

function confirmed(r: Receipt, what: string): any {
  assert.equal(r?.status, 'confirmed', `${what}: expected a confirmed receipt, got ${JSON.stringify(r).slice(0, 600)}`);
  return r.result;
}

async function hook(body: string, signature?: string): Promise<{ status: number; body: any }> {
  const r = await fetch(base + '/hooks/runtime', { method: 'POST', body,
    headers: { 'content-type': 'application/json', 'x-vp-signature': signature ?? sign(SECRET, body) } });
  const text = await r.text();
  let parsed: any = text; try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body: parsed };
}

const now = () => new Date().toISOString();
const manifestFor = (t: CallTicket) => {
  const s = getStack(t.stack.id)!;
  return { combinationId: t.stack.combinationId, stackId: t.stack.id, agentVersionHash: t.agent.versionHash,
    components: { stt: s.components.ears, llm: s.components.brain, tts: s.components.voice }, fallbacksUsed: [], memory: t.contact.memoryStatus,
    runtimeVersion: 'fake-runtime-e2e/1' };
};

/** The ticket must obey shared/runtime-protocol.ts CallTicket, field by field. */
function assertTicketShape(t: CallTicket) {
  const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
  assert.equal(t.protocol, 1);
  assert.ok(isUuid(t.conversationId), 'conversationId');
  assert.ok(isUuid(t.attemptId), 'attemptId is set on a campaign dial');
  assert.ok(isUuid(t.workspaceId), 'workspaceId');
  assert.equal(t.direction, 'outbound');
  assert.equal(t.transport.kind, 'sip');
  if (t.transport.kind === 'sip') {
    assert.match(t.transport.to, /^\+91\d{10}$/); assert.match(t.transport.from, /^\+91\d{10}$/); assert.ok(t.transport.trunk);
  }
  assert.equal(t.agent.schema, 1);
  assert.ok(t.agent.versionHash && t.agent.version >= 1, 'a published, numbered agent');
  assert.ok(t.brief && typeof t.brief.text === 'string' && t.brief.text.length > 0, 'brief.text present');
  assert.equal(t.brief.bytes, Buffer.byteLength(t.brief.text, 'utf8'), 'brief.bytes is the byte length of brief.text');
  assert.equal(t.brief.hash, createHash('sha256').update(t.brief.text).digest('hex'), 'brief.hash is sha256(brief.text)');
  assert.ok(getStack(t.stack.id), 'the stack is a known stack');
  assert.ok(t.stack.combinationId.startsWith('v2|'), 'combinationId');
  assert.equal(typeof t.contact.displayName, 'string');
  assert.equal(typeof t.contact.timezone, 'string');
  assert.equal(typeof t.contact.facts, 'object');
  assert.ok(['loaded', 'none', 'not_loaded_timeout', 'disabled'].includes(t.contact.memoryStatus), 'memoryStatus set');
  assert.ok(Buffer.byteLength(t.contact.memoryBrief, 'utf8') <= 1200, 'memoryBrief <= 1200 bytes');
  assert.ok(['consent', 'contract', 'legitimate_use', 'inbound'].includes(t.consent.basis), 'consent basis');
  assert.ok(Number.isInteger(t.limits.maxDurationS) && t.limits.maxDurationS > 0, 'limits.maxDurationS');
  assert.ok(Number.isInteger(t.limits.maxCostInrMilli) && t.limits.maxCostInrMilli > 0, 'limits.maxCostInrMilli');
  assert.equal(t.test, false);
}

// ---- the flow ------------------------------------------------------------------------------------------------------
test('e2e: a home-services business goes from sign-up to an analysed call through the HTTP API', { skip, timeout: 180_000 }, async t => {
  const failed = new Set<string>();
  const step = async (id: string, name: string, needs: string[], fn: () => Promise<void>) => {
    const blocked = needs.filter(n => failed.has(n));
    if (blocked.length) { failed.add(id); await t.test(`${id}. ${name}`, { skip: `needs step ${blocked.join(', ')}, which failed` }, () => {}); return; }
    await t.test(`${id}. ${name}`, async () => { try { await fn(); } catch (e) { failed.add(id); throw e; } });
  };
  /** A claim the product should meet but cannot yet: asserted as it should be, reported as todo with the reason. */
  const todo = async (id: string, name: string, reason: string, needs: string[], fn: () => Promise<void>) => {
    const blocked = needs.filter(n => failed.has(n));
    if (blocked.length) { await t.test(`${id}. ${name}`, { skip: `needs step ${blocked.join(', ')}, which failed` }, () => {}); return; }
    await t.test(`${id}. ${name}`, { todo: reason }, fn);
  };

  const s: Record<string, any> = {};
  let owner!: Client;

  await step('1', 'sign up, set the brand with a DLT entity id, top up the wallet through an approved payment', [], async () => {
    owner = await signup({ base } as any, 'Thanda Cool Services (synthetic)');
    assert.ok(owner.workspaceId && owner.memberId, 'signed up');
    const me = await owner.fetch('GET', '/v1/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.member.role, 'owner');

    const brand = confirmed(await owner.tool('brand.update', { legalName: 'Thanda Cool Services Pvt Ltd (synthetic)', sector: 'home_services',
      dltEntityId: 'DLT-SYN-E2E-0001', tone: 'warm, practical, never pushy' }), 'brand.update');
    assert.equal(brand.brand.dltEntityId, 'DLT-SYN-E2E-0001');

    const card = await owner.tool('wallet.topup', { inrMilli: 2_000_000 });
    assert.equal(card.status, 'needs_approval', 'a top-up is spend: it needs a tap');
    assert.equal(card.risk, 'spend');
    const paid = confirmed((await owner.fetch('POST', `/v1/actions/${card.actionId}/decide`, { approve: true })).body, 'wallet.topup approve');
    assert.equal(paid.status, 'credited');
    const w = confirmed(await owner.tool('wallet.get'), 'wallet.get');
    assert.equal(w.balanceInrMilli, 2_000_000);
    assert.equal(w.heldInrMilli, 0);
    s.balance0 = w.balanceInrMilli;
  });

  await step('2', 'pick a template, create the agent, choose a stack (no default), publish and deploy on campaign', ['1'], async () => {
    const tl = confirmed(await owner.tool('template.list'), 'template.list');
    const tpl = tl.templates.find((x: any) => x.industry === 'home services' && x.category === 'service');
    assert.ok(tpl, 'a non-insurance home-services template exists');
    assert.notEqual(tpl.industry, 'insurance');
    const ag = confirmed(await owner.tool('agent.create', { name: 'AC repair follow-up', templateId: tpl.id }), 'agent.create');
    assert.equal(ag.stackChosen, false, 'a template chooses no stack');
    assert.equal(ag.draft.voice.stackId, '');
    s.agentId = ag.agentId;

    // Publishing without a stack is refused on approval: there is no default to fall back to.
    const early = await owner.run('version.publish', { agentId: s.agentId, draftHash: ag.draftHash });
    assert.equal(early.status, 'not_executed', 'publish without a stack is refused');
    assert.match(early.reason, /stack/i);

    const sl = confirmed(await owner.tool('stack.list'), 'stack.list');
    assert.equal(sl.default, null, 'stack.list has no default');
    const pick = sl.stacks.find((x: any) => x.id === 'v2-flashlite' && x.status === 'available');
    assert.ok(pick, 'v2-flashlite is offered');
    const set = confirmed(await owner.tool('stack.set', { agentId: s.agentId, stackId: pick.id }), 'stack.set');
    assert.equal(set.stack.id, 'v2-flashlite');
    assert.equal(set.compiles, true, 'the draft compiles once a stack is chosen');
    s.stackId = pick.id;

    const pub = await owner.tool('version.publish', { agentId: s.agentId, draftHash: set.draftHash, note: 'first live version' });
    assert.equal(pub.status, 'needs_approval');
    const v = confirmed((await owner.fetch('POST', `/v1/actions/${pub.actionId}/decide`, { approve: true })).body, 'version.publish approve');
    assert.equal(v.number, 1);
    s.versionId = v.versionId; s.versionHash = v.versionHash; s.briefHash = v.brief.hash;

    const dep = await owner.tool('deployment.split', { agentId: s.agentId, binding: 'campaign', split: [{ versionId: s.versionId, percent: 100 }] });
    assert.equal(dep.status, 'needs_approval');
    const d = confirmed((await owner.fetch('POST', `/v1/actions/${dep.actionId}/decide`, { approve: true })).body, 'deployment.split approve');
    assert.equal(d.binding, 'campaign');
    s.deploymentId = d.deploymentId;
    const vl = confirmed(await owner.tool('version.list', { agentId: s.agentId }), 'version.list');
    assert.equal(vl.versions[0].brief_hash, s.briefHash);
  });

  await step('3', 'get a calling line: search, rent (approved), submit KYC (approved)', ['1'], async () => {
    const found = confirmed(await owner.tool('number.search', { series: 'ten_digit', limit: 3 }), 'number.search');
    assert.ok(found.offers.length > 0);
    const offer = found.offers[0];
    assert.match(offer.e164, /^\+9190000000\d\d$/, 'synthetic test-range number');
    const rent = await owner.tool('number.rent', { offerRef: offer.ref, displayName: 'Thanda Cool main' });
    assert.equal(rent.status, 'needs_approval', 'renting is spend');
    const rented = confirmed((await owner.fetch('POST', `/v1/actions/${rent.actionId}/decide`, { approve: true })).body, 'number.rent approve');
    assert.equal(rented.series, 'ten_digit');
    s.numberId = rented.numberId; s.lineE164 = offer.e164;
    const kyc = await owner.tool('number.kyc.submit', { numberId: s.numberId, documents: [{ kind: 'gst_certificate', ref: 'doc:synthetic-gst-1' }] });
    assert.equal(kyc.status, 'needs_approval');
    const k = confirmed((await owner.fetch('POST', `/v1/actions/${kyc.actionId}/decide`, { approve: true })).body, 'number.kyc.submit approve');
    assert.equal(k.kycStatus, 'submitted');
    const pack = confirmed(await owner.tool('a2p.declaration.export', { format: 'json' }), 'a2p.declaration.export');
    assert.equal(pack.dltEntityId, 'DLT-SYN-E2E-0001');
    assert.equal(pack.lines.length, 1);
  });

  await step('4', 'import 3 synthetic contacts with consent (upload, map, commit) and make an audience', ['1'], async () => {
    const up = confirmed(await owner.tool('source.upload', { kind: 'csv', name: 'AC repairs October', filename: 'repairs.csv', text: CSV }), 'source.upload');
    assert.equal(up.status, 'received');
    const map = confirmed(await owner.tool('source.map', { uploadId: up.uploadId }), 'source.map');
    assert.equal(map.rowsTotal, 3);
    assert.equal(map.phones.ok, 3);
    assert.deepEqual(map.columns.map((c: any) => c.field), ['name', 'phone', 'consent', 'attribute']);
    assert.ok(map.preview.every((p: any) => p.verdict === 'new' && p.flags.includes('consent_yes')));
    const com = confirmed(await owner.tool('source.commit', { uploadId: up.uploadId, consentPurpose: 'service' }), 'source.commit');
    assert.equal(com.counts.new, 3);
    assert.equal(com.counts.consent_rows, 3);

    const list = confirmed(await owner.tool('contact.list', { limit: 10 }), 'contact.list');
    s.contacts = PEOPLE.map(p => list.contacts.find((c: any) => c.e164 === e164(p.phone)));
    assert.ok(s.contacts.every(Boolean), 'all three imported');
    const aud = confirmed(await owner.tool('audience.create', { name: 'October AC repairs', contactIds: s.contacts.map((c: any) => c.id) }), 'audience.create');
    assert.equal(aud.members, 3);
    s.audienceId = aud.audienceId;
    const pv = confirmed(await owner.tool('audience.preview', { audienceId: s.audienceId }), 'audience.preview');
    assert.equal(pv.callable, 3);
    const one0 = confirmed(await owner.tool('contact.get', { id: s.contacts[0].id }), 'contact.get');
    assert.equal(one0.consent.length, 1);
    assert.equal(one0.consent[0].purpose, 'service');
    assert.ok(one0.attributes.some((a: any) => a.key === 'job' && a.value === PEOPLE[0].job), 'the job column is stored as an attribute');
  });

  // ---- the line is not dialable through the API alone ----
  s.probeDialled = new Set<string>();
  const probe = async (contactIdx: number, at: Date) => {
    const before = rt.tickets.length;
    const r = await owner.run('call.place_single', { contactId: s.contacts[contactIdx].id, agentVersionId: s.versionId, category: 'service' });
    const attemptId = confirmed(r, 'call.place_single').attemptId;
    await tick({ pool, registry, workspaceId: owner.workspaceId, now: () => at });
    const a = confirmed(await owner.tool('attempt.list', { contactId: s.contacts[contactIdx].id }), 'attempt.list').attempts.find((x: any) => x.id === attemptId);
    if (rt.tickets.length > before) s.probeDialled.add(s.contacts[contactIdx].id);
    return a;
  };

  await todo('3b', 'a rented line whose KYC was submitted through the API passes the dial gate (G8)',
    'no tool or route sets phone_number.kyc_status = \'verified\' (number.kyc.submit stops at \'submitted\'; there is no carrier KYC callback), so G8 refuses every production dial with kyc_lapsed',
    ['2', '3', '4'], async () => {
      const a = await probe(2, CLOCK);
      assert.notEqual(a.status, 'blocked', `the gate blocked the dial: ${a.blocked_by} (${JSON.stringify(a.precheck.trace?.at(-1))})`);
    });

  await step('3c', 'BRIDGE: stand in for the carrier\'s KYC approval, which VP has no way to receive', ['3'], async () => {
    // The only direct write in the flow. It replaces an external event (the carrier verifying the documents), not a step
    // the customer takes; see finding F1.
    const r = await pool.query("UPDATE phone_number SET kyc_status = 'verified' WHERE id = $1 AND workspace_id = $2 AND kyc_status = 'submitted'", [s.numberId, owner.workspaceId]);
    assert.equal(r.rowCount, 1);
  });

  await todo('3d', `after the A2P deadline (${A2P_DUE.slice(0, 10)}) a line can still be declared through the API and dialled`,
    'no tool sets phone_number.a2p_status = \'declared\' (a2p.declaration.export only exports the pack); from the deadline G8 refuses every non-trial line with cli_undeclared',
    ['2', '3c', '4'], async () => {
      const a = await probe(2, A2P_CLOCK);
      assert.notEqual(a.status, 'blocked', `the gate blocked the dial on ${A2P_CLOCK.toISOString()}: ${a.blocked_by}`);
    });

  if (CLOCK.getTime() >= new Date(A2P_DUE).getTime()) {
    await step('3e', 'BRIDGE: stand in for the A2P declaration (the test clock is past the deadline)', ['3c'], async () => {
      await pool.query("UPDATE phone_number SET a2p_status = 'declared', a2p_ref = 'synthetic-a2p-1' WHERE id = $1", [s.numberId]);
    });
  }

  await step('5', 'draft a service campaign with a window open at the test clock, estimate it, set the cap, launch (approved)', ['2', '3c', '4'], async () => {
    const window = { days: [1, 2, 3, 4, 5, 6], ranges: [{ start: '10:00', end: '19:00' }] };
    const dr = confirmed(await owner.tool('campaign.draft', { name: 'October repair follow-ups', category: 'service', agentVersionId: s.versionId,
      audienceId: s.audienceId, window }), 'campaign.draft');
    s.campaignId = dr.id;
    const est = confirmed(await owner.tool('campaign.estimate', { id: s.campaignId }), 'campaign.estimate');
    assert.equal(est.people, 3);
    assert.ok(est.perMinuteInrMilli > 0 && est.suggestedCapInrMilli > 0);
    assert.notEqual(est.basis, 'assumption, no history: VP preset priors', 'the per-minute rate comes from money.estimate for the chosen stack');
    s.estimate = est;
    const blocked = confirmed(await owner.tool('campaign.get', { id: s.campaignId }), 'campaign.get');
    assert.deepEqual(blocked.blockers.map((b: any) => b.code), ['no_cap'], 'only the cap is missing before launch');
    confirmed(await owner.tool('campaign.draft', { id: s.campaignId, name: 'October repair follow-ups', category: 'service', window,
      capInrMilli: est.suggestedCapInrMilli }), 'campaign.draft (cap)');
    const def = confirmed(await owner.tool('outcome.define', { name: 'Repair outcome', question: 'Is the AC working since the repair?',
      allowedValues: ['working', 'not_working', 'unclear'], goalValues: ['working'], campaignId: s.campaignId }), 'outcome.define');
    s.outcomeDefinitionId = def.outcomeDefinitionId;
    const ready = confirmed(await owner.tool('campaign.get', { id: s.campaignId }), 'campaign.get');
    assert.deepEqual(ready.blockers, []);
    const launch = await owner.tool('campaign.launch', { id: s.campaignId });
    assert.equal(launch.status, 'needs_approval', 'a launch reaches people: it needs a tap');
    const l = confirmed((await owner.fetch('POST', `/v1/actions/${launch.actionId}/decide`, { approve: true })).body, 'campaign.launch approve');
    assert.equal(l.state, 'running');
    assert.equal(l.queued, 3);
  });

  await step('6', 'one dispatcher tick inside the window dials the audience; each CallTicket obeys the runtime protocol', ['5'], async () => {
    const before = rt.tickets.length;
    const rep = await tick({ pool, registry, workspaceId: owner.workspaceId, now: () => CLOCK });
    const tickets = rt.tickets.slice(before);
    const expectC = !s.probeDialled.has(s.contacts[2].id);   // a probe that dialled C would hold C back 120 minutes (G7)
    assert.equal(rep.dispatched, expectC ? 3 : 2, `tick report ${JSON.stringify(rep)}`);
    assert.equal(tickets.length, rep.dispatched);
    const ver = await one<{ config: { brief: { text: string; hash: string } } }>(pool, 'SELECT config FROM agent_version WHERE id = $1', [s.versionId]);
    const perMinute = confirmed(await owner.tool('money.estimate', { stackId: s.stackId, minutes: 3, calls: 1 }), 'money.estimate').perMinuteInrMilli;
    s.tickets = {};
    for (const tk of tickets) {
      assertTicketShape(tk);
      assert.equal(tk.workspaceId, owner.workspaceId);
      assert.equal(tk.brief.text, ver!.config.brief.text, 'brief.text is agent_version.config.brief.text, byte for byte');
      assert.equal(tk.brief.hash, s.briefHash);
      assert.equal(tk.stack.id, s.stackId, 'the stack the user chose');
      assert.equal(tk.agent.voice.stackId, s.stackId);
      assert.equal(tk.agent.versionHash, s.versionHash);
      assert.equal(tk.contact.memoryStatus, 'none', 'memory.brief ran and found nothing yet');
      assert.equal(tk.limits.maxDurationS, 180, 'the template limit (180 s) under the campaign policy');
      assert.equal(tk.limits.maxCostInrMilli, 3 * perMinute, 'the G9 hold: 3 minutes at the money.estimate rate');
      assert.equal(tk.transport.kind === 'sip' && tk.transport.from, s.lineE164, 'presented from the rented line');
      assert.equal(tk.consent.basis, 'consent');
      assert.ok(tk.consent.recordId, 'the consent record that allowed the call');
      const who = PEOPLE.findIndex(p => tk.transport.kind === 'sip' && tk.transport.to === e164(p.phone));
      assert.ok(who >= 0);
      assert.equal(tk.contact.displayName, PEOPLE[who].name);
      s.tickets[who] = tk;
    }
    assert.ok(s.tickets[0] && s.tickets[1], 'Ravi and Sunita were dialled');
    const att = confirmed(await owner.tool('attempt.list', { campaignId: s.campaignId }), 'attempt.list');
    const a0 = att.attempts.find((a: any) => a.contact_id === s.contacts[0].id);
    assert.equal(a0.status, 'dialing');
    assert.equal(a0.conversation_id, s.tickets[0].conversationId);
    assert.ok(a0.precheck.trace.every((c: any) => c.ok), 'every gate passed');
    if (CLOCK.getTime() < new Date(A2P_DUE).getTime()) assert.ok(a0.precheck.warnings.some((w: string) => /A2P/.test(w)), 'the undeclared-A2P warning is on the precheck');
    const w = confirmed(await owner.tool('wallet.get'), 'wallet.get');
    assert.equal(w.heldInrMilli, tickets.reduce((n, tk) => n + tk.limits.maxCostInrMilli, 0), 'one hold per dial');
  });

  await todo('6b', 'per-contact facts from the imported file reach the ticket (template fact "job" is perContact)',
    'campaigns/worker.ts buildTicket fills ticket.contact.facts from attempt.facts and contact.custom, but intake stores imported columns in the attribute table and never writes contact.custom',
    ['6'], async () => {
      assert.equal(s.tickets[0].contact.facts.job, PEOPLE[0].job);
    });

  await todo('6c', 'the campaign dials through its "campaign" deployment (deployment.split decides where a version runs)',
    'nothing writes campaign.deployment_id, so worker.ts resolveVersion never reads the deployment that deployment.split created; the pinned agentVersionId alone decides',
    ['6'], async () => {
      const c = await one<{ deployment_id: string | null }>(pool, 'SELECT deployment_id FROM campaign WHERE id = $1', [s.campaignId]);
      assert.equal(c!.deployment_id, s.deploymentId);
    });

  await step('7', 'the runtime reports call A over the signed hook: started, Hinglish turns, costs, ended; replay is idempotent; bad signatures get 401', ['6'], async () => {
    const tk: CallTicket = s.tickets[0];
    const m = manifestFor(tk);
    let seq = 0;
    const turns: RuntimeEvent[] = CALL_A.map(l => ({ seq: ++seq + 1, type: 'turn', at: now(), speaker: l.speaker, text: l.text, startMs: l.startMs, endMs: l.endMs, latencyMs: 700 }));
    const costs: RuntimeEvent[] = [
      { seq: 20, type: 'cost', at: now(), component: 'telephony', provider: 'fake-carrier', quantity: 32, unit: 'second', inrMilli: 380 },
      { seq: 21, type: 'cost', at: now(), component: 'ears', provider: 'gemini', quantity: 31, unit: 'second', inrMilli: 120 },
      { seq: 22, type: 'cost', at: now(), component: 'brain', provider: 'gemini-3.5-flash-lite', quantity: 9000, unit: 'token', inrMilli: 90 },
      { seq: 23, type: 'cost', at: now(), component: 'voice', provider: 'gemini-lite', quantity: 410, unit: 'char', inrMilli: 210 },
    ];
    s.costA = costs.reduce((n, c) => n + (c.type === 'cost' ? c.inrMilli : 0), 0);
    assert.ok(s.costA < tk.limits.maxCostInrMilli, 'precondition: the call costs less than its hold');
    const b1 = JSON.stringify({ protocol: 1, conversationId: tk.conversationId, events: [{ seq: 1, type: 'call.started', at: now(), manifest: m }, ...turns, ...costs] });
    const b2 = JSON.stringify({ protocol: 1, conversationId: tk.conversationId, events: [{ seq: 30, type: 'call.ended', at: now(), endReason: 'completed', durationS: 31,
      transcript: CALL_A.map(l => ({ speaker: l.speaker, text: l.text, startMs: l.startMs })), manifest: m }] });

    // Signatures first: none of these may change anything.
    assert.equal((await hook(b1, sign('a-different-secret-that-is-long-enough-0123', b1))).status, 401, 'wrong secret');
    assert.equal((await hook(b1.replace('Haan ji', 'Haan ji '), sign(SECRET, b1))).status, 401, 'body changed after signing');
    assert.equal((await hook(b1, sign(SECRET, b1, Date.now() - 6 * 60_000))).status, 401, 'stale timestamp');
    assert.equal((await hook(b1, 'v1=deadbeef')).status, 401, 'malformed header');

    const r1 = await hook(b1);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual(r1.body, { accepted: 1 + CALL_A.length + costs.length, duplicates: 0 });
    const r2 = await hook(b2);
    assert.deepEqual(r2.body, { accepted: 1, duplicates: 0 });
    const w1 = confirmed(await owner.tool('wallet.get'), 'wallet.get');

    // Replays (a runtime retry) change nothing: no new turns, no new cost lines, no second settlement.
    const r3 = await hook(b1), r4 = await hook(b2);
    assert.deepEqual(r3.body, { accepted: 0, duplicates: 1 + CALL_A.length + costs.length });
    assert.deepEqual(r4.body, { accepted: 0, duplicates: 1 });
    const w2 = confirmed(await owner.tool('wallet.get'), 'wallet.get');
    assert.equal(w2.balanceInrMilli, w1.balanceInrMilli, 'a replay never re-charges');
    assert.equal(w2.balanceInrMilli, s.balance0 - s.costA, 'call A is charged exactly its cost lines');
    const c = confirmed(await owner.tool('call.get', { conversationId: tk.conversationId }), 'call.get');
    assert.equal(c.turns.length, CALL_A.length);
    assert.equal(c.cost.lines.filter((l: any) => l.component !== 'analysis').length, costs.length);
    assert.equal(c.cost.totalInrMilli, s.costA);
    assert.equal(c.flags.includes('cost_after_end'), false);

    // Call C did not pick up: the runtime reports no_answer with no cost, so the hold goes back untouched.
    if (s.tickets[2]) {
      const tc: CallTicket = s.tickets[2];
      const rc = await hook(JSON.stringify({ protocol: 1, conversationId: tc.conversationId, events: [{ seq: 1, type: 'call.ended', at: now(), endReason: 'no_answer',
        durationS: 0, transcript: [], manifest: manifestFor(tc) }] }));
      assert.deepEqual(rc.body, { accepted: 1, duplicates: 0 });
    }
  });

  await step('8', 'post-call work runs (analysis, memory.extract, learning.check) and the results show through the tools', ['7'], async () => {
    await analysesSettled();
    // The kernel jobs that own post-call work are wired. Their bodies act on every workspace in the database, so on the
    // shared suite database they are run here scoped to this workspace (the sweep's own option; learning.check's loop
    // filtered to this workspace), so this file's scripted model never analyses another suite's calls.
    for (const name of ['calls.analysis_sweep', 'learning.check']) assert.ok(jobs.find(j => j.name === name), `${name} is a registered job`);
    assert.deepEqual(await sweep(pool, registry, { olderThanMs: 0, workspaceId: owner.workspaceId }), { analysed: 0 }, 'the in-process queue already analysed every ended call');
    const running = confirmed(await owner.tool('experiment.list', { agentId: s.agentId }), 'experiment.list').filter((e: any) => e.state === 'running');
    for (const e of running) confirmed(await registry.execute(pool, 'experiment.check', { experimentId: e.id }, { workspaceId: owner.workspaceId!, actor: { type: 'system', id: 'learning.check' } }) as Receipt, 'experiment.check');
    assert.ok(llmLog.some(l => l.purpose === 'analysis' && l.json), 'the analysis model was asked for JSON');
    assert.ok(llmLog.some(l => l.purpose === 'memory' && l.json), 'the memory model was asked for JSON');

    const tk: CallTicket = s.tickets[0];
    const c = confirmed(await owner.tool('call.get', { conversationId: tk.conversationId }), 'call.get');
    assert.equal(c.status, 'done');
    assert.equal(c.campaignId, s.campaignId);
    assert.equal(c.agentVersionId, s.versionId, 'filed under the version that ran');
    assert.equal(c.endReason, 'completed');
    assert.deepEqual(c.transcript.map((l: any) => l.text), CALL_A.map(l => l.text));
    assert.equal(c.runManifest.stackId, s.stackId);
    assert.equal(c.runManifest.test, false);
    assert.equal(c.analysis.status, 'done');
    assert.equal(c.analysis.reasonCode, 'CONV_GOAL_DONE');
    assert.equal(c.reason.code, 'CONV_GOAL_DONE');
    assert.equal(c.analysis.quotesProposed, 5);
    assert.equal(c.analysis.quotesDropped, 1, 'the fabricated quote was dropped');
    assert.ok(c.flags.includes('quotes_dropped'));
    assert.equal(c.analysis.points.length, 2);
    for (const p of c.analysis.points) assert.ok(CALL_A.some(l => l.text.includes(p.quote)), `"${p.quote}" is an exact substring of a line`);
    assert.ok(!c.analysis.points.some((p: any) => p.quote === FABRICATED_QUOTE));
    assert.deepEqual(c.analysis.outcomeGuess, { value: 'working', quote: 'ab cooling bilkul theek hai' });
    assert.equal(c.outcomes.length, 1);
    assert.equal(c.outcomes[0].grade, 'ai_guess');
    assert.equal(c.outcome, null, 'an uncalibrated judge\'s guess does not count as the outcome');
    assert.equal(c.analysis.judge.calibration, 'uncalibrated');
    assert.equal(c.analysis.followups['memory.extract'], 'done');
    assert.equal(c.analysis.followups['experiment.check'], 'no running experiment');
    assert.equal(c.cost.settlement.action, 'settled');
    assert.equal(c.cost.settlement.inrMilli, s.costA);

    // A manager's label is the outcome that counts.
    confirmed(await owner.tool('outcome.label', { conversationId: tk.conversationId, definitionId: s.outcomeDefinitionId, value: 'working' }), 'outcome.label');
    assert.equal(confirmed(await owner.tool('call.get', { conversationId: tk.conversationId }), 'call.get').outcome, 'working');

    const f = confirmed(await owner.tool('campaign.funnel', { campaignId: s.campaignId }), 'campaign.funnel');
    s.funnel8 = f;
    const dialled = Object.keys(s.tickets).length;
    assert.equal(f.total.dialled, dialled);
    assert.equal(f.byVersion.length, 1);
    assert.equal(f.byVersion[0].agentVersionId, s.versionId);
    assert.equal(f.total.talked, 1, 'call A talked (10 s+ and a caller turn)');
    assert.equal(f.total.goalReached, 1);
    assert.equal(f.total.goalByGrade.manager, 1);
    assert.deepEqual(f.goalValues, ['working']);

    const u = confirmed(await owner.tool('usage.get', { groupBy: 'component' }), 'usage.get');
    const byComp = Object.fromEntries(u.map((x: any) => [x.key, x.costInrMilli]));
    assert.deepEqual({ telephony: byComp.telephony, ears: byComp.ears, brain: byComp.brain, voice: byComp.voice }, { telephony: 380, ears: 120, brain: 90, voice: 210 });
    const inv = confirmed(await owner.tool('invoice.get'), 'invoice.get');
    assert.equal(inv.costInrMilli, s.costA);
    assert.equal(inv.moneyIn[0].inrMilli, 2_000_000);
    const byCampaign = confirmed(await owner.tool('usage.get', { groupBy: 'campaign' }), 'usage.get campaign');
    assert.equal(byCampaign.find((x: any) => x.campaignId === s.campaignId)?.costInrMilli, s.costA);

    const w = confirmed(await owner.tool('wallet.get'), 'wallet.get');
    assert.equal(w.balanceInrMilli, s.balance0 - s.costA, 'A settled at its cost; C released');
    assert.equal(w.heldInrMilli, s.tickets[1].limits.maxCostInrMilli, 'only call B (still live) holds money');
    const rec = confirmed(await owner.tool('money.reconcile'), 'money.reconcile');
    assert.deepEqual(rec.drift, [], 'settled charges equal the metered cost lines');

    if (s.tickets[2]) {
      // C did not pick up: after analysis calls hands the no_answer to the campaigns retry ladder (A3), 180 minutes on.
      const cAtt = confirmed(await owner.tool('attempt.list', { contactId: s.contacts[2].id }), 'attempt.list').attempts;
      const first = cAtt.find((a: any) => a.conversation_id === s.tickets[2].conversationId);
      assert.equal(first.status, 'no_answer');
      const retry = cAtt.find((a: any) => a.retry_of === first.id);
      assert.ok(retry, 'a retry attempt was scheduled by the ladder');
      assert.equal(retry.kind, 'retry');
      assert.equal(new Date(retry.scheduled_for).getTime(), new Date(first.dialed_at).getTime() + 180 * 60_000);
    }

    const mem = confirmed(await owner.tool('contact.memory.get', { contactId: s.contacts[0].id }), 'contact.memory.get');
    assert.equal(mem.facts.length, 1);
    const fact = mem.facts[0];
    assert.equal(fact.key, 'best_time');
    assert.equal(fact.value, 'after 7 pm');
    assert.equal(fact.quote, MEMORY_QUOTE);
    assert.equal(fact.purpose, 'service');
    assert.equal(fact.status, 'active');
    assert.equal(fact.usable, false, 'pending: inside its undo window');
    assert.ok(new Date(fact.undoUntil).getTime() > Date.now());
    s.factId = fact.id;
    // A person ends the undo window early; the fact becomes usable for the next call.
    confirmed(await owner.tool('fact.approve', { factId: s.factId }), 'fact.approve');
    const mem2 = confirmed(await owner.tool('contact.memory.get', { contactId: s.contacts[0].id }), 'contact.memory.get');
    assert.equal(mem2.facts[0].usable, true);

    const audit = await owner.fetch('GET', '/v1/audit/verify');
    assert.deepEqual(audit.body, { intact: true, firstBroken: null });
  });

  await todo('8b', 'the funnel does not count a dial that is still live (no answer reported yet) as connected',
    'calls/stats.ts campaignFunnel counts end_reason IS NULL as connected, so call B (dispatched, nothing reported yet) is counted connected while it may still be ringing',
    ['8'], async () => {
      assert.equal(s.funnel8.total.connected, 1, 'only call A had connected (C did not pick up; B was still live)');
    });

  await step('9', 'opt-out: caller B says "dobara call mat karna"; B is suppressed (A3) and a later tick refuses to dial B at G4', ['6', '7'], async () => {
    const tk: CallTicket = s.tickets[1];
    const m = manifestFor(tk);
    let seq = 1;
    const events: RuntimeEvent[] = [{ seq: 1, type: 'call.started', at: now(), manifest: m },
      ...CALL_B.map(l => ({ seq: ++seq, type: 'turn' as const, at: now(), speaker: l.speaker, text: l.text, startMs: l.startMs, endMs: l.endMs })),
      { seq: 20, type: 'moment', at: now(), kind: 'opt_out', atMs: 10800, note: 'caller asked not to be called again' },
      { seq: 21, type: 'cost', at: now(), component: 'telephony', provider: 'fake-carrier', quantity: 16, unit: 'second', inrMilli: 190 },
      { seq: 22, type: 'call.ended', at: now(), endReason: 'opt_out', durationS: 16, transcript: CALL_B.map(l => ({ speaker: l.speaker, text: l.text, startMs: l.startMs })), manifest: m }];
    const r = await hook(JSON.stringify({ protocol: 1, conversationId: tk.conversationId, events }));
    assert.deepEqual(r.body, { accepted: events.length, duplicates: 0 });
    await analysesSettled();

    const ct = confirmed(await owner.tool('contact.get', { id: s.contacts[1].id }), 'contact.get');
    assert.equal(ct.suppressions.length, 1, 'suppressed once, workspace-wide');
    assert.ok(ct.consent.some((x: any) => x.purpose === 'all' && x.granted === false), 'a consent withdrawal was appended');
    const c = confirmed(await owner.tool('call.get', { conversationId: tk.conversationId }), 'call.get');
    assert.equal(c.reason.code, 'END_OPTED_OUT', 'the engine\'s opt-out reason stands; the model cannot override it');
    assert.ok(c.flags.includes('opt_out'));
    const acts = confirmed(await owner.tool('activity.list', { actionPrefix: 'contact.suppress_after_opt_out' }), 'activity.list').items;
    assert.equal(acts.length, 1, 'suppressed once');
    assert.equal(acts[0].actor.type, 'system', 'VP itself suppressed (A3), no person had to approve');
    const waiting = await owner.fetch('GET', '/v1/actions?status=proposed');
    assert.ok(!waiting.body.actions.some((x: any) => x.tool === 'contact.suppress_after_opt_out'), 'no approval card was raised for it');
    const w9 = confirmed(await owner.tool('wallet.get'), 'wallet.get');
    assert.equal(w9.balanceInrMilli, s.balance0 - s.costA - 190, 'B settled at its one cost line');
    assert.equal(w9.heldInrMilli, 0, 'no call is live, nothing is held');
    const f9 = confirmed(await owner.tool('campaign.funnel', { campaignId: s.campaignId }), 'campaign.funnel');
    assert.equal(f9.total.connected, 2, 'A and B connected; C did not pick up');
    assert.equal(f9.total.talked, 2);

    // A person tries to call B (and A) again later the same day.
    const again = async (idx: number) => confirmed(await owner.run('call.place_single', { contactId: s.contacts[idx].id, agentVersionId: s.versionId, category: 'service' }), 'call.place_single').attemptId;
    const aB = await again(1), aA = await again(0);
    const before = rt.tickets.length;
    await tick({ pool, registry, workspaceId: owner.workspaceId, now: () => LATER });
    const list = confirmed(await owner.tool('attempt.list', { limit: 50 }), 'attempt.list').attempts;
    const b = list.find((x: any) => x.id === aB);
    assert.equal(b.status, 'blocked');
    assert.equal(b.precheck.gate, 'G4');
    assert.equal(b.precheck.outcome, 'blocked');
    assert.match(b.blocked_by, /^suppressed:/);
    s.blockedCode = b.blocked_by;
    assert.ok(!rt.tickets.slice(before).some(x => x.transport.kind === 'sip' && x.transport.to === e164(PEOPLE[1].phone)), 'no ticket for B');

    // A's follow-up dials with what A said on the first call.
    const a = list.find((x: any) => x.id === aA);
    assert.equal(a.status, 'dialing', `A's follow-up: ${a.blocked_by ?? ''}`);
    const ta = rt.tickets.slice(before).find(x => x.conversationId === a.conversation_id)!;
    assertTicketShape(ta);
    assert.equal(ta.contact.memoryStatus, 'loaded');
    assert.match(ta.contact.memoryBrief, /best_time=after 7 pm/);

    const audit2 = await owner.fetch('GET', '/v1/audit/verify');
    assert.deepEqual(audit2.body, { intact: true, firstBroken: null });
  });

  await todo('9b', 'the G4 code for an in-call opt-out is the stable "suppressed:in_call"',
    'intake contact.suppress_after_opt_out writes suppression.source = \'call:<conversationId>\', so gate.ts G4 reports suppressed:call:<uuid>, a per-call code instead of a source',
    ['9'], async () => {
      assert.equal(s.blockedCode, 'suppressed:in_call');
    });
});
