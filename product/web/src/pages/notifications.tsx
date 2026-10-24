// Settings > Notifications: where alerts go outside the app (a Slack channel, email) and which events each gets. A crisis
// alert never carries what the caller said. Email that is not set up on this server is shown here, and those alerts are
// recorded as not sent, never dropped silently. Alerts still appear in the app (hand-offs queue, the alert banner).
import { useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Segmented, SelectField, Table, TextField, Toggle, type Col } from '../ui.tsx';
import { Link } from '../router.tsx';
import { date } from '../format.ts';
import { memberList } from '../data.ts';

interface EventDef { event: string; label: string; description: string }
interface Dest { id: string; kind: 'slack' | 'email'; name: string; events: string[]; recipients: string[]; integration: { name: string; connected: boolean } | null; lastStatus: string | null }
interface Doc { destinations: Dest[]; email: { configured: boolean; from: string | null; note?: string }; events: EventDef[] }
interface Sent { id: string; destinationId: string; event: string; status: 'pending' | 'sent' | 'failed' | 'skipped'; error: string | null; test: boolean; createdAt: string }
const STATUS: Record<Sent['status'], [string, 'leaf' | 'marigold' | 'brick' | 'neutral']> = { sent: ['Sent', 'leaf'], pending: ['Waiting', 'marigold'], failed: ['Failed', 'brick'], skipped: ['Not sent', 'neutral'] };

