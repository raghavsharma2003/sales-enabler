// Company data end to end, on a synthetic company (tests/fixtures/company.ts): a website read with robots.txt obeyed, a
// page cap and a timeout; a PDF brochure; an offerings sheet as CSV and Excel; facts proposed with their passage and
// approved or rejected in bulk; prices and dates only from the sheet (HV law 22); what the agent may say and why not;
// which fact a practice-chat sentence used; and the honest safe line when a reply cannot be made safe.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { buildApp } from '../server/app.ts';
import { createPool, one } from '../server/db.ts';
import { setFakeLlm } from '../server/llm.ts';
import type { Registry, Actor, Receipt } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { crawl, robotsAllows, robotsRules, siteUrl } from '../server/modules/workspace/site.ts';
import { factUses, proseExclusion, statements } from '../shared/company-facts.ts';
import { BROCHURE, SHEET_CSV, sheetXlsx, startSite } from './fixtures/company.ts';

const skip = !process.env.DATABASE_URL ? 'DATABASE_URL not set' : false;
let pool: pg.Pool, registry: Registry, site: Awaited<ReturnType<typeof startSite>>;
before(async () => {
  process.env.VP_FETCH_ALLOW_PRIVATE = '1';
  site = await startSite();
  if (!skip) { pool = createPool(); registry = buildApp(pool, modules).registry; }
});
after(async () => { site.server.closeAllConnections(); site.server.close(); delete process.env.VP_FETCH_ALLOW_PRIVATE; await pool?.end(); });
afterEach(() => setFakeLlm(null));

function ok<O = any>(r: Receipt<O>): O {
  assert.equal(r.status, 'confirmed', JSON.stringify(r));
  return (r as { result: O }).result;
}
async function workspace() {
  const ws = (await one<{ id: string }>(pool, "INSERT INTO workspace (name) VALUES ('Nirmal Water Purifiers') RETURNING id"))!.id;
  const m = (await one<{ id: string }>(pool, "INSERT INTO member (workspace_id, email, role) VALUES ($1, $2, 'owner') RETURNING id", [ws, `n${Math.random()}@example.test`]))!.id;
  const actor: Actor = { type: 'member', id: m, role: 'owner' };
  // An action that needs a person's approval is approved by the owner, as they would on the approval sheet.
  const call = async <O = any>(name: string, args: unknown): Promise<Receipt<O>> => {
    const r = await registry.execute<O>(pool, name, args, { workspaceId: ws, actor });
    return r.status === 'needs_approval' ? registry.approve<O>(pool, (r as { actionId: string }).actionId, { workspaceId: ws, memberId: m }) : r;
  };
  return { ws, call };
}

// ------------------------------------------------------------------------------------------------ pure parts

test('robots.txt: our group or *, longest rule wins, Allow on a tie, wildcards', () => {
  const r = robotsRules('User-agent: *\nDisallow: /private/\nAllow: /private/open\nDisallow: /*.cgi$\n\nUser-agent: OtherBot\nDisallow: /');
  assert.equal(robotsAllows(r, '/about'), true);
  assert.equal(robotsAllows(r, '/private/x'), false);
  assert.equal(robotsAllows(r, '/private/open/page'), true);
  assert.equal(robotsAllows(r, '/run.cgi'), false);
  assert.equal(robotsAllows(robotsRules('User-agent: VyaktiBot\nDisallow: /\n\nUser-agent: *\nAllow: /'), '/'), false, 'a group naming us wins over *');
});

test('a private address is refused unless a test or dev server allows it', () => {
  delete process.env.VP_FETCH_ALLOW_PRIVATE;
  try {
    for (const u of ['http://127.0.0.1/', 'http://localhost:8080', 'http://10.0.0.5', 'http://router.local/']) assert.throws(() => siteUrl(u), /private network/, u);
    assert.throws(() => siteUrl('ftp://example.com'), /only http and https/);
    assert.equal(siteUrl('nirmal-purifiers.example').href, 'https://nirmal-purifiers.example/', 'a bare name reads as https');
  } finally { process.env.VP_FETCH_ALLOW_PRIVATE = '1'; }
});

test('prices and dates in prose are excluded with the reason; statements are whole sentences', () => {
  assert.match(proseExclusion('AquaPure Gold is now just ₹12,999 for a limited time only.')!, /price/);
  assert.match(proseExclusion('The offer is valid till 31 March for new customers.')!, /date/);
  assert.match(proseExclusion('We have served Pune homes since 2009.')!, /date/);
  assert.equal(proseExclusion('Filters should be changed every six months.'), null);
  assert.deepEqual(statements('Home About Service Plans\nEvery purifier comes with free installation by a trained technician. Call us?'),
    ['Every purifier comes with free installation by a trained technician.']);
});

