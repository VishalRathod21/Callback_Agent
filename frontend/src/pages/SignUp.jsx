import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function SignUp() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  
  // 0: idle, 1: loading, 2: success, 3: error
  const [authState, setAuthState] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) { 
      setError('Please fill in all fields.'); 
      setAuthState(3);
      return; 
    }
    if (password !== confirm) { 
      setError('Passwords do not match.'); 
      setAuthState(3);
      return; 
    }
    if (password.length < 8) { 
      setError('Password must be at least 8 characters.'); 
      setAuthState(3);
      return; 
    }
    
    setLoading(true);
    setError('');
    setAuthState(1); // processing
    
    try {
      await register(fullName, email, password, confirm);
      setAuthState(2); // success
      
      // Let the cinematic zoom animation play for 1.8 seconds before transition
      setTimeout(() => {
        navigate('/upload');
      }, 1800);
    } catch (err) {
      setError(err.message || 'Could not create account. Please try again.');
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
      title="Create Account"
      subtitle="Initialize your developer profile to begin your mock rehearsals."
      authState={authState}
      error={error}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="auth-field">
          <label className="auth-label">Full Name</label>
          <div className="auth-input-wrapper">
            <input
              type="text"
              className="auth-input"
              placeholder="Jane Smith"
              value={fullName}
              onChange={handleInputChange(setFullName)}
              disabled={loading}
              required
            />
          </div>
        </div>

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
              placeholder="Min 8 characters"
              value={password}
              onChange={handleInputChange(setPassword)}
              disabled={loading}
              required
            />
          </div>
          <span className="auth-input-hint">Must be at least 8 characters long</span>
        </div>

        <div className="auth-field">
          <label className="auth-label">Confirm Password</label>
          <div className="auth-input-wrapper">
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={confirm}
              onChange={handleInputChange(setConfirm)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          className="auth-button"
          disabled={loading || authState === 2}
          style={{ marginTop: '8px' }}
        >
          {loading ? 'INITIALIZING INTERFACE...' : 'CREATE ACCOUNT'}
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
        Already registered?{' '}
        <span 
          onClick={() => !loading && navigate('/signin')}
          style={{
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'color var(--duration-fast)',
          }}
        >
          Sign in
        </span>
      </div>
    </AuthLayout>
  );
}
