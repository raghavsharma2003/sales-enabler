// Workspace module: another workspace can read or change nothing of yours; search, activity and the workspace summary.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../server/db.ts';
import { Registry } from '../server/tools.ts';
import { module as workspaceModule } from '../server/modules/workspace/index.ts';
import { deliverPending } from '../server/modules/workspace/webhooks.ts';
import { addMember, boot, makePdf, skip, signup, type Booted, type Client } from './workspace-helpers.ts';

let b: Booted;
before(async () => { if (!skip) b = await boot(); });
after(async () => { await b?.close(); });

async function seed(c: Client & { email: string }, tag: string) {
  const ws = c.workspaceId!;
  const brand = (await c.tool('brand.update', { legalName: `${tag} Pvt Ltd` })).result;
  const up = await c.tool('knowledge.ingest', { title: `${tag} FAQ`, text: `${tag} offers a free demo of the product to every new business customer.\n\nSupport is open on weekdays.` });
  const [span] = (await c.tool('knowledge.list', { sourceId: up.result.sourceId })).result.spans;
  await c.tool('knowledge.span.approve', { spanIds: [span.id] });
  const offering = (await c.tool('offering.edit', { name: `${tag} demo`, facts: [{ text: 'Free demo', spanId: span.id, purposes: ['opening'] }] })).result;
  const key = await c.run('apikey.create', { name: `${tag} key` });
  const member = await addMember(b, c, 'operator', `${tag} Teammate`);
  const pend = `${tag.toLowerCase()}-pending-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const reveal = await c.run('member.invite', { email: pend, role: 'viewer' });
  assert.equal(reveal.status, 'confirmed', JSON.stringify(reveal));
  const hook = await c.run('webhook.create', { url: 'http://127.0.0.1:9/never' });
  const st = await c.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: `https://hooks.example.test/${tag}` } });
  const integ = await c.run('integration.connect', { kind: 'slack', name: `${tag} Slack`, stashId: st.result.stashId });
  const reg = new Registry(); workspaceModule.register(reg);
  await reg.execute(b.pool, 'webhook.emit', { event: 'call.ended', data: { tag } }, { workspaceId: ws, actor: { type: 'system' } });
  const delivery = (await c.tool('webhook.deliveries')).result.deliveries[0];
  const contact = await one<{ id: string }>(b.pool, "INSERT INTO contact (workspace_id, e164, name) VALUES ($1,$2,$3) RETURNING id", [ws, '+9198' + Math.floor(10000000 + Math.random() * 89999999), `${tag} Contact Meera`]);
  const agent = await one<{ id: string }>(b.pool, "INSERT INTO agent (workspace_id, name, job) VALUES ($1,$2,'reminder') RETURNING id", [ws, `${tag} Reminder Agent`]);
  const campaign = await one<{ id: string }>(b.pool, "INSERT INTO campaign (workspace_id, name, call_category) VALUES ($1,$2,'service') RETURNING id", [ws, `${tag} Renewal Campaign`]);
  const call = await one<{ id: string }>(b.pool, "INSERT INTO conversation (workspace_id, contact_id, channel) VALUES ($1,$2,'test') RETURNING id", [ws, contact!.id]);
  const share = await c.run('share.link.create', { objectType: 'agent', objectId: agent!.id });
  return { brand, span, source: up.result.sourceId, offering: offering.offering, offeringRev: offering.revisionId, key: key.result, member, reveal: reveal.result, pend, hook: hook.result, integ: integ.result, delivery, contact: contact!, agent: agent!, campaign: campaign!, call: call!, share: share.result, delivery_: delivery };
}

