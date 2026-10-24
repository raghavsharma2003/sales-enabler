// Outbound webhooks, signed like the runtime seam: x-vp-signature = "t=<unix_ms>,v1=<hex hmac_sha256(secret, t.body)>".
// Events are queued as deliveries; deliverPending() sends them (the server runs it on a timer), retrying with backoff.
// Events other modules cause arrive through webhook_outbox (filled by triggers, 1020_workspace_results_out.sql) and are
// fanned out here. A delivery with a `build` sends a record built at send time (results.ts); see product/docs/webhooks.md.
import { label } from '../../labels.ts';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type pg from 'pg';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one, tx } from '../../db.ts';
import { sign } from '../../runtime-client.ts';
import { any, arr, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { holdForReveal } from './common.ts';
import { open, randomToken, seal } from './crypto.ts';
import { integrationSecretsById } from './integrations.ts';
import { BUILDS, EVENTS, EVENT_NAMES, NotSendable, buildRecord, type Build, type ContactNumber } from './results.ts';

const EVENT = /^(\*|[a-z][a-z0-9_]*(\.[a-z0-9_]+)*(\.\*)?)$/;
const MAX_ATTEMPTS = 5, MAX_ENDPOINTS = 20, SEND_MS = 8000;

const allowPrivate = () => process.env.VP_WEBHOOK_ALLOW_PRIVATE === '1';

/** An IP literal as bytes: 4 for IPv4, 16 for IPv6 (handles `::`, zero padding, an embedded dotted tail and a zone id). */
export function ipBytes(ip: string): number[] | null {
  const addr = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const kind = isIP(addr);
  if (kind === 4) return addr.split('.').map(Number);
  if (kind !== 6) return null;
  let head = addr, tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (dotted) { tail = dotted[1].split('.').map(Number); head = addr.slice(0, -dotted[1].length); }
  const [l, r = null] = head.split('::');
  const groups = (x: string) => (x ? x.split(':').filter(g => g !== '') : []);
  const left = groups(l), right = r === null ? [] : groups(r);
  const want = 8 - (tail.length ? 2 : 0);
  const mid = r === null ? [] : Array(Math.max(0, want - left.length - right.length)).fill('0');
  const all = [...left, ...mid, ...right].map(g => parseInt(g, 16));
  const bytes = all.flatMap(g => [(g >> 8) & 255, g & 255]).concat(tail);
  return bytes.length === 16 && bytes.every(n => Number.isInteger(n) && n >= 0 && n < 256) ? bytes : null;
}

function privateV4([a, b, c]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113) || a >= 224;
}

/** True for anything that is not a public unicast address. IPv6 forms that carry an IPv4 address (mapped, compatible,
 *  NAT64, 6to4) are judged by the IPv4 address inside; unparseable input counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const b = ipBytes(ip);
  if (!b) return true;
  if (b.length === 4) return privateV4(b);
  const zeros = (from: number, to: number) => b.slice(from, to).every(x => x === 0);
  if (zeros(0, 15) && b[15] <= 1) return true;                                          // :: and ::1
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return privateV4(b.slice(12));  // ::ffff:0:0/96
  if (zeros(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return privateV4(b.slice(12));
  if (zeros(0, 12)) return privateV4(b.slice(12));                                       // ::/96 IPv4-compatible
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return !zeros(4, 12) || privateV4(b.slice(12));  // 64:ff9b::/96; the local-use /48 is refused
  if (b[0] === 0x20 && b[1] === 0x02) return privateV4(b.slice(2, 6));                   // 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;           // Teredo
  if ((b[0] & 0xfe) === 0xfc) return true;                                                // fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) !== 0x40) return true;                               // fe80::/10 and fec0::/10
  if (b[0] === 0xff) return true;                                                         // multicast
  return false;
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

/** Resolve once, refuse private targets, and return the address to connect to (so a second lookup cannot differ). */
async function resolvePublic(u: URL): Promise<{ address: string; family: 4 | 6 }> {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addrs.length) throw new Error('the address did not resolve');
  if (!allowPrivate() && addrs.some(a => isPrivateAddress(a.address))) throw new Error('the address resolves to a private network, so nothing was sent');
  return { address: addrs[0].address, family: addrs[0].family as 4 | 6 };
}

