// Campaigns: category-first creation, window and policy, estimate, the launch card and the live view.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Pause, Play, Plus, Square, XCircle } from 'lucide-react';
import * as api from '../api.ts';
import { useApp, useTool } from '../store.tsx';
import { Link, useNav } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Meter, PageHead, SelectField, Table, TextField, Toggle, type Col, Segmented, NotMeasured } from '../ui.tsx';
import { Funnel } from '../funnel.tsx';
import { CATEGORY_INFO } from '../catalog.ts';
import { ago, count, date, inr, time } from '../format.ts';
import type { AgentRow, AudienceRow, CampaignDoc, CampaignRow, Check, Estimate } from '../types.ts';

const STATE_CHIP: Record<string, [string, 'leaf' | 'marigold' | 'peacock' | 'neutral']> = { running: ['Dialling', 'leaf'], paused: ['Paused', 'marigold'], scheduled: ['Scheduled', 'peacock'], draft: ['Draft', 'marigold'], done: ['Finished', 'neutral'] };
const stateChip = (s: string) => { const [l, t] = STATE_CHIP[s] ?? [s, 'neutral' as const]; return <Chip tone={t}>{l}</Chip>; };

export default function Campaigns({ id, create }: { id?: string; create?: boolean }) {
  if (create) return <Create />;
  if (id) return <Detail id={id} />;
  return <List />;
}

function List() {
  const q = useTool<{ rows: CampaignRow[] }>('campaign.list', {});
  const cols: Col<CampaignRow>[] = [
    { key: 'n', label: 'Campaign', primary: true, render: c => c.name }, { key: 's', label: 'State', render: c => stateChip(c.status) },
    { key: 'a', label: 'Agent', hideMobile: true, render: c => c.agentName || <NotMeasured>No agent</NotMeasured> },
    { key: 'p', label: 'Dialled', num: true, render: c => <>{count(c.dialled)} of {count(c.contacts)}</> },
    { key: 'c', label: 'Connected', num: true, render: c => count(c.connected) },
    { key: 'sp', label: 'Spent', num: true, render: c => <>{inr(c.spendMilli)}{c.capMilli ? <span className="muted"> of {inr(c.capMilli)}</span> : null}</> },
  ];
  return (
    <div className="page">
      <PageHead title="Campaigns" sub="One job, one list, one window. You see who, when and what it costs before anything is dialled." actions={<Link to="/campaigns/new" className="btn btn-primary" style={{ textDecoration: 'none' }}><Plus size={16} aria-hidden /><span>New campaign</span></Link>} />
      <Card><Async q={q} what="Campaigns" tool="campaign.list" empty={d => d.rows.length === 0 ? <Empty title="No campaigns yet" body="Start with the kind of call you are making. That decides the rules, the number series and the window." action={<Link to="/campaigns/new">Start a campaign</Link>} /> : null}>
        {d => <Table caption="Campaigns" cols={cols} rows={d.rows} rowKey={r => r.id} onRow={r => `/campaigns/${r.id}`} />}</Async></Card>
    </div>
  );
}

