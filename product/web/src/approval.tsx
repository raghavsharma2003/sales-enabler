// The approval sheet: what, why, impact, who, expiry. Only a deliberate hold (or two presses) approves; model text never does.
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useApp, undoLine } from './store.tsx';
import { Btn, Chip, HoldButton, Sheet } from './ui.tsx';
import { APPROVERS, RISK_WORDS } from './tools.ts';
import { date } from './format.ts';

export function ApprovalSheet() {
  const { pending: p, decide, closePending, me } = useApp();
  if (!p) return null;
  const role = me?.member?.role ?? 'viewer';
  const allowed = (APPROVERS[p.risk] ?? []).includes(role);
  const w = RISK_WORDS[p.risk] ?? { label: p.risk, line: '' };
  const done = p.state === 'done';
  const rc = p.outcome && 'status' in p.outcome ? p.outcome : null;
  return (
    <Sheet title={done ? 'Result' : 'Approve to continue'} onClose={closePending}>
      <div className="stack-s">
        <div className="row"><Chip tone={p.risk === 'spend' || p.risk === 'external' ? 'terra' : 'marigold'} icon={<ShieldCheck size={13} aria-hidden />}>{w.label}</Chip><span className="small muted">Asked by VP · expires {date(p.expiresAt, true)}</span></div>
        <p style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{p.summary}</p>
        <p className="muted">{w.line} {undoLine(p.risk)}</p>
      </div>
      {!done && !allowed && (
        <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> A {role} cannot approve this. Ask an {(APPROVERS[p.risk] ?? ['owner']).join(' or ')} to approve it.</p>
      )}
      {!done && allowed && <HoldButton label="Hold to approve" onConfirm={() => void decide(true)} busy={p.state === 'running'} />}
      {done && rc?.status === 'confirmed' && <p className="donetxt">Done. Confirmed by the server, not assumed.</p>}
      {done && rc?.status === 'not_executed' && <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> Not executed: {rc.reason}. Nothing was changed.</p>}
      {done && rc?.status === 'unknown' && <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> The result is unknown: {rc.reason}. VP did not retry. Check Activity before trying again.</p>}
      {done && p.error && <p className="state state-failed" role="alert">{p.error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {done ? <Btn kind="primary" onClick={closePending}>Close</Btn> : <Btn kind="ghost" onClick={() => void decide(false)}>Decline</Btn>}
      </div>
    </Sheet>
  );
}
