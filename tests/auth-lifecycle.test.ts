import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { authenticate, requireUser } from '../lib/server/auth';
import { db, type Database } from '../lib/server/db';
import { HttpError } from '../lib/server/http';
import { accountFlags, accountStatus, changeAccountPassword, genericEmailResponse, redeemAccountToken, requestAccountEmail } from '../lib/auth-lifecycle/service';
import { azureHeaders, deliveryConfig, dispatchAccountMail } from '../lib/auth-lifecycle/delivery';
import { unseal, digest } from '../lib/auth-lifecycle/crypto';
import { allowAccountAttempt } from '../lib/auth-lifecycle/limiter';
import { inviteMember, updateMember } from '../lib/team/service';
import { joinInvitation } from '../lib/server/auth';

process.env.SQLITE_PATH = ':memory:'; delete process.env.DATABASE_URL;
Object.assign(process.env, { NODE_ENV: 'development', APP_URL: 'http://localhost:3000', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', AUTH_LIFECYCLE_KEY: '42'.repeat(32), AUTH_DEV_MAIL_OUTBOX: resolve('data/test-auth-mail-unused'), AUTH_TRUSTED_IP_HEADER: 'x-test-client-ip' });
const password = 'fictional old password';
const request = (cookie = '', path = '/api/account/status') => new Request(`http://localhost:3000${path}`, { headers: { cookie, origin: 'http://localhost:3000', 'x-test-client-ip': randomUUID() } });
async function owner() { return authenticate({ mode: 'register', email: `${randomUUID()}@example.test`, password }, request()); }
async function tokenFor(email: string, purpose: 'verify' | 'reset' = 'reset') {
  const id = await requestAccountEmail(email, purpose, request()); assert.ok(id);
  const [row] = await (await db()).all('SELECT data FROM entities WHERE id = ?', [id]);
  const mail = unseal<{ url: string }>(JSON.parse(String(row.data)));
  const token = new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token')!;
  assert.equal(new URL(mail.url).search, ''); assert.match(token, /^[a-f0-9]{64}$/);
  return { token, mailId: id };
}
const status = (expected: number) => (error: unknown) => error instanceof HttpError && error.status === expected;

test('recovery token is hashed, mail is encrypted, single use and sessions are revoked', async () => {
  const account = await owner(), { token } = await tokenFor(account.user.email), database = await db();
  const rows = await database.all('SELECT data FROM entities WHERE organization_id = ? AND kind LIKE ?', [account.user.organizationId, 'auth:%']);
  assert.ok(!JSON.stringify(rows).includes(token));
  await redeemAccountToken(token, 'reset', 'fictional new password');
  await assert.rejects(requireUser(request(account.cookie)), status(401));
  await assert.rejects(redeemAccountToken(token, 'reset', 'another fictional password'), status(410));
  await assert.rejects(authenticate({ mode: 'login', email: account.user.email, password }, request()), status(401));
  assert.ok((await authenticate({ mode: 'login', email: account.user.email, password: 'fictional new password' }, request())).cookie.includes('SameSite=Lax'));
});

test('concurrent redemption commits only once', async () => {
  const account = await owner(), { token } = await tokenFor(account.user.email);
  const results = await Promise.allSettled([redeemAccountToken(token, 'reset', 'replacement one password'), redeemAccountToken(token, 'reset', 'replacement two password')]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected').length, 1);
});

test('purpose separation, expiry and invalid tokens leave credentials unchanged', async () => {
  const account = await owner(), { token } = await tokenFor(account.user.email, 'verify'), database = await db();
  await assert.rejects(redeemAccountToken(token, 'reset', 'replacement password'), status(410));
  const id = `auth:token:${digest(token)}`, [row] = await database.all('SELECT data FROM entities WHERE id = ?', [id]);
  await database.run('UPDATE entities SET data = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(String(row.data)), expiresAt: '2000-01-01T00:00:00.000Z' }), id]);
  await assert.rejects(redeemAccountToken(token, 'verify'), status(410));
  await assert.rejects(redeemAccountToken('bad', 'verify'), status(410));
  assert.ok(await authenticate({ mode: 'login', email: account.user.email, password }, request()));
});

test('required verification blocks workspace but allows status and verification', async () => {
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
  try {
    const account = await owner(); assert.equal(account.user.verificationRequired, true);
    await assert.rejects(requireUser(request(account.cookie, '/api/platform')), status(403));
    assert.equal((await requireUser(request(account.cookie))).id, account.user.id);
    const { token } = await tokenFor(account.user.email, 'verify'); await redeemAccountToken(token, 'verify');
    assert.equal((await requireUser(request(account.cookie, '/api/platform'))).emailVerified, true);
    await assert.rejects(redeemAccountToken(token, 'verify'), status(410));
  } finally { process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false'; }
});

test('legacy account is exempt without falsely claiming email verification; status GET does not mutate', async () => {
  const account = await owner(), database = await db();
  await database.run('DELETE FROM entities WHERE id = ?', [`auth:account:${account.user.id}`]);
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
  try { assert.deepEqual(await accountFlags(account.user), { emailVerified: false, verificationRequired: false }); await accountStatus(account.user); }
  finally { process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false'; }
  assert.equal((await database.all('SELECT id FROM entities WHERE id = ?', [`auth:account:${account.user.id}`])).length, 0);
});

test('removed member recovery cannot revive membership or issue session', async () => {
  const account = await owner(), email = `${randomUUID()}@example.test`, invite = await inviteMember(account.user, email, 'operator');
  const member = await joinInvitation({ email, token: invite.token, password }, request());
  const { token } = await tokenFor(email); await updateMember(account.user, member.user.id, 'remove');
  await assert.rejects(redeemAccountToken(token, 'reset', 'replacement password'), status(410));
  assert.equal(await requestAccountEmail(email, 'reset', request()), undefined);
  await assert.rejects(authenticate({ mode: 'login', email, password }, request()), status(403));
});

test('password change works for viewer personal security and revokes pending links', async () => {
  const account = await owner(), email = `${randomUUID()}@example.test`, invite = await inviteMember(account.user, email, 'viewer');
  const member = await joinInvitation({ email, token: invite.token, password }, request());
  const { token } = await tokenFor(email); const req = request(member.cookie, '/api/account/password');
  await changeAccountPassword(await requireUser(req), req, password, 'replacement password');
  await assert.rejects(redeemAccountToken(token, 'reset', 'other replacement password'), status(410));
  await assert.rejects(requireUser(req), status(401));
  assert.equal((await authenticate({ mode: 'login', email, password: 'replacement password' }, request())).user.role, 'viewer');
});

test('failed atomic commit does not consume recovery token or change password', async () => {
  const account = await owner(), { token } = await tokenFor(account.user.email), database = await db();
  const original = database.batch.bind(database);
  database.batch = async statements => { if (statements.some(item => item.sql.startsWith('UPDATE users SET password_hash = ?'))) throw new Error('injected database failure'); await original(statements); };
  try { await assert.rejects(redeemAccountToken(token, 'reset', 'replacement password')); } finally { database.batch = original; }
  assert.ok(await authenticate({ mode: 'login', email: account.user.email, password }, request()));
  await redeemAccountToken(token, 'reset', 'replacement password');
});

test('login which verified an old password cannot establish a session after password reset', async () => {
  const account = await owner(), { token } = await tokenFor(account.user.email), database = await db();
  const original = database.batch.bind(database); let injected = false;
  database.batch = async statements => {
    if (!injected && statements.some(item => item.sql.startsWith('INSERT INTO auth_sessions'))) { injected = true; await redeemAccountToken(token, 'reset', 'replacement password'); }
    await original(statements);
  };
  try { await assert.rejects(authenticate({ mode: 'login', email: account.user.email, password }, request())); }
  finally { database.batch = original; }
  assert.equal((await database.all('SELECT token_hash FROM auth_sessions WHERE user_id = ?', [account.user.id])).length, 0);
});

test('password change cannot use an already revoked session even after initial authentication', async () => {
  const account = await owner(), req = request(account.cookie), user = await requireUser(req), database = await db();
  await database.run('DELETE FROM auth_sessions WHERE user_id = ?', [user.id]);
  await assert.rejects(changeAccountPassword(user, req, password, 'replacement password'));
  assert.ok(await authenticate({ mode: 'login', email: user.email, password }, request()));
});

test('durable email and global limits store no raw email or client address', async () => {
  const email = `${randomUUID()}@example.test`, req = request();
  const results = []; for (let i = 0; i < 7; i++) results.push(await allowAccountAttempt(email, req));
  assert.deepEqual(results, [true, true, true, true, true, false, false]);
  const rows = await (await db()).all('SELECT id,status FROM service_heartbeats WHERE service = ?', ['auth:limit']);
  assert.ok(!JSON.stringify(rows).includes(email)); assert.ok(!JSON.stringify(rows).includes(req.headers.get('x-test-client-ip')!));
  assert.deepEqual(genericEmailResponse, { ok: true, message: 'If this account is eligible, a single-use link will be sent. Check your inbox, or contact your workspace administrator if it does not arrive.' });
  assert.equal(await requestAccountEmail('missing@example.test', 'reset', request()), undefined);
});

test('bad encryption key fails closed without issuing a token; production cannot use local outbox', async () => {
  const account = await owner(), previous = process.env.AUTH_LIFECYCLE_KEY;
  process.env.AUTH_LIFECYCLE_KEY = 'invalid';
  try { assert.equal(await requestAccountEmail(account.user.email, 'reset', request()), undefined); }
  finally { process.env.AUTH_LIFECYCLE_KEY = previous; }
  Object.assign(process.env, { NODE_ENV: 'production', AUTH_REQUIRE_EMAIL_VERIFICATION: 'true' });
  try { assert.throws(deliveryConfig); await assert.rejects(owner(), status(503)); }
  finally { Object.assign(process.env, { NODE_ENV: 'development', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' }); }
});

test('global limiter allows only one remaining slot under concurrent distinct requests', async () => {
  const database = await db(), id = `auth:limit:global:${Math.floor(Date.now() / 3600000)}`;
  const [original] = await database.all('SELECT status FROM service_heartbeats WHERE id = ?', [id]);
  await database.run('UPDATE service_heartbeats SET status = ? WHERE id = ?', ['199', id]);
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => allowAccountAttempt(`${randomUUID()}@example.test`, request())));
    assert.equal(results.filter(Boolean).length, 1);
    const [row] = await database.all('SELECT status FROM service_heartbeats WHERE id = ?', [id]); assert.equal(row.status, '200');
  } finally { await database.run('UPDATE service_heartbeats SET status = ? WHERE id = ?', [String(original.status), id]); }
});

test('Azure signature matches independent fixture; uncertain delivery is claimed only once', async () => {
  const url = new URL('https://fixture.communication.azure.com/emails:send?api-version=2023-03-31'), key = Buffer.alloc(32, 7).toString('base64'), body = '{}', date = 'Sun, 27 Sep 2026 12:00:00 GMT';
  const headers = azureHeaders(url, body, key, date);
  assert.equal(headers['x-ms-content-sha256'], 'RBNvo1WzZ4oRRq0W9+hknpT7T8If536DEMBg9hyq/4o=');
  const signature = createHmac('sha256', Buffer.alloc(32, 7)).update('POST\n/emails:send?api-version=2023-03-31\nSun, 27 Sep 2026 12:00:00 GMT;fixture.communication.azure.com;RBNvo1WzZ4oRRq0W9+hknpT7T8If536DEMBg9hyq/4o=').digest('base64');
  assert.ok(headers.Authorization.endsWith(signature));
  const account = await owner(), { mailId } = await tokenFor(account.user.email), originalFetch = globalThis.fetch;
  Object.assign(process.env, { APP_URL: 'https://workspace.example.test', AZURE_COMMUNICATION_EMAIL_ENDPOINT: url.origin, AZURE_COMMUNICATION_EMAIL_ACCESS_KEY: key, AZURE_COMMUNICATION_EMAIL_SENDER: 'no-reply@example.test' }); delete process.env.AUTH_DEV_MAIL_OUTBOX;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('injected transport timeout'); };
  try {
    await Promise.all([dispatchAccountMail(mailId), dispatchAccountMail(mailId)]); await dispatchAccountMail(mailId);
    assert.equal(calls, 1);
    const [mail] = await (await db()).all('SELECT status,data FROM entities WHERE id = ?', [mailId]); assert.equal(mail.status, 'uncertain'); assert.equal(mail.data, '{}');
  } finally { globalThis.fetch = originalFetch; Object.assign(process.env, { APP_URL: 'http://localhost:3000', AUTH_DEV_MAIL_OUTBOX: resolve('data/test-auth-mail-unused') }); delete process.env.AZURE_COMMUNICATION_EMAIL_ENDPOINT; delete process.env.AZURE_COMMUNICATION_EMAIL_ACCESS_KEY; delete process.env.AZURE_COMMUNICATION_EMAIL_SENDER; }
});
