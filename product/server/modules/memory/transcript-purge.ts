// Transcripts follow the same law as recordings (calls/recording-purge.ts): a call's words go when the person asked to be
// erased (a forget_request with scope erase_me, or a contact erased in place by intake), first and whatever their age, or
// when the workspace's transcripts retention (policy.retention.get transcripts_days) has passed since the call ended.
//
// Redact, not delete: the conversation row carries outcome, durations, costs (cost_line cascades on delete, so billing
// would lose lines), and the audit and learning refer to it by id. So the text is blanked and the metrics stay:
//   turn            text '' and heard_text NULL; idx, speaker, timing, latency and cut-ins kept
//   conversation    transcript [], analysis with every free-text field removed (counts, codes and verdicts kept)
//   call_moment     quote and note NULL          outcome   evidence.quote removed
//   hand_off        brief.summary removed        call_insight   quotes from this call removed from each theme
// Not touched here: memory facts (their own retention and forget), safety and opt-out records (the audit of what the
// agent was stopped from saying and of the opt-out itself), follow-up payloads (operational messages, not the transcript).
// The whole purge of one call is one transaction, marked with when and why, so a run cut short is finished by the next.
import type pg from 'pg';
import { many, tx } from '../../db.ts';
import { retentionPolicy } from '../intake/retention.ts';

export type TranscriptPurgeReason = 'retention' | 'erased';
const BATCH = 200;

// Free text a model or a person wrote about the call, or the caller's own words. Everything else in analysis is a code,
// a count, a number or a verdict and stays for reports and learning.
const TEXT_KEYS = new Set(['summary', 'points', 'quotes', 'quote', 'text', 'note', 'claim', 'reason', 'message', 'body', 'why']);

/** analysis without its free text. Arrays of objects keep their shape minus the text; strings under a text key go. */
export function redactAnalysis(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactAnalysis);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (TEXT_KEYS.has(k) && (typeof x === 'string' || Array.isArray(x))) continue;
    out[k] = redactAnalysis(x);
  }
  return out;
}

/** Calls whose words must go now, erasures first. */
async function due(pool: pg.Pool, workspaceId?: string): Promise<{ id: string; workspace_id: string; reason: TranscriptPurgeReason }[]> {
  const erased = await many<{ id: string; workspace_id: string }>(pool,
    `SELECT cv.id, cv.workspace_id FROM conversation cv JOIN contact ct ON ct.id = cv.contact_id AND ct.workspace_id = cv.workspace_id
     WHERE cv.transcript_purged_at IS NULL AND cv.status <> 'live' AND ($1::uuid IS NULL OR cv.workspace_id = $1::uuid)
       AND (ct.erased_at IS NOT NULL OR EXISTS (SELECT 1 FROM forget_request f WHERE f.workspace_id = cv.workspace_id AND f.contact_id = cv.contact_id AND f.scope = 'erase_me'))
     LIMIT ${BATCH}`, [workspaceId ?? null]);
  const out: { id: string; workspace_id: string; reason: TranscriptPurgeReason }[] = erased.map(r => ({ ...r, reason: 'erased' }));
  const wss = await many<{ workspace_id: string }>(pool,
    `SELECT DISTINCT workspace_id FROM conversation WHERE transcript_purged_at IS NULL AND ended_at IS NOT NULL AND ($1::uuid IS NULL OR workspace_id = $1::uuid)`, [workspaceId ?? null]);
  for (const { workspace_id } of wss) {
    if (out.length >= BATCH) break;
    const { policy } = await retentionPolicy(pool, workspace_id);
    const old = await many<{ id: string }>(pool,
      `SELECT id FROM conversation WHERE workspace_id = $1 AND transcript_purged_at IS NULL AND ended_at < now() - make_interval(days => $2)
       ORDER BY ended_at LIMIT ${BATCH}`, [workspace_id, policy.transcripts_days]);
    for (const r of old) if (!out.some(o => o.id === r.id)) out.push({ id: r.id, workspace_id, reason: 'retention' });
  }
  return out.slice(0, BATCH);
}

async function purgeOne(c: pg.PoolClient, id: string, ws: string, reason: TranscriptPurgeReason): Promise<boolean> {
  const conv = await c.query(`UPDATE conversation SET transcript = '[]'::jsonb, transcript_purged_at = now(), transcript_purge_reason = $3
    WHERE id = $1 AND workspace_id = $2 AND transcript_purged_at IS NULL RETURNING analysis`, [id, ws, reason]);
  if (!conv.rowCount) return false;                                                  // another run got here first
  const analysis = conv.rows[0].analysis;
  if (analysis) await c.query('UPDATE conversation SET analysis = $3 WHERE id = $1 AND workspace_id = $2', [id, ws, JSON.stringify(redactAnalysis(analysis))]);
  await c.query("UPDATE turn SET text = '', heard_text = NULL WHERE conversation_id = $1", [id]);
  await c.query('UPDATE call_moment SET quote = NULL, note = NULL WHERE conversation_id = $1 AND workspace_id = $2', [id, ws]);
  await c.query("UPDATE outcome SET evidence = evidence - 'quote' WHERE conversation_id = $1 AND workspace_id = $2", [id, ws]);
  await c.query("UPDATE hand_off SET brief = brief - 'summary' WHERE conversation_id = $1 AND workspace_id = $2 AND jsonb_typeof(brief) = 'object'", [id, ws]);
  // Cross-call themes keep verbatim quotes with the call they came from; drop this call's, keep the theme and its counts.
  for (const ins of await many<{ id: string; themes: any[] }>(c,
    `SELECT id, themes FROM call_insight WHERE workspace_id = $1 AND themes @> $2::jsonb FOR UPDATE`, [ws, JSON.stringify([{ quotes: [{ conversationId: id }] }])])) {
    const themes = ins.themes.map(t => ({ ...t, quotes: (t.quotes ?? []).filter((q: any) => q.conversationId !== id) }));
    await c.query('UPDATE call_insight SET themes = $2 WHERE id = $1', [ins.id, JSON.stringify(themes)]);
  }
  return true;
}

/** One run of memory.transcript_purge. Returns what happened, for the job log and tests. */
export async function purgeTranscripts(pool: pg.Pool, opts: { workspaceId?: string } = {}): Promise<{ purged: number; erased: number; retention: number }> {
  let purged = 0, erased = 0, retention = 0;
  for (const d of await due(pool, opts.workspaceId)) {
    if (!(await tx(pool, c => purgeOne(c, d.id, d.workspace_id, d.reason)))) continue;
    purged++;
    if (d.reason === 'erased') erased++; else retention++;
  }
  return { purged, erased, retention };
}

/** The call page's line for a call whose words were removed, or null. */
export function transcriptRemovedWhy(c: { transcript_purged_at?: Date | string | null; transcript_purge_reason?: string | null }, transcriptsDays: number): string | null {
  if (!c.transcript_purged_at) return null;
  return c.transcript_purge_reason === 'erased'
    ? "Transcript removed on the person's erasure request. Timing, outcome and cost are kept."
    : `Transcript removed: this workspace keeps transcripts for ${transcriptsDays} days. Timing, outcome and cost are kept.`;
}
