// The dial gate G1-G12 (trust-telephony §6). One function, run INSIDE the transaction that claims an attempt, for
// every path: campaign, api, single, test, retry, callback, transfer. It holds money before any I/O (G9) and
// releases the hold itself when a later check refuses. Every check fails closed: a check that cannot run (a bad
// time zone, a query error) refuses with check_unavailable, inside a savepoint so the claim can still record why.
import { createHash, createHmac } from 'node:crypto';
import type { AgentConfig, CallCategory } from '../../../shared/agent-config.ts';
import { numberHash } from '../../identity.ts';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { stackOf } from '../../../shared/stacks.ts';
import type { Queryable } from '../../db.ts';
import { many, one } from '../../db.ts';
import { release, reserve } from '../../ledger.ts';
import {
  A2P_DUE, DEFAULT_CONCURRENCY, DND_FRESH_S, DEFAULT_MAX_DURATION_S, DEFAULT_OUTER_BAND, DEFAULT_PER_MINUTE_INR_MILLI, DEFAULT_PERSON_BUDGET,
  DEFAULT_WINDOWS, GATE_VERSION, NUMBER_DAILY_CEILING, NUMBER_GAP_MIN, OUTER_BAND_LIMIT, PREDIAL_TIMEOUT_MS, TEN_DIGIT_CLI_DAILY_CAP,
  type PersonBudget, type TimeRange, type WindowPolicy,
} from './defaults.ts';
import { routeSeries, type Series } from './telephony.ts';
import { addDays, eligibility, localNow, localToUtc } from './windows.ts';

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10' | 'G11' | 'G12';
export type GateCode =
  | 'workspace_not_verified' | 'identifier_invalid' | 'destination_blocked' | 'erased' | `suppressed:${string}`
  | 'no_basis' | 'consent_expired' | 'dnd_blocked_by_operator' | 'out_of_window' | 'budget_exhausted'
  | 'cli_wrong_series' | 'cli_undeclared' | 'cli_paused' | 'kyc_lapsed' | 'cap_reached' | 'wallet_low'
  | 'version_not_publishable' | 'pack_missing' | 'predial_veto' | 'predial_timeout' | 'deferred_concurrency' | 'check_unavailable';

export interface CheckResult { gate: GateId; ok: boolean; code?: GateCode; detail?: string; nextEligibleAt?: string }

export type AttemptKind = 'campaign' | 'api' | 'single' | 'test' | 'retry' | 'callback' | 'transfer';
export interface AttemptRow {
  id: string; workspace_id: string; campaign_id: string | null; contact_id: string | null; to_e164: string | null;
  kind: AttemptKind; agent_version_id: string | null; call_category: CallCategory | null; facts: Record<string, string>;
  api_key_id: string | null; scheduled_for: Date;
}

export interface CampaignRow {
  id: string; workspace_id: string; name: string; call_category: CallCategory; policy: CampaignPolicy; policy_version: number;
  state: string; agent_version_id: string | null; audience_id: string | null; budget_id: string | null;
}
export interface CampaignPolicy {
  window?: WindowPolicy; budgets?: PersonBudget; concurrency?: number; cliPool?: string[]; perMinuteInrMilli?: number;
  maxDurationS?: number; predial?: { url: string }; capInrMilli?: number; startAt?: string; endAt?: string;
  reviewStopAfter?: number; preset?: string; categoryOverride?: { from: CallCategory; reason: string; by: string };
}

export interface VersionRow { id: string; hash: string; config: { agent?: AgentConfig; brief?: { text: string; hash: string; bytes: number }; lint?: { ok: boolean } }; agent_status: string; agent_id: string }
export interface ContactRow { id: string; e164: string; name: string | null; language: string | null; timezone: string; custom: Record<string, unknown>; erased_at?: Date | null }
export interface NumberRow { id: string; e164: string; series: Series; carrier: string; status: string; kyc_status: string; a2p_status: string }
export interface DialPolicy { outer_band: TimeRange; concurrency: number; sector: string | null; sector_packs: string[]; holidays: string[] }

