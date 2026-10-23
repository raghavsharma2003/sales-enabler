// The live browser call inside the test panel: who is speaking, live captions from both sides, a timer, an always-visible
// "AI agent" disclosure, and a hang-up. When the call ends it links to the call record, filed under what ran.
import { useEffect, useRef, useState } from 'react';
import { Bot, PhoneOff } from 'lucide-react';
import { BrowserCall, type CallState, type Caption, type Join } from './browser-call.ts';
import { Btn } from './ui.tsx';
import { Link } from './router.tsx';

const STATE_WORDS: Record<CallState, string> = { connecting: 'Connecting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', ended: 'Call ended' };
const END_WORDS: Record<string, string> = {
  caller_hung_up: 'You hung up.', agent_ended: 'She ended the call.', max_duration: 'The test call reached its time limit.',
  max_cost: 'The test call reached its cost limit.', silence_timeout: 'The call ended after a long silence.', error: 'The call stopped because of an error.',
  handed_off: 'The call was handed to a person.', completed: 'The call ended.',
};

export function BrowserCallView({ join, conversationId, agentName, onClose }: { join: Join; conversationId: string; agentName: string; onClose: () => void }) {
  const [state, setState] = useState<CallState>('connecting');
  const [caps, setCaps] = useState<Caption[]>([]);
  const [end, setEnd] = useState<{ endReason?: string; error?: string } | null>(null);
  const [secs, setSecs] = useState(0);
  const call = useRef<BrowserCall | null>(null);
  const box = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const c = call.current = new BrowserCall(join, {
      state: setState,
      // A partial caption is replaced by the next words from the same side; a final one stays.
      caption: cap => setCaps(cs => {
        const last = cs[cs.length - 1];
        if (last && !last.final && last.who === cap.who) return [...cs.slice(0, -1), cap];
        return [...cs, cap];
      }),
      ended: setEnd,
    });
    void c.start();
    const t0 = Date.now(); const timer = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => { clearInterval(timer); c.hangup(); };
  }, [join]);
  useEffect(() => { box.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }, [caps]);

  const live = state !== 'ended';
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="bcall" aria-label="Browser test call">
      <div className="bcall-head">
        <span className="chip chip-peacock" title="She tells the caller once that she is an AI"><Bot size={14} aria-hidden /> AI agent</span>
        <span className={`bcall-state s-${state}`} role="status">{STATE_WORDS[state]}</span>
        {live && <span className="tnum muted small" aria-label={`Call time ${clock}`}>{clock}</span>}
      </div>
      <ol className="bcall-caps" ref={box} aria-live="polite" aria-label="Live captions">
        {caps.length === 0 && live && <li className="muted small">{state === 'connecting' ? 'Allow the microphone if your browser asks.' : 'Captions appear here as you both speak.'}</li>}
        {caps.map((c, i) => (
          <li key={i} className={`bcap ${c.who}${c.final ? '' : ' partial'}`}>
            <b>{c.who === 'agent' ? agentName : 'You'}</b> <span lang="hi">{c.text}</span>
          </li>))}
      </ol>
      {live
        ? <Btn kind="danger" icon={<PhoneOff size={16} aria-hidden />} onClick={() => call.current?.hangup()}>Hang up</Btn>
        : <div className="stack-s">
            {end?.error
              ? <p className="state state-failed small" role="alert">{end.error}</p>
              : <p className="small">{END_WORDS[end?.endReason ?? ''] ?? 'The call ended.'} <Link to={`/calls/${conversationId}`}>See this call</Link>. It is filed as a test call under the stack that ran.</p>}
            <Btn size="sm" onClick={onClose}>Close</Btn>
          </div>}
    </div>
  );
}
