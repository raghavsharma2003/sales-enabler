// Hand-offs that land (must-be brief 6, the calls half). The runtime reports a hand-off once per call ('hand_off' event);
// here it becomes a queue item people can see and claim, with the warm brief she prepared (why, and a one-line summary).
// A callback target is a task due at the time the caller stated, read from their words (stated-time.ts). A crisis
// hand-off alerts on-duty members in-app in the same transaction as the event, so it is there the moment ingest commits
// (the web shell polls alerts every 5 s). On duty today means every active owner, operator and compliance member: the
// people who can act on a call. Email and Slack follow once workspace webhooks land; the warm whisper is the runtime's.
import type { Queryable } from '../../db.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { num, obj, opt, str, uuid, ValidationError } from '../../../shared/validate.ts';
import { statedTime, type StatedTime } from './stated-time.ts';

export type HandOffKind = 'phone' | 'queue' | 'callback' | 'member' | 'other';
export const ON_DUTY_ROLES = ['owner', 'operator', 'compliance'] as const;

/** The runtime's target ('phone:+91..', 'queue:collections', 'callback', 'member:<id>') as a kind. */
export function handOffKind(target: string): HandOffKind {
  const k = target.split(':')[0];
  return k === 'phone' || k === 'queue' || k === 'callback' || k === 'member' ? k : 'other';
}

/** The latest caller line so far that states a time, read from the call's stored turns. */
export async function callerStatedTime(q: Queryable, conversationId: string, at: Date): Promise<StatedTime | null> {
  const lines = await many<{ text: string }>(q, "SELECT text FROM turn WHERE conversation_id = $1 AND speaker = 'caller' ORDER BY idx DESC LIMIT 6", [conversationId]);
  for (const l of lines) { const s = statedTime(l.text, at); if (s) return s; }
  return null;
}

export async function alertOnDuty(q: Queryable, ws: string, handOffId: string, conversationId: string): Promise<number> {
  const r = await q.query(`INSERT INTO member_alert (workspace_id, member_id, kind, hand_off_id, conversation_id, text)
    SELECT $1, m.id, 'crisis_hand_off', $2, $3, 'A caller is in distress and needs a person now. Help lines were given and she is staying on the call.'
    FROM member m WHERE m.workspace_id = $1 AND m.status = 'active' AND m.role = ANY($4::text[])
    ON CONFLICT (member_id, hand_off_id) DO NOTHING`, [ws, handOffId, conversationId, [...ON_DUTY_ROLES]]);
  return r.rowCount ?? 0;
}

/** Why she handed over, in plain words (the runtime's reason codes never reach a person). */
export const REASON_WORDS: Record<string, string> = {
  crisis: 'The caller is in distress', asks_for_human: 'The caller asked for a person', complaint: 'The caller has a complaint',
  legal_threat: 'The caller mentioned legal action', out_of_scope: 'The caller asked about something she cannot handle',
  payment_dispute: 'The caller disputes a payment', repeated_misunderstanding: 'She could not understand the caller after several tries',
  takeover: 'A team member took over the call', callback_request: 'The caller asked to be called back',
};
const KIND_WORDS: Record<HandOffKind, string> = { phone: 'Put through to a phone line', queue: 'Waiting in a team queue', callback: 'A person calls them back',
  member: 'A team member joined the call', other: 'Handed to a person' };

type Row = { id: string; conversation_id: string | null; reason: string | null; target_kind: HandOffKind | null; destination: string | null; status: string;
  brief: { summary?: string; reason?: string } | null; due_at: Date | null; due_stated: string | null; claimed_by: string | null; claimed_at: Date | null;
  claimer: string | null; resolved_at: Date | null; resolution: string | null; created_at: Date; contact_id: string | null; contact_name: string | null;
  campaign_id: string | null; campaign_name: string | null; channel: string | null };

