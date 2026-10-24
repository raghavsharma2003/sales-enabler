// UI primitives. Small on purpose: no component library. Every state the design language names (empty, zero, loading,
// failed, not measured, under-powered, sample, stale, locked-by-role) has its own component so they never look alike.
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDashed, Lock, PlugZap, RefreshCw, X } from 'lucide-react';
import { Link, useNav } from './router.tsx';
import type { ToolData } from './store.tsx';
import type { Metric } from './types.ts';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
/** Scrolling the page for someone: smooth, unless they asked the system for reduced motion (CSS cannot reach a JS scroll). */
export const scrollMotion = (): ScrollBehavior => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// ---------- buttons ----------
type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; busy?: boolean; icon?: ReactNode;
} & ({ disabled?: false; reason?: undefined; fix?: undefined } | { disabled: true; reason: string; fix: { label: string; to: string } | null });

/** A disabled button must say why, and must decide on a fix link: where the fix is on another page, a link to it; `null` only
 *  when the fix is on this screen (a field above, a check below) or is not the person's to make (a role, server setup).
 *  The type enforces the choice; a test checks no disabled button leaves it out. */
export function Btn({ kind = 'secondary', size = 'md', busy, icon, children, className, disabled, reason, fix, onClick, ...rest }: BtnProps) {
  const rid = useId();
  return (
    <span className="btn-wrap">
      <button type="button" {...rest} className={cx('btn', `btn-${kind}`, size === 'sm' && 'btn-sm', className)}
        aria-disabled={disabled || busy || undefined} aria-describedby={disabled ? rid : undefined}
        onClick={e => { if (disabled || busy) { e.preventDefault(); return; } onClick?.(e); }}>
        {busy ? <RefreshCw size={16} className="spin" aria-hidden /> : icon}
        <span>{children}</span>
      </button>
      {disabled && <span id={rid} className="btn-reason">{reason}{fix && <> <Link to={fix.to}>{fix.label}</Link></>}</span>}
    </span>
  );
}

// ---------- chips ----------
export type Tone = 'neutral' | 'leaf' | 'brick' | 'marigold' | 'peacock' | 'terra';
export function Chip({ tone = 'neutral', children, icon, title }: { tone?: Tone; children: ReactNode; icon?: ReactNode; title?: string }) {
  return <span className={cx('chip', `chip-${tone}`)} title={title}>{icon}{children}</span>;
}
const GRADE: Record<string, [string, Tone]> = {
  measured: ['Measured', 'leaf'], computed: ['Computed', 'peacock'], vendor: ['Vendor says', 'marigold'],
  not_measured: ['Not measured yet', 'neutral'], estimate: ['Estimate', 'marigold'],
};
export function Grade({ g }: { g: string }) { const [l, t] = GRADE[g] ?? [g, 'neutral' as Tone]; return <Chip tone={t}>{l}</Chip>; }

/** A number with how we know it: value, grade, n, date, source. Vendor and measured figures never share a style. */
export function Figure({ m, label }: { m: Metric | null | undefined; label?: string }) {
  if (!m) return <span className="fig"><span className="fig-v dotted">Not measured yet</span></span>;
  if (m.grade === 'not_measured') return <span className="fig">{label && <span className="fig-l">{label}</span>}<span className="fig-v dotted nm" tabIndex={0} title={m.source ?? 'No measurement exists yet'}>Not measured</span>{m.source && <span className="sr">{m.source}</span>}</span>;
  return (
    <span className="fig">
      {label && <span className="fig-l">{label}</span>}
      <span className="fig-v tnum">{m.value}</span>
      <Grade g={m.grade} />
      {(m.n != null || m.asOf) && <span className="fig-n">{[m.n != null ? `n=${m.n}` : '', m.asOf ?? ''].filter(Boolean).join(' · ')}</span>}
    </span>
  );
}

