// Settings → Channels: WhatsApp beside calls. The number (connected from the WhatsApp Cloud API integration, its token
// and app secret in the vault), the agent that answers it, the readiness rail (webhook handshake, templates waiting for
// Meta's review with how long they have waited), the templates themselves, and the follow-ups sent after calls.
// Every change is one tool; anything that reaches people (connecting, choosing the agent, submitting a template, a
// follow-up rule) waits for approval.
import { useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, SelectField, Segmented, Sheet, Table, TextArea, TextField, type Col } from '../ui.tsx';
import { agentNames, campaignList } from '../data.ts';
import { count, dur, inr } from '../format.ts';
import { CopyBtn } from '../reveal.tsx';

interface Conn { id: string; name: string; displayNumber: string | null; status: 'active' | 'paused'; agentId: string | null; webhookPath: string; webhookVerifiedAt: string | null;
  last7Days: { sent: number; received: number; blocked: number; costInrMilli: number } }
interface Ready { kind: string; ok: boolean; title: string; detail: string; waitingS: number | null; overdue: boolean; fix: string | null }
interface Tpl { id: string; name: string; language: string; category: 'utility' | 'marketing'; body: string; status: string; rejectReason: string | null;
  variables: { n: number; source: string; words: string; sample: string }[]; waitingForReviewS: number | null; priceInrMilli: number; problems: string[]; submittedAt: string | null }
interface Rule { id: string; name: string; templateName: string; templateStatus: string; when: string; enabled: boolean; dailyLimit: number; last24h: { sent: number; blocked: number; skipped: number } }

const STATUS: Record<string, [string, 'leaf' | 'marigold' | 'brick' | 'neutral']> = {
  draft: ['Draft', 'neutral'], submitted: ['In review with Meta', 'marigold'], approved: ['Approved', 'leaf'], rejected: ['Rejected', 'brick'], paused: ['Paused by Meta', 'brick'], disabled: ['Disabled by Meta', 'brick'],
};
// Where a value comes from. Keys use "__" for the server's "." (contact__first_name is contact.first_name), so the
// UI contract does not read them as tool names.
const SOURCES: { value: string; label: string }[] = [
  { value: 'contact__first_name', label: "The person's first name" }, { value: 'contact__name', label: "The person's full name" },
  { value: 'call__callback_time', label: 'The callback time the caller asked for' }, { value: 'brand__name', label: 'Your brand name' }, { value: 'attr', label: 'A field on their record' },
];
const toServer = (k: string) => k.replace('__', '.');
const fromServer = (s: string) => s.replace('.', '__');
const TRIGGERS: { value: string; label: string }[] = [
  { value: 'outcome', label: 'The call ended with an outcome' }, { value: 'reason_code', label: 'The call ended with a reason' },
  { value: 'asked_whatsapp', label: 'The caller asked for it on WhatsApp' }, { value: 'not_answered', label: 'A campaign call was not answered' },
];
const placeholders = (body: string) => [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1])))].sort((a, b) => a - b);

export default function Channels() {
  const q = useData('channels', async () => ({
    conns: (await run<{ connections: Conn[] }>('channel.list', {})).connections,
    ready: await run<{ ready: boolean; items: Ready[] }>('channel.readiness', {}),
    templates: (await run<{ templates: Tpl[] }>('message_template.list', {})).templates,
    rules: (await run<{ rules: Rule[] }>('followthrough.rule.list', {})).rules,
  }));
  return <Async q={q} what="Channels" tool="channel.list">{d => <div className="stack">
    <Numbers conns={d.conns} onChange={q.reload} />
    <Readiness ready={d.ready} />
    <Templates templates={d.templates} hasNumber={d.conns.length > 0} onChange={q.reload} />
    <FollowUps rules={d.rules} templates={d.templates} onChange={q.reload} />
  </div>}</Async>;
}

