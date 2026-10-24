// Enterprise identity and audit: OIDC single sign-on (against a local fake IdP with in-process keys, never a real one),
// "SSO required" with a break-glass owner, SCIM-lite provisioning tokens, and the signed audit export.
// The verifier tests need no database; the rest run against Postgres and skip when DATABASE_URL is unset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
process.env.VP_OIDC_ALLOW_PRIVATE = '1';
import { FakeIdp } from './oidc-fake.ts';
import { OidcError, clearOidcCaches, verifyIdToken } from '../server/modules/workspace/oidc.ts';
import { csvCell, isPrivileged, applyAuditRetention } from '../server/modules/workspace/audit-export.ts';
import { appendAudit, verifyAudit } from '../server/audit.ts';
import { one, tx } from '../server/db.ts';
import { addMember, boot, Client, skip, signup, type Booted } from './workspace-helpers.ts';

let idp: FakeIdp;
let b: Booted;
before(async () => { idp = await new FakeIdp().start(); if (!skip) b = await boot(); });
after(async () => { idp?.close(); await b?.close(); });

const want = (nonce = 'n-1') => ({ issuer: idp.issuer, clientId: idp.clientId, nonce, jwksUri: `${idp.issuer}/jwks` });
async function refused(token: string, code: string, w = want()) {
  await assert.rejects(verifyIdToken(token, w), (e: unknown) => e instanceof OidcError && e.code === code, `expected ${code}`);
}

// ---- the ID token verifier ----------------------------------------------------------------------------------------

test('verifier: a good RS256 and ES256 token pass', async () => {
  clearOidcCaches();
  const c = await verifyIdToken(idp.token(idp.claimsFor('n-1')), want());
  assert.equal(c.sub, 'user-1');
  const e = await verifyIdToken(idp.token(idp.claimsFor('n-1'), { alg: 'ES256' }), want());
  assert.equal(e.email, 'alice@acme-test.example');
});

test('verifier: wrong iss, aud, exp, nonce are each refused', async () => {
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { iss: 'https://evil.example' })), 'wrong_iss');
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { aud: 'some-other-client' })), 'wrong_aud');
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { aud: ['some-other-client', idp.clientId] })), 'wrong_aud');  // several audiences, no azp
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { azp: 'some-other-client' })), 'wrong_aud');
  const now = Math.floor(Date.now() / 1000);
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { exp: now - 120 })), 'expired');
  await refused(idp.token(idp.claimsFor('n-1', idp.person, {}), { drop: ['exp'] }), 'expired');
  await refused(idp.token(idp.claimsFor('n-1', idp.person, { iat: now + 3600 })), 'bad_iat');
  await refused(idp.token(idp.claimsFor('someone-elses-nonce')), 'wrong_nonce');
  await refused(idp.token(idp.claimsFor('n-1'), { drop: ['nonce'] }), 'wrong_nonce');
});

test('verifier: alg none, HS256 alg confusion, an unknown kid and a tampered signature are refused', async () => {
  await refused(idp.token(idp.claimsFor('n-1'), { alg: 'none' }), 'bad_alg');
  await refused(idp.token(idp.claimsFor('n-1'), { alg: 'HS256' }), 'bad_alg');
  await refused(idp.token(idp.claimsFor('n-1'), { kid: 'not-a-published-key' }), 'unknown_kid');
  await refused(idp.token(idp.claimsFor('n-1'), { kid: 'ec-1' }), 'unknown_kid');      // an RSA-signed token pointing at the EC key
  await refused(idp.token(idp.claimsFor('n-1'), { tamper: true }), 'bad_signature');
  const t = idp.token(idp.claimsFor('n-1')).split('.');
  const forged = Buffer.from(JSON.stringify({ ...idp.claimsFor('n-1'), sub: 'admin' })).toString('base64url');
  await refused(`${t[0]}.${forged}.${t[2]}`, 'bad_signature');
  await refused('not.a-jwt', 'malformed');
});

// ---- helpers for the browser flow ---------------------------------------------------------------------------------

const ip = () => ({ 'x-forwarded-for': randomUUID() });
const cookiesOf = (h: Headers) => h.getSetCookie().map(c => c.split(';')[0]);

/** Drive one SSO sign-in through the real routes and the fake IdP. Returns where the server sent the browser. */
async function ssoLogin(workspaceId: string, o: { swapStateCookie?: boolean; replay?: boolean; session?: string; callbackWorkspace?: string; iss?: string } = {}) {
  const start = await fetch(`${b.base}/v1/sso/start`, { method: 'POST', headers: { ...ip(), 'content-type': 'application/json', ...(o.session ? { cookie: o.session } : {}) },
    body: JSON.stringify({ workspaceId }) });
  assert.equal(start.status, 200, await start.clone().text());
  const url = (await start.json() as { url: string }).url;
  const stateCookie = cookiesOf(start.headers).find(c => c.startsWith('vp_sso_state='))!;
  const authz = await fetch(url, { redirect: 'manual' });
  assert.equal(authz.status, 302, 'the fake IdP accepted the authorization request');
  const cb = new URL(authz.headers.get('location')!);
  if (o.callbackWorkspace) cb.pathname = `/v1/sso/callback/${o.callbackWorkspace}`;
  if (o.iss) cb.searchParams.set('iss', o.iss);
  const callback = cb.toString();
  const cookie = o.swapStateCookie ? 'vp_sso_state=' + 'x'.repeat(stateCookie.length - 13) : stateCookie;
  const res = await fetch(callback, { redirect: 'manual', headers: { cookie, ...ip() } });
  const out = { status: res.status, location: res.headers.get('location') ?? '', session: cookiesOf(res.headers).find(c => c.startsWith('vp_session=') && c.length > 12), authorizeUrl: new URL(url), callback, cookie };
  let replay: { status: number; location: string } | undefined;
  if (o.replay) {
    const again = await fetch(callback, { redirect: 'manual', headers: { cookie, ...ip() } });
    replay = { status: again.status, location: again.headers.get('location') ?? '' };
  }
  return { ...out, replay };
}

