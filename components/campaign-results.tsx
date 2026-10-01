'use client';

import { useEffect, useState } from 'react';
import type { ReviewColumn } from '../lib/business/contracts';
import type { AnswerField, AnswerReview, AnswerTurn, CampaignResult } from '../lib/campaign-results/contracts';
import '../app/campaign-results.css';

async function payload(response: Response) { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save campaign answers.'); return body; }
function ReviewField({ field, turns, disabled, onSave }: { field: AnswerField; turns: AnswerTurn[]; disabled: boolean; onSave: (review: AnswerReview) => Promise<void> }) {
  const original = field.review?.source || field.sources[0];
  const [value, setValue] = useState(String(field.review?.value ?? field.value ?? ''));
  const [turnIndex, setTurnIndex] = useState(original?.turnIndex ?? turns.findIndex(turn => turn.role === 'user'));
  const [quote, setQuote] = useState(original?.quote || '');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const column = field.column;
  function toggleReview() {
    if (editing) { setEditing(false); return; }
    // Revalidation can update a closed row without remounting it. Start from its current saved evidence.
    // Do not synchronize props into an open editor: that would discard an operator's draft.
    setValue(String(field.review?.value ?? field.value ?? ''));
    setTurnIndex(original?.turnIndex ?? turns.findIndex(turn => turn.role === 'user'));
    setQuote(original?.quote || '');
    setError('');
    setEditing(true);
  }
  const save = async (status: AnswerReview['status']) => {
    setError('');
    try {
      if (status === 'accepted' && value === '') throw new Error('Enter an explicit answer, or keep the field unknown.');
      await onSave({ key: column.key, status, ...(status === 'accepted' ? { value: column.type === 'boolean' ? value === 'true' : column.type === 'number' ? Number(value) : value, quote, turnIndex } : {}) });
      setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this review.'); }
  };
  return <tr><th scope="row">{column.label}<small>{column.type === 'enum' ? 'Choice' : column.type}</small></th><td><strong>{field.review?.status === 'accepted' ? String(field.review.value) : field.review ? field.review.status === 'unknown' ? 'Unknown' : 'Rejected' : field.state === 'proposed' ? String(field.value) : field.state === 'conflicting' ? 'Conflicting' : 'Unknown'}</strong><small>{field.review ? 'Operator reviewed' : 'AI proposal · needs review'}</small></td><td>{original ? <><blockquote>{original.quote}</blockquote><small>Caller turn {original.turnIndex + 1}{original.receivedAt ? ` · ${original.receivedAt}` : ''}</small></> : <span>No supporting caller quote</span>}{field.sources.length > 1 && <details><summary>All original excerpts ({field.sources.length})</summary>{field.sources.map((source, index) => <blockquote key={index}>{source.quote} <small>Turn {source.turnIndex + 1}</small></blockquote>)}</details>}<p className="cr-note">{field.reason}</p>{!disabled && <button className="pc-button quiet" type="button" aria-expanded={editing} onClick={toggleReview}>{editing ? 'Close review' : field.review ? 'Review again' : 'Review field'}</button>}{editing && <div className="cr-editor"><label>Reviewed answer{column.type === 'boolean' || column.type === 'enum' ? <select value={value} onChange={event => setValue(event.target.value)}><option value="">Choose an answer</option>{(column.type === 'boolean' ? ['true', 'false'] : column.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select> : <input type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} step={column.type === 'number' ? 'any' : undefined} value={value} onChange={event => setValue(event.target.value)} maxLength={2000}/>}</label><label>Caller source turn<select value={turnIndex} onChange={event => { const index = Number(event.target.value); setTurnIndex(index); setQuote(turns[index]?.text || ''); }}>{turns.map((turn, index) => turn.role === 'user' && <option value={index} key={index}>Turn {index + 1}: {turn.text.slice(0, 70)}</option>)}</select></label><label>Exact supporting excerpt<textarea value={quote} maxLength={2000} onChange={event => setQuote(event.target.value)} /></label><p className="cr-note">Keep negation and uncertainty. Numbers, dates and choices need the named field or a clear preceding question; unrelated values stay unknown. Text uses complete verbatim clauses from the excerpt; dates use explicit YYYY-MM-DD. Consent and identity use their dedicated workflow.</p>{error && <p role="alert">{error}</p>}<div className="cr-actions"><button className="pc-button primary" disabled={disabled || field.state === 'conflicting'} type="button" onClick={() => void save('accepted')}>Accept supported answer</button><button className="pc-button" disabled={disabled} type="button" onClick={() => void save('unknown')}>Keep unknown</button><button className="pc-button quiet" disabled={disabled} type="button" onClick={() => void save('rejected')}>Reject</button></div></div>}</td></tr>;
}

export function CampaignResults({ sessionId, turns }: { sessionId: string; turns: AnswerTurn[] }) {
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [columns, setColumns] = useState<ReviewColumn[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/campaign-results?sessionId=${encodeURIComponent(sessionId)}`, { signal: controller.signal }).then(payload).then(body => { setResult(body.result); setColumns(body.columns); setCanReview(body.canReview); }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId]);
  async function extract(recheck = false) {
    setBusy(true); setError('');
    try { const body = await payload(await fetch('/api/campaign-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recheck && result ? { action: 'revalidate', id: result.id, revision: result.revision } : { sessionId }) })); setResult(body.result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not extract answers.'); }
    finally { setBusy(false); }
  }
  async function review(review: AnswerReview) {
    if (!result) return;
    setBusy(true);
    try { const body = await payload(await fetch('/api/campaign-results', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id, revision: result.revision, reviews: [review] }) })); setResult(body.result); }
    finally { setBusy(false); }
  }
  return <section className="cr-panel" aria-label="Collected campaign answers"><div className="cr-heading"><div><h3>Collected campaign answers</h3><p>Review each planned field against the caller’s words.</p></div>{result?.originalModelText && ['ready', 'reviewed'].includes(result.status) && canReview && <button className="pc-button" disabled={busy || loading} type="button" onClick={() => void extract(true)}>{busy ? 'Rechecking saved reply…' : 'Recheck saved reply · no AI call'}</button>}{!result && canReview && columns.length > 0 && <button className="pc-button primary" disabled={busy || loading} type="button" onClick={() => void extract()}>{busy ? 'Extracting answers…' : 'Extract answers with AI'}</button>}</div>{loading && <p role="status">Loading planned fields…</p>}{error && <p className="cr-error" role="alert">{error}</p>}{!loading && !result && !error && columns.length === 0 && <p className="cr-note">No result fields were planned for this campaign. Manual completion evidence and the saved conversation remain available.</p>}{!loading && !result && !error && columns.length > 0 && <p className="cr-note">{columns.length} planned fields await extraction. Missing or ambiguous answers remain unknown.{!canReview && ' An operator can extract and review answers.'}</p>}{result?.status === 'processing' && <p role="status">Extraction is in progress or awaiting a receipt. Refresh this conversation to check; another paid attempt will not be started.</p>}{result?.error && <p className="cr-error" role="alert">{result.error}</p>}{!!result?.fields.length && <><p className="cr-note">{result.fields.filter(field => field.review).length} of {result.fields.length} fields reviewed · accepted answers do not establish the campaign outcome.</p><div className="cr-scroll"><table><caption className="cr-sr-only">Typed answers and caller evidence</caption><thead><tr><th scope="col">Planned field</th><th scope="col">Answer</th><th scope="col">Caller evidence and review</th></tr></thead><tbody>{result.fields.map(field => <ReviewField key={`${field.column.key}:${field.review?.reviewedAt || 'pending'}`} field={field} turns={turns} disabled={busy || !canReview || !['ready', 'reviewed'].includes(result.status)} onSave={review}/>)}</tbody></table></div></>}{result?.receipt && <details className="cr-receipt"><summary>Extraction receipt</summary><p>{result.receipt.model} · {result.receipt.usage.inputTokens + result.receipt.usage.outputTokens} tokens recorded · exact agent version and column schema retained.</p><p>Source times are browser receipt times. The selected contact is a workspace association, not verified caller identity.</p><details><summary>Original model reply</summary><pre>{result.originalModelText}</pre></details></details>}</section>;
}