function Numbers({ conns, onChange }: { conns: Conn[]; onChange: () => void }) {
  const { act } = useApp();
  const ints = useData('channels-integrations', async () => (await run<{ integrations: { id: string; kind: string; name: string; status: string }[] }>('integration.list', {}))
    .integrations.filter(i => i.kind === 'whatsapp_cloud' && i.status === 'connected'));
  const [shown, setShown] = useState<{ webhookPath: string; verifyToken: string } | null>(null);
  const connect = async (integrationId: string) => {
    const r = await act<{ webhookPath: string; verifyToken: string }>('channel.connect', { integrationId }, { quiet: true });
    if (r.ok && r.result) { setShown(r.result); onChange(); }
  };
  const unconnected = (ints.data ?? []).length > conns.length;
  return <Card><CardHead title="WhatsApp numbers" sub="Follow-ups after calls and answers to people who write in go out from these numbers, through the same consent, safety check and wallet as calls." />
    {conns.length === 0
      ? <Empty icon={<MessageSquare size={20} aria-hidden />} title="No WhatsApp number connected"
          body={<>Add the WhatsApp Cloud API credentials (token, app secret, phone number ID and business account ID) under <Link to="/settings/integrations">Integrations</Link>, then connect the number here.</>} />
      : <ul className="billing">{conns.map(c => <li key={c.id}><div>
          <strong>{c.name}</strong> {c.displayNumber && <span className="muted">{c.displayNumber}</span>}{' '}
          <Chip tone={c.status === 'active' ? 'leaf' : 'marigold'}>{c.status === 'active' ? 'Active' : 'Paused'}</Chip>{' '}
          <Chip tone={c.webhookVerifiedAt ? 'leaf' : 'marigold'}>{c.webhookVerifiedAt ? 'Webhook confirmed' : 'Waiting for Meta to confirm the webhook'}</Chip>
          <br /><span className="small muted" style={{ overflowWrap: 'anywhere' }}>Last 7 days: {count(c.last7Days.sent)} sent, {count(c.last7Days.received)} received, {count(c.last7Days.blocked)} stopped by a check, {inr(c.last7Days.costInrMilli, { paise: true })}</span>
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {c.status === 'active'
              ? <Btn size="sm" onClick={async () => { const r = await act('channel.pause', { connectionId: c.id }, { describe: 'Paused. Nothing is sent from this number.' }); if (r.ok) onChange(); }}>Pause sending</Btn>
              : <Btn size="sm" onClick={async () => { const r = await act('channel.resume', { connectionId: c.id }, { describe: 'Resumed.' }); if (r.ok) onChange(); }}>Resume sending</Btn>}
          </div>
          <p className="small" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>Webhook address: <code style={{ wordBreak: 'break-all' }}>{location.origin + c.webhookPath}</code> <CopyBtn size="sm" text={location.origin + c.webhookPath} what="webhook address" /></p>
        </div></li>)}</ul>}
    {unconnected && <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>{(ints.data ?? []).map(i =>
      <Btn key={i.id} size="sm" kind="primary" onClick={() => void connect(i.id)}>Connect the number in {i.name}</Btn>)}</div>}
    {shown && <Sheet title="Finish in Meta's app dashboard" onClose={() => setShown(null)}>
      <p className="muted">In the app's WhatsApp configuration, set the callback address and the verify token below, then subscribe to messages and template status updates. The verify token is shown only now.</p>
      <p><strong>Callback address</strong><br /><code className="secret">{location.origin + shown.webhookPath}</code></p>
      <p><strong>Verify token</strong><br /><code className="secret">{shown.verifyToken}</code></p>
      <div className="row"><CopyBtn text={shown.verifyToken} what="verify token" /><Btn kind="primary" onClick={() => setShown(null)}>I have set it</Btn></div>
    </Sheet>}
  </Card>;
}