test('fact uses: a repeated number or most of a fact\'s words; never a loose match', () => {
  const facts = [{ key: 'price', value: 'AquaPure Gold, price: ₹12,999', source: 'kb:a' }, { key: 'install', value: 'Every purifier comes with free installation by a trained technician.', source: 'kb:b' },
    { key: 'hours', value: 'Our helpline is open Monday to Saturday.', source: 'kb:c' }];
  assert.deepEqual(factUses('Gold plan 12999 rupaye ka hai.', facts).map(f => f.key), ['price']);
  assert.deepEqual(factUses('Installation free hai, trained technician aake purifier lagayega.', facts).map(f => f.key), ['install']);
  assert.deepEqual(factUses('Aapka din kaisa raha?', facts), []);
});

test('crawl: same site only, robots.txt obeyed, page cap, a page that never answers is skipped in time', async () => {
  const r = await crawl(site.base + '/', { maxPages: 10, pageMs: 800, totalMs: 10_000 });
  const read = r.pages.map(p => new URL(p.url).pathname).sort();
  assert.deepEqual(read, ['/', '/about', '/plans', '/service']);
  assert.ok(r.skipped.some(s => s.url.endsWith('/internal/staff') && /robots/.test(s.reason)), JSON.stringify(r.skipped));
  assert.ok(r.skipped.some(s => s.url.endsWith('/slow') && /in time/.test(s.reason)), JSON.stringify(r.skipped));
  assert.ok(!site.hits.includes('/internal/staff'), 'a disallowed page is never requested');
  assert.ok(!r.pages.some(p => /elsewhere\.example/.test(p.url)), 'an off-site link is not followed');
  assert.ok(!r.pages.some(p => /var t=1|Copyright/.test(p.text)), 'scripts, navigation and footers are not company facts');
  assert.equal(r.robots, 'found');
  const capped = await crawl(site.base + '/', { maxPages: 2, pageMs: 800 });
  assert.deepEqual([capped.pages.length, capped.stoppedBy], [2, 'page_cap']);
});

// ------------------------------------------------------------------------------------------------ tools

test('website: facts proposed with their passage; prose prices and dates excluded and cannot be approved; bulk approve fills "Company information"', { skip }, async () => {
  const { call } = await workspace();
  const s = ok(await call('knowledge.ingest_site', { url: site.base + '/', maxPages: 6 }));
  assert.equal(s.pagesRead, 4);
  assert.ok(s.proposed >= 5 && s.excluded >= 3, JSON.stringify(s));
  const facts = ok(await call('knowledge.fact.list', { sourceId: s.sourceId })).facts;
  const install = facts.find((f: { text: string }) => /free installation/.test(f.text));
  assert.equal(install.status, 'pending');
  assert.ok(!facts.some((f: { text: string }) => /\b(we|our|us)\b/i.test(f.text)), 'no proposal reads as a line in the first person');
  assert.match(install.location.url, /\/$/);
  assert.equal(install.sourceTitle, 'Nirmal Water Purifiers, Pune');
  const price = facts.find((f: { text: string }) => /12,999/.test(f.text));
  assert.deepEqual([price.status, price.reason], ['excluded', 'It states a price or an amount. Prices come only from an offerings sheet.']);
  const refusal = await call('knowledge.fact.decide', { factIds: [price.id], decision: 'approved' });
  assert.equal(refusal.status, 'not_executed');
  assert.match((refusal as { reason: string }).reason, /only from an offerings sheet/);
  const pending = facts.filter((f: { status: string }) => f.status === 'pending');
  const d = ok(await call('knowledge.fact.decide', { factIds: pending.map((f: { id: string }) => f.id), decision: 'approved' }));
  assert.equal(d.updated, pending.length);
  assert.deepEqual(d.offerings.map((o: { name: string }) => o.name), ['Company information']);
  const off = ok(await call('offering.list', {})).offerings.find((o: { name: string }) => o.name === 'Company information');
  assert.equal(off.facts.length, pending.length);
  // Reject one again: it leaves the offering.
  ok(await call('knowledge.fact.decide', { factIds: [install.id], decision: 'rejected' }));
  const off2 = ok(await call('offering.list', {})).offerings.find((o: { name: string }) => o.name === 'Company information');
  assert.equal(off2.facts.length, pending.length - 1);
  assert.ok(!off2.facts.some((f: { text: string }) => /free installation/.test(f.text)));
  // Same site again: nothing duplicated.
  assert.equal(ok(await call('knowledge.ingest_site', { url: site.base + '/', maxPages: 6 })).duplicate, true);
});

