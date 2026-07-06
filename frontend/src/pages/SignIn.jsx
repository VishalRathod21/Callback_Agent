import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--stage-black, #0b0d10)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'var(--font-sans, "Inter", sans-serif)',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '40px 36px',
    backdropFilter: 'blur(12px)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '32px',
    cursor: 'pointer',
  },
  recDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--spotlight, #e8c96d)',
    boxShadow: '0 0 8px var(--spotlight, #e8c96d)',
    animation: 'pulse-dot 2s ease-in-out infinite',
    flexShrink: 0,
  },
  wordmark: {
    color: 'var(--paper, #f5f0e8)',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-display, "Inter", sans-serif)',
  },
  heading: {
    color: 'var(--paper, #f5f0e8)',
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 6px 0',
  },
  subtext: {
    color: 'var(--paper-dim, rgba(245,240,232,0.5))',
    fontSize: '13px',
    margin: '0 0 28px 0',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    color: 'var(--paper-dim, rgba(245,240,232,0.5))',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '6px',
    fontFamily: 'var(--font-mono, monospace)',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: 'var(--paper, #f5f0e8)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '16px',
    transition: 'border-color 0.2s',
    fontFamily: 'var(--font-sans, "Inter", sans-serif)',
  },
  btn: {
    width: '100%',
    background: 'var(--spotlight, #e8c96d)',
    color: '#0b0d10',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    marginTop: '4px',
    transition: 'opacity 0.2s',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
    color: 'rgba(255,255,255,0.15)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono, monospace)',
  },
  link: {
    color: 'var(--spotlight, #e8c96d)',
    cursor: 'pointer',
    fontSize: '13px',
    textDecoration: 'none',
  },
  error: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    padding: '10px 14px',
    fontSize: '13px',
    marginBottom: '16px',
    lineHeight: 1.5,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '18px',
  },
};

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const from = location.state?.from?.pathname || '/upload';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input:focus { border-color: var(--spotlight, #e8c96d) !important; }
        .sign-btn:hover { opacity: 0.85; }
        .sign-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={S.card}>
        <div style={S.logo} onClick={() => navigate('/')}>
          <span style={S.recDot} />
          <span style={S.wordmark}>Callback</span>
        </div>

        <h1 style={S.heading}>Welcome back</h1>
        <p style={S.subtext}>Sign in to continue your rehearsal.</p>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <label style={S.label}>Email</label>
          <input
            style={S.input}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <label style={S.label}>Password</label>
          <input
            style={S.input}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ accentColor: 'var(--spotlight, #e8c96d)' }}
              />
              <span style={{ color: 'var(--paper-dim, rgba(245,240,232,0.5))', fontSize: '12px' }}>Remember me</span>
            </label>
            <span style={S.link} onClick={() => navigate('/forgot-password')}>Forgot password?</span>
          </div>

          <button type="submit" className="sign-btn" style={S.btn} disabled={loading}>
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <div style={S.divider}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <span>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--paper-dim, rgba(245,240,232,0.5))' }}>
          Don't have an account?{' '}
          <span style={S.link} onClick={() => navigate('/signup')}>Create one</span>
        </div>
      </div>
    </div>
  );
}
