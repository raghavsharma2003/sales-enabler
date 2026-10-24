// Workspace module: integration secrets, signed webhooks, share links.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { one } from '../server/db.ts';
import { verify } from '../server/runtime-client.ts';
import { Registry } from '../server/tools.ts';
import { integrationSecrets } from '../server/modules/workspace/integrations.ts';
import { open } from '../server/modules/workspace/crypto.ts';
import { deliverPending } from '../server/modules/workspace/webhooks.ts';
import { verifyShare, signShare } from '../server/modules/workspace/crypto.ts';
import { addMember, boot, skip, signup, type Booted } from './workspace-helpers.ts';

let b: Booted;
let receiver: Server, port = 0, status = 200;
const got: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
before(async () => {
  if (skip) return;
  b = await boot();
  receiver = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => { got.push({ body: Buffer.concat(chunks).toString('utf8'), headers: req.headers }); res.writeHead(status).end('ok'); });
  });
  await new Promise<void>(r => receiver.listen(0, '127.0.0.1', r));
  port = (receiver.address() as { port: number }).port;
});
after(async () => { receiver?.close(); receiver?.closeAllConnections?.(); await b?.close(); });

const SECRETS = { client_id: 'cid-7f3a91-synthetic', client_secret: 'csecret-d41d8cd98f00b204e9800998ecf8427e', refresh_token: 'rtoken-0cc175b9c0f1b6a831c399e269772661' };

test('integration secrets are encrypted at rest and never returned', { skip }, async () => {
  const owner = await signup(b);
  const kinds = (await owner.tool('integration.kinds')).result.kinds;
  assert.ok(kinds.find((k: any) => k.id === 'zoho_crm'));

  assert.match((await owner.tool('integration.stage_secrets', { kind: 'zoho_crm', secrets: { client_id: 'x' } })).reason, /missing client_secret, refresh_token/);
  assert.match((await owner.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: 'https://hooks.example.test/x', extra: 'y' } })).reason, /not expected: extra/);
  const staged = await owner.tool('integration.stage_secrets', { kind: 'zoho_crm', secrets: SECRETS });
  assert.equal(staged.status, 'confirmed');
  assert.deepEqual(staged.result.keys.sort(), Object.keys(SECRETS).sort());
  assert.ok(!JSON.stringify(staged).includes(SECRETS.client_secret));

  const wrongKind = await owner.run('integration.connect', { kind: 'hubspot', name: 'CRM', stashId: staged.result.stashId });
  assert.match(wrongKind.reason, /staged for zoho_crm, not hubspot/);
  const prop = await owner.tool('integration.connect', { kind: 'zoho_crm', name: 'Sales CRM', config: { datacenter: 'in' }, stashId: staged.result.stashId });
  assert.equal(prop.status, 'needs_approval');
  assert.equal(prop.summary, 'Connect Zoho CRM as "Sales CRM"');
  const done = (await owner.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  assert.deepEqual(done.result.secretKeys.sort(), Object.keys(SECRETS).sort());

  // nothing the API says contains a secret value
  const everything = JSON.stringify([
    done, (await owner.tool('integration.list')).result, (await owner.tool('workspace.get')).result, (await owner.tool('activity.list', { limit: 100 })).result,
    (await owner.fetch('GET', '/v1/actions?status=executed')).body, (await owner.fetch('GET', '/v1/actions?status=proposed')).body, (await owner.fetch('GET', '/v1/me')).body,
  ]);
  for (const v of Object.values(SECRETS)) assert.ok(!everything.includes(v), `${v} leaked`);
  const list = (await owner.tool('integration.list')).result.integrations[0];
  assert.deepEqual(Object.keys(list).sort(), ['config', 'connectedAt', 'id', 'kind', 'name', 'secretKeys', 'status']);

  // encrypted in the database, bound to the workspace, and readable by server code that is allowed to
  const row = await one<{ secret_ciphertext: string }>(b.pool, 'SELECT secret_ciphertext FROM integration WHERE id = $1', [done.result.id]);
  assert.match(row!.secret_ciphertext, /^v1\./);
  for (const v of Object.values(SECRETS)) assert.ok(!row!.secret_ciphertext.includes(v));
  assert.deepEqual(await integrationSecrets(b.pool, owner.workspaceId!, 'Sales CRM'), SECRETS);
  assert.throws(() => open('00000000-0000-4000-8000-000000000000', 'integration', row!.secret_ciphertext), 'a ciphertext copied to another workspace does not open');
  const leaks = await one(b.pool, 'SELECT 1 FROM action WHERE workspace_id = $1 AND (args::text LIKE $2 OR result::text LIKE $2)', [owner.workspaceId, '%csecret-%']);
  assert.equal(leaks, null, 'the kernel stores approval args in clear, so they must hold only the stash id');
  assert.equal(await one(b.pool, "SELECT 1 FROM secret_box WHERE id = $1", [staged.result.stashId]), null, 'the stash is consumed');

  const reuse = await owner.run('integration.connect', { kind: 'zoho_crm', name: 'Second', stashId: staged.result.stashId });
  assert.match(reuse.reason, /not found or have expired/);
  const badCfg = await owner.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: 'https://hooks.example.test/x' } });
  assert.match((await owner.run('integration.connect', { kind: 'slack', name: 'Alerts', config: { nope: '1' }, stashId: badCfg.result.stashId })).reason, /not expected: nope/);

  assert.equal((await owner.run('integration.disconnect', { id: done.result.id })).status, 'confirmed');
  assert.equal(await integrationSecrets(b.pool, owner.workspaceId!, 'Sales CRM'), null, 'disconnect erases the credentials');
});

