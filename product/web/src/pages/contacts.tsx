// Contacts: people with consent, DND and attempt history; audiences; and the import wizard with per-row verdicts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Upload } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link, useNav, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, PageHead, SelectField, Table, Tabs, TextArea, TextField, type Col } from '../ui.tsx';
import { langShort } from '../catalog.ts';
import { audienceList, contactGet, contactList, importMap, importUpload, overridesFrom } from '../data.ts';
import { count, date, phone as fmtPhone } from '../format.ts';
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
  const [qs, setQs] = useQuery();
  const [text, setText] = useState(qs.get('q') ?? '');
  const supp = qs.get('suppressed') === '1';
  useEffect(() => { const h = setTimeout(() => setQs({ q: text || null }), 300); return () => clearTimeout(h); }, [text]); // eslint-disable-line
  const q = useData(['people', qs.get('q'), supp], () => contactList({ q: qs.get('q') ?? '', suppressed: supp || undefined }));
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
      <Async q={q} what="Contacts" tool="contact.list" empty={d => d.rows.length === 0 ? <Empty title={qs.get('q') || supp ? 'No one matches' : 'No contacts yet'} body={qs.get('q') || supp ? 'Try a shorter search or clear the filter.' : 'Import a CSV or Excel export. You see a verdict for every row before anything is saved.'} action={<Link to="/contacts/import">Import a list</Link>} /> : null}>
        {d => <><p className="small muted" style={{ marginBottom: 8 }}>{count(d.rows.length)} shown{d.more ? ', more not shown. Narrow the search.' : ''}</p><Table caption="Contacts" cols={cols} rows={d.rows} rowKey={r => r.id} onRow={r => `/contacts/${r.id}`} /></>}
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
const SAMPLE = `Name,Mobile,Language,City,Due date,Premium
Sunita Verma,90000 00011,Hindi,Pune,03/11/2025,12450
Imran Qureshi,+91 9000000012,Hinglish,Lucknow,05/11/2025,9800
Lakshmi Iyer,9000000013,Tamil,Chennai,07/11/2025,15200
Gurpreet Singh,9.0E+11,Punjabi,Jaipur,09/11/2025,7600
Anita Deshmukh,90000 0014,Marathi,Nagpur,11/11/2025,11000
Rohan Mehta,+91 90000 00011,Hinglish,Indore,12/11/2025,8800
Farah Sheikh,,Hinglish,Kochi,14/11/2025,6400
Vikram Rao,९००००००००१५,Telugu,Patna,15/11/2025,13300
`;
const FIELDS: [string, string][] = [['name', 'Name'], ['first_name', 'First name'], ['last_name', 'Last name'], ['phone', 'Phone (needed)'], ['language', 'Language'], ['timezone', 'Time zone'], ['consent', 'Consent (yes or no)'], ['consent_at', 'Consent date'], ['opt_out', 'Opted out (yes or no)'], ['attribute', 'Keep as a detail'], ['ignore', 'Ignore this column']];

