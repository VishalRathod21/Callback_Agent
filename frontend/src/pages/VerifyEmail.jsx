import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Verification token is missing from the URL.');
      return;
    }
    client.post(`/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch(err => { setStatus('error'); setMessage(err.message || 'Verification failed.'); });
  }, [searchParams]);

  const S = {
    page: { minHeight: '100vh', background: 'var(--stage-black, #0b0d10)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-sans, "Inter", sans-serif)' },
    card: { width: '100%', maxWidth: '420px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '40px 36px', backdropFilter: 'blur(12px)', textAlign: 'center' },
    icon: { fontSize: '48px', marginBottom: '20px' },
    heading: { color: 'var(--paper, #f5f0e8)', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 12px 0' },
    subtext: { color: 'var(--paper-dim, rgba(245,240,232,0.5))', fontSize: '13px', lineHeight: 1.6, marginBottom: '24px' },
    btn: { background: 'var(--spotlight, #e8c96d)', color: '#0b0d10', border: 'none', borderRadius: '8px', padding: '11px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' },
    logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', cursor: 'pointer', justifyContent: 'center' },
    recDot: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--spotlight, #e8c96d)', boxShadow: '0 0 8px var(--spotlight, #e8c96d)', animation: 'pulse-dot 2s ease-in-out infinite' },
    wordmark: { color: 'var(--paper, #f5f0e8)', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' },
  };

  return (
    <div style={S.page}>
      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <div style={S.card}>
        <div style={S.logo} onClick={() => navigate('/')}><span style={S.recDot} /><span style={S.wordmark}>Callback</span></div>
        {status === 'verifying' && (
          <>
            <div style={S.icon}>⟳</div>
            <h1 style={S.heading}>Verifying your email…</h1>
            <p style={S.subtext}>Please wait a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={S.icon}>✓</div>
            <h1 style={S.heading}>Email verified!</h1>
            <p style={S.subtext}>Your account is fully activated. You're ready to rehearse.</p>
            <button style={S.btn} onClick={() => navigate('/upload')}>GO TO DASHBOARD</button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={S.icon}>✕</div>
            <h1 style={S.heading}>Verification failed</h1>
            <p style={S.subtext}>{message || 'The verification link may have expired or is invalid.'}</p>
            <button style={S.btn} onClick={() => navigate('/signin')}>BACK TO SIGN IN</button>
          </>
        )}
      </div>
    </div>
  );
}
