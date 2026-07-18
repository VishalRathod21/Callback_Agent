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

  const [candidateId, setCandidateId] = useState(null);

  useEffect(() => {
    const storedId = localStorage.getItem('candidateId');
    if (storedId) {
      setCandidateId(storedId);
    }
  }, [location]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    { label: 'Features', hash: 'features-section', id: 'features' },
    { label: 'Rehearsal Rooms', hash: 'rooms-section', id: 'rooms' },
    { label: 'Pricing', hash: 'pricing-section', id: 'pricing' },
    { label: 'About', hash: 'about-section', id: 'about' },
    { label: 'Quick Practice', path: '/practice', id: 'practice' },
  ];

  if (candidateId) {
    navItems.push({ label: 'My Progress', path: `/dashboard/${candidateId}`, id: 'progress' });
  }

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
      background: scrolled ? 'rgba(250, 248, 243, 0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(27, 35, 64, 0.08)' : '1px solid transparent',
      padding: '0 max(24px, calc((100vw - 1200px) / 2))',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'all 200ms ease',
    }}>
      {/* LEFT — Logo with amber dot */}
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
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          fontSize: '19px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-brand)' }} />
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
              className={`nav-item-link ${isActive ? 'active' : ''}`}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: isActive ? 'var(--accent-brand)' : 'var(--text-secondary)',
                transition: 'color 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {item.label}
            </div>
          );
        })}


      </nav>

      {/* RIGHT — Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              {user?.full_name || 'User'}
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
            Log in
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => navigate('/upload')}>
          Start Free
        </Button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
        }

        .nav-item-link {
          position: relative;
        }

        .nav-item-link::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          width: 0;
          height: 2px;
          background-color: var(--accent-brand);
          transition: width 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                      left 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .nav-item-link:hover::after {
          width: 60%;
          left: 20%;
        }

        .nav-item-link.active::after {
          width: 60%;
          left: 20%;
        }
      `}</style>
    </header>
  );
}
