// Settings: team, API keys, brand, knowledge, billing (real cost, price "not set"), compliance, privacy, operator, integrations, activity.
import { useState } from 'react';
import { Copy, Lock } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { useNav } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Locked, Meter, NotMeasured, PageHead, SelectField, Sheet, Table, Tabs, TextArea, TextField, Toggle, type Col } from '../ui.tsx';
import { activityList, keyList, knowledgeList, memberList, walletGet } from '../data.ts';
import { ago, count, date, inr } from '../format.ts';
import { prettyId } from '../catalog.ts';
import { prettyCode } from './contacts.tsx';
import type { ActivityRow, ApiKey, KnowledgeItem, Member } from '../types.ts';

const TABS = ['team', 'keys', 'brand', 'knowledge', 'billing', 'compliance', 'privacy', 'operator', 'integrations', 'activity'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { team: 'Team', keys: 'API keys', brand: 'Brand', knowledge: 'Knowledge', billing: 'Billing', compliance: 'Compliance', privacy: 'Privacy', operator: 'Operator', integrations: 'Integrations', activity: 'Activity' };

export default function Settings({ tab }: { tab?: string }) {
  const go = useNav();
  const t = (TABS.includes(tab as Tab) ? tab : 'team') as Tab;
  return (
    <div className="page">
      <PageHead title="Settings" sub="Who can do what, what it costs, and the rules every call follows." />
      <Tabs label="Settings sections" value={t} onChange={v => go('/settings/' + v)} items={TABS.map(id => ({ id, label: LABEL[id] }))} />
      {t === 'team' && <Team />}{t === 'keys' && <Keys />}{t === 'brand' && <Brand />}{t === 'knowledge' && <Knowledge />}{t === 'billing' && <Billing />}
      {t === 'compliance' && <Compliance />}{t === 'privacy' && <Privacy />}{t === 'operator' && <OperatorTab />}{t === 'integrations' && <Integrations />}{t === 'activity' && <Activity />}
    </div>
  );
}

const ROLES = ['owner', 'builder', 'operator', 'compliance', 'viewer'];
const ROLE_HINT: Record<string, string> = { owner: 'Everything, including money and policy', builder: 'Builds agents and campaigns', operator: 'Runs campaigns and watches calls', compliance: 'Policy, suppression and data requests', viewer: 'Sees everything with phone numbers hidden' };

/** Picking a role in the list changes nothing by itself; the explicit button asks for the change. */
function RoleCell({ m, onDone }: { m: Member; onDone: () => void }) {
  const { act } = useApp(); const [r, setR] = useState(m.role);
  return <div className="row" style={{ gap: 8 }}><select className="input" style={{ minHeight: 40, width: 'auto' }} aria-label={`Role for ${m.name}`} value={r} onChange={e => setR(e.target.value)}>{ROLES.map(x => <option key={x}>{x}</option>)}</select>
    {r !== m.role && <Btn size="sm" kind="primary" onClick={async () => { await act('member.role.set', { memberId: m.id, role: r }, { describe: 'Role changed.' }); onDone(); }}>Ask to change</Btn>}</div>;
}
function Team() {
  const { act, refresh, can } = useApp();
  const q = useData<Member[]>('members', memberList);
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [role, setRole] = useState('builder');
  const owner = can(['owner']);
  const cols: Col<Member>[] = [
    { key: 'n', label: 'Name', primary: true, render: m => <>{m.name}<br /><span className="small muted">{m.email}</span></> },
    { key: 'r', label: 'Role', render: m => owner ? <RoleCell m={m} onDone={refresh} /> : <Chip>{m.role}</Chip> },
    { key: 's', label: 'Status', render: m => <Chip tone={m.status === 'active' ? 'leaf' : 'marigold'}>{m.status === 'active' ? 'Active' : 'Invited'}</Chip> },
  ];
  return (
    <Card><CardHead title="Team" sub="Changing a role is a policy change and asks for approval." actions={owner ? <Btn kind="primary" onClick={() => setOpen(true)}>Invite</Btn> : <Locked role="owner" />} />
      <Async q={q} what="Team" tool="member.list">{d => <Table caption="Team" cols={cols} rows={d} rowKey={r => r.id} />}</Async>
      <dl className="rolehints">{ROLES.map(r => <div key={r}><dt>{r}</dt><dd className="small muted">{ROLE_HINT[r]}</dd></div>)}</dl>
      {open && <Sheet title="Invite a teammate" onClose={() => setOpen(false)}><TextField label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-autofocus />
        <SelectField label="Role" value={role} onChange={e => setRole(e.target.value)} hint={ROLE_HINT[role]}>{ROLES.map(r => <option key={r}>{r}</option>)}</SelectField>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn>{/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? <Btn kind="primary" onClick={async () => { const r = await act('member.invite', { email, role }, { describe: 'Invitation sent.' }); if (r.ok) { setOpen(false); setEmail(''); refresh(); } }}>Ask to invite</Btn> : <Btn disabled reason="Enter a valid email.">Ask to invite</Btn>}</div></Sheet>}
    </Card>
  );
}

function Keys() {
  const { act, refresh, toast, can } = useApp();
  const q = useData<ApiKey[]>('keys', keyList);
  const [name, setName] = useState(''); const [secret, setSecret] = useState<string | null>(null);
  const owner = can(['owner']);
  const cols: Col<ApiKey>[] = [{ key: 'l', label: 'Name', primary: true, render: k => k.name }, { key: 'p', label: 'Key', render: k => <code>{k.prefix || '—'}</code> }, { key: 'u', label: 'Last used', render: k => k.lastUsed ? ago(k.lastUsed) : 'Never' },
    { key: 's', label: 'State', render: k => <Chip tone={k.revoked ? 'brick' : 'leaf'}>{k.revoked ? 'Revoked' : 'Active'}</Chip> },
    { key: 'x', label: '', render: k => k.revoked ? null : <Btn size="sm" kind="danger" onClick={async () => { const r = await act('apikey.revoke', { id: k.id }, { describe: 'Key revoked.' }); if (r.ok) refresh(); }}>Revoke…</Btn> }];
  const create = async () => {
    const r = await act<{ revealId?: string; token?: string }>('apikey.create', { name: name.trim() }, { quiet: true });
    if (!r.ok) return;
    setName(''); refresh();
    if (r.result.token) setSecret(r.result.token);
    else if (r.result.revealId) { try { const s = await run<{ token: string }>('secret.reveal', { revealId: r.result.revealId }); setSecret(s.token); } catch (e) { toast(e instanceof Error ? e.message : 'Could not show the key.', 'bad'); } }
  };
  return (
    <div className="stack">
      <Card><CardHead title="API keys" sub="Keys call the same tools the pages do. A key can never approve anything: approvals need a signed-in person." />
        <Async q={q} what="API keys" tool="apikey.list" empty={d => d.length === 0 ? <Empty title="No keys yet" body="Create one for your CRM or webhook." /> : null}>{d => <Table caption="API keys" cols={cols} rows={d} rowKey={r => r.id} />}</Async></Card>
      <Card><CardHead title="New key" sub="Creating a key is a policy change. The secret is shown once." />
        {owner ? <><TextField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="CRM webhook" />
          <div style={{ marginTop: 12 }}>{name.trim() ? <Btn kind="primary" onClick={create}>Ask to create</Btn> : <Btn disabled reason="Give the key a name.">Ask to create</Btn>}</div></> : <Locked role="owner" />}</Card>
      {secret && <Sheet title="Copy your key now" onClose={() => setSecret(null)}><p className="muted">This is the only time it is shown. Store it in your secrets manager, not in a chat or a spreadsheet.</p><code className="secret">{secret}</code>
        <div className="row"><Btn icon={<Copy size={16} aria-hidden />} onClick={async () => { try { await navigator.clipboard.writeText(secret); toast('Copied.', 'ok'); } catch { toast('Could not copy. Select the key and copy it yourself.', 'bad'); } }}>Copy</Btn><Btn kind="primary" onClick={() => setSecret(null)}>I have saved it</Btn></div></Sheet>}
    </div>
  );
}

interface BrandDoc { legalName?: string; sector?: string; dltEntityId?: string; website?: string; tone?: string; logoUri?: string }
function Brand() {
  const { act } = useApp();
  const q = useData('brand', async () => ((await run<{ brand: BrandDoc | null }>('brand.get', {})).brand ?? {}) as BrandDoc);
  return <Async q={q} what="Brand" tool="brand.get">{b => <BrandForm key={JSON.stringify(b)} b={b} onSave={async v => { const r = await act('brand.update', v, { describe: 'Brand saved.' }); if (r.ok) q.reload(); }} />}</Async>;
}
function BrandForm({ b, onSave }: { b: BrandDoc; onSave: (v: object) => Promise<void> }) {
  const init = { legalName: b.legalName ?? '', sector: b.sector ?? '', dltEntityId: b.dltEntityId ?? '', website: b.website ?? '', tone: b.tone ?? '' };
  const [v, setV] = useState(init);
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card><CardHead title="Brand" sub="How your business is named on calls and in messages. Saved changes can be undone from Activity." actions={dirty ? <Chip tone="marigold">Unsaved</Chip> : undefined} />
      <div className="formgrid"><TextField label="Registered business name" value={v.legalName} onChange={set('legalName')} /><TextField label="Sector" value={v.sector} onChange={set('sector')} hint="For example: insurance, lending, clinic, retail." />
        <TextField label="Website" value={v.website} onChange={set('website')} hint="Links to your own domain are the only ones she may say." /><TextField label="DLT entity ID" value={v.dltEntityId} onChange={set('dltEntityId')} hint="Needed for registered messages. Leave empty if you do not have one." />
        <TextField className="span2" label="How you like to sound" value={v.tone} onChange={set('tone')} hint="A few words, for example: warm, plain, never pushy." /></div>
      <div style={{ marginTop: 16 }}>{dirty ? <Btn kind="primary" onClick={() => onSave(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')))}>Save brand</Btn> : <Btn disabled reason="No unsaved changes.">Save brand</Btn>}</div></Card>
  );
}

function Knowledge() {
  const { act, refresh } = useApp();
  const q = useData<KnowledgeItem[]>('knowledge', knowledgeList);
  const [f, setF] = useState({ title: '', text: '' }); const [open, setOpen] = useState<KnowledgeItem | null>(null);
  const cols: Col<KnowledgeItem>[] = [{ key: 't', label: 'Source', primary: true, render: k => k.title },
    { key: 's', label: 'State', render: k => <Chip tone={k.status === 'indexed' ? 'leaf' : k.status === 'failed' ? 'brick' : 'marigold'}>{k.status === 'indexed' ? 'Read' : prettyCode(k.status)}</Chip> },
    { key: 'p', label: 'Passages', num: true, render: k => k.passages }, { key: 'a', label: 'Approved', num: true, render: k => (k as any).approved ?? 0 },
    { key: 'r', label: '', render: k => <Btn size="sm" onClick={() => setOpen(k)}>Review passages</Btn> }];
  return (
    <div className="stack"><Card><CardHead title="Knowledge" sub="What she may state. Each passage keeps its source; you approve the ones she may use as facts." />
      <Async q={q} what="Knowledge" tool="knowledge.list" empty={d => d.length === 0 ? <Empty title="No sources yet" body="Add your FAQ, a policy note or opening hours." /> : null}>{d => <Table caption="Knowledge sources" cols={cols} rows={d} rowKey={r => r.id} />}</Async></Card>
      <Card><CardHead title="Add a source" sub="Company knowledge only. Customer rows never go in here." />
        <TextField label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <div style={{ marginTop: 12 }}><TextArea label="Text" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} rows={5} hint="Paste the text. PDFs and Word files can be sent through the API." /></div>
        <div style={{ marginTop: 12 }}>{f.title.trim() && f.text.trim() ? <Btn kind="primary" onClick={async () => { const r = await act('knowledge.ingest', { title: f.title.trim(), text: f.text }, { describe: 'Added. Its passages wait for your approval.' }); if (r.ok) { setF({ title: '', text: '' }); refresh(); } }}>Add source</Btn> : <Btn disabled reason="Add a title and some text.">Add source</Btn>}</div></Card>
      {open && <Passages item={open} onClose={() => { setOpen(null); refresh(); }} />}</div>
  );
}
interface Span { id: string; ordinal: number; text: string; status: string }
function Passages({ item, onClose }: { item: KnowledgeItem; onClose: () => void }) {
  const { act } = useApp();
  const q = useData(['spans', item.id], async () => (await run<{ spans: Span[] }>('knowledge.list', { sourceId: item.id })).spans);
  return (
    <Sheet title={item.title} onClose={onClose} wide>
      <Async q={q} what="Passages" tool="knowledge.list" empty={d => d.length === 0 ? <Empty title="No passages" /> : null}>{d => <ul className="issues">{d.map(s => (
        <li key={s.id}><div className="row" style={{ justifyContent: 'space-between' }}><Chip tone={s.status === 'approved' ? 'leaf' : s.status === 'rejected' ? 'brick' : 'marigold'}>{s.status === 'pending' ? 'Waiting for you' : prettyCode(s.status)}</Chip></div><p lang="hi">{s.text}</p>
          <div className="row"><Btn size="sm" onClick={async () => { await act('knowledge.span.approve', { spanIds: [s.id], decision: 'approved' }, { describe: 'Approved.' }); q.reload(); }}>She may state this</Btn><Btn size="sm" kind="ghost" onClick={async () => { await act('knowledge.span.approve', { spanIds: [s.id], decision: 'rejected' }, { describe: 'Struck.' }); q.reload(); }}>Strike it</Btn></div></li>))}</ul>}</Async>
    </Sheet>
  );
}

interface Invoice { period: { from: string; to: string }; costInrMilli: number; byComponent: { component?: string; key?: string; inrMilli?: number; inr_milli?: number }[]; byCampaign: unknown[]; price: { status: string; text: string }; note: string }
function Billing() {
  const { act, refresh, can } = useApp();
  const w = useData('wallet', walletGet);
  const inv = useData('invoice', () => run<Invoice>('invoice.get', {}));
  const [amt, setAmt] = useState(''); const owner = can(['owner']);
  return (
    <div className="stack">
      <Card><CardHead title="Wallet" /><Async q={w} what="Wallet" tool="wallet.get">{d => <>
        <p className="bignum serif tnum">{inr(d.balanceMilli)}</p>
        <dl className="kv"><div><dt>State</dt><dd><Chip tone={d.state === 'ok' ? 'leaf' : 'marigold'}>{prettyCode(d.state)}</Chip></dd></div><div><dt>Held for calls</dt><dd className="tnum">{inr(d.heldMilli)}</dd></div><div><dt>Available</dt><dd className="tnum">{inr(d.availableMilli)}</dd></div>
          <div><dt>Runway</dt><dd>{d.runwayDays != null ? <span className="tnum">{d.runwayDays} days at today's pace</span> : <NotMeasured>Not measured yet</NotMeasured>}</dd></div></dl>
        {d.warnings.map(x => <p key={x} className="hint hint-bad" role="status">{x}</p>)}
        {d.caps.map((c, i) => <div key={i} style={{ marginTop: 8 }}><Meter label={`${prettyCode(c.scope)} cap, ${c.period}`} value={c.spentInrMilli ?? 0} max={c.capInrMilli} note={`${inr(c.spentInrMilli ?? 0)} of ${inr(c.capInrMilli)}`} /></div>)}
        {d.caps.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>No spend caps are set.</p>}</>}</Async>
        <hr className="rule" /><TextField label="Add money (₹)" type="number" inputMode="numeric" min={100} value={amt} onChange={e => setAmt(e.target.value)} hint="Adding money is a spend, so it asks for your approval. It is not reversible in the product." />
        <div style={{ marginTop: 12 }}>{!owner ? <Btn disabled reason="Only an owner can add money.">Ask to add</Btn> : Number(amt) >= 100 ? <Btn kind="primary" onClick={async () => { const r = await act('wallet.topup', { inrMilli: Math.round(Number(amt) * 1000) }, { describe: 'Wallet topped up.' }); if (r.ok) { setAmt(''); refresh(); } }}>Ask to add {inr(Number(amt) * 1000)}</Btn> : <Btn disabled reason="Enter at least ₹100.">Ask to add</Btn>}</div></Card>
      <Card><CardHead title="What you have spent" sub={inv.data ? `${date(inv.data.period.from)} to ${date(inv.data.period.to)}` : undefined} /><Async q={inv} what="Usage" tool="invoice.get">{d => <>
        <div className="priceline"><span>Your price per minute</span><strong>{d.price.status === 'not_set' ? <NotMeasured>Not set</NotMeasured> : 'Set'}</strong></div>
        <p className="small muted">{d.price.text}</p>
        <p className="bignum serif tnum" style={{ marginTop: 8 }}>{inr(d.costInrMilli, { paise: true })}</p>
        {d.byComponent.length === 0 ? <p className="small muted">Nothing has been spent in this period. That is a measured zero from the usage lines.</p> :
          <ul className="billing">{d.byComponent.map((l, i) => <li key={i}><strong>{prettyCode(l.component ?? l.key ?? '')}</strong><span className="tnum">{inr(l.inrMilli ?? l.inr_milli ?? 0, { paise: true })}</span></li>)}</ul>}
        <p className="small muted">{d.note}</p></>}</Async></Card>
    </div>
  );
}

interface Rules { rules: { version: string; reply: { id: string; rule: string; action: string; reason: string }[] } }
function Compliance() {
  const { act, can } = useApp();
  const q = useData('safety', () => run<Rules>('safety.cases', {}));
  const [band, setBand] = useState({ start: '09:00', end: '21:00' });
  const policy = can(['owner', 'compliance']);
  return (
    <div className="stack">
      <Card><CardHead title="Rules every call follows" sub="Enforced in code at one dial gate and one reply door, not in a prompt. They cannot be switched off." />
        <Async q={q} what="Safety rules" tool="safety.cases">{d => <><ul className="billing">{d.rules.reply.map(r => <li key={r.id}><div><strong>{r.reason.charAt(0).toUpperCase() + r.reason.slice(1)}</strong><span className="small muted"> · {r.action === 'block' ? 'blocked' : 'replaced'} before it is said</span></div><Chip tone="leaf">Always on</Chip></li>)}</ul><p className="small muted">Rule set {d.rules.version}. Also always on: DND and opt-out checks before every attempt, and the AI disclosure, spoken once and lightly.</p></>}</Async></Card>
      <Card><CardHead title="Workspace calling hours" sub="The outer band every campaign window must sit inside. Widening it is a policy change." />
        {policy ? <><div className="formgrid"><TextField label="From" type="time" value={band.start} onChange={e => setBand({ ...band, start: e.target.value })} /><TextField label="To" type="time" value={band.end} onChange={e => setBand({ ...band, end: e.target.value })} /></div>
          <div style={{ marginTop: 12 }}>{band.start < band.end ? <Btn kind="primary" onClick={() => void act('policy.window.set', { outerBand: band }, { describe: 'Calling hours changed.' })}>Ask to set</Btn> : <Btn disabled reason="The band must end after it starts.">Ask to set</Btn>}</div></> : <Locked role="owner or compliance lead" />}</Card>
    </div>
  );
}

function Privacy() {
  const { act, refresh, can } = useApp();
  const q = useData('mempol', () => run<{ enabled: boolean; undoMinutes: number; refusedCategories: string[] }>('memory.policy.get', {}));
  const [e164, setE164] = useState(''); const [scope, setScope] = useState('forget_memory'); const [by, setBy] = useState('person'); const [ev, setEv] = useState('');
  const policy = can(['owner', 'compliance']);
  return (
    <div className="stack">
      <Async q={q} what="Memory policy" tool="memory.policy.get">{d => <Card><CardHead title="Memory" sub="What a later call remembers from an earlier one. Facts need the person's exact words and a purpose; you can approve or forget each one." />
        <Toggle checked={d.enabled} onChange={async on => { if (!policy) return; const r = await act('memory.policy.set', { enabled: on }, { describe: on ? 'Memory turned on.' : 'Memory turned off.' }); if (r.ok) q.reload(); else refresh(); }} label="Remember what callers say" hint={policy ? 'Changing this is a policy change and asks for approval. Practice calls never write memory.' : 'Only an owner or compliance lead can change this.'} />
        <p className="small muted">Undo window for new facts: <span className="tnum">{d.undoMinutes}</span> minutes. Never remembered: {d.refusedCategories.map(c => c.replace(/_/g, ' ')).join(', ')}.</p></Card>}</Async>
      <Card><CardHead title="A person's data request" sub="Forget what is remembered, or erase the person. The number stays suppressed so they are never called again by mistake." />
        {can(['owner', 'compliance']) ? <><div className="formgrid"><TextField label="Their phone number" inputMode="tel" value={e164} onChange={e => setE164(e.target.value)} placeholder="+91 …" />
          <SelectField label="What they asked for" value={scope} onChange={e => setScope(e.target.value)}><option value="forget_memory">Forget what is remembered</option><option value="erase_me">Erase me completely</option></SelectField>
          <SelectField label="Who asked" value={by} onChange={e => setBy(e.target.value)}><option value="person">The person</option><option value="compliance">Our compliance lead</option><option value="tenant">Our business</option></SelectField>
          <TextField label="Where it was asked" value={ev} onChange={e => setEv(e.target.value)} hint="For example: email from the person, 21 Oct." /></div>
          <div style={{ marginTop: 12 }}>{e164.replace(/\D/g, '').length >= 10 && ev.trim().length >= 3 ? <Btn kind="danger" onClick={() => void act('dpdp.request.execute', { e164, scope, requestedBy: by, evidence: ev.trim(), suppress: true }, { describe: 'Request carried out.' })}>Ask to carry out…</Btn> : <Btn disabled reason="Enter their number and where the request came from.">Ask to carry out</Btn>}</div></> : <Locked role="owner or compliance lead" />}</Card>
    </div>
  );
}

function OperatorTab() {
  const { act, refresh } = useApp();
  const q = useData('opset', () => run<{ autonomy: 'A0' | 'A1'; brain: string | null; brains: string[] }>('operator.settings.get', {}));
  const [pick, setPick] = useState('');
  return <Async q={q} what="Operator settings" tool="operator.settings.get">{d => <div className="stack">
    <Card><CardHead title="Saarthi, VP's operator" sub="Saarthi plans and does drafts and tests itself. Anything that reaches people, spends, deletes or changes policy always waits for your tap." />
      <Toggle checked={d.autonomy === 'A0'} onChange={async on => { const r = await act(on ? 'operator.autonomy.lower' : 'operator.autonomy.raise', { level: on ? 'A0' : 'A1' }, { describe: on ? 'Saarthi will now ask before every draft and test.' : 'Saarthi can draft and test on its own again.' }); if (r.ok) q.reload(); else refresh(); }}
        label="Ask before drafts and tests too" hint="Lowering this takes effect at once. Raising it back is a policy change and asks for approval." /></Card>
    <Card><CardHead title="Brain" sub="The model behind Saarthi. It changes speed and what each turn costs, never what is allowed." />
      <p>Current: {d.brain ? <strong>{prettyId(d.brain)}</strong> : <NotMeasured>None chosen</NotMeasured>}</p>
      {d.brains.length === 0 ? <p className="small muted">No curated brains are configured on this server yet.</p> : <><div className="formgrid" style={{ marginTop: 12 }}><SelectField label="Choose a brain" value={pick} onChange={e => setPick(e.target.value)} hint="Nothing is recommended by default. Switching changes the cost of every Operator turn."><option value="">Choose one</option>{d.brains.map(b => <option key={b} value={b}>{prettyId(b)}</option>)}</SelectField></div>
        <div style={{ marginTop: 12 }}>{pick && pick !== d.brain ? <Btn kind="primary" onClick={async () => { const r = await act('operator.brain.set', { brain: pick }, { describe: 'Brain changed.' }); if (r.ok) q.reload(); }}>Ask to switch…</Btn> : <Btn disabled reason={pick ? 'That brain is already in use.' : 'Choose a brain first.'}>Ask to switch</Btn>}</div></>}</Card></div>}</Async>;
}

function Integrations() {
  const q = useData('integrations', async () => ({ list: (await run<{ integrations: { id: string; kind: string; name: string }[] }>('integration.list', {})).integrations, kinds: (await run<{ kinds: { id: string; label: string; secrets: string[] }[] }>('integration.kinds', {})).kinds }));
  return <Async q={q} what="Integrations" tool="integration.list">{d => <div className="stack">
    <Card><CardHead title="Connected" />{d.list.length === 0 ? <Empty title="Nothing connected" body="Connect your CRM or calendar so outcomes come from your own system, which is how a result earns the grade “confirmed by your system”." /> : <ul className="billing">{d.list.map(i => <li key={i.id}><strong>{i.name}</strong><Chip>{i.kind}</Chip></li>)}</ul>}</Card>
    <Card><CardHead title="What can be connected" sub="Credentials are encrypted and never shown again. Connecting is a policy change." /><ul className="billing">{d.kinds.map(k => <li key={k.id}><strong>{k.label}</strong><span className="small muted">needs {k.secrets.map(s => s.replace(/_/g, ' ')).join(', ')}</span></li>)}</ul><p className="small muted" style={{ marginTop: 8 }}>Connecting is done with Saarthi or the API for now, so credentials never pass through a page.</p></Card></div>}</Async>;
}

function Activity() {
  const q = useData<ActivityRow[]>('activity', activityList);
  const cols: Col<ActivityRow>[] = [{ key: 't', label: 'When', render: a => date(a.at, true) }, { key: 's', label: 'What', primary: true, render: a => <>{a.line}<br /><code className="small">{a.action}</code></> }];
  return <Card><CardHead title="What VP did" sub="Every draft, test and approved action, with who did it." />
    <Async q={q} what="Activity" tool="activity.list" empty={d => d.length === 0 ? <Empty title="Nothing yet" body="Everything that changes something is written here." /> : null}>{d => <Table caption="Activity ledger" cols={cols} rows={d} rowKey={r => r.id} />}</Async></Card>;
}
export { count, Lock };
