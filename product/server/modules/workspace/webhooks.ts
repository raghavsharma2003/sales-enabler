// Outbound webhooks, signed like the runtime seam: x-vp-signature = "t=<unix_ms>,v1=<hex hmac_sha256(secret, t.body)>".
// Events are queued as deliveries; deliverPending() sends them (the server runs it on a timer), retrying with backoff.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type pg from 'pg';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { sign } from '../../runtime-client.ts';
import { any, arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { holdForReveal } from './common.ts';
import { open, randomToken, seal } from './crypto.ts';

const EVENT = /^(\*|[a-z][a-z0-9_]*(\.[a-z0-9_]+)*(\.\*)?)$/;
const MAX_ATTEMPTS = 5, MAX_ENDPOINTS = 20, SEND_MS = 8000;

const allowPrivate = () => process.env.VP_WEBHOOK_ALLOW_PRIVATE === '1';

export function isPrivateAddress(ip: string): boolean {
  const v6 = ip.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(v6) === 4) {
    const [a, b] = v6.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

export function checkUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('that is not a valid web address'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (process.env.VP_WEBHOOK_ALLOW_HTTP === '1' || allowPrivate()))) throw new Error('webhooks must use https');
  if (u.username || u.password) throw new Error('put credentials in the signature check, not in the address');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate() && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && isPrivateAddress(host)))) throw new Error('that address is on a private network; use a public https address');
  return u;
}

/** Resolve the host right before sending and refuse private targets (a hostname can point inside the network). */
async function assertPublic(u: URL) {
  if (allowPrivate()) return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) throw new Error('the address resolves to a private network, so nothing was sent');
}

const matches = (events: string[], event: string) => events.some(e => e === '*' || e === event || (e.endsWith('.*') && event.startsWith(e.slice(0, -1))));

interface Claimed { id: string; workspace_id: string; endpoint_id: string; event: string; payload: unknown; attempts: number; created_at: Date }

/** Send due deliveries. Safe to run from several processes: rows are claimed with SKIP LOCKED and a lease. */
export async function deliverPending(pool: pg.Pool, o: { limit?: number; workspaceId?: string } = {}): Promise<{ sent: number; delivered: number; failed: number }> {
  const claimed = (await pool.query<Claimed>(
    `UPDATE webhook_delivery SET locked_until = now() + interval '60 seconds', attempts = attempts + 1
     WHERE id IN (SELECT id FROM webhook_delivery WHERE status = 'pending' AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now())
                  AND ($2::uuid IS NULL OR workspace_id = $2) ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, workspace_id, endpoint_id, event, payload, attempts, created_at`, [o.limit ?? 20, o.workspaceId ?? null])).rows;
  let delivered = 0, failed = 0;
  await Promise.all(claimed.map(async d => {
    const ep = await one<{ url: string; secret_ciphertext: string; status: string }>(pool, 'SELECT url, secret_ciphertext, status FROM webhook_endpoint WHERE id = $1 AND workspace_id = $2', [d.endpoint_id, d.workspace_id]);
    let status: number | null = null, error: string | null = null;
    try {
      if (!ep || ep.status !== 'active') { await pool.query("UPDATE webhook_delivery SET status = 'failed', error = 'endpoint was deleted', locked_until = NULL WHERE id = $1", [d.id]); failed++; return; }
      const u = checkUrlShape(ep.url);
      await assertPublic(u);
      const body = JSON.stringify({ id: d.id, event: d.event, createdAt: d.created_at.toISOString(), data: d.payload });
      const res = await fetch(u, { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(SEND_MS),
        headers: { 'content-type': 'application/json', 'user-agent': 'vyakti-webhooks/1', 'x-vp-event': d.event, 'x-vp-delivery': d.id,
          'x-vp-signature': sign(open(d.workspace_id, 'webhook', ep.secret_ciphertext), body) } });
      status = res.status;
      await res.arrayBuffer().catch(() => {});
      if (res.status < 200 || res.status >= 300) error = `the receiver answered ${res.status}`;
    } catch (e) { error = e instanceof Error ? e.message.slice(0, 300) : 'send failed'; }
    if (!error) {
      await pool.query("UPDATE webhook_delivery SET status = 'delivered', response_status = $2, error = NULL, delivered_at = now(), locked_until = NULL WHERE id = $1", [d.id, status]);
      delivered++;
    } else if (d.attempts >= MAX_ATTEMPTS) {
      await pool.query("UPDATE webhook_delivery SET status = 'failed', response_status = $2, error = $3, locked_until = NULL WHERE id = $1", [d.id, status, error]);
      failed++;
    } else {
      await pool.query("UPDATE webhook_delivery SET response_status = $2, error = $3, locked_until = NULL, next_attempt_at = now() + ($4 || ' seconds')::interval WHERE id = $1", [d.id, status, error, String(30 * 4 ** (d.attempts - 1))]);
    }
  }));
  return { sent: claimed.length, delivered, failed };
}

