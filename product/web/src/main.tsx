import { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import './pages.css';
import { AppProvider, useApp } from './store.tsx';
import { Router, match, usePath, useNav } from './router.tsx';
import { Shell } from './shell.tsx';
import { Skeleton } from './ui.tsx';
import Auth from './pages/auth.tsx';

const Today = lazy(() => import('./pages/today.tsx'));
const Agents = lazy(() => import('./pages/agents.tsx'));
const Contacts = lazy(() => import('./pages/contacts.tsx'));
const Campaigns = lazy(() => import('./pages/campaigns.tsx'));
const Calls = lazy(() => import('./pages/calls.tsx'));
const Insights = lazy(() => import('./pages/insights.tsx'));
const Numbers = lazy(() => import('./pages/numbers.tsx'));
const Settings = lazy(() => import('./pages/settings.tsx'));

function Routes() {
  const path = usePath();
  let m: Record<string, string> | null;
  if (path === '/') return <Today />;
  if ((m = match('/agents/:id', path))) return <Agents id={m.id} />;
  if (path === '/agents') return <Agents />;
  if ((m = match('/contacts/:id', path))) return m.id === 'import' ? <Contacts tab="import" /> : <Contacts id={m.id} />;
  if (path === '/contacts') return <Contacts />;
  if (path.startsWith('/audiences')) return <Contacts tab="audiences" />;
  if (path === '/campaigns/new') return <Campaigns create />;
  if ((m = match('/campaigns/:id', path))) return <Campaigns id={m.id} />;
  if (path === '/campaigns') return <Campaigns />;
  if ((m = match('/calls/:id', path))) return <Calls id={m.id} />;
  if (path === '/calls') return <Calls />;
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
  useEffect(() => {
    if (!booted) return;
    if (!authed && !onAuth) go('/login', true);
    if (authed && onAuth) go('/', true);
  }, [authed, booted, onAuth, go]);
  if (!booted) return <div className="page" aria-busy="true"><Skeleton rows={4} /></div>;
  if (!authed) return path === '/signup' ? <Auth mode="signup" /> : <Auth mode="login" />;
  return <Shell><Suspense fallback={<div className="page"><Skeleton rows={5} /></div>}><Routes /></Suspense></Shell>;
}

createRoot(document.getElementById('root')!).render(<AppProvider><Router><Gate /></Router></AppProvider>);
