// Knowledge on calls (must-be audit, brief 4): an agent links offerings; every compile (preview, practice, publish)
// first materialises their approved facts into the facts rows and their never-say into the agent's never-say, so the
// brief states them and the reply door enforces them with no change to the door or the runtime. Materialising is
// idempotent: earlier knowledge facts (source 'kb:...') and the never-say it added are removed before re-adding.
// The T-L3 fence (compile.ts factsFor, shared/safety T-L2/T-L3) still drops offer facts from service calls, and the
// byte budget still throws. The workspace module owns offerings and spans; this only reads them, inside the workspace.
import type { AgentConfig, Fact } from '../../../shared/agent-config.ts';
import { ValidationError } from '../../../shared/validate.ts';
import { lintAgentConfig } from '../../../shared/safety/index.ts';
import { shapeLint } from './lint.ts';
import { many, type Queryable } from '../../db.ts';

interface OfferingFact { id: string; text: string; purposes: string[]; spanId: string }
interface OfferingRow { id: string; name: string; facts: OfferingFact[]; never_say: string[] }

const KB = 'kb:';
const OFFER_TAGS = new Set(['offer', 'price', 'pricing', 'discount', 'promotion', 'promo', 'scheme', 'deal']);
const LOGISTICS_TAGS = new Set(['next_step', 'logistics', 'timing', 'hours', 'location', 'contact']);

/** An offering fact's tags as the agent's fact purpose: anything priced or promotional is an offer (so the T-L3 fence
 *  keeps it out of service and transactional calls), a next step or timing is logistics, the rest is service. */
