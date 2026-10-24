// Turn extracted text into spans: paragraph-aware chunks of roughly 500-1200 characters, each with the place
// it came from (page, paragraph range, character range) so a fact can quote its source.
export interface RawSpan { text: string; location: Record<string, unknown> }
interface Piece { text: string; start: number; para: number; page?: number }

const TARGET = 500, MAX = 1200;

export function clean(s: string): string {
  return s.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function split(text: string, base: number, page: number | undefined, para0: number): Piece[] {
  const out: Piece[] = [];
  let para = para0;
  const re = /\S[\s\S]*?(?=\n\s*\n|$)/g;
  for (let m; (m = re.exec(text)); ) {
    const p = m[0].trimEnd();
    if (!p) continue;
    if (p.length <= MAX) { out.push({ text: p, start: base + m.index, para, page }); }
    else {
      let s = 0;
      while (s < p.length) {
        let e = Math.min(s + 1000, p.length);
        if (e < p.length) {
          const win = p.slice(s, e);
          const stop = Math.max(win.search(/[.!?।][^.!?।]*$/), 0);
          const space = win.lastIndexOf(' ');
          e = s + (stop > 400 ? stop + 1 : space > 400 ? space : win.length);
        }
        const piece = p.slice(s, e).trim();
        if (piece) out.push({ text: piece, start: base + m.index + s, para, page });
        s = e;
        while (s < p.length && /\s/.test(p[s])) s++;
      }
    }
    para++;
  }
  return out;
}

function pack(pieces: Piece[], paged: boolean): RawSpan[] {
  const spans: RawSpan[] = [];
  let cur: Piece[] = [];
  const len = () => cur.reduce((n, p) => n + p.text.length + 2, 0);
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0], last = cur[cur.length - 1];
    spans.push({
      text: cur.map(p => p.text).join('\n\n'),
      location: { ...(paged ? { page: first.page } : {}), paragraphs: [first.para, last.para], chars: [first.start, last.start + last.text.length] },
    });
    cur = [];
  };
  for (const p of pieces) {
    if (cur.length && (len() + p.text.length > MAX || (paged && cur[0].page !== p.page))) flush();
    cur.push(p);
    if (len() >= TARGET) flush();
  }
  flush();
  return spans;
}

export function chunkText(text: string): RawSpan[] {
  return pack(split(clean(text), 0, undefined, 1), false);
}

export function chunkPages(pages: { num: number; text: string }[]): RawSpan[] {
  const pieces: Piece[] = [];
  for (const pg of pages) pieces.push(...split(clean(pg.text), 0, pg.num, 1));
  return pack(pieces, true);
}
