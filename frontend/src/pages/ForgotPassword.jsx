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
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
          <span style={{
            color: 'var(--text-primary)',
            fontSize: '18px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-display)',
          }}>Callback</span>
        </div>

        <h1 style={{
          color: 'var(--text-primary)',
          fontSize: '24px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)',
        }}>Reset password</h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '13.5px',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Enter your email below and we'll generate a reset link (token is output to the server terminal).</p>

        {error && (
          <div style={{
            background: 'rgba(211, 47, 47, 0.08)',
            border: '1px solid rgba(211, 47, 47, 0.15)',
            borderRadius: '8px',
            color: '#D32F2F',
            padding: '12px 16px',
            fontSize: '13.5px',
            marginBottom: '24px',
            lineHeight: 1.5,
            fontWeight: 600,
          }}>
            ⚠️ {error}
          </div>
        )}

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: 'rgba(5, 150, 105, 0.08)',
              border: '1px solid rgba(5, 150, 105, 0.15)',
              borderRadius: '8px',
              color: 'var(--success-green)',
              padding: '16px',
              fontSize: '13.5px',
              lineHeight: 1.6,
              fontWeight: 600,
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
          fontSize: '13.5px',
          color: 'var(--text-secondary)',
          marginTop: '28px',
        }}>
          <span 
            onClick={() => navigate('/signin')}
            style={{
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 700,
              transition: 'color var(--duration-fast)',
            }}
          >
            ← Back to sign in
          </span>
        </div>
      </div>
    </div>
  );
}
