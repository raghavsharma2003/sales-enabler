// How she changed: every change learning made or proposed for this agent (learning.history), newest first. Each shows the
// brief before and after, line by line; why; the evidence (the calls and how each outcome was read, the quoted lines, a
// flagged moment); who approved what; and, while it is in use, a one-step way to take it back (a new version, after the
// same approval as a publish). A change from test calls says it is a reason to try, not a measured result.
import { useState } from 'react';
import { run } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, type Tone } from '../ui.tsx';
import { Link } from '../router.tsx';
import { date } from '../format.ts';

interface BriefLine { kind: 'same' | 'removed' | 'added'; text: string }
interface Change {
  id: string; kind: string; status: string; state: string; createdAt: string; baseVersion: number | null; why: string | null; from: 'flag' | 'issue' | 'theme' | 'calls';
  source: 'live' | 'test'; sourceLabel: string; changes: { part: string; before: string | null; after: string }[];
  brief: { before: number | null; after: string; lines: BriefLine[] } | null;
  evidence: { cited: string[]; calls: { id: string; outcome: string | null; grade: string | null }[]; quotes: { kind: string; quote: string; callId: string }[];
    flag: { said: 'agent' | 'caller'; quote: string | null; note: string; callId: string } | null; theme: { title: string; count: number; of: number } | null };
  blocked: string[]; simulated: string | null; approvals: { what: string; status: string; by: string | null; at: string }[];
  test: { state: string; verdict: string | null; label: string | null } | null; version: number | null; tested: boolean;
  reverted: { number: number } | null; canRevert: { ok: boolean; reason?: string }; canAdopt: { ok: boolean; reason?: string };
}
interface Power { enough: boolean; reason?: string; line?: string }

const TONE: Record<string, Tone> = { promoted: 'leaf', reverted: 'neutral', gated_out: 'brick', rejected: 'neutral', testing: 'peacock', awaiting_approval: 'marigold', drafted: 'marigold' };
const GRADE: Record<string, string> = { verified: 'verified by your system', manager: 'labelled by a person', ai_guess: 'an AI read' };
const FROM: Record<Change['from'], string> = { flag: 'a moment flagged in review', issue: 'an issue a monitor opened', theme: 'a pattern across calls', calls: 'recent calls' };
const STATUS_WORDS: Record<string, string> = { executed: 'approved', proposed: 'waiting', cancelled: 'declined', expired: 'expired', failed: 'failed', approved: 'approved' };

