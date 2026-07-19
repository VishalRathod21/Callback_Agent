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
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Abstract Glowing Spotlight Orbs */}
      <div style={{ position: 'absolute', top: '15%', left: '15%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124, 58, 237, 0.04) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(217, 142, 43, 0.03) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(27,35,64,0.06)',
        borderTop: '3px solid var(--accent)',
        borderRadius: '16px',
        padding: '48px 40px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.02)',
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
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
          <span style={{
            color: 'var(--text-primary)',
            fontSize: '18px',
            fontWeight: 800,
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
              border: '3px solid rgba(27,35,64,0.06)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <h1 style={{
              color: 'var(--text-primary)',
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verifying email…</h1>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '13.5px',
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
              background: 'rgba(5, 150, 105, 0.08)',
              border: '1px solid rgba(5, 150, 105, 0.15)',
              color: 'var(--success-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✓</div>
            <h1 style={{
              color: 'var(--text-primary)',
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verification successful!</h1>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '13.5px',
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
              background: 'rgba(211, 47, 47, 0.08)',
              border: '1px solid rgba(211, 47, 47, 0.15)',
              color: '#D32F2F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✕</div>
            <h1 style={{
              color: 'var(--text-primary)',
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
            }}>Verification failed</h1>
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: '13.5px',
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