function Readiness({ ready }: { ready: { ready: boolean; items: Ready[] } }) {
  return <Card><CardHead title="Before WhatsApp can send" sub={ready.ready ? 'Everything is ready.' : 'What is still waiting, and for how long.'} />
    <ul className="billing">{ready.items.map((i, n) => <li key={n}><div>
      <Chip tone={i.ok ? 'leaf' : i.overdue ? 'brick' : 'marigold'}>{i.ok ? 'Ready' : i.overdue ? 'Overdue' : 'Waiting'}</Chip> <strong>{i.title}</strong>
      {i.waitingS != null && <span className="muted"> · waiting {dur(i.waitingS)}</span>}
      <br /><span className="small muted">{i.detail}{i.fix && <> <Link to={i.fix}>Fix it</Link></>}</span>
    </div></li>)}</ul></Card>;
}

function Templates({ templates, hasNumber, onChange }: { templates: Tpl[]; hasNumber: boolean; onChange: () => void }) {
  const { act } = useApp();
  const [edit, setEdit] = useState<Tpl | 'new' | null>(null);
  const cols: Col<Tpl>[] = [
    { key: 'n', label: 'Template', primary: true, render: t => <><strong>{t.name}</strong> <span className="muted">{t.language}</span><br /><span className="small muted">{t.body.length > 90 ? t.body.slice(0, 87) + '…' : t.body}</span></> },
    { key: 'c', label: 'Category', render: t => <Chip>{t.category === 'utility' ? 'Utility' : 'Marketing'}</Chip> },
    { key: 's', label: 'Review', render: t => <><Chip tone={STATUS[t.status]?.[1] ?? 'neutral'}>{STATUS[t.status]?.[0] ?? t.status}</Chip>
      {t.waitingForReviewS != null && <><br /><span className="small muted">waiting {dur(t.waitingForReviewS)}</span></>}
      {t.rejectReason && <><br /><span className="small muted">{t.rejectReason.replace(/_/g, ' ').toLowerCase()}</span></>}</> },
    { key: 'p', label: 'Per message', num: true, render: t => inr(t.priceInrMilli, { paise: true }) },
    { key: 'a', label: '', render: t => <div className="row" style={{ gap: 8 }}>
      {(t.status === 'draft' || t.status === 'rejected') && <Btn size="sm" onClick={() => setEdit(t)}>Edit</Btn>}
      {(t.status === 'draft' || t.status === 'rejected') && (t.problems.length
        ? <Btn size="sm" disabled fix={null} reason={t.problems[0]}>Submit for review</Btn>
        : <Btn size="sm" kind="primary" onClick={async () => { const r = await act('message_template.submit', { templateId: t.id }, { describe: 'Sent to Meta for review.' }); if (r.ok) onChange(); }}>Submit for review</Btn>)}
    </div> },
  ];
  return <Card><CardHead title="Message templates" sub="Business-initiated messages must use a template Meta approved. Utility templates (a summary, a link, a callback time) cost about ₹0.12; marketing about ₹0.86 and only reaches people who opted in to marketing."
    actions={<div className="row" style={{ gap: 8 }}>
      <Btn size="sm" onClick={async () => { const r = await act<{ checked: number; changed: number }>('message_template.sync', {}, { quiet: true }); if (r.ok) onChange(); }}>Check reviews</Btn>
      {hasNumber ? <Btn size="sm" kind="primary" onClick={() => setEdit('new')}>New template</Btn> : <Btn size="sm" disabled fix={null} reason="Connect a WhatsApp number first.">New template</Btn>}</div>} />
    {templates.length === 0 ? <Empty title="No templates yet" body="Draft one, submit it, and it can be sent after a call once Meta approves it." />
      : <Table caption="Message templates" cols={cols} rows={templates} rowKey={t => t.id} />}
    {edit && <TemplateForm t={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChange(); }} />}
  </Card>;
}

