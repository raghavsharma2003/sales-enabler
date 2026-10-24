// Funnel with the reason at every drop: rows, valid, callable, dialled, connected, agenda done, outcome. Bars grow to real values.
import { count, pct } from './format.ts';
import { NotMeasured } from './ui.tsx';
import type { FunnelStage } from './types.ts';

export function Funnel({ stages }: { stages: FunnelStage[] }) {
    const top = Math.max(1, ...stages.map(s => s.n ?? 0));
  return (
    <ol className="funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].n : null;
        return (
          <li key={s.key}>
            <div className="funnel-row"><span className="funnel-l">{s.label}</span>
              <span className="funnel-bar" aria-hidden><span style={{ transform: `scaleX(${(s.n ?? 0) / top})` }} /></span>
              <span className="funnel-n tnum">{s.n == null ? <NotMeasured>Not measured</NotMeasured> : count(s.n)}{prev && s.n != null ? <small> {pct(s.n / prev)}</small> : null}</span></div>
            {s.note && <p className="funnel-note small muted">{s.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