export type PredialFn = (url: string, payload: Record<string, unknown>, timeoutMs: number) => Promise<{ allow: boolean; reason?: string }>;
/** Provider cost per connected minute for a stack (the money module's money.estimate), or null when unknown. */
export type RateFn = (q: Queryable, ws: string, stackId: string, minutes: number) => Promise<number | null>;
export interface GateDeps { now: Date; predial?: PredialFn; rate?: RateFn }

export type ConsentBasis = 'consent' | 'contract' | 'legitimate_use' | 'inbound';
export interface GatePass {
  allowed: true; trace: CheckResult[]; warnings: string[]; gateVersion: string;
  target: string; contact: ContactRow | null; campaign: CampaignRow | null; version: VersionRow; category: CallCategory;
  number: NumberRow; reservationId: string; reservedInrMilli: number; maxDurationS: number;
  consent: { basis: ConsentBasis; recordId?: string };
}
export interface GateRefusal {
  allowed: false; outcome: 'blocked' | 'deferred'; gate: GateId; code: GateCode; detail?: string; nextEligibleAt: Date | null;
  trace: CheckResult[]; warnings: string[]; gateVersion: string; capScope?: string; campaign: CampaignRow | null;
}
export type GateVerdict = GatePass | GateRefusal;

class Refuse { constructor(public code: GateCode, public detail?: string, public next?: Date | null, public defer = false) {} }

/** Hashes a tombstone may carry for a number: plain sha256 and HMAC with the workspace id as salt (memory-omni:
 *  "HMAC of identifiers with a tenant salt"). The intake module's exact salt is a seam (STATUS.json needs_from_others). */
export function tombstoneHashes(workspaceId: string, e164: string): string[] {
  return [createHash('sha256').update(e164).digest('hex'), createHmac('sha256', workspaceId).update(e164).digest('hex')];
}

/** The stable source class in a G4 code. A source may carry an instance id ('call:<conversationId>', 'import:<receiptId>');
 *  the code keeps only the class so reports group by it, and the refusal detail keeps the full source. */
export function suppressionSource(source: string | null): string {
  if (!source) return 'workspace';
  const cls = source.split(':')[0].trim().toLowerCase();
  return cls === 'call' ? 'in_call' : cls || 'workspace';
}

interface ConsentRow { id: string; purpose: string; basis: string; granted: boolean; evidence: Record<string, unknown> | null; created_at: Date; effective_at: string | null }
const parseTime = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;   // ISO only: '31/12/2025' is unreadable, never a guess
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};
/** When consent was given or withdrawn, on the database clock only: intake's effective_at (the source's stated time,
 *  clamped by a trigger to the insert time), else created_at. An app-clock time (evidence.statedAt) is never compared with a
 *  database-clock time: a fast app server would make an earlier grant look newer than a later withdrawal. */
function effectiveAt(r: ConsentRow): number {
  if (r.effective_at) { const t = Date.parse(r.effective_at); if (!Number.isNaN(t)) return t; }
  return r.created_at.getTime();
}
/** A grant must be this much newer than the latest withdrawal to count: on a tie or near-tie, the withdrawal wins. */
const WITHDRAWAL_MARGIN_MS = 1000;

/** A present but unreadable expiry fails closed: the consent counts as expired. */
function expiry(r: ConsentRow, now: Date): 'live' | 'expired' | 'unreadable' {
  const given = effectiveAt(r);
  let ex: number | null = null;
  if (r.evidence?.expiresAt !== undefined && r.evidence?.expiresAt !== null && r.evidence?.expiresAt !== '') {
    ex = parseTime(r.evidence.expiresAt);
    if (ex === null) return 'unreadable';
  } else if (r.basis === 'inquiry') ex = given + 7 * 864e5;
  else if (r.basis === 'application') ex = given + 90 * 864e5;
  return ex !== null && ex <= now.getTime() ? 'expired' : 'live';
}

const DND_REGISTERED = ['registered', 'dnd', 'blocked', 'fully_blocked', 'partially_blocked'];
const PURPOSE_ALL = ['all', 'voice', 'any'];

