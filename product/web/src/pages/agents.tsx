import { useState } from 'react';
import { Archive, Copy, Plus, RotateCcw } from 'lucide-react';
import { useApp, useData, useTool } from '../store.tsx';
import { agentList, adoptBusinessName } from '../data.ts';
import { Link, useNav } from '../router.tsx';
import { Async, Btn, Card, Chip, Empty, PageHead, Segmented, Sheet, TextArea, TextField } from '../ui.tsx';
import { run } from '../api.ts';
import { jobLabel, langShort } from '../catalog.ts';
import { useVoiceStack } from '../use-voice-stack.tsx';
import { ago } from '../format.ts';
import type { AgentRow } from '../types.ts';
import AgentBuilder from './agent-builder.tsx';

export default function Agents({ id }: { id?: string }) {
  if (id) return <AgentBuilder id={id} />;
  return <List />;
}

function List() {
  const { hasTool } = useApp();
  const q = useData<AgentRow[]>('agents', agentList);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'current' | 'archived'>('current');
  return (
    <div className="page">
      <PageHead title="Agents" sub="Each agent is one job, one voice, and the facts she may use. Start with a job, then hear her." actions={<Btn kind={q.data?.length === 0 ? 'secondary' : 'primary'} icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)}>New agent</Btn>} />
      {hasTool('agent.archive') && <div style={{ marginBottom: 16 }}><Segmented<'current' | 'archived'> label="Which agents" value={view} onChange={setView} options={[{ value: 'current', label: 'In use' }, { value: 'archived', label: 'Archived' }]} /></div>}
      {view === 'archived' ? <ArchivedList onRestored={() => { q.reload(); setView('current'); }} /> :
      <Async q={q} what="Agents" tool="agent.list" empty={d => d.length === 0 ? <Card><Empty title="No agents yet" body="Pick a job and name her. You choose her voice next, by ear and by the measured figures." action={<Btn kind="primary" onClick={() => setOpen(true)}>New agent</Btn>} /></Card> : null}>
        {d => <ul className="agentgrid" aria-label="Agents">{d.map(a => <AgentCard key={a.id} a={a} onChanged={q.reload} />)}</ul>}
      </Async>}
      {open && <NewAgent onClose={() => setOpen(false)} />}
    </div>
  );
}

interface ArchivedRow { id: string; name: string; archived_at: string; archive_reason: string | null; latest_version: number | null }
/** Archived agents keep their versions, tests and calls; restoring puts one back as it was. */
function ArchivedList({ onRestored }: { onRestored: () => void }) {
  const { act } = useApp();
  const q = useData<ArchivedRow[]>('agents-archived', async () => (await run<{ agents: ArchivedRow[] }>('agent.list', { archived: true })).agents);
  return (
    <Async q={q} what="Archived agents" tool="agent.list" empty={d => d.length === 0 ? <Card><Empty title="Nothing archived" body="An archived agent keeps its versions, tests and calls, and can be restored at any time." /></Card> : null}>
      {d => <ul className="agentgrid" aria-label="Archived agents">{d.map(a => (
        <li key={a.id} className="agentcard">
          <div className="row" style={{ justifyContent: 'space-between' }}><Chip>Archived</Chip><span className="small muted">{ago(a.archived_at)}</span></div>
          <h3 className="serif" style={{ fontSize: '1.25rem' }}><Link to={`/agents/${a.id}`} className="rowlink">{a.name}</Link></h3>
          <p className="small muted">{a.latest_version ? `Published up to v${a.latest_version}. ` : ''}Its versions, tests and calls are kept.{a.archive_reason ? ` Reason: ${a.archive_reason}` : ''}</p>
          <div className="row"><Btn size="sm" icon={<RotateCcw size={14} aria-hidden />} onClick={async () => { const r = await act('agent.restore', { agentId: a.id }, { describe: `${a.name} is restored.` }); if (r.ok) onRestored(); }}>Restore</Btn></div>
        </li>))}</ul>}
    </Async>
  );
}