export default function AgentChanges({ agentId, onChanged }: { agentId: string; onChanged: () => void }) {
  const { act, can } = useApp();
  const q = useData(['learning-history', agentId], () => run<{ changes: Change[] }>('learning.history', { agentId }));
  const power = useData(['learning-power', agentId], () => run<Power>('learning.power', { agentId }));
  const [busy, setBusy] = useState<string | null>(null);
  const may = can(['owner', 'builder']);
  const go = async (tool: 'proposal.adopt' | 'proposal.revert', c: Change) => {
    setBusy(c.id);
    const r = await act(tool, { proposalId: c.id }, { describe: tool === 'proposal.adopt' ? 'Published as a new version.' : 'Taken back in a new version.' });
    setBusy(null); if (r.ok) { q.reload(); onChanged(); }
  };
  return (
    <Card><CardHead title="How she changed" sub="Every change learning made or proposed for this agent, with the words before and after, why, and who approved it." />
      {power.data && !power.data.enough && <p className="hint" role="note">{power.data.reason} Until then a change can be adopted on your judgement, and taken back in one step.</p>}
      {power.data?.enough && power.data.line && <p className="small muted">A test on live calls needs {power.data.line}.</p>}
      <Async q={q} what="learned changes" tool="learning.history" rows={2} empty={d => d.changes.length ? null : <p className="muted">No changes yet. Flag a moment on a call that went wrong, or wait for learning to find a pattern in calls.</p>}>
        {d => <ol className="stack-m" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{d.changes.map(c => (
          <li key={c.id} className="reviewbox stack-s">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip tone={TONE[c.status] ?? 'neutral'}>{c.state}</Chip>
              {c.version !== null && <span className="small">{c.reverted ? `Was version ${c.version}; taken back in version ${c.reverted.number}` : `Version ${c.version}${c.tested ? ', proved on live calls' : ', not tested on live calls'}`}</span>}
              <span className="small muted">From {FROM[c.from]} · {date(c.createdAt, true)}</span>
            </div>
            {c.source === 'test' && <p className="small muted" style={{ margin: 0 }}>Drawn {c.sourceLabel}.</p>}
            {c.changes.map((x, k) => <div key={k} className="diffrow"><strong>{x.part}</strong>{x.before !== null && <s>{x.before}</s>}<ins>{x.after}</ins></div>)}
            {c.why && <p style={{ margin: 0 }}><span className="muted">Why: </span>{c.why}</p>}
            {c.blocked.length > 0 && <p className="small" style={{ margin: 0 }}>Blocked by its checks: {c.blocked.join('; ')}</p>}
            {c.evidence.flag && <p className="small" style={{ margin: 0 }}>Flagged in review, where {c.evidence.flag.said === 'agent' ? 'she said' : 'the caller said'} {c.evidence.flag.quote ? `“${c.evidence.flag.quote}”` : 'a line that is not shown (a call whose words are kept private)'}: {c.evidence.flag.note} <Link to={`/calls/${c.evidence.flag.callId}`}>Open the call</Link></p>}
            {c.evidence.quotes.length > 0 && <ul className="small" style={{ margin: 0 }}>{c.evidence.quotes.map((x, k) => <li key={k}>“{x.quote}” <Link to={`/calls/${x.callId}`}>call</Link></li>)}</ul>}
            {c.evidence.calls.length > 0 && <p className="small muted" style={{ margin: 0 }}>Calls cited: {c.evidence.calls.map((x, k) => <span key={x.id}>{k ? ', ' : ''}<Link to={`/calls/${x.id}`}>{x.outcome ? `${x.outcome} (${GRADE[x.grade ?? ''] ?? 'source unknown'})` : 'no outcome recorded'}</Link></span>)}</p>}
            {c.brief && c.brief.lines.length > 0 && <details><summary className="small">The brief, word for word: version {c.brief.before} and {c.brief.after}</summary>
              <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{c.brief.lines.map((l, k) => <div key={k} className={l.kind === 'added' ? 'diffrow-add' : l.kind === 'removed' ? 'diffrow-del' : 'muted'}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text}</div>)}</pre></details>}
            {c.approvals.length > 0 && <p className="small muted" style={{ margin: 0 }}>{c.approvals.map((a, k) => <span key={k}>{k ? ' · ' : ''}{a.what}: {STATUS_WORDS[a.status] ?? a.status}{a.by ? ` by ${a.by}` : ''}, {date(a.at, true)}</span>)}</p>}
            {c.test?.label && <p className="small" style={{ margin: 0 }}>Test result: {c.test.label}</p>}
            <div className="row" style={{ gap: 8 }}>
              {c.canRevert.ok && (may ? <Btn size="sm" busy={busy === c.id} onClick={() => void go('proposal.revert', c)}>Take it back…</Btn>
                : <Btn size="sm" disabled fix={null} reason="Only an owner or a builder can take a change back.">Take it back</Btn>)}
              {c.canAdopt.ok && (may ? <Btn size="sm" busy={busy === c.id} onClick={() => void go('proposal.adopt', c)}>Adopt without a live test…</Btn>
                : <Btn size="sm" disabled fix={null} reason="Only an owner or a builder can adopt a change.">Adopt without a live test</Btn>)}
              {c.status === 'promoted' && !c.canRevert.ok && c.canRevert.reason && <span className="small muted">{c.canRevert.reason}</span>}
            </div>
          </li>))}</ol>}
      </Async>
    </Card>
  );
}