/** Default HTTP predial: POST JSON, 800 ms, anything but a 2xx {"allow": true} is a refusal. */
export const httpPredial: PredialFn = async (url, payload, timeoutMs) => {
  try {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`predial returned ${r.status}`);
    const j = await r.json() as { allow?: unknown; reason?: unknown };
    return { allow: j.allow === true, reason: typeof j.reason === 'string' ? j.reason.slice(0, 200) : undefined };
  } catch (e) { throw new Error('predial_timeout: ' + (e instanceof Error ? e.message : String(e))); }
};

export async function loadDialPolicy(q: Queryable, ws: string): Promise<DialPolicy> {
  const p = await one<DialPolicy>(q, 'SELECT outer_band, concurrency, sector, sector_packs, holidays FROM dial_policy WHERE workspace_id = $1', [ws]);
  return p ?? { outer_band: DEFAULT_OUTER_BAND, concurrency: DEFAULT_CONCURRENCY, sector: null, sector_packs: ['base'], holidays: [] };
}

export async function loadVersion(q: Queryable, ws: string, id: string | null): Promise<VersionRow | null> {
  if (!id) return null;
  return one<VersionRow>(q, `SELECT v.id, v.hash, v.config, a.status AS agent_status, a.id AS agent_id FROM agent_version v
    JOIN agent a ON a.id = v.agent_id WHERE v.id = $1 AND a.workspace_id = $2`, [id, ws]);
}

/** An attempt holds a line while it is dialling or its call is live. The calls module leaves 'connected' as the final
 *  status once a call ends, so the conversation row, not the attempt status, says whether the line is still in use. */
export const LIVE_ATTEMPT = `((a.status IN ('dialing','ringing','connected')
    AND NOT EXISTS (SELECT 1 FROM conversation cv WHERE cv.attempt_id = a.id AND cv.status <> 'live'))
  OR (a.status = 'unknown' AND EXISTS (SELECT 1 FROM conversation cv WHERE cv.attempt_id = a.id AND cv.status = 'live')))`;

const DEFERRABLE: GateCode[] = ['out_of_window', 'budget_exhausted', 'deferred_concurrency', 'check_unavailable'];

