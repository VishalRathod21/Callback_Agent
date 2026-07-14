import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import Button from '../components/ui/Button';

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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--stage-black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Abstract Glowing Spotlight Orbs */}
      <div className="spotlight-glow" style={{ top: '15%', left: '15%', width: '400px', height: '400px', opacity: 0.8 }} />
      <div className="spotlight-glow" style={{ bottom: '20%', right: '20%', width: '450px', height: '450px', opacity: 0.5 }} />

      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--spotlight)',
        borderRadius: 'var(--radius-lg)',
        padding: '48px 40px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 5,
        textAlign: 'center',
        animation: 'fadeIn 0.6s var(--ease) forwards',
      }}>
        {/* Logo Wordmark */}
        <div 
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '40px',
            cursor: 'pointer',
            justifyContent: 'center',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span className="rec-dot" style={{ width: '8px', height: '8px' }} />
          <span style={{
            color: 'var(--paper)',
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-display)',
          }}>Callback</span>
        </div>

        {status === 'verifying' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '3px solid var(--card-border)',
              borderTopColor: 'var(--spotlight)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <h1 style={{
              color: 'var(--paper)',
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verifying email…</h1>
            <p style={{
              color: 'var(--paper-dim)',
              fontSize: 'var(--text-sm)',
              margin: 0,
              lineHeight: 1.5,
            }}>Checking activation details. Just a moment.</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(62, 207, 142, 0.08)',
              border: '1px solid rgba(62, 207, 142, 0.25)',
              color: 'var(--prompter-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✓</div>
            <h1 style={{
              color: 'var(--paper)',
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verification successful!</h1>
            <p style={{
              color: 'var(--paper-dim)',
              fontSize: 'var(--text-sm)',
              margin: 0,
              lineHeight: 1.5,
            }}>Your account is activated and ready. Let's start practicing.</p>
            
            <Button 
              variant="primary" 
              size="lg" 
              fullWidth 
              onClick={() => navigate('/upload')}
              style={{ marginTop: '12px' }}
            >
              GO TO DASHBOARD
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(226, 72, 61, 0.08)',
              border: '1px solid rgba(226, 72, 61, 0.25)',
              color: 'var(--rec-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✕</div>
            <h1 style={{
              color: 'var(--paper)',
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verification failed</h1>
            <p style={{
              color: 'var(--paper-dim)',
              fontSize: 'var(--text-sm)',
              margin: 0,
              lineHeight: 1.5,
            }}>{message || 'The verification link is invalid or may have expired.'}</p>
            
            <Button 
              variant="secondary" 
              size="lg" 
              fullWidth 
              onClick={() => navigate('/signin')}
              style={{ marginTop: '12px' }}
            >
              BACK TO SIGN IN
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

