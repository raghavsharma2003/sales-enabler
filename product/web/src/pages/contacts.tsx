// Contacts: people with consent, DND and attempt history; audiences; and the import wizard with per-row verdicts.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Upload } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link, useNav, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, PageHead, SelectField, Skeleton, Table, Tabs, TextArea, TextField, type Col } from '../ui.tsx';
import { langShort } from '../catalog.ts';
import { agentNames, audienceList, contactGet, contactList, importMap, importUpload, importUploadFile, isExcel, MAX_IMPORT_BYTES } from '../data.ts';
import { ImportReview } from './import-review.tsx';
import { bytes as fmtBytes, count, date, phone as fmtPhone, plural } from '../format.ts';
import { BulkDnd, DndButton, DndExplain, ExportButton, StopCard, SuppressionNote } from './contact-actions.tsx';
const REASON: Record<string, string> = { dnd_unknown: 'Do Not Disturb has not been checked yet', dnd_registered: 'The person is on the Do Not Disturb list', suppressed: 'The person asked not to be called', no_consent: 'No consent is on file', no_basis: 'There is no basis on file to call this person', tombstoned: 'The person asked to be erased' };
const reasonText = (r: string) => REASON[r] ?? prettyCode(r).replace(/^Dnd/, 'Do Not Disturb');
const zoneName = (z: string) => (z === 'Asia/Kolkata' ? 'India time (IST)' : z.split('/').pop()!.replace(/_/g, ' '));
const isoDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null);
import type { AudienceRow, ContactRow, ImportPreview } from '../types.ts';

const dndChip = (d: string) => <Chip tone={d === 'clear' ? 'leaf' : d === 'registered' || d === 'listed' ? 'brick' : 'neutral'}>{d === 'clear' ? 'DND clear' : d === 'registered' || d === 'listed' ? 'On the DND list' : 'DND not checked'}</Chip>;
export const OUTCOME_LABEL: Record<string, string> = {};
export const prettyCode = (s: string | null | undefined) => (s ? s.replace(/^(PRE|DIAL|CONN|END|CONV)_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : '');

export default function Contacts({ id, tab }: { id?: string; tab?: string }) {
  const go = useNav();
  if (id) return <ContactPage id={id} />;
  const t = (tab ?? 'people') as 'people' | 'audiences' | 'import';
  return (
    <div className="page">
      <PageHead title="Contacts" sub="People you may call, with consent, DND and what happened on every attempt." actions={t !== 'import' && <Link to="/contacts/import" className="btn btn-primary" style={{ textDecoration: 'none' }}><Upload size={16} aria-hidden /><span>Import a list</span></Link>} />
      <Tabs label="Contacts sections" value={t} onChange={v => go(v === 'people' ? '/contacts' : v === 'audiences' ? '/audiences' : '/contacts/import')} items={[{ id: 'people', label: 'People' }, { id: 'audiences', label: 'Audiences' }, { id: 'import', label: 'Import' }]} />
      {t === 'people' && <People />}{t === 'audiences' && <Audiences />}{t === 'import' && <Import />}
    </div>
  );
}

function People() {
  const { me } = useApp();
  const [qs, setQs] = useQuery();
  const [text, setText] = useState(qs.get('q') ?? '');
  const supp = qs.get('suppressed') === '1';
  useEffect(() => { const h = setTimeout(() => setQs({ q: text || null }), 300); return () => clearTimeout(h); }, [text]); // eslint-disable-line
  const q = useData(['people', qs.get('q'), supp], () => contactList({ q: qs.get('q') ?? '', suppressed: supp || undefined }));
  // Lists run to thousands: the next 50 are fetched on request and added below, never a dead end of "narrow the search".
  const [more, setMore] = useState<{ rows: ContactRow[]; next: string | null; for: unknown } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const extra = more && more.for === q.data ? more : null;
  const loadMore = async () => {
    const after = extra ? extra.next : q.data?.next; if (!after) return;
    setLoadingMore(true);
    try { const r = await contactList({ suppressed: supp || undefined, after }); setMore({ rows: [...(extra?.rows ?? []), ...r.rows], next: r.next ?? null, for: q.data }); } finally { setLoadingMore(false); }
  };
  const cols: Col<ContactRow>[] = [
    { key: 'n', label: 'Name', primary: true, render: c => c.name }, { key: 'p', label: 'Phone', render: c => <span className="tnum">{fmtPhone(c.phone)}</span> },
    { key: 'l', label: 'Language', hideMobile: true, render: c => langShort(c.language) },
    { key: 'd', label: 'DND', render: c => dndChip(c.dnd) }, { key: 's', label: 'Calling', render: c => c.suppressed ? <Chip tone="brick">Suppressed</Chip> : <Chip tone="leaf">Allowed</Chip> },
  ];
  return (
    <Card>
      <div className="filters">
        <TextField label="Search" type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Name, or part of a number" />
        <SelectField label="Show" value={supp ? '1' : ''} onChange={e => setQs({ suppressed: e.target.value || null })}><option value="">Everyone</option><option value="1">Only people we must not call</option></SelectField>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}><ExportButton me={me} /></div>
      <Async q={q} what="Contacts" tool="contact.list" empty={d => d.rows.length === 0 ? <Empty title={qs.get('q') || supp ? 'No one matches' : 'No contacts yet'} body={qs.get('q') || supp ? 'Try a shorter search or clear the filter.' : 'Import a CSV or Excel export. You see a verdict for every row before anything is saved.'} action={<Link to="/contacts/import">Import a list</Link>} /> : null}>
        {d => <><BulkDnd ids={[...d.rows, ...(extra?.rows ?? [])].map(r => r.id)} allUnchecked={d.rows.length > 0 && [...d.rows, ...(extra?.rows ?? [])].every(r => r.dnd !== 'clear' && r.dnd !== 'registered' && r.dnd !== 'listed')} onDone={q.reload} /><p className="small muted" style={{ marginBottom: 8 }}>{count(d.rows.length + (extra?.rows.length ?? 0))} shown{(extra ? extra.next : d.more) ? ', and more.' : ''}</p><Table caption="Contacts" cols={cols} rows={[...d.rows, ...(extra?.rows ?? [])]} rowKey={r => r.id} onRow={r => `/contacts/${r.id}`} />{(extra ? extra.next : d.more && !qs.get('q')) && <div style={{ marginTop: 12 }}><Btn busy={loadingMore} onClick={() => void loadMore()}>Show the next 50</Btn></div>}</>}
      </Async>
    </Card>
  );
}

