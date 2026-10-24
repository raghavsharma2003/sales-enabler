// Company information: what the business tells us about itself, and which of it the agents may say. Four ways in (the
// website, a document, an offerings or price sheet, pasted text); facts are proposed with the passage each came from, and
// a person approves or rejects them, one at a time or all at once. Prices and dates come only from an offerings sheet:
// a prose line with one is held out, with the reason, and cannot be approved. Loaded only when the tab is opened.
import { useRef, useState, type ChangeEvent } from 'react';
import { FileText, Globe, Sheet as SheetIcon, Type } from 'lucide-react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, SelectField, Sheet, Table, TextArea, TextField, type Col } from '../ui.tsx';
import { knowledgeList } from '../data.ts';
import type { KnowledgeItem } from '../types.ts';
import { place } from '../why-said.tsx';

interface Fact { id: string; text: string; quote: string; purposes: string[]; origin: 'prose' | 'sheet'; status: 'pending' | 'approved' | 'rejected' | 'excluded'; reason: string | null;
  offeringName: string | null; offering: string | null; sourceTitle: string; sourceKind: string; location: Record<string, unknown> }
interface Offering { id: string; name: string }

const PURPOSE: Record<string, string> = { price: 'Price', discount: 'Offer', timing: 'Dates', hours: 'Hours', eligibility: 'Who can buy', next_step: 'Next step', objection: 'Concerns', explain: 'About the business' };

const toBase64 = (file: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => bad(new Error('the file could not be read'));
  r.readAsDataURL(file);
});

function AddInformation({ onAdded }: { onAdded: () => void }) {
  const { act } = useApp();
  const [way, setWay] = useState<'site' | 'doc' | 'sheet' | 'text'>('site');
  const [url, setUrl] = useState(''); const [pages, setPages] = useState('10');
  const [f, setF] = useState({ title: '', text: '' });
  const [busy, setBusy] = useState(false);
  const doc = useRef<HTMLInputElement>(null), sheet = useRef<HTMLInputElement>(null);
  const upload = async (e: ChangeEvent<HTMLInputElement>, tool: 'knowledge.ingest' | 'offering.import') => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await act(tool, { filename: file.name, contentBase64: await toBase64(file) }, { describe: tool === 'offering.import' ? 'Sheet read. Each row is an offering; its facts wait for your approval.' : 'Read. Its facts wait for your approval.' });
      if (r.ok) onAdded();
    } finally { setBusy(false); }
  };
  const WAYS = [['site', 'Website', Globe], ['doc', 'Document', FileText], ['sheet', 'Offerings sheet', SheetIcon], ['text', 'Paste text', Type]] as const;
  return (
    <Card><CardHead title="Add company information" sub="Your own material only: your website, brochures and policies, and your price list. Customer rows never go in here." />
      <fieldset className="chipset" style={{ margin: '0 0 12px' }}><legend className="sr">How to add it</legend>
        {WAYS.map(([k, label, Icon]) => <label key={k} className={`choice${way === k ? ' on' : ''}`}><input type="radio" name="way" checked={way === k} onChange={() => setWay(k)} /><Icon size={14} aria-hidden /> {label}</label>)}</fieldset>
      {way === 'site' && <div className="stack-s">
        <TextField label="Website address" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yourcompany.in" inputMode="url"
          hint="We read pages on this site only, follow what its robots.txt allows, and stop after the number of pages you choose or 45 seconds." />
        <SelectField label="Pages to read, at most" value={pages} onChange={e => setPages(e.target.value)}>{['5', '10', '15', '25'].map(n => <option key={n} value={n}>{n}</option>)}</SelectField>
        <div>{url.trim() ? <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); try { const r = await act('knowledge.ingest_site', { url: url.trim(), maxPages: Number(pages) }, { describe: 'Website read. Its facts wait for your approval.' }); if (r.ok) { setUrl(''); onAdded(); } } finally { setBusy(false); } }}>Read the website</Btn>
          : <Btn kind="primary" disabled fix={null} reason="Type the website address first.">Read the website</Btn>}</div></div>}
      {way === 'doc' && <div className="stack-s">
        <p className="small muted">A PDF, a Word file (.docx) or a plain text file, up to 9 MB. Scanned images cannot be read.</p>
        <input ref={doc} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="sr" id="cd-doc" onChange={e => void upload(e, 'knowledge.ingest')} />
        <div><Btn kind="primary" busy={busy} onClick={() => doc.current?.click()}>Choose a document</Btn></div></div>}
      {way === 'sheet' && <div className="stack-s">
        <p className="small muted">A CSV or Excel (.xlsx) file with a header row. One row per offering: a name column (for example Plan or Product) and any others, such as Price, Valid until or Free services. Prices and dates are taken only from a sheet like this.</p>
        <input ref={sheet} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr" id="cd-sheet" onChange={e => void upload(e, 'offering.import')} />
        <div><Btn kind="primary" busy={busy} onClick={() => sheet.current?.click()}>Choose a sheet</Btn></div></div>}
      {way === 'text' && <div className="stack-s">
        <TextField label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <TextArea label="Text" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} rows={5} hint="For example your FAQ, a policy note or your opening hours." />
        <div>{f.title.trim() && f.text.trim() ? <Btn kind="primary" onClick={async () => { const r = await act('knowledge.ingest', { title: f.title.trim(), text: f.text }, { describe: 'Added. Its facts wait for your approval.' }); if (r.ok) { setF({ title: '', text: '' }); onAdded(); } }}>Add text</Btn>
          : <Btn disabled fix={null} reason="Add a title and some text.">Add text</Btn>}</div></div>}
    </Card>
  );
}

