// Saarthi, VP's operator, docked on every page. Streaming replies, ten card types, hold-to-confirm for A2, receipts.
// Rules shown in the UI because code enforces them server-side: it never asks for approval in words (only a hold approves),
// it never says "done" before a receipt, and numbers come from queries, not from the model.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, Eye, Mic, MicOff, Square, Sparkles } from 'lucide-react';
import * as api from './api.ts';
import { ApiError, type ApiCard } from './api.ts';
import { nid, useApp, undoLine, type ThreadMsg } from './store.tsx';
import { usePath } from './router.tsx';
import { Link } from './router.tsx';
import { Btn, Chip, Figure, HoldButton, Segmented } from './ui.tsx';
import { TestPanel } from './test-panel.tsx';
import { pageInfo, RISK_WORDS } from './tools.ts';
import { fieldLabel, fieldValue, toolAsk, toolDone } from './labels.ts';
import type { OperatorCard } from './types.ts';

const GREETING = 'Namaste, main Saarthi hoon, VP ka operator (AI). Aap bataiye kya karwana hai, main plan banaunga aur draft aur test khud kar lunga. Jo cheez logon tak pahunchti hai ya paise lagati hai, wo aapke tap ke baad hi hoti hai.';

type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
const SpeechCtor: (new () => SR) | undefined = typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;

