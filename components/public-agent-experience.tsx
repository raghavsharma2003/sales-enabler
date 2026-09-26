'use client';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { AudioLines, MessageSquare, Mic, MicOff, Send, Square, Volume2, type LucideIcon } from 'lucide-react';
import type { PublicDeploymentView } from '@/lib/deployments/contracts';
import { connectPublicVoice, type PublicVoiceClient } from '@/lib/public-agent/browser';

type Bootstrap = { deployment: PublicDeploymentView; voiceGatewayUrl: string | null };
type Session = { token: string; nonce: string; expiresAt: string; voiceGatewayUrl: string | null };
type Entry = { role: 'user' | 'assistant'; text: string };
const modes: { value: 'chat' | 'voice' | 'listen'; icon: LucideIcon; label: string }[] = [{ value: 'chat', icon: MessageSquare, label: 'Text chat' }, { value: 'voice', icon: Mic, label: 'Speak' }, { value: 'listen', icon: Volume2, label: 'Listen & type' }];
export function PublicAgentExperience({ publicId }: { publicId: string }) {
  const base = `/api/public/agent/${encodeURIComponent(publicId)}`;
  const [config, setConfig] = useState<Bootstrap | null>(null), [error, setError] = useState('');
  const [mode, setMode] = useState<'chat' | 'voice' | 'listen'>('chat'), [state, setState] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle');
  const [entries, setEntries] = useState<Entry[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [muted, setMuted] = useState(false), [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const session = useRef<Session | null>(null), voice = useRef<PublicVoiceClient | null>(null), live = useRef(true), transcript = useRef<HTMLDivElement>(null), operation = useRef(false), generation = useRef(0);
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'This assistant is unavailable.'); return result as T;
  }
  function closeSession() {
    generation.current++; voice.current?.stop(); voice.current = null;
    const current = session.current; session.current = null;
    if (current) void fetch(`${base}/session`, { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'close', token: current.token }) }).catch(() => undefined);
  }
  useEffect(() => {
    live.current = true; const controller = new AbortController();
    void fetch(base, { credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'This assistant is unavailable.'); if (live.current) setConfig(data); }).catch(error => { if (live.current && error.name !== 'AbortError') setError(error.message); });
    return () => { live.current = false; controller.abort(); closeSession(); };
    // The page is keyed by its deployment URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' }); }, [entries]);
  useEffect(() => {
    if (state !== 'active') return;
    const timer = setInterval(() => { const expiry = session.current?.expiresAt; if (!expiry) return; const seconds = Math.max(0, Math.ceil((Date.parse(expiry) - Date.now()) / 1000)); setRemaining(seconds); if (!seconds) { closeSession(); setState('ended'); setNotice('This conversation reached its time limit.'); } }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  async function start(selected = mode) {
    if (operation.current) return; operation.current = true;
    closeSession(); const currentGeneration = generation.current; setError(''); setNotice(''); setEntries([]); setMuted(false); setRemaining(null); setState('connecting'); setBusy(true);
    try {
      const created = await api<Session>(`${base}/session`, { purpose: selected === 'chat' ? 'chat' : 'voice', requestId: crypto.randomUUID() });
      if (!live.current || generation.current !== currentGeneration) { void api(`${base}/session`, { action: 'close', token: created.token }).catch(() => undefined); return; }
      session.current = created;
      if (selected === 'chat') setState('active');
      else {
        if (!created.voiceGatewayUrl) throw new Error('Voice is unavailable. Please choose text chat.');
        const client = await connectPublicVoice({ url: created.voiceGatewayUrl, token: created.token, nonce: created.nonce, microphone: selected === 'voice', onEvent: event => {
          if (!live.current || generation.current !== currentGeneration) return;
          if (event.type === 'ready') { setState('active'); setBusy(false); }
          if (event.type === 'transcript' && event.role && event.text) setEntries(items => [...items, { role: event.role!, text: event.text! }]);
          if (event.type === 'ended') { setState('ended'); setBusy(false); setNotice(event.message || 'Conversation ended.'); voice.current = null; }
        } });
        if (!live.current || generation.current !== currentGeneration) { client.stop(); return; } voice.current = client;
      }
    } catch (error) { closeSession(); setState('ended'); setError(error instanceof Error ? error.message : 'This conversation could not start.'); }
    finally { operation.current = false; if (selected === 'chat' || !session.current) setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); const text = message.trim(); if (!text || busy || state !== 'active' || !session.current) return;
    setError(''); setMessage('');
    if (mode !== 'chat') { try { voice.current?.sendText(text); } catch (error) { setError(error instanceof Error ? error.message : 'The message could not be sent.'); } return; }
    setBusy(true); setEntries(items => [...items, { role: 'user', text }]);
    try {
      const current = session.current;
      const reply = await api<{ text: string; nonce: string }>(`${base}/chat`, { token: current.token, nonce: current.nonce, message: text, requestId: crypto.randomUUID() });
      if (session.current !== current) return;
      current.nonce = reply.nonce; setEntries(items => [...items, { role: 'assistant', text: reply.text }]);
    } catch (error) { closeSession(); setState('ended'); setError(error instanceof Error ? error.message : 'The reply was interrupted. No automatic retry was made.'); }
    finally { setBusy(false); }
  }
  const brand = config?.deployment.brand.name || 'Company assistant';
  const brandAccent = config?.deployment.brand.accent || '#5148ce';
  const brandForeground = config?.deployment.brand.onAccent || '#ffffff';
  const brandLogo = config?.deployment.brand.logoDataUri;
  const voiceAvailable = config?.deployment.channel === 'web_voice' && Boolean(config.voiceGatewayUrl);
  return <main className="public-agent" style={{ '--pa-accent': brandAccent, '--pa-on-accent': brandForeground } as CSSProperties}>
    <header className="pa-header"><div className="pa-monogram" aria-hidden="true">{brandLogo ? <img src={brandLogo} alt=""/> : brand.slice(0, 1).toUpperCase()}</div><div><strong>{brand}</strong><span>AI assistant</span></div><span className="pa-identity"><AudioLines size={16} aria-hidden="true" /> AI, clearly introduced</span></header>
    <div className="pa-layout"><section className="pa-introduction"><h1>A conversation<br /> starts here.</h1><p className="pa-welcome">{config?.deployment.brand.welcomeMessage || (error ? 'This assistant is not available right now.' : 'Loading the company’s assistant…')}</p>
      <p className="pa-disclosure">This AI assistant answers from company information selected for public use.</p>
      <p className="pa-privacy">Messages and voice transcripts are saved for company review. Please don’t share passwords or payment details.</p>
      {config && <p className="pa-limit">Up to {Math.ceil(config.deployment.maxSessionSeconds / 60)} minutes · {config.deployment.maxTurnsPerConversation} turns per conversation</p>}
    </section>
    <section className="pa-conversation" aria-label="Conversation with the AI assistant">
      <div className="pa-modes" role="group" aria-label="Conversation mode">{modes.filter(item => item.value === 'chat' || voiceAvailable).map(({ value, icon: Icon, label }) => <button type="button" key={value} aria-pressed={mode === value} disabled={state === 'active' || state === 'connecting'} onClick={() => { setMode(value); setError(''); setNotice(''); }}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>
      <div className="pa-status" role="status"><span className={state === 'active' ? 'pa-live' : ''} />{state === 'connecting' ? 'Connecting…' : state === 'active' ? mode === 'chat' ? 'Ready for your message' : muted ? 'Microphone muted' : mode === 'listen' ? 'Listening · type your reply' : 'Connected · you can speak' : state === 'ended' ? 'Conversation ended' : 'Start when you’re ready'}{remaining !== null && state === 'active' && <time>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</time>}</div>
      {state === 'idle' && <div className="pa-controls pa-start-controls"><button className="pa-primary" type="button" disabled={!config || busy} onClick={() => void start()}>{mode === 'chat' ? 'Start text chat' : mode === 'listen' ? 'Start Listen & type' : 'Start voice conversation'}</button></div>}
      <div ref={transcript} className="pa-transcript" role="log" aria-live="polite" aria-relevant="additions">{entries.length ? entries.map((entry, index) => <div className={`pa-entry pa-${entry.role}`} key={index}><strong>{entry.role === 'user' ? 'You' : `${brand} · AI`}</strong><p>{entry.text}</p></div>) : <div className="pa-empty"><MessageSquare size={28} aria-hidden="true" /><h2>{mode === 'chat' ? 'What would you like to know?' : 'Make yourself comfortable.'}</h2><p>{mode === 'voice' ? 'Allow your microphone when asked. You can interrupt, mute or stop at any time.' : mode === 'listen' ? 'Hear the assistant’s replies and type your own. No microphone needed.' : 'Ask about the company, its services or how to get started.'}</p></div>}{busy && state === 'active' && mode === 'chat' && <p className="pa-thinking">The AI assistant is preparing a reply…</p>}</div>
      {(error || notice) && <p className={error ? 'pa-error' : 'pa-notice'} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {state !== 'idle' && <div className="pa-controls">{state !== 'active' && state !== 'connecting' ? <button className="pa-primary" type="button" disabled={!config || busy} onClick={() => void start()}>{state === 'ended' ? 'Start a new conversation' : mode === 'chat' ? 'Start text chat' : mode === 'listen' ? 'Start Listen & type' : 'Start voice conversation'}</button> : <><form onSubmit={submit}><label className="pa-sr-only" htmlFor="public-message">Your message</label><input id="public-message" value={message} maxLength={2000} disabled={state !== 'active' || (busy && mode === 'chat')} onChange={event => setMessage(event.target.value)} placeholder={mode === 'voice' ? 'Or type a message…' : 'Type your message…'} autoComplete="off" /><button type="submit" aria-label="Send message" disabled={!message.trim() || busy || state !== 'active'}><Send size={18} /></button></form><div className="pa-call-controls">{mode === 'voice' && <button type="button" disabled={state !== 'active'} onClick={() => { voice.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? 'Unmute' : 'Mute'}</button>}{mode !== 'chat' && <button type="button" disabled={state !== 'active'} onClick={() => voice.current?.interrupt()}><Volume2 size={16} />Interrupt</button>}<button type="button" onClick={() => { closeSession(); setBusy(false); setState('ended'); setNotice('You ended this conversation.'); }}><Square size={14} />End conversation</button></div></> }</div>}
    </section></div><footer className="pa-footer">Public company assistant · No account required</footer>
  </main>;
}
