// The docked test panel for an agent: six practice callers (simulate) and a browser call. A test never falls back to another
// stack: if no stack is chosen, the result says "invalid, with the reason", never a pass.
import { useState } from 'react';
import { AlertTriangle, Mic, Play } from 'lucide-react';
import { useApp } from './store.tsx';
import { Btn, Chip } from './ui.tsx';
import { Link } from './router.tsx';
import { simulate } from './data.ts';
import { getStack } from '../../shared/stacks.ts';
import type { SimResult } from './types.ts';

const TWEAKS = ['Thoda slow bolo', 'Discount mat bolna', 'Opening chhoti karo', 'Aur warm ho jao'];

export function TestPanel() {
  const { agentCtx: a, act, say, hasTool, toast } = useApp();
  const [sim, setSim] = useState<SimResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState<{ state: 'idle' | 'asking' | 'unavailable'; reason?: string }>({ state: 'idle' });
  if (!a) return <div className="testpanel"><p className="muted">Open an agent to test her here.</p></div>;
  const stack = a.stackId ? getStack(a.stackId) : null;

  const run = async () => {
    setBusy(true);
    try { setSim(await simulate(a.id)); } catch { toast('Could not run the practice callers.', 'bad'); }
    setBusy(false);
  };
  const browser = async () => {
    setCall({ state: 'asking' });
    const r = await act<{ available?: boolean; reason?: string }>('test.browser_call', { agentId: a.id, useDraft: true }, { quiet: true });
    if (!r.ok) setCall({ state: 'unavailable', reason: r.reason });
    else if (r.result.available === false) setCall({ state: 'unavailable', reason: r.result.reason });
    else setCall({ state: 'idle' });
  };

  return (
    <div className="testpanel">
      <div className="stack-s">
        <h3 className="serif" style={{ fontSize: '1.25rem' }}>Test {a.name}</h3>
        <div className="row" style={{ gap: 6 }}>
          <Chip tone={a.dirty ? 'marigold' : 'leaf'}>{a.dirty ? 'Unsaved changes' : `Saved draft v${a.version}`}</Chip>
          {stack ? <Chip tone="peacock" title="The stack a test runs on">{stack.label.split(' (')[0]}</Chip> : <Chip tone="brick">No voice stack</Chip>}
        </div>
        {a.dirty && <p className="small muted">Tests run the saved draft. Save your changes to test them.</p>}
      </div>

      <section aria-labelledby="sim-h" className="stack-s">
        <h4 id="sim-h">Practice callers</h4>
        <p className="small muted">Six made-up callers: someone hurried, suspicious, hard of hearing, asking for a person, saying the price is high, and saying stop. Costs a few rupees, reaches no one.</p>
        {!hasTool('test.simulate') ? <p className="small hint-bad">Practice callers are not switched on in this server yet.</p>
          : !stack ? <Btn disabled reason="Choose a voice stack first. A test never falls back to another one." fix={{ label: 'Choose one', to: `/agents/${a.id}?tab=voice` }} icon={<Play size={16} aria-hidden />}>Run 6 practice callers</Btn>
          : <Btn kind="primary" busy={busy} icon={<Play size={16} aria-hidden />} onClick={run}>Run 6 practice callers</Btn>}
        {sim && (
          <div className="stack-s" aria-live="polite">
            <p><strong className="tnum">{sim.filter(r => r.verdict === 'pass').length} of {sim.length}</strong> passed{sim.some(r => r.verdict === 'invalid') && <> · <span className="hint-bad">{sim.filter(r => r.verdict === 'invalid').length} invalid, did not run</span></>}</p>
            <ul className="simlist">{sim.map(r => (
              <li key={r.id}>
                <details>
                  <summary><span>{r.scenario}</span><Chip tone={r.verdict === 'pass' ? 'leaf' : r.verdict === 'fail' ? 'brick' : 'marigold'}>{r.verdict === 'pass' ? 'Passed' : r.verdict === 'fail' ? 'Failed' : 'Invalid'}</Chip></summary>
                  {r.reason && <p className="small" style={{ margin: '6px 0' }}><AlertTriangle size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> {r.reason}</p>}
                  {r.turns.slice(0, 12).map((t, i) => <p key={i} className={`simturn ${t.who}`} lang="hi"><b>{t.who === 'agent' ? a.name : 'Caller'}:</b> {t.text}</p>)}
                  {r.checks.length > 0 && <ul className="checks">{r.checks.map(c => <li key={c.label}>{c.ok ? <span className="ok">Passed</span> : <span className="bad">Failed</span>} {c.label}{c.detail ? <span className="muted"> · {c.detail}</span> : null}</li>)}</ul>}
                  {r.endedBy && <p className="small muted">Ended by: {r.endedBy.replace(/_/g, ' ')}. Graded by code, not by a model.</p>}
                </details>
              </li>))}</ul>
            {sim.some(r => r.verdict === 'fail') && <Btn size="sm" onClick={() => say(`Practice caller failed on ${a.name}. Suggest a fix as a diff.`)}>Ask Saarthi for a fix</Btn>}
          </div>
        )}
      </section>

      <section aria-labelledby="bc-h" className="stack-s">
        <h4 id="bc-h">Hear her yourself</h4>
        <p className="small muted">She calls you in the browser as a made-up customer, with live captions. She says once that she is an AI.</p>
        <Btn icon={<Mic size={16} aria-hidden />} busy={call.state === 'asking'} onClick={browser}>Call me in the browser</Btn>
        {call.state === 'unavailable' && <p className="state state-missing small" role="status">{call.reason ?? 'Browser calls are not available yet.'}</p>}
      </section>

      <section aria-labelledby="tw-h" className="stack-s">
        <h4 id="tw-h">Change her by talking</h4>
        <div className="row" style={{ gap: 8 }}>{TWEAKS.map(t => <button key={t} type="button" className="sugg" onClick={() => say(t)}>{t}</button>)}</div>
        <p className="small muted">Each one becomes a change you can accept or not. Nothing is saved without you.</p>
      </section>
      <p className="small muted">Test results are filed under the combination that actually ran. <Link to="/calls">See calls</Link></p>
    </div>
  );
}
