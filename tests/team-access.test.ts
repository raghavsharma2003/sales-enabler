import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authenticate, hashPassword, joinInvitation, requireUser, type AuthUser } from '../lib/server/auth';
import { db, WriteConflictError, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { acceptInvitation, activeWorkspaceOwner, getActiveMembership, invitationDetails, inviteMember, listTeam, operatorMembershipFence, ownerMembershipFence, requireWorkspaceOwner, revokeInvitation, updateMember } from '../lib/team/service';
import { GET as teamGet, POST as teamPost } from '../app/api/team/route';
import { POST as invitationPost } from '../app/api/team/invitations/route';
process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
const req = (cookie = '', method = 'GET', path = '/api/workspace') => new Request(`http://localhost:3000${path}`, { method, headers: { cookie, origin: 'http://localhost:3000' } });
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const password = 'fictional test password';
async function owner() { return authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password }, req()); }
async function invite(owner: AuthUser, role: string) {
  const email = `${randomUUID()}@example.test`, invitation = await inviteMember(owner, email, role);
  const accepted = await joinInvitation({ token: invitation.token, email, password }, req());
  return { ...accepted, invitation, email };
}
test('registration creates owner claim atomically; member roles enforce ordinary and provider access', async () => {
  const founder = await owner(); assert.equal(founder.user.role, 'owner');
  const viewer = await invite(founder.user, 'viewer'), operator = await invite(founder.user, 'operator');
  assert.equal((await requireUser(req(viewer.cookie))).role, 'viewer');
  for (const path of ['/api/platform', '/api/voice/connect', '/api/brain/answer', '/api/voice/preview', '/api/evaluations']) await assert.rejects(requireUser(req(viewer.cookie, 'POST', path)), status(403));
  assert.equal((await requireUser(req(operator.cookie, 'POST', '/api/contacts'))).role, 'operator');
  await assert.rejects(requireUser(req(operator.cookie, 'GET', '/api/integrations/oauth/callback')), status(403));
  await assert.rejects(inviteMember(operator.user, 'someone@example.test', 'owner'), status(403));
  assert.deepEqual((await listTeam(viewer.user)).invitations, []);
});
test('demotion affects existing sessions; last owner protected; ownership never transfers automatically', async () => {
  const founder = await owner(), second = await invite(founder.user, 'owner');
  await updateMember(second.user, founder.user.id, 'role', 'viewer');
  await assert.rejects(requireUser(req(founder.cookie, 'POST')), status(403));
  await assert.rejects(requireWorkspaceOwner(founder.user), status(403));
  assert.equal((await activeWorkspaceOwner(founder.user.organizationId)).id, second.user.id);
  await assert.rejects(updateMember(second.user, second.user.id, 'remove'), status(409));
  await assert.rejects(updateMember(second.user, second.user.id, 'role', 'operator'), status(409));
  assert.equal((await getActiveMembership(founder.user)).role, 'viewer');
});
test('removal deletes sessions and prevents password login until explicitly invited again', async () => {
  const founder = await owner(), member = await invite(founder.user, 'operator');
  await updateMember(founder.user, member.user.id, 'remove');
  await assert.rejects(requireUser(req(member.cookie)), status(401));
  await assert.rejects(authenticate({ mode: 'login', email: member.email, password }, req()), status(403));
  const invitation = await inviteMember(founder.user, member.email, 'viewer');
  const restored = await joinInvitation({ token: invitation.token, email: member.email, password }, req());
  assert.equal(restored.user.id, member.user.id); assert.equal(restored.user.role, 'viewer');
});
test('invitation possession cannot attach a different signed-in email or another organization', async () => {
  const founder = await owner(), other = await owner(), email = `${randomUUID()}@example.test`, invitation = await inviteMember(founder.user, email, 'operator');
  await assert.rejects(joinInvitation({ token: invitation.token, email, password }, req(other.cookie)), status(403));
  await assert.rejects(joinInvitation({ token: invitation.token, email: 'wrong@example.test', password }, req()), status(403));
  await assert.rejects(inviteMember(founder.user, other.user.email, 'viewer'), status(409));
  // Account created elsewhere after issuance must still fail acceptance.
  const account = await authenticate({ mode: 'register', email, password }, req());
  await assert.rejects(joinInvitation({ token: invitation.token, email, password }, req(account.cookie)), status(403));
  assert.equal((await invitationDetails(invitation.token)).invite.status, 'pending');
});
test('invite links are hashed, expiring, revocable and single-use', async () => {
  const founder = await owner(), email = `${randomUUID()}@example.test`, invitation = await inviteMember(founder.user, email, 'operator');
  const database = await db(), [row] = await database.all('SELECT data FROM entities WHERE id = ?', [invitation.id]);
  assert.ok(!String(row.data).includes(invitation.token));
  assert.ok(!JSON.stringify(await listTeam(founder.user)).includes('tokenHash'));
  await revokeInvitation(founder.user, invitation.id); await assert.rejects(invitationDetails(invitation.token), status(410));
  const expiring = await inviteMember(founder.user, email, 'viewer');
  const [stored] = await database.all('SELECT data FROM entities WHERE id = ?', [expiring.id]);
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(stored.data)), expiresAt: '2000-01-01T00:00:00.000Z' }), expiring.id]);
  await assert.rejects(invitationDetails(expiring.token), status(410));
  const accepted = await invite(founder.user, 'viewer'); await assert.rejects(invitationDetails(accepted.invitation.token), status(410));
});
test('concurrent acceptance commits one member and one acceptance audit', async () => {
  const founder = await owner(), email = `${randomUUID()}@example.test`, invitation = await inviteMember(founder.user, email, 'operator'), hash = await hashPassword(password);
  const outcomes = await Promise.allSettled([acceptInvitation(invitation.token, email, hash), acceptInvitation(invitation.token, email, hash)]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const database = await db(); assert.equal((await database.all('SELECT id FROM users WHERE email = ?', [email])).length, 1);
  assert.equal((await database.all('SELECT id FROM audit_events WHERE entity_id = ? AND event = ?', [invitation.id, 'team.invitation_accepted'])).length, 1);
});
test('simultaneous owner demotions preserve an active owner', async () => {
  const founder = await owner(), second = await invite(founder.user, 'owner');
  const outcomes = await Promise.allSettled([updateMember(founder.user, founder.user.id, 'role', 'operator'), updateMember(second.user, second.user.id, 'role', 'viewer')]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const current = await activeWorkspaceOwner(founder.user.organizationId);
  assert.equal((await listTeam(current)).members.filter(member => member.role === 'owner' && member.status === 'active').length, 1);
});
test('legacy migration preserves first-user owner and denies implicit access to later users', async () => {
  const database = await db(), org = randomUUID(), first: AuthUser = { id: randomUUID(), email: `${randomUUID()}@example.test`, organizationId: org }, later: AuthUser = { id: randomUUID(), email: `${randomUUID()}@example.test`, organizationId: org };
  await database.run('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)', [org, 'Fictional legacy workspace', '2020-01-01']);
  for (const [index, user] of [first, later].entries()) await database.run('INSERT INTO users (id, email, password_hash, organization_id, created_at) VALUES (?, ?, ?, ?, ?)', [user.id, user.email, 'unused', org, `2020-01-0${index + 1}`]);
  await assert.rejects(getActiveMembership(later), status(403)); assert.equal((await getActiveMembership(first)).role, 'owner');
  assert.equal((await activeWorkspaceOwner(org)).id, first.id);
});
test('HTTP team boundary enforces origin, owner privilege, safe responses and join replay', async () => {
  const founder = await owner(), operator = await invite(founder.user, 'operator');
  const post = (cookie: string, body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/team', { method: 'POST', headers: { cookie, origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const email = `${randomUUID()}@example.test`;
  assert.equal((await teamPost(post(founder.cookie, { action: 'invite', email, role: 'viewer' }, 'https://wrong.example'))).status, 403);
  assert.equal((await teamPost(post(operator.cookie, { action: 'invite', email, role: 'viewer' }))).status, 403);
  const response = await teamPost(post(founder.cookie, { action: 'invite', email, role: 'viewer' })); assert.equal(response.status, 201);
  const created = await response.json(); const token = new URL(created.inviteUrl).hash.slice(1); assert.match(token, /^[a-f0-9]{64}$/);
  const listing = await teamGet(req(founder.cookie, 'GET', '/api/team')); assert.equal(listing.status, 200); assert.ok(!(await listing.text()).includes(token));
  const accepted = await invitationPost(post('', { action: 'accept', token, email, password })); assert.equal(accepted.status, 200); assert.match(accepted.headers.get('set-cookie') || '', /HttpOnly/);
  assert.equal((await invitationPost(post('', { action: 'accept', token, email, password }))).status, 410);
});
test('login racing removal cannot persist a usable session for a removed account', async () => {
  const founder = await owner(), member = await invite(founder.user, 'operator');
  await Promise.allSettled([authenticate({ mode: 'login', email: member.email, password }, req()), updateMember(founder.user, member.user.id, 'remove')]);
  await assert.rejects(getActiveMembership(member.user), status(403));
  assert.equal((await (await db()).all('SELECT token_hash FROM auth_sessions WHERE user_id = ?', [member.user.id])).length, 0);
});
test('operator membership fence rolls back work after intervening demotion or removal', async () => {
  const founder = await owner(), database = await db();
  for (const action of ['role', 'remove'] as const) {
    const actor = await invite(founder.user, 'operator'), fence = await operatorMembershipFence(actor.user), marker = randomUUID();
    await updateMember(founder.user, actor.user.id, action, 'viewer');
    await assert.rejects(database.batch([
      { sql: 'INSERT INTO entities (id, organization_id, kind, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [marker, founder.user.organizationId, 'test:protected-write', 'pending', '{}', new Date().toISOString()] },
      fence,
    ]), WriteConflictError);
    assert.equal((await database.all('SELECT id FROM entities WHERE id = ?', [marker])).length, 0);
    await assert.rejects(operatorMembershipFence(actor.user), status(403));
  }
});
test('membership fence validates the exact injected-database row without an authorization reread gap', async () => {
  const founder = await owner(), actor = await invite(founder.user, 'operator'), database = await db();
  let membershipReads = 0;
  const injected: Database = {
    async all(sql, params) {
      const rows = await database.all(sql, params);
      if (sql.startsWith('SELECT e.data FROM entities e JOIN users')) {
        membershipReads++;
        await updateMember(founder.user, actor.user.id, 'role', 'viewer');
      }
      return rows as never;
    },
    run: (sql, params) => database.run(sql, params), batch: statements => database.batch(statements),
  };
  const fence = await operatorMembershipFence(actor.user, injected);
  assert.equal(membershipReads, 1);
  await assert.rejects(database.batch([fence]), WriteConflictError);
});
test('owner fence rejects owner demotion while a fresh operator fence accepts the current role', async () => {
  const founder = await owner(), actor = await invite(founder.user, 'owner'), database = await db();
  const fence = await ownerMembershipFence(actor.user, database);
  await updateMember(founder.user, actor.user.id, 'role', 'operator');
  await assert.rejects(database.batch([fence]), WriteConflictError);
  await assert.rejects(ownerMembershipFence(actor.user), status(403));
  await database.batch([await operatorMembershipFence(actor.user)]);
  const outsider = await owner();
  await assert.rejects(operatorMembershipFence({ ...actor.user, organizationId: outsider.user.organizationId }), status(403));
});
test('restoring a role in the same timestamp cannot revive an older membership fence', async () => {
  const founder = await owner(), actor = await invite(founder.user, 'operator'), database = await db(), fence = await operatorMembershipFence(actor.user);
  const [original] = await database.all('SELECT data FROM entities WHERE id = ?', [`team:member:${actor.user.id}`]);
  await updateMember(founder.user, actor.user.id, 'role', 'viewer');
  await updateMember(founder.user, actor.user.id, 'role', 'operator');
  const [restored] = await database.all('SELECT data FROM entities WHERE id = ?', [`team:member:${actor.user.id}`]);
  const value = JSON.parse(String(restored.data)); value.updatedAt = JSON.parse(String(original.data)).updatedAt;
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify(value), `team:member:${actor.user.id}`]);
  await assert.rejects(database.batch([fence]), WriteConflictError);
  await database.batch([await operatorMembershipFence(actor.user)]);
});
