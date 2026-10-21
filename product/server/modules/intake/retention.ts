// Retention of contact data, per workspace and versioned. Defaults from the memory-omni blueprint (§7). Intake purges
// what it owns (uploaded file text, the row issues in import receipts); recordings, transcripts and memory belong to
// the calls and memory modules, which read policy.retention.get. Consent, suppression and tombstones are kept always.
import { num, obj, opt, str } from '../../../shared/validate.ts';
import { many, one, type Queryable } from '../../db.ts';
import { appendAudit } from '../../audit.ts';
import { tool, type Registry } from '../../tools.ts';
import type { Job } from '../../jobs.ts';

export const RETENTION_DEFAULTS = {
  upload_files_days: 30,        // raw CSV text after import; the receipt (counts, hashes) stays
  receipt_issues_days: 180,     // per-row reasons inside receipts
  recordings_days: 90,
  transcripts_days: 180,
  audit_logs_days: 365,
} as const;
export type RetentionPolicy = { [K in keyof typeof RETENTION_DEFAULTS]: number };
const ALWAYS_KEPT = ['consent', 'suppression', 'tombstones', 'aggregates'];

const days = opt(num({ int: true, min: 1, max: 3650 }));

export async function retentionPolicy(q: Queryable, ws: string): Promise<{ version: number; policy: RetentionPolicy }> {
  const r = await one<{ version: number; policy: RetentionPolicy }>(q, 'SELECT version, policy FROM intake_retention_policy WHERE workspace_id = $1 ORDER BY version DESC LIMIT 1', [ws]);
  return r ? { version: r.version, policy: { ...RETENTION_DEFAULTS, ...r.policy } } : { version: 0, policy: { ...RETENTION_DEFAULTS } };
}

/** Apply intake's own retention for one workspace. Returns what was purged. */
export async function applyRetention(q: Queryable, ws: string): Promise<{ uploads: number; receipts: number }> {
  const { policy } = await retentionPolicy(q, ws);
  const u = await q.query(`UPDATE intake_upload SET content = '', status = CASE WHEN status = 'receiving' THEN 'received' ELSE status END
    WHERE workspace_id = $1 AND content <> '' AND created_at < now() - make_interval(days => $2)`, [ws, policy.upload_files_days]);
  const r = await q.query(`UPDATE source_receipt SET summary = summary - 'issues' || '{"issuesPurged": true}'::jsonb
    WHERE workspace_id = $1 AND summary ? 'issues' AND created_at < now() - make_interval(days => $2)`, [ws, policy.receipt_issues_days]);
  return { uploads: u.rowCount ?? 0, receipts: r.rowCount ?? 0 };
}

export function registerRetentionTools(reg: Registry): void {
  reg.register(tool(obj({}), {
    name: 'policy.retention.get', risk: 'read', summary: 'The workspace retention policy in force (days per data class) and what is always kept',
    run: async ctx => ({ ...(await retentionPolicy(ctx.q, ctx.workspaceId)), alwaysKept: ALWAYS_KEPT }),
  }));

  reg.register(tool(obj({
    upload_files_days: days, receipt_issues_days: days, recordings_days: days, transcripts_days: days, audit_logs_days: days,
    reason: str({ min: 5, max: 300 }),
  }), {
    name: 'policy.retention.set', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Set how long contact data is kept, per class; makes a new policy version (consent, suppression and tombstones are always kept)',
    describe: i => `Retention: ${Object.entries(i).filter(([k, v]) => k !== 'reason' && v !== undefined).map(([k, v]) => `${k.replace(/_days$/, '').replace(/_/g, ' ')} ${v} days`).join(', ') || 'no change'}. Reason: ${i.reason}`,
    version: async ctx => String((await retentionPolicy(ctx.q, ctx.workspaceId)).version),
    run: async (ctx, i) => {
      const { reason, ...set } = i;
      const cur = await retentionPolicy(ctx.q, ctx.workspaceId);
      const policy = { ...cur.policy, ...Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)) } as RetentionPolicy;
      const version = cur.version + 1;
      await ctx.q.query('INSERT INTO intake_retention_policy (workspace_id, version, policy, reason) VALUES ($1,$2,$3,$4)', [ctx.workspaceId, version, JSON.stringify(policy), reason]);
      return { version, policy, previous: cur.policy, alwaysKept: ALWAYS_KEPT };
    },
  }));
}

/** Nightly: purge intake's own expired data in every workspace. */
export const retentionJob: Job = {
  name: 'intake.retention',
  dailyAtIst: '03:10',
  async run(deps) {
    for (const w of await many<{ id: string }>(deps.pool, 'SELECT id FROM workspace')) {
      const c = await deps.pool.connect();
      try {
        await c.query('BEGIN');
        const out = await applyRetention(c, w.id);
        if (out.uploads || out.receipts) await appendAudit(c, { workspaceId: w.id, actorType: 'system', action: 'intake.retention.applied', payload: out });
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    }
  },
};
