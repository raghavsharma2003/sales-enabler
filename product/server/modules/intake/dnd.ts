// DND (NCPR) status lookup. A provider answers per number; "unknown" is an answer, not a gap, and the
// dial gate treats it as fail-closed for promotional calls. The fake provider is deterministic for tests;
// the real adapter is disabled until a licensed lookup is contracted (on 140xx series the operator scrubs).

export type DndAnswer = { status: 'registered' | 'not_registered' | 'unknown'; reason?: string };

export interface DndProvider {
  name: string;
  check(e164s: string[]): Promise<Map<string, DndAnswer>>;
}

/** Registered when the number is in `registered`; everything else is not_registered. `unknown` forces unknown. */
export class FakeDndProvider implements DndProvider {
  name = 'fake';
  constructor(private registered = new Set<string>(), private unknown = new Set<string>()) {}
  async check(e164s: string[]) {
    return new Map(e164s.map(e => [e, this.unknown.has(e) ? { status: 'unknown', reason: 'fake_unknown' } :
      { status: this.registered.has(e) ? 'registered' : 'not_registered' }] as [string, DndAnswer]));
  }
}

/** Placeholder for a contracted NCPR lookup. Always answers unknown, so nothing is assumed callable. */
export class DisabledDndProvider implements DndProvider {
  name = 'ncpr_disabled';
  async check(e164s: string[]) {
    return new Map(e164s.map(e => [e, { status: 'unknown', reason: 'provider_not_configured' }] as [string, DndAnswer]));
  }
}

let provider: DndProvider = new DisabledDndProvider();
export const dndProvider = () => provider;
/** Tests and the composition root set the provider; production stays disabled until a lookup is contracted. */
export function setDndProvider(p: DndProvider): void { provider = p; }