// ---------- create ----------
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function Create() {
  const { act } = useApp(); const go = useNav();
  const agents = useTool<{ rows: AgentRow[] }>('agent.list', {});
  const auds = useTool<{ rows: AudienceRow[] }>('audience.list', {});
  const [f, setF] = useState({ name: '', category: '' as '' | 'service' | 'transactional' | 'promotional', agentId: '', audienceId: '', start: '10:00', end: '19:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], concurrency: 8, retries: 2, gap: 180, cap: '' });
  const [est, setEst] = useState<Estimate | null>(null); const [estErr, setEstErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = f.category && f.agentId && f.audienceId;
  useEffect(() => {
    if (!ready) { setEst(null); return; }
    const h = setTimeout(() => {
      api.run<Estimate>('campaign.estimate', { agentId: f.agentId, audienceId: f.audienceId, category: f.category, window: { start: f.start, end: f.end, days: f.days } }).then(r => { setEst(r); setEstErr(null); }).catch(e => setEstErr(e instanceof Error ? e.message : 'No estimate'));
    }, 350);
    return () => clearTimeout(h);
  }, [ready, f.agentId, f.audienceId, f.category, f.start, f.end, f.days.join()]); // eslint-disable-line
  const reason = !f.name.trim() ? 'Name the campaign.' : !f.category ? 'Choose the call category first.' : !f.agentId ? 'Choose an agent.' : !f.audienceId ? 'Choose who to call.' : f.start >= f.end ? 'The window must end after it starts.' : f.days.length === 0 ? 'Choose at least one day.' : '';
  const save = async () => {
    setBusy(true);
    const r = await act<{ id: string }>('campaign.draft', { name: f.name, agentId: f.agentId, audienceId: f.audienceId, category: f.category, window: { start: f.start, end: f.end, days: f.days }, pace: { concurrency: f.concurrency }, retries: { max: f.retries, gapMin: f.gap }, capMilli: f.cap ? Math.round(Number(f.cap) * 1000) : undefined }, { describe: 'Saved as a draft. No one has been called.' });
    setBusy(false);
    if (r.ok) go(`/campaigns/${r.result.id}`);
  };
  return (
    <div className="page">
      <PageHead crumb={<><Link to="/campaigns">Campaigns</Link><span aria-hidden>/</span><span>New</span></>} title="New campaign" sub="Saved as a draft. Nothing is dialled until you hold the launch button on the next screen." />
      <div className="cols-main">
        <div className="stack">
          <Card><CardHead title="1. What kind of call is this?" sub="Set once. It decides the number series, the legal hours and what she may say." />
            <div className="jobgrid" role="radiogroup" aria-label="Call category">{Object.entries(CATEGORY_INFO).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={f.category === k} className={`jobcard${f.category === k ? ' on' : ''}`} onClick={() => setF({ ...f, category: k as typeof f.category })}><strong>{v.label}</strong><span>{v.blurb}</span></button>)}</div>
            {f.category === 'promotional' && <p className="hint hint-bad" style={{ marginTop: 12 }}>Promotional calls only go to people with a recorded consent. The estimate counts only those.</p>}</Card>
          <Card><CardHead title="2. Who and which agent" />
            <div className="formgrid"><TextField label="Campaign name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Renewals November" />
              <Async q={agents} what="Agents" tool="agent.list">{d => <SelectField label="Agent" value={f.agentId} onChange={e => setF({ ...f, agentId: e.target.value })} hint={(() => { const a = d.rows.find(x => x.id === f.agentId); return a && !a.stackId ? 'This agent has no voice stack yet, so there is no price.' : undefined; })()}><option value="">Choose an agent</option>{d.rows.map(a => <option key={a.id} value={a.id}>{a.name} ({a.status})</option>)}</SelectField>}</Async>
              <Async q={auds} what="Audiences" tool="audience.list">{d => <SelectField label="Who to call" value={f.audienceId} onChange={e => setF({ ...f, audienceId: e.target.value })} hint={(() => { const a = d.rows.find(x => x.id === f.audienceId); return a ? `${count(a.callable)} callable of ${count(a.count)}` : <Link to="/contacts/import">Import a list</Link>; })()}><option value="">Choose an audience</option>{d.rows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>}</Async></div></Card>
          <Card><CardHead title="3. When and how fast" sub="Times are IST, in each contact's local time. The dial gate enforces the legal hours again at every attempt." />
            <div className="formgrid"><TextField label="From" type="time" min="09:00" max="21:00" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /><TextField label="To" type="time" min="09:00" max="21:00" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></div>
            <fieldset className="chipset"><legend>Days</legend>{DAYS.map(d => <label key={d} className={`choice${f.days.includes(d) ? ' on' : ''}`}><input type="checkbox" checked={f.days.includes(d)} onChange={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] })} />{d}</label>)}</fieldset>
            <div className="formgrid" style={{ marginTop: 16 }}>
              <TextField label="Calls at once" type="number" inputMode="numeric" min={1} max={10} value={f.concurrency} onChange={e => setF({ ...f, concurrency: Math.min(10, Math.max(1, Number(e.target.value))) })} hint="Up to 10 while the number is new." />
              <TextField label="Spend cap (₹)" type="number" inputMode="decimal" min={0} value={f.cap} onChange={e => setF({ ...f, cap: e.target.value })} hint="Dialling stops by itself at the cap. Leave empty for no cap, which the checklist flags." />
              <TextField label="Tries per person" type="number" inputMode="numeric" min={1} max={4} value={f.retries} onChange={e => setF({ ...f, retries: Number(e.target.value) })} />
              <TextField label="Gap between tries (minutes)" type="number" inputMode="numeric" min={30} value={f.gap} onChange={e => setF({ ...f, gap: Number(e.target.value) })} /></div></Card>
        </div>
        <div className="stack stickycol">
          <Card><CardHead title="Estimate" sub="Before you decide" /><EstimateView est={est} err={estErr} ready={!!ready} /></Card>
          {reason ? <Btn disabled reason={reason}>Save draft</Btn> : <Btn kind="primary" busy={busy} onClick={save}>Save draft</Btn>}
        </div>
      </div>
    </div>
  );
}