export default function Notifications() {
  const { act, can, toast } = useApp();
  const q = useData<Doc>('notifications', () => run<Doc>('notification.destination.list', {}));
  const sent = useData<Sent[]>('notification-deliveries', async () => (await run<{ deliveries: Sent[] }>('notification.deliveries', {})).deliveries);
  const reload = () => { q.reload(); sent.reload(); };
  const label = (e: string) => q.data?.events.find(x => x.event === e)?.label ?? e;
  const test = async (d: Dest) => {
    const r = await act<{ status: string; error: string | null }>('notification.test', { id: d.id }, { quiet: true });
    if (!r.ok) return;
    toast(r.result.status === 'sent' ? `Test alert sent to ${d.name}.` : `The test alert was not sent: ${r.result.error ?? 'no answer'}.`, r.result.status === 'sent' ? 'ok' : 'bad');
    reload();
  };
  const cols: Col<Dest>[] = [
    { key: 'n', label: 'Destination', primary: true, render: d => <>{d.name}<br /><span className="small muted">{d.kind === 'slack' ? `Slack, ${d.integration?.name ?? 'disconnected'}` : `Email, ${d.recipients.length ? d.recipients.join(', ') : 'everyone on duty'}`}</span></> },
    { key: 'e', label: 'Gets', render: d => d.events.map(label).join('; ') },
    { key: 's', label: 'Last alert', render: d => d.lastStatus ? <Chip tone={STATUS[d.lastStatus as Sent['status']]?.[1] ?? 'neutral'}>{STATUS[d.lastStatus as Sent['status']]?.[0] ?? d.lastStatus}</Chip> : <span className="muted">None yet</span> },
    { key: 'x', label: '', render: d => <div className="row" style={{ gap: 8, flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
      {can(['owner', 'builder', 'operator']) && <Btn size="sm" icon={<Send size={14} aria-hidden />} aria-label={`Send a test alert to ${d.name}`} onClick={() => void test(d)}>Send test</Btn>}
      {can(['owner', 'operator', 'compliance']) && <Btn size="sm" kind="danger" aria-label={`Remove ${d.name}`} onClick={async () => { const r = await act('notification.destination.delete', { id: d.id }, { describe: 'Alerts stopped for this destination.' }); if (r.ok) reload(); }}>Remove…</Btn>}
    </div> },
  ];
  return <Async q={q} what="Notifications" tool="notification.destination.list">{d => <div className="stack">
    {!d.email.configured && <div className="callout" role="note"><div className="grow"><p className="callout-l"><AlertTriangle size={14} aria-hidden /> Email not set up</p>
      <p className="small">This server has no outgoing mail, so email alerts are recorded as not sent. Slack and in-app alerts still work.</p></div></div>}
    <Card><CardHead title="Where alerts go" sub="Alerts also show in the app. A crisis alert never carries what the caller said, their name or number." />
      {d.destinations.length === 0 ? <Empty title="No alert destinations yet" body="Add Slack or email so on-duty people hear of a caller in distress with the app closed." />
        : <Table caption="Alert destinations" cols={cols} rows={d.destinations} rowKey={r => r.id} />}</Card>
    <DutyRoster />
    {can(['owner', 'builder', 'operator', 'compliance']) && <NewDest events={d.events} emailReady={d.email.configured} onMade={reload} />}
    <Card><CardHead title="Recent alerts" />
      <Async q={sent} what="Recent alerts" tool="notification.deliveries" empty={x => x.length === 0 ? <Empty title="No alerts sent yet" /> : null}>{x => <Table caption="Recent alerts" rows={x} rowKey={r => r.id} cols={[
        { key: 'e', label: 'Alert', primary: true, render: r => <>{label(r.event)}{r.test && <> <Chip>Test</Chip></>}<br /><span className="small muted">{d.destinations.find(z => z.id === r.destinationId)?.name ?? 'A removed destination'}</span></> },
        { key: 's', label: 'Status', render: r => <><Chip tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Chip>{r.error && <><br /><span className="small">{r.error}</span></>}</> },
        { key: 't', label: 'When', render: r => <span className="nowrap">{date(r.createdAt, true)}</span> },
      ]} />}</Async></Card>
  </div>}</Async>;
}

function NewDest({ events, emailReady, onMade }: { events: EventDef[]; emailReady: boolean; onMade: () => void }) {
  const { act } = useApp();
  const [kind, setKind] = useState<'slack' | 'email'>('slack'); const [name, setName] = useState(''); const [slack, setSlack] = useState(''); const [to, setTo] = useState('');
  const [picked, setPicked] = useState<string[]>(events.map(e => e.event)); const [busy, setBusy] = useState(false);
  const ints = useData('notify-slack', async () => (await run<{ integrations: { id: string; kind: string; name: string; status: string }[] }>('integration.list', {})).integrations.filter(i => i.kind === 'slack' && i.status === 'connected'));
  const recipients = to.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  const reason = !name.trim() ? 'Give the destination a name.' : kind === 'slack' && !slack ? 'Choose the Slack connection.' : recipients.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) ? 'One of the addresses is not an email address.' : !picked.length ? 'Choose at least one alert.' : '';
  const add = async () => {
    setBusy(true);
    const r = await act('notification.destination.create', { kind, name: name.trim(), events: picked, ...(kind === 'slack' ? { integrationId: slack } : recipients.length ? { recipients } : {}) }, { describe: 'Alerts will go there.' });
    setBusy(false);
    if (r.ok) { setName(''); setTo(''); onMade(); }
  };
  return (
    <Card><CardHead title="Add a destination" sub="An owner or compliance lead approves it." />
      <Segmented label="Send to" value={kind} onChange={setKind} options={[{ value: 'slack', label: 'Slack channel' }, { value: 'email', label: 'Email' }]} />
      <div className="formgrid" style={{ marginTop: 16 }}>
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'slack' ? '#ops-alerts' : 'On-duty team'} />
        {kind === 'slack'
          ? <SelectField label="Slack connection" value={slack} onChange={e => setSlack(e.target.value)} hint={ints.data?.length ? 'hooks.slack.com only.' : <>Connect Slack under <Link to="/settings/integrations">Integrations</Link> first.</>}>
            <option value="">Choose…</option>{(ints.data ?? []).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</SelectField>
          : <TextField label="Email addresses (optional)" value={to} onChange={e => setTo(e.target.value)} placeholder="ops@example.com" hint={emailReady ? 'Empty: whoever is on duty.' : 'Email is not set up on this server, so these alerts will be recorded as not sent until it is.'} />}
      </div>
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: '16px 0 0' }}><legend className="callout-l">Alerts to send</legend>
        {events.map(e => <Toggle key={e.event} checked={picked.includes(e.event)} onChange={v => setPicked(v ? [...picked, e.event] : picked.filter(x => x !== e.event))} label={e.label} hint={e.description} />)}</fieldset>
      <div className="row" style={{ marginTop: 16 }}>{reason ? <Btn disabled fix={null} reason={reason}>Ask to add</Btn> : <Btn kind="primary" busy={busy} onClick={() => void add()}>Ask to add</Btn>}</div>
    </Card>
  );
}

interface Roster { timezone: string; shifts: { memberId: string; name: string; days: number[]; start: string; end: string }[];
  overrides: { id: string; name: string; from: string; to: string; onDuty: boolean; note: string | null }[]; onDutyNow: { name: string }[]; fallback: string | null }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Who is on duty: weekly hours plus leave and cover. Email alerts with no listed addresses go to whoever is on shift. */
