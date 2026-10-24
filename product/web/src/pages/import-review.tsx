// Steps 2-4 of an import, shared by a file import and a CRM pull: match the columns (with the chosen agent's column
// contract), see what happens to each row, then save. The caller brings the preview and decides what follows a save.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../store.tsx';
import { Btn, Card, CardHead, Chip, Empty, SelectField, Table, Tabs, TextField, type Col } from '../ui.tsx';
import { importMap, overridesFrom } from '../data.ts';
import { count, date, phone as fmtPhone, plural } from '../format.ts';
import type { ImportPreview } from '../types.ts';

export const FIELDS: [string, string][] = [['name', 'Name'], ['first_name', 'First name'], ['last_name', 'Last name'], ['phone', 'Phone (needed)'], ['language', 'Language'], ['timezone', 'Time zone'], ['consent', 'Consent (yes or no)'], ['consent_at', 'Consent date'], ['opt_out', 'Opted out (yes or no)'], ['observed_at', 'When the row was last updated'], ['voice', 'Voice for this person'], ['first_message', 'What to open with, for this person'], ['attribute', 'Keep as a detail'], ['ignore', 'Ignore this column']];

export function ImportReview({ pv, setPv, srcText, agentId, onSaved, saveSub }: {
  pv: ImportPreview; setPv: (p: ImportPreview) => void; srcText: string; agentId: string;
  onSaved: (r: { receiptId: string; counts: Record<string, number> }) => void; saveSub?: string;
}) {
  const { act, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState(''); const [aud, setAud] = useState(() => `Import of ${date(new Date())}`);
  const [filter, setFilter] = useState<'all' | 'problems'>('problems');
  const remap = async (ov: Record<string, { field: string; key?: string }>) => {
    setBusy(true);
    try { setPv(await importMap(pv.uploadId, srcText, ov, agentId || undefined)); } catch (e) { toast(e instanceof Error ? e.message : 'Could not apply that.', 'bad'); }
    setBusy(false);
  };
  const setField = (header: string, field: string) => {
    const ov = overridesFrom(pv.columns);
    const col = pv.columns.find(c => c.header === header)!;
    ov[header] = { field, key: field === 'attribute' || field === 'ignore' ? col.key ?? header.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') : undefined };
    void remap(ov);
  };
  const useColumn = (header: string, factKey: string) => { const ov = overridesFrom(pv.columns); ov[header] = { field: 'attribute', key: factKey }; void remap(ov); };
  const rows = useMemo(() => pv.rows.filter(r => filter === 'all' || r.verdict !== 'ok'), [pv, filter]);
  const missingPhone = !pv.columns.some(c => c.field === 'phone');
  const commit = async () => {
    const r = await act<{ receiptId: string; counts: Record<string, number> }>('source.commit', { uploadId: pv.uploadId, overrides: overridesFrom(pv.columns), consentPurpose: purpose || undefined, audienceName: aud }, { describe: 'List imported.' });
    if (r.ok) onSaved(r.result);
  };
  const reasonOff = missingPhone ? 'Match one column to the phone number.' : pv.counts.callable === 0 ? 'No row can be called yet.' : !aud.trim() ? 'Name the audience.' : '';
  const vcols: Col<ImportPreview['rows'][number]>[] = [
    { key: 'n', label: 'Row', num: true, render: r => r.row },
    { key: 'v', label: 'Verdict', primary: true, render: r => <Chip tone={r.verdict === 'ok' ? 'leaf' : r.verdict === 'review' ? 'marigold' : r.verdict === 'duplicate' ? 'peacock' : 'brick'}>{({ ok: 'Ready', duplicate: 'Duplicate', skipped: 'Skipped', suppressed: 'Suppressed', review: 'Needs a look' })[r.verdict]}</Chip> },
    { key: 'w', label: 'Who', render: r => r.name ?? '—' }, { key: 'p', label: 'Number saved as', render: r => r.phone ? <span className="tnum">{fmtPhone(r.phone)}</span> : <span className="muted">Not saved</span> },
    { key: 'r', label: 'Why', render: r => r.reason ?? <span className="muted">Nothing to fix</span> },
  ];
  return (
    <>

        <Card><CardHead title="2. Match the columns" sub="We guessed from the headings. Change any that is wrong; the verdicts update." />
          <div className="mapgrid">{pv.columns.map(c => (
            <div key={c.header} className="mapcol"><SelectField label={c.header} value={c.field.startsWith('attribute:') ? 'attribute' : c.field} onChange={e => setField(c.header, e.target.value)} hint={<span lang="hi">{c.sample.filter(Boolean).slice(0, 2).join(' · ') || 'empty'}{c.why === 'default' ? ' · kept as a detail by default' : ''}</span>}>
              {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>))}</div>
          {missingPhone && <p className="hint hint-bad">No column is matched to Phone, so no row can be called.</p>}
          {pv.converted && <p className="hint">Read from the sheet “{pv.converted.sheet}” of your Excel file.{pv.converted.formulaCells ? ` ${plural(pv.converted.formulaCells, 'formula cell')} used ${pv.converted.formulaCells === 1 ? 'the value' : 'the values'} Excel last saved.` : ''}{pv.converted.formulaWithoutValue ? ` ${plural(pv.converted.formulaWithoutValue, 'formula cell')} had no saved value and ${pv.converted.formulaWithoutValue === 1 ? 'is' : 'are'} empty; open the file in Excel and save it to fill ${pv.converted.formulaWithoutValue === 1 ? 'it' : 'them'}.` : ''}</p>}
        </Card>
        {pv.agentFacts && <AgentFactsCard facts={pv.agentFacts} headers={pv.columns.map(c => c.header)} busy={busy} onUse={useColumn} />}
        <Card><CardHead title="3. What will happen to each row" />
          <div className="receipt" role="status">
            <div><b className="tnum serif">{count(pv.counts.in)}</b><span>rows in</span></div><div><b className="tnum serif">{count(pv.counts.callable)}</b><span>callable numbers</span></div>
            <div><b className="tnum serif">{count(pv.counts.duplicate)}</b><span>duplicates</span></div><div><b className="tnum serif">{count(pv.counts.skipped)}</b><span>skipped</span></div>
          </div>
          {pv.questions.map((q, i) => <div className="qcard" key={i}><p><strong>{q.text}</strong></p></div>)}
          <div className="row" style={{ margin: '12px 0' }}><Tabs label="Rows to show" value={filter} onChange={setFilter} items={[{ id: 'problems', label: 'Needs a look', count: pv.rows.filter(r => r.verdict !== 'ok').length }, { id: 'all', label: pv.rows.length < pv.counts.in ? `First ${pv.rows.length} rows` : 'All rows', count: pv.rows.length }]} /></div>
          {pv.rows.length < pv.counts.in && <p className="small muted">Showing the first {count(pv.rows.length)} of {count(pv.counts.in)} rows. The counts above are for the whole file.</p>}
          {rows.length ? <Table caption="Per-row verdicts" cols={vcols} rows={rows} rowKey={r => String(r.row)} />
            : (pv.counts.duplicate + pv.counts.skipped > 0)
              ? <Empty title={`The first ${count(pv.rows.length)} rows are ready`} body={`${count(pv.counts.duplicate)} duplicate and ${count(pv.counts.skipped)} skipped rows are further down the file. They are left out when you save; the rest is saved.`} />
              : <Empty title="Every row is ready" icon={<Check size={26} aria-hidden />} body="Nothing needs fixing. Switch to All rows to see them." />}
        </Card>
        <Card><CardHead title="4. Save" sub={saveSub ?? "Saves contacts and an audience. It does not call anyone."} />
          <div className="formgrid"><SelectField label="Record that these people agreed to be called for" value={purpose} onChange={e => setPurpose(e.target.value)} hint="Only choose one if it is true. It is written on every contact and decides which calls are allowed. Leave it if unsure."><option value="">Do not record any consent</option><option value="service">Service calls (about their own account)</option><option value="transactional">Transactional calls (orders, appointments)</option><option value="promotional">Promotional calls</option></SelectField>
            <TextField label="Audience name" value={aud} onChange={e => setAud(e.target.value)} /></div>
          <div style={{ marginTop: 16 }}>{reasonOff ? <Btn disabled fix={null} reason={reasonOff}>Save contacts</Btn> : <Btn kind="primary" onClick={commit}>Save {count(pv.counts.callable)} contacts</Btn>}</div></Card>
    </>
  );
}

/** The chosen agent's column contract: each detail she says from a person's record, and the column that fills it.
 *  Nothing is matched for the member; a suggestion becomes a match only when they tap it. */
export function AgentFactsCard({ facts, headers, busy, onUse }: { facts: NonNullable<ImportPreview['agentFacts']>; headers: string[]; busy: boolean; onUse: (header: string, factKey: string) => void }) {
  const missing = facts.facts.filter(f => f.status === 'missing');
  return (
    <Card><CardHead title={`What ${facts.agent} says from each person's record`} sub={missing.length ? `${count(missing.length)} ${missing.length === 1 ? 'detail has' : 'details have'} no column yet. A campaign with this agent cannot start until each has one.` : 'Every detail she says has a column in this list.'} />
      {facts.facts.length === 0 ? <p className="muted">This agent says nothing from a person's record, so any list works.</p> :
        <ul className="facts">{facts.facts.map(f => (
          <li key={f.key}><div className="row" style={{ justifyContent: 'space-between' }}><strong>{f.label}</strong>
            <Chip tone={f.status === 'missing' ? 'brick' : 'leaf'}>{f.status === 'missing' ? 'No column' : f.status === 'name' ? 'From the name' : `From “${headers.find(h => h === f.column) ?? f.column}”`}</Chip></div>
            {f.status === 'missing' && (f.suggestions.length ? <div className="row" style={{ marginTop: 6 }}><span className="small muted">Is it one of these?</span>
              {f.suggestions.filter(h => headers.includes(h)).slice(0, 3).map(h => <Btn key={h} size="sm" busy={busy} onClick={() => onUse(h, f.key)}>Use “{h}”</Btn>)}</div>
              : <p className="small muted">No column looks like it. Add one to the file, or change the agent.</p>)}</li>))}</ul>}
    </Card>
  );
}
