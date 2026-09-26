'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Inbox, MessageCircle, RefreshCw, Search } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import type { InboxMessage, InboxThread } from '../../lib/messaging/contracts';

type Thread = InboxThread & { id: string };
type Overview = { setup: { configured: boolean; ready: boolean; status?: string; webhookPath?: string; missing?: string[] }; threads: Thread[] };
type Detail = { id: string; thread: InboxThread; messages: InboxMessage[]; replyWindowOpen: boolean };
const exactPhone = (value: unknown) => typeof value === 'string' && /^\+?[1-9]\d{6,14}$/.test(value.trim()) ? value.trim().replace(/^\+/, '') : '';

export function InboxView({ records, workspace, navigate }: PlatformViewProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkId, setLinkId] = useState('');
  const [copied, setCopied] = useState(false);
  const load = async (threadId = selected) => {
    const response = await fetch('/api/messaging', { cache: 'no-store' });
    const value = await response.json() as Overview & { error?: string };
    if (!response.ok) throw new Error(value.error || 'Inbox could not be loaded.');
    setOverview(value);
    const chosen = threadId || value.threads[0]?.id;
    if (chosen) {
      const threadResponse = await fetch(`/api/messaging?threadId=${encodeURIComponent(chosen)}`, { cache: 'no-store' });
      const thread = await threadResponse.json() as Detail & { error?: string };
      if (!threadResponse.ok) throw new Error(thread.error || 'Thread could not be loaded.');
      setSelected(chosen); setDetail(thread);
    } else { setSelected(''); setDetail(null); }
  };
  useEffect(() => { let active = true; void (async () => { try { await load(); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Inbox could not be loaded.'); } })(); return () => { active = false; }; }, []);
  const current = overview?.threads.find(item => item.id === selected);
  const shown = useMemo(() => (overview?.threads || []).filter(item => (filter === 'all' || item.handoff === filter) &&
    `${item.phone} ${item.lastPreview}`.toLowerCase().includes(query.toLowerCase())), [overview, filter, query]);
  const viewer = workspace.user.role === 'viewer';
  const candidates = workspace.contacts.map(contact => {
    const profile = records.find(item => item.kind === 'customer_profile' && item.status === 'active' && item.data.contactId === contact.id);
    return { id: contact.id, name: String(profile?.data.name || contact.name || 'Customer'), phone: exactPhone(profile ? profile.data.phone : contact.phone) };
  }).filter(contact => contact.phone && contact.phone === current?.phone);
  const act = async (body: Record<string, unknown>) => {
    if (viewer) { setError('Viewer access is read-only. Ask an owner for operator access.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/messaging', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(value.error || 'Action could not be saved.');
      await load(selected);
      setNotice(body.action === 'reply' ? 'Reply submitted to WhatsApp. Check its delivery status below.' : 'Thread updated.');
      if (body.action === 'reply') setDraft('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action could not be saved.'); }
    finally { setBusy(false); }
  };
  const copyWebhook = async () => {
    if (!overview?.setup.webhookPath) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${overview.setup.webhookPath}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Could not copy the callback URL.'); }
  };
  return <main className="pc-page inbox-page"><header className="pc-pagehead"><div><h1>WhatsApp inbox</h1><p className="pc-muted">Private customer messages for an operator to review and answer.</p></div><button className="pc-button quiet" type="button" onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh.'))}><RefreshCw size={16}/> Refresh</button></header>
    {!overview?.setup.ready && <section className="pc-panel inbox-setup"><h2>Finish WhatsApp setup</h2><p className="pc-muted">Connect a Meta WhatsApp Cloud number and add its app secret and webhook verification token in Integrations. Then register the callback URL and subscribe to the messages webhook in Meta.</p><div className="inbox-setup-actions"><button className="pc-button" type="button" onClick={() => navigate('integrations')}>Open Integrations <ArrowUpRight size={14}/></button>{overview?.setup.webhookPath && <button className="pc-button quiet" type="button" onClick={() => void copyWebhook()}><Copy size={14}/>{copied ? 'Copied callback URL' : 'Copy callback URL'}</button>}</div>{overview?.setup.missing?.length ? <p className="pc-muted">Needed: {overview.setup.missing.join(', ')}.</p> : null}</section>}
    {error && <p role="alert" className="inbox-alert">{error}</p>}{notice && <p role="status" className="inbox-notice">{notice}</p>}
    <div className="inbox-layout"><aside className="pc-panel inbox-list"><div className="inbox-controls"><label className="pc-field">Search messages<div className="inbox-search"><Search size={15}/><input className="pc-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Number or recent text"/></div></label><div className="inbox-filters" aria-label="Filter threads">{(['open', 'all', 'resolved'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} type="button" onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'open' ? 'Open' : 'Resolved'}</button>)}</div></div><div className="inbox-rows">{shown.map(item => <button type="button" key={item.id} className={`inbox-thread ${selected === item.id ? 'selected' : ''}`} onClick={() => void load(item.id).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not open thread.'))}><span className="inbox-avatar"><MessageCircle size={17}/></span><span className="inbox-thread-copy"><strong>+{item.phone}</strong><small>{item.lastPreview || 'Message received'}</small></span><span className="inbox-thread-meta"><time>{new Date(item.lastMessageAt).toLocaleDateString()}</time>{item.handoff === 'open' && <span className="inbox-dot"/>}</span></button>)}</div>{shown.length === 0 && <p className="pc-empty"><Inbox size={24}/> {query ? 'No messages match this search.' : 'No threads in this view yet.'}</p>}</aside>
      <section className="pc-panel inbox-detail">{detail && current ? <><div className="inbox-detail-head"><div><span className="inbox-kicker">WhatsApp conversation</span><h2>+{current.phone}</h2><p className="pc-muted">Latest customer message {new Date(current.lastInboundAt).toLocaleString()}</p></div><span className="pc-badge">{current.handoff === 'open' ? 'Open handoff' : 'Resolved'}</span></div>
        <div className="inbox-link"><div><strong>Customer link</strong><p className="pc-muted">Only a reviewed customer phone with an exact match can be linked. Messages stay private to this inbox.</p></div>{current.customerId ? <button className="pc-button quiet" type="button" onClick={() => navigate('customers', current.customerId)}>View linked customer <ArrowUpRight size={14}/></button> : candidates.length ? <div className="inbox-link-actions"><select className="pc-select" value={linkId} onChange={event => setLinkId(event.target.value)} aria-label="Exact-match customer" disabled={viewer}><option value="">Select matching customer</option>{candidates.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="pc-button" type="button" disabled={!linkId || busy || viewer} onClick={() => void act({ action: 'link', threadId: selected, customerId: linkId })}>Link</button></div> : <span className="pc-badge">No exact customer match</span>}</div>
        <div className="inbox-messages" aria-label="Conversation messages">{detail.messages.map(message => <article key={message.id} className={`inbox-bubble ${message.direction}`}><span className="inbox-bubble-by">{message.direction === 'inbound' ? 'Customer' : 'Operator'}</span><p>{message.text || `[${message.type} message — content is not shown]`}</p><footer><time>{new Date(message.providerAt || message.receivedAt).toLocaleString()}</time>{message.state && <span className={`inbox-state ${message.state}`}>{message.state}</span>}</footer>{message.reason && <small className="inbox-reason">{message.reason}</small>}</article>)}{detail.messages.length === 0 && <p className="pc-empty">No messages saved in this thread.</p>}</div>
        <div className="inbox-compose"><div className="inbox-compose-status"><span>{detail.replyWindowOpen ? <><Check size={15}/> Customer service window open</> : '24-hour reply window closed'}</span><button className="pc-button quiet" type="button" disabled={busy || viewer} onClick={() => void act({ action: 'handoff', threadId: selected, handoff: current.handoff === 'open' ? 'resolved' : 'open' })}>{current.handoff === 'open' ? 'Resolve handoff' : 'Reopen handoff'}</button></div><form onSubmit={event => { event.preventDefault(); void act({ action: 'reply', threadId: selected, requestId: crypto.randomUUID(), text: draft }); }}><label className="pc-field">Operator reply<textarea className="pc-textarea" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4096} rows={3} disabled={viewer} placeholder={detail.replyWindowOpen ? 'Write a personal reply' : 'A reviewed template would be required outside the window.'}/></label><button className="pc-button primary" type="submit" disabled={busy || viewer || !overview?.setup.ready || !detail.replyWindowOpen || current.handoff !== 'open' || !draft.trim() || detail.messages.some(item => item.direction === 'outbound' && (item.state === 'sending' || item.state === 'uncertain'))}>Send reply</button></form><p className="pc-muted">Replies are sent only when you press Send. An uncertain send cannot be retried automatically. Templates and campaign sends are unavailable here.</p></div>
      </> : <div className="pc-empty"><MessageCircle size={28}/><p>Select a conversation to review it.</p></div>}</section></div>
  </main>;
}