test('a PDF brochure: facts proposed from its page', { skip }, async () => {
  const { call } = await workspace();
  const r = ok(await call('knowledge.ingest', { filename: 'care-guide.pdf', contentBase64: BROCHURE.toString('base64') }));
  assert.equal(r.format, 'pdf');
  const facts = ok(await call('knowledge.fact.list', { sourceId: r.sourceId })).facts;
  const w = facts.find((f: { text: string }) => /warranty on parts and labour/.test(f.text));
  assert.ok(w, JSON.stringify(facts.map((f: { text: string }) => f.text)));
  assert.equal(w.location.page, 1);
});

test('an offerings sheet, CSV or Excel: one offering per row; prices and dates allowed; approve puts each in its own offering', { skip }, async () => {
  const { call } = await workspace();
  for (const [name, args] of [['csv', { filename: 'plans.csv', text: SHEET_CSV }], ['xlsx', { filename: 'plans.xlsx', contentBase64: sheetXlsx().toString('base64') }]] as const) {
    const r = ok(await call('offering.import', args));
    assert.deepEqual(r.offerings, ['AquaPure Basic', 'AquaPure Gold'], name);
    assert.equal(r.nameColumn, 'Plan');
    assert.equal(r.proposed, 6, name);
    const facts = ok(await call('knowledge.fact.list', { sourceId: r.sourceId })).facts;
    const gold = facts.find((f: { text: string }) => /^AquaPure Gold, price/.test(f.text));
    assert.equal(gold.text, 'AquaPure Gold, price: ₹12,999');
    assert.deepEqual(gold.purposes, ['price']);
    assert.equal(gold.location.row, 3);
    ok(await call('knowledge.fact.decide', { factIds: facts.map((f: { id: string }) => f.id), decision: 'approved' }));
  }
  const offs = ok(await call('offering.list', {})).offerings;
  const gold = offs.find((o: { name: string }) => o.name === 'AquaPure Gold');
  // Imported twice (CSV, then Excel): the newer sheet's values replace the older ones, column by column; nothing doubles.
  assert.deepEqual(gold.facts.map((f: { text: string }) => f.text), ['AquaPure Gold, price: ₹12,999', 'AquaPure Gold, valid until: 31/03/2027', 'AquaPure Gold, free services a year: 4']);
});

test('offering.edit refuses a price or a date that stands on prose (HV law 22)', { skip }, async () => {
  const { call } = await workspace();
  const r = ok(await call('knowledge.ingest', { title: 'Note', text: 'Our installation team is trained by the manufacturer and carries an ID card on every visit.' }));
  const span = ok(await call('knowledge.list', { sourceId: r.sourceId })).spans[0];
  ok(await call('knowledge.span.approve', { spanIds: [span.id] }));
  const bad = await call('offering.edit', { name: 'X', facts: [{ text: 'Installation costs ₹499', spanId: span.id, purposes: ['price'] }] });
  assert.equal(bad.status, 'not_executed');
  assert.match((bad as { reason: string }).reason, /cannot stand on a document or web page/);
  ok(await call('offering.edit', { name: 'X', facts: [{ text: 'Technicians carry an ID card on every visit', spanId: span.id, purposes: ['explain'] }] }));
});

async function companyAgent(call: Awaited<ReturnType<typeof workspace>>['call'], category: 'service' | 'promotional') {
  const s = ok(await call('knowledge.ingest_site', { url: site.base + '/', maxPages: 6 }));
  const facts = ok(await call('knowledge.fact.list', { sourceId: s.sourceId, status: 'pending' })).facts;
  ok(await call('knowledge.fact.decide', { factIds: facts.map((f: { id: string }) => f.id), decision: 'approved' }));
  const sh = ok(await call('offering.import', { filename: 'plans.csv', text: SHEET_CSV }));
  const sf = ok(await call('knowledge.fact.list', { sourceId: sh.sourceId })).facts;
  ok(await call('knowledge.fact.decide', { factIds: sf.map((f: { id: string }) => f.id), decision: 'approved' }));
  const offs = ok(await call('offering.list', {})).offerings;
  const a = ok(await call('agent.create', { name: 'Nirmal care', templateId: 'insurance-renewal' }));
  const ids = offs.filter((o: { name: string }) => ['Company information', 'AquaPure Gold'].includes(o.name)).map((o: { id: string }) => o.id);
  ok(await call('brief.edit', { agentId: a.agentId, patch: [{ op: 'set', path: 'knowledge', value: { offeringIds: ids } }, { op: 'set', path: 'category', value: category }] }));
  return a.agentId as string;
}

