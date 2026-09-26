'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import type { ActionReview } from '../../lib/platform/action-review';

export function CommitmentsView({ records, workspace, act, busy, focusId }: PlatformViewProps) {
  const [error, setError] = useState('');
const safeAct = async (action: Parameters<typeof act>[0], body?: Parameters<typeof act>[1]): Promise<boolean> => { try { setError(''); await act(action, body); return true; } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.'); return false; } };
  const commitments = records.filter((record) => record.kind === 'commitment').sort((a, b) => String(a.data.dueDate).localeCompare(String(b.data.dueDate)));
  const [draft, setDraft] = useState({ title: '', description: '', contactId: '', sourceSessionId: '', dueDate: '' });
  const [selected, select] = useState<string | null>(focusId || null);
  const [completionNote, setCompletionNote] = useState('');
  const [notification, setNotification] = useState({ channel: '', evidence: '' });
  const [reason, setReason] = useState('');
  const current = commitments.find((item) => item.id === selected);
  const contactName = (id: unknown) => workspace.contacts.find((item) => item.id === id)?.name || 'No customer linked';
  return <main className="pc-page"><header className="pc-pagehead"><div><h1>Commitments</h1><p className="pc-muted">Assign a due date, record the work, and keep customer notification evidence separate.</p></div><span className="pc-badge">{commitments.filter((item) => item.status === 'open').length} open</span></header>{error && <p role="alert" className="pc-muted">{error}</p>}
    <FollowupReview workspace={workspace} busy={busy} onReviewed={async (commitmentId) => { await act('workspace.refresh'); if (commitmentId) select(commitmentId); }}/>
    <div className="pc-split"><aside className="pc-panel"><h2>Work queue</h2><div className="pc-list">{commitments.map((item) => <button className="pc-row" type="button" key={item.id} aria-current={selected === item.id ? 'true' : undefined} onClick={() => select(item.id)}><CheckCircle2 size={17}/><span><strong>{String(item.data.title)}</strong><small className="pc-muted">{String(item.data.dueDate)} · {String(contactName(item.data.contactId))}</small></span><span className="pc-badge">{item.status}</span></button>)}</div>{commitments.length === 0 && <p className="pc-empty">No commitments yet. Add a specific next step with a due date.</p>}</aside><section className="pc-panel"><h2><Plus size={18}/> New commitment</h2><form className="pc-form" onSubmit={async (event) => { event.preventDefault(); if (await safeAct('commitment.create', draft)) setDraft({ title: '', description: '', contactId: '', sourceSessionId: '', dueDate: '' }); }}><label className="pc-field">Task<input className="pc-input" required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Prepare application timeline"/></label><label className="pc-field">Why and what needs doing<textarea className="pc-textarea" maxLength={10000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label><div className="pc-grid"><label className="pc-field">Due date<input className="pc-input" type="date" required value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}/></label><label className="pc-field">Customer<select className="pc-select" value={draft.contactId} onChange={(event) => setDraft({ ...draft, contactId: event.target.value, sourceSessionId: '' })}><option value="">Internal only</option>{workspace.contacts.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</select></label></div><label className="pc-field">Source conversation, if applicable<select className="pc-select" value={draft.sourceSessionId} onChange={(event) => setDraft({ ...draft, sourceSessionId: event.target.value })}><option value="">No conversation linked</option>{workspace.sessions.filter((item) => !draft.contactId || item.contactId === draft.contactId).map((item) => <option key={item.id} value={item.id}>{String(item.summary || new Date(item.createdAt).toLocaleDateString())}</option>)}</select></label><button className="pc-button primary" type="submit" disabled={busy}>Create commitment</button></form></section>
      <aside className="pc-panel"><h2>{current ? String(current.data.title) : 'Select a commitment'}</h2>{!current ? <p className="pc-empty">Open an item to record its outcome.</p> : <><p className="pc-muted">Due {String(current.data.dueDate)} · {String(contactName(current.data.contactId))}</p><p>{String(current.data.description || 'No description')}</p><div className="pc-list"><div className="pc-row"><span>Owner</span><strong>{current.data.ownerId === workspace.user.id ? 'You' : 'Teammate'}</strong></div><div className="pc-row"><span>Internal work</span><span className="pc-badge">{current.status}</span></div><div className="pc-row"><span>Customer notified</span><span className="pc-badge">{current.data.notification ? 'Evidence recorded' : 'No evidence'}</span></div></div>{current.status === 'open' && <><form className="pc-form" onSubmit={async (event) => { event.preventDefault(); if (await safeAct('commitment.complete', { commitmentId: current.id, revision: current.revision, completionNote })) setCompletionNote(''); }}><label className="pc-field">Completion note<textarea className="pc-textarea" required maxLength={5000} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="What was completed?"/></label><button className="pc-button" type="submit" disabled={busy}>Mark internal work complete</button></form><div className="pc-form"><label className="pc-field">Cancellation reason<input className="pc-input" value={reason} onChange={(event) => setReason(event.target.value)}/></label><button className="pc-button danger" type="button" disabled={busy || !reason.trim()} onClick={() => safeAct('commitment.cancel', { commitmentId: current.id, revision: current.revision, reason })}>Cancel commitment</button></div></>}{current.status === 'completed' && !current.data.notification && <form className="pc-form" onSubmit={async (event) => { event.preventDefault(); if (await safeAct('commitment.notify', { commitmentId: current.id, revision: current.revision, ...notification })) setNotification({ channel: '', evidence: '' }); }}><h3>Record customer notification</h3><p className="pc-muted">This records a manual receipt. It does not send a message.</p><label className="pc-field">Channel<input className="pc-input" required maxLength={80} value={notification.channel} onChange={(event) => setNotification({ ...notification, channel: event.target.value })} placeholder="Email, call, in person"/></label><label className="pc-field">Evidence<input className="pc-input" required maxLength={2000} value={notification.evidence} onChange={(event) => setNotification({ ...notification, evidence: event.target.value })} placeholder="When and how the customer was told"/></label><button className="pc-button" disabled={busy} type="submit">Record notification evidence</button></form>}{Boolean(current.data.notification) && <p className="pc-muted">Notification evidence: {String((current.data.notification as { evidence: string }).evidence)}</p>}</>}</aside></div></main>;
}

function FollowupReview({ workspace, busy, onReviewed }: { workspace: PlatformViewProps['workspace']; busy: boolean; onReviewed: (commitmentId?: string) => Promise<void> }) {
  const proposals = workspace.actions.filter(action => action.status === 'proposed' || action.status === 'approved');
  const [actionId, setActionId] = useState('');
  const [review, setReview] = useState<ActionReview | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '', reason: '' });
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setReview(null); setError('');
    if (!actionId) return;
    const controller = new AbortController(); setLoading(true);
    void fetch(`/api/action-review?actionId=${encodeURIComponent(actionId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not review this follow-up.'); return data as ActionReview; })
      .then(data => { if (!controller.signal.aborted) { setReview(data); setDraft({ title: data.title, description: data.description, dueDate: '', reason: '' }); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not review this follow-up.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actionId, refresh]);
  async function submit(decision: 'accept' | 'reject') {
    if (!review || pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/action-review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: review.id, reviewToken: review.reviewToken, decision, ownerId: workspace.user.id, ...draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this review.');
      await onReviewed(result.commitmentId);
      setActionId(''); setReview(null);
      setNotice(decision === 'accept' ? 'Added to your work queue. Open the commitment below to record completion and customer follow-up.' : 'Follow-up rejected. No commitment was created.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save this review.'); }
    finally { setPending(false); }
  }
  const disabled = busy || pending || loading;
  return <section className="pc-panel" aria-labelledby="followup-review-title">
    <div className="pc-pagehead"><div><h2 id="followup-review-title">Follow-ups to review</h2><p className="pc-muted">Review a suggested next step, take ownership and set a due date.</p></div><span className="pc-badge">{proposals.length} awaiting review</span></div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error} {actionId && <button className="pc-button quiet" type="button" disabled={disabled} onClick={() => setRefresh(value => value + 1)}>Refresh proposal</button>}</p>}
    {!proposals.length && !review ? <p className="pc-empty">Reviewed conversation suggestions and staff follow-ups will appear here.</p> : <>
      <label className="pc-field">Suggested follow-up<select className="pc-select" value={actionId} disabled={pending || busy} onChange={event => { setActionId(event.target.value); setNotice(''); }}><option value="">Choose a proposal</option>{proposals.map(action => <option key={action.id} value={action.id}>{String(action.title || 'Follow-up')} · {String(workspace.contacts.find(contact => contact.id === action.contactId)?.name || 'Internal')}</option>)}</select></label>
      {loading && <p role="status">Checking the proposal and its source…</p>}
      {review && <div className="pc-form">
        <p className="pc-muted">{review.evidence.explanation}</p>
        {review.evidence.quote && <blockquote>{review.evidence.quote}{review.evidence.turnIndex !== undefined && <small className="pc-muted"> — caller turn {review.evidence.turnIndex + 1}</small>}</blockquote>}
        {!review.evidence.current && <p role="alert">Source evidence needs attention. You can reject this proposal or analyze the current conversation again.</p>}
        {review.commitmentId ? <button className="pc-button" type="button" disabled={disabled} onClick={() => void onReviewed(review.commitmentId)}>Open existing commitment</button> : <>
          <label className="pc-field">Task<input className="pc-input" value={draft.title} maxLength={200} disabled={disabled} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
          <label className="pc-field">What needs doing<textarea className="pc-textarea" value={draft.description} maxLength={10000} disabled={disabled} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
          <div className="pc-grid"><label className="pc-field">Owner<input className="pc-input" value={`You · ${workspace.user.email}`} readOnly/></label><label className="pc-field">Due date<input className="pc-input" type="date" value={draft.dueDate} disabled={disabled} onChange={event => setDraft({ ...draft, dueDate: event.target.value })}/></label></div>
          <button className="pc-button primary" type="button" disabled={disabled || !review.evidence.current || !draft.title.trim() || !draft.dueDate} onClick={() => void submit('accept')}>{pending ? 'Saving review…' : 'Accept and add to my work queue'}</button>
          <label className="pc-field">Reason to reject<input className="pc-input" value={draft.reason} maxLength={1000} disabled={disabled} onChange={event => setDraft({ ...draft, reason: event.target.value })}/></label><button className="pc-button quiet" type="button" disabled={disabled || !draft.reason.trim()} onClick={() => void submit('reject')}>Reject proposal</button>
          <p className="pc-muted">Acceptance creates internal work. Completing it and recording customer notification remain separate steps.</p>
        </>}
      </div>}
    </>}
  </section>;
}
