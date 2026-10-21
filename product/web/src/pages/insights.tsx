// Insights: the funnel with reasons, issues in "what happened, why, what you can do", and learning proposals and experiments
// with the number of calls needed to prove them. Under-powered is a designed state: there are no daily winner badges.
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp, useTool } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Meter, PageHead, SelectField } from '../ui.tsx';
import { Funnel } from '../funnel.tsx';
import { ago, count, date, time } from '../format.ts';
import type { CampaignRow, FunnelStage, Issue, Proposal } from '../types.ts';

export default function Insights() {
  const { say, hasTool } = useApp();
  const camps = useTool<{ rows: CampaignRow[] }>(hasTool('campaign.list') ? 'campaign.list' : null, {});
  const [cid, setCid] = useState('');
  const funnel = useTool<{ stages: FunnelStage[]; asOf: string }>('insight.funnel', { campaignId: cid || undefined });
  const issues = useTool<{ rows: Issue[] }>('insight.issues', {});
  const learn = useTool<{ rows: Proposal[]; level: { id: string; label: string; note: string } }>('learning.proposals', {});
  const exps = useTool<{ rows: { id: string; name: string; armA: string; armB: string; callsSoFar: number; callsToProve: number; note: string }[] }>('experiment.list', {});
  return (
    <div className="page">
      <PageHead title="Insights" sub="What happened, why, and what you can do. Every number says how many calls it rests on." />
      <div className="stack">
        <Card aria-labelledby="fn-h"><CardHead id="fn-h" title="Where people drop out" sub={funnel.data ? `As of ${time(funnel.data.asOf)}` : undefined}
          actions={camps.data ? <SelectField label="Campaign" value={cid} onChange={e => setCid(e.target.value)}><option value="">Renewals Oct (latest)</option>{camps.data.rows.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField> : undefined} />
          <Async q={funnel} what="The funnel" tool="insight.funnel" rows={5}>{d => d.stages.every(s => !s.n) ? <Empty title="No calls to measure yet" body="The funnel fills in as calls are placed. Until then there is nothing to draw, and nothing is shown as zero." /> : <Funnel stages={d.stages} />}</Async></Card>

        <Card aria-labelledby="is-h"><CardHead id="is-h" title="Issues" sub="Ranked by calls affected and severity." />
          <Async q={issues} what="Issues" tool="insight.issues" empty={d => d.rows.length === 0 ? <Empty title="No open issues" body="Issues appear when a pattern shows up across calls. This is a measured empty, not a missing monitor." /> : null}>
            {d => <ul className="issues">{d.rows.map(i => (
              <li key={i.id}><div className="row"><Chip tone={i.severity === 'high' ? 'brick' : i.severity === 'medium' ? 'marigold' : 'neutral'} icon={<AlertTriangle size={12} aria-hidden />}>{i.severity === 'high' ? 'High' : i.severity === 'medium' ? 'Medium' : 'Low'}</Chip><span className="small muted tnum">{count(i.calls)} calls · first seen {ago(i.firstSeen)}</span></div>
                <h3>{i.title}</h3><p className="small"><strong>Why:</strong> {i.cause}</p>
                {i.fix ? <div className="row"><span className="small"><strong>What you can do:</strong> {i.fix}</span><Btn size="sm" onClick={() => say(`${i.title}. ${i.fix}. Prepare it as a change I can accept.`)}>Ask Saarthi to prepare it</Btn></div> : <p className="small muted">No suggested fix yet.</p>}</li>))}</ul>}</Async></Card>

        <Card aria-labelledby="ln-h"><CardHead id="ln-h" title="Proposed changes" sub={learn.data ? <>Learning level <strong>{learn.data.level.id} · {learn.data.level.label}</strong>. {learn.data.level.note}</> : undefined} />
          <Async q={learn} what="Learning proposals" tool="learning.proposals" empty={d => d.rows.length === 0 ? <Empty title="No proposals yet" body="Proposals need enough calls to be worth testing." /> : null}>
            {d => <ul className="issues">{d.rows.map(p => <ProposalCard key={p.id} p={p} />)}</ul>}</Async></Card>

        <Card aria-labelledby="ex-h"><CardHead id="ex-h" title="Tests running" sub="A test has no winner until it has enough calls." />
          <Async q={exps} what="Experiments" tool="experiment.list" empty={d => d.rows.length === 0 ? <Empty title="Nothing is being tested" body="Start one from a proposal above." /> : null}>
            {d => <ul className="issues">{d.rows.map(e => <li key={e.id}><h3>{e.name}</h3><p className="small muted">A: {e.armA} · B: {e.armB}</p><Meter label="Calls so far" value={e.callsSoFar} max={e.callsToProve} tone="peacock" note={`${count(e.callsSoFar)} of ${count(e.callsToProve)} needed`} /><p className="small"><Chip tone="marigold">Under-powered</Chip> {e.note}</p></li>)}</ul>}</Async></Card>
      </div>
    </div>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const { act, refresh } = useApp();
  const tone = p.state === 'proved' ? 'leaf' : p.state === 'testing' ? 'peacock' : p.state === 'rejected' ? 'brick' : 'marigold';
  return (
    <li><div className="row"><Chip tone={tone}>{{ proposed: 'Proposed', testing: 'Testing', proved: 'Proved', rejected: 'Rejected' }[p.state]}</Chip></div>
      <h3>{p.title}</h3><p className="small"><strong>Idea:</strong> {p.hypothesis}</p><p className="small"><strong>Evidence so far:</strong> {p.evidence}</p>
      {p.before && p.after && <div className="diffbox"><p className="small"><s>{p.before}</s></p><p className="small"><ins>{p.after}</ins></p></div>}
      <Meter label={p.state === 'proved' ? 'Proved on' : 'Calls needed to prove it'} value={p.callsSoFar} max={p.callsToProve} tone={p.state === 'proved' ? 'leaf' : 'peacock'} note={`${count(p.callsSoFar)} of ${count(p.callsToProve)} calls`} />
      {p.state === 'proposed' && <div><Btn kind="primary" size="sm" onClick={async () => { const r = await act('learning.decide', { id: p.id, title: p.title, decision: 'test' }, { describe: 'Test started.' }); if (r.ok) refresh(); }}>Test this on real calls…</Btn></div>}
    </li>
  );
}
export { date };
