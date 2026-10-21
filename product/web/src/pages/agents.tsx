import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp, useTool } from '../store.tsx';
import { Link, useNav } from '../router.tsx';
import { Async, Btn, Card, Chip, Empty, PageHead, Sheet, TextField } from '../ui.tsx';
import { JOBS, JOB_INFO, jobLabel, LANG_LABEL } from '../catalog.ts';
import { ago } from '../format.ts';
import { getStack } from '../../../shared/stacks.ts';
import type { AgentRow } from '../types.ts';
import AgentBuilder from './agent-builder.tsx';

export default function Agents({ id }: { id?: string }) {
  if (id) return <AgentBuilder id={id} />;
  return <List />;
}

function List() {
  const q = useTool<{ rows: AgentRow[] }>('agent.list', {});
  const [open, setOpen] = useState(false);
  return (
    <div className="page">
      <PageHead title="Agents" sub="Each agent is one job, one voice, and the facts she may use. Start with a job, then hear her." actions={<Btn kind="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)}>New agent</Btn>} />
      <Async q={q} what="Agents" tool="agent.list" empty={d => d.rows.length === 0 ? <Card><Empty title="No agents yet" body="Pick a job and name her. You choose her voice next, by ear and by the measured figures." action={<Btn kind="primary" onClick={() => setOpen(true)}>Make the first agent</Btn>} /></Card> : null}>
        {d => <ul className="agentgrid" aria-label="Agents">{d.rows.map(a => <AgentCard key={a.id} a={a} />)}</ul>}
      </Async>
      {open && <NewAgent onClose={() => setOpen(false)} />}
    </div>
  );
}

function AgentCard({ a }: { a: AgentRow }) {
  const stack = a.stackId ? getStack(a.stackId) : null;
  return (
    <li className="agentcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Chip tone={a.status === 'live' ? 'leaf' : a.status === 'testing' ? 'peacock' : 'marigold'}>{a.status === 'live' ? `Live v${a.publishedVersion}` : a.status === 'testing' ? `Testing v${a.version}` : `Draft v${a.version}`}</Chip>
        {a.calls7d != null ? <span className="small muted tnum">{a.calls7d} calls in 7 days</span> : <span className="small muted">No calls yet</span>}
      </div>
      <h3 className="serif" style={{ fontSize: '1.25rem' }}><Link to={`/agents/${a.id}`} className="rowlink">{a.name}</Link></h3>
      <p className="small muted">{jobLabel(a.job)} · {a.category} · {a.languages.slice(0, 3).map(l => LANG_LABEL[l]?.split(' ')[0] ?? l).join(', ')}</p>
      {stack ? <p className="small"><strong>Voice:</strong> {stack.label}</p> : <p className="small"><Chip tone="marigold">No voice chosen</Chip> <Link to={`/agents/${a.id}?tab=voice`}>Choose one</Link></p>}
      <p className="small muted">Edited {ago(a.updatedAt)}</p>
    </li>
  );
}

function NewAgent({ onClose }: { onClose: () => void }) {
  const { act } = useApp(); const go = useNav();
  const [job, setJob] = useState<string>('renewal_reminder'); const [name, setName] = useState('Asha'); const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const r = await act<{ id: string }>('agent.create', { job, persona: name, name: `${JOB_INFO[job].label}` }, { describe: 'Draft created. Nothing has reached anyone.' });
    setBusy(false);
    if (r.ok) { onClose(); go(`/agents/${r.result.id}`); }
  };
  return (
    <Sheet title="New agent" onClose={onClose} wide>
      <TextField label="Her name" value={name} onChange={e => setName(e.target.value)} hint="You can change it later." data-autofocus />
      <div role="radiogroup" aria-label="Job" className="jobgrid">{JOBS.map(j => <button key={j} type="button" role="radio" aria-checked={job === j} className={`jobcard${job === j ? ' on' : ''}`} onClick={() => setJob(j)}><strong>{JOB_INFO[j].label}</strong><span>{JOB_INFO[j].who}</span></button>)}</div>
      <p className="small muted">{JOB_INFO[job].blurb} This creates a saved draft. Nothing is published and no one is called.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>{name.trim() ? <Btn kind="primary" busy={busy} onClick={create}>Create draft</Btn> : <Btn disabled reason="Give her a name first.">Create draft</Btn>}</div>
    </Sheet>
  );
}
