// The Operator's own tools: the Today brief, thread reads, the Operator's settings (brain, autonomy) and the
// presentation preferences the client asked VP to remember. Everything else the Operator does goes through
// other modules' tools by name, through the same registry.
import type { Role } from '../../../shared/approval.ts';
import { num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Actor, type Registry, type ToolCtx } from '../../tools.ts';

const ALL_ROLES: readonly Role[] = ['owner', 'builder', 'operator', 'compliance', 'viewer'];
const ACTIVE_ROLES: readonly Role[] = ['owner', 'builder', 'operator', 'compliance'];

export type Autonomy = 'A0' | 'A1';

/** The member a call acts for: the member themselves, or the member whose Operator is calling. */
export function memberOf(actor: Actor): string | null {
  if (!actor.id) return null;
  if (actor.type === 'member' && !actor.id.startsWith('key:')) return actor.id;
  if (actor.type === 'agent' && actor.id.startsWith('operator:')) return actor.id.slice('operator:'.length);
  return null;
}

export async function operatorSettings(q: Queryable, workspaceId: string): Promise<{ autonomy: Autonomy; brain: string | null }> {
  const r = await one<{ autonomy: Autonomy; brain: string | null }>(q, 'SELECT autonomy, brain FROM operator_setting WHERE workspace_id = $1', [workspaceId]);
  return r ?? { autonomy: 'A1', brain: null };
}