// ---------- layout ----------
export function PageHead({ title, sub, actions, crumb, pill }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumb?: ReactNode; pill?: ReactNode }) {
  return (
    <header className="pagehead">
      {crumb && <div className="crumb">{crumb}</div>}
      <div className="pagehead-row">
        <div className="pagehead-text"><h1 className="serif">{title}{pill}</h1>{sub && <p className="sub">{sub}</p>}</div>
        {actions && <div className="pagehead-actions">{actions}</div>}
      </div>
    </header>
  );
}
export function Card({ children, className, as: T = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <T className={cx('card', className)} {...rest}>{children}</T>;
}
export function CardHead({ title, sub, actions, id }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; id?: string }) {
  return <div className="cardhead"><div><h2 id={id}>{title}</h2>{sub && <p className="sub">{sub}</p>}</div>{actions && <div className="cardhead-actions">{actions}</div>}</div>;
}
/** Tabs are one row. When they do not all fit (a phone, or a narrow column beside the assistant) the row scrolls sideways,
 *  the hidden side fades out and gets an arrow button, and the selected tab is scrolled into view. A tab is never cut
 *  off without a sign that there is more. */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[]; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = () => { const el = row.current; if (!el) return; const left = el.scrollLeft > 2, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2; setMore(m => (m.left === left && m.right === right ? m : { left, right })); };
  useEffect(() => {
    const el = row.current; if (!el) return;
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); ro?.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro?.disconnect(); el.removeEventListener('scroll', measure); };
  }, []);
  useEffect(() => {
    const el = row.current, on = el?.querySelector<HTMLElement>('[aria-selected="true"]'); if (!el || !on) return;
    if (on.offsetLeft < el.scrollLeft || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, on.offsetLeft - 24) });
    measure();
  }, [value, items.length]);
  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.7, behavior: scrollMotion() });
  const onKey = (e: React.KeyboardEvent) => {
    const i = items.findIndex(x => x.id === value);
    const next = e.key === 'ArrowRight' ? items[(i + 1) % items.length] : e.key === 'ArrowLeft' ? items[(i - 1 + items.length) % items.length] : null;
    if (!next) return;
    onChange(next.id);
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus());
  };
  return (
    <div className={cx('tabs-wrap', more.left && 'more-left', more.right && 'more-right')}>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey} ref={row}>
        {items.map(t => (
          <button key={t.id} role="tab" type="button" data-tab={t.id} aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} className="tab" onClick={() => onChange(t.id)}>
            {t.label}{t.count != null && <span className="tab-count tnum">{t.count}</span>}
          </button>
        ))}
      </div>
      {more.left && <button type="button" className="tabs-more tabs-more-left" tabIndex={-1} aria-label={`Earlier ${label.toLowerCase()}`} onClick={() => page(-1)}><ChevronLeft size={18} aria-hidden /></button>}
      {more.right && <button type="button" className="tabs-more tabs-more-right" tabIndex={-1} aria-label={`More ${label.toLowerCase()}`} onClick={() => page(1)}><ChevronRight size={18} aria-hidden /></button>}
    </div>
  );
}
export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className="seg-o" title={o.hint} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// ---------- form fields ----------
export function Field({ label, hint, error, children, id, className }: { className?: string; label: string; hint?: ReactNode; error?: string | null; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode; id?: string }) {
  const g = useId(); const fid = id ?? g; const hid = fid + '-h';
  return (
    <div className={cx('field', error && 'field-bad', className)}>
      <label htmlFor={fid}>{label}</label>
      {children({ id: fid, 'aria-describedby': hint || error ? hid : undefined, 'aria-invalid': error ? true : undefined })}
      {(error || hint) && <p id={hid} className={cx('hint', error && 'hint-bad')}>{error ?? hint}</p>}
    </div>
  );
}
export function TextField({ label, hint, error, className, ...r }: { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label} hint={hint} error={error} id={r.id} className={className}>{p => <input className="input" {...r} {...p} />}</Field>;
}
export function TextArea({ label, hint, error, className, ...r }: { label: string; hint?: ReactNode; error?: string | null } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Field label={label} hint={hint} error={error} id={r.id} className={className}>{p => <textarea className="input" {...r} {...p} />}</Field>;
}
export function SelectField({ label, hint, error, children, className, ...r }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Field label={label} hint={hint} error={error} id={r.id} className={className}>{p => <select className="input" {...r} {...p}>{children}</select>}</Field>;
}
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}><span className="switch-knob" /></button>
      <label htmlFor={id}>{label}{hint && <span className="hint">{hint}</span>}</label>
    </div>
  );
}

