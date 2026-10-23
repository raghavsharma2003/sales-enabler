// The guided start for a new workspace. Each step is done or not from what the server holds (agents, practice calls, contacts, campaigns),
// never from a flag kept in the browser, so it stays right after a reload, on another device, or when the assistant did the work.
// Every step has an action that exists. A step that cannot be done yet says what it waits for and links to it.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { agentList, campaignList } from '../data.ts';
import { Async, Btn, Card, CardHead, TextArea, TextField } from '../ui.tsx';
import { Link, useNav } from '../router.tsx';

interface Template { id: string; label: string; industry: string; job: string; category: string; summary: string }
const INDUSTRY = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

interface Progress { agents: { id: string; name: string; published: boolean }[]; heard: boolean; contacts: number; campaigns: number }
async function progress(): Promise<Progress> {
  const [agents, calls, contacts, camps] = await Promise.all([
    agentList(),
    run<{ calls: { channel: string }[] }>('call.search', { includeTest: true, limit: 50 }).catch(() => ({ calls: [] })),
    run<{ contacts: unknown[] }>('contact.list', { limit: 1 }).catch(() => ({ contacts: [] })),
    campaignList(),
  ]);
  return { agents: agents.map(a => ({ id: a.id, name: a.name, published: !!a.latestVersion })), heard: calls.calls.some(c => c.channel === 'test'), contacts: contacts.contacts.length, campaigns: camps.length };
}

export default function GettingStarted() {
  const q = useData<Progress>('getting-started', progress);
  if (!q.data) return q.state === 'loading' ? null : <Async q={q} what="Getting started" tool="agent.list">{() => null}</Async>;
  const p = q.data;
  const done = p.agents.length > 0 && p.heard && p.contacts > 0 && p.campaigns > 0;
  if (done) return null;
  const first = p.agents[0];
  const published = p.agents.find(a => a.published);
  return (
    <Card aria-labelledby="gs-h"><CardHead id="gs-h" title="Get started" sub="Four steps to your first calls. Each one is marked done from what is saved in your workspace." />
      <ol className="gsteps">
        <Step n={1} done={p.agents.length > 0} title="Create your calling agent" doneText={first ? `${first.name} is created.` : ''}>
          {p.agents.length === 0 && <CreateAgent onCreated={q.reload} />}
        </Step>
        <Step n={2} done={p.heard} title="Hear her" doneText="You have run a test call.">
          {!p.heard && (first
            ? <><p className="small muted">Call yourself in the browser, or run practice callers. Nothing reaches anyone.</p><div><Link to={`/agents/${first.id}?test=1`} className="btn btn-primary" style={{ textDecoration: 'none' }}><span>Hear {first.name}</span></Link></div></>
            : <Btn disabled reason="Create an agent first.">Hear her</Btn>)}
        </Step>
        <Step n={3} done={p.contacts > 0} title="Add contacts" doneText="Contacts are saved.">
          {p.contacts === 0 && <><p className="small muted">Paste a CSV or choose a file. You see a verdict for every row before anything is saved.</p><div><Link to="/contacts/import" className="btn btn-primary" style={{ textDecoration: 'none' }}><span>Add contacts</span></Link></div></>}
        </Step>
        <Step n={4} done={p.campaigns > 0} title="Launch a test campaign" doneText="A campaign exists.">
          {p.campaigns === 0 && (!published ? <Btn disabled reason={first ? 'Publish an agent first. A campaign uses a published version.' : 'Create an agent first.'} fix={first ? { label: 'Open the agent', to: `/agents/${first.id}` } : undefined}>Start a campaign</Btn>
            : p.contacts === 0 ? <Btn disabled reason="Add contacts first, so there is someone to call." fix={{ label: 'Add contacts', to: '/contacts/import' }}>Start a campaign</Btn>
            : <div><Link to="/campaigns/new" className="btn btn-primary" style={{ textDecoration: 'none' }}><span>Start a campaign</span></Link></div>)}
        </Step>
      </ol>
    </Card>
  );
}

