'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Database, KeyRound, Link2, RefreshCw, Search } from 'lucide-react';
import type { IntegrationCatalogItem } from '../lib/integrations/catalog';
import type { ConnectionView } from '../lib/integrations/vault';
import type { AiUsageSummary } from '../lib/ai/usage';

type Catalog = { catalog: IntegrationCatalogItem[]; connections: ConnectionView[] };
type OAuthSetup = { providers: Record<'google' | 'microsoft', { ready: boolean; missing: string[]; callbackUrl: string }> };
const capability = (value: string) => value.replaceAll('_', ' ');
const stamp = (value?: string) => value ? new Date(value).toLocaleString() : 'Not yet';

export function IntegrationCatalog({ navigate }: { navigate: (section: string) => void }) {
  const [data, setData] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState('gmail');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oauth, setOauth] = useState<OAuthSetup | null>(null);
  const [allowSend, setAllowSend] = useState(false);
  async function load(signal?: AbortSignal) {
    const response = await fetch('/api/integrations', { cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not read connections.');
    setData(result);
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }); return () => controller.abort(); }, []);
  useEffect(() => { const abort = new AbortController(); fetch('/api/integrations/oauth/setup', { signal: abort.signal }).then(async response => { if (response.ok) setOauth(await response.json()); }).catch(() => {}); const result = new URLSearchParams(window.location.search).get('integration'); if (result) setNotice(result === 'connected' ? 'Your account is connected. Sync material to start reviewing it.' : 'Account authorization did not finish. Check setup and try connecting again.'); return () => abort.abort(); }, []);
  const item = data?.catalog.find(entry => entry.id === selected);
  const connection = data?.connections.find(entry => entry.integrationId === selected);
  const categories = [...new Set(data?.catalog.map(entry => entry.category) || [])];
  const entries = data?.catalog.filter(entry => (category === 'all' || category === entry.category) && `${entry.name} ${entry.category}`.toLowerCase().includes(query.toLowerCase().trim())) || [];
  const readyCount = data?.connections.filter(entry => entry.status === 'connected').length || 0;
  const oauthProvider = ['gmail', 'google_calendar', 'google_drive'].includes(selected) ? 'google' : ['microsoft_mail', 'microsoft_calendar', 'microsoft_drive'].includes(selected) ? 'microsoft' : null;
  const oauthStatus = oauthProvider ? oauth?.providers[oauthProvider] : null;
  const canSend = selected === 'gmail' || selected === 'microsoft_mail';
  async function authorize() {
    if (!oauthStatus?.ready || busy) return;
    setBusy('authorize'); setError('');
    try { const response = await fetch('/api/integrations/oauth/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integrationId: selected, allowSend: canSend && allowSend }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not start account authorization.'); const target = new URL(result.authorizeUrl); if (!['accounts.google.com', 'login.microsoftonline.com'].includes(target.hostname) || target.protocol !== 'https:') throw new Error('Unexpected authorization destination.'); window.location.assign(target.href); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect this account.'); setBusy(''); }
  }
  async function act(action: string) {
    if (!item || busy) return;
    setBusy(action); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, integrationId: item.id, ...(action === 'configure' ? { credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim())) } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The connection action could not finish.');
      if (action === 'configure') { setCredentials({}); setNotice('Credentials saved securely. Check access before syncing.'); }
      if (action === 'check') setNotice('Account check passed. Sync verifies content access and stages material for review.');
      if (action === 'sync') setNotice(`${result.staged ?? 0} items staged for Company brain review. ${result.skipped ?? 0} already imported items skipped.`);
      if (action === 'disconnect') setNotice('Connection removed. Previously imported material remains in Company brain for review.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection action failed.'); await load().catch(() => {}); }
    finally { setBusy(''); }
  }
  function choose(id: string) { setSelected(id); setCredentials({}); setAllowSend(false); setNotice(''); setError(''); }
  return <section className="connections-workbench" aria-label="Company connections">
    <div className="connections-intro"><div><h2>Bring your company into one workspace</h2><p>Connect the source, verify access, then review what comes in. Imported material becomes useful knowledge after extraction and approval.</p></div><button className="pc-button" onClick={() => navigate('brain')}><Database size={16}/> Open Company brain<ArrowRight size={15}/></button></div>
    <div className="connection-path" aria-label="Connection workflow"><span><Link2 size={15}/>Connect</span><ArrowRight size={14}/><span><Check size={15}/>Check access</span><ArrowRight size={14}/><span><RefreshCw size={15}/>Sync</span><ArrowRight size={14}/><span><Database size={15}/>Review knowledge</span></div>
    {error && <p className="wf-error" role="alert">{error}</p>}{notice && <p className="wf-notice" role="status">{notice}</p>}
    <div className="connection-layout"><div className="connection-directory"><div className="connection-directory-head"><strong>Integrations</strong><span className="pc-muted">{readyCount} checked</span></div>
      <label className="connection-search"><Search size={15}/><input aria-label="Search integrations" placeholder="Search integrations" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label className="pc-field">Category<select className="pc-select" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All company systems</option>{categories.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
      <div className="connection-list">{!data && <p role="status" className="pc-muted">Loading connection capabilities…</p>}{entries.map(entry => { const account = data?.connections.find(value => value.integrationId === entry.id); return <button className="connection-row" type="button" key={entry.id} aria-current={entry.id === selected ? 'true' : undefined} disabled={!!busy} onClick={() => choose(entry.id)}><span><strong>{entry.name}</strong><small>{entry.category}</small></span><span className={`connection-status ${account?.status === 'connected' ? 'is-connected' : ''}`}>{account?.status === 'connected' ? 'Checked' : account?.status === 'error' ? 'Needs attention' : account ? 'Check access' : entry.status === 'available' ? 'Set up' : 'Not implemented'}</span></button>; })}{data && entries.length === 0 && <p className="pc-empty">No integration matches this search.</p>}</div>
    </div><div className="connection-detail" key={selected}>{item && <><div className="pc-pagehead"><div><h2>{item.name}</h2><p className="pc-muted">{item.category.charAt(0).toUpperCase() + item.category.slice(1)} connection</p></div><span className="pc-badge">{connection?.status === 'connected' ? 'Access checked' : item.status === 'available' ? 'Account setup needed' : 'Adapter not implemented'}</span></div>
      <p>{item.setup}</p>{item.notes && <p className="pc-muted">{item.notes}</p>}
      {!!item.capabilities.length && <div className="connection-capabilities" aria-label="Implemented capabilities">{item.capabilities.map(value => <span key={value}><Check size={13}/>{capability(value)}</span>)}</div>}
      {item.status === 'available' ? <>{oauthProvider && <div className="pc-form"><h3>Connect your {oauthProvider === 'google' ? 'Google' : 'Microsoft'} account</h3><p className="pc-muted">Authorize access on your provider’s sign-in page. You can revoke it there or disconnect it here.</p>{canSend && <label className="pc-row"><input type="checkbox" checked={allowSend} onChange={event => setAllowSend(event.target.checked)}/><span>Also allow email sending for campaigns I explicitly launch and send.</span></label>}<button className="pc-button primary" disabled={!oauthStatus?.ready || !!busy} onClick={() => void authorize()}>{busy === 'authorize' ? 'Opening account authorization…' : `Connect ${oauthProvider === 'google' ? 'Google' : 'Microsoft'}`}</button>{oauthStatus && !oauthStatus.ready && <details><summary>Administrator setup required</summary><p className="pc-muted">Register the OAuth app, then add these server settings: {oauthStatus.missing.join(', ')}.</p><label className="pc-field">Authorized redirect URI<input className="pc-input" readOnly value={oauthStatus.callbackUrl}/></label></details>}</div>}<details className="provider-details" open={!oauthProvider}><summary>{oauthProvider ? 'Advanced: provide an existing access token' : 'Configure credentials'}</summary><form className="pc-form" onSubmit={event => { event.preventDefault(); void act('configure'); }}><h3><KeyRound size={15}/> {connection ? 'Replace connection credentials' : 'Connect your account'}</h3><p className="pc-muted">Credentials are encrypted on the server and never shown again. Manually supplied access tokens may expire; reconnect or replace them when access changes.</p>
        <label className="pc-field">{item.credentialType === 'webhook_secret' ? 'Signing secret · at least 32 bytes' : item.credentialType === 'api_token' ? 'Private API token' : 'OAuth access token'}<input className="pc-input" type="password" autoComplete="off" required value={credentials.token || ''} onChange={event => setCredentials({ ...credentials, token: event.target.value })}/></label>
        {item.fields?.map(input => <label className="pc-field" key={input.key}>{input.label}<input className="pc-input" type={input.type || 'text'} autoComplete={input.type === 'password' ? 'off' : undefined} required={input.required} placeholder={input.placeholder} value={credentials[input.key] || ''} onChange={event => setCredentials({ ...credentials, [input.key]: event.target.value })}/></label>)}
        {canSend && <label className="pc-row"><input type="checkbox" checked={!!credentials.sendPermission} onChange={event => setCredentials({ ...credentials, sendPermission: event.target.checked ? selected === 'gmail' ? 'https://www.googleapis.com/auth/gmail.send' : 'Mail.Send' : '' })}/><span>This token has email-send permission, and I authorize its use for explicitly approved campaign sends.</span></label>}
        <button className="pc-button primary" disabled={!!busy || !credentials.token?.trim()}>{busy === 'configure' ? 'Saving securely…' : 'Save connection'}</button>
      </form></details>{connection && <div className="connection-health"><h3>Connection health</h3><dl><div><dt>Access checked</dt><dd>{stamp(connection.checkedAt)}</dd></div><div><dt>Last sync</dt><dd>{stamp(connection.lastSyncAt)}</dd></div>{connection.lastSyncCount !== undefined && <div><dt>Items staged in last sync</dt><dd>{connection.lastSyncCount}</dd></div>}</dl>{connection.error && <p className="wf-error">{connection.error}</p>}{connection.webhookPath && <label className="pc-field">Incoming webhook path<input className="pc-input" readOnly value={connection.webhookPath}/></label>}
        <div className="pc-row"><button className="pc-button" disabled={!!busy} onClick={() => void act('check')}>{busy === 'check' ? 'Checking…' : 'Check access'}</button>{item.capabilities.some(value => value.startsWith('pull_')) && <button className="pc-button primary" disabled={!!busy || connection.status !== 'connected'} onClick={() => void act('sync')}>{busy === 'sync' ? 'Syncing…' : 'Sync up to 15 items'}</button>}<button className="pc-button quiet" disabled={!!busy} onClick={() => { if (window.confirm('Disconnect this account? Imported sources remain available for review.')) void act('disconnect'); }}>Disconnect</button></div>
        <p className="pc-muted">Sync stages source material. It does not approve facts, merge customers, grant contact consent, or send messages.</p></div>}</> : <p className="pc-empty">This provider does not have an executable adapter yet. You can upload an export in Company brain or use the signed webhook connector to bring approved data into the same review flow.</p>}
    </>}</div></div>
  </section>;
}