async function configureSso(owner: Client, o: { domains?: string[]; defaultRole?: string; emailVerified?: string } = {}) {
  const st = await owner.tool('sso.secret.stage', { clientSecret: idp.clientSecret });
  assert.equal(st.status, 'confirmed', JSON.stringify(st));
  const set = await owner.run('sso.config.set', { issuer: idp.issuer, clientId: idp.clientId, stashId: st.result.stashId, allowedDomains: o.domains ?? [`${randomUUID().slice(0, 8)}.acme-test.example`],
    defaultRole: o.defaultRole ?? 'viewer', ...(o.emailVerified ? { emailVerified: o.emailVerified } : {}) });
  assert.equal(set.status, 'confirmed', JSON.stringify(set));
  return set.result;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
/** The export file as text (Client.fetch would parse a one-line JSON-lines file as JSON). */
const fileText = async (c: Client, path: string) => (await fetch(b.base + path, { headers: { cookie: c.auth.cookie!, ...ip() } })).text();
const ledger = (ws: string, action: string) => b.pool.query('SELECT actor_id, payload FROM audit_event WHERE workspace_id = $1 AND action = $2 ORDER BY created_at', [ws, action]).then(r => r.rows);

// ---- SSO end to end -----------------------------------------------------------------------------------------------

test('SSO: config is A2 and keeps the secret sealed; test connection reads discovery and keys; PKCE + state + nonce reach the IdP', { skip }, async () => {
  const owner = await signup(b, 'SSO Co');
  const prop = await owner.tool('sso.config.set', { issuer: idp.issuer, clientId: idp.clientId, allowedDomains: ['x.acme-test.example'], defaultRole: 'viewer' });
  assert.equal(prop.status, 'needs_approval', 'changing how people sign in waits for an approval');
  const cfg = await configureSso(owner);
  assert.equal(cfg.hasClientSecret, true);
  const got = await owner.tool('sso.config.get');
  assert.ok(!JSON.stringify(got).includes(idp.clientSecret), 'the client secret is never read back');
  const leak = await one(b.pool, `SELECT 1 FROM action WHERE workspace_id = $1 AND (args::text LIKE $2 OR result::text LIKE $2)
    UNION ALL SELECT 1 FROM audit_event WHERE workspace_id = $1 AND payload::text LIKE $2
    UNION ALL SELECT 1 FROM sso_config WHERE workspace_id = $1 AND client_secret_ciphertext LIKE $2`, [owner.workspaceId, `%${idp.clientSecret}%`]);
  assert.equal(leak, null, 'the client secret is not in clear in actions, the ledger or the config row');

  const t = await owner.tool('sso.test', {});
  assert.equal(t.status, 'confirmed');
  assert.equal(t.result.ok, true, JSON.stringify(t.result.checks));
  assert.ok(t.result.checks.some((c: any) => c.name === 'Signing keys' && /2 published/.test(c.detail)));
  const bad = await owner.tool('sso.test', { issuer: idp.issuer + '/not-here' });
  assert.equal(bad.result.ok, false, 'a wrong issuer fails the test');

  const viewer = await addMember(b, owner, 'viewer');
  assert.equal((await viewer.tool('sso.config.set', { issuer: idp.issuer, clientId: 'x', allowedDomains: ['a.example'], defaultRole: 'viewer' })).status, 'not_executed', 'only an owner proposes SSO changes');

  idp.person = { sub: 'pkce-check', email: `pk@${cfg.allowedDomains[0]}`, name: 'P K' };
  const r = await ssoLogin(owner.workspaceId!);
  const q = r.authorizeUrl.searchParams;
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.match(q.get('code_challenge')!, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(q.get('state')!.length >= 40 && q.get('nonce')!.length >= 30);
  assert.equal(r.status, 302);
  assert.equal(r.location, '/');
  assert.ok(r.session, 'a session cookie was set');
  const stored = await one<{ n: number }>(b.pool, 'SELECT count(*)::int AS n FROM sso_login WHERE state_hash = $1', [createHash('sha256').update(q.get('state')!).digest('hex')]);
  assert.equal(stored!.n, 1, 'only the hash of the state is stored');
});

test('SSO: first sign-in provisions just in time with the default role; the second finds the same person; both are audited', { skip }, async () => {
  const owner = await signup(b, 'JIT Co');
  const cfg = await configureSso(owner, { defaultRole: 'operator' });
  const sub = 'jit-' + randomUUID();
  idp.person = { sub, email: `Alice.${sub.slice(4, 10)}@${cfg.allowedDomains[0]}`, name: 'Alice JIT' };
  const first = await ssoLogin(owner.workspaceId!);
  assert.equal(first.location, '/');
  const me = await new Client(b.base, { cookie: first.session }).fetch('GET', '/v1/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.member.role, 'operator', 'the admin\'s default role');
  assert.equal(me.body.member.email, idp.person.email.toLowerCase());
  const second = await ssoLogin(owner.workspaceId!);
  const me2 = await new Client(b.base, { cookie: second.session }).fetch('GET', '/v1/me');
  assert.equal(me2.body.member.id, me.body.member.id, 'identity is (issuer, sub): the same person, not a new one');
  assert.equal((await ledger(owner.workspaceId!, 'member.jit_provision')).length, 1);
  assert.equal((await ledger(owner.workspaceId!, 'auth.sso.login')).length, 2);
  assert.equal(await verifyAudit(b.pool, owner.workspaceId!), null);
});

test('SSO: a domain mismatch, an unverified email, a bad token and a forged or replayed state are refused and nobody is added', { skip }, async () => {
  const owner = await signup(b, 'Refuse Co');
  const cfg = await configureSso(owner);
  const ws = owner.workspaceId!;
  const members = async () => (await one<{ n: number }>(b.pool, 'SELECT count(*)::int AS n FROM member WHERE workspace_id = $1', [ws]))!.n;
  const n0 = await members();

  idp.person = { sub: 'mallory', email: 'mallory@other-company.example', name: 'Mallory' };
  const dm = await ssoLogin(ws);
  assert.equal(dm.location, '/signin?sso_error=domain_mismatch');
  assert.equal(dm.session, undefined);

  idp.person = { sub: 'unverified', email: `u@${cfg.allowedDomains[0]}`, name: 'U' };
  idp.next = { claims: { email_verified: false } };
  assert.equal((await ssoLogin(ws)).location, '/signin?sso_error=email_unverified');
  idp.next = { drop: ['email_verified'] };
  assert.equal((await ssoLogin(ws)).location, '/signin?sso_error=email_unverified', 'no claim at all is not verified unless the admin said so');

  for (const [next, code] of [[{ claims: { aud: 'another-app' } }, 'wrong_aud'], [{ claims: { iss: 'https://evil.example' } }, 'wrong_iss'],
    [{ claims: { exp: Math.floor(Date.now() / 1000) - 600 } }, 'expired'], [{ claims: { nonce: 'replayed-from-elsewhere' } }, 'wrong_nonce'],
    [{ alg: 'none' }, 'bad_alg'], [{ kid: 'rotated-away' }, 'unknown_kid']] as const) {
    idp.person = { sub: 'tok-' + code, email: `t-${code.replace('_', '')}@${cfg.allowedDomains[0]}`, name: 'T' };
    idp.next = next as any;
    assert.equal((await ssoLogin(ws)).location, `/signin?sso_error=${code}`, code);
  }
  idp.next = {};

  idp.person = { sub: 'forger', email: `f@${cfg.allowedDomains[0]}`, name: 'F' };
  const swapped = await ssoLogin(ws, { swapStateCookie: true });
  assert.equal(swapped.location, '/signin?sso_error=state_mismatch', 'a sign-in started in another browser cannot be finished here');
  const replay = await ssoLogin(ws, { replay: true });
  assert.equal(replay.location, '/');
  assert.equal(replay.replay!.location, '/signin?sso_error=expired', 'a state works once');

  assert.equal(await members(), n0 + 1, 'only the one good sign-in added a person');
  const failed = (await ledger(ws, 'auth.sso.failed')).map(r => r.payload.reason);
  for (const code of ['domain_mismatch', 'email_unverified', 'wrong_aud', 'wrong_iss', 'expired', 'wrong_nonce', 'bad_alg', 'unknown_kid']) assert.ok(failed.includes(code), `${code} is in the ledger`);
});

test('SSO: an email that belongs to another workspace is not taken over; a deactivated member stays out', { skip }, async () => {
  const other = await signup(b, 'Other Co');
  const owner = await signup(b, 'Main Co');
  const cfg = await configureSso(owner);
  await b.pool.query('UPDATE member SET email = $2 WHERE id = $1', [other.memberId, `taken@${cfg.allowedDomains[0]}`]);
  idp.person = { sub: 'taker', email: `taken@${cfg.allowedDomains[0]}`, name: 'T' };
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/signin?sso_error=email_elsewhere');

  idp.person = { sub: 'leaver', email: `leaver@${cfg.allowedDomains[0]}`, name: 'L' };
  const ok = await ssoLogin(owner.workspaceId!);
  assert.equal(ok.location, '/');
  await b.pool.query("UPDATE member SET status = 'disabled' WHERE workspace_id = $1 AND sso_subject LIKE '%|leaver'", [owner.workspaceId]);
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/signin?sso_error=deactivated');
});

test('SSO: a domain claimed by one workspace cannot be claimed by another', { skip }, async () => {
  const a = await signup(b, 'A Co'), c = await signup(b, 'C Co');
  const cfg = await configureSso(a);
  const st = await c.tool('sso.secret.stage', { clientSecret: 'synthetic-other' });
  const r = await c.run('sso.config.set', { issuer: idp.issuer, clientId: 'c-client', stashId: st.result.stashId, allowedDomains: cfg.allowedDomains, defaultRole: 'viewer' });
  assert.equal(r.status, 'not_executed');
  assert.match(r.reason, /already used for sign-in by another workspace/);
  const d = await a.fetch('POST', '/v1/sso/discover', { email: `someone@${cfg.allowedDomains[0]}` });
  assert.deepEqual([d.body.sso, d.body.workspaceId], [true, a.workspaceId]);
  assert.equal((await a.fetch('POST', '/v1/sso/discover', { email: 'x@unclaimed.example' })).body.sso, false);
});

// ---- SSO required, break glass ------------------------------------------------------------------------------------

test('SSO required: password sign-in is off except one break-glass owner, whose sign-in is audited; password sessions end; invites cannot make passwords', { skip }, async () => {
  const owner = await signup(b, 'Req Co');
  const builder = await addMember(b, owner, 'builder', 'Bea Builder');
  await configureSso(owner);
  const noBg = await owner.run('sso.required.set', { required: true });
  assert.equal(noBg.status, 'not_executed');
  assert.match(noBg.reason, /break-glass/);
  const notOwner = await owner.run('sso.required.set', { required: true, breakGlassMemberId: builder.memberId });
  assert.match(notOwner.reason, /must be an active owner/);

  const inv = await owner.run('member.invite', { email: `late-${randomUUID().slice(0, 6)}@example.test`, role: 'viewer' });
  const invToken = (await owner.tool('secret.reveal', { revealId: inv.result.revealId })).result.token;

  const on = await owner.run('sso.required.set', { required: true, breakGlassMemberId: owner.memberId });
  assert.equal(on.status, 'confirmed', JSON.stringify(on));
  assert.ok(on.result.endedSessions >= 1, 'the builder\'s password session ended');
  assert.equal((await builder.fetch('GET', '/v1/me')).status, 401, 'the builder is signed out at once');
  assert.equal((await owner.fetch('GET', '/v1/me')).status, 200, 'the break-glass owner keeps their session');

  assert.ok(on.result.passwordsCleared >= 1);
  const pw = await builder.fetch('POST', '/v1/login', { email: builder.email, password: 'another long password' });
  const wrong = await builder.fetch('POST', '/v1/login', { email: builder.email, password: 'not the password at all' });
  assert.deepEqual([pw.status, wrong.status], [401, 401], 'the right and a wrong password read the same: the login is no password oracle');
  const hash = await one<{ h: string | null }>(b.pool, 'SELECT password_hash AS h FROM member WHERE id = $1', [builder.memberId]);
  assert.equal(hash!.h, null, 'everyone but the break-glass owner lost their password');

  const bg = await owner.fetch('POST', '/v1/login', { email: owner.email, password: 'correct horse battery' });
  assert.equal(bg.status, 200);
  assert.equal(bg.body.breakGlass, true);
  const rows = await ledger(owner.workspaceId!, 'auth.break_glass_login');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, owner.memberId);
  const method = await one<{ method: string }>(b.pool, "SELECT method FROM session WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1", [owner.memberId]);
  assert.equal(method!.method, 'break_glass');

  // A break-glass owner who stops being an owner loses the exemption, even before anyone edits the SSO settings.
  await b.pool.query("UPDATE member SET role = 'compliance' WHERE id = $1", [owner.memberId]);
  const demoted = await owner.fetch('POST', '/v1/login', { email: owner.email, password: 'correct horse battery' });
  assert.deepEqual([demoted.status, demoted.body.error?.code], [403, 'sso_required']);
  await b.pool.query("UPDATE member SET role = 'owner' WHERE id = $1", [owner.memberId]);

  const acc = await owner.fetch('POST', '/v1/invites/accept', { token: invToken, name: 'Late', password: 'a long password!' });
  assert.equal(acc.status, 403, 'an invite cannot be used to make a password while SSO is required');
  assert.equal(acc.body.error.code, 'sso_required');

  const disable = await owner.run('sso.config.set', { issuer: idp.issuer, clientId: idp.clientId, allowedDomains: ['z.acme-test.example'], defaultRole: 'viewer', enabled: false });
  assert.match(disable.reason, /turn off "SSO required"/);
  const off = await owner.run('sso.required.set', { required: false });
  assert.equal(off.result.ssoRequired, false);
  assert.equal((await builder.fetch('POST', '/v1/login', { email: builder.email, password: 'another long password' })).status, 401, 'a cleared password is not restored');
  assert.equal(await verifyAudit(b.pool, owner.workspaceId!), null);
});

test('review fixes: a code is redeemable only at its own workspace\'s return address; an iss naming another IdP is refused; a GET or cross-site start is refused', { skip }, async () => {
  const victim = await signup(b, 'Victim Co'), attacker = await signup(b, 'Attacker Co');
  const cfg = await configureSso(victim);
  idp.person = { sub: 'mixup', email: `m@${cfg.allowedDomains[0]}`, name: 'M' };
  assert.equal((await ssoLogin(victim.workspaceId!, { callbackWorkspace: attacker.workspaceId })).location, '/signin?sso_error=state_mismatch');
  assert.equal((await ssoLogin(victim.workspaceId!, { iss: 'https://attacker-idp.example' })).location, '/signin?sso_error=wrong_iss');
  const ok = await ssoLogin(victim.workspaceId!, { iss: idp.issuer });
  assert.equal(ok.location, '/');
  assert.match(ok.authorizeUrl.searchParams.get('redirect_uri')!, new RegExp(`/v1/sso/callback/${victim.workspaceId}$`));
  assert.equal((await fetch(`${b.base}/v1/sso/start?workspace=${victim.workspaceId}`, { redirect: 'manual', headers: ip() })).status, 404, 'no GET start: no open redirect, no link-triggered sign-in');
  const form = await fetch(`${b.base}/v1/sso/start`, { method: 'POST', headers: { ...ip(), 'content-type': 'text/plain' }, body: JSON.stringify({ workspaceId: victim.workspaceId }) });
  assert.equal(form.status, 415, 'a cross-site form cannot start a sign-in');
  const xs = await fetch(`${b.base}/v1/sso/start`, { method: 'POST', headers: { ...ip(), 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ workspaceId: victim.workspaceId }) });
  assert.equal(xs.status, 403);
});

