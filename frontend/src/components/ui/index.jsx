/* Reusable UI kit — every page builds from these primitives. Tailwind + tokens only. */
import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import clsx from 'clsx';
import { X, Loader2, Inbox, AlertTriangle, CheckCircle2, Info, ChevronDown } from 'lucide-react';

/* ── Button ─────────────────────────────────────────────────────────────── */
export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, className, children, ...rest }) {
  return (
    <button
      className={clsx('btn', `btn-${size}`, `btn-${variant}`, className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={16} /> : null}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, size = 18, ...rest }) {
  return (
    <button className={clsx('btn btn-ghost btn-icon', className)} aria-label={label} title={label} {...rest}>
      <Icon size={size} />
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ className, title, subtitle, action, children, padded = true, elevated = false, variant, ...rest }) {
  const base = variant === 'ghost' ? 'card card-ghost' : variant === 'outline' ? 'card-outline' : elevated ? 'card-elevated' : 'card';
  return (
    <section className={clsx(base, padded && 'card-pad', className)} {...rest}>
      {(title || action) && (
        <header className={clsx('flex items-start justify-between gap-4', children && (padded ? 'mb-5' : 'mb-0'), !padded && 'px-5 pt-5 pb-4 border-b border-border')}>
          <div>
            {title && <h3 className="h-card">{title}</h3>}
            {subtitle && <p className="t-meta mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────── */
export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={clsx('badge', `badge-${tone}`, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const toneForScore = (score) => (score == null ? 'neutral' : score >= 75 ? 'success' : score >= 50 ? 'warning' : 'error');
export const toneForDifficulty = (d) => ({ easy: 'success', medium: 'warning', hard: 'error' }[d] || 'neutral');
export const sourceTone = (s) => ({ llm: 'primary', heuristic: 'warning', unavailable: 'neutral', bank: 'warning', mixed: 'warning', fallback: 'warning' }[s] || 'neutral');
export const sourceLabel = (s) => ({ llm: 'AI evaluated', heuristic: 'Heuristic estimate', unavailable: 'Not evaluated', bank: 'Question bank', mixed: 'Mixed sources', fallback: 'Deterministic summary', restored: 'Restored' }[s] || s || '—');

/* ── Inputs ─────────────────────────────────────────────────────────────── */
export function Input({ label, error, help, className, id, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <input id={inputId} className={clsx('input', error && 'input-error')} {...rest} />
      {error ? <p className="error-text">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function Textarea({ label, error, help, className, id, rows = 4, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <textarea id={inputId} rows={rows} className={clsx('input resize-y min-h-[88px]', error && 'input-error')} {...rest} />
      {error ? <p className="error-text">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function Select({ label, options = [], error, help, className, id, placeholder, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <div className="relative">
        <select id={inputId} className={clsx('input appearance-none pr-9', error && 'input-error')} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim" />
      </div>
      {error ? <p className="error-text">{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={clsx('flex items-start justify-between gap-4 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block t-meta mt-0.5">{description}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full border transition-colors', checked ? 'bg-primary border-primary' : 'bg-elevated border-border')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function SegmentedControl({ value, onChange, options, className }) {
  return (
    <div className={clsx('inline-flex rounded-md border border-border bg-elevated p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => !o.disabled && onChange(o.value)} disabled={o.disabled}
          className={clsx('px-3 h-8 rounded text-[13px] font-medium transition-colors', value === o.value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg', o.disabled && 'opacity-50 cursor-not-allowed')}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Progress / meters ──────────────────────────────────────────────────── */
export function Progress({ value = 0, max = 100, tone = 'primary', className, height = 6 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', error: 'bg-error', accent: 'bg-accent', neutral: 'bg-dim' }[tone];
  return (
    <div className={clsx('w-full rounded-full bg-elevated overflow-hidden', className)} style={{ height }}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ScoreRing({ value, size = 96, stroke = 8, label, suffix = '%', tone }) {
  const t = tone || toneForScore(value);
  const color = { success: '#22C55E', warning: '#F59E0B', error: '#EF4444', neutral: '#3F3F46', primary: '#8B5CF6' }[t];
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#27272A" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tabular-nums" style={{ fontSize: size / 4.2 }}>{value == null ? '—' : `${Math.round(value)}${suffix}`}</span>
        {label && <span className="t-meta">{label}</span>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'neutral', className }) {
  const toneCls = { neutral: 'text-muted', primary: 'text-primary', accent: 'text-accent', success: 'text-success', warning: 'text-warning', error: 'text-error' }[tone];
  return (
    <div className={clsx('min-w-0 py-1 pl-5 border-l border-border first:pl-0 first:border-l-0', className)}>
      <div className="flex items-center gap-2 text-[13px] text-muted">
        {Icon && <Icon size={14} className={toneCls} />}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-[28px] leading-none font-semibold tabular-nums tracking-[-0.02em]">{value ?? '—'}</div>
      {sub && <div className="t-meta mt-2">{sub}</div>}
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={clsx('flex gap-1 border-b border-border', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={clsx('px-3.5 py-2.5 text-sm -mb-px border-b-2 transition-colors', value === t.value ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg')}>
          {t.label}{t.count != null && <span className="ml-2 kbd">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Modal / Dialog ─────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={clsx('relative w-full card-elevated shadow-pop p-6 animate-fade-up', width)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="h-section">{title}</h3>}
            {description && <p className="t-body mt-1">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */
export function Tooltip({ content, children, side = 'top' }) {
  const [show, setShow] = useState(false);
  const pos = { top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2', right: 'left-full top-1/2 -translate-y-1/2 ml-2', left: 'right-full top-1/2 -translate-y-1/2 mr-2' }[side];
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && content && (
        <span role="tooltip" className={clsx('absolute z-40 w-max max-w-[260px] rounded-md border border-border bg-overlay px-2.5 py-1.5 text-xs text-muted shadow-pop', pos)}>
          {content}
        </span>
      )}
    </span>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */
export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={clsx('animate-spin text-muted', className)} />;
}

export function Skeleton({ className, lines = 1 }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton h-4" style={{ width: `${100 - (i % 3) * 12}%` }} />)}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={clsx('card card-pad flex flex-col items-center text-center py-12', className)}>
      <div className="h-11 w-11 rounded-lg bg-elevated border border-border flex items-center justify-center text-muted"><Icon size={20} /></div>
      <h3 className="h-card mt-4">{title}</h3>
      {description && <p className="t-body mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, className }) {
  return (
    <div className={clsx('card card-pad border-error/30 flex flex-col items-center text-center py-10', className)}>
      <div className="h-11 w-11 rounded-lg bg-error-soft flex items-center justify-center text-error"><AlertTriangle size={20} /></div>
      <h3 className="h-card mt-4">{title}</h3>
      {description && <p className="t-body mt-1.5 max-w-sm">{description}</p>}
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const map = { info: ['border-secondary/30 bg-secondary-soft text-fg', Info, 'text-secondary'], success: ['border-success/30 bg-success-soft', CheckCircle2, 'text-success'], warning: ['border-warning/30 bg-warning-soft', AlertTriangle, 'text-warning'], error: ['border-error/30 bg-error-soft', AlertTriangle, 'text-error'] };
  const [cls, Icon, iconCls] = map[tone];
  return (
    <div className={clsx('rounded-lg border px-4 py-3 flex gap-3 text-sm', cls, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} className={clsx('mt-0.5 shrink-0', iconCls)} />
      <div className="min-w-0">
        {title && <div className="font-medium text-fg">{title}</div>}
        {children && <div className="text-muted mt-0.5">{children}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, className }) {
  return (
    <div className={clsx('flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8', className)}>
      <div>
        {eyebrow && <div className="t-label mb-2">{eyebrow}</div>}
        <h1 className="h-page">{title}</h1>
        {description && <p className="t-body mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ── Toasts ─────────────────────────────────────────────────────────────── */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((t) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, tone: 'info', ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.duration || 4000);
  }, []);
  const api = { push, success: (m, o) => push({ message: m, tone: 'success', ...o }), error: (m, o) => push({ message: m, tone: 'error', ...o }), info: (m, o) => push({ message: m, tone: 'info', ...o }) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-32px))]">
        {toasts.map((t) => <Alert key={t.id} tone={t.tone} title={t.title} className="shadow-pop animate-fade-up bg-elevated">{t.message}</Alert>)}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  return useContext(ToastCtx) || { push() {}, success() {}, error() {}, info() {} };
}

/* ── Formatting helpers ─────────────────────────────────────────────────── */
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDuration = (secs) => {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
};
export const fmtScore = (v, digits = 1) => (v == null ? '—' : Number(v).toFixed(digits));
export const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const roundLabel = (r) => ({ dsa: 'DSA Coding', technical: 'Technical', hr: 'HR / Behavioural' }[r] || titleCase(r));