// ---------- states ----------
export function Empty({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return <div className="state state-empty">{icon ?? <CircleDashed size={28} aria-hidden />}<h3>{title}</h3>{body && <p>{body}</p>}{action}</div>;
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <span key={i} className="sk" style={{ width: `${92 - i * 14}%` }} />)}</div>;
}
export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-failed" role="alert">
      <AlertTriangle size={24} aria-hidden /><h3>This did not load</h3><p>{message}</p>
      {onRetry && <Btn size="sm" icon={<RefreshCw size={14} aria-hidden />} onClick={onRetry}>Try again</Btn>}
    </div>
  );
}
/** The tool is not on this server yet: a designed state, not an error. */
export function ModuleMissing({ tool, what }: { tool: string; what: string }) {
  return <div className="state state-missing"><PlugZap size={26} aria-hidden /><h3>{what} is not switched on yet</h3><p>This server does not have the <code>{tool}</code> tool, so there is nothing real to show. Nothing here is a placeholder number.</p></div>;
}
export function NotMeasured({ children = 'Not measured yet' }: { children?: ReactNode }) { return <span className="dotted nm" title="No measurement exists for this yet">{children}</span>; }
export function Locked({ role, children }: { role: string; children?: ReactNode }) { return <span className="locked"><Lock size={14} aria-hidden /> {children ?? <>Ask the {role}</>}</span>; }
export function SampleRibbon() { return <div className="sample-ribbon" role="note">Sample data. This server is running stand-in tools, so every figure here is made up.</div>; }

/** Render one of five states for a ToolData; children get the data when ready. */
export function Async<T>({ q, what, tool, rows, children, empty }: { q: ToolData<T>; what: string; tool: string; rows?: number; children: (d: T) => ReactNode; empty?: (d: T) => ReactNode | null }) {
  if (q.state === 'missing') return <ModuleMissing tool={tool} what={what} />;
  if (q.state === 'error' && !q.data) return <Failed message={q.error ?? 'Something went wrong.'} onRetry={q.reload} />;
  if (!q.data) return <Skeleton rows={rows ?? 3} />;
  const e = empty?.(q.data);
  if (e) return <>{e}</>;
  return <>{children(q.data)}{q.state === 'error' && <p className="hint hint-bad">Could not refresh: {q.error}</p>}</>;
}