test('review fixes: an existing account links only on a verified email, an owner only from their own session, and Google needs a managed domain', { skip }, async () => {
  const owner = await signup(b, 'Link Co');
  const cfg = await configureSso(owner, { emailVerified: 'not_required' });
  const dom = cfg.allowedDomains[0];
  const ownerEmail = `boss@${dom}`;
  await b.pool.query('UPDATE member SET email = $2 WHERE id = $1', [owner.memberId, ownerEmail]);
  const op = await addMember(b, owner, 'operator');
  const opEmail = `ops@${dom}`;
  await b.pool.query('UPDATE member SET email = $2 WHERE id = $1', [op.memberId, opEmail]);

  idp.person = { sub: 'nooauth', email: opEmail, name: 'X' };
  idp.next = { drop: ['email_verified'] };
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/signin?sso_error=link_unverified', 'not_required admits new people, never takes over an account');
  idp.next = {};
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/', 'a verified email links the operator');

  idp.person = { sub: 'boss-sub', email: ownerEmail, name: 'Boss' };
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/signin?sso_error=link_required', 'an owner is not linked by email alone');
  const linked = await ssoLogin(owner.workspaceId!, { session: owner.auth.cookie });
  assert.equal(linked.location, '/');
  const me = await new Client(b.base, { cookie: linked.session }).fetch('GET', '/v1/me');
  assert.equal(me.body.member.id, owner.memberId, 'linked from inside the owner\'s own session');

  idp.person = { sub: 'new-unverified', email: `fresh@${dom}`, name: 'F' };
  idp.next = { drop: ['email_verified'] };
  assert.equal((await ssoLogin(owner.workspaceId!)).location, '/', 'not_required still admits a brand-new person');
  idp.next = {};

  const { admit } = await import('../server/modules/workspace/sso.ts');
  const g = { workspace_id: owner.workspaceId!, issuer: 'https://accounts.google.com', allowed_domains: [dom], email_verified: 'required', default_role: 'viewer' } as any;
  await tx(b.pool, async c => {
    await assert.rejects(admit(c, g, { iss: g.issuer, sub: 'g1', aud: 'x', exp: 0, email: `consumer@${dom}`, email_verified: true }), (e: any) => e.code === 'domain_mismatch', 'a consumer Google account with a company address');
    await assert.rejects(admit(c, g, { iss: g.issuer, sub: 'g2', aud: 'x', exp: 0, email: `w@${dom}`, email_verified: true, hd: 'elsewhere.example' }), (e: any) => e.code === 'domain_mismatch');
    const okG = await admit(c, g, { iss: g.issuer, sub: 'g3', aud: 'x', exp: 0, email: `w@${dom}`, email_verified: true, hd: dom });
    assert.equal(okG.jit, true);
    await c.query('ROLLBACK'); await c.query('BEGIN');
  });
});

