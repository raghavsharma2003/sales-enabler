// Blockers that name the wallet (walkthrough S6). Same shape as campaigns' Explained ({code, message, why, fix}), so a
// launch check or the number flow can show them as they are: what it costs, what the wallet has, and "Add money".
// Read-only; amounts are integer milli-rupees, shown with Indian grouping.
import { formatInr } from '../../../shared/money.ts';
import type { StackComponents } from '../../../shared/stacks.ts';
import { one, type Queryable } from '../../db.ts';
import { estimate } from './money.ts';

export type WalletPurpose = 'launch' | 'number_rent';
export interface WalletBlocker {
  code: 'wallet_short'; message: string; why: string;
  fix: { tool: 'wallet.topup'; label: 'Add money'; role: 'owner' };
  needInrMilli: number | null; availableInrMilli: number;
}

const ADD_MONEY = { tool: 'wallet.topup', label: 'Add money', role: 'owner' } as const;

/** What the wallet can spend now: the balance less every hold still in flight. */
export async function available(q: Queryable, ws: string): Promise<number> {
  const w = await one<{ a: string }>(q,
    `SELECT (w.balance_inr_milli - coalesce((SELECT sum(inr_milli) FROM reservation r WHERE r.workspace_id = w.workspace_id AND r.status = 'held'), 0))::text AS a
     FROM wallet w WHERE w.workspace_id = $1`, [ws]);
  return Number(w?.a ?? 0);
}

/** A blocker when the wallet cannot cover `needInrMilli` (null need: only when nothing is available), else null. */
export async function walletBlocker(q: Queryable, ws: string, i: { purpose: WalletPurpose; needInrMilli: number | null }): Promise<WalletBlocker | null> {
  const have = await available(q, ws);
  if (i.needInrMilli === null ? have > 0 : have >= i.needInrMilli) return null;
  const has = `the wallet has ${formatInr(have)}`;
  const need = i.needInrMilli === null ? null : formatInr(i.needInrMilli);
  const [message, why] = i.purpose === 'number_rent'
    ? [need ? `Renting a number costs ${need} a month; ${has}.` : `Renting a number costs money each month; ${has}.`,
       'The first month is charged when the number is rented, so add money before you rent one.']
    : [need ? `Each call holds up to ${need} before it dials; ${has}.` : `Calls need money in the wallet; ${has}.`,
       'Money is held only while a call runs, and whatever the call does not use goes straight back.'];
  return { code: 'wallet_short', message, why, fix: { ...ADD_MONEY }, needInrMilli: i.needInrMilli, availableInrMilli: have };
}

/** The most one call can hold: whole minutes of the longest call at the campaign's own rate, else this stack's provider
 *  cost from the cost card (the dial gate's G9 uses the same rule). Null when neither is known. */
export async function callHoldInrMilli(q: Queryable, i: { stackId?: string; components?: StackComponents; maxDurationS: number; perMinuteInrMilli?: number }): Promise<number | null> {
  const minutes = Math.ceil(i.maxDurationS / 60);
  if (i.perMinuteInrMilli) return minutes * i.perMinuteInrMilli;
  if (!i.stackId) return null;
  try { return minutes * (await estimate(q, { stackId: i.stackId, minutes: 1, calls: 0, components: i.components })).perMinuteInrMilli; }
  catch { return null; }
}