function TemplateForm({ t, onClose, onDone }: { t: Tpl | null; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const [name, setName] = useState(t?.name ?? '');
  const [category, setCategory] = useState<'utility' | 'marketing'>(t?.category ?? 'utility');
  const [language, setLanguage] = useState(t?.language ?? 'en');
  const [body, setBody] = useState(t?.body ?? '');
  const [vars, setVars] = useState<Record<number, { source: string; field: string; sample: string }>>(() =>
    Object.fromEntries((t?.variables ?? []).map(v => [v.n, { source: v.source.startsWith('attr:') ? 'attr' : fromServer(v.source), field: v.source.startsWith('attr:') ? v.source.slice(5) : '', sample: v.sample }])));
  const [problems, setProblems] = useState<string[]>(t?.problems ?? []);
  const [busy, setBusy] = useState(false);
  const ph = useMemo(() => placeholders(body), [body]);
  const variables = ph.map(n => { const v = vars[n] ?? { source: 'contact__first_name', field: '', sample: '' }; return { source: v.source === 'attr' ? 'attr:' + v.field.trim() : toServer(v.source), sample: v.sample.trim() }; });
  const reason = !/^[a-z0-9_]{1,512}$/.test(name) ? 'Name it with lower-case letters, digits and underscores, like visit_reminder.' : !body.trim() ? 'Write the message.'
    : variables.some(v => !v.sample) ? 'Give every value a sample for Meta\'s reviewer.' : variables.some(v => v.source === 'attr:') ? 'Name the field each value comes from.' : '';
  const save = async () => {
    setBusy(true);
    const r = await act<{ problems: string[] }>('message_template.draft', { ...(t ? { id: t.id } : {}), name, category, language, body, variables }, { quiet: true });
    setBusy(false);
    if (r.ok) { if (r.result.problems.length) setProblems(r.result.problems); else onDone(); }
  };
  return <Sheet title={t ? `Edit ${t.name}` : 'New message template'} onClose={onClose} wide>
    <p className="muted">Write {'{{1}}'}, {'{{2}}'} where a value goes. Each value is filled from the person's record when it is sent, never typed per message.</p>
    <div className="formgrid">
      <TextField label="Name" value={name} onChange={e => setName(e.target.value.toLowerCase())} hint="Lower-case letters, digits and underscores." data-autofocus />
      <SelectField label="Language" value={language} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="en_US">English (US)</option></SelectField>
      <div className="span2"><Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'utility' as const, label: 'Utility', hint: 'About something they asked for or agreed to' }, { value: 'marketing' as const, label: 'Marketing', hint: 'Offers; only to people who opted in to marketing' }]} /></div>
      <TextArea className="span2" label="Message" rows={4} value={body} onChange={e => setBody(e.target.value)} maxLength={1024} />
      {ph.map(n => { const v = vars[n] ?? { source: 'contact__first_name', field: '', sample: '' }; const set = (p: Partial<typeof v>) => setVars({ ...vars, [n]: { ...v, ...p } });
        return <div key={n} className="span2 row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SelectField label={`Value {{${n}}} comes from`} value={v.source} onChange={e => set({ source: e.target.value })}>{SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</SelectField>
          {v.source === 'attr' && <TextField label="Field name" value={v.field} onChange={e => set({ field: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} hint="As in the import, like visit_time." />}
          <TextField label="Sample for Meta" value={v.sample} onChange={e => set({ sample: e.target.value })} />
        </div>; })}
    </div>
    {problems.length > 0 && <div role="alert" className="small" style={{ marginTop: 12 }}><strong>Before it can be submitted:</strong><ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>
      {reason ? <Btn disabled fix={null} reason={reason}>Save draft</Btn> : <Btn kind="primary" busy={busy} onClick={() => void save()}>Save draft</Btn>}</div>
  </Sheet>;
}

function FollowUps({ rules, templates, onChange }: { rules: Rule[]; templates: Tpl[]; onChange: () => void }) {
  const { act } = useApp();
  const [open, setOpen] = useState(false);
  const usable = templates.filter(t => t.status === 'approved' && t.category === 'utility');
  return <Card><CardHead title="Follow-ups after calls" sub="Send an approved utility template after a call, only to people who opted in on WhatsApp (asking for it on the call counts). Each rule is approved once; every message still passes every check."
    actions={usable.length ? <Btn size="sm" kind="primary" onClick={() => setOpen(true)}>New follow-up</Btn> : <Btn size="sm" disabled fix={null} reason="An approved utility template is needed first.">New follow-up</Btn>} />
    {rules.length === 0 ? <Empty title="No follow-ups yet" body="For example: when a call ends with a booking, send the booking summary." />
      : <ul className="billing">{rules.map(r => <li key={r.id}><div>
          <strong>{r.name}</strong> <Chip tone={r.enabled && r.templateStatus === 'approved' ? 'leaf' : 'marigold'}>{!r.enabled ? 'Off' : r.templateStatus === 'approved' ? 'On' : 'Waiting for its template'}</Chip>
          <br /><span className="small muted">When a call {r.when}, send “{r.templateName}”. At most {count(r.dailyLimit)} a day. Last 24 hours: {count(r.last24h.sent)} sent, {count(r.last24h.blocked)} stopped by a check, {count(r.last24h.skipped)} skipped.</span></div>
        {r.enabled && <Btn size="sm" onClick={async () => { const x = await act('followthrough.rule.disable', { ruleId: r.id }, { describe: 'Turned off.' }); if (x.ok) onChange(); }}>Turn off</Btn>}</li>)}</ul>}
    {open && <RuleForm templates={usable} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChange(); }} />}
  </Card>;
}

