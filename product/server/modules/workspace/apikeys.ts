// API keys: the token is built once, only sha256(secret) is stored (kernel newApiKey), and the token reaches
// the approving person once through secret.reveal. Bearer auth itself is the kernel's resolveCaller.
import { label } from '../../labels.ts';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { newApiKey } from '../../auth.ts';
import { arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { holdForReveal, takeReveal } from './common.ts';

export function registerApiKeys(r: Registry) {
  r.register(tool(obj({ name: str({ min: 1, max: 80 }), scopes: opt(arr(str({ max: 60 }), { max: 20 })), dailyCapInrMilli: opt(num({ int: true, min: 0, max: 100_000_000 })), expiresInDays: opt(num({ int: true, min: 1, max: 730 })) }), {
    name: 'apikey.create', risk: 'policy', summary: 'Create an API key that can act on this workspace',
    describe: i => `Create the API key "${i.name}"${i.expiresInDays ? ` that expires in ${i.expiresInDays} days` : ''}`,
    run: async (ctx, i) => {
      const k = newApiKey();
      const row = await one<{ id: string; created_at: Date }>(ctx.q,
        `INSERT INTO api_key (workspace_id, name, prefix, hash, scopes, daily_cap_inr_milli, expires_at)
         VALUES ($1,$2,$3,$4,$5, coalesce($6, 2000000), CASE WHEN $7::int IS NULL THEN NULL ELSE now() + ($7::int || ' days')::interval END) RETURNING id, created_at`,
        [ctx.workspaceId, i.name, k.prefix, k.hash, i.scopes ?? [], i.dailyCapInrMilli ?? null, i.expiresInDays ?? null]);
      // The kernel ledger enforces a key's spend through a budget row: scope_type 'api_key', scope_id = the key id, period 'daily'.
      await ctx.q.query("INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli) VALUES ($1,'api_key',$2,'daily',$3)",
        [ctx.workspaceId, row!.id, i.dailyCapInrMilli ?? 2_000_000]);
      const revealId = await holdForReveal(ctx, { token: k.token }, `API key ${i.name}`);
      return { id: row!.id, name: i.name, prefix: k.prefix, revealId, note: 'Read the token once with secret.reveal; it is not stored and cannot be shown again.' };
    },
  }));

  r.register(tool(obj({ revealId: uuid() }), {
    name: 'secret.reveal', risk: 'draft', summary: 'Show a newly created secret once, to the person who approved it',
    run: async (ctx, i) => {
      const got = await takeReveal(ctx, i.revealId);
      if (!got) throw new Error('nothing to show: it was already shown, has expired, or was approved by someone else');
      return { label: got.label, ...got.secret, shownOnce: true };
    },
  }));

  r.register(tool(obj({}), {
    name: 'apikey.list', risk: 'read', summary: 'List API keys (never the secret)',
    run: async ctx => ({
      keys: await many(ctx.q, `SELECT id, name, prefix, scopes, daily_cap_inr_milli AS "dailyCapInrMilli", last_used_at AS "lastUsedAt",
        expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt" FROM api_key WHERE workspace_id = $1 ORDER BY created_at DESC`, [ctx.workspaceId]),
    }),
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'apikey.rotate', risk: 'policy', summary: 'Replace an API key with a new secret (same name, scopes and cap); the old one stops working at once',
    describe: async (i, ctx) => `Rotate the API key ${await label(ctx, 'api_key', i.id)}; the old secret stops working at once`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT name || '|' || prefix || '|' || (revoked_at IS NOT NULL)::text AS v FROM api_key WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const old = await one<{ name: string; scopes: string[]; daily_cap_inr_milli: string; expires_at: Date | null; revoked_at: Date | null }>(ctx.q,
        'SELECT name, scopes, daily_cap_inr_milli, expires_at, revoked_at FROM api_key WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.id, ctx.workspaceId]);
      if (!old) throw new Error('no such API key in this workspace');
      if (old.revoked_at) throw new Error('that key was revoked; create a new one');
      const k = newApiKey();
      const row = await one<{ id: string }>(ctx.q,
        'INSERT INTO api_key (workspace_id, name, prefix, hash, scopes, daily_cap_inr_milli, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [ctx.workspaceId, old.name, k.prefix, k.hash, old.scopes, old.daily_cap_inr_milli, old.expires_at]);
      await ctx.q.query("INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli) VALUES ($1,'api_key',$2,'daily',$3)", [ctx.workspaceId, row!.id, old.daily_cap_inr_milli]);
      await ctx.q.query('UPDATE api_key SET revoked_at = now() WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      const revealId = await holdForReveal(ctx, { token: k.token }, `API key ${old.name}`);
      return { id: row!.id, replaced: i.id, name: old.name, prefix: k.prefix, revealId };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'apikey.revoke', risk: 'external', summary: 'Revoke an API key so it stops working at once',
    describe: async (i, ctx) => `Revoke the API key ${await label(ctx, 'api_key', i.id)}; anything using it stops working at once`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT name || '|' || prefix || '|' || (revoked_at IS NOT NULL)::text AS v FROM api_key WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const row = await one<{ revoked_at: Date | null }>(ctx.q, 'SELECT revoked_at FROM api_key WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.id, ctx.workspaceId]);
      if (!row) throw new Error('no such API key in this workspace');
      if (!row.revoked_at) await ctx.q.query('UPDATE api_key SET revoked_at = now() WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      return { id: i.id, revoked: true, alreadyRevoked: !!row.revoked_at };
    },
  }));
}