test('webhook: signed with the secret shown once, delivered, replayed, retried, and aimed only at safe addresses', { skip }, async () => {
  const owner = await signup(b);
  got.length = 0; status = 200;
  const url = `http://127.0.0.1:${port}/hook`;
  const made = await owner.run('webhook.create', { url, events: ['campaign.*', 'call.ended'], description: 'warehouse' });
  assert.equal(made.status, 'confirmed', JSON.stringify(made));
  assert.ok(!JSON.stringify(made).includes('whsec_'));
  const shown = await owner.tool('secret.reveal', { revealId: made.result.revealId });
  const secret: string = shown.result.signingSecret;
  assert.match(secret, /^whsec_/);
  const row = await one<{ secret_ciphertext: string }>(b.pool, 'SELECT secret_ciphertext FROM webhook_endpoint WHERE id = $1', [made.result.id]);
  assert.ok(!row!.secret_ciphertext.includes(secret));
  assert.ok(!JSON.stringify((await owner.tool('webhook.list')).result).includes(secret));

  // only the platform emits; a member or key cannot
  assert.match((await owner.tool('webhook.emit', { event: 'call.ended', data: {} })).reason, /cannot use webhook.emit/);
  const { module } = await import('../server/modules/workspace/index.ts');
  const reg = new Registry(); module.register(reg);
  const sys = { workspaceId: owner.workspaceId!, actor: { type: 'system' as const } };
  assert.deepEqual((await reg.execute(b.pool, 'webhook.emit', { event: 'call.ended', data: { callId: 'c1', outcome: 'interested' } }, sys) as any).result, { queued: 1 });
  assert.deepEqual((await reg.execute(b.pool, 'webhook.emit', { event: 'campaign.paused', data: { id: 'k1' } }, sys) as any).result, { queued: 1 }, 'campaign.* matches');
  assert.deepEqual((await reg.execute(b.pool, 'webhook.emit', { event: 'wallet.low', data: {} }, sys) as any).result, { queued: 0 }, 'unsubscribed events are not sent');

  const sent = await deliverPending(b.pool, { workspaceId: owner.workspaceId });
  assert.deepEqual(sent, { sent: 2, delivered: 2, failed: 0 });
  assert.equal(got.length, 2);
  for (const g of got) {
    const sig = String(g.headers['x-vp-signature']);
    assert.equal(verify(secret, g.body, sig), true, 'the signature verifies with the shown secret');
    assert.equal(verify(secret + 'x', g.body, sig), false);
    assert.equal(verify(secret, g.body + ' ', sig), false, 'a changed body fails');
    assert.equal(g.headers['content-type'], 'application/json');
  }
  const first = JSON.parse(got.find(g => g.headers['x-vp-event'] === 'call.ended')!.body);
  assert.equal(first.event, 'call.ended');
  assert.deepEqual(first.data, { callId: 'c1', outcome: 'interested' });

  const deliveries = (await owner.tool('webhook.deliveries', { endpointId: made.result.id })).result.deliveries;
  assert.equal(deliveries.length, 2);
  assert.ok(deliveries.every((d: any) => d.status === 'delivered' && d.responseStatus === 200 && d.attempts === 1));

  // replay is outward-facing, so it needs an approval
  const rp = await owner.tool('webhook.replay', { deliveryId: deliveries[0].id });
  assert.equal(rp.status, 'needs_approval');
  assert.equal((await owner.fetch('POST', `/v1/actions/${rp.actionId}/decide`, { approve: true })).body.status, 'confirmed');
  assert.equal(got.length, 2, 'nothing is sent until delivery runs');
  assert.equal((await deliverPending(b.pool, { workspaceId: owner.workspaceId })).delivered, 1);
  assert.equal(got.length, 3);
  assert.equal(verify(secret, got[2].body, String(got[2].headers['x-vp-signature'])), true);
  assert.equal((await owner.tool('webhook.deliveries', { endpointId: made.result.id })).result.deliveries[0].replayOf, deliveries[0].id);

  // a failing receiver: retried later with backoff, then given up on
  status = 500;
  await reg.execute(b.pool, 'webhook.emit', { event: 'call.ended', data: { n: 1 } }, sys);
  assert.deepEqual(await deliverPending(b.pool, { workspaceId: owner.workspaceId }), { sent: 1, delivered: 0, failed: 0 });
  const pending = (await owner.tool('webhook.deliveries', { status: 'pending' })).result.deliveries[0];
  assert.equal(pending.attempts, 1);
  assert.equal(pending.responseStatus, 500);
  assert.match(pending.error, /answered 500/);
  assert.ok(new Date(pending.nextAttemptAt) > new Date(Date.now() + 20_000), 'backs off');
  assert.equal((await deliverPending(b.pool, { workspaceId: owner.workspaceId })).sent, 0, 'not due yet');
  await b.pool.query("UPDATE webhook_delivery SET next_attempt_at = now(), attempts = 4 WHERE id = $1", [pending.id]);
  assert.deepEqual(await deliverPending(b.pool, { workspaceId: owner.workspaceId }), { sent: 1, delivered: 0, failed: 1 });
  status = 200;

  // deleting stops delivery
  await reg.execute(b.pool, 'webhook.emit', { event: 'call.ended', data: { n: 2 } }, sys);
  assert.equal((await owner.run('webhook.delete', { id: made.result.id })).status, 'confirmed');
  assert.equal((await deliverPending(b.pool, { workspaceId: owner.workspaceId })).sent, 0);
  assert.equal((await owner.tool('webhook.list')).result.webhooks.length, 0);
});

