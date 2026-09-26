'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, FileQuestion, Link2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import type { PlatformRecord, WorkspaceData } from '../lib/platform/contracts';
import type { BusinessDiscovery, BusinessSignal, BusinessSource, Offering, SourceAnchorRef } from '../lib/business/contracts';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import { OfferingInsights } from './offering-insights';
import '../app/company-model.css';

type Context = {
  offerings: PlatformRecord<Offering>[];
  signals: PlatformRecord<BusinessSignal>[];
  sources: BusinessSource[];
  discoveries: PlatformRecord<BusinessDiscovery>[];
};
type Response = Partial<Context> & { discovery?: BusinessDiscovery; record?: PlatformRecord; source?: PlatformRecord; error?: string; message?: string };
type Props = { workspace: WorkspaceData; navigate: (section: string, recordId?: string) => void; onSourceIntake: () => void; onChanged?: () => Promise<void> | void };
type Detail = 'offering' | 'signal';
const empty: Context = { offerings: [], signals: [], sources: [], discoveries: [] };
const asText = (value: unknown): string => typeof value === 'string' ? value : '';

async function api(body?: Record<string, unknown>): Promise<Response> {
  const response = await fetch('/api/business-context', { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data: Response = {};
  try { data = await response.json() as Response; } catch { /* HTTP error below remains actionable. */ }
  if (!response.ok) throw new Error(data.error || data.message || `Could not load company model (${response.status}).`);
  return data;
}

function sourceState(ref: SourceAnchorRef, sources: BusinessSource[]): 'current' | 'changed' | 'unavailable' {
  const source = sources.find(item => item.id === ref.sourceId);
  if (!source) return 'unavailable';
  return source.revision === ref.revision && source.digest === ref.digest && source.content.slice(ref.start, ref.end) === ref.quote ? 'current' : 'changed';
}

function Evidence({ refs, sources, navigate }: { refs: SourceAnchorRef[]; sources: BusinessSource[]; navigate: Props['navigate'] }) {
  return <div className="cm-evidence-list">{refs.map((ref, index) => { const source = sources.find(item => item.id === ref.sourceId); const state = sourceState(ref, sources); return <div className="cm-evidence" key={`${ref.sourceId}-${index}`}><div className="cm-evidence-head"><strong>{source?.title || 'Source unavailable'}</strong><span className="pc-badge" data-status={state === 'current' ? 'approved' : 'failed'}>{state === 'current' ? 'Current quote' : state === 'changed' ? 'Source changed' : 'Source unavailable'}</span></div><blockquote>{ref.quote}</blockquote><div className="cm-evidence-foot"><span>Source revision {ref.revision} · span {ref.start}–{ref.end}</span><button type="button" className="cm-text-button" onClick={() => navigate('brain', ref.sourceId)}>Open source</button></div></div>; })}</div>;
}

export function CompanyModelWorkbench({ workspace, navigate, onSourceIntake, onChanged }: Props) {
  const [context, setContext] = useState<Context>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sourceChooser, setSourceChooser] = useState(false);
  const [detail, setDetail] = useState<Detail>('offering');
  const [offeringId, setOfferingId] = useState('');
  const [signalId, setSignalId] = useState('');
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'service' as Offering['kind'], summary: '', audienceDescription: '', openQuestions: '', sourceId: '', quote: '' });
  const [signalForm, setSignalForm] = useState({ title: '', observation: '', interpretation: '', uncertainty: '', suggestedAction: '', sourceId: '', quote: '' });
  const [linkOffering, setLinkOffering] = useState('');
  const [linkCustomer, setLinkCustomer] = useState('');
  const [questionIndex, setQuestionIndex] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [answerDraft, setAnswerDraft] = useState<PlatformRecord | null>(null);
  const viewer = workspace.user.role === 'viewer';

  const reload = useCallback(async () => {
    const result = await api();
    setContext({ offerings: result.offerings || [], signals: result.signals || [], sources: result.sources || [], discoveries: result.discoveries || [] });
    return result;
  }, []);
  useEffect(() => { let live = true; void reload().catch(cause => { if (live) setError(cause instanceof Error ? cause.message : 'Could not load the company model.'); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [reload]);
  useEffect(() => { setSelectedSources(current => current.filter(id => context.sources.some(source => source.id === id))); }, [context.sources]);
  useEffect(() => { if (!offeringId && context.offerings[0]) setOfferingId(context.offerings[0].id); if (offeringId && !context.offerings.some(item => item.id === offeringId)) setOfferingId(context.offerings[0]?.id || ''); }, [context.offerings, offeringId]);
  useEffect(() => { if (!signalId && context.signals[0]) setSignalId(context.signals[0].id); if (signalId && !context.signals.some(item => item.id === signalId)) setSignalId(context.signals[0]?.id || ''); }, [context.signals, signalId]);
  const selectedOffering = context.offerings.find(item => item.id === offeringId);
  const selectedSignal = context.signals.find(item => item.id === signalId);
  const offeringCurrent = selectedOffering?.data.sourceRefs.every(ref => sourceState(ref, context.sources) === 'current') ?? false;
  const signalCurrent = selectedSignal?.data.sourceRefs.every(ref => sourceState(ref, context.sources) === 'current') ?? false;
  useEffect(() => { setLinkOffering(selectedSignal?.data.offeringId || ''); setLinkCustomer(selectedSignal?.data.contactId || ''); }, [selectedSignal?.id, selectedSignal?.revision]);
  const latest = context.discoveries[0];
  const questions = latest?.data.questions || [];
  const approvedAnswerFor = (question: string) => {
    const prefix = `Question: ${question}\nFounder answer:`;
    return context.sources.find(source => source.content.startsWith(prefix));
  };
  const unansweredQuestionCount = questions.filter(question => !approvedAnswerFor(question)).length;
  const selectedSourceDetails = context.sources.filter(source => selectedSources.includes(source.id));
  const approvedOfferings = context.offerings.filter(item => item.status === 'approved');
  const sourceDigestKey = useMemo(() => selectedSourceDetails.map(source => ({ id: source.id, revision: source.revision, digest: source.digest })).sort((a, b) => a.id.localeCompare(b.id)), [selectedSourceDetails]);

  const mutate = async (action: string, fields: Record<string, unknown>, success: string): Promise<Response | null> => {
    setBusy(action); setError(''); setNotice('');
    try { const result = await api({ action, ...fields }); await reload(); await onChanged?.(); setNotice(success); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Refresh and try again.'); return null; }
    finally { setBusy(''); }
  };
  const discover = async (newAttempt = false) => {
    if (viewer || selectedSourceDetails.length === 0 || busy) return;
    setBusy('discover'); setError(''); setNotice('');
    try {
      const requestId = newAttempt ? await newAiRequestAttempt('business-context-discovery', sourceDigestKey) : await aiRequestId('business-context-discovery', sourceDigestKey);
      const result = await api({ action: 'discover', requestId, sourceIds: selectedSourceDetails.map(item => item.id) });
      await reload();
      await onChanged?.();
      const first = result.discovery?.offeringIds[0];
      if (first) { setOfferingId(first); setDetail('offering'); }
      setNotice('Suggestions saved. Review each offering and signal before using them.');
    } catch (cause) { await reload().catch(() => {}); setError(cause instanceof Error ? cause.message : 'Discovery could not finish. Retry with the same request.'); }
    finally { setBusy(''); }
  };
  const chooseOffering = (item: PlatformRecord<Offering>) => { setOfferingId(item.id); setDetail('offering'); setEditing(false); setManual(false); setQuestionIndex(null); };
  const chooseSignal = (item: PlatformRecord<BusinessSignal>) => { setSignalId(item.id); setDetail('signal'); setEditing(false); setManual(false); setLinkOffering(item.data.offeringId || ''); setLinkCustomer(item.data.contactId || ''); setQuestionIndex(null); };
  const beginOffering = (item?: PlatformRecord<Offering>) => {
    setManual(!item); setEditing(true); setDetail('offering'); setQuestionIndex(null);
    setForm(item ? { name: item.data.name, kind: item.data.kind, summary: item.data.summary, audienceDescription: item.data.audienceDescription, openQuestions: item.data.openQuestions.join('\n'), sourceId: item.data.sourceRefs[0]?.sourceId || '', quote: item.data.sourceRefs[0]?.quote || '' } : { name: '', kind: 'service', summary: '', audienceDescription: '', openQuestions: '', sourceId: selectedSourceDetails[0]?.id || context.sources[0]?.id || '', quote: '' });
  };
  const beginSignal = (item?: PlatformRecord<BusinessSignal>) => {
    setManual(!item); setEditing(true); setDetail('signal'); setQuestionIndex(null);
    setSignalForm(item ? { title: item.data.title, observation: item.data.observation, interpretation: item.data.interpretation || '', uncertainty: item.data.uncertainty.join('\n'), suggestedAction: item.data.suggestedAction || '', sourceId: item.data.sourceRefs[0]?.sourceId || '', quote: item.data.sourceRefs[0]?.quote || '' } : { title: '', observation: '', interpretation: '', uncertainty: '', suggestedAction: '', sourceId: selectedSourceDetails[0]?.id || context.sources[0]?.id || '', quote: '' });
  };
  const exactRef = (sourceId: string, quote: string) => {
    const source = context.sources.find(item => item.id === sourceId);
    if (!source) throw new Error('Choose an approved company source.');
    if (!quote.trim() || !source.content.includes(quote.trim())) throw new Error('The evidence quote must match the approved source exactly.');
    return [{ sourceId, quote: quote.trim() }];
  };
  const saveOffering = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const firstRef = exactRef(form.sourceId, form.quote);
      const retainedRefs = !manual && selectedOffering ? selectedOffering.data.sourceRefs.slice(1).map(({ sourceId, quote }) => ({ sourceId, quote })) : [];
      const fields = { name: form.name.trim(), kind: form.kind, summary: form.summary.trim(), audienceDescription: form.audienceDescription.trim(), openQuestions: form.openQuestions.split('\n').map(s => s.trim()).filter(Boolean), sourceRefs: [...firstRef, ...retainedRefs] };
      const result = await mutate(manual ? 'offering.create' : 'offering.update', { ...fields, ...(!manual && selectedOffering ? { id: selectedOffering.id, revision: selectedOffering.revision } : {}) }, 'Offering draft saved. Review its evidence before approval.');
      if (result?.record) setOfferingId(result.record.id);
      if (result) { setEditing(false); setManual(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Choose an exact source quote.'); }
  };
  const saveSignal = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const firstRef = exactRef(signalForm.sourceId, signalForm.quote);
      const retainedRefs = !manual && selectedSignal ? selectedSignal.data.sourceRefs.slice(1).map(({ sourceId, quote }) => ({ sourceId, quote })) : [];
      const fields = { title: signalForm.title.trim(), observation: signalForm.observation.trim(), interpretation: signalForm.interpretation.trim(), uncertainty: signalForm.uncertainty.split('\n').map(s => s.trim()).filter(Boolean), suggestedAction: signalForm.suggestedAction.trim(), sourceRefs: [...firstRef, ...retainedRefs] };
      const result = await mutate(manual ? 'signal.create' : 'signal.update', { ...fields, ...(!manual && selectedSignal ? { id: selectedSignal.id, revision: selectedSignal.revision } : {}) }, 'Signal saved for explicit review.');
      if (result?.record) setSignalId(result.record.id);
      if (result) { setEditing(false); setManual(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Choose an exact source quote.'); }
  };
  const saveAnswer = async (question: string) => {
    const related = selectedOffering?.data.openQuestions.includes(question) ? ` · ${selectedOffering.data.name}` : '';
    const result = await mutate('clarification.create', { title: `Founder clarification${related}: ${question}`.slice(0, 200), content: `Question: ${question}\nFounder answer: ${answer.trim()}` }, 'Your answer is saved as a draft company source. Review it before approval.');
    if (result?.source) setAnswerDraft(result.source);
  };
  const approveAnswer = async () => {
    if (!answerDraft) return;
    const result = await mutate('clarification.approve', { sourceId: answerDraft.id, revision: answerDraft.revision }, 'Founder answer approved as a source. Edit the offering to cite it and resolve its open question.');
    if (result) { setAnswerDraft(null); setAnswer(''); }
  };
  const sourceCount = context.sources.length;

  return <section className="cm-workbench" aria-labelledby="cm-title">
    <div className="cm-heading"><div><h2 id="cm-title">What your company offers</h2><p>Build a reviewed picture of products, services and business signals from your approved material.</p></div><button type="button" className="pc-button quiet" onClick={() => { setLoading(true); void reload().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh.')).finally(() => setLoading(false)); }}><RefreshCw size={14}/> Refresh</button></div>
    <ol className="cm-path" aria-label="Company model path"><li><BookOpen size={16}/><span><strong>Approved sources</strong><small>{loading ? 'Loading…' : `${sourceCount} available`}</small></span></li><li><ArrowRight size={15} className="cm-path-arrow"/><span><strong>Offerings</strong><small>{context.offerings.filter(item => item.status === 'approved').length} approved</small></span></li><li><ArrowRight size={15} className="cm-path-arrow"/><span><strong>Business signals</strong><small>{context.signals.filter(item => item.status === 'approved').length} reviewed</small></span></li><li><ArrowRight size={15} className="cm-path-arrow"/><span><strong>Campaign</strong><small>Plan with reviewed context</small></span></li></ol>
    {error && <div className="cm-alert cm-error" role="alert">{error}</div>}{notice && <div className="cm-alert cm-success" role="status">{notice}</div>}
    {loading ? <div className="cm-loading" role="status"><div/><div/><div/></div> : sourceCount === 0 ? <div className="cm-first-run"><BookOpen size={23}/><div><h3>Start with a reviewed company source</h3><p>Import a document or paste company material in Source intake, inspect the extracted facts, and approve the source. Then come back to discover offerings and business signals.</p></div><button type="button" className="pc-button primary" onClick={onSourceIntake}>Open source intake <ArrowRight size={14}/></button></div> : <>
      <div className="cm-discovery"><div><h3>Discover from company sources</h3><p>Select up to three approved sources. Discovery saves suggestions for review; it does not approve or link them.</p><button type="button" className="cm-source-toggle" aria-expanded={sourceChooser} onClick={() => setSourceChooser(!sourceChooser)}>{selectedSources.length ? `${selectedSources.length} selected · ${sourceCount - selectedSources.length} omitted` : `Choose from ${sourceCount} approved sources`} <ChevronDown size={15}/></button></div><div className="cm-discovery-actions"><button type="button" className="pc-button primary" disabled={viewer || busy !== '' || selectedSources.length === 0} onClick={() => void discover()}><Sparkles size={15}/>{busy === 'discover' ? 'Discovering…' : 'Discover offerings and signals'}</button>{latest && <button type="button" className="pc-button quiet" disabled={viewer || busy !== '' || selectedSources.length === 0} onClick={() => void discover(true)}>Start a new discovery attempt</button>}</div></div>
      {sourceChooser && <div className="cm-source-chooser" aria-label="Approved sources for discovery">{context.sources.map(source => <label key={source.id} className="cm-source-option"><input type="checkbox" checked={selectedSources.includes(source.id)} disabled={viewer || (!selectedSources.includes(source.id) && selectedSources.length >= 3)} onChange={event => setSelectedSources(event.target.checked ? [...selectedSources, source.id] : selectedSources.filter(id => id !== source.id))}/><span><strong>{source.title}</strong><small>Approved · revision {source.revision} · {source.content.length.toLocaleString()} characters</small></span></label>)}<p>Only selected sources go into this request. Other approved sources are omitted.</p></div>}
      {latest && <div className="cm-run"><span><Check size={14}/> Latest discovery saved · {new Date(latest.createdAt).toLocaleString()}</span><span>{latest.data.offeringIds.length} offerings · {latest.data.signalIds.length} signals · {questions.length} questions</span>{latest.data.usage && <span>{latest.data.usage.inputTokens.toLocaleString()} input + {latest.data.usage.outputTokens.toLocaleString()} output tokens</span>}</div>}
      <div className="cm-layout"><aside className="cm-library pc-panel"><div className="cm-library-head"><h3>Offerings</h3><span>{context.offerings.length}</span></div><div className="cm-library-list">{context.offerings.map(item => <button type="button" key={item.id} aria-current={detail === 'offering' && offeringId === item.id} onClick={() => chooseOffering(item)}><span><strong>{item.data.name}</strong><small>{item.data.kind} · {item.status}</small></span></button>)}{context.offerings.length === 0 && <p>No offerings discovered yet.</p>}</div><div className="cm-library-head"><h3>Business signals</h3><span>{context.signals.length}</span></div><div className="cm-library-list">{context.signals.map(item => <button type="button" key={item.id} aria-current={detail === 'signal' && signalId === item.id} onClick={() => chooseSignal(item)}><span><strong>{item.data.title}</strong><small>{item.status}{item.data.offeringId ? ' · linked offering' : ''}</small></span></button>)}{context.signals.length === 0 && <p>No signals proposed yet.</p>}</div>{!viewer && <div className="cm-library-actions"><button type="button" className="cm-text-button" onClick={() => beginOffering()}><Plus size={14}/> Add offering from source</button><button type="button" className="cm-text-button" onClick={() => beginSignal()}><Plus size={14}/> Add signal from source</button></div>}</aside>
      <div className="cm-detail pc-panel">{editing ? <><div className="cm-detail-head"><div><h3>{detail === 'offering' ? manual ? 'Add an offering' : 'Edit offering draft' : manual ? 'Add a signal' : 'Revise signal'}</h3><p>Use an exact quote from an approved source. Saving creates a draft for review.</p></div></div>{detail === 'offering' ? <form className="pc-form cm-form" onSubmit={event => void saveOffering(event)}><div className="cm-form-row"><label className="pc-field">Name<input className="pc-input" required maxLength={160} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label className="pc-field">Type<select className="pc-select" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as Offering['kind'] })}><option value="service">Service</option><option value="product">Product</option></select></label></div><label className="pc-field">What it includes<textarea className="pc-textarea" required maxLength={2000} value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })}/></label><label className="pc-field">Who it serves<input className="pc-input" required maxLength={1000} value={form.audienceDescription} onChange={event => setForm({ ...form, audienceDescription: event.target.value })}/></label><label className="pc-field">Open questions <small>One per line, if any</small><textarea className="pc-textarea" value={form.openQuestions} onChange={event => setForm({ ...form, openQuestions: event.target.value })}/></label><SourceQuote sources={context.sources} sourceId={form.sourceId} quote={form.quote} setSourceId={sourceId => setForm({ ...form, sourceId, quote: '' })} setQuote={quote => setForm({ ...form, quote })}/><div className="cm-form-actions"><button type="submit" className="pc-button primary" disabled={!!busy}>Save draft</button><button type="button" className="pc-button quiet" onClick={() => { setEditing(false); setManual(false); }}>Cancel</button></div></form> : <form className="pc-form cm-form" onSubmit={event => void saveSignal(event)}><label className="pc-field">Signal title<input className="pc-input" required maxLength={160} value={signalForm.title} onChange={event => setSignalForm({ ...signalForm, title: event.target.value })}/></label><label className="pc-field">Factual observation<textarea className="pc-textarea" required maxLength={2000} value={signalForm.observation} onChange={event => setSignalForm({ ...signalForm, observation: event.target.value })}/></label><label className="pc-field">Your interpretation <small>Kept separate from the source fact</small><textarea className="pc-textarea" value={signalForm.interpretation} onChange={event => setSignalForm({ ...signalForm, interpretation: event.target.value })}/></label><label className="pc-field">Uncertainty <small>One concern per line</small><textarea className="pc-textarea" value={signalForm.uncertainty} onChange={event => setSignalForm({ ...signalForm, uncertainty: event.target.value })}/></label><label className="pc-field">Possible next action<input className="pc-input" value={signalForm.suggestedAction} onChange={event => setSignalForm({ ...signalForm, suggestedAction: event.target.value })}/></label><SourceQuote sources={context.sources} sourceId={signalForm.sourceId} quote={signalForm.quote} setSourceId={sourceId => setSignalForm({ ...signalForm, sourceId, quote: '' })} setQuote={quote => setSignalForm({ ...signalForm, quote })}/><div className="cm-form-actions"><button type="submit" className="pc-button primary" disabled={!!busy}>Save for review</button><button type="button" className="pc-button quiet" onClick={() => { setEditing(false); setManual(false); }}>Cancel</button></div></form>}</> : detail === 'offering' && selectedOffering ? <><div className="cm-detail-head"><div><h3>{selectedOffering.data.name}</h3><p>{selectedOffering.data.kind === 'service' ? 'Service' : 'Product'} · revision {selectedOffering.revision}</p></div><div className="cm-statuses"><span className="pc-badge" data-status={selectedOffering.status}>{selectedOffering.status}</span><span className="pc-badge" data-status={offeringCurrent ? 'approved' : 'failed'}>{offeringCurrent ? 'Evidence current' : 'Evidence changed'}</span></div></div><div className="cm-summary"><span>What it includes</span><p>{selectedOffering.data.summary}</p><span>Who it serves</span><p>{selectedOffering.data.audienceDescription}</p></div>{selectedOffering.data.openQuestions.length > 0 && <div className="cm-questions"><strong>Still to clarify</strong><ul>{selectedOffering.data.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul><p>Approval waits until these questions are answered by approved source evidence and removed from this draft.</p></div>}<div className="cm-detail-section"><h4>Source evidence</h4><Evidence refs={selectedOffering.data.sourceRefs} sources={context.sources} navigate={navigate}/></div>{!viewer && <div className="cm-detail-actions"><button type="button" className="pc-button" onClick={() => beginOffering(selectedOffering)}>{selectedOffering.status === 'approved' ? 'Revise offering' : 'Edit draft'}</button>{selectedOffering.status !== 'approved' && selectedOffering.status !== 'retired' && <button type="button" className="pc-button primary" disabled={!!busy || selectedOffering.data.openQuestions.length > 0} onClick={() => void mutate('offering.approve', { id: selectedOffering.id, revision: selectedOffering.revision }, 'Offering approved. It is available to campaign planning.')}>Approve offering</button>}{selectedOffering.status === 'approved' && <button type="button" className="pc-button danger" disabled={!!busy} onClick={() => void mutate('offering.retire', { id: selectedOffering.id, revision: selectedOffering.revision }, 'Offering retired. It is no longer current.')}>Retire offering</button>}</div>}{selectedOffering.status === 'approved' && !offeringCurrent && <p className="cm-stale">The supporting source changed or is unavailable. Revise and review this offering against current evidence before using it in a new campaign.</p>}{selectedOffering.status === 'approved' && offeringCurrent && <div className="cm-next"><div><strong>Ready for a campaign</strong><p>Use this reviewed offering when setting a goal and planning a customer campaign.</p></div><button type="button" className="pc-button" onClick={() => navigate('campaigns', `offering:${selectedOffering.id}`)}>Create campaign for this offering <ArrowRight size={14}/></button></div>}{(selectedOffering.status === 'approved' || selectedOffering.status === 'retired') && <details className="cm-outcomes"><summary>Campaign results and reviewed feedback</summary><OfferingInsights offeringId={selectedOffering.id} navigate={navigate}/></details>}</> : detail === 'signal' && selectedSignal ? <><div className="cm-detail-head"><div><h3>{selectedSignal.data.title}</h3><p>Business signal · revision {selectedSignal.revision}</p></div><div className="cm-statuses"><span className="pc-badge" data-status={selectedSignal.status}>{selectedSignal.status}</span><span className="pc-badge" data-status={signalCurrent ? 'approved' : 'failed'}>{signalCurrent ? 'Evidence current' : 'Evidence changed'}</span></div></div><div className="cm-summary"><span>Observed in source</span><p>{selectedSignal.data.observation}</p>{selectedSignal.data.interpretation && <><span>{selectedSignal.status === 'approved' ? 'Reviewed interpretation' : 'Interpretation · needs review'}</span><p>{selectedSignal.data.interpretation}</p></>}{selectedSignal.data.suggestedAction && <><span>Possible next action</span><p>{selectedSignal.data.suggestedAction}</p></>}</div>{selectedSignal.data.uncertainty.length > 0 && <div className="cm-questions"><strong>Uncertainty</strong><ul>{selectedSignal.data.uncertainty.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}<div className="cm-detail-section"><h4>Source evidence</h4><Evidence refs={selectedSignal.data.sourceRefs} sources={context.sources} navigate={navigate}/></div><div className="cm-binding"><h4><Link2 size={15}/> Review links</h4><p>Link only after checking that this signal concerns the selected offering or customer. A customer link does not grant contact consent.</p><label className="pc-field">Offering<select className="pc-select" value={linkOffering} disabled={viewer || selectedSignal.status !== 'proposed'} onChange={event => setLinkOffering(event.target.value)}><option value="">No offering link</option>{approvedOfferings.map(item => <option key={item.id} value={item.id}>{item.data.name}</option>)}</select></label><label className="pc-field">Customer<select className="pc-select" value={linkCustomer} disabled={viewer || selectedSignal.status !== 'proposed'} onChange={event => setLinkCustomer(event.target.value)}><option value="">No customer link</option>{workspace.contacts.map(item => <option key={item.id} value={item.id}>{asText(item.name) || item.id}</option>)}</select></label>{selectedSignal.status === 'approved' && <p className="cm-linked">Reviewed: {selectedSignal.data.offeringId ? approvedOfferings.find(item => item.id === selectedSignal.data.offeringId)?.data.name || 'Offering no longer current' : 'No offering'} · {selectedSignal.data.contactId ? asText(workspace.contacts.find(item => item.id === selectedSignal.data.contactId)?.name) || 'Customer unavailable' : 'No customer'}</p>}</div>{!viewer && <div className="cm-detail-actions"><button type="button" className="pc-button" onClick={() => beginSignal(selectedSignal)}>Revise signal</button>{selectedSignal.status === 'proposed' && <><button type="button" className="pc-button primary" disabled={!!busy || !signalCurrent} onClick={() => void mutate('signal.review', { id: selectedSignal.id, revision: selectedSignal.revision, status: 'approved', offeringId: linkOffering, contactId: linkCustomer }, 'Signal approved with the links you selected.')}>Approve signal</button><button type="button" className="pc-button quiet" disabled={!!busy} onClick={() => void mutate('signal.review', { id: selectedSignal.id, revision: selectedSignal.revision, status: 'dismissed' }, 'Signal dismissed.')}>Dismiss</button></>}{selectedSignal.status === 'approved' && <button type="button" className="pc-button quiet" disabled={!!busy} onClick={() => void mutate('signal.review', { id: selectedSignal.id, revision: selectedSignal.revision, status: 'superseded' }, 'Signal marked superseded.')}>Mark superseded</button>}</div>}</> : <div className="cm-empty-detail"><Sparkles size={24}/><h3>Company model is ready to build</h3><p>Run discovery on selected approved sources, or add an offering from exact source text. Suggestions stay in review until you approve them.</p>{!viewer && <button type="button" className="pc-button" onClick={() => beginOffering()}>Add an offering from a source</button>}</div>}</div></div>
      {questions.length > 0 && <section className="cm-clarifications">
        <div className="cm-clarification-head"><FileQuestion size={20}/><div><h3>Questions for the founder</h3><p>{unansweredQuestionCount} of {questions.length} unanswered. Approved answers remain visible here as source history.</p></div><span className="pc-badge">{unansweredQuestionCount} unanswered</span></div>
        <div className="cm-question-list">{questions.map((question, index) => {
          const approvedSource = approvedAnswerFor(question);
          const prefix = `Question: ${question}\nFounder answer:`;
          const expanded = questionIndex === index;
          return <div className="cm-question" key={`${latest?.id}-${index}`}>
            <button type="button" aria-expanded={expanded} onClick={() => { setQuestionIndex(expanded ? null : index); setAnswer(''); setAnswerDraft(null); }}><span className="cm-question-copy"><strong>{question}</strong><small className={approvedSource ? 'is-approved' : ''}>{approvedSource ? 'Approved answer' : 'Needs answer'}</small></span><ChevronDown size={16}/></button>
            {expanded && approvedSource && <div className="cm-approved-answer"><span>Approved answer</span><p>{approvedSource.content.slice(prefix.length).trim()}</p><button type="button" className="pc-button quiet" onClick={() => navigate('brain', approvedSource.id)}>Open source to revise</button></div>}
            {expanded && !approvedSource && !viewer && <div className="cm-answer"><label className="pc-field">Your answer<textarea className="pc-textarea" value={answer} maxLength={5000} onChange={event => setAnswer(event.target.value)} placeholder="Describe what is true today, including limits or exceptions."/></label>{answerDraft ? <div className="cm-answer-review"><p>Saved as a draft source. Review your answer above, then approve it explicitly.</p><button type="button" className="pc-button primary" disabled={!!busy} onClick={() => void approveAnswer()}>Approve answer as source</button></div> : <button type="button" className="pc-button" disabled={!!busy || !answer.trim()} onClick={() => void saveAnswer(question)}>Save draft answer</button>}</div>}
          </div>;
        })}</div>
      </section>}
    </>}
  </section>;
}

function SourceQuote({ sources, sourceId, quote, setSourceId, setQuote }: { sources: BusinessSource[]; sourceId: string; quote: string; setSourceId: (id: string) => void; setQuote: (quote: string) => void }) {
  const source = sources.find(item => item.id === sourceId);
  return <div className="cm-quote-entry"><label className="pc-field">Approved source<select className="pc-select" required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Choose a source</option>{sources.map(item => <option key={item.id} value={item.id}>{item.title} · revision {item.revision}</option>)}</select></label>{source && <details><summary>Read source text for an exact quote</summary><div className="cm-source-text">{source.content}</div></details>}<label className="pc-field">Exact supporting quote<textarea className="pc-textarea" required maxLength={1000} value={quote} onChange={event => setQuote(event.target.value)} placeholder="Copy exact words from the approved source above."/><small>The quote must appear verbatim in the selected source.</small></label></div>;
}
