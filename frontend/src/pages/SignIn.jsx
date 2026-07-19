import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

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
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background spotlights */}
      <div className="spotlight-glow" style={{ top: '15%', left: '15%', width: '450px', height: '450px', background: 'radial-gradient(circle, rgba(217, 142, 43, 0.06) 0%, transparent 70%)', opacity: 0.8, position: 'absolute', pointerEvents: 'none' }} />
      <div className="spotlight-glow" style={{ bottom: '15%', right: '15%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(124, 58, 237, 0.04) 0%, transparent 70%)', opacity: 0.6, position: 'absolute', pointerEvents: 'none' }} />

      <Card 
        depth={2} 
        hoverable={false}
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '48px 40px',
          zIndex: 5,
        }}
      >
        {/* Logo Wordmark */}
        <div 
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '32px',
            cursor: 'pointer',
            width: 'fit-content',
            transition: 'transform 0.2s',
          }}
        >
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent)' }} />
          <span style={{
            color: 'var(--text-primary)',
            fontSize: '18px',
            fontWeight: 700,
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
        }}>Welcome back</h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '14px',
          margin: '0 0 32px 0',
          lineHeight: 1.5,
        }}>Sign in to continue your mock rehearsals.</p>

        {error && (
          <div style={{
            background: 'rgba(198, 40, 40, 0.05)',
            border: '1px solid rgba(198, 40, 40, 0.2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--rec-red)',
            padding: '12px 16px',
            fontSize: '13px',
            marginBottom: '24px',
            lineHeight: 1.5,
            fontWeight: 500,
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
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                  width: '14px',
                  height: '14px',
                }}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>Remember me</span>
            </label>
            <span 
              onClick={() => navigate('/forgot-password')}
              style={{
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: '13.5px',
                fontWeight: 600,
              }}
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
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: 600,
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(27, 35, 64, 0.08)' }} />
          <span>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(27, 35, 64, 0.08)' }} />
        </div>

        <div style={{
          textAlign: 'center',
          fontSize: '14px',
          color: 'var(--text-secondary)',
        }}>
          Don't have an account?{' '}
          <span 
            onClick={() => navigate('/signup')}
            style={{
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Create account
          </span>
        </div>
      </Card>
    </div>
  );
}