test('the agent page says which approved facts she may say on her calls, and why not', { skip }, async () => {
  const { call } = await workspace();
  const agentId = await companyAgent(call, 'service');
  const k = ok(await call('agent.knowledge', { agentId }));
  assert.deepEqual(k.offerings.filter((o: { linked: boolean }) => o.linked).map((o: { name: string }) => o.name).sort(), ['AquaPure Gold', 'Company information']);
  const area = k.facts.find((f: { text: string }) => /within 48 hours/.test(f.text));
  assert.equal(area.text, 'They service purifiers across Pune, Pimpri and Chinchwad within 48 hours of a complaint.', 'the business\'s "we" becomes "they": a fact, not a line');
  assert.deepEqual([area.onCalls, area.why], [true, null]);
  assert.equal(area.source.sourceTitle, 'Nirmal Water Purifiers, Pune');
  assert.equal(area.source.location.title, 'About us');
  assert.match(area.source.quote, /We service purifiers/, 'the source keeps the original words');
  const install = k.facts.find((f: { text: string }) => /free installation/.test(f.text));
  assert.equal(install.onCalls, false, 'free installation reads as an offer');
  assert.equal(install.why, 'Offers and prices are said only on promotional calls; this agent makes service calls.');
  assert.ok(!k.facts.some((f: { why: string | null }) => /kb\d|facts\[/.test(f.why ?? '')), 'no internal key reaches the buyer');
  const price = k.facts.find((f: { text: string }) => /price: ₹12,999/.test(f.text));
  assert.equal(price.onCalls, false);
  assert.match(price.why, /only on promotional calls; this agent makes service calls/);
  assert.match(k.rule, /Prices and dates come only from an offerings sheet/);
});

test('practice chat: "why she said this" points to the source; a question no fact covers gets the safe line, never a guess', { skip }, async () => {
  const { call } = await workspace();
  const agentId = await companyAgent(call, 'service');
  setFakeLlm(() => ({ text: 'Ji, complaint ke 48 hours ke andar Pune, Pimpri aur Chinchwad mein service ho jaati hai.', toolCalls: [], usage: { inputTokens: 900, outputTokens: 20 }, model: 'fake', provider: 'fake' }));
  const opened = [{ who: 'agent', text: 'Namaste, main Nirmal ki AI assistant hoon.' }];
  const r = ok(await call('test.chat', { agentId, history: opened, message: 'Service kitni jaldi hoti hai?' }));
  const why = r.sources[0];
  assert.ok(why, JSON.stringify(r));
  assert.equal(why.facts[0].from.location.title, 'About us');
  assert.match(why.facts[0].from.quote, /within 48 hours/);
  assert.match(why.facts[0].from.location.url, /\/about$/);
  // The model invents a price no fact holds: blocked, written again, blocked again, so she says she will confirm.
  setFakeLlm(() => ({ text: 'Gold plan sirf ₹9,499 ka hai aaj.', toolCalls: [], usage: { inputTokens: 900, outputTokens: 20 }, model: 'fake', provider: 'fake' }));
  const g = ok(await call('test.chat', { agentId, history: opened, message: 'Sabse sasta plan kitne ka hai?' }));
  assert.equal(g.said, 'Ji, ye main pakka karke aapko batati hoon.');
  assert.doesNotMatch(g.said, /9,499/);
  assert.deepEqual(g.notes.map((n: { action: string }) => n.action), ['block', 'block', 'replace']);
  assert.equal(g.notes[2].label, 'Safe line');
});

test('on a call page, each of her lines points to the facts it used and where they came from, from the version that ran', { skip }, async () => {
  const { ws, call } = await workspace();
  const agentId = await companyAgent(call, 'service');
  const g = ok(await call('agent.get', { agentId }));
  const v = ok(await call('version.publish', { agentId, draftHash: g.draftHash }));
  const conv = (await one<{ id: string }>(pool, "INSERT INTO conversation (workspace_id, agent_version_id, channel, status) VALUES ($1,$2,'phone','done') RETURNING id", [ws, v.versionId]))!.id;
  const lines = [['agent', 'Namaste, main Nirmal ki AI assistant hoon.'], ['caller', 'Service kitni jaldi hoti hai?'], ['agent', 'Complaint ke 48 hours ke andar service ho jaati hai.']];
  for (let i = 0; i < lines.length; i++) await pool.query('INSERT INTO turn (conversation_id, idx, speaker, text) VALUES ($1,$2,$3,$4)', [conv, i, lines[i][0], lines[i][1]]);
  const w = ok(await call('call.why_said', { conversationId: conv }));
  assert.deepEqual(w.turns.map((t: { idx: number }) => t.idx), [2]);
  const f = w.turns[0].uses[0].facts[0];
  assert.equal(f.from.location.title, 'About us');
  assert.match(f.from.quote, /We service purifiers across Pune/);
});
