// Insights: the funnel, issues in "what happened, why, what you can do", the monitors that watch for them, and learning proposals
// and experiments with the calls needed to prove them. Under-powered is a designed state: there are no daily winner badges.
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, NotMeasured, PageHead, SelectField } from '../ui.tsx';
import { Funnel } from '../funnel.tsx';
import { agentList, campaignFunnel, campaignGet, campaignList } from '../data.ts';
import { ago, count, date } from '../format.ts';
import { prettyCode } from './contacts.tsx';

interface IssueRow { id: string; category: string; severity: string; status: string; detail: unknown; created_at: string }
interface ProposalRow { id: string; agent_id: string; kind: string; status: string; rationale: string | null; calls_to_prove: number | null; gates_passed: boolean | null; created_at: string }
interface ExperimentRow { id: string; state: string; callsToProve?: number; started_at: string; expires_at: string | null; result?: { verdict?: string; reasons?: string[]; shadowAA?: { passed: boolean } } | null }
interface MonitorInfo { monitors: { id: string; name: string; last_read_at?: string | null; config?: unknown }[]; defaults: { name: string; config: { signal: string; threshold: number; windowCalls: number; minCalls: number; severity: string; category: string } }[] }
const detailText = (d: unknown): string => (typeof d === 'string' ? d : d && typeof d === 'object' ? ((d as any).message ?? (d as any).summary ?? (d as any).reason ?? JSON.stringify(d)) : '');

