import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { forgotPassword } = useAuth();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
        background: 'rgba(21, 24, 29, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderTop: '3px solid var(--spotlight)',
        borderRadius: 'var(--radius-lg)',
        padding: '48px 40px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        zIndex: 5,
        animation: 'fadeIn 0.6s var(--ease) forwards',
      }}>
        {/* Logo Wordmark */}
        <div 
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '36px',
            cursor: 'pointer',
            width: 'fit-content',
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

        <h1 style={{
          color: 'var(--paper)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)',
        }}>Reset password</h1>
        
        <p style={{
          color: 'var(--paper-dim)',
          fontSize: 'var(--text-sm)',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Enter your email below and we'll generate a reset link (token is output to the server terminal).</p>

        {error && (
          <div style={{
            background: 'var(--danger-subtle)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--rec-red)',
            padding: '12px 16px',
            fontSize: 'var(--text-sm)',
            marginBottom: '24px',
            lineHeight: 1.5,
            fontWeight: 500,
          }}>
            ⚠️ {error}
          </div>
        )}

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: 'rgba(62, 207, 142, 0.08)',
              border: '1px solid rgba(62, 207, 142, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--prompter-green)',
              padding: '16px',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.6,
              fontWeight: 500,
            }}>
              ✓ If that email is registered, a reset link has been generated. Please check the backend server console log to get the secret reset token.
            </div>

            <Button 
              variant="primary" 
              size="lg" 
              fullWidth 
              onClick={() => navigate('/reset-password')}
            >
              Enter reset token →
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} style={{ marginTop: '8px' }}>
              {loading ? 'SENDING LINK...' : 'SEND RESET LINK'}
            </Button>
          </form>
        )}

        <div style={{
          textAlign: 'center',
          fontSize: 'var(--text-sm)',
          color: 'var(--paper-dim)',
          marginTop: '28px',
        }}>
          <span 
            onClick={() => navigate('/signin')}
            style={{
              color: 'var(--spotlight)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--spotlight)'}
          >
            ← Back to sign in
          </span>
        </div>
      </div>
    </div>
  );
}

