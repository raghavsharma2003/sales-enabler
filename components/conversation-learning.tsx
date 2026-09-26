'use client';

import { useEffect, useState } from 'react';
import type { ConversationAnalysis, LearningCandidate, LearningDestination, LearningReview, LearningType } from '../lib/learning/contracts';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';
import { isExplicitFollowUpDecline } from '../lib/learning/policy';

const labels: Record<LearningCandidate['type'], string> = {
  feedback_theme: 'Feedback theme', practical_concern: 'Practical concern', explicit_preference: 'Stated preference',
  correction: 'Caller correction', commitment_request: 'Follow-up request',
};
const destinations: Record<LearningCandidate['destination'], string> = {
  feedback_evidence: 'Conversation-linked feedback evidence', customer_memory_review: 'Proposed customer memory in Customers',
  manual_action_review: 'Follow-up review in Commitments',
};
const destinationOptions: { value: LearningDestination; label: string }[] = [
  { value: 'feedback_evidence', label: 'Keep as conversation feedback' },
  { value: 'customer_memory_review', label: 'Propose customer memory' },
  { value: 'manual_action_review', label: 'Propose follow-up' },
];
const typeOptions: { value: LearningType; label: string }[] = Object.entries(labels).map(([value, label]) => ({ value: value as LearningType, label }));
async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export function ConversationLearning({ sessionId, onRefresh, feedbackOnly = false, readOnly = false }: { sessionId: string; onRefresh?: () => Promise<void> | void; feedbackOnly?: boolean; readOnly?: boolean }) {
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Record<string, LearningReview>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSelected([]); setReviews({});
    fetch(`/api/conversation-analysis?sessionId=${encodeURIComponent(sessionId)}`, { signal: controller.signal })
      .then(responseJson).then(data => setAnalyses(data.analyses || []))
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load analyses.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId]);
  const latest = analyses[0];
  const restrictToFeedback = feedbackOnly || latest?.data.feedbackOnly === true;
  const pending = latest?.data.candidates.filter(candidate => candidate.status === 'pending') || [];
  const invalidSelection = !restrictToFeedback && (latest?.data.candidates.some(candidate => selected.includes(candidate.id) &&
    (reviews[candidate.id]?.destination ?? candidate.destination) === 'customer_memory_review' &&
    !['explicit_preference', 'correction'].includes(reviews[candidate.id]?.reviewedType ?? candidate.type)) || false);
  async function analyze(newAttempt = false) {
    if (busy || readOnly) return;
    setBusy(true); setError('');
    let requestId = '';
    try {
      const fingerprint = { sessionId };
      requestId = newAttempt ? await newAiRequestAttempt('conversation-analysis', fingerprint) : latest?.data.sessionId === sessionId && latest.data.requestId ? latest.data.requestId : await aiRequestId('conversation-analysis', fingerprint);
      const data = await responseJson(await fetch('/api/conversation-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, requestId }) }));
      setAnalyses(previous => [data.analysis, ...previous.filter(item => item.id !== data.analysis.id)]);
      setSelected([]); setReviews({});
    } catch (err) {
      if (requestId) {
        try {
          const data = await responseJson(await fetch(`/api/conversation-analysis?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }));
          const current = (data.analyses || []) as ConversationAnalysis[];
          const saved = current.find(item => item.data.requestId === requestId);
          if (saved) { setAnalyses(current); if (saved.status === 'ready' || saved.status === 'processing') return; }
        } catch { /* Keep the original request error. */ }
      }
      setError(err instanceof Error ? err.message : 'Could not analyze conversation.');
    }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!latest || !selected.length || busy || readOnly) return;
    setBusy(true); setError('');
    try {
      const data = await responseJson(await fetch(`/api/conversation-analysis/${encodeURIComponent(latest.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', revision: latest.revision, candidateIds: selected, reviews: selected.map(candidateId => {
          const candidate = latest.data.candidates.find(item => item.id === candidateId);
          if (restrictToFeedback) return { ...reviews[candidateId], candidateId, destination: 'feedback_evidence' as const };
          return reviews[candidateId] || (candidate && isExplicitFollowUpDecline(candidate.quote) ? { candidateId, destination: 'feedback_evidence' } : undefined);
        }).filter(Boolean) }) }));
      setAnalyses(previous => [data.analysis, ...previous.filter(item => item.id !== data.analysis.id)]);
      setSelected([]); setReviews({});
      await onRefresh?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not apply selected cards.'); }
    finally { setBusy(false); }
  }
  function setReview(candidate: LearningCandidate, change: Partial<LearningReview>) {
    if (readOnly) return;
    const current = reviews[candidate.id] || { candidateId: candidate.id };
    const next = { ...current, ...change, ...(restrictToFeedback ? { destination: 'feedback_evidence' as const } : {}) };
    setReviews(previous => ({ ...previous, [candidate.id]: next }));
    setSelected(previous => previous.includes(candidate.id) ? previous : [...previous, candidate.id]);
  }
  return <section className="pc-panel" aria-label="Conversation learning" style={{ marginTop: 20 }}>
    <div className="pc-pagehead"><div><h2>Learn from this conversation</h2><p className="pc-muted">{restrictToFeedback ? 'Review source-backed participant feedback. Anonymous visitors and unverified channel accounts cannot create customer memories or follow-up proposals.' : 'Generate evidence cards from participant statements. Review each quote before adding a proposed customer memory or manual follow-up.'}</p></div>
      <button className="pc-button" type="button" disabled={busy || loading || readOnly} onClick={() => void analyze()}>{busy ? 'Working…' : latest ? 'Reopen saved analysis' : 'Analyze saved conversation'}</button>{latest && !readOnly && <button className="pc-button quiet" type="button" disabled={busy || loading || readOnly} onClick={() => void analyze(true)}>Start a new analysis</button>}</div>
    {readOnly && <p className="pc-muted">Viewer access is read-only. An operator can analyze and review this conversation.</p>}{restrictToFeedback && <p className="pc-muted">Feedback only · participant identity is unverified.</p>}
    {error && <p role="alert" className="pc-notice">{error}</p>}
    {loading ? <p className="pc-muted">Loading prior analyses…</p> : !latest ? <p className="pc-empty">No feedback analysis yet.</p> : <>
      <p className="pc-muted">Latest analysis · {new Date(latest.createdAt).toLocaleString()} · {latest.status.replaceAll('_', ' ')}</p>
      {latest.data.notes.map((note, index) => <p className="pc-muted" key={index}>{note}</p>)}
      {latest.data.candidates.length === 0 && <p className="pc-empty">No source-backed feedback cards were found in the analyzed turns.</p>}
      <div className="pc-list">{latest.data.candidates.map(candidate => <article className="pc-row" key={candidate.id} style={{ alignItems: 'flex-start' }}>
        {candidate.status === 'pending' && !readOnly && <input type="checkbox" aria-label={`Select ${candidate.title}`} checked={selected.includes(candidate.id)} onChange={event => setSelected(values => event.target.checked ? [...values, candidate.id] : values.filter(id => id !== candidate.id))} />}
        <div style={{ minWidth: 0, flex: 1 }}><span className="pc-badge">Model: {labels[candidate.type]}</span><h3 style={{ margin: '8px 0' }}>{candidate.title}</h3>
          <blockquote style={{ borderLeft: '1px solid currentColor', paddingLeft: 12, margin: '10px 0', whiteSpace: 'pre-wrap' }}>“{candidate.quote}” <small className="pc-muted">— caller turn {candidate.sourceRef.turnIndex + 1}</small></blockquote>
          <p>{candidate.content}</p><p className="pc-muted">Why review: {candidate.why}</p>
          <p className="pc-muted">Model destination: {destinations[candidate.originalDestination || candidate.destination]}{candidate.type === 'correction' ? ' · Check and revoke any older contradictory memory separately.' : ''}</p>
          {candidate.routingPolicy === 'anonymous_feedback_only' && <p className="pc-muted">This proposal is retained as conversation feedback because participant identity is unverified. The original model classification and quote are preserved.</p>}
          {candidate.status === 'pending' && !readOnly ? <div className="pc-grid">
            <label className="pc-field">Review meaning<select className="pc-select" value={reviews[candidate.id]?.reviewedType ?? candidate.type} onChange={event => setReview(candidate, { reviewedType: event.target.value as LearningType })}>
              {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="pc-field">After review<select className="pc-select" value={restrictToFeedback ? 'feedback_evidence' : reviews[candidate.id]?.destination ?? (isExplicitFollowUpDecline(candidate.quote) ? 'feedback_evidence' : candidate.destination)} onChange={event => setReview(candidate, { destination: event.target.value as LearningDestination })}>
              {destinationOptions.map(option => <option key={option.value} value={option.value} disabled={(restrictToFeedback && option.value !== 'feedback_evidence') || (option.value === 'customer_memory_review' && !latest.data.contactId)}>{option.label}</option>)}</select></label>
          </div> : candidate.reviewedDestination ? <p className="pc-muted">Operator reviewed as {labels[candidate.reviewedType ?? candidate.type]} → {destinations[candidate.reviewedDestination]}</p> : null}
          {candidate.status === 'pending' && !restrictToFeedback && (reviews[candidate.id]?.destination ?? candidate.destination) === 'customer_memory_review' && !['explicit_preference', 'correction'].includes(reviews[candidate.id]?.reviewedType ?? candidate.type) &&
            <p className="pc-muted">Choose “Stated preference” or “Caller correction” as the reviewed meaning before proposing a customer memory.</p>}
          {candidate.status === 'pending' && isExplicitFollowUpDecline(candidate.quote) && <p className="pc-notice">Caller explicitly declined follow-up. This card defaults to conversation feedback and cannot create a follow-up action. {restrictToFeedback ? 'This unverified conversation remains feedback only.' : 'You may review it as a customer preference, but it does not change consent automatically.'}</p>}
        </div><span className="pc-badge">{candidate.status}</span></article>)}</div>
      {pending.length > 0 && !readOnly && <div className="pc-row"><button type="button" className="pc-button primary" disabled={busy || !selected.length || invalidSelection || readOnly} onClick={() => void apply()}>Apply {selected.length || ''} reviewed {selected.length === 1 ? 'card' : 'cards'}</button><p className="pc-muted">This records feedback or creates pending proposals. It does not approve a memory, complete work, or send a message.</p></div>}
    </>}
  </section>;
}
