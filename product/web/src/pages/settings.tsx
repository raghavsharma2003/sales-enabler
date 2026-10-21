// Settings: team, API keys, brand, knowledge, billing (real cost, price "not set"), compliance, privacy, operator, activity.
import { useState } from 'react';
import { Copy, Lock } from 'lucide-react';
import * as api from '../api.ts';
import { useApp, useTool } from '../store.tsx';
import { useNav } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Grade, Meter, NotMeasured, PageHead, SelectField, Sheet, Table, Tabs, TextArea, TextField, Toggle, Locked, type Col } from '../ui.tsx';
import { ago, count, date, inr } from '../format.ts';
import { prettyId } from '../catalog.ts';
import type { ActivityRow, ApiKey, BillingLine, KnowledgeItem, Member, Wallet } from '../types.ts';

const TABS = ['team', 'keys', 'brand', 'knowledge', 'billing', 'compliance', 'privacy', 'operator', 'activity'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { team: 'Team', keys: 'API keys', brand: 'Brand', knowledge: 'Knowledge', billing: 'Billing', compliance: 'Compliance', privacy: 'Privacy', operator: 'Operator', activity: 'Activity' };

export default function Settings({ tab }: { tab?: string }) {
  const go = useNav();
  const t = (TABS.includes(tab as Tab) ? tab : 'team') as Tab;
  return (
    <div className="page">
      <PageHead title="Settings" sub="Who can do what, what it costs, and the rules every call follows." />
      <Tabs label="Settings sections" value={t} onChange={v => go('/settings/' + v)} items={TABS.map(id => ({ id, label: LABEL[id] }))} />
      {t === 'team' && <Team />}{t === 'keys' && <Keys />}{t === 'brand' && <Brand />}{t === 'knowledge' && <Knowledge />}{t === 'billing' && <Billing />}
      {t === 'compliance' && <Compliance />}{t === 'privacy' && <Privacy />}{t === 'operator' && <OperatorTab />}{t === 'activity' && <Activity />}
    </div>
  );
}

const ROLES = ['owner', 'builder', 'operator', 'compliance', 'viewer'];
const ROLE_HINT: Record<string, string> = { owner: 'Everything, including money and policy', builder: 'Builds agents and campaigns', operator: 'Runs campaigns and watches calls', compliance: 'Policy, suppression and data requests', viewer: 'Sees everything with phone numbers hidden' };

function Team() {
  const { act, refresh, can } = useApp();
  const q = useTool<{ rows: Member[] }>('member.list', {});
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [role, setRole] = useState('builder');
  const owner = can(['owner']);
  const cols: Col<Member>[] = [
    { key: 'n', label: 'Name', primary: true, render: m => <>{m.name}<br /><span className="small muted">{m.email}</span></> },
    { key: 'r', label: 'Role', render: m => owner ? <RoleCell m={m} onDone={refresh} /> : <Chip>{m.role}</Chip> },
    { key: 's', label: 'Status', render: m => <Chip tone={m.status === 'active' ? 'leaf' : 'marigold'}>{m.status === 'active' ? 'Active' : 'Invited'}</Chip> }, { key: 'l', label: 'Last seen', hideMobile: true, render: m => m.lastSeen ? ago(m.lastSeen) : '—' },
  ];
  return (
    <Card><CardHead title="Team" sub="Changing a role is a policy change and asks for approval." actions={owner ? <Btn kind="primary" onClick={() => setOpen(true)}>Invite</Btn> : <Locked role="owner" />} />
      <Async q={q} what="Team" tool="member.list">{d => <Table caption="Team" cols={cols} rows={d.rows} rowKey={r => r.id} />}</Async>
      <dl className="rolehints">{ROLES.map(r => <div key={r}><dt>{r}</dt><dd className="small muted">{ROLE_HINT[r]}</dd></div>)}</dl>
      {open && <Sheet title="Invite a teammate" onClose={() => setOpen(false)}><TextField label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-autofocus />
        <SelectField label="Role" value={role} onChange={e => setRole(e.target.value)} hint={ROLE_HINT[role]}>{ROLES.map(r => <option key={r}>{r}</option>)}</SelectField>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>{/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? <Btn kind="primary" onClick={async () => { const r = await act('member.invite', { email, role }, { describe: 'Invitation sent.' }); if (r.ok) { setOpen(false); setEmail(''); refresh(); } }}>Ask to invite</Btn> : <Btn disabled reason="Enter a valid email.">Ask to invite</Btn>}</div></Sheet>}
    </Card>
  );
}

/** Picking a role in the list changes nothing by itself; the explicit button asks for the change. */
function RoleCell({ m, onDone }: { m: Member; onDone: () => void }) {
  const { act } = useApp(); const [r, setR] = useState(m.role);
  return <div className="row" style={{ gap: 8 }}><select className="input" style={{ minHeight: 40, width: 'auto' }} aria-label={`Role for ${m.name}`} value={r} onChange={e => setR(e.target.value)}>{ROLES.map(x => <option key={x}>{x}</option>)}</select>
    {r !== m.role && <Btn size="sm" kind="primary" onClick={async () => { await act('member.role.set', { id: m.id, role: r }, { describe: 'Role changed.' }); onDone(); }}>Ask to change</Btn>}</div>;
}

function Keys() {
  const { act, refresh, toast, can } = useApp();
  const q = useTool<{ rows: ApiKey[] }>('apikey.list', {});
  const [label, setLabel] = useState(''); const [scope, setScope] = useState('builder'); const [secret, setSecret] = useState<string | null>(null);
  const owner = can(['owner']);
  const cols: Col<ApiKey>[] = [{ key: 'l', label: 'Label', primary: true, render: k => k.label }, { key: 'p', label: 'Key', render: k => <code>{k.prefix}</code> }, { key: 's', label: 'Access', render: k => k.scope }, { key: 'u', label: 'Last used', render: k => k.lastUsed ? ago(k.lastUsed) : 'Never' },
    { key: 'x', label: '', render: k => <Btn size="sm" kind="danger" onClick={async () => { const r = await act('apikey.revoke', { id: k.id }, { describe: 'Key revoked.' }); if (r.ok) refresh(); }}>Revoke…</Btn> }];
  return (
    <div className="stack">
      <Card><CardHead title="API keys" sub="Keys call the same tools the pages do. A key can never approve anything: approvals need a signed-in person." />
        <Async q={q} what="API keys" tool="apikey.list" empty={d => d.rows.length === 0 ? <Empty title="No keys yet" body="Create one for your CRM or webhook." /> : null}>{d => <Table caption="API keys" cols={cols} rows={d.rows} rowKey={r => r.id} />}</Async></Card>
      <Card><CardHead title="New key" sub="Creating a key is a policy change. The secret is shown once." />
        {owner ? <><div className="formgrid"><TextField label="Label" value={label} onChange={e => setLabel(e.target.value)} placeholder="CRM webhook" /><SelectField label="Access" value={scope} onChange={e => setScope(e.target.value)}><option value="viewer">Read only</option><option value="builder">Builder</option></SelectField></div>
          <div style={{ marginTop: 12 }}>{label.trim() ? <Btn kind="primary" onClick={async () => { const r = await act<{ secret: string }>('apikey.create', { label, scope }, { quiet: true }); if (r.ok) { setSecret(r.result.secret); setLabel(''); refresh(); } }}>Ask to create</Btn> : <Btn disabled reason="Give the key a label.">Ask to create</Btn>}</div></> : <Locked role="owner" />}</Card>
      {secret && <Sheet title="Copy your key now" onClose={() => setSecret(null)}><p className="muted">This is the only time it is shown. Store it in your secrets manager, not in a chat or a spreadsheet.</p><code className="secret">{secret}</code>
        <div className="row"><Btn icon={<Copy size={16} aria-hidden />} onClick={async () => { try { await navigator.clipboard.writeText(secret); toast('Copied.', 'ok'); } catch { toast('Could not copy. Select the key and copy it yourself.', 'bad'); } }}>Copy</Btn><Btn kind="primary" onClick={() => setSecret(null)}>I have saved it</Btn></div></Sheet>}
    </div>
  );
}

function Brand() {
  const { act } = useApp();
  const q = useTool<{ name: string; spokenName: string; domains: string[] }>('brand.get', {});
  return <Async q={q} what="Brand" tool="brand.get">{b => <BrandForm key={JSON.stringify(b)} b={b} onSave={async v => { await act('brand.set', v, { describe: 'Brand saved.' }); q.reload(); }} />}</Async>;
}
function BrandForm({ b, onSave }: { b: { name: string; spokenName: string; domains: string[] }; onSave: (v: object) => Promise<void> }) {
  const [v, setV] = useState({ name: b.name, spokenName: b.spokenName, domains: b.domains.join(', ') });
  const dirty = v.name !== b.name || v.spokenName !== b.spokenName || v.domains !== b.domains.join(', ');
  return (
    <Card><CardHead title="Brand" sub="How your business is named on calls and in messages." actions={dirty ? <Chip tone="marigold">Unsaved</Chip> : undefined} />
      <div className="formgrid"><TextField label="Business name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /><TextField label="How agents say it aloud" lang="hi" value={v.spokenName} onChange={e => setV({ ...v, spokenName: e.target.value })} hint="Write it as it should sound." />
        <TextField className="span2" label="Your website domains" value={v.domains} onChange={e => setV({ ...v, domains: e.target.value })} hint="Only links on these domains are ever sent to callers." /></div>
      <div style={{ marginTop: 16 }}>{dirty ? <Btn kind="primary" onClick={() => onSave({ name: v.name, spokenName: v.spokenName, domains: v.domains.split(',').map(s => s.trim()).filter(Boolean) })}>Save brand</Btn> : <Btn disabled reason="No unsaved changes.">Save brand</Btn>}</div></Card>
  );
}

function Knowledge() {
  const { act, refresh } = useApp();
  const q = useTool<{ rows: KnowledgeItem[] }>('knowledge.list', {});
  const [f, setF] = useState({ title: '', text: '', purpose: 'service' });
  const cols: Col<KnowledgeItem>[] = [{ key: 't', label: 'Source', primary: true, render: k => k.title }, { key: 'k', label: 'Type', render: k => k.kind }, { key: 'p', label: 'Used for', render: k => k.purpose },
    { key: 's', label: 'State', render: k => <Chip tone={k.status === 'indexed' ? 'leaf' : k.status === 'failed' ? 'brick' : 'marigold'}>{k.status === 'indexed' ? 'Read' : k.status === 'failed' ? 'Could not read' : 'Reading'}</Chip> }, { key: 'f', label: 'Facts found', num: true, render: k => k.facts }];
  return (
    <div className="stack"><Card><CardHead title="Knowledge" sub="What she may state. Each fact keeps its source and what it is for; you approve facts before she uses them." />
      <Async q={q} what="Knowledge" tool="knowledge.list" empty={d => d.rows.length === 0 ? <Empty title="No sources yet" body="Add your FAQ, a web page or a note." /> : null}>{d => <Table caption="Knowledge sources" cols={cols} rows={d.rows} rowKey={r => r.id} />}</Async></Card>
      <Card><CardHead title="Add a source" sub="Customer rows never go in here. This is company knowledge only." />
        <div className="formgrid"><TextField label="Title or link" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /><SelectField label="Used for" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="service">Service answers</option><option value="offer">Offers</option><option value="logistics">Addresses and timings</option><option value="identity">Who we are</option></SelectField>
          <TextArea className="span2" label="Text" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} rows={4} /></div>
        <div style={{ marginTop: 12 }}>{f.title.trim() && f.text.trim() ? <Btn kind="primary" onClick={async () => { const r = await act('knowledge.add', { ...f, kind: 'text' }, { describe: 'Source added. Facts will wait for your approval.' }); if (r.ok) { setF({ title: '', text: '', purpose: 'service' }); refresh(); } }}>Add source</Btn> : <Btn disabled reason="Add a title and some text.">Add source</Btn>}</div></Card></div>
  );
}