function AgentCard({ a, onChanged }: { a: AgentRow; onChanged: () => void }) {
  const { act, hasTool } = useApp(); const go = useNav();
  const stack = useVoiceStack(a).stack ?? null;
  const [sheet, setSheet] = useState<'duplicate' | 'archive' | null>(null);
  const [name, setName] = useState(`${a.name} (copy)`); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const duplicate = async () => { setBusy(true); const r = await act<{ agentId: string }>('agent.duplicate', { agentId: a.id, name: name.trim() }, { describe: 'Copy made as a new draft. Nothing has reached anyone.' }); setBusy(false); if (r.ok) go(`/agents/${r.result.agentId}`); };
  const archive = async () => { setBusy(true); const r = await act('agent.archive', { agentId: a.id, ...(reason.trim() ? { reason: reason.trim() } : {}) }, { describe: `${a.name} is archived. Its versions, tests and calls are kept.` }); setBusy(false); if (r.ok) { setSheet(null); onChanged(); } };
  return (
    <li className="agentcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Chip tone={a.status === 'published' ? 'leaf' : 'marigold'}>{a.status === 'published' ? `Published v${a.latestVersion}` : 'Draft, not published'}</Chip>
        <span className="small muted">Edited {ago(a.updatedAt)}</span>
      </div>
      <h3 className="serif" style={{ fontSize: '1.25rem' }}><Link to={`/agents/${a.id}`} className="rowlink">{a.name}</Link></h3>
      <p className="small muted">{jobLabel(a.job)}{a.category ? ` · ${a.category}` : ''}{a.languages.length ? ` · ${[...new Set(a.languages.map(langShort))].slice(0, 3).join(', ')}` : ''}</p>
      {stack ? <p className="small"><strong>Voice:</strong> {stack.label}</p> : <p className="small"><Chip tone="marigold">No voice chosen</Chip> <Link to={`/agents/${a.id}?tab=voice`}>Choose one</Link></p>}
      {hasTool('agent.archive') && <div className="row" style={{ gap: 8 }}>
        <Btn size="sm" kind="ghost" icon={<Copy size={14} aria-hidden />} onClick={() => setSheet('duplicate')}>Duplicate</Btn>
        <Btn size="sm" kind="ghost" icon={<Archive size={14} aria-hidden />} onClick={() => setSheet('archive')}>Archive</Btn></div>}
      {sheet === 'duplicate' && <Sheet title={`Duplicate ${a.name}`} onClose={() => setSheet(null)}>
        <p className="small muted">A new draft with the same brief, voice and linked company information. Versions, tests and calls stay with {a.name}.</p>
        <TextField label="Name of the copy" value={name} onChange={e => setName(e.target.value)} data-autofocus />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={() => setSheet(null)}>Cancel</Btn>{name.trim() ? <Btn kind="primary" busy={busy} onClick={duplicate}>Make the copy</Btn> : <Btn disabled fix={null} reason="Give the copy a name.">Make the copy</Btn>}</div>
      </Sheet>}
      {sheet === 'archive' && <Sheet title={`Archive ${a.name}`} onClose={() => setSheet(null)}>
        <p className="small">She leaves this list and makes no calls. Nothing is deleted: her versions, tests and calls are kept, and you can restore her from Archived at any time. An agent a campaign or a phone number still uses cannot be archived.</p>
        <TextField label="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} hint="For example: starting again with a new script." />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={() => setSheet(null)}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={archive}>Archive</Btn></div>
      </Sheet>}
    </li>
  );
}

interface Template { id: string; label: string; industry: string; job: string; category: string; summary: string }
function NewAgent({ onClose }: { onClose: () => void }) {
  const { act, me } = useApp(); const go = useNav();
  const tpl = useTool<{ templates: Template[] }>('template.list', {});
  const [pick, setPick] = useState<string>(''); const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [busy, setBusy] = useState(false);
  const chosen = tpl.data?.templates.find(t => t.id === pick);
  const create = async () => {
    setBusy(true);
    const r = await act<{ agentId: string }>('agent.create', pick ? { name: name.trim(), templateId: pick } : { name: name.trim(), description: desc.trim() }, { describe: 'Draft created. Nothing has reached anyone.' });
    setBusy(false);
    if (r.ok) { if (pick) await adoptBusinessName(act, r.result.agentId, me?.workspace.name ?? ''); onClose(); go(`/agents/${r.result.agentId}`); }
  };
  const reason = !name.trim() ? 'Give the agent a name first.' : !pick && desc.trim().length < 10 ? 'Pick a starter above, or describe the job in a sentence or two.' : '';
  return (
    <Sheet title="New agent" onClose={onClose} wide>
      <TextField label="Agent name" value={name} onChange={e => setName(e.target.value)} hint="Your own label, for example “Renewals, Pune”. You can rename it later." data-autofocus />
      <div><p className="field-label">Start from an example</p>
        {tpl.state === 'missing' ? <p className="small muted">Starters are not switched on in this server yet; describe the job instead.</p> : !tpl.data ? <p className="small muted">Loading starters…</p> :
          <div role="radiogroup" aria-label="Starter" className="jobgrid">{tpl.data.templates.map(t => <button key={t.id} type="button" role="radio" aria-checked={pick === t.id} className={`jobcard${pick === t.id ? ' on' : ''}`} onClick={() => setPick(pick === t.id ? '' : t.id)}><strong>{t.label}</strong><span>{t.industry}, {t.category} calls</span></button>)}</div>}</div>
      {chosen ? <p className="small muted">{chosen.summary} Everything is editable, and nothing is published or called.</p> : <TextArea label="Or describe the job in your own words" value={desc} onChange={e => setDesc(e.target.value)} rows={3} hint="Who you call and what should be true at the end of the call." />}
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>{reason ? <Btn disabled fix={null} reason={reason}>Create draft</Btn> : <Btn kind="primary" busy={busy} onClick={create}>Create draft</Btn>}</div>
    </Sheet>
  );
}
