'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { IngestionWorkbench } from '../ingestion-workbench';
import { BrainAnswer } from '../brain-answer';
import { CompanyModelWorkbench } from '../company-model-workbench';
import { DataIntakeWorkbench } from '../data-intake-workbench';

type BrainTab = 'model' | 'sources' | 'answers';
const brainTabs: Array<{ id: BrainTab; label: string }> = [
  { id: 'model', label: 'Business model' },
  { id: 'sources', label: 'Source intake' },
  { id: 'answers', label: 'Ask company brain' },
];

export function BrainView({ records, workspace, act, busy, focusId, navigate }: PlatformViewProps) {
  const tableSourceId = focusId?.startsWith('table:') ? focusId.slice(6) || undefined : undefined;
  const [error, setError] = useState('');
  const [tab, setTab] = useState<BrainTab>(focusId ? 'sources' : 'model');
  const [intakeMode, setIntakeMode] = useState<'company' | 'customers'>(tableSourceId ? 'customers' : 'company');
  const intakeDirty = useRef(false), intakeBusy = useRef(false);
  const [navigationNotice, setNavigationNotice] = useState('');
  const onIntakeDirtyChange = useCallback((value: boolean) => { intakeDirty.current = value; }, []);
  const onIntakeBusyChange = useCallback((value: boolean) => { intakeBusy.current = value; }, []);
  const canLeaveIntake = useCallback(() => {
    if (intakeBusy.current) { setNavigationNotice('Wait for the current import step to finish before leaving.'); return false; }
    if (intakeDirty.current && !window.confirm('Leave without saving these import review changes? Your last saved review will remain available.')) return false;
    intakeDirty.current = false;
    setNavigationNotice('');
    return true;
  }, []);
  useEffect(() => {
    const navigation = (event: Event) => { if (!event.defaultPrevented && !canLeaveIntake()) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (intakeDirty.current || intakeBusy.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('relay:before-navigation', navigation);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('relay:before-navigation', navigation); window.removeEventListener('beforeunload', unload); };
  }, [canLeaveIntake]);
  const changeTab = (next: BrainTab) => { if (next !== tab && canLeaveIntake()) setTab(next); };
  const changeIntakeMode = (next: 'company' | 'customers') => { if (next !== intakeMode && canLeaveIntake()) setIntakeMode(next); };
  const canWrite = workspace.user.role !== 'viewer';
const safeAct = async (action: Parameters<typeof act>[0], body?: Parameters<typeof act>[1]): Promise<boolean> => { try { setError(''); await act(action, body); return true; } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); return false; } };
  const createSource = async () => { try { setError(''); const result = await act('brain.create', draft) as { id?: string } | undefined; if (result?.id) select(result.id); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); } };
  const sources = records.filter((record) => record.kind === 'brain_source');
  const feedback = records.filter((record) => record.kind === 'feedback');
  const [selected, select] = useState<string | null>(tableSourceId ? null : focusId || null);
  useEffect(() => { if (focusId) { setTab('sources'); setIntakeMode(tableSourceId ? 'customers' : 'company'); select(tableSourceId ? null : focusId); } }, [focusId, tableSourceId]);
  const [draft, setDraft] = useState({ title: '', content: '', sourceLabel: '' });
  const [correction, setCorrection] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [observation, setObservation] = useState('');
  const current = sources.find((item) => item.id === selected);
  useEffect(() => { setDraft(current ? { title: String(current.data.title), content: String(current.data.content), sourceLabel: String(current.data.sourceLabel) } : { title: '', content: '', sourceLabel: '' }); }, [selected, current?.revision]);
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = brainTabs.findIndex(item => item.id === tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % brainTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + brainTabs.length) % brainTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = brainTabs.length - 1;
    else return;
    event.preventDefault();
    if (!canLeaveIntake()) return;
    setTab(brainTabs[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };
  return <main className="pc-page iw-page"><header className="pc-pagehead"><div><h1>Company brain</h1><p className="pc-muted">Turn your real company material into source-backed knowledge for agents and campaigns.</p></div></header>{navigationNotice && <p className="pc-notice" role="status">{navigationNotice}</p>}<div className="pc-tabs" role="tablist" aria-label="Company brain sections">{brainTabs.map(item => <button key={item.id} id={`brain-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`brain-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)} onKeyDown={onTabKeyDown}>{item.label}</button>)}</div>{tab === 'model' && <div id="brain-panel-model" role="tabpanel" aria-labelledby="brain-tab-model"><CompanyModelWorkbench workspace={workspace} navigate={navigate} onSourceIntake={() => setTab('sources')} onChanged={async () => { await act('workspace.refresh'); }}/></div>}{tab === 'answers' && <div id="brain-panel-answers" role="tabpanel" aria-labelledby="brain-tab-answers">{workspace.user.role === 'viewer' ? <section className="pc-panel"><h2>Company answers</h2><p className="pc-muted">Answer requests are available to workspace operators. You can inspect the reviewed business model and approved sources here.</p></section> : <BrainAnswer onNavigate={navigate}/>}</div>}{tab === 'sources' && <div id="brain-panel-sources" role="tabpanel" aria-labelledby="brain-tab-sources">{workspace.user.role === 'viewer' ? <section className="pc-panel"><h2>Reviewed sources</h2><p className="pc-muted">You have read-only access to company sources.</p><div className="pc-list">{sources.filter(source => source.status === 'approved').map(source => <div className="pc-row" key={source.id}><BookOpen size={16}/><span><strong>{String(source.data.title)}</strong><small className="pc-muted">{String(source.data.sourceLabel || 'Company source')}</small></span><span className="pc-badge" data-status="approved">Approved</span></div>)}</div>{sources.filter(source => source.status === 'approved').length === 0 && <p className="pc-empty">No approved company sources yet.</p>}</section> : <><div className="pc-row" role="group" aria-label="Source intake type"><button type="button" className={`pc-button${intakeMode === 'company' ? ' primary' : ''}`} aria-pressed={intakeMode === 'company'} onClick={() => changeIntakeMode('company')}>Company material</button><button type="button" className={`pc-button${intakeMode === 'customers' ? ' primary' : ''}`} aria-pressed={intakeMode === 'customers'} onClick={() => changeIntakeMode('customers')}>Customer tables</button></div>{intakeMode === 'customers' ? <DataIntakeWorkbench sourceId={tableSourceId} canWrite={canWrite} onApplied={() => act('workspace.refresh')} onDirtyChange={onIntakeDirtyChange} onBusyChange={onIntakeBusyChange} onOpenCustomers={() => navigate('Customers')}/> : <><IngestionWorkbench onApplied={() => act('workspace.refresh')} navigate={navigate}/><details className="iw-manual" open={Boolean(current)}><summary>Write a source manually or review earlier knowledge</summary><div className="iw-manual-inner"><header className="pc-pagehead"><div><h2>Manual sources and feedback</h2><p className="pc-muted">Author and approve a source directly, or record an observation from a saved conversation.</p></div><button type="button" className="pc-button" onClick={() => select(null)}><Plus size={16}/> New source</button></header>{error && <p role="alert" className="pc-muted">{error}</p>}
    <div className="pc-split"><aside className="pc-panel"><h2>Sources</h2><div className="pc-list">{sources.map((source) => <button className="pc-row" type="button" key={source.id} aria-current={selected === source.id ? 'true' : undefined} onClick={() => select(source.id)}><BookOpen size={16}/><span><strong>{String(source.data.title)}</strong><small className="pc-muted">{String(source.data.sourceLabel)}</small></span><span className="pc-badge">{source.status}</span></button>)}</div>{sources.length === 0 && <p className="pc-empty">Add a staff-authored source to build your company knowledge.</p>}<h3>Earlier knowledge</h3><p className="pc-muted">Existing staff entries are shown for reference. Add them as reviewed sources before using them in new agent releases.</p><div className="pc-list">{workspace.knowledge.map((item) => <div className="pc-row" key={item.id}><span><strong>{String(item.title)}</strong><small className="pc-muted">Legacy entry</small></span></div>)}</div></aside>
      <section className="pc-panel"><div className="pc-pagehead"><div><p className="pc-muted">{current ? `Revision ${current.revision}` : 'New source'}</p><h2>{current ? String(current.data.title) : 'Add company source'}</h2></div>{current && <span className="pc-badge">{current.status}</span>}</div><p className="pc-muted">Enter a source manually. Its origin and approval state remain visible; this form does not extract or verify information automatically.</p><form className="pc-form" onSubmit={async (event) => { event.preventDefault(); if (current) await safeAct('brain.update', { ...draft, sourceId: current.id, revision: current.revision }); else await createSource(); }}><label className="pc-field">Title<input className="pc-input" required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label><label className="pc-field">Source or origin<input className="pc-input" required maxLength={300} value={draft.sourceLabel} onChange={(event) => setDraft({ ...draft, sourceLabel: event.target.value })} placeholder="Company handbook, owner interview, website page…"/></label><label className="pc-field">Content<textarea className="pc-textarea" required maxLength={50000} rows={12} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })}/></label><button type="submit" className="pc-button primary" disabled={busy}>{current ? 'Save as draft' : 'Create draft'}</button></form>{current && <div className="pc-form"><h3>Review</h3><p className="pc-muted">Approval makes this source eligible for new agent versions. Editing an approved source returns it to draft.</p>{current.status === 'draft' && <button className="pc-button" disabled={busy} onClick={() => safeAct('brain.approve', { sourceId: current.id, revision: current.revision })}>Approve source</button>}{current.status === 'approved' && <><label className="pc-field">Correction or revocation reason<input className="pc-input" maxLength={1000} value={correction} onChange={(event) => setCorrection(event.target.value)}/></label><button className="pc-button danger" disabled={busy || !correction.trim()} onClick={() => safeAct('brain.revoke', { sourceId: current.id, revision: current.revision, reason: correction })}>Revoke source</button></>}{current.status === 'revoked' && <p className="pc-muted">Revoked: {String(current.data.correctionReason || '')}. Edit to make a corrected draft.</p>}</div>}</section>
      <aside className="pc-panel">
        <h2>Customer feedback</h2>
        <p className="pc-muted">Record a staff observation against an actual saved conversation. This is a manual interpretation of that evidence.</p>
        <form className="pc-form" onSubmit={async (event) => { event.preventDefault(); if (await safeAct('brain.feedback', { sessionId, content: observation })) setObservation(''); }}>
          <label className="pc-field">Conversation<select className="pc-select" required value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Choose conversation</option>{workspace.sessions.map((item) => <option value={item.id} key={item.id}>{String(item.summary || new Date(item.createdAt).toLocaleDateString())}</option>)}</select></label>
          <label className="pc-field">Observation<textarea className="pc-textarea" required maxLength={5000} value={observation} onChange={(event) => setObservation(event.target.value)}/></label>
          <button className="pc-button" disabled={busy} type="submit">Save observation</button>
        </form>
        <div className="pc-list">{feedback.map((item) => <div className="pc-row" key={item.id}><span><strong>{String(item.data.content)}</strong><small className="pc-muted">Conversation linked · {new Date(item.createdAt).toLocaleDateString()}</small></span></div>)}</div>
        {feedback.length === 0 && <p className="pc-empty">No feedback observations yet.</p>}
      </aside></div></div></details></>}</>}</div>}</main>;
}
