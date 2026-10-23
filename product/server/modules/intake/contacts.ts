// People: read, search, merge, suppress and release, consent, DND, export, and DPDP erasure.
// Suppression and consent are typed ledgers, never model memory. Erasure keeps the row as a husk so the
// consent history, the suppression and the tombstone outlive the person's data.
import { label } from '../../labels.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { any, arr, bool, num, obj, opt, record, str, uuid } from '../../../shared/validate.ts';
import { appendAudit } from '../../audit.ts';
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';
import { decide, type Authority, type Claim } from './authority.ts';
import { csvCell } from './csv.ts';
import { asciiDigits } from './mapping.ts';
import { dndProvider, dndSource } from './dnd.ts';
// The memory module's one export for erasure inside another module's transaction (agreed with the integrator).
import { forgetContactMemory } from '../memory/index.ts';
// And campaigns' one export for erasure: cancel the person's queued attempts in this same transaction (review WGC-07).
import { cancelContactAttempts } from '../campaigns/index.ts';
import { audienceWhere } from './audiences.ts';
import { e164Hash, hashWith, workspaceSalt } from './store.ts';

/** NCPR answers older than this are treated as unknown at the dial gate. */
export const DND_FRESH_S = 7 * 86400;

const mask = (e164: string) => e164.startsWith('+') ? e164.slice(0, 3) + '•••••' + e164.slice(-4) : '•••';
const initials = (n: string | null) => n ? n.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase() + '.' : null;
/** Viewers see people with PII scrubbed (workspace blueprint §5). */
const scrub = <T extends { e164?: string; name?: string | null }>(ctx: ToolCtx, c: T): T =>
  ctx.actor.role === 'viewer' ? { ...c, e164: c.e164 ? mask(c.e164) : c.e164, name: initials(c.name ?? null) } : c;

interface ContactRow { id: string; e164: string; name: string | null; language: string | null; timezone: string; custom: unknown; created_at: Date; updated_at: Date; erased_at: Date | null }

