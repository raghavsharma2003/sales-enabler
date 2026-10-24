// SCIM-lite: a small provisioning API so an IdP or a script can keep the team in step with the directory. Not SCIM 2.0
// (open.2026-10-24.scim2-compat): plain JSON on /v1/scim/members.
//   Token: "vps_<prefix>_<secret>", only sha256(secret) stored, compared in constant time. Separate from API keys, so a
//   provisioning token can never call a tool and an API key can never provision. Created, rotated and revoked as A2
//   policy actions by an owner; the token reaches the approver once through secret.reveal.
//   Scopes: members:read (list), members:write (create, deactivate, reactivate), roles:write (change a role).
//   Owners are out of reach: a token cannot make, change, demote or deactivate an owner.
//   Deactivation ends every session of that person in the same transaction, so the next request they make is refused.
import type pg from 'pg';
import { timingSafeEqual } from 'node:crypto';
import type { Router, Req } from '../../http.ts';
import { HttpError } from '../../http.ts';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one, tx } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { arr, bool, obj, opt, str } from '../../../shared/validate.ts';
import { uuid } from '../../../shared/validate.ts';
import { holdForReveal } from './common.ts';
import { randomToken, sha256 } from './crypto.ts';
import { randomBytes } from 'node:crypto';

export const SCIM_SCOPES = ['members:read', 'members:write', 'roles:write'] as const;
export type ScimScope = (typeof SCIM_SCOPES)[number];
// Not owner, and not compliance: compliance approves policy changes and downloads audit exports, so it is granted by a person.
const SCIM_ROLES = ['builder', 'operator', 'viewer'] as const;

function newScimToken() {
  const prefix = randomBytes(4).toString('hex'), secret = randomToken(24);
  return { token: `vps_${prefix}_${secret}`, prefix, hash: sha256(secret) };
}

const tokenLabel = async (q: pg.PoolClient | pg.Pool, ws: string, id: string) =>
  (await one<{ name: string }>(q, 'SELECT name FROM scim_token WHERE id = $1 AND workspace_id = $2', [id, ws]))?.name;