function EstimateView({ est, err, ready }: { est: Estimate | null; err: string | null; ready: boolean }) {
  if (!ready) return <p className="muted">Choose a category, an agent and an audience to see who, how long and what it costs.</p>;
  if (err) return <p className="hint hint-bad">{err}</p>;
  if (!est) return <p className="muted">Working it out…</p>;
  return (
    <dl className="kv">
      <div><dt>Callable now</dt><dd className="tnum"><strong>{count(est.callable)}</strong> of {count(est.contacts)}</dd></div>
      <div><dt>Talk time</dt><dd className="tnum">{count(est.minutesRange[0])} to {count(est.minutesRange[1])} minutes</dd></div>
      <div><dt>Cost</dt><dd>{est.costRangeMilli ? <><strong className="tnum">{inr(est.costRangeMilli[0])} to {inr(est.costRangeMilli[1])}</strong> <Chip tone="marigold">Estimate</Chip><br /><span className="small muted">{est.gstNote}{est.perMinuteMilli ? ` · ${inr(est.perMinuteMilli, { paise: true })} per minute` : ''}</span></> : <NotMeasured>No price yet</NotMeasured>}</dd></div>
      <div><dt>Finishes by</dt><dd>{date(est.finishBy)}</dd></div>
      {est.outcomeRange && <div><dt>Outcomes</dt><dd className="tnum">{count(est.outcomeRange[0])} to {count(est.outcomeRange[1])} <Chip tone="marigold">Estimate</Chip></dd></div>}
      <div><dt>How we know</dt><dd className="small muted">{est.basis}</dd></div>
    </dl>
  );
}

// ---------- detail / live ----------
function Detail({ id }: { id: string }) {
  const { act, refresh } = useApp(); const go = useNav();
  const q = useTool<CampaignDoc>('campaign.get', { id });
  const [edit, setEdit] = useState(false);
  useEffect(() => { if (q.data?.status !== 'running') return; const t = setInterval(q.reload, 8000); return () => clearInterval(t); }, [q.data?.status]); // eslint-disable-line
  return (
    <div className="page"><Async q={q} what="This campaign" tool="campaign.get" rows={6}>{c => {
      const blocking = c.checks.filter(x => x.state === 'fail');
      const warn = c.checks.filter(x => x.state === 'warn');
      const run = async (tool: string, msg: string) => { const r = await act(tool, { id: c.id, name: c.name }, { describe: msg }); if (r.ok) q.reload(); };
      return (<>
        <PageHead crumb={<><Link to="/campaigns">Campaigns</Link><span aria-hidden>/</span><span>{c.name}</span></>} title={c.name} pill={<span className={`pill ${c.status === 'running' ? 'pill-live' : c.status === 'draft' ? 'pill-draft' : ''}`}>{c.versionPill}</span>}
          sub={<>{c.agentName} · {CATEGORY_INFO[c.category]?.label ?? c.category} · {c.audience}</>}
          actions={<>
            {c.status === 'running' && <Btn icon={<Pause size={16} aria-hidden />} onClick={() => run('campaign.pause', 'Paused. Calls already placed stay as they are.')}>Pause</Btn>}
            {c.status === 'paused' && <Btn icon={<Play size={16} aria-hidden />} onClick={() => run('campaign.resume', 'Resumed.')}>Resume</Btn>}
            {(c.status === 'running' || c.status === 'paused') && <Btn kind="danger" icon={<Square size={14} aria-hidden />} onClick={() => run('campaign.stop', 'Stopped.')}>Stop</Btn>}
            {c.status === 'draft' && (blocking.length ? <Btn disabled reason={`${blocking[0].label}: ${blocking[0].detail ?? 'not done'}`} fix={blocking[0].fix ? { label: blocking[0].fix.label, to: blocking[0].fix.href } : undefined}>Launch…</Btn> : <Btn kind="primary" onClick={() => run('campaign.launch', 'Launched.')}>Launch…</Btn>)}
          </>} />

        {c.status === 'running' || c.status === 'paused' ? <Card className="metersbar"><div className="meters2">
          <Meter label="Calls at once" value={c.live.live + c.live.ringing} max={c.pace.maxConcurrency} tone="peacock" note={<>{c.live.live} talking · {c.live.ringing} ringing · {c.pace.concurrency} allowed · updated {ago(c.live.updatedAt)}</>} />
          <Meter label="Spend" value={c.spendMilli} max={c.capMilli ?? Math.max(c.spendMilli, 1)} tone={c.capMilli && c.spendMilli / c.capMilli > 0.85 ? 'brick' : 'leaf'} note={c.capMilli ? `${inr(c.spendMilli)} of ${inr(c.capMilli)} cap` : `${inr(c.spendMilli)} · no cap set`} />
        </div></Card> : null}

        <div className="cols-main" style={{ marginTop: 20 }}>
          <div className="stack">
            <Card><CardHead title="Where people drop out" sub="Every drop has a reason you can open." /><Funnel stages={c.funnel} /></Card>
            {c.status === 'draft' && <Card><CardHead title="Before you launch" sub={blocking.length ? `${blocking.length} to fix` : warn.length ? `${warn.length} to look at` : 'Everything is ready'} />
              <ul className="checklist">{c.checks.map(k => <CheckRow key={k.id} k={k} />)}</ul></Card>}
            {c.status !== 'draft' && <Card><CardHead title="Checks that ran" /><ul className="checklist">{c.checks.map(k => <CheckRow key={k.id} k={k} />)}</ul></Card>}
          </div>
          <div className="stack">
            <Card><CardHead title="Window and pace" actions={c.status !== 'done' ? <Btn size="sm" onClick={() => setEdit(true)}>Change window</Btn> : undefined} />
              <dl className="kv"><div><dt>Window</dt><dd className="tnum">{c.window.start} to {c.window.end} IST</dd></div><div><dt>Days</dt><dd>{c.window.days.join(', ')}</dd></div><div><dt>At once</dt><dd className="tnum">{c.pace.concurrency} of {c.pace.maxConcurrency} allowed</dd></div><div><dt>Tries</dt><dd className="tnum">{c.retries.max}, {c.retries.gapMin} minutes apart</dd></div><div><dt>Started</dt><dd>{c.startAt ? date(c.startAt, true) : 'Not yet'}</dd></div></dl></Card>
            <Card><CardHead title="Calls" /><p className="small muted">See every call with transcript, quotes and the reason it ended.</p><Link to={`/calls?campaign=${encodeURIComponent(c.name)}`}>Open this campaign's calls</Link></Card>
          </div>
        </div>
        {edit && <WindowEdit c={c} onClose={() => setEdit(false)} onDone={() => { setEdit(false); q.reload(); refresh(); }} />}
      </>);
    }}</Async></div>
  );
}

