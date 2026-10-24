// Single sign-on with OpenID Connect (Entra ID, Okta, Google Workspace and any standard IdP). Per workspace: issuer,
// client id, a client secret sealed like every other secret here, the email domains that may sign in, and the role a
// first-time person gets. The flow is authorization code + PKCE (S256) with state and nonce: the state is a random
// value held in an HttpOnly cookie on /v1/sso and stored only as sha256, so a sign-in can finish once, in the browser
// that started it, within 10 minutes. The ID token is checked in oidc.ts.
//
// Who the person is: (issuer, sub), never the email. The email decides two things: its domain must be one the workspace
// allows (on every sign-in, not just the first), and it links an existing member of this workspace the first time, but
// only when the IdP says it is verified (or the admin set "not required" for an IdP that never sends the claim).
// A first-time person gets the admin's default role, never owner. A deactivated member stays out.
//
// "SSO required" turns password sign-in off (kernel /v1/login) except for one break-glass owner, whose sign-ins are
// audited; everyone else's password is cleared and their password sessions end.
import type pg from 'pg';
import { label } from '../../labels.ts';
import type { Router } from '../../http.ts';
import { HttpError, type Req } from '../../http.ts';
import { SetupError } from '../../setup-error.ts';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one, tx } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { createSession, sessionCookie, type Caller } from '../../auth.ts';
import { arr, bool, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { STASH_TTL_MS } from './common.ts';
import { open, randomToken, seal, sha256 } from './crypto.ts';
import { OidcError, checkOidcUrl, discover, discoveryUrl, exchangeCode, jwks, verifyIdToken, type IdClaims } from './oidc.ts';
import { createHash, timingSafeEqual } from 'node:crypto';

export const SSO_ROLES = ['builder', 'operator', 'compliance', 'viewer'] as const;
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOGIN_TTL_MS = 10 * 60_000;
const STATE_COOKIE = 'vp_sso_state';

interface Config { workspace_id: string; issuer: string; client_id: string; client_secret_ciphertext: string; allowed_domains: string[]; default_role: string;
  email_verified: 'required' | 'not_required'; enabled: boolean; sso_required: boolean; break_glass_member_id: string | null; version: number; updated_at: Date }

const loadConfig = (q: pg.Pool | pg.PoolClient, ws: string) => one<Config>(q, 'SELECT * FROM sso_config WHERE workspace_id = $1', [ws]);

/** Where the IdP sends the browser back: one address per workspace, so a code can only ever be redeemed for the workspace
 *  whose IdP issued it (IdP mix-up defence, with the callback's iss check). VP_PUBLIC_URL in production; the request's own
 *  host only outside it. */
export function redirectUri(workspaceId: string, req?: Req): string {
  const base = process.env.VP_PUBLIC_URL ?? (process.env.NODE_ENV !== 'production' && req?.headers.host ? `http://${req.headers.host}` : null);
  if (!base) throw new SetupError('Single sign-on is not available on this server yet: its public address is not set up.', 'public_url_missing',
    'set VP_PUBLIC_URL to the address people reach this server on (the SSO return address is <VP_PUBLIC_URL>/v1/sso/callback)');
  return base.replace(/\/+$/, '') + '/v1/sso/callback/' + workspaceId;
}

export const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

function view(c: Config | null) {
  if (!c) return { configured: false as const };
  return { configured: true as const, issuer: c.issuer, clientId: c.client_id, hasClientSecret: !!c.client_secret_ciphertext, allowedDomains: c.allowed_domains,
    defaultRole: c.default_role, emailVerified: c.email_verified, enabled: c.enabled, ssoRequired: c.sso_required, breakGlassMemberId: c.break_glass_member_id,
    version: c.version, updatedAt: c.updated_at, discoveryUrl: discoveryUrl(c.issuer), redirectUri: (() => { try { return redirectUri(c.workspace_id); } catch { return null; } })() };
}

const issuerV = str({ min: 8, max: 300, desc: 'the issuer URL exactly as the IdP publishes it, e.g. https://login.microsoftonline.com/<tenant>/v2.0' });

/** The checks the test-connection button runs: discovery, issuer match, the three endpoints, the key set. */
async function testConnection(issuer: string): Promise<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[]; endpoints?: Record<string, string> }> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  try { checkOidcUrl(issuer, 'the issuer'); checks.push({ name: 'Issuer address', ok: true, detail: 'https on a public host' }); }
  catch (e) { checks.push({ name: 'Issuer address', ok: false, detail: (e as Error).message }); return { ok: false, checks }; }
  let d;
  try { d = await discover(issuer, { fresh: true }); checks.push({ name: 'Discovery document', ok: true, detail: `read from ${discoveryUrl(issuer)}; the issuer matches` }); }
  catch (e) { checks.push({ name: 'Discovery document', ok: false, detail: (e as Error).message }); return { ok: false, checks }; }
  const pkce = Array.isArray(d.code_challenge_methods_supported) ? (d.code_challenge_methods_supported as string[]).includes('S256') : null;
  checks.push({ name: 'PKCE (S256)', ok: pkce !== false, detail: pkce === null ? 'not advertised; most providers accept it anyway' : pkce ? 'supported' : 'the provider says it does not support S256' });
  const algs = Array.isArray(d.id_token_signing_alg_values_supported) ? (d.id_token_signing_alg_values_supported as string[]) : [];
  const usable = algs.filter(a => ['RS256', 'PS256', 'ES256'].includes(a));
  checks.push({ name: 'Signing algorithm', ok: !algs.length || usable.length > 0, detail: usable.length ? usable.join(', ') : algs.length ? `only ${algs.join(', ')}, none accepted here` : 'not advertised' });
  try {
    const keys = await jwks(d.jwks_uri, { fresh: true });
    const sig = keys.filter(k => !k.use || k.use === 'sig');
    checks.push({ name: 'Signing keys', ok: sig.length > 0, detail: sig.length ? `${sig.length} published` : 'the key set is empty' });
  } catch (e) { checks.push({ name: 'Signing keys', ok: false, detail: (e as Error).message }); }
  return { ok: checks.every(c => c.ok), checks, endpoints: { authorization: d.authorization_endpoint, token: d.token_endpoint, jwks: d.jwks_uri } };
}

