// The one write path for people: file commits and webhook events both land here. Set-based, in chunks,
// inside the caller's transaction, so a 50k-row file is one atomic import.
//   identity:     exact E.164 (contact.e164 or a merged phone identifier); no fuzzy merge
//   tombstones:   an erased person's number is refused, never re-created
//   suppression:  never cleared here; an opt-out column or event adds one
//   attributes:   decide() per key by authority and freshness; equal authority from another source -> review
//   consent:      appended, never updated
import { normaliseIndianPhone, type PhoneReason } from '../../../shared/phone.ts';
import { many, one, type Queryable } from '../../db.ts';
import { decide, type Authority, type Claim } from './authority.ts';
import { hashWith, workspaceSalt } from '../../identity.ts';

export interface InRow {
  row: number;                                  // 1-based position in the file or event
  phone: string;                                // as given
  attrs: Record<string, unknown>;               // includes name, language, timezone when present
  consent?: { granted: boolean; at?: string; purpose?: string; basis?: string; channel?: string }[];
  optOut?: boolean;
  observedAt?: Date;
}

export interface SourceRef { id: string; authority: Authority; maxAgeS: number | null; label: string }

export interface ApplyOpts {
  source: SourceRef;
  receiptId?: string | null;
  consentPurpose?: string;                      // purpose for consent columns in a file
  audienceId?: string;
  now?: Date;
}

export type RowCode = 'new' | 'updated' | 'unchanged' | 'duplicate_in_file' | 'tombstoned' | PhoneReason;
export interface Issue { row: number; code: RowCode | 'suppressed' | 'conflict_review' | 'consent_without_purpose'; detail?: string }

export interface ApplyResult {
  counts: Record<string, number>;
  issues: Issue[];                              // capped at ISSUE_CAP; counts are exact
  contactIds: string[];
}

const CHUNK = 2000;
const ISSUE_CAP = 1000;
const MIRROR = ['name', 'language', 'timezone'] as const;

// One fingerprint for numbers everywhere (tombstones, hash-only suppressions): the kernel's server/identity.ts.
export { workspaceSalt, hashWith, numberHash as e164Hash } from '../../identity.ts';

interface Merged { e164: string; raws: Set<string>; first: number; rows: number[]; attrs: Record<string, unknown>; consent: NonNullable<InRow['consent']>; optOut: boolean; observedAt?: Date }