test('review fixes: the approval card shows the full issuer, client and email rule with what they were; a purge of every row keeps the chain', { skip }, async () => {
  const owner = await signup(b, 'Card Co');
  const cfg = await configureSso(owner);
  const p = await owner.tool('sso.config.set', { issuer: idp.issuer + '/tenant-b', clientId: 'other-client', allowedDomains: cfg.allowedDomains, defaultRole: 'viewer', emailVerified: 'not_required' });
  assert.equal(p.status, 'needs_approval');
  assert.ok(p.summary.includes(`${idp.issuer}/tenant-b (was ${idp.issuer})`), p.summary);
  assert.ok(p.summary.includes(`other-client (was ${idp.clientId})`), p.summary);
  assert.ok(p.summary.includes('verified by the IdP: no (was yes)'), p.summary);

  const quiet = await signup(b, 'Quiet Co');
  await b.pool.query("UPDATE audit_event SET created_at = created_at - interval '400 days' WHERE workspace_id = $1", [quiet.workspaceId]);
  assert.ok((await tx(b.pool, c => applyAuditRetention(c, quiet.workspaceId!))).purged >= 1);
  await tx(b.pool, c => appendAudit(c, { workspaceId: quiet.workspaceId!, actorType: 'system', action: 'after.purge' }));
  assert.equal(await verifyAudit(b.pool, quiet.workspaceId!), null, 'a workspace with nothing left after the purge still verifies');
});

