import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [candidateId, setCandidateId] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sync candidateId from local storage to show scorecard link
  useEffect(() => {
    const storedId = localStorage.getItem('candidateId');
    if (storedId) {
      setCandidateId(storedId);
    }
  }, [location]);

  // Adjust scroll state for structural compacting
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth routing anchor triggers
  useEffect(() => {
    if (location.pathname === '/' && location.hash) {
      const id = location.hash.substring(1);
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location]);

  const navItems = [
    { label: 'Features', hash: 'features-section', id: 'features' },
    { label: 'Rehearsal Rooms', hash: 'rooms-section', id: 'rooms' },
    { label: 'Pricing', hash: 'pricing-section', id: 'pricing' },
    { label: 'Quick Practice', path: '/practice', id: 'practice' },
  ];

  if (candidateId) {
    navItems.push({ label: 'My Progress', path: `/dashboard/${candidateId}`, id: 'progress' });
  }

  const handleNavClick = (item) => {
    setMobileOpen(false);
    if (item.hash) {
      if (location.pathname === '/') {
        const el = document.getElementById(item.hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate(`/#${item.hash}`);
      }
    } else {
      navigate(item.path);
    }
  };

  return (
    <>
      <header className={`luxury-nav-header ${scrolled ? 'scrolled' : ''}`}>
        
        {/* Left Side: Logo */}
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#ffffff',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 0 10px #ffffff'
          }} />
          Callback
        </button>

        {/* Center Section: Navigation Links */}
        <nav className="desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navItems.map((item) => {
            const isActive = item.hash 
              ? location.hash === `#${item.hash}` 
              : location.pathname === item.path && !location.hash;
            return (
              <div
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`premium-nav-item ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </div>
            );
          })}
        </nav>

        {/* Right Section: Actions */}
        <div className="desktop-actions-links" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                {user?.full_name?.split(' ')[0] || 'User'}
              </span>
              <button 
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '12px', cursor: 'pointer', opacity: 0.6 }}
              >
                Sign Out
              </button>
            </>
          ) : (
            <button 
              onClick={() => navigate('/signin')}
              style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '12px', cursor: 'pointer', opacity: 0.6 }}
            >
              Log in
            </button>
          )}

          <button 
            onClick={() => navigate('/upload')}
            className="cta-button-luxury"
          >
            Start Free
          </button>
        </div>

        {/* Mobile menu trigger */}
        <button 
          onClick={() => setMobileOpen(!mobileOpen)}
          className="mobile-menu-trigger"
        >
          {mobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>

      </header>

      {/* Futuristic Fullscreen Mobile Panel */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="mobile-nav-panel"
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              {navItems.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  onClick={() => handleNavClick(item)}
                  style={{
                    fontSize: '18px',
                    fontWeight: 500,
                    color: '#ffffff',
                    cursor: 'pointer',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {item.label}
                </motion.div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '180px', marginTop: '20px' }}>
              {!isAuthenticated ? (
                <Button variant="outline" onClick={() => { setMobileOpen(false); navigate('/signin'); }}>
                  Log in
                </Button>
              ) : (
                <Button variant="outline" onClick={async () => { setMobileOpen(false); await logout(); navigate('/'); }}>
                  Sign Out
                </Button>
              )}
              <Button variant="primary" onClick={() => { setMobileOpen(false); navigate('/upload'); }}>
                Start Free
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