export function AiUsagePanel() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null), [error, setError] = useState('');
  useEffect(() => { const abort = new AbortController(); fetch('/api/ai/usage?days=30', { signal: abort.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Usage unavailable.'); setUsage(result.usage || result); }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); }); return () => abort.abort(); }, []);
  return <section className="pc-panel"><h2>AI usage and model routing</h2><p className="pc-muted">Extraction, planning, feedback, retrieval answers and evaluation use task-specific Azure deployment settings. These receipts cover that text pipeline; live voice and external service charges are separate.</p>{error && <p role="alert">{error}</p>}{usage ? <dl className="ai-usage"><div><dt>Completed requests · 30 days</dt><dd>{usage.completedRequests}</dd></div><div><dt>Input / output tokens</dt><dd>{usage.inputTokens.toLocaleString()} / {usage.outputTokens.toLocaleString()}</dd></div><div><dt>Estimated text cost</dt><dd>{usage.estimatedCostUsd === null ? 'Rates not configured' : `$${usage.estimatedCostUsd.toFixed(4)}`}</dd></div><div><dt>Uncertain provider outcomes</dt><dd>{usage.uncertainRequests}</dd></div></dl> : !error && <p role="status">Reading usage receipts…</p>}<p className="pc-muted">Requests retain a usage receipt and do not automatically retry an uncertain provider result. Actual Azure billing and grant credits remain authoritative.</p></section>;
}
