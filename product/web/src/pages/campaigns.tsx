// Campaigns: category-first creation, window and policy, the estimate, the launch checklist (the server's blockers) and the live view.
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pause, Play, Plus, Square, XCircle } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link, useNav } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Meter, NotMeasured, PageHead, SelectField, Table, TextField, type Col, Sheet } from '../ui.tsx';
import { Funnel } from '../funnel.tsx';
import { CATEGORY_INFO } from '../catalog.ts';
import { agentByVersion, agentGet, agentList, audienceList, campaignEstimate, campaignFunnel, campaignGet, campaignList } from '../data.ts';
import { count, date, inr } from '../format.ts';
import { voiceStackOf } from '../catalog.ts';
import { prettyCode } from './contacts.tsx';
import { blockerCopy, pl } from '../labels.ts';
import type { CampaignDoc, CampaignRow } from '../types.ts';

const STATE: Record<string, [string, 'leaf' | 'marigold' | 'peacock' | 'neutral' | 'brick']> = { running: ['Dialling', 'leaf'], paused: ['Paused', 'marigold'], scheduled: ['Scheduled', 'peacock'], draft: ['Draft', 'marigold'], done: ['Finished', 'neutral'], stopped: ['Stopped', 'neutral'], cancelled: ['Stopped', 'neutral'] };
const stateChip = (s: string) => { const [l, t] = STATE[s] ?? [prettyCode(s), 'neutral' as const]; return <Chip tone={t}>{l}</Chip>; };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayList = (d: number[]) => d.map(x => DAY_NAMES[x - 1]).join(', ');

export default function Campaigns({ id, create }: { id?: string; create?: boolean }) {
  if (create) return <Create />;
  if (id) return <Detail id={id} />;
  return <List />;
}

function List() {
  const q = useData<CampaignRow[]>('campaigns', campaignList);
  const cols: Col<CampaignRow>[] = [
    { key: 'n', label: 'Campaign', primary: true, render: c => c.name }, { key: 's', label: 'State', render: c => stateChip(c.state) },
    { key: 'c', label: 'Kind of call', hideMobile: true, render: c => CATEGORY_INFO[c.category]?.label ?? c.category },
    { key: 'a', label: 'Attempts', num: true, render: c => count(c.attempts) }, { key: 'b', label: 'Held back', num: true, render: c => count(c.blocked) },
    { key: 'l', label: 'Launched', hideMobile: true, render: c => c.launchedAt ? date(c.launchedAt, true) : <span className="muted">Not yet</span> },
  ];
  return (
    <div className="page">
      <PageHead title="Campaigns" sub="One job, one list, one window. You see who, when and what it costs before anything is dialled." actions={<Link to="/campaigns/new" className="btn btn-primary" style={{ textDecoration: 'none' }}><Plus size={16} aria-hidden /><span>New campaign</span></Link>} />
      <Card><Async q={q} what="Campaigns" tool="campaign.list" empty={d => d.length === 0 ? <Empty title="No campaigns yet" body="Start with the kind of call you are making. That decides the rules, the number series and the window." action={<Link to="/campaigns/new">Start a campaign</Link>} /> : null}>
        {d => <Table caption="Campaigns" cols={cols} rows={d} rowKey={r => r.id} onRow={r => `/campaigns/${r.id}`} />}</Async></Card>
    </div>
  );
}

