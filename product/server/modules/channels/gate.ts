// The one gated send site (asset.hp-maya-latest.gated-surface-adapter). Every outbound message, whoever writes it (the
// agent, a team member in the inbox, a follow-through after a call), goes through gatedSend(), and only gatedSend()
// calls a transport's send(). tests/channels.test.ts reads the module's source and fails if any other file does.
//
// In order, inside one transaction, before anything leaves:
//   1. who: a person on file and not erased; not suppressed (suppression holds on every outbound path); not opted out
//      of WhatsApp; for a business-initiated template, an opt-in on WhatsApp for this purpose; marketing needs its own
//      marketing opt-in, so a cold number never gets one (Meta 131049, rejected.harvest.08); free text only inside the
//      24-hour window the person opened; the agent never writes while a person is handling the thread;
//   2. what: every sentence through the reply door (shared/safety). The agent gets the whole door; a team member gets
//      the rules that hold for people too (no OTP or card asks, no unverified links), since RD1/RD2 are about her;
//      a template is fixed text, so any door change blocks it;
//   3. how often: at most CONTACT_DAILY_TEMPLATES business-initiated templates per person per 24 hours;
//   4. money: the message's price is held from the wallet and every cap (server/ledger.ts reserve) and settled when
//      WhatsApp reports it delivered, released if it fails.
// A refusal is stored as a blocked message with every reason, so the timeline and the inbox say why nothing was sent.
import type pg from 'pg';
import { reserve, release } from '../../ledger.ts';
import { one, tx, type Queryable } from '../../db.ts';
import { replyDoor, type DoorContext, type DoorVerdict } from '../../../shared/safety/index.ts';
import { dialFacts } from '../intake/contacts.ts';
import { waConsent, waOptedOut } from './consent.ts';
import { connectionFor, contactE164, credentials, threadById, threadFor, waIdOf, windowOpen, type ConnectionRow, type ThreadRow } from './store.ts';
import { SendRefused, SendUnknown, type Outbound, type Transport } from './transport.ts';
import { whatsapp, ERROR_WORDS } from './whatsapp.ts';

export const CONTACT_DAILY_TEMPLATES = 2;
const TRANSPORTS: Record<string, Transport> = { whatsapp };

export type Category = 'utility' | 'marketing' | 'authentication' | 'service';
export interface ResolvedTemplate { id: string; name: string; language: string; category: Exclude<Category, 'service'>; body: string; status: string }

export type Author =
  | { kind: 'agent'; agentId: string | null; door: DoorContext }
  | { kind: 'member'; memberId: string }
  | { kind: 'system'; what: string; door?: DoorContext };

export interface SendInput {
  to: { threadId?: string; contactId?: string };
  connectionId?: string;
  content: { kind: 'text'; text: string } | { kind: 'template'; template: ResolvedTemplate; params: string[] };
  purpose: string;
  author: Author;
  conversationId?: string;
  campaignId?: string;
}

export type BlockReason = 'no_connection' | 'not_connected' | 'not_on_file' | 'erased' | 'suppressed' | 'opted_out' | 'purpose_withdrawn'
  | 'no_opt_in' | 'marketing_cold' | 'outside_window' | 'human_handling' | 'template_not_approved' | 'contact_daily_cap' | 'door_blocked'
  | 'wallet_low' | 'cap_reached' | 'wallet_blocked' | 'connection_paused';

/** Why nothing was sent, in words a person reads (the timeline, the inbox and the Operator show these). */
export const BLOCK_WORDS: Record<BlockReason, string> = {
  no_connection: 'No WhatsApp number is connected (Settings > Channels)',
  not_connected: 'The WhatsApp credentials are missing; connect the account again',
  connection_paused: 'This WhatsApp number is paused',
  not_on_file: 'This number is not a contact on file, and a business-initiated message needs one',
  erased: 'This person was erased at their request',
  suppressed: 'This person is suppressed, and suppression holds on every channel',
  opted_out: 'This person has stopped WhatsApp messages from you',
  purpose_withdrawn: 'This person withdrew consent for this purpose',
  no_opt_in: 'This person has not opted in to WhatsApp messages for this purpose',
  marketing_cold: 'Marketing messages need the person\'s own opt-in to marketing on WhatsApp',
  outside_window: 'More than 24 hours since the person last wrote: only an approved template can reach them now',
  human_handling: 'A team member is handling this conversation, so the agent does not write',
  template_not_approved: 'This template is not approved by WhatsApp yet',
  contact_daily_cap: `This person already received ${CONTACT_DAILY_TEMPLATES} business messages in the last 24 hours`,
  door_blocked: 'The safety check stopped this message',
  wallet_low: 'The wallet does not have enough balance for this message',
  cap_reached: 'A spend cap was reached',
  wallet_blocked: 'The wallet is blocked',
};