/** POST to the address we vetted: the socket connects to `ip`, while the Host header and TLS name stay the URL's host. No redirects. */
function post(u: URL, ip: { address: string; family: 4 | 6 }, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, {
      method: 'POST', headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) }, signal: AbortSignal.timeout(SEND_MS),
      lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) => (o?.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family))) as never,
    }, res => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('error', reject);
    req.end(body);
  });
}

const matches = (events: string[], event: string) => events.some(e => e === '*' || e === event || (e.endsWith('.*') && event.startsWith(e.slice(0, -1))));

/** Turn outbox rows (events other modules caused) into deliveries for the endpoints listening now. Each row once:
 *  the row is claimed with SKIP LOCKED, and its deliveries carry the key outbox:<id>, so a run cut short repeats nothing. */
export async function fanOut(pool: pg.Pool, o: { workspaceId?: string; limit?: number } = {}): Promise<{ events: number; queued: number }> {
  return tx(pool, async c => {
    const rows = (await c.query<{ id: string; workspace_id: string; event: string; build: string | null; data: unknown; created_at: Date }>(
      `SELECT id, workspace_id, event, build, data, created_at FROM webhook_outbox WHERE fanned_at IS NULL AND ($2::uuid IS NULL OR workspace_id = $2)
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [o.limit ?? 200, o.workspaceId ?? null])).rows;
    let queued = 0;
    const eps = new Map<string, { id: string; events: string[]; created_at: Date }[]>();
    for (const r of rows) {
      if (!eps.has(r.workspace_id)) eps.set(r.workspace_id, await many(c, "SELECT id, events, created_at FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active'", [r.workspace_id]));
      // Only endpoints that existed when the event happened: a new webhook is not sent what happened before it.
      for (const e of eps.get(r.workspace_id)!.filter(x => matches(x.events, r.event) && x.created_at <= r.created_at)) {
        const n = await c.query(`INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, build, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (endpoint_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [r.workspace_id, e.id, r.event, JSON.stringify(r.data), r.build, 'outbox:' + r.id]);
        queued += n.rowCount ?? 0;
      }
    }
    if (rows.length) await c.query('UPDATE webhook_outbox SET fanned_at = now() WHERE id = ANY($1::bigint[])', [rows.map(r => r.id)]);
    return { events: rows.length, queued };
  });
}

/** What went wrong, in words a person reads on the deliveries list (not a socket error code). */
function sendError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'the address could not be found (its domain does not resolve)';
  if (code === 'ECONNREFUSED') return 'the receiver refused the connection';
  if (code === 'ECONNRESET') return 'the receiver closed the connection before answering';
  if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return `the receiver did not answer within ${SEND_MS / 1000} seconds`;
  if (code?.startsWith('ERR_TLS') || code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return "the receiver's https certificate is not valid";
  return e instanceof Error ? e.message.slice(0, 300) : 'send failed';
}

interface Claimed { id: string; workspace_id: string; endpoint_id: string; event: string; payload: Record<string, unknown>; attempts: number; created_at: Date;
  build: Build | null; test: boolean; replay_of: string | null }

