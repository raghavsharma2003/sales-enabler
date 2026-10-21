// Funnel with the reason at every drop: rows, valid, callable, dialled, connected, agenda done, outcome. Bars grow to real values.
import { useState } from 'react';
import { count, pct } from './format.ts';
import { NotMeasured } from './ui.tsx';
import type { FunnelStage } from './types.ts';

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const top = Math.max(1, ...stages.map(s => s.n ?? 0));
  return (
    <ol className="funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].n : null;
        const lost = prev != null && s.n != null ? prev - s.n : null;
        return (
          <li key={s.key}>
            <div className="funnel-row"><span className="funnel-l">{s.label}</span>
              <span className="funnel-bar" aria-hidden><span style={{ transform: `scaleX(${(s.n ?? 0) / top})` }} /></span>
              <span className="funnel-n tnum">{s.n == null ? <NotMeasured>Not measured</NotMeasured> : count(s.n)}{prev ? <small> {pct(s.n! / prev)}</small> : null}</span></div>
            {s.drops && s.drops.length > 0 && lost != null && lost > 0 && (
              <div className="funnel-drop"><button type="button" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>Why {count(lost)} did not continue</button>
                {open === s.key && <ul>{s.drops.filter(d => d.n > 0).map(d => <li key={d.code}><span>{d.label}</span><span className="tnum">{count(d.n)}</span></li>)}</ul>}</div>)}
          </li>
        );
      })}
    </ol>
  );
}