/** Curated brain ids, set per deployment (VP_OPERATOR_BRAINS, comma-separated). No default brain is chosen in code. */
export function curatedBrains(): string[] {
  return (process.env.VP_OPERATOR_BRAINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

// Start of today in IST, the clock the client lives on.
const IST_TODAY = "(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')";

async function briefToday(ctx: ToolCtx, i: { since?: string }) {
  const ws = ctx.workspaceId;
  const since = i.since ? new Date(i.since) : new Date(Date.now() - 24 * 3600_000);
  if (Number.isNaN(since.getTime())) throw new Error('since is not a date');
  const asOf = new Date().toISOString();
  const [needs, needsN, campaigns, spend, wallet, issues, issueN, changed] = await Promise.all([
    many(ctx.q, `SELECT id, tool, summary, risk_class AS risk, created_at, expires_at FROM action
      WHERE workspace_id = $1 AND status = 'proposed' AND (expires_at IS NULL OR expires_at > now())
      ORDER BY CASE risk_class WHEN 'spend' THEN 0 WHEN 'external' THEN 1 WHEN 'policy' THEN 2 WHEN 'destructive' THEN 3 ELSE 4 END, created_at
      LIMIT 7`, [ws]),
    one<{ n: number }>(ctx.q, `SELECT count(*)::int AS n FROM action WHERE workspace_id = $1 AND status = 'proposed' AND (expires_at IS NULL OR expires_at > now())`, [ws]),
    many(ctx.q, `SELECT id, name, state, pause_cause, updated_at FROM campaign
      WHERE workspace_id = $1 AND state IN ('running','scheduled','paused') ORDER BY state, updated_at DESC LIMIT 20`, [ws]),
    many<{ component: string; inr_milli: string }>(ctx.q, `SELECT component, sum(inr_milli)::text AS inr_milli FROM cost_line
      WHERE workspace_id = $1 AND created_at >= ${IST_TODAY} GROUP BY component ORDER BY component`, [ws]),
    one<{ balance: string; state: string }>(ctx.q, 'SELECT balance_inr_milli::text AS balance, state FROM wallet WHERE workspace_id = $1', [ws]),
    many(ctx.q, `SELECT id, category, severity, subject_type, subject_id, created_at FROM issue
      WHERE workspace_id = $1 AND status <> 'resolved'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 5`, [ws]),
    one<{ n: number }>(ctx.q, `SELECT count(*)::int AS n FROM issue WHERE workspace_id = $1 AND status <> 'resolved'`, [ws]),
    many<{ action: string; n: number }>(ctx.q, `SELECT action, count(*)::int AS n FROM audit_event
      WHERE workspace_id = $1 AND created_at >= $2 GROUP BY action ORDER BY n DESC, action LIMIT 10`, [ws, since]),
  ]);
  const byComponent = Object.fromEntries(spend.map(s => [s.component, Number(s.inr_milli)]));
  return {
    asOf,
    since: since.toISOString(),
    needsTap: { n: needsN?.n ?? 0, items: needs },
    liveCampaigns: { n: campaigns.length, items: campaigns },
    spendToday: { inrMilli: Object.values(byComponent).reduce((a, b) => a + b, 0), byComponent, timezone: 'Asia/Kolkata' },
    wallet: wallet ? { balanceInrMilli: Number(wallet.balance), state: wallet.state } : null,
    issues: { n: issueN?.n ?? 0, items: issues },
    changed: { n: changed.reduce((a, c) => a + c.n, 0), byAction: changed },
  };
}

export function registerOperatorTools(r: Registry): void {
  r.register(tool(obj({ since: opt(str({ max: 40, desc: 'ISO time; default 24 hours ago' })) }), {
    name: 'brief.today', risk: 'read', roles: ALL_ROLES,
    summary: "Today's brief: what changed, what needs a tap, live campaigns, spend today (IST), wallet and open issues",
    run: briefToday,
  }));

  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'thread.list', risk: 'read', roles: ALL_ROLES,
    summary: 'List the Operator threads in this workspace, newest first',
    run: async (ctx, i) => ({
      threads: await many(ctx.q, `SELECT t.id, t.title, t.member_id, t.created_at, t.updated_at,
          (SELECT count(*)::int FROM message m WHERE m.thread_id = t.id AND m.workspace_id = t.workspace_id) AS messages
        FROM thread t WHERE t.workspace_id = $1 ORDER BY t.updated_at DESC LIMIT $2`, [ctx.workspaceId, i.limit ?? 30]),
    }),
  }));

  r.register(tool(obj({}), {
    name: 'operator.settings.get', risk: 'read', roles: ALL_ROLES,
    summary: "VP's autonomy level in this workspace (A1, or A0 when drafts also wait for a tap) and its brain",
    run: async ctx => ({ ...(await operatorSettings(ctx.q, ctx.workspaceId)), brains: curatedBrains() }),
  }));

  r.register(tool(obj({ brain: str({ min: 1, max: 60, pattern: /^[a-z0-9][a-z0-9._-]*$/, desc: 'a curated brain id from operator.settings.get' }) }), {
    name: 'operator.brain.set', risk: 'spend',
    summary: "Change VP's brain (the model behind the Operator); it changes what each Operator turn costs, never what is allowed",
    describe: i => `Switch VP's brain to "${i.brain}". Each Operator turn is then billed at that brain's rate.`,
    version: async (ctx) => (await operatorSettings(ctx.q, ctx.workspaceId)).brain ?? 'none',
    run: async (ctx, i) => {
      if (!curatedBrains().includes(i.brain)) throw new Error(`"${i.brain}" is not one of the curated brains`);
      await ctx.q.query(`INSERT INTO operator_setting (workspace_id, brain) VALUES ($1,$2)
        ON CONFLICT (workspace_id) DO UPDATE SET brain = $2, updated_at = now()`, [ctx.workspaceId, i.brain]);
      return { brain: i.brain };
    },
  }));

  // Lowering autonomy only lowers risk, so any working member (or their Operator) may do it at once.
  r.register(tool(obj({ level: str({ oneOf: ['A0'], desc: 'A0: every draft and test waits for a tap too' }) }), {
    name: 'operator.autonomy.lower', risk: 'draft', roles: ACTIVE_ROLES,
    summary: 'Ask before drafts: from now on every draft and test VP makes waits for a human tap (A0)',
    run: async (ctx, i) => {
      await ctx.q.query(`INSERT INTO operator_setting (workspace_id, autonomy) VALUES ($1,$2)
        ON CONFLICT (workspace_id) DO UPDATE SET autonomy = $2, updated_at = now()`, [ctx.workspaceId, i.level]);
      return { autonomy: i.level };
    },
  }));

  // Raising it back is a policy change: it needs an owner's or compliance member's tap.
  r.register(tool(obj({ level: str({ oneOf: ['A1'] }) }), {
    name: 'operator.autonomy.raise', risk: 'policy',
    summary: 'Let VP make drafts and run tests on its own again (A1); anything that reaches people, spends, deletes or changes policy still waits for a tap',
    describe: () => 'Let VP make drafts and run tests on its own again (A1). Launches, spend, deletes and policy changes still wait for a tap.',
    version: async ctx => (await operatorSettings(ctx.q, ctx.workspaceId)).autonomy,
    run: async (ctx, i) => {
      await ctx.q.query(`INSERT INTO operator_setting (workspace_id, autonomy) VALUES ($1,$2)
        ON CONFLICT (workspace_id) DO UPDATE SET autonomy = $2, updated_at = now()`, [ctx.workspaceId, i.level]);
      return { autonomy: i.level };
    },
  }));

  r.register(tool(obj({ limit: opt(num({ int: true, min: 1, max: 100 })) }), {
    name: 'operator.preference.list', risk: 'read', roles: ALL_ROLES,
    summary: 'What VP remembers about how you like to work (presentation only), each with its source message',
    run: async (ctx, i) => ({
      preferences: await many(ctx.q, `SELECT id, text, source_message_id, created_at FROM operator_preference
        WHERE workspace_id = $1 AND member_id = $2 AND forgotten_at IS NULL ORDER BY created_at DESC LIMIT $3`,
        [ctx.workspaceId, memberOf(ctx.actor), i.limit ?? 50]),
    }),
  }));

  r.register(tool(obj({ text: str({ min: 2, max: 200, desc: 'a presentation preference, e.g. "reports as a table"; never a setting or permission' }),
    sourceMessageId: opt(uuid()) }), {
    name: 'operator.preference.remember', risk: 'draft', roles: ALL_ROLES,
    summary: 'Remember how you like VP to present things (language, length, report day). Settings and permissions are never kept here',
    run: async (ctx, i) => {
      const me = memberOf(ctx.actor);
      if (!me) throw new Error('only a member (or their Operator) has preferences');
      if (i.sourceMessageId && !(await one(ctx.q, 'SELECT 1 FROM message WHERE id = $1 AND workspace_id = $2', [i.sourceMessageId, ctx.workspaceId]))) {
        throw new Error('that source message is not in this workspace');
      }
      return one(ctx.q, `INSERT INTO operator_preference (workspace_id, member_id, text, source_message_id) VALUES ($1,$2,$3,$4)
        RETURNING id, text, source_message_id, created_at`, [ctx.workspaceId, me, i.text, i.sourceMessageId ?? null]);
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'operator.preference.forget', risk: 'draft', roles: ALL_ROLES,
    summary: 'Forget one thing VP remembers about how you work',
    run: async (ctx, i) => {
      const me = memberOf(ctx.actor);
      const r2 = await ctx.q.query(`UPDATE operator_preference SET forgotten_at = now()
        WHERE id = $1 AND workspace_id = $2 AND member_id = $3 AND forgotten_at IS NULL`, [i.id, ctx.workspaceId, me]);
      if (!r2.rowCount) throw new Error('there is no such preference to forget');
      return { forgotten: i.id };
    },
  }));

  r.register(tool(obj({ id: uuid(), limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'thread.get', risk: 'read', roles: ALL_ROLES,
    summary: 'Read one Operator thread with its messages and cards',
    run: async (ctx, i) => {
      const t = await getThread(ctx.q, ctx.workspaceId, i.id, i.limit);
      if (!t) throw new Error('no such thread');
      return t;
    },
  }));
}

export async function getThread(q: Queryable, workspaceId: string, id: string, limit = 200) {
  const thread = await one(q, 'SELECT id, title, member_id, created_at, updated_at FROM thread WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  if (!thread) return null;
  const messages = await many(q, `SELECT id, role, content, created_at FROM (
      SELECT id, role, content, created_at FROM message WHERE thread_id = $1 AND workspace_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3
    ) m ORDER BY created_at, id`, [id, workspaceId, limit]);
  return { thread, messages };
}
