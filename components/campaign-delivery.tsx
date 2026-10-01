'use client';

import { useCallback, useEffect, useState } from 'react';

type Item = { contactId: string; name: string; email: string; status: 'ready' | 'sending' | 'accepted' | 'rejected' | 'uncertain'; receipt?: { reason?: string; providerReference?: string } };
type Status = { runId: string; runStatus: string; connectionId: string; recipients: Item[]; runProjectionPending?: boolean };

export function CampaignDelivery({ runId, onRefresh }: { runId: string; onRefresh?: () => void | Promise<void> }) {
  const [result, setResult] = useState<Status | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/campaign-delivery?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });
    const value = await response.json() as Status & { error?: string };
    if (!response.ok) throw new Error(value.error || 'Could not load email delivery.');
    setResult(value);
  }, [runId]);
  useEffect(() => { let current = true; void load().catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Could not load email delivery.'); }); return () => { current = false; }; }, [load]);
  async function send(item: Item) {
    if (!result?.connectionId || result.runStatus !== 'active' || item.status !== 'ready') return;
    setBusyId(item.contactId); setError('');
    try {
      const response = await fetch('/api/campaign-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, contactId: item.contactId, connectionId: result.connectionId, requestId: crypto.randomUUID() }) });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(value.error || 'Email send could not be completed.');
      await load(); await onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The send result is unknown. Refresh the status before any further action.');
      try { await load(); } catch { /* preserve the actionable error */ }
    } finally { setBusyId(''); }
  }
  return <section className="pc-panel" aria-label="Connected email delivery">
    <h3>Connected email delivery</h3>
    <p className="pc-muted">Each Send email click dispatches one reviewed recipient. Provider acceptance does not confirm inbox delivery. An uncertain result is held for inspection and is never resent automatically.</p>
    {error && <p role="alert" className="pc-badge">{error}</p>}
    {result?.runProjectionPending && <p role="status" className="pc-badge">Delivery recorded; the run summary is pending reconciliation. Refresh delivery status.</p>}
    {!result ? <p className="pc-muted">Loading delivery status…</p> : <div className="pc-list">{result.recipients.map(item => <div className="pc-row" key={item.contactId}>
      <span><strong>{item.name}</strong><small>{item.email}</small>{item.receipt?.reason && <small>{item.receipt.reason}</small>}</span>
      <span className="pc-row"><span className="pc-badge">{item.status === 'accepted' ? 'Accepted by provider' : item.status === 'uncertain' ? 'Uncertain — inspect mailbox' : item.status}</span>
        {result.runStatus === 'active' && item.status === 'ready' && <button type="button" className="pc-button primary" disabled={Boolean(busyId)} onClick={() => void send(item)}>{busyId === item.contactId ? 'Sending…' : 'Send email'}</button>}</span>
    </div>)}</div>}
    <button type="button" className="pc-button quiet" onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh delivery status.'))}>Refresh delivery status</button>
  </section>;
}
