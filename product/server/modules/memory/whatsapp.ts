// Memory from WhatsApp: a thread's new messages propose facts through the same gates as a call. Inbound messages from
// the person are their lines; outbound ones (her, a template, a team member) are not. A quote must be an exact substring
// of ONE inbound message, and the fact keeps {messageId, start, end} as its span, so it can be shown in the thread.
// Only a verified sender (a number on file: channel_thread.contact_id) ever gets facts; an opted-out thread never does.
// WhatsApp data stays in the tenant (Meta s.4.7): facts are marked channel 'whatsapp', live only in this workspace's
// rows, and no pooled or cross-tenant path reads memory.
//
// memory.extract_thread {threadId} (system actor; the channels module calls it when a thread goes quiet or its 24-hour
// window ends). The model is asked in prepare(), outside the transaction; run() re-reads every gate input under a lock
// on the thread's cursor and commits nothing if the messages changed since. The cursor then moves past what was read.
import { createHash } from 'node:crypto';
import { many, one, type Queryable } from '../../db.ts';
import { complete } from '../../llm.ts';
import { tool, type PrepareCtx, type Registry, type ToolCtx } from '../../tools.ts';
import { obj, uuid } from '../../../shared/validate.ts';
import { forgetAsked, gate, keepAgreements, PURPOSES, type Accepted, type Drop, type Purpose } from './gates.ts';
import { contactMinorStatus } from './minor.ts';
import { EXTRACT_PROMPT } from './prompt.ts';
import { storeFacts } from './store.ts';
import { forgetContactMemory } from './forget.ts';

type Counts = Partial<Record<Drop | 'proposed' | 'stored' | 'superseded' | 'review', number>>;
interface Msg { id: string; inbound: boolean; text: string; at: Date }
interface Loaded { contactId: string; purpose: Purpose; undoMinutes: number; allowedCategories: Record<string, string>; hasConsent: boolean;
  msgs: Msg[]; inbound: Msg[]; through: Date; digest: string; transcript: string; agreements: number[] }
type Load = { skip: string; through?: Date } | Loaded;

const isPerson = (m: Msg) => m.inbound;