function CheckRow({ k }: { k: Check }) {
  const Icon = k.state === 'ok' ? CheckCircle2 : k.state === 'fail' ? XCircle : CircleAlert;
  return (
    <li className={`check check-${k.state}`}><Icon size={20} aria-hidden /><div className="grow"><strong>{k.label}</strong><span className="sr">: {k.state === 'ok' ? 'passed' : k.state === 'fail' ? 'failed' : k.state === 'warn' ? 'needs a look' : 'pending'}</span>{k.detail && <p className="small muted">{k.detail}</p>}</div>
      {k.fix && k.state !== 'ok' && <Link to={k.fix.href} className="btn btn-sm" style={{ textDecoration: 'none' }}><span>{k.fix.label}</span></Link>}</li>
  );
}

function WindowEdit({ c, onClose, onDone }: { c: CampaignDoc; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const [w, setW] = useState(c.window);
  const bad = w.start >= w.end ? 'The window must end after it starts.' : w.days.length === 0 ? 'Choose at least one day.' : '';
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="sheet" role="dialog" aria-modal="true" aria-label="Change calling window">
      <h2 className="serif">Change the calling window</h2>
      <p className="muted small">This is a policy change, so it needs your approval. People outside the new window move to the next day.</p>
      <div className="formgrid"><TextField label="From" type="time" value={w.start} onChange={e => setW({ ...w, start: e.target.value })} /><TextField label="To" type="time" value={w.end} onChange={e => setW({ ...w, end: e.target.value })} /></div>
      <fieldset className="chipset"><legend>Days</legend>{DAYS.map(d => <label key={d} className={`choice${w.days.includes(d) ? ' on' : ''}`}><input type="checkbox" checked={w.days.includes(d)} onChange={() => setW({ ...w, days: w.days.includes(d) ? w.days.filter(x => x !== d) : [...w.days, d] })} />{d}</label>)}</fieldset>
      <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>{bad ? <Btn disabled reason={bad}>Ask to change</Btn> : <Btn kind="primary" onClick={async () => { const r = await act('policy.window.set', { id: c.id, window: w }, { describe: 'Window changed.' }); if (r.ok) onDone(); }}>Ask to change</Btn>}</div>
    </div></div>
  );
}
export { time };
