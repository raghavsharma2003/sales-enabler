// "Why she said this": the facts a line of hers used, each with where it came from (a web page, a document page, a
// sheet row) and the passage, or her own brief. Shared by the practice chat and the call page; the server decides the
// match (shared/company-facts.ts factUses), conservatively, so a line with no match shows nothing.
export interface SourceRef { sourceTitle: string; location: Record<string, unknown>; quote: string }
export interface WhyUse { sentence: string; facts: { key: string; value: string; from: SourceRef | null; inBrief: boolean }[] }

/** Where in its source a fact came from, in words: the web page, the PDF page, the sheet row. */
export function place(f: { sourceTitle: string; location: Record<string, unknown> }): string {
  const l = f.location ?? {};
  if (typeof l.url === 'string') { let p = String(l.title ?? ''); if (!p) { try { p = new URL(l.url).pathname; } catch { p = l.url; } } return `${f.sourceTitle}, page "${p}"`; }
  if (typeof l.row === 'number') return `${f.sourceTitle}, row ${l.row}`;
  if (typeof l.page === 'number') return `${f.sourceTitle}, page ${l.page}`;
  return f.sourceTitle;
}

export function WhySaid({ uses }: { uses: WhyUse[] }) {
  if (!uses.length) return null;
  const facts = [...new Map(uses.flatMap(u => u.facts).map(f => [f.key, f])).values()];
  return (
    <details className="why-said"><summary>Why she said this</summary>
      <ul>{facts.map(f => <li key={f.key}>
        <span lang="hi">{f.value}</span>
        <span className="small muted"> · {f.from ? <>from {place(f.from)}</> : 'from her brief'}</span>
        {f.from && <blockquote lang="hi">{f.from.quote}</blockquote>}
      </li>)}</ul>
    </details>
  );
}
