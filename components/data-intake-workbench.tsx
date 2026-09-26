'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, FileSpreadsheet, Sparkles, Upload } from 'lucide-react';
import { INTAKE_TARGETS, type ColumnMapping, type IntakeInspection, type IntakePreview, type IntakeReceipt, type IntakeTarget, type MappingSuggestion, type RowDecision } from '../lib/data-intake/contracts';
import '../app/data-intake.css';

type SourceChoice = { id: string; title: string; format: string };
const labels: Record<IntakeTarget, string> = { unknown: 'Needs your choice', skip: 'Skip column', name: 'Customer name', email: 'Customer email', phone: 'Phone with country code', stage: 'Customer stage', notes: 'Customer notes', date: 'Context date (YYYY-MM-DD)', context: 'Customer context (text)', doNotContact: 'Do not contact / opt-out' };
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}). Refresh and try again.`);
  return result as T;
}
const intake = <T,>(body: unknown) => request<T>('/api/data-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Extends Company brain's established Operate surface: import → map → evidence review → atomic apply. */
export function DataIntakeWorkbench({ onApplied, sourceId, canWrite = false }: { onApplied?: () => Promise<unknown> | void; sourceId?: string; canWrite?: boolean }) {
  const [sources, setSources] = useState<SourceChoice[]>([]), [selected, setSelected] = useState(sourceId || '');
  const [inspection, setInspection] = useState<IntakeInspection | null>(null), [mapping, setMapping] = useState<ColumnMapping[]>([]), [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [preview, setPreview] = useState<IntakePreview | null>(null), [receipt, setReceipt] = useState<IntakeReceipt | null>(null);
  const [mappingOpen, setMappingOpen] = useState(true);
  const reviewHeading = useRef<HTMLHeadingElement>(null), receiptHeading = useRef<HTMLHeadingElement>(null);
  const [decisions, setDecisions] = useState<Record<number, RowDecision>>({}), [excludedRows, setExcludedRows] = useState<number[]>([]), [page, setPage] = useState(0);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState(''), [title, setTitle] = useState(''), [format, setFormat] = useState<'csv' | 'json'>('csv');
  const loadSources = useCallback(async () => {
    const result = await request<{ sources: SourceChoice[] }>('/api/ingestion'); setSources(result.sources.filter(source => ['csv', 'json'].includes(source.format)));
  }, []);
  useEffect(() => { if (canWrite) void loadSources().catch(failure => setError(failure.message)); }, [canWrite, loadSources]);
  const inspect = useCallback(async (id: string) => {
    const result = await intake<{ inspection: IntakeInspection }>({ action: 'inspect', sourceId: id });
    setInspection(result.inspection); setSelected(id); setMapping(result.inspection.headers.map((_, column) => ({ column, target: 'unknown' }))); setSuggestions([]); setPreview(null); setReceipt(null); setDecisions({}); setExcludedRows([]); setPage(0); setMappingOpen(true);
  }, []);
  useEffect(() => {
    if (sourceId && canWrite) { setBusy('Loading table'); void inspect(sourceId).catch(failure => setError(failure.message)).finally(() => setBusy('')); }
  }, [sourceId, canWrite, inspect]);
  useEffect(() => {
    const heading = receipt ? receiptHeading.current : preview ? reviewHeading.current : null;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'nearest' });
  }, [preview?.id, receipt?.id]);
  const work = async (label: string, operation: () => Promise<void>) => { setBusy(label); setError(''); try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete table intake.'); } finally { setBusy(''); } };
  const importSource = async () => {
    let result: { source: SourceChoice };
    if (file) {
      if (file.size > 524288) throw new Error('Choose a UTF-8 table under 512 KB. Split larger exports into separate files.');
      const form = new FormData(); form.set('file', file); if (title.trim()) form.set('title', title.trim());
      result = await request('/api/ingestion', { method: 'POST', body: form });
    } else result = await request('/api/ingestion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() || 'Customer table', text: paste, format, kind: 'paste' }) });
    await loadSources(); await inspect(result.source.id);
  };
  const makePreview = async (cursor = 0, exclusions = excludedRows) => {
    if (!inspection) return;
    const result = await intake<{ preview: IntakePreview }>({ action: 'preview', sourceId: inspection.sourceId, mapping, cursor, excludedRows: exclusions });
    setPreview(result.preview); setReceipt(null); setPage(0); setMappingOpen(false);
    setDecisions(Object.fromEntries(result.preview.rows.filter(row => row.excluded || row.previous).map(row => [row.rowNumber, { rowNumber: row.rowNumber, action: 'skip' }])));
  };
  const updateMapping = (column: number, target: IntakeTarget) => { setMapping(current => current.map(item => item.column === column ? { column, target } : item)); setPreview(null); setReceipt(null); setDecisions({}); };
  const apply = async () => {
    if (!preview) return;
    const result = await intake<{ receipt: IntakeReceipt }>({ action: 'apply', previewId: preview.id, previewHash: preview.hash, decisions: Object.values(decisions) });
    setReceipt(result.receipt); setMappingOpen(false);
    if (onApplied) await onApplied();
  };
  const stage = receipt ? 3 : preview ? 2 : inspection ? 1 : 0;
  const chosen = preview ? preview.rows.filter(row => !!decisions[row.rowNumber]).length : 0;
  const excludedChanged = !!preview && JSON.stringify(excludedRows) !== JSON.stringify(preview.excludedRows);
  if (!canWrite) return <section className="di-workbench"><h3>Customer table intake</h3><p className="pc-muted">An owner or operator can map and review customer tables.</p></section>;

  return <section className="di-workbench" aria-label="Customer table intake" aria-busy={!!busy}>
    <header className="di-heading"><div><h3><FileSpreadsheet size={18} aria-hidden="true"/>Customer table intake</h3><p>Map a CSV or JSON export, review each customer, then apply a batch.</p></div></header>
    <ol className="di-steps" aria-label="Intake progress">{['Import table', 'Map columns', 'Review rows', 'Applied'].map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined} data-done={index < stage}>{label}{index < 3 && <ArrowRight size={12} aria-hidden="true"/>}</li>)}</ol>
    <p className="di-note">Customer tables stay private source material. Importing never approves company knowledge, verifies identity, or grants contact permission.</p>
    {error && <p role="alert" className="di-error">{error}</p>}
    {busy && <p role="status" className="di-status">{busy}…</p>}
    {receipt && preview && <div className="di-applied" role="status"><h4 ref={receiptHeading} tabIndex={-1}>Batch applied{receipt.replayed ? ' · saved receipt' : ''}</h4><p>{receipt.created} created · {receipt.linked} linked · {receipt.skipped} skipped.</p><p className="di-note">{preview.nextCursor !== null ? `${preview.totalRows - preview.nextCursor} source rows remain in later batches.` : 'This is the last source batch.'}</p><div className="di-applied-actions">{preview.nextCursor !== null && <button type="button" className="pc-button primary" disabled={!!busy} onClick={() => void work('Preparing next batch', () => makePreview(preview.nextCursor!))}>Review next {Math.min(200, preview.totalRows - preview.nextCursor)} rows<ArrowRight size={14} aria-hidden="true"/></button>}<button type="button" className={`pc-button${preview.nextCursor === null ? ' primary' : ''}`} disabled={!!busy} onClick={() => { setInspection(null); setPreview(null); setReceipt(null); setMapping([]); setDecisions({}); setMappingOpen(true); setFile(null); setPaste(''); setTitle(''); }}>Choose another table</button></div></div>}
    <details className="di-source" open={!inspection}>
      <summary>{inspection ? `Source: ${inspection.title} · ${inspection.totalRows} rows` : 'Choose or import a table'}</summary>
      <div className="di-import-grid">
        <div><label className="pc-field">Saved table<select className="pc-input" value={selected} disabled={!!busy} onChange={event => setSelected(event.target.value)}><option value="">Choose a source</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><button type="button" className="pc-button" disabled={!selected || !!busy} onClick={() => void work('Reading source', () => inspect(selected))}>Open saved table</button></div>
        <div><label className="pc-field">New table title<input className="pc-input" value={title} maxLength={200} disabled={!!busy} onChange={event => setTitle(event.target.value)}/></label><label className="pc-field">CSV or JSON file<input type="file" accept=".csv,.json,text/csv,application/json" disabled={!!busy} onChange={event => setFile(event.target.files?.[0] || null)}/></label><p className="di-note">UTF-8 · up to 512 KB, 240,000 characters, 1,000 rows and 50 columns. Review in batches of 200. Split larger exports into separate sources.</p>
          {!file && <details><summary>Paste a table instead</summary><label className="pc-field">Table format<select className="pc-input" value={format} disabled={!!busy} onChange={event => setFormat(event.target.value as 'csv' | 'json')}><option value="csv">CSV with headers</option><option value="json">JSON array of objects</option></select></label><label className="pc-field">Table text<textarea className="pc-input" rows={5} value={paste} maxLength={240000} disabled={!!busy} onChange={event => setPaste(event.target.value)}/></label></details>}
          <button type="button" className="pc-button primary" disabled={!!busy || !file && !paste.trim()} onClick={() => void work('Importing table', importSource)}><Upload size={14} aria-hidden="true"/>Import table</button>
        </div>
      </div>
    </details>
    {inspection && <details className="di-mapping" open={mappingOpen} onToggle={event => setMappingOpen(event.currentTarget.open)}>
      <summary><span>{preview ? `${mapping.length} source columns reviewed · ${mapping.filter(item => item.target !== 'skip').length} mapped, ${mapping.filter(item => item.target === 'skip').length} skipped` : 'Map source columns'}</span>{preview && !receipt && !mappingOpen && <button type="button" className="pc-button" disabled={!!busy} onClick={event => { event.preventDefault(); setMappingOpen(true); }}>Edit mappings</button>}</summary>
      <div className="di-section-heading"><div><h4>Map source columns</h4><p>Choose the known customer fields. Keep extra columns as customer context, or skip them.</p></div><button type="button" className="pc-button" disabled={!!busy || !!receipt} onClick={() => void work('Asking Azure for column suggestions', async () => {
        const result = await intake<{ suggestions: MappingSuggestion[] }>({ action: 'suggest', sourceId: inspection.sourceId }); setSuggestions(result.suggestions); setMapping(result.suggestions.map(({ column, target }) => ({ column, target }))); setPreview(null); setDecisions({});
      })}><Sparkles size={14} aria-hidden="true"/>Suggest mapping with AI</button></div>
      <div className="di-columns">{inspection.headers.map((header, column) => <div className="di-column" key={column}>
        <div><strong>{header}</strong><details><summary>Source examples</summary>{inspection.samples.map((row, index) => <p className="di-cell" key={index}>{row[column] || '(empty)'}</p>)}</details></div>
        <label className="pc-field"><span className="di-visually-hidden">Use {header} as</span><select className="pc-input" aria-label={`Use ${header} as`} value={mapping[column]?.target || 'unknown'} disabled={!!busy || !!receipt} onChange={event => updateMapping(column, event.target.value as IntakeTarget)}>{INTAKE_TARGETS.map(target => <option key={target} value={target}>{labels[target]}</option>)}</select>{suggestions[column] && <span className="di-note">AI suggestion: {suggestions[column].reason}{suggestions[column].candidates.length ? ` Possible fields: ${suggestions[column].candidates.map(target => labels[target]).join(', ')}.` : ''}</span>}</label>
      </div>)}</div>
      <p className="di-note">Phones need an explicit country code. Dates need YYYY-MM-DD. Recognized true opt-out values remain a contact restriction even when their column is skipped.</p>
      {!receipt && <button type="button" className="pc-button primary" disabled={!!busy || mapping.some(item => item.target === 'unknown')} onClick={() => void work('Building reviewed preview', () => makePreview(preview?.cursor || 0))}>{preview ? 'Refresh preview' : 'Review mapped rows'}<ArrowRight size={14} aria-hidden="true"/></button>}
    </details>}
    {preview && <details className="di-review" key={receipt?.id || preview.id} open={!receipt}>
      <summary hidden={!receipt}>View reviewed rows and source evidence</summary>
      <div className="di-section-heading"><div><h4 ref={reviewHeading} tabIndex={-1}>Review source rows {preview.cursor + 1}–{preview.cursor + preview.rows.length}</h4><p>{preview.totalRows} rows in this source. {chosen} of {preview.rows.length} decisions made in this batch.</p></div>{!receipt && <button type="button" className="pc-button" disabled={!!busy} onClick={() => setDecisions(current => ({ ...Object.fromEntries(preview.rows.map(row => [row.rowNumber, { rowNumber: row.rowNumber, action: 'skip' as const }])), ...current }))}>Skip undecided rows</button>}</div>
      <p className="di-note">Create uses only the mapped source values. Linking attaches source evidence and contact restrictions; it preserves the existing customer profile. No fuzzy merging.</p>
      <div className="di-rows">{preview.rows.slice(page * 20, (page + 1) * 20).map(row => {
        const blocked = row.excluded || !!row.previous || row.issues.some(issue => !issue.startsWith('Ambiguous customer match'));
        const choice = decisions[row.rowNumber];
        return <article className="di-row" key={row.rowNumber}>
          <div className="di-row-identity"><span className="di-row-number">Row {row.rowNumber}</span><strong>{row.name || 'Missing customer name'}</strong><span>{[row.email, row.phone].filter(Boolean).join(' · ') || 'No email or phone mapped'}</span><span>{row.stage}{row.doNotContact ? ' · Do not contact' : ''}</span>{row.previous && <span className="di-status">Already applied; skip this row.</span>}</div>
          <div className="di-row-evidence">{row.issues.length > 0 && <ul className="di-issues">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}{row.matches.map(match => <p className="di-note" key={match.id}>{match.reasons.join(' + ')} matches {match.name} ({match.email || match.phone || 'no contact channel'}).</p>)}<details><summary>Why these values? View source evidence</summary><dl>{row.evidence.map((item, index) => <div key={index}><dt>{item.column} → {labels[item.target]}</dt><dd>{item.value || '(empty)'}</dd></div>)}</dl><p className="di-note">Source: {inspection?.title} · data row {row.rowNumber} · digest {preview.sourceDigest.slice(0, 12)}. Extra mapped context remains customer-specific.</p></details></div>
          <div className="di-row-actions"><label className="pc-field">Row {row.rowNumber} decision<select className="pc-input" disabled={!!busy || !!receipt} value={choice?.action === 'link' ? `link:${choice.contactId}` : choice?.action || ''} onChange={event => {
            const value = event.target.value;
            setDecisions(current => { const next = { ...current }; if (!value) delete next[row.rowNumber]; else next[row.rowNumber] = value.startsWith('link:') ? { rowNumber: row.rowNumber, action: 'link', contactId: value.slice(5) } : { rowNumber: row.rowNumber, action: value as 'create' | 'skip' }; return next; });
          }}><option value="">Choose a decision</option><option value="create" disabled={blocked || row.matches.length > 0}>Create customer</option>{row.matches.map(match => <option key={match.id} value={`link:${match.id}`} disabled={blocked}>Link: {match.name} · {match.email || match.phone || match.id.slice(-8)}</option>)}<option value="skip">Skip row</option></select></label><label className="di-checkbox"><input type="checkbox" checked={excludedRows.includes(row.rowNumber)} disabled={!!busy || !!receipt} onChange={event => setExcludedRows(current => event.target.checked ? [...current, row.rowNumber].sort((a, b) => a - b) : current.filter(value => value !== row.rowNumber))}/>Exclude from mapping checks</label></div>
        </article>;
      })}</div>
      {preview.rows.length > 20 && <div className="di-pagination"><button type="button" className="pc-button" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous rows</button><span>Showing {page * 20 + 1}–{Math.min((page + 1) * 20, preview.rows.length)} of this batch</span><button type="button" className="pc-button" disabled={(page + 1) * 20 >= preview.rows.length} onClick={() => setPage(current => current + 1)}>Next rows</button></div>}
      {excludedChanged && !receipt && <div className="di-refresh"><p className="di-status">Exclusions changed. Refresh the preview to recheck duplicate emails and review the updated batch.</p><button type="button" className="pc-button" disabled={!!busy} onClick={() => void work('Refreshing row checks', () => makePreview(preview.cursor))}>Refresh preview</button></div>}
      {!receipt && <div className="di-apply"><p>Apply {Object.values(decisions).filter(item => item.action === 'create').length} creates and {Object.values(decisions).filter(item => item.action === 'link').length} links in one atomic batch.</p><button type="button" className="pc-button primary" disabled={!!busy || chosen !== preview.rows.length || excludedChanged} onClick={() => void work('Applying reviewed batch', apply)}>Apply reviewed batch</button></div>}
    </details>}
  </section>;
}