export default function Insights() {
  const { act, refresh, say } = useApp();
  const camps = useData('camps', campaignList);
  const [cid, setCid] = useState('');
  const pick = cid || camps.data?.[0]?.id || '';
  const funnel = useData(['insfunnel', pick], pick ? async () => campaignFunnel(pick, (await campaignGet(pick)).audienceId) : null);
  const issues = useData('issues', () => run<{ issues: IssueRow[] }>('issue.list', { status: 'open' }));
  const monitors = useData('monitors', () => run<MonitorInfo>('monitor.list', {}));
  const props = useData('proposals', () => run<ProposalRow[]>('proposal.list', {}));
  const exps = useData('experiments', () => run<ExperimentRow[]>('experiment.list', {}));
  const agents = useData('agents', agentList);
  const [busy, setBusy] = useState(false);
  const published = (agents.data ?? []).filter(a => a.latestVersion);
  return (
    <div className="page">
      <PageHead title="Insights" sub="What happened, why, and what you can do. Every number says how many calls it rests on." />
      <div className="stack">
        <Card aria-labelledby="fn-h"><CardHead id="fn-h" title="Where people drop out"
          actions={camps.data && camps.data.length > 0 ? <SelectField label="Campaign" value={pick} onChange={e => setCid(e.target.value)}>{camps.data.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : undefined} />
          {camps.state === 'ready' && (camps.data?.length ?? 0) === 0 ? <Empty title="No campaign to measure yet" body="The funnel fills in as a campaign dials. Until then there is nothing to draw, and nothing is shown as zero." />
            : <Async q={funnel} what="The funnel" tool="campaign.funnel" rows={5}>{d => d.every(s => !s.n) ? <Empty title="No calls to measure yet" body="Nothing has been dialled, so nothing is drawn. This is not a zero." /> : <Funnel stages={d} />}</Async>}</Card>

        <Card aria-labelledby="is-h"><CardHead id="is-h" title="Issues" sub="Opened by monitors from patterns across calls." />
          <Async q={issues} what="Issues" tool="issue.list" empty={d => d.issues.length === 0 ? <Empty title="No open issues" body={monitors.data && monitors.data.monitors.length === 0 ? 'No monitor is switched on yet, so this is not an all-clear. Turn some on below.' : 'Monitors have been reading calls and none has crossed its line.'} /> : null}>
            {d => <ul className="issues">{d.issues.map(i => (
              <li key={i.id}><div className="row"><Chip tone={i.severity === 'critical' ? 'brick' : i.severity === 'warning' ? 'marigold' : 'neutral'} icon={<AlertTriangle size={12} aria-hidden />}>{prettyCode(i.severity)}</Chip><span className="small muted">first seen {ago(i.created_at)}</span></div>
                <h3>{prettyCode(i.category)}</h3><p className="small">{detailText(i.detail)}</p>
                <div><Btn size="sm" onClick={() => say(`Issue ${i.category}: ${detailText(i.detail)}. What should I change? Prepare it as a change I can accept.`)}>Ask Saarthi what to change</Btn></div></li>))}</ul>}</Async></Card>

        <Card aria-labelledby="mo-h"><CardHead id="mo-h" title="What VP watches" sub="A monitor that has not read any calls yet is shown as not read, never as all good." />
          <Async q={monitors} what="Monitors" tool="monitor.list">{d0 => { const d = { monitors: d0.monitors ?? [], defaults: d0.defaults ?? [] }; return <>
            {d.monitors.length > 0 && <ul className="billing">{d.monitors.map(m => <li key={m.id}><strong>{m.name}</strong>{m.last_read_at ? <span className="small muted">last read {ago(m.last_read_at)}</span> : <NotMeasured>Not read yet</NotMeasured>}</li>)}</ul>}
            {d.defaults.filter(x => !d.monitors.some(m => m.name === x.name)).length > 0 && <><h3 style={{ margin: '12px 0 4px' }}>Suggested monitors</h3><ul className="billing">{d.defaults.filter(x => !d.monitors.some(m => m.name === x.name)).map(x => (
              <li key={x.name}><div><strong>{x.name}</strong><span className="small muted"> opens an issue at {Math.round(x.config.threshold * 100)}% over the last {x.config.windowCalls} calls, once at least {x.config.minCalls} are in</span></div>
                <Btn size="sm" onClick={async () => { const r = await act('monitor.create', { name: x.name, ...x.config }, { describe: 'Monitor added.' }); if (r.ok) monitors.reload(); }}>Turn on</Btn></li>))}</ul></>}</>; }}</Async></Card>

        <Card aria-labelledby="ln-h"><CardHead id="ln-h" title="Proposed changes" sub="VP drafts these from an agent's own calls. Nothing changes without your tap, and each is tested before it reaches callers."
          actions={published.length > 0 ? <Btn size="sm" busy={busy} onClick={async () => { setBusy(true); const r = await act('learning.propose', { agentId: published[0].id, max: 2 }, { describe: 'Looked for improvements.' }); setBusy(false); if (r.ok) props.reload(); }}>Look for improvements</Btn> : undefined} />
          <Async q={props} what="Learning proposals" tool="proposal.list" empty={d => d.length === 0 ? <Empty title="No proposals yet" body="Proposals need enough calls on a published agent to cite as evidence." /> : null}>
            {d => <ul className="issues">{d.map(p => (
              <li key={p.id}><div className="row"><Chip tone={p.status === 'accepted' ? 'leaf' : p.status === 'rejected' ? 'brick' : 'marigold'}>{prettyCode(p.status)}</Chip><Chip>{prettyCode(p.kind)}</Chip>{p.gates_passed === false && <Chip tone="brick">Failed a safety gate</Chip>}</div>
                <p>{p.rationale ?? 'No rationale recorded.'}</p><p className="small muted">{p.calls_to_prove != null ? `Needs about ${count(p.calls_to_prove)} calls to prove.` : 'Calls needed: not worked out yet.'} Drafted {date(p.created_at)}.</p>
                {p.status === 'probed' || p.status === 'passed' ? <div><Btn kind="primary" size="sm" onClick={async () => { const r = await act('proposal.accept', { proposalId: p.id }, { describe: 'Test started.' }); if (r.ok) refresh(); }}>Test this on real calls…</Btn></div>
                  : p.status === 'proposed' || p.status === 'draft' ? <div><Btn size="sm" onClick={async () => { const r = await act('proposal.probe', { proposalId: p.id }, { describe: 'Simulated both versions.' }); if (r.ok) props.reload(); }}>Simulate first</Btn></div> : null}</li>))}</ul>}</Async></Card>

        <Card aria-labelledby="ex-h"><CardHead id="ex-h" title="Tests running" sub="A test has no winner until it has enough calls." />
          <Async q={exps} what="Experiments" tool="experiment.list" empty={d => d.length === 0 ? <Empty title="Nothing is being tested" body="Accept a proposal above to start one." /> : null}>
            {d => <ul className="issues">{d.map(e => <li key={e.id}><div className="row"><Chip tone="peacock">{prettyCode(e.state)}</Chip>{e.callsToProve != null && <span className="small muted tnum">{count(e.callsToProve)} calls to prove</span>}</div>
              <p className="small">{e.result?.verdict ? `Verdict: ${e.result.verdict}` : <><Chip tone="marigold">Under-powered</Chip> No winner can be shown yet.</>}</p>{e.expires_at && <p className="small muted">Decides by {date(e.expires_at)}.</p>}</li>)}</ul>}</Async></Card>
      </div>
    </div>
  );
}
