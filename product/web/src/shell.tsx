// The app shell: rail (desktop) / bottom bar (phone), top bar with the Page | Assistant switch, the docked operator.
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Bot, Hash, LifeBuoy, Megaphone, MessageCircle, MoreHorizontal, Newspaper, PhoneCall, Settings, Users } from 'lucide-react';
import { AlertBanner } from './alerts.tsx';
import { Link, usePath, usePendingLeave } from './router.tsx';
import { useApp } from './store.tsx';
import { Btn, Segmented, SampleRibbon, Sheet, Skeleton } from './ui.tsx';

// Kept out of the first load (decision.2026-10-24.web-budget-per-chunk). The dock loads on its first open: at once where it
// is always shown (1180 px and up), on the first tap of Assistant on a phone. The approval sheet loads when the browser is
// idle, so Review opens at once, or immediately if an approval opens before then.
const loadApproval = () => import('./approval.tsx');
const Dock = lazy(() => import('./operator.tsx').then(m => ({ default: m.Dock })));
const ApprovalSheet = lazy(() => loadApproval().then(m => ({ default: m.ApprovalSheet })));
const WIDE = '(min-width: 1180px)';
import { pageInfo } from './tools.ts';
import { inr } from './format.ts';
import { useData } from './store.tsx';
import { walletGet } from './wallet.ts';

const NAV = [
  { to: '/', label: 'Today', icon: Newspaper }, { to: '/campaigns', label: 'Campaigns', icon: Megaphone }, { to: '/calls', label: 'Calls', icon: PhoneCall }, { to: '/handoffs', label: 'Hand-offs', icon: LifeBuoy },
  { to: '/contacts', label: 'Contacts', icon: Users }, { to: '/agents', label: 'Agents', icon: Bot }, { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/numbers', label: 'Numbers', icon: Hash }, { to: '/settings', label: 'Settings', icon: Settings },
];
const isActive = (to: string, path: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'));

export function Shell({ children }: { children: ReactNode }) {
  const { view, setView, sample, toasts, me, pending } = useApp();
  const dockOpen = useDockOpened(view === 'talk');
  const approvalReady = useIdle();
  const path = usePath();
  const [more, setMore] = useState(false);
  const info = pageInfo(path);
  const wallet = useData('wallet', walletGet);
  const low = wallet.data && wallet.data.runwayDays != null && wallet.data.runwayDays < 2;
  return (
    <div className="app" data-view={view}>
      {/* The first Tab stop: past the navigation to the page (WCAG 2.4.1). */}
      <a href="#main" className="skiplink" onClick={e => { e.preventDefault(); setView('page'); document.getElementById('main')?.focus(); }}>Skip to main content</a>
      <nav className="rail" aria-label="Main">
        <Link to="/" className="brand" aria-label="Vyakti, home"><Mark /><span className="brand-word"><b>Vyakti</b></span></Link>
        <div className="nav">
          {NAV.map(n => <Link key={n.to} to={n.to} aria-current={isActive(n.to, path) ? 'page' : undefined}><n.icon size={20} aria-hidden /><span>{n.label}</span></Link>)}
        </div>
        <div className="rail-foot">
          {wallet.data && <Link to="/settings/billing" className={`walletchip${low ? ' low' : ''}`} aria-label={`Wallet ${inr(wallet.data.balanceMilli)}${low ? ', under 2 days of runway' : ''}`}><span>Wallet</span><b className="tnum">{inr(wallet.data.balanceMilli)}</b>{wallet.data.balanceMilli <= 0 && <span className="walletadd">Add money</span>}</Link>}
          <div className="walletchip" style={{ textAlign: 'left' }}><span>{me?.workspace.name}</span><span className="walletchip-dim">{me?.member?.name} · {me?.member?.role ? me.member.role.charAt(0).toUpperCase() + me.member.role.slice(1) : ''}</span></div>
        </div>
      </nav>
      <div className="workarea">
        <div className="main">
          {sample && <SampleRibbon />}
          <AlertBanner />
          <div className="topbar">
            <span className="grow">{info.label}</span>
            <span className="viewswitch"><Segmented label="Show page or assistant" value={view} onChange={setView} options={[{ value: 'page' as const, label: 'Page' }, { value: 'talk' as const, label: 'Assistant' }]} /></span>
          </div>
          <main id="main" tabIndex={-1}>{children}</main>
        </div>
        {dockOpen && <Suspense fallback={<aside className="dock" aria-busy="true" aria-label="Assistant loading"><div style={{ padding: 16 }}><Skeleton rows={3} /></div></aside>}><Dock /></Suspense>}
      </div>
      <nav className="bottombar" aria-label="Main">
        <Link to="/" aria-current={path === '/' && view === 'page' ? 'page' : undefined} onClick={() => setView('page')}><Newspaper size={20} aria-hidden />Today</Link>
        <Link to="/campaigns" aria-current={isActive('/campaigns', path) && view === 'page' ? 'page' : undefined} onClick={() => setView('page')}><Megaphone size={20} aria-hidden />Campaigns</Link>
        <button type="button" className="talkbtn" aria-pressed={view === 'talk'} onClick={() => setView(view === 'talk' ? 'page' : 'talk')}><span className="talkdot"><MessageCircle size={20} aria-hidden /></span>Assistant</button>
        <Link to="/calls" aria-current={isActive('/calls', path) && view === 'page' ? 'page' : undefined} onClick={() => setView('page')}><PhoneCall size={20} aria-hidden />Calls</Link>
        <button type="button" onClick={() => setMore(true)}><MoreHorizontal size={20} aria-hidden />More</button>
      </nav>
      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="more-list">{NAV.filter(n => !['/', '/campaigns', '/calls'].includes(n.to)).map(n => <Link key={n.to} to={n.to} onClick={() => { setMore(false); setView('page'); }}><n.icon size={20} aria-hidden />{n.label}</Link>)}</div>
        </Sheet>
      )}
      {(approvalReady || pending) && <Suspense fallback={null}><ApprovalSheet /></Suspense>}
      <LeaveQuestion />
      <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}</div>
    </div>
  );
}