function Billing() {
  const { act, refresh, can } = useApp();
  const w = useTool<Wallet>('wallet.get', {});
  const b = useTool<{ periodLabel: string; pricePerMinute: number | null; lines: BillingLine[]; gstNote: string; basis: string }>('billing.summary', {});
  const [amt, setAmt] = useState(''); const owner = can(['owner']);
  return (
    <div className="stack">
      <Card><CardHead title="Wallet" /><Async q={w} what="Wallet" tool="wallet.get">{d => <><p className="bignum serif tnum">{inr(d.balanceMilli)}</p>
        <Meter label="Spent today" value={d.spentTodayMilli} max={d.capTodayMilli ?? Math.max(d.spentTodayMilli, 1)} tone={d.capTodayMilli && d.spentTodayMilli / d.capTodayMilli > 0.85 ? 'brick' : 'leaf'} note={d.capTodayMilli ? `${inr(d.spentTodayMilli)} of ${inr(d.capTodayMilli)} daily cap` : `${inr(d.spentTodayMilli)} · no daily cap`} />
        <p className="small muted" style={{ marginTop: 8 }}>Runway at today's pace: {d.runwayDays != null ? `${d.runwayDays} days` : <NotMeasured />}</p></>}</Async>
        <hr className="rule" /><div className="formgrid"><TextField label="Add money (₹)" type="number" inputMode="numeric" min={100} value={amt} onChange={e => setAmt(e.target.value)} hint="Adding money is a spend, so it asks for your approval. It is not reversible in the product." /></div>
        <div style={{ marginTop: 12 }}>{!owner ? <Btn disabled reason="Only an owner can add money.">Ask to add</Btn> : Number(amt) >= 100 ? <Btn kind="primary" onClick={async () => { const r = await act('wallet.topup', { amountMilli: Math.round(Number(amt) * 1000) }, { describe: 'Wallet topped up.' }); if (r.ok) { setAmt(''); refresh(); } }}>Ask to add {inr(Number(amt) * 1000)}</Btn> : <Btn disabled reason="Enter at least ₹100.">Ask to add</Btn>}</div></Card>
      <Card><CardHead title="What you have spent" sub={b.data?.periodLabel} /><Async q={b} what="Billing" tool="billing.summary">{d => <>
        <div className="priceline"><span>Your price per minute</span><strong>{d.pricePerMinute == null ? <NotMeasured>Not set</NotMeasured> : inr(d.pricePerMinute)}</strong></div>
        <p className="small muted">{d.pricePerMinute == null ? 'No price has been agreed for this workspace yet, so nothing is invoiced. Below is the real cost of what ran.' : ''}</p>
        <ul className="billing">{d.lines.map(l => <li key={l.label}><div><strong>{l.label}</strong><span className="small muted"> {l.qty}</span></div><div className="row"><span className="tnum">{l.costMilli == null ? <NotMeasured /> : inr(l.costMilli)}</span><Grade g={l.grade} /></div></li>)}</ul>
        <p className="small muted">{d.gstNote} {d.basis}</p></>}</Async></Card>
    </div>
  );
}

function Compliance() {
  const q = useTool<{ windows: string; disclosure: { locked: boolean; text: string }; checks: { label: string; state: string }[]; categories: { id: string; label: string; series: string; note: string }[] }>('compliance.get', {});
  return <Async q={q} what="Compliance" tool="compliance.get">{d => <div className="stack">
    <Card><CardHead title="Rules every call follows" sub="Enforced in code at one dial gate, not in a prompt." />
      <ul className="billing">{d.checks.map(c => <li key={c.label}><span>{c.label}</span><Chip tone="leaf">Always on</Chip></li>)}<li><span>{d.windows}</span><Chip tone="leaf">Always on</Chip></li><li><span><Lock size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> AI disclosure. {d.disclosure.text}</span><Chip tone="leaf">Locked</Chip></li></ul></Card>
    <Card><CardHead title="Call categories" sub="Chosen once per campaign." /><ul className="billing">{d.categories.map(c => <li key={c.id}><div><strong>{c.label}</strong><span className="small muted"> {c.note}</span></div><Chip>Series {c.series}</Chip></li>)}</ul></Card></div>}</Async>;
}

function Privacy() {
  const q = useTool<{ region: string; retention: { what: string; days: number }[]; recording: { enabled: boolean; announce: boolean }; memory: { status: string }; note: string }>('privacy.get', {});
  const r = useTool<{ rows: { id: string; kind: string; who: string; state: string; at: string }[] }>('dpdp.request.list', {});
  return <div className="stack"><Async q={q} what="Privacy" tool="privacy.get">{d => <Card><CardHead title="Where data lives and for how long" />
    <dl className="kv"><div><dt>Region</dt><dd>{d.region}</dd></div>{d.retention.map(x => <div key={x.what}><dt>{x.what}</dt><dd className="tnum">Kept {x.days} days</dd></div>)}<div><dt>Recording</dt><dd>{d.recording.enabled ? 'On' : 'Off'}{d.recording.enabled && d.recording.announce ? ', and the call says so' : ''}</dd></div><div><dt>Memory</dt><dd>{d.memory.status}</dd></div></dl><p className="small muted" style={{ marginTop: 8 }}>{d.note}</p></Card>}</Async>
    <Card><CardHead title="People's data requests" sub="Forget and export requests under DPDP." /><Async q={r} what="Data requests" tool="dpdp.request.list" empty={d => d.rows.length === 0 ? <Empty title="No requests" body="When someone asks to be forgotten, it shows here until done." /> : null}>{d => <ul className="billing">{d.rows.map(x => <li key={x.id}><div><strong>{x.kind === 'forget' ? 'Forget' : 'Export'}</strong> <span className="small muted">{x.who} · {date(x.at)}</span></div><Chip tone={x.state === 'done' ? 'leaf' : 'marigold'}>{x.state === 'done' ? 'Done' : 'In progress'}</Chip></li>)}</ul>}</Async></Card></div>;
}

function OperatorTab() {
  const { act, refresh } = useApp();
  const q = useTool<{ autonomy: 'A0' | 'A1'; brain: string | null; brains: string[] }>('operator.settings.get', {});
  const [pick, setPick] = useState('');
  return <Async q={q} what="Operator settings" tool="operator.settings.get">{d => <div className="stack">
    <Card><CardHead title="Saarthi, VP's operator" sub="Saarthi plans and does drafts and tests itself. Anything that reaches people, spends, deletes or changes policy always waits for your tap." />
      <Toggle checked={d.autonomy === 'A0'} onChange={async on => { const r = await act(on ? 'operator.autonomy.lower' : 'operator.autonomy.raise', { level: on ? 'A0' : 'A1' }, { describe: on ? 'Saarthi will now ask before every draft and test.' : 'Saarthi can draft and test on its own again.' }); if (r.ok) refresh(); else refresh(); }}
        label="Ask before drafts and tests too" hint="Lowering this takes effect at once. Raising it back is a policy change and asks for approval." /></Card>
    <Card><CardHead title="Brain" sub="The model behind Saarthi. It changes speed and what each turn costs, never what is allowed." />
      <p>Current: {d.brain ? <strong>{prettyId(d.brain)}</strong> : <NotMeasured>None chosen</NotMeasured>}</p>
      {d.brains.length === 0 ? <p className="small muted">No curated brains are configured on this server yet.</p> : <><div className="formgrid" style={{ marginTop: 12 }}><SelectField label="Choose a brain" value={pick} onChange={e => setPick(e.target.value)} hint="Speed and price for each are shown once measured. Nothing is recommended by default."><option value="">Choose one</option>{d.brains.map(b => <option key={b} value={b}>{prettyId(b)}</option>)}</SelectField></div>
        <div style={{ marginTop: 12 }}>{pick && pick !== d.brain ? <Btn kind="primary" onClick={async () => { const r = await act('operator.brain.set', { brain: pick }, { describe: 'Brain changed.' }); if (r.ok) refresh(); }}>Ask to switch…</Btn> : <Btn disabled reason={pick ? 'That brain is already in use.' : 'Choose a brain first.'}>Ask to switch</Btn>}</div></>}</Card></div>}</Async>;
}

function Activity() {
  const q = useTool<{ rows: ActivityRow[]; summary: { drafts: number; tests: number; guards: number } }>('activity.list', {});
  const cols: Col<ActivityRow>[] = [{ key: 't', label: 'When', render: a => date(a.at, true) }, { key: 'w', label: 'Who', render: a => a.who },
    { key: 's', label: 'What', primary: true, render: a => <>{a.summary}<br /><code className="small">{a.tool}</code></> }, { key: 'm', label: 'Level', render: a => <Chip tone={a.mode === 'A2' ? 'terra' : a.mode === 'A3' ? 'peacock' : 'neutral'}>{a.mode === 'A2' ? 'Your tap' : a.mode === 'A3' ? 'Guard' : 'Automatic'}</Chip> },
    { key: 'o', label: 'Result', render: a => <Chip tone={a.outcome === 'confirmed' ? 'leaf' : a.outcome === 'unknown' ? 'marigold' : 'brick'}>{a.outcome === 'confirmed' ? 'Confirmed' : a.outcome === 'unknown' ? 'Unknown' : 'Not executed'}</Chip> }, { key: 'c', label: 'Cost', num: true, render: a => a.costMilli == null ? <NotMeasured /> : inr(a.costMilli) },
    { key: 'u', label: 'Undo', hideMobile: true, render: a => <span className="small muted">{a.undo ?? 'Restore an earlier version'}</span> }];
  return <Card><CardHead title="What VP did" sub={q.data ? `${q.data.summary.drafts} drafts, ${q.data.summary.tests} tests, ${q.data.summary.guards} guarded actions recently` : undefined} />
    <Async q={q} what="Activity" tool="activity.list" empty={d => d.rows.length === 0 ? <Empty title="Nothing yet" body="Every draft, test and approved action is written here with who did it and what it cost." /> : null}>{d => <Table caption="Activity ledger" cols={cols} rows={d.rows} rowKey={r => r.id} />}</Async></Card>;
}
export { api, count };
