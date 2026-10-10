"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AudioLines, LayoutDashboard, Megaphone, MessagesSquare, Users, Network, Bot, FlaskConical, BookOpen, Plug, Rocket, BarChart3, ListChecks, Search, PanelLeftClose, X, ArrowRight, LogOut, LoaderCircle, ChevronDown, RefreshCw, ArrowUpRight, AlertCircle, CalendarClock, Inbox, UserRoundCog, Building2, Globe2, ShieldCheck } from 'lucide-react';
import type { PlatformRecord, PlatformViewProps, WorkspaceData } from '@/lib/platform/contracts';
import { AgentsView } from '@/components/platform/agents-view';
import { TestsView } from '@/components/platform/tests-view';
import { ReleasesView } from '@/components/platform/releases-view';
import { CampaignsView } from '@/components/platform/campaigns-view';
import { GroupsView } from '@/components/platform/groups-view';
import { CustomersView } from '@/components/platform/customers-view';
import { BrainView } from '@/components/platform/brain-view';
import { CommitmentsView } from '@/components/platform/commitments-view';
import { ConversationsView } from '@/components/platform/conversations-view';
import { CommandView } from '@/components/platform/command-view';
import { QualityView } from '@/components/platform/quality-view';
import { IntegrationsView } from '@/components/platform/integrations-view';
import { TeamView } from '@/components/platform/team-view';
import { InboxView } from '@/components/platform/inbox-view';
import { AutomationsView } from '@/components/platform/automations-view';
import { CompanyView } from '@/components/platform/company-view';
import { DeploymentsView } from '@/components/platform/deployments-view';
import { UsageView } from '@/components/platform/usage-view';
import { AccountSecurity } from '@/components/account-access';
import { readWorkspaceHash, resolveSection, searchWorkspace, sectionLabels, workspaceArea, workspaceAreas, workspaceHref } from '@/lib/platform/navigation';
import { WorkspaceHistoryGuard } from '@/lib/platform/history-guard';
import shell from './workspace-shell.module.css';
import './inbox.css';
import './deployments.css';
import './channel-agents.css';

const areaIcons: Record<string, typeof LayoutDashboard> = { home: LayoutDashboard, company: Building2, agents: Bot, campaigns: Megaphone, activity: MessagesSquare, settings: UserRoundCog };
const views: Record<string, React.ComponentType<PlatformViewProps>> = { 'Command centre': CommandView, Campaigns: CampaignsView, Conversations: ConversationsView, Customers: CustomersView, GroupAI: GroupsView, Agents: AgentsView, 'Test lab': TestsView, 'Company brain': BrainView, Integrations: IntegrationsView, Releases: ReleasesView, Quality: QualityView, Commitments: CommitmentsView, Inbox: InboxView, Automations: AutomationsView, Company: CompanyView, Deployments: DeploymentsView, 'Usage & services': UsageView, 'Account security': () => <main className="pc-page"><AccountSecurity/></main>, 'Team & access': ({ workspace }) => <TeamView user={workspace.user}/> };
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
type AccountSession = { user: { verificationRequired?: boolean; emailVerified?: boolean } };
function needsEmailVerification(session: AccountSession) { return session.user.verificationRequired && !session.user.emailVerified; }
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new RequestError(response.status, data.error || 'The request could not be completed.');
  return data;
}

