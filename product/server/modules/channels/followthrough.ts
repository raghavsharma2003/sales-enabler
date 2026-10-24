// Follow-through after a call (blueprint 6.3, v1). Two things happen after a call is analysed:
//   1. What the caller said about WhatsApp is read once: "WhatsApp pe bhej do" is their opt-in to follow-ups on WhatsApp
//      (consent purpose 'follow_up', their exact words as evidence); "WhatsApp mat bhejo" is a WhatsApp opt-out.
//   2. Each approved follow-through rule acts on the calls it names: a call of this agent or campaign that earned this
//      outcome or reason code, or in which the caller asked for WhatsApp; or, for a campaign, an attempt that was not
//      answered. It sends its approved utility template, values bound from the person's record, through gatedSend like
//      every other message (consent, window, door, caps, wallet). A rule acts on a call once; the run row is written
//      before the send, so a crash can never send twice.
// The rule itself was approved by a person (followthrough.rule.set, A2), bound to the template's version, with its
// daily limit and the most it can spend a day on the card.
import type pg from 'pg';
import { many, one, tx } from '../../db.ts';
import { appendWaConsent, asksForWhatsApp, isOptOutMessage } from './consent.ts';
import { brandDoor, gatedSend, type SendOutcome } from './gate.ts';
import { bindTemplate, resolved, type TemplateRow } from './templates.ts';

/** How far back a finished call or unanswered attempt is still followed up (older ones are left alone). */
export const LOOKBACK_H = 48;
const BATCH = 50;

export interface RuleRow {
  id: string; workspace_id: string; name: string; template_id: string; agent_id: string | null; campaign_id: string | null;
  trigger_kind: 'outcome' | 'reason_code' | 'asked_whatsapp' | 'not_answered'; trigger_value: string | null; purpose: string;
  daily_limit: number; enabled: boolean; version: number; created_at: Date; updated_at: Date;
}

