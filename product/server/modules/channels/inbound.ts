// The WhatsApp webhook: GET is Meta's subscribe handshake, POST carries messages and delivery statuses. Each delivery
// is checked against this connection's app secret before anything is read, and each event is applied once.
//   - a message is an episode on the person's timeline and opens (or keeps open) the 24-hour window;
//   - STOP, or "message mat bhejo", is a WhatsApp opt-out at once, in the same transaction (a withdrawal in the consent
//     ledger, or on the thread when the number is not on file); nothing answers it;
//   - otherwise, when the number has an agent and nobody is handling the thread, the message waits for the agent's
//     reply (reply_state 'pending'; agent.ts answers it);
//   - a delivered status settles the message's held price on the meter (cost_line component 'message'); a failure
//     releases it and stores WhatsApp's reason in words.
// Sender identity: a message from a number on file is channel-verified (the phone number matched); one from a number
// not on file is kept as an episode on its thread only and never creates facts or follow-ups.
import type pg from 'pg';
import { settle, release } from '../../ledger.ts';
import { one, tx } from '../../db.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { callerSignals } from '../../../shared/safety/index.ts';
import { appendWaConsent, isOptOutMessage } from './consent.ts';
import { contactForWaId, credentials, threadFor, type ConnectionRow } from './store.ts';
import type { ChannelEvent, InboundMessage, StatusEvent, TemplateEvent } from './transport.ts';
import { whatsapp, ERROR_WORDS } from './whatsapp.ts';

const RANK: Record<string, number> = { queued: 0, unknown: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Hooks other parts of this module add (template review updates arrive on the same webhook). */
export const inboundHooks: { template?: (c: pg.PoolClient, conn: ConnectionRow, e: TemplateEvent) => Promise<void> } = {};

export async function webhook(pool: pg.Pool, req: Req, connectionId: string): Promise<Res> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw new HttpError(404, 'not_found', 'no such channel');
  const conn = await one<ConnectionRow>(pool, "SELECT * FROM channel_connection WHERE id = $1 AND status <> 'disconnected'", [connectionId]);
  if (!conn) throw new HttpError(404, 'not_found', 'no such channel');
  const creds = await credentials(pool, conn);
  if (!creds) throw new HttpError(409, 'not_connected', 'this channel has no credentials');
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const v = whatsapp.verify({ method: req.method === 'GET' ? 'GET' : 'POST', query: req.query, headers: req.headers, raw },
    { appSecret: creds.appSecret, verifyTokenHash: conn.verify_token_hash });
  if (!v.ok) throw new HttpError(req.method === 'GET' ? 403 : 401, 'unverified', v.reason);
  if (req.method === 'GET') {
    await pool.query('UPDATE channel_connection SET webhook_verified_at = now() WHERE id = $1', [conn.id]);
    return { status: 200, raw: v.challenge ?? '', headers: { 'content-type': 'text/plain; charset=utf-8' } };
  }
  const events = whatsapp.parse(raw);
  const applied = await applyEvents(pool, conn, events);
  return { status: 200, body: { received: events.length, applied } };
}

const keyOf = (e: ChannelEvent) => e.kind === 'message' ? `m:${e.providerId}` : e.kind === 'status' ? `s:${e.providerId}:${e.status}` : `t:${e.providerTemplateId}:${e.status}`;

