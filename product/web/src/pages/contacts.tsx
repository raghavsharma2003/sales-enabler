// Contacts: people with consent, DND and attempt history; audiences; and the import wizard with per-row verdicts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Play, Upload } from 'lucide-react';
import * as api from '../api.ts';
import { useApp, useTool } from '../store.tsx';
import { Link, useNav, useQuery } from '../router.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Kv, PageHead, SelectField, Table, Tabs, TextArea, TextField, type Col } from '../ui.tsx';
import { LANG_LABEL } from '../catalog.ts';
import { clock, count, date, phone as fmtPhone } from '../format.ts';
import type { AudienceRow, ContactDoc, ContactRow, ImportPreview } from '../types.ts';

export const OUTCOME_LABEL: Record<string, string> = { renewal_confirmed: 'Renewal intent confirmed', callback_requested: 'Callback requested', not_interested: 'Not interested', no_answer: 'No answer', opted_out: 'Asked not to be called', handed_off: 'Handed to a person', carrier_failed: 'Carrier failed' };
const consentChip = (c: string) => <Chip tone={c === 'granted' ? 'leaf' : c === 'revoked' ? 'brick' : 'marigold'}>{c === 'granted' ? 'Consent on file' : c === 'revoked' ? 'Opted out' : 'Consent not recorded'}</Chip>;
const dndChip = (d: string) => <Chip tone={d === 'clear' ? 'leaf' : d === 'listed' ? 'brick' : 'neutral'}>{d === 'clear' ? 'DND clear' : d === 'listed' ? 'On DND list' : 'DND not checked'}</Chip>;

export default function Contacts({ id, tab }: { id?: string; tab?: string }) {
  if (id) return <ContactPage id={id} />;
  const t = (tab ?? 'people') as 'people' | 'audiences' | 'import';
  const go = useNav();
  return (
    <div className="page">
      <PageHead title="Contacts" sub="People you may call, with consent, DND and what happened on every attempt." actions={t !== 'import' && <Link to="/contacts/import" className="btn btn-primary" style={{ textDecoration: 'none' }}><Upload size={16} aria-hidden /><span>Import a list</span></Link>} />
      <Tabs label="Contacts sections" value={t} onChange={v => go(v === 'people' ? '/contacts' : v === 'audiences' ? '/audiences' : '/contacts/import')} items={[{ id: 'people', label: 'People' }, { id: 'audiences', label: 'Audiences' }, { id: 'import', label: 'Import' }]} />
      {t === 'people' && <People />}
      {t === 'audiences' && <Audiences />}
      {t === 'import' && <Import />}
    </div>
  );
}

function People() {
  const [qs, setQs] = useQuery();
  const [text, setText] = useState(qs.get('q') ?? '');
  const consent = qs.get('consent') ?? '';
  useEffect(() => { const h = setTimeout(() => setQs({ q: text || null }), 300); return () => clearTimeout(h); }, [text]); // eslint-disable-line
  const q = useTool<{ rows: ContactRow[]; total: number }>('contact.list', { q: qs.get('q') ?? '', consent: consent || undefined });
  const cols: Col<ContactRow>[] = [
    { key: 'n', label: 'Name', primary: true, render: c => c.name },
    { key: 'p', label: 'Phone', render: c => <span className="tnum">{fmtPhone(c.phone)}</span> },
    { key: 'l', label: 'Language', hideMobile: true, render: c => LANG_LABEL[c.language]?.split(' ')[0] ?? c.language },
    { key: 'c', label: 'Consent', render: c => consentChip(c.consent) },
    { key: 'd', label: 'DND', render: c => dndChip(c.dnd) },
    { key: 'a', label: 'Attempts', num: true, render: c => c.attempts },
    { key: 'o', label: 'Last outcome', hideMobile: true, render: c => c.lastOutcome ? OUTCOME_LABEL[c.lastOutcome] ?? c.lastOutcome : <span className="muted">None yet</span> },
  ];
  return (
    <Card>
      <div className="filters">
        <TextField label="Search" type="search" value={text} onChange={e => setText(e.target.value)} placeholder="Name or phone" />
        <SelectField label="Consent" value={consent} onChange={e => setQs({ consent: e.target.value || null })}><option value="">Everyone</option><option value="granted">Consent on file</option><option value="unknown">Not recorded</option><option value="revoked">Opted out</option></SelectField>
      </div>
      <Async q={q} what="Contacts" tool="contact.list" empty={d => d.rows.length === 0 ? <Empty title={qs.get('q') || consent ? 'No one matches' : 'No contacts yet'} body={qs.get('q') || consent ? 'Try a shorter search or clear the filter.' : 'Import a CSV or Excel export. You see a verdict for every row before anything is saved.'} action={<Link to="/contacts/import">Import a list</Link>} /> : null}>
        {d => <><p className="small muted" style={{ marginBottom: 8 }}>{count(d.total)} {d.total === 1 ? 'person' : 'people'}{d.total > d.rows.length && ` · showing the first ${d.rows.length}`}</p><Table caption="Contacts" cols={cols} rows={d.rows} rowKey={r => r.id} onRow={r => `/contacts/${r.id}`} /></>}
      </Async>
    </Card>
  );
}

