// Channel tools: connect a WhatsApp number, read a person's channels and one timeline (calls and messages together),
// read a conversation, send a team member's message (A2: it reaches a person), and stop WhatsApp for a person.
import { createHash, randomBytes } from 'node:crypto';
import { label } from '../../labels.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
import { num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { appendWaConsent, waConsentSummary, waOptedOut } from './consent.ts';
import { BLOCK_WORDS, gatedSend, previewSend, type BlockReason } from './gate.ts';
import { connections, threadById, windowClosesAt, windowOpen, type ThreadRow } from './store.ts';

const PEOPLE = ['owner', 'builder', 'operator', 'compliance'] as const;
export const webhookPath = (id: string) => `/hooks/channels/whatsapp/${id}`;
const mask = (e164: string | null) => e164 && e164.length > 7 ? e164.slice(0, 3) + '•••••' + e164.slice(-4) : '•••';

type MessageRow = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; kind: string; body: string; author: string; status: string;
  blocked_by: string[] | null; error: string | null; category: string | null; purpose: string | null; cost_inr_milli: string; template_id: string | null;
  conversation_id: string | null; created_at: Date; sent_at: Date | null; delivered_at: Date | null; read_at: Date | null; failed_at: Date | null; reply_state: string | null };

export function messageView(m: MessageRow, viewer: boolean) {
  return {
    id: m.id, threadId: m.thread_id, direction: m.direction, kind: m.kind, body: viewer ? undefined : m.body, author: m.author.startsWith('member:') ? 'member' : m.author.split(':')[0],
    authorMemberId: m.author.startsWith('member:') ? m.author.slice(7) : null, status: m.status, category: m.category, purpose: m.purpose,
    blockedBy: (m.blocked_by ?? []).map(r => ({ code: r, words: BLOCK_WORDS[r as BlockReason] ?? r })), error: m.error,
    costInrMilli: Number(m.cost_inr_milli), templateId: m.template_id, callId: m.conversation_id, replyState: m.reply_state,
    at: m.created_at, sentAt: m.sent_at, deliveredAt: m.delivered_at, readAt: m.read_at, failedAt: m.failed_at,
  };
}
export const MESSAGE_COLS = `id, thread_id, direction, kind, body, author, status, blocked_by, error, category, purpose, cost_inr_milli::text, template_id,
  conversation_id, created_at, sent_at, delivered_at, read_at, failed_at, reply_state`;

export function threadView(t: ThreadRow & { contact_name?: string | null; contact_e164?: string | null }, viewer: boolean) {
  return {
    id: t.id, connectionId: t.connection_id, contactId: t.contact_id, contactName: viewer ? null : t.contact_name ?? null,
    number: viewer ? mask('+' + t.wa_id) : '+' + t.wa_id, onFile: !!t.contact_id,
    window: { open: windowOpen(t), closesAt: windowClosesAt(t), lastInboundAt: t.last_inbound_at },
    handledBy: t.mode === 'human' ? 'person' : 'agent', handOff: t.handoff_reason ? { reason: t.handoff_reason, at: t.handoff_at } : null,
    claimedBy: t.claimed_by, claimedAt: t.claimed_at, resolvedAt: t.resolved_at, optedOutAt: t.opted_out_at, lastMessageAt: t.last_message_at,
  };
}