function Step({ n, done, title, doneText, children }: { n: number; done: boolean; title: string; doneText: string; children?: React.ReactNode }) {
  return (
    <li className={`gstep${done ? ' done' : ''}`} aria-label={`Step ${n}: ${title}, ${done ? 'done' : 'not done'}`}>
      <span className="gnum" aria-hidden>{done ? <Check size={16} /> : n}</span>
      <div className="stack-s"><strong>{title}</strong>{done ? <span className="small muted">{doneText}</span> : null}{!done && children}</div>
    </li>
  );
}

function CreateAgent({ onCreated }: { onCreated: () => void }) {
  const { act, say } = useApp(); const go = useNav();
  const [mode, setMode] = useState<'describe' | 'template'>('describe');
  const [desc, setDesc] = useState('');
  const tpl = useData<{ templates: Template[] }>('start-templates', () => run<{ templates: Template[] }>('template.list', {}));
  const groups = useMemo(() => { const m = new Map<string, Template[]>(); for (const t of tpl.data?.templates ?? []) m.set(t.industry, [...(m.get(t.industry) ?? []), t]); return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)); }, [tpl.data]);
  const [pick, setPick] = useState<Template | null>(null); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="stack-s">
      <div role="radiogroup" aria-label="How to start" className="chipset" style={{ marginTop: 0 }}>
        <button type="button" role="radio" aria-checked={mode === 'describe'} className={`choice${mode === 'describe' ? ' on' : ''}`} onClick={() => setMode('describe')}>Describe your calling job</button>
        <button type="button" role="radio" aria-checked={mode === 'template'} className={`choice${mode === 'template' ? ' on' : ''}`} onClick={() => setMode('template')}>Start from a template</button>
      </div>
      {mode === 'describe' ? <>
        <TextArea label="What should the calls do?" rows={3} value={desc} onChange={e => setDesc(e.target.value)} hint="Say who you call and why, in a sentence or two. The assistant builds the agent and asks before anything reaches anyone." />
        <div>{desc.trim().length >= 20
          ? <Btn kind="primary" onClick={() => { say(`Build a calling agent for this job: ${desc.trim()}`); }}>Ask the assistant to build it</Btn>
          : <Btn disabled reason="Describe the job in at least a sentence.">Ask the assistant to build it</Btn>}</div>
        <p className="small muted">The assistant opens beside this page. When the agent exists, this step turns to done.</p>
      </> : <>
        {tpl.state === 'missing' ? <p className="small muted">Templates are not switched on in this server yet. Describe the job instead.</p> : !tpl.data ? <p className="small muted">Loading templates…</p> :
          groups.map(([ind, list]) => <section key={ind} aria-label={INDUSTRY(ind)}><h3 className="dayhead">{INDUSTRY(ind)}</h3>
            <div role="radiogroup" aria-label={`${INDUSTRY(ind)} templates`} className="jobgrid">{list.map(t => <button key={t.id} type="button" role="radio" aria-checked={pick?.id === t.id} className={`jobcard${pick?.id === t.id ? ' on' : ''}`} onClick={() => { setPick(t); setName(n => n || t.label); }}><strong>{t.label}</strong><span className="small muted">{t.summary}</span></button>)}</div></section>)}
        {pick && <><TextField label="Agent name" value={name} onChange={e => setName(e.target.value)} hint="Your own label. You can rename it later." />
          <div>{name.trim() ? <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await act<{ agentId: string }>('agent.create', { name: name.trim(), templateId: pick.id }, { describe: 'Draft created. Nothing has reached anyone.' }); setBusy(false); if (r.ok) { onCreated(); go(`/agents/${r.result!.agentId}`); } }}>Create draft</Btn> : <Btn disabled reason="Give the agent a name first.">Create draft</Btn>}</div></>}
      </>}
    </div>
  );
}