// ---------- create ----------
// The retry pattern the campaign runs (server campaigns/retry.ts RETRY_PATTERNS): what you see is what runs.
const RETRY: [string, string, string][] = [
  ['standard', 'Standard', 'Up to 3 calls each, 2 hours then a day apart, after busy, no answer or switched off.'],
  ['gentle', 'Gentle', 'Up to 2 calls each, a day apart, after busy, no answer or switched off.'],
  ['persistent', 'Persistent', 'Up to 4 calls each, 1 hour, 4 hours, then a day apart, after busy, no answer, switched off or voicemail.'],
  ['none', 'No retries', 'One call each.'],
];
function Create() {
  const { act } = useApp(); const go = useNav();
  const agents = useData('agents', agentList);
  const auds = useData('audiences', audienceList);
  const [f, setF] = useState({ name: '', category: '' as '' | 'service' | 'transactional' | 'promotional', agentId: '', audienceId: '', start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5, 6], concurrency: 4, perDay: 2, perWeek: 5, cap: '', retry: 'standard' });
  const [busy, setBusy] = useState(false);
  const published = (agents.data ?? []).filter(a => a.latestVersion);
  const agentCat = published.find(a => a.id === f.agentId)?.category;
  const mismatch = f.agentId && f.category && agentCat && ['service', 'transactional', 'promotional'].includes(agentCat) && agentCat !== f.category ? agentCat : '';
  const reason = !f.category ? 'Choose the kind of call first.' : !f.name.trim() ? 'Name the campaign.' : !f.agentId ? 'Choose an agent that has a published version.' : mismatch ? `The agent is set up for ${mismatch} calls. Make the campaign ${mismatch}, or pick another agent.` : !f.audienceId ? 'Choose who to call.' : f.start >= f.end ? 'The window must end after it starts.' : f.days.length === 0 ? 'Choose at least one day.' : '';
  const save = async () => {
    setBusy(true);
    let versionId: string | null = null;
    try { versionId = (await agentGet(f.agentId)).latestVersionId; } catch { /* handled below */ }
    if (!versionId) { setBusy(false); return; }
    const r = await act<{ id: string; warnings?: string[] }>('campaign.draft', { name: f.name.trim(), category: f.category, agentVersionId: versionId, audienceId: f.audienceId, retry: { pattern: f.retry },
      window: { days: f.days, ranges: [{ start: f.start, end: f.end }] }, budgets: { perDay: f.perDay, perWeek: f.perWeek, perRun: Math.min(30, f.perDay * 3) }, concurrency: f.concurrency, capInrMilli: f.cap ? Math.round(Number(f.cap) * 1000) : undefined }, { describe: 'Saved as a draft. No one has been called.' });
    setBusy(false);
    if (r.ok) go(`/campaigns/${r.result.id}`);
  };
  return (
    <div className="page">
      <PageHead crumb={<><Link to="/campaigns">Campaigns</Link><span aria-hidden>/</span><span>New</span></>} title="New campaign" sub="Saved as a draft. You see the estimate and the launch checks next. Nothing is dialled until you hold the launch button." />
      <div className="cols-main">
        <div className="stack">
          <Card><CardHead title="1. What kind of call is this?" sub="Set once. It decides the number series, the legal hours and what she may say." />
            <div className="jobgrid" role="radiogroup" aria-label="Call category">{Object.entries(CATEGORY_INFO).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={f.category === k} className={`jobcard${f.category === k ? ' on' : ''}`} onClick={() => setF({ ...f, category: k as typeof f.category })}><strong>{v.label}</strong><span>{v.blurb}</span></button>)}</div>
            {f.category === 'promotional' && <p className="hint hint-bad" style={{ marginTop: 12 }}>Promotional calls only go to people with a recorded consent whose DND status is known. Others are held back and counted.</p>}</Card>
          <Card><CardHead title="2. Who and which agent" />
            <div className="formgrid"><TextField className="span2" label="Campaign name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Renewals November" />
              <Async q={agents} what="Agents" tool="agent.list">{() => <SelectField className="span2" label="Agent" value={f.agentId} onChange={e => { const a = published.find(x => x.id === e.target.value); setF({ ...f, agentId: e.target.value, category: (['service', 'transactional', 'promotional'].includes(a?.category ?? '') ? a!.category : f.category) as typeof f.category }); }} hint={published.length === 0 ? <>No agent is published yet. <Link to="/agents">Publish one</Link>.</> : mismatch ? `This agent is set up for ${mismatch} calls and the campaign is set to ${f.category}. Choose ${mismatch} in step 1, or pick another agent.` : voiceStackOf(published.find(a => a.id === f.agentId))?.status === 'beta' ? 'This agent uses a beta stack. A campaign will refuse it: beta stacks are for test calls only.' : 'Campaigns use a published version, never a draft.'}><option value="">Choose an agent</option>{published.map(a => <option key={a.id} value={a.id}>{a.name} (v{a.latestVersion})</option>)}</SelectField>}</Async>
              <Async q={auds} what="Audiences" tool="audience.list">{d => <SelectField label="Who to call" value={f.audienceId} onChange={e => setF({ ...f, audienceId: e.target.value })} hint={(() => { const a = d.find(x => x.id === f.audienceId); return a ? `${a.callable == null ? '?' : count(a.callable)} callable of ${a.matched == null ? '?' : count(a.matched)}` : <Link to="/contacts/import">Import a list</Link>; })()}><option value="">Choose an audience</option>{d.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>}</Async>
              <SelectField label="Retry pattern" value={f.retry} onChange={e => setF({ ...f, retry: e.target.value })} hint={`${RETRY.find(r => r[0] === f.retry)?.[2] ?? ''} Never after a wrong number or an opt-out. A time the person asks for comes first, inside your hours.`}>{RETRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div></Card>
          <Card><CardHead title="3. When and how fast" sub="Times are in each contact's local time. The dial gate enforces the legal hours again at every attempt." />
            <div className="formgrid"><TextField label="From" type="time" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /><TextField label="To" type="time" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></div>
            <fieldset className="chipset"><legend>Days</legend>{DAY_NAMES.map((d, i) => <label key={d} className={`choice${f.days.includes(i + 1) ? ' on' : ''}`}><input type="checkbox" checked={f.days.includes(i + 1)} onChange={() => setF({ ...f, days: f.days.includes(i + 1) ? f.days.filter(x => x !== i + 1) : [...f.days, i + 1].sort() })} />{d}</label>)}</fieldset>
            <div className="formgrid" style={{ marginTop: 16 }}>
              <TextField label="Calls at once" type="number" inputMode="numeric" min={1} max={10} value={f.concurrency} onChange={e => setF({ ...f, concurrency: Math.min(10, Math.max(1, Number(e.target.value))) })} hint="Up to 10 while the number is new." />
              <TextField label="Spend cap (₹)" type="number" inputMode="decimal" min={0} value={f.cap} onChange={e => setF({ ...f, cap: e.target.value })} hint="Dialling pauses by itself at the cap. The estimate on the next screen suggests one." />
              <TextField label="Tries per person per day" type="number" inputMode="numeric" min={1} max={10} value={f.perDay} onChange={e => setF({ ...f, perDay: Number(e.target.value) })} />
              <TextField label="Tries per person per week" type="number" inputMode="numeric" min={1} max={30} value={f.perWeek} onChange={e => setF({ ...f, perWeek: Number(e.target.value) })} /></div></Card>
        </div>
        <div className="stack stickycol"><Card><CardHead title="What happens next" /><ol className="plainlist"><li>The draft is saved.</li><li>You see how many people are callable, the cost range including GST, and anything blocking launch.</li><li>You hold the launch button to start.</li></ol></Card>
          {reason ? <Btn disabled reason={reason}>Save draft</Btn> : <Btn kind="primary" busy={busy} onClick={save}>Save draft and see the estimate</Btn>}</div>
      </div>
    </div>
  );
}