function Import() {
  const { act, toast } = useApp(); const go = useNav();
  const [csv, setCsv] = useState('');
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState(''); const [aud, setAud] = useState('Imported list');
  const [filter, setFilter] = useState<'all' | 'problems'>('problems');
  const file = useRef<HTMLInputElement>(null);

  const check = async () => {
    setBusy(true);
    try { const id = await importUpload(csv, 'Pasted list'); setPv(await importMap(id, csv)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not read that file.', 'bad'); }
    setBusy(false);
  };
  const remap = async (header: string, field: string) => {
    if (!pv) return;
    const ov = overridesFrom(pv.columns);
    const col = pv.columns.find(c => c.header === header)!;
    ov[header] = { field, key: field === 'attribute' || field === 'ignore' ? col.key ?? header.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') : undefined };
    setBusy(true);
    try { setPv(await importMap(pv.uploadId, csv, ov)); } catch (e) { toast(e instanceof Error ? e.message : 'Could not apply that.', 'bad'); }
    setBusy(false);
  };
  const onFile = async (f?: File) => { if (!f) return; if (f.size > 900_000) { toast('That file is over 900 KB. Split it into smaller files for now.', 'bad'); return; } setCsv(await f.text()); setPv(null); };
  const rows = useMemo(() => (pv?.rows ?? []).filter(r => filter === 'all' || r.verdict !== 'ok'), [pv, filter]);
  const missingPhone = pv && !pv.columns.some(c => c.field === 'phone');
  const commit = async () => {
    const r = await act<{ counts: { new: number } }>('source.commit', { uploadId: pv!.uploadId, overrides: overridesFrom(pv!.columns), consentPurpose: purpose || undefined, audienceName: aud }, { describe: 'List imported.' });
    if (r.ok) go('/audiences');
  };
  const reasonOff = !pv ? 'Check the file first.' : missingPhone ? 'Match one column to the phone number.' : pv.counts.callable === 0 ? 'No row can be called yet.' : !aud.trim() ? 'Name the audience.' : '';
  const vcols: Col<ImportPreview['rows'][number]>[] = [
    { key: 'n', label: 'Row', num: true, render: r => r.row },
    { key: 'v', label: 'Verdict', primary: true, render: r => <Chip tone={r.verdict === 'ok' ? 'leaf' : r.verdict === 'review' ? 'marigold' : r.verdict === 'duplicate' ? 'peacock' : 'brick'}>{({ ok: 'Ready', duplicate: 'Duplicate', skipped: 'Skipped', suppressed: 'Suppressed', review: 'Needs a look' })[r.verdict]}</Chip> },
    { key: 'w', label: 'Who', render: r => r.name ?? '—' }, { key: 'p', label: 'Number saved as', render: r => r.phone ? <span className="tnum">{fmtPhone(r.phone)}</span> : <span className="muted">Not saved</span> },
    { key: 'r', label: 'Why', render: r => r.reason ?? <span className="muted">Nothing to fix</span> },
  ];
  return (
    <div className="stack">
      <Card><CardHead title="1. Bring the list" sub="Paste CSV text or choose a file. Excel: save as CSV first. Nothing is saved as contacts until step 4." />
        <TextArea label="Your list" value={csv} onChange={e => { setCsv(e.target.value); setPv(null); }} rows={6} placeholder="Name,Mobile,City&#10;Sunita Verma,90000 00011,Pune" className="field-mono" hint="Use made-up data or your own customers' data only. Do not paste OTPs, card numbers or passwords." />
        <div className="row" style={{ marginTop: 12 }}>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr" aria-label="Choose a CSV file" onChange={e => void onFile(e.target.files?.[0])} />
          <Btn icon={<Upload size={16} aria-hidden />} onClick={() => file.current?.click()}>Choose a file</Btn>
          <Btn kind="ghost" onClick={() => { setCsv(SAMPLE); setPv(null); }}>Use a made-up sample</Btn>
          {csv.trim() ? <Btn kind="primary" busy={busy} onClick={() => void check()}>Check the file</Btn> : <Btn disabled reason="Paste or choose a list first.">Check the file</Btn>}
        </div></Card>
      {pv && <>
        <Card><CardHead title="2. Match the columns" sub="We guessed from the headings. Change any that is wrong; the verdicts update." />
          <div className="mapgrid">{pv.columns.map(c => (
            <div key={c.header} className="mapcol"><SelectField label={c.header} value={c.field.startsWith('attribute:') ? 'attribute' : c.field} onChange={e => void remap(c.header, e.target.value)} hint={<span lang="hi">{c.sample.filter(Boolean).slice(0, 2).join(' · ') || 'empty'}{c.why === 'default' ? ' · kept as a detail by default' : ''}</span>}>
              {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>))}</div>
          {missingPhone && <p className="hint hint-bad">No column is matched to Phone, so no row can be called.</p>}
        </Card>
        <Card><CardHead title="3. What will happen to each row" />
          <div className="receipt" role="status">
            <div><b className="tnum serif">{count(pv.counts.in)}</b><span>rows in</span></div><div><b className="tnum serif">{count(pv.counts.callable)}</b><span>callable numbers</span></div>
            <div><b className="tnum serif">{count(pv.counts.duplicate)}</b><span>duplicates</span></div><div><b className="tnum serif">{count(pv.counts.skipped)}</b><span>skipped</span></div>
          </div>
          {pv.questions.map((q, i) => <div className="qcard" key={i}><p><strong>{q.text}</strong></p></div>)}
          <div className="row" style={{ margin: '12px 0' }}><Tabs label="Rows to show" value={filter} onChange={setFilter} items={[{ id: 'problems', label: 'Needs a look', count: pv.rows.filter(r => r.verdict !== 'ok').length }, { id: 'all', label: 'All rows', count: pv.rows.length }]} /></div>
          {rows.length ? <Table caption="Per-row verdicts" cols={vcols} rows={rows} rowKey={r => String(r.row)} /> : <Empty title="Every row is ready" icon={<Check size={26} aria-hidden />} body="Nothing needs fixing. Switch to All rows to see them." />}
        </Card>
        <Card><CardHead title="4. Save" sub="Saves contacts and an audience. It does not call anyone." />
          <div className="formgrid"><SelectField label="Record that these people agreed to be called for" value={purpose} onChange={e => setPurpose(e.target.value)} hint="Only choose one if it is true. It is written on every contact and decides which calls are allowed. Leave it if unsure."><option value="">Do not record any consent</option><option value="service">Service calls (about their own account)</option><option value="transactional">Transactional calls (orders, appointments)</option><option value="promotional">Promotional calls</option></SelectField>
            <TextField label="Audience name" value={aud} onChange={e => setAud(e.target.value)} /></div>
          <div style={{ marginTop: 16 }}>{reasonOff ? <Btn disabled reason={reasonOff}>Save contacts</Btn> : <Btn kind="primary" onClick={commit}>Save {count(pv.counts.callable)} contacts</Btn>}</div></Card>
      </>}
    </div>
  );
}

// ---------- one person ----------
function ContactPage({ id }: { id: string }) {
  const { act, refresh } = useApp();
  const q = useData(['contact', id], () => contactGet(id));
  return (
    <div className="page"><Async q={q} what="This contact" tool="contact.get" rows={5}>{c => (
      <>
        <PageHead crumb={<><Link to="/contacts">Contacts</Link><span aria-hidden>/</span><span>{c.name}</span></>} title={c.name} sub={<span className="tnum">{fmtPhone(c.phone)} · {langShort(c.language)} · {c.timezone}</span>} actions={<>{dndChip(c.dnd.status)}</>} />
        {c.suppressions.length > 0 && <p className="state state-failed" role="note" style={{ marginBottom: 16 }}>She will not call this number. Reason: {c.suppressions.map(s => s.reason.replace(/_/g, ' ')).join(', ')}.</p>}
        <div className="cols-main">
          <div className="stack">
            <Card><CardHead title="Can she call?" />
              <dl className="kv"><div><dt>Service calls</dt><dd><Chip tone={c.service.allowed ? 'leaf' : 'brick'}>{c.service.allowed ? 'Allowed' : 'Not allowed'}</Chip> {c.service.reasons.length > 0 && <span className="small muted">{c.service.reasons.map(prettyCode).join(', ')}</span>}</dd></div>
                <div><dt>Promotional calls</dt><dd><Chip tone={c.promotional.allowed ? 'leaf' : 'brick'}>{c.promotional.allowed ? 'Allowed' : 'Not allowed'}</Chip> {c.promotional.reasons.length > 0 && <span className="small muted">{c.promotional.reasons.map(prettyCode).join(', ')}</span>}</dd></div></dl></Card>
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
              <ul className="facts">{c.attempts.map(a => <li key={a.id}><div className="row" style={{ justifyContent: 'space-between' }}><Chip>{prettyCode(a.status)}</Chip><span className="small muted">{date(a.dialed_at ?? a.created_at, true)}</span></div>{a.blocked_by && <p className="small">Held back: {prettyCode(a.blocked_by)}</p>}{a.conversation_id && <Link to={`/calls/${a.conversation_id}`} className="small">Open the call</Link>}</li>)}</ul>}</Card>
          </div>
          <div className="stack">
            <Card><CardHead title="Consent" />{c.consent.length === 0 ? <p className="muted">No consent is recorded for this person. Service and transactional calls to existing customers do not need one; promotional calls do.</p> :
              <ul className="facts">{c.consent.map(k => <li key={k.id}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{k.purpose}</strong><Chip tone={k.granted ? 'leaf' : 'brick'}>{k.granted ? 'Granted' : 'Withdrawn'}</Chip></div><p className="small muted">{k.basis.replace(/_/g, ' ')} · {k.channel} · {date(k.created_at)}</p></li>)}</ul>}</Card>
            <Card><CardHead title="Do Not Disturb" /><Kv rows={[['Status', dndChip(c.dnd.status)], ['Last checked', c.dnd.checkedAt ? date(c.dnd.checkedAt, true) : 'Not yet'], ['Fresh', c.dnd.fresh ? 'Yes' : 'No']]} /></Card>
            <Card><CardHead title="Details from your lists" /><Kv rows={c.attributes.filter(a => a.key !== 'name').map(a => [a.key.replace(/_/g, ' '), <span key={a.key}>{String(a.value)}{a.stale && <span className="muted"> · stale</span>}</span>] as [string, React.ReactNode])} /></Card>
          </div>
        </div>
      </>)}</Async></div>
  );
}
