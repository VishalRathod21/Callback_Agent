import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from './Button';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header style={{
      height: '64px',
      background: scrolled ? 'rgba(11, 13, 16, 0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--card-border)' : '1px solid transparent',
      padding: '0 max(24px, calc((100vw - 1200px) / 2))',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'all 0.3s var(--ease)',
    }}>
      {/* LEFT — Wordmark with pulsing rec-dot */}
      <button
        onClick={() => navigate('/')}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'var(--paper)',
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          transition: 'all 0.3s var(--ease)',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <span className="rec-dot" style={{ marginTop: '1px' }} />
        Callback
      </button>

      {/* CENTER — Navigation links */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '28px' }} className="nav-links">
        <span
          onClick={() => navigate('/')}
          style={{
            color: location.pathname === '/' ? 'var(--spotlight)' : 'var(--paper-dim)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'color 0.2s var(--ease)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--paper)'}
          onMouseLeave={e => e.currentTarget.style.color = location.pathname === '/' ? 'var(--spotlight)' : 'var(--paper-dim)'}
        >
          Rehearse
        </span>
        <span
          onClick={() => navigate('/pricing')}
          style={{
            color: location.pathname === '/pricing' ? 'var(--spotlight)' : 'var(--paper-dim)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'color 0.2s var(--ease)',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--paper)'}
          onMouseLeave={e => e.currentTarget.style.color = location.pathname === '/pricing' ? 'var(--spotlight)' : 'var(--paper-dim)'}
        >
          Pricing
        </span>
      </nav>

      {/* RIGHT — Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--paper-dim)', fontFamily: 'var(--font-mono)' }}>
              {user?.full_name?.toUpperCase() || 'STAGE HAND'}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => {
              await logout();
              navigate('/');
            }}>
              Sign Out
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate('/signin')}>
            Sign In
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => navigate('/upload')}>
          Start Rehearsing
        </Button>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .nav-links { display: none !important; }
        }
      `}</style>
    </header>
  );
}
