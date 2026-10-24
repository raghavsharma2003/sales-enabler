// WhatsApp message templates: drafted here, reviewed by Meta, sent only once approved. A template's values ({{1}},
// {{2}}, ...) each name where they come from, and are bound at send time by the same rules as a call ticket's
// per-contact facts (campaigns/worker.ts ticketFacts, agents/compile.ts contact rows): the contact's own record or the
// attempt's variables, never free text typed per send; a value past its max age is not used; a value is one short
// line. The bound values are the door's facts for that message, so an amount the record holds may be stated and an
// amount it does not hold may not.
import type pg from 'pg';
import { many, one, type Queryable } from '../../db.ts';
import type { Fact } from '../../../shared/agent-config.ts';
import { brandDoor, doorOver, type ResolvedTemplate } from './gate.ts';
import { graph } from './graph.ts';
import { credentials, connectionFor, type ConnectionRow } from './store.ts';
import type { TemplateEvent } from './transport.ts';

export const VARIABLE_SOURCES = ['contact.name', 'contact.first_name', 'call.callback_time', 'brand.name'] as const;
/** attr:<key> binds a contact attribute (or an attempt variable of that name). */
export const ATTR = /^attr:[a-z][a-z0-9_]{0,59}$/;
export const SOURCE_WORDS: Record<string, string> = {
  'contact.name': "the person's name", 'contact.first_name': "the person's first name", 'call.callback_time': 'the callback time the caller asked for',
  'brand.name': 'your brand name',
};
export const sourceWords = (s: string) => SOURCE_WORDS[s] ?? (s.startsWith('attr:') ? `their "${s.slice(5).replace(/_/g, ' ')}" field` : s);

export interface TemplateRow {
  id: string; workspace_id: string; connection_id: string; name: string; language: string; category: 'utility' | 'marketing'; body: string;
  variables: { source: string; sample: string }[]; status: ResolvedTemplate['status'] | 'draft' | 'submitted' | 'rejected' | 'paused' | 'disabled';
  provider_template_id: string | null; reject_reason: string | null; version: number; submitted_at: Date | null; decided_at: Date | null;
  created_at: Date; updated_at: Date;
}

/** {{1}}..{{n}} in the body, in order of first use. */
export function placeholders(body: string): number[] {
  const seen: number[] = [];
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) { const n = Number(m[1]); if (!seen.includes(n)) seen.push(n); }
  return seen;
}

/** Problems with a template as drafted, in words; empty when it may be submitted. */
export function lintTemplate(t: { name: string; body: string; category: string; variables: { source: string; sample: string }[] }): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) out.push('the name may use only lower-case letters, digits and underscores');
  if (t.body.length > 1024) out.push('the body is longer than 1,024 characters');
  const ph = placeholders(t.body);
  const want = t.variables.length;
  if (ph.length !== want || ph.some((n, i) => n !== i + 1) || [...ph].sort((a, b) => a - b).some((n, i) => n !== i + 1)) {
    out.push(`the body must use {{1}} to {{${want}}} once each, in order, for the ${want} value${want === 1 ? '' : 's'} listed`);
  }
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) out.push('WhatsApp does not accept a value at the very start or end of the body');
  for (const v of t.variables) {
    if (!(VARIABLE_SOURCES as readonly string[]).includes(v.source) && !ATTR.test(v.source)) out.push(`"${v.source}" is not a value Vyakti can fill`);
    if (!v.sample.trim()) out.push('every value needs a sample for Meta\'s reviewer');
  }
  return out;
}

const render = (body: string, params: string[]) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => params[Number(n) - 1] ?? '');

/** The door's verdict on the template rendered with its samples (drafting) or with bound values (sending). */
export async function doorOnTemplate(q: Queryable, ws: string, body: string, params: string[], facts: Fact[] = [], category: 'utility' | 'marketing' = 'utility') {
  const ctx = await brandDoor(q, ws);
  return doorOver(render(body, params), { ...ctx, facts, category: category === 'marketing' ? 'promotional' : 'service' }, { fixed: true });
}