function FactRow({ f, picked, onPick }: { f: Fact; picked?: boolean; onPick?: () => void }) {
  return (
    <li className="cd-fact">
      {onPick && <input type="checkbox" checked={!!picked} onChange={onPick} aria-label={`Choose: ${f.text}`} />}
      <div className="cd-body">
        <p lang="hi">{f.text}</p>
        <p className="small muted">{f.purposes.map(p => <Chip key={p}>{PURPOSE[p] ?? p}</Chip>)} From {place(f)}{f.offering ? <> · in “{f.offering}”</> : f.offeringName ? <> · goes to “{f.offeringName}”</> : null}</p>
        {f.reason && <p className="small hint-bad">{f.reason}</p>}
        <details><summary>Show the passage</summary><blockquote lang="hi">{f.quote}</blockquote></details>
      </div>
    </li>
  );
}

function Review({ facts, offerings, reload }: { facts: Fact[]; offerings: Offering[]; reload: () => void }) {
  const { act } = useApp();
  const pending = facts.filter(f => f.status === 'pending');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState('');
  const chosen = pending.filter(f => picked.has(f.id));
  const decide = async (decision: 'approved' | 'rejected', ids: string[]) => {
    const r = await act('knowledge.fact.decide', { factIds: ids, decision, ...(decision === 'approved' && to ? { offeringId: to } : {}) },
      { describe: decision === 'approved' ? `${ids.length} fact${ids.length === 1 ? '' : 's'} approved. Agents that link the offering may say them.` : `${ids.length} fact${ids.length === 1 ? '' : 's'} rejected.` });
    if (r.ok) { setPicked(new Set()); reload(); }
  };
  if (!pending.length) return <Empty title="Nothing waiting for you" body="Facts proposed from new material appear here." />;
  const all = chosen.length === pending.length;
  return (
    <div className="stack-s">
      <div className="row" style={{ gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="choice"><input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(pending.map(f => f.id)))} /> Choose all {pending.length}</label>
        {pending.some(f => f.origin === 'prose') && <SelectField label="Approved facts from documents and the website go to" value={to} onChange={e => setTo(e.target.value)}>
          <option value="">Company information</option>{offerings.filter(o => o.name !== 'Company information').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectField>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {chosen.length ? <><Btn kind="primary" onClick={() => decide('approved', chosen.map(f => f.id))}>Approve {chosen.length}</Btn><Btn onClick={() => decide('rejected', chosen.map(f => f.id))}>Reject {chosen.length}</Btn></>
          : <><Btn kind="primary" disabled fix={null} reason="Choose the facts first.">Approve</Btn><Btn disabled fix={null} reason="Choose the facts first.">Reject</Btn></>}
      </div>
      <p className="small muted">Facts from a sheet go to that row's own offering. Agents say a fact only once their offering is linked on the agent's Company information.</p>
      <ul className="cd-facts" aria-label="Facts waiting for your approval">{pending.map(f => <FactRow key={f.id} f={f} picked={picked.has(f.id)} onPick={() => { const n = new Set(picked); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); setPicked(n); }} />)}</ul>
    </div>
  );
}

function Passages({ item, onClose }: { item: KnowledgeItem; onClose: () => void }) {
  const q = useData(['spans', item.id], async () => (await run<{ spans: { id: string; text: string; status: string }[] }>('knowledge.list', { sourceId: item.id })).spans);
  return (
    <Sheet title={item.title} onClose={onClose} wide>
      <p className="small muted">Every passage read from this source. A passage is approved when a fact from it is.</p>
      <Async q={q} what="Passages" tool="knowledge.list" empty={d => d.length === 0 ? <Empty title="No passages" /> : null}>{d => <ul className="issues">{d.map(s => (
        <li key={s.id}><Chip tone={s.status === 'approved' ? 'leaf' : s.status === 'rejected' ? 'brick' : 'neutral'}>{s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Struck' : 'Not used yet'}</Chip><p lang="hi">{s.text}</p></li>))}</ul>}</Async>
    </Sheet>
  );
}

export default function CompanyData() {
  const { act } = useApp();
  const sources = useData<KnowledgeItem[]>('knowledge', knowledgeList);
  const facts = useData<Fact[]>('company-facts', async () => (await run<{ facts: Fact[] }>('knowledge.fact.list', { limit: 500 })).facts);
  const offerings = useData<Offering[]>('offerings', async () => (await run<{ offerings: Offering[] }>('offering.list', {})).offerings);
  const [open, setOpen] = useState<KnowledgeItem | null>(null);
  const reload = () => { sources.reload(); facts.reload(); offerings.reload(); };
  const cols: Col<KnowledgeItem>[] = [{ key: 't', label: 'Source', primary: true, render: k => k.title },
    { key: 'p', label: 'Passages', num: true, render: k => k.passages }, { key: 'a', label: 'Approved', num: true, render: k => k.approved ?? 0 },
    { key: 'r', label: '', render: k => <Btn size="sm" onClick={() => setOpen(k)}>See passages</Btn> }];
  return (
    <div className="stack">
      <AddInformation onAdded={reload} />
      <Card><CardHead title="Facts to review" sub="Proposed from your material, each with the passage it came from. Approve what she may say; reject the rest. Nothing reaches a call until you approve it." />
        <Async q={facts} what="Facts" tool="knowledge.fact.list">{d => <Review facts={d} offerings={offerings.data ?? []} reload={reload} />}</Async></Card>
      {facts.data && facts.data.some(f => f.status === 'excluded') && (
        <Card><CardHead title="Held out: prices and dates in your documents and website" sub="Prices and dates change, so she takes them only from an offerings sheet. Put the current figure in your sheet instead." />
          <details><summary>{facts.data.filter(f => f.status === 'excluded').length} held out</summary>
            <ul className="cd-facts">{facts.data.filter(f => f.status === 'excluded').map(f => <FactRow key={f.id} f={f} />)}</ul></details></Card>)}
      {facts.data && facts.data.some(f => f.status === 'approved') && (
        <Card><CardHead title="Approved facts" sub="What agents may say once they link the offering. Taking one out removes it from its offering." />
          <details><summary>{facts.data.filter(f => f.status === 'approved').length} approved</summary>
            <ul className="cd-facts">{facts.data.filter(f => f.status === 'approved').map(f => <li key={f.id} className="cd-fact"><div className="cd-body"><FactRow f={f} /></div>
              <Btn size="sm" kind="ghost" onClick={async () => { const r = await act('knowledge.fact.decide', { factIds: [f.id], decision: 'rejected' }, { describe: 'Taken out.' }); if (r.ok) reload(); }}>Take it out</Btn></li>)}</ul></details></Card>)}
      <Card><CardHead title="Sources" />
        <Async q={sources} what="Sources" tool="knowledge.list" empty={d => d.length === 0 ? <Empty title="No sources yet" body="Start with your website or your price sheet." /> : null}>{d => <Table caption="Company information sources" cols={cols} rows={d} rowKey={r => r.id} />}</Async></Card>
      {open && <Passages item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
