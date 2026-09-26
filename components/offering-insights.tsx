'use client';

import { useEffect, useState } from 'react';
import type { OfferingInsightsData } from '../lib/business/insights';
import '../app/offering-insights.css';

type Props = { offeringId: string; navigate: (section: string, recordId?: string) => void };
const label = (type: string) => ({ feedback_theme: 'Feedback theme', practical_concern: 'Practical concern', explicit_preference: 'Stated preference', correction: 'Correction', commitment_request: 'Follow-up requested' })[type as 'feedback_theme'] || 'Reviewed observation';
export function OfferingInsights({ offeringId, navigate }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [insights, setInsights] = useState<OfferingInsightsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ offeringId });
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    setLoading(true); setError(''); setInsights(null);
    void fetch(`/api/business-context/insights?${params}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load offering evidence.');
      setInsights(body as OfferingInsightsData);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load offering evidence.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [offeringId, applied]);
  const browserSlots = insights?.rows.filter(row => row.runId && row.channel === 'browser').reduce((sum, row) => sum + row.audience, 0) || 0;
  const emailSlots = insights?.rows.filter(row => row.runId && row.channel === 'email').reduce((sum, row) => sum + row.audience, 0) || 0;
  return <section className="oi-panel" aria-label="Offering outcomes and evidence">
    <div className="oi-heading"><div><h3>Campaigns and customer evidence</h3><p>Recorded activity for this offering. The desired business outcome is not measured automatically.</p></div></div>
    <form className="oi-filter" onSubmit={event => { event.preventDefault(); if (from && to && from > to) { setError('Start date must be on or before end date.'); return; } setApplied({ from, to }); }}>
      <label>From <input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>To <input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button className="pc-button" type="submit">Apply dates</button>
    </form>
    <p className="oi-note">Dates filter plan creation, campaign creation and run launch in UTC. Later evidence stays with its selected run.</p>
    {loading && <p role="status">Loading recorded evidence…</p>}
    {error && <p role="alert" className="oi-error">{error}</p>}
    {insights && <>
      <dl className="oi-totals"><div><dt>Linked plans</dt><dd>{insights.linkedPlans}</dd></div><div><dt>Campaigns</dt><dd>{insights.linkedCampaigns}</dd></div><div><dt>Launched runs</dt><dd>{insights.launchedRuns}</dd></div><div><dt>Recipient slots</dt><dd>{insights.audience}</dd></div></dl>
      {!insights.rows.length ? <p className="oi-empty">No linked campaigns in this date range. Legacy work without an explicit offering is excluded.</p> : <>
        <p className="oi-note">{insights.measurement}</p>
        <div className="oi-scroll"><table className="oi-table"><caption>Recorded campaign activity</caption><thead><tr><th scope="col">Campaign and outcome</th><th scope="col">Channel</th><th scope="col">Recipients</th><th scope="col">Queued</th><th scope="col">Completed with saved conversation</th><th scope="col">Completion without linked conversation</th><th scope="col">Skipped</th></tr></thead><tbody>{insights.rows.map(row => <tr key={`${row.id}:${row.runId || 'draft'}`}><th scope="row"><button className="oi-link" type="button" onClick={() => navigate('campaigns', row.id)}>{row.name}</button><small>{row.outcome} · {row.runId ? 'Run ' + row.status : 'No launched run'}</small></th><td>{row.channel === 'manual_email' ? 'Manual email task' : row.channel === 'email' ? 'Connected email' : 'Browser'}</td><td>{row.audience}</td><td>{row.queued}</td><td>{row.channel === 'browser' ? row.completedWithSession : '—'}</td><td>{row.channel === 'browser' ? row.completedWithoutSession : '—'}</td><td>{row.skipped}</td></tr>)}</tbody></table></div>
        {insights.launchedRuns > 0 && <div className="oi-breakdowns"><div><h4>Browser conversation input</h4><p>{insights.savedCalls} saved conversations for {browserSlots} browser recipient slots · {insights.textCalls} Listen &amp; type · {insights.microphoneCalls} microphone mode recorded · {insights.unrecordedModeCalls} mode unknown.</p><p>One slot can have multiple conversations. Microphone mode is a saved input label, not device-quality verification.</p></div><div><h4>Connected email attempts</h4><p>Of {emailSlots} connected-email recipient slots: {insights.emailAccepted} provider accepted · {insights.emailRejected} rejected · {insights.emailUncertain} uncertain · {insights.emailSending} sending.</p><p>Provider acceptance does not establish delivery, reading or customer response. Manual email tasks have no provider receipt here.</p></div></div>}
      </>}
      <div className="oi-evidence"><h4>Reviewed campaign answers</h4><p className="oi-note">Typed caller answers for this offering. These records do not establish the desired business outcome.</p>{insights.typedAnswers?.length ? <><div className="oi-scroll"><table className="oi-table"><caption>Reviewed fields and exact caller evidence</caption><thead><tr><th scope="col">Planned field</th><th scope="col">Reviewed answer</th><th scope="col">Caller evidence</th><th scope="col">Source</th></tr></thead><tbody>{insights.typedAnswers.flatMap(row => row.fields.map(field => <tr key={`${row.id}:${field.column.key}`}><th scope="row">{field.column.label}<small>{field.column.type}</small></th><td>{field.review?.status === 'accepted' ? String(field.review.value) : field.review?.status === 'rejected' ? 'Rejected' : 'Unknown'}</td><td>{field.review?.source?.quote || 'No accepted caller evidence'}</td><td><button className="oi-link" type="button" onClick={() => navigate('conversations', row.sessionId)}>Open conversation{field.review?.source ? `, turn ${field.review.source.turnIndex + 1}` : ''}</button></td></tr>))}</tbody></table></div><a className="oi-link" href={`/api/campaign-results?format=csv&offeringId=${encodeURIComponent(offeringId)}`}>Export current reviewed answers for all dates (CSV)</a></> : <p className="oi-empty">No current reviewed answers. Extract and review planned fields in a saved campaign conversation.</p>}</div>
      <div className="oi-evidence"><h4>Reviewed caller observations</h4>{insights.evidence.length ? <ul>{insights.evidence.map(item => <li key={item.id}><div><strong>{label(item.type)}</strong><span>{item.title}</span></div><blockquote>“{item.quote}”</blockquote><button className="oi-link" type="button" onClick={() => navigate('conversations', item.sessionId)}>Open saved conversation, turn {item.sourceRef.turnIndex + 1}</button>{item.contactId && <> · <button className="oi-link" type="button" onClick={() => navigate('customers', item.contactId!)}>Open customer journey</button></>}{item.commitmentId && <> · <button className="oi-link" type="button" onClick={() => navigate('commitments', item.commitmentId!)}>Open commitment ({item.commitmentStatus})</button></>}{item.type === 'commitment_request' && !item.commitmentId && <p>Request only; no linked owned commitment is recorded.</p>}</li>)}</ul> : <p className="oi-empty">No current, reviewed caller quotes are linked to saved campaign conversations. Feedback and desired outcomes are not measured here.</p>}</div>
    </>}
  </section>;
}