export async function templateById(q: Queryable, ws: string, id: string, lock = false): Promise<TemplateRow | null> {
  return one<TemplateRow>(q, `SELECT * FROM channel_template WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
}

export const resolved = (t: TemplateRow): ResolvedTemplate =>
  ({ id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, status: t.status as string });

// ---------------------------------------------------------------------------------------------------------------
// Binding values at send time

const IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const clean = (v: unknown) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();

export type BindRefusal = 'variable_missing' | 'variable_stale' | 'variable_too_long';
export const BIND_WORDS: Record<BindRefusal, string> = {
  variable_missing: 'A value the template needs is not on the person\'s record',
  variable_stale: 'A value the template needs is older than its source allows',
  variable_too_long: 'A value is longer than one short line',
};

export async function bindTemplate(q: Queryable, ws: string, t: TemplateRow, at: { contactId: string; conversationId?: string | null; attemptFacts?: Record<string, unknown> }):
  Promise<{ ok: true; params: string[]; facts: Fact[] } | { ok: false; reasons: BindRefusal[]; missing: string[] }> {
  const contact = await one<{ name: string | null; custom: Record<string, unknown> }>(q, 'SELECT name, custom FROM contact WHERE id = $1 AND workspace_id = $2', [at.contactId, ws]);
  const reasons = new Set<BindRefusal>(); const missing: string[] = []; const params: string[] = []; const facts: Fact[] = [];
  for (const v of t.variables) {
    let value: string | null = null;
    if (v.source === 'contact.name') value = contact?.name ?? null;
    else if (v.source === 'contact.first_name') value = contact?.name?.trim().split(/\s+/)[0] ?? null;
    else if (v.source === 'brand.name') value = (await one<{ legal_name: string }>(q, 'SELECT legal_name FROM brand WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [ws]))?.legal_name ?? null;
    else if (v.source === 'call.callback_time') {
      const cb = at.conversationId ? await one<{ scheduled_for: Date }>(q, `SELECT scheduled_for FROM attempt WHERE workspace_id = $1 AND kind = 'callback'
        AND callback->>'conversationId' = $2 AND status IN ('created','queued') ORDER BY created_at DESC LIMIT 1`, [ws, at.conversationId]) : null;
      value = cb ? IST.format(cb.scheduled_for) : null;
    } else if (v.source.startsWith('attr:')) {
      const key = v.source.slice(5);
      const a = await one<{ value: unknown; observed_at: Date; max_age_s: number | null }>(q, `SELECT a.value, a.observed_at, a.max_age_s FROM attribute a
        JOIN contact c ON c.id = a.contact_id WHERE a.contact_id = $1 AND c.workspace_id = $2 AND a.key = $3`, [at.contactId, ws, key]);
      if (a) {
        if (a.max_age_s != null && a.observed_at.getTime() + a.max_age_s * 1000 < Date.now()) { reasons.add('variable_stale'); missing.push(sourceWords(v.source)); continue; }
        value = typeof a.value === 'object' && a.value !== null && 'value' in (a.value as object) ? String((a.value as { value: unknown }).value) : String(a.value);
      } else if (at.attemptFacts && at.attemptFacts[key] != null) value = String(at.attemptFacts[key]);
      else if (contact?.custom && contact.custom[key] != null) value = String(contact.custom[key]);
    }
    const c = clean(value);
    if (!c) { reasons.add('variable_missing'); missing.push(sourceWords(v.source)); continue; }
    if (c.length > 100) { reasons.add('variable_too_long'); missing.push(sourceWords(v.source)); continue; }
    params.push(c);
    facts.push({ key: v.source.replace(/[^a-z0-9_]/gi, '_'), value: c, purpose: 'service', source: 'contact record', perContact: true } as Fact);
  }
  return reasons.size ? { ok: false, reasons: [...reasons], missing } : { ok: true, params, facts };
}

// ---------------------------------------------------------------------------------------------------------------
// Meta review

export async function submitToMeta(pool: pg.Pool, ws: string, templateId: string) {
  const t = await templateById(pool, ws, templateId);
  if (!t) throw new Error('no such template in this workspace');
  if (!['draft', 'rejected'].includes(t.status)) throw new Error(`this template is ${t.status}; only a draft or a rejected template can be submitted`);
  const problems = lintTemplate(t);
  if (problems.length) throw new Error('fix these first: ' + problems.join('; '));
  const conn = await connectionFor(pool, ws, t.connection_id);
  if (!conn) throw new Error('the WhatsApp number for this template is not connected');
  if (!conn.waba_id) throw new Error('the WhatsApp integration has no WhatsApp Business Account ID; add it in Integrations');
  const creds = await credentials(pool, conn);
  if (!creds) throw new Error('the WhatsApp credentials are missing; connect the account again');
  const body = { name: t.name, language: t.language, category: t.category.toUpperCase(),
    components: [{ type: 'BODY', text: t.body, ...(t.variables.length ? { example: { body_text: [t.variables.map(v => v.sample)] } } : {}) }] };
  const res = await graph().request({ method: 'POST', path: `/${conn.waba_id}/message_templates`, token: creds.accessToken, body });
  if (res.status < 200 || res.status >= 300 || !res.json?.id) throw new Error('Meta did not accept the template: ' + String(res.json?.error?.message ?? res.status).slice(0, 200));
  return { providerTemplateId: String(res.json.id), status: String(res.json.status ?? 'PENDING').toLowerCase(), category: String(res.json.category ?? '').toLowerCase() };
}

const META_STATUS: Record<string, TemplateRow['status']> = { approved: 'approved', rejected: 'rejected', pending: 'submitted', paused: 'paused', disabled: 'disabled', in_appeal: 'submitted' };

export async function applyTemplateStatus(q: Queryable, ws: string, t: TemplateRow, status: string, reason: string | null, category?: string) {
  const next = META_STATUS[status] ?? null;
  if (!next || next === t.status) return false;
  await q.query(`UPDATE channel_template SET status = $2, reject_reason = $3, decided_at = CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE decided_at END,
    category = CASE WHEN $4 IN ('utility','marketing') THEN $4 ELSE category END, updated_at = now() WHERE id = $1`,
    [t.id, next, next === 'rejected' || next === 'paused' ? reason : null, category ?? null]);
  return true;
}

/** Ask Meta for the review status of every submitted template on a number. */
export async function syncFromMeta(pool: pg.Pool, ws: string, conn: ConnectionRow): Promise<{ checked: number; changed: number }> {
  const creds = await credentials(pool, conn);
  if (!creds || !conn.waba_id) return { checked: 0, changed: 0 };
  const open = await many<TemplateRow>(pool, "SELECT * FROM channel_template WHERE workspace_id = $1 AND connection_id = $2 AND status IN ('submitted','approved','paused')", [ws, conn.id]);
  let changed = 0;
  for (const t of open) {
    const res = await graph().request({ method: 'GET', path: `/${conn.waba_id}/message_templates`, token: creds.accessToken, query: { name: t.name } });
    const row = (res.json?.data ?? []).find((d: { name: string; language: string }) => d.name === t.name && d.language === t.language);
    if (!row) continue;
    const reason = row.rejected_reason && row.rejected_reason !== 'NONE' ? String(row.rejected_reason) : null;
    if (await applyTemplateStatus(pool, ws, t, String(row.status).toLowerCase(), reason, String(row.category ?? '').toLowerCase())) changed++;
  }
  return { checked: open.length, changed };
}

/** A review decision that arrived on the webhook (message_template_status_update). */
export async function onTemplateEvent(c: pg.PoolClient, conn: ConnectionRow, e: TemplateEvent) {
  const t = await one<TemplateRow>(c, `SELECT * FROM channel_template WHERE workspace_id = $1 AND connection_id = $2 AND (provider_template_id = $3
    OR (name = $4 AND ($5::text IS NULL OR language = $5))) ORDER BY provider_template_id = $3 DESC LIMIT 1 FOR UPDATE`,
    [conn.workspace_id, conn.id, e.providerTemplateId, e.name, e.language]);
  if (t) await applyTemplateStatus(c, conn.workspace_id, t, e.status, e.reason);
}