export async function applyEvents(pool: pg.Pool, conn: ConnectionRow, events: ChannelEvent[]): Promise<number> {
  let n = 0;
  for (const e of events) {
    // An event for another number on the same app is not this connection's to apply.
    if (e.kind !== 'template' && e.phoneNumberId && e.phoneNumberId !== conn.phone_number_id) continue;
    if (e.kind === 'template' && conn.waba_id && e.wabaId && e.wabaId !== conn.waba_id) continue;
    const done = await tx(pool, async c => {
      const fresh = await c.query('INSERT INTO channel_hook_event (connection_id, event_key, workspace_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [conn.id, keyOf(e), conn.workspace_id]);
      if (!fresh.rowCount) return false;
      if (e.kind === 'message') await onMessage(c, conn, e);
      else if (e.kind === 'status') await onStatus(c, conn, e);
      else await inboundHooks.template?.(c, conn, e);
      return true;
    });
    if (done) n++;
  }
  return n;
}

async function onMessage(c: pg.PoolClient, conn: ConnectionRow, e: InboundMessage) {
  const ws = conn.workspace_id;
  const contactId = await contactForWaId(c, ws, e.from);
  const t = await threadFor(c, conn, e.from, contactId);
  await c.query(`UPDATE channel_thread SET last_inbound_at = greatest(coalesce(last_inbound_at, $2), $2), last_message_at = greatest(last_message_at, $2)
    WHERE id = $1`, [t.id, e.at]);
  const optOut = isOptOutMessage(e.text);
  const sig = callerSignals(e.text);
  // Crisis words go to a person at once (and agent.ts still sends the help lines); a request for a person too.
  const handOff = sig.crisis ? 'crisis' : sig.wantsHuman ? 'asks_for_human' : null;
  const replyState = optOut ? 'skipped' : (t.mode === 'human' || handOff) ? (sig.crisis ? 'pending' : 'handed_off') : conn.agent_id ? 'pending' : 'handed_off';
  await c.query(`INSERT INTO channel_message (workspace_id, connection_id, thread_id, contact_id, direction, kind, body, author, provider_id, status, reply_state, created_at)
    VALUES ($1,$2,$3,$4,'inbound',$5,$6,'person',$7,'received',$8,$9)`,
    [ws, conn.id, t.id, contactId, e.type === 'other' ? 'other' : 'text', e.text, e.providerId, replyState, e.at]);
  if (optOut) {
    if (contactId) await appendWaConsent(c, ws, contactId, { granted: false, purpose: 'all', source: 'whatsapp', evidence: { threadId: t.id, providerId: e.providerId, quote: e.text.slice(0, 300) } });
    else await c.query('UPDATE channel_thread SET opted_out_at = $2 WHERE id = $1', [t.id, e.at]);
    return;
  }
  if (handOff && t.mode !== 'human') {
    await c.query("UPDATE channel_thread SET mode = 'human', handoff_reason = $2, handoff_at = now(), resolved_at = NULL WHERE id = $1", [t.id, handOff]);
  } else if (t.mode === 'human' && t.resolved_at) {
    // They wrote again after a person closed the conversation: it goes back to the queue.
    await c.query('UPDATE channel_thread SET resolved_at = NULL, handoff_at = now() WHERE id = $1', [t.id]);
  } else if (!conn.agent_id && t.mode === 'agent') {
    await c.query("UPDATE channel_thread SET mode = 'human', handoff_reason = 'no_agent', handoff_at = now() WHERE id = $1", [t.id]);
  }
}

async function onStatus(c: pg.PoolClient, conn: ConnectionRow, e: StatusEvent) {
  const m = await one<{ id: string; status: string; reservation_id: string | null; cost_inr_milli: string; category: string | null; conversation_id: string | null }>(c,
    `SELECT id, status, reservation_id, cost_inr_milli::text, category, conversation_id FROM channel_message
      WHERE connection_id = $1 AND provider_id = $2 FOR UPDATE`, [conn.id, e.providerId]);
  if (!m) return;
  const col = e.status === 'sent' ? 'sent_at' : e.status === 'delivered' ? 'delivered_at' : e.status === 'read' ? 'read_at' : 'failed_at';
  await c.query(`UPDATE channel_message SET ${col} = coalesce(${col}, $2) WHERE id = $1`, [m.id, e.at]);
  if (m.status === 'failed') return;
  if (e.status === 'failed') {
    const words = (e.errorCode && ERROR_WORDS[e.errorCode]) || e.errorTitle || 'WhatsApp could not deliver this message';
    await c.query("UPDATE channel_message SET status = 'failed', error = $2, cost_inr_milli = 0 WHERE id = $1", [m.id, (e.errorCode ? `${e.errorCode}: ` : '') + words.slice(0, 280)]);
    if (m.reservation_id) await release(c, m.reservation_id);
    return;
  }
  if ((RANK[e.status] ?? 0) > (RANK[m.status] ?? 0)) await c.query('UPDATE channel_message SET status = $2 WHERE id = $1', [m.id, e.status]);
  // Meta charges a delivered message: settle the hold at its price and write the meter line once.
  if ((e.status === 'delivered' || e.status === 'read') && m.reservation_id) {
    const r = await one<{ status: string }>(c, 'SELECT status FROM reservation WHERE id = $1', [m.reservation_id]);
    if (r?.status === 'held') {
      const cost = e.billable === false ? 0 : Number(m.cost_inr_milli);
      await settle(c, m.reservation_id, cost);
      if (cost > 0) await c.query(`INSERT INTO cost_line (workspace_id, conversation_id, component, provider, quantity, unit, inr_milli, detail)
        VALUES ($1,$2,'message','whatsapp',1,'message',$3,$4)`, [conn.workspace_id, m.conversation_id, cost, JSON.stringify({ messageId: m.id, category: m.category, pricing: e.pricingCategory })]);
      if (cost === 0) await c.query('UPDATE channel_message SET cost_inr_milli = 0 WHERE id = $1', [m.id]);
    }
  }
}