/** Send due deliveries. Safe to run from several processes: rows are claimed with SKIP LOCKED and a lease. */
export async function deliverPending(pool: pg.Pool, o: { limit?: number; workspaceId?: string; ids?: string[] } = {}): Promise<{ sent: number; delivered: number; failed: number }> {
  if (!o.ids) await fanOut(pool, { workspaceId: o.workspaceId });
  const claimed = (await pool.query<Claimed>(
    `UPDATE webhook_delivery SET locked_until = now() + interval '60 seconds', attempts = attempts + 1
     WHERE id IN (SELECT id FROM webhook_delivery WHERE status = 'pending' AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now())
                  AND ($2::uuid IS NULL OR workspace_id = $2) AND ($3::uuid[] IS NULL OR id = ANY($3)) ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, workspace_id, endpoint_id, event, payload, attempts, created_at, build, test, replay_of`, [o.limit ?? 20, o.workspaceId ?? null, o.ids ?? null])).rows;
  let delivered = 0, failed = 0;
  await Promise.all(claimed.map(async d => {
    const ep = await one<{ url: string; secret_ciphertext: string; status: string; contact_number: ContactNumber; auth_integration_id: string | null }>(pool,
      'SELECT url, secret_ciphertext, status, contact_number, auth_integration_id FROM webhook_endpoint WHERE id = $1 AND workspace_id = $2', [d.endpoint_id, d.workspace_id]);
    let status: number | null = null, error: string | null = null, final = false;
    try {
      if (!ep || ep.status !== 'active') { await pool.query("UPDATE webhook_delivery SET status = 'failed', error = 'endpoint was deleted', locked_until = NULL WHERE id = $1", [d.id]); failed++; return; }
      const u = checkUrlShape(ep.url);
      const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'vyakti-webhooks/1', 'x-vp-event': d.event, 'x-vp-delivery': d.id };
      if (d.test) headers['x-vp-test'] = '1';
      if (ep.auth_integration_id) {
        const token = (await integrationSecretsById(pool, d.workspace_id, ep.auth_integration_id))?.bearer_token;
        if (!token) throw new NotSendable('the integration that holds the bearer token is disconnected, so nothing was sent');
        headers.authorization = `Bearer ${token}`;
      }
      // Built now, from what the database holds now (an erasure since the event was queued is respected).
      const data = d.build ? await buildRecord(pool, d.workspace_id, d.build, d.payload, d.event, { contactNumber: ep.contact_number }) : d.payload;
      const ip = await resolvePublic(u);
      const body = JSON.stringify({ id: d.id, event: d.event, createdAt: d.created_at.toISOString(), ...(d.test ? { test: true } : {}), ...(d.replay_of ? { replayOf: d.replay_of } : {}), data });
      status = await post(u, ip, body, { ...headers, 'x-vp-signature': sign(open(d.workspace_id, 'webhook', ep.secret_ciphertext), body) });
      if (status < 200 || status >= 300) error = `the receiver answered ${status}`;
    } catch (e) { error = sendError(e); final = e instanceof NotSendable; }
    if (!error) {
      await pool.query("UPDATE webhook_delivery SET status = 'delivered', response_status = $2, error = NULL, delivered_at = now(), locked_until = NULL WHERE id = $1", [d.id, status]);
      delivered++;
    } else if (final || d.attempts >= MAX_ATTEMPTS || d.test) {
      await pool.query("UPDATE webhook_delivery SET status = 'failed', response_status = $2, error = $3, locked_until = NULL WHERE id = $1", [d.id, status, error]);
      failed++;
    } else {
      await pool.query("UPDATE webhook_delivery SET response_status = $2, error = $3, locked_until = NULL, next_attempt_at = now() + ($4 || ' seconds')::interval WHERE id = $1", [d.id, status, error, String(30 * 4 ** (d.attempts - 1))]);
    }
  }));
  return { sent: claimed.length, delivered, failed };
}

