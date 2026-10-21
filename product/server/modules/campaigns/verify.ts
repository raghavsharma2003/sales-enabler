// Member phone verification for test calls (verified_test_phone). A member claims a phone; VP rings it once with a fixed
// system announcement (no agent, no model) that speaks a 6-digit code twice, in Hinglish and English. Only a keyed hash
// of the code is stored, for 10 minutes and 5 tries. Rate limits keep it from being used to ring a third party:
// 3 per member per hour, 20 per workspace per day, 3 per phone per day across every workspace.
//
// It is not a campaign dial, so it does not pass the marketing gate. It does keep the hard rules that apply to a
// transactional call to a person's own phone: an Indian mobile only (no premium, short-code or foreign numbers), no ring
// to a number this workspace suppressed or erased, and only between 09:00 and 21:00 IST. NCPR preferences do not block
// transactional calls, so they are not consulted.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { normaliseIndianPhone } from '../../../shared/phone.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { one, type Queryable } from '../../db.ts';
import { numberHash } from '../../identity.ts';
import type { ToolCtx } from '../../tools.ts';
import { telephony } from './telephony.ts';
import { localNow } from './windows.ts';

export const VERIFY = { ttlMin: 10, maxTries: 5, perMemberHour: 3, perWorkspaceDay: 20, perPhoneDay: 3, windowIst: [9 * 60, 21 * 60] as const };
const SYSTEM_CLI = () => process.env.VP_SYSTEM_CLI ?? 'system';
let clock = () => new Date();
/** Tests pin the clock; the window and expiry read it. */
export function setVerifyClock(f: (() => Date) | null): void { clock = f ?? (() => new Date()); }

async function serverSalt(q: Queryable): Promise<string> {
  await q.query("INSERT INTO campaigns_secret (name, value) VALUES ('verify_salt', $1) ON CONFLICT DO NOTHING", [randomBytes(32).toString('hex')]);
  return (await one<{ value: string }>(q, "SELECT value FROM campaigns_secret WHERE name = 'verify_salt'"))!.value;
}
const mac = (salt: string, s: string) => createHmac('sha256', salt).update(s).digest('hex');
const spaced = (code: string) => code.split('').join(' ');

/** The announcement, word for word. Exported so tests and the runtime see the same text. */
export function announcement(code: string): string[] {
  const c = spaced(code);
  return [
    `Namaste. Yeh Vyakti ki taraf se ek automated call hai. Aapka verification code hai: ${c}.`,
    `Phir se: ${c}.`,
    `Your Vyakti verification code is: ${c}. Again: ${c}.`,
    'Agar aapne yeh nahi maanga, ignore kar dijiye.',
  ];
}

function memberOf(ctx: ToolCtx): string {
  if (ctx.actor.type !== 'member' || !ctx.actor.id) throw new Error('only a signed-in member verifies their own phone');
  return ctx.actor.id;
}

function mobile(phone: string): string {
  const n = normaliseIndianPhone(phone);
  if (!n.ok) throw new ValidationError('phone', `not a dialable Indian number (${n.reason})`);
  if (n.kind !== 'mobile') throw new ValidationError('phone', 'verify a mobile number; landlines cannot receive the code reliably');
  return n.e164;
}

