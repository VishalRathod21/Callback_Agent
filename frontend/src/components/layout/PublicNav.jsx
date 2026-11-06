import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui';
import { Logo } from './AppShell';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#analytics', label: 'Analytics' },
  { href: '/practice', label: 'Quick practice', route: true },
];

export default function PublicNav() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const go = (l) => {
    setOpen(false);
    if (l.route) return navigate(l.href);
    const el = document.querySelector(l.href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else navigate('/' + l.href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-[1120px] px-4 lg:px-8 h-14 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <button key={l.href} onClick={() => go(l)} className="btn btn-ghost btn-sm">{l.label}</button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <Button size="sm" onClick={() => navigate('/dashboard')}>Open dashboard</Button>
          ) : (
            <>
              <Link to="/signin" className="btn btn-ghost btn-sm">Sign in</Link>
              <Button size="sm" onClick={() => navigate('/signup')}>Get started</Button>
            </>
          )}
        </div>
        <button className="btn btn-ghost btn-icon md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-surface px-4 py-3 space-y-1">
          {LINKS.map((l) => <button key={l.href} onClick={() => go(l)} className="nav-item w-full">{l.label}</button>)}
          <div className="pt-2 flex gap-2">
            {isAuthenticated ? <Button className="flex-1" onClick={() => navigate('/dashboard')}>Open dashboard</Button> : (
              <>
                <Button variant="secondary" className="flex-1" onClick={() => navigate('/signin')}>Sign in</Button>
                <Button className="flex-1" onClick={() => navigate('/signup')}>Get started</Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
