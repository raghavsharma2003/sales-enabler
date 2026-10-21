// Who wins when two sources disagree about one attribute (memory-omni blueprint §2, "authority by subject").
// Self subjects (how the person wants to be treated) are the person's to state; record subjects (amounts,
// dates, status) belong to the system of record. A fresh higher authority wins; an equal authority from
// another system with a different value goes to review (a tenant's own uploads count as one system);
// nothing older or more authoritative is overwritten.

export type Authority = 'system' | 'crm' | 'upload' | 'agent' | 'person';

const SELF_KEYS = new Set(['name', 'first_name', 'last_name', 'language', 'timezone', 'preferred_time', 'preferred_channel', 'address_as', 'pace']);

const RANK_SELF: Record<Authority, number> = { person: 100, agent: 60, crm: 50, upload: 50, system: 30 };
const RANK_RECORD: Record<Authority, number> = { system: 100, crm: 80, agent: 75, upload: 70, person: 40 };

export const isSelfSubject = (key: string) => SELF_KEYS.has(key);
export const rank = (key: string, a: Authority) => (isSelfSubject(key) ? RANK_SELF : RANK_RECORD)[a];

/** Default freshness per authority when the source states none (blueprint §5). */
export const DEFAULT_MAX_AGE_S: Record<Authority, number | null> = {
  system: 3600 * 24, crm: 3600 * 24, upload: 30 * 86400, agent: null, person: null,
};

export interface Claim { value: unknown; authority: Authority; observedAt: Date; maxAgeS: number | null; sourceId: string | null }

export type Decision =
  | { take: true; why: 'new' | 'higher_authority' | 'same_source_newer' | 'existing_stale' }
  | { take: false; why: 'same_value' | 'kept_more_authoritative' | 'kept_newer' | 'conflict_review' };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function decide(key: string, existing: Claim | null, incoming: Claim, now = new Date()): Decision {
  if (!existing) return { take: true, why: 'new' };
  if (same(existing.value, incoming.value)) return { take: false, why: 'same_value' };
  if (incoming.observedAt.getTime() < existing.observedAt.getTime()) return { take: false, why: 'kept_newer' };
  const stale = existing.maxAgeS != null && existing.observedAt.getTime() + existing.maxAgeS * 1000 < now.getTime();
  const ri = rank(key, incoming.authority), re = rank(key, existing.authority);
  if (ri > re) return { take: true, why: 'higher_authority' };
  // A stale value has lost its authority: a newer observation replaces it, whoever made it.
  if (stale) return { take: true, why: 'existing_stale' };
  if (ri < re) return { take: false, why: 'kept_more_authoritative' };
  // One lineage: the same source, or two of the tenant's own file uploads (a newer list replaces an older one).
  const lineage = (existing.sourceId && existing.sourceId === incoming.sourceId) || (existing.authority === 'upload' && incoming.authority === 'upload');
  if (lineage) return { take: true, why: 'same_source_newer' };
  return { take: false, why: 'conflict_review' };
}
