// The wallet read the shell needs on every page (the wallet chip), apart from data.ts so the pages' data layer loads with
// the pages, not before the first paint.
import { run } from './api.ts';
import type { Wallet } from './types.ts';

const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

export async function walletGet(): Promise<Wallet> {
  const w = await run<any>('wallet.get', {});
  return { state: w.state, balanceMilli: w.balanceInrMilli, heldMilli: w.heldInrMilli, availableMilli: w.availableInrMilli, runwayDays: w.runwayDays ?? null, caps: arr(w.caps), testCalls: arr(w.testBudget?.calls), warnings: arr(w.warnings), priceNotSet: w.price?.status === 'not_set', priceText: w.price?.text ?? '' };
}