test('another workspace can neither read nor change what is yours', { skip }, async () => {
  const a = await signup(b, 'Alpha'), z = await signup(b, 'Zulu');
  const A = await seed(a, 'Alpha'), Z = await seed(z, 'Zulu');
  const refused = (r: any) => assert.equal(r.status, 'not_executed', JSON.stringify(r));

  // reads show only your own rows
  const zJson = JSON.stringify([
    (await z.tool('member.list')).result, (await z.tool('apikey.list')).result, (await z.tool('knowledge.list')).result, (await z.tool('offering.list')).result,
    (await z.tool('integration.list')).result, (await z.tool('webhook.list')).result, (await z.tool('webhook.deliveries')).result, (await z.tool('activity.list', { limit: 100 })).result,
    (await z.tool('revision.list')).result, (await z.tool('share.link.list')).result, (await z.tool('workspace.get')).result, (await z.tool('brand.get')).result,
  ]);
  assert.ok(zJson.includes('Zulu'));
  for (const needle of ['Alpha', A.pend, A.key.id, A.member.email, A.offering.id, A.integ.id, A.hook.id]) assert.ok(!zJson.includes(needle), `leaked ${needle}`);
  assert.deepEqual((await z.tool('knowledge.list', { sourceId: A.source })).result.spans, []);

  // changes aimed at your ids fail
  refused(await z.run('apikey.revoke', { id: A.key.id }));
  assert.equal((await one<{ revoked_at: Date | null }>(b.pool, 'SELECT revoked_at FROM api_key WHERE id = $1', [A.key.id]))!.revoked_at, null);
  refused(await z.run('member.role.set', { memberId: A.member.memberId, role: 'viewer' }));
  refused(await z.run('member.remove', { memberId: A.member.memberId }));
  refused(await z.tool('offering.edit', { offeringId: A.offering.id, name: 'hijacked' }));
  refused(await z.tool('knowledge.span.approve', { spanIds: [A.span.id], decision: 'rejected' }));
  refused(await z.tool('offering.edit', { name: 'Borrowed fact', facts: [{ text: 'x', spanId: A.span.id, purposes: ['opening'] }] }));
  refused(await z.tool('action.undo', { revisionId: A.offeringRev }));
  refused(await z.run('integration.disconnect', { id: A.integ.id }));
  refused(await z.run('webhook.delete', { id: A.hook.id }));
  refused(await z.run('webhook.replay', { deliveryId: A.delivery.id }));
  refused(await z.run('share.link.create', { objectType: 'agent', objectId: A.agent.id }));
  refused(await z.tool('share.link.revoke', { id: A.share.id }));
  refused(await z.tool('secret.reveal', { revealId: A.key.revealId }));
  const staged = await a.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: 'https://hooks.example.test/stash' } });
  refused(await z.run('integration.connect', { kind: 'slack', name: 'Stolen', stashId: staged.result.stashId }));
  assert.ok(await one(b.pool, 'SELECT 1 FROM secret_box WHERE id = $1', [staged.result.stashId]), 'the stash is still there for its owner');
  assert.equal((await one<{ name: string }>(b.pool, 'SELECT name FROM offering WHERE id = $1', [A.offering.id]))!.name, 'Alpha demo');
  assert.equal((await one<{ status: string }>(b.pool, 'SELECT status FROM member WHERE id = $1', [A.member.memberId]))!.status, 'active');

  // a key from one workspace acts only in its own
  const token = (await a.tool('secret.reveal', { revealId: A.key.revealId })).result.token;
  const keyed = new (a.constructor as any)(b.base, { bearer: token }, undefined, a.workspaceId) as Client;
  assert.ok(JSON.stringify((await keyed.tool('member.list')).result).includes('Alpha'));
  assert.ok(!JSON.stringify((await keyed.tool('member.list')).result).includes('Zulu'));

  // ids from the other workspace cannot be reached through a search either
  const hit = (await z.tool('search.global', { q: 'Alpha' })).result.results;
  assert.deepEqual(hit, []);
  assert.deepEqual((await z.tool('search.global', { q: A.contact.id.slice(0, 4) })).result.results.filter((r: any) => r.id === A.contact.id), []);

  // delivery runs per workspace
  const sent = await deliverPending(b.pool, { workspaceId: z.workspaceId });
  assert.equal(sent.sent, 1, 'a scoped run touches only that workspace\'s own queue');
  const untouched = await one<{ attempts: number }>(b.pool, 'SELECT attempts FROM webhook_delivery WHERE id = $1', [A.delivery.id]);
  assert.equal(untouched!.attempts, 0);
});

test('search finds contacts, agents, campaigns and calls by name or number; wildcards are literal', { skip }, async () => {
  const c = await signup(b, 'Searchco');
  const S = await seed(c, 'Searchco');
  const num = (await one<{ e164: string }>(b.pool, 'SELECT e164 FROM contact WHERE id = $1', [S.contact.id]))!.e164;

  const byName = (await c.tool('search.global', { q: 'meera' })).result.results;
  assert.deepEqual(byName.map((r: any) => r.type).sort(), ['call', 'contact']);
  assert.equal(byName.find((r: any) => r.type === 'contact').id, S.contact.id);
  assert.match(byName.find((r: any) => r.type === 'call').title, /^Call with Searchco Contact Meera$/);

  const byNumber = (await c.tool('search.global', { q: num.slice(-7) })).result.results;
  assert.deepEqual(byNumber.map((r: any) => r.type).sort(), ['call', 'contact']);
  assert.ok(byNumber.every((r: any) => r.matchedOn === 'number'));
  assert.equal((await c.tool('search.global', { q: num.replace('+91', '+91 ').replace(/(\d{5})(\d+)$/, '$1-$2') })).result.results.length >= 1, true, 'formatting does not matter');

  const agents = (await c.tool('search.global', { q: 'reminder agent', types: ['agent'] })).result.results;
  assert.deepEqual(agents.map((r: any) => [r.type, r.id]), [['agent', S.agent.id]]);
  const camps = (await c.tool('search.global', { q: 'renewal', types: ['campaign'] })).result.results;
  assert.deepEqual(camps.map((r: any) => r.id), [S.campaign.id]);

  assert.deepEqual((await c.tool('search.global', { q: '%%' })).result.results, [], 'a percent sign is not a wildcard');
  assert.deepEqual((await c.tool('search.global', { q: '__' })).result.results, []);
  assert.equal((await c.tool('search.global', { q: 'a' })).status, 'not_executed', 'one letter is too little');
  assert.equal((await c.tool('search.global', { q: 'meera', limit: 1, types: ['contact'] })).result.results.length, 1);
});

