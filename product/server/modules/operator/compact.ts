// What the Operator's model sees of a tool result. A result over the cap used to be cut at a character count, which
// left invalid JSON and lost whatever came after the cut (agent.create's draft pushed its own status past it). Now a
// result over the cap becomes a compact, VALID JSON projection: ids, hashes, statuses, names, counts, errors and the
// receipt fields stay; long strings are shortened, long arrays keep their first items, and large nested values (drafts,
// transcripts, configs) are replaced by a note, in stages until it fits. An explicit `truncated` marker lists what was
// left out. The web gets the full result; this only changes what the model reads.

/** Keys whose values are worth keeping at any depth: identity, state, counts and what went wrong. */
const KEEP = /(^outcome$|^notDone$|^id$|Id$|Ids$|^ids$|hash$|Hash$|^status$|^state$|^name$|^title$|^label$|^kind$|^type$|^tool$|^mode$|^risk$|^actionId$|^reason$|^error|^errors$|^code$|^message$|^summary$|^note$|count$|Count$|^total|^n$|^number$|^version$|^compiles$|^ok$|^lint$|^blockers$|^warnings$|^path$|^at$|Inr|^percent$)/;

interface Stage { maxString: number; maxItems: number; bigValue: number; depth: number }
const STAGES: Stage[] = [
  { maxString: 600, maxItems: 10, bigValue: 4_000, depth: 8 },
  { maxString: 240, maxItems: 5, bigValue: 1_500, depth: 6 },
  { maxString: 120, maxItems: 3, bigValue: 600, depth: 4 },
  { maxString: 80, maxItems: 2, bigValue: 200, depth: 3 },
];

function project(v: unknown, path: string, s: Stage, omitted: string[], depth: number, keep: boolean): unknown {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.length <= s.maxString) return v;
    omitted.push(`${path} (string, ${v.length} chars)`);
    return v.slice(0, s.maxString) + '…';
  }
  if (Array.isArray(v)) {
    if (depth >= s.depth) { omitted.push(`${path} (${v.length} items)`); return { omittedItems: v.length }; }
    const out = v.slice(0, s.maxItems).map((x, i) => project(x, `${path}[${i}]`, s, omitted, depth + 1, keep));
    if (v.length > s.maxItems) {
      omitted.push(`${path}[${s.maxItems}..${v.length - 1}]`);
      // The ids of the items left out stay, so the model can still name any of them.
      const ids = v.slice(s.maxItems).map(x => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>).id : undefined)).filter(x => typeof x === 'string' || typeof x === 'number');
      out.push({ moreItems: v.length - s.maxItems, ...(ids.length ? { ids: ids.slice(0, 50) } : {}) });
    }
    return out;
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      const important = KEEP.test(k);
      const size = JSON.stringify(x ?? null).length;
      // Large objects (drafts, configs, briefs) become a note; arrays keep their first items instead (ids live there).
      if (!important && !keep && x !== null && typeof x === 'object' && ((!Array.isArray(x) && size > s.bigValue) || depth >= s.depth)) {
        omitted.push(`${p} (${size} chars)`);
        const kept = essentials(x, '', {}, 8);          // ids and statuses inside what was left out
        out[k] = { omitted: true, chars: size, ...(Array.isArray(x) ? { items: x.length } : {}), ...(Object.keys(kept).length ? { kept } : {}) };
        continue;
      }
      out[k] = project(x, p, s, omitted, depth + 1, keep && important);
    }
    return out;
  }
  return String(v);
}

/** Scalars with kept keys, anywhere in the value, flattened by path: the last resort, still valid JSON. */
function essentials(v: unknown, path = '', out: Record<string, unknown> = {}, limit = 60): Record<string, unknown> {
  if (Object.keys(out).length >= limit || v === null || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const p = path ? (Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`) : k;
    if (x === null || typeof x !== 'object') { if (KEEP.test(k) && Object.keys(out).length < limit) out[p] = typeof x === 'string' && x.length > 120 ? x.slice(0, 120) + '…' : x; }
    else if (!Array.isArray(x) || Number(k) < 3 || !Array.isArray(v)) essentials(x, p, out, limit);
  }
  return out;
}

/** JSON text of `value`, at most `maxChars` long (unless the essentials alone exceed it), always parseable. */
export function compactJson(value: unknown, maxChars: number): string {
  const full = JSON.stringify(value ?? null);
  if (full.length <= maxChars) return full;
  for (const s of STAGES) {
    const omitted: string[] = [];
    const projected = project(value, '', s, omitted, 0, true) as Record<string, unknown> | unknown;
    const wrap = (o: string[]) => (projected && typeof projected === 'object' && !Array.isArray(projected)
      ? { ...(projected as Record<string, unknown>), truncated: { omitted: o, totalChars: full.length } }
      : { value: projected, truncated: { omitted: o, totalChars: full.length } });
    let text = JSON.stringify(wrap(omitted));
    // A long omitted list is itself a cost: keep the first entries and count the rest.
    if (text.length > maxChars && omitted.length > 12) text = JSON.stringify(wrap([...omitted.slice(0, 12), `…and ${omitted.length - 12} more`]));
    if (text.length <= maxChars) return text;
  }
  return JSON.stringify({ ...essentials(value), truncated: { omitted: ['everything but ids, statuses, names, counts and errors'], totalChars: full.length } });
}