function RuleForm({ templates, onClose, onDone }: { templates: Tpl[]; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const agents = useData('channels-agents', agentNames);
  const campaigns = useData('channels-campaigns', campaignList);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [trigger, setTrigger] = useState('outcome');
  const [value, setValue] = useState('');
  const [agentId, setAgentId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [limit, setLimit] = useState('200');
  const [busy, setBusy] = useState(false);
  const needsValue = trigger === 'outcome' || trigger === 'reason_code';
  const reason = name.trim().length < 2 ? 'Name the follow-up.' : !templateId ? 'Choose a template.' : needsValue && !value.trim() ? 'Say which outcome or reason it waits for.'
    : trigger === 'not_answered' && !campaignId ? 'An unanswered-call follow-up belongs to a campaign: choose one.' : !(Number(limit) >= 1) ? 'Set a daily limit of at least 1.' : '';
  const save = async () => {
    setBusy(true);
    const r = await act('followthrough.rule.set', { name: name.trim(), templateId, trigger, ...(needsValue ? { value: value.trim() } : {}), ...(agentId ? { agentId } : {}),
      ...(campaignId ? { campaignId } : {}), dailyLimit: Math.round(Number(limit)) }, { describe: 'The follow-up is on.' });
    setBusy(false);
    if (r.ok) onDone();
  };
  return <Sheet title="New follow-up after calls" onClose={onClose} wide>
    <div className="formgrid">
      <TextField label="Name" value={name} onChange={e => setName(e.target.value)} hint="Like: After a booking." data-autofocus />
      <SelectField label="Template" value={templateId} onChange={e => setTemplateId(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField>
      <SelectField label="Send when" value={trigger} onChange={e => setTrigger(e.target.value)}>{TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</SelectField>
      {needsValue && <TextField label={trigger === 'outcome' ? 'Outcome value' : 'Reason code'} value={value} onChange={e => setValue(e.target.value)} hint={trigger === 'outcome' ? 'As defined under Outcomes and checks, like booked.' : 'Like CONV_CALLBACK.'} />}
      <SelectField label="Calls of which agent" value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">Any agent</option>{(agents.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>
      <SelectField label="In which campaign" value={campaignId} onChange={e => setCampaignId(e.target.value)}><option value="">Any campaign</option>{(campaigns.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
      <TextField label="At most this many a day" type="number" min={1} value={limit} onChange={e => setLimit(e.target.value)} />
    </div>
    <p className="small muted" style={{ marginTop: 12 }}>It sends only to people who opted in on WhatsApp, at most two business messages a person a day, inside your spend limits. You approve it once; the card shows the most it can spend a day.</p>
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>
      {reason ? <Btn disabled fix={null} reason={reason}>Turn it on</Btn> : <Btn kind="primary" busy={busy} onClick={() => void save()}>Turn it on</Btn>}</div>
  </Sheet>;
}
