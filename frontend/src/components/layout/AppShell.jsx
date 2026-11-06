/* Authenticated application shell: sidebar navigation + top bar + content area. */
import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, FileText, Sparkles, History, User, LogOut, Zap, Menu, X, Mic, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSystemStatus } from '../../api/endpoints';
import { Badge, Tooltip } from '../ui';

export function Logo({ className, compact = false }) {
  return (
    <Link to="/" className={clsx('flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <span className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-secondary grid place-items-center text-white shadow-card">
        <Mic size={14} />
      </span>
      {!compact && <span className="text-[15px]">Callback Rehearsal</span>}
    </Link>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resume', label: 'Resume', icon: FileText },
  { to: '/interview/setup', label: 'New interview', icon: Sparkles },
  { to: '/history', label: 'History', icon: History },
  { to: '/practice', label: 'Quick practice', icon: Zap },
  { to: '/profile', label: 'Profile & settings', icon: User },
];

export function useSystemStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    getSystemStatus().then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null));
    return () => { alive = false; };
  }, []);
  return status;
}

export function CapabilityBanner({ status }) {
  if (!status) return null;
  const issues = [];
  if (!status.llm?.available) issues.push('AI model key not configured: questions come from the curated bank and answers are scored heuristically (flagged on every result).');
  if (status.embeddings?.backend === 'hashing') issues.push('Resume retrieval uses local lexical embeddings (no Gemini key).');
  if (!issues.length) return null;
  return (
    <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-xs text-warning flex items-start gap-2">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>Degraded mode — {issues.join(' ')}</span>
    </div>
  );
}

export default function AppShell({ children, title, wide = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const status = useSystemStatus();

  const handleLogout = async () => { await logout(); navigate('/'); };

  const sidebar = (
    <aside className="flex h-full w-[240px] flex-col border-r border-border bg-surface">
      <div className="h-14 flex items-center px-5 border-b border-border">
        <Logo />
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) => clsx('nav-item', isActive && 'nav-item-active')}>
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-primary-soft text-primary grid place-items-center text-xs font-semibold">
            {(user?.full_name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{user?.full_name}</div>
            <div className="t-meta truncate">{user?.email}</div>
          </div>
          <Tooltip content="Sign out" side="left">
            <button className="btn btn-ghost btn-icon h-8 w-8" onClick={handleLogout} aria-label="Sign out"><LogOut size={15} /></button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-bg flex">
      <div className="hidden lg:block sticky top-0 h-screen">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop">{sidebar}</div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="text-sm font-medium text-muted">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <Badge tone={status.llm?.available ? 'success' : 'warning'} dot>
                {status.llm?.available ? `AI · ${status.llm.provider}` : 'AI offline'}
              </Badge>
            )}
            {status && <Badge tone={status.voice?.stt ? 'accent' : 'neutral'} dot>{status.voice?.stt ? 'Voice ready' : 'Text mode'}</Badge>}
          </div>
        </header>
        <CapabilityBanner status={status} />
        <main className={clsx('flex-1 w-full mx-auto px-4 lg:px-8 py-6 lg:py-8', wide ? 'max-w-[1400px]' : 'max-w-[1120px]')}>
          {children}
        </main>
      </div>
    </div>
  );
}