test('webhooks refuse private addresses unless the test switch is on', { skip }, async () => {
  const owner = await signup(b);
  const was = process.env.VP_WEBHOOK_ALLOW_PRIVATE;
  process.env.VP_WEBHOOK_ALLOW_PRIVATE = '0';
  try {
    for (const u of ['http://example.test/hook', 'https://localhost/hook', 'https://127.0.0.1/hook', 'https://10.1.2.3/hook', 'https://192.168.0.5/x', 'https://[::1]/x', 'https://169.254.169.254/latest', 'https://user:pw@example.test/x', 'ftp://example.test/x', 'not a url']) {
      const r = await owner.run('webhook.create', { url: u });
      assert.equal(r.status, 'not_executed', u);
    }
    const ok = await owner.run('webhook.create', { url: 'https://hooks.example.test/in' });
    assert.equal(ok.status, 'confirmed');
    // a public-looking name that resolves to loopback is caught when sending
    await b.pool.query("UPDATE webhook_endpoint SET url = 'https://localhost.localdomain/x' WHERE id = $1", [ok.result.id]);
    const { module } = await import('../server/modules/workspace/index.ts');
    const reg = new Registry(); module.register(reg);
    await reg.execute(b.pool, 'webhook.emit', { event: 'x.y' }, { workspaceId: owner.workspaceId!, actor: { type: 'system' } });
    await deliverPending(b.pool, { workspaceId: owner.workspaceId });
    const d = (await owner.tool('webhook.deliveries')).result.deliveries[0];
    assert.equal(d.status, 'pending');
    assert.match(d.error, /private network|ENOTFOUND|EAI_AGAIN|ENODATA|could not be found/);
  } finally { process.env.VP_WEBHOOK_ALLOW_PRIVATE = was; }
});

