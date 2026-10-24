// Turns a minified stack from the client event log back into source files and lines, using the maps the web build keeps
// in product/web/.maps/ (never served). For a review: `npx tsx product/scripts/client-stack.ts < stack.txt` or pass the
// stack as an argument. A frame whose chunk is not in .maps (another build) is printed as it was.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAPS = fileURLToPath(new URL('../web/.maps/', import.meta.url));
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a source map's "mappings" into, per generated line, [genCol, source, line, col, name?] segments (absolute values). */
export function decode(mappings: string): number[][][] {
  const out: number[][][] = []; let src = 0, line = 0, col = 0, name = 0;
  for (const l of mappings.split(';')) {
    const segs: number[][] = []; let gen = 0;
    for (const s of l.split(',')) {
      if (!s) continue;
      const v: number[] = []; let shift = 0, acc = 0;
      for (const ch of s) {
        const d = B64.indexOf(ch); acc += (d & 31) << shift;
        if (d & 32) { shift += 5; continue; }
        v.push(acc & 1 ? -(acc >>> 1) : acc >>> 1); acc = 0; shift = 0;
      }
      gen += v[0];
      if (v.length >= 4) { src += v[1]; line += v[2]; col += v[3]; if (v.length >= 5) name += v[4]; segs.push(v.length >= 5 ? [gen, src, line, col, name] : [gen, src, line, col]); }
    }
    out.push(segs);
  }
  return out;
}

const cache = new Map<string, { sources: string[]; names: string[]; lines: number[][][] } | null>();
function load(file: string) {
  if (!cache.has(file)) {
    const p = MAPS + file + '.map';
    if (!existsSync(p)) cache.set(file, null);
    else { const m = JSON.parse(readFileSync(p, 'utf8')); cache.set(file, { sources: m.sources, names: m.names ?? [], lines: decode(m.mappings) }); }
  }
  return cache.get(file)!;
}

/** One frame "at x (http://host/assets/chunks/agents-ABC.js:1:41105)" as "at AgentCard (src/pages/agents.tsx:38:7)". */
export function symbolicate(stack: string): string {
  return stack.replace(/at (\S+ )?\(?(?:https?:\/\/[^/\s]+)?\/assets\/(?:chunks\/)?([\w-]+\.js):(\d+):(\d+)\)?/g, (all, _fn, file, l, c) => {
    const m = load(file); if (!m) return all;
    const segs = m.lines[Number(l) - 1] ?? []; const col = Number(c) - 1;
    let hit: number[] | undefined; for (const s of segs) { if (s[0] <= col) hit = s; else break; }
    if (!hit) return all;
    const src = m.sources[hit[1]].replace(/^(\.\.\/)+/, '');
    return `at ${hit[4] !== undefined ? m.names[hit[4]] + ' ' : ''}(${src}:${hit[2] + 1}:${hit[3] + 1})`;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv.slice(2).join(' ') || readFileSync(0, 'utf8');
  console.log(symbolicate(input));
}
