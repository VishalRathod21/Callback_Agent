import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', cursor: 'pointer' },
  recDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--spotlight, #e8c96d)',
    boxShadow: '0 0 8px var(--spotlight, #e8c96d)',
    animation: 'pulse-dot 2s ease-in-out infinite', flexShrink: 0,
  },
  wordmark: { color: 'var(--paper, #f5f0e8)', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' },
  heading: { color: 'var(--paper, #f5f0e8)', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 6px 0' },
  subtext: { color: 'var(--paper-dim, rgba(245,240,232,0.5))', fontSize: '13px', margin: '0 0 28px 0', lineHeight: 1.5 },
  label: {
    display: 'block', color: 'var(--paper-dim, rgba(245,240,232,0.5))', fontSize: '11px',
    fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px',
    fontFamily: 'var(--font-mono, monospace)',
  },
  input: {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', padding: '10px 14px', color: 'var(--paper, #f5f0e8)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box', marginBottom: '16px', transition: 'border-color 0.2s',
    fontFamily: 'var(--font-sans, "Inter", sans-serif)',
  },
  btn: {
    width: '100%', background: 'var(--spotlight, #e8c96d)', color: '#0b0d10', border: 'none',
    borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', marginTop: '4px', transition: 'opacity 0.2s',
  },
  link: { color: 'var(--spotlight, #e8c96d)', cursor: 'pointer', fontSize: '13px' },
  error: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px',
    color: '#fca5a5', padding: '10px 14px', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5,
  },
  hint: { fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '-10px', marginBottom: '16px', lineHeight: 1.4 },
};

export default function SignUp() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await register(fullName, email, password);
      navigate('/upload');
    } catch (err) {
      setError(err.message || 'Could not create account. Please try again.');
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

        <h1 style={S.heading}>Create your account</h1>
        <p style={S.subtext}>Start rehearsing for the room.</p>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <label style={S.label}>Full Name</label>
          <input style={S.input} type="text" autoComplete="name" placeholder="Jane Smith"
            value={fullName} onChange={e => setFullName(e.target.value)} />

          <label style={S.label}>Email</label>
          <input style={S.input} type="email" autoComplete="email" placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)} />

          <label style={S.label}>Password</label>
          <input style={S.input} type="password" autoComplete="new-password" placeholder="Min 8 characters"
            value={password} onChange={e => setPassword(e.target.value)} />
          <p style={S.hint}>At least 8 characters</p>

          <label style={S.label}>Confirm Password</label>
          <input style={S.input} type="password" autoComplete="new-password" placeholder="••••••••"
            value={confirm} onChange={e => setConfirm(e.target.value)} />

          <button type="submit" className="sign-btn" style={S.btn} disabled={loading}>
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--paper-dim, rgba(245,240,232,0.5))', marginTop: '20px' }}>
          Already have an account?{' '}
          <span style={S.link} onClick={() => navigate('/signin')}>Sign in</span>
        </div>
      </div>
    </div>
  );
}