// ---------- detail ----------
function Detail({ id }: { id: string }) {
  const { act, refresh, say } = useApp();
  const q = useData<CampaignDoc>(['campaign', id], () => campaignGet(id));
  const est = useData(['estimate', id, q.data?.policyVersion], q.data ? () => campaignEstimate(id) : null);
  const fun = useData(['funnel', id, q.data?.audienceId], q.data ? () => campaignFunnel(id, q.data!.audienceId) : null);
  const [edit, setEdit] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  useEffect(() => { if (q.data?.state !== 'running') return; const t = setInterval(q.reload, 8000); return () => clearInterval(t); }, [q.data?.state]); // eslint-disable-line
  return (
    <div className="page"><Async q={q} what="This campaign" tool="campaign.get" rows={6}>{c => {
      const run = async (tool: string, msg: string) => { const r = await act(tool, { id: c.id }, { describe: msg }); if (r.ok) q.reload(); };
      const first = c.blockers[0];
      const live = c.state === 'running' || c.state === 'paused';
      return (<>
        <PageHead crumb={<><Link to="/campaigns">Campaigns</Link><span aria-hidden>/</span><span>{c.name}</span></>} title={c.name} pill={<span className={`pill ${c.state === 'running' ? 'pill-live' : c.state === 'draft' ? 'pill-draft' : ''}`}>{STATE[c.state]?.[0] ?? prettyCode(c.state)}</span>}
          sub={<>{CATEGORY_INFO[c.category]?.label ?? c.category} calls</>}
          actions={<>
            {c.state === 'running' && <Btn icon={<Pause size={16} aria-hidden />} onClick={() => run('campaign.pause', 'Paused. Calls already placed stay as they are.')}>Pause</Btn>}
            {c.state === 'paused' && <Btn icon={<Play size={16} aria-hidden />} onClick={() => run('campaign.resume', 'Resumed.')}>Resume</Btn>}
            {live && <Btn kind="danger" icon={<Square size={14} aria-hidden />} onClick={() => run('campaign.stop', 'Stopped.')}>Stop</Btn>}
            {c.state === 'draft' && (first ? <Btn disabled reason={`Fix ${c.blockers.length === 1 ? 'the one check' : `the ${c.blockers.length} checks`} below first.`}>Launch…</Btn> : <Btn kind="primary" onClick={() => run('campaign.launch', 'Launched.')}>Launch…</Btn>)}
          </>} />
        <div className="cols-main">
          <div className="stack">
            {c.state === 'draft' && <Card><CardHead title="Before you launch" sub={c.blockers.length ? `${pl(c.blockers.length, 'thing')} to fix` : 'Nothing is blocking launch'} />
              {c.blockers.length === 0 ? <ul className="checklist"><li className="check check-ok"><CheckCircle2 size={20} aria-hidden /><div className="grow"><strong>Every launch check passed</strong><p className="small muted">Window, line, wallet, cap, agent version and audience were all checked by the server just now.</p></div></li></ul> :
                <ul className="checklist">{c.blockers.map(b => { const x = blockerCopy(b); return <li key={b.code} className="check check-fail"><XCircle size={20} aria-hidden /><div className="grow"><strong>{x.text}</strong><span className="sr"> (blocks launch)</span>{x.why && <p className="small muted">{x.why}</p>}{(typeof b.fix === 'object' ? b.fix.role : b.role) && <p className="small muted">Needs {(() => { const r = (typeof b.fix === 'object' ? b.fix.role : b.role) as string; return `${/^[aeiou]/.test(r) ? 'an' : 'a'} ${r}`; })()} to do it.</p>}</div>{!x.to && typeof b.fix === 'object' && b.fix.tool === 'campaign.draft' && /limit|cap/i.test((b.fix as { label: string }).label) && <Btn size="sm" onClick={() => setCapOpen(true)}>{(b.fix as { label: string }).label}</Btn>}{!x.to && typeof b.fix === 'object' && b.fix.tool !== 'campaign.window.narrow' && SAARTHI_FIX.has(b.fix.tool) && !(b.fix.tool === 'campaign.draft' && /limit|cap/i.test((b.fix as { label: string }).label)) && <Btn size="sm" onClick={() => say(`${(b.fix as { label: string }).label} for the campaign "${c.name}".`)}>Ask the assistant</Btn>}{!x.to && typeof b.fix === 'object' && b.fix.tool === 'campaign.window.narrow' && <Btn size="sm" onClick={() => setEdit(true)}>{b.fix.label}</Btn>}{x.to && <Link to={x.to.href} className="btn btn-sm" style={{ textDecoration: 'none' }}><span>{x.to.label}</span></Link>}</li>; })}</ul>}
              {c.warnings.length > 0 && <><h3 className="dayhead">Worth knowing</h3>
                <ul className="checklist" aria-label="Launch warnings">{c.warnings.map(w => { const x = blockerCopy(w); return <li key={w.code} className="check check-warn"><AlertTriangle size={20} aria-hidden /><div className="grow"><strong>{x.text}</strong><span className="sr"> (does not block launch)</span>{x.why && <p className="small muted">{x.why}</p>}</div>{typeof w.fix === 'object' && w.fix.tool === 'brief.edit' ? <AgentFixLink versionId={c.agentVersionId} label={w.fix.label} /> : x.to && <Link to={x.to.href} className="btn btn-sm" style={{ textDecoration: 'none' }}><span>{x.to.label}</span></Link>}</li>; })}</ul></>}</Card>}
            <Card><CardHead title="What it will cost" sub="Provider cost, including GST. No customer price is set." />
              <Async q={est} what="The estimate" tool="campaign.estimate" rows={3}>{e => <dl className="kv">
                <div><dt>People</dt><dd className="tnum">{count(e.people)} people, about {count(e.attempts)} attempts</dd></div>
                <div><dt>Talk time</dt><dd className="tnum">about {count(e.connectedMinutes)} connected minutes</dd></div>
                <div><dt>Cost range</dt><dd><strong className="tnum">{inr(e.p10InrMilli)} to {inr(e.p90InrMilli)}</strong> <Chip tone="peacock">Computed</Chip> <span className="small muted">{e.gstIncluded ? 'incl. GST' : 'excl. GST'}</span></dd></div>
                <div><dt>Per minute</dt><dd className="tnum">{e.perMinuteInrMilli != null ? inr(e.perMinuteInrMilli, { paise: true }) : <NotMeasured />}</dd></div>
                {e.suggestedCapInrMilli != null && <div><dt>Suggested cap</dt><dd className="tnum">{inr(e.suggestedCapInrMilli)}</dd></div>}
                <div><dt>How we know</dt><dd className="small muted">{e.basis}</dd></div></dl>}</Async></Card>
            <Card><CardHead title="Where people drop out" sub="Counts come from the calls themselves." /><Async q={fun} what="The funnel" tool="campaign.funnel" rows={4}>{s => <Funnel stages={s} />}</Async></Card>
          </div>
          <div className="stack">
            {live && <Card><CardHead title="Live" /><Meter label="Allowed at once" value={c.counts.filter(x => x.status === 'dialing' || x.status === 'in_progress').reduce((a, b) => a + b.n, 0)} max={c.concurrency ?? 1} tone="peacock" note={`${c.concurrency ?? '?'} allowed`} />
              <ul className="billing" style={{ marginTop: 8 }}>{c.counts.map((k, i) => <li key={i}><span>{prettyCode(k.status)}{k.code ? ` · ${prettyCode(k.code)}` : ''}</span><strong className="tnum">{count(k.n)}</strong></li>)}</ul></Card>}
            <Card><CardHead title="Window and policy" actions={c.state !== 'done' ? <div className="row">{c.state === 'draft' && <Btn size="sm" onClick={() => setCapOpen(true)}>{c.capInrMilli ? 'Change spend cap' : 'Set spend cap'}</Btn>}<Btn size="sm" onClick={() => setEdit(true)}>Change window</Btn></div> : undefined} />
              <dl className="kv"><WhoRows agentVersionId={c.agentVersionId} audienceId={c.audienceId} /><div><dt>Calling rules</dt><dd className="tnum">Version {c.policyVersion}</dd></div><div><dt>Hours</dt><dd className="tnum">{c.window.ranges.map(r => `${r.start} to ${r.end}`).join(', ') || '—'}</dd></div><div><dt>Days</dt><dd>{dayList(c.window.days) || '—'}</dd></div>
                <div><dt>At once</dt><dd className="tnum">{c.concurrency ?? '—'}</dd></div><div><dt>Spend cap</dt><dd className="tnum">{c.capInrMilli ? inr(c.capInrMilli) : <NotMeasured>No cap set</NotMeasured>}</dd></div>
                <div><dt>Retries</dt><dd>{c.retry || '—'}</dd></div></dl></Card>
            {c.callbacks.length > 0 && <Card><CardHead title="Callbacks people asked for" sub="She calls at the time they gave, moved inside your calling hours when needed." />
              <ul className="facts" data-testid="campaign-callbacks">{c.callbacks.map(b => <li key={b.attemptId}><Link to={`/contacts/${b.contactId}`}>{b.contactName || 'A contact'}</Link><p className="small">{b.text ?? 'Calling back at the time they asked'}</p></li>)}</ul></Card>}
            <Card><CardHead title="Calls" /><p className="small muted">Every call with its words, its reason and its cost.</p><Link to={`/calls?campaign=${c.id}`}>Open this campaign's calls</Link></Card>
          </div>
        </div>
        {capOpen && <CapEdit c={c} suggested={est.data?.suggestedCapInrMilli ?? null} onClose={() => setCapOpen(false)} onDone={() => { setCapOpen(false); q.reload(); refresh(); }} />}
        {edit && <WindowEdit c={c} onClose={() => setEdit(false)} onDone={() => { setEdit(false); q.reload(); refresh(); }} />}
      </>);
    }}</Async></div>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** The spend cap on a draft campaign. The estimate's suggested cap is one tap away; the server decides what is allowed (a cap never goes below what is held). */
function CapEdit({ c, suggested, onClose, onDone }: { c: CampaignDoc; suggested: number | null; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const [v, setV] = useState(c.capInrMilli ? String(c.capInrMilli / 1000) : suggested ? String(Math.ceil(suggested / 1000)) : '');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  // The estimate can arrive after the sheet opens; until the person types, the field follows its suggestion.
  useEffect(() => { if (!touched && !c.capInrMilli && suggested) setV(String(Math.ceil(suggested / 1000))); }, [suggested]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Number(v);
  const bad = !v.trim() || !Number.isFinite(n) || n <= 0 ? 'Enter an amount in rupees.' : '';
  return (
    <Sheet title="Set the spend cap" onClose={onClose}>
      <p className="muted">Dialling pauses by itself when the campaign has spent this much, including GST. You can change it while the campaign is a draft.</p>
      <TextField label="Spend cap (₹)" type="number" inputMode="decimal" min={0} value={v} onChange={e => { setTouched(true); setV(e.target.value); }} data-autofocus
        hint={suggested ? <>The estimate suggests ₹{Math.ceil(suggested / 1000).toLocaleString('en-IN')}. <button type="button" className="linkbtn" onClick={() => { setTouched(true); setV(String(Math.ceil(suggested / 1000))); }}>Use that amount</button></> : 'The estimate has no suggestion yet.'} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        {bad ? <Btn disabled reason={bad}>Save the cap</Btn> : <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await act('campaign.draft', { id: c.id, name: c.name, category: c.category, capInrMilli: Math.round(n * 1000) }, { describe: 'Spend cap saved.' }); setBusy(false); if (r.ok) onDone(); }}>Save the cap</Btn>}</div>
    </Sheet>
  );
}

function WindowEdit({ c, onClose, onDone }: { c: CampaignDoc; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const r0 = c.window.ranges[0] ?? { start: '10:00', end: '19:00' };
  const [w, setW] = useState({ start: r0.start, end: r0.end, days: c.window.days });
  const bad = w.start >= w.end ? 'The window must end after it starts.' : w.days.length === 0 ? 'Choose at least one day.' : '';
  const inside = c.window.ranges.some(r => toMin(w.start) >= toMin(r.start) && toMin(w.end) <= toMin(r.end)) && w.days.every(d => c.window.days.includes(d));
  const same = JSON.stringify([w.start, w.end, w.days]) === JSON.stringify([r0.start, r0.end, c.window.days]);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="sheet" role="dialog" aria-modal="true" aria-label="Change calling window">
      <h2 className="serif">Change the calling window</h2>
      <p className="muted small">{inside ? 'This makes the window narrower, which lowers risk, so it takes effect at once.' : 'This widens the window, which is a policy change, so it asks for approval.'} People outside it move to the next allowed day.</p>
      <div className="formgrid"><TextField label="From" type="time" value={w.start} onChange={e => setW({ ...w, start: e.target.value })} /><TextField label="To" type="time" value={w.end} onChange={e => setW({ ...w, end: e.target.value })} /></div>
      <fieldset className="chipset"><legend>Days</legend>{DAY_NAMES.map((d, i) => <label key={d} className={`choice${w.days.includes(i + 1) ? ' on' : ''}`}><input type="checkbox" checked={w.days.includes(i + 1)} onChange={() => setW({ ...w, days: w.days.includes(i + 1) ? w.days.filter(x => x !== i + 1) : [...w.days, i + 1].sort() })} />{d}</label>)}</fieldset>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>{bad || same ? <Btn disabled reason={bad || 'Nothing has changed.'}>Apply</Btn> : <Btn kind="primary" onClick={async () => { const r = await act(inside ? 'campaign.window.narrow' : 'campaign.window.widen', { id: c.id, window: { days: w.days, ranges: [{ start: w.start, end: w.end }] } }, { describe: 'Window changed.' }); if (r.ok) onDone(); }}>{inside ? 'Apply now' : 'Ask to widen'}</Btn>}</div>
    </div></div>
  );
}

// Fixes with no page of their own: one tap hands the sentence to the assistant, which plans the change and asks for approval.
const SAARTHI_FIX = new Set(['campaign.draft', 'campaign.audience.add']);

/** The campaign says which agent (and the published version it is pinned to) and which list it calls, each a link. */
function WhoRows({ agentVersionId, audienceId }: { agentVersionId: string | null; audienceId: string | null }) {
  const ag = useData(['campaign-agent', agentVersionId ?? ''], () => agentVersionId ? agentByVersion(agentVersionId) : Promise.resolve(null));
  const au = useData(['campaign-audience', audienceId ?? ''], () => audienceId ? audienceList().then(l => l.find(a => a.id === audienceId) ?? null) : Promise.resolve(null));
  return <>
    <div><dt>Agent</dt><dd>{ag.data ? <Link to={`/agents/${ag.data.id}`}>{ag.data.name}, version {ag.data.number}</Link> : ag.state === 'loading' ? <span className="muted">Loading…</span> : <span className="muted">Not found</span>}</dd></div>
    <div><dt>Who to call</dt><dd>{au.data ? <Link to="/audiences">{au.data.name}</Link> : au.state === 'loading' ? <span className="muted">Loading…</span> : <span className="muted">Not found</span>}</dd></div>
  </>;
}

/** A warning about the agent opens that agent (its Basics tab, where languages are), not the agents list. */
function AgentFixLink({ versionId, label }: { versionId: string | null; label: string }) {
  const ag = useData(['campaign-agent', versionId ?? ''], () => versionId ? agentByVersion(versionId) : Promise.resolve(null));
  return <Link to={ag.data ? `/agents/${ag.data.id}` : '/agents'} className="btn btn-sm" style={{ textDecoration: 'none' }}><span>{label}</span></Link>;
}
