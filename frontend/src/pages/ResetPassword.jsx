import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  
  const [token, setToken]         = useState(searchParams.get('token') || '');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);
  
  // 0: idle, 1: loading, 2: success, 3: error
  const [authState, setAuthState] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !password || !confirm) { 
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
      await resetPassword(token, password, confirm);
      setDone(true);
      setAuthState(2); // success
      
      // Let the cinematic zoom animation play for 1.8 seconds, then transition back to login page
      setTimeout(() => {
        setAuthState(0);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Invalid or expired token. Please request a new one.');
      setAuthState(3); // error
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
      title="Set New Password"
      subtitle="Enter the security reset token and define your new access credentials."
      authState={authState}
      error={error}
    >
      {done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '12px',
            color: 'var(--prompter-green)',
            padding: '18px',
            fontSize: '14px',
            lineHeight: 1.6,
            fontWeight: 500,
          }}>
            ✓ Password updated successfully. You may now authenticate with your new credentials.
          </div>

          <button 
            type="button" 
            className="auth-button"
            onClick={() => navigate('/signin')}
          >
            SIGN IN →
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="auth-field">
            <label className="auth-label">Reset Token</label>
            <div className="auth-input-wrapper">
              <input
                type="text"
                className="auth-input"
                placeholder="Paste token from console log"
                value={token}
                onChange={handleInputChange(setToken)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">New Password</label>
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
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'STORING NEW PASSWORD...' : 'RESET PASSWORD'}
          </button>
        </form>
      )}

      <div style={{
        textAlign: 'center',
        fontSize: '13.5px',
        color: 'rgba(255, 255, 255, 0.45)',
        marginTop: '28px',
      }}>
        <span 
          onClick={() => !loading && navigate('/signin')}
          style={{
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 700,
            transition: 'color var(--duration-fast)',
            opacity: 0.8,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.8}
        >
          ← Back to sign in
        </span>
      </div>
    </AuthLayout>
  );
}
