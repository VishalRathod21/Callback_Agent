import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { forgotPassword } = useAuth();
  
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);
  
  // 0: idle, 1: loading, 2: success, 3: error
  const [authState, setAuthState] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { 
      setError('Please enter your email address.'); 
      setAuthState(3);
      return; 
    }
    
    setLoading(true);
    setError('');
    setAuthState(1); // processing
    
    try {
      await forgotPassword(email);
      setSent(true);
      setAuthState(2); // success
      
      // Keep authState as success but do not instantly redirect so they see the success message
      // Wait 1.5 seconds, then transition to success state view (where we show the token link)
      setTimeout(() => {
        // We set authState back to 0 so the form overlay is not completely hidden,
        // but we show the 'sent' state layout inside children.
        setAuthState(0);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setAuthState(3); // error
      setTimeout(() => {
        setAuthState(0);
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setEmail(e.target.value);
    if (authState === 3) {
      setAuthState(0);
      setError('');
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Enter your email to retrieve a secure cryptographic recovery token."
      authState={authState}
      error={error}
    >
      {sent ? (
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
            ✓ Verification token dispatched. Please inspect the backend server console log to copy the secret reset token.
          </div>

          <button 
            type="button" 
            className="auth-button"
            onClick={() => navigate('/reset-password')}
          >
            ENTER TOKEN →
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <div className="auth-input-wrapper">
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={handleInputChange}
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
            {loading ? 'DISPATCHING TOKEN...' : 'REQUEST TOKEN'}
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