test('activity: newest first, in plain words, paginated, filtered, and the chain still verifies', { skip }, async () => {
  const owner = await signup(b, 'Chatty');
  const mate = await addMember(b, owner, 'operator', 'Ravi Kumar');
  const k = await owner.run('apikey.create', { name: 'Nightly sync' });
  const token = (await owner.tool('secret.reveal', { revealId: k.result.revealId })).result.token;
  const keyed = new (owner.constructor as any)(b.base, { bearer: token }, undefined, owner.workspaceId) as Client;
  await keyed.tool('brand.update', { legalName: 'Chatty Pvt Ltd' });
  await mate.tool('brand.update', { tone: 'calm' });
  await mate.tool('member.invite', { email: `pending-q-${Math.random().toString(36).slice(2, 8)}@example.test`, role: 'viewer' });   // proposal only

  const all = (await owner.tool('activity.list', { limit: 100 })).result;
  const lines: string[] = all.items.map((i: any) => i.line);
  assert.ok(lines.includes('Asha Owner created the workspace'));
  assert.ok(lines.includes('Asha Owner invited a teammate (approved)'), lines.join('\n'));
  assert.ok(lines.includes('Asha Owner created an API key (approved)'));
  assert.ok(lines.includes('The API key "Nightly sync" edited the brand details'));
  assert.ok(lines.includes('Ravi Kumar edited the brand details'));
  assert.ok(lines.includes('Ravi Kumar asked to invite a teammate and is waiting for approval'));
  assert.ok(lines.includes('Ravi Kumar joined the workspace'));
  assert.ok(all.items.every((i: any, n: number, arr: any[]) => n === 0 || arr[n - 1].at >= i.at), 'newest first');
  assert.ok(lines.every(l => !/[a-z]+\.[a-z_.]+/.test(l.replace(/\.$/, ''))), 'no tool ids in the sentences');

  // pages join up exactly, with no repeat and no gap
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = (await owner.tool('activity.list', { limit: 4, cursor })).result;
    assert.ok(page.items.length <= 4);
    seen.push(...page.items.map((i: any) => i.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, all.items.map((i: any) => i.id));
  assert.equal(new Set(seen).size, seen.length);
  assert.equal((await owner.tool('activity.list', { cursor: 'junk' })).status, 'not_executed');

  const onlyBrand = (await owner.tool('activity.list', { actionPrefix: 'brand.' })).result.items;
  assert.equal(onlyBrand.length, 2);
  const byMate = (await owner.tool('activity.list', { actorId: mate.memberId })).result.items;
  assert.ok(byMate.length >= 3 && byMate.every((i: any) => i.actor.id === mate.memberId));
  const r = await owner.fetch('GET', '/v1/audit/verify');
  assert.equal(r.body.intact, true, 'the audit chain is intact after all of this');

  // reading the log is itself not logged
  const n1 = (await owner.tool('activity.list', { limit: 100 })).result.items.length;
  const n2 = (await owner.tool('activity.list', { limit: 100 })).result.items.length;
  assert.equal(n1, n2);
});

test('workspace.get summarises the workspace; knowledge upload needs a signed-in caller', { skip }, async () => {
  const owner = await signup(b, 'Summary');
  await owner.tool('brand.update', { legalName: 'Summary Pvt Ltd', sector: 'retail' });
  await owner.tool('knowledge.ingest', { text: 'We sell things.' });
  await addMember(b, owner, 'viewer');
  const g = (await owner.tool('workspace.get')).result;
  assert.equal(g.brand.legalName, 'Summary Pvt Ltd');
  assert.deepEqual(g.counts, { members: 2, invited: 0, keys: 0, knowledge: 1, integrations: 0, webhooks: 0 });
  const anon = await fetch(b.base + '/v1/uploads/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x' }) });
  assert.equal(anon.status, 401);
  const viewer = await addMember(b, owner, 'viewer');
  const denied = await viewer.fetch('POST', '/v1/uploads/knowledge', { filename: 'a.pdf', contentBase64: makePdf([['hello there']]).toString('base64') });
  assert.equal(denied.body.status, 'not_executed', 'a viewer cannot add knowledge');
});