export function factPurpose(tags: string[]): Fact['purpose'] {
  if (tags.some(t => OFFER_TAGS.has(t))) return 'offer';
  if (tags.some(t => LOGISTICS_TAGS.has(t))) return 'logistics';
  return 'service';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'offering';

/** The config without any knowledge an earlier materialise added. */
export function stripKnowledge(c: AgentConfig): AgentConfig {
  const added = new Set(c.knowledge?.materialised?.neverSay ?? []);
  const { materialised: _m, ...k } = c.knowledge ?? { offeringIds: [] };
  return { ...c, facts: c.facts.filter(f => !f.source.startsWith(KB)), neverSay: c.neverSay.filter(n => !added.has(n)),
    ...(c.knowledge ? { knowledge: k } : {}) };
}

/** Materialise the linked offerings' approved facts and never-say into the config (see the header). */
export async function withKnowledge(q: Queryable, ws: string, c: AgentConfig): Promise<AgentConfig> {
  const base = stripKnowledge(c);
  const ids = base.knowledge?.offeringIds ?? [];
  if (!ids.length) return base;
  const offerings = await many<OfferingRow>(q, 'SELECT id, name, facts, never_say FROM offering WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL', [ws, ids]);
  const missing = ids.filter(id => !offerings.some(o => o.id === id));
  if (missing.length) throw new ValidationError('knowledge.offeringIds', 'a linked offering is not in this workspace or was archived; link offerings from offering.list');
  // A fact stands only while its span is still approved.
  const spanIds = offerings.flatMap(o => o.facts.map(f => f.spanId));
  const approved = new Set((await many<{ id: string }>(q, "SELECT id FROM knowledge_span WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'approved'", [ws, spanIds])).map(r => r.id));
  const want = base.knowledge?.purposes ? new Set(base.knowledge.purposes) : null;
  const facts: Fact[] = [];
  for (const [oi, o] of ids.map(id => offerings.find(x => x.id === id)!).entries()) {
    let n = 0;
    for (const f of o.facts) {
      if (!approved.has(f.spanId)) continue;
      if (want && !f.purposes.some(p => want.has(p))) continue;
      if (f.text.length > 300) throw new ValidationError('knowledge.offeringIds',
        `the fact "${f.text.slice(0, 60)}..." in the offering "${o.name}" is longer than 300 characters; shorten it in the offering`);
      facts.push({ key: `kb${oi + 1}_${slug(o.name)}_${++n}`, value: f.text, purpose: factPurpose(f.purposes), source: `${KB}${f.spanId}` });
    }
  }
  const have = new Set(base.neverSay);
  const neverSay = [...new Set(offerings.flatMap(o => o.never_say))].filter(x => !have.has(x));
  return { ...base, facts: [...base.facts, ...facts], neverSay: [...base.neverSay, ...neverSay],
    knowledge: { ...base.knowledge!, materialised: { neverSay } } };
}

// ------------------------------------------------------------------------------------------------ what she may say

export interface SourceRef { spanId: string; sourceId: string; sourceTitle: string; sourceKind: string; location: Record<string, unknown>; quote: string }
export interface SayableFact { offering: string; text: string; purpose: Fact['purpose']; onCalls: boolean; why: string | null; key: string | null; source: SourceRef | null }

/** Where each knowledge span came from, for "why she said this" and the agent's company page. */
export async function sourceRefs(q: Queryable, ws: string, spanIds: string[]): Promise<Map<string, SourceRef>> {
  if (!spanIds.length) return new Map();
  const rows = await many<{ id: string; source_id: string; title: string | null; kind: string; location: Record<string, unknown>; text: string }>(q,
    `SELECT p.id, p.source_id, s.title, s.kind, p.location, p.text FROM knowledge_span p JOIN knowledge_source s ON s.id = p.source_id
     WHERE p.workspace_id = $1 AND p.id = ANY($2::uuid[])`, [ws, [...new Set(spanIds)]]);
  return new Map(rows.map(r => [r.id, { spanId: r.id, sourceId: r.source_id, sourceTitle: r.title ?? 'Untitled source', sourceKind: r.kind, location: r.location, quote: r.text.slice(0, 400) }]));
}

/** Every fact of the agent's linked offerings, and whether she may say it on her calls, with the reason when not. */
export async function sayableFacts(q: Queryable, ws: string, c: AgentConfig): Promise<SayableFact[]> {
  const base = stripKnowledge(c);
  const ids = base.knowledge?.offeringIds ?? [];
  if (!ids.length) return [];
  const offerings = await many<OfferingRow>(q, 'SELECT id, name, facts, never_say FROM offering WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL', [ws, ids]);
  const spanIds = offerings.flatMap(o => o.facts.map(f => f.spanId));
  const approved = new Set((await many<{ id: string }>(q, "SELECT id FROM knowledge_span WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'approved'", [ws, spanIds])).map(r => r.id));
  const refs = await sourceRefs(q, ws, spanIds);
  let known: AgentConfig;
  try { known = await withKnowledge(q, ws, c); } catch { known = base; }
  // Why a materialised fact stays off calls, in words for the buyer (the lint messages name internal keys).
  const findings = lintAgentConfig(known), shape = shapeLint(known);
  const reason = new Map<string, string>();
  known.facts.forEach((f, i) => {
    const k = f.source + '\u0000' + f.value;                   // a sheet row's cells share one passage: key by value too
    if (findings.some(x => x.effect === 'drop' && x.path === `facts[${i}]`)) reason.set(k, `The safety rules keep facts like this off ${c.category} calls.`);
    else if (shape.some(x => x.path === `facts[${i}].value`)) reason.set(k, 'It reads as a line to say rather than a fact; reword it in its offering.');
  });
  const bySource = new Map(known.facts.filter(f => f.source.startsWith(KB)).map(f => [f.source.slice(KB.length) + '\u0000' + f.value, f]));
  const want = base.knowledge?.purposes ? new Set(base.knowledge.purposes) : null;
  const out: SayableFact[] = [];
  for (const o of ids.map(id => offerings.find(x => x.id === id)).filter((x): x is OfferingRow => !!x)) {
    for (const f of o.facts) {
      const purpose = factPurpose(f.purposes);
      const m = bySource.get(f.spanId + '\u0000' + f.text);
      let why: string | null = null;
      if (!approved.has(f.spanId)) why = 'Its source passage is no longer approved.';
      else if (want && !f.purposes.some(p => want.has(p))) why = 'This agent uses only some kinds of facts, and this is not one of them.';
      else if (purpose === 'offer' && c.category !== 'promotional') why = `Offers and prices are said only on promotional calls; this agent makes ${c.category} calls.`;
      else if (!m) why = 'It could not be added to her facts.';
      else if (reason.has(m.source + '\u0000' + m.value)) why = reason.get(m.source + '\u0000' + m.value)!;
      out.push({ offering: o.name, text: f.text, purpose, onCalls: !why, why, key: m?.key ?? null, source: refs.get(f.spanId) ?? null });
    }
  }
  return out;
}