/** A custom HTTP integration may sign a webhook in with its bearer token only on its own base address. */
async function authIntegration(q: import('../../db.ts').Queryable, ws: string, id: string, u: URL): Promise<{ id: string; name: string }> {
  const it = await one<{ id: string; name: string; kind: string; config: { base_url?: string } }>(q,
    "SELECT id, name, kind, config FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [id, ws]);
  if (!it) throw new Error('no connected integration with that id in this workspace');
  if (it.kind !== 'custom_http') throw new Error('only a custom HTTP integration can sign a webhook in');
  let base: URL;
  try { base = new URL(it.config?.base_url ?? ''); } catch { throw new Error(`the integration "${it.name}" has no base address; reconnect it with one`); }
  const prefix = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/';
  if (base.origin !== u.origin || !(u.pathname === base.pathname || u.pathname.startsWith(prefix))) throw new Error(`the webhook address must be on the integration's base address (${base.origin}${base.pathname}), so its token is never sent elsewhere`);
  return { id: it.id, name: it.name };
}

export function registerWebhooks(r: Registry) {
  r.register(tool(obj({ url: str({ max: 500 }), events: opt(arr(str({ pattern: EVENT, max: 80 }), { min: 1, max: 30 })), description: opt(str({ max: 200 })),
    contactNumber: opt(str({ oneOf: ['masked', 'full'] as const, desc: "'masked' (the default) sends +91•••••1234 and initials; 'full' sends the whole number and name" })),
    authIntegrationId: opt(uuid()) }), {
    name: 'webhook.create', risk: 'policy', summary: 'Send events from this workspace to your own web address, signed',
    describe: async (i, ctx) => {
      const host = (() => { try { return new URL(i.url).host; } catch { return i.url.slice(0, 60); } })();
      const it = i.authIntegrationId ? (await one<{ name: string }>(ctx.q, 'SELECT name FROM integration WHERE id = $1 AND workspace_id = $2', [i.authIntegrationId, ctx.workspaceId]))?.name : null;
      const what = !i.events || i.events.includes('*') ? 'every event' : i.events.map(e => EVENTS.find(x => x.event === e)?.label.toLowerCase() ?? (e.endsWith('.*') ? `every ${e.slice(0, -2).replace(/_/g, ' ')} event` : e.replace(/[._]/g, ' '))).join('; ');
      return `Send ${what} to ${host}, with ${i.contactNumber === 'full' ? 'full phone numbers and names (personal data leaves Vyakti)' : 'phone numbers masked'}${it ? `, signed in with the bearer token of "${it}"` : ''}`;
    },
    run: async (ctx, i) => {
      const u = checkUrlShape(i.url);
      const n = await one<{ n: string }>(ctx.q, "SELECT count(*) AS n FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active'", [ctx.workspaceId]);
      if (Number(n!.n) >= MAX_ENDPOINTS) throw new Error(`a workspace can have ${MAX_ENDPOINTS} webhooks; delete one first`);
      if (i.contactNumber === 'full' && ctx.actor.type === 'member' && ctx.actor.role !== 'owner' && ctx.actor.role !== 'compliance') throw new Error('only an owner or compliance member can send full phone numbers');
      const auth = i.authIntegrationId ? await authIntegration(ctx.q, ctx.workspaceId, i.authIntegrationId, u) : null;
      const secret = 'whsec_' + randomToken(24);
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO webhook_endpoint (workspace_id, url, description, events, secret_ciphertext, created_by, contact_number, auth_integration_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.workspaceId, u.toString(), i.description ?? null, i.events ?? ['*'], seal(ctx.workspaceId, 'webhook', secret), ctx.actor.id ?? ctx.actor.type, i.contactNumber ?? 'masked', auth?.id ?? null]);
      const revealId = await holdForReveal(ctx, { signingSecret: secret, header: 'x-vp-signature: t=<unix_ms>,v1=<hex hmac_sha256(signingSecret, t + "." + rawBody)>' }, 'webhook signing secret');
      return { id: row!.id, url: u.toString(), events: i.events ?? ['*'], contactNumber: i.contactNumber ?? 'masked', authIntegration: auth, revealId };
    },
  }));

  r.register(tool(obj({}), {
    name: 'webhook.list', risk: 'read', summary: 'List webhooks (never the signing secret)',
    run: async ctx => ({
      webhooks: await many(ctx.q, `SELECT e.id, e.url, e.description, e.events, e.created_at AS "createdAt", e.contact_number AS "contactNumber",
          CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('id', i.id, 'name', i.name, 'connected', i.status = 'connected') END AS "authIntegration",
          (SELECT status FROM webhook_delivery d WHERE d.endpoint_id = e.id ORDER BY d.created_at DESC LIMIT 1) AS "lastStatus"
        FROM webhook_endpoint e LEFT JOIN integration i ON i.id = e.auth_integration_id AND i.workspace_id = e.workspace_id
        WHERE e.workspace_id = $1 AND e.status = 'active' ORDER BY e.created_at`, [ctx.workspaceId]),
    }),
  }));

  // A made-up record of an event's shape, sent at once to one webhook so a receiver can be built and checked. It goes to
  // that webhook whatever it listens for, carries "test": true and x-vp-test: 1, and is never retried.
  r.register(tool(obj({ id: uuid(), event: opt(str({ oneOf: EVENT_NAMES })) }), {
    name: 'webhook.test', risk: 'test', summary: 'Send a made-up event to a webhook now and see how the receiver answers',
    prepare: async (ctx, i) => {
      const ep = await one(ctx.pool, "SELECT 1 FROM webhook_endpoint WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [i.id, ctx.workspaceId]);
      if (!ep) throw new Error('no such webhook in this workspace');
      const event = i.event ?? 'call.ended';
      const row = await one<{ id: string }>(ctx.pool, `INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, build, test) VALUES ($1,$2,$3,'{}','test.v1',true) RETURNING id`,
        [ctx.workspaceId, i.id, event]);
      await deliverPending(ctx.pool, { workspaceId: ctx.workspaceId, ids: [row!.id] });
      const d = await one<{ status: string; response_status: number | null; error: string | null }>(ctx.pool, 'SELECT status, response_status, error FROM webhook_delivery WHERE id = $1', [row!.id]);
      return { deliveryId: row!.id, event, status: d!.status, responseStatus: d!.response_status, error: d!.error };
    },
    run: async (_ctx, _i, prepared) => prepared as { deliveryId: string; event: string; status: string; responseStatus: number | null; error: string | null },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'webhook.delete', risk: 'destructive', summary: 'Stop sending events to a webhook and forget its secret',
    describe: async (i, ctx) => `Delete ${await label(ctx, 'webhook', i.id)}; events waiting to be sent to it are dropped`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT status || '|' || url || '|' || array_to_string(events, ',') AS v FROM webhook_endpoint WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
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
          replay_of AS "replayOf", test, created_at AS "createdAt", delivered_at AS "deliveredAt", CASE WHEN status = 'pending' THEN next_attempt_at END AS "nextAttemptAt"
        FROM webhook_delivery WHERE workspace_id = $1 AND ($2::uuid IS NULL OR endpoint_id = $2) AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC, id DESC LIMIT $4`, [ctx.workspaceId, i.endpointId ?? null, i.status ?? null, i.limit ?? 30]),
    }),
  }));

  r.register(tool(obj({ deliveryId: uuid() }), {
    name: 'webhook.replay', risk: 'external', summary: 'Send an earlier webhook event to its receiver again',
    describe: () => 'Send an earlier event to its webhook receiver again',
    run: async (ctx, i) => {
      const d = await one<{ endpoint_id: string; event: string; payload: unknown; build: string | null; test: boolean; status: string }>(ctx.q,
        `SELECT d.endpoint_id, d.event, d.payload, d.build, d.test, e.status FROM webhook_delivery d JOIN webhook_endpoint e ON e.id = d.endpoint_id
         WHERE d.id = $1 AND d.workspace_id = $2 AND e.workspace_id = $2`, [i.deliveryId, ctx.workspaceId]);
      if (!d) throw new Error('no such delivery in this workspace');
      if (d.status !== 'active') throw new Error('that webhook was deleted');
      // The record is built again when the replay is sent, so it says what is true then (words removed since stay removed).
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, build, test, replay_of) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.workspaceId, d.endpoint_id, d.event, JSON.stringify(d.payload), d.build, d.test, i.deliveryId]);
      return { deliveryId: row!.id, queued: true };
    },
  }));

  // Other modules (and the server) announce events through this tool; no member or API key may call it.
  // `key` sends the event to each endpoint at most once (call.ended uses the call id); `build` names a record built at
  // send time from the ids in `data` (results.ts), so the stored delivery holds no personal data.
  r.register(tool(obj({ event: str({ pattern: EVENT, max: 80 }), data: opt(any('event data')), key: opt(str({ min: 1, max: 200 })),
    build: opt(str({ oneOf: BUILDS.filter(b => b !== 'test.v1') })) }), {
    name: 'webhook.emit', risk: 'draft', summary: 'Queue an event for every webhook that listens for it', roles: [],
    run: async (ctx, i) => {
      if (ctx.actor.type === 'member') throw new Error('only the platform emits events');
      const body = JSON.stringify(i.data ?? {});
      if (body.length > 100_000) throw new Error('event data is larger than 100 KB');
      const eps = await many<{ id: string; events: string[] }>(ctx.q, "SELECT id, events FROM webhook_endpoint WHERE workspace_id = $1 AND status = 'active'", [ctx.workspaceId]);
      let queued = 0;
      for (const e of eps.filter(x => matches(x.events, i.event))) {
        const n = await ctx.q.query(`INSERT INTO webhook_delivery (workspace_id, endpoint_id, event, payload, build, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (endpoint_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [ctx.workspaceId, e.id, i.event, body, i.build ?? null, i.key ? `${i.event}:${i.key}` : null]);
        queued += n.rowCount ?? 0;
      }
      return { queued };
    },
  }));
}