const OPS: [string, string][] = [['eq', 'is'], ['neq', 'is not'], ['gt', 'is more than'], ['lt', 'is less than'], ['contains', 'contains'], ['exists', 'is filled in'], ['missing', 'is empty']];
function Audiences() {
  const { act, refresh } = useApp();
  const q = useData<AudienceRow[]>('audiences', audienceList);
  const [name, setName] = useState(''); const [rows, setRows] = useState([{ key: '', op: 'eq', value: '' }]);
  const valid = rows.filter(r => r.key.trim());
  const reason = !name.trim() ? 'Give the audience a name first.' : valid.length === 0 ? 'Add at least one condition, for example city is Pune.' : '';
  return (
    <div className="stack">
      <Async q={q} what="Audiences" tool="audience.list" empty={d => d.length === 0 ? <Card><Empty title="No audiences yet" body="Importing a list makes one. You can also save a group by a condition below." /></Card> : null}>
        {d => <ul className="agentgrid">{d.map(a => <li key={a.id} className="agentcard"><h3 className="serif" style={{ fontSize: '1.125rem' }}>{a.name}</h3>
          <p><strong className="tnum">{a.callable == null ? '—' : count(a.callable)}</strong> callable of <span className="tnum">{a.matched == null ? '—' : count(a.matched)}</span></p>
          <p className="small muted">{a.suppressed ? `${count(a.suppressed)} suppressed and never called. ` : ''}{a.dndUnknown ? `${count(a.dndUnknown)} not checked against DND yet; that only blocks promotional calls.` : ''}</p></li>)}</ul>}
      </Async>
      <Card><CardHead title="New audience" sub="A saved condition over details from your lists. It is re-read each time, and reaches no one until a campaign uses it." />
        <TextField label="Name" value={name} onChange={e => setName(e.target.value)} />
        <div className="stack-s" style={{ marginTop: 12 }}>{rows.map((r, i) => (
          <div className="formgrid3" key={i}>
            <TextField label={i === 0 ? 'Detail' : `Also, detail ${i + 1}`} value={r.key} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/\s+/g, '_').toLowerCase() } : x)))} placeholder="city" />
            <SelectField label="Condition" value={r.op} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
            <TextField label="Value" value={r.value} disabled={r.op === 'exists' || r.op === 'missing'} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          </div>))}
          {rows.length < 4 && <div><Btn size="sm" onClick={() => setRows([...rows, { key: '', op: 'eq', value: '' }])}>Add a condition</Btn></div>}</div>
        <div style={{ marginTop: 16 }}>{reason ? <Btn disabled reason={reason}>Save audience</Btn> : <Btn kind="primary" onClick={async () => {
          const all = valid.map(r => ({ key: r.key, op: r.op, ...(r.op === 'exists' || r.op === 'missing' ? {} : { value: /^-?\d+(\.\d+)?$/.test(r.value) ? Number(r.value) : r.value }) }));
          const r = await act('audience.create', { name, filter: { all } }, { describe: 'Audience saved.' }); if (r.ok) { setName(''); setRows([{ key: '', op: 'eq', value: '' }]); refresh(); } }}>Save audience</Btn>}</div></Card>
    </div>
  );
}