export function registerWebhooks(r: Registry) {
  r.register(tool(obj({ url: str({ max: 500 }), events: opt(arr(str({ pattern: EVENT, max: 80 }), { min: 1, max: 30 })), description: opt(str({ max: 200 })) }), {
    name: 'webhook.create', risk: 'policy', summary: 'Send events from this workspace to your own web address, signed',
    describe: i => `Send ${i.events?.join(', ') ?? 'all'} events to ${(() => { try { return new URL(i.url).host; } catch { return i.url.slice(0, 60); } })()}`,
    run: async (ctx, i) => {
      const u = checkUrlShape(i.url);
      const n = await one<{ n: string }>(ctx.q, "SELECT count(*) AS n FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active'", [ctx.workspaceId]);
      if (Number(n!.n) >= MAX_ENDPOINTS) throw new Error(`a workspace can have ${MAX_ENDPOINTS} webhooks; delete one first`);
      const secret = 'whsec_' + randomToken(24);
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO webhook_endpoint (workspace_id, url, description, events, secret_ciphertext, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.workspaceId, u.toString(), i.description ?? null, i.events ?? ['*'], seal(ctx.workspaceId, 'webhook', secret), ctx.actor.id ?? ctx.actor.type]);
      const revealId = await holdForReveal(ctx, { signingSecret: secret, header: 'x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(signingSecret, t + "." + rawBody)>' }, 'webhook signing secret');
      return { id: row!.id, url: u.toString(), events: i.events ?? ['*'], revealId };
    },
  }));

  r.register(tool(obj({}), {
    name: 'webhook.list', risk: 'read', summary: 'List webhooks (never the signing secret)',
    run: async ctx => ({
      webhooks: await many(ctx.q, `SELECT e.id, e.url, e.description, e.events, e.created_at AS "createdAt",
          (SELECT status FROM webhook_delivery d WHERE d.endpoint_id = e.id ORDER BY d.created_at DESC LIMIT 1) AS "lastStatus"
        FROM webhook_endpoint e WHERE e.workspace_id = $1 AND e.status = 'active' ORDER BY e.created_at`, [ctx.workspaceId]),
    }),
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'webhook.delete', risk: 'destructive', summary: 'Stop sending events to a webhook and forget its secret',
    describe: () => 'Delete a webhook; events waiting to be sent to it are dropped',
    run: async (ctx, i) => {
      const n = await ctx.q.query("UPDATE webhook_endpoint SET status = 'deleted' WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no such webhook in this workspace');
      await ctx.q.query("UPDATE webhook_delivery SET status = 'failed', error = 'endpoint was deleted' WHERE endpoint_id = $1 AND status = 'pending'", [i.id]);
      return { id: i.id, deleted: true };
    },
  }));

  r.register(tool(obj({ endpointId: opt(uuid()), status: opt(str({ oneOf: ['pending', 'delivered', 'failed'] })), limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'webhook.deliveries', risk: 'read', summary: 'See what was sent to webhooks and how the receiver answered',
    run: async (ctx, i) => ({
      deliveries: await many(ctx.q, `SELECT id, endpoint_id AS "endpointId", event, payload, status, attempts, response_status AS "responseStatus", error,
          replay_of AS "replayOf", created_at AS "createdAt", delivered_at AS "deliveredAt", CASE WHEN status = 'pending' THEN next_attempt_at END AS "nextAttemptAt"
        FROM webhook_delivery WHERE workspace_id = $1 AND ($2::uuid IS NULL OR endpoint_id = $2) AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC, id DESC LIMIT $4`, [ctx.workspaceId, i.endpointId ?? null, i.status ?? null, i.limit ?? 30]),
    }),
  }));

  r.register(tool(obj({ deliveryId: uuid() }), {
    name: 'webhook.replay', risk: 'external', summary: 'Send an earlier webhook event to its receiver again',
    describe: () => 'Send an earlier event to its webhook receiver again',
    run: async (ctx, i) => {
      const d = await one<{ endpoint_id: string; event: string; payload: unknown; status: string }>(ctx.q,
        `SELECT d.endpoint_id, d.event, d.payload, e.status FROM webhook_delivery d JOIN webhook_endpoint e ON e.id = d.endpoint_id
         WHERE d.id = $1 AND d.workspace_id = $2 AND e.workspace_id = $2`, [i.deliveryId, ctx.workspaceId]);
      if (!d) throw new Error('no such delivery in this workspace');
      if (d.status !== 'active') throw new Error('that webhook was deleted');
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, replay_of) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ctx.workspaceId, d.endpoint_id, d.event, JSON.stringify(d.payload), i.deliveryId]);
      return { deliveryId: row!.id, queued: true };
    },
  }));

  // Other modules (and the server) announce events through this tool; no member or API key may call it.
  r.register(tool(obj({ event: str({ pattern: EVENT, max: 80 }), data: opt(any('event data')) }), {
    name: 'webhook.emit', risk: 'draft', summary: 'Queue an event for every webhook that listens for it', roles: [],
    run: async (ctx, i) => {
      if (ctx.actor.type === 'member') throw new Error('only the platform emits events');
      const body = JSON.stringify(i.data ?? {});
      if (body.length > 100_000) throw new Error('event data is larger than 100 KB');
      const eps = await many<{ id: string; events: string[] }>(ctx.q, "SELECT id, events FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active'", [ctx.workspaceId]);
      const hit = eps.filter(e => matches(e.events, i.event));
      for (const e of hit) await ctx.q.query('INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload) VALUES ($1,$2,$3,$4)', [ctx.workspaceId, e.id, i.event, body]);
      return { queued: hit.length };
    },
  }));
}
