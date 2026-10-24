// App-wide state: who is signed in, which tools this server has, toasts, the Operator thread, and `act()`,
// the one way a page changes anything. act() handles the three outcomes of a tool call honestly:
// confirmed, needs a human tap (opens the approval sheet), or refused (the reason is shown, never swallowed).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from './api.ts';
import { ApiError, ToolMissing, ToolRefused, type Me, type Receipt } from './api.ts';
import type { OperatorCard, RequestedBy } from './types.ts';
import { plainReason, requesterLine, toolAsk, toolDone } from './labels.ts';

export interface ThreadMsg { id: string; role: 'user' | 'vp' | 'echo'; text: string; cards?: OperatorCard[]; streaming?: boolean; by?: string; step?: string; notice?: string }
export interface Toast { id: number; kind: 'ok' | 'bad' | 'info'; text: string }
export interface Pending { actionId: string; tool: string; summary: string; risk: string; expiresAt: string; by?: 'you'; requester?: string; resolve: (r: ActResult) => void; state: 'asking' | 'running' | 'done'; outcome?: Receipt | { declined: boolean }; error?: string }
export type ActResult<T = unknown> = { ok: true; result: T; receipt: Receipt<T> } | { ok: false; reason: string; declined?: boolean; unknown?: boolean };

export interface AgentCtx { id: string; name: string; dirty: boolean; stackId: string | null; components?: { ears?: string; brain?: string; voice?: string; s2s?: string }; version: number; saved: boolean }
interface App {
  me: Me | null; booted: boolean; tools: Set<string> | null; hasTool(n: string): boolean;
  sample: boolean; markSample(): void;
  refreshMe(): Promise<void>; signOut(): Promise<void>; setMe(m: Me | null): void;
  toasts: Toast[]; toast(text: string, kind?: Toast['kind']): void;
  thread: ThreadMsg[]; setThread(f: (t: ThreadMsg[]) => ThreadMsg[]): void; echo(text: string, card?: OperatorCard): void;
  act<T = unknown>(tool: string, args?: unknown, o?: { quiet?: boolean; describe?: string }): Promise<ActResult<T>>;
  pending: Pending | null; decide(approve: boolean): Promise<void>; closePending(): void;
  review(a: { actionId: string; tool: string; summary: string; risk: string; expiresAt: string | null; requestedBy?: RequestedBy }): void;
  view: 'page' | 'talk'; setView(v: 'page' | 'talk'): void;
  agentCtx: AgentCtx | null; setAgentCtx(a: AgentCtx | null): void;
  dockTab: 'talk' | 'test'; setDockTab(t: 'talk' | 'test'): void;
  pendingSay: string | null; say(text: string): void; clearSay(): void;
  theme: 'auto' | 'light' | 'dark'; setTheme(t: 'auto' | 'light' | 'dark'): void;
  can(roles: string[]): boolean; bump: number; refresh(): void;
}
const Ctx = createContext<App>(null as unknown as App);
export const useApp = () => useContext(Ctx);

