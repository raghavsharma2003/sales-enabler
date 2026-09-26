'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Pause, Play, RefreshCw } from 'lucide-react';
import type { ChannelJob, ChannelThread } from '../lib/channel-agents/contracts';

type Overview = { threads: ChannelThread[]; messages?: ChannelJob[] };
export function ChannelAgentPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [overview, setOverview] = useState<Overview>({ threads: [] });
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [replyIntent, setReplyIntent] = useState<{ threadId: string; text: string; id: string } | null>(null);
  const load = useCallback(async (threadId = '') => {
    const response = await fetch(`/api/channels${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`, { cache: 'no-store' });
    const data = await response.json() as Overview & { error?: string };
    if (!response.ok) throw new Error(data.error || 'Channel conversations could not be loaded.');
    setOverview(data); setSelected(threadId);
  }, []);
  useEffect(() => { let active = true; void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load conversations.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);
  const act = async (mode: 'ai' | 'human') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'handoff', threadId: selected, mode }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Handoff could not be saved.');
      await load(selected); setNotice(mode === 'human' ? 'AI paused. An operator can continue the conversation.' : 'AI enabled for the next inbound message.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save handoff.'); }
    finally { setBusy(false); }
  };
  const current = overview.threads.find(t => t.id === selected);
  const reply = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const intent = replyIntent?.threadId === selected && replyIntent.text === draft ? replyIntent : { threadId: selected, text: draft, id: crypto.randomUUID() };
      setReplyIntent(intent);
      const response = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reply', threadId: selected, requestId: intent.id, text: draft }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Reply could not be submitted. Refresh its status before trying again.');
      setDraft(''); setReplyIntent(null); await load(selected); setNotice('Operator reply saved. AI is paused for this conversation.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit reply.'); }
    finally { setBusy(false); }
  };
  return <section className="channel-panel" aria-labelledby="channel-panel-title">
    <header className="channel-heading"><div><h2 id="channel-panel-title">Channel conversations</h2><p className="pc-muted">Private Telegram and WhatsApp chats, with saved AI replies and human handoff.</p></div><button className="pc-button quiet" type="button" disabled={busy || loading} onClick={() => void load(selected).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not refresh.'))}><RefreshCw size={15}/> Refresh</button></header>
    {error && <p role="alert" className="channel-error">{error}</p>}{notice && <p role="status" className="channel-notice">{notice}</p>}
    {loading ? <p role="status" className="pc-muted">Loading channel conversations…</p> : overview.threads.length === 0 ? <div className="channel-empty"><MessageCircle size={24}/><div><h3>No channel messages yet</h3><p>Publish a Telegram or WhatsApp deployment and finish its webhook setup. Incoming private messages will appear here.</p><p className="pc-muted">Replies use approved public company knowledge. A channel account does not verify a person's identity.</p></div></div> : <div className="channel-layout">
      <nav aria-label="Channel conversations" className="channel-list">{overview.threads.map(thread => <button className={`channel-thread${selected === thread.id ? ' selected' : ''}`} key={thread.id} type="button" onClick={() => void load(thread.id).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not open conversation.'))}><strong>{thread.channel === 'whatsapp' ? `+${thread.participant}` : `Telegram ${thread.participant}`}</strong><span>{thread.mode === 'ai' ? 'AI active' : thread.mode === 'human' ? 'Human handoff' : 'Participant stopped AI'}</span><time>{new Date(thread.updatedAt).toLocaleString()}</time></button>)}</nav>
      <div className="channel-detail">{current ? <><header className="channel-heading"><div><h3>{current.channel === 'whatsapp' ? `+${current.participant}` : `Telegram ${current.participant}`}</h3><p className="pc-muted">Channel account · human identity unverified</p></div><button className="pc-button" type="button" disabled={readOnly || busy || current.mode === 'stopped'} onClick={() => void act(current.mode === 'ai' ? 'human' : 'ai')}>{current.mode === 'ai' ? <Pause size={14}/> : <Play size={14}/>} {current.mode === 'ai' ? 'Pause AI' : 'Enable AI'}</button></header>
      <div className="channel-transcript" aria-label="Saved channel transcript">{overview.messages?.map(message => <article key={message.id} className="channel-turn">{message.text && <div className="channel-inbound"><strong>Participant</strong><p>{message.text}</p><time>{new Date(message.providerAt).toLocaleString()}</time></div>}{message.answer && <div className="channel-answer"><strong>{message.author === 'operator' ? 'Operator' : 'AI assistant'}</strong><p>{message.answer}</p></div>}<footer><span className="pc-badge">{message.state}</span>{message.reason && <span>{message.reason}</span>}</footer></article>)}</div>
      {current.channel === 'telegram' ? <form className="channel-compose" onSubmit={event => { event.preventDefault(); void reply(); }}><label className="pc-field">Operator reply<textarea className="pc-textarea" rows={3} maxLength={3500} value={draft} onChange={event => setDraft(event.target.value)} disabled={readOnly || busy || current.mode === 'stopped'}/></label><button className="pc-button" type="submit" disabled={readOnly || busy || current.mode === 'stopped' || !draft.trim() || Boolean(overview.messages?.some(m => m.state === 'uncertain' || m.state === 'sending'))}>Take over and send</button></form> : <p className="pc-muted">Use the WhatsApp inbox for operator replies and reviewed customer linking.</p>}
      <p className="pc-muted">Saved privately for review. Chats are not automatically added to Company Brain. Uncertain sends are never automatically retried.</p></> : <p className="pc-muted channel-select">Select a conversation to review its transcript and reply status.</p>}</div>
    </div>}
  </section>;
}