test('share link: expiring, signed, read-only, revocable, and it never shows another workspace', { skip }, async () => {
  const owner = await signup(b), other = await signup(b);
  const agent = await one<{ id: string }>(b.pool, "INSERT INTO agent (workspace_id, name, job) VALUES ($1,'Reminder agent','reminder') RETURNING id", [owner.workspaceId]);
  const foreign = await one<{ id: string }>(b.pool, "INSERT INTO agent (workspace_id, name) VALUES ($1,'Theirs') RETURNING id", [other.workspaceId]);

  assert.match((await owner.run('share.link.create', { objectType: 'agent', objectId: foreign!.id })).reason, /no such agent in this workspace/);
  const viewer = await addMember(b, owner, 'viewer');
  assert.match((await viewer.tool('share.link.create', { objectType: 'agent', objectId: agent!.id })).reason, /cannot use/);

  const made = await owner.run('share.link.create', { objectType: 'agent', objectId: agent!.id, ttlHours: 2 });
  assert.equal(made.status, 'confirmed');
  const path: string = (await owner.tool('secret.reveal', { revealId: made.result.revealId })).result.path;
  assert.match(path, /^\/v1\/share\//);
  assert.ok(Math.abs(new Date(made.result.expiresAt).getTime() - (Date.now() + 2 * 3600_000)) < 60_000);

  const anon = await fetch(b.base + path);                      // no cookie, no key
  assert.equal(anon.status, 200);
  const view = await anon.json() as any;
  assert.equal(view.object.name, 'Reminder agent');
  assert.equal(view.type, 'agent');
  assert.equal(anon.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(b.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404, 'read-only: no writes');

  const token = path.replace('/v1/share/', '');
  const tampered = token.slice(0, -3) + (token.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal((await fetch(b.base + '/v1/share/' + tampered)).status, 404);
  const claims = verifyShare(token)!;
  const forged = signShare({ ...claims, w: other.workspaceId! });       // properly signed, but no such link in that workspace
  assert.equal((await fetch(b.base + '/v1/share/' + forged)).status, 404);
  const swapped = signShare({ ...claims, o: foreign!.id });
  assert.equal((await fetch(b.base + '/v1/share/' + swapped)).status, 404, 'a link cannot be pointed at a different object');
  assert.equal(verifyShare(token, Date.now() + 3 * 3600_000), null, 'expired by its own signed time');

  await b.pool.query("UPDATE share_link SET expires_at = now() - interval '1 second' WHERE id = $1", [made.result.id]);
  assert.equal((await fetch(b.base + path)).status, 404, 'expired in the database');
  await b.pool.query("UPDATE share_link SET expires_at = now() + interval '1 hour' WHERE id = $1", [made.result.id]);
  assert.equal((await fetch(b.base + path)).status, 200);
  assert.equal((await other.tool('share.link.revoke', { id: made.result.id })).status, 'not_executed', 'another workspace cannot revoke it');
  assert.equal((await owner.tool('share.link.revoke', { id: made.result.id })).status, 'confirmed');
  assert.equal((await fetch(b.base + path)).status, 404, 'revoked');
});
