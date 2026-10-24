// The memory review queue: every fact a caller said that waits for a person, across all contacts, oldest first. Each shows
// the caller's exact words and opens the call; approve (or correct, then approve) lets the next call use it, reject deletes
// it. A fact nobody reviews is dropped after 14 days. Its own chunk: only people reviewing memory download it.
import { useState } from 'react';
import { Check, Play, X } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, Empty, TextField } from '../ui.tsx';
import { factReview, type ReviewItem } from '../data.ts';
import { date } from '../format.ts';

export default function MemoryReview() {
  const { act } = useApp();
  const q = useData('fact-review', factReview);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const decide = async (items: ReviewItem[], approve: boolean) => {
    const decisions = items.map(f => ({ factId: f.id, approve, ...(approve && edits[f.id]?.trim() && edits[f.id].trim() !== String(f.value) ? { value: edits[f.id].trim() } : {}) }));
    const r = await act('fact.review.decide', { decisions }, { describe: approve ? 'Approved: the next call may use it.' : 'Rejected and deleted.' });
    if (r.ok) q.reload();
  };
  return (
    <Async q={q} what="Memory review" tool="fact.review.list" empty={d => d.total === 0 ? <Empty title="Nothing to review" body="When a caller says something worth remembering that needs a person's approval (a promise, a callback), it waits here. Practice calls never write memory." /> : null}>
      {d => (
        <Card><CardHead title={`${d.total} waiting for review`} sub={`Approve to let the next call use it, or reject to delete it. Anything not reviewed within ${d.unreviewedDays} days is deleted.`}
          actions={d.items.length > 1 ? <Btn size="sm" onClick={() => decide(d.items, true)}>Approve all {d.items.length} shown</Btn> : undefined} />
          <ul className="facts" data-testid="memory-review">{d.items.map(f => (
            <li key={f.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong><Link to={`/contacts/${f.contactId}`}>{f.contactName || 'A contact'}</Link>: {f.key.replace(/_/g, ' ')}</strong>
                <span className="small muted">said {date(f.saidAt, true)} · deleted {date(f.dropsAt)} if not reviewed</span>
              </div>
              <blockquote lang="hi">“{f.quote}”</blockquote>
              <TextField label="What to remember" value={edits[f.id] ?? String(f.value)} maxLength={60} onChange={e => setEdits({ ...edits, [f.id]: e.target.value })}
                hint="Correct it before approving if the words say something slightly different." />
              <div className="row">
                {f.conversationId && <Link to={`/calls/${f.conversationId}`} className="btn btn-sm" style={{ textDecoration: 'none' }}><Play size={13} aria-hidden /><span>Open the call</span></Link>}
                <Btn size="sm" kind="primary" icon={<Check size={14} aria-hidden />} onClick={() => decide([f], true)}>Approve</Btn>
                <Btn size="sm" kind="danger" icon={<X size={14} aria-hidden />} onClick={() => decide([f], false)}>Reject</Btn>
              </div>
            </li>))}</ul>
        </Card>
      )}
    </Async>
  );
}
