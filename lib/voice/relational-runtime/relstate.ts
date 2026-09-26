/** Selective executable port of html-portfolio/src/engine/relstate.ts,
 * f4d3fe4e4f9ffc665c116ce022b3f63c8fefbd21. Contracts, asymmetric honorific
 * hysteresis and caller-led two-stage repair are retained. No DB, persona,
 * trust scalar, relationship stage, clock default or cross-call inference.
 * See docs/relational-source-port.md for adaptations. */
export type Honorific = 'tu' | 'tum' | 'aap';
export type RepairState = 'none' | 'open' | 'repairing' | 'repaired';
export type Direction = 'advance' | 'regress' | 'reset' | 'init';
export interface AddressEvidence { term: Honorific; episodeId: number; at: string }
export interface HonorificMoveResult { next: Honorific; direction: Direction; citations: number[]; note: string }
const HONORIFIC_ORDER: Record<Honorific, number> = { aap: 0, tum: 1, tu: 2 };
const HONORIFIC_MIN_EPISODES = 3;
const HONORIFIC_MIN_SPAN_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export function honorificShift(current: Honorific, evidence: readonly AddressEvidence[], ruptureOpen: boolean,
  explicitInvite: { term: Honorific; episodeId: number } | null, now: Date): HonorificMoveResult | null {
  if (ruptureOpen && HONORIFIC_ORDER[current] > HONORIFIC_ORDER.aap) {
    const next: Honorific = current === 'tu' ? 'tum' : 'aap';
    return { next, direction: 'regress', citations: [], note: `rupture: regress ${current}->${next}` };
  }
  if (explicitInvite && HONORIFIC_ORDER[explicitInvite.term] !== HONORIFIC_ORDER[current]) {
    const direction: Direction = HONORIFIC_ORDER[explicitInvite.term] > HONORIFIC_ORDER[current] ? 'advance' : 'regress';
    return { next: explicitInvite.term, direction, citations: [explicitInvite.episodeId], note: `explicit invite: ${current}->${explicitInvite.term}` };
  }
  const byTerm = new Map<Honorific, AddressEvidence[]>();
  for (const e of evidence) {
    // Harden upstream: invalid dates must never qualify evidence.
    const at = new Date(e.at).getTime();
    if (!Number.isFinite(at) || at > now.getTime()) continue;
    if (HONORIFIC_ORDER[e.term] <= HONORIFIC_ORDER[current]) continue;
    const arr = byTerm.get(e.term) ?? []; arr.push(e); byTerm.set(e.term, arr);
  }
  let best: { term: Honorific; rows: AddressEvidence[] } | null = null;
  for (const [term, rows] of byTerm) {
    if (new Set(rows.map(r => r.episodeId)).size < HONORIFIC_MIN_EPISODES) continue;
    const times = rows.map(r => new Date(r.at).getTime()).sort((a, b) => a - b);
    if ((times[times.length - 1] - times[0]) / MS_PER_DAY < HONORIFIC_MIN_SPAN_DAYS) continue;
    if (!best || HONORIFIC_ORDER[term] > HONORIFIC_ORDER[best.term]) best = { term, rows };
  }
  if (!best) return null;
  const citations = [...new Set(best.rows.map(r => r.episodeId))].sort((a, b) => a - b);
  const times = best.rows.map(r => new Date(r.at).getTime());
  const spanDays = ((Math.max(...times) - Math.min(...times)) / MS_PER_DAY).toFixed(1);
  return { next: best.term, direction: 'advance', citations, note: `${citations.length} episodes over ${spanDays}d: ${current}->${best.term}` };
}

export interface RuptureRepairInput { ruptureOpen: boolean; repairState: RepairState }
export interface RuptureRepairMove { ruptureOpen: boolean; repairState: RepairState; dim: 'rupture' | 'repair'; direction: Direction; note: string }

export function ruptureRepairShift(state: RuptureRepairInput, conflictSignal: boolean,
  theirRepairSignal: boolean, stanceLapsed = false): RuptureRepairMove | null {
  if (conflictSignal && !state.ruptureOpen) {
    return { ruptureOpen: true, repairState: 'open', dim: 'rupture', direction: 'advance', note: 'conflict-shaped episode: rupture opens' };
  }
  if (conflictSignal && state.ruptureOpen && state.repairState === 'open' && stanceLapsed) {
    return { ruptureOpen: true, repairState: 'open', dim: 'rupture', direction: 'advance', note: 'conflict-shaped episode after lapsed stance: rupture re-opens' };
  }
  if (conflictSignal && state.ruptureOpen && state.repairState !== 'open') {
    return { ruptureOpen: true, repairState: 'open', dim: 'repair', direction: 'regress', note: 're-rupture during repair: repair regresses to open' };
  }
  if (state.ruptureOpen && state.repairState === 'open' && theirRepairSignal) {
    return { ruptureOpen: state.ruptureOpen, repairState: 'repairing', dim: 'repair', direction: 'advance', note: 'their signal: repair begins' };
  }
  if (state.ruptureOpen && state.repairState === 'repairing' && theirRepairSignal) {
    return { ruptureOpen: false, repairState: 'repaired', dim: 'repair', direction: 'advance', note: 'their signal sustained: repaired, rupture closes' };
  }
  return null;
}
