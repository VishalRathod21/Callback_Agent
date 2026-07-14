import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
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
      <div className="spotlight-glow" style={{ top: '10%', left: '20%', width: '400px', height: '400px', opacity: 0.8 }} />
      <div className="spotlight-glow" style={{ bottom: '15%', right: '10%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(110, 168, 254, 0.03) 0%, transparent 70%)', opacity: 0.6 }} />

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
        }}>Welcome back</h1>
        
        <p style={{
          color: 'var(--paper-dim)',
          fontSize: 'var(--text-sm)',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Sign in to continue your mock rehearsals.</p>

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
            animation: 'fadeIn 0.2s var(--ease)',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

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
                style={{
                  accentColor: 'var(--spotlight)',
                  cursor: 'pointer',
                  width: '14px',
                  height: '14px',
                }}
              />
              <span style={{ color: 'var(--paper-dim)', fontSize: 'var(--text-sm)' }}>Remember me</span>
            </label>
            <span 
              onClick={() => navigate('/forgot-password')}
              style={{
                color: 'var(--spotlight)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                transition: 'color var(--duration-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--spotlight)'}
            >
              Forgot password?
            </span>
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} style={{ marginTop: '8px' }}>
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </Button>
        </form>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          margin: '28px 0',
          color: 'var(--paper-dimmer)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
        }}>
          <div style={{ flex: 1, height: '1.5px', background: 'var(--card-border)' }} />
          <span>OR</span>
          <div style={{ flex: 1, height: '1.5px', background: 'var(--card-border)' }} />
        </div>

        <div style={{
          textAlign: 'center',
          fontSize: 'var(--text-sm)',
          color: 'var(--paper-dim)',
        }}>
          Don't have an account?{' '}
          <span 
            onClick={() => navigate('/signup')}
            style={{
              color: 'var(--spotlight)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'color var(--duration-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--spotlight)'}
          >
            Create account
          </span>
        </div>
      </div>
    </div>
  );
}

