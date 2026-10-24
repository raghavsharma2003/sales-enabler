// Audit export: the hash-chained activity ledger as CSV or JSON lines, for a date range and filters, signed.
//   audit.export is an A2 policy action: an owner or compliance member asks, an owner or compliance member approves, and
//   the approval itself is in the ledger. The file is held for 24 hours and each download is audited too.
//   Signed: sha256 of the exact bytes, and an HMAC over (export id, workspace, sha256) under a key derived from
//   VP_SECRET_KEY, so Vyakti can later confirm a file is the one it produced (audit.export.verify). Each row also
//   carries its chain hash and previous hash, so a reader can re-walk the chain inside the file.
//   CSV cells that a spreadsheet would run as a formula (starting =, +, -, @, tab or carriage return) get a leading
//   apostrophe, so opening an export never executes anything an actor typed.
// Retention: rows older than the workspace's audit_logs_days (policy.retention.get; never less than 90 days here) are
// purged nightly; audit_anchor keeps the last purged hash so verification still holds (server/audit.ts).
import type pg from 'pg';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Router } from '../../http.ts';
import { HttpError } from '../../http.ts';
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one, tx } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import type { Job } from '../../jobs.ts';
import { bool, obj, opt, str } from '../../../shared/validate.ts';
import { uuid } from '../../../shared/validate.ts';
import { secretKey, sha256 } from './crypto.ts';
import { retentionPolicy } from '../intake/retention.ts';

export const AUDIT_FLOOR_DAYS = 90;
const MAX_ROWS = 200_000, MAX_RANGE_DAYS = 366, HOLD_MS = 24 * 3600_000;
const A2_RISKS = new Set(['external', 'spend', 'destructive', 'policy']);
/** Actions that are privileged whatever their payload says: identity, access, keys, exports, approvals, money. */
const PRIVILEGED = /^(sso|scim|auth|member|apikey|secret|audit|policy|action|wallet|money|billing|integration|webhook)\./;

export function isPrivileged(action: string, payload: Record<string, unknown> | null): boolean {
  return PRIVILEGED.test(action) || payload?.mode === 'A2' || A2_RISKS.has(String(payload?.risk ?? ''));
}

