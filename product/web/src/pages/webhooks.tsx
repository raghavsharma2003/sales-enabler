// Settings > Webhooks: send results out of Vyakti to your own systems. Create a webhook (a policy change, so it asks for
// approval; the signing secret is shown once), send a made-up test event, see every delivery and how the receiver answered,
// and send one again. Records are built when they are sent, so an erasure or retention since the event is respected.
import { useState } from 'react';
import { RotateCcw, Send } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData, type ToolData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Locked, SelectField, Table, TextField, Toggle, type Col } from '../ui.tsx';
import { RevealSheet } from '../reveal.tsx';
import { date } from '../format.ts';

interface Hook { id: string; url: string; description: string | null; events: string[]; createdAt: string; contactNumber: 'masked' | 'full'; authIntegration: { id: string; name: string; connected: boolean } | null; lastStatus: string | null }
interface Delivery { id: string; endpointId: string; event: string; status: 'pending' | 'delivered' | 'failed'; attempts: number; responseStatus: number | null; error: string | null; replayOf: string | null; test: boolean; createdAt: string; deliveredAt: string | null; nextAttemptAt: string | null }
interface Integration { id: string; kind: string; name: string; status: string; config: { base_url?: string } }

// The event names, labels and descriptions come from the server (webhook.events), so the page and the API never disagree.
interface EventDef { event: string; schema: string; label: string; description: string }
const eventsText = (ev: string[], defs: EventDef[]) => ev.includes('*') ? 'All events' : ev.map(e => defs.find(d => d.event === e)?.label ?? e).join(', ');
const labelOf = (e: string, defs: EventDef[]) => defs.find(d => d.event === e)?.label ?? e;
const host = (u: string) => { try { const x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname); } catch { return u; } };
const STATUS: Record<Delivery['status'], [string, 'leaf' | 'marigold' | 'brick']> = { delivered: ['Delivered', 'leaf'], pending: ['Waiting to send', 'marigold'], failed: ['Failed', 'brick'] };

export default function Webhooks() {
  const defs = useData<EventDef[]>('webhook-events', async () => (await run<{ events: EventDef[] }>('webhook.events', {})).events);
  const hooks = useData<Hook[]>('webhooks', async () => (await run<{ webhooks: Hook[] }>('webhook.list', {})).webhooks);
  const [filter, setFilter] = useState<'' | Delivery['status']>('');
  const deliveries = useData<Delivery[]>(['webhook-deliveries', filter], async () => (await run<{ deliveries: Delivery[] }>('webhook.deliveries', { ...(filter ? { status: filter } : {}), limit: 50 })).deliveries);
  const reload = () => { hooks.reload(); deliveries.reload(); };
  return (
    <div className="stack">
      <HookList q={hooks} defs={defs.data ?? []} onChanged={reload} />
      {defs.data && <NewHook defs={defs.data} onMade={reload} />}
      <Card><CardHead title="Deliveries" sub="Every event sent, newest first. A receiver that does not answer with a 2xx status is tried again 5 times, waiting longer each time."
        actions={<SelectField label="Show" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="">All deliveries</option><option value="pending">Waiting to send</option><option value="delivered">Delivered</option><option value="failed">Failed</option></SelectField>} />
        <Async q={deliveries} what="Deliveries" tool="webhook.deliveries" empty={d => d.length === 0 ? <Empty title="Nothing sent yet" body="Deliveries appear here as events happen. Send a test event to check a receiver now." /> : null}>
          {d => <DeliveryTable rows={d} hooks={hooks.data ?? []} defs={defs.data ?? []} onReplayed={deliveries.reload} />}</Async>
      </Card>
      <Card><CardHead title="Checking a delivery is from Vyakti" />
        <p className="small muted">Each request carries <code>x-vp-signature: t=&lt;unix ms&gt;,v1=&lt;hex&gt;</code>. Compute HMAC-SHA256 of <code>t + "." + raw body</code> with the webhook's signing secret and compare it with <code>v1</code>; refuse a time more than five minutes old. The event name is in <code>x-vp-event</code>, the delivery id in <code>x-vp-delivery</code>, and test events carry <code>x-vp-test: 1</code>. Every record names its schema, for example <code>vyakti.call.v1</code>.</p>
      </Card>
    </div>
  );
}