export async function verifyStart(ctx: ToolCtx, i: { phone: string }, now = clock()) {
  const memberId = memberOf(ctx);
  const e164 = mobile(i.phone);
  const ws = ctx.workspaceId;
  const ist = localNow(now, 'Asia/Kolkata').minutes;
  if (ist < VERIFY.windowIst[0] || ist >= VERIFY.windowIst[1]) throw new Error('verification calls ring only between 09:00 and 21:00 IST; try again then');
  const h = await numberHash(ctx.q, ws, e164);
  if (await one(ctx.q, `SELECT 1 FROM suppression WHERE workspace_id = $1 AND (e164 = $2 OR e164_hash = $3) AND scope = 'workspace' LIMIT 1`, [ws, e164, h])
    || await one(ctx.q, 'SELECT 1 FROM tombstone WHERE workspace_id = $1 AND e164_hash = $2', [ws, h]))
    throw new Error('this number asked not to be called; it cannot be verified here');

  const salt = await serverSalt(ctx.q);
  const g = mac(salt, 'phone:' + e164);
  // Serialise checks for this phone across workspaces, then count.
  await ctx.q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['verify:' + g]);
  const n = await one<{ member: number; ws: number; phone: number }>(ctx.q, `SELECT
      count(*) FILTER (WHERE member_id = $1 AND created_at > $4::timestamptz - interval '1 hour')::int AS member,
      count(*) FILTER (WHERE workspace_id = $2 AND created_at > $4::timestamptz - interval '1 day')::int AS ws,
      count(*) FILTER (WHERE global_hash = $3 AND created_at > $4::timestamptz - interval '1 day')::int AS phone
    FROM phone_verification WHERE (member_id = $1 OR workspace_id = $2 OR global_hash = $3) AND created_at > $4::timestamptz - interval '1 day'`,
    [memberId, ws, g, now]);
  if (n!.member >= VERIFY.perMemberHour) throw new Error(`at most ${VERIFY.perMemberHour} verification calls an hour; try again later`);
  if (n!.phone >= VERIFY.perPhoneDay) throw new Error(`this number already got ${VERIFY.perPhoneDay} verification calls today`);
  if (n!.ws >= VERIFY.perWorkspaceDay) throw new Error(`this workspace reached ${VERIFY.perWorkspaceDay} verification calls today`);

  await ctx.q.query("UPDATE phone_verification SET status = 'expired' WHERE member_id = $1 AND e164 = $2 AND status = 'pending'", [memberId, e164]);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await one<{ id: string }>(ctx.q, `INSERT INTO phone_verification (workspace_id, member_id, e164, global_hash, expires_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [ws, memberId, e164, g, new Date(now.getTime() + VERIFY.ttlMin * 60_000), now]);
  await ctx.q.query('UPDATE phone_verification SET code_hash = $2 WHERE id = $1', [row!.id, mac(salt, row!.id + ':' + code)]);
  const line = await one<{ e164: string }>(ctx.q, "SELECT e164 FROM phone_number WHERE workspace_id = $1 AND series = 'trial' AND status = 'active' ORDER BY created_at LIMIT 1", [ws]);
  try {
    const r = await telephony().systemCall({ to: e164, from: line?.e164 ?? SYSTEM_CLI(), lines: announcement(code) });
    await ctx.q.query('UPDATE phone_verification SET call_ref = $2 WHERE id = $1', [row!.id, r.ref]);
  } catch (e) {
    // The attempt still counts toward the limits; the member hears nothing and can retry later.
    await ctx.q.query("UPDATE phone_verification SET status = 'call_failed', code_hash = NULL WHERE id = $1", [row!.id]);
    return { verificationId: row!.id, ringing: false, reason: e instanceof Error ? e.message.slice(0, 200) : 'the call could not be placed' };
  }
  return { verificationId: row!.id, ringing: true, phone: e164, expiresInMinutes: VERIFY.ttlMin };
}

export async function verifyConfirm(ctx: ToolCtx, i: { phone: string; code: string }, now = clock()) {
  const memberId = memberOf(ctx);
  const e164 = mobile(i.phone);
  const v = await one<{ id: string; code_hash: string | null; tries: number; expires_at: Date }>(ctx.q, `SELECT id, code_hash, tries, expires_at FROM phone_verification
    WHERE workspace_id = $1 AND member_id = $2 AND e164 = $3 AND status = 'pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [ctx.workspaceId, memberId, e164]);
  if (!v || !v.code_hash) return { verified: false, reason: 'no code is waiting for this phone; ask for a new call' };
  if (v.expires_at.getTime() <= now.getTime()) {
    await ctx.q.query("UPDATE phone_verification SET status = 'expired' WHERE id = $1", [v.id]);
    return { verified: false, reason: 'the code expired; ask for a new call' };
  }
  const salt = await serverSalt(ctx.q);
  const want = Buffer.from(v.code_hash, 'hex'), got = Buffer.from(mac(salt, v.id + ':' + i.code), 'hex');
  if (!timingSafeEqual(want, got)) {
    const tries = v.tries + 1;
    await ctx.q.query(`UPDATE phone_verification SET tries = $2::int, status = CASE WHEN $2::int >= $3::int THEN 'locked' ELSE status END WHERE id = $1`, [v.id, tries, VERIFY.maxTries]);
    return { verified: false, reason: tries >= VERIFY.maxTries ? 'too many wrong codes; ask for a new call' : 'that code does not match', triesLeft: Math.max(0, VERIFY.maxTries - tries) };
  }
  const other = await one<{ member_id: string }>(ctx.q, 'SELECT member_id FROM verified_test_phone WHERE workspace_id = $1 AND e164 = $2 AND member_id <> $3 AND verified_at IS NOT NULL', [ctx.workspaceId, e164, memberId]);
  if (other) return { verified: false, reason: 'another member of this workspace already verified this phone' };
  await ctx.q.query("UPDATE phone_verification SET status = 'verified', verified_at = $2, code_hash = NULL WHERE id = $1", [v.id, now]);
  await ctx.q.query(`INSERT INTO verified_test_phone (workspace_id, member_id, e164, verified_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (workspace_id, e164) DO UPDATE SET member_id = EXCLUDED.member_id, verified_at = EXCLUDED.verified_at`, [ctx.workspaceId, memberId, e164, now]);
  return { verified: true, phone: e164 };
}