/** A spreadsheet runs a cell starting with one of these as a formula (OWASP CSV injection); prefix an apostrophe. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportKey(): Buffer { return createHmac('sha256', secretKey()).update('vp-audit-export-v1').digest(); }
export function signExport(exportId: string, workspaceId: string, digest: string): string {
  return createHmac('sha256', exportKey()).update(`${exportId}\n${workspaceId}\n${digest}`).digest('hex');
}

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/;
/** A bare date is a whole day in India time: from 00:00 IST, and `to` runs through the end of that day. */
function parseBound(s: string, end: boolean): Date {
  const d = s.length === 10 ? new Date(`${s}T00:00:00+05:30`) : new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${s}`);
  return s.length === 10 && end ? new Date(d.getTime() + 24 * 3600_000) : d;
}

const COLUMNS = ['at', 'id', 'actor_type', 'actor_id', 'actor_name', 'action', 'privileged', 'risk', 'mode', 'approver_role', 'object_type', 'object_id',
  'subject_type', 'subject_id', 'args_hash', 'prev_hash', 'hash', 'payload'] as const;

const exportInput = obj({
  format: str({ oneOf: ['csv', 'jsonl'] as const }),
  from: str({ pattern: DATE, desc: 'YYYY-MM-DD (India time) or an ISO timestamp' }),
  to: str({ pattern: DATE, desc: 'YYYY-MM-DD (inclusive, India time) or an ISO timestamp' }),
  actionPrefix: opt(str({ max: 60, pattern: /^[a-z0-9_.]+$/ })),
  actorId: opt(str({ max: 80 })),
  privilegedOnly: opt(bool()),
});

type Row = { id: string; t: string; actor_type: string; actor_id: string | null; action: string; object_type: string | null; object_id: string | null;
  args_hash: string | null; payload: Record<string, unknown>; prev_hash: string | null; hash: string | null };

export function registerAuditExport(r: Registry) {
  r.register(tool(exportInput, {
    name: 'audit.export', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Export the activity ledger for a date range as a signed CSV or JSON-lines file',
    describe: i => `Export the activity ledger from ${i.from} to ${i.to} as ${i.format === 'csv' ? 'CSV' : 'JSON lines'}${i.privilegedOnly ? ', privileged actions only' : ''}${i.actionPrefix ? `, actions starting "${i.actionPrefix}"` : ''}${i.actorId ? ', one actor' : ''}`,
    run: async (ctx, i) => {
      const from = parseBound(i.from, false), to = parseBound(i.to, true);
      if (to <= from) throw new Error('the end of the range must be after its start');
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new Error(`export at most ${MAX_RANGE_DAYS} days at a time`);
      const { policy } = await retentionPolicy(ctx.q, ctx.workspaceId);
      const keepDays = Math.max(AUDIT_FLOOR_DAYS, policy.audit_logs_days);
      const rows = await many<Row>(ctx.q, `SELECT id, to_char(created_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t, actor_type, actor_id, action, object_type,
          object_id, args_hash, payload, prev_hash, hash
        FROM audit_event WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3 AND created_at >= now() - make_interval(days => $4)
          AND ($5::text IS NULL OR action LIKE $5 || '%') AND ($6::text IS NULL OR actor_id = $6)
        ORDER BY created_at, id LIMIT $7`, [ctx.workspaceId, from, to, keepDays, i.actionPrefix ?? null, i.actorId ?? null, MAX_ROWS + 1]);
      if (rows.length > MAX_ROWS) throw new Error(`more than ${MAX_ROWS} rows; narrow the range or the filters`);
      const kept = i.privilegedOnly ? rows.filter(x => isPrivileged(x.action, x.payload)) : rows;

      const memberIds = [...new Set(kept.map(x => x.actor_id).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
      const names = new Map((await many<{ id: string; n: string }>(ctx.q, 'SELECT id, coalesce(name, email) AS n FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, memberIds])).map(m => [m.id, m.n]));
      const keyIds = [...new Set(kept.map(x => x.actor_id).filter((x): x is string => !!x?.startsWith('key:')).map(x => x.slice(4)))];
      for (const k of await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM api_key WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, keyIds])) names.set('key:' + k.id, `API key ${k.name}`);
      const scimIds = [...new Set(kept.map(x => x.actor_id).filter((x): x is string => !!x?.startsWith('scim:')).map(x => x.slice(5)))];
      for (const k of await many<{ id: string; name: string }>(ctx.q, 'SELECT id, name FROM scim_token WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [ctx.workspaceId, scimIds])) names.set('scim:' + k.id, `provisioning token ${k.name}`);

      const records = kept.map(x => {
        const subject = x.payload?.subject as { type?: string; id?: string } | undefined;
        return { at: x.t, id: x.id, actor_type: x.actor_type, actor_id: x.actor_id, actor_name: x.actor_id ? names.get(x.actor_id) ?? null : null, action: x.action,
          privileged: isPrivileged(x.action, x.payload), risk: (x.payload?.risk as string) ?? null, mode: (x.payload?.mode as string) ?? null,
          approver_role: (x.payload?.approverRole as string) ?? null, object_type: x.object_type, object_id: x.object_id,
          subject_type: subject?.type ?? null, subject_id: subject?.id ?? null, args_hash: x.args_hash, prev_hash: x.prev_hash, hash: x.hash, payload: x.payload ?? {} };
      });
      const content = i.format === 'csv'
        ? [COLUMNS.join(','), ...records.map(rec => COLUMNS.map(c => csvCell(rec[c])).join(','))].join('\r\n') + '\r\n'
        : records.map(rec => JSON.stringify(rec)).join('\n') + (records.length ? '\n' : '');
      const digest = sha256(content);
      const filters = { from: from.toISOString(), to: to.toISOString(), actionPrefix: i.actionPrefix ?? null, actorId: i.actorId ?? null, privilegedOnly: !!i.privilegedOnly, retainedDays: keepDays };
      const row = await one<{ id: string; expires_at: Date }>(ctx.q,
        `INSERT INTO audit_export (workspace_id, format, filters, row_count, sha256, signature, content, requested_by, approved_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,'',$6,$7,$8, now() + ($9 || ' milliseconds')::interval) RETURNING id, expires_at`,
        [ctx.workspaceId, i.format, filters, records.length, digest, content, ctx.actor.id ?? ctx.actor.type, /^[0-9a-f-]{36}$/i.test(ctx.actor.id ?? '') ? ctx.actor.id : null, String(HOLD_MS)]);
      const signature = signExport(row!.id, ctx.workspaceId, digest);
      await ctx.q.query('UPDATE audit_export SET signature = $2 WHERE id = $1', [row!.id, signature]);
      return { exportId: row!.id, format: i.format, rows: records.length, sha256: digest, signature, expiresAt: row!.expires_at, download: `/v1/audit/exports/${row!.id}`, filters };
    },
  }));

  r.register(tool(obj({}), {
    name: 'audit.export.list', risk: 'read', roles: ['owner', 'compliance'], summary: 'List recent audit exports: range, rows, checksum and whether the file can still be downloaded',
    run: async ctx => ({
      exports: await many(ctx.q, `SELECT id, format, filters, row_count AS rows, sha256, signature, requested_by AS "requestedBy", approved_by AS "approvedBy",
          created_at AS "createdAt", expires_at AS "expiresAt", (content IS NOT NULL AND expires_at > now()) AS downloadable
        FROM audit_export WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`, [ctx.workspaceId]),
    }),
  }));

  r.register(tool(obj({ exportId: uuid(), sha256: str({ pattern: /^[0-9a-f]{64}$/ }), signature: str({ pattern: /^[0-9a-f]{64}$/ }) }), {
    name: 'audit.export.verify', risk: 'read', summary: 'Check that an audit export file\'s checksum and signature are the ones Vyakti produced',
    run: async (ctx, i) => {
      const row = await one<{ sha256: string }>(ctx.q, 'SELECT sha256 FROM audit_export WHERE id = $1 AND workspace_id = $2', [i.exportId, ctx.workspaceId]);
      // The signature is checked against the checksum Vyakti recorded, so "the file changed" (checksumMatches false) and
      // "the signature is not ours" (signatureOk false) are told apart.
      const want = Buffer.from(signExport(i.exportId, ctx.workspaceId, row?.sha256 ?? i.sha256), 'hex'), got = Buffer.from(i.signature, 'hex');
      const signatureOk = !!row && want.length === got.length && timingSafeEqual(want, got);
      const checksumMatches = row?.sha256 === i.sha256;
      return { valid: signatureOk && checksumMatches, known: !!row, signatureOk, checksumMatches };
    },
  }));
}

export function auditExportRoutes(router: Router, pool: pg.Pool, auth: (req: import('../../http.ts').Req) => Promise<import('../../auth.ts').Caller>) {
  // The file itself. A signed-in owner or compliance member only (not an API key); every download is in the ledger.
  router.add('GET', '/v1/audit/exports/:id', async req => {
    const c = await auth(req);
    if (c.via === 'key' || !c.memberId) throw new HttpError(403, 'human_only', 'audit exports are downloaded by a signed-in person');
    if (c.actor.role !== 'owner' && c.actor.role !== 'compliance') throw new HttpError(403, 'forbidden', 'only an owner or compliance member can download audit exports');
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'not_found', 'no such export');
    const row = await tx(pool, async q => {
      const x = await one<{ format: string; content: string | null; sha256: string; signature: string; expires_at: Date; created_at: Date }>(q,
        'SELECT format, content, sha256, signature, expires_at, created_at FROM audit_export WHERE id = $1 AND workspace_id = $2', [req.params.id, c.workspaceId]);
      if (!x) throw new HttpError(404, 'not_found', 'no such export');
      if (!x.content || x.expires_at.getTime() < Date.now()) throw new HttpError(410, 'expired', 'this export is no longer held; export again');
      await appendAudit(q, { workspaceId: c.workspaceId, actorType: 'member', actorId: c.memberId, action: 'audit.export.download', payload: { exportId: req.params.id, sha256: x.sha256 } });
      return x;
    });
    const day = row.created_at.toISOString().slice(0, 10);
    return { raw: row.content!, headers: {
      'content-type': row.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="vyakti-audit-${day}-${req.params.id.slice(0, 8)}.${row.format === 'csv' ? 'csv' : 'jsonl'}"`,
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-vp-export-sha256': row.sha256, 'x-vp-export-signature': row.signature } };
  });
}

