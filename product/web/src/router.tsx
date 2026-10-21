// A tiny History-API router: path patterns, params, query, Link and navigate(). No dependency.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

interface Loc { path: string; search: string }
const read = (): Loc => ({ path: location.pathname, search: location.search });
const Ctx = createContext<{ loc: Loc; go: (to: string, replace?: boolean) => void }>({ loc: read(), go: () => {} });

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Loc>(read);
  useEffect(() => {
    const on = () => setLoc(read());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const go = useCallback((to: string, replace = false) => {
    if (to === location.pathname + location.search) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setLoc(read());
    window.scrollTo(0, 0);
  }, []);
  const v = useMemo(() => ({ loc, go }), [loc, go]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

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