// ---- SCIM-lite -----------------------------------------------------------------------------------------------------

async function scimToken(owner: Client, scopes: string[], name = 'IdP sync') {
  const c = await owner.run('scim.token.create', { name, scopes });
  assert.equal(c.status, 'confirmed', JSON.stringify(c));
  const shown = await owner.tool('secret.reveal', { revealId: c.result.revealId });
  return { id: c.result.id as string, token: shown.result.token as string };
}
const scim = (token: string, method: string, path: string, body?: unknown) => fetch(b.base + path, {
  method, headers: { authorization: `Bearer ${token}`, ...ip(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, body: await r.json() as any }));

test('SCIM: token scopes are enforced; a read token cannot write and a write token cannot re-role', { skip }, async () => {
  const owner = await signup(b, 'Scim Co');
  const prop = await owner.tool('scim.token.create', { name: 'r', scopes: ['members:read'] });
  assert.equal(prop.status, 'needs_approval', 'a provisioning token is a policy change');
  const read = await scimToken(owner, ['members:read'], 'read only');
  const write = await scimToken(owner, ['members:write'], 'write only');
  assert.match(read.token, /^vps_[0-9a-f]{8}_/);
  const stored = await one<{ hash: string }>(b.pool, 'SELECT hash FROM scim_token WHERE id = $1', [read.id]);
  assert.equal(stored!.hash, createHash('sha256').update(read.token.split('_').slice(2).join('_')).digest('hex'), 'only the hash is stored');

  const list = await scim(read.token, 'GET', '/v1/scim/members');
  assert.equal(list.status, 200);
  assert.equal(list.body.members.length, 1);
  assert.equal((await scim(read.token, 'POST', '/v1/scim/members', { email: 'x@example.test', role: 'viewer' })).status, 403, 'members:read cannot create');
  assert.equal((await scim(write.token, 'GET', '/v1/scim/members')).status, 403, 'members:write cannot list');

  const email = `scim-${randomUUID().slice(0, 6)}@example.test`;
  const made = await scim(write.token, 'POST', '/v1/scim/members', { email, name: 'Sam Scim', role: 'operator' });
  assert.equal(made.status, 201);
  assert.equal(made.body.member.role, 'operator');
  assert.equal((await scim(write.token, 'POST', '/v1/scim/members', { email, role: 'operator' })).status, 409);
  assert.equal((await scim(write.token, 'POST', '/v1/scim/members', { email: 'o@example.test', role: 'owner' })).status, 422, 'a token can never make an owner');
  assert.equal((await scim(write.token, 'PATCH', `/v1/scim/members/${made.body.member.id}`, { role: 'builder' })).status, 403, 'members:write cannot change a role');
  assert.equal((await scim(write.token, 'PATCH', `/v1/scim/members/${owner.memberId}`, { active: false })).status, 403, 'owners are out of reach');

  const api = await owner.run('apikey.create', { name: 'k' });
  const key = (await owner.tool('secret.reveal', { revealId: api.result.revealId })).result.token;
  assert.equal((await scim(key, 'GET', '/v1/scim/members')).status, 401, 'an API key is not a provisioning token');
  const asTool = await new Client(b.base, { bearer: read.token }).fetch('POST', '/v1/tools/member.list', { args: {} });
  assert.equal(asTool.status, 401, 'a provisioning token cannot call tools');

  const rows = await ledger(owner.workspaceId!, 'scim.member.create');
  assert.equal(rows[0].actor_id, 'scim:' + write.id);
});

test('SCIM: deactivation ends the person\'s sessions at once; rotation kills the old secret; revoke kills the token; other workspaces are out of reach', { skip }, async () => {
  const owner = await signup(b, 'Deact Co');
  const op = await addMember(b, owner, 'operator', 'Omar Op');
  const t = await scimToken(owner, ['members:read', 'members:write', 'roles:write']);
  assert.equal((await op.fetch('GET', '/v1/me')).status, 200);
  const re = await scim(t.token, 'PATCH', `/v1/scim/members/${op.memberId}`, { role: 'viewer' });
  assert.equal(re.body.member.role, 'viewer');
  const de = await scim(t.token, 'PATCH', `/v1/scim/members/${op.memberId}`, { active: false });
  assert.equal(de.status, 200);
  assert.equal(de.body.member.status, 'deactivated');
  assert.ok(de.body.endedSessions >= 1);
  assert.equal((await op.fetch('GET', '/v1/me')).status, 401, 'the very next request is refused');
  assert.equal((await op.fetch('POST', '/v1/login', { email: op.email, password: 'another long password' })).status, 401, 'and they cannot sign back in');
  assert.equal((await scim(t.token, 'PATCH', `/v1/scim/members/${op.memberId}`, { active: true })).body.member.status, 'active');
  const removed = await addMember(b, owner, 'viewer', 'Removed Person');
  await owner.run('member.remove', { memberId: removed.memberId });
  assert.equal((await scim(t.token, 'PATCH', `/v1/scim/members/${removed.memberId}`, { active: true })).status, 403, 'someone an owner removed stays removed');
  const comp = await addMember(b, owner, 'compliance');
  assert.equal((await scim(t.token, 'PATCH', `/v1/scim/members/${comp.memberId}`, { active: false })).status, 403, 'compliance members are out of reach');
  assert.equal((await scim(t.token, 'PATCH', `/v1/scim/members/${op.memberId}`, { role: 'compliance' })).status, 422, 'a token cannot grant compliance');

  const rot = await owner.run('scim.token.rotate', { id: t.id });
  assert.equal(rot.status, 'confirmed');
  const fresh = (await owner.tool('secret.reveal', { revealId: rot.result.revealId })).result.token;
  assert.equal((await scim(t.token, 'GET', '/v1/scim/members')).status, 401, 'the old secret stops at once');
  assert.equal((await scim(fresh, 'GET', '/v1/scim/members')).status, 200);

  const stranger = await signup(b, 'Stranger Co');
  assert.equal((await scim(fresh, 'PATCH', `/v1/scim/members/${stranger.memberId}`, { active: false })).status, 404, 'another workspace\'s member is not found');
  assert.equal((await stranger.run('scim.token.revoke', { id: t.id })).status, 'not_executed');

  const rv = await owner.run('scim.token.revoke', { id: t.id });
  assert.equal(rv.status, 'confirmed');
  assert.equal((await scim(fresh, 'GET', '/v1/scim/members')).status, 401);
  for (const a of ['scim.member.role_set', 'scim.member.deactivate', 'scim.member.reactivate', 'scim.token.rotate', 'scim.token.revoke']) {
    assert.ok((await ledger(owner.workspaceId!, a)).length >= 1, `${a} is in the ledger`);
  }
});

// ---- audit export -------------------------------------------------------------------------------------------------

test('csvCell: formula starters are neutralised and quoting is RFC 4180', () => {
  for (const s of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) assert.ok(csvCell(s).replace(/^"/, '').startsWith("'"), s);
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell({ k: '=x' }), '"{""k"":""=x""}"', 'JSON payload cells start with a brace');
  assert.ok(isPrivileged('wallet.topup', { mode: 'A2', risk: 'spend' }));
  assert.ok(isPrivileged('agent.publish', { mode: 'A2', risk: 'external' }));
  assert.ok(isPrivileged('sso.config.set', {}));
  assert.ok(!isPrivileged('agent.draft', { mode: 'A1', risk: 'draft' }));
});

/** Minimal RFC 4180 parser for the test. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; } else cell += ch;
  }
  return rows;
}

test('audit export: A2 by an admin, privileged actions present, CSV cannot inject formulas, checksum and signature verify, downloads and exports are audited', { skip }, async () => {
  const owner = await signup(b, 'Export Co');
  const ws = owner.workspaceId!;
  const builder = await addMember(b, owner, 'builder');
  const comp = await addMember(b, owner, 'compliance', 'Chitra Compliance');
  await configureSso(owner);
  await owner.run('member.role.set', { memberId: builder.memberId, role: 'operator' });
  const k = await owner.run('apikey.create', { name: 'ci key' });
  await owner.run('apikey.rotate', { id: k.result.id });
  // Text an actor controls, crafted to run as a formula if a spreadsheet opened it raw.
  await tx(b.pool, c => appendAudit(c, { workspaceId: ws, actorType: 'system', actorId: '=cmd|\' /C calc\'!A0', action: 'test.injected',
    payload: { note: '+SUM(1,2)', other: '@x' } }));
  await tx(b.pool, c => appendAudit(c, { workspaceId: ws, actorType: 'system', actorId: '-2+3', action: '@evil' }));

  assert.equal((await builder.tool('audit.export', { format: 'csv', from: daysAgo(30), to: daysAgo(0) })).status, 'not_executed', 'a builder cannot export');
  const today = daysAgo(0);
  const prop = await comp.tool('audit.export', { format: 'csv', from: daysAgo(30), to: today });
  assert.equal(prop.status, 'needs_approval', 'an export waits for an approval');
  const done = (await owner.fetch('POST', `/v1/actions/${prop.actionId}/decide`, { approve: true })).body;
  assert.equal(done.status, 'confirmed', JSON.stringify(done));
  assert.ok(done.result.rows > 5);

  const dl = await comp.fetch('GET', done.result.download);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-type')!, /text\/csv/);
  const text: string = typeof dl.body === 'string' ? dl.body : JSON.stringify(dl.body);
  assert.equal(createHash('sha256').update(text).digest('hex'), done.result.sha256, 'the checksum covers the exact bytes');
  assert.equal(dl.headers.get('x-vp-export-sha256'), done.result.sha256);
  assert.equal(dl.headers.get('x-vp-export-signature'), done.result.signature);

  const rows = parseCsv(text);
  const header = rows[0];
  assert.deepEqual(header.slice(0, 6), ['at', 'id', 'actor_type', 'actor_id', 'actor_name', 'action']);
  for (const r of rows.slice(1)) for (const cell of r) assert.ok(!/^[=+\-@\t\r]/.test(cell), `a cell starts like a formula: ${cell.slice(0, 40)}`);
  const col = (n: string) => header.indexOf(n);
  const actions = rows.slice(1).map(r => r[col('action')]);
  for (const a of ['sso.secret.stage', 'sso.config.set', 'member.role.set', 'apikey.create', 'apikey.rotate', 'action.propose', 'member.invite']) assert.ok(actions.includes(a), `${a} is in the export`);
  assert.ok(actions.includes("'@evil"), 'the injected action name is escaped, not dropped');
  const approved = rows.slice(1).find(r => r[col('action')] === 'sso.config.set')!;
  assert.deepEqual([approved[col('mode')], approved[col('privileged')], approved[col('approver_role')]], ['A2', 'true', 'owner']);

  const v = await comp.tool('audit.export.verify', { exportId: done.result.exportId, sha256: done.result.sha256, signature: done.result.signature });
  assert.equal(v.result.valid, true);
  const forged = await comp.tool('audit.export.verify', { exportId: done.result.exportId, sha256: createHash('sha256').update(text + 'x').digest('hex'), signature: done.result.signature });
  assert.equal(forged.result.valid, false, 'an edited file does not verify');

  assert.equal((await builder.fetch('GET', done.result.download)).status, 403, 'only an owner or compliance member downloads');
  const stranger = await signup(b, 'Peek Co');
  assert.equal((await stranger.fetch('GET', done.result.download)).status, 404, 'another workspace cannot read it');
  assert.equal((await stranger.tool('audit.export.verify', { exportId: done.result.exportId, sha256: done.result.sha256, signature: done.result.signature })).result.valid, false);

  // The export and its download are themselves in the ledger, and so in the next export (JSON lines, privileged only).
  const again = await comp.run('audit.export', { format: 'jsonl', from: daysAgo(30), to: today, privilegedOnly: true }, owner);
  const lines = (await fileText(owner, again.result.download)).trim().split('\n').map(l => JSON.parse(l));
  assert.ok(lines.every(l => l.privileged === true));
  const acts = lines.map(l => l.action);
  for (const a of ['audit.export', 'audit.export.download', 'sso.config.set']) assert.ok(acts.includes(a), `${a} is in the second export`);
  assert.ok(!acts.includes('test.injected'), 'privilegedOnly leaves out unprivileged rows');
  const ex = lines.find(l => l.action === 'audit.export');
  assert.equal(ex.mode, 'A2');
  // A reader can re-walk the chain inside the file: every row's prev_hash is the hash of the row before it (in a full export).
  const full = await comp.run('audit.export', { format: 'jsonl', from: daysAgo(30), to: today }, owner);
  const all = (await fileText(owner, full.result.download)).trim().split('\n').map(l => JSON.parse(l));
  for (let i = 1; i < all.length; i++) assert.equal(all[i].prev_hash, all[i - 1].hash);
  assert.equal(await verifyAudit(b.pool, ws), null);
});

test('audit export: the date range filters, and retention purges old rows while the chain still verifies', { skip }, async () => {
  const owner = await signup(b, 'Retain Co');
  const ws = owner.workspaceId!;
  for (const a of ['old.one', 'old.two', 'kept.one']) await tx(b.pool, c => appendAudit(c, { workspaceId: ws, actorType: 'system', action: a }));
  // Shift, never set: rows keep their order, which the chain walk relies on.
  await b.pool.query("UPDATE audit_event SET created_at = created_at - interval '400 days' WHERE workspace_id = $1 AND action IN ('workspace.create','old.one','old.two')", [ws]);
  assert.equal(await verifyAudit(b.pool, ws), null, 'created_at is not part of a row hash');

  const before = await owner.run('audit.export', { format: 'jsonl', from: daysAgo(365), to: daysAgo(0) });
  assert.equal(before.status, 'confirmed', JSON.stringify(before));
  const seen = (await fileText(owner, before.result.download)).trim().split('\n').map(l => JSON.parse(l).action);
  assert.ok(!seen.includes('old.one'), 'rows past the 365-day retention are not exported even before the purge');
  const none = await owner.run('audit.export', { format: 'csv', from: daysAgo(300), to: daysAgo(2) });
  assert.equal(none.result.rows, 0, 'the range excludes everything newer');
  assert.equal((await owner.run('audit.export', { format: 'csv', from: '2020-01-01', to: '2022-02-01' })).reason, 'export at most 366 days at a time');

  const out = await tx(b.pool, c => applyAuditRetention(c, ws));
  assert.equal(out.purged, 3);
  assert.equal(await verifyAudit(b.pool, ws), null, 'the anchor keeps the chain verifiable after the purge');
  const anchor = await one<{ purged_rows: string }>(b.pool, 'SELECT purged_rows FROM audit_anchor WHERE workspace_id = $1', [ws]);
  assert.equal(Number(anchor!.purged_rows), 3);
  assert.equal((await ledger(ws, 'audit.retention.applied')).length, 1);
  await b.pool.query("UPDATE audit_event SET payload = '{\"x\":1}' WHERE workspace_id = $1 AND action = 'kept.one'", [ws]);
  assert.ok(await verifyAudit(b.pool, ws), 'tampering after a purge is still caught');

  // A 30-day retention policy is held to the 90-day floor for the audit log.
  await b.pool.query("INSERT INTO intake_retention_policy (workspace_id, version, policy) VALUES ($1, 1, '{\"audit_logs_days\": 30}')", [ws]);
  await tx(b.pool, c => appendAudit(c, { workspaceId: ws, actorType: 'system', action: 'sixty.days' }));
  await b.pool.query("UPDATE audit_event SET created_at = created_at - interval '60 days' WHERE workspace_id = $1 AND action = 'sixty.days'", [ws]);
  assert.equal((await tx(b.pool, c => applyAuditRetention(c, ws))).purged, 0, 'nothing younger than 90 days is purged');
});