// ---------- import wizard ----------
const SAMPLE = `Name,Mobile,Language,City,Next review,Reference
Sunita Verma,90000 00011,Hindi,Pune,12/01/2027,A-10231
Imran Qureshi,+91 9000000012,Hinglish,Lucknow,14/01/2027,A-10232
Lakshmi Iyer,9000000013,Tamil,Chennai,18/01/2027,A-10233
Gurpreet Singh,9.0E+11,Punjabi,Jaipur,20/01/2027,A-10234
Anita Deshmukh,90000 0014,Marathi,Nagpur,25/01/2027,A-10235
Rohan Mehta,+91 90000 00011,Hinglish,Indore,27/01/2027,A-10236
Farah Sheikh,,Hinglish,Kochi,01/02/2027,A-10237
Vikram Rao,9000000015,Telugu,Patna,03/02/2027,A-10238
`;

// The CRM import is its own chunk: only people who import from a CRM download it.
const CrmImport = lazy(() => import('./import-crm.tsx'));
const SOURCES = [{ id: 'file', label: 'From a file' }, { id: 'hubspot', label: 'From HubSpot' }, { id: 'zoho_crm', label: 'From Zoho CRM' }] as const;
type ImportFrom = (typeof SOURCES)[number]['id'];

function Import() {
  const [qs, setQs] = useQuery();
  const from = (SOURCES.some(x => x.id === qs.get('from')) ? qs.get('from') : 'file') as ImportFrom;
  return (
    <div className="stack">
      <Tabs label="Where the list comes from" value={from} onChange={v => setQs({ from: v === 'file' ? null : v })} items={SOURCES.map(x => ({ ...x }))} />
      {from === 'file' ? <FileImport /> : <Suspense fallback={<Card><Skeleton rows={3} /></Card>}><CrmImport kind={from} /></Suspense>}
    </div>
  );
}