async function load(q: Queryable, ws: string, threadId: string, lock: boolean): Promise<Load> {
  const t = await one<{ contact_id: string | null; opted_out_at: Date | null; agent_id: string | null }>(q,
    `SELECT t.contact_id, t.opted_out_at, c.agent_id FROM channel_thread t JOIN channel_connection c ON c.id = t.connection_id AND c.workspace_id = t.workspace_id
     WHERE t.id = $1 AND t.workspace_id = $2${lock ? ' FOR UPDATE OF t' : ''}`, [threadId, ws]);
  if (!t) throw new Error('no such WhatsApp thread in this workspace');
  const cur = await one<{ through_at: Date }>(q, `SELECT through_at FROM memory_thread_cursor WHERE workspace_id = $1 AND thread_id = $2${lock ? ' FOR UPDATE' : ''}`, [ws, threadId]);
  const rows = await many<{ id: string; direction: string; author: string; body: string; created_at: Date }>(q,
    `SELECT id, direction, author, body, created_at FROM channel_message WHERE workspace_id = $1 AND thread_id = $2 AND created_at > $3
       AND kind IN ('text','template') AND status <> 'blocked' AND body <> '' ORDER BY created_at, id LIMIT 200`, [ws, threadId, cur?.through_at ?? new Date(0)]);
  const msgs: Msg[] = rows.map(r => ({ id: r.id, inbound: r.direction === 'inbound' && r.author === 'person', text: r.body, at: r.created_at }));
  const through = msgs.length ? msgs[msgs.length - 1].at : undefined;
  const inbound = msgs.filter(isPerson);
  // A sender not on file is never remembered; the thread keeps its messages, memory keeps nothing.
  if (!t.contact_id) return { skip: 'sender_not_verified', through };
  if (!inbound.length) return { skip: 'no_new_messages' };
  const optedOut = t.opted_out_at || (await one<{ granted: boolean }>(q, `SELECT granted FROM consent_record WHERE workspace_id = $1 AND contact_id = $2 AND channel = 'whatsapp'
    ORDER BY created_at DESC LIMIT 1`, [ws, t.contact_id]))?.granted === false;
  if (optedOut) return { skip: 'whatsapp_opted_out', through };
  const pol = await one<{ enabled: boolean; undo_minutes: number; allowed_categories: Record<string, string> }>(q,
    'SELECT enabled, undo_minutes, allowed_categories FROM memory_policy WHERE workspace_id = $1', [ws]);
  if (pol && !pol.enabled) return { skip: 'memory_off', through };
  const age = await contactMinorStatus(q, ws, t.contact_id);
  if (age === 'minor' || age === 'unclear') return { skip: age === 'minor' ? 'minor' : 'age_unclear', through };
  if (await one(q, 'SELECT 1 FROM memory_optout WHERE workspace_id = $1 AND contact_id = $2', [ws, t.contact_id])) return { skip: 'contact_opted_out', through };
  // The purpose is the thread's agent's: what it is for decides which calls may later use what was said here.
  const cfg = t.agent_id ? (await one<{ cfg: any }>(q, `SELECT v.config AS cfg FROM agent_version v JOIN agent a ON a.id = v.agent_id AND a.workspace_id = $2
    WHERE v.agent_id = $1 ORDER BY v.number DESC LIMIT 1`, [t.agent_id, ws]))?.cfg?.agent : null;
  if (cfg?.memory?.write === false) return { skip: 'agent_memory_write_off', through };
  const purpose = (PURPOSES as readonly string[]).includes(cfg?.category) ? cfg.category as Purpose : null;
  if (!purpose) return { skip: 'no_purpose', through };
  const forget = forgetAsked(inbound.map(m => m.text));
  if (forget) return { skip: forget === 'all' ? 'person_asked_to_forget' : 'person_asked_not_to_keep', through };
  const consent = await one<{ granted: boolean }>(q, `SELECT granted FROM consent_record WHERE workspace_id = $1 AND contact_id = $2 AND purpose IN ($3, 'memory')
    ORDER BY created_at DESC LIMIT 1`, [ws, t.contact_id, purpose]);
  const lines = msgs.map(m => ({ speaker: m.inbound ? 'caller' : 'agent', text: m.text }));
  const transcript = lines.map(l => `${l.speaker === 'caller' ? 'PERSON' : 'BUSINESS'}: ${l.text}`).join('\n');
  return { contactId: t.contact_id, purpose, undoMinutes: pol?.undo_minutes ?? 60, allowedCategories: pol?.allowed_categories ?? {}, hasConsent: consent?.granted === true,
    msgs, inbound, through: through!, transcript, digest: createHash('sha256').update(msgs.map(m => m.id + ':' + m.text).join('\n')).digest('hex'),
    agreements: keepAgreements(lines, s => s === 'caller') };
}

type Prepared = { load: 'skip' } | { load: 'ok'; digest: string; llm: { text: string; usage: unknown } | { error: string } };

async function prepareThread(ctx: PrepareCtx, threadId: string): Promise<Prepared> {
  const l = await load(ctx.pool, ctx.workspaceId, threadId, false);
  if ('skip' in l) return { load: 'skip' };
  try {
    const reply = await complete({ purpose: 'memory', json: true, temperature: 0, maxTokens: 800, messages: [
      { role: 'system', content: EXTRACT_PROMPT.replace('Read the transcript', 'Read the WhatsApp messages (PERSON is the customer)').replace(/caller/g, 'person') },
      { role: 'user', content: `Purpose: ${l.purpose}\n<messages>\n${l.transcript}\n</messages>` },
    ] });
    return { load: 'ok', digest: l.digest, llm: { text: reply.text, usage: reply.usage } };
  } catch (e) {
    return { load: 'ok', digest: l.digest, llm: { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) } };
  }
}

