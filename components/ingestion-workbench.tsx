'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, FileText, LoaderCircle, Plus, RefreshCw, Sparkles, UploadCloud, X } from 'lucide-react';
import type { IngestionCandidate, IngestionJob, IngestionProposal, IngestionSource } from '../lib/ingestion/contracts';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import { ContactImportReview } from './contact-import-review';
import { CandidateTypeReview } from './candidate-type-review';

type Detail = { source: IngestionSource; job: IngestionJob | null; proposal: IngestionProposal | null };
type Stage = 'source' | 'normalize' | 'extract' | 'review' | 'ready';
type ApiResponse = { source?: IngestionSource; sources?: IngestionSource[]; job?: IngestionJob | null; proposal?: IngestionProposal | null; applied?: unknown; error?: string; message?: string };

const stages: { id: Stage; label: string; description: string }[] = [
  { id: 'source', label: 'Source', description: 'Original material' },
  { id: 'normalize', label: 'Prepare', description: 'Readable text' },
  { id: 'extract', label: 'Extract', description: 'AI suggestions' },
  { id: 'review', label: 'Review', description: 'Human decision' },
  { id: 'ready', label: 'Use', description: 'Approved knowledge' },
];
const typeName: Record<IngestionCandidate['type'], string> = { offer: 'Offering', company_fact: 'Company fact', faq: 'Question & answer', contact: 'Contact', feedback: 'Feedback', action: 'Action' };
const publishable = (candidate: IngestionCandidate) => candidate.type === 'offer' || candidate.type === 'company_fact' || candidate.type === 'faq';

async function api(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(`/api/ingestion${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
  let result: ApiResponse = {};
  try { result = await response.json() as ApiResponse; } catch { /* Show a useful HTTP error below. */ }
  if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status}). Please try again.`);
  return result;
}

function statusFor(stage: Stage, detail: Detail | null): 'done' | 'current' | 'waiting' {
  if (!detail) return stage === 'source' ? 'current' : 'waiting';
  const index = stages.findIndex(item => item.id === stage);
  const hasProposal = !!detail.proposal;
  const hasApplied = !!detail.proposal?.candidates.some(item => item.status === 'applied');
  const current = hasApplied ? 4 : hasProposal ? 3 : detail.job?.status === 'running' ? 2 : 1;
  return index < current ? 'done' : index === current ? 'current' : 'waiting';
}

function sourceExcerpt(source: IngestionSource, candidate: IngestionCandidate): string {
  const block = source.blocks.find(item => item.id === candidate.sourceRef.blockId);
  if (!block) return candidate.quote;
  const start = Math.max(0, candidate.sourceRef.start - block.start);
  const end = Math.min(block.text.length, candidate.sourceRef.end - block.start);
  return end > start ? block.text.slice(start, end) : candidate.quote;
}