/** Purge one workspace's audit rows past retention (never under AUDIT_FLOOR_DAYS), keeping the chain verifiable. */
export async function applyAuditRetention(c: pg.PoolClient, ws: string): Promise<{ purged: number }> {
  const { policy } = await retentionPolicy(c, ws);
  const days = Math.max(AUDIT_FLOOR_DAYS, policy.audit_logs_days);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['audit:' + ws]);
  const last = await one<{ id: string; hash: string; created_at: Date }>(c,
    `SELECT id, hash, created_at FROM audit_event WHERE workspace_id = $1 AND created_at < now() - make_interval(days => $2) ORDER BY created_at DESC, id DESC LIMIT 1`, [ws, days]);
  if (!last) return { purged: 0 };
  // Compare timestamps inside Postgres: a JS Date keeps milliseconds, created_at keeps microseconds.
  const del = await c.query(`DELETE FROM audit_event WHERE workspace_id = $1
    AND (created_at, id) <= (SELECT created_at, id FROM audit_event WHERE id = $2)`, [ws, last.id]);
  const n = del.rowCount ?? 0;
  await c.query(`INSERT INTO audit_anchor (workspace_id, last_hash, purged_through, purged_rows) VALUES ($1,$2,$3,$4)
    ON CONFLICT (workspace_id) DO UPDATE SET last_hash = $2, purged_through = $3, purged_rows = audit_anchor.purged_rows + $4, updated_at = now()`, [ws, last.hash, last.created_at, n]);
  await appendAudit(c, { workspaceId: ws, actorType: 'system', action: 'audit.retention.applied', payload: { purged: n, through: last.created_at.toISOString(), retainedDays: days } });
  return { purged: n };
}

export const auditRetentionJob: Job = {
  name: 'workspace.audit_retention',
  dailyAtIst: '03:40',
  async run(deps) {
    await deps.pool.query("UPDATE audit_export SET content = NULL WHERE content IS NOT NULL AND expires_at < now()");
    await deps.pool.query("DELETE FROM sso_login WHERE expires_at < now() - interval '1 day'");
    for (const w of await many<{ id: string }>(deps.pool, 'SELECT id FROM workspace')) await tx(deps.pool, c => applyAuditRetention(c, w.id));
  },
};
