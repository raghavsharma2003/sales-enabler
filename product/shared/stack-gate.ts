// The speed and turn-taking gate (blueprint decision 4): a stack meets it when its measured median reply gap is at most
// GATE.replyGapP50Ms AND its measured cut-in rate is at most GATE.cutInRateMax. The thresholds live here and nowhere
// else; the measurements live in stack-measures.json (staging calls). Nothing passes today, and the owner sanctioned
// the provisional default anyway, so the gate never blocks: it is shown on every stack, the agent page and the
// campaign launch check (P7: what you see is what runs). A stack you build yourself is not measured until it is.
import measures from './stack-measures.json' with { type: 'json' };

export const GATE = { replyGapP50Ms: 1500, cutInRateMax: 0.05 } as const;

export interface Measure { value: number; n: number; calls?: number; p90Ms?: number; date: string; source: string }
export interface StackMeasures { replyGapP50Ms: Measure | null; cutInRate: Measure | null }
export const MEASURES = (measures as unknown as { stacks: Record<string, StackMeasures> }).stacks;

export type GateState = 'meets' | 'not_yet' | 'not_measured';
export interface GateStatus { state: GateState; label: string; detail: string; replyGapP50Ms: Measure | null; cutInRate: Measure | null; target: typeof GATE }

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/** The gate status of a stack, from its measurements (none for a stack you built yourself). */
export function gateStatus(stackId: string): GateStatus {
  const m = MEASURES[stackId] ?? { replyGapP50Ms: null, cutInRate: null };
  const gap = m.replyGapP50Ms, cut = m.cutInRate;
  const base = { replyGapP50Ms: gap, cutInRate: cut, target: GATE };
  const misses: string[] = [];
  if (gap && gap.value > GATE.replyGapP50Ms) misses.push(`${secs(gap.value)} replies (target ${secs(GATE.replyGapP50Ms)})`);
  if (cut && cut.value > GATE.cutInRateMax) misses.push(`${pct(cut.value)} cut-ins (target at most ${pct(GATE.cutInRateMax)})`);
  const unmeasured = [!gap && 'reply speed', !cut && 'cut-ins'].filter(Boolean) as string[];
  const measured = [gap && `median reply ${secs(gap.value)} over ${gap.n} replies (${day(gap.date)})`, cut && `cut-ins ${pct(cut.value)} over ${cut.n} turns (${day(cut.date)})`]
    .filter(Boolean).join('; ');
  const notMeasured = unmeasured.length ? ` Not measured yet: ${unmeasured.join(' and ')}.` : '';
  if (misses.length) return { ...base, state: 'not_yet', label: `Not yet: ${misses.join(', ')}`, detail: `Measured on test calls: ${measured}.${notMeasured}` };
  if (unmeasured.length) return { ...base, state: 'not_measured', label: 'Not measured', detail: ((measured ? `Measured on test calls: ${measured}.` : '') + notMeasured).trim() };
  return { ...base, state: 'meets', label: 'Meets the speed and turn-taking gate', detail: `Measured on test calls: ${measured}.` };
}
