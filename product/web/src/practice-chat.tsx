// Practice chat: the builder types as the caller and reads her reply from the saved draft, through the same safety door as
// a call. What the door did shows under her reply (a held-back figure, the disclosure, the crisis lines). Nothing is
// dialled and nothing reaches the call log; it costs only model tokens, like a practice caller. Kept only on request.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useApp } from './store.tsx';
import { Btn, Chip, scrollMotion } from './ui.tsx';
import { WhySaid, type WhyUse } from './why-said.tsx';

interface Note { rule: string; action: 'replace' | 'block' | 'prefix'; label: string; reason: string; original?: string }
interface Line { who: 'agent' | 'caller'; text: string; notes?: Note[]; sources?: WhyUse[] }
interface Reply { caller: string | null; said: string; notes: Note[]; sources: WhyUse[]; ended: boolean }

const ACTION: Record<Note['action'], string> = { replace: 'Said instead', block: 'Held back', prefix: 'Added first' };

export function PracticeChat({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { act, toast } = useApp();
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: scrollMotion() }); }, [lines.length]);

  const turn = async (message: string | null) => {
    setBusy(true); setError(null);
    const history = lines.map(l => ({ who: l.who, text: l.text }));
    const r = await act<Reply>('test.chat', { agentId, history, ...(message ? { message } : {}) }, { quiet: true });
    setBusy(false);
    if (!r.ok) { setError(r.reason); return; }
    const next: Line[] = [...lines];
    if (r.result.caller !== null) next.push({ who: 'caller', text: r.result.caller });
    next.push({ who: 'agent', text: r.result.said, notes: r.result.notes, sources: r.result.sources ?? [] });
    setLines(next); setText(''); setKept(false);
    if (r.result.ended) setEnded(true);
  };
  // An empty Send puts the cursor in the box rather than showing a standing hint under the button.
  const send = (e: FormEvent) => { e.preventDefault(); const m = text.trim(); if (!m) { inRef.current?.focus(); return; } if (!busy && !ended) void turn(m); };
  const keep = async () => {
    const r = await act<{ runId: string }>('test.chat_keep', { agentId, turns: lines.map(l => ({ who: l.who, text: l.text })), notes: lines.flatMap(l => l.notes ?? []) }, { quiet: true });
    if (r.ok) { setKept(true); toast('Practice chat kept in this agent\'s test history.'); } else toast(r.reason, 'bad');
  };
  const reset = () => { setLines([]); setText(''); setEnded(false); setKept(false); setError(null); };

  return (
    <section aria-labelledby="pc-h" className="stack-s">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <h4 id="pc-h">Practice chat</h4>
        <Chip tone="neutral" icon={<MessageSquare size={13} aria-hidden />}>Practice chat · no call placed</Chip>
      </div>
      <p className="small muted">Type as the caller. She answers from the saved draft through the same safety checks as a call. Nothing is dialled and nothing goes to the call log; it costs only model tokens, like a practice caller. It shows what she says, not how she sounds.</p>
      {lines.length > 0 && (
        <ol className="pchat" ref={logRef} aria-label={`Practice chat with ${agentName}`} aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className={`pchat-line ${l.who}`}>
              <p lang="hi"><b>{l.who === 'agent' ? agentName : 'You, as the caller'}:</b> {l.text || <span className="muted">(nothing said)</span>}</p>
              {l.sources && <WhySaid uses={l.sources} />}
              {l.notes && l.notes.length > 0 && (
                <ul className="pchat-notes" aria-label="What the safety checks did">
                  {l.notes.map((n, j) => (
                    <li key={j}>
                      <ShieldCheck size={13} aria-hidden /> <strong>{ACTION[n.action]}: {n.label}.</strong> <span>{n.reason.replace(/[.\s]+$/, '')}.</span>
                      {n.original && <details><summary>What she would have said</summary><p lang="hi">{n.original}</p></details>}
                    </li>))}
                </ul>)}
            </li>))}
        </ol>)}
      {ended && <p className="small" role="status">She ended the conversation. Start over to try again.</p>}
      {error && <p className="small hint-bad" role="alert">{error}</p>}
      {!ended && (
        <form className="pchat-form" onSubmit={send}>
          <label className="sr" htmlFor="pc-in">What the caller says</label>
          <textarea id="pc-in" ref={inRef} className="input" rows={2} maxLength={1000} value={text} placeholder="Type what the caller says" onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="primary" type="submit" busy={busy && !!text.trim()} icon={<Send size={16} aria-hidden />}>Send</Btn>
            {lines.length === 0 && <Btn busy={busy && !text.trim()} onClick={() => void turn(null)}>Let her open</Btn>}
          </div>
        </form>)}
      {lines.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          {lines.length < 2 ? null : kept ? <Chip tone="leaf">Kept in the test history</Chip> : <Btn size="sm" onClick={keep}>Keep for review</Btn>}
          <Btn size="sm" icon={<RotateCcw size={14} aria-hidden />} onClick={reset}>Start over</Btn>
        </div>)}
    </section>
  );
}