export function registerSso(r: Registry) {
  r.register(tool(obj({}), {
    name: 'sso.config.get', risk: 'read', summary: 'Read this workspace\'s single sign-on settings (never the client secret)',
    run: async ctx => view(await loadConfig(ctx.q as pg.PoolClient, ctx.workspaceId)),
  }));

  r.register(tool(obj({ clientSecret: str({ min: 1, max: 2000 }) }), {
    name: 'sso.secret.stage', risk: 'draft', roles: ['owner'], summary: 'Hand over the SSO client secret; it is encrypted and held until the settings are saved',
    run: async (ctx, i) => {
      await ctx.q.query('DELETE FROM secret_box WHERE workspace_id = $1 AND expires_at < now()', [ctx.workspaceId]);
      const row = await one<{ id: string }>(ctx.q,
        `INSERT INTO secret_box (workspace_id, member_id, purpose, ciphertext, meta, expires_at) VALUES ($1,$2,'stash',$3,$4, now() + ($5 || ' milliseconds')::interval) RETURNING id`,
        [ctx.workspaceId, ctx.actor.id?.startsWith('key:') ? null : ctx.actor.id ?? null, seal(ctx.workspaceId, 'stash', JSON.stringify({ clientSecret: i.clientSecret })), { kind: 'sso' }, String(STASH_TTL_MS)]);
      return { stashId: row!.id, note: 'Now save the settings with sso.config.set and this stashId. The secret cannot be read back.' };
    },
  }));

  r.register(tool(obj({
    issuer: issuerV, clientId: str({ min: 1, max: 300 }), stashId: opt(uuid()),
    allowedDomains: arr(str({ min: 3, max: 253 }), { min: 1, max: 20 }), defaultRole: str({ oneOf: SSO_ROLES }),
    emailVerified: opt(str({ oneOf: ['required', 'not_required'] as const })), enabled: opt(bool()),
  }), {
    name: 'sso.config.set', risk: 'policy', roles: ['owner'], summary: 'Set how people sign in to this workspace with single sign-on',
    // The card names everything an approver must see to catch a hostile change: the full issuer (a different tenant on the same
    // host), the client, the domains, the email-verification rule, and what each was before.
    describe: async (i, ctx) => {
      const cur = await loadConfig(ctx.q as pg.PoolClient, ctx.workspaceId);
      const was = (now: string, before: string | undefined) => (cur && before !== undefined && before !== now ? `${now} (was ${before})` : now);
      const ev = i.emailVerified ?? cur?.email_verified ?? 'required';
      return `Single sign-on with issuer ${was(i.issuer, cur?.issuer)}, client ${was(i.clientId, cur?.client_id)}, for ${was(i.allowedDomains.join(', '), cur?.allowed_domains.join(', '))}; `
        + `new people join as ${was(i.defaultRole, cur?.default_role)}; email must be verified by the IdP: ${was(ev === 'required' ? 'yes' : 'no', cur ? (cur.email_verified === 'required' ? 'yes' : 'no') : undefined)}`
        + `${i.enabled === false ? '; saved switched off' : ''}${i.stashId ? '; the client secret is replaced' : ''}`;
    },
    version: async ctx => String((await one<{ version: number }>(ctx.q, 'SELECT version FROM sso_config WHERE workspace_id = $1', [ctx.workspaceId]))?.version ?? 0),
    run: async (ctx, i) => {
      checkOidcUrl(i.issuer, 'the issuer');
      const domains = [...new Set(i.allowedDomains.map(d => d.trim().toLowerCase().replace(/^@/, '')))];
      const bad = domains.filter(d => !DOMAIN.test(d));
      if (bad.length) throw new Error(`not an email domain: ${bad.join(', ')}`);
      const cur = await one<Config>(ctx.q, 'SELECT * FROM sso_config WHERE workspace_id = $1 FOR UPDATE', [ctx.workspaceId]);
      if (cur?.sso_required && i.enabled === false) throw new Error('turn off "SSO required" before switching single sign-on off, or nobody but the break-glass owner can sign in');
      let secretCt = cur?.client_secret_ciphertext ?? null;
      if (i.stashId) {
        const stash = await one<{ ciphertext: string; meta: { kind?: string } }>(ctx.q,
          "DELETE FROM secret_box WHERE id = $1 AND workspace_id = $2 AND purpose = 'stash' AND expires_at > now() RETURNING ciphertext, meta", [i.stashId, ctx.workspaceId]);
        if (!stash || stash.meta.kind !== 'sso') throw new Error('the client secret was not found or has expired; hand it over again with sso.secret.stage');
        const { clientSecret } = JSON.parse(open(ctx.workspaceId, 'stash', stash.ciphertext)) as { clientSecret: string };
        secretCt = seal(ctx.workspaceId, 'sso', clientSecret);
      }
      if (!secretCt) throw new Error('the first save needs the client secret: hand it over with sso.secret.stage, then pass its stashId');
      // A domain routes sign-ins to one workspace. Claimed first come (open.2026-10-24.sso-domain-verification).
      const taken = await many<{ domain: string }>(ctx.q, 'SELECT domain FROM sso_domain WHERE domain = ANY($1) AND workspace_id <> $2', [domains, ctx.workspaceId]);
      if (taken.length) throw new Error(`already used for sign-in by another workspace: ${taken.map(t => t.domain).join(', ')}. Contact Vyakti support to prove the domain is yours`);
      await ctx.q.query('DELETE FROM sso_domain WHERE workspace_id = $1 AND NOT (domain = ANY($2))', [ctx.workspaceId, domains]);
      await ctx.q.query('INSERT INTO sso_domain (domain, workspace_id) SELECT unnest($1::text[]), $2 ON CONFLICT (domain) DO NOTHING', [domains, ctx.workspaceId]);
      const row = await one<Config>(ctx.q,
        `INSERT INTO sso_config (workspace_id, issuer, client_id, client_secret_ciphertext, allowed_domains, default_role, email_verified, enabled, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (workspace_id) DO UPDATE SET issuer = $2, client_id = $3, client_secret_ciphertext = $4, allowed_domains = $5, default_role = $6,
           email_verified = $7, enabled = $8, updated_by = $9, version = sso_config.version + 1, updated_at = now()
         RETURNING *`,
        [ctx.workspaceId, i.issuer, i.clientId, secretCt, domains, i.defaultRole, i.emailVerified ?? cur?.email_verified ?? 'required', i.enabled ?? true, ctx.actor.id ?? ctx.actor.type]);
      // A changed issuer or client must never finish a sign-in started under the old one.
      await ctx.q.query('DELETE FROM sso_login WHERE workspace_id = $1', [ctx.workspaceId]);
      return { ...view(row), secretReplaced: !!i.stashId, from: cur ? { issuer: cur.issuer, clientId: cur.client_id, allowedDomains: cur.allowed_domains, defaultRole: cur.default_role } : null };
    },
  }));

  r.register(tool(obj({ issuer: opt(issuerV) }), {
    name: 'sso.test', risk: 'test', roles: ['owner', 'compliance'],
    summary: 'Test a single sign-on connection: read the IdP\'s discovery document and signing keys (signs nobody in)',
    prepare: async (ctx, i) => {
      const issuer = i.issuer ?? (await loadConfig(ctx.pool, ctx.workspaceId))?.issuer;
      if (!issuer) throw new Error('enter an issuer, or save the single sign-on settings first');
      return { issuer, ...(await testConnection(issuer)) };
    },
    run: async (_ctx, _i, prepared) => prepared as Awaited<ReturnType<typeof testConnection>> & { issuer: string },
  }));

  r.register(tool(obj({ required: bool(), breakGlassMemberId: opt(uuid()) }), {
    name: 'sso.required.set', risk: 'policy', roles: ['owner'],
    summary: 'Require single sign-on for everyone except one break-glass owner (other passwords are cleared), or allow passwords again',
    describe: async (i, ctx) => i.required
      ? `Require single sign-on; only ${i.breakGlassMemberId ? await label(ctx, 'member', i.breakGlassMemberId) : 'no one'} may still sign in with a password (break glass); everyone else's password is cleared and their password sessions end now`
      : 'Allow password sign-in again alongside single sign-on',
    version: async ctx => {
      const c = await one<{ v: string }>(ctx.q, "SELECT version || ':' || sso_required || ':' || enabled || ':' || coalesce(break_glass_member_id::text, '') AS v FROM sso_config WHERE workspace_id = $1", [ctx.workspaceId]);
      return c?.v ?? null;
    },
    run: async (ctx, i) => {
      const c = await one<Config>(ctx.q, 'SELECT * FROM sso_config WHERE workspace_id = $1 FOR UPDATE', [ctx.workspaceId]);
      if (!c) throw new Error('set up single sign-on first');
      if (!i.required) {
        await ctx.q.query('UPDATE sso_config SET sso_required = false, break_glass_member_id = NULL, updated_at = now(), updated_by = $2 WHERE workspace_id = $1', [ctx.workspaceId, ctx.actor.id ?? ctx.actor.type]);
        return { ssoRequired: false, endedSessions: 0, note: 'Passwords cleared while single sign-on was required stay cleared; those people keep signing in with single sign-on.' };
      }
      if (!c.enabled) throw new Error('single sign-on is switched off; switch it on first');
      if (!i.breakGlassMemberId) throw new Error('name one owner as the break-glass account: the only one who can still sign in with a password if the IdP is down');
      const bg = await one<{ role: string; status: string; password_hash: string | null }>(ctx.q, 'SELECT role, status, password_hash FROM member WHERE id = $1 AND workspace_id = $2', [i.breakGlassMemberId, ctx.workspaceId]);
      if (!bg || bg.role !== 'owner' || bg.status !== 'active') throw new Error('the break-glass account must be an active owner of this workspace');
      if (!bg.password_hash) throw new Error('the break-glass owner has no password set, so they could not sign in when it matters');
      await ctx.q.query('UPDATE sso_config SET sso_required = true, break_glass_member_id = $2, updated_at = now(), updated_by = $3 WHERE workspace_id = $1', [ctx.workspaceId, i.breakGlassMemberId, ctx.actor.id ?? ctx.actor.type]);
      // Everyone else's password goes: a kept hash would let the login answer (403 vs 401) confirm a guessed password.
      const cleared = await ctx.q.query('UPDATE member SET password_hash = NULL WHERE workspace_id = $1 AND id <> $2 AND password_hash IS NOT NULL', [ctx.workspaceId, i.breakGlassMemberId]);
      const ended = await ctx.q.query(`DELETE FROM session s USING member m WHERE m.id = s.member_id AND m.workspace_id = $1 AND s.method IN ('password','break_glass') AND m.id <> $2`, [ctx.workspaceId, i.breakGlassMemberId]);
      return { ssoRequired: true, breakGlassMemberId: i.breakGlassMemberId, endedSessions: ended.rowCount ?? 0, passwordsCleared: cleared.rowCount ?? 0 };
    },
  }));
}

