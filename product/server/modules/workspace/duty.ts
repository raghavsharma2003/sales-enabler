// The duty roster: who is on duty and when. Weekly hours (days and a start and end time in the roster's timezone) plus
// dated overrides that put someone on duty or take them off (leave, a swap). onDuty() answers "who is on shift now";
// notifications email those people when a destination lists no addresses, and fall back to the role rule (active owners,
// operators and compliance members) when nobody is on shift, so an alert always reaches someone.
import { many, one, type Queryable } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
import { arr, bool, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { ON_DUTY_ROLES } from '../calls/handoffs.ts';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const validZone = (z: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
/** Who may be put on duty: anyone who can act on a call. A viewer cannot. */
const DUTY_ROLES = ['owner', 'builder', 'operator', 'compliance'];

export interface OnDuty { id: string; name: string | null; email: string }

/** Who is on shift at `at`: an on-duty override, or weekly hours with no off-duty override at that moment. */
export async function onDuty(q: Queryable, ws: string, at: Date = new Date()): Promise<OnDuty[]> {
  return many<OnDuty>(q, `WITH loc AS (SELECT ($2::timestamptz AT TIME ZONE coalesce((SELECT timezone FROM duty_roster WHERE workspace_id = $1), 'Asia/Kolkata')) AS t),
      now_min AS (SELECT extract(isodow FROM t)::int AS dow, (extract(hour FROM t) * 60 + extract(minute FROM t))::int AS m FROM loc)
    SELECT m.id, m.name, m.email FROM member m, now_min n
    WHERE m.workspace_id = $1 AND m.status = 'active' AND m.role = ANY($3::text[]) AND (
      EXISTS (SELECT 1 FROM duty_override o WHERE o.workspace_id = $1 AND o.member_id = m.id AND o.on_duty AND $2 >= o.starts_at AND $2 < o.ends_at)
      OR (EXISTS (SELECT 1 FROM duty_shift s WHERE s.workspace_id = $1 AND s.member_id = m.id AND n.dow = ANY(s.days) AND n.m >= s.start_min AND n.m < s.end_min)
          AND NOT EXISTS (SELECT 1 FROM duty_override o WHERE o.workspace_id = $1 AND o.member_id = m.id AND NOT o.on_duty AND $2 >= o.starts_at AND $2 < o.ends_at)))
    ORDER BY m.name NULLS LAST, m.email`, [ws, at, DUTY_ROLES]);
}

/** The addresses an alert with no listed recipients goes to: the people on shift, else the role rule. */
export async function onDutyEmails(q: Queryable, ws: string, at: Date = new Date()): Promise<{ emails: string[]; via: 'roster' | 'roles' }> {
  const shift = await onDuty(q, ws, at);
  if (shift.length) return { emails: shift.map(m => m.email), via: 'roster' };
  const roles = await many<{ email: string }>(q, "SELECT email FROM member WHERE workspace_id = $1 AND status = 'active' AND role = ANY($2::text[]) ORDER BY email", [ws, [...ON_DUTY_ROLES]]);
  return { emails: roles.map(r => r.email), via: 'roles' };
}

async function dutyMembers(q: Queryable, ws: string, ids: string[]): Promise<Map<string, string>> {
  const rows = await many<{ id: string; label: string }>(q, "SELECT id, coalesce(name, email) AS label FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'active' AND role = ANY($3::text[])", [ws, ids, DUTY_ROLES]);
  const m = new Map(rows.map(r => [r.id, r.label]));
  const missing = [...new Set(ids)].filter(id => !m.has(id));
  if (missing.length) throw new Error('only active owners, builders, operators and compliance members can be on duty in this workspace');
  return m;
}

const shiftIn = obj({ memberId: uuid(), days: arr(num({ int: true, min: 1, max: 7 }), { min: 1, max: 7 }), start: str({ pattern: HHMM, desc: 'HH:MM' }), end: str({ pattern: HHMM, desc: 'HH:MM, after start; 24:00 is the end of the day' }) });

export function registerDuty(r: Registry) {
  r.register(tool(obj({}), {
    name: 'duty.roster.get', risk: 'read', summary: 'Who is on duty now, the weekly hours and the overrides (leave, swaps) of the duty roster',
    run: async ctx => {
      const roster = await one<{ timezone: string; version: number }>(ctx.q, 'SELECT timezone, version FROM duty_roster WHERE workspace_id = $1', [ctx.workspaceId]);
      const shifts = await many<{ id: string; member_id: string; label: string; days: number[]; start_min: number; end_min: number }>(ctx.q,
        `SELECT s.id, s.member_id, coalesce(m.name, m.email) AS label, s.days, s.start_min, s.end_min FROM duty_shift s JOIN member m ON m.id = s.member_id
         WHERE s.workspace_id = $1 ORDER BY label, s.start_min`, [ctx.workspaceId]);
      const overrides = await many(ctx.q, `SELECT o.id, o.member_id AS "memberId", coalesce(m.name, m.email) AS name, o.starts_at AS "from", o.ends_at AS "to", o.on_duty AS "onDuty", o.note
        FROM duty_override o JOIN member m ON m.id = o.member_id WHERE o.workspace_id = $1 AND o.ends_at > now() ORDER BY o.starts_at`, [ctx.workspaceId]);
      const now = await onDuty(ctx.q, ctx.workspaceId);
      return { timezone: roster?.timezone ?? 'Asia/Kolkata', version: roster?.version ?? 0,
        shifts: shifts.map(s => ({ id: s.id, memberId: s.member_id, name: s.label, days: s.days, start: toHHMM(s.start_min), end: toHHMM(s.end_min) })),
        overrides, onDutyNow: now.map(m => ({ memberId: m.id, name: m.name ?? m.email })),
        fallback: now.length ? null : 'Nobody is on shift now, so email alerts go to every active owner, operator and compliance member.' };
    },
  }));

  r.register(tool(obj({ shifts: arr(shiftIn, { max: 200 }), timezone: opt(str({ max: 64 })) }), {
    name: 'duty.roster.set', risk: 'policy', roles: ['owner', 'operator', 'compliance'],
    summary: 'Set the weekly duty hours: who is on duty, on which days and at what times',
    describe: async (i, ctx) => {
      const names = await many<{ label: string }>(ctx.q, 'SELECT DISTINCT coalesce(name, email) AS label FROM member WHERE workspace_id = $1 AND id = ANY($2::uuid[]) ORDER BY 1', [ctx.workspaceId, i.shifts.map(s => s.memberId)]);
      const tz = i.timezone ?? (await one<{ timezone: string }>(ctx.q, 'SELECT timezone FROM duty_roster WHERE workspace_id = $1', [ctx.workspaceId]))?.timezone ?? 'Asia/Kolkata';
      const zone = tz === 'Asia/Kolkata' ? 'India time' : `${tz.split('/').pop()!.replace(/_/g, ' ')} time`;
      return i.shifts.length ? `Set the duty hours (${zone}): ${i.shifts.length} ${i.shifts.length === 1 ? 'shift' : 'shifts'} for ${names.map(n => n.label).join(', ')}. Email alerts with no listed addresses go to whoever is on shift.`
        : 'Clear the weekly duty hours. Email alerts with no listed addresses go to every active owner, operator and compliance member.';
    },
    version: async ctx => String((await one<{ version: number }>(ctx.q, 'SELECT version FROM duty_roster WHERE workspace_id = $1', [ctx.workspaceId]))?.version ?? 0),
    run: async (ctx, i) => {
      if (i.timezone && !validZone(i.timezone)) throw new Error(`"${i.timezone}" is not a time zone; use a name like Asia/Kolkata`);
      for (const s of i.shifts) if (toMin(s.end) <= toMin(s.start)) throw new Error(`a shift must end after it starts (${s.start} to ${s.end}); split a shift past midnight into two`);
      await dutyMembers(ctx.q, ctx.workspaceId, i.shifts.map(s => s.memberId));
      await ctx.q.query(`INSERT INTO duty_roster (workspace_id, timezone, version, updated_by) VALUES ($1, coalesce($2, 'Asia/Kolkata'), 1, $3)
        ON CONFLICT (workspace_id) DO UPDATE SET timezone = coalesce($2, duty_roster.timezone), version = duty_roster.version + 1, updated_by = $3, updated_at = now()`,
        [ctx.workspaceId, i.timezone ?? null, ctx.actor.id ?? ctx.actor.type]);
      await ctx.q.query('DELETE FROM duty_shift WHERE workspace_id = $1', [ctx.workspaceId]);
      for (const s of i.shifts) await ctx.q.query('INSERT INTO duty_shift (workspace_id, member_id, days, start_min, end_min) VALUES ($1,$2,$3,$4,$5)',
        [ctx.workspaceId, s.memberId, [...new Set(s.days)].sort(), toMin(s.start), toMin(s.end)]);
      return { shifts: i.shifts.length, onDutyNow: (await onDuty(ctx.q, ctx.workspaceId)).map(m => m.name ?? m.email) };
    },
  }));

  r.register(tool(obj({ memberId: uuid(), from: str({ pattern: ISO, desc: 'an ISO time with its offset' }), to: str({ pattern: ISO }), onDuty: bool(), note: opt(str({ max: 200 })) }), {
    name: 'duty.override.add', risk: 'policy', roles: ['owner', 'operator', 'compliance'],
    summary: 'Put someone on duty, or take them off (leave, a swap), for a stretch of time',
    describe: async (i, ctx) => {
      const who = (await one<{ label: string }>(ctx.q, 'SELECT coalesce(name, email) AS label FROM member WHERE id = $1 AND workspace_id = $2', [i.memberId, ctx.workspaceId]))?.label ?? 'this person';
      const f = (s: string) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';
      return `${i.onDuty ? 'Put' : 'Take'} ${who} ${i.onDuty ? 'on' : 'off'} duty from ${f(i.from)} to ${f(i.to)}${i.note ? ` (${i.note})` : ''}`;
    },
    run: async (ctx, i) => {
      if (new Date(i.to) <= new Date(i.from)) throw new Error('the end must be after the start');
      if (new Date(i.to).getTime() - new Date(i.from).getTime() > 92 * 86_400_000) throw new Error('an override lasts at most 92 days; change the weekly hours for longer');
      await dutyMembers(ctx.q, ctx.workspaceId, [i.memberId]);
      const row = await one<{ id: string }>(ctx.q, `INSERT INTO duty_override (workspace_id, member_id, starts_at, ends_at, on_duty, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.workspaceId, i.memberId, i.from, i.to, i.onDuty, i.note ?? null, ctx.actor.id ?? ctx.actor.type]);
      return { id: row!.id };
    },
  }));

  r.register(tool(obj({ id: uuid() }), {
    name: 'duty.override.remove', risk: 'policy', roles: ['owner', 'operator', 'compliance'], summary: 'Remove a duty override',
    describe: async (i, ctx) => {
      const o = await one<{ label: string; on_duty: boolean }>(ctx.q, 'SELECT coalesce(m.name, m.email) AS label, o.on_duty FROM duty_override o JOIN member m ON m.id = o.member_id WHERE o.id = $1 AND o.workspace_id = $2', [i.id, ctx.workspaceId]);
      return o ? `Remove the override that ${o.on_duty ? 'puts' : 'takes'} ${o.label} ${o.on_duty ? 'on' : 'off'} duty` : 'Remove a duty override';
    },
    run: async (ctx, i) => {
      const n = await ctx.q.query('DELETE FROM duty_override WHERE id = $1 AND workspace_id = $2', [i.id, ctx.workspaceId]);
      if (!n.rowCount) throw new Error('no such override in this workspace');
      return { id: i.id, removed: true };
    },
  }));
}