/** Read finished calls' caller lines for a WhatsApp request or refusal, once per call. */
export async function readCalls(pool: pg.Pool, ws: string | null): Promise<number> {
  const calls = await many<{ id: string; workspace_id: string; contact_id: string | null }>(pool,
    `SELECT cv.id, cv.workspace_id, cv.contact_id FROM conversation cv
      WHERE ($1::uuid IS NULL OR cv.workspace_id = $1) AND cv.status = 'done' AND cv.channel = 'phone'
        AND coalesce(cv.run_manifest->>'test', 'false') <> 'true' AND cv.ended_at > now() - make_interval(hours => ${LOOKBACK_H})
        AND NOT EXISTS (SELECT 1 FROM channel_call_read r WHERE r.conversation_id = cv.id)
      ORDER BY cv.ended_at LIMIT ${BATCH * 4}`, [ws]);
  for (const cv of calls) {
    await tx(pool, async c => {
      const lines = await many<{ text: string; idx: number }>(c, "SELECT text, idx FROM turn WHERE conversation_id = $1 AND speaker = 'caller' ORDER BY idx", [cv.id]);
      const stop = lines.find(l => isOptOutMessage(l.text) && /whats\s?app|message|msg|मैसेज/i.test(l.text));
      const ask = stop ? null : lines.find(l => asksForWhatsApp(l.text));
      let consentId: string | null = null;
      if (cv.contact_id && (stop || ask)) {
        const l = (stop ?? ask)!;
        consentId = await appendWaConsent(c, cv.workspace_id, cv.contact_id, { granted: !stop, purpose: stop ? 'all' : 'follow_up', source: 'in_call',
          evidence: { conversationId: cv.id, turn: l.idx, quote: l.text.slice(0, 300) } });
      }
      await c.query('INSERT INTO channel_call_read (conversation_id, workspace_id, asked_whatsapp, quote, consent_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [cv.id, cv.workspace_id, !!ask, (stop ?? ask)?.text.slice(0, 300) ?? null, consentId]);
    });
  }
  return calls.length;
}

interface Candidate { key: string; contactId: string; conversationId: string | null; campaignId: string | null; facts: Record<string, unknown> }

async function candidates(pool: pg.Pool, r: RuleRow): Promise<Candidate[]> {
  if (r.trigger_kind === 'not_answered') {
    // The last word on an attempt that rang out or was busy; one follow-up per person per rule in 24 hours.
    return (await many<{ id: string; contact_id: string; campaign_id: string | null; facts: Record<string, unknown> | null }>(pool,
      `SELECT a.id, a.contact_id, a.campaign_id, a.facts FROM attempt a
        WHERE a.workspace_id = $1 AND a.status IN ('no_answer','busy') AND a.created_at > now() - make_interval(hours => ${LOOKBACK_H})
          AND ($2::uuid IS NULL OR a.campaign_id = $2)
          AND NOT EXISTS (SELECT 1 FROM channel_followthrough_run x WHERE x.rule_id = $3 AND x.source_key = 'attempt:' || a.id)
          AND NOT EXISTS (SELECT 1 FROM channel_followthrough_run x WHERE x.rule_id = $3 AND x.contact_id = a.contact_id AND x.created_at > now() - interval '24 hours')
        ORDER BY a.created_at LIMIT ${BATCH}`, [r.workspace_id, r.campaign_id, r.id]))
      .map(a => ({ key: 'attempt:' + a.id, contactId: a.contact_id, conversationId: null, campaignId: a.campaign_id, facts: a.facts ?? {} }));
  }
  const match = r.trigger_kind === 'outcome' ? 'cv.outcome = $4' : r.trigger_kind === 'reason_code' ? 'cv.reason_code = $4'
    : 'EXISTS (SELECT 1 FROM channel_call_read rd WHERE rd.conversation_id = cv.id AND rd.asked_whatsapp)';
  // $4 is the trigger value; the asked_whatsapp match does not use it, so it is typed once by a no-op comparison.
  const params: unknown[] = [r.workspace_id, r.agent_id, r.campaign_id, r.trigger_value, r.id];
  return (await many<{ id: string; contact_id: string; campaign_id: string | null; facts: Record<string, unknown> | null }>(pool,
    `SELECT cv.id, cv.contact_id, a.campaign_id, a.facts FROM conversation cv
       LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
       LEFT JOIN agent_version v ON v.id = cv.agent_version_id
      WHERE cv.workspace_id = $1 AND cv.status = 'done' AND cv.channel = 'phone' AND cv.contact_id IS NOT NULL
        AND coalesce(cv.run_manifest->>'test', 'false') <> 'true' AND cv.ended_at > now() - make_interval(hours => ${LOOKBACK_H})
        AND ($2::uuid IS NULL OR v.agent_id = $2) AND ($3::uuid IS NULL OR a.campaign_id = $3) AND coalesce($4::text, '') = coalesce($4::text, '') AND ${match}
        AND NOT EXISTS (SELECT 1 FROM channel_followthrough_run x WHERE x.rule_id = $5 AND x.source_key = 'call:' || cv.id)
      ORDER BY cv.ended_at LIMIT ${BATCH}`, params))
    .map(c => ({ key: 'call:' + c.id, contactId: c.contact_id, conversationId: c.id, campaignId: c.campaign_id, facts: c.facts ?? {} }));
}

const resultOf = (s: SendOutcome) => s.status === 'blocked' ? 'blocked:' + s.reasons.join(',') : s.status;

/** One pass of every enabled rule (ws = null: every workspace, the job). Returns what each send did. */
export async function runFollowThrough(pool: pg.Pool, ws: string | null): Promise<{ rule: string; key: string; result: string }[]> {
  await readCalls(pool, ws);
  const rules = await many<RuleRow & { t: TemplateRow }>(pool,
    `SELECT f.*, to_jsonb(t.*) AS t FROM channel_followthrough f JOIN channel_template t ON t.id = f.template_id AND t.workspace_id = f.workspace_id
      WHERE f.enabled AND ($1::uuid IS NULL OR f.workspace_id = $1) AND t.status = 'approved' ORDER BY f.created_at`, [ws]);
  const out: { rule: string; key: string; result: string }[] = [];
  for (const r of rules) {
    const sentToday = Number((await one<{ n: string }>(pool, `SELECT count(*)::text AS n FROM channel_followthrough_run WHERE rule_id = $1 AND result = 'sent'
      AND created_at > now() - interval '24 hours'`, [r.id]))?.n ?? 0);
    let room = r.daily_limit - sentToday;
    const seen = new Set<string>();      // one follow-up per person per rule in a pass (two unanswered attempts, one note)
    for (const c of await candidates(pool, r)) {
      if (r.trigger_kind === 'not_answered') { if (seen.has(c.contactId)) continue; seen.add(c.contactId); }
      // Claim first: a run row exists before anything can leave, so this call is never followed up twice.
      const claimed = await pool.query(`INSERT INTO channel_followthrough_run (rule_id, source_key, workspace_id, contact_id, result) VALUES ($1,$2,$3,$4,'sending')
        ON CONFLICT DO NOTHING`, [r.id, c.key, r.workspace_id, c.contactId]);
      if (!claimed.rowCount) continue;
      let result: string, messageId: string | null = null;
      if (room <= 0) result = 'skipped:daily_limit';
      else {
        const t = { ...r.t, submitted_at: null, decided_at: null, created_at: new Date(), updated_at: new Date() } as TemplateRow;
        const b = await bindTemplate(pool, r.workspace_id, t, { contactId: c.contactId, conversationId: c.conversationId, attemptFacts: c.facts });
        if (!b.ok) result = 'blocked:' + b.reasons.join(',');
        else {
          const door = { ...(await brandDoor(pool, r.workspace_id)), facts: b.facts };
          const s = await gatedSend(pool, r.workspace_id, { to: { contactId: c.contactId }, content: { kind: 'template', template: resolved(t), params: b.params },
            purpose: r.purpose, author: { kind: 'system', what: 'followthrough:' + r.id, door }, conversationId: c.conversationId ?? undefined, campaignId: c.campaignId ?? undefined });
          result = resultOf(s); messageId = s.messageId;
          if (s.status === 'sent' || s.status === 'unknown') room--;
        }
      }
      await pool.query('UPDATE channel_followthrough_run SET result = $3, message_id = $4 WHERE rule_id = $1 AND source_key = $2', [r.id, c.key, result, messageId]);
      out.push({ rule: r.id, key: c.key, result });
    }
  }
  return out;
}
