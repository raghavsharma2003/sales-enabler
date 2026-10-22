// Themes across calls (insight.get / insight.refresh). The model groups; only the quotes are checked against stored transcripts,
// so the count is labelled as the model's grouping and never as verified. Every quote is shown as it was said and opens its call at that moment.
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Empty, SelectField } from '../ui.tsx';
import { Link } from '../router.tsx';
import { date } from '../format.ts';
import type { AgentRow, CampaignRow } from '../types.ts';

type Kind = 'objection' | 'drop_off' | 'unanswered_question' | 'success_driver';
interface Quote { conversationId: string; text: string; speaker: string; startMs: number | null }
interface Theme { kind: Kind; title: string; count: number; of: number; quotes: Quote[] }
interface Insight { status: 'none' | 'done' | 'failed' | 'not_configured' | 'no_calls'; generatedAt?: string; themes?: Theme[]; callsSampled?: number; callsInScope?: number; reason?: string | null; note?: string; quotesDropped?: number; themesDropped?: number }
interface Refreshed extends Insight { ran: boolean; skipped?: string }

const KIND: Record<Kind, [string, string]> = {
  objection: ['Objections people raised', 'What callers pushed back on.'],
  drop_off: ['Where people dropped off', 'Where calls ended or lost the caller.'],
  unanswered_question: ['Questions she could not answer', 'Callers asked, and the agent had no answer.'],
  success_driver: ['What came before a reached goal', 'Seen before calls that reached their goal. Observed, not proven to cause it.'],
};
const ORDER: Kind[] = ['objection', 'drop_off', 'unanswered_question', 'success_driver'];
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function CallThemes({ agents, campaigns }: { agents: AgentRow[]; campaigns: CampaignRow[] }) {
  const { act } = useApp();
  const [scope, setScope] = useState('w');
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string | null>(null);
  const args = scope === 'w' ? {} : scope.startsWith('a:') ? { agentId: scope.slice(2) } : { campaignId: scope.slice(2) };
  const q = useData<Insight>(['insight', scope], () => run<Insight>('insight.get', args));
  const refresh = async () => {
    setBusy(true); setSkipped(null);
    const r = await act<Refreshed>('insight.refresh', args, { quiet: true });
    setBusy(false);
    if (!r.ok || !r.result) return;
    if (!r.result.ran) setSkipped(r.result.reason ?? 'Nothing needed rebuilding.');
    q.setData(r.result);
  };
  return (
    <Card aria-labelledby="th-h"><CardHead id="th-h" title="Themes across calls" sub="What came up across recent analysed calls. Test calls never count."
      actions={<div className="row" style={{ alignItems: 'flex-end' }}>
        <SelectField label="Scope" value={scope} onChange={e => { setScope(e.target.value); setSkipped(null); }}>
          <option value="w">The whole workspace</option>
          {agents.filter(a => a.latestVersion).map(a => <option key={a.id} value={`a:${a.id}`}>Agent: {a.name}</option>)}
          {campaigns.map(c => <option key={c.id} value={`c:${c.id}`}>Campaign: {c.name}</option>)}
        </SelectField>
        {q.state === 'ready' ? <Btn size="sm" icon={<RefreshCw size={14} aria-hidden />} busy={busy} onClick={() => void refresh()}>Refresh</Btn> : <Btn size="sm" busy>Refresh</Btn>}
      </div>} />
      {skipped && <p className="small muted" role="status">Not rebuilt: {skipped}</p>}
      <Async q={q} what="Themes across calls" tool="insight.get" rows={4}>{d => <Body d={d} />}</Async>
    </Card>
  );
}

function Body({ d }: { d: Insight }) {
  if (d.status === 'none') return <Empty title="No insight has been built yet" body="Insights are built every night from analysed calls, or right now with Refresh. Until a real call has been analysed there is nothing to build from." />;
  if (d.status === 'no_calls') return <Empty title="No analysed calls to learn from yet" body="Insights need real calls that have been analysed. Once some have ended and been analysed, they are built overnight, or on request with Refresh." />;
  if (d.status === 'not_configured') return <Empty title="Insights are not switched on for this server" body="No analysis model is configured here, so themes cannot be built. Calls and their words are unaffected. Ask whoever runs your VP server to configure analysis, then use Refresh." />;
  if (d.status === 'failed') return <Empty title="The last build did not finish" body={`${d.reason ? d.reason + ' ' : ''}Nothing was lost and the calls are untouched. Use Refresh to try again.`} />;
  const themes = d.themes ?? [];
  const built = <p className="small muted">Built {d.generatedAt ? date(d.generatedAt, true) : 'recently'} from {d.callsSampled ?? 0} of {d.callsInScope ?? 0} calls. {d.note}</p>;
  if (themes.length === 0) return <>{built}<Empty title="No themes found" body="The calls looked at did not share anything often enough to report. This is a result, not an error." /></>;
  return (
    <div className="stack">
      {built}
      {ORDER.map(k => { const list = themes.filter(t => t.kind === k).sort((a, b) => b.count - a.count); if (!list.length) return null;
        return <section key={k} aria-label={KIND[k][0]}><h3 className="dayhead">{KIND[k][0]}</h3><p className="small muted">{KIND[k][1]}</p>
          <ul className="themes">{list.map((t, i) => <li key={i}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><strong>{t.title}</strong><span className="small muted tnum">in {t.count} of {t.of} sampled calls (as grouped by the model)</span></div>
            <ul className="quotes">{t.quotes.map((q, j) => <li key={j}><blockquote lang="hi">“{q.text}”</blockquote>
              <span className="small muted">{q.speaker === 'agent' ? 'Agent' : 'Caller'} · </span><Link to={`/calls/${q.conversationId}${q.startMs != null ? `?t=${Math.round(q.startMs)}` : ''}`} className="small">Open the call{q.startMs != null ? ` at ${clock(q.startMs)}` : ''}</Link></li>)}</ul></li>)}</ul></section>; })}
      {((d.quotesDropped ?? 0) > 0 || (d.themesDropped ?? 0) > 0) && <p className="small muted">{d.quotesDropped ?? 0} quote{(d.quotesDropped ?? 0) === 1 ? '' : 's'} and {d.themesDropped ?? 0} theme{(d.themesDropped ?? 0) === 1 ? '' : 's'} were left out because the words could not be found in a stored transcript.</p>}
    </div>
  );
}