const SELECT = `SELECT h.id, h.conversation_id, h.reason, h.target_kind, h.destination, h.status, h.brief, h.due_at, h.due_stated, h.claimed_by, h.claimed_at,
    coalesce(nullif(m.name, ''), m.email) AS claimer, h.resolved_at, h.resolution, h.created_at, cv.contact_id, ct.name AS contact_name, cp.id AS campaign_id,
    cp.name AS campaign_name, cv.channel
  FROM hand_off h
  LEFT JOIN conversation cv ON cv.id = h.conversation_id AND cv.workspace_id = h.workspace_id
  LEFT JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = h.workspace_id
  LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = h.workspace_id
  LEFT JOIN campaign cp ON cp.id = a.campaign_id AND cp.workspace_id = h.workspace_id
  LEFT JOIN member m ON m.id = h.claimed_by AND m.workspace_id = h.workspace_id`;

function present(r: Row) {
  const reason = r.reason ?? r.brief?.reason ?? '';
  const kind = (r.target_kind ?? 'other') as HandOffKind;
  return { id: r.id, conversationId: r.conversation_id, status: r.status, crisis: reason === 'crisis', test: r.channel === 'test',
    kind, kindText: KIND_WORDS[kind], reason: REASON_WORDS[reason] ?? 'Handed to a person',
    // The warm brief: her one-line summary of the call, written for the person who takes it.
    brief: r.brief?.summary ?? null,
    due: kind === 'callback' ? { at: r.due_at?.toISOString() ?? null, stated: r.due_stated, text: r.due_stated ? `They asked: "${r.due_stated}"` : 'No time stated: call back as soon as you can' } : null,
    contact: r.contact_id ? { id: r.contact_id, name: r.contact_name || 'A caller' } : null, campaign: r.campaign_id ? { id: r.campaign_id, name: r.campaign_name } : null,
    claimedBy: r.claimed_by ? { id: r.claimed_by, name: r.claimer } : null, claimedAt: r.claimed_at?.toISOString() ?? null,
    resolution: r.resolution, resolvedAt: r.resolved_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() };
}

const member = (ctx: ToolCtx) => { if (ctx.actor.type !== 'member') throw new Error('only a person can take a hand-off'); return ctx.actor.id; };
const PEOPLE = ['owner', 'builder', 'operator', 'compliance'] as const;

