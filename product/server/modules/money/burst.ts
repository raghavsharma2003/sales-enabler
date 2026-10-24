// Campaign burst (must-be audit gap C; reading in decision.2026-10-24.campaign-burst-reading). Off by default. An owner's
// approval lets one campaign use more lines at once than the workspace's steady line limit, up to `lines`, while what it
// holds for calls in progress stays under its own ceiling. The ceiling is a campaign-scope 'in_flight' cap, so the kernel's
// reserve() refuses past it; the dial gate (campaigns G12) reads policy.burst for the line count. The workspace's own
// in-flight limit still applies on top: a burst ceiling may not exceed it.
import { formatInr } from '../../../shared/money.ts';
import { num, obj, uuid, ValidationError } from '../../../shared/validate.ts';
import { label } from '../../labels.ts';
import { one, type Queryable } from '../../db.ts';
import { tool, type Registry, type ToolCtx } from '../../tools.ts';

export interface Burst { lines: number; ceilingInrMilli: number; approvedBy: string | null; at: string }

/** The workspace's steady line limit (dial policy), as the dial gate reads it; 10 when no policy is saved. */
async function steadyLines(q: Queryable, ws: string): Promise<number> {
  return (await one<{ c: number }>(q, 'SELECT concurrency AS c FROM dial_policy WHERE workspace_id = $1', [ws]))?.c ?? 10;
}

async function workspaceInFlight(q: Queryable, ws: string): Promise<number | null> {
  const r = await one<{ cap: string }>(q, "SELECT cap_inr_milli::text AS cap FROM budget WHERE workspace_id = $1 AND scope_type = 'workspace' AND scope_id IS NULL AND period = 'in_flight' ORDER BY created_at LIMIT 1", [ws]);
  return r ? Number(r.cap) : null;
}

async function campaignRow(q: Queryable, ws: string, id: string) {
  const c = await one<{ id: string; policy: Record<string, unknown>; policy_version: number }>(q,
    'SELECT id, policy, policy_version FROM campaign WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [id, ws]);
  if (!c) throw new ValidationError('campaignId', 'no such campaign in this workspace');
  return c;
}

/** A campaign's burst, or null when it is off (the default). */
export function burstOf(policy: unknown): Burst | null {
  const b = (policy as { burst?: Burst } | null)?.burst;
  return b && Number.isInteger(b.lines) && b.lines > 0 ? b : null;
}

const burstInput = obj({ campaignId: uuid(), lines: num({ int: true, min: 2, max: 200 }), ceilingInrMilli: num({ int: true, min: 1000, max: 100_000_000 }) });

export function registerBurst(r: Registry): void {
  r.register(tool(burstInput, {
    name: 'campaign.burst.set', risk: 'spend', summary: 'let one campaign go past the steady line limit, up to a ceiling on money held at once (off until an owner approves)',
    describe: async (i, ctx) => `Let the campaign ${await label(ctx, 'campaign', i.campaignId)} use up to ${i.lines} lines at once, `
      + `holding at most ${formatInr(i.ceilingInrMilli)} for its calls in progress`,
    version: async (ctx, i) => String((await one<{ v: number }>(ctx.q, 'SELECT policy_version AS v FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))?.v ?? 'none'),
    run: async (ctx: ToolCtx, i) => {
      const c = await campaignRow(ctx.q, ctx.workspaceId, i.campaignId);
      const steady = await steadyLines(ctx.q, ctx.workspaceId);
      const factor = (await one<{ f: number }>(ctx.q, 'SELECT burst_max_lines_factor AS f FROM money_config'))?.f ?? 3;
      if (i.lines <= steady) throw new ValidationError('lines', `the steady limit is already ${steady} lines; a burst is for going past it`);
      if (i.lines > steady * factor) throw new ValidationError('lines', `a burst may go up to ${steady * factor} lines (${factor} times the steady ${steady})`);
      const outer = await workspaceInFlight(ctx.q, ctx.workspaceId);
      if (outer !== null && i.ceilingInrMilli > outer) {
        throw new ValidationError('ceilingInrMilli', `is above the workspace's in-flight limit of ${formatInr(outer)}; raise that first`);
      }
      const burst: Burst = { lines: i.lines, ceilingInrMilli: i.ceilingInrMilli, approvedBy: ctx.actor.id ?? null, at: new Date().toISOString() };
      await ctx.q.query('UPDATE campaign SET policy = policy || jsonb_build_object(\'burst\', $3::jsonb), policy_version = policy_version + 1, updated_at = now() WHERE id = $1 AND workspace_id = $2',
        [c.id, ctx.workspaceId, JSON.stringify(burst)]);
      const cap = await one<{ id: string }>(ctx.q, "SELECT id FROM budget WHERE workspace_id = $1 AND scope_type = 'campaign' AND scope_id = $2 AND period = 'in_flight' LIMIT 1 FOR UPDATE", [ctx.workspaceId, c.id]);
      if (cap) await ctx.q.query('UPDATE budget SET cap_inr_milli = $2 WHERE id = $1', [cap.id, i.ceilingInrMilli]);
      else await ctx.q.query("INSERT INTO budget (workspace_id, scope_type, scope_id, period, cap_inr_milli) VALUES ($1,'campaign',$2,'in_flight',$3)", [ctx.workspaceId, c.id, i.ceilingInrMilli]);
      return { burst: 'on', steadyLines: steady, lines: i.lines, ceilingInrMilli: i.ceilingInrMilli,
        text: `Burst is on: up to ${i.lines} lines (steady ${steady}), at most ${formatInr(i.ceilingInrMilli)} held at once for this campaign's calls.` };
    },
  }));

  // Turning burst off only lowers spend, so it runs at once.
  r.register(tool(obj({ campaignId: uuid() }), {
    name: 'campaign.burst.off', risk: 'draft', summary: 'turn a campaign\'s burst off: back to the steady line limit',
    run: async (ctx, i) => {
      const c = await campaignRow(ctx.q, ctx.workspaceId, i.campaignId);
      if (!burstOf(c.policy)) return { burst: 'off', changed: false };
      await ctx.q.query("UPDATE campaign SET policy = policy - 'burst', policy_version = policy_version + 1, updated_at = now() WHERE id = $1 AND workspace_id = $2", [c.id, ctx.workspaceId]);
      await ctx.q.query("DELETE FROM budget WHERE workspace_id = $1 AND scope_type = 'campaign' AND scope_id = $2 AND period = 'in_flight'", [ctx.workspaceId, c.id]);
      return { burst: 'off', changed: true };
    },
  }));
}
