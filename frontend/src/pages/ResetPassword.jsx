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
        }}>Set new password</h1>
        
        <p style={{
          color: 'var(--paper-dim)',
          fontSize: 'var(--text-sm)',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Enter the reset token that was output to the server console and set a new password.</p>

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

        {done ? (
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