export function registerChannelTools(r: Registry): void {
  r.register(tool(obj({ integrationId: uuid(), name: opt(str({ min: 1, max: 80 })) }), {
    name: 'channel.connect', risk: 'policy', roles: ['owner', 'builder'],
    summary: 'Connect a WhatsApp number (from a connected WhatsApp Cloud API integration) so follow-ups can be sent and messages answered; returns its webhook address and verify token once',
    describe: async (i, ctx) => `Connect the WhatsApp number in ${await label(ctx, 'integration', i.integrationId)} so Vyakti can send approved follow-ups on it and receive messages`,
    redactResult: (o: { verifyToken?: string }) => ({ ...o, verifyToken: o.verifyToken ? '(shown once)' : undefined }),
    run: async (ctx, i) => {
      const ig = await one<{ id: string; kind: string; name: string; config: Record<string, string>; status: string }>(ctx.q,
        'SELECT id, kind, name, config, status FROM integration WHERE id = $1 AND workspace_id = $2', [i.integrationId, ctx.workspaceId]);
      if (!ig || ig.status !== 'connected') throw new Error('no connected integration with that id; connect WhatsApp Cloud API in Integrations first');
      if (ig.kind !== 'whatsapp_cloud') throw new Error('that integration is not WhatsApp Cloud API');
      if (!ig.config?.phone_number_id) throw new Error('the WhatsApp integration has no phone number ID; add it in Integrations');
      const token = randomBytes(18).toString('base64url');
      try {
        const row = await one<{ id: string }>(ctx.q, `INSERT INTO channel_connection (workspace_id, integration_id, name, phone_number_id, waba_id, display_number, verify_token_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [ctx.workspaceId, ig.id, i.name ?? ig.name, ig.config.phone_number_id, ig.config.waba_id ?? null,
          ig.config.display_number ?? null, createHash('sha256').update(token).digest('hex')]);
        return { connectionId: row!.id, webhookPath: webhookPath(row!.id), verifyToken: token,
          note: 'In Meta\'s app dashboard, set the callback URL to this address on your Vyakti domain and paste the verify token; subscribe to messages and message_template_status_update. The token is shown once.' };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new Error('this WhatsApp number is already connected');
        throw e;
      }
    },
  }));

  r.register(tool(obj({}), {
    name: 'channel.list', risk: 'read', summary: 'The connected WhatsApp numbers: status, the agent that answers, webhook address, and message counts for the last 7 days',
    run: async ctx => ({
      connections: await Promise.all((await connections(ctx.q, ctx.workspaceId)).map(async c => {
        const n = await one<{ out: string; inb: string; blocked: string; cost: string }>(ctx.q, `SELECT
            count(*) FILTER (WHERE direction = 'outbound' AND status NOT IN ('blocked'))::text AS out,
            count(*) FILTER (WHERE direction = 'inbound')::text AS inb,
            count(*) FILTER (WHERE status = 'blocked')::text AS blocked,
            coalesce(sum(cost_inr_milli), 0)::text AS cost
          FROM channel_message WHERE connection_id = $1 AND workspace_id = $2 AND created_at > now() - interval '7 days'`, [c.id, ctx.workspaceId]);
        return { id: c.id, channel: 'whatsapp', name: c.name, displayNumber: c.display_number, phoneNumberId: c.phone_number_id, wabaId: c.waba_id,
          integration: c.integration_name, agentId: c.agent_id, status: c.status, webhookPath: webhookPath(c.id), webhookVerifiedAt: c.webhook_verified_at, createdAt: c.created_at,
          last7Days: { sent: Number(n?.out ?? 0), received: Number(n?.inb ?? 0), blocked: Number(n?.blocked ?? 0), costInrMilli: Number(n?.cost ?? 0) } };
      })),
    }),
  }));

  r.register(tool(obj({ connectionId: uuid() }), {
    // Pausing only stops sends, so it never waits for approval; resuming reaches people again and does.
    name: 'channel.pause', risk: 'draft', roles: ['owner', 'operator', 'compliance'], summary: 'Pause a WhatsApp number: nothing is sent from it until it is resumed (messages still arrive)',
    run: async (ctx, i) => {
      const r2 = await ctx.q.query("UPDATE channel_connection SET status = 'paused', updated_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'active'", [i.connectionId, ctx.workspaceId]);
      return { paused: (r2.rowCount ?? 0) > 0 };
    },
  }));
  r.register(tool(obj({ connectionId: uuid() }), {
    name: 'channel.resume', risk: 'external', roles: ['owner', 'operator'], summary: 'Resume a paused WhatsApp number so follow-ups and replies go out again',
    describe: async (i, ctx) => {
      const c = await one<{ name: string }>(ctx.q, 'SELECT name FROM channel_connection WHERE id = $1 AND workspace_id = $2', [i.connectionId, ctx.workspaceId]);
      return `Resume the WhatsApp number "${c?.name ?? 'this number'}" so follow-ups and replies are sent from it again`;
    },
    run: async (ctx, i) => {
      const r2 = await ctx.q.query("UPDATE channel_connection SET status = 'active', updated_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'paused'", [i.connectionId, ctx.workspaceId]);
      return { resumed: (r2.rowCount ?? 0) > 0 };
    },
  }));

  r.register(tool(obj({ contactId: uuid() }), {
    name: 'contact.channels', risk: 'read', summary: "A person's channels: WhatsApp opt-ins by purpose, whether they stopped WhatsApp, the 24-hour window and their conversation",
    run: async (ctx, i) => {
      const c = await one<{ id: string; erased_at: Date | null }>(ctx.q, 'SELECT id, erased_at FROM contact WHERE id = $1 AND workspace_id = $2', [i.contactId, ctx.workspaceId]);
      if (!c) throw new Error('no such contact in this workspace');
      const out = await waOptedOut(ctx.q, ctx.workspaceId, c.id);
      const consent = await waConsentSummary(ctx.q, ctx.workspaceId, c.id);
      const threads = await many<ThreadRow>(ctx.q, 'SELECT * FROM channel_thread WHERE workspace_id = $1 AND contact_id = $2 ORDER BY last_message_at DESC', [ctx.workspaceId, c.id]);
      return {
        voice: { note: 'Calls follow the contact\'s suppression, DND and consent (see the contact page).' },
        whatsapp: {
          stopped: out.state === 'withdrawn', stoppedAt: out.state === 'withdrawn' ? out.at : null, stoppedVia: out.state === 'withdrawn' ? out.source : null,
          optIns: consent.filter(k => k.purpose !== 'all' || k.granted).map(k => ({ purpose: k.purpose, granted: k.granted, source: k.source, at: k.effective_at })),
          conversations: threads.map(t => threadView(t, ctx.actor.role === 'viewer')),
        },
      };
    },
  }));

  r.register(tool(obj({ contactId: uuid(), limit: opt(num({ int: true, min: 1, max: 200 })), before: opt(str({ max: 40 })) }), {
    name: 'contact.timeline', risk: 'read', summary: "One timeline for a person: their calls and WhatsApp messages together, newest first",
    run: async (ctx, i) => {
      const c = await one<{ id: string }>(ctx.q, 'SELECT id FROM contact WHERE id = $1 AND workspace_id = $2', [i.contactId, ctx.workspaceId]);
      if (!c) throw new Error('no such contact in this workspace');
      const before = i.before ? new Date(i.before) : new Date(Date.now() + 60_000);
      if (Number.isNaN(before.getTime())) throw new Error('before must be a date and time');
      const lim = i.limit ?? 50;
      const viewer = ctx.actor.role === 'viewer';
      const calls = await many<{ id: string; channel: string; direction: string; status: string; started_at: Date; ended_at: Date | null; outcome: string | null;
        reason_code: string | null; summary: string | null; test: boolean }>(ctx.q,
        `SELECT id, channel, direction, status, started_at, ended_at, outcome, reason_code, analysis->>'summary' AS summary,
                coalesce(run_manifest->>'test', 'false') = 'true' AS test
           FROM conversation WHERE workspace_id = $1 AND contact_id = $2 AND started_at < $3 ORDER BY started_at DESC LIMIT $4`, [ctx.workspaceId, c.id, before, lim]);
      const msgs = await many<MessageRow>(ctx.q, `SELECT ${MESSAGE_COLS} FROM channel_message WHERE workspace_id = $1 AND contact_id = $2 AND created_at < $3
        ORDER BY created_at DESC LIMIT $4`, [ctx.workspaceId, c.id, before, lim]);
      const items = [
        ...calls.filter(k => k.channel !== 'test' && !k.test).map(k => ({ type: 'call' as const, at: k.started_at, call: { id: k.id, direction: k.direction, status: k.status,
          endedAt: k.ended_at, outcome: k.outcome, reasonCode: k.reason_code, summary: viewer ? null : k.summary } })),
        ...msgs.map(m => ({ type: 'message' as const, at: m.created_at, channel: 'whatsapp', message: messageView(m, viewer) })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, lim);
      return { items, next: items.length === lim ? items[items.length - 1].at.toISOString() : null };
    },
  }));

  r.register(tool(obj({ threadId: uuid(), limit: opt(num({ int: true, min: 1, max: 500 })) }), {
    name: 'message.list', risk: 'read', summary: 'One WhatsApp conversation: the thread (window, who handles it) and its messages in order',
    run: async (ctx, i) => {
      const t = await one<ThreadRow & { contact_name: string | null }>(ctx.q, `SELECT t.*, c.name AS contact_name FROM channel_thread t
        LEFT JOIN contact c ON c.id = t.contact_id AND c.workspace_id = t.workspace_id WHERE t.id = $1 AND t.workspace_id = $2`, [i.threadId, ctx.workspaceId]);
      if (!t) throw new Error('no such conversation in this workspace');
      const msgs = await many<MessageRow>(ctx.q, `SELECT * FROM (SELECT ${MESSAGE_COLS} FROM channel_message WHERE workspace_id = $1 AND thread_id = $2
        ORDER BY created_at DESC LIMIT $3) x ORDER BY created_at`, [ctx.workspaceId, t.id, i.limit ?? 200]);
      return { thread: threadView(t, ctx.actor.role === 'viewer'), messages: msgs.map(m => messageView(m, ctx.actor.role === 'viewer')) };
    },
  }));

  const sendInput = obj({ threadId: uuid(), text: str({ min: 1, max: 4096 }), purpose: opt(str({ min: 2, max: 80 })) });
  r.register(tool(sendInput, {
    name: 'message.preview', risk: 'read', summary: 'What would happen if this message were sent now: allowed or the reasons it would be stopped, and the text after the safety check',
    run: async (ctx, i) => {
      const p = await previewSend(ctx.q, ctx.workspaceId, { to: { threadId: i.threadId }, content: { kind: 'text', text: i.text }, purpose: i.purpose ?? 'service',
        author: { kind: 'member', memberId: ctx.actor.id ?? 'unknown' } });
      return { ...p, reasons: p.reasons.map(r2 => ({ code: r2, words: BLOCK_WORDS[r2 as BlockReason] ?? r2 })) };
    },
  }));

  r.register(tool(sendInput, {
    name: 'message.send', risk: 'external', roles: [...PEOPLE],
    summary: "Send a team member's WhatsApp message in an open conversation (inside the 24-hour window); it passes the safety check and every channel rule first",
    describe: async (i, ctx) => {
      const t = await threadById(ctx.q, ctx.workspaceId, i.threadId);
      const who = t?.contact_id ? await label(ctx, 'contact', t.contact_id) : 'this person';
      return `Send this WhatsApp message to ${who}: "${i.text.length > 160 ? i.text.slice(0, 157) + '...' : i.text}"`;
    },
    // The send reaches WhatsApp, so it runs outside the transaction; gatedSend stores the message itself.
    prepare: async (ctx, i) => {
      if (!ctx.actor.id) throw new Error('a message from the inbox needs a signed-in member');
      return gatedSend(ctx.pool, ctx.workspaceId, { to: { threadId: i.threadId }, content: { kind: 'text', text: i.text }, purpose: i.purpose ?? 'service',
        author: { kind: 'member', memberId: ctx.actor.id } });
    },
    run: async (_ctx, _i, sent) => {
      const s = sent as Awaited<ReturnType<typeof gatedSend>>;
      return { ...s, reasons: s.reasons.map(r2 => ({ code: r2, words: BLOCK_WORDS[r2] })) };
    },
  }));

  r.register(tool(obj({ contactId: uuid(), reason: str({ min: 2, max: 200 }) }), {
    // Stopping messages only lowers risk, so it runs at once; starting them again is consent.record (Compliance).
    name: 'channel.opt_out', risk: 'draft', roles: ['owner', 'operator', 'compliance'],
    summary: 'Stop WhatsApp messages to a person (for example they asked on a call or by email); calls are not affected. Lowers risk, so it never waits for approval',
    run: async (ctx, i) => {
      const c = await one<{ id: string; erased_at: Date | null }>(ctx.q, 'SELECT id, erased_at FROM contact WHERE id = $1 AND workspace_id = $2', [i.contactId, ctx.workspaceId]);
      if (!c) throw new Error('no such contact in this workspace');
      if (c.erased_at) return { already: true };
      const id = await appendWaConsent(ctx.q, ctx.workspaceId, c.id, { granted: false, purpose: 'all', source: 'manual',
        evidence: { reason: i.reason, by: `${ctx.actor.type}:${ctx.actor.id ?? ''}` } });
      return { consentId: id };
    },
  }));
}