export function IngestionWorkbench({ onApplied, navigate }: { onApplied: () => Promise<unknown> | void; navigate: (section: string) => void }) {
  const [sources, setSources] = useState<IngestionSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stage, setStage] = useState<Stage>('source');
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [activeCandidate, setActiveCandidate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSources = useCallback(async () => {
    const result = await api('');
    const list = result.sources || [];
    setSources(list);
    return list;
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const result = await api(`/${encodeURIComponent(id)}`);
    if (!result.source) throw new Error('This source could not be found. Refresh the source list.');
    const next = { source: result.source, job: result.job || null, proposal: result.proposal || null };
    setDetail(next);
    return next;
  }, []);

  useEffect(() => {
    let live = true;
    void loadSources().then(list => {
      if (!live) return;
      setSelectedId(current => current || list[0]?.id || '');
    }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : 'Could not load sources.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [loadSources]);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    void api(`/${encodeURIComponent(selectedId)}`).then(result => {
      if (!live || !result.source) return;
      const next = { source: result.source, job: result.job || null, proposal: result.proposal || null };
      setDetail(next);
      setStage(next.proposal ? 'review' : next.job?.status === 'running' ? 'extract' : 'normalize');
      setSelectedCandidates([]);
      setActiveCandidate(next.proposal?.candidates[0]?.id || '');
    }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : 'Could not load this source.'); });
    return () => { live = false; };
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || detail?.job?.status !== 'running') return;
    const timer = window.setInterval(() => { void loadDetail(selectedId).catch(() => {}); }, 2500);
    return () => window.clearInterval(timer);
  }, [selectedId, detail?.job?.status, loadDetail]);

  const candidates = detail?.proposal?.candidates || [];
  const active = useMemo(() => candidates.find(item => item.id === activeCandidate) || candidates[0], [candidates, activeCandidate]);
  const approved = candidates.filter(item => item.status === 'applied');
  const pending = candidates.filter(item => item.status === 'pending' && publishable(item) && item.issues.length === 0);
  const selectedPending = pending.filter(item => selectedCandidates.includes(item.id));

  const importSource = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy('import');
    try {
      let result: ApiResponse;
      if (mode === 'file') {
        if (!file) throw new Error('Choose a supported file to import.');
        if (file.size > 524_288) throw new Error('This file is larger than 512 KB. Choose a smaller file.');
        const form = new FormData(); form.set('file', file); form.set('title', title.trim() || file.name);
        result = await api('', { method: 'POST', body: form });
      } else {
        if (!text.trim()) throw new Error('Paste source text to import.');
        result = await api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() || 'Pasted source', text, kind: 'paste' }) });
      }
      if (!result.source) throw new Error('The import finished without a source record. Please refresh.');
      await loadSources();
      setSelectedId(result.source.id); setDetail({ source: result.source, job: null, proposal: null }); setStage('normalize');
      setTitle(''); setText(''); setFile(null);
      const fileInput = document.getElementById('ingestion-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      setNotice('Source saved. Review the prepared text, then run extraction.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Import failed. Please try again.'); }
    finally { setBusy(''); }
  };
  const analyze = async (newAttempt = false) => {
    if (!detail) return;
    setBusy('analyze'); setError(''); setNotice('');
    let requestId = '';
    try {
      const fingerprint = { sourceId: detail.source.id, sourceDigest: detail.source.digest };
      requestId = newAttempt ? await newAiRequestAttempt('ingestion-extraction', fingerprint) : await aiRequestId('ingestion-extraction', fingerprint);
      const result = await api(`/${encodeURIComponent(detail.source.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze', requestId }) });
      setDetail({ source: result.source || detail.source, job: result.job || null, proposal: result.proposal || null });
      setStage(result.proposal ? 'review' : 'extract');
      setActiveCandidate(result.proposal?.candidates[0]?.id || '');
      setNotice(result.proposal ? 'Suggestions are ready for your review.' : 'Extraction started. The saved result will appear here.');
    } catch (failure) {
      if (requestId) {
        try {
          const current = await loadDetail(detail.source.id);
          if (current.job?.requestId === requestId && (current.job.status === 'running' || current.job.status === 'completed')) {
            setStage(current.proposal ? 'review' : 'extract');
            setNotice(current.proposal ? 'Saved suggestions are ready for review.' : 'Extraction is running; the saved result will appear here.');
            return;
          }
        } catch { /* Preserve the original request error. */ }
      }
      setError(failure instanceof Error ? failure.message : 'Could not analyze this source.');
    }
    finally { setBusy(''); }
  };
  const decide = async (action: 'apply' | 'reject') => {
    if (!detail?.proposal) return;
    const candidateIds = selectedCandidates.filter(id => candidates.some(item => item.id === id && item.status === 'pending'));
    if (!candidateIds.length) return;
    setBusy(action); setError(''); setNotice('');
    try {
      const result = await api(`/${encodeURIComponent(detail.source.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: detail.proposal.revision, candidateIds }) });
      const next = { source: result.source || detail.source, job: result.job || detail.job, proposal: result.proposal || detail.proposal };
      setDetail(next); setSelectedCandidates([]);
      if (action === 'apply') { await onApplied(); setStage('ready'); setNotice(`${candidateIds.length} suggestion${candidateIds.length === 1 ? '' : 's'} approved for company knowledge.`); }
      else setNotice(`${candidateIds.length} suggestion${candidateIds.length === 1 ? '' : 's'} rejected.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the review. Refresh this source and try again.');
      try { await loadDetail(detail.source.id); } catch { /* Keep the original error in view. */ }
    } finally { setBusy(''); }
  };
  const toggle = (id: string) => setSelectedCandidates(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return <section className="iw-workbench" aria-label="Company knowledge import workbench">
    <div className="iw-heading"><div><h2>Bring your company into the brain</h2><p>Import a real source, inspect what the AI found, and approve only the knowledge you trust.</p></div><span className="iw-heading-mark"><Sparkles size={17}/></span></div>
    <div className="iw-main">
      <aside className="iw-library" aria-label="Imported sources">
        <div className="iw-section-head"><h3>Sources</h3><button className="pc-button quiet" type="button" onClick={() => { setSelectedId(''); setDetail(null); setStage('source'); setError(''); }}><Plus size={14}/> New</button></div>
        {loading ? <p className="iw-note">Loading sources…</p> : sources.length ? <div className="iw-source-list">{sources.map(source => <button type="button" key={source.id} className="iw-source" aria-current={selectedId === source.id ? 'true' : undefined} onClick={() => { setSelectedId(source.id); setError(''); setNotice(''); }}><FileText size={17}/><span><strong>{source.title}</strong><small>{source.filename || (source.kind === 'paste' ? 'Pasted text' : source.kind)} · {new Date(source.createdAt).toLocaleDateString()}</small></span><ChevronRight size={14}/></button>)}</div> : <p className="iw-note">Your imported files and pasted notes will stay here for review.</p>}
      </aside>
      <div className="iw-content">
        <div className="iw-path" role="group" aria-label="Knowledge workflow">{stages.map((item, index) => <button key={item.id} type="button" className="iw-path-step" data-state={statusFor(item.id, detail)} aria-current={stage === item.id ? 'step' : undefined} onClick={() => setStage(item.id)}><span className="iw-step-symbol">{statusFor(item.id, detail) === 'done' ? <Check size={13}/> : index + 1}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
        {error && <div className="iw-alert" role="alert"><X size={16}/><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}
        {notice && <p className="iw-notice" role="status"><CheckCircle2 size={15}/>{notice}</p>}
        {!detail || !selectedId ? <div className="iw-pane"><div className="iw-pane-head"><div><h3>Add a source</h3><p>Choose a file or paste material from your business. The original text stays attached to every suggestion.</p></div></div><div className="iw-methods" role="group" aria-label="Import method"><button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}><UploadCloud size={16}/> Upload file</button><button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}><FileText size={16}/> Paste text</button></div><form className="iw-import-form" onSubmit={event => void importSource(event)}><label className="pc-field">Source title <span className="iw-optional">Optional</span><input className="pc-input" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} placeholder="e.g. Admissions handbook 2026"/></label>{mode === 'file' ? <label className="iw-file-drop" htmlFor="ingestion-file"><UploadCloud size={22}/><strong>{file?.name || 'Choose a file to import'}</strong><span>{file ? `${Math.ceil(file.size / 1024)} KB · ${file.type || 'Text file'}` : 'PDF, DOCX, TXT, MD, CSV, JSON, HTML or EML · up to 512 KB'}</span><input id="ingestion-file" type="file" accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.eml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json,text/html,message/rfc822" onChange={event => setFile(event.target.files?.[0] || null)}/></label> : <label className="pc-field">Source text<textarea className="pc-textarea iw-paste" rows={9} value={text} onChange={event => setText(event.target.value)} placeholder="Paste your product notes, website copy, FAQs, company handbook, or interview transcript…"/></label>}<div className="iw-form-bottom"><p>Nothing becomes agent knowledge until you approve it.</p><button className="pc-button primary" type="submit" disabled={busy === 'import' || (mode === 'file' ? !file : !text.trim())}>{busy === 'import' ? <LoaderCircle className="iw-spin" size={15}/> : <ArrowRight size={15}/>} {busy === 'import' ? 'Importing…' : 'Import source'}</button></div></form></div> : <div className="iw-pane">
          <div className="iw-pane-head"><div><h3>{detail.source.title}</h3><p>{detail.source.filename || (detail.source.kind === 'paste' ? 'Pasted source' : 'Imported source')} · Saved {new Date(detail.source.createdAt).toLocaleString()}</p></div><button className="pc-button quiet" type="button" onClick={() => { void loadDetail(detail.source.id).catch(failure => setError(failure instanceof Error ? failure.message : 'Could not refresh source.')); }}><RefreshCw size={14}/> Refresh</button></div>
          {stage === 'source' && <div className="iw-stage-body"><div className="iw-stage-intro"><h4>Original material</h4><p>This saved source is the evidence for every suggestion. Its title, kind and content remain available for review.</p></div><div className="iw-info-grid"><span><small>Source type</small><strong>{detail.source.format.toUpperCase()}</strong></span><span><small>Imported</small><strong>{new Date(detail.source.createdAt).toLocaleDateString()}</strong></span><span><small>Source ID</small><strong className="iw-id">{detail.source.id.slice(0, 14)}…</strong></span></div><pre className="iw-raw">{detail.source.rawText || detail.source.text}</pre><button className="pc-button primary" type="button" onClick={() => setStage('normalize')}>Inspect prepared text <ArrowRight size={15}/></button></div>}
          {stage === 'normalize' && <div className="iw-stage-body"><div className="iw-stage-intro"><h4>Prepared for extraction</h4><p>The source is split into readable passages. Open each passage to see exactly what the AI can cite.</p></div>{detail.source.truncated && <p className="iw-caution">This source was shortened for analysis. {detail.source.omittedChars.toLocaleString()} characters were omitted; review the original before approval.</p>}<div className="iw-blocks">{detail.source.blocks.map((block, index) => <details key={block.id} open={index === 0}><summary>Passage {index + 1} <span>{block.text.length.toLocaleString()} characters</span></summary><p>{block.text}</p></details>)}</div><div className="iw-actions"><button className="pc-button primary" type="button" disabled={!!busy || detail.job?.status === 'running'} onClick={() => void analyze(!!detail.proposal || detail.job?.status === 'failed')}>{busy === 'analyze' || detail.job?.status === 'running' ? <LoaderCircle className="iw-spin" size={15}/> : <Sparkles size={15}/>} {detail.job?.status === 'running' ? 'Extracting…' : busy === 'analyze' ? 'Starting…' : detail.proposal ? 'Run extraction again' : detail.job?.status === 'failed' ? 'Start a new extraction attempt' : 'Extract suggestions'}</button></div></div>}
          {stage === 'extract' && <div className="iw-stage-body"><div className="iw-stage-intro"><h4>AI extraction</h4><p>Suggestions are anchored to quoted passages. Check each one before it becomes usable knowledge.</p></div>{detail.job?.status === 'running' ? <div className="iw-processing" role="status"><LoaderCircle className="iw-spin" size={20}/><div><strong>Reading the saved source</strong><p>The result will appear here when extraction finishes. You can leave this page and return.</p></div></div> : detail.job?.status === 'failed' ? <div className="iw-alert" role="alert">{detail.job.error || 'Extraction failed. You can try again from Prepare.'}</div> : detail.proposal ? <><p className="iw-summary">{candidates.length} suggestion{candidates.length === 1 ? '' : 's'} extracted from {detail.proposal.analyzedChunks} of {detail.proposal.totalChunks} passages.</p>{detail.proposal.notes?.length ? <ul className="iw-notes">{detail.proposal.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}<button className="pc-button primary" type="button" onClick={() => setStage('review')}>Review suggestions <ArrowRight size={15}/></button></> : <button className="pc-button primary" type="button" onClick={() => setStage('normalize')}>Prepare and extract <ArrowRight size={15}/></button>}</div>}
          {stage === 'review' && <div className="iw-stage-body"><div className="iw-stage-intro"><h4>Review suggestions</h4><p>Select the company facts, offerings and answers you want to approve. Contacts need separate customer review; source material never grants outreach consent. Action ideas remain review only.</p></div>{!detail.proposal ? <div className="iw-empty"><p>Run extraction to see source-backed suggestions here.</p><button className="pc-button" type="button" onClick={() => setStage('normalize')}>Go to Prepare</button></div> : candidates.length ? <><div className="iw-review-layout"><div className="iw-candidate-list" aria-label="Extracted suggestions">{candidates.map(candidate => <div className="iw-candidate-row" key={candidate.id} data-active={active?.id === candidate.id}><button type="button" className="iw-candidate-open" onClick={() => setActiveCandidate(candidate.id)} aria-current={active?.id === candidate.id ? 'true' : undefined}><span className="iw-candidate-label"><small>{typeName[candidate.type]}</small><strong>{candidate.title}</strong></span><span className="iw-candidate-status" data-status={candidate.status}>{candidate.status === 'review_only' ? 'Review only' : candidate.status === 'linked_customer' ? 'Customer linked' : candidate.status}</span></button>{(candidate.status === 'pending' || candidate.status === 'review_only') && <label className="iw-candidate-check"><input type="checkbox" checked={selectedCandidates.includes(candidate.id)} onChange={() => toggle(candidate.id)}/><span>{candidate.status === 'review_only' || candidate.issues.length ? 'Select to reject' : 'Select for decision'}</span></label>}</div>)}</div>{active && <article className="iw-evidence" aria-label="Selected suggestion evidence"><div className="iw-evidence-header"><span>{typeName[active.type]} · {active.confidence} confidence</span><strong>{active.title}</strong></div><div className="iw-evidence-scroll"><div className="iw-evidence-part"><small>Proposed knowledge</small><p>{active.content}</p></div><div className="iw-evidence-part"><small>From the source</small><blockquote>{sourceExcerpt(detail.source, active)}</blockquote><span className="iw-ref">Passage {Math.max(1, detail.source.blocks.findIndex(item => item.id === active.sourceRef.blockId) + 1)} · quoted excerpt</span></div>{active.type !== 'contact' && (active.status === 'pending' || active.status === 'review_only') && <CandidateTypeReview key={active.id} sourceId={detail.source.id} candidate={active} revision={detail.proposal.revision} onClassified={async () => { await loadDetail(detail.source.id); setNotice('Type review saved. Review the corrected suggestion.'); }}/>}{active.type === 'contact' && (active.status === 'review_only' || active.status === 'linked_customer') && <ContactImportReview key={active.id} sourceId={detail.source.id} candidate={active} revision={detail.proposal.revision} onLinked={async () => { await loadDetail(detail.source.id); await onApplied(); }} navigate={navigate}/>}{active.uncertainty && <div className="iw-evidence-part iw-uncertainty"><small>Check before approval</small><p>{active.uncertainty}</p></div>}{active.issues?.length ? <div className="iw-evidence-part iw-uncertainty"><small>Potential conflicts</small><ul>{active.issues.map((issue, index) => <li key={index}>{issue.replaceAll('_', ' ')}</li>)}</ul></div> : null}{(!publishable(active) || active.issues.length > 0) && <p className="iw-review-only">{active.type === 'contact' ? 'Review this contact separately to create a customer record without consent.' : active.issues.includes('possible_customer_record') ? 'This looks like a customer record. Correct its type before creating the customer; it cannot be company knowledge.' : !publishable(active) ? 'This suggestion remains review only. It cannot be published as company knowledge here.' : 'This suggestion has a potential duplicate or conflict. Reject it here; resolve the source before extracting again.'}</p>}</div></article>}</div><div className="iw-review-actions"><span>{selectedCandidates.length ? `${selectedCandidates.length} selected` : 'Select suggestions to decide'}</span><div><button className="pc-button" type="button" disabled={!!busy || !selectedCandidates.length} onClick={() => void decide('reject')}>Reject selected</button><button className="pc-button primary" type="button" disabled={!!busy || !selectedPending.length || selectedPending.length !== selectedCandidates.length} onClick={() => void decide('apply')}>{busy === 'apply' ? 'Approving…' : `Approve ${selectedPending.length || ''} selected`}</button></div></div></> : <div className="iw-empty"><p>Extraction found no source-backed suggestions to review. Add a clearer source or inspect the prepared text.</p><button className="pc-button" type="button" onClick={() => setStage('normalize')}>Inspect source</button></div>}</div>}
          {stage === 'ready' && <div className="iw-stage-body"><div className="iw-stage-intro"><h4>Usable company knowledge</h4><p>Only approved suggestions appear here. New agent versions can use this knowledge after you review and capture their configuration.</p></div>{approved.length ? <><div className="iw-approved-list">{approved.map(item => <div key={item.id}><CheckCircle2 size={16}/><span><strong>{item.title}</strong><small>{typeName[item.type]} · {item.content}</small></span></div>)}</div><div className="iw-actions"><button className="pc-button primary" type="button" onClick={() => navigate('agents')}>Use in Agents <ArrowRight size={15}/></button><button className="pc-button" type="button" onClick={() => navigate('campaigns')}>Open Campaigns <ArrowRight size={15}/></button></div></> : <div className="iw-empty"><p>No suggestions from this source have been approved yet.</p><button className="pc-button" type="button" onClick={() => setStage(detail.proposal ? 'review' : 'normalize')}>{detail.proposal ? 'Review suggestions' : 'Prepare source'}</button></div>}</div>}
        </div>}
      </div>
    </div>
  </section>;
}