function HookList({ q, defs, onChanged }: { q: ToolData<Hook[]>; defs: EventDef[]; onChanged: () => void }) {
  const { act, can, toast } = useApp();
  const [testing, setTesting] = useState<string | null>(null);
  const tester = can(['owner', 'builder', 'operator']), remover = can(['owner', 'operator', 'compliance']);
  const sendTest = async (h: Hook) => {
    setTesting(h.id);
    const r = await act<{ status: string; responseStatus: number | null; error: string | null }>('webhook.test', { id: h.id }, { quiet: true });
    setTesting(null);
    if (!r.ok) return;
    if (r.result.status === 'delivered') toast(`Test event delivered. The receiver answered ${r.result.responseStatus}.`, 'ok');
    else toast(`The test event was not delivered: ${r.result.error ?? 'no answer'}.`, 'bad');
    onChanged();
  };
  const cols: Col<Hook>[] = [
    { key: 'u', label: 'Address', primary: true, render: h => <><span style={{ overflowWrap: 'anywhere' }}>{host(h.url)}</span>{h.description && <><br /><span className="small muted">{h.description}</span></>}</> },
    { key: 'e', label: 'Sends', render: h => eventsText(h.events, defs) },
    { key: 'n', label: 'Phone numbers', render: h => h.contactNumber === 'full' ? <Chip tone="marigold">Full</Chip> : <Chip>Masked</Chip> },
    { key: 'a', label: 'Signs in with', render: h => h.authIntegration ? <>{h.authIntegration.name}{!h.authIntegration.connected && <> <Chip tone="brick">Disconnected</Chip></>}</> : <span className="muted">Signature only</span> },
    { key: 's', label: 'Last delivery', render: h => h.lastStatus ? <Chip tone={STATUS[h.lastStatus as Delivery['status']]?.[1] ?? 'neutral'}>{STATUS[h.lastStatus as Delivery['status']]?.[0] ?? h.lastStatus}</Chip> : <span className="muted">None yet</span> },
    { key: 'x', label: '', render: h => <div className="row" style={{ gap: 8, flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
      {tester ? <Btn size="sm" icon={<Send size={14} aria-hidden />} busy={testing === h.id} aria-label={`Send a test event to ${host(h.url)}`} onClick={() => void sendTest(h)}>Send test event</Btn> : <Btn size="sm" disabled reason="An owner, builder or operator can send a test event.">Send test event</Btn>}
      {remover ? <Btn size="sm" kind="danger" aria-label={`Delete the webhook to ${host(h.url)}`} onClick={async () => { const r = await act('webhook.delete', { id: h.id }, { describe: 'Webhook deleted. Events waiting for it were dropped.' }); if (r.ok) onChanged(); }}>Delete…</Btn> : <Btn size="sm" disabled reason="An owner, operator or compliance lead can delete a webhook.">Delete</Btn>}
    </div> },
  ];
  return (
    <Card><CardHead title="Webhooks" sub="Vyakti sends a signed record to your address each time one of these events happens. Records are built when they are sent, so anything removed since (an erasure, the transcripts retention) is not in them." />
      <Async q={q} what="Webhooks" tool="webhook.list" empty={d => d.length === 0 ? <Empty title="No webhooks yet" body="Add one below to send call results to your CRM, data warehouse or your own service." /> : null}>
        {d => <Table caption="Webhooks" cols={cols} rows={d} rowKey={r => r.id} />}</Async>
    </Card>
  );
}

function NewHook({ defs, onMade }: { defs: EventDef[]; onMade: () => void }) {
  const { act, can, toast } = useApp();
  const [url, setUrl] = useState(''); const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>(defs.slice(0, 1).map(d => d.event)); const [full, setFull] = useState(false); const [auth, setAuth] = useState('');
  const [busy, setBusy] = useState(false); const [secret, setSecret] = useState<string | null>(null);
  const integrations = useData<Integration[]>('webhook-auth-integrations', async () => (await run<{ integrations: Integration[] }>('integration.list', {})).integrations.filter(i => i.kind === 'custom_http' && i.status === 'connected'));
  if (!can(['owner', 'builder', 'operator', 'compliance'])) return <Card><CardHead title="New webhook" actions={<Locked role="owner">Adding a webhook needs an owner, builder, operator or compliance lead</Locked>} /></Card>;
  const all = picked.length === defs.length;
  const okUrl = /^https:\/\/[^\s/]+/i.test(url.trim());
  const reason = !url.trim() ? 'Enter the address to send events to.' : !okUrl ? 'The address must start with https://.' : picked.length === 0 ? 'Choose at least one event.' : '';
  const create = async () => {
    setBusy(true);
    const r = await act<{ revealId?: string }>('webhook.create', { url: url.trim(), events: all ? ['*'] : picked, ...(description.trim() ? { description: description.trim() } : {}),
      contactNumber: full ? 'full' : 'masked', ...(auth ? { authIntegrationId: auth } : {}) }, { quiet: true });
    setBusy(false);
    if (!r.ok) return;
    setUrl(''); setDescription(''); setAuth(''); setFull(false); setPicked(defs.slice(0, 1).map(d => d.event)); onMade();
    if (r.result.revealId) { try { setSecret((await run<{ signingSecret: string }>('secret.reveal', { revealId: r.result.revealId })).signingSecret); } catch (e) { toast(e instanceof Error ? e.message : 'Could not show the signing secret.', 'bad'); } }
  };
  return (
    <Card><CardHead title="New webhook" sub="Adding a webhook is a policy change: an owner or compliance lead approves it. Its signing secret is shown once, to whoever approves it." />
      <div className="formgrid">
        <TextField label="Address" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://crm.example.com/vyakti" hint="A public https address. Private network addresses are refused." />
        <TextField label="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Data warehouse" />
      </div>
      <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
        <legend className="callout-l">Events to send</legend>
        {defs.map(e => <Toggle key={e.event} checked={picked.includes(e.event)} onChange={v => setPicked(v ? [...picked, e.event] : picked.filter(x => x !== e.event))} label={e.label} hint={e.description} />)}
      </fieldset>
      <div className="formgrid" style={{ marginTop: 16 }}>
        <div><Toggle checked={full} onChange={setFull} label="Send full phone numbers and names" hint="Off: numbers are masked (+91•••••1234) and names are initials. Personal data leaves Vyakti when this is on." /></div>
        <SelectField label="Sign in to the receiver with" value={auth} onChange={e => setAuth(e.target.value)}
          hint={integrations.data?.length ? 'The bearer token of a connected custom HTTP integration, sent as Authorization. The address must be on its base address.' : 'Connect "Your own HTTP service" under Integrations to send a bearer token as well.'}>
          <option value="">The signature only</option>{(integrations.data ?? []).map(i => <option key={i.id} value={i.id}>{i.name}{i.config?.base_url ? ` (${host(i.config.base_url)})` : ''}</option>)}
        </SelectField>
      </div>
      <div className="row" style={{ marginTop: 16 }}>{reason ? <Btn disabled reason={reason}>Ask to add</Btn> : <Btn kind="primary" busy={busy} onClick={() => void create()}>Ask to add</Btn>}</div>
      {secret && <RevealSheet title="Copy the signing secret now" secret={secret} onClose={() => setSecret(null)} extra={<p className="small muted">Use it to check the x-vp-signature header on every request from Vyakti.</p>} />}
    </Card>
  );
}

function DeliveryTable({ rows, hooks, defs, onReplayed }: { rows: Delivery[]; hooks: Hook[]; defs: EventDef[]; onReplayed: () => void }) {
  const { act, can } = useApp();
  const sender = can(['owner', 'builder', 'operator']);
  const where = (id: string) => { const h = hooks.find(x => x.id === id); return h ? host(h.url) : 'A deleted webhook'; };
  const cols: Col<Delivery>[] = [
    { key: 'e', label: 'Event', primary: true, render: d => <>{labelOf(d.event, defs)}{d.test && <> <Chip>Test</Chip></>}{d.replayOf && <> <Chip tone="peacock">Sent again</Chip></>}<br /><span className="small muted">{where(d.endpointId)}</span></> },
    { key: 's', label: 'Status', render: d => <><Chip tone={STATUS[d.status][1]}>{STATUS[d.status][0]}</Chip><br /><span className="small muted">{d.attempts === 1 ? '1 try' : `${d.attempts} tries`}{d.status === 'pending' && d.nextAttemptAt ? `, next ${date(d.nextAttemptAt, true)}` : ''}</span></> },
    { key: 'r', label: 'Receiver answered', render: d => d.error ? <span className="small">{d.error}</span> : d.responseStatus ? String(d.responseStatus) : <span className="muted">Not yet</span> },
    { key: 't', label: 'When', render: d => <span style={{ whiteSpace: 'nowrap' }}>{date(d.createdAt, true)}</span> },
    { key: 'x', label: '', render: d => d.test ? null : sender
      ? <Btn className="nowrap" size="sm" icon={<RotateCcw size={14} aria-hidden />} aria-label={`Send this event again: ${labelOf(d.event, defs).toLowerCase()}`} onClick={async () => { const r = await act('webhook.replay', { deliveryId: d.id }, { describe: 'Queued to send again. It is built from what Vyakti holds now.' }); if (r.ok) onReplayed(); }}>Send again…</Btn>
      : <Btn size="sm" disabled reason="An owner, builder or operator can send an event again.">Send again</Btn> },
  ];
  return <Table caption="Webhook deliveries" cols={cols} rows={rows} rowKey={r => r.id} />;
}
