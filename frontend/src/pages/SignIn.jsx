import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

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
  
  // 0: idle, 1: loading, 2: success, 3: error
  const [authState, setAuthState] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { 
      setError('Please fill in all fields.'); 
      setAuthState(3);
      return; 
    }
    
    setLoading(true);
    setError('');
    setAuthState(1); // processing
    
    try {
      await login(email, password, remember);
      setAuthState(2); // success
      
      // Let the cinematic zoom animation play for 1.8 seconds before transition
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 1800);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
      setAuthState(3); // error
      // Revert to idle after 3 seconds
      setTimeout(() => {
        setAuthState(0);
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    if (authState === 3) {
      setAuthState(0);
      setError('');
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Establish contact with Callback OS to continue your rehearsal."
      authState={authState}
      error={error}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="auth-field">
          <label className="auth-label">Email Address</label>
          <div className="auth-input-wrapper">
            <input
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={handleInputChange(setEmail)}
              disabled={loading}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label className="auth-label">Password</label>
          <div className="auth-input-wrapper">
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={handleInputChange(setPassword)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '4px',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              disabled={loading}
              style={{
                accentColor: '#ffffff',
                cursor: 'pointer',
                width: '14px',
                height: '14px',
              }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '13.5px' }}>Remember identity</span>
          </label>
          <span 
            onClick={() => !loading && navigate('/forgot-password')}
            style={{
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13.5px',
              fontWeight: 600,
              opacity: loading ? 0.5 : 0.8,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = loading ? 0.5 : 0.8}
          >
            Forgot password?
          </span>
        </div>

        <button 
          type="submit" 
          className="auth-button"
          disabled={loading || authState === 2}
          style={{ marginTop: '8px' }}
        >
          {loading ? 'ANALYZING CREDENTIALS...' : 'ESTABLISH LINK'}
        </button>
      </form>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        margin: '28px 0',
        color: 'rgba(255, 255, 255, 0.15)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.08em',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />
        <span>OR</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />
      </div>

      <div style={{
        textAlign: 'center',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.45)',
      }}>
        New identity?{' '}
        <span 
          onClick={() => !loading && navigate('/signup')}
          style={{
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'color var(--duration-fast)',
          }}
        >
          Initialize account
        </span>
      </div>
    </AuthLayout>
  );
}
