// Connections and threads: which business number, which person, and the 24-hour window between them.
import { many, one, type Queryable } from '../../db.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { integrationSecretsById } from '../workspace/integrations.ts';
import type { Credentials } from './transport.ts';
import { appendWaConsent } from './consent.ts';

export const WINDOW_MS = 24 * 3600_000;

export interface ConnectionRow {
  id: string; workspace_id: string; integration_id: string; name: string; phone_number_id: string; waba_id: string | null;
  display_number: string | null; verify_token_hash: string; agent_id: string | null; webhook_verified_at: Date | null; status: 'active' | 'paused' | 'disconnected';
}
export interface ThreadRow {
  id: string; workspace_id: string; connection_id: string; contact_id: string | null; wa_id: string; last_inbound_at: Date | null;
  last_message_at: Date; mode: 'agent' | 'human'; handoff_reason: string | null; handoff_at: Date | null; claimed_by: string | null;
  claimed_at: Date | null; resolved_at: Date | null; opted_out_at: Date | null; created_at: Date;
}

/** A WhatsApp id is the number in international form without the plus. */
export const waIdOf = (e164: string) => e164.replace(/\D/g, '');

export function windowOpen(t: Pick<ThreadRow, 'last_inbound_at'> | null, now = Date.now()): boolean {
  return !!t?.last_inbound_at && now - t.last_inbound_at.getTime() < WINDOW_MS;
}
export function windowClosesAt(t: Pick<ThreadRow, 'last_inbound_at'> | null): Date | null {
  return t?.last_inbound_at ? new Date(t.last_inbound_at.getTime() + WINDOW_MS) : null;
}

/** The connection to use: the one named, else the workspace's only active one (oldest first when several). */
export async function connectionFor(q: Queryable, ws: string, id?: string): Promise<ConnectionRow | null> {
  return id
    ? one<ConnectionRow>(q, "SELECT * FROM channel_connection WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected'", [id, ws])
    : one<ConnectionRow>(q, "SELECT * FROM channel_connection WHERE workspace_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1", [ws]);
}

export async function credentials(q: Queryable, conn: ConnectionRow): Promise<Credentials | null> {
  const s = await integrationSecretsById(q, conn.workspace_id, conn.integration_id);
  if (!s?.access_token || !s?.app_secret) return null;
  return { phoneNumberId: conn.phone_number_id, wabaId: conn.waba_id, accessToken: s.access_token, appSecret: s.app_secret };
}

/** The person on file for a WhatsApp id (their number or one of their phone aliases), never an erased one. */
export async function contactForWaId(q: Queryable, ws: string, waId: string): Promise<string | null> {
  const p = normaliseIndianPhone('+' + waId);
  const e164 = p.ok ? p.e164 : '+' + waId;
  const c = await one<{ id: string }>(q, `SELECT c.id FROM contact c WHERE c.workspace_id = $1 AND c.erased_at IS NULL AND (c.e164 = $2 OR EXISTS
    (SELECT 1 FROM contact_identifier ci WHERE ci.contact_id = c.id AND ci.kind = 'phone_e164' AND ci.raw = $2)) ORDER BY c.created_at LIMIT 1`, [ws, e164]);
  return c?.id ?? null;
}

/** The thread for this person on this connection, created on first use. Locked for the caller's transaction. */
export async function threadFor(q: Queryable, conn: ConnectionRow, waId: string, contactId: string | null): Promise<ThreadRow> {
  await q.query(`INSERT INTO channel_thread (workspace_id, connection_id, contact_id, wa_id) VALUES ($1,$2,$3,$4)
    ON CONFLICT (connection_id, wa_id) DO NOTHING`, [conn.workspace_id, conn.id, contactId, waId]);
  const t = await one<ThreadRow>(q, 'SELECT * FROM channel_thread WHERE connection_id = $1 AND wa_id = $2 FOR UPDATE', [conn.id, waId]);
  if (t && contactId && !t.contact_id) {
    await q.query('UPDATE channel_thread SET contact_id = $2 WHERE id = $1', [t.id, contactId]);
    t.contact_id = contactId;
    // A STOP sent before the number was on file follows the person into the consent ledger.
    if (t.opted_out_at) await appendWaConsent(q, conn.workspace_id, contactId, { granted: false, purpose: 'all', source: 'whatsapp',
      evidence: { threadId: t.id, statedAt: t.opted_out_at.toISOString(), note: 'stopped before the number was on file' } });
  }
  return t!;
}

export async function threadById(q: Queryable, ws: string, id: string, lock = false): Promise<ThreadRow | null> {
  return one<ThreadRow>(q, `SELECT * FROM channel_thread WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
}

export async function contactE164(q: Queryable, ws: string, contactId: string): Promise<{ e164: string; erased: boolean } | null> {
  const c = await one<{ e164: string; erased_at: Date | null }>(q, 'SELECT e164, erased_at FROM contact WHERE id = $1 AND workspace_id = $2', [contactId, ws]);
  return c ? { e164: c.e164, erased: !!c.erased_at } : null;
}

export async function connections(q: Queryable, ws: string) {
  return many<ConnectionRow & { created_at: Date; integration_name: string | null }>(q,
    `SELECT c.*, i.name AS integration_name FROM channel_connection c LEFT JOIN integration i ON i.id = c.integration_id AND i.workspace_id = c.workspace_id
      WHERE c.workspace_id = $1 ORDER BY c.created_at`, [ws]);
}
