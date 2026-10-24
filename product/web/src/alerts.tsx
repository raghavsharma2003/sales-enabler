// The in-app alert for a crisis hand-off (calls/handoffs.ts): every on-duty member sees it within 5 s, on every page,
// until they open it or someone takes the hand-off. It never repeats what the caller said.
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { run } from './api.ts';
import { useApp } from './store.tsx';
import { Link } from './router.tsx';
import { Btn } from './ui.tsx';

interface Alert { id: string; handOffId: string | null; conversationId: string | null; text: string; at: string }
const POLL_MS = 5000;

export function AlertBanner() {
  const { me } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    if (!me?.member) return;
    let live = true;
    const tick = () => run<{ alerts: Alert[] }>('alert.list', {}).then(r => { if (live) setAlerts(r.alerts ?? []); }).catch(() => {});
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, [me?.member?.id]);
  if (!alerts.length) return null;
  const a = alerts[0];
  return <div className="hint hint-bad alertbanner" role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 16px' }}>
    <AlertTriangle size={20} aria-hidden />
    <span className="grow"><strong>{a.text}</strong>{alerts.length > 1 ? ` (${alerts.length} waiting)` : ''}</span>
    <Link to="/handoffs" className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>Open hand-offs</Link>
    <Btn size="sm" onClick={async () => { await run('alert.ack', { alertId: a.id }).catch(() => {}); setAlerts(x => x.filter(y => y.id !== a.id)); }}>Seen</Btn>
  </div>;
}