// ---- the browser flow -----------------------------------------------------------------------------------------------

const b64url = (b: Buffer) => b.toString('base64url');
const challenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest());

function cookie(req: Req, name: string): string | undefined {
  for (const part of String(req.headers['cookie'] ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

const stateCookie = (v: string, maxAge: number) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${STATE_COOKIE}=${v}; HttpOnly; SameSite=Lax; Path=/v1/sso; Max-Age=${maxAge}${secure}`;
};

/** Browser routes answer with a redirect to the sign-in page carrying a short error code, never a JSON page. */
const back = (code: string, extra: Record<string, string> = {}) => ({ status: 302, headers: { location: `/signin?sso_error=${encodeURIComponent(code)}`, 'cache-control': 'no-store', ...extra }, body: {} });

const failures = new Map<string, { n: number; until: number }>();
function throttle(key: string, max = 30) {
  const now = Date.now(), a = failures.get(key);
  if (a && a.until > now && a.n >= max) throw new HttpError(429, 'slow_down', 'too many attempts; try again in a few minutes');
  failures.set(key, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 15 * 60_000 });
}

export interface SsoOutcome { memberId: string; workspaceId: string; jit: boolean; linked: boolean }

/** Decide who signed in, inside the transaction that also creates the session. Throws OidcError with a short code. */
export async function admit(c: pg.PoolClient, cfg: Config, claims: IdClaims, linkMemberId?: string): Promise<SsoOutcome> {
  const ws = cfg.workspace_id;
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new OidcError('no_email', 'the IdP did not send an email address');
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const emailOk = verified || (cfg.email_verified === 'not_required' && claims.email_verified !== false && claims.email_verified !== 'false');
  if (!emailOk) throw new OidcError('email_unverified', 'the IdP says this email address is not verified');
  if (!cfg.allowed_domains.includes(domainOf(email))) throw new OidcError('domain_mismatch', 'this email domain is not allowed to sign in to this workspace');
  // Google's issuer is shared by every Google account: a consumer account registered with a company address passes the email
  // check, so the hosted domain (hd) must be one of the workspace's domains too.
  if (cfg.issuer === 'https://accounts.google.com' && !(typeof claims.hd === 'string' && cfg.allowed_domains.includes(claims.hd.toLowerCase()))) {
    throw new OidcError('domain_mismatch', 'this Google account is not managed by an allowed Google Workspace domain');
  }
  const subject = `${claims.iss}|${claims.sub}`;
  // One lock per email across workspaces: the "one email, one workspace" check below cannot race (SCIM takes the same lock).
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['member-email:' + email]);
  const bySub = await one<{ id: string; status: string }>(c, 'SELECT id, status FROM member WHERE workspace_id = $1 AND sso_subject = $2 FOR UPDATE', [ws, subject]);
  if (bySub) {
    if (bySub.status !== 'active') throw new OidcError('deactivated', 'this account was deactivated in this workspace');
    return { memberId: bySub.id, workspaceId: ws, jit: false, linked: false };
  }
  const byEmail = await one<{ id: string; status: string; sso_subject: string | null; role: string }>(c, 'SELECT id, status, sso_subject, role FROM member WHERE workspace_id = $1 AND lower(email) = $2 FOR UPDATE', [ws, email]);
  if (byEmail) {
    if (byEmail.status === 'disabled') throw new OidcError('deactivated', 'this account was deactivated in this workspace');
    if (byEmail.sso_subject) throw new OidcError('subject_mismatch', 'this email is already linked to a different IdP account');
    // Linking takes over an account that already exists, so it needs more than a new account does: the IdP must say the email
    // is verified (the admin's "not required" only lets new people in), and an owner links only from inside their own session.
    if (!verified) throw new OidcError('link_unverified', 'an existing account is linked only when the IdP says the email address is verified');
    if (byEmail.role === 'owner' && linkMemberId !== byEmail.id) throw new OidcError('link_required', 'an owner links single sign-on from Settings > Security while signed in');
    await c.query("UPDATE member SET sso_subject = $2, status = 'active', invite_token_hash = NULL, invite_expires_at = NULL, name = coalesce(name, $3) WHERE id = $1",
      [byEmail.id, subject, typeof claims.name === 'string' ? claims.name.slice(0, 80) : null]);
    return { memberId: byEmail.id, workspaceId: ws, jit: false, linked: true };
  }
  if (await one(c, 'SELECT 1 FROM member WHERE lower(email) = $1', [email])) throw new OidcError('email_elsewhere', 'this email already belongs to another Vyakti workspace');
  const m = await one<{ id: string }>(c, `INSERT INTO member (workspace_id, email, name, role, status, auth_source, sso_subject) VALUES ($1,$2,$3,$4,'active','sso',$5) RETURNING id`,
    [ws, email, typeof claims.name === 'string' ? claims.name.slice(0, 80) : null, cfg.default_role, subject]);
  return { memberId: m!.id, workspaceId: ws, jit: true, linked: false };
}

const discoverBody = obj({ email: str({ max: 200 }) });
const startBody = obj({ workspaceId: uuid() });

export function ssoRoutes(router: Router, pool: pg.Pool, auth: (req: Req) => Promise<Caller>) {
  // Which way does this email sign in? Answers only for a domain a workspace has claimed for single sign-on.
  router.add('POST', '/v1/sso/discover', async req => {
    throttle('sso-discover:' + (req.ip ?? 'local'), 60);
    const b = discoverBody(req.body);
    const d = await one<{ workspace_id: string; sso_required: boolean }>(pool,
      'SELECT d.workspace_id, c.sso_required FROM sso_domain d JOIN sso_config c ON c.workspace_id = d.workspace_id WHERE d.domain = $1 AND c.enabled', [domainOf(b.email)]);
    return { body: d ? { sso: true, required: d.sso_required, workspaceId: d.workspace_id } : { sso: false } };
  });

  // Begin a sign-in. A JSON POST, never a link: a cross-site page cannot start one (a browser preflights cross-site JSON and we
  // grant no CORS), so nobody can bounce a person through a workspace's IdP or sign them into a workspace they did not pick,
  // and VP never answers a GET with a redirect to an address a workspace owner chose. The page navigates to `url` itself.
  // Called from inside a session of the same workspace it links that member (the only way an owner links).
  router.add('POST', '/v1/sso/start', async req => {
    throttle('sso-start:' + (req.ip ?? 'local'), 60);
    const essence = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (essence !== 'application/json') throw new HttpError(415, 'json_only', 'send application/json');
    const site = String(req.headers['sec-fetch-site'] ?? '');
    if (site === 'cross-site' || site === 'same-site') throw new HttpError(403, 'cross_site', 'this request came from another site');
    const ws = startBody(req.body).workspaceId;
    const cfg = await loadConfig(pool, ws);
    if (!cfg || !cfg.enabled) throw new HttpError(404, 'not_configured', 'single sign-on is not set up for that workspace');
    let link: string | undefined;
    if (String(req.headers['cookie'] ?? '').includes('vp_session=')) {
      const c = await auth(req).catch(() => null);
      if (c?.via === 'session' && c.workspaceId === ws) link = c.memberId;
    }
    const redirect = redirectUri(ws, req);
    let d;
    try { d = await discover(cfg.issuer); } catch { throw new HttpError(502, 'idp_unreachable', 'the identity provider could not be reached; try again shortly'); }
    const state = randomToken(32), nonce = randomToken(24), verifier = randomToken(48);
    await pool.query('DELETE FROM sso_login WHERE expires_at < now() - interval \'1 day\'');
    await pool.query('INSERT INTO sso_login (workspace_id, state_hash, sealed, config_version, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || \' milliseconds\')::interval)',
      [ws, sha256(state), seal(ws, 'sso-login', JSON.stringify({ nonce, verifier, link })), cfg.version, String(LOGIN_TTL_MS)]);
    const u = new URL(d.authorization_endpoint);
    const params = { response_type: 'code', client_id: cfg.client_id, redirect_uri: redirect, scope: 'openid email profile', state, nonce,
      code_challenge: challenge(verifier), code_challenge_method: 'S256' };
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return { body: { url: u.toString(), linking: !!link }, headers: { 'set-cookie': stateCookie(state, LOGIN_TTL_MS / 1000), 'cache-control': 'no-store' } };
  });

  router.add('GET', '/v1/sso/callback/:workspaceId', async req => {
    throttle('sso-callback:' + (req.ip ?? 'local'), 60);
    const clear = { 'set-cookie': stateCookie('', 0) };
    const state = req.query.get('state') ?? '', code = req.query.get('code') ?? '';
    const held = cookie(req, STATE_COOKIE) ?? '';
    // The state must match the cookie this browser got at the start: a sign-in started elsewhere cannot be finished here.
    const a = Buffer.from(state), b = Buffer.from(held);
    if (!state || a.length !== b.length || !timingSafeEqual(a, b)) return back('state_mismatch', clear);
    const login = await one<{ workspace_id: string; sealed: string; config_version: number }>(pool,
      'UPDATE sso_login SET used_at = now() WHERE state_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING workspace_id, sealed, config_version', [sha256(state)]);
    if (!login) return back('expired', clear);
    const ws = login.workspace_id;
    // The code came back to this workspace's own address, so it was issued for this workspace's client.
    if (req.params.workspaceId.toLowerCase() !== ws) return back('state_mismatch', clear);
    const audit = (action: string, payload: Record<string, unknown>, memberId?: string) => tx(pool, c => appendAudit(c, {
      workspaceId: ws, actorType: memberId ? 'member' : 'system', actorId: memberId ?? 'sso', action, objectType: memberId ? 'member' : undefined, objectId: memberId,
      payload: { ...payload, ip: req.ip ?? null, ...(memberId ? { subject: { type: 'member', id: memberId } } : {}) } }));
    if (req.query.get('error')) {
      await audit('auth.sso.failed', { reason: 'idp_error', idpError: String(req.query.get('error')).replace(/[^a-z_]/g, '').slice(0, 40) });
      return back('idp_error', clear);
    }
    const cfg = await loadConfig(pool, ws);
    if (!cfg || !cfg.enabled || cfg.version !== login.config_version) return back('config_changed', clear);
    const { nonce, verifier, link } = JSON.parse(open(ws, 'sso-login', login.sealed)) as { nonce: string; verifier: string; link?: string };
    // RFC 9207: an IdP that names itself on the response must be the one this sign-in was started with.
    if (req.query.get('iss') !== null && req.query.get('iss') !== cfg.issuer) {
      await audit('auth.sso.failed', { reason: 'wrong_iss' });
      return back('wrong_iss', clear);
    }
    try {
      if (!code) throw new OidcError('no_code', 'the IdP did not return a code');
      const d = await discover(cfg.issuer);
      const idToken = await exchangeCode(d, { clientId: cfg.client_id, clientSecret: open(ws, 'sso', cfg.client_secret_ciphertext), code, redirectUri: redirectUri(ws, req), verifier });
      const claims = await verifyIdToken(idToken, { issuer: cfg.issuer, clientId: cfg.client_id, nonce, jwksUri: d.jwks_uri });
      const out = await tx(pool, async c => {
        const who = await admit(c, cfg, claims, link);
        if (who.jit) await appendAudit(c, { workspaceId: ws, actorType: 'system', actorId: 'sso', action: 'member.jit_provision', objectType: 'member', objectId: who.memberId,
          payload: { subject: { type: 'member', id: who.memberId }, role: cfg.default_role } });
        await appendAudit(c, { workspaceId: ws, actorType: 'member', actorId: who.memberId, action: 'auth.sso.login', objectType: 'member', objectId: who.memberId,
          payload: { subject: { type: 'member', id: who.memberId }, jit: who.jit, linked: who.linked, ip: req.ip ?? null } });
        return { who, s: await createSession(c, who.memberId, 'sso') };
      });
      return { status: 302, headers: { location: '/', 'cache-control': 'no-store', 'set-cookie': [stateCookie('', 0), sessionCookie(out.s.token, out.s.expiresAt)] }, body: {} };
    } catch (e) {
      const reason = e instanceof OidcError ? e.code : 'internal';
      if (!(e instanceof OidcError)) console.error('[vp] sso callback', e);
      await audit('auth.sso.failed', { reason });
      return back(reason, clear);
    }
  });
}

export type { Config as SsoConfig };
