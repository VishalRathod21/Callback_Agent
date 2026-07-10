import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import Button from './Button';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [hoveredLink, setHoveredLink] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle hash scrolling if navigating from other pages or directly clicking on home
  useEffect(() => {
    if (location.pathname === '/' && location.hash) {
      const id = location.hash.substring(1);
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [location]);

  const navItems = [
    { label: 'Rehearse', path: '/', id: 'rehearse' },
    { label: 'Pricing', path: '/pricing', id: 'pricing' },
    { label: 'For Recruiters', hash: 'recruiter-section', id: 'recruiters' },
    { label: 'Leaderboard', hash: 'leaderboard-section', id: 'leaderboard' },
    { label: 'History', hash: 'history-section', id: 'history' },
  ];

  const handleNavClick = (item) => {
    if (item.hash) {
      if (location.pathname === '/') {
        const el = document.getElementById(item.hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        navigate(`/#${item.hash}`);
      }
    } else {
      navigate(item.path);
    }
  };

  return (
    <header style={{
      height: '64px',
      background: scrolled ? 'rgba(10, 10, 11, 0.45)' : 'transparent',
      backdropFilter: scrolled ? 'blur(30px) saturate(180%)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(30px) saturate(180%)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid transparent',
      borderTop: scrolled ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent',
      padding: '0 max(24px, calc((100vw - 1200px) / 2))',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'all 300ms ease',
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
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--spotlight)', boxShadow: '0 0 8px var(--spotlight)' }} />
        Callback
      </button>

      {/* CENTER — Navigation links with sliding indicator pill */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }} className="nav-links">
        {navItems.map((item) => {
          const isActive = item.hash 
            ? location.hash === `#${item.hash}` 
            : location.pathname === item.path && !location.hash;
          return (
            <div
              key={item.id}
              onClick={() => handleNavClick(item)}
              onMouseEnter={() => setHoveredLink(item.id)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--spotlight)' : 'var(--paper-dim)',
                transition: 'color 0.2s ease',
                position: 'relative',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {hoveredLink === item.id && (
                <motion.div
                  layoutId="nav-hover-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '999px',
                    zIndex: -1,
                  }}
                />
              )}
              {item.label}
            </div>
          );
        })}
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
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
        }
      `}</style>
    </header>
  );
}