export function Dock() {
  const { thread, setThread, tools, toast, agentCtx, dockTab, setDockTab, pendingSay, clearSay } = useApp();
  const path = usePath();
  const info = useMemo(() => pageInfo(path), [path]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const rec = useRef<SR | null>(null);
  const threadId = useRef<string | undefined>(undefined);

  const showTest = !!agentCtx && path.startsWith('/agents/');
  useEffect(() => { if (pendingSay && !busy) { const t = pendingSay; clearSay(); void send(t); } });
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [thread]);
  useEffect(() => () => { abort.current?.abort(); rec.current?.stop(); }, []);

  const patch = useCallback((id: string, f: (m: ThreadMsg) => ThreadMsg) => setThread(t => t.map(m => (m.id === id ? f(m) : m))), [setThread]);

  const send = useCallback(async (raw: string) => {
    const q = raw.trim(); if (!q || busy) return;
    if (tools && !tools.has('operator.brain.set')) { /* the Operator module registers brief.today and operator.* together */ }
    setText(''); setHeard(null); setBusy(true);
    const mid = nid('vp');
    setThread(t => [...t, { id: nid('u'), role: 'user', text: q }, { id: mid, role: 'vp', text: '', streaming: true, cards: [] }]);
    const ac = new AbortController(); abort.current = ac;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const queue = { buf: '' };
    const timer = window.setInterval(() => {
      if (!queue.buf) return;
      const n = calm ? queue.buf.length : Math.max(2, Math.ceil(queue.buf.length / 18));
      const piece = queue.buf.slice(0, n); queue.buf = queue.buf.slice(n);
      patch(mid, m => ({ ...m, text: m.text + piece }));
    }, 22);
    try {
      if (!threadId.current) threadId.current = await api.createThread();
      await api.sendOperator(threadId.current, q, e => {
        if (e.type === 'delta') queue.buf += e.text;
        else if (e.type === 'card') patch(mid, m => { const c = fromApi(e.id, e.card); const cs = m.cards ?? []; return { ...m, cards: cs.some(x => x.id === c.id) ? cs.map(x => (x.id === c.id ? c : x)) : [...cs, c] }; });
        else if (e.type === 'step') patch(mid, m => ({ ...m, step: e.status === 'running' ? e.tool : undefined }));
        else if (e.type === 'notice') patch(mid, m => ({ ...m, notice: e.text }));
        else if (e.type === 'error') patch(mid, m => ({ ...m, notice: e.text }));
      }, ac.signal);
      while (queue.buf) await new Promise(r => setTimeout(r, 30));
    } catch (e) {
      const notFound = e instanceof ApiError && (e.status === 404 || e.code === 'not_found');
      queue.buf = '';
      if ((e as Error).name !== 'AbortError') patch(mid, m => ({ ...m, notice: notFound ? 'The Operator is not switched on in this server yet, so I cannot plan or act. Every page still works on its own.' : (e instanceof ApiError ? e.message : 'I could not finish that. Nothing was changed.') }));
    } finally { window.clearInterval(timer); patch(mid, m => ({ ...m, streaming: false, step: undefined })); setBusy(false); abort.current = null; }
  }, [busy, patch, setThread, tools]);

  const stop = () => { abort.current?.abort(); };
  const toggleMic = () => {
    if (!SpeechCtor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechCtor(); r.lang = 'hi-IN'; r.interimResults = true; r.continuous = false;
    r.onresult = e => { const s = Array.from(e.results as ArrayLike<{ 0: { transcript: string } }>).map(x => x[0].transcript).join(' '); setText(s); setHeard(s); };
    r.onend = () => setListening(false);
    r.onerror = e => { setListening(false); toast(e?.error === 'not-allowed' ? 'Microphone permission is off. You can type instead.' : 'Could not hear that. Try again or type.', 'bad'); };
    rec.current = r; setListening(true); r.start();
  };

  const testing = showTest && dockTab === 'test';
  return (
    <aside className="dock" aria-label="Saarthi, VP's operator">
      <div className="dock-head">
        <div className="dock-title"><Sparkles size={18} aria-hidden /> <span>Saarthi</span> <span className="deva" lang="hi">सारथी</span> <Chip tone="peacock" title="Saarthi is an AI">AI</Chip></div>
        {showTest && <Segmented label="Dock panel" value={testing ? 'test' : 'talk'} onChange={setDockTab} options={[{ value: 'talk' as const, label: 'Talk' }, { value: 'test' as const, label: 'Test her' }]} />}
        {!testing && <p className="dock-sub">VP's operator. Plans and does drafts and tests itself; waits for your tap on anything that reaches people or spends.</p>}
        <span className="seeing"><Eye size={13} aria-hidden /> Seeing: {testing ? `${agentCtx?.name} · v${agentCtx?.version}${agentCtx?.dirty ? ' · unsaved' : ''}` : info.label}</span>
      </div>
      {testing ? <div className="thread"><TestPanel /></div> : <>
        <div className="thread" ref={scroller} role="log" aria-live="polite" aria-label="Conversation with Saarthi">
          <div className="msg msg-vp"><div className="bubble" lang="en-IN">{GREETING}</div></div>
          {thread.map(m => <Msg key={m.id} m={m} />)}
        </div>
        {info.chips.length > 0 && !busy && (
          <div className="chips" aria-label="Suggestions for this page">{info.chips.map(c => <button key={c} type="button" className="sugg" onClick={() => void send(c)}>{c}</button>)}</div>
        )}
        <form className="composer" onSubmit={e => { e.preventDefault(); void send(text); }}>
          {heard && <p className="heard">Heard as: “{heard}”. Fix it below if it is wrong.</p>}
          <label className="sr" htmlFor="dock-input">Message to Saarthi</label>
          <textarea id="dock-input" className="input" rows={2} value={text} placeholder="Kaunsi calls karwani hain?" lang="hi"
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
          <div className="composer-row">
            {SpeechCtor
              ? <button type="button" className="iconbtn" aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak in Hindi or English'} onClick={toggleMic}>{listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}</button>
              : <button type="button" className="iconbtn" aria-disabled="true" title="Voice input needs Chrome or Safari" aria-label="Voice input needs Chrome or Safari" onClick={e => e.preventDefault()}><Mic size={20} aria-hidden style={{ opacity: 0.45 }} /></button>}
            <span className="small muted grow">{SpeechCtor ? (listening ? 'Listening…' : 'Type or speak') : 'Voice input needs Chrome or Safari'}</span>
            {busy ? <Btn kind="secondary" icon={<Square size={14} aria-hidden />} onClick={stop} aria-label="Stop">Stop</Btn> : <Btn kind="primary" icon={<ArrowUp size={16} aria-hidden />} type="submit" aria-label="Send">Send</Btn>}
          </div>
        </form>
      </>}
    </aside>
  );
}

/** Map the server's card shapes onto the display card. Cards carry the server's message id so a re-emitted plan updates in place. */
function fromApi(id: string, c: ApiCard): OperatorCard {
  if (c.type === 'approval') return { id, type: 'approval', title: toolAsk(c.tool, 'Approve this change'), actionId: c.actionId, risk: c.risk.risk, summary: c.risk.label, state: 'waiting', mode: c.mode, approvers: c.approvers, expiresAt: c.expiresAt,
    diff: c.diff.map(d => ({ field: fieldLabel(d.field), after: fieldValue(d.field, d.to) })).filter((d): d is { field: string; after: string } => !!d.after), body: undefined };
  if (c.type === 'receipt') return { id, type: 'receipt', title: c.status === 'confirmed' ? toolDone(c.tool, 'Done') : c.status === 'not_executed' ? `${toolAsk(c.tool, 'That')} did not run` : 'The result is not known', body: c.status === 'confirmed' ? undefined : c.text.replace(/^Not done: /, ''), outcome: c.status, state: c.status === 'confirmed' ? 'approved' : c.status === 'unknown' ? 'stale' : 'failed' };
  return { id, type: 'plan', title: c.goal, body: c.footer, steps: c.steps.map(s => ({ label: `${toolAsk(s.tool, 'A step')}${s.why ? ': ' + s.why : ''}${s.reason ? ` (${s.reason})` : ''}`, risk: s.risk ?? 'draft', when: s.runs === 'now' ? 'now' : 'waits', done: s.status === 'done', refused: s.runs === 'refused' })) };
}

function Msg({ m }: { m: ThreadMsg }) {
  return (
    <div className={`msg msg-${m.role} rise`}>
      {(m.text || m.streaming) && <div className="bubble" lang="en-IN">{m.text}{m.streaming && <span className="caret" aria-hidden />}{m.streaming && !m.text && <span className="sr">Saarthi is typing</span>}</div>}
      {m.step && <p className="small muted" role="status">Working on <code>{m.step}</code>…</p>}
      {m.cards?.map(c => <Card key={c.id} c={c} />)}
      {m.notice && <p className="small muted" role="status">{m.notice}</p>}
    </div>
  );
}

// ---------- the ten cards ----------
export function Card({ c }: { c: OperatorCard }) {
  const { echo, toast } = useApp();
  const [st, setSt] = useState<{ state: 'idle' | 'running' | 'approved' | 'failed' | 'unknown'; note?: string }>({ state: 'idle' });
  const [picked, setPicked] = useState<string | null>(null);
  const approve = async () => {
    if (!c.actionId) return;
    setSt({ state: 'running' });
    try {
      const r = await api.decide(c.actionId, true);
      const rc = r as api.Receipt;
      if (rc.status === 'confirmed') { setSt({ state: 'approved' }); echo(c.title, { id: nid('c'), type: 'receipt', title: c.title, outcome: 'confirmed', by: 'You', state: 'approved', undo: undoLine(c.risk ?? 'external') }); }
      else if (rc.status === 'unknown') setSt({ state: 'unknown', note: rc.reason });
      else setSt({ state: 'failed', note: (rc as { reason: string }).reason });
    } catch (e) { setSt({ state: 'failed', note: e instanceof ApiError ? e.message : 'Something went wrong. Nothing was changed.' }); }
  };
  const cls = `ocard rise s-${st.state === 'approved' ? 'approved' : st.state === 'failed' ? 'failed' : c.state ?? 'fresh'}`;
  const needsHold = (c.type === 'launch' || c.type === 'approval') && c.actionId && st.state !== 'approved';
  const w = c.risk ? RISK_WORDS[c.risk] : null;
  return (
    <article className={cls} aria-label={`${c.type} card: ${c.title}`}>
      <div className="ocard-type"><span>{label(c.type)}</span>{c.state && c.state !== 'fresh' && <Chip tone={c.state === 'approved' ? 'leaf' : c.state === 'failed' || c.state === 'rejected' ? 'brick' : 'marigold'}>{STATE_LABEL[c.state]}</Chip>}</div>
      <h4>{c.title}</h4>
      {c.body && <p className="small">{c.body}</p>}
      {c.quote && <blockquote className="small" style={{ margin: 0, paddingLeft: 10, borderLeft: '3px solid var(--peacock)' }} lang="hi">“{c.quote}”</blockquote>}
      {c.metric && <Figure m={c.metric} />}
      {c.steps && <ol className="steps">{c.steps.map((s, i) => <li key={i}><span className="num">{s.done ? <Check size={13} aria-hidden /> : i + 1}</span><span>{s.label} {s.refused ? <Chip tone="brick">refused</Chip> : <Chip tone={s.when === 'now' ? 'leaf' : 'terra'}>{s.when === 'now' ? 'Runs now' : 'Waits for your tap'}</Chip>}</span></li>)}</ol>}
      {c.diff && <div>{c.diff.map((d, i) => <div className="diffrow" key={i}><strong>{d.field}</strong><span>{d.before ? <><s>{d.before}</s> → </> : null}<ins>{d.after}</ins></span>{d.reason && <span className="small muted">{d.reason}</span>}</div>)}</div>}
      {c.progress && <div><div className="meter-bar" role="progressbar" aria-label={c.progress.label} aria-valuenow={c.progress.pct ?? undefined}><span className="meter-fill tone-peacock" style={{ transform: `scaleX(${(c.progress.pct ?? 0) / 100})` }} /></div><p className="small muted">{c.progress.label}</p></div>}
      {c.type === 'question' && c.options && (
        <div className="row">{c.options.map(o => <Btn key={o.value} size="sm" kind={o.value === c.defaultValue ? 'primary' : 'secondary'} onClick={() => { setPicked(o.value); toast(`Noted: ${o.label}.`, 'ok'); }}>{o.label}{o.value === c.defaultValue ? ' (default)' : ''}</Btn>)}{picked && <span className="small muted">You picked {picked}.</span>}</div>
      )}
      {c.type === 'receipt' && (
        <div className="stack-s">
          <Chip tone={c.outcome === 'confirmed' ? 'leaf' : c.outcome === 'unknown' ? 'marigold' : 'brick'}>{c.outcome === 'confirmed' ? 'Approved' : c.outcome === 'unknown' ? 'Not known yet' : 'Could not finish'}</Chip>
          {c.undo && <p className="small muted">{c.undo}</p>}
        </div>
      )}
      {w && c.type !== 'receipt' && <p className="small muted">{w.label}. {c.costLabel}</p>}
      {needsHold && (st.state === 'idle' || st.state === 'running') && <HoldButton label={c.type === 'launch' ? 'Hold to launch' : 'Hold to approve'} onConfirm={() => void approve()} busy={st.state === 'running'} />}
      {st.state === 'approved' && <p className="donetxt"><Check size={15} aria-hidden /> Done.</p>}
      {st.state === 'failed' && <p className="hint hint-bad" role="alert">Could not finish: {st.note}. Nothing was changed.</p>}
      {st.state === 'unknown' && <p className="hint hint-bad" role="alert">Not known yet: {st.note}. VP did not retry.</p>}
      {c.href && <Link to={c.href} className="small">Open the page</Link>}
      {c.provenance && <p className="ocard-foot">{c.provenance}</p>}
    </article>
  );
}
const label = (t: OperatorCard['type']) => ({ plan: 'Plan', diff: 'Change', launch: 'Launch', call: 'Call', chart: 'Chart', approval: 'Approval', issue: 'Issue', receipt: 'Receipt', question: 'Question', progress: 'Progress' })[t];

const STATE_LABEL = { fresh: 'New', waiting: 'Waiting for you', approved: 'Approved', rejected: 'Declined', stale: 'Out of date', expired: 'Expired', failed: 'Could not finish' } as const;
