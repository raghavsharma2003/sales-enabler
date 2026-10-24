// A tiny History-API router: path patterns, params, query, Link and navigate(). No dependency.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

interface Loc { path: string; search: string }
const read = (): Loc => ({ path: location.pathname, search: location.search });
const Ctx = createContext<{ loc: Loc; go: (to: string, replace?: boolean) => void }>({ loc: read(), go: () => {} });

// Leaving a page with unsaved changes asks first. A page registers a guard while it has them (useLeaveGuard); a move to
// another path is then held as `pending` until the person chooses (the shell shows the question), Back included. A change
// of query on the same path (a tab) is not leaving. beforeunload still covers a reload or closing the tab.
let guard: string | null = null;
interface Pending { to: string; replace: boolean; message: string }
const PendingCtx = createContext<{ pending: Pending | null; leave: () => void; stay: () => void }>({ pending: null, leave: () => {}, stay: () => {} });
const pathOf = (to: string) => new URL(to, location.origin).pathname;

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Loc>(read);
  const [pending, setPending] = useState<Pending | null>(null);
  const shown = useRef(location.pathname + location.search);
  const move = useCallback((to: string, replace: boolean) => {
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    shown.current = location.pathname + location.search;
    setLoc(read());
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const on = () => {
      const to = location.pathname + location.search;
      if (guard && pathOf(to) !== pathOf(shown.current)) {
        // Back or Forward already moved the address: put it back and ask.
        history.pushState(null, '', shown.current);
        setPending({ to, replace: false, message: guard });
        return;
      }
      shown.current = to;
      setLoc(read());
    };
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = useCallback((to: string, replace = false) => {
    if (to === location.pathname + location.search) return;
    if (guard && pathOf(to) !== location.pathname) { setPending({ to, replace, message: guard }); return; }
    move(to, replace);
  }, [move]);
  const v = useMemo(() => ({ loc, go }), [loc, go]);
  const p = useMemo(() => ({
    pending,
    leave: () => { if (!pending) return; guard = null; setPending(null); move(pending.to, pending.replace); },
    stay: () => setPending(null),
  }), [pending, move]);
  return <Ctx.Provider value={v}><PendingCtx.Provider value={p}>{children}</PendingCtx.Provider></Ctx.Provider>;
}

/** While `active`, leaving this page for another path asks first, with `message` saying what would be lost. */
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    guard = message;
    return () => { if (guard === message) guard = null; };
  }, [active, message]);
}
/** The held move, for the shell's question. */
export const usePendingLeave = () => useContext(PendingCtx);

export const useNav = () => useContext(Ctx).go;
export const usePath = () => useContext(Ctx).loc.path;
export function useQuery(): [URLSearchParams, (patch: Record<string, string | null>) => void] {
  const { loc, go } = useContext(Ctx);
  const q = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const set = useCallback((patch: Record<string, string | null>) => {
    const n = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') n.delete(k); else n.set(k, v); }
    const s = n.toString();
    go(location.pathname + (s ? '?' + s : ''), true);
  }, [go]);
  return [q, set];
}

/** Match "/agents/:id" against a path. Returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (pattern.endsWith('/*')) { a.pop(); if (b.length < a.length) return null; } else if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}

export function Link({ to, children, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const go = useNav();
  return <a href={to} {...rest} onClick={e => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target === '_blank') return;
    e.preventDefault(); go(to);
  }}>{children}</a>;
}