export function Mark({ size = 36 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="currentColor" opacity="0.14" /><circle cx="12" cy="16" r="3.2" fill="currentColor" /><path d="M18 9a8.5 8.5 0 0 1 0 14" stroke="var(--terra)" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>;
}

/** Leaving a page with unsaved changes (router useLeaveGuard): stay is the default, leaving drops the changes. */
function LeaveQuestion() {
  const { pending, leave, stay } = usePendingLeave();
  if (!pending) return null;
  return (
    <Sheet title="Leave without saving?" onClose={stay}>
      <p>{pending.message}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Btn kind="primary" onClick={stay}>Stay and keep editing</Btn><Btn kind="danger" onClick={leave}>Leave without saving</Btn></div>
    </Sheet>
  );
}

/** True once the dock has been shown: at once on a wide screen (it is always there), else from the first tap of Assistant. */
function useDockOpened(talking: boolean) {
  const [opened, setOpened] = useState(() => talking || matchMedia(WIDE).matches);
  useEffect(() => {
    if (opened) return;
    if (talking) { setOpened(true); return; }
    const m = matchMedia(WIDE), on = () => { if (m.matches) setOpened(true); };
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [opened, talking]);
  return opened;
}

/** True once the browser is idle after the first paint (Safari has no requestIdleCallback: a short timeout instead), and
 *  the approval sheet's code is fetched then, so a tap on Review does not wait for it. */
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const done = () => { void loadApproval(); setIdle(true); };
    if ('requestIdleCallback' in window) { const id = requestIdleCallback(done, { timeout: 2000 }); return () => cancelIdleCallback(id); }
    const t = setTimeout(done, 600);
    return () => clearTimeout(t);
  }, []);
  return idle;
}
