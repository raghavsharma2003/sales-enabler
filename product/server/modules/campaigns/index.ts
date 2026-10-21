// Campaigns module: how a list becomes calls (research/2026-10-21/blueprint/modules/campaigns.md) and the number step
// and dial gate it runs (trust-telephony.md §4-§6). Tools are the API; every dial path enqueues an attempt that only
// the worker (worker.ts) can claim, and only through the gate (gate.ts).
//
// Risk classes: the registry file the blueprint cites (workspace-tool-registry.json) was not in the repo, so classes
// follow workspace.md §5. Verbs on the kernel's A3 list are 'external' so VP runs them at once (A3) while a person's
// call goes through approval; risk-lowering verbs not on that list (window.narrow, number.pause) are 'draft' (A1).
import type { Deps, Module } from '../../app.ts';
import { HttpError, type Req, type Res } from '../../http.ts';
import { verify } from '../../runtime-client.ts';
import { CALL_CATEGORIES, type CallCategory } from '../../../shared/agent-config.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { getStack } from '../../../shared/stacks.ts';
import { arr, bool, num, obj, opt, record, str, uuid, ValidationError, type Validator } from '../../../shared/validate.ts';
import { many, one, type Queryable } from '../../db.ts';
import { tool, UnknownOutcome, type Registry, type ToolCtx } from '../../tools.ts';
import {
  BUDGET_PRESETS, DEFAULT_PER_MINUTE_INR_MILLI, DEFAULT_WINDOWS, ESTIMATE_PRIORS, FIRST_CAMPAIGN_REVIEW_STOP, OUTCOME_CLASSES,
  PROMOTIONAL_BAND, RETRY_LADDER, type OutcomeClass, type WindowPolicy,
} from './defaults.ts';
import { loadDialPolicy, loadVersion, type CampaignPolicy, type CampaignRow } from './gate.ts';
import { tick } from './worker.ts';
import { verifyConfirm, verifyStart } from './verify.ts';
import { routeSeries, SERIES, telephony, TelephonyDisabled, type Series } from './telephony.ts';
import { addDays, describeWindow, eligibility, isNarrowing, localNow, localToUtc, toMin, validateOuterBand, validateWindow } from './windows.ts';

// ---- validators ----