let uid = 0; export const nid = (p = 'm') => `${p}${++uid}_${Date.now().toString(36)}`;
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [booted, setBooted] = useState(false);
  const [tools, setTools] = useState<Set<string> | null>(null);
  const [sample, setSample] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [thread, setThreadRaw] = useState<ThreadMsg[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [view, setView] = useState<'page' | 'talk'>('page');
  const [theme, setThemeState] = useState<'auto' | 'light' | 'dark'>(() => safe(() => (localStorage.getItem('vp_theme') as 'light' | 'dark') ?? 'auto', 'auto'));
  const [bump, setBump] = useState(0);
  const [agentCtx, setAgentCtx] = useState<AgentCtx | null>(null);
  const [dockTab, setDockTab] = useState<'talk' | 'test'>('talk');
  const [pendingSay, setPendingSay] = useState<string | null>(null);
  const pendingRef = useRef<Pending | null>(null); pendingRef.current = pending;

  useEffect(() => {
    const r = document.documentElement;
    if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
  }, [theme]);
  const setTheme = useCallback((t: 'auto' | 'light' | 'dark') => { setThemeState(t); safe(() => (t === 'auto' ? localStorage.removeItem('vp_theme') : localStorage.setItem('vp_theme', t)), undefined); }, []);

  const refreshMe = useCallback(async () => {
    try { setMe(await api.getMe()); } catch (e) { if (!(e instanceof ApiError) || e.status !== 401) console.warn(e); setMe(null); }
    try { setTools(new Set((await api.listTools()).map(t => t.name))); } catch { setTools(null); }
  }, []);
  useEffect(() => { void refreshMe().finally(() => setBooted(true)); api.setUnauthHandler(() => setMe(null)); }, [refreshMe]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++uid;
    setToasts(t => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'bad' ? 9000 : 4500);
  }, []);
  const setThread = useCallback((f: (t: ThreadMsg[]) => ThreadMsg[]) => setThreadRaw(f), []);
  const echo = useCallback((text: string, card?: OperatorCard) => setThreadRaw(t => [...t, { id: nid(), role: 'echo', text, cards: card ? [card] : undefined }]), []);

  const finish = (r: ActResult) => { const p = pendingRef.current; if (p) p.resolve(r); };

  const act = useCallback(async <T,>(tool: string, args: unknown = {}, o: { quiet?: boolean; describe?: string } = {}): Promise<ActResult<T>> => {
    let r: Receipt<T>;
    try { r = await api.callTool<T>(tool, args); } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'Something went wrong. Nothing was changed.';
      toast(reason, 'bad'); return { ok: false, reason };
    }
    if (r.status === 'confirmed') {
      if ((r.result as { _sample?: boolean } | null)?._sample) setSample(true);
      if (!o.quiet) { toast(o.describe ?? 'Done.', 'ok'); }
      return { ok: true, result: r.result, receipt: r };
    }
    if (r.status === 'needs_approval') {
      return new Promise<ActResult<T>>(resolve => {
        setPending({ actionId: r.actionId, tool, summary: r.summary, risk: r.risk, expiresAt: r.expiresAt, by: 'you', resolve: resolve as (x: ActResult) => void, state: 'asking' });
      });
    }
    if (r.status === 'not_executed') {
      const missing = /^unknown tool/.test(r.reason);
      const reason = missing ? `${tool} is not available on this server yet.` : plainReason(r.reason);
      toast(reason, 'bad'); return { ok: false, reason };
    }
    toast('The result is unknown. Vyakti did not retry it. Check Activity before trying again.', 'bad');
    return { ok: false, reason: r.reason, unknown: true };
  }, [toast]);

  const decide = useCallback(async (approve: boolean) => {
    const p = pendingRef.current; if (!p) return;
    setPending({ ...p, state: 'running' });
    try {
      const out = await api.decide(p.actionId, approve);
      if ('declined' in out) {
        setPending(null); echo(`Declined: ${plainSummary(p.tool, p.summary)}`); p.resolve({ ok: false, reason: 'declined', declined: true }); return;
      }
      const rc = out as Receipt;
      setPending({ ...p, state: 'done', outcome: rc });
      if (rc.status === 'confirmed') {
        echo(plainSummary(p.tool, p.summary), { id: nid('c'), type: 'receipt', title: toolDone(p.tool, plainSummary(p.tool, p.summary)), outcome: 'confirmed', by: 'You', state: 'approved', undo: undoLine(p.risk) });
        p.resolve({ ok: true, result: rc.result, receipt: rc });
      } else if (rc.status === 'unknown') {
        p.resolve({ ok: false, reason: rc.reason, unknown: true });
      } else p.resolve({ ok: false, reason: (rc as { reason: string }).reason });
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'Something went wrong. Nothing was changed.';
      setPending({ ...p, state: 'done', error: reason }); p.resolve({ ok: false, reason });
    }
  }, [echo]);
  const closePending = useCallback(() => {
    const p = pendingRef.current; setPending(null);
    if (p && p.state === 'asking') p.resolve({ ok: false, reason: 'not approved', declined: true });
  }, []);

  const review = useCallback((a: { actionId: string; tool: string; summary: string; risk: string; expiresAt: string | null; requestedBy?: RequestedBy }) => {
    const mine = a.requestedBy?.type === 'member' && !!a.requestedBy.memberId && a.requestedBy.memberId === me?.member?.id;
    setPending({ actionId: a.actionId, tool: a.tool, summary: a.summary, risk: a.risk, expiresAt: a.expiresAt ?? new Date(Date.now() + 86400000).toISOString(), state: 'asking',
      ...(mine ? { by: 'you' as const } : a.requestedBy ? { requester: requesterLine(a.requestedBy, me?.member?.id) } : {}), resolve: () => setBump(b => b + 1) });
  }, [me]);
  const signOut = useCallback(async () => { await api.logout().catch(() => {}); setMe(null); setThreadRaw([]); history.pushState(null, '', '/login'); dispatchEvent(new PopStateEvent('popstate')); }, []);
  const can = useCallback((roles: string[]) => !!me?.member && roles.includes(me.member.role), [me]);
  const say = useCallback((text: string) => { setView('talk'); setDockTab('talk'); setPendingSay(text); }, []);
  const clearSay = useCallback(() => setPendingSay(null), []);
  const v = useMemo<App>(() => ({
    me, booted, tools, hasTool: (n: string) => tools === null || tools.has(n), sample, markSample: () => setSample(true),
    refreshMe, signOut, setMe, toasts, toast, thread, setThread, echo, act, pending, decide, closePending, review, view, setView, agentCtx, setAgentCtx, dockTab, setDockTab, pendingSay, say, clearSay, theme, setTheme, can,
    bump, refresh: () => setBump(b => b + 1),
  }), [me, booted, tools, sample, refreshMe, signOut, toasts, toast, thread, setThread, echo, act, pending, decide, closePending, review, view, agentCtx, dockTab, pendingSay, say, clearSay, theme, setTheme, can, bump]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** What "undo" honestly means for each risk class (workspace.md §4.5). */
export function undoLine(risk: string): string {
  switch (risk) {
    case 'external': return 'Undo stops anything still pending. Anything already sent or dialled stays.';
    case 'spend': return 'Spend is not reversible in the product. Ask support for a refund.';
    case 'destructive': return 'Kept for 30 days, then removed. You can restore it from Activity.';
    case 'policy': return 'Undo creates a new version. The old one stays in the audit trail.';
    default: return 'Nothing has reached anyone.';
  }
}

// ---------- data hook ----------
export type ToolState = 'loading' | 'ready' | 'missing' | 'error';
export interface ToolData<T> { data: T | null; state: ToolState; error: string | null; reload(): void; setData(v: T | null): void }

/** Read a tool. `name = null` skips the call. Re-reads when args or the global `bump` change; keeps old data while reloading. */
export function useTool<T>(name: string | null, args: unknown = {}): ToolData<T> {
  const { markSample, bump } = useApp();
  const [st, setSt] = useState<{ data: T | null; state: ToolState; error: string | null }>({ data: null, state: name ? 'loading' : 'ready', error: null });
  const [n, setN] = useState(0);
  const key = JSON.stringify(args) + '|' + name;
  useEffect(() => {
    if (!name) return;
    let live = true;
    setSt(s => ({ ...s, state: s.data ? s.state : 'loading', error: null }));
    api.run<T>(name, args).then(d => {
      if (!live) return;
      if ((d as { _sample?: boolean } | null)?._sample) markSample();
      setSt({ data: d, state: 'ready', error: null });
    }).catch(e => {
      if (!live) return;
      if (e instanceof ToolMissing) setSt({ data: null, state: 'missing', error: e.message });
      else setSt(s => ({ data: s.data, state: 'error', error: e instanceof ToolRefused ? e.reason : e instanceof ApiError ? e.message : 'Could not load this.' }));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, n, bump]);
  return { ...st, reload: () => setN(x => x + 1), setData: (d: T | null) => setSt(s => ({ ...s, data: d })) };
}

/** Like useTool, for a function that may call several tools and shape the answer (see data.ts). `fn = null` skips it. */
export function useData<T>(key: unknown, fn: (() => Promise<T>) | null): ToolData<T> {
  const { markSample, bump } = useApp();
  const [st, setSt] = useState<{ data: T | null; state: ToolState; error: string | null }>({ data: null, state: fn ? 'loading' : 'ready', error: null });
  const [n, setN] = useState(0);
  const k = JSON.stringify(key);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    const f = fnRef.current; if (!f) return;
    let live = true;
    setSt(s => ({ ...s, state: s.data ? s.state : 'loading', error: null }));
    f().then(d => {
      if (!live) return;
      if ((d as { _sample?: boolean } | null)?._sample) markSample();
      setSt({ data: d, state: 'ready', error: null });
    }).catch(e => {
      if (!live) return;
      if (e instanceof ToolMissing) setSt({ data: null, state: 'missing', error: e.message });
      else setSt(s => ({ data: s.data, state: 'error', error: e instanceof ToolRefused ? e.reason : e instanceof ApiError ? e.message : 'Could not load this.' }));
    });
    return () => { live = false; };
  }, [k, n, bump]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...st, reload: () => setN(x => x + 1), setData: (d: T | null) => setSt(s => ({ ...s, data: d })) };
}

/** The server's summary can carry ids and hashes ("Publish agent 1ab031a3 from the draft you reviewed (204816021e3e)"). A person reads the plain words for the action, else the summary with any id or hash taken out. */
function plainSummary(tool: string, summary: string): string {
  const ask = toolAsk(tool, '');
  if (ask) return ask;
  return summary.replace(/\s*\(?\b[0-9a-f]{8,}\b\)?/gi, '').replace(/\s{2,}/g, ' ').trim();
}
