// The approval sheet: what, why, impact, who, expiry. Only a deliberate hold (or two presses) approves; model text never does.
import { useEffect, useState } from 'react';
import { listActions } from './api.ts';
import { fieldLabel, fieldValue, toolAsk } from './labels.ts';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useApp, undoLine } from './store.tsx';
import { Btn, Chip, HoldButton, Sheet } from './ui.tsx';
import { APPROVERS, RISK_WORDS } from './tools.ts';
import { date } from './format.ts';

export function ApprovalSheet() {
  const { pending: p, decide, closePending, me } = useApp();
  const [args, setArgs] = useState<[string, string][]>([]);
  // The person must see what they are approving before the hold is offered: the amount, the audience, the cap.
  const [details, setDetails] = useState<'loading' | 'ready' | 'failed'>('loading');
  const pid = p?.actionId;
  useEffect(() => {
    if (!pid) { setArgs([]); return; }
    let live = true;
    setDetails('loading');
    listActions('proposed').then(rows => { const a = rows.find(r => r.id === pid); if (live && a && a.args && typeof a.args === 'object') setArgs(Object.entries(a.args as Record<string, unknown>).map(([k, v]) => [fieldLabel(k), fieldValue(k, v)] as [string, string | null]).filter((x): x is [string, string] => !!x[1])); }).then(() => { if (live) setDetails('ready'); }, () => { if (live) setDetails('failed'); });
    return () => { live = false; };
  }, [pid]);
  const confirmed = p?.state === 'done' && p.outcome && 'status' in p.outcome && p.outcome.status === 'confirmed';
  // A confirmed approval closes itself shortly after saying so, so what it produced (a secret, a page change) is not hidden behind it.
  useEffect(() => { if (!confirmed) return; const t = setTimeout(closePending, 900); return () => clearTimeout(t); }, [confirmed, closePending]);
  if (!p) return null;
  const role = me?.member?.role ?? 'viewer';
  const allowed = (APPROVERS[p.risk] ?? []).includes(role);
  const w = RISK_WORDS[p.risk] ?? { label: p.risk, line: '' };
  const done = p.state === 'done';
  const rc = p.outcome && 'status' in p.outcome ? p.outcome : null;
  return (
    <Sheet title={done ? 'Result' : 'Approve to continue'} onClose={closePending}>
      <div className="stack-s">
        <div className="row"><Chip tone={p.risk === 'spend' || p.risk === 'external' ? 'terra' : 'marigold'} icon={<ShieldCheck size={13} aria-hidden />}>{w.label}</Chip><span className="small muted">{p.by === 'you' ? 'You asked for this' : p.requester ?? 'Waiting for approval'} · expires {date(p.expiresAt, true)}</span></div>
        <p style={{ fontSize: '1.0625rem', fontWeight: 600 }}>{toolAsk(p.tool, p.summary)}</p>
        {args.length > 0 && <dl className="kv small">{args.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        <p className="muted">{w.line} {undoLine(p.risk)}</p>
      </div>
      {!done && !allowed && (
        <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> A {role} cannot approve this. Ask an {(APPROVERS[p.risk] ?? ['owner']).join(' or ')} to approve it.</p>
      )}
      {!done && allowed && details === 'loading' && <p className="small muted" role="status">Loading the details of this change…</p>}
      {!done && allowed && details === 'failed' && <Btn disabled reason="The details of this change could not be loaded, so it is not safe to approve blind. Close this and open it again.">Hold to approve</Btn>}
      {!done && allowed && details === 'ready' && <HoldButton label="Hold to approve" onConfirm={() => void decide(true)} busy={p.state === 'running'} />}
      {done && rc?.status === 'confirmed' && <p className="donetxt">Done. Confirmed by the server, not assumed.</p>}
      {done && rc?.status === 'not_executed' && <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> Could not finish: {rc.reason}. Nothing was changed.</p>}
      {done && rc?.status === 'unknown' && <p className="state state-failed" role="alert"><AlertTriangle size={20} aria-hidden /> The result is unknown: {rc.reason}. Vyakti did not retry. Check Activity before trying again.</p>}
      {done && p.error && <p className="state state-failed" role="alert">{p.error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {done ? <Btn kind="primary" onClick={closePending}>Close</Btn> : <Btn kind="ghost" onClick={() => void decide(false)}>Decline</Btn>}
      </div>
    </Sheet>
  );
}