export function registerHandOffTools(r: Registry): void {
  r.register(tool(obj({ status: opt(str({ oneOf: ['open', 'done', 'all'] })), limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'handoff.list', risk: 'read', summary: 'Hand-offs to people: crisis first, then callbacks by the time the caller asked, each with her warm brief and who has it',
    run: async (ctx, i) => {
      const status = i.status ?? 'open';
      const rows = await many<Row>(ctx.q, `${SELECT} WHERE h.workspace_id = $1 AND h.target_kind IS DISTINCT FROM 'member'
          AND ($2 = 'all' OR ($2 = 'open' AND h.status IN ('queued','claimed')) OR ($2 = 'done' AND h.status IN ('done','connected','missed')))
        ORDER BY (coalesce(h.reason, h.brief->>'reason') = 'crisis') DESC, h.due_at NULLS LAST, h.created_at LIMIT $3`, [ctx.workspaceId, status, i.limit ?? 50]);
      const open = (await one<{ n: number; crisis: number }>(ctx.q, `SELECT count(*)::int AS n, count(*) FILTER (WHERE coalesce(reason, brief->>'reason') = 'crisis')::int AS crisis
        FROM hand_off WHERE workspace_id = $1 AND status IN ('queued','claimed') AND target_kind IS DISTINCT FROM 'member'`, [ctx.workspaceId]))!;
      return { items: rows.map(present), open: open.n, crisisOpen: open.crisis };
    },
  }));

  r.register(tool(obj({ handOffId: uuid() }), {
    name: 'handoff.claim', risk: 'draft', roles: [...PEOPLE], summary: 'Take a hand-off: it is yours to call back or follow up, and nobody else is shown it as free',
    run: async (ctx, i) => {
      const me = member(ctx);
      const h = await one<{ status: string; claimed_by: string | null }>(ctx.q, 'SELECT status, claimed_by FROM hand_off WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.handOffId, ctx.workspaceId]);
      if (!h) throw new ValidationError('handOffId', 'no such hand-off in this workspace');
      if (h.claimed_by && h.claimed_by !== me) {
        const who = await one<{ name: string }>(ctx.q, "SELECT coalesce(nullif(name, ''), email) AS name FROM member WHERE id = $1", [h.claimed_by]);
        throw new Error(`${who?.name ?? 'Someone'} already has this hand-off`);
      }
      if (!['queued', 'claimed'].includes(h.status)) throw new Error('this hand-off is already closed');
      await ctx.q.query("UPDATE hand_off SET status = 'claimed', claimed_by = $3, claimed_at = coalesce(claimed_at, now()) WHERE id = $1 AND workspace_id = $2", [i.handOffId, ctx.workspaceId, me]);
      await ctx.q.query('UPDATE member_alert SET acked_at = coalesce(acked_at, now()) WHERE workspace_id = $1 AND hand_off_id = $2', [ctx.workspaceId, i.handOffId]);
      return present((await one<Row>(ctx.q, `${SELECT} WHERE h.id = $1 AND h.workspace_id = $2`, [i.handOffId, ctx.workspaceId]))!);
    },
  }));

  r.register(tool(obj({ handOffId: uuid(), resolution: str({ oneOf: ['reached', 'no_answer', 'not_needed'] }) }), {
    name: 'handoff.resolve', risk: 'draft', roles: [...PEOPLE], summary: 'Close a hand-off you have: reached them, no answer, or no longer needed',
    run: async (ctx, i) => {
      const me = member(ctx);
      const h = await one<{ status: string; claimed_by: string | null }>(ctx.q, 'SELECT status, claimed_by FROM hand_off WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.handOffId, ctx.workspaceId]);
      if (!h) throw new ValidationError('handOffId', 'no such hand-off in this workspace');
      if (h.status !== 'claimed' || h.claimed_by !== me) throw new Error('take the hand-off first; only the person who has it closes it');
      await ctx.q.query("UPDATE hand_off SET status = 'done', resolution = $3, resolved_at = now() WHERE id = $1 AND workspace_id = $2", [i.handOffId, ctx.workspaceId, i.resolution]);
      return present((await one<Row>(ctx.q, `${SELECT} WHERE h.id = $1 AND h.workspace_id = $2`, [i.handOffId, ctx.workspaceId]))!);
    },
  }));

  r.register(tool(obj({}), {
    name: 'alert.list', risk: 'read', summary: 'Your unanswered alerts (a caller in distress needs a person), newest first',
    run: async ctx => {
      if (ctx.actor.type !== 'member') return { alerts: [] };
      const rows = await many<{ id: string; kind: string; hand_off_id: string | null; conversation_id: string | null; text: string; created_at: Date }>(ctx.q,
        `SELECT id, kind, hand_off_id, conversation_id, text, created_at FROM member_alert WHERE workspace_id = $1 AND member_id = $2 AND acked_at IS NULL
         ORDER BY created_at DESC LIMIT 20`, [ctx.workspaceId, ctx.actor.id]);
      return { alerts: rows.map(a => ({ id: a.id, kind: a.kind, handOffId: a.hand_off_id, conversationId: a.conversation_id, text: a.text, at: a.created_at.toISOString() })) };
    },
  }));

  r.register(tool(obj({ alertId: uuid() }), {
    name: 'alert.ack', risk: 'draft', roles: [...PEOPLE, 'viewer'], summary: 'Mark an alert as seen (taking its hand-off does this too)',
    run: async (ctx, i) => {
      const me = member(ctx);
      const u = await ctx.q.query('UPDATE member_alert SET acked_at = coalesce(acked_at, now()) WHERE id = $1 AND workspace_id = $2 AND member_id = $3', [i.alertId, ctx.workspaceId, me]);
      if (!u.rowCount) throw new ValidationError('alertId', 'no such alert for you');
      return { ok: true };
    },
  }));
}
