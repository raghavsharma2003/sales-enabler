// Money is integer milli-rupees (INR x 1000) everywhere, so metering never uses floats.
// Display uses Indian digit grouping (lakh / crore), e.g. 123456.78 -> "₹1,23,456.78".

export type InrMilli = number;

export const inrToMilli = (inr: number): InrMilli => Math.round(inr * 1000);
export const milliToInr = (m: InrMilli): number => m / 1000;

/** Format with Indian grouping: last three digits, then pairs. */
export function formatInr(m: InrMilli, opts: { paise?: boolean } = {}): string {
  const negative = m < 0;
  const abs = Math.abs(m);
  const rupees = Math.floor(abs / 1000);
  const paise = Math.round((abs % 1000) / 10);
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  const showPaise = opts.paise ?? paise !== 0;
  return (negative ? '-' : '') + '₹' + grouped + (showPaise ? '.' + String(paise).padStart(2, '0') : '');
}

/** All-in rupees per connected minute from a call's total cost and connected seconds. */
export function perMinute(totalMilli: InrMilli, connectedSeconds: number): InrMilli {
  if (connectedSeconds <= 0) return 0;
  return Math.round((totalMilli / connectedSeconds) * 60);
}