export async function runGate(q: Queryable, a: AttemptRow, deps: GateDeps): Promise<GateVerdict> {
  const now = deps.now;
  const ws = a.workspace_id;
  const test = a.kind === 'test';
  const trace: CheckResult[] = [];
  const warnings: string[] = [];
  let reservationId: string | null = null;

  // Data the checks read. A row from another workspace is never loaded: every query filters by workspace_id.
  const campaign = a.campaign_id ? await one<CampaignRow>(q, `SELECT id, workspace_id, name, call_category, policy, policy_version, state, agent_version_id, audience_id, budget_id
    FROM campaign WHERE id = $1 AND workspace_id = $2`, [a.campaign_id, ws]) : null;
  const contact = a.contact_id ? await one<ContactRow>(q, 'SELECT id, e164, name, language, timezone, custom, erased_at FROM contact WHERE id = $1 AND workspace_id = $2', [a.contact_id, ws]) : null;
  const version = await loadVersion(q, ws, a.agent_version_id ?? campaign?.agent_version_id ?? null);
  const agent = version?.config?.agent;
  const category: CallCategory = campaign?.call_category ?? a.call_category ?? agent?.category ?? 'promotional';
  const policy: CampaignPolicy = campaign?.policy ?? {};
  const dp = await loadDialPolicy(q, ws);
  const tz = (!test && contact?.timezone) || 'Asia/Kolkata';   // a test rings a member's phone; the row only lends its variables
  let target = '';
  let targetHash = '';
  let number: NumberRow | null = null;
  let consent: GatePass['consent'] = { basis: 'consent' };
  let reserved = 0, maxDurationS = 0;

  const checks: [GateId, () => Promise<void>][] = [
    ['G1', async () => {
      const w = await one<{ status: string }>(q, 'SELECT status FROM workspace WHERE id = $1', [ws]);
      if (!w || w.status !== 'active') throw new Refuse('workspace_not_verified', `workspace is ${w?.status ?? 'missing'}`);
      if (a.campaign_id && !campaign) throw new Refuse('workspace_not_verified', 'campaign not in this workspace');
      if (!test) {
        const b = await one(q, 'SELECT 1 FROM brand WHERE workspace_id = $1 AND dlt_entity_id IS NOT NULL LIMIT 1', [ws]);
        if (!b) throw new Refuse('workspace_not_verified', 'production calls need a verified brand (DLT entity id)');
      }
    }],
    ['G2', async () => {
      if (!test && !contact) throw new Refuse('identifier_invalid', 'no such contact in this workspace');
      // An erased person is never dialled, whatever else is left behind: the husk's e164 ('erased:<uuid>') must never
      // be normalised into somebody else's number.
      if (!test && (contact!.erased_at || /^erased:/i.test(contact!.e164))) throw new Refuse('erased', 'this person was erased');
      const raw = test ? a.to_e164 : contact!.e164;
      const n = normaliseIndianPhone(raw);
      if (!n.ok) throw new Refuse(n.reason === 'NON_INDIAN' ? 'destination_blocked' : 'identifier_invalid', n.reason);
      target = n.e164;
      if (test) {
        const v = await one(q, 'SELECT 1 FROM verified_test_phone WHERE workspace_id = $1 AND e164 = $2 AND verified_at IS NOT NULL', [ws, target]);
        if (!v) throw new Refuse('destination_blocked', 'test calls ring only a member phone verified in this workspace');
      }
      // Serialise every path that could ring this number, so two campaigns cannot both pass G7 for it at once.
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['dial:' + ws + ':' + target]);
    }],
    ['G3', async () => {
      // The intake module writes tombstones as HMAC(per-workspace salt, E.164) (server/identity.ts); the two legacy
      // shapes are still checked so a tombstone written any earlier way also stops the call.
      targetHash = await numberHash(q, ws, target);
      const t = await one(q, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = ANY($2)', [ws, [targetHash, ...tombstoneHashes(ws, target)]]);
      if (t) throw new Refuse('erased', 'this person asked to be forgotten');
    }],
    ['G4', async () => {
      // After an erasure a suppression keeps only the number's hash (e164 is NULL), so match by hash too.
      const s = await one<{ scope: string; source: string | null; reason: string }>(q, `SELECT scope, source, reason FROM suppression
        WHERE workspace_id = $1 AND (e164 = $2 OR e164_hash = $5 OR ($3::uuid IS NOT NULL AND contact_id = $3::uuid))
          AND (scope = 'workspace' OR (scope = 'campaign' AND scope_id = $4::uuid)) ORDER BY created_at LIMIT 1`,
        [ws, target, test ? null : contact?.id ?? null, campaign?.id ?? null, targetHash]);
      if (s) throw new Refuse(`suppressed:${s.scope === 'campaign' ? 'campaign' : suppressionSource(s.source)}`, `${s.reason}${s.source ? ` (${s.source})` : ''}`);
      if (contact && !test) {
        const d = await one<{ internal: boolean }>(q, 'SELECT internal FROM dnd_status WHERE contact_id = $1', [contact.id]);
        if (d?.internal) throw new Refuse('suppressed:internal_dnd', 'on the business\'s own do-not-call list');
      }
    }],
    ['G5', async () => {
      if (test) { consent = { basis: 'consent' }; return; }   // a member's own verified phone
      const recs = await many<ConsentRow>(q, `SELECT cr.id, cr.purpose, cr.basis, cr.granted, cr.evidence, cr.created_at, to_jsonb(cr)->>'effective_at' AS effective_at
         FROM consent_record cr WHERE cr.workspace_id = $1 AND cr.contact_id = $2 AND cr.channel = 'voice'`, [ws, contact!.id]);
      // Every purpose that covers this call: the category's own, the general ones, and for service/transactional any
      // relationship purpose. The newest record across them decides (by when it was given, not when it was inserted), so
      // a newer withdrawal on any covering purpose beats every older grant, and re-importing an old "yes" cannot re-open.
      const covers = (p: string) => PURPOSE_ALL.includes(p) || (category === 'promotional' ? p === 'promotional' : p !== 'promotional');
      const covering = recs.filter(r => covers(r.purpose));
      const withdrawals = covering.filter(r => !r.granted);
      const lastWithdrawal = withdrawals.length ? Math.max(...withdrawals.map(effectiveAt)) : -Infinity;
      const grants = covering
        .filter(r => r.granted && effectiveAt(r) > lastWithdrawal + WITHDRAWAL_MARGIN_MS)
        .filter(r => category !== 'promotional' || r.basis === 'consent')
        .sort((x, y) => effectiveAt(y) - effectiveAt(x) || y.created_at.getTime() - x.created_at.getTime() || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0));
      if (withdrawals.length && !grants.length) {
        const w = withdrawals.reduce((p, r) => (effectiveAt(r) > effectiveAt(p) ? r : p));
        throw new Refuse('no_basis', `consent withdrawn (${w.purpose})`);
      }
      const live = grants.filter(r => expiry(r, now) === 'live');
      if (!live.length) {
        const unreadable = grants.some(r => expiry(r, now) === 'unreadable');
        throw new Refuse(grants.length ? 'consent_expired' : 'no_basis', unreadable ? 'consent expiry unreadable'
          : category === 'promotional' ? 'promotional calls need explicit consent in date' : 'no relationship or consent record for this person');
      }
      const r = live[0];
      consent = { basis: r.basis === 'contract' || r.basis === 'relationship' ? 'contract' : r.basis === 'legitimate_use' ? 'legitimate_use' : 'consent', recordId: r.id };
      if (category === 'promotional') {
        // Allow-list: only an explicit "not registered", or registered with CRF-registered consent. Anything else
        // (unknown, a provider that is switched off, a value we do not know) holds the row.
        const d = await one<{ ncpr_status: string | null; checked_at: Date | null }>(q, 'SELECT ncpr_status, checked_at FROM dnd_status WHERE contact_id = $1', [contact!.id]);
        const st = (d?.ncpr_status ?? '').toLowerCase().replace(/[\s-]+/g, '_');
        if (!d?.checked_at || !(st === 'not_registered' || DND_REGISTERED.includes(st)))
          throw new Refuse('no_basis', `DND status ${st || 'unknown'}: promotional rows are held until a carrier DND lookup says not registered`);
        if (DND_REGISTERED.includes(st) && r.evidence?.crf !== true) throw new Refuse('dnd_blocked_by_operator', 'DND-registered number without CRF-registered consent (RS-13)');
        if (now.getTime() - d.checked_at.getTime() > DND_FRESH_S * 1000)
          throw new Refuse('no_basis', `DND lookup stale (older than ${DND_FRESH_S / 86400} days); refresh it`, new Date(now.getTime() + 6 * 3600_000), true);
      }
    }],
    ['G6', async () => {
      const window = test ? { days: [1, 2, 3, 4, 5, 6, 7], ranges: [OUTER_BAND_LIMIT], nationalHolidaysOff: false }
        : policy.window ?? DEFAULT_WINDOWS[category];
      const ctxLocal = {
        category: test ? 'service' as const : category, window, outerBand: test ? OUTER_BAND_LIMIT : dp.outer_band,
        rbiBand: !test && !!agent?.sectorPacks?.includes('lending_rbi'), holidays: test ? [] : dp.holidays,
      };
      // TRAI's hours are IST. For an Indian number the quiet hours, the promotional band and the outer band also hold in
      // IST, whatever zone was imported: a foreign zone can narrow the window, never move it outside IST.
      const floors: [string, Parameters<typeof eligibility>[2]][] = [[tz, ctxLocal]];
      if (tz !== 'Asia/Kolkata' && target.startsWith('+91'))
        floors.push(['Asia/Kolkata', { ...ctxLocal, window: { days: [1, 2, 3, 4, 5, 6, 7], ranges: [{ start: '00:00', end: '23:59' }], nationalHolidaysOff: false }, holidays: [] }]);
      let t = now, nextAt: Date | null = null, inside = false;
      for (let k = 0; k < 20; k++) {
        const es = floors.map(([z, c]) => eligibility(t, z, c));
        if (es.every(e => e.ok)) { inside = true; break; }
        const nx = es.map(e => (e.ok ? t : e.nextEligibleAt));
        if (nx.some(x => x === null)) break;
        t = new Date(Math.max(...nx.map(x => x!.getTime())));
        nextAt = t;
      }
      if (!inside || nextAt) throw new Refuse('out_of_window', `outside the calling window in ${floors.map(f => f[0]).join(' and ')}`, inside ? nextAt : null);
    }],
    ['G7', async () => {
      if (test) return;
      const today = localNow(now, tz).date;
      const dayStart = localToUtc(today, 0, tz), tomorrow = localToUtc(addDays(today, 1), 0, tz);
      const weekStart = localToUtc(addDays(today, -6), 0, tz);
      const n = await one<{ day: number; last: Date | null }>(q, `SELECT count(*) FILTER (WHERE a.dialed_at >= $3)::int AS day, max(a.dialed_at) AS last
        FROM attempt a LEFT JOIN contact c ON c.id = a.contact_id
        WHERE a.workspace_id = $1 AND a.dialed_at IS NOT NULL AND a.counts_to_budget AND a.kind <> 'test' AND coalesce(c.e164, a.to_e164) = $2`,
        [ws, target, dayStart]);
      if (n!.last && n!.last.getTime() + NUMBER_GAP_MIN * 60_000 > now.getTime())
        throw new Refuse('budget_exhausted', `this number rang less than ${NUMBER_GAP_MIN} min ago`, new Date(n!.last.getTime() + NUMBER_GAP_MIN * 60_000));
      if (n!.day >= NUMBER_DAILY_CEILING) throw new Refuse('budget_exhausted', `this number already rang ${NUMBER_DAILY_CEILING} times today`, tomorrow);
      if (campaign && contact) {
        const b = policy.budgets ?? DEFAULT_PERSON_BUDGET;
        const p = await one<{ day: number; week: number; run: number }>(q, `SELECT count(*) FILTER (WHERE dialed_at >= $3)::int AS day,
            count(*) FILTER (WHERE dialed_at >= $4)::int AS week, count(*)::int AS run
          FROM attempt WHERE workspace_id = $1 AND campaign_id = $2 AND contact_id = $5 AND dialed_at IS NOT NULL AND counts_to_budget`,
          [ws, campaign.id, dayStart, weekStart, contact.id]);
        if (p!.run >= b.perRun) throw new Refuse('budget_exhausted', `${b.perRun} attempts this run`, null);
        if (p!.week >= b.perWeek) throw new Refuse('budget_exhausted', `${b.perWeek} attempts in 7 days`, tomorrow);
        if (p!.day >= b.perDay) throw new Refuse('budget_exhausted', `${b.perDay} attempts today`, tomorrow);
      }
    }],
    ['G8', async () => {
      const route = routeSeries({ category, sectorPacks: agent?.sectorPacks ?? [], workspaceSector: dp.sector, test });
      const allowed: Series[] = [route.series, ...route.alsoAllowed];
      const pool = policy.cliPool?.length ? policy.cliPool : null;
      const nums = await many<NumberRow>(q, `SELECT id, e164, series, carrier, status, kyc_status, a2p_status FROM phone_number
        WHERE workspace_id = $1 AND status <> 'released' AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[])) ORDER BY created_at, id`, [ws, pool]);
      const sticky = contact ? await one<{ number_id: string }>(q, `SELECT number_id FROM attempt WHERE workspace_id = $1 AND contact_id = $2
        AND number_id IS NOT NULL AND dialed_at IS NOT NULL ORDER BY dialed_at DESC LIMIT 1`, [ws, contact.id]) : null;
      nums.sort((x, y) => Number(y.id === sticky?.number_id) - Number(x.id === sticky?.number_id));
      if (!nums.length) throw new Refuse('cli_wrong_series', `no line in this workspace; ${category} calls here use ${route.series} (${route.rule})`);
      const dayStart = localToUtc(localNow(now, 'Asia/Kolkata').date, 0, 'Asia/Kolkata');
      let first: Refuse | null = null;
      for (const nr of nums) {
        let why: Refuse | null = null;
        if (!allowed.includes(nr.series)) why = new Refuse('cli_wrong_series', `${category} calls use ${route.series} (${route.rule}); this line is ${nr.series}`);
        else if (nr.status === 'paused') why = new Refuse('cli_paused', 'the line is paused');
        else if (nr.series !== 'trial' && nr.kyc_status !== 'verified') why = new Refuse('kyc_lapsed', `line KYC is ${nr.kyc_status}`);
        else if (nr.series !== 'trial' && nr.a2p_status !== 'declared') {
          if (now.getTime() >= new Date(A2P_DUE).getTime()) why = new Refuse('cli_undeclared', 'the line is not declared for A2P on DLT');
          else warnings.push(`line ${nr.id} is not A2P-declared; from ${A2P_DUE.slice(0, 10)} the gate refuses it`);
        }
        if (!why && nr.series === 'ten_digit') {
          const c = await one<{ n: number }>(q, 'SELECT count(*)::int AS n FROM attempt WHERE workspace_id = $1 AND number_id = $2 AND dialed_at >= $3', [ws, nr.id, dayStart]);
          if (c!.n >= TEN_DIGIT_CLI_DAILY_CAP) why = new Refuse('budget_exhausted', `line reached ${TEN_DIGIT_CLI_DAILY_CAP} dials today`, localToUtc(addDays(localNow(now, 'Asia/Kolkata').date, 1), 0, 'Asia/Kolkata'));
        }
        if (!why) { number = nr; return; }
        first ??= why;
      }
      throw first!;
    }],
    ['G9', async () => {
      maxDurationS = Math.min(agent?.limits?.maxDurationS ?? DEFAULT_MAX_DURATION_S, policy.maxDurationS ?? Infinity);
      // The hold is the most this call can cost: a campaign's own stated rate, else the money module's rate for the
      // stack, else a conservative ceiling. Never zero for an unknown rate.
      const quoted = policy.perMinuteInrMilli ? null : agent?.voice?.stackId && deps.rate ? await deps.rate(q, ws, agent.voice.stackId, Math.ceil(maxDurationS / 60)) : null;
      const per = policy.perMinuteInrMilli ?? (quoted && quoted > 0 ? quoted : DEFAULT_PER_MINUTE_INR_MILLI);
      reserved = Math.ceil(maxDurationS / 60) * per;
      const r = await reserve(q, { workspaceId: ws, inrMilli: reserved, attemptId: a.id, campaignId: campaign?.id, apiKeyId: a.api_key_id ?? undefined });
      if (!r.ok) throw new Refuse(r.cause === 'cap_reached' ? 'cap_reached' : 'wallet_low', r.cause === 'cap_reached' ? `the ${r.scope} cap is reached` : r.cause);
      reservationId = r.reservationId;
    }],
    ['G10', async () => {
      if (!version || !agent || !version.config.brief?.text) throw new Refuse('version_not_publishable', 'no published agent version with a compiled brief');
      if (version.agent_status === 'archived') throw new Refuse('version_not_publishable', 'the agent is archived');
      if (agent.category !== category) throw new Refuse('version_not_publishable', `this version is built for ${agent.category} calls, not ${category}`);
      if (version.config.lint && version.config.lint.ok === false) throw new Refuse('version_not_publishable', 'the version failed its lint for this category');
      const lint = lintAgentConfig(agent).filter(f => f.effect === 'refuse');
      if (lint.length) throw new Refuse('version_not_publishable', lint.map(f => f.rule).join(','));
      const stack = stackOf(agent.voice);
      if (!stack) throw new Refuse('version_not_publishable', `the voice settings name no stack we can run ("${agent.voice?.stackId ?? ''}")`);
      // decision.2026-10-21.beta-stacks-test-only: a beta stack takes test calls to a member's verified phone, nothing else.
      if (stack.status === 'beta' && !test) throw new Refuse('version_not_publishable', `the ${stack.label} stack is in beta: test calls only`);
      const missing = (agent.sectorPacks ?? []).filter(p => p !== 'base' && !dp.sector_packs.includes(p));
      if (missing.length) throw new Refuse('pack_missing', `sector pack not active: ${missing.join(', ')}`);
    }],
    ['G11', async () => {
      if (test || !policy.predial?.url) return;
      const fn = deps.predial ?? httpPredial;
      let v: { allow: boolean; reason?: string };
      try {
        v = await Promise.race([fn(policy.predial.url, { attemptId: a.id, campaignId: campaign?.id ?? null, contactId: contact?.id ?? null }, PREDIAL_TIMEOUT_MS),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), PREDIAL_TIMEOUT_MS))]);
      } catch (e) { throw new Refuse('predial_timeout', e instanceof Error ? e.message : String(e)); }
      if (!v.allow) throw new Refuse('predial_veto', v.reason ?? 'the tenant\'s predial hook said no');
    }],
    ['G12', async () => {
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['conc:' + ws]);
      const inbound = await one(q, 'SELECT 1 FROM inbound_route WHERE workspace_id = $1 LIMIT 1', [ws]);
      const limit = dp.concurrency - (inbound ? Math.max(1, Math.ceil(dp.concurrency * 0.2)) : 0);
      const live = await one<{ ws: number; camp: number }>(q, `SELECT count(*)::int AS ws, count(*) FILTER (WHERE a.campaign_id = $2)::int AS camp
        FROM attempt a WHERE a.workspace_id = $1 AND ${LIVE_ATTEMPT} AND a.id <> $3`, [ws, campaign?.id ?? null, a.id]);
      const later = new Date(now.getTime() + 30_000);
      if (live!.ws >= limit) throw new Refuse('deferred_concurrency', `${live!.ws} of ${limit} lines busy${inbound ? ' (some held for inbound)' : ''}`, later);
      if (campaign && policy.concurrency && live!.camp >= policy.concurrency) throw new Refuse('deferred_concurrency', `campaign at its ${policy.concurrency} lines`, later);
    }],
  ];

  for (const [gate, fn] of checks) {
    await q.query('SAVEPOINT vp_gate');
    try {
      await fn();
      await q.query('RELEASE SAVEPOINT vp_gate');
      trace.push({ gate, ok: true });
    } catch (e) {
      await q.query('ROLLBACK TO SAVEPOINT vp_gate');
      const r = e instanceof Refuse ? e : new Refuse('check_unavailable', `${gate} could not run: ${e instanceof Error ? e.message : String(e)}`, new Date(now.getTime() + 5 * 60_000));
      if (reservationId) { await release(q, reservationId); reservationId = null; }
      trace.push({ gate, ok: false, code: r.code, detail: r.detail, nextEligibleAt: r.next?.toISOString() });
      const moneyDefers = (r.code === 'cap_reached' || r.code === 'wallet_low') && !!campaign;   // the campaign pauses; the person still waits
      const deferred = moneyDefers || ((r.defer || DEFERRABLE.includes(r.code)) && r.next !== null && r.next !== undefined);
      return { allowed: false, outcome: deferred ? 'deferred' : 'blocked', gate, code: r.code, detail: r.detail, nextEligibleAt: r.next ?? null,
        trace, warnings, gateVersion: GATE_VERSION, campaign,
        capScope: r.code === 'cap_reached' ? /the (\w+) cap/.exec(r.detail ?? '')?.[1] : undefined };
    }
  }
  return { allowed: true, trace, warnings, gateVersion: GATE_VERSION, target, contact, campaign, version: version!, category,
    number: number!, reservationId: reservationId!, reservedInrMilli: reserved, maxDurationS, consent };
}
