'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import type { GroundedAnswer } from '../lib/brain/answer';
import { aiRequestId, newAiRequestAttempt } from '../lib/client/ai-request';

type Props = { onNavigate?: (section: string, recordId?: string) => void };

/** A focused company-evidence question surface; it has no access to private room or customer memory. */
export function BrainAnswer({ onNavigate }: Props) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<GroundedAnswer | null>(null);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');

  const request = useCallback(async (asked: string, id: string): Promise<GroundedAnswer> => {
    const response = await fetch('/api/brain/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: asked, requestId: id }), cache: 'no-store' });
    const body = await response.json() as GroundedAnswer & { error?: string };
    if (!response.ok) throw new Error(body.error || 'The answer could not be checked.');
    return body;
  }, []);

  const recheck = useCallback(async (current: GroundedAnswer, id: string): Promise<boolean> => {
    try { await request(current.question, id); return true; }
    catch (cause) { setResult(null); setExpanded(''); setError(cause instanceof Error ? cause.message : 'The source changed. Ask again.'); return false; }
  }, [request]);

  useEffect(() => {
    if (!result || !requestId) return;
    const verify = () => { if (document.visibilityState === 'visible') void recheck(result, requestId); };
    window.addEventListener('focus', verify);
    document.addEventListener('visibilitychange', verify);
    return () => { window.removeEventListener('focus', verify); document.removeEventListener('visibilitychange', verify); };
  }, [result, requestId, recheck]);

  const ask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || busy) return;
    setBusy(true); setError(''); setResult(null); setExpanded('');
    try {
      const id = await aiRequestId('brain-answer', { question: asked });
      setRequestId(id);
      setResult(await request(asked, id));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not answer this question.'); }
    finally { setBusy(false); }
  };

  const newAnswer = async () => {
    const asked = question.trim();
    if (!asked || busy) return;
    setBusy(true); setError(''); setResult(null); setExpanded('');
    try {
      const id = await newAiRequestAttempt('brain-answer', { question: asked });
      setRequestId(id);
      setResult(await request(asked, id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start a new answer.'); }
    finally { setBusy(false); }
  };

  const expand = async (citationId: string) => {
    if (!result || !requestId) return;
    if (expanded === citationId) { setExpanded(''); return; }
    if (await recheck(result, requestId)) setExpanded(citationId);
  };

  return <section className="pc-panel" aria-labelledby="brain-answer-title">
    <div className="pc-row"><Search size={20} aria-hidden="true"/><span><h2 id="brain-answer-title">Ask your company brain</h2><p className="pc-muted">Answers use approved company evidence and show the exact supporting text.</p></span><span className="pc-badge">Keyword search</span></div>
    <form className="pc-form" onSubmit={ask}>
      <label className="pc-field">Question<input className="pc-input" value={question} maxLength={1000} required onChange={event => setQuestion(event.target.value)} placeholder="What does our approved material say about…?"/></label>
      <button className="pc-button primary" type="submit" disabled={busy || !question.trim()}>{busy ? 'Checking sources…' : 'Find answer'}</button>
      {(result || error) && <button className="pc-button quiet" type="button" disabled={busy || !question.trim()} onClick={() => void newAnswer()}>Start a new answer attempt</button>}
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" className="pc-panel" style={{ marginTop: 16 }}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{result.answer}</p>
      <p className="pc-muted">{result.insufficient ? 'No supported answer was found.' : `${result.citations.length} exact source ${result.citations.length === 1 ? 'quote' : 'quotes'}`} · {result.sourceCount} relevant chunks checked · Keyword retrieval</p>
      {result.citations.length > 0 && <div className="pc-list" aria-label="Answer citations">{result.citations.map(citation =>
        <div key={citation.id} className="pc-panel">
          <button className="pc-row" type="button" aria-expanded={expanded === citation.id} onClick={() => void expand(citation.id)}><BookOpen size={16} aria-hidden="true"/><span><strong>{citation.title}</strong><small className="pc-muted">{citation.sourceLabel}</small></span><span className="pc-badge">Source</span></button>
          {expanded === citation.id && <div><blockquote style={{ whiteSpace: 'pre-wrap', margin: '12px 0' }}>{citation.quote}</blockquote><small className="pc-muted">Exact source span {citation.start}–{citation.end} · revision {citation.sourceRevision}</small>{onNavigate && citation.sourceKind === 'brain_source' && <p><button className="pc-button quiet" type="button" onClick={() => onNavigate('brain', citation.sourceId)}>Open source</button></p>}</div>}
        </div>)}</div>}
    </div>}
  </section>;
}