export default function Page() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [records, setRecords] = useState<PlatformRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState('Command centre');
  const [focusId, setFocusId] = useState<string | undefined>();
  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string>('home');
  const historyGuard = useRef<WorkspaceHistoryGuard | null>(null);
  useEffect(() => { const media = window.matchMedia('(max-width:820px)'); const sync = () => setCompact(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);
  useEffect(() => { if (!mobile) return; document.querySelector<HTMLAnchorElement>('.pc-sidebar a')?.focus(); const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobile(false); }; window.addEventListener('keydown', escape); return () => { window.removeEventListener('keydown', escape); document.querySelector<HTMLButtonElement>('.pc-menu')?.focus(); }; }, [mobile]);
  const [search, setSearch] = useState('');
  const [updated, setUpdated] = useState('');
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    let redirecting = false;
    try {
      const session = await request<AccountSession>('/api/auth');
      if (version !== loadVersion.current) return;
      if (needsEmailVerification(session)) {
        setWorkspace(null); setRecords([]); setError(''); setLoading(true); redirecting = true;
        window.location.replace('/account/security'); return;
      }
      const [data, platform] = await Promise.all([request<WorkspaceData>('/api/workspace'), request<{ records: PlatformRecord[] }>('/api/platform')]);
      if (version !== loadVersion.current) return;
      const profiles = platform.records.filter(r => r.kind === 'customer_profile');
      data.contacts = data.contacts.map(c => ({ ...c, ...profiles.find(p => p.data.contactId === c.id)?.data, id: c.id }));
      setWorkspace(data); setRecords(platform.records); setError(''); setUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      if (version !== loadVersion.current) return;
      setWorkspace(null); setRecords([]);
      if (e instanceof RequestError && e.status === 401) setError('');
      else {
        if (e instanceof RequestError && e.status === 403) {
          try {
            const session = await request<AccountSession>('/api/auth');
            if (version !== loadVersion.current) return;
            if (needsEmailVerification(session)) {
              setError(''); setLoading(true); redirecting = true; window.location.replace('/account/security'); return;
            }
          } catch { /* Removed membership must stay inaccessible; show the original access error. */ }
        }
        if (version !== loadVersion.current) return;
        setError(e instanceof Error ? e.message : 'Could not load workspace.');
      }
    }
    finally { if (version === loadVersion.current && !redirecting) setLoading(false); }
  }, []);
  const signOut = useCallback(async () => {
    try { await request('/api/auth', { method: 'DELETE' }); loadVersion.current++; setWorkspace(null); setRecords([]); setError(''); setLoading(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to sign out. Please try again.'); }
  }, []);
  useEffect(() => {
    void load();
    const guard = new WorkspaceHistoryGuard({
      read: () => ({ route: readWorkspaceHash(window.location.hash), state: window.history.state }),
      write: (mode, state, route) => {
        if (mode === 'push') window.history.pushState(state, '', route ? workspaceHref(route.section, route.focusId) : undefined);
        else window.history.replaceState(state, '', route ? workspaceHref(route.section, route.focusId) : undefined);
      },
      go: delta => window.history.go(delta),
      allowLeave: () => window.dispatchEvent(new Event('relay:before-navigation', { cancelable: true })),
      accept: next => { setActive(next.section); setFocusId(next.focusId); setExpandedArea(workspaceArea(next.section).id); setMobile(false); },
      newScope: () => window.crypto.randomUUID(),
    });
    historyGuard.current = guard;
    const sync = () => guard.sync();
    sync(); window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); if (historyGuard.current === guard) historyGuard.current = null; };
  }, [load]);
  const navigate = useCallback((section: string, recordId?: string) => {
    const [rawSection, embeddedId] = section.split('/');
    const next = { section: resolveSection(rawSection), focusId: recordId || embeddedId };
    if (historyGuard.current?.navigate(next)) { setMobile(false); setSearch(''); }
  }, []);
  useEffect(() => { if (workspace) { document.getElementById('workspace-main')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); } }, [active, focusId, !!workspace]);
  const act = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    if (action === 'workspace.refresh') { await load(); return; }
    setBusy(true); setError('');
    try { const result = await request('/api/platform', { method: 'POST', body: JSON.stringify({ ...body, action }) }); await load(); return result; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); throw e; }
    finally { setBusy(false); }
  }, [load]);
  if (loading) return <div className="pc-loading"><AudioLines size={32}/><LoaderCircle className="spin" size={20}/><p>Opening your workspace</p></div>;
  if (!workspace && error) return <main className="pc-loading"><AlertCircle size={28}/><p role="alert">{error}</p><button className="pc-button primary" onClick={() => void load()}>Try again</button><a href="/account/security">Account security</a><button className="pc-button" onClick={() => void signOut()}>Sign out</button></main>;
  if (!workspace) return <Authentication onSuccess={load}/>;
  const CurrentView = views[active] || CommandView;
  const found = searchWorkspace(search, workspace, records);
  const activeArea = workspaceArea(active);
  const follow = (event: React.MouseEvent<HTMLAnchorElement>, section: string, id?: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(section, id);
  };
  return <div className={`pc-app ${shell.app}`}>
    <a className="pc-skip" href="#workspace-main" onClick={event => { event.preventDefault(); document.getElementById('workspace-main')?.focus(); }}>Skip to workspace</a>
    {mobile && <button className="pc-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside id="workspace-navigation" className={`pc-sidebar ${shell.sidebar} ${mobile ? 'is-open' : ''}`} inert={compact && !mobile} onKeyDown={event => {
      if (!compact || !mobile || event.key !== 'Tab') return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')).filter(target => target.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><button className="pc-iconbutton pc-navclose" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={18}/></button>
      <a className="pc-brand" href={workspaceHref('Command centre')} onClick={event => follow(event, 'Command centre')}><span className="pc-brand-symbol"><AudioLines size={22}/></span> Relay <span className="pc-brand-note">workspace</span></a>
      <a className={`pc-company ${shell.company}`} href={workspaceHref('Company')} onClick={event => follow(event, 'Company')}><span className="pc-company-avatar">{workspace.organization.name.slice(0, 2).toUpperCase()}</span><div><strong>{workspace.organization.name}</strong><small>Company profile</small></div><ArrowUpRight size={14}/></a>
      <nav aria-label="Main navigation" className={shell.navigation}>{workspaceAreas.map(area => {
        const Icon = areaIcons[area.id]; const expanded = expandedArea === area.id; const currentArea = activeArea.id === area.id;
        return <div key={area.id} className={`${shell.area} ${area.id === 'settings' ? shell.settings : ''}`}>
          <div className={shell.areaHead} data-active={currentArea}>
            <a href={workspaceHref(area.destination)} className={shell.areaLink} aria-current={area.sections.length === 1 && currentArea ? 'page' : undefined} onClick={event => follow(event, area.destination)}><Icon size={19} aria-hidden="true"/><span>{area.label}</span></a>
            {area.sections.length > 1 && <button type="button" className={shell.expand} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${area.label}`} aria-expanded={expanded} aria-controls={`nav-${area.id}`} onClick={() => setExpandedArea(expanded ? '' : area.id)}><ChevronDown size={15} aria-hidden="true"/></button>}
          </div>
          {area.sections.length > 1 && <div id={`nav-${area.id}`} className={shell.subnavigation} hidden={!expanded}>{area.sections.map(section => <a key={section} href={workspaceHref(section)} className={shell.subLink} aria-current={active === section ? 'page' : undefined} onClick={event => follow(event, section)}>{sectionLabels[section]}{section === 'Commitments' && records.some(record => record.kind === 'commitment' && record.status === 'open') && <span className={shell.count}>{records.filter(record => record.kind === 'commitment' && record.status === 'open').length}</span>}</a>)}</div>}
        </div>;
      })}</nav>
      <div className="pc-sidebar-bottom"><div className="pc-account"><div className="pc-avatar">{workspace.user.email.slice(0,1).toUpperCase()}</div><span><strong>{workspace.user.role === "viewer" ? "Viewer" : workspace.user.role === "operator" ? "Operator" : "Workspace owner"}</strong><small>{workspace.user.email}</small></span><button aria-label="Sign out" className="pc-iconbutton" onClick={() => void signOut()}><LogOut size={16}/></button></div></div>
    </aside>
    <div className="pc-workspace" inert={compact && mobile}><header className={`pc-topbar ${shell.topbar}`}><button className="pc-iconbutton pc-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={() => setMobile(true)}><PanelLeftClose size={18}/></button><div className={`pc-breadcrumb ${shell.breadcrumb}`}><span>{activeArea.label}</span>{activeArea.label !== sectionLabels[active] && <><span aria-hidden="true">/</span><strong>{sectionLabels[active]}</strong></>}</div><div className={`pc-search ${shell.search}`} onKeyDown={event => { if (event.key === 'Escape') { setSearch(''); event.currentTarget.querySelector('input')?.focus(); } }}><Search size={16}/><input aria-label="Search workspace" placeholder="Search agents, customers, conversations…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15}/></button>}{search && <div className={`pc-search-results ${shell.searchResults}`} aria-label="Workspace search results">{found.length ? found.map(item => <a key={item.id} href={workspaceHref(item.section, item.focusId)} onClick={event => follow(event, item.section, item.focusId)}><span>{item.label}<small>{item.detail}</small></span><ArrowUpRight size={14}/></a>) : <p>No matching saved records or pages.</p>}</div>}</div><button className="pc-iconbutton" disabled={busy} aria-label="Refresh workspace" onClick={() => void load()}><RefreshCw size={16} className={busy ? 'spin' : ''}/></button></header>
      {error && <div className="pc-error" role="alert"><AlertCircle size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      <div id="workspace-main" tabIndex={-1} className="pc-main" key={['Agents', 'Campaigns'].includes(active) ? active : `${active}:${focusId || ''}`}><CurrentView records={records} workspace={workspace} act={act} busy={busy} navigate={navigate} focusId={focusId}/></div>
      <footer className="pc-footer"><span>Workspace refreshed {updated}</span><span>Relay · working name</span></footer>
    </div>
  </div>;
}

function Authentication({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError(''); try { const session = await request<AccountSession>('/api/auth', { method: 'POST', body: JSON.stringify({ ...data, mode }) }); if (needsEmailVerification(session)) { window.location.replace('/account/security'); return; } await onSuccess(); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); } finally { setBusy(false); } };
  return <main className="pc-auth"><section className="pc-auth-story"><a className="pc-brand" href="/"><span className="pc-brand-symbol"><AudioLines size={22}/></span>Relay</a><div className="pc-auth-copy"><h1>A better conversation.<br/>A company that<br/>follows through.</h1><p>Create your AI representatives, give them the right context, and turn each customer conversation into accountable work.</p><div className="pc-auth-flow"><span><BookOpen size={18}/> Teach</span><ArrowRight size={15}/><span><FlaskConical size={18}/> Test</span><ArrowRight size={15}/><span><AudioLines size={18}/> Converse</span></div></div><img src="/images/maya-sculpture.png" className="pc-auth-art" alt="Abstract interwoven sculpture representing connected conversations"/><small>Voice · Relationships · Company intelligence</small></section><section className="pc-auth-form"><div><h2>{mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h2><p className="pc-muted">{mode === 'register' ? 'Start with your company. Build your first representative.' : 'Continue where your customers left off.'}</p><form onSubmit={submit} className="pc-form">{mode === 'register' && <label className="pc-field">Company name<input className="pc-input" name="organization" required maxLength={120} autoComplete="organization" placeholder="Your company"/></label>}<label className="pc-field">Work email<input className="pc-input" name="email" type="email" required autoComplete="email" placeholder="you@company.com"/></label><label className="pc-field">Password<input className="pc-input" name="password" type="password" minLength={8} maxLength={128} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>{mode === 'register' ? <p className="pc-muted">Use at least 8 characters.</p> : <a href="/account/forgot">Forgot password?</a>}{error && <p role="alert" className="pc-error-text">{error}</p>}<button className="pc-button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <ArrowRight size={16}/>} {mode === 'register' ? 'Create workspace' : 'Sign in'}</button></form><p className="pc-auth-switch">{mode === 'register' ? 'Already have a workspace?' : 'New here?'} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>{mode === 'register' ? 'Sign in' : 'Create workspace'}</button></p><p className="pc-auth-footnote">Your workspace starts empty. Voice providers can be connected when you are ready.</p></div></section></main>;
}
