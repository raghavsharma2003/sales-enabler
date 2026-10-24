import { Component, lazy, Suspense, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import './pages.css';
import { AppProvider, useApp } from './store.tsx';
import { Link, Router, match, usePath, useNav } from './router.tsx';
import { Shell } from './shell.tsx';
import { Skeleton } from './ui.tsx';
import { record, startBeacon } from './beacon.ts';
const Auth = lazy(() => import('./pages/auth.tsx'));

const Today = lazy(() => import('./pages/today.tsx'));
const Agents = lazy(() => import('./pages/agents.tsx'));
const Contacts = lazy(() => import('./pages/contacts.tsx'));
const Campaigns = lazy(() => import('./pages/campaigns.tsx'));
const Calls = lazy(() => import('./pages/calls.tsx'));
const HandOffs = lazy(() => import('./pages/handoffs.tsx'));
const Insights = lazy(() => import('./pages/insights.tsx'));
const Numbers = lazy(() => import('./pages/numbers.tsx'));
const Settings = lazy(() => import('./pages/settings.tsx'));

function Routes() {
  const path = usePath();
  let m: Record<string, string> | null;
  if (path === '/') return <Today />;
  if ((m = match('/agents/:id', path))) return <Agents id={m.id} />;
  if (path === '/agents') return <Agents />;
  if ((m = match('/contacts/:id', path))) return m.id === 'import' || m.id === 'review' ? <Contacts tab={m.id} /> : <Contacts id={m.id} />;
  if (path === '/contacts') return <Contacts />;
  if (path.startsWith('/audiences')) return <Contacts tab="audiences" />;
  if (path === '/campaigns/new') return <Campaigns create />;
  if ((m = match('/campaigns/:id', path))) return <Campaigns id={m.id} />;
  if (path === '/campaigns') return <Campaigns />;
  if ((m = match('/calls/:id', path))) return <Calls id={m.id} />;
  if (path === '/calls') return <Calls />;
  if (path === '/handoffs') return <HandOffs />;
  if (path === '/insights') return <Insights />;
  if (path === '/numbers') return <Numbers />;
  if ((m = match('/settings/:tab', path))) return <Settings tab={m.tab} />;
  if (path === '/settings') return <Settings />;
  return <div className="page"><div className="state"><h3>No such page</h3><p>That address does not exist. Use the menu to find your way.</p></div></div>;
}

function Gate() {
  const { me, booted } = useApp();
  const path = usePath();
  const go = useNav();
  const authed = !!me;
  const onAuth = path === '/login' || path === '/signin' || path === '/signup';
  // The client event log runs only while someone is signed in; each page change is a step in their timeline.
  useEffect(() => { startBeacon(authed); }, [authed]);
  const last = useRef(path);
  useEffect(() => { if (last.current !== path) record('nav', undefined, { from: last.current }); last.current = path; }, [path]);
  useEffect(() => {
    if (!booted) return;
    if (!authed && !onAuth) go('/login', true);
    if (authed && onAuth) go('/', true);
  }, [authed, booted, onAuth, go]);
  if (!booted) return <div className="page" aria-busy="true"><Skeleton rows={4} /></div>;
  if (!authed) return <Suspense fallback={<div className="page"><Skeleton rows={4} /></div>}>{path === '/signup' ? <Auth mode="signup" /> : <Auth mode="login" />}</Suspense>;
  return <Shell><PageBoundary path={path}><Suspense fallback={<div className="page"><Skeleton rows={5} /></div>}><Routes /></Suspense></PageBoundary></Shell>;
}

/** A page that throws while drawing shows this in its place (the rest of the app keeps working) and the client event log
 *  gets the error with React's component stack. Moving to another page clears it. */
class PageBoundary extends Component<{ path: string; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { record('error', err.message, { type: err.name, stack: err.stack, componentStack: info.componentStack ?? undefined, boundary: 'page' }); }
  componentDidUpdate(prev: { path: string }) { if (prev.path !== this.props.path && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page"><div className="state state-failed" role="alert"><strong>Something went wrong on this page</strong>
        <p>It has been noted for the Vyakti team. Reload to try again; your saved work is safe.</p>
        <div className="row" style={{ justifyContent: 'center' }}><button type="button" className="btn btn-primary" onClick={() => location.reload()}><span>Reload the page</span></button><Link className="btn btn-secondary" to="/"><span>Go to Today</span></Link></div></div></div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<AppProvider><Router><Gate /></Router></AppProvider>);