async function extractThread(ctx: ToolCtx, threadId: string, prepared: Prepared | undefined) {
  const { q, workspaceId: ws } = ctx;
  const record = async (status: 'done' | 'skipped' | 'failed', reason: string | null, through: Date | undefined, counts: Counts = {}) => {
    // A failed run keeps the cursor where it was, so the same messages are read again next time.
    await q.query(`INSERT INTO memory_thread_cursor (workspace_id, thread_id, through_at, status, reason, counts) VALUES ($1,$2,coalesce($3::timestamptz, 'epoch'),$4,$5,$6)
      ON CONFLICT (workspace_id, thread_id) DO UPDATE SET through_at = CASE WHEN $4 = 'failed' OR $3::timestamptz IS NULL THEN memory_thread_cursor.through_at ELSE $3::timestamptz END,
        status = EXCLUDED.status, reason = EXCLUDED.reason, counts = EXCLUDED.counts, updated_at = now()`,
      [ws, threadId, status === 'failed' ? null : through ?? null, status, reason, JSON.stringify(counts)]);
    return { status, reason, counts };
  };
  const l = await load(q, ws, threadId, true);
  if ('skip' in l) {
    if (l.skip === 'person_asked_to_forget') {
      const t = await one<{ contact_id: string }>(q, 'SELECT contact_id FROM channel_thread WHERE id = $1 AND workspace_id = $2', [threadId, ws]);
      const gone = await forgetContactMemory(q, ws, t!.contact_id);
      await q.query(`INSERT INTO forget_request (workspace_id, contact_id, scope, requested_via, evidence, status, receipt, done_at)
        VALUES ($1,$2,'forget_memory','whatsapp',$3,'done',$4, now())`, [ws, t!.contact_id, JSON.stringify({ threadId, detectedBy: 'code' }),
        JSON.stringify({ factsRemoved: gone.facts, surfaces: { memory_fact: 'removed' } })]);
    }
    return record('skipped', l.skip, l.through);
  }
  if (!prepared || prepared.load !== 'ok') return record('failed', 'state_changed_during_extraction', undefined);
  if (prepared.digest !== l.digest) return record('failed', 'messages_changed', undefined);
  if ('error' in prepared.llm) return record('failed', 'llm_error: ' + prepared.llm.error, undefined);
  let proposed: unknown[];
  try { const j = JSON.parse(prepared.llm.text); proposed = Array.isArray(j?.facts) ? j.facts.slice(0, 20) : []; }
  catch { return record('failed', 'llm_bad_json', undefined); }

  const counts: Counts = { proposed: proposed.length };
  const bump = (k: keyof Counts) => { counts[k] = (counts[k] ?? 0) + 1; };
  const callerTurns = l.inbound.map(m => m.text);
  const accepted: Accepted[] = [];
  for (const p of proposed) {
    const g = gate(p, { callerTurns, agreements: l.agreements, purpose: l.purpose, allowedCategories: l.allowedCategories, hasConsent: l.hasConsent });
    if (g.ok) accepted.push(g.fact); else bump(g.drop);
  }
  const msgOf = (f: Accepted) => l.inbound[Math.floor(f.quoteAt / 1_000_000)];
  await storeFacts(q, ws, l.contactId, accepted, {
    saidAt: l.through, undoMinutes: l.undoMinutes, channel: 'whatsapp', saidAtOf: f => msgOf(f).at,
    spanOf: f => { const start = f.quoteAt % 1_000_000; return { messageId: msgOf(f).id, start, end: start + f.quote.length }; },
  }, bump);
  return record('done', null, l.through, counts);
}

export function registerWhatsAppMemory(r: Registry): void {
  r.register(tool(obj({ threadId: uuid() }), {
    name: 'memory.extract_thread', risk: 'draft', roles: [],
    summary: "remember what a person wrote on WhatsApp that matters for the next call or message (the same gates as a call; verified senders only)",
    prepare: (ctx, i) => prepareThread(ctx, i.threadId),
    run: (ctx, i, prepared) => {
      if (ctx.actor.type !== 'system') throw new Error('memory reads WhatsApp threads only as the system, when the channels module asks');
      return extractThread(ctx, i.threadId, prepared as Prepared | undefined);
    },
  }));
}