function FileImport() {
  const { toast } = useApp(); const go = useNav();
  const [csv, setCsv] = useState('');
  const [picked, setPicked] = useState<File | null>(null);        // a chosen file sent as is (Excel, or text too big to show)
  const [srcText, setSrcText] = useState('');                     // the text the preview's samples come from
  const [agentId, setAgentId] = useState('');
  const agents = useData('import-agents', agentNames);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const check = async () => {
    setBusy(true);
    try {
      const up = picked ? await importUploadFile(picked) : { uploadId: await importUpload(csv, 'Pasted list'), text: csv };
      setSrcText(up.text); setPv(await importMap(up.uploadId, up.text, undefined, agentId || undefined));
    }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not read that file.', 'bad'); }
    setBusy(false);
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    if (file.current) file.current.value = '';
    if (f.size > MAX_IMPORT_BYTES) { toast(`That file is ${fmtBytes(f.size)}. Files can be up to 20 MB; split it into smaller files.`, 'bad'); return; }
    if (/\.xls$/i.test(f.name)) { toast('That is an old Excel file (.xls). Save it as .xlsx or CSV, then choose it again.', 'bad'); return; }
    setPv(null);
    if (isExcel(f) || f.size > 400_000) { setPicked(f); setCsv(''); } else { setPicked(null); setCsv(await f.text()); }
  };
  return (
    <div className="stack">
      <Card><CardHead title="1. Bring the list" sub="Choose a file (Excel .xlsx, CSV or TSV, up to 20 MB) or paste the text. Nothing is saved as contacts until step 4." />
        {picked ? <div className="filepick" role="status"><p><strong>{picked.name}</strong> <span className="muted tnum">· {fmtBytes(picked.size)}{isExcel(picked) ? ' · Excel, read on our server (first sheet; formulas use their saved values)' : ''}</span></p>
          <Btn size="sm" kind="ghost" onClick={() => { setPicked(null); setPv(null); }}>Choose another</Btn></div>
          : <TextArea label="Your list" value={csv} onChange={e => { setCsv(e.target.value); setPv(null); }} rows={6} placeholder="Name,Mobile,City&#10;Sunita Verma,90000 00011,Pune" className="field-mono" hint="Use made-up data or your own customers' data only. Do not paste OTPs, card numbers or passwords." />}
        <div className="formgrid" style={{ marginTop: 12 }}>
          <Async q={agents} what="Agents" tool="agent.list" rows={1}>{list => (
            <SelectField label="Which agent will call them? (optional)" value={agentId} onChange={e => { setAgentId(e.target.value); setPv(null); }}
              hint="We check the list has every detail she says from each person's record, before anything is saved.">
              <option value="">Decide later</option>{list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>)}</Async>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input ref={file} type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr" aria-label="Choose a file: Excel, CSV or TSV" onChange={e => void onFile(e.target.files?.[0])} />
          <Btn icon={<Upload size={16} aria-hidden />} onClick={() => file.current?.click()}>Choose a file</Btn>
          <Btn kind="ghost" onClick={() => { setPicked(null); setCsv(SAMPLE); setPv(null); }}>Use a made-up sample</Btn>
          {picked || csv.trim() ? <Btn kind="primary" busy={busy} onClick={() => void check()}>Check the file</Btn> : <Btn disabled reason="Choose a file or paste a list first.">Check the file</Btn>}
        </div></Card>
      {pv && <ImportReview pv={pv} setPv={setPv} srcText={srcText} agentId={agentId} onSaved={() => go('/audiences')} />}
    </div>
  );
}

// ---------- one person ----------
function ContactPage({ id }: { id: string }) {
  const { act, refresh, me } = useApp();
  const q = useData(['contact', id], () => contactGet(id));
  return (
    <div className="page"><Async q={q} what="This contact" tool="contact.get" rows={5}>{c => (
      <>
        <PageHead crumb={<><Link to="/contacts">Contacts</Link><span aria-hidden>/</span><span>{c.name}</span></>} title={c.name} sub={<span className="tnum">{fmtPhone(c.phone)} · {langShort(c.language)} · {zoneName(c.timezone)}</span>} actions={<>{dndChip(c.dnd.status)}</>} />
        <SuppressionNote suppressions={c.suppressions} me={me} onDone={q.reload} reasonText={r => reasonText(r).replace(/_/g, ' ')} />
        <div className="cols-main">
          <div className="stack">
            <Card><CardHead title="Can she call?" />
              <dl className="kv"><div><dt>Service calls</dt><dd><Chip tone={c.service.allowed ? 'leaf' : 'brick'}>{c.service.allowed ? 'Allowed' : 'Not allowed'}</Chip> {c.service.reasons.length > 0 && <span className="small muted">{c.service.reasons.map(reasonText).join('. ')}</span>}</dd></div>
                <div><dt>Promotional calls</dt><dd><Chip tone={c.promotional.allowed ? 'leaf' : 'brick'}>{c.promotional.allowed ? 'Allowed' : 'Not allowed'}</Chip> {c.promotional.reasons.length > 0 && <span className="small muted">{c.promotional.reasons.map(reasonText).join('. ')}</span>}</dd></div></dl></Card>
            <Card><CardHead title="Memory" sub="Only what they said, with the exact words. Approve to let the next call use it." />
              {!c.memory ? <p className="muted">Memory is not switched on in this server yet.</p> : c.memory.optedOut ? <p className="muted">This person opted out of memory. Nothing is kept.</p>
                : c.memory.facts.length === 0 ? <Empty title="Nothing remembered yet" body="After a real call, anything useful they said shows here for you to approve. Practice calls never write memory." />
                : <ul className="facts">{c.memory.facts.map(f => (
                  <li key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{f.key.replace(/_/g, ' ')}: {f.value}</strong><Chip tone={f.usable ? 'leaf' : 'marigold'}>{f.usable ? 'In use' : f.status === 'active' ? 'Waiting' : f.status}</Chip></div>
                    {f.quote && <blockquote lang="hi">“{f.quote}”</blockquote>}
                    <div className="row">{f.conversationId && <Link to={`/calls/${f.conversationId}`} className="btn btn-sm" style={{ textDecoration: 'none' }}><Play size={13} aria-hidden /><span>Open the call</span></Link>}
                      {!f.usable && <Btn size="sm" onClick={async () => { const r = await act('fact.approve', { factId: f.id }, { describe: 'Approved.' }); if (r.ok) refresh(); }}>Approve</Btn>}
                      <Btn size="sm" kind="danger" onClick={async () => { const r = await act('fact.forget', { factId: f.id }, { describe: 'Forgotten.' }); if (r.ok) refresh(); }}>Forget…</Btn></div></li>))}</ul>}
            </Card>
            <Card><CardHead title="Attempts" />{c.attempts.length === 0 ? <Empty title="Not called yet" body="Each attempt shows what happened, or why it was held back." /> :
              <ul className="facts">{c.attempts.map(a => <li key={a.id}><div className="row" style={{ justifyContent: 'space-between' }}><Chip>{prettyCode(a.status)}</Chip><span className="small muted">{date(a.dialed_at ?? a.created_at, true)}</span></div>{a.callback_text && <p className="small" data-testid="callback-text">{a.callback_text}</p>}{(a.precheck?.explain?.message ?? (a.blocked_by ? `Held back: ${prettyCode(a.blocked_by)}` : null)) && <p className="small">{a.precheck?.explain?.message ?? `Held back: ${prettyCode(a.blocked_by)}`}{a.precheck?.explain?.why ? <span className="muted"> {a.precheck.explain.why}</span> : null}</p>}{a.conversation_id && <Link to={`/calls/${a.conversation_id}`} className="small">Open the call</Link>}</li>)}</ul>}</Card>
          </div>
          <div className="stack">
            <Card><CardHead title="Consent" />{c.consent.length === 0 ? <p className="muted">No consent is recorded for this person. Service and transactional calls to existing customers do not need one; promotional calls do.</p> :
              <ul className="facts">{c.consent.map(k => <li key={k.id}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{CONSENT_FOR[k.purpose] ?? prettyCode(k.purpose)}</strong><Chip tone={k.granted ? 'leaf' : 'brick'}>{k.granted ? 'Granted' : 'Withdrawn'}</Chip></div><p className="small muted">{CONSENT_BASIS[k.basis] ?? prettyCode(k.basis)} · {k.channel === 'voice' ? 'phone calls' : prettyCode(k.channel).toLowerCase()} · {date(k.created_at)}</p></li>)}</ul>}</Card>
            <Card><CardHead title="Do Not Disturb" /><Kv rows={dndRows(c.dnd)} /><DndExplain checkedAt={c.dnd.checkedAt} status={c.dnd.status} /><DndButton contactId={c.id} onDone={q.reload} /></Card>
            <StopCard contactId={c.id} me={me} onDone={q.reload} />
            <Card><CardHead title="Details from your lists" /><Kv rows={c.attributes.filter(a => a.key !== 'name').map(a => [detailLabel(a.key), <span key={a.key}>{a.key === 'language' ? langShort(String(a.value)) : isoDay(a.value) ?? String(a.value)}{a.stale && <span className="muted"> · stale</span>}</span>] as [string, React.ReactNode])} /></Card>
          </div>
        </div>
      </>)}</Async></div>
  );
}

/** The DND rows say only what is true: "recent enough" is about an answer, so a number the register never answered gets no such line. */
function dndRows(d: { status: string; checkedAt: string | null; fresh?: boolean }): [string, React.ReactNode][] {
  if (d.status === 'unknown') return [['Status', dndChip(d.status)], [d.checkedAt ? 'Last tried' : 'Last checked', d.checkedAt ? date(d.checkedAt, true) : 'Not yet'], ['Answer', d.checkedAt ? 'The register gave no answer' : 'Never looked up']];
  return [['Status', dndChip(d.status)], ['Last checked', d.checkedAt ? date(d.checkedAt, true) : 'Not yet'], ['Check', d.fresh ? 'Recent enough for promotional calls' : 'Needs a fresh check before promotional calls']];
}
/** A list column as a label: "emi_amount" and "emi amount" both read "Emi amount"; a column already written by a person stays as it is. */
const detailLabel = (key: string) => { const t = key.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

const CONSENT_FOR: Record<string, string> = { all: 'All calls', service: 'Service calls', transactional: 'Transactional calls', promotional: 'Promotional calls' };
const CONSENT_BASIS: Record<string, string> = { withdrawal: 'Asked to stop', opt_out: 'Asked to stop', express: 'Said yes', written: 'Agreed in writing', verbal: 'Agreed on a call', existing_customer: 'Existing customer' };