function Audiences() {
  const { act, refresh } = useApp();
  const q = useTool<{ rows: AudienceRow[] }>('audience.list', {});
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  return (
    <div className="stack">
      <Async q={q} what="Audiences" tool="audience.list" empty={d => d.rows.length === 0 ? <Card><Empty title="No audiences yet" body="An audience is a saved group of people, for example “renewal due in 30 days”." /></Card> : null}>
        {d => <ul className="agentgrid">{d.rows.map(a => <li key={a.id} className="agentcard"><h3 className="serif" style={{ fontSize: '1.125rem' }}>{a.name}</h3><p className="small muted">{a.description}</p>
          <p><strong className="tnum">{count(a.callable)}</strong> callable of <span className="tnum">{count(a.count)}</span></p><p className="small muted">The rest are skipped, each with a reason, before any call.</p></li>)}</ul>}
      </Async>
      <Card><CardHead title="New audience" sub="Saved as a draft group. It reaches no one until a campaign uses it." />
        <div className="formgrid"><TextField label="Name" value={name} onChange={e => setName(e.target.value)} /><TextField label="Who is in it" value={desc} onChange={e => setDesc(e.target.value)} hint="Plain words, for example: appointments in the next 7 days." /></div>
        <div style={{ marginTop: 16 }}>{name.trim() ? <Btn kind="primary" onClick={async () => { const r = await act('audience.create', { name, filter: desc }, { describe: 'Audience saved.' }); if (r.ok) { setName(''); setDesc(''); refresh(); } }}>Save audience</Btn> : <Btn disabled reason="Give the audience a name first.">Save audience</Btn>}</div></Card>
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
Vikram Rao,०९०००००००१५,Telugu,Patna,15/11/2025,13300
`;
const BASES = [['', 'Choose one'], ['existing_customer', 'Existing customer (service calls)'], ['transaction', 'Transaction or order they made'], ['explicit_consent', 'They gave consent to be called'], ['inquiry', 'They enquired with us']];

function Import() {
  const { act, toast } = useApp(); const go = useNav();
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState<Record<string, string | null> | undefined>();
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [basis, setBasis] = useState(''); const [aud, setAud] = useState('Imported list');
  const [filter, setFilter] = useState<'all' | 'problems'>('problems');
  const [dateOrder, setDateOrder] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const check = async (m?: Record<string, string | null>) => {
    setBusy(true);
    try { const r = await api.run<ImportPreview>('contact.import_preview', { csv, mapping: m }); setPv(r); setMapping(Object.fromEntries(r.columns.map(c => [c.name, c.field]))); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not read that file.', 'bad'); }
    setBusy(false);
  };
  const onFile = async (f?: File) => { if (!f) return; if (f.size > 900_000) { toast('That file is over 900 KB. Split it into smaller files for now.', 'bad'); return; } setCsv(await f.text()); setPv(null); };
  const rows = useMemo(() => (pv?.rows ?? []).filter(r => filter === 'all' || r.verdict !== 'ok'), [pv, filter]);
  const missingPhone = pv && !pv.columns.some(c => c.field === 'phone');
  const commit = async () => { const r = await act<{ audienceId: string }>('contact.import_commit', { csv, mapping, consentBasis: basis, audienceName: aud, dateOrder: dateOrder ?? pv?.question?.defaultAnswer }, { describe: 'List imported.' }); if (r.ok) go('/audiences'); };
  const reasonOff = !pv ? 'Check the file first.' : missingPhone ? 'Map a column to the phone number.' : !basis ? 'Say why you may call these people.' : pv.counts.callable === 0 ? 'No row can be called yet.' : '';
  const vcols: Col<ImportPreview['rows'][number]>[] = [
    { key: 'n', label: 'Row', num: true, render: r => r.n }, { key: 'v', label: 'Verdict', primary: true, render: r => <Chip tone={r.verdict === 'ok' ? 'leaf' : r.verdict === 'fixed' ? 'peacock' : r.verdict === 'review' ? 'marigold' : 'brick'}>{({ ok: 'Ready', fixed: 'Fixed', skipped: 'Skipped', suppressed: 'Suppressed', review: 'Needs a look' })[r.verdict]}</Chip> },
    { key: 'w', label: 'Who', render: r => Object.values(r.raw)[0] }, { key: 'p', label: 'Phone saved as', render: r => r.shown ? <span className="tnum">{fmtPhone(r.shown)}</span> : <span className="muted">Not saved</span> },
    { key: 'r', label: 'Why', hideMobile: false, render: r => r.reason ?? <span className="muted">Nothing to fix</span> },
  ];
  return (
    <div className="stack">
      <Card><CardHead title="1. Bring the list" sub="Paste CSV text or choose a file. Excel: save as CSV first. Nothing is saved until step 3." />
        <TextArea label="Your list" value={csv} onChange={e => { setCsv(e.target.value); setPv(null); }} rows={6} placeholder="Name,Mobile,City&#10;Sunita Verma,90000 00011,Pune" className="field-mono" hint="Use made-up or your own customers' data only. Do not paste OTPs, card numbers or passwords." />
        <div className="row" style={{ marginTop: 12 }}>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr" aria-label="Choose a CSV file" onChange={e => void onFile(e.target.files?.[0])} />
          <Btn icon={<Upload size={16} aria-hidden />} onClick={() => file.current?.click()}>Choose a file</Btn>
          <Btn kind="ghost" onClick={() => { setCsv(SAMPLE); setPv(null); }}>Use a made-up sample</Btn>
          {csv.trim() ? <Btn kind="primary" busy={busy} onClick={() => void check()}>Check the file</Btn> : <Btn disabled reason="Paste or choose a list first.">Check the file</Btn>}
        </div></Card>
      {pv && <>
        <Card><CardHead title="2. Match the columns" sub="We guessed from the headings. Change any that is wrong; the verdicts update." />
          <div className="mapgrid">{pv.columns.map(c => (
            <div key={c.name} className="mapcol"><SelectField label={c.name} value={mapping?.[c.name] ?? ''} onChange={e => { const m = { ...mapping, [c.name]: e.target.value || null }; setMapping(m); void check(m); }} hint={<span lang="hi">{c.sample.filter(Boolean).slice(0, 2).join(' · ') || 'empty'}{c.confidence < 0.5 && !c.field ? ' · not matched' : ''}</span>}>
              <option value="">Ignore this column</option>{pv.fields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? ' (needed)' : ''}</option>)}</SelectField></div>))}</div>
          {missingPhone && <p className="hint hint-bad">No column is matched to Phone, so no row can be called.</p>}
        </Card>
        <Card><CardHead title="3. What will happen to each row" />
          <div className="receipt" role="status">
            <div><b className="tnum serif">{count(pv.counts.in)}</b><span>rows in</span></div><div><b className="tnum serif">{count(pv.counts.callable)}</b><span>callable</span></div>
            <div><b className="tnum serif">{count(pv.counts.fixed)}</b><span>numbers fixed</span></div><div><b className="tnum serif">{count(pv.counts.skipped)}</b><span>skipped</span></div><div><b className="tnum serif">{count(pv.counts.suppressed)}</b><span>suppressed</span></div>
          </div>
          {pv.question && <div className="qcard"><p><strong>{pv.question.text}</strong></p><p className="small muted">I am assuming {dateOrder ?? pv.question.defaultAnswer}. Change it if that is wrong.</p><div className="row" style={{ marginTop: 8 }}>{['DD/MM', 'MM/DD'].map(o => <Btn key={o} size="sm" kind={(dateOrder ?? pv.question!.defaultAnswer) === o ? 'primary' : 'secondary'} onClick={() => setDateOrder(o)}>{o}{o === pv.question!.defaultAnswer ? ' (default)' : ''}</Btn>)}</div></div>}
          <div className="row" style={{ margin: '12px 0' }}><Tabs label="Rows to show" value={filter} onChange={setFilter} items={[{ id: 'problems', label: 'Needs a look', count: pv.rows.filter(r => r.verdict !== 'ok').length }, { id: 'all', label: 'All rows', count: pv.rows.length }]} /></div>
          {rows.length ? <Table caption="Per-row verdicts" cols={vcols} rows={rows} rowKey={r => String(r.n)} /> : <Empty title="Every row is ready" icon={<Check size={26} aria-hidden />} body="Nothing needs fixing. Switch to All rows to see them." />}
        </Card>
        <Card><CardHead title="4. Save" sub="Saves contacts and an audience. It does not call anyone." />
          <div className="formgrid"><SelectField label="Why may you call these people?" value={basis} onChange={e => setBasis(e.target.value)} hint="Recorded on every contact. It decides which calls are allowed.">{BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
            <TextField label="Audience name" value={aud} onChange={e => setAud(e.target.value)} /></div>
          <div style={{ marginTop: 16 }}>{reasonOff ? <Btn disabled reason={reasonOff}>Save contacts</Btn> : <Btn kind="primary" onClick={commit}>Save {count(pv.counts.callable)} contacts</Btn>}</div></Card>
      </>}
    </div>
  );
}

// ---------- one person ----------
function ContactPage({ id }: { id: string }) {
  const { act, refresh } = useApp();
  const q = useTool<ContactDoc>('contact.get', { id });
  return (
    <div className="page"><Async q={q} what="This contact" tool="contact.get" rows={5}>{c => (
      <>
        <PageHead crumb={<><Link to="/contacts">Contacts</Link><span aria-hidden>/</span><span>{c.name}</span></>} title={c.name} sub={<span className="tnum">{fmtPhone(c.phone)} · {c.city} · {LANG_LABEL[c.language]?.split(' ')[0]}</span>} actions={<>{consentChip(c.consent)}{dndChip(c.dnd)}</>} />
        {c.suppressed && <p className="state state-failed" role="note" style={{ marginBottom: 16 }}>{c.suppressed}. She will not call this number.</p>}
        <div className="cols-main">
          <div className="stack">
            <Card><CardHead title="Memory" sub="Only what they said, with the exact words and the second it was said. Approve to let the next call use it." />
              {c.memory.status === 'not_loaded' ? <p className="muted">Memory is not switched on in this server yet.</p> : c.memory.status === 'off' ? <p className="muted">Memory is off for this workspace. Turn it on in Settings, Privacy.</p>
                : c.memory.facts.length === 0 ? <Empty title="Nothing remembered yet" body="After a real call, anything useful they said shows here for you to approve." />
                : <ul className="facts">{c.memory.facts.map(f => (
                  <li key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{f.text}</strong><Chip tone={f.status === 'approved' ? 'leaf' : 'marigold'}>{f.status === 'approved' ? 'Approved' : 'Waiting for you'}</Chip></div>
                    <blockquote lang="hi">“{f.quote}”</blockquote>
                    <div className="row"><Link to={`/calls/${f.callId}?t=${f.atSec}`} className="btn btn-sm" style={{ textDecoration: 'none' }}><Play size={13} aria-hidden /><span>Play from {clock(f.atSec)}</span></Link>
                      {f.status !== 'approved' && <Btn size="sm" onClick={async () => { const r = await act('fact.approve', { id: f.id }, { describe: 'Approved.' }); if (r.ok) refresh(); }}>Approve</Btn>}
                      <Btn size="sm" kind="danger" onClick={async () => { const r = await act('fact.forget', { id: f.id }, { describe: 'Forgotten.' }); if (r.ok) refresh(); }}>Forget</Btn></div></li>))}</ul>}
            </Card>
            <Card><CardHead title="Attempts" />{c.attemptHistory.length === 0 ? <Empty title="Not called yet" body="Attempts and their outcomes appear here." /> :
              <ul className="facts">{c.attemptHistory.map((a, i) => <li key={i}><div className="row" style={{ justifyContent: 'space-between' }}><span>{a.campaign}</span><span className="small muted">{date(a.at, true)}</span></div><div className="row"><Chip>{OUTCOME_LABEL[a.outcome] ?? a.outcome}</Chip>{a.callId && <Link to={`/calls/${a.callId}`} className="small">Open the call</Link>}</div></li>)}</ul>}</Card>
          </div>
          <div className="stack">
            <Card><CardHead title="Consent" /><Kv rows={[['Status', consentChip(c.consent)], ['Basis', c.consentDetail.basis], ['Source', c.consentDetail.source], ['Recorded', date(c.consentDetail.at)]]} /></Card>
            <Card><CardHead title="Do Not Disturb" /><Kv rows={[['Status', dndChip(c.dnd)], ['Registry', c.dndDetail.registry], ['Last checked', c.dndDetail.checkedAt ? date(c.dndDetail.checkedAt, true) : 'Not yet']]} /></Card>
            <Card><CardHead title="Details from your list" /><Kv rows={Object.entries(c.attributes).map(([k, v]) => [k.replace(/_/g, ' '), v] as [string, string])} /></Card>
          </div>
        </div>
      </>)}</Async></div>
  );
}
