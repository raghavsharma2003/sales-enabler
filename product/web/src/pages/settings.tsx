// Settings: team, API keys, brand, knowledge, billing (real cost, price "not set"), compliance, privacy, operator, integrations, webhooks, activity.
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { useNav } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Locked, Meter, NotMeasured, PageHead, SelectField, Sheet, Table, Tabs, TextArea, TextField, Toggle, type Col } from '../ui.tsx';
import { activityList, keyList, knowledgeList, memberList, walletGet } from '../data.ts';
import { ago, count, date, inr, time } from '../format.ts';
import { prettyId } from '../catalog.ts';
import { prettyCode } from './contacts.tsx';
import { costPart } from '../labels.ts';
import { Link } from '../router.tsx';
import Integrations from './integrations.tsx';
import Security from './security.tsx';
import Outcomes from './outcomes.tsx';
import Webhooks from './webhooks.tsx';
import Notifications from './notifications.tsx';
import { RevealSheet } from '../reveal.tsx';
import { activitySentence, foldRepeats, pageFor, RULE_LABEL } from '../labels.ts';
import type { ActivityRow, ApiKey, KnowledgeItem, Member } from '../types.ts';

const TABS = ['team', 'keys', 'brand', 'knowledge', 'outcomes', 'billing', 'compliance', 'privacy', 'security', 'operator', 'integrations', 'webhooks', 'notifications', 'activity'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { team: 'Team', keys: 'API keys', brand: 'Brand', knowledge: 'Knowledge', outcomes: 'Outcomes and checks', billing: 'Billing', compliance: 'Compliance', privacy: 'Privacy', security: 'Security', operator: 'Assistant', integrations: 'Integrations', webhooks: 'Webhooks', notifications: 'Notifications', activity: 'Activity' };

export default function Settings({ tab }: { tab?: string }) {
  const go = useNav();
  const t = (TABS.includes(tab as Tab) ? tab : 'team') as Tab;
  return (
    <div className="page">
      <PageHead title="Settings" sub="Who can do what, what it costs, and the rules every call follows." />
      <Tabs label="Settings sections" value={t} onChange={v => go('/settings/' + v)} items={TABS.map(id => ({ id, label: LABEL[id] }))} />
      {t === 'team' && <Team />}{t === 'keys' && <Keys />}{t === 'brand' && <Brand />}{t === 'knowledge' && <Knowledge />}{t === 'outcomes' && <Outcomes />}{t === 'billing' && <Billing />}
      {t === 'compliance' && <Compliance />}{t === 'privacy' && <Privacy />}{t === 'security' && <Security />}{t === 'operator' && <OperatorTab />}{t === 'integrations' && <Integrations />}{t === 'webhooks' && <Webhooks />}{t === 'notifications' && <Notifications />}{t === 'activity' && <Activity />}
    </div>
  );
}

const ROLES = ['owner', 'builder', 'operator', 'compliance', 'viewer'];
const ROLE_NAME: Record<string, string> = { owner: 'Owner', builder: 'Builder', operator: 'Operator', compliance: 'Compliance', viewer: 'Viewer' };
const roleName = (r: string) => ROLE_NAME[r] ?? r;
const ROLE_HINT: Record<string, string> = { owner: 'Everything, including money and policy', builder: 'Builds agents and campaigns', operator: 'Runs campaigns and watches calls', compliance: 'Policy, suppression and data requests', viewer: 'Sees everything with phone numbers hidden' };

/** Picking a role in the list changes nothing by itself; the explicit button asks for the change. */
function RoleCell({ m, onDone }: { m: Member; onDone: () => void }) {
  const { act } = useApp(); const [r, setR] = useState(m.role);
  return <div className="row" style={{ gap: 8 }}><select className="input" style={{ minHeight: 40, width: 'auto' }} aria-label={`Role for ${m.name}`} value={r} onChange={e => setR(e.target.value)}>{ROLES.map(x => <option key={x} value={x}>{roleName(x)}</option>)}</select>
    {r !== m.role && <Btn size="sm" kind="primary" onClick={async () => { await act('member.role.set', { memberId: m.id, role: r }, { describe: 'Role changed.' }); onDone(); }}>Ask to change</Btn>}</div>;
}
function Team() {
  const { act, refresh, can } = useApp();
  const q = useData<Member[]>('members', memberList);
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [role, setRole] = useState('builder');
  const owner = can(['owner']);
  const cols: Col<Member>[] = [
    { key: 'n', label: 'Name', primary: true, render: m => <>{m.name}<br /><span className="small muted">{m.email}</span></> },
    { key: 'r', label: 'Role', render: m => owner ? <RoleCell m={m} onDone={refresh} /> : <Chip>{roleName(m.role)}</Chip> },
    { key: 's', label: 'Status', render: m => <Chip tone={m.status === 'active' ? 'leaf' : 'marigold'}>{m.status === 'active' ? 'Active' : 'Invited'}</Chip> },
  ];
  return (
    <Card><CardHead title="Team" sub="Changing a role is a policy change and asks for approval." actions={owner ? <Btn kind="primary" onClick={() => setOpen(true)}>Invite</Btn> : <Locked role="owner" />} />
      <Async q={q} what="Team" tool="member.list">{d => <Table caption="Team" cols={cols} rows={d} rowKey={r => r.id} />}</Async>
      <dl className="rolehints">{ROLES.map(r => <div key={r}><dt>{roleName(r)}</dt><dd className="small muted">{ROLE_HINT[r]}</dd></div>)}</dl>
      {open && <Sheet title="Invite a teammate" onClose={() => setOpen(false)}><TextField label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} data-autofocus />
        <SelectField label="Role" value={role} onChange={e => setRole(e.target.value)} hint={ROLE_HINT[role]}>{ROLES.map(r => <option key={r} value={r}>{roleName(r)}</option>)}</SelectField>
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
    { key: 'x', label: '', render: k => k.revoked ? null : <div className="row" style={{ gap: 8 }}>
      {owner ? <Btn size="sm" onClick={() => void rotate(k)}>Rotate…</Btn> : <Btn size="sm" disabled reason="Only an owner can rotate a key.">Rotate</Btn>}
      <Btn size="sm" kind="danger" onClick={async () => { const r = await act('apikey.revoke', { id: k.id }, { describe: 'Key revoked.' }); if (r.ok) refresh(); }}>Revoke…</Btn></div> }];
  /** Rotating makes a new key with the same name, access and cap and revokes the old one; the new secret is shown once, like a new key. */
  const rotate = async (k: ApiKey) => {
    const r = await act<{ revealId?: string; token?: string }>('apikey.rotate', { id: k.id }, { quiet: true });
    if (!r.ok) return;
    refresh();
    if (r.result.token) setSecret(r.result.token);
    else if (r.result.revealId) { try { const s = await run<{ token: string }>('secret.reveal', { revealId: r.result.revealId }); setSecret(s.token); } catch (e) { toast(e instanceof Error ? e.message : 'Could not show the key.', 'bad'); } }
  };
  const create = async () => {
    const r = await act<{ revealId?: string; token?: string }>('apikey.create', { name: name.trim() }, { quiet: true });
    if (!r.ok) return;
    setName(''); refresh();
    if (r.result.token) setSecret(r.result.token);
    else if (r.result.revealId) { try { const s = await run<{ token: string }>('secret.reveal', { revealId: r.result.revealId }); setSecret(s.token); } catch (e) { toast(e instanceof Error ? e.message : 'Could not show the key.', 'bad'); } }
  };
  return (
    <div className="stack">
      <Card><CardHead title="API keys" sub="Keys call the same tools the pages do. A key can never approve anything: approvals need a signed-in person. Rotating a key replaces its secret and stops the old one at once." />
        <Async q={q} what="API keys" tool="apikey.list" empty={d => d.length === 0 ? <Empty title="No keys yet" body="Create one for your CRM or webhook." /> : null}>{d => <Table caption="API keys" cols={cols} rows={d} rowKey={r => r.id} />}</Async></Card>
      <Card><CardHead title="New key" sub="Creating a key is a policy change. The secret is shown once." />
        {owner ? <><TextField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="CRM webhook" />
          <div style={{ marginTop: 12 }}>{name.trim() ? <Btn kind="primary" onClick={create}>Ask to create</Btn> : <Btn disabled reason="Give the key a name.">Ask to create</Btn>}</div></> : <Locked role="owner" />}</Card>
      {secret && <RevealSheet title="Copy your key now" secret={secret} onClose={() => setSecret(null)} />}
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

// invoice.get lines carry costInrMilli (older servers sent inrMilli); reading the wrong one showed ₹0.00 on every line under a non-zero total.
interface InvoiceLine { component?: string; key?: string; campaignId?: string | null; costInrMilli?: number; inrMilli?: number; inr_milli?: number; connectedSeconds?: number }
interface Invoice { period: { from: string; to: string }; costInrMilli: number; byComponent: InvoiceLine[]; byCampaign?: InvoiceLine[]; price: { status: string; text: string }; note: string }
const lineCost = (l: InvoiceLine) => l.costInrMilli ?? l.inrMilli ?? l.inr_milli ?? 0;
function Billing() {
  const { act, refresh, can } = useApp();
  const w = useData('wallet', walletGet);
  const inv = useData('invoice', () => run<Invoice>('invoice.get', {}));
  const an = useData('analysis-setting', () => run<{ text: string }>('analysis.settings.get', {}));
  const [amt, setAmt] = useState(''); const owner = can(['owner']);
  return (
    <div className="stack">
      <Card><CardHead title="Wallet" /><Async q={w} what="Wallet" tool="wallet.get">{d => <>
        <p className="bignum serif tnum">{inr(d.balanceMilli)}</p>
        <dl className="kv"><div><dt>State</dt><dd><Chip tone={d.state === 'ok' ? 'leaf' : 'marigold'}>{prettyCode(d.state)}</Chip></dd></div><div><dt>Held for calls</dt><dd className="tnum">{inr(d.heldMilli)}</dd></div><div><dt>Available</dt><dd className="tnum">{inr(d.availableMilli)}</dd></div>
          <div><dt>Runway</dt><dd>{d.runwayDays != null ? <span className="tnum">{d.runwayDays} days at today's pace</span> : <NotMeasured>Not measured yet</NotMeasured>}</dd></div></dl>
        {d.warnings.map(x => <p key={x} className="hint hint-bad" role="status">{walletNote(x)}</p>)}
        {d.caps.map((c, i) => <div key={i} style={{ marginTop: 8 }}><Meter label={c.label ?? `${prettyCode(c.scope)} cap, ${c.period}`} value={c.period === 'burst' ? (c.heldInrMilli ?? 0) : (c.spentInrMilli ?? 0)} max={c.capInrMilli} note={c.text ?? `${inr(c.spentInrMilli ?? 0)} of ${inr(c.capInrMilli)}`} /></div>)}
        {d.caps.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>No spend caps are set.</p>}</>}</Async>
        <hr className="rule" /><TextField label="Add money (₹)" type="number" inputMode="numeric" min={100} value={amt} onChange={e => setAmt(e.target.value)} hint="Adding money is a spend, so it asks for your approval. It is not reversible in the product." />
        <div style={{ marginTop: 12 }}>{!owner ? <Btn disabled reason="Only an owner can add money.">Ask to add</Btn> : Number(amt) >= 100 ? <Btn kind="primary" onClick={async () => { const r = await act('wallet.topup', { inrMilli: Math.round(Number(amt) * 1000) }, { describe: 'Wallet topped up.' }); if (r.ok) { setAmt(''); refresh(); } }}>Ask to add {inr(Number(amt) * 1000)}</Btn> : <Btn disabled reason="Enter at least ₹100.">Ask to add</Btn>}</div></Card>
      <Card><CardHead title="What you have spent" sub={inv.data ? `${date(inv.data.period.from)} to ${date(inv.data.period.to)}` : undefined} /><Async q={inv} what="Usage" tool="invoice.get">{d => <>
        <div className="priceline"><span>Your price per minute</span><strong>{d.price.status === 'not_set' ? <NotMeasured>Not set</NotMeasured> : 'Set'}</strong></div>
        <p className="small muted">{d.price.text}</p>
        <p className="bignum serif tnum" style={{ marginTop: 8 }}>{inr(d.costInrMilli, { paise: true })}</p>
        {d.byComponent.length === 0 ? <p className="small muted">Nothing has been spent in this period. That is a measured zero from the usage lines.</p> :
          <><h3 className="dayhead">By part</h3><ul className="billing" aria-label="Spend by part">{d.byComponent.map((l, i) => <li key={i}><strong>{costPart(l.component ?? l.key ?? '', prettyCode)}</strong><span className="tnum">{inr(lineCost(l), { paise: true })}</span></li>)}</ul></>}
        {(d.byCampaign ?? []).some(l => lineCost(l) > 0) && <><h3 className="dayhead">By campaign</h3><ul className="billing" aria-label="Spend by campaign">{(d.byCampaign ?? []).filter(l => lineCost(l) > 0).map((l, i) => <li key={i}><strong>{l.campaignId ? <Link to={`/campaigns/${l.campaignId}`}>{l.key}</Link> : 'Tests and other spend'}</strong><span className="tnum">{inr(lineCost(l), { paise: true })}</span></li>)}</ul></>}
        <p className="small muted">{d.note}</p>
        {an.data?.text && <p className="small muted" aria-label="How calls are analysed"><strong>Call analysis.</strong> {an.data.text}</p>}</>}</Async></Card>
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
        <Async q={q} what="Safety rules" tool="safety.cases">{d => <><ul className="billing">{byRule(d.rules.reply).map(r => <li key={r.rule}><div><strong>{RULE_LABEL[r.rule] ?? ruleWords(r.reason)}</strong><span className="small muted"> · a reply that breaks it is {r.action === 'block' ? 'blocked' : r.action === 'replace' ? 'replaced' : 'stopped'} before it is said</span></div><Chip tone="leaf">Always on</Chip></li>)}</ul><p className="small muted">Rules last updated {(() => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(d.rules.version); return m ? new Date(m[1] + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'recently'; })()}. Also always on: DND and opt-out checks before every attempt, and the AI disclosure, spoken once and lightly.</p></>}</Async></Card>
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
      <Retention canSet={policy} />
      <Card><CardHead title="A person's data request" sub="Forget what is remembered, or erase the person: their details, transcripts and call recordings. The number stays suppressed so they are never called again by mistake." />
        {can(['owner', 'compliance']) ? <><div className="formgrid"><TextField label="Their phone number" inputMode="tel" value={e164} onChange={e => setE164(e.target.value)} placeholder="+91 …" />
          <SelectField label="What they asked for" value={scope} onChange={e => setScope(e.target.value)}><option value="forget_memory">Forget what is remembered</option><option value="erase_me">Erase me completely (details, transcripts and recordings)</option></SelectField>
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
  return <Async q={q} what="Assistant settings" tool="operator.settings.get">{d => <div className="stack">
    <Card><CardHead title="Assistant" sub="The assistant plans and does drafts and tests itself. Anything that reaches people, spends, deletes or changes policy always waits for your approval." />
      <Toggle checked={d.autonomy === 'A0'} onChange={async on => { const r = await act(on ? 'operator.autonomy.lower' : 'operator.autonomy.raise', { level: on ? 'A0' : 'A1' }, { describe: on ? 'The assistant will now ask before every draft and test.' : 'The assistant can draft and test on its own again.' }); if (r.ok) q.reload(); else refresh(); }}
        label="Ask before drafts and tests too" hint="Lowering this takes effect at once. Raising it back is a policy change and asks for approval." /></Card>
    <Card><CardHead title="Model" sub="The model behind the assistant. It changes speed and what each turn costs, never what is allowed." />
      <p>Current: {d.brain ? <strong>{prettyId(d.brain)}</strong> : <NotMeasured>Not chosen yet</NotMeasured>}</p>
      {d.brains.length === 0 ? <p className="small muted">No curated models are configured on this server yet.</p> : <><div className="formgrid" style={{ marginTop: 12 }}><SelectField label="Choose a model" value={pick} onChange={e => setPick(e.target.value)} hint="Nothing is recommended by default. Switching changes the cost of every assistant reply."><option value="">Choose one</option>{d.brains.map(b => <option key={b} value={b}>{prettyId(b)}</option>)}</SelectField></div>
        <div style={{ marginTop: 12 }}>{pick && pick !== d.brain ? <Btn kind="primary" onClick={async () => { const r = await act('operator.brain.set', { brain: pick }, { describe: 'Model changed.' }); if (r.ok) q.reload(); }}>Ask to switch…</Btn> : <Btn disabled reason={pick ? 'That brain is already in use.' : 'Choose a model first.'}>Ask to switch</Btn>}</div></>}</Card></div>}</Async>;
}


function dayLabel(iso: string): string {
  const d = new Date(iso); const ist = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = ist(new Date()), y = ist(new Date(Date.now() - 86400000));
  return ist(d) === today ? 'Today' : ist(d) === y ? 'Yesterday' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
/** Brand and offering changes keep a version, so they can be put back. The server decides what is allowed (a newer change must be undone first). */
function Undoable() {
  const { act } = useApp();
  const q = useData('revisions', () => run<{ revisions: { id: string; objectType: string; summary: string; undoneAt: string | null; createdAt: string }[] }>('revision.list', { limit: 30 }));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  return <Card><CardHead title="Changes you can undo" sub="Brand and offering changes keep their earlier version. Undoing puts it back and is recorded here." />
    <Async q={q} what="Changes you can undo" tool="revision.list" empty={d => d.revisions.filter(r => !r.undoneAt && ['brand', 'offering'].includes(r.objectType)).length === 0 ? <Empty title="Nothing to undo" body="Changes to your brand and offerings appear here." /> : null}>{d => <>
      <ul className="billing">{d.revisions.filter(r => !r.undoneAt && ['brand', 'offering'].includes(r.objectType)).map(r => <li key={r.id}><div><span className="tnum muted">{date(r.createdAt, true)}</span> &nbsp;{r.summary}</div>
        <Btn size="sm" busy={busy === r.id} onClick={async () => { setBusy(r.id); setNote(null); const x = await act<{ undone: string }>('action.undo', { revisionId: r.id }, { quiet: true }); setBusy(null); setNote(x.ok ? { ok: true, text: `Undone: ${x.result?.undone ?? r.summary}` } : { ok: false, text: x.reason ?? 'That change could not be undone.' }); if (x.ok) { q.reload(); } }}>Undo</Btn></li>)}</ul>
      {note && <p className={note.ok ? 'small' : 'hint hint-bad'} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}</>}</Async></Card>;
}
function Activity() {
  const q = useData<ActivityRow[]>('activity', activityList);
  return <div className="stack"><Undoable /><Card><CardHead title="What was done" sub="Every draft, test and approved action, with who did it." />
    <Async q={q} what="Activity" tool="activity.list" empty={d => d.length === 0 ? <Empty title="Nothing yet" body="Everything that changes something is written here." /> : null}>{d => {
      const groups: [string, ActivityRow[]][] = [];
      for (const r of d) { const k = dayLabel(r.at); const g = groups[groups.length - 1]; if (g && g[0] === k) g[1].push(r); else groups.push([k, [r]]); }
      return <div className="stack">{groups.map(([day, rows]) => <section key={day} aria-label={day}><h3 className="dayhead">{day}</h3>
        <ul className="billing">{foldRepeats(rows, r => activitySentence(r.line, r.action, r.subject, r.tool)).map(({ row: r, n }) => { const to = pageFor(r.action); return <li key={r.id}><div><span className="tnum muted">{time(r.at).replace(' IST', '')}</span> &nbsp;{activitySentence(r.line, r.action, r.subject, r.tool)}{n > 1 && <span className="muted"> ({n} times)</span>}</div>{to && <Link to={to} className="small">Open</Link>}</li>; })}</ul></section>)}</div>;
    }}</Async></Card></div>;
}
export { count, Lock };

/** rules.json lists each pattern; a person sees one row per rule, in rule order, with 'mixed' when its patterns differ in action. */
const byRule = (reply: Rules['rules']['reply']) => {
  const m = new Map<string, { rule: string; reason: string; action: string }>();
  for (const r of reply) {
    const g = m.get(r.rule);
    if (!g) m.set(r.rule, { rule: r.rule, reason: r.reason, action: r.action });
    else if (g.action !== r.action) g.action = 'mixed';
  }
  return [...m.values()].sort((a, b) => Number(a.rule.replace(/\D/g, '')) - Number(b.rule.replace(/\D/g, '')));
};
const ruleWords = (r: string) => { const t = r.replace(/\s*\(allow-list:[^)]*\)/, '. She may only mention her own nature to say she is an AI').replace(/neverSay/g, 'never-say list').replace(/([a-z])([A-Z])/g, '$1 $2'); return t.charAt(0).toUpperCase() + t.slice(1); };

const walletNote = (x: string) => /^no money available/i.test(x) ? 'There is no money to spend. New attempts wait; calls already live always finish.' : x.charAt(0).toUpperCase() + x.slice(1);

// How long each kind of data is kept (policy.retention.*). Recordings are deleted on the voice server too when their time is
// up. Changing it is a policy change, so it asks for approval and needs a reason.
const RETENTION: [string, string][] = [['recordings_days', 'Call recordings'], ['transcripts_days', 'Transcripts'], ['upload_files_days', 'Uploaded list files'], ['receipt_issues_days', 'Import problem rows'], ['audit_logs_days', 'Activity log']];
const KEPT: Record<string, string> = { consent: 'consent records', suppression: 'do-not-call records', tombstones: 'erasure records', aggregates: 'counts with no personal data' };
function Retention({ canSet }: { canSet: boolean }) {
  const { act } = useApp();
  const q = useData('retention', () => run<{ version: number; policy: Record<string, number>; alwaysKept: string[] }>('policy.retention.get', {}));
  const [edit, setEdit] = useState<Record<string, string>>({}); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Card aria-labelledby="ret-h"><CardHead id="ret-h" title="How long data is kept" sub="After this many days the data is deleted, recordings included. Shorter is safer; keep what disputes and audits need." />
      <Async q={q} what="Retention" tool="policy.retention.get">{d => {
        const changed = Object.fromEntries(RETENTION.filter(([k]) => edit[k] !== undefined && Number(edit[k]) !== d.policy[k]).map(([k]) => [k, Number(edit[k])]));
        const bad = Object.values(changed).some(n => !Number.isInteger(n) || n < 1 || n > 3650);
        return <>
          {canSet ? <div className="formgrid">{RETENTION.map(([k, l]) => <TextField key={k} label={`${l} (days)`} type="number" inputMode="numeric" min={1} max={3650} value={edit[k] ?? String(d.policy[k] ?? '')} onChange={e => setEdit(x => ({ ...x, [k]: e.target.value }))} />)}</div>
            : <dl className="kv">{RETENTION.map(([k, l]) => <div key={k}><dt>{l}</dt><dd className="tnum">{d.policy[k] != null ? `${count(d.policy[k])} days` : '—'}</dd></div>)}</dl>}
          <p className="small muted" style={{ marginTop: 8 }}>Always kept: {d.alwaysKept.map(x => KEPT[x] ?? x.replace(/_/g, ' ')).join(', ')}. They hold no call content and stop a person from being called again by mistake.</p>
          {canSet && Object.keys(changed).length > 0 && <div className="stack-s" style={{ marginTop: 12 }}>
            <TextField label="Why the change" value={reason} onChange={e => setReason(e.target.value)} hint="Recorded with the new policy, for example: counsel advised 30 days for recordings." />
            <div>{bad ? <Btn disabled reason="Each value is a whole number of days, from 1 to 3,650.">Ask to change</Btn> : reason.trim().length < 5 ? <Btn disabled reason="Say why, in a few words.">Ask to change</Btn>
              : <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await act('policy.retention.set', { ...changed, reason: reason.trim() }, { describe: 'Retention changed.' }); setBusy(false); if (r.ok) { setEdit({}); setReason(''); q.reload(); } }}>Ask to change</Btn>}</div></div>}
          {!canSet && <p className="small muted">Only an owner or the compliance lead can change these.</p>}
        </>;
      }}</Async></Card>
  );
}
