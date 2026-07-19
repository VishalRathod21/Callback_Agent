import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  
  // 0: idle, 1: loading, 2: success, 3: error
  const [authState, setAuthState] = useState(1);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setAuthState(3);
      setMessage('Verification token is missing from the URL.');
      return;
    }
    
    setAuthState(1); // processing
    
    client.post(`/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus('success');
        setAuthState(2); // success
      })
      .catch(err => {
        setStatus('error');
        setAuthState(3); // error
        setMessage(err.message || 'Verification failed.');
      });
  }, [searchParams]);

  return (
    <AuthLayout
      title="Identity Verification"
      subtitle="Verifying activation details with Callback OS..."
      authState={authState}
      error={status === 'error' ? message : ''}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {status === 'verifying' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px 0' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.06)',
              borderTopColor: '#ffffff',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: '14px',
              margin: 0,
              lineHeight: 1.5,
            }}>Checking activation details. Just a moment.</p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              color: 'var(--prompter-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✓</div>
            
            <p style={{
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: '14px',
              margin: 0,
              lineHeight: 1.5,
            }}>Your account is activated and ready. Welcome to Callback OS.</p>
            
            <button 
              type="button" 
              className="auth-button"
              onClick={() => navigate('/upload')}
              style={{ width: '100%' }}
            >
              GO TO DASHBOARD
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 'bold',
            }}>✕</div>
            
            <p style={{
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: '14px',
              margin: 0,
              lineHeight: 1.5,
            }}>{message || 'The verification link is invalid or may have expired.'}</p>
            
            <button 
              type="button" 
              className="auth-button"
              onClick={() => navigate('/signin')}
              style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              BACK TO SIGN IN
            </button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