// ---------- data display ----------
export function Meter({ value, max, label, tone = 'leaf', note }: { value: number; max: number; label: string; tone?: Tone; note?: ReactNode }) {
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="meter">
      <div className="meter-top"><span>{label}</span>{note && <span className="meter-note">{note}</span>}</div>
      <div className="meter-bar" role="meter" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span className={`meter-fill tone-${tone}`} style={{ transform: `scaleX(${p})` }} /></div>
    </div>
  );
}
export function Spark({ data, label }: { data: number[]; label: string }) {
  if (!data || data.length < 2) return null;
  const w = 96, h = 28, mx = Math.max(...data), mn = Math.min(...data), r = mx - mn || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - mn) / r) * (h - 6)).toFixed(1)}`).join(' ');
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function Avatar({ name }: { name: string }) {
  const i = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return <span className="avatar" aria-hidden>{i}</span>;
}
export function Kv({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="kv">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

// ---------- table that becomes cards on a phone ----------
export interface Col<R> { key: string; label: string; render: (r: R) => ReactNode; num?: boolean; primary?: boolean; hideMobile?: boolean }
export function Table<R>({ cols, rows, rowKey, onRow, caption }: { cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; onRow?: (r: R) => string; caption: string }) {
  const go = useNav();
  // The whole row opens the record, not only its name: a click anywhere on the row that is not itself a link or a button.
  const open = (e: React.MouseEvent, r: R) => { if (!onRow || e.defaultPrevented || (e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return; go(onRow(r)); };
  return (
    <div className="tablewrap">
      <table className="table">
        <caption className="sr">{caption}</caption>
        <thead><tr>{cols.map(c => <th key={c.key} scope="col" className={cx(c.num && 'num', c.hideMobile && 'hm')}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)} className={onRow ? 'clickrow' : undefined} onClick={onRow ? e => open(e, r) : undefined}>
              {cols.map(c => (
                <td key={c.key} data-label={c.label} className={cx(c.num && 'num tnum', c.primary && 'primary', c.hideMobile && 'hm')}>
                  {c.primary && onRow ? <Link to={onRow(r)} className="rowlink">{c.render(r)}</Link> : c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- overlay ----------
export function Sheet({ title, onClose, children, wide, labelledBy }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);
  const tid = useId();
  // Callers pass onClose inline, so it is a new function on every render. The focus effect runs once per opening: keyed on
  // onClose it re-ran on each keystroke inside the sheet and threw focus back to its first control.
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    prev.current = document.activeElement;
    const el = ref.current!;
    const f = el.querySelector<HTMLElement>('[data-autofocus], button, [href], input, select, textarea');
    f?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); }
      if (e.key === 'Tab') {
        const els = [...el.querySelectorAll<HTMLElement>('button:not([aria-disabled="true"]), [href], input, select, textarea, [tabindex="0"]')].filter(x => !x.hasAttribute('disabled'));
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    document.body.classList.add('noscroll');
    return () => { el.removeEventListener('keydown', onKey); document.body.classList.remove('noscroll'); (prev.current as HTMLElement | null)?.focus?.(); };
  }, []);
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx('sheet', wide && 'sheet-wide')} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? tid}>
        <div className="sheet-head"><h2 id={tid}>{title}</h2><button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><X size={18} aria-hidden /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Hold-to-confirm: press and hold 1.2 s, or (keyboard / assistive tech) activate twice within 5 s. Enter alone never approves. */
export function HoldButton({ label, onConfirm, busy, holdMs = 1200, danger }: { label: string; onConfirm: () => void; busy?: boolean; holdMs?: number; danger?: boolean }) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const t = useRef<number>(0); const a = useRef<number>(0);
  const done = useRef(false);
  useEffect(() => () => { clearTimeout(t.current); clearTimeout(a.current); }, []);
  const start = () => {
    if (busy || done.current) return;
    setHolding(true);
    t.current = window.setTimeout(() => { done.current = true; setHolding(false); onConfirm(); }, holdMs);
  };
  const stop = () => { clearTimeout(t.current); setHolding(false); };
  const click = (e: React.MouseEvent) => {
    if (e.detail !== 0) return;       // a pointer click is handled by the hold; only keyboard/AT clicks (detail 0) arm
    if (busy || done.current) return;
    if (armed) { done.current = true; clearTimeout(a.current); setArmed(false); onConfirm(); }
    else { setArmed(true); a.current = window.setTimeout(() => setArmed(false), 5000); }
  };
  return (
    <div className="hold-wrap">
      <button type="button" className={cx('hold', danger && 'hold-danger', holding && 'holding', armed && 'armed')} aria-disabled={busy || undefined}
        onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onClick={click} onContextMenu={e => e.preventDefault()}>
        <span className="hold-fill" style={{ transitionDuration: holding ? `${holdMs}ms` : '120ms' }} aria-hidden />
        <span className="hold-label">{busy ? 'Working…' : armed ? 'Press again to confirm' : label}</span>
      </button>
      <p className="hint">{armed ? 'Press again within 5 seconds to confirm.' : 'Hold for 1.2 seconds to confirm. Keyboard: press twice.'}</p>
    </div>
  );
}

export function Done({ children }: { children: ReactNode }) { return <p className="donetxt"><Check size={16} aria-hidden /> {children}</p>; }