export async function applyRows(q: Queryable, ws: string, rows: InRow[], o: ApplyOpts): Promise<ApplyResult> {
  const now = o.now ?? new Date();
  const counts: Record<string, number> = { rows: rows.length, new: 0, updated: 0, unchanged: 0, duplicate_in_file: 0, tombstoned: 0, suppressed: 0,
    rejected: 0, conflict_review: 0, kept_more_authoritative: 0, kept_newer: 0, consent_rows: 0, opt_outs: 0 };
  const issues: Issue[] = [];
  const issue = (i: Issue) => { if (issues.length < ISSUE_CAP) issues.push(i); };
  const bump = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };

  // 1. Normalise and fold duplicates within the input (later rows win per key, as the newer statement).
  const byE164 = new Map<string, Merged>();
  for (const r of rows) {
    const p = normaliseIndianPhone(r.phone);
    if (!p.ok) { bump('rejected'); bump('reason_' + p.reason); issue({ row: r.row, code: p.reason }); continue; }
    const m = byE164.get(p.e164);
    if (m) {
      bump('duplicate_in_file'); issue({ row: r.row, code: 'duplicate_in_file', detail: `same number as row ${m.first}` });
      Object.assign(m.attrs, r.attrs); m.rows.push(r.row); m.raws.add(r.phone.trim());
      if (r.consent) m.consent.push(...r.consent);
      m.optOut ||= !!r.optOut;
      if (r.observedAt && (!m.observedAt || r.observedAt > m.observedAt)) m.observedAt = r.observedAt;
    } else {
      byE164.set(p.e164, { e164: p.e164, raws: new Set([r.phone.trim()]), first: r.row, rows: [r.row], attrs: { ...r.attrs }, consent: [...(r.consent ?? [])], optOut: !!r.optOut, observedAt: r.observedAt });
    }
  }

  const salt = await workspaceSalt(q, ws);
  const contactIds: string[] = [];
  const all = [...byE164.values()];
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const hashOf = new Map(chunk.map(m => [m.e164, hashWith(salt, m.e164)]));

    // 2. Tombstones: an erased person is never re-created.
    const dead = new Set((await many<{ e164_hash: string }>(q, 'SELECT e164_hash FROM tombstone WHERE workspace_id = $1 AND e164_hash = ANY($2::text[])',
      [ws, [...hashOf.values()]])).map(r => r.e164_hash));
    const live = chunk.filter(m => {
      if (!dead.has(hashOf.get(m.e164)!)) return true;
      bump('tombstoned'); issue({ row: m.first, code: 'tombstoned', detail: 'this person asked to be erased; not imported' });
      return false;
    });
    if (!live.length) continue;
    const nums = live.map(m => m.e164);

    // 3. Identity: existing contact by E.164, or by a phone identifier left by a merge.
    const idOf = new Map<string, string>();
    for (const r of await many<{ id: string; e164: string }>(q, 'SELECT id, e164 FROM contact WHERE workspace_id = $1 AND e164 = ANY($2::text[]) AND erased_at IS NULL', [ws, nums])) idOf.set(r.e164, r.id);
    for (const r of await many<{ id: string; raw: string }>(q, `SELECT c.id, ci.raw FROM contact_identifier ci JOIN contact c ON c.id = ci.contact_id
        WHERE c.workspace_id = $1 AND ci.kind = 'phone_e164' AND ci.raw = ANY($2::text[]) AND c.erased_at IS NULL`, [ws, nums])) if (!idOf.has(r.raw)) idOf.set(r.raw, r.id);
    const fresh = nums.filter(e => !idOf.has(e));
    const isNew = new Set<string>();
    if (fresh.length) {
      for (const r of await many<{ id: string; e164: string }>(q, `INSERT INTO contact (workspace_id, e164) SELECT $1, unnest($2::text[])
          ON CONFLICT (workspace_id, e164) DO NOTHING RETURNING id, e164`, [ws, fresh])) { idOf.set(r.e164, r.id); isNew.add(r.e164); }
      // Lost a race with a concurrent import: read the winner.
      const missing = fresh.filter(e => !idOf.has(e));
      if (missing.length) for (const r of await many<{ id: string; e164: string }>(q, 'SELECT id, e164 FROM contact WHERE workspace_id = $1 AND e164 = ANY($2::text[])', [ws, missing])) idOf.set(r.e164, r.id);
      await q.query("INSERT INTO dnd_status (contact_id, ncpr_status) SELECT unnest($1::uuid[]), 'unknown' ON CONFLICT DO NOTHING", [[...isNew].map(e => idOf.get(e)!)]);
    }
    const ids = live.map(m => idOf.get(m.e164)!);
    contactIds.push(...ids);

    // Aliases: other spellings of the number, kept for search and support.
    const alias: [string, string][] = [];
    for (const m of live) for (const raw of m.raws) if (raw && raw !== m.e164) alias.push([idOf.get(m.e164)!, raw.slice(0, 64)]);
    if (alias.length) await q.query(`INSERT INTO contact_identifier (contact_id, raw, kind)
        SELECT t.cid, t.raw, 'phone' FROM unnest($1::uuid[], $2::text[]) AS t(cid, raw)
        WHERE NOT EXISTS (SELECT 1 FROM contact_identifier x WHERE x.contact_id = t.cid AND x.raw = t.raw)`, [alias.map(a => a[0]), alias.map(a => a[1])]);

    // 4. Attributes by authority and freshness.
    const keys = [...new Set(live.flatMap(m => Object.keys(m.attrs)))];
    const existing = new Map<string, Claim>();
    if (keys.length) for (const r of await many<{ contact_id: string; key: string; value: unknown; authority: Authority; observed_at: Date; max_age_s: number | null; source_id: string | null }>(q,
      'SELECT contact_id, key, value, authority, observed_at, max_age_s, source_id FROM attribute WHERE contact_id = ANY($1::uuid[]) AND key = ANY($2::text[])', [ids, keys])) {
      existing.set(r.contact_id + '\u0000' + r.key, { value: r.value, authority: r.authority, observedAt: r.observed_at, maxAgeS: r.max_age_s, sourceId: r.source_id });
    }
    const up = { cid: [] as string[], key: [] as string[], val: [] as string[], at: [] as string[] };
    const conflicts = { cid: [] as string[], key: [] as string[], kept: [] as string[], inc: [] as string[] };
    const mirror = new Map<string, Partial<Record<(typeof MIRROR)[number], string>>>();
    for (const m of live) {
      const cid = idOf.get(m.e164)!;
      const observedAt = m.observedAt ?? now;
      let changed = false;
      for (const [key, value] of Object.entries(m.attrs)) {
        if (value === undefined || value === null || value === '') continue;
        const inc: Claim = { value, authority: o.source.authority, observedAt, maxAgeS: o.source.maxAgeS, sourceId: o.source.id };
        const ex = existing.get(cid + '\u0000' + key) ?? null;
        const d = decide(key, ex, inc, now);
        if (d.take) {
          up.cid.push(cid); up.key.push(key); up.val.push(JSON.stringify(value)); up.at.push(observedAt.toISOString());
          existing.set(cid + '\u0000' + key, inc);
          changed = true;
          if ((MIRROR as readonly string[]).includes(key) && typeof value === 'string') mirror.set(cid, { ...mirror.get(cid), [key]: value });
        } else if (d.why === 'conflict_review') {
          bump('conflict_review'); issue({ row: m.first, code: 'conflict_review', detail: key });
          conflicts.cid.push(cid); conflicts.key.push(key); conflicts.kept.push(JSON.stringify(ex)); conflicts.inc.push(JSON.stringify({ ...inc, value }));
        } else if (d.why !== 'same_value') bump(d.why);
      }
      bump(isNew.has(m.e164) ? 'new' : changed ? 'updated' : 'unchanged');
    }
    if (up.cid.length) await q.query(`INSERT INTO attribute (contact_id, key, value, authority, max_age_s, source_id, observed_at)
        SELECT t.cid, t.key, t.val, $5, $6, $7, t.at FROM unnest($1::uuid[], $2::text[], $3::jsonb[], $4::timestamptz[]) AS t(cid, key, val, at)
        ON CONFLICT (contact_id, key) DO UPDATE SET value = EXCLUDED.value, authority = EXCLUDED.authority, max_age_s = EXCLUDED.max_age_s,
          source_id = EXCLUDED.source_id, observed_at = EXCLUDED.observed_at`,
      [up.cid, up.key, up.val, up.at, o.source.authority, o.source.maxAgeS, o.source.id]);
    if (conflicts.cid.length) await q.query(`INSERT INTO intake_attribute_conflict (workspace_id, contact_id, key, kept, incoming)
        SELECT $1, t.cid, t.key, t.kept, t.inc FROM unnest($2::uuid[], $3::text[], $4::jsonb[], $5::jsonb[]) AS t(cid, key, kept, inc)`,
      [ws, conflicts.cid, conflicts.key, conflicts.kept, conflicts.inc]);
    // Winning name, language and timezone are mirrored onto the contact row, in one statement.
    if (mirror.size) {
      const m = [...mirror.entries()];
      await q.query(`UPDATE contact c SET name = coalesce(t.n, c.name), language = coalesce(t.l, c.language), timezone = coalesce(t.z, c.timezone), updated_at = now()
          FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) AS t(cid, n, l, z) WHERE c.id = t.cid AND c.workspace_id = $5`,
        [m.map(e => e[0]), m.map(e => e[1].name ?? null), m.map(e => e[1].language ?? null), m.map(e => e[1].timezone ?? null), ws]);
    }

    // 5. Consent is appended with its evidence; a consent value without a purpose is not consent.
    const cons = { cid: [] as string[], purpose: [] as string[], channel: [] as string[], basis: [] as string[], granted: [] as boolean[], ev: [] as string[] };
    for (const m of live) for (const c of m.consent) {
      const purpose = c.purpose ?? o.consentPurpose;
      if (!purpose) { bump('consent_without_purpose'); issue({ row: m.first, code: 'consent_without_purpose' }); continue; }
      cons.cid.push(idOf.get(m.e164)!); cons.purpose.push(purpose); cons.channel.push(c.channel ?? 'voice'); cons.basis.push(c.basis ?? 'consent');
      cons.granted.push(c.granted); cons.ev.push(JSON.stringify({ source: o.source.label, receiptId: o.receiptId ?? null, rows: m.rows.slice(0, 5), statedAt: c.at ?? null }));
    }
    if (cons.cid.length) {
      await q.query(`INSERT INTO consent_record (workspace_id, contact_id, purpose, channel, basis, source, evidence, granted)
          SELECT $1, t.cid, t.p, t.ch, t.b, $2, t.ev, t.g FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[], $7::jsonb[], $8::boolean[]) AS t(cid, p, ch, b, ev, g)`,
        [ws, o.source.label, cons.cid, cons.purpose, cons.channel, cons.basis, cons.ev, cons.granted]);
      bump('consent_rows', cons.cid.length);
    }

    // 6. Opt-outs add a workspace suppression; nothing here removes one.
    const outs = live.filter(m => m.optOut);
    if (outs.length) {
      const r = await q.query(`INSERT INTO suppression (workspace_id, contact_id, e164, e164_hash, scope, reason, source)
          SELECT $1, t.cid, t.e, t.h, 'workspace', 'opt_out', $2 FROM unnest($3::uuid[], $4::text[], $5::text[]) AS t(cid, e, h)
          WHERE NOT EXISTS (SELECT 1 FROM suppression s WHERE s.workspace_id = $1 AND s.scope = 'workspace' AND (s.contact_id = t.cid OR s.e164 = t.e))`,
        [ws, o.source.label, outs.map(m => idOf.get(m.e164)!), outs.map(m => m.e164), outs.map(m => hashOf.get(m.e164)!)]);
      bump('opt_outs', r.rowCount ?? 0);
    }
    const supp = new Set((await many<{ contact_id: string }>(q, `SELECT DISTINCT c.id AS contact_id FROM contact c JOIN suppression s ON s.workspace_id = c.workspace_id
        AND s.scope = 'workspace' AND (s.contact_id = c.id OR s.e164 = c.e164) WHERE c.workspace_id = $1 AND c.id = ANY($2::uuid[])`, [ws, ids])).map(r => r.contact_id));
    for (const m of live) if (supp.has(idOf.get(m.e164)!)) { bump('suppressed'); issue({ row: m.first, code: 'suppressed', detail: 'kept, never called' }); }

    if (o.audienceId) await q.query('INSERT INTO audience_member (audience_id, contact_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [o.audienceId, ids]);
  }
  return { counts, issues, contactIds };
}
