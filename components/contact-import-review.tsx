'use client';

import { useEffect, useState } from 'react';
import type { IngestionCandidate } from '../lib/ingestion/contracts';

type Conflict = { status: 'conflict'; reason: 'email_match' | 'name_match'; existingContactId: string; existingName: string; existingEmail: string; error: string };
type Created = { status: 'created'; contactId: string; replayed: boolean };

const quotedEmail = (quote: string) => quote.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
function suggestedName(candidate: IngestionCandidate): string {
  const withoutEmail = candidate.quote.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
  const title = candidate.title.trim();
  return title && withoutEmail.toLocaleLowerCase().includes(title.toLocaleLowerCase()) ? title : '';
}

export function ContactImportReview({ sourceId, candidate, revision, onLinked, navigate }: {
  sourceId: string;
  candidate: IngestionCandidate;
  revision: number;
  onLinked: () => Promise<unknown> | void;
  navigate: (section: string) => void;
}) {
  const [name, setName] = useState(() => suggestedName(candidate));
  const [email, setEmail] = useState(() => quotedEmail(candidate.quote));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [linkedId, setLinkedId] = useState(candidate.linkedContactId || '');
  useEffect(() => {
    setName(suggestedName(candidate)); setEmail(quotedEmail(candidate.quote));
    setError(''); setConflict(null); setLinkedId(candidate.linkedContactId || '');
  }, [candidate.id, candidate.linkedContactId, candidate.quote]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setConflict(null);
    try {
      const response = await fetch('/api/contact-import', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, candidateId: candidate.id, revision, name: name.trim(), email: email.trim() }) });
      const result = await response.json() as Created | Conflict | { error?: string };
      if (response.status === 409 && 'status' in result && result.status === 'conflict') { setConflict(result); return; }
      if (!response.ok || !('status' in result) || result.status !== 'created') throw new Error(('error' in result && result.error) || `Customer review failed (${response.status}).`);
      setLinkedId(result.contactId);
      await onLinked();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save customer review.'); }
    finally { setBusy(false); }
  };

  return <div className="iw-evidence-part" aria-label="Review customer record">
    <small>Customer record review</small>
    <p className="pc-muted">Create a customer only from details visible in this quote. Contact permission is reviewed separately in Customers.</p>
    {linkedId ? <div className="pc-row"><span>Customer record linked.</span><button className="pc-button" type="button" onClick={() => navigate(`customers/${linkedId}`)}>Open customer</button></div>
      : candidate.status === 'review_only' ? <form className="pc-form" onSubmit={event => void submit(event)}>
        <label className="pc-field">Name in source<input className="pc-input" required maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="Exact name from the quote"/></label>
        <label className="pc-field">Email in source <span className="iw-optional">Optional</span><input className="pc-input" type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="Only if shown in the quote"/></label>
        {conflict && <div role="status" className="iw-caution"><p>{conflict.error}</p><p>{conflict.existingName}{conflict.existingEmail ? ` · ${conflict.existingEmail}` : ''}</p><button className="pc-button" type="button" onClick={() => navigate(`customers/${conflict.existingContactId}`)}>Open existing customer</button></div>}
        {error && <p role="alert" className="pc-error-text">{error}</p>}
        <button className="pc-button primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Checking…' : 'Create reviewed customer'}</button>
      </form> : <p className="pc-muted">This contact suggestion has already been resolved.</p>}
  </div>;
}
