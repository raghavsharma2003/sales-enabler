'use client';

import { useEffect, useState } from 'react';
import type { CandidateType, IngestionCandidate } from '../lib/ingestion/contracts';

const labels: Record<CandidateType, string> = { offer: 'Offering', company_fact: 'Company fact', faq: 'Question & answer', contact: 'Customer record', feedback: 'Feedback', action: 'One-off action' };

export function CandidateTypeReview({ sourceId, candidate, revision, onClassified }: {
  sourceId: string;
  candidate: IngestionCandidate;
  revision: number;
  onClassified: () => Promise<unknown> | void;
}) {
  const flagged = candidate.issues.includes('possible_customer_record');
  const [type, setType] = useState<CandidateType>(flagged ? 'contact' : candidate.type);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setType(candidate.issues.includes('possible_customer_record') ? 'contact' : candidate.type); setReason(''); setError(''); }, [candidate.id, candidate.type, candidate.issues]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ingestion/${encodeURIComponent(sourceId)}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'classify', revision, candidateId: candidate.id, type, reason: reason.trim() }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `Type review failed (${response.status}).`);
      await onClassified();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save type review.'); }
    finally { setBusy(false); }
  };

  return <div className="iw-evidence-part" aria-label="Review suggestion type">
    <small>Review suggestion type</small>
    {flagged && <p className="iw-caution">This quote looks like an individual customer record. It cannot be approved as company knowledge. Review it as a customer record instead.</p>}
    <form className="pc-form" onSubmit={event => void save(event)}>
      <label className="pc-field">Correct type<select className="pc-select" value={type} onChange={event => setType(event.target.value as CandidateType)}>
        <option value={candidate.type}>{labels[candidate.type]}</option>
        {candidate.type !== 'contact' && <option value="contact">Customer record</option>}
        {candidate.type === 'action' && !flagged && <><option value="company_fact">Standing company fact or procedure</option><option value="faq">Question & answer</option></>}
      </select></label>
      <label className="pc-field">Reason for correction<input className="pc-input" maxLength={300} value={reason} onChange={event => setReason(event.target.value)} placeholder="What does the quoted source describe?"/></label>
      {error && <p className="pc-error-text" role="alert">{error}</p>}
      <button className="pc-button" type="submit" disabled={busy || type === candidate.type || reason.trim().length < 3}>{busy ? 'Saving…' : 'Save type review'}</button>
    </form>
    {candidate.modelType && <p className="pc-muted">Originally extracted as {labels[candidate.modelType]}. The quoted evidence remains unchanged.</p>}
  </div>;
}
