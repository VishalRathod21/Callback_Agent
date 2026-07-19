import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !password) { setError('Please fill in all fields.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Invalid or expired token. Please request a new one.');
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
        }}>Set new password</h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '13.5px',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Enter the reset token that was output to the server console and set a new password.</p>

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

        {done ? (
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
              ✓ Password reset successfully! You can now log into your account with your new password.
            </div>

            <Button 
              variant="primary" 
              size="lg" 
              fullWidth 
              onClick={() => navigate('/signin')}
            >
              Sign In →
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Input
              label="Reset Token"
              type="text"
              placeholder="Paste token from console"
              value={token}
              onChange={e => setToken(e.target.value)}
            />

            <Input
              label="New Password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} style={{ marginTop: '8px' }}>
              {loading ? 'RESETTING...' : 'RESET PASSWORD'}
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