export function registerScim(r: Registry) {
  r.register(tool(obj({}), {
    name: 'scim.token.list', risk: 'read', roles: ['owner', 'compliance'], summary: 'List provisioning (SCIM) tokens, never the secret',
    run: async ctx => ({
      tokens: await many(ctx.q, `SELECT id, name, prefix, scopes, created_at AS "createdAt", rotated_at AS "rotatedAt", last_used_at AS "lastUsedAt", revoked_at AS "revokedAt"
        FROM scim_token WHERE workspace_id = $1 ORDER BY created_at DESC`, [ctx.workspaceId]),
      scopes: SCIM_SCOPES,
    }),
  }));

  r.register(tool(obj({ name: str({ min: 1, max: 80 }), scopes: arr(str({ oneOf: SCIM_SCOPES }), { min: 1, max: 3 }) }), {
    name: 'scim.token.create', risk: 'policy', roles: ['owner'], summary: 'Create a provisioning token an IdP or script uses to add, deactivate and re-role people',
    describe: i => `Create the provisioning token "${i.name}" that can ${[...new Set(i.scopes)].map(s => ({ 'members:read': 'list people', 'members:write': 'add and deactivate people', 'roles:write': 'change roles' })[s]).join(', ')}`,
    run: async (ctx, i) => {
      const t = newScimToken();
      const row = await one<{ id: string }>(ctx.q, 'INSERT INTO scim_token (workspace_id, name, prefix, hash, scopes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [ctx.workspaceId, i.name, t.prefix, t.hash, [...new Set(i.scopes)], ctx.actor.id ?? ctx.actor.type]);
      const revealId = await holdForReveal(ctx, { token: t.token, baseUrl: '/v1/scim/members' }, `provisioning token ${i.name}`);
      return { id: row!.id, name: i.name, prefix: t.prefix, scopes: [...new Set(i.scopes)], revealId };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'scim.token.rotate', risk: 'policy', roles: ['owner'], summary: 'Replace a provisioning token\'s secret; the old secret stops working at once',
    describe: async (i, ctx) => `Rotate the provisioning token "${(await tokenLabel(ctx.q as pg.PoolClient, ctx.workspaceId, i.id)) ?? 'unknown'}"; the old secret stops working at once`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT prefix || '|' || (revoked_at IS NOT NULL)::text AS v FROM scim_token WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const cur = await one<{ name: string; revoked_at: Date | null }>(ctx.q, 'SELECT name, revoked_at FROM scim_token WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.id, ctx.workspaceId]);
      if (!cur) throw new Error('no such provisioning token in this workspace');
      if (cur.revoked_at) throw new Error('that token was revoked; create a new one');
      const t = newScimToken();
      await ctx.q.query('UPDATE scim_token SET prefix = $3, hash = $4, rotated_at = now() WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId, t.prefix, t.hash]);
      const revealId = await holdForReveal(ctx, { token: t.token, baseUrl: '/v1/scim/members' }, `provisioning token ${cur.name}`);
      return { id: i.id, prefix: t.prefix, revealId };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'scim.token.revoke', risk: 'external', roles: ['owner', 'compliance'], summary: 'Revoke a provisioning token so it stops working at once',
    describe: async (i, ctx) => `Revoke the provisioning token "${(await tokenLabel(ctx.q as pg.PoolClient, ctx.workspaceId, i.id)) ?? 'unknown'}"; anything using it stops working at once`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT prefix || '|' || (revoked_at IS NOT NULL)::text AS v FROM scim_token WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const n = await ctx.q.query('UPDATE scim_token SET revoked_at = coalesce(revoked_at, now()) WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no such provisioning token in this workspace');
      return { id: i.id, revoked: true };
    },
  }));
}

// ---- the provisioning API -----------------------------------------------------------------------------------------

interface ScimCaller { workspaceId: string; tokenId: string; scopes: string[] }

const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 20, WINDOW_MS = 15 * 60_000;

/** Resolve a provisioning token. Bad tokens count against the caller's address. */
export async function scimCaller(pool: pg.Pool, req: Req, need: ScimScope): Promise<ScimCaller> {
  const key = 'scim:' + (req.ip ?? 'local');
  const now = Date.now(), f = fails.get(key);
  if (f && f.until > now && f.n >= MAX_FAILS) throw new HttpError(429, 'slow_down', 'too many failed attempts; try again in a few minutes');
  const m = /^Bearer vps_([0-9a-f]{8})_([A-Za-z0-9_-]+)$/.exec(String(req.headers['authorization'] ?? ''));
  const row = m ? await one<{ id: string; workspace_id: string; hash: string; scopes: string[]; revoked_at: Date | null }>(pool,
    'SELECT id, workspace_id, hash, scopes, revoked_at FROM scim_token WHERE prefix = $1', [m[1]]) : null;
  const given = Buffer.from(sha256(m?.[2] ?? ''), 'hex'), stored = Buffer.from(row?.hash ?? '0'.repeat(64), 'hex');
  if (!m || !row || row.revoked_at || !timingSafeEqual(given, stored)) {
    fails.set(key, f && f.until > now ? { n: f.n + 1, until: f.until } : { n: 1, until: now + WINDOW_MS });
    throw new HttpError(401, 'unauthorised', 'that provisioning token is not valid');
  }
  if (!row.scopes.includes(need)) throw new HttpError(403, 'out_of_scope', `this provisioning token's scopes do not include ${need}`);
  await pool.query('UPDATE scim_token SET last_used_at = now() WHERE id = $1', [row.id]);
  if (req.method !== 'GET') {
    const essence = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (essence !== 'application/json') throw new HttpError(415, 'json_only', 'send application/json');
  }
  return { workspaceId: row.workspace_id, tokenId: row.id, scopes: row.scopes };
}

const createBody = obj({ email: str({ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, max: 200 }), name: opt(str({ min: 1, max: 80 })), role: str({ oneOf: SCIM_ROLES }) });
const patchBody = obj({ active: opt(bool()), role: opt(str({ oneOf: SCIM_ROLES })) });

type Row = { id: string; email: string; name: string | null; role: string; status: string; auth_source: string; created_at: Date; deactivated_at: Date | null };
const memberView = (m: Row) => ({ id: m.id, email: m.email, name: m.name, role: m.role, active: m.status === 'active', status: m.status === 'disabled' ? 'deactivated' : m.status,
  source: m.auth_source, createdAt: m.created_at, deactivatedAt: m.deactivated_at });
const COLS = 'id, email, name, role, status, auth_source, created_at, deactivated_at';

export function scimRoutes(router: Router, pool: pg.Pool) {
  const audit = (c: pg.PoolClient, who: ScimCaller, action: string, memberId: string, payload: Record<string, unknown>) =>
    appendAudit(c, { workspaceId: who.workspaceId, actorType: 'system', actorId: 'scim:' + who.tokenId, action, objectType: 'member', objectId: memberId,
      payload: { ...payload, subject: { type: 'member', id: memberId } } });

  router.add('GET', '/v1/scim/members', async req => {
    const who = await scimCaller(pool, req, 'members:read');
    const limit = Math.min(500, Math.max(1, Number(req.query.get('limit') ?? 200) || 200));
    const after = req.query.get('after');
    if (after && !/^[0-9a-f-]{36}$/i.test(after)) throw new HttpError(422, 'invalid', 'after must be a member id');
    const rows = await many<Row>(pool, `SELECT ${COLS} FROM member WHERE workspace_id = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`, [who.workspaceId, after, limit + 1]);
    const page = rows.slice(0, limit);
    return { body: { members: page.map(memberView), next: rows.length > limit ? page[page.length - 1].id : null } };
  });

  router.add('POST', '/v1/scim/members', async req => {
    const who = await scimCaller(pool, req, 'members:write');
    const b = createBody(req.body);
    const email = b.email.toLowerCase();
    return tx(pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['member-email:' + email]);
      const here = await one<Row>(c, `SELECT ${COLS} FROM member WHERE workspace_id = $1 AND lower(email) = $2`, [who.workspaceId, email]);
      if (here) return { status: 409, body: { error: { code: 'exists', message: 'that person is already in this workspace' }, member: memberView(here) } };
      if (await one(c, 'SELECT 1 FROM member WHERE lower(email) = $1', [email])) throw new HttpError(409, 'email_elsewhere', 'that email already belongs to another Vyakti workspace');
      const m = await one<Row>(c, `INSERT INTO member (workspace_id, email, name, role, status, auth_source, invited_by) VALUES ($1,$2,$3,$4,'active','scim',$5) RETURNING ${COLS}`,
        [who.workspaceId, email, b.name ?? null, b.role, 'scim:' + who.tokenId]);
      await audit(c, who, 'scim.member.create', m!.id, { role: b.role });
      return { status: 201, body: { member: memberView(m!), signIn: 'single sign-on' } };
    });
  });

  router.add('PATCH', '/v1/scim/members/:id', async req => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'not_found', 'no such member in this workspace');
    const b = patchBody(req.body);
    if (b.active === undefined && b.role === undefined) throw new HttpError(422, 'invalid', 'send active, role or both');
    const who = await scimCaller(pool, req, b.active !== undefined ? 'members:write' : 'roles:write');
    if (b.role !== undefined && b.active !== undefined && !who.scopes.includes('roles:write')) throw new HttpError(403, 'out_of_scope', "this provisioning token's scopes do not include roles:write");
    return tx(pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['owners:' + who.workspaceId]);
      const m = await one<Row>(c, `SELECT ${COLS} FROM member WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [req.params.id, who.workspaceId]);
      if (!m) throw new HttpError(404, 'not_found', 'no such member in this workspace');
      if (m.role === 'owner') throw new HttpError(403, 'owner_protected', 'owners are managed in Vyakti by another owner, not by provisioning');
      if (m.role === 'compliance') throw new HttpError(403, 'compliance_protected', 'compliance members are managed in Vyakti by an owner, not by provisioning');
      const out: Record<string, unknown> = {};
      if (b.role !== undefined && b.role !== m.role) {
        await c.query('UPDATE member SET role = $3 WHERE id = $1 AND workspace_id = $2', [m.id, who.workspaceId, b.role]);
        await audit(c, who, 'scim.member.role_set', m.id, { from: m.role, role: b.role });
        out.roleChanged = true;
      }
      if (b.active === false && m.status !== 'disabled') {
        await c.query("UPDATE member SET status = 'disabled', deactivated_at = now(), password_hash = NULL, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = $1 AND workspace_id = $2", [m.id, who.workspaceId]);
        const ended = await c.query('DELETE FROM session WHERE member_id = $1', [m.id]);
        await c.query("DELETE FROM secret_box WHERE workspace_id = $1 AND member_id = $2 AND purpose = 'reveal'", [who.workspaceId, m.id]);
        await audit(c, who, 'scim.member.deactivate', m.id, { endedSessions: ended.rowCount ?? 0 });
        out.endedSessions = ended.rowCount ?? 0;
      } else if (b.active === true && m.status === 'disabled') {
        // Only a person provisioning deactivated comes back through provisioning; someone an owner removed stays removed.
        if (!m.deactivated_at) throw new HttpError(403, 'removed_by_owner', 'this person was removed by an owner; an owner must invite them again');
        await c.query("UPDATE member SET status = 'active', deactivated_at = NULL WHERE id = $1 AND workspace_id = $2", [m.id, who.workspaceId]);
        await audit(c, who, 'scim.member.reactivate', m.id, {});
        out.reactivated = true;
      }
      const now = await one<Row>(c, `SELECT ${COLS} FROM member WHERE id = $1`, [m.id]);
      return { body: { member: memberView(now!), ...out } };
    });
  });
}