async function contactById(q: Queryable, ws: string, id: string, lock = false): Promise<ContactRow> {
  const c = await one<ContactRow>(q, `SELECT * FROM contact WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
  if (!c) throw new Error('no such contact in this workspace');
  return c;
}

/** Resolve {contactId} or {e164} (any Indian format) to a contact, or null when the number is not on file. */
async function resolve(q: Queryable, ws: string, i: { contactId?: string; e164?: string }): Promise<{ contact: ContactRow | null; e164: string | null }> {
  if (i.contactId) { const c = await contactById(q, ws, i.contactId); return { contact: c, e164: c.erased_at ? null : c.e164 }; }
  if (!i.e164) throw new Error('give contactId or e164');
  const p = normaliseIndianPhone(i.e164);
  if (!p.ok) throw new Error(`that number cannot be used (${p.reason})`);
  const c = await one<ContactRow>(q, `SELECT c.* FROM contact c WHERE c.workspace_id = $1 AND c.erased_at IS NULL AND (c.e164 = $2 OR EXISTS
    (SELECT 1 FROM contact_identifier ci WHERE ci.contact_id = c.id AND ci.kind = 'phone_e164' AND ci.raw = $2)) LIMIT 1`, [ws, p.e164]);
  return { contact: c, e164: p.e164 };
}

const SUPP_JOIN = `s.workspace_id = c.workspace_id AND s.scope = 'workspace' AND (s.contact_id = c.id OR s.e164 = c.e164)`;

/** The facts the dial gate needs about one person. Unknown or stale DND fails closed for promotional calls. */
export async function dialFacts(q: Queryable, ws: string, i: { contactId?: string; e164?: string; purpose?: string }) {
  const r = await resolve(q, ws, i);
  const salt = await workspaceSalt(q, ws);
  const e = r.e164 ?? r.contact?.e164 ?? null;
  const h = e && e.startsWith('+') ? hashWith(salt, e) : null;
  const tomb = h ? !!(await one(q, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = $2', [ws, h])) : false;
  const supp = await many<{ id: string; reason: string; source: string | null; scope: string; scope_id: string | null; created_at: Date }>(q,
    `SELECT id, reason, source, scope, scope_id, created_at FROM suppression WHERE workspace_id = $1 AND (
       ($2::uuid IS NOT NULL AND contact_id = $2) OR ($3::text IS NOT NULL AND e164 = $3) OR ($4::text IS NOT NULL AND e164_hash = $4))`,
    [ws, r.contact?.id ?? null, e, h]);
  const dnd = r.contact ? await one<{ internal: boolean; ncpr_status: string | null; checked_at: Date | null }>(q, 'SELECT internal, ncpr_status, checked_at FROM dnd_status WHERE contact_id = $1', [r.contact.id]) : null;
  const fresh = !!dnd?.checked_at && Date.now() - dnd.checked_at.getTime() <= DND_FRESH_S * 1000;
  const dndStatus = !dnd || !dnd.ncpr_status ? 'unknown' : fresh ? dnd.ncpr_status : 'unknown';
  const consent = r.contact && i.purpose ? await one<{ granted: boolean; basis: string; purpose: string; effective_at: Date }>(q,
    // Latest by effective time; a withdrawal wins anything within 1 s of it (app and database clocks can disagree by
    // milliseconds), the same rule as the dial gate's G5.
    `WITH c AS (SELECT granted, basis, purpose, effective_at, created_at, id FROM consent_record
                 WHERE workspace_id = $1 AND contact_id = $2 AND purpose IN ($3, 'all'))
     SELECT granted, basis, purpose, effective_at FROM c
      WHERE effective_at >= (SELECT max(effective_at) FROM c) - interval '1 second'
      ORDER BY granted ASC, effective_at DESC, created_at DESC, id DESC LIMIT 1`, [ws, r.contact.id, i.purpose]) : null;
  const wsSupp = supp.filter(s => s.scope === 'workspace');
  const base: string[] = [];
  if (tomb || r.contact?.erased_at) base.push('erased');
  if (wsSupp.length) base.push('suppressed');
  if (dnd?.internal) base.push('internal_dnd');
  if (!r.contact && !tomb) base.push('not_on_file');
  const promo = [...base];
  if (dndStatus === 'unknown') promo.push('dnd_unknown');
  if (dndStatus === 'registered' && !(consent?.granted)) promo.push('dnd_registered_without_consent');
  if (consent && !consent.granted) promo.push('consent_withdrawn');
  return {
    contactId: r.contact?.id ?? null, tombstoned: tomb, erased: !!r.contact?.erased_at,
    suppressions: supp.map(s => ({ id: s.id, reason: s.reason, source: s.source, scope: s.scope, scopeId: s.scope_id, at: s.created_at })),
    dnd: { status: dndStatus, recorded: dnd?.ncpr_status ?? null, checkedAt: dnd?.checked_at ?? null, fresh },
    consent: consent ? { purpose: consent.purpose, granted: consent.granted, basis: consent.basis, at: consent.effective_at } : null,
    service: { allowed: base.length === 0, reasons: base },
    promotional: { allowed: promo.length === 0, reasons: promo },
  };
}

async function suppressionVersion(q: Queryable, ws: string, id: string) {
  const s = await one<{ id: string; reason: string; created_at: Date }>(q, 'SELECT id, reason, created_at FROM suppression WHERE id = $1 AND workspace_id = $2', [id, ws]);
  return s ? `${s.id}:${s.created_at.toISOString()}` : null;
}

const target = { contactId: opt(uuid()), e164: opt(str({ min: 4, max: 40 })) };

export function registerContactTools(reg: Registry): void {
  reg.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 200 })), after: opt(uuid()), audienceId: opt(uuid()), suppressed: opt(bool()) }), {
    name: 'contact.list', risk: 'read', summary: 'List people, with suppression and DND state; page with after',
    run: async (ctx, i) => {
      const params: unknown[] = [ctx.workspaceId];
      let where = 'c.workspace_id = $1 AND c.erased_at IS NULL';
      if (i.after) { params.push(i.after); where += ` AND c.id > $${params.length}`; }
      if (i.audienceId) { const w = await audienceWhere(ctx.q, ctx.workspaceId, { audienceId: i.audienceId }, params); where += ' AND ' + w; }
      if (i.suppressed !== undefined) where += ` AND ${i.suppressed ? '' : 'NOT '}EXISTS (SELECT 1 FROM suppression s WHERE ${SUPP_JOIN})`;
      params.push(i.limit ?? 50);
      const rows = await many<ContactRow & { suppressed: boolean; ncpr_status: string | null; checked_at: Date | null }>(ctx.q, `SELECT c.id, c.e164, c.name, c.language, c.timezone, c.created_at, c.updated_at,
          EXISTS (SELECT 1 FROM suppression s WHERE ${SUPP_JOIN}) AS suppressed, d.ncpr_status, d.checked_at
        FROM contact c LEFT JOIN dnd_status d ON d.contact_id = c.id WHERE ${where} ORDER BY c.id LIMIT $${params.length}`, params);
      return { contacts: rows.map(r => scrub(ctx, { id: r.id, e164: r.e164, name: r.name, language: r.language, timezone: r.timezone, suppressed: r.suppressed,
        dnd: r.ncpr_status ?? 'unknown', dndCheckedAt: r.checked_at, createdAt: r.created_at })), next: rows.length === (i.limit ?? 50) ? rows[rows.length - 1].id : null };
    },
  }));

  reg.register(tool(obj({ id: uuid() }), {
    name: 'contact.get', risk: 'read', summary: 'One person: attributes with authority and freshness, consent history, suppressions, DND, aliases, open conflicts',
    run: async (ctx, i) => {
      const c = await contactById(ctx.q, ctx.workspaceId, i.id);
      if (c.erased_at) return { ...(await dialFacts(ctx.q, ctx.workspaceId, { contactId: c.id })), id: c.id, erased: true, erasedAt: c.erased_at };
      const now = Date.now();
      const attrs = (await many<{ key: string; value: unknown; authority: string; observed_at: Date; max_age_s: number | null; source_id: string | null }>(ctx.q,
        'SELECT key, value, authority, observed_at, max_age_s, source_id FROM attribute WHERE contact_id = $1 ORDER BY key', [c.id]))
        .map(a => ({ key: a.key, value: ctx.actor.role === 'viewer' ? undefined : a.value, authority: a.authority, observedAt: a.observed_at, sourceId: a.source_id,
          stale: a.max_age_s != null && a.observed_at.getTime() + a.max_age_s * 1000 < now }));
      const consent = await many(ctx.q, 'SELECT id, purpose, channel, basis, source, granted, evidence, effective_at, created_at FROM consent_record WHERE workspace_id = $1 AND contact_id = $2 ORDER BY effective_at, created_at, id', [ctx.workspaceId, c.id]);
      const aliases = ctx.actor.role === 'viewer' ? [] : (await many<{ raw: string; kind: string }>(ctx.q, 'SELECT raw, kind FROM contact_identifier WHERE contact_id = $1 ORDER BY kind, raw', [c.id]));
      const conflicts = await many(ctx.q, "SELECT id, key, kept, incoming, created_at FROM intake_attribute_conflict WHERE workspace_id = $1 AND contact_id = $2 AND status = 'open'", [ctx.workspaceId, c.id]);
      const facts = await dialFacts(ctx.q, ctx.workspaceId, { contactId: c.id });
      return { ...scrub(ctx, { id: c.id, e164: c.e164, name: c.name, language: c.language, timezone: c.timezone, createdAt: c.created_at, updatedAt: c.updated_at }),
        attributes: attrs, consent, aliases, conflicts, suppressions: facts.suppressions, dnd: facts.dnd, service: facts.service, promotional: facts.promotional };
    },
  }));

  reg.register(tool(obj({ q: str({ min: 1, max: 100 }), limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'contact.search', risk: 'read', summary: 'Find people by part of a number (any format, Devanagari digits too) or by name',
    run: async (ctx, i) => {
      const digits = asciiDigits(i.q).replace(/\D/g, '');
      const lim = i.limit ?? 20;
      const rows = digits.length >= 4
        ? await many<ContactRow>(ctx.q, `SELECT id, e164, name, language FROM contact c WHERE workspace_id = $1 AND erased_at IS NULL AND (e164 LIKE $2 OR EXISTS
            (SELECT 1 FROM contact_identifier ci WHERE ci.contact_id = c.id AND ci.kind = 'phone_e164' AND ci.raw LIKE $2)) ORDER BY e164 LIMIT $3`, [ctx.workspaceId, '%' + digits.slice(-10) + '%', lim])
        : await many<ContactRow>(ctx.q, `SELECT id, e164, name, language FROM contact WHERE workspace_id = $1 AND erased_at IS NULL AND name ILIKE $2 ESCAPE '\\' ORDER BY name LIMIT $3`,
            [ctx.workspaceId, '%' + i.q.replace(/[\\%_]/g, m => '\\' + m) + '%', lim]);
      return { contacts: rows.map(r => scrub(ctx, { id: r.id, e164: r.e164, name: r.name, language: r.language })) };
    },
  }));

  reg.register(tool(obj({ ...target, purpose: opt(str({ max: 80 })) }), {
    name: 'contact.dial_facts', risk: 'read',
    summary: 'What the dial gate needs about one person: tombstone, suppressions, DND (unknown fails closed for promotional), consent for a purpose',
    run: async (ctx, i) => dialFacts(ctx.q, ctx.workspaceId, i),
  }));

  // ---- consent (append-only) ----
  reg.register(tool(obj({
    contactId: uuid(), purpose: str({ min: 2, max: 80 }), channel: opt(str({ oneOf: ['voice', 'sms', 'whatsapp', 'email'] })),
    basis: str({ oneOf: ['consent', 'contract', 'legitimate_use', 'legal_obligation', 'withdrawal'] }), granted: bool(),
    source: opt(str({ max: 120 })), at: opt(str({ max: 40 })), evidence: opt(record(any(), { maxKeys: 20 })),
  }), {
    name: 'consent.record', risk: 'policy', roles: ['owner', 'compliance', 'operator'],
    describe: i => `Record that this person ${i.granted ? 'gave' : 'withdrew'} ${i.basis} for "${i.purpose}" on ${i.channel ?? 'voice'}${i.source ? ' (source: ' + i.source + ')' : ''}. Consent is append-only.`,
    summary: 'Append a consent grant or withdrawal for a purpose, with its evidence; nothing edits or deletes consent',
    run: async (ctx, i) => {
      const c = await contactById(ctx.q, ctx.workspaceId, i.contactId);
      if (c.erased_at) throw new Error('this person was erased; consent cannot be recorded against them');
      let statedAt: string | null = null;
      if (i.at) {
        const t = new Date(i.at);
        if (Number.isNaN(t.getTime())) throw new Error('at must be a date and time');
        if (t.getTime() > Date.now() + 60_000) throw new Error('consent cannot be dated in the future');
        statedAt = t.toISOString();
      }
      const ev = { ...(i.evidence ?? {}), statedAt, recordedBy: ctx.actor.type + ':' + (ctx.actor.id ?? '') };
      return one(ctx.q, `INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, evidence, granted, effective_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, purpose, channel, basis, granted, effective_at, created_at`,
        [ctx.workspaceId, c.id, i.purpose, i.channel ?? 'voice', i.basis, i.source ?? 'manual', JSON.stringify(ev), i.granted, statedAt]);
    },
  }));

  // ---- suppression ----
  // source is a stable code the dial gate reports (suppressed:<source>); the ids behind it go in evidence.
  const addSuppression = async (ctx: ToolCtx, i: { contactId?: string; e164?: string }, reason: string, source: 'in_call' | 'manual', evidence: Record<string, unknown>, scope = 'workspace', scopeId?: string) => {
    const r = await resolve(ctx.q, ctx.workspaceId, i);
    const e = r.e164 ?? null;
    const h = e ? await e164Hash(ctx.q, ctx.workspaceId, e) : null;
    const existing = await one<{ id: string }>(ctx.q, `SELECT id FROM suppression WHERE workspace_id = $1 AND scope = $2 AND coalesce(scope_id::text,'') = coalesce($3::text,'')
      AND (($4::uuid IS NOT NULL AND contact_id = $4) OR ($5::text IS NOT NULL AND e164 = $5)) LIMIT 1`, [ctx.workspaceId, scope, scopeId ?? null, r.contact?.id ?? null, e]);
    if (existing) return { suppressionId: existing.id, already: true, contactId: r.contact?.id ?? null };
    const s = await one<{ id: string }>(ctx.q, `INSERT INTO suppression (workspace_id, contact_id, e164, e164_hash, scope, scope_id, reason, source, evidence)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [ctx.workspaceId, r.contact?.id ?? null, e, h, scope, scopeId ?? null, reason, source, JSON.stringify(evidence)]);
    return { suppressionId: s!.id, already: false, contactId: r.contact?.id ?? null };
  };

  reg.register(tool(obj({ ...target, reason: str({ min: 2, max: 200 }), scope: opt(str({ oneOf: ['workspace', 'campaign'] })), scopeId: opt(uuid()) }), {
    // External as the registry has it; an A3 verb, so it runs at once for VP and for members (never waits for a card).
    name: 'contact.suppress', risk: 'external', roles: ['owner', 'operator', 'compliance'], summary: 'Stop calling a person (workspace-wide or one campaign); works for numbers not on file too. Lowers risk, so it never waits for approval',
    run: async (ctx, i) => {
      if (i.scope === 'campaign' && !i.scopeId) throw new Error('a campaign suppression needs scopeId');
      return addSuppression(ctx, i, i.reason, 'manual', { by: ctx.actor.type + ':' + (ctx.actor.id ?? '') }, i.scope ?? 'workspace', i.scopeId);
    },
  }));

  reg.register(tool(obj({ ...target, conversationId: opt(uuid()), campaignId: opt(uuid()), quote: opt(str({ max: 300 })) }), {
    name: 'contact.suppress_after_opt_out', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'The person said "don\'t call me" on a call: suppress voice workspace-wide at once (A3 for Vyakti itself) and append a consent withdrawal',
    run: async (ctx, i) => {
      const evidence = { conversationId: i.conversationId ?? null, campaignId: i.campaignId ?? null, quote: i.quote ?? null };
      const s = await addSuppression(ctx, i, 'opt_out', 'in_call', evidence);
      if (s.contactId) await ctx.q.query(`INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, evidence, granted)
        VALUES ($1,$2,'all','voice','withdrawal','in_call',$3,false)`, [ctx.workspaceId, s.contactId, JSON.stringify(evidence)]);
      return s;
    },
  }));

  reg.register(tool(obj({ suppressionId: uuid(), reason: str({ min: 5, max: 300 }) }), {
    name: 'contact.unsuppress', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Release a suppression so the person can be called again (Compliance or Owner approves)',
    describe: async (i, ctx) => `Release the suppression of ${await label(ctx, 'suppression', i.suppressionId)} so this person can be called again. Reason: ${i.reason}`,
    version: (ctx, i) => suppressionVersion(ctx.q, ctx.workspaceId, i.suppressionId),
    run: async (ctx, i) => {
      const s = await one<{ id: string; contact_id: string | null; e164_hash: string | null; reason: string; source: string | null; scope: string; created_at: Date }>(ctx.q,
        'SELECT id, contact_id, e164_hash, reason, source, scope, created_at FROM suppression WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.suppressionId, ctx.workspaceId]);
      if (!s) throw new Error('no such suppression in this workspace');
      if (s.e164_hash && await one(ctx.q, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = $2', [ctx.workspaceId, s.e164_hash])) {
        throw new Error('this person was erased; their suppression stays');
      }
      await ctx.q.query('DELETE FROM suppression WHERE id = $1 AND workspace_id = $2', [s.id, ctx.workspaceId]);
      await appendAudit(ctx.q, { workspaceId: ctx.workspaceId, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'suppression.released', objectType: 'suppression', objectId: s.id,
        payload: { contactId: s.contact_id, reason: s.reason, source: s.source, scope: s.scope, suppressedAt: s.created_at.toISOString(), releaseReason: i.reason } });
      return { released: s.id };
    },
  }));

  // ---- DND ----
  reg.register(tool(obj({ contactIds: opt(arr(uuid(), { min: 1, max: 5000 })), audienceId: opt(uuid()), olderThanHours: opt(num({ min: 0, max: 24 * 365 })) }), {
    name: 'contact.dnd_refresh', risk: 'draft', summary: 'Look up DND (NCPR) status for people and record it with the time checked; unknown answers stay unknown',
    run: async (ctx, i) => {
      if (!i.contactIds && !i.audienceId) throw new Error('give contactIds or audienceId');
      const params: unknown[] = [ctx.workspaceId];
      let where = 'c.workspace_id = $1 AND c.erased_at IS NULL';
      if (i.contactIds) { params.push(i.contactIds); where += ` AND c.id = ANY($${params.length}::uuid[])`; }
      if (i.audienceId) where += ' AND ' + await audienceWhere(ctx.q, ctx.workspaceId, { audienceId: i.audienceId }, params);
      if (i.olderThanHours !== undefined) { params.push(i.olderThanHours * 3600); where += ` AND (d.checked_at IS NULL OR d.checked_at < now() - make_interval(secs => $${params.length}))`; }
      const rows = await many<{ id: string; e164: string }>(ctx.q, `SELECT c.id, c.e164 FROM contact c LEFT JOIN dnd_status d ON d.contact_id = c.id WHERE ${where} LIMIT 50000`, params);
      const p = dndProvider();
      const tally: Record<string, number> = { registered: 0, not_registered: 0, unknown: 0 };
      for (let k = 0; k < rows.length; k += 1000) {
        const chunk = rows.slice(k, k + 1000);
        const ans = await p.check(chunk.map(r => r.e164));
        const st = chunk.map(r => ans.get(r.e164)?.status ?? 'unknown');
        st.forEach(s => { tally[s]++; });
        await ctx.q.query(`INSERT INTO dnd_status (contact_id, ncpr_status, checked_at) SELECT t.id, t.s, now() FROM unnest($1::uuid[], $2::text[]) AS t(id, s)
          ON CONFLICT (contact_id) DO UPDATE SET ncpr_status = EXCLUDED.ncpr_status, checked_at = EXCLUDED.checked_at`, [chunk.map(r => r.id), st]);
      }
      // provider stays the id (older callers read it); source says in plain words who answered and whether it is the real register.
      return { provider: p.name, source: dndSource(p), checked: rows.length, ...tally };
    },
  }));

  // ---- merge (A2) ----
  reg.register(tool(obj({ keepId: uuid(), mergeId: uuid() }), {
    name: 'contact.merge', risk: 'external', roles: ['owner', 'operator', 'compliance'],
    summary: 'Merge two records of the same person into one; the merged number becomes an identifier of the kept one (reversible for 30 days from the snapshot)',
    describe: async (i, ctx) => `Merge ${await label(ctx, 'contact', i.mergeId)} into ${await label(ctx, 'contact', i.keepId)}: one person, both numbers, the stronger value per field`,
    version: async (ctx, i) => {
      const r = await many<{ id: string; updated_at: Date }>(ctx.q, 'SELECT id, updated_at FROM contact WHERE workspace_id = $1 AND id = ANY($2::uuid[]) ORDER BY id', [ctx.workspaceId, [i.keepId, i.mergeId]]);
      return r.map(x => `${x.id}:${x.updated_at.toISOString()}`).join('|') || null;
    },
    run: async (ctx, i) => {
      if (i.keepId === i.mergeId) throw new Error('pick two different people');
      const k = await contactById(ctx.q, ctx.workspaceId, i.keepId, true);
      const m = await contactById(ctx.q, ctx.workspaceId, i.mergeId, true);
      if (k.erased_at || m.erased_at) throw new Error('an erased person cannot be merged');
      const ws = ctx.workspaceId;
      const mAttrs = await many<{ key: string; value: unknown; authority: Authority; observed_at: Date; max_age_s: number | null; source_id: string | null }>(ctx.q,
        'SELECT key, value, authority, observed_at, max_age_s, source_id FROM attribute WHERE contact_id = $1', [m.id]);
      const kAttrs = new Map((await many<{ key: string; value: unknown; authority: Authority; observed_at: Date; max_age_s: number | null; source_id: string | null }>(ctx.q,
        'SELECT key, value, authority, observed_at, max_age_s, source_id FROM attribute WHERE contact_id = $1', [k.id])).map(a => [a.key, a]));
      const ids = await many(ctx.q, 'SELECT raw, kind FROM contact_identifier WHERE contact_id = $1', [m.id]);
      const snapshot = { contact: m, attributes: mAttrs, identifiers: ids };
      const claim = (a: typeof mAttrs[number]): Claim => ({ value: a.value, authority: a.authority, observedAt: a.observed_at, maxAgeS: a.max_age_s, sourceId: a.source_id });
      let taken = 0, review = 0;
      for (const a of mAttrs) {
        const ex = kAttrs.get(a.key);
        const d = decide(a.key, ex ? claim(ex) : null, claim(a));
        if (d.take) {
          taken++;
          await ctx.q.query(`INSERT INTO attribute (contact_id, key, value, authority, max_age_s, source_id, observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (contact_id, key) DO UPDATE SET value = EXCLUDED.value, authority = EXCLUDED.authority, max_age_s = EXCLUDED.max_age_s, source_id = EXCLUDED.source_id, observed_at = EXCLUDED.observed_at`,
            [k.id, a.key, JSON.stringify(a.value), a.authority, a.max_age_s, a.source_id, a.observed_at]);
          if (['name', 'language', 'timezone'].includes(a.key) && typeof a.value === 'string') await ctx.q.query(`UPDATE contact SET ${a.key} = $2 WHERE id = $1`, [k.id, a.value]);
        } else if (d.why === 'conflict_review') {
          review++;
          await ctx.q.query('INSERT INTO intake_attribute_conflict (workspace_id, contact_id, key, kept, incoming) VALUES ($1,$2,$3,$4,$5)', [ws, k.id, a.key, JSON.stringify(ex), JSON.stringify(a)]);
        }
      }
      await ctx.q.query('UPDATE contact_identifier SET contact_id = $1 WHERE contact_id = $2', [k.id, m.id]);
      await ctx.q.query("INSERT INTO contact_identifier (contact_id, raw, kind) VALUES ($1,$2,'phone_e164')", [k.id, m.e164]);
      await ctx.q.query('INSERT INTO audience_member (audience_id, contact_id) SELECT audience_id, $1 FROM audience_member WHERE contact_id = $2 ON CONFLICT DO NOTHING', [k.id, m.id]);
      // The stricter DND view survives: internal DND on either record holds.
      await ctx.q.query('UPDATE dnd_status SET internal = true WHERE contact_id = $1 AND EXISTS (SELECT 1 FROM dnd_status WHERE contact_id = $2 AND internal)', [k.id, m.id]);
      // Every other table that points at a person (consent, suppression, calls, outcomes, memory, and later modules') moves to the kept record.
      const handled = new Set(['attribute', 'contact_identifier', 'audience_member', 'dnd_status', 'intake_merge', 'intake_attribute_conflict']);
      const fks = await many<{ tbl: string; col: string }>(ctx.q, `SELECT cl.relname AS tbl, a.attname AS col FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f' AND con.confrelid = 'contact'::regclass AND array_length(con.conkey, 1) = 1`);
      for (const f of fks) {
        if (handled.has(f.tbl)) continue;
        await ctx.q.query(`UPDATE ${quoteIdent(f.tbl)} SET ${quoteIdent(f.col)} = $1 WHERE ${quoteIdent(f.col)} = $2`, [k.id, m.id]);
      }
      await ctx.q.query('UPDATE intake_attribute_conflict SET contact_id = $1 WHERE contact_id = $2', [k.id, m.id]);
      const mg = await one<{ id: string }>(ctx.q, "INSERT INTO intake_merge (workspace_id, kept_id, merged_e164, snapshot, undo_until) VALUES ($1,$2,$3,$4, now() + interval '30 days') RETURNING id",
        [ws, k.id, m.e164, JSON.stringify(snapshot)]);
      await ctx.q.query('DELETE FROM contact WHERE id = $1 AND workspace_id = $2', [m.id, ws]);
      await ctx.q.query('UPDATE contact SET updated_at = now() WHERE id = $1', [k.id]);
      return { mergeId: mg!.id, keptId: k.id, attributesTaken: taken, conflictsForReview: review };
    },
  }));

  // ---- export (policy: PII leaves Vyakti) ----
  reg.register(tool(obj({ audienceId: opt(uuid()), keys: opt(arr(str({ pattern: /^[\p{L}\p{M}\p{N}_]{1,60}$/u, desc: 'a contact field key: letters, digits or underscore in any script, 1-60 characters' }), { max: 50 })), includeSuppressed: opt(bool()) }), {
    name: 'contact.export', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Export people as CSV (personal data leaves Vyakti; approved by Compliance or Owner, audited)',
    describe: async (i, ctx) => `Export ${i.audienceId ? 'the audience ' + ((await one<{ name: string }>(ctx.q, 'SELECT name FROM audience WHERE id = $1 AND workspace_id = $2', [i.audienceId, ctx.workspaceId]))?.name ?? 'this audience') : 'every contact'} as CSV${i.keys?.length ? ' with ' + i.keys.join(', ') : ''}${i.includeSuppressed ? ', including suppressed people' : ''}. Personal data leaves Vyakti.`,
    version: async (ctx, i) => i.audienceId ? (await one<{ v: string }>(ctx.q, 'SELECT md5(definition::text) AS v FROM audience WHERE id = $1 AND workspace_id = $2', [i.audienceId, ctx.workspaceId]))?.v ?? null : null,
    // The file goes to the approver's receipt only; the stored action keeps the count, not the personal data.
    redactResult: (out: { rows: number; csv: string }) => ({ rows: out.rows, csvBytes: Buffer.byteLength(out.csv), csv: '[delivered to the approver]' }),
    run: async (ctx, i): Promise<{ rows: number; csv: string }> => {
      const params: unknown[] = [ctx.workspaceId];
      let where = 'c.workspace_id = $1 AND c.erased_at IS NULL';
      if (i.audienceId) where += ' AND ' + await audienceWhere(ctx.q, ctx.workspaceId, { audienceId: i.audienceId }, params);
      if (!i.includeSuppressed) where += ` AND NOT EXISTS (SELECT 1 FROM suppression s WHERE ${SUPP_JOIN})`;
      const keys = i.keys ?? [];
      params.push(keys);
      const rows = await many<{ e164: string; name: string | null; language: string | null; suppressed: boolean; attrs: Record<string, unknown> | null }>(ctx.q,
        `SELECT c.e164, c.name, c.language, EXISTS (SELECT 1 FROM suppression s WHERE ${SUPP_JOIN}) AS suppressed,
          (SELECT jsonb_object_agg(a.key, a.value) FROM attribute a WHERE a.contact_id = c.id AND a.key = ANY($${params.length}::text[])) AS attrs
         FROM contact c WHERE ${where} ORDER BY c.e164 LIMIT 100000`, params);
      const header = ['phone', 'name', 'language', 'suppressed', ...keys];
      const lines = [header.map(csvCell).join(',')];
      // E.164 is validated digits after a +; every other cell is formula-escaped.
      for (const r of rows) lines.push([r.e164, csvCell(r.name), csvCell(r.language), r.suppressed ? 'yes' : 'no', ...keys.map(k => csvCell(r.attrs?.[k] ?? ''))].join(','));
      return { rows: rows.length, csv: lines.join('\r\n') + '\r\n' };
    },
  }));

  // ---- DPDP erasure (destructive, A2 by Owner) ----
  reg.register(tool(obj({
    ...target, scope: str({ oneOf: ['erase_me', 'forget_memory'] }), requestedBy: str({ oneOf: ['person', 'compliance', 'tenant'] }),
    evidence: str({ min: 3, max: 500 }), suppress: opt(bool()),
  }), {
    name: 'dpdp.request.execute', risk: 'destructive', roles: ['owner', 'compliance'],
    summary: 'Carry out a DPDP request: erase a person (data gone, tombstone and suppression kept so nothing can call them again) or forget their memory',
    describe: async (i, ctx) => i.scope === 'erase_me'
      ? `Erase ${i.contactId ? await label(ctx, 'contact', i.contactId) : 'the person with this number'}: personal data, attributes, aliases and memory are deleted; a tombstone and ${i.suppress === false ? 'existing' : 'a'} suppression stay. Cannot be undone.`
      : `Forget the memory Vyakti holds about ${i.contactId ? await label(ctx, 'contact', i.contactId) : 'this person'}. Their record and consent history stay.`,
    version: async (ctx, i) => {
      const r = await resolve(ctx.q, ctx.workspaceId, i).catch(() => null);
      return r?.contact ? `${r.contact.id}:${r.contact.updated_at.toISOString()}` : null;
    },
    run: async (ctx, i) => {
      const ws = ctx.workspaceId;
      const r = await resolve(ctx.q, ws, i);
      const surfaces: Record<string, number | string> = {};
      const now = new Date();
      if (i.scope === 'forget_memory') {
        if (!r.contact) throw new Error('no such person on file');
        surfaces.memory_facts = (await forgetContactMemory(ctx.q, ws, r.contact.id)).facts;
      } else {
        const c = r.contact;
        const numbers = new Set<string>();
        if (r.e164) numbers.add(r.e164);
        if (c) {
          numbers.add(c.e164);
          for (const x of await many<{ raw: string }>(ctx.q, "SELECT raw FROM contact_identifier WHERE contact_id = $1 AND kind = 'phone_e164'", [c.id])) numbers.add(x.raw);
        }
        const salt = await workspaceSalt(ctx.q, ws);
        const hashes = [...numbers].filter(n => n.startsWith('+')).map(n => hashWith(salt, n));
        for (const h of hashes) await ctx.q.query('INSERT INTO tombstone (workspace_id, e164_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ws, h]);
        surfaces.tombstones = hashes.length;
        // Suppressions stay, matchable by hash only.
        for (const n of numbers) {
          const h = hashWith(salt, n);
          await ctx.q.query('UPDATE suppression SET e164_hash = $3, e164 = NULL WHERE workspace_id = $1 AND (e164 = $2 OR ($4::uuid IS NOT NULL AND contact_id = $4))', [ws, n, h, c?.id ?? null]);
        }
        if (i.suppress !== false) {
          const has = await one(ctx.q, `SELECT 1 FROM suppression WHERE workspace_id = $1 AND scope = 'workspace' AND (e164_hash = ANY($2::text[]) OR ($3::uuid IS NOT NULL AND contact_id = $3))`, [ws, hashes, c?.id ?? null]);
          if (!has) await ctx.q.query(`INSERT INTO suppression (workspace_id, contact_id, e164, e164_hash, scope, reason, source, evidence) VALUES ($1,$2,NULL,$3,'workspace','erased','dpdp',$4)`,
            [ws, c?.id ?? null, hashes[0], JSON.stringify({ requestedBy: i.requestedBy })]);
        }
        if (c) {
          surfaces.attributes = (await ctx.q.query('DELETE FROM attribute WHERE contact_id = $1', [c.id])).rowCount ?? 0;
          surfaces.identifiers = (await ctx.q.query('DELETE FROM contact_identifier WHERE contact_id = $1', [c.id])).rowCount ?? 0;
          surfaces.audiences = (await ctx.q.query('DELETE FROM audience_member WHERE contact_id = $1', [c.id])).rowCount ?? 0;
          surfaces.conflicts = (await ctx.q.query('DELETE FROM intake_attribute_conflict WHERE contact_id = $1', [c.id])).rowCount ?? 0;
          surfaces.memory_facts = (await forgetContactMemory(ctx.q, ws, c.id)).facts;
          surfaces.attempts_cancelled = (await cancelContactAttempts(ctx.q, ws, c.id, 'erased')).cancelled;
          surfaces.merge_snapshots = (await ctx.q.query('DELETE FROM intake_merge WHERE workspace_id = $1 AND kept_id = $2', [ws, c.id])).rowCount ?? 0;
          await ctx.q.query('DELETE FROM dnd_status WHERE contact_id = $1', [c.id]);
          await ctx.q.query(`UPDATE contact SET e164 = 'erased:' || id::text, name = NULL, language = NULL, custom = '{}'::jsonb, erased_at = now(), updated_at = now()
            WHERE id = $1 AND workspace_id = $2`, [c.id, ws]);
          surfaces.contact = 'erased_in_place';
        }
        // Conversations, transcripts and recordings belong to the calls module; it is told by the forget_request row.
        surfaces.pending = 'transcripts and recordings (calls module), CRM delete (outbox)';
      }
      const receipt = { scope: i.scope, requestedBy: i.requestedBy, evidence: i.evidence, surfaces, at: now.toISOString() };
      const fr = await one<{ id: string }>(ctx.q, "INSERT INTO forget_request (workspace_id, contact_id, status, receipt, done_at) VALUES ($1,$2,'done',$3, now()) RETURNING id",
        [ws, r.contact?.id ?? null, JSON.stringify(receipt)]);
      return { forgetRequestId: fr!.id, ...receipt };
    },
  }));
}

function quoteIdent(s: string): string { return '"' + s.replace(/"/g, '""') + '"'; }
