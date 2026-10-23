// Workspace module: fixes for the adversarial review (tests/review/money-auth.md MA-02, MA-07, MA-10).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { one, tx } from '../server/db.ts';
import { reserve } from '../server/ledger.ts';
import { checkUrlShape, ipBytes, isPrivateAddress } from '../server/modules/workspace/webhooks.ts';
import { addMember, boot, skip, signup, type Booted } from './workspace-helpers.ts';

let b: Booted;
before(async () => { if (!skip) b = await boot(); });
after(async () => { await b?.close(); });

test('MA-10: private addresses are caught in every IPv6 spelling that carries an IPv4 address', () => {
  const blocked = [
    '::ffff:a9fe:a9fe', '::ffff:169.254.169.254', '0:0:0:0:0:ffff:a9fe:a9fe', '0000:0000:0000:0000:0000:ffff:a9fe:a9fe', '::FFFF:7F00:1', '::ffff:127.0.0.1',
    '::ffff:0a00:0001', '::ffff:c0a8:1', '::ffff:ac10:1', '::ffff:6440:1',            // 10/8, 192.168/16, 172.16/12, CGNAT
    '::a9fe:a9fe', '::127.0.0.1', '0:0:0:0:0:0:7f00:1',                                // IPv4-compatible
    '64:ff9b::a9fe:a9fe', '64:ff9b::169.254.169.254', '64:ff9b::7f00:1', '64:ff9b:1::1', // NAT64 and its local-use range
    '2002:a9fe:a9fe::1', '2002:7f00:1::', '2001:0:4136:e378:8000:63bf:3fff:fdd2',      // 6to4, Teredo
    '::', '::1', '0:0:0:0:0:0:0:1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'ff02::1', 'ff00::',
    '127.0.0.1', '10.1.2.3', '169.254.169.254', '172.31.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    'not an ip',
  ];
  for (const ip of blocked) assert.equal(isPrivateAddress(ip), true, ip);
  const open = ['8.8.8.8', '1.1.1.1', '203.1.113.9', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1', '172.32.0.1', '100.128.0.1'];
  for (const ip of open) assert.equal(isPrivateAddress(ip), false, ip);
  assert.deepEqual(ipBytes('::ffff:1.2.3.4')!.slice(10), [255, 255, 1, 2, 3, 4]);
  assert.equal(ipBytes('1:2:3:4:5:6:7:8:9'), null);

  const was = process.env.VP_WEBHOOK_ALLOW_PRIVATE;
  process.env.VP_WEBHOOK_ALLOW_PRIVATE = '0';
  try {
    for (const u of ['https://[::ffff:169.254.169.254]/latest/meta-data/', 'https://[::ffff:127.0.0.1]:5432/', 'https://[0:0:0:0:0:ffff:a9fe:a9fe]/', 'https://[64:ff9b::7f00:1]/',
      'https://[::127.0.0.1]/', 'https://[2002:a9fe:a9fe::]/', 'https://[fd00::1]/', 'https://[ff02::1]/', 'https://2130706433/', 'https://0x7f.1/', 'https://[::ffff:7f00:1]/'])
      assert.throws(() => checkUrlShape(u), /private network/, u);
    assert.doesNotThrow(() => checkUrlShape('https://[2606:4700:4700::1111]/hook'));
  } finally { process.env.VP_WEBHOOK_ALLOW_PRIVATE = was; }
});

test('MA-07: apikey.create writes the api_key budget the ledger enforces (scope "api_key", period daily)', { skip }, async () => {
  const owner = await signup(b);
  await b.pool.query('UPDATE wallet SET balance_inr_milli = 10000000 WHERE workspace_id = $1', [owner.workspaceId]);
  const made = await owner.run('apikey.create', { name: 'capped key', dailyCapInrMilli: 1_000 });
  assert.equal(made.status, 'confirmed');
  const budget = await one<{ scope_type: string; period: string; cap: string }>(b.pool, "SELECT scope_type, period, cap_inr_milli::text AS cap FROM budget WHERE workspace_id = $1 AND scope_id = $2", [owner.workspaceId, made.result.id]);
  assert.deepEqual(budget, { scope_type: 'api_key', period: 'daily', cap: '1000' });
  const r = await tx(b.pool, c => reserve(c, { workspaceId: owner.workspaceId!, inrMilli: 50_000, apiKeyId: made.result.id }));
  assert.equal(r.ok, false, 'a ₹50 hold is refused under a ₹1 daily cap');
  assert.equal(!r.ok && r.cause, 'cap_reached');
  const small = await tx(b.pool, c => reserve(c, { workspaceId: owner.workspaceId!, inrMilli: 500, apiKeyId: made.result.id }));
  assert.equal(small.ok, true);

  const dflt = await owner.run('apikey.create', { name: 'default key' });
  const cap = await one<{ cap: string }>(b.pool, 'SELECT cap_inr_milli::text AS cap FROM budget WHERE scope_id = $1', [dflt.result.id]);
  assert.equal(cap!.cap, '2000000', 'without a cap given, the schema default ₹2,000 a day applies');
});

test('MA-02: cards for removing a member, revoking a key, disconnecting and deleting go stale when the target changes', { skip }, async () => {
  const owner = await signup(b);
  const target = await addMember(b, owner, 'builder');
  const stale = async (name: string, args: unknown, change: () => Promise<unknown>) => {
    const p = await owner.tool(name, args);
    assert.equal(p.status, 'needs_approval', name);
    assert.doesNotMatch(p.summary, /[0-9a-f]{8}/i, 'the card never shows an id');
    assert.doesNotMatch(p.summary, /this (member|API key|integration|webhook)\b/, 'the card names its target by name');
    await change();
    const r = (await owner.fetch('POST', `/v1/actions/${p.actionId}/decide`, { approve: true })).body;
    assert.equal(r.status, 'not_executed', `${name}: ${JSON.stringify(r)}`);
    assert.match(r.reason, /changed since it was proposed/);
  };

  await stale('member.remove', { memberId: target.memberId }, async () => { await owner.run('member.role.set', { memberId: target.memberId, role: 'owner' }); });
  assert.equal((await one<{ status: string }>(b.pool, 'SELECT status FROM member WHERE id = $1', [target.memberId]))!.status, 'active');

  const key = await owner.run('apikey.create', { name: 'old name' });
  await stale('apikey.revoke', { id: key.result.id }, async () => { await b.pool.query("UPDATE api_key SET name = 'renamed' WHERE id = $1", [key.result.id]); });

  const st = await owner.tool('integration.stage_secrets', { kind: 'slack', secrets: { webhook_url: 'https://hooks.example.test/x' } });
  const integ = await owner.run('integration.connect', { kind: 'slack', name: 'Alerts', stashId: st.result.stashId });
  await stale('integration.disconnect', { id: integ.result.id }, async () => { await b.pool.query("UPDATE integration SET name = 'Alerts 2', updated_at = now() WHERE id = $1", [integ.result.id]); });

  const hook = await owner.run('webhook.create', { url: 'https://hooks.example.test/in', events: ['call.ended'] });
  await stale('webhook.delete', { id: hook.result.id }, async () => { await b.pool.query("UPDATE webhook_endpoint SET url = 'https://hooks.example.test/other' WHERE id = $1", [hook.result.id]); });

  // an unchanged card still works
  assert.equal((await owner.run('webhook.delete', { id: hook.result.id })).status, 'confirmed');
  assert.equal((await owner.run('apikey.revoke', { id: key.result.id })).status, 'confirmed');
});
