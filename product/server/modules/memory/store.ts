// Writing gated facts, the one way: a call and a WhatsApp thread store through here, so contradictions, tiers, undo
// windows and retention work the same whatever channel the person used.
import { many, one, type Queryable } from '../../db.ts';
import { AUTHORITY, RETENTION_DAYS, type Accepted } from './gates.ts';

export interface StoreOrigin {
  saidAt: Date;
  /** For a thread: when the message holding this quote was sent (else saidAt). */
  saidAtOf?: (f: Accepted) => Date;
  undoMinutes: number;
  conversationId?: string | null;
  channel: 'call' | 'whatsapp';
  /** For a message: which message and where in its text the quote sits. */
  spanOf?: (f: Accepted) => { messageId: string; start: number; end: number } | null;
}

export async function storeFacts(q: Queryable, ws: string, contactId: string, accepted: Accepted[], o: StoreOrigin,
  bump: (k: 'stored' | 'review' | 'superseded') => void): Promise<void> {
  // Later wins within one episode: write in the order the person said them.
  const sorted = [...accepted].sort((a, b) => a.quoteAt - b.quoteAt);
  const undoUntil = new Date(Date.now() + o.undoMinutes * 60_000);
  for (const f of sorted) {
    const saidAt = o.saidAtOf?.(f) ?? o.saidAt;
    const expires = new Date(saidAt.getTime() + RETENTION_DAYS[f.retention] * 86_400_000);
    const span = o.spanOf?.(f) ?? null;
    const row = await one<{ id: string }>(q, `INSERT INTO memory_fact (workspace_id, contact_id, conversation_id, kind, key, value, quote, purpose, basis, tier, status,
        undo_until, retention, category, source, authority, said_at, expires_at, channel, channel_message_id, span)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'caller',$15,$16,$17,$18,$19,$20) RETURNING id`,
      [ws, contactId, o.conversationId ?? null, f.kind, f.key, JSON.stringify(f.value), f.quote, f.purpose, f.basis, f.tier,
        f.tier === 'review' ? 'proposed' : 'active', f.tier === 'review' ? null : undoUntil, f.retention, f.category, AUTHORITY.caller, saidAt, expires,
        o.channel, span?.messageId ?? null, span ? JSON.stringify(span) : null]);
    bump('stored');
    if (f.tier === 'review') bump('review');
    // Contradictions: the newest statement from an equal or higher authority supersedes; a lower one loses at once.
    const older = await many<{ id: string; authority: number }>(q, `SELECT id, authority FROM memory_fact WHERE workspace_id = $1 AND contact_id = $2 AND kind = $3 AND key = $4
      AND purpose = $5 AND id <> $6 AND superseded_by IS NULL AND status IN ('active','proposed') AND said_at <= $7`, [ws, contactId, f.kind, f.key, f.purpose, row!.id, saidAt]);
    for (const old of older) {
      if (AUTHORITY.caller >= old.authority) { await q.query('UPDATE memory_fact SET superseded_by = $2 WHERE id = $1', [old.id, row!.id]); bump('superseded'); }
      else await q.query('UPDATE memory_fact SET superseded_by = $2 WHERE id = $1', [row!.id, old.id]);
    }
    // A late extraction of an older episode never overrides what the person said since.
    const newer = await one<{ id: string }>(q, `SELECT id FROM memory_fact WHERE workspace_id = $1 AND contact_id = $2 AND kind = $3 AND key = $4 AND purpose = $5
      AND superseded_by IS NULL AND status IN ('active','proposed') AND said_at > $6 ORDER BY said_at DESC LIMIT 1`, [ws, contactId, f.kind, f.key, f.purpose, saidAt]);
    if (newer) await q.query('UPDATE memory_fact SET superseded_by = $2 WHERE id = $1', [row!.id, newer.id]);
  }
}