/** Rules that hold for a team member's own words too. RD1/RD2 (disclosure, never denying being an AI) are about her. */
const MEMBER_RULES = new Set(['RD4', 'RD5']);

export interface SendOutcome {
  messageId: string | null;
  status: 'sent' | 'blocked' | 'failed' | 'unknown';
  reasons: BlockReason[];
  body: string;
  providerId?: string;
  costInrMilli: number;
  error?: string;
}

export async function priceMicro(q: Queryable, category: Category): Promise<number> {
  const r = await one<{ inr_micro: string }>(q, "SELECT inr_micro::text FROM channel_price WHERE channel = 'whatsapp' AND category = $1 AND active", [category]);
  return r ? Number(r.inr_micro) : 0;
}

/** Sentences as a written message has them (the door reads one sentence at a time). */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?।])\s+|\n+/u).map(s => s.trim()).filter(Boolean);
}

export async function brandDoor(q: Queryable, ws: string): Promise<DoorContext> {
  const b = await one<{ legal_name: string; website: string | null }>(q, 'SELECT legal_name, website FROM brand WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [ws]);
  let host: string | null = null;
  try { host = b?.website ? new URL(/^https?:\/\//.test(b.website) ? b.website : 'https://' + b.website).hostname.replace(/^www\./, '') : null; } catch { host = null; }
  return { category: 'service', sectorPacks: ['base'], brand: { name: b?.legal_name ?? '', verifiedDomains: host ? [host] : [] }, facts: [], neverSay: [],
    disclosed: true, identityVerified: true, recordingRefused: false, crisis: false, turnIndex: 1 };
}

/** Run the door over a written message. A template may not be changed, so a replacement blocks it. */
export function doorOver(text: string, ctx: DoorContext, opts: { only?: ReadonlySet<string>; fixed: boolean }) {
  const verdicts: { sentence: string; verdict: DoorVerdict }[] = [];
  const out: string[] = [];
  let blocked = false;
  for (const s of sentences(text)) {
    const v = replyDoor(s, ctx, opts.only);
    verdicts.push({ sentence: s, verdict: v });
    if (v.action === 'block' || (v.action === 'replace' && opts.fixed)) blocked = true;
    out.push(v.action === 'replace' ? v.text : s);
  }
  // A replacement can repeat (two denials, one honest answer each): say it once.
  const text2 = out.filter((s, i) => out.indexOf(s) === i).join(' ');
  return { blocked, text: text2, verdicts };
}

const authorTag = (a: Author) => a.kind === 'agent' ? 'agent' : a.kind === 'member' ? `member:${a.memberId}` : `system:${a.what}`;

interface Planned {
  conn: ConnectionRow; thread: ThreadRow; contactId: string | null; reasons: BlockReason[]; out: Outbound; body: string; category: Category;
  costMilli: number; door: unknown;
}

async function plan(c: Queryable, ws: string, i: SendInput): Promise<Planned | { early: SendOutcome }> {
  // A conversation is looked up in this workspace first: another workspace's thread is "not found", never "not connected".
  const given = i.to.threadId ? await threadById(c, ws, i.to.threadId, true) : null;
  if (i.to.threadId && !given) throw new Error('no such conversation in this workspace');
  const conn = await connectionFor(c, ws, given?.connection_id ?? i.connectionId);
  const bodyOf = () => i.content.kind === 'text' ? i.content.text : whatsapp.render({ kind: 'template', to: '', name: '', language: '', body: i.content.template.body, params: i.content.params });
  if (!conn) return { early: { messageId: null, status: 'blocked', reasons: ['no_connection'], body: bodyOf(), costInrMilli: 0 } };

  let thread: ThreadRow | null = null;
  if (given) thread = given;
  else if (i.to.contactId) {
    const ce = await contactE164(c, ws, i.to.contactId);
    if (!ce) throw new Error('no such contact in this workspace');
    thread = await threadFor(c, conn, waIdOf(ce.e164), i.to.contactId);
  } else throw new Error('give a conversation or a contact');
  const contactId = thread.contact_id;

  const reasons: BlockReason[] = [];
  if (conn.status === 'paused') reasons.push('connection_paused');
  const templated = i.content.kind === 'template';
  const category: Category = templated ? (i.content as { template: ResolvedTemplate }).template.category : 'service';
  const open = windowOpen(thread);

  // 1. who
  if (contactId) {
    const f = await dialFacts(c, ws, { contactId });
    if (f.erased || f.tombstoned) reasons.push('erased');
    if (f.suppressions.some(s => s.scope === 'workspace' || (s.scope === 'campaign' && i.campaignId && s.scopeId === i.campaignId))) reasons.push('suppressed');
    const out = await waOptedOut(c, ws, contactId);
    if (out.state === 'withdrawn') reasons.push('opted_out');
    else {
      const k = await waConsent(c, ws, contactId, i.purpose);
      if (k.state === 'withdrawn') reasons.push('purpose_withdrawn');
      if (templated && !open && k.state !== 'granted') reasons.push('no_opt_in');
      if (category === 'marketing' && (await waConsent(c, ws, contactId, 'marketing', { exact: true })).state !== 'granted') reasons.push('marketing_cold');
    }
  } else {
    // A number not on file may be answered inside the window it opened; nothing business-initiated goes to it.
    if (thread.opted_out_at) reasons.push('opted_out');
    if (templated && !open) reasons.push('not_on_file');
    if (category === 'marketing') reasons.push('marketing_cold');
  }
  if (!templated && !open) reasons.push('outside_window');
  if (i.author.kind === 'agent' && thread.mode === 'human') reasons.push('human_handling');
  if (templated && (i.content as { template: ResolvedTemplate }).template.status !== 'approved') reasons.push('template_not_approved');

  // 2. what
  const doorCtx0 = i.author.kind === 'member' ? await brandDoor(c, ws) : i.author.door ?? await brandDoor(c, ws);
  // A marketing template is promotional; anything else is service, so RD7 keeps offers out of utility messages.
  const doorCtx = category === 'marketing' ? { ...doorCtx0, category: 'promotional' as const } : doorCtx0;
  const d = doorOver(bodyOf(), doorCtx, { only: i.author.kind === 'member' ? MEMBER_RULES : undefined, fixed: templated });
  if (d.blocked) reasons.push('door_blocked');
  const body = templated ? bodyOf() : d.text;

  // 3. how often (business-initiated only: a reply inside the window the person opened is not counted)
  if (templated && !open) {
    const n = await one<{ n: string }>(c, `SELECT count(*)::text AS n FROM channel_message WHERE workspace_id = $1 AND thread_id = $2 AND direction = 'outbound'
      AND kind = 'template' AND status IN ('queued','sent','delivered','read','unknown') AND created_at > now() - interval '24 hours'`, [ws, thread.id]);
    if (Number(n?.n ?? 0) >= CONTACT_DAILY_TEMPLATES) reasons.push('contact_daily_cap');
  }

  // 4. price: free text inside the window, and a utility template inside an open window, are not charged.
  const free = category === 'service' || (open && category === 'utility');
  const costMilli = free ? 0 : Math.ceil(await priceMicro(c, category) / 1000);
  const out: Outbound = i.content.kind === 'text'
    ? { kind: 'text', to: thread.wa_id, text: body }
    : { kind: 'template', to: thread.wa_id, name: i.content.template.name, language: i.content.template.language, body: i.content.template.body, params: i.content.params };
  return { conn, thread, contactId, reasons, out, body, category, costMilli, door: d.verdicts };
}

/** Send one message, or store why it was not sent. The only caller of Transport.send in VP. */
export async function gatedSend(pool: pg.Pool, ws: string, i: SendInput): Promise<SendOutcome> {
  const author = authorTag(i.author);
  const staged = await tx(pool, async c => {
    const p = await plan(c, ws, i);
    if ('early' in p) return p;
    const creds = p.reasons.length ? null : await credentials(c, p.conn);
    if (!p.reasons.length && !creds) p.reasons.push('not_connected');
    let reservationId: string | null = null;
    if (!p.reasons.length && p.costMilli > 0) {
      const r = await reserve(c, { workspaceId: ws, inrMilli: p.costMilli, campaignId: i.campaignId });
      if (r.ok) reservationId = r.reservationId; else p.reasons.push(r.cause);
    }
    const blocked = p.reasons.length > 0;
    const row = await one<{ id: string }>(c, `INSERT INTO channel_message (workspace_id, connection_id, thread_id, contact_id, direction, kind, body, template_id, variables,
        author, purpose, category, conversation_id, status, blocked_by, door, cost_inr_milli, reservation_id)
      VALUES ($1,$2,$3,$4,'outbound',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [ws, p.conn.id, p.thread.id, p.contactId, i.content.kind, p.body, i.content.kind === 'template' ? i.content.template.id : null,
        i.content.kind === 'template' ? JSON.stringify(i.content.params) : null, author, i.purpose, p.category, i.conversationId ?? null,
        blocked ? 'blocked' : 'queued', blocked ? p.reasons : null, JSON.stringify(p.door), blocked ? 0 : p.costMilli, reservationId]);
    await c.query('UPDATE channel_thread SET last_message_at = now() WHERE id = $1', [p.thread.id]);
    return { p, creds, messageId: row!.id, reservationId };
  });
  if ('early' in staged) return staged.early;
  const { p, creds, messageId, reservationId } = staged;
  if (p.reasons.length || !creds) return { messageId, status: 'blocked', reasons: p.reasons, body: p.body, costInrMilli: 0 };

  const transport = TRANSPORTS.whatsapp;
  try {
    const r = await transport.send(creds, p.out);
    await pool.query("UPDATE channel_message SET status = 'sent', provider_id = $2, sent_at = now() WHERE id = $1 AND status = 'queued'", [messageId, r.providerId]);
    return { messageId, status: 'sent', reasons: [], body: p.body, providerId: r.providerId, costInrMilli: p.costMilli };
  } catch (e) {
    if (e instanceof SendUnknown) {
      // It may have reached the person: keep the hold until a status arrives or the sweep decides (never re-sent).
      await pool.query("UPDATE channel_message SET status = 'unknown', error = $2 WHERE id = $1", [messageId, e.message.slice(0, 300)]);
      return { messageId, status: 'unknown', reasons: [], body: p.body, costInrMilli: p.costMilli, error: e.message };
    }
    const code = e instanceof SendRefused ? e.code : null;
    const words = (code && ERROR_WORDS[code]) || (e instanceof Error ? e.message : String(e));
    await tx(pool, async c => {
      await c.query("UPDATE channel_message SET status = 'failed', error = $2, failed_at = now(), cost_inr_milli = 0 WHERE id = $1", [messageId, (code ? `${code}: ` : '') + words.slice(0, 280)]);
      if (reservationId) await release(c, reservationId);
    });
    return { messageId, status: 'failed', reasons: [], body: p.body, costInrMilli: 0, error: words };
  }
}

/** For previews (the inbox composer, the Operator): what the gate would say now, inside the caller's transaction, with
 *  nothing stored (a savepoint is rolled back) and nothing sent. */
export async function previewSend(q: Queryable, ws: string, i: SendInput) {
  await q.query('SAVEPOINT channel_preview');
  try {
    const p = await plan(q, ws, i);
    if ('early' in p) return { allowed: false, reasons: p.early.reasons, body: p.early.body, costInrMilli: 0 };
    return { allowed: p.reasons.length === 0, reasons: p.reasons, body: p.body, costInrMilli: p.costMilli, door: p.door };
  } finally { await q.query('ROLLBACK TO SAVEPOINT channel_preview'); }
}

export const blockedWords = (reasons: readonly string[]) => reasons.map(r => BLOCK_WORDS[r as BlockReason] ?? r);