const hhmm = () => str({ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, desc: 'HH:MM, 24-hour, in the contact\'s local time' });
const range = obj({ start: hhmm(), end: hhmm() });
const windowV = obj({
  days: arr(num({ int: true, min: 1, max: 7 }), { min: 1, max: 7 }),
  ranges: arr(range, { min: 1, max: 6 }),
  crossMidnightReason: opt(str({ max: 300 })),
  nationalHolidaysOff: opt(bool()),
  holidays: opt(arr(str({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), { max: 60 })),
}, 'calling window: days 1 (Mon) - 7 (Sun), ranges in the contact\'s local time');
const categoryV = str({ oneOf: CALL_CATEGORIES, desc: 'service, transactional or promotional: asked first; it sets the window, series and consent rule' });
const budgetsV = obj({ perDay: num({ int: true, min: 1, max: 10 }), perWeek: num({ int: true, min: 1, max: 30 }), perRun: num({ int: true, min: 1, max: 30 }) });
const iso = () => str({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, desc: 'ISO 8601 time with offset' });
const seriesV = str({ oneOf: SERIES });

// ---- helpers ----

const RANK: Record<CallCategory, number> = { service: 0, transactional: 1, promotional: 2 };
const SYSTEMLIKE = (ctx: ToolCtx) => ctx.actor.type === 'system' || ctx.actor.type === 'agent';
const actorRef = (ctx: ToolCtx) => `${ctx.actor.type}:${ctx.actor.id ?? ''}`;

async function getCampaign(q: Queryable, ws: string, id: string, lock = false): Promise<CampaignRow> {
  const c = await one<CampaignRow>(q, `SELECT id, workspace_id, name, call_category, policy, policy_version, state, agent_version_id, audience_id, budget_id
    FROM campaign WHERE id = $1 AND workspace_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, ws]);
  if (!c) throw new ValidationError('id', 'no such campaign in this workspace');
  return c;
}

async function campaignVersion(q: Queryable, ws: string, id: string): Promise<string | null> {
  const r = await one<{ v: string }>(q, `SELECT c.policy_version || ':' || coalesce(v.hash, 'none') AS v FROM campaign c
    LEFT JOIN agent_version v ON v.id = c.agent_version_id WHERE c.id = $1 AND c.workspace_id = $2`, [id, ws]);
  return r?.v ?? null;
}

async function setPolicy(q: Queryable, c: CampaignRow, policy: CampaignPolicy, extra: Record<string, unknown> = {}) {
  const cols = Object.keys(extra);
  await q.query(`UPDATE campaign SET policy = $2, policy_version = policy_version + 1, updated_at = now()${cols.map((k, i) => `, ${k} = $${i + 3}`).join('')}
    WHERE id = $1`, [c.id, JSON.stringify(policy), ...cols.map(k => extra[k])]);
}

async function checkWindow(q: Queryable, ws: string, category: CallCategory, w: WindowPolicy, allowCrossMidnight: boolean, path = 'window') {
  const dp = await loadDialPolicy(q, ws);
  return validateWindow(category, w, { path, allowCrossMidnight, outerBand: dp.outer_band }).warnings;
}

/** Everything that stops a launch, in priority order, each with the fix and who can do it (campaigns.md §12). */
export async function launchBlockers(q: Queryable, ws: string, c: CampaignRow): Promise<{ code: string; message: string; fix: string; role: string }[]> {
  const out: { code: string; message: string; fix: string; role: string }[] = [];
  const v = await loadVersion(q, ws, c.agent_version_id);
  const agent = v?.config?.agent;
  if (!v) out.push({ code: 'no_version', message: 'no published agent version is pinned', fix: 'campaign.draft agentVersionId', role: 'builder' });
  else if (!agent || !v.config.brief?.text) out.push({ code: 'version_not_publishable', message: 'the pinned version has no compiled brief', fix: 'publish the agent', role: 'builder' });
  else if (getStack(agent.voice?.stackId ?? '')?.status === 'beta') out.push({ code: 'beta_stack', message: `the ${getStack(agent.voice.stackId)!.label} stack is in beta: test calls only`, fix: 'choose an available stack (stack.set) and publish', role: 'builder' });
  else if (agent.category !== c.call_category) out.push({ code: 'category_mismatch', message: `the agent version is for ${agent.category} calls; this campaign is ${c.call_category}`, fix: 'pin a matching version', role: 'builder' });
  if (!c.policy.capInrMilli) out.push({ code: 'no_cap', message: 'no budget cap', fix: 'campaign.draft capInrMilli (default: the estimate\'s p90)', role: 'owner' });
  try { await checkWindow(q, ws, c.call_category, c.policy.window ?? DEFAULT_WINDOWS[c.call_category], true); }
  catch (e) { out.push({ code: 'window_invalid', message: e instanceof Error ? e.message : String(e), fix: 'campaign.window.narrow', role: 'compliance' }); }
  const n = c.audience_id ? await one<{ n: number }>(q, `SELECT count(*)::int AS n FROM audience_member m JOIN audience a ON a.id = m.audience_id
    WHERE a.id = $1 AND a.workspace_id = $2`, [c.audience_id, ws]) : null;
  if (!n?.n) out.push({ code: 'no_audience', message: 'nobody to call', fix: 'campaign.audience.add', role: 'operator' });
  const dp = await loadDialPolicy(q, ws);
  const route = routeSeries({ category: c.call_category, sectorPacks: agent?.sectorPacks ?? [], workspaceSector: dp.sector });
  const line = await one(q, "SELECT 1 FROM phone_number WHERE workspace_id = $1 AND series = $2 AND status = 'active' LIMIT 1", [ws, route.series]);
  if (!line) out.push({ code: 'no_line', message: `no active ${route.series} line (${route.rule})`, fix: 'number.search then number.rent', role: 'owner' });
  return out;
}

async function enqueueCampaignAttempts(q: Queryable, ws: string, c: CampaignRow, at: Date, contactIds?: string[]): Promise<number> {
  const r = await q.query(`INSERT INTO attempt (workspace_id, campaign_id, contact_id, kind, scheduled_for, agent_version_id, call_category, requested_by)
    SELECT $1, $2, m.contact_id, 'campaign', $3, $4, $5, 'campaign' FROM audience_member m JOIN audience a ON a.id = m.audience_id
    WHERE a.id = $6 AND a.workspace_id = $1 AND ($7::uuid[] IS NULL OR m.contact_id = ANY($7::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM attempt x WHERE x.campaign_id = $2 AND x.contact_id = m.contact_id AND x.kind = 'campaign')`,
    [ws, c.id, at, c.agent_version_id, c.call_category, c.audience_id, contactIds ?? null]);
  return r.rowCount ?? 0;
}

function retryAt(step: number | string, from: Date, tz: string, w: WindowPolicy, stated?: string): Date | null {
  if (typeof step === 'number') return new Date(from.getTime() + step * 60_000);
  if (step === 'stated') return stated ? new Date(stated) : new Date(from.getTime() + 120 * 60_000);
  const local = localNow(from, tz);
  const r = w.ranges[0];
  const s = toMin(r.start), e = toMin(r.end) > s ? toMin(r.end) : toMin(r.end) + 1440;
  const mid = Math.floor((s + e) / 2);
  const minutes = step === 'next_day' ? s : local.minutes < mid ? mid : s;   // the other half of the window, next day
  return localToUtc(addDays(local.date, 1), minutes, tz);
}

/** India-default band check at the API door, so a promotional single call outside 10:00-21:00 IST is a 422 before any
 *  approval card exists. run() checks again in the contact's own zone (a contact abroad may differ). */
const promoBandAt = (at: Date, tz: string) => eligibility(at, tz, { category: 'promotional', window: { days: [1, 2, 3, 4, 5, 6, 7], ranges: [PROMOTIONAL_BAND] },
  outerBand: PROMOTIONAL_BAND, rbiBand: false, holidays: [], cutoffMin: 0 }).ok;
const PROMO_RULE = `M3.promotional_band: promotional calls only between ${PROMOTIONAL_BAND.start} and ${PROMOTIONAL_BAND.end} in the person's time (RS-15)`;
const singleCallBase = obj({ contactId: uuid(), agentVersionId: uuid(), category: categoryV, facts: opt(record(str({ max: 500 }), { maxKeys: 40 })),
  at: opt(iso()), idempotencyKey: opt(str({ min: 8, max: 80 })), via: opt(str({ oneOf: ['single', 'api'] })) });
const singleCallV: Validator<ReturnType<typeof singleCallBase>> = Object.assign((v: unknown, p?: string) => {
  const out = singleCallBase(v, p);
  if (out.category === 'promotional' && !promoBandAt(out.at ? new Date(out.at) : new Date(), 'Asia/Kolkata')) throw new ValidationError('at', PROMO_RULE);
  return out;
}, { schema: singleCallBase.schema });

// ---- tools ----

/** Cancel every attempt still waiting for a person ('created' or 'queued'), on the caller's transaction. Intake's erasure
 *  calls this inside dpdp.request.execute; attempts already dialling finish and the calls module settles them. */
export async function cancelContactAttempts(q: Queryable, workspaceId: string, contactId: string, reason: string): Promise<{ cancelled: number }> {
  const r = await q.query(`UPDATE attempt SET status = 'cancelled', blocked_by = $3, next_eligible_at = NULL
    WHERE workspace_id = $1 AND contact_id = $2 AND status IN ('created','queued')`, [workspaceId, contactId, reason.slice(0, 120)]);
  return { cancelled: r.rowCount ?? 0 };
}

export function registerCampaignTools(registry: Registry): void {
  const reg = registry.register.bind(registry);

  reg(tool(obj({
    id: opt(uuid()), name: str({ min: 1, max: 120 }), category: categoryV, agentVersionId: opt(uuid()), audienceId: opt(uuid()),
    preset: opt(str({ oneOf: Object.keys(BUDGET_PRESETS) })), window: opt(windowV), budgets: opt(budgetsV),
    concurrency: opt(num({ int: true, min: 1, max: 1000 })), cliPool: opt(arr(uuid(), { max: 50 })),
    perMinuteInrMilli: opt(num({ int: true, min: 1, max: 100_000 })), maxDurationS: opt(num({ int: true, min: 30, max: 3600 })),
    capInrMilli: opt(num({ int: true, min: 1 })), startAt: opt(iso()), endAt: opt(iso()), predialUrl: opt(str({ pattern: /^https:\/\//, max: 500 })),
  }), {
    name: 'campaign.draft', risk: 'draft', summary: 'Create or edit a draft campaign: category first, then window, retries, budget and cap',
    run: async (ctx, i) => {
      const prev = i.id ? await getCampaign(ctx.q, ctx.workspaceId, i.id, true) : null;
      if (prev && prev.state !== 'draft') throw new ValidationError('id', 'a launched campaign changes through campaign.window.*, campaign.audience.add or a policy tool');
      if (prev && RANK[i.category as CallCategory] < RANK[prev.call_category])
        throw new ValidationError('category', 'M1.category_loosen: moving to a looser category needs the Compliance role (policy.category.override)');
      const category = i.category as CallCategory;
      const window = i.window ?? prev?.policy.window ?? DEFAULT_WINDOWS[category];
      const warnings = await checkWindow(ctx.q, ctx.workspaceId, category, window, false);
      if (i.agentVersionId) {
        const v = await loadVersion(ctx.q, ctx.workspaceId, i.agentVersionId);
        if (!v) throw new ValidationError('agentVersionId', 'no such agent version in this workspace');
        if (v.config.agent?.category && v.config.agent.category !== category) warnings.push(`the agent version is for ${v.config.agent.category} calls; launch is blocked until they match`);
      }
      if (i.audienceId && !(await one(ctx.q, 'SELECT 1 FROM audience WHERE id = $1 AND workspace_id = $2', [i.audienceId, ctx.workspaceId])))
        throw new ValidationError('audienceId', 'no such audience in this workspace');
      if (i.cliPool?.length) {
        const n = await one<{ n: number }>(ctx.q, 'SELECT count(*)::int AS n FROM phone_number WHERE workspace_id = $1 AND id = ANY($2)', [ctx.workspaceId, i.cliPool]);
        if (n!.n !== new Set(i.cliPool).size) throw new ValidationError('cliPool', 'a number in the pool is not in this workspace');
      }
      const policy: CampaignPolicy = {
        ...(prev?.policy ?? {}), window,
        budgets: i.budgets ?? (i.preset ? BUDGET_PRESETS[i.preset] : prev?.policy.budgets) ?? (category === 'promotional' ? BUDGET_PRESETS.promotional : BUDGET_PRESETS.renewal),
        ...(i.preset ? { preset: i.preset } : {}), ...(i.concurrency ? { concurrency: i.concurrency } : {}), ...(i.cliPool ? { cliPool: i.cliPool } : {}),
        ...(i.perMinuteInrMilli ? { perMinuteInrMilli: i.perMinuteInrMilli } : {}), ...(i.maxDurationS ? { maxDurationS: i.maxDurationS } : {}),
        ...(i.capInrMilli ? { capInrMilli: i.capInrMilli } : {}), ...(i.startAt ? { startAt: i.startAt } : {}), ...(i.endAt ? { endAt: i.endAt } : {}),
        ...(i.predialUrl ? { predial: { url: i.predialUrl } } : {}),
      };
      if (prev) {
        await setPolicy(ctx.q, prev, policy, { name: i.name, call_category: category, agent_version_id: i.agentVersionId ?? prev.agent_version_id, audience_id: i.audienceId ?? prev.audience_id });
        return { id: prev.id, policyVersion: prev.policy_version + 1, warnings };
      }
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO campaign (workspace_id, name, call_category, policy, agent_version_id, audience_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [ctx.workspaceId, i.name, category, JSON.stringify(policy), i.agentVersionId ?? null, i.audienceId ?? null]);
      return { id: row!.id, policyVersion: 1, warnings };
    },
  }));

  reg(tool(obj({ id: uuid() }), {
    name: 'campaign.estimate', risk: 'read', summary: 'Estimate people, attempts, minutes and money (p10-p90 incl. GST) for a campaign',
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id);
      const n = c.audience_id ? await one<{ total: number; held: number }>(ctx.q, `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM suppression s WHERE s.workspace_id = $2 AND (s.contact_id = ct.id OR s.e164 = ct.e164)
            AND (s.scope = 'workspace' OR s.scope_id = $3)))::int AS held
        FROM audience_member m JOIN audience a ON a.id = m.audience_id JOIN contact ct ON ct.id = m.contact_id
        WHERE a.id = $1 AND a.workspace_id = $2`, [c.audience_id, ctx.workspaceId, c.id]) : { total: 0, held: 0 };
      const people = n!.total - n!.held;
      const attempts = people * ESTIMATE_PRIORS.attemptsPerPerson;
      const minutes = people * ESTIMATE_PRIORS.pConnect * ESTIMATE_PRIORS.minutesPerConnect;
      let perMinute = c.policy.perMinuteInrMilli ?? DEFAULT_PER_MINUTE_INR_MILLI, basis = 'assumption, no history: VP preset priors';
      const v = await loadVersion(ctx.q, ctx.workspaceId, c.agent_version_id);
      const money = registry.get('money.estimate');            // the money module's rate, read through the registry
      if (money && v?.config.agent?.voice?.stackId) {
        try {
          const r = await money.run({ q: ctx.q, workspaceId: ctx.workspaceId, actor: { type: 'system', id: 'campaigns' } },
            money.input({ stackId: v.config.agent.voice.stackId, minutes: Math.max(1, Math.round(minutes)), calls: Math.max(1, Math.round(attempts)) })) as { perMinuteInrMilli?: number; basis?: string };
          if (r?.perMinuteInrMilli) { perMinute = r.perMinuteInrMilli; basis = r.basis ?? 'money.estimate'; }
        } catch { /* keep the prior; the basis says so */ }
      }
      const mid = minutes * perMinute * (1 + ESTIMATE_PRIORS.gst);
      const p10 = Math.round(mid * 0.6), p90 = Math.round(mid * 1.5);
      return { people, held: n!.held, attempts: Math.round(attempts), connectedMinutes: Math.round(minutes), perMinuteInrMilli: perMinute,
        p10InrMilli: p10, p90InrMilli: p90, suggestedCapInrMilli: Math.ceil(p90 / 100_000) * 100_000, basis, gstIncluded: true };
    },
  }));

  reg(tool(obj({ id: uuid() }), {
    name: 'campaign.launch', risk: 'external', summary: 'Launch a campaign: VP starts dialling its audience inside the window, budget and cap',
    describe: i => `Launch campaign ${i.id}: dial its audience under the approved policy and agent version`,
    version: (ctx, i) => campaignVersion(ctx.q, ctx.workspaceId, i.id),
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (c.state !== 'draft') throw new Error(`the campaign is ${c.state}; only a draft launches`);
      const blockers = await launchBlockers(ctx.q, ctx.workspaceId, c);
      if (blockers.length) throw new Error('launch blocked: ' + blockers.map(b => b.message).join('; '));
      const budget = await one<{ id: string }>(ctx.q, "INSERT INTO budget (workspace_id, scope_type, scope_id, cap_inr_milli) VALUES ($1, 'campaign', $2, $3) RETURNING id",
        [ctx.workspaceId, c.id, c.policy.capInrMilli]);
      const first = !(await one(ctx.q, 'SELECT 1 FROM campaign WHERE workspace_id = $1 AND launched_at IS NOT NULL AND id <> $2 LIMIT 1', [ctx.workspaceId, c.id]));
      const start = c.policy.startAt ? new Date(c.policy.startAt) : new Date();
      const policy = { ...c.policy, ...(first ? { reviewStopAfter: FIRST_CAMPAIGN_REVIEW_STOP } : {}) };
      const state = start.getTime() > Date.now() ? 'scheduled' : 'running';
      // The campaign dials through its agent's current 'campaign' deployment when one exists (deployment.split decides
      // which versions run); the worker follows later splits at each claim.
      const dep = await one<{ id: string }>(ctx.q, `SELECT d.id FROM deployment d JOIN agent_version v ON v.agent_id = d.agent_id
        WHERE v.id = $1 AND d.workspace_id = $2 AND d.binding = 'campaign' ORDER BY d.created_at DESC, d.id DESC LIMIT 1`, [c.agent_version_id, ctx.workspaceId]);
      await ctx.q.query('UPDATE campaign SET state = $2, budget_id = $3, launched_at = now(), launched_by = $4, policy = $5, deployment_id = coalesce($6, deployment_id), updated_at = now() WHERE id = $1',
        [c.id, state, budget!.id, actorRef(ctx), JSON.stringify(policy), dep?.id ?? null]);
      const queued = await enqueueCampaignAttempts(ctx.q, ctx.workspaceId, c, start);
      return { id: c.id, state, queued, firstCampaignReviewStop: first ? FIRST_CAMPAIGN_REVIEW_STOP : null };
    },
  }));

  reg(tool(obj({ id: uuid(), cause: opt(str({ max: 80 })) }), {
    name: 'campaign.pause', risk: 'external', summary: 'Pause a campaign at the next call boundary; calls in progress finish',
    describe: i => `Pause campaign ${i.id}`,
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (c.state === 'paused') return { id: c.id, state: 'paused', already: true };
      if (!['running', 'scheduled'].includes(c.state)) throw new Error(`a ${c.state} campaign cannot be paused`);
      const cause = SYSTEMLIKE(ctx) ? (i.cause ?? 'guard') : 'person' + (i.cause ? ':' + i.cause : '');
      await ctx.q.query("UPDATE campaign SET state = 'paused', pause_cause = $2, updated_at = now() WHERE id = $1", [c.id, cause]);
      return { id: c.id, state: 'paused', cause };
    },
  }));

  reg(tool(obj({ id: uuid() }), {
    name: 'campaign.resume', risk: 'external', summary: 'Resume a paused campaign (a person decides; guard pauses never resume on their own)',
    describe: i => `Resume campaign ${i.id}`,
    version: (ctx, i) => campaignVersion(ctx.q, ctx.workspaceId, i.id),
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (c.state !== 'paused') throw new Error(`the campaign is ${c.state}, not paused`);
      await ctx.q.query("UPDATE campaign SET state = 'running', pause_cause = NULL, updated_at = now() WHERE id = $1", [c.id]);
      return { id: c.id, state: 'running' };
    },
  }));

  reg(tool(obj({ id: uuid(), reason: opt(str({ max: 200 })) }), {
    name: 'campaign.stop', risk: 'external', summary: 'Stop a campaign for good: nothing new dials; calls in progress finish',
    describe: i => `Stop campaign ${i.id} for good`,
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (['completed', 'cancelled'].includes(c.state)) return { id: c.id, state: c.state, already: true };
      await ctx.q.query("UPDATE campaign SET state = 'cancelled', pause_cause = $2, updated_at = now() WHERE id = $1", [c.id, i.reason ?? (SYSTEMLIKE(ctx) ? 'guard' : 'person')]);
      const r = await ctx.q.query("UPDATE attempt SET status = 'cancelled' WHERE campaign_id = $1 AND workspace_id = $2 AND status = 'created'", [c.id, ctx.workspaceId]);
      return { id: c.id, state: 'cancelled', cancelledAttempts: r.rowCount ?? 0 };
    },
  }));

  reg(tool(obj({ id: uuid(), scope: opt(str({ max: 40 })) }), {
    name: 'campaign.stop_at_cap', risk: 'external', summary: 'Pause a campaign whose spend cap or wallet is reached (never cancels it, never releases numbers)',
    describe: i => `Pause campaign ${i.id}: its ${i.scope ?? 'campaign'} cap is reached`,
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (!['running', 'scheduled'].includes(c.state)) return { id: c.id, state: c.state, already: true };
      await ctx.q.query("UPDATE campaign SET state = 'paused', pause_cause = $2, updated_at = now() WHERE id = $1", [c.id, 'cap_reached:' + (i.scope ?? 'campaign')]);
      return { id: c.id, state: 'paused', cause: 'cap_reached:' + (i.scope ?? 'campaign') };
    },
  }));

  reg(tool(obj({ id: uuid(), window: windowV }), {
    name: 'campaign.window.narrow', risk: 'draft', roles: ['owner', 'builder', 'operator', 'compliance'],
    summary: 'Narrow a campaign\'s calling window (risk-lowering: runs at once, even while live)',
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      const cur = c.policy.window ?? DEFAULT_WINDOWS[c.call_category];
      const next: WindowPolicy = { ...i.window, ...(cur.crossMidnightReason && !i.window.crossMidnightReason ? { crossMidnightReason: cur.crossMidnightReason } : {}) };
      if (!isNarrowing(cur, next)) throw new ValidationError('window', 'M3.narrow_only: this widens the window; use campaign.window.widen (needs approval)');
      const warnings = await checkWindow(ctx.q, ctx.workspaceId, c.call_category, next, true);
      await setPolicy(ctx.q, c, { ...c.policy, window: next });
      return { id: c.id, window: describeWindow(next), policyVersion: c.policy_version + 1, warnings };
    },
  }));

  reg(tool(obj({ id: uuid(), window: windowV }), {
    name: 'campaign.window.widen', risk: 'policy', summary: 'Widen a campaign\'s calling window inside the category ceiling and the workspace band',
    describe: i => `Widen campaign ${i.id}'s window to ${describeWindow(i.window as WindowPolicy)}`,
    version: (ctx, i) => campaignVersion(ctx.q, ctx.workspaceId, i.id),
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      const warnings = await checkWindow(ctx.q, ctx.workspaceId, c.call_category, i.window, true);
      await setPolicy(ctx.q, c, { ...c.policy, window: i.window });
      return { id: c.id, window: describeWindow(i.window), policyVersion: c.policy_version + 1, warnings };
    },
  }));

  reg(tool(obj({ id: uuid(), contactIds: arr(uuid(), { min: 1, max: 1000 }) }), {
    name: 'campaign.audience.add', risk: 'external', summary: 'Add people to a campaign; a live campaign queues them for the dial gate',
    describe: i => `Add ${i.contactIds.length} people to campaign ${i.id}`,
    version: (ctx, i) => campaignVersion(ctx.q, ctx.workspaceId, i.id),
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id, true);
      if (['completed', 'cancelled'].includes(c.state)) throw new Error(`a ${c.state} campaign takes no new people`);
      const ids = [...new Set(i.contactIds)];
      const n = await one<{ n: number }>(ctx.q, 'SELECT count(*)::int AS n FROM contact WHERE workspace_id = $1 AND id = ANY($2)', [ctx.workspaceId, ids]);
      if (n!.n !== ids.length) throw new ValidationError('contactIds', 'a contact is not in this workspace');
      let audienceId = c.audience_id;
      if (!audienceId) {
        audienceId = (await one<{ id: string }>(ctx.q, "INSERT INTO audience (workspace_id, name) VALUES ($1, $2) RETURNING id", [ctx.workspaceId, `${c.name} audience`]))!.id;
      }
      const added = await ctx.q.query(`INSERT INTO audience_member (audience_id, contact_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [audienceId, ids]);
      await setPolicy(ctx.q, c, c.policy, { audience_id: audienceId });
      const queued = ['running', 'paused', 'scheduled'].includes(c.state)
        ? await enqueueCampaignAttempts(ctx.q, ctx.workspaceId, { ...c, audience_id: audienceId }, new Date(), ids) : 0;
      return { id: c.id, audienceId, added: added.rowCount ?? 0, queued };
    },
  }));

  reg(tool(obj({ outerBand: opt(range), holidays: opt(arr(str({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), { max: 60 })),
    campaignId: opt(uuid()), window: opt(windowV) }), {
    name: 'policy.window.set', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Set the workspace outer band and holidays, or a campaign window incl. across midnight (Compliance, with a reason)',
    describe: i => [i.outerBand ? `outer band ${i.outerBand.start}-${i.outerBand.end}` : '', i.holidays ? `${i.holidays.length} holidays` : '',
      i.campaignId && i.window ? `campaign ${i.campaignId} window ${describeWindow(i.window as WindowPolicy)}` : ''].filter(Boolean).join('; ') || 'no change',
    version: async (ctx, i) => {
      const p = await one<{ version: number }>(ctx.q, 'SELECT version FROM dial_policy WHERE workspace_id = $1', [ctx.workspaceId]);
      return `${p?.version ?? 0}:${i.campaignId ? await campaignVersion(ctx.q, ctx.workspaceId, i.campaignId) : '-'}`;
    },
    run: async (ctx, i) => {
      if (!i.outerBand && !i.holidays && !i.window) throw new ValidationError('', 'nothing to set');
      if (!!i.window !== !!i.campaignId) throw new ValidationError(i.window ? 'campaignId' : 'window', 'a campaign window needs both campaignId and window');
      const out: Record<string, unknown> = {};
      if (i.outerBand || i.holidays) {
        if (i.outerBand) validateOuterBand(i.outerBand);
        await ctx.q.query(`INSERT INTO dial_policy (workspace_id, outer_band, holidays) VALUES ($1, coalesce($2::jsonb, '{"start":"08:00","end":"21:00"}'), coalesce($3::jsonb, '[]'))
          ON CONFLICT (workspace_id) DO UPDATE SET outer_band = coalesce($2::jsonb, dial_policy.outer_band), holidays = coalesce($3::jsonb, dial_policy.holidays),
            version = dial_policy.version + 1, updated_at = now()`,
          [ctx.workspaceId, i.outerBand ? JSON.stringify(i.outerBand) : null, i.holidays ? JSON.stringify(i.holidays) : null]);
        out.workspace = await loadDialPolicy(ctx.q, ctx.workspaceId);
      }
      if (i.campaignId && i.window) {
        const c = await getCampaign(ctx.q, ctx.workspaceId, i.campaignId, true);
        out.warnings = await checkWindow(ctx.q, ctx.workspaceId, c.call_category, i.window, true);
        await setPolicy(ctx.q, c, { ...c.policy, window: i.window });
        out.campaign = { id: c.id, window: describeWindow(i.window), policyVersion: c.policy_version + 1 };
      }
      return out;
    },
  }));

  reg(tool(obj({ campaignId: uuid(), category: categoryV, reason: str({ min: 10, max: 500 }) }), {
    name: 'policy.category.override', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Change a campaign\'s call category, with a reason (a looser category is a Compliance decision)',
    describe: i => `Set campaign ${i.campaignId} to ${i.category} calls: "${i.reason}"`,
    version: (ctx, i) => campaignVersion(ctx.q, ctx.workspaceId, i.campaignId),
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.campaignId, true);
      if (!['draft', 'paused'].includes(c.state)) throw new Error('pause the campaign before changing its category');
      const category = i.category as CallCategory;
      const window = c.policy.window ?? DEFAULT_WINDOWS[category];
      const warnings = await checkWindow(ctx.q, ctx.workspaceId, category, window, true);
      await setPolicy(ctx.q, c, { ...c.policy, window, categoryOverride: { from: c.call_category, reason: i.reason, by: actorRef(ctx) } }, { call_category: category });
      await ctx.q.query("UPDATE attempt SET call_category = $2 WHERE campaign_id = $1 AND status = 'created'", [c.id, category]);
      return { id: c.id, from: c.call_category, to: category, warnings };
    },
  }));

  reg(tool(singleCallV, {
    name: 'call.place_single', risk: 'external', summary: 'Call one person now (or at a time), through the same dial gate as campaigns',
    describe: i => `Call contact ${i.contactId} with agent version ${i.agentVersionId} (${i.category})${i.at ? ' at ' + i.at : ''}`,
    run: async (ctx, i) => {
      const category = i.category as CallCategory;
      const contact = await one<{ id: string; timezone: string }>(ctx.q, 'SELECT id, timezone FROM contact WHERE id = $1 AND workspace_id = $2', [i.contactId, ctx.workspaceId]);
      if (!contact) throw new ValidationError('contactId', 'no such contact in this workspace');
      const v = await loadVersion(ctx.q, ctx.workspaceId, i.agentVersionId);
      if (!v) throw new ValidationError('agentVersionId', 'no such agent version in this workspace');
      if (v.config.agent?.category && v.config.agent.category !== category) throw new ValidationError('category', `M1.category_mismatch: this version is for ${v.config.agent.category} calls`);
      const at = i.at ? new Date(i.at) : new Date();
      if (category === 'promotional' && !promoBandAt(at, contact.timezone || 'Asia/Kolkata')) throw new ValidationError('at', PROMO_RULE);
      if (i.idempotencyKey) {
        const prev = await one<{ id: string; status: string }>(ctx.q, 'SELECT id, status FROM attempt WHERE workspace_id = $1 AND idempotency_key = $2', [ctx.workspaceId, i.idempotencyKey]);
        if (prev) return { attemptId: prev.id, status: prev.status, replayed: true };
      }
      const a = await one<{ id: string }>(ctx.q, `INSERT INTO attempt (workspace_id, contact_id, kind, scheduled_for, agent_version_id, call_category, facts, idempotency_key, requested_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [ctx.workspaceId, i.contactId, i.via ?? 'single', at, i.agentVersionId, category, JSON.stringify(i.facts ?? {}), i.idempotencyKey ?? null, actorRef(ctx)]);
      return { attemptId: a!.id, status: 'created', note: 'queued for the dial gate; attempt.list shows its precheck' };
    },
  }));

  reg(tool(obj({ agentVersionId: uuid(), phone: opt(str({ max: 20 })), asContactId: opt(uuid()), facts: opt(record(str({ max: 500 }), { maxKeys: 40 })) }), {
    name: 'test.ring_member_phone', risk: 'test', summary: 'Ring your own verified phone with this agent (optionally as a real row), so you hear what they will hear',
    run: async (ctx, i) => {
      const memberId = ctx.actor.type === 'member' ? ctx.actor.id : undefined;
      const phone = i.phone ? normaliseIndianPhone(i.phone) : null;
      if (phone && !phone.ok) throw new ValidationError('phone', `not a dialable Indian number (${phone.reason})`);
      const p = await one<{ e164: string }>(ctx.q, `SELECT e164 FROM verified_test_phone WHERE workspace_id = $1 AND verified_at IS NOT NULL
        AND ($2::text IS NULL OR e164 = $2) AND ($3::uuid IS NULL OR member_id = $3::uuid) ORDER BY created_at LIMIT 1`,
        [ctx.workspaceId, phone && phone.ok ? phone.e164 : null, memberId ?? null]);
      if (!p) throw new ValidationError('phone', 'test calls ring only your own verified phone; verify it first');
      const v = await loadVersion(ctx.q, ctx.workspaceId, i.agentVersionId);
      if (!v) throw new ValidationError('agentVersionId', 'no such agent version in this workspace');
      if (i.asContactId && !(await one(ctx.q, 'SELECT 1 FROM contact WHERE id = $1 AND workspace_id = $2', [i.asContactId, ctx.workspaceId])))
        throw new ValidationError('asContactId', 'no such contact in this workspace');
      const a = await one<{ id: string }>(ctx.q, `INSERT INTO attempt (workspace_id, contact_id, to_e164, kind, agent_version_id, call_category, facts, requested_by)
        VALUES ($1,$2,$3,'test',$4,$5,$6,$7) RETURNING id`,
        [ctx.workspaceId, i.asContactId ?? null, p.e164, i.agentVersionId, v.config.agent?.category ?? 'service', JSON.stringify(i.facts ?? {}), actorRef(ctx)]);
      return { attemptId: a!.id, status: 'created', ringing: 'your verified phone, never the row\'s number' };
    },
  }));

  // ---- numbers ----

  reg(tool(obj({ series: opt(seriesV), region: opt(str({ max: 40 })), limit: opt(num({ int: true, min: 1, max: 20 })) }), {
    name: 'number.search', risk: 'read', summary: 'Search numbers to rent in a series',
    run: async (_ctx, i) => ({ offers: await telephony().search({ series: i.series as Series | undefined, region: i.region, limit: i.limit ?? 5 }), provider: telephony().name }),
  }));

  reg(tool(obj({ offerRef: str({ min: 1, max: 120 }), displayName: opt(str({ max: 40 })) }), {
    name: 'number.rent', risk: 'spend', summary: 'Rent a number in the workspace\'s name (monthly rent at carrier cost)',
    describe: i => `Rent number offer ${i.offerRef} in your name; monthly rent is charged at carrier cost`,
    run: async (ctx, i) => {
      let r;
      try { r = await telephony().rent(i.offerRef); } catch (e) {
        if (e instanceof TelephonyDisabled) throw e;
        throw new UnknownOutcome('the carrier did not confirm the rental: ' + (e instanceof Error ? e.message : String(e)));
      }
      const n = await one<{ id: string }>(ctx.q, `INSERT INTO phone_number (workspace_id, e164, series, carrier, provider, provider_ref, monthly_rent_inr_milli, display_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.workspaceId, r.e164, r.series, r.carrier, telephony().name, r.providerRef, r.monthlyRentInrMilli, i.displayName ?? null]);
      return { numberId: n!.id, series: r.series, kycStatus: 'none', a2pStatus: 'undeclared', next: 'number.kyc.submit, then the A2P declaration' };
    },
  }));

  reg(tool(obj({ e164: str({ max: 20 }), series: seriesV, carrier: str({ min: 1, max: 60 }), trunkRef: str({ min: 1, max: 120 }) }), {
    name: 'number.byo.connect', risk: 'draft', summary: 'Connect a number the business already owns, on its own carrier',
    describe: i => `Connect your own ${i.series} line on ${i.carrier}`,
    run: async (ctx, i) => {
      const p = normaliseIndianPhone(i.e164);
      if (!p.ok) throw new ValidationError('e164', `not an Indian number (${p.reason})`);
      const r = await telephony().connectByo({ e164: p.e164, carrier: i.carrier, trunkRef: i.trunkRef });
      const n = await one<{ id: string }>(ctx.q, `INSERT INTO phone_number (workspace_id, e164, series, carrier, byo, provider, provider_ref)
        VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id`, [ctx.workspaceId, p.e164, i.series, i.carrier, telephony().name, r.providerRef]);
      return { numberId: n!.id };
    },
  }));

  reg(tool(obj({ numberId: uuid(), documents: arr(obj({ kind: str({ min: 1, max: 40 }), ref: str({ min: 1, max: 200 }) }), { min: 1, max: 10 }) }), {
    name: 'number.kyc.submit', risk: 'policy', summary: 'Send the KYC documents for a line to its carrier',
    describe: i => `Send ${i.documents.length} KYC documents for line ${i.numberId} to its carrier`,
    run: async (ctx, i) => {
      const n = await one<{ id: string; provider_ref: string | null; kyc_status: string }>(ctx.q, 'SELECT id, provider_ref, kyc_status FROM phone_number WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.numberId, ctx.workspaceId]);
      if (!n) throw new ValidationError('numberId', 'no such line in this workspace');
      if (n.kyc_status === 'verified') return { numberId: n.id, kycStatus: 'verified', already: true };
      const r = await telephony().submitKyc(n.provider_ref ?? n.id, i.documents);
      await ctx.q.query("UPDATE phone_number SET kyc_status = 'submitted', kyc_ref = $2 WHERE id = $1", [n.id, r.ref]);
      return { numberId: n.id, kycStatus: 'submitted', ref: r.ref, expect: 'about 7-14 business days; browser and trial-line tests continue meanwhile' };
    },
  }));

  reg(tool(obj({ numberId: uuid(), reason: str({ min: 1, max: 200 }) }), {
    name: 'number.pause', risk: 'external', roles: ['owner', 'builder', 'operator', 'compliance'], summary: 'Pause a line; every campaign using it waits (VP itself pauses a flagged line at once with number.pause_flagged)',
    run: async (ctx, i) => {
      const r = await ctx.q.query("UPDATE phone_number SET status = 'paused', pause_cause = $3, paused_at = now() WHERE id = $1 AND workspace_id = $2 AND status <> 'released'", [i.numberId, ctx.workspaceId, 'person:' + i.reason]);
      if (!r.rowCount) throw new ValidationError('numberId', 'no such line in this workspace');
      return { numberId: i.numberId, status: 'paused' };
    },
  }));

  reg(tool(obj({ numberId: uuid(), flag: str({ min: 1, max: 120 }) }), {
    name: 'number.pause_flagged', risk: 'external', summary: 'Pause a flagged line and name it (never silently replaced or rotated)',
    describe: i => `Pause line ${i.numberId}: ${i.flag}`,
    run: async (ctx, i) => {
      const r = await ctx.q.query(`UPDATE phone_number SET status = 'paused', pause_cause = $3, paused_at = now(),
          health = health || jsonb_build_object('flag', $3::text, 'flaggedAt', now()) WHERE id = $1 AND workspace_id = $2 AND status <> 'released'`,
        [i.numberId, ctx.workspaceId, 'flagged:' + i.flag]);
      if (!r.rowCount) throw new ValidationError('numberId', 'no such line in this workspace');
      return { numberId: i.numberId, status: 'paused', cause: 'flagged:' + i.flag };
    },
  }));

  reg(tool(obj({ numberId: uuid(), status: str({ oneOf: ['verified', 'rejected'] }), evidence: record(str({ max: 500 }), { maxKeys: 20 }) }), {
    name: 'number.kyc.sync', risk: 'draft', roles: [],
    summary: 'Record the carrier\'s KYC decision for a line (carrier webhook or VP Success only; never a workspace member)',
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'system' && ctx.actor.type !== 'vp_success') throw new Error('only the carrier webhook or VP Success records a KYC decision');
      if (!Object.keys(i.evidence).length) throw new ValidationError('evidence', 'say what the carrier sent (e.g. its reference and decision time)');
      const n = await one<{ id: string; kyc_status: string }>(ctx.q, 'SELECT id, kyc_status FROM phone_number WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.numberId, ctx.workspaceId]);
      if (!n) throw new ValidationError('numberId', 'no such line in this workspace');
      if (n.kyc_status === i.status) return { numberId: n.id, kycStatus: n.kyc_status, already: true };
      if (n.kyc_status !== 'submitted') throw new Error(`the line's KYC is ${n.kyc_status}; only a submitted KYC can be decided`);
      await ctx.q.query('UPDATE phone_number SET kyc_status = $2, kyc_evidence = $3, kyc_decided_at = now() WHERE id = $1', [n.id, i.status, JSON.stringify(i.evidence)]);
      return { numberId: n.id, kycStatus: i.status };
    },
  }));

  reg(tool(obj({ numberId: uuid(), a2pRef: str({ min: 3, max: 120 }), evidence: str({ min: 3, max: 500, desc: 'what shows the operator accepted it: the portal reference, date, who submitted' }) }), {
    name: 'number.a2p.declare', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Record that a line is declared for A2P (AI voice) on DLT, with the operator\'s reference',
    describe: i => `Record line ${i.numberId} as A2P-declared on DLT, reference ${i.a2pRef}`,
    version: async (ctx, i) => (await one<{ v: string }>(ctx.q, "SELECT a2p_status || ':' || coalesce(a2p_ref, '') AS v FROM phone_number WHERE id = $1 AND workspace_id = $2", [i.numberId, ctx.workspaceId]))?.v ?? null,
    run: async (ctx, i) => {
      const n = await one<{ id: string; series: string; status: string }>(ctx.q, 'SELECT id, series, status FROM phone_number WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [i.numberId, ctx.workspaceId]);
      if (!n) throw new ValidationError('numberId', 'no such line in this workspace');
      if (n.series === 'trial') throw new ValidationError('numberId', 'a trial line is never declared; it only rings verified member phones');
      if (n.status === 'released') throw new Error('the line is released');
      await ctx.q.query("UPDATE phone_number SET a2p_status = 'declared', a2p_ref = $2, a2p_evidence = $3, a2p_declared_at = now() WHERE id = $1", [n.id, i.a2pRef, i.evidence]);
      return { numberId: n.id, a2pStatus: 'declared', a2pRef: i.a2pRef };
    },
  }));

  reg(tool(obj({ format: opt(str({ oneOf: ['json', 'csv'] })) }), {
    name: 'a2p.declaration.export', risk: 'read', summary: 'Export the A2P declaration pack for this workspace\'s lines (CSV or JSON)',
    run: async (ctx, i) => {
      const brand = await one<{ legal_name: string; dlt_entity_id: string | null; sector: string | null }>(ctx.q,
        'SELECT legal_name, dlt_entity_id, sector FROM brand WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [ctx.workspaceId]);
      const lines = await many<{ id: string; e164: string; series: string; carrier: string; a2p_status: string; a2p_ref: string | null; daily: string; peak: number | null; categories: string[] | null }>(ctx.q,
        `SELECT n.id, n.e164, n.series, n.carrier, n.a2p_status, n.a2p_ref,
           round(coalesce((SELECT count(*) FROM attempt a WHERE a.number_id = n.id AND a.dialed_at > now() - interval '30 days'), 0) / 30.0, 1)::text AS daily,
           (SELECT max(c) FROM (SELECT count(*)::int AS c FROM attempt a WHERE a.number_id = n.id AND a.dialed_at > now() - interval '30 days' GROUP BY a.dialed_at::date) d) AS peak,
           (SELECT array_agg(DISTINCT a.call_category) FROM attempt a WHERE a.number_id = n.id AND a.call_category IS NOT NULL) AS categories
         FROM phone_number n WHERE n.workspace_id = $1 AND n.status <> 'released' AND n.series <> 'trial' ORDER BY n.created_at`, [ctx.workspaceId]);
      const rows = lines.map(l => ({
        cli: l.e164, series: l.series, a2pAiVoice: 'yes', category: (l.categories ?? []).join('|') || (l.series === '140' ? 'promotional' : 'service'),
        dailyVolume: Number(l.daily), peakVolume: l.peak ?? 0, operator: l.carrier,
        status: l.a2p_status === 'declared' ? 'confirmed' : l.a2p_ref ? 'submitted' : 'pack ready',
      }));
      const pack = { legalEntity: brand?.legal_name ?? null, dltEntityId: brand?.dlt_entity_id ?? null, sector: brand?.sector ?? null,
        preparedBy: actorRef(ctx), reviewedBy: null, generatedAt: new Date().toISOString(), lines: rows,
        missing: [...(!brand ? ['brand'] : []), ...(!brand?.dlt_entity_id ? ['dlt_entity_id'] : [])] };
      if (i.format !== 'csv') return pack;
      const head = ['cli', 'series', 'a2pAiVoice', 'category', 'dailyVolume', 'peakVolume', 'operator', 'status'] as const;
      const csv = [head.join(','), ...rows.map(r => head.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
      return { ...pack, csv };
    },
  }));

  reg(tool(obj({ contactId: uuid(), reason: str({ min: 3, max: 120 }) }), {
    name: 'attempt.cancel_for_contact', risk: 'draft', roles: [],
    summary: 'Cancel every attempt still queued for a person (erasure and other system paths only)',
    run: async (ctx, i) => {
      if (ctx.actor.type !== 'system' && ctx.actor.type !== 'vp_success') throw new Error('only a system path cancels a person\'s queued attempts');
      return cancelContactAttempts(ctx.q, ctx.workspaceId, i.contactId, i.reason);
    },
  }));

  // ---- member phone verification (verify.ts) ----

  const ALL_MEMBERS = ['owner', 'builder', 'operator', 'compliance', 'viewer'] as const;
  reg(tool(obj({ phone: str({ min: 6, max: 20 }) }), {
    name: 'member.phone.verify_start', risk: 'test', roles: ALL_MEMBERS,
    summary: 'Ring your own phone once with a 6-digit code (09:00-21:00 IST; rate-limited), so test calls can reach it',
    run: (ctx, i) => verifyStart(ctx, i),
  }));
  reg(tool(obj({ phone: str({ min: 6, max: 20 }), code: str({ pattern: /^\d{6}$/ }) }), {
    name: 'member.phone.verify_confirm', risk: 'draft', roles: ALL_MEMBERS,
    summary: 'Confirm the code you heard; the phone becomes yours to ring with test calls',
    run: (ctx, i) => verifyConfirm(ctx, i),
  }));

  reg(tool(obj({ status: opt(str({ oneOf: ['active', 'paused', 'released'] })), limit: opt(num({ int: true, min: 1, max: 200 })), cursor: opt(str({ max: 120 })) }), {
    name: 'number.list', risk: 'read', summary: 'Your calling lines: series, KYC, A2P, status, dates and the campaigns using each',
    run: async (ctx, i) => {
      const limit = i.limit ?? 50;
      const [cAt, cId] = i.cursor ? i.cursor.split('|') : [null, null];
      if (i.cursor && (!cAt || !cId || Number.isNaN(Date.parse(cAt)))) throw new ValidationError('cursor', 'use the nextCursor from the previous page');
      const rows = await many<Record<string, unknown> & { id: string; created_at: Date }>(ctx.q, `SELECT n.id, n.e164, n.series, (n.series = 'trial') AS trial, n.status, n.kyc_status,
          n.a2p_status, n.a2p_ref, n.carrier, n.byo, n.display_name, n.created_at, n.paused_at, n.pause_cause,
          coalesce((SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'state', c.state) ORDER BY c.created_at)
            FROM campaign c WHERE c.workspace_id = n.workspace_id AND c.state IN ('draft','scheduled','running','paused')
              AND (c.policy->'cliPool' ? n.id::text OR EXISTS (SELECT 1 FROM attempt a WHERE a.campaign_id = c.id AND a.number_id = n.id))), '[]') AS campaigns
        FROM phone_number n WHERE n.workspace_id = $1 AND ($2::text IS NULL OR n.status = $2)
          AND ($3::timestamptz IS NULL OR (n.created_at, n.id) < ($3::timestamptz, $4::uuid))
        ORDER BY n.created_at DESC, n.id DESC LIMIT $5`, [ctx.workspaceId, i.status ?? null, cAt, cId, limit + 1]);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return { numbers: page, nextCursor: rows.length > limit && last ? `${last.created_at.toISOString()}|${last.id}` : null };
    },
  }));

  // ---- reads ----

  reg(tool(obj({ state: opt(str({ oneOf: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'] })), limit: opt(num({ int: true, min: 1, max: 200 })) }), {
    name: 'campaign.list', risk: 'read', summary: 'List campaigns with their state and attempt counts',
    run: async (ctx, i) => ({
      campaigns: await many(ctx.q, `SELECT c.id, c.name, c.call_category AS category, c.state, c.pause_cause, c.policy_version, c.created_at, c.launched_at,
          (SELECT count(*)::int FROM attempt a WHERE a.campaign_id = c.id) AS attempts,
          (SELECT count(*)::int FROM attempt a WHERE a.campaign_id = c.id AND a.status = 'blocked') AS blocked
        FROM campaign c WHERE c.workspace_id = $1 AND ($2::text IS NULL OR c.state = $2) ORDER BY c.created_at DESC LIMIT $3`,
        [ctx.workspaceId, i.state ?? null, i.limit ?? 50]),
    }),
  }));

  reg(tool(obj({ id: uuid() }), {
    name: 'campaign.get', risk: 'read', summary: 'One campaign: policy, state, attempt counts by status and code, and every launch blocker',
    run: async (ctx, i) => {
      const c = await getCampaign(ctx.q, ctx.workspaceId, i.id);
      const counts = await many(ctx.q, `SELECT status, blocked_by, count(*)::int AS n FROM attempt WHERE campaign_id = $1 AND workspace_id = $2
        GROUP BY status, blocked_by ORDER BY n DESC`, [c.id, ctx.workspaceId]);
      return { campaign: c, counts, blockers: c.state === 'draft' ? await launchBlockers(ctx.q, ctx.workspaceId, c) : [], version: await campaignVersion(ctx.q, ctx.workspaceId, c.id) };
    },
  }));

  reg(tool(obj({ campaignId: opt(uuid()), contactId: opt(uuid()), status: opt(str({ max: 30 })), limit: opt(num({ int: true, min: 1, max: 500 })) }), {
    name: 'attempt.list', risk: 'read', summary: 'Attempts with their precheck: why someone was or was not called, and when they next can be',
    run: async (ctx, i) => ({
      attempts: await many(ctx.q, `SELECT id, campaign_id, contact_id, kind, status, blocked_by, next_eligible_at, scheduled_for, precheck, number_id, cli_e164,
          outcome_class, retry_of, dialed_at, dispatched_at, conversation_id, created_at
        FROM attempt WHERE workspace_id = $1 AND ($2::uuid IS NULL OR campaign_id = $2::uuid) AND ($3::uuid IS NULL OR contact_id = $3::uuid)
          AND ($4::text IS NULL OR status = $4) ORDER BY created_at DESC LIMIT $5`,
        [ctx.workspaceId, i.campaignId ?? null, i.contactId ?? null, i.status ?? null, i.limit ?? 100]),
    }),
  }));

  // ---- the ladder (A3 when VP runs it) ----

  reg(tool(obj({ attemptId: uuid(), outcome: str({ oneOf: OUTCOME_CLASSES }), at: opt(iso()) }), {
    name: 'attempt.retry_per_ladder', risk: 'external', summary: 'Schedule the next attempt by the retry ladder for this outcome (unknown outcomes are never retried)',
    describe: i => `Retry attempt ${i.attemptId} after a ${i.outcome} outcome`,
    run: async (ctx, i) => {
      const outcome = i.outcome as OutcomeClass;
      const a = await one<{ id: string; campaign_id: string | null; contact_id: string | null; to_e164: string | null; kind: string; agent_version_id: string | null;
        call_category: string | null; facts: unknown; dialed_at: Date | null; created_at: Date; api_key_id: string | null }>(ctx.q,
        `SELECT id, campaign_id, contact_id, to_e164, kind, agent_version_id, call_category, facts, dialed_at, created_at, api_key_id
         FROM attempt WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [i.attemptId, ctx.workspaceId]);
      if (!a) throw new ValidationError('attemptId', 'no such attempt in this workspace');
      const rule = RETRY_LADDER[outcome];
      await ctx.q.query('UPDATE attempt SET outcome_class = $2, counts_to_budget = counts_to_budget AND $3 WHERE id = $1', [a.id, outcome, rule.countsToBudget]);
      if (a.kind === 'test') return { scheduled: false, reason: 'test calls are not retried' };
      if (!rule.steps.length) return { scheduled: false, reason: outcome === 'unknown' ? 'unknown outcomes are never retried automatically' : `no retry after ${outcome}` };
      const existing = await one<{ id: string }>(ctx.q, 'SELECT id FROM attempt WHERE workspace_id = $1 AND idempotency_key = $2', [ctx.workspaceId, 'retry:' + a.id]);
      if (existing) return { scheduled: true, attemptId: existing.id, replayed: true };
      const prior = await one<{ n: number }>(ctx.q, `WITH RECURSIVE chain AS (
          SELECT id, retry_of, outcome_class FROM attempt WHERE id = $1
          UNION ALL SELECT p.id, p.retry_of, p.outcome_class FROM attempt p JOIN chain ch ON p.id = ch.retry_of)
        SELECT count(*)::int - 1 AS n FROM chain WHERE outcome_class = $2`, [a.id, outcome]);
      const step = rule.steps[prior!.n];
      if (step === undefined) return { scheduled: false, reason: `the ladder for ${outcome} is used up (${rule.steps.length})` };
      let window = DEFAULT_WINDOWS[(a.call_category as CallCategory) ?? 'service'], tz = 'Asia/Kolkata';
      if (a.campaign_id) {
        const c = await getCampaign(ctx.q, ctx.workspaceId, a.campaign_id);
        if (['completed', 'cancelled'].includes(c.state)) return { scheduled: false, reason: `the campaign is ${c.state}` };
        window = c.policy.window ?? window;
      }
      if (a.contact_id) tz = (await one<{ timezone: string }>(ctx.q, 'SELECT timezone FROM contact WHERE id = $1', [a.contact_id]))?.timezone ?? tz;
      const at = retryAt(step, a.dialed_at ?? new Date(), tz, window, i.at);
      const kind = outcome === 'callback' || outcome === 'relative_answered' ? 'callback' : 'retry';
      const n = await one<{ id: string }>(ctx.q, `INSERT INTO attempt (workspace_id, campaign_id, contact_id, to_e164, kind, scheduled_for, agent_version_id, call_category,
          facts, retry_of, idempotency_key, api_key_id, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [ctx.workspaceId, a.campaign_id, a.contact_id, a.to_e164, kind, at, a.agent_version_id, a.call_category, JSON.stringify(a.facts ?? {}),
          a.id, 'retry:' + a.id, a.api_key_id, actorRef(ctx)]);
      return { scheduled: true, attemptId: n!.id, at: at?.toISOString(), step: prior!.n + 1, of: rule.steps.length };
    },
  }));
}

export const module: Module = {
  name: 'campaigns',
  register: registerCampaignTools,
  routes(router, deps) {
    router.add('POST', '/hooks/telephony/kyc', kycHook(deps), { rawBody: true, limit: 64_000 });
  },
  // The dial loop: claim + gate + dispatch. Jobs never overlap and hold a per-name advisory lock, so replicas are safe;
  // SKIP LOCKED makes even concurrent claimers safe.
  jobs: deps => [{ name: 'campaigns.dispatch', everyMs: 2_000, run: async d => { await tick({ pool: d.pool, registry: d.registry }); } }],
};

const kycEvent = obj({ provider: str({ min: 1, max: 40 }), eventId: str({ min: 1, max: 120 }), providerRef: str({ min: 1, max: 120 }),
  status: str({ oneOf: ['verified', 'rejected'] }), evidence: opt(record(str({ max: 500 }), { maxKeys: 20 })) });

/** POST /hooks/telephony/kyc: the carrier (or its relay) reports a KYC decision. Signed like the runtime seam
 *  (x-vp-signature: t=<ms>,v1=hmac_sha256(VP_TELEPHONY_WEBHOOK_SECRET, t + '.' + raw body)), recorded once per
 *  (provider, eventId), applied through number.kyc.sync as a system actor so the registry audits it. */
export function kycHook(deps: Deps) {
  return async (req: Req): Promise<Res> => {
    const secret = process.env.VP_TELEPHONY_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new HttpError(503, 'not_configured', 'the telephony webhook is not configured');
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const sig = req.headers['x-vp-signature'];
    if (!raw || typeof sig !== 'string' || !verify(secret, raw, sig)) throw new HttpError(401, 'bad_signature', 'the signature is missing, stale or wrong');
    let e;
    try { e = kycEvent(JSON.parse(raw)); } catch (err) {
      throw new HttpError(err instanceof ValidationError ? 422 : 400, 'bad_body', err instanceof Error ? err.message : 'the body is not valid JSON');
    }
    if (await one(deps.pool, 'SELECT 1 FROM telephony_event WHERE provider = $1 AND event_id = $2', [e.provider, e.eventId])) return { body: { duplicate: true } };
    const lines = await many<{ id: string; workspace_id: string }>(deps.pool, 'SELECT id, workspace_id FROM phone_number WHERE provider = $1 AND provider_ref = $2', [e.provider, e.providerRef]);
    if (lines.length !== 1) throw new HttpError(lines.length ? 409 : 404, 'unknown_line', lines.length ? 'that reference matches more than one line' : 'no line with that provider reference');
    const r = await deps.registry.execute(deps.pool, 'number.kyc.sync', { numberId: lines[0].id, status: e.status, evidence: { ...(e.evidence ?? {}), provider: e.provider, eventId: e.eventId } },
      { workspaceId: lines[0].workspace_id, actor: { type: 'system', id: 'telephony.kyc_hook' } });
    if (r.status !== 'confirmed') throw new HttpError(409, 'not_applied', r.status === 'not_executed' || r.status === 'unknown' ? r.reason : 'not applied');
    await deps.pool.query('INSERT INTO telephony_event (provider, event_id, workspace_id, kind, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [e.provider, e.eventId, lines[0].workspace_id, 'kyc', JSON.stringify(e)]);
    return { body: { applied: true, result: r.result } };
  };
}
