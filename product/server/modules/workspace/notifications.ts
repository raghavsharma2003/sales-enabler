// Notifications that reach people, outside the app: Slack (an incoming webhook, sent only to hooks.slack.com) and email
// (SMTP from the environment). Each destination picks which of these it gets:
//   crisis           a crisis hand-off: "A caller may be in distress — open the call". Never a caller's words, a name or a number.
//   hand_off         any other hand-off to a person (a person taking over a call is not one)
//   campaign.paused  a campaign paused itself (a spend cap, the wallet, a guard), not one a person paused
//   wallet.low       the wallet went low, empty or overdrawn
// The events come from webhook_outbox (triggers, 1020 and 1030), so nothing in calls, campaigns or money calls this.
// The message text is made when it is sent, from ids and codes, so no caller words are ever stored or sent. The in-app
// alerts and queues stay as they are: email that is not set up is recorded as "skipped" with the reason, never silent.
// Speed: the outbox trigger NOTIFYs vp_outbox on commit and startNotifier() sends at once; a crisis is out in about a second.
import type pg from 'pg';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { many, one, tx, type Queryable } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
import { label } from '../../labels.ts';
import { arr, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { integrationSecretsById, slackUrlAllowed } from './integrations.ts';
import { sendMail, smtpConfig, validEmail } from './smtp.ts';
import { ON_DUTY_ROLES } from '../calls/handoffs.ts';

export const NOTIFY_EVENTS = [
  { event: 'crisis', label: 'A caller may be in distress', description: 'A crisis hand-off. Sent at once, with a link to the call and nothing the caller said.' },
  { event: 'hand_off', label: 'A call was handed to your team', description: 'Any other hand-off or callback request, with a link to the queue.' },
  { event: 'campaign.paused', label: 'A campaign paused itself', description: 'A spend cap, the wallet or a safety guard paused it. Pauses made by a person are not sent.' },
  { event: 'wallet.low', label: 'The wallet is running low', description: 'The balance went below the low mark, to zero or below.' },
] as const;
const NOTIFY_NAMES = NOTIFY_EVENTS.map(e => e.event);
const MAX_ATTEMPTS = 3, SEND_MS = 8000;

/** Which notification an outbox event is, or null when no person needs to hear about it. */
export function classify(event: string, data: Record<string, any>): string | null {
  if (event === 'hand_off.created') return data.reason === 'crisis' ? 'crisis' : data.reason === 'takeover' ? null : 'hand_off';
  if (event === 'campaign.state_changed') return data.to === 'paused' && data.cause && data.cause !== 'person' ? 'campaign.paused' : null;
  if (event === 'wallet.low') return 'wallet.low';
  return null;
}

/** Outbox rows to deliveries, once per destination that listens and existed when the event happened. */
export async function notifyFanOut(pool: pg.Pool, o: { workspaceId?: string } = {}): Promise<{ events: number; queued: number }> {
  return tx(pool, async c => {
    const rows = (await c.query<{ id: string; workspace_id: string; event: string; data: Record<string, any>; created_at: Date }>(
      `SELECT id, workspace_id, event, data, created_at FROM webhook_outbox WHERE notified_at IS NULL AND ($1::uuid IS NULL OR workspace_id = $1)
       ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED`, [o.workspaceId ?? null])).rows;
    let queued = 0;
    for (const r of rows) {
      const kind = classify(r.event, r.data);
      if (!kind) continue;
      const n = await c.query(`INSERT INTO notification_delivery (workspace_id, destination_id, event, outbox_id, data)
        SELECT $1, d.id, $2, $3, $4 FROM notification_destination d WHERE d.workspace_id = $1 AND d.status = 'active' AND $2 = ANY(d.events) AND d.created_at <= $5
        ON CONFLICT (destination_id, outbox_id) WHERE outbox_id IS NOT NULL DO NOTHING`, [r.workspace_id, kind, r.id, JSON.stringify(r.data), r.created_at]);
      queued += n.rowCount ?? 0;
    }
    if (rows.length) await c.query('UPDATE webhook_outbox SET notified_at = now() WHERE id = ANY($1::bigint[])', [rows.map(r => r.id)]);
    return { events: rows.length, queued };
  });
}

const appBase = () => { const b = (process.env.VP_PUBLIC_URL ?? '').trim().replace(/\/+$/, ''); return /^https?:\/\//.test(b) ? b : null; };
const link = (path: string) => { const b = appBase(); return b ? `${b}${path}` : null; };
const inr = (milli: unknown) => `₹${(Number(milli ?? 0) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const CAUSE: Record<string, string> = { wallet_low: 'the wallet is too low', guard: 'a safety guard stopped it' };
const causeWords = (c: string) => c.startsWith('cap_reached') ? 'its spend cap was reached' : CAUSE[c] ?? 'it was stopped automatically';

/** The words of a notification, from codes and ids only. A crisis carries nothing the caller said. */
export async function message(q: Queryable, ws: string, event: string, data: Record<string, any>, test = false): Promise<{ subject: string; text: string }> {
  const w = (await one<{ name: string }>(q, 'SELECT name FROM workspace WHERE id = $1', [ws]))?.name ?? 'your workspace';
  const pre = `${test ? '[Test] ' : ''}Vyakti, ${w}: `;
  const open = (path: string, what: string) => { const l = link(path); return l ? `${what}: ${l}` : `${what} in Vyakti.`; };
  switch (event) {
    case 'crisis': return { subject: `${pre}a caller may be in distress`, text: `${pre}A caller may be in distress — ${open(data.conversationId ? `/calls/${data.conversationId}` : '/handoffs', 'open the call')}` };
    case 'hand_off': return { subject: `${pre}a call was handed to your team`, text: `${pre}A call was handed to your team. ${open('/handoffs', 'Open the hand-offs queue')}` };
    case 'campaign.paused': return { subject: `${pre}a campaign paused itself`, text: `${pre}The campaign "${String(data.name ?? 'a campaign').slice(0, 120)}" paused itself because ${causeWords(String(data.cause ?? ''))}. ${open(data.campaignId ? `/campaigns/${data.campaignId}` : '/campaigns', 'Open the campaign')}` };
    default: return { subject: `${pre}the wallet is ${data.to === 'low' ? 'running low' : 'empty'}`, text: `${pre}The wallet is ${data.to === 'low' ? 'running low' : data.to === 'overdrawn' ? 'overdrawn' : 'empty'} (${inr(data.balanceInrMilli)} left). New calls wait until money is added; calls in progress finish. ${open('/settings/billing', 'Add money')}` };
  }
}

function postJson(raw: string, body: string): Promise<number> {
  const u = new URL(raw);
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }, signal: AbortSignal.timeout(SEND_MS) },
      res => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('error', reject); req.end(body);
  });
}

class Skip extends Error {}
interface Due { id: string; workspace_id: string; destination_id: string; event: string; data: Record<string, any>; attempts: number; test: boolean }

/** Send due notifications. Safe from several processes: claimed with SKIP LOCKED and a lease. */
export async function sendNotifications(pool: pg.Pool, o: { workspaceId?: string; ids?: string[] } = {}): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!o.ids) await notifyFanOut(pool, { workspaceId: o.workspaceId });
  const due = (await pool.query<Due>(`UPDATE notification_delivery SET locked_until = now() + interval '60 seconds', attempts = attempts + 1
     WHERE id IN (SELECT id FROM notification_delivery WHERE status = 'pending' AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now())
       AND ($1::uuid IS NULL OR workspace_id = $1) AND ($2::uuid[] IS NULL OR id = ANY($2)) ORDER BY (event = 'crisis') DESC, next_attempt_at LIMIT 50 FOR UPDATE SKIP LOCKED)
     RETURNING id, workspace_id, destination_id, event, data, attempts, test`, [o.workspaceId ?? null, o.ids ?? null])).rows;
  let sent = 0, failed = 0, skipped = 0;
  await Promise.all(due.map(async d => {
    let error: string | null = null, final = false;
    try {
      const dest = await one<{ kind: string; integration_id: string | null; recipients: string[]; status: string }>(pool,
        'SELECT kind, integration_id, recipients, status FROM notification_destination WHERE id = $1 AND workspace_id = $2', [d.destination_id, d.workspace_id]);
      if (!dest || dest.status !== 'active') throw new Skip('the destination was removed');
      const m = await message(pool, d.workspace_id, d.event, d.data, d.test);
      if (dest.kind === 'slack') {
        const url = dest.integration_id ? (await integrationSecretsById(pool, d.workspace_id, dest.integration_id))?.webhook_url : null;
        if (!url) throw new Skip('the Slack integration was disconnected');
        if (!slackUrlAllowed(url)) throw new Skip('the Slack address is not on hooks.slack.com, so nothing was sent');
        const status = await postJson(url, JSON.stringify({ text: m.text }));
        if (status < 200 || status >= 300) throw new Error(`Slack answered ${status}`);
      } else {
        const cfg = smtpConfig();
        if (!cfg) throw new Skip('Email is not set up on this server; it was shown in the app only');
        const to = dest.recipients.length ? dest.recipients : (await many<{ email: string }>(pool,
          "SELECT email FROM member WHERE workspace_id = $1 AND status = 'active' AND role = ANY($2::text[])", [d.workspace_id, [...ON_DUTY_ROLES]])).map(x => x.email);
        if (!to.length) throw new Skip('no one is on duty to email');
        await sendMail(cfg, { to, subject: m.subject, text: m.text });
      }
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      final = e instanceof Skip;
    }
    if (!error) { await pool.query("UPDATE notification_delivery SET status = 'sent', error = NULL, sent_at = now(), locked_until = NULL WHERE id = $1", [d.id]); sent++; }
    else if (final) { await pool.query("UPDATE notification_delivery SET status = 'skipped', error = $2, locked_until = NULL WHERE id = $1", [d.id, error]); skipped++; }
    else if (d.attempts >= MAX_ATTEMPTS || d.test) { await pool.query("UPDATE notification_delivery SET status = 'failed', error = $2, locked_until = NULL WHERE id = $1", [d.id, error]); failed++; }
    else await pool.query("UPDATE notification_delivery SET error = $2, locked_until = NULL, next_attempt_at = now() + ($3 || ' seconds')::interval WHERE id = $1", [d.id, error, String(20 * 3 ** (d.attempts - 1))]);
  }));
  return { sent, failed, skipped };
}

/** Listen for vp_outbox and run `pump` at once (coalesced), reconnecting after an error. Returns a stop function. */
export function startNotifier(pool: pg.Pool, pump: () => Promise<unknown>): () => void {
  let stopped = false, running = false, again = false, client: pg.PoolClient | null = null;
  const run = async () => {
    if (running) { again = true; return; }
    running = true;
    try { do { again = false; await pump(); } while (again && !stopped); }
    catch (e) { console.error('[vp] notifications', e instanceof Error ? e.message : e); }
    finally { running = false; }
  };
  const listen = async () => {
    if (stopped) return;
    try {
      client = await pool.connect();
      client.on('notification', () => { void run(); });
      client.on('error', () => { client?.release(true); client = null; if (!stopped) setTimeout(listen, 5000).unref(); });
      await client.query('LISTEN vp_outbox');
    } catch (e) {
      console.error('[vp] notifications listen', e instanceof Error ? e.message : e);
      client?.release(true); client = null;
      if (!stopped) setTimeout(listen, 5000).unref();
    }
  };
  setTimeout(() => { void listen(); }, 1000).unref();      // after start-up; a script that only builds the app exits first
  return () => { stopped = true; if (client) { client.query('UNLISTEN vp_outbox').catch(() => {}).finally(() => client?.release()); } };
}

export function registerNotifications(r: Registry) {
  r.register(tool(obj({}), {
    name: 'notification.destination.list', risk: 'read', summary: 'Where alerts go outside the app (Slack, email), which events each gets, and whether email is set up',
    run: async ctx => {
      const cfg = smtpConfig();
      return {
        destinations: await many(ctx.q, `SELECT d.id, d.kind, d.name, d.events, d.recipients, d.created_at AS "createdAt",
            CASE WHEN i.id IS NOT NULL THEN jsonb_build_object('id', i.id, 'name', i.name, 'connected', i.status = 'connected') END AS integration,
            (SELECT status FROM notification_delivery x WHERE x.destination_id = d.id ORDER BY x.created_at DESC LIMIT 1) AS "lastStatus"
          FROM notification_destination d LEFT JOIN integration i ON i.id = d.integration_id AND i.workspace_id = d.workspace_id
          WHERE d.workspace_id = $1 AND d.status = 'active' ORDER BY d.created_at`, [ctx.workspaceId]),
        email: cfg ? { configured: true, from: cfg.from } : { configured: false, from: null, note: 'Email not set up: this server has no outgoing mail settings (VP_SMTP_HOST and VP_SMTP_FROM). Email alerts are recorded as not sent and stay in the app.' },
        events: NOTIFY_EVENTS,
      };
    },
  }));

  r.register(tool(obj({ kind: str({ oneOf: ['slack', 'email'] as const }), name: str({ min: 1, max: 80 }), events: arr(str({ oneOf: NOTIFY_NAMES }), { min: 1, max: 4 }),
    integrationId: opt(uuid()), recipients: opt(arr(str({ max: 254 }), { max: 20 })) }), {
    name: 'notification.destination.create', risk: 'policy', summary: 'Send alerts (a caller in distress, hand-offs, a paused campaign, a low wallet) to Slack or email',
    describe: async (i, ctx) => {
      const what = i.events.map(e => NOTIFY_EVENTS.find(x => x.event === e)?.label.toLowerCase() ?? e).join('; ');
      const where = i.kind === 'slack' ? `the Slack channel of "${i.integrationId ? await label(ctx, 'integration', i.integrationId) : 'an integration'}"`
        : i.recipients?.length ? `email to ${i.recipients.join(', ')}` : 'email to everyone on duty (owners, operators and compliance)';
      return `Send alerts to ${where}: ${what}. No caller's words, names or numbers are sent.`;
    },
    run: async (ctx, i) => {
      if (i.kind === 'slack') {
        if (!i.integrationId) throw new Error('choose the Slack integration that holds the incoming-webhook address');
        const it = await one<{ kind: string }>(ctx.q, "SELECT kind FROM integration WHERE id = $1 AND workspace_id = $2 AND status = 'connected'", [i.integrationId, ctx.workspaceId]);
        if (it?.kind !== 'slack') throw new Error('no connected Slack integration with that id in this workspace');
      } else if (i.integrationId) throw new Error('an email destination takes recipients, not an integration');
      const bad = (i.recipients ?? []).filter(x => !validEmail(x));
      if (bad.length) throw new Error(`not an email address: ${bad.join(', ')}`);
      if (i.kind === 'slack' && i.recipients?.length) throw new Error('a Slack destination posts to its channel; it takes no recipients');
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO notification_destination (workspace_id, kind, name, integration_id, recipients, events, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [ctx.workspaceId, i.kind, i.name, i.integrationId ?? null, i.recipients ?? [], [...new Set(i.events)], ctx.actor.id ?? ctx.actor.type]);
      return { id: row!.id, kind: i.kind, events: [...new Set(i.events)], emailConfigured: i.kind === 'email' ? !!smtpConfig() : undefined };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'notification.destination.delete', risk: 'destructive', summary: 'Stop sending alerts to a Slack channel or email destination',
    describe: async (i, ctx) => `Stop sending alerts to ${(await one<{ name: string }>(ctx.q, 'SELECT name FROM notification_destination WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]))?.name ?? 'this destination'}`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT status || '|' || array_to_string(events, ',') AS v FROM notification_destination WHERE id = $1 AND workspace_id = $2", [i.id, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const n = await ctx.q.query("UPDATE notification_destination SET status = 'deleted' WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no such destination in this workspace');
      await ctx.q.query("UPDATE notification_delivery SET status = 'skipped', error = 'the destination was removed' WHERE destination_id = $1 AND status = 'pending'", [i.id]);
      return { id: i.id, deleted: true };
    },
  }));

  // A made-up message, sent at once, so a person can see it arrive; marked [Test], never retried.
  r.register(tool(obj({ id: uuid(), event: opt(str({ oneOf: NOTIFY_NAMES })) }), {
    name: 'notification.test', risk: 'test', summary: 'Send a test alert to a Slack channel or email destination now and see whether it arrived',
    prepare: async (ctx, i) => {
      const d = await one(ctx.pool, "SELECT 1 FROM notification_destination WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [i.id, ctx.workspaceId]);
      if (!d) throw new Error('no such destination in this workspace');
      const event = i.event ?? 'hand_off';
      const data = event === 'campaign.paused' ? { name: 'Sample campaign', cause: 'cap_reached:campaign' } : event === 'wallet.low' ? { to: 'low', balanceInrMilli: 250000 } : {};
      const row = await one<{ id: string }>(ctx.pool, `INSERT INTO notification_delivery (workspace_id, destination_id, event, data, test) VALUES ($1,$2,$3,$4,true) RETURNING id`, [ctx.workspaceId, i.id, event, data]);
      await sendNotifications(ctx.pool, { workspaceId: ctx.workspaceId, ids: [row!.id] });
      const x = await one<{ status: string; error: string | null }>(ctx.pool, 'SELECT status, error FROM notification_delivery WHERE id = $1', [row!.id]);
      return { deliveryId: row!.id, event, status: x!.status, error: x!.error };
    },
    run: async (_ctx, _i, prepared) => prepared as { deliveryId: string; event: string; status: string; error: string | null },
  }));

  r.register(tool(obj({ destinationId: opt(uuid()) }), {
    name: 'notification.deliveries', risk: 'read', summary: 'Alerts sent to Slack and email, newest first, and whether each arrived',
    run: async (ctx, i) => ({
      deliveries: await many(ctx.q, `SELECT id, destination_id AS "destinationId", event, status, attempts, error, test, created_at AS "createdAt", sent_at AS "sentAt"
        FROM notification_delivery WHERE workspace_id = $1 AND ($2::uuid IS NULL OR destination_id = $2) ORDER BY created_at DESC, id DESC LIMIT 50`, [ctx.workspaceId, i.destinationId ?? null]),
    }),
  }));
}
