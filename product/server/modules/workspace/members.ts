// Team: list, invite (token hashed, accept route sets name + password), role changes that can never
// leave a workspace without an owner.
import { label } from '../../labels.ts';
import type { Registry, ToolCtx } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { hashPassword } from '../../auth.ts';
import { ROLES } from '../../../shared/approval.ts';
import { obj, opt, str, uuid } from '../../../shared/validate.ts';
import { holdForReveal } from './common.ts';
import { randomToken, sha256 } from './crypto.ts';

export const INVITE_TTL_MS = 7 * 24 * 3600_000;
const role = str({ oneOf: ROLES });
const email = str({ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, max: 200 });

/** Only an owner may hand out or take away ownership. At run time the actor is the person who approved. */
function ownerOnly(ctx: ToolCtx, what: string) {
  if (ctx.actor.role !== 'owner') throw new Error(`only an owner can ${what}`);
}

/** Serialise owner changes per workspace so two simultaneous demotions cannot both pass the last-owner check. */
async function lockOwners(ctx: ToolCtx) {
  await ctx.q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['owners:' + ctx.workspaceId]);
}

async function activeOwners(ctx: ToolCtx): Promise<number> {
  return Number((await one<{ n: string }>(ctx.q, "SELECT count(*) AS n FROM member WHERE workspace_id = $1 AND role = 'owner' AND status = 'active'", [ctx.workspaceId]))!.n);
}

export function registerMembers(r: Registry) {
  r.register(tool(obj({}), {
    name: 'member.list', risk: 'read', summary: 'List the people in this workspace and their roles',
    run: async ctx => ({
      members: await many(ctx.q, `SELECT id, email, name, role, status, invite_expires_at AS "inviteExpiresAt", created_at AS "createdAt"
        FROM member WHERE workspace_id = $1 ORDER BY created_at, email`, [ctx.workspaceId]),
    }),
  }));

  r.register(tool(obj({ email, role, name: opt(str({ min: 1, max: 80 })) }), {
    name: 'member.invite', risk: 'policy', summary: 'Invite a person to this workspace with a role',
    describe: i => `Invite ${i.email} as ${i.role}`,
    run: async (ctx, i) => {
      if (i.role === 'owner') ownerOnly(ctx, 'invite another owner');
      const existing = await one<{ id: string; workspace_id: string; status: string }>(ctx.q,
        'SELECT id, workspace_id, status FROM member WHERE lower(email) = lower($1) LIMIT 1', [i.email]);
      if (existing && (existing.workspace_id !== ctx.workspaceId || existing.status === 'active')) {
        throw new Error('that email already belongs to a workspace; they can sign in, or use another address');
      }
      const token = 'vpi_' + randomToken(24);
      const expires = new Date(Date.now() + INVITE_TTL_MS);
      let id: string;
      if (existing) {          // an unaccepted or disabled invite is re-issued; the old link stops working
        await ctx.q.query(`UPDATE member SET role = $3, name = coalesce($4, name), status = 'invited', invite_token_hash = $5, invite_expires_at = $6, invited_by = $7, password_hash = NULL
          WHERE id = $1 AND workspace_id = $2`, [existing.id, ctx.workspaceId, i.role, i.name ?? null, sha256(token), expires, ctx.actor.id ?? ctx.actor.type]);
        await ctx.q.query('DELETE FROM session WHERE member_id = $1', [existing.id]);
        id = existing.id;
      } else {
        id = (await one<{ id: string }>(ctx.q, `INSERT INTO member (workspace_id, email, name, role, status, invite_token_hash, invite_expires_at, invited_by)
          VALUES ($1,$2,$3,$4,'invited',$5,$6,$7) RETURNING id`, [ctx.workspaceId, i.email, i.name ?? null, i.role, sha256(token), expires, ctx.actor.id ?? ctx.actor.type]))!.id;
      }
      const revealId = await holdForReveal(ctx, { token, acceptWith: 'POST /v1/invites/accept' }, `invite for ${i.email}`);
      return { memberId: id, email: i.email, role: i.role, expiresAt: expires.toISOString(), revealId };
    },
  }));

  r.register(tool(obj({ memberId: uuid(), role }), {
    name: 'member.role.set', risk: 'policy', summary: 'Change what a person can do in this workspace',
    describe: async (i, ctx) => `Change the role of ${await label(ctx, 'member', i.memberId)} to ${i.role}`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, 'SELECT role || \':\' || status AS v FROM member WHERE id = $1 AND workspace_id = $2', [i.memberId, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      await lockOwners(ctx);
      const m = await one<{ role: string; status: string; email: string }>(ctx.q, 'SELECT role, status, email FROM member WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.memberId, ctx.workspaceId]);
      if (!m) throw new Error('no such member in this workspace');
      if (m.status === 'disabled') throw new Error('that person was removed; invite them again first');
      if (m.role === i.role) return { memberId: i.memberId, role: i.role, changed: false };
      if (i.role === 'owner' || m.role === 'owner') ownerOnly(ctx, i.role === 'owner' ? 'make someone an owner' : 'change an owner\'s role');
      if (m.role === 'owner' && m.status === 'active' && (await activeOwners(ctx)) <= 1) {
        throw new Error('this is the last owner; make someone else an owner first');
      }
      await ctx.q.query('UPDATE member SET role = $3 WHERE id = $1 AND workspace_id = $2', [i.memberId, ctx.workspaceId, i.role]);
      return { memberId: i.memberId, from: m.role, role: i.role, changed: true };
    },
  }));

  r.register(tool(obj({ memberId: uuid() }), {
    name: 'member.remove', risk: 'destructive', summary: 'Remove a person from this workspace',
    describe: async (i, ctx) => `Remove ${await label(ctx, 'member', i.memberId)} from this workspace and end their sessions`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT role || ':' || status AS v FROM member WHERE id = $1 AND workspace_id = $2", [i.memberId, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      await lockOwners(ctx);
      const m = await one<{ role: string; status: string }>(ctx.q, 'SELECT role, status FROM member WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.memberId, ctx.workspaceId]);
      if (!m) throw new Error('no such member in this workspace');
      if (m.role === 'owner') {
        ownerOnly(ctx, 'remove an owner');
        if (m.status === 'active' && (await activeOwners(ctx)) <= 1) throw new Error('this is the last owner; make someone else an owner first');
      }
      await ctx.q.query("UPDATE member SET status = 'disabled', invite_token_hash = NULL, invite_expires_at = NULL, password_hash = NULL WHERE id = $1 AND workspace_id = $2", [i.memberId, ctx.workspaceId]);
      await ctx.q.query('DELETE FROM session WHERE member_id = $1', [i.memberId]);
      return { memberId: i.memberId, removed: true };
    },
  }));
}

/** Accept an invite: the token proves the invitee; they set a name and password and the member becomes active. */
export async function acceptInvite(q: import('pg').PoolClient, token: string, name: string, password: string): Promise<{ memberId: string; workspaceId: string }> {
  const m = await one<{ id: string; workspace_id: string }>(q,
    `SELECT id, workspace_id FROM member WHERE invite_token_hash = $1 AND status = 'invited' AND invite_expires_at > now() FOR UPDATE`, [sha256(token)]);
  if (!m) return Promise.reject(Object.assign(new Error('that invite is not valid or has expired; ask for a new one'), { notFound: true }));
  const pw = await hashPassword(password);
  await q.query("UPDATE member SET name = $2, password_hash = $3, status = 'active', invite_token_hash = NULL, invite_expires_at = NULL WHERE id = $1", [m.id, name, pw]);
  return { memberId: m.id, workspaceId: m.workspace_id };
}
