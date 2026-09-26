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
import { AccountSecurity } from '@/components/account-access';
import './inbox.css';
import './deployments.css';
import './channel-agents.css';

const navigation = [
  { label: 'Operate', items: [[LayoutDashboard, 'Command centre'], [Megaphone, 'Campaigns'], [CalendarClock, 'Automations'], [Inbox, 'Inbox'], [MessagesSquare, 'Conversations'], [Users, 'Customers'], [Network, 'GroupAI']] },
  { label: 'Build', items: [[Bot, 'Agents'], [FlaskConical, 'Test lab'], [BookOpen, 'Company brain'], [Plug, 'Integrations'], [Rocket, 'Releases'], [Globe2, 'Deployments']] },
  { label: 'Improve', items: [[BarChart3, 'Quality'], [ListChecks, 'Commitments']] },
  { label: 'Workspace', items: [[Building2, 'Company'], [UserRoundCog, 'Team & access'], [ShieldCheck, 'Account security']] },
] as const;
const views: Record<string, React.ComponentType<PlatformViewProps>> = { 'Command centre': CommandView, Campaigns: CampaignsView, Conversations: ConversationsView, Customers: CustomersView, GroupAI: GroupsView, Agents: AgentsView, 'Test lab': TestsView, 'Company brain': BrainView, Integrations: IntegrationsView, Releases: ReleasesView, Quality: QualityView, Commitments: CommitmentsView, Inbox: InboxView, Automations: AutomationsView, Company: CompanyView, Deployments: DeploymentsView, 'Account security': () => <main className="pc-page"><AccountSecurity/></main>, 'Team & access': ({ workspace }) => <TeamView user={workspace.user}/> };
const sectionNames = Object.keys(views);
class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
type AccountSession = { user: { verificationRequired?: boolean; emailVerified?: boolean } };
function needsEmailVerification(session: AccountSession) { return session.user.verificationRequired && !session.user.emailVerified; }
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new RequestError(response.status, data.error || 'The request could not be completed.');
  return data;
}
function normalized(value: string) { const key = value.replace(/[-_]/g, ' ').toLowerCase(); return sectionNames.find(n => n.toLowerCase() === key) || ({ brain: 'Company brain', groups: 'GroupAI', tests: 'Test lab', command: 'Command centre' } as Record<string, string>)[key] || 'Command centre'; }
function decoded(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function hashState(hash: string): { section: string; focusId?: string } { const [rawSection, rawId] = hash.replace(/^#/, '').split('/'); return { section: normalized(decoded(rawSection || 'Command centre')), focusId: rawId ? decoded(rawId) : undefined }; }

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
  useEffect(() => { void load(); const sync = () => { const next = hashState(window.location.hash); setActive(next.section); setFocusId(next.focusId); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, [load]);
  const navigate = useCallback((section: string, recordId?: string) => { const [rawSection, embeddedId] = section.split('/'); const id = recordId || embeddedId; const value = normalized(rawSection); setActive(value); setFocusId(id); window.location.hash = `${encodeURIComponent(value)}${id ? `/${encodeURIComponent(id)}` : ''}`; setMobile(false); setSearch(''); }, []);
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
  const found = search.trim() ? [
    ...sectionNames.filter(s => s.toLowerCase().includes(search.toLowerCase())).map(label => ({ id: label, label, type: 'Workspace', target: label })),
    ...workspace.contacts.filter(c => String(c.name).toLowerCase().includes(search.toLowerCase())).map(c => ({ id: c.id, recordId: c.id, label: String(c.name), type: 'Customer', target: `Customers/${c.id}` })),
    ...records.filter(r => ['agent_definition', 'brain_source', 'campaign', 'group_world', 'commitment'].includes(r.kind) && String(r.data.name || r.data.title || '').toLowerCase().includes(search.toLowerCase())).map(r => ({ id: r.id, recordId: r.id, label: String(r.data.name || r.data.title), type: r.kind.replaceAll('_', ' '), target: `${({ agent_definition: 'Agents', brain_source: 'Company brain', campaign: 'Campaigns', group_world: 'GroupAI', commitment: 'Commitments' } as Record<string, string>)[r.kind]}/${r.id}` })),
  ].slice(0, 12) : [];
  return <div className="pc-app">
    <a className="pc-skip" href="#workspace-main">Skip to workspace</a>
    {mobile && <button className="pc-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside id="workspace-navigation" className={`pc-sidebar ${mobile ? 'is-open' : ''}`} inert={compact && !mobile}><button className="pc-iconbutton pc-navclose" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={18}/></button>
      <a className="pc-brand" href="#Command%20centre"><span className="pc-brand-symbol"><AudioLines size={22}/></span> Relay <span className="pc-brand-note">workspace</span></a>
      <div className="pc-company"><span className="pc-company-avatar">{workspace.organization.name.slice(0, 2).toUpperCase()}</span><div><strong>{workspace.organization.name}</strong><small>Company workspace</small></div><ChevronDown size={14}/></div>
      <nav aria-label="Main navigation">{navigation.map(group => <div className="pc-navgroup" key={group.label}><p>{group.label}</p>{group.items.map(([Icon, title]) => <button key={title} className={`pc-navitem ${active === title ? 'active' : ''}`} aria-current={active === title ? 'page' : undefined} onClick={() => navigate(title)}><Icon size={17}/><span>{title}</span>{title === 'Commitments' && records.some(r => r.kind === 'commitment' && r.status === 'open') && <span className="pc-navcount">{records.filter(r => r.kind === 'commitment' && r.status === 'open').length}</span>}</button>)}</div>)}</nav>
      <div className="pc-sidebar-bottom"><button className="pc-runtime-link" onClick={() => navigate('Integrations')}><span className="pc-status-dot"/><span>Provider setup<small>Browser voice · interchangeable</small></span><ArrowUpRight size={15}/></button><div className="pc-account"><div className="pc-avatar">{workspace.user.email.slice(0,1).toUpperCase()}</div><span><strong>{workspace.user.role === "viewer" ? "Viewer" : workspace.user.role === "operator" ? "Operator" : "Workspace owner"}</strong><small>{workspace.user.email}</small></span><button aria-label="Sign out" className="pc-iconbutton" onClick={() => void signOut()}><LogOut size={16}/></button></div></div>
    </aside>
    <div className="pc-workspace" inert={compact && mobile}><header className="pc-topbar"><button className="pc-iconbutton pc-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={() => setMobile(true)}><PanelLeftClose size={18}/></button><div className="pc-breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div><div className="pc-search"><Search size={15}/><input aria-label="Search workspace" placeholder="Search your workspace…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={13}/></button>}{search && <div className="pc-search-results">{found.length ? found.map(item => <button key={item.id} onClick={() => navigate(item.target)}><span>{item.label}<small>{item.type}</small></span><ArrowUpRight size={14}/></button>) : <p>No matching records.</p>}</div>}</div><button className="pc-iconbutton" disabled={busy} aria-label="Refresh workspace" onClick={() => void load()}><RefreshCw size={16} className={busy ? 'spin' : ''}/></button></header>
      {error && <div className="pc-error" role="alert"><AlertCircle size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      <div id="workspace-main" tabIndex={-1} className="pc-main" key={`${active}:${focusId || ''}`}><CurrentView records={records} workspace={workspace} act={act} busy={busy} navigate={navigate} focusId={focusId}/></div>
      <footer className="pc-footer"><span>Saved to your workspace</span><span>Last refreshed {updated} · Relay is a working name</span></footer>
    </div>
  </div>;
}

function Authentication({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError(''); try { const session = await request<AccountSession>('/api/auth', { method: 'POST', body: JSON.stringify({ ...data, mode }) }); if (needsEmailVerification(session)) { window.location.replace('/account/security'); return; } await onSuccess(); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); } finally { setBusy(false); } };
  return <main className="pc-auth"><section className="pc-auth-story"><a className="pc-brand" href="/"><span className="pc-brand-symbol"><AudioLines size={22}/></span>Relay</a><div className="pc-auth-copy"><h1>A better conversation.<br/>A company that<br/>follows through.</h1><p>Create your AI representatives, give them the right context, and turn each customer conversation into accountable work.</p><div className="pc-auth-flow"><span><BookOpen size={18}/> Teach</span><ArrowRight size={15}/><span><FlaskConical size={18}/> Test</span><ArrowRight size={15}/><span><AudioLines size={18}/> Converse</span></div></div><img src="/images/maya-sculpture.png" className="pc-auth-art" alt="Abstract interwoven sculpture representing connected conversations"/><small>Voice · Relationships · Company intelligence</small></section><section className="pc-auth-form"><div><h2>{mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h2><p className="pc-muted">{mode === 'register' ? 'Start with your company. Build your first representative.' : 'Continue where your customers left off.'}</p><form onSubmit={submit} className="pc-form">{mode === 'register' && <label className="pc-field">Company name<input className="pc-input" name="organization" required maxLength={120} autoComplete="organization" placeholder="Your company"/></label>}<label className="pc-field">Work email<input className="pc-input" name="email" type="email" required autoComplete="email" placeholder="you@company.com"/></label><label className="pc-field">Password<input className="pc-input" name="password" type="password" minLength={8} maxLength={128} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>{mode === 'register' ? <p className="pc-muted">Use at least 8 characters.</p> : <a href="/account/forgot">Forgot password?</a>}{error && <p role="alert" className="pc-error-text">{error}</p>}<button className="pc-button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <ArrowRight size={16}/>} {mode === 'register' ? 'Create workspace' : 'Sign in'}</button></form><p className="pc-auth-switch">{mode === 'register' ? 'Already have a workspace?' : 'New here?'} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>{mode === 'register' ? 'Sign in' : 'Create workspace'}</button></p><p className="pc-auth-footnote">Your workspace starts empty. Voice providers can be connected when you are ready.</p></div></section></main>;
}
