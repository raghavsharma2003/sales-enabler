// Workspace module: invites, last-owner protection, API keys. Real Postgres; skipped when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { one } from '../server/db.ts';
import { addMember, boot, skip, signup, type Booted } from './workspace-helpers.ts';

let b: Booted;
before(async () => { if (!skip) b = await boot(); });
after(async () => { await b?.close(); });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

test('invite flow end to end: approve, read the link once, accept, sign in', { skip }, async () => {
  const owner = await signup(b);
  const email = 'priya@example.test';
  const prop = await owner.tool('member.invite', { email, role: 'operator' });
  assert.equal(prop.status, 'needs_approval', 'an invite changes who can act, so it waits for an owner');
  assert.match(prop.summary, /Invite priya@example.test as operator/);
  const done = (await owner.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed');
  assert.ok(!JSON.stringify(done).includes('vpi_'), 'the invite token is not in the approval receipt');

  const listed = (await owner.tool('member.list')).result.members.find((m: any) => m.email === email);
  assert.equal(listed.status, 'invited');

  const shown = await owner.tool('secret.reveal', { revealId: done.result.revealId });
  assert.equal(shown.status, 'confirmed');
  const token: string = shown.result.token;
  assert.match(token, /^vpi_/);
  assert.equal((await owner.tool('secret.reveal', { revealId: done.result.revealId })).status, 'not_executed', 'shown once only');

  const stored = await one<{ invite_token_hash: string }>(b.pool, 'SELECT invite_token_hash FROM member WHERE id = $1', [done.result.memberId]);
  assert.equal(stored!.invite_token_hash, sha(token), 'only the hash is stored');
  const leak = await one(b.pool, 'SELECT 1 FROM action WHERE workspace_id = $1 AND (args::text LIKE $2 OR result::text LIKE $2)', [owner.workspaceId, `%${token}%`]);
  assert.equal(leak, null, 'the token never reached action.args or action.result');

  const bad = await owner.fetch('POST', '/v1/invites/accept', { token: 'vpi_' + 'x'.repeat(30), name: 'Priya', password: 'a long password!' });
  assert.equal(bad.status, 404);
  const weak = await owner.fetch('POST', '/v1/invites/accept', { token, name: 'Priya', password: 'short' });
  assert.equal(weak.status, 422);

  const acc = await owner.fetch('POST', '/v1/invites/accept', { token, name: 'Priya Nair', password: 'a long password!' });
  assert.equal(acc.status, 201);
  assert.match(acc.headers.get('set-cookie') ?? '', /vp_session=/);
  const again = await owner.fetch('POST', '/v1/invites/accept', { token, name: 'Mallory', password: 'a long password!' });
  assert.equal(again.status, 404, 'an invite works once');

  const login = await owner.fetch('POST', '/v1/login', { email, password: 'a long password!' });
  assert.equal(login.status, 200);
  const after_ = (await owner.tool('member.list')).result.members.find((m: any) => m.email === email);
  assert.equal(after_.status, 'active');
  assert.equal(after_.name, 'Priya Nair');
  assert.equal(after_.role, 'operator');
});

test('invites expire, and an address that already has a workspace is refused', { skip }, async () => {
  const owner = await signup(b), other = await signup(b);
  const inv = await owner.run('member.invite', { email: 'late@example.test', role: 'viewer' });
  const token = (await owner.tool('secret.reveal', { revealId: inv.result.revealId })).result.token;
  await b.pool.query("UPDATE member SET invite_expires_at = now() - interval '1 minute' WHERE id = $1", [inv.result.memberId]);
  assert.equal((await owner.fetch('POST', '/v1/invites/accept', { token, name: 'Late', password: 'a long password!' })).status, 404);
  const reinvite = await owner.run('member.invite', { email: 'late@example.test', role: 'viewer' });
  assert.equal(reinvite.status, 'confirmed', 'an expired invite can be sent again');
  assert.equal(reinvite.result.memberId, inv.result.memberId);

  const clash = await owner.run('member.invite', { email: other.email, role: 'viewer' });
  assert.equal(clash.status, 'not_executed');
  assert.match(clash.reason, /already belongs to a workspace/);
});

test('roles gate who may invite and approve', { skip }, async () => {
  const owner = await signup(b);
  const viewer = await addMember(b, owner, 'viewer'), builder = await addMember(b, owner, 'builder'), compliance = await addMember(b, owner, 'compliance');
  assert.match((await viewer.tool('member.invite', { email: 'x@example.test', role: 'viewer' })).reason, /cannot use member.invite/);
  const prop = await builder.tool('member.invite', { email: 'y@example.test', role: 'viewer' });
  assert.equal(prop.status, 'needs_approval');
  const byBuilder = (await builder.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body;
  assert.equal(byBuilder.status, 'not_executed', 'a builder cannot approve policy changes');
  assert.equal((await compliance.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body.status, 'confirmed');
  // compliance may approve policy, but only an owner can hand out or take away ownership
  const toOwner = await builder.run('member.role.set', { memberId: viewer.memberId, role: 'owner' }, compliance);
  assert.equal(toOwner.status, 'not_executed');
  assert.match(toOwner.reason, /only an owner/);
  const inviteOwner = await builder.run('member.invite', { email: 'z@example.test', role: 'owner' }, compliance);
  assert.match(inviteOwner.reason, /only an owner/);
});

test('a workspace can never be left without an owner', { skip }, async () => {
  const owner = await signup(b);
  const self = await owner.run('member.role.set', { memberId: owner.memberId, role: 'viewer' });
  assert.equal(self.status, 'not_executed');
  assert.match(self.reason, /last owner/);
  assert.equal((await owner.run('member.remove', { memberId: owner.memberId })).status, 'not_executed');

  const second = await addMember(b, owner, 'owner');
  const demote = await owner.run('member.role.set', { memberId: owner.memberId, role: 'builder' });
  assert.equal(demote.status, 'confirmed', 'with two owners one may step down');
  const last = await second.run('member.role.set', { memberId: second.memberId, role: 'viewer' });
  assert.equal(last.status, 'not_executed');
  assert.match(last.reason, /last owner/);
  const remaining = (await second.tool('member.list')).result.members.filter((m: any) => m.role === 'owner' && m.status === 'active');
  assert.equal(remaining.length, 1);
});

test('two owners demoting each other at the same moment: exactly one succeeds', { skip }, async () => {
  const a = await signup(b), c = await addMember(b, a, 'owner');
  const p1 = await a.tool('member.role.set', { memberId: c.memberId, role: 'viewer' });
  const p2 = await c.tool('member.role.set', { memberId: a.memberId, role: 'viewer' });
  const [r1, r2] = await Promise.all([
    a.fetch('POST', `/v1/actions/${p1.actionId}/decide`, { approve: true }),
    c.fetch('POST', `/v1/actions/${p2.actionId}/decide`, { approve: true }),
  ]);
  const ok = [r1.body, r2.body].filter(r => r.status === 'confirmed');
  assert.equal(ok.length, 1, JSON.stringify([r1.body, r2.body]));
  const owners = await one<{ n: string }>(b.pool, "SELECT count(*) AS n FROM member WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'", [a.workspaceId]);
  assert.equal(owners!.n, '1');
});

test('removing a member ends their sessions and blocks sign-in', { skip }, async () => {
  const owner = await signup(b), op = await addMember(b, owner, 'operator');
  assert.equal((await op.fetch('GET', '/v1/me')).status, 200);
  assert.equal((await owner.run('member.remove', { memberId: op.memberId })).status, 'confirmed');
  assert.equal((await op.fetch('GET', '/v1/me')).status, 401);
  assert.equal((await owner.fetch('POST', '/v1/login', { email: op.email, password: 'another long password' })).status, 401);
});

test('API key: shown once, works as a Bearer token, only its hash is stored, refused after revoke', { skip }, async () => {
  const owner = await signup(b);
  const prop = await owner.tool('apikey.create', { name: 'CRM sync', expiresInDays: 30 });
  assert.equal(prop.status, 'needs_approval');
  const done = (await owner.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed');
  assert.equal(done.result.token, undefined, 'the approval receipt carries no token');

  const colleague = await addMember(b, owner, 'builder');
  assert.equal((await colleague.tool('secret.reveal', { revealId: done.result.revealId })).status, 'not_executed', 'only the person who approved can read it');
  const shown = await owner.tool('secret.reveal', { revealId: done.result.revealId });
  assert.equal(shown.status, 'confirmed');
  const token: string = shown.result.token;
  assert.match(token, /^vp_[0-9a-f]{8}_/);
  assert.equal((await owner.tool('secret.reveal', { revealId: done.result.revealId })).status, 'not_executed', 'not shown a second time');

  const secret = token.split('_').slice(2).join('_');
  const row = await one<{ hash: string; prefix: string }>(b.pool, 'SELECT hash, prefix FROM api_key WHERE id = $1', [done.result.id]);
  assert.equal(row!.hash, sha(secret));
  assert.ok(!row!.hash.includes(secret));
  const leak = await one(b.pool, 'SELECT 1 FROM action WHERE workspace_id = $1 AND (args::text LIKE $2 OR result::text LIKE $2)', [owner.workspaceId, `%${secret}%`]);
  assert.equal(leak, null);
  const boxes = await one<{ n: string }>(b.pool, "SELECT count(*) AS n FROM secret_box WHERE workspace_id = $1 AND purpose = 'reveal' AND meta->>'label' = 'API key CRM sync'", [owner.workspaceId]);
  assert.equal(boxes!.n, '0', 'the held copy is gone once read');

  const key = new (owner.constructor as any)(b.base, { bearer: token }, undefined, owner.workspaceId);
  const me = await key.fetch('GET', '/v1/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.via, 'key');
  const list = await key.tool('apikey.list');
  assert.equal(list.status, 'confirmed');
  assert.equal(list.result.keys.length, 1);
  assert.ok(!JSON.stringify(list).includes(secret) && !('hash' in list.result.keys[0]));
  assert.equal((await key.tool('workspace.get')).result.workspace.id, owner.workspaceId);
  assert.equal((await key.tool('secret.reveal', { revealId: done.result.revealId })).status, 'not_executed');

  assert.equal((await owner.tool('apikey.revoke', { id: done.result.id })).status, 'confirmed');
  assert.equal((await key.fetch('GET', '/v1/me')).status, 401, 'refused after revoke');
  const wrong = new (owner.constructor as any)(b.base, { bearer: token.slice(0, -2) + 'xx' }, undefined, owner.workspaceId);
  assert.equal((await wrong.fetch('GET', '/v1/me')).status, 401);
});