export function DutyRoster() {
  const { act, can } = useApp();
  const q = useData<Roster>('duty-roster', () => run<Roster>('duty.roster.get', {}));
  const people = useData('duty-people', async () => (await memberList()).filter(m => m.status === 'active' && m.role !== 'viewer'));
  const [who, setWho] = useState(''); const [days, setDays] = useState([1, 2, 3, 4, 5]); const [start, setStart] = useState('09:00'); const [end, setEnd] = useState('18:00');
  const [ow, setOw] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [on, setOn] = useState('false');
  const edit = can(['owner', 'operator', 'compliance']);
  const save = async (shifts: Roster['shifts']) => { const r = await act('duty.roster.set', { shifts: shifts.map(({ memberId, days, start, end }) => ({ memberId, days, start, end })) }, { describe: 'Duty hours saved.' }); if (r.ok) q.reload(); };
  const shiftReason = !who ? 'Choose a person.' : !days.length ? 'Choose at least one day.' : end <= start && end !== '00:00' ? 'The shift must end after it starts.' : '';
  const ovReason = !ow ? 'Choose a person.' : !from || !to ? 'Give a start and an end.' : to <= from ? 'The end must be after the start.' : '';
  return (
    <Card><CardHead title="Who is on duty" sub="Email alerts with no addresses go to whoever is on shift." />
      <Async q={q} what="Duty roster" tool="duty.roster.get">{d => <div className="stack">
        <p role="status">{d.onDutyNow.length ? <>On duty now: <strong>{d.onDutyNow.map(m => m.name).join(', ')}</strong></> : d.fallback}</p>
        {d.shifts.length > 0 && <Table caption="Weekly duty hours" rows={d.shifts} rowKey={s => s.memberId + s.days.join() + s.start} cols={[
          { key: 'n', label: 'Person', primary: true, render: s => s.name },
          { key: 'd', label: 'Days', render: s => s.days.map(x => DAYS[x - 1]).join(', ') },
          { key: 'h', label: `Hours (${d.timezone === 'Asia/Kolkata' ? 'IST' : d.timezone.split('/').pop()!.replace(/_/g, ' ')})`, render: s => `${s.start} to ${s.end}` },
          { key: 'x', label: '', render: s => edit && <Btn size="sm" kind="danger" aria-label={`Remove ${s.name}'s ${s.start} shift`} onClick={() => void save(d.shifts.filter(x => x !== s))}>Remove…</Btn> }]} />}
        {d.overrides.length > 0 && <ul className="billing">{d.overrides.map(o => <li key={o.id}><span><strong>{o.name}</strong> {o.onDuty ? 'on duty' : 'off duty'}, {date(o.from, true)} to {date(o.to, true)}{o.note ? ` (${o.note})` : ''}</span>
          {edit && <Btn size="sm" kind="danger" onClick={async () => { const r = await act('duty.override.remove', { id: o.id }, { describe: 'Removed.' }); if (r.ok) q.reload(); }}>Remove…</Btn>}</li>)}</ul>}
        {edit && <>
          <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}><legend className="callout-l">Add weekly hours</legend>
            <div className="formgrid3"><SelectField label="Person" value={who} onChange={e => setWho(e.target.value)}><option value="">Choose…</option>{(people.data ?? []).map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</SelectField>
              <TextField label="From" type="time" value={start} onChange={e => setStart(e.target.value)} /><TextField label="To" type="time" value={end} onChange={e => setEnd(e.target.value)} hint="00:00 means the end of the day." /></div>
            <div className="row" role="group" aria-label="Days">{DAYS.map((n, k) => <label key={n} className="row" style={{ gap: 4 }}><input type="checkbox" checked={days.includes(k + 1)} onChange={e => setDays(e.target.checked ? [...days, k + 1].sort() : days.filter(x => x !== k + 1))} />{n}</label>)}</div>
            <div>{shiftReason ? <Btn disabled fix={null} reason={shiftReason}>Ask to add hours</Btn> : <Btn onClick={() => void save([...d.shifts, { memberId: who, name: '', days, start, end: end === '00:00' ? '24:00' : end }])}>Ask to add hours</Btn>}</div></fieldset>
          <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}><legend className="callout-l">Leave or cover</legend>
            <div className="formgrid"><SelectField label="Person" value={ow} onChange={e => setOw(e.target.value)}><option value="">Choose…</option>{(people.data ?? []).map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</SelectField>
              <SelectField label="They are" value={on} onChange={e => setOn(e.target.value)}><option value="false">Off duty (leave)</option><option value="true">On duty (cover)</option></SelectField>
              <TextField label="From" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /><TextField label="Until" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} hint="In your browser's time zone." /></div>
            <div>{ovReason ? <Btn disabled fix={null} reason={ovReason}>Ask to add</Btn> : <Btn onClick={async () => { const r = await act('duty.override.add', { memberId: ow, from: new Date(from).toISOString(), to: new Date(to).toISOString(), onDuty: on === 'true' }, { describe: 'Saved.' }); if (r.ok) { setFrom(''); setTo(''); q.reload(); } }}>Ask to add</Btn>}</div></fieldset>
        </>}
      </div>}</Async>
    </Card>
  );
}
